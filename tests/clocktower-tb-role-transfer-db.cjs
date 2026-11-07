const assert=require('node:assert/strict'),fs=require('fs');
const {createTestDb}=require('./clocktower-bmr-db.cjs');
(async()=>{
 const db=await createTestDb();for(const file of fs.readdirSync('supabase/migrations').filter(f=>f.includes('clocktower')&&f>'20260926010000_clocktower_bad_moon_rising.sql').sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 const host='10000000-0000-0000-0000-000000000001',ids=Array.from({length:5},(_,i)=>`30000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`);
 let eid='20000000-0000-0000-0000-000000000001';const world=process.env.CLOCKTOWER_WORLD_TEST==='1';
 await db.query('insert into auth.users(id) select unnest($1::uuid[])',[[host,...ids]]);
 for(const id of [host,...ids])await db.query('insert into public.profiles(id,activity_name,site_role) values($1,$2,$3)',[id,id,id===host?'MAIN_ADMIN':'MEMBER']);
 const login=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await login(host);
 const raw=(action,data={})=>db.query('select public.clocktower_live_command($1,$2,$3::jsonb)',[eid,action,JSON.stringify(data)]);
 if(world){eid=(await db.query("select public.clocktower_world_rooms('create',null,'{\"title\":\"test\",\"script\":\"TB\"}') s")).rows[0].s.id;for(const id of ids){await login(id);await db.query("select public.clocktower_world_rooms('join',$1)",[eid]);}await login(host);}
 else {await db.query("insert into public.events(id,title,event_kind,created_by) values($1,'test','CLOCKTOWER',$2)",[eid,host]);await db.query('insert into public.event_participants(event_id,user_id) select $1,unnest($2::uuid[])',[eid,ids]);await raw('create');}
 const snap=async()=>(await db.query('select public.clocktower_live_snapshot($1) s',[eid])).rows[0].s;
 const expected=s=>s.members.map(m=>({user_id:m.user_id,actual_role:m.actual_role??'',shown_role:m.shown_role??''}));
 const assign=async(index,role,shown=role)=>{const s=await snap();return raw('tb_assign_role',{room_id:s.room.id,expected:expected(s),user_id:ids[index],seat:s.members.find(m=>m.user_id===ids[index]).seat,actual_role:role,shown_role:shown,alive:true});};
 await assign(0,'요리사');await assign(1,'군인');
 let before=await snap();await assert.rejects(()=>assign(1,'요리사','군인'),/역할/);assert.deepEqual((await snap()).members,before.members);
 await login(ids[2]);await assert.rejects(()=>assign(1,'요리사'),/이야기꾼/);await login(host);
 await assign(1,'요리사');let s=await snap();assert.equal(s.members.find(m=>m.user_id===ids[0]).actual_role,'');assert.equal(s.members.find(m=>m.user_id===ids[1]).actual_role,'요리사');
 await assert.rejects(()=>raw('tb_assign_role',{room_id:s.room.id,expected:expected(before),user_id:ids[2],seat:3,actual_role:'요리사',shown_role:'요리사'}),/변경/);
 await assign(0,'주정뱅이','점쟁이');await assign(2,'점쟁이');assert.equal((await snap()).members.find(m=>m.user_id===ids[0]).actual_role,'');
 await assign(0,'주정뱅이','요리사');s=await snap();assert.equal(s.members.find(m=>m.user_id===ids[1]).actual_role,'');
 await assert.rejects(()=>raw('flow_next',{room_id:s.room.id,revision:s.room.flow_revision}));
 await db.query('update public.clocktower_live_rooms set roles_released=true where id=$1',[s.room.id]);await assert.rejects(()=>assign(1,'점쟁이'),/배포 전/);
 await db.close();console.log(`PASS ${world?'world':'event'} TB role transfer, Drunk cover, atomic rollback, stale edits, permissions and release guards`);
})().catch(e=>{console.error(e.message,e.where||'',e.stack);process.exit(1)});
