/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test harness. */
const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText,f);
const {createTestDb}=require('./clocktower-bmr-db.cjs');
const {startBmr,advanceBmr,bmrProjection,withNightGossip,bmrSelectionStatus}=require('../lib/clocktower/bmr-engine.ts');
(async()=>{
 const db=await createTestDb();for(const file of ['20260927010000_clocktower_bmr_automation.sql','20260927020000_clocktower_gossip.sql','20260927030000_clocktower_moonchild.sql','20260927040000_clocktower_public_actions.sql','20261027010000_clocktower_night_gossip.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 const host='10000000-0000-0000-0000-000000000001', outsider='10000000-0000-0000-0000-000000000002',event='20000000-0000-0000-0000-000000000001';
 const ids=Array.from({length:7},(_,i)=>`30000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`);
 await db.query('insert into auth.users(id) select unnest($1::uuid[])',[[host,outsider,...ids]]);
 await db.query("insert into public.profiles(id,activity_name,site_role) values($1,'Host','MAIN_ADMIN')",[host]);
 for(const id of ids)await db.query('insert into public.profiles(id,activity_name) values($1::uuid,$1::text)',[id]);
 await db.query("insert into public.events(id,title,event_kind,created_by) values($1,'피로 물든 달','CLOCKTOWER',$2)",[event,host]);
 await db.query('insert into public.event_participants(event_id,user_id) select $1,unnest($2::uuid[])',[event,ids]);
 const login=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
 const snapshot=async()=>(await db.query('select public.clocktower_live_snapshot($1) s',[event])).rows[0].s;
 const raw=(a,d={})=>db.query('select public.clocktower_live_command($1,$2,$3::jsonb)',[event,a,JSON.stringify(d)]);
 await login(host);await raw('create');let s=await snapshot();const room=s.room.id;
 const act=(a,d={})=>raw(a,{room_id:room,day:1,...d});
 const roles=['험담꾼','선원','교수','평화주의자','어릿광대','암살자','샤발로스'];
 await act('bmr_save_roles',{bmr_revision:s.bmr_revision,rows:ids.map((id,i)=>({user_id:id,actual_role:roles[i],shown_role:roles[i]}))});
 s=await snapshot();let engine=startBmr(s.members);engine.phase='DAY';
 await db.query("update public.clocktower_live_rooms set phase='DAY',night=1,day_stage='NOMINATIONS',roles_released=true,bmr_state=jsonb_set(bmr_state,'{auto}',$2::jsonb) where id=$1",[room,JSON.stringify(engine)]);
 const packet=async next=>{const current=await snapshot();return {auto:next,projection:bmrProjection(next),revision:current.room.flow_revision,bmr_revision:current.bmr_revision,operation:'execution',execution:null};};

 await login(ids[1]);await act('gossip_declare',{statement:'블러핑 발언'});
 await login(host);s=await snapshot();assert.equal(withNightGossip({...engine,phase:'NIGHT',night:2},s.gossip_declarations).gossip,undefined,'bluff never creates a night task');
 await login(ids[0]);await act('gossip_declare',{statement:'실제 험담꾼 발언'});
 await login(host);s=await snapshot();
 engine=advanceBmr(s.bmr.auto,{type:'execution',target:null});
 await act('bmr_auto_commit',await packet(engine));
 s=await snapshot();assert.equal(s.room.phase,'NIGHT','unjudged declarations must not block night');
 engine=withNightGossip(s.bmr.auto,s.gossip_declarations);engine.tasks=[{actor:ids[0],role:'험담꾼',key:'night-gossip'}];engine.cursor=0;engine.finished=false;
 let decision=advanceBmr(engine,{type:'tick'});assert.equal(decision.pending.decision.key,'gossip-truth');
 const choice=(e,value)=>advanceBmr(JSON.parse(JSON.stringify(e)),{type:'choice',key:e.pending.decision.key,value});
 assert.equal(choice(decision,'false').pending,undefined);
 const victim=choice(decision,'true');assert.equal(victim.pending.decision.key,'gossip-victim');assert.equal(victim.pending.decision.options.length,ids.length);
 assert.equal(choice(victim,ids[5]).players[5].life,'DEAD','evil minion can die');
 assert.equal(choice(victim,ids[1]).players[1].life,'ALIVE','Sailor survives');
 assert.equal(choice(victim,ids[0]).players[0].life,'DEAD','Gossip can kill themselves');
 for(const condition of ['dead','poison','drunk']){const e=structuredClone(engine);if(condition==='dead')e.players[0].life='DEAD';else e.effects.push({source:ids[5],role:'암살자',target:ids[0],kind:condition,until:99});assert.equal(advanceBmr(e,{type:'tick'}).pending,undefined,condition);}
 let done=choice(victim,ids[5]);assert.equal(withNightGossip(done,s.gossip_declarations).gossip.truth,true,'refresh preserves completed judgment');
 assert.equal(bmrSelectionStatus(engine,engine.players[5]).tone,'evil');
 assert.equal(bmrSelectionStatus(engine,engine.players[1]).tone,'protected');
 assert.equal(bmrSelectionStatus(engine,engine.players[2]).tone,'normal');
 assert.equal(bmrSelectionStatus(done,done.players[5]).tone,'dead');
 const poisoned=structuredClone(engine);poisoned.effects.push({source:ids[5],role:'암살자',target:ids[1],kind:'poison',until:99});assert.equal(bmrSelectionStatus(poisoned,poisoned.players[1]).tone,'normal');
 await login(host);
 for(const next of [decision,victim,done]){const current=await snapshot();await act('bmr_auto_commit',{auto:next,projection:bmrProjection(next),revision:current.room.flow_revision,bmr_revision:current.bmr_revision});}
 assert.equal((await snapshot()).bmr.auto.players[5].life,'DEAD','night decisions persist through real command');
 await login(ids[2]);s=await snapshot();assert.equal(s.bmr,undefined);assert.ok(s.gossip_declarations.every(g=>!('truth' in g)),'truth and roles remain private');
 await db.close();console.log('PASS: night truth prompt, false skip, true target choice, evil/self deaths, protection, impairment, replay, bluff isolation and private snapshots');
})().catch(e=>{console.error(e,e.where);process.exit(1)});
