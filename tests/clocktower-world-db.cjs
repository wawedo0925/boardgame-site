/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText,f);
const {createTestDb}=require('./clocktower-bmr-db.cjs');
const {randomInformation}=require('../lib/clocktower/information.ts');
(async()=>{
 const db=await createTestDb();
 for(const file of fs.readdirSync('supabase/migrations').filter(f=>f.includes('clocktower')&&f>'20260926010000_clocktower_bad_moon_rising.sql').sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await db.exec("insert into public.games(id,name) values('40000000-0000-0000-0000-000000000001','시계탑에 흐른 피')");
 const ids=Array.from({length:19},(_,i)=>`30000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`),host=ids[0],admin=ids[18];
 await db.query('insert into auth.users(id) select unnest($1::uuid[])',[ids]);
 for(const [i,id] of ids.entries())await db.query('insert into public.profiles(id,activity_name,site_role) values($1,$2,$3)',[id,'P'+i,id===admin?'MAIN_ADMIN':'MEMBER']);
 const login=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
 const world=async(action='list',room=null,data={})=>(await db.query('select public.clocktower_world_rooms($1,$2,$3::jsonb) s',[action,room,JSON.stringify(data)])).rows[0].s;
 const snap=async room=>(await db.query('select public.clocktower_live_snapshot($1) s',[room])).rows[0].s;
 const command=async(room,action,data={})=>{const s=await snap(room);return db.query('select public.clocktower_live_command($1,$2,$3::jsonb)',[room,action,JSON.stringify({room_id:room,revision:s.room?.flow_revision,version:s.engine_version,bmr_revision:s.bmr_revision,...data})]);};
 await assert.rejects(()=>world(),/로그인/);await login(host);
 await assert.rejects(()=>db.query('select public.set_clocktower_world_enabled(false)'),/관리자/);
 const room=(await world('create',null,{title:'독립 시계탑',script:'TB'})).id;
 const other=(await world('create',null,{title:'피로 물든 달',script:'BMR'})).id;
 assert.equal((await snap(other)).bmr.automated,true);
 for(const id of ids.slice(1,6)){await login(id);await world('join',room);await world('join',room);}
 await login(ids[6]);assert.equal((await snap(room)).room,null);await assert.rejects(()=>world('details',room),/대기실/);
 await login(host);let s=await snap(room);assert.equal(s.members.length,5);assert.equal((await snap(other)).members.length,0);
 await assert.rejects(()=>command(room,'save_roles',{rows:[]}),/이전 배정안|누락|구성/);
 const roles=['요리사','군인','처단자','독살범','임프'];
 await command(room,'save_roles',{expected:s.members.map(m=>({user_id:m.user_id,actual_role:'',shown_role:''})),rows:s.members.map((m,i)=>({user_id:m.user_id,actual_role:roles[i],shown_role:roles[i]}))});
 s=await snap(room);assert.equal(s.candidates.length,5);assert.equal(s.members[4].actual_role,'임프');
 await command(room,'sync_participants');assert.equal((await snap(room)).members.length,5);
 await login(ids[1]);s=await snap(room);assert.ok(s.members.every(m=>!m.actual_role&&!m.shown_role));assert.equal(s.engine,undefined);
 await assert.rejects(()=>command(room,'script_set',{script:'BMR'}),/이야기꾼/);
 await world('leave',room);await world('join',room);await login(host);
 // Rejoin invalidates setup and never reveals another member's role.
 s=await snap(room);await command(room,'save_roles',{expected:s.members.map(m=>({user_id:m.user_id,actual_role:m.actual_role,shown_role:m.shown_role})),rows:s.members.map((m,i)=>({user_id:m.user_id,actual_role:roles[i],shown_role:roles[i]}))});
 s=await snap(room);await command(room,'engine_information',{state:randomInformation(s.members)});await command(room,'flow_next');
 await login(ids[6]);await assert.rejects(()=>world('join',room),/배포 전/);
 await login(ids[1]);await assert.rejects(()=>world('leave',room),/시작 후/);
 for(const id of ids.slice(1,6)){await login(id);await command(room,'role_ack');}await login(host);await command(room,'flow_next');assert.equal((await snap(room)).room.phase,'NIGHT');
 await login(admin);await db.query('select public.set_clocktower_world_enabled(false)');assert.equal((await world()).rooms.length,0);
 await assert.rejects(()=>world('create',null,{title:'차단 확인',script:'TB'}),/준비 중/);
 await login(ids[6]);await assert.rejects(()=>world('join',other),/중단/);
 await login(ids[1]);assert.equal((await world('join',room)).id,room);assert.equal((await world()).rooms.length,1);assert.equal((await snap(room)).room.phase,'NIGHT');
 // Results are shared, but no phantom events or attendance are created.
 await db.query("update public.clocktower_live_rooms set phase='ENDED',winner='GOOD',end_reason='검증 완료' where id=$1",[room]);
 assert.equal((await snap(room)).room.phase,'ENDED');
 for(const table of ['events','event_participants'])assert.equal((await db.query(`select count(*)::int n from public.${table}`)).rows[0].n,0,table);
 await login(admin);await db.query('select public.set_clocktower_world_enabled(true)');
 const saved=(await db.query('select result_round_id from public.clocktower_live_rooms where id=$1',[room])).rows[0].result_round_id;
 assert.ok(saved);
 const results=(await db.query('select * from public.event_round_players where round_id=$1',[saved])).rows;
 assert.equal(results.length,6);assert.equal(results.filter(p=>p.is_winner===true).length,3);
 assert.equal(results.filter(p=>p.is_winner===false).length,2);
 assert.equal(results.find(p=>p.user_id===host).is_gm,true);assert.equal(results.find(p=>p.user_id===host).is_winner,null);
 await db.query("update public.clocktower_live_rooms set phase='ENDED',winner='GOOD' where id=$1",[room]);
 assert.equal((await db.query('select public.clocktower_save_finished_result($1) id',[room])).rows[0].id,saved);
 assert.equal((await db.query('select count(*)::int n from public.event_game_rounds')).rows[0].n,1);
 const session=(await db.query('select * from public.event_game_sessions')).rows[0];
 assert.equal(session.event_id,null);assert.equal(session.clocktower_room_id,room);
 // Final BMR faction, rather than original role category or survival, decides the result.
 await login(host);const bmr=(await world('create',null,{title:'BMR 기록',script:'BMR'})).id;
 for(const [i,id] of ids.slice(1,6).entries())await db.query("insert into public.clocktower_live_members(room_id,user_id,seat,actual_role,shown_role,alive,bmr) values($1,$2,$3,$4,$4,$5,$6::jsonb)",[bmr,id,i+1,['건달','할머니','선원','대부','샤발로스'][i],i!==0,JSON.stringify({faction:i===0||i>=3?'EVIL':'GOOD'})]);
 await db.query("update public.clocktower_live_rooms set phase='ENDED',winner='EVIL' where id=$1",[bmr]);
 const bmrResults=(await db.query('select p.* from public.event_round_players p join public.event_game_rounds r on r.id=p.round_id join public.event_game_sessions s on s.id=r.session_id where s.clocktower_room_id=$1',[bmr])).rows;
 assert.equal(bmrResults.length,6);assert.equal(bmrResults.filter(p=>p.is_winner===true).length,3);
 assert.equal(bmrResults.find(p=>p.role_name==='건달').is_winner,true);

 for(const id of ids.slice(1,16)){await login(id);await world('join',other);}
 await login(ids[16]);await assert.rejects(()=>world('join',other),/15명/);
 await assert.rejects(()=>world('close',other),/이야기꾼/);await login(host);await world('close',other);await login(ids[16]);await assert.rejects(()=>world('join',other),/준비 중/);
 assert.equal((await db.query('select result_round_id from public.clocktower_live_rooms where id=$1',[other])).rows[0].result_round_id,null);
 assert.equal((await db.query("select has_function_privilege('authenticated','public.clocktower_scope_participants(uuid)','execute') allowed")).rows[0].allowed,false);
 // Backfill earlier completed rooms, then repeat the migration without duplication.
 const old=(await db.query("insert into public.clocktower_live_rooms(storyteller_id,world_title,phase,winner) values($1,'이전 완료','ENDED','GOOD') returning id",[host])).rows[0].id;
 await db.query('insert into public.clocktower_live_members(room_id,user_id,seat,actual_role,shown_role) select $1,user_id,seat,actual_role,shown_role from public.clocktower_live_members where room_id=$2',[old,room]);
 await db.exec(fs.readFileSync('supabase/migrations/20261027040000_clocktower_world_results.sql','utf8'));
 const oldResult=(await db.query('select result_round_id from public.clocktower_live_rooms where id=$1',[old])).rows[0].result_round_id;
 assert.ok(oldResult);
 await db.exec(fs.readFileSync('supabase/migrations/20261027040000_clocktower_world_results.sql','utf8'));
 assert.equal((await db.query('select count(*)::int n from public.event_game_sessions where clocktower_room_id=$1',[old])).rows[0].n,1);
 // Existing event result saving retains all its guarantees.
 await db.query("insert into public.events(title,created_by) values('event regression',$1)",[host]);
 await db.exec(fs.readFileSync('tests/clocktower-autosave-db.sql','utf8'));
 console.log('PASS: independent TB/BMR rooms, duplicate join, 15-player capacity, setup/rejoin, private roles, host authorization, visibility toggle, reconnect, completion without event side effects');await db.close();
})().catch(e=>{console.error(e.message,e.where||'',e.stack);process.exit(1)});
