/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test harness. */
const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText,f);
const {createTestDb}=require('./clocktower-bmr-db.cjs');
const {startBmr,advanceBmr,bmrProjection}=require('../lib/clocktower/bmr-engine.ts');
(async()=>{
 const db=await createTestDb();await db.exec(fs.readFileSync('supabase/migrations/20260927010000_clocktower_bmr_automation.sql','utf8'));
 const host='10000000-0000-0000-0000-000000000001',eid='20000000-0000-0000-0000-000000000001';
 const ids=Array.from({length:7},(_,i)=>`30000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`);
 await db.query('insert into auth.users(id) select unnest($1::uuid[])',[[host,...ids]]);
 await db.query("insert into public.profiles(id,activity_name,site_role) values($1,'Host','MAIN_ADMIN')",[host]);
 for(let i=0;i<ids.length;i++)await db.query('insert into public.profiles(id,activity_name) values($1,$2)',[ids[i],'P'+i]);
 await db.query("insert into public.events(id,title,event_kind,created_by) values($1,'피로 물든 달 자동 테스트','CLOCKTOWER',$2)",[eid,host]);
 await db.query("insert into public.games(name) values('시계탑에 흐른 피')");
 await db.query('insert into public.event_participants(event_id,user_id) select $1,unnest($2::uuid[])',[eid,ids]);
 const login=uid=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await login(host);
 const snap=async()=>(await db.query('select public.clocktower_live_snapshot($1) s',[eid])).rows[0].s;
 const raw=(action,data)=>db.query('select public.clocktower_live_command($1,$2,$3::jsonb)',[eid,action,JSON.stringify(data)]);
 const action=async(a,data={})=>{const s=await snap();return raw(a,{room_id:s.room.id,bmr_revision:s.bmr_revision,revision:s.room.flow_revision,...data});};
 await raw('create',{});let s=await snap();assert.equal(s.bmr.automated,true);
 const roles=['선원','객실 청소부','교수','평화주의자','어릿광대','악마의 변호사','샤발로스'];
 await action('bmr_save_roles',{rows:ids.map((id,i)=>({user_id:id,actual_role:roles[i],shown_role:roles[i]}))});
 await action('flow_next');for(const id of ids){await login(id);await action('role_ack');}await login(host);await action('flow_next');
 async function packet(next,input){const old=await snap(),qid=next.out.resolved?.id??(input?.type==='answer'?input.id:undefined),q=old.requests.find(q=>q.id===qid);const op=input?.type==='execution'?input:old.bmr.auto?.pending?.op.kind==='execution'?old.bmr.auto.pending.op:undefined;return {room_id:old.room.id,bmr_revision:old.bmr_revision,revision:old.room.flow_revision,auto:next,projection:bmrProjection(next),...(q?{request_id:q.id,targets:q.targets,answer:q.bmr_answer??{}}:{}),...(op?{operation:'execution',execution:op.target}:{})};}
 async function commit(next,input){const p=await packet(next,input);await raw('bmr_auto_commit',p);return p;}
 s=await snap();let e=startBmr(s.members);const initial=await commit(e);await assert.rejects(()=>raw('bmr_auto_commit',initial),/먼저 저장/);
 await login(ids[0]);await assert.rejects(()=>raw('bmr_auto_commit',initial),/이야기꾼/);s=await snap();assert.equal(s.bmr,undefined);assert.equal(s.engine,undefined);await login(host);
 // Full first night: host decisions, player choices, private results, dawn.
 let steps=0;
 while(steps++<50){s=await snap();e=s.bmr.auto;if(e.finished)break;
  if(e.pending){const d=e.pending.decision;const value=d.text?'검증된 초기 정보':d.options[0].value;await commit(advanceBmr(e,{type:'choice',key:d.key,value}));continue;}
  if(e.waiting){const q=s.requests.find(q=>q.bmr_options?.engine_key===e.waiting.task.key&&q.status==='OPEN');assert.ok(q);
   const targets=e.waiting.task.role==='선원'?[ids[2]]:e.waiting.task.role==='악마의 변호사'?[ids[6]]:[ids[0],ids[5]];
   await login(q.user_id);await action('reply',{request_id:q.id,targets});await login(host);
   s=await snap();const submitted=s.requests.find(x=>x.id===q.id);const input={type:'answer',id:q.id,targets:submitted.targets,answer:submitted.bmr_answer};await commit(advanceBmr(e,input),input);continue;
  }
  await commit(advanceBmr(e,{type:'tick'}));
 }
 assert.ok(steps<50,'first night must terminate');s=await snap();e=s.bmr.auto;
 await assert.rejects(()=>commit(advanceBmr(e,{type:'dawn'})),/확인/);
 for(const q of s.requests.filter(q=>q.status==='RESOLVED'&&!q.acknowledged))await action('ack_offline',{request_id:q.id});
 for(const id of ids)await action('mission_offline',{user_id:id});
 await commit(advanceBmr(e,{type:'dawn'}));s=await snap();assert.equal(s.room.phase,'DAY');
 await action('flow_next');s=await snap();assert.equal(s.room.day_stage,'NOMINATIONS');
 // Create a legal majority for a good player to exercise persisted Pacifist popup.
 await db.query("insert into public.clocktower_live_votes(room_id,day,nominator,nominee,status,voter_order,threshold,ballots) values($1,1,$2,$3,'DONE',$4::uuid[],4,$5::jsonb)",[s.room.id,ids[0],ids[2],ids,JSON.stringify(Object.fromEntries(ids.slice(0,4).map(id=>[id,true])))]);
 e=s.bmr.auto;let input={type:'execution',target:ids[2]};e=advanceBmr(e,input);assert.equal(e.pending.decision.key,`pacifist:${ids[2]}`);await commit(e,input);
 await login(ids[2]);s=await snap();assert.equal(s.bmr,undefined);await login(host);s=await snap();assert.equal(s.bmr.auto.pending.decision.title,e.pending.decision.title,'reconnect retains decision');
 e=advanceBmr(s.bmr.auto,{type:'choice',key:e.pending.decision.key,value:'save'});const p=await commit(e);await assert.rejects(()=>raw('bmr_auto_commit',p),/먼저 저장/);s=await snap();assert.equal(s.room.night,2);assert.equal(s.members.find(m=>m.user_id===ids[2]).alive,true);
 await assert.rejects(()=>action('bmr_member',{user_id:ids[2]}),/자동 진행/);
 assert.equal((await db.query("select has_function_privilege('authenticated','public.clocktower_bmr_auto_commit(uuid,jsonb)','execute') allowed")).rows[0].allowed,false);
 console.log('PASS: real PostgreSQL automation migration, full first night, host-only popup, reconnect, stale/duplicate rejection, phase transitions and private masking');await db.close();
})().catch(e=>{console.error(e.message,e.where||'',e.stack);process.exit(1)});
