const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const {createTestDb}=require('./clocktower-bmr-db.cjs');
const {BMR_ROLES,bmrRandomRoles,bmrSetupErrors,bmrExecutionCandidate}=require('../lib/clocktower/bmr.ts');
const id=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
let checks=0;const coverage={};
function check(value,label){assert.ok(value,label);checks++;}
(async()=>{
 const db=await createTestDb();const host=id(1),other=id(2),eid=id(3),ids=Array.from({length:15},(_,i)=>id(i+10));
 await db.exec(`begin;insert into auth.users(id) values ${[host,other,...ids].map(x=>`('${x}')`).join(',')};
 insert into profiles(id,activity_name) select id,'Member' from auth.users;
 insert into events(id,title,event_kind,created_by) values('${eid}','피로 물든 달','CLOCKTOWER','${host}');
 insert into event_participants select '${eid}',id from auth.users where id not in ('${host}','${other}');
 insert into games(name) values('시계탑에 흐른 피');`);
 const uid=who=>db.query("select set_config('request.jwt.claim.sub',$1,true)",[who??'']);
 const room=async()=> (await db.query('select * from clocktower_live_rooms where event_id=$1 order by created_at desc,id desc limit 1',[eid])).rows[0];
 async function action(name,extra={}){const r=await room();return db.query('select clocktower_live_command($1,$2,$3)',[eid,name,JSON.stringify({room_id:r?.id,bmr_revision:r?.bmr_revision,revision:r?.flow_revision,...extra})]);}
 const snapshot=async()=> (await db.query('select clocktower_live_snapshot($1) s',[eid])).rows[0].s;
 async function rejects(fn,label){await db.exec('savepoint denied');let denied=false;try{await fn()}catch{denied=true;}await db.exec('rollback to denied;release denied');check(denied,label);}
 async function isolated(fn){await db.exec('savepoint scenario');try{await fn()}finally{await db.exec('rollback to scenario;release scenario');}}
 await uid(host);await action('create');const rid=(await room()).id;
 // Cross-check every possible population category against server and client validation.
 const pools=Object.fromEntries(['주민','외지인','하수인','악마'].map(t=>[t,BMR_ROLES.filter(r=>r.type===t).map(r=>r.name)]));
 const base=[[3,0,1,1],[3,1,1,1],[5,0,1,1],[5,1,1,1],[5,2,1,1],[7,0,2,1],[7,1,2,1],[7,2,2,1],[9,0,3,1],[9,1,3,1],[9,2,3,1]];
 for(let n=5;n<=15;n++)for(const godfather of [false,true])for(let outsiders=0;outsiders<=4;outsiders++){
  const b=base[n-5],towns=n-outsiders-b[2]-1;if(towns<0||towns>13)continue;
  const minions=godfather?['대부',...pools['하수인'].filter(r=>r!=='대부').slice(0,b[2]-1)]:pools['하수인'].filter(r=>r!=='대부').slice(0,b[2]);
  const roles=[...pools['주민'].slice(0,towns),...pools['외지인'].slice(0,outsiders),...minions,'포'];
  const rows=roles.map((role,i)=>({user_id:ids[i],actual_role:role,shown_role:role==='미치광이'?'포':role}));
  const valid=godfather?Math.abs(outsiders-b[1])===1:outsiders===b[1];
  await isolated(async()=>{await db.query('delete from clocktower_live_members where room_id=$1 and seat>$2',[rid,n]);await action('bmr_save_roles',{rows});
   check((bmrSetupErrors(rows).length===0)===valid,`client composition ${n}/${godfather}/${outsiders}`);
   if(valid){await action('flow_next');check((await room()).roles_released,'server accepts valid setup');}else await rejects(()=>action('flow_next'),'server rejects invalid composition');
  });
 }
 coverage.compositions=checks;
 // Establish a valid baseline, then exercise all host state flags for all 25 characters.
 const roles=bmrRandomRoles(ids.map((user_id,i)=>({user_id,seat:i+1,name:'P'+i,alive:true})),()=>0.43);
 await action('bmr_save_roles',{rows:roles});await action('flow_next');
 for(const who of ids){await uid(who);await action('role_ack');}
 await uid(host);await action('flow_next');
 await db.exec('savepoint night_baseline');
 let stateCases=0;
 for(const role of BMR_ROLES)for(const life of role.name==='좀비얼'?['ALIVE','DEAD','ZOMBIE']:['ALIVE','DEAD'])for(const faction of ['GOOD','EVIL'])for(let mask=0;mask<16;mask++){
  await isolated(async()=>{const bmr={life,faction,drunk:!!(mask&1),poisoned:!!(mask&2),protected:!!(mask&4),spent:!!(mask&8)};
   await uid(host);await action('bmr_member',{user_id:ids[0],actual_role:role.name,shown_role:role.name==='미치광이'?'포':role.name,bmr,notes:'private marker'});
   const h=await snapshot(),hm=h.members.find(m=>m.user_id===ids[0]);check(JSON.stringify(hm.bmr)===JSON.stringify(bmr)||Object.entries(bmr).every(([k,v])=>hm.bmr[k]===v),'all flags round-trip');
   await uid(ids[1]);const p=await snapshot();check(!('bmr' in p)&&p.members.every(m=>!('bmr'in m)&&!('actual_role'in m)&&!('notes'in m)),'no private state leaks');
   check(p.members.find(m=>m.user_id===ids[0]).alive===true,'night life changes remain private');
   await uid(ids[0]);const own=(await snapshot()).members.find(m=>m.user_id===ids[0]);check(own.faction===(role.name==='미치광이'?'EVIL':faction),'own apparent faction');stateCases++;
  });
 }
 coverage.roleStateCases=stateCases;
 await uid(host);
 // All request-format combinations with positive, negative, retry and cross-account submissions.
 let requestCases=0;
 for(let count=0;count<=3;count++)for(const character of [false,true])for(const pass of [false,true])for(const self of [false,true]){
  await isolated(async()=>{await uid(host);await action('bmr_request',{user_id:ids[0],target_count:count,allow_self:self,prompt:'Request',options:{character,pass}});
   const q=(await db.query('select * from clocktower_live_requests where room_id=$1 order by created_at desc,id desc limit 1',[rid])).rows[0];
   if(q.status==='OPEN'){
    await uid(other);await rejects(()=>action('reply',{request_id:q.id,targets:ids.slice(1,count+1),answer:{character:'포'}}),'outsider cannot reply');
    await uid(ids[0]);await rejects(()=>action('reply',{request_id:q.id,targets:[...ids.slice(1,count+1),ids[10]],answer:{character:'포'}}),'wrong count rejected');
    if(count>0&&!self)await rejects(()=>action('reply',{request_id:q.id,targets:[ids[0],...ids.slice(1,count)],answer:{character:'포'}}),'self exclusion');
    if(count>1)await rejects(()=>action('reply',{request_id:q.id,targets:Array(count).fill(ids[1]),answer:{character:'포'}}),'duplicate targets rejected');
    if(character)await rejects(()=>action('reply',{request_id:q.id,targets:ids.slice(1,count+1),answer:{character:'invalid'}}),'unknown character rejected');
    if(!pass)await rejects(()=>action('reply',{request_id:q.id,targets:[],answer:{pass:true}}),'mandatory action cannot pass');
    await action('reply',{request_id:q.id,targets:ids.slice(1,count+1),answer:{character:'포'}});
    await rejects(()=>action('reply',{request_id:q.id,targets:ids.slice(1,count+1),answer:{character:'포'}}),'reply retry rejected');
   }
   await uid(host);await action('bmr_resolve',{request_id:q.id,result:'Delivered'});const revision=(await room()).bmr_revision;
   await action('bmr_step',{note:'Complete'});await rejects(()=>action('bmr_step',{note:'Retry',bmr_revision:revision}),'stale step rejected');
   await uid(ids[0]);let s=await snapshot();check(s.requests.find(x=>x.id===q.id).result==='Delivered'&&!s.requests.find(x=>x.id===q.id).acknowledged,'reconnect preserves unread');
   await action('ack',{request_id:q.id});await action('ack',{request_id:q.id});check((await snapshot()).requests.find(x=>x.id===q.id).acknowledged,'ack retry safe');requestCases++;
  });
 }
 coverage.requestFormats=requestCases;

 // Invalid actors, wrong-room retries, atomic bulk saves and death/revival boundaries.
 let lifecycleCases=0;
 for(const actor of [null,other,ids[0]])for(const name of ['bmr_member','bmr_save_roles','bmr_request','bmr_resolve','bmr_step','bmr_notes','bmr_end','flow_next','script_set','engine_start','member','slayer_resolve','save_roles','phase']){
  await isolated(async()=>{await uid(actor);await rejects(()=>action(name,{notes:'forged',user_id:ids[0],actual_role:'선원',shown_role:'선원',bmr:{life:'ALIVE',faction:'GOOD'},winner:'GOOD',reason:'forged',note:'forged',script:'TB',phase:'ENDED'}),'unauthorized '+name);lifecycleCases++;});
 }
 await uid(host);
 await isolated(async()=>{
  await rejects(()=>action('bmr_notes',{room_id:id(999),notes:'wrong room'}),'stale room cannot write');
  const qrows=roles.map(m=>({user_id:m.user_id,actual_role:m.actual_role,shown_role:m.shown_role}));
  await db.query("update clocktower_live_rooms set phase='SETUP',roles_released=false where id=$1",[rid]);
  const before=(await db.query('select jsonb_agg(to_jsonb(m) order by seat) s from clocktower_live_members m where room_id=$1',[rid])).rows[0].s;
  const invalid=qrows.map((m,i)=>i===0?{...m,actual_role:'교수',shown_role:'교수'}:i===qrows.length-1?{...m,actual_role:'INVALID'}:m);
  await rejects(()=>action('bmr_save_roles',{rows:invalid}),'invalid final row rolls back entire bulk update');
  check(JSON.stringify((await db.query('select jsonb_agg(to_jsonb(m) order by seat) s from clocktower_live_members m where room_id=$1',[rid])).rows[0].s)===JSON.stringify(before),'bulk roles atomic');
  await rejects(()=>action('bmr_save_roles',{rows:qrows.slice(1)}),'missing member rejected');
  await rejects(()=>action('bmr_save_roles',{rows:qrows.map((m,i)=>i?m:qrows[1])}),'duplicate member rejected');
  await rejects(()=>action('bmr_request',{user_id:ids[0],prompt:'wrong phase',target_count:1}),'setup request blocked');lifecycleCases+=6;
 });
 await isolated(async()=>{
  await action('bmr_member',{user_id:ids[0],actual_role:'선원',shown_role:'선원',bmr:{life:'DEAD',faction:'GOOD'}});
  await db.query('update clocktower_live_members set ghost_vote_used=true where room_id=$1 and user_id=$2',[rid,ids[0]]);
  await action('bmr_member',{user_id:ids[0],actual_role:'선원',shown_role:'선원',bmr:{life:'ALIVE',faction:'GOOD'}});
  const m=(await db.query('select * from clocktower_live_members where room_id=$1 and user_id=$2',[rid,ids[0]])).rows[0];check(m.alive&&!m.ghost_vote_used,'revival resets ghost token');
  await action('bmr_request',{user_id:ids[0],target_count:1,prompt:'Cancelled',options:{}});
  const q=(await db.query('select id from clocktower_live_requests where room_id=$1 and status=$2',[rid,'OPEN'])).rows[0];
  await action('cancel',{request_id:q.id});await uid(ids[0]);await rejects(()=>action('reply',{request_id:q.id,targets:[ids[1]]}),'cancelled request cannot revive');
  await uid(host);await action('bmr_step',{note:'Cancelled correctly'});lifecycleCases+=3;
 });
 await isolated(async()=>{
  await uid(ids[0]);const recap=(await db.query('select clocktower_recap($1) s',[rid])).rows[0].s;check(!recap.visible&&recap.entries.length===0,'live recap private');
  await rejects(()=>db.query('select clocktower_recap($1,true,true)',[rid]),'player cannot publish secrets');lifecycleCases+=2;
 });
 await uid(host);coverage.lifecycleCases=lifecycleCases;
 // Public vote candidates are derived consistently in the UI and SQL, including ties and zero votes.
 let executionCases=0;
 for(const votes of [[],[0],[1],[8],[8,8],[8,7],[7,8]])for(const life of ['ALIVE','DEAD','ZOMBIE']){
  await isolated(async()=>{await uid(host);await db.query("update clocktower_live_rooms set phase='DAY',day_stage='NOMINATIONS',night=2 where id=$1",[rid]);
   await action('bmr_member',{user_id:ids[0],actual_role:'좀비얼',shown_role:'좀비얼',bmr:{life:'ALIVE',faction:'EVIL'}});
   const fixture=[];for(let i=0;i<votes.length;i++){
    const ballots=Object.fromEntries(ids.slice(0,votes[i]).map(id=>[id,true]));
    const v={nominee:ids[i],status:'DONE',threshold:8,ballots};fixture.push(v);
    await db.query("insert into clocktower_live_votes(room_id,day,nominator,nominee,status,threshold,ballots) values($1,2,$2,$3,'DONE',8,$4)",[rid,ids[i+5],ids[i],JSON.stringify(ballots)]);
   }
   const candidate=bmrExecutionCandidate(fixture);
   const data={execution:candidate,execution_life:life,reviewed:true,note:'Verified'};
   if(life==='ZOMBIE'&&candidate&&candidate!==ids[0]){await rejects(()=>action('flow_next',data),'only Zombuul can feign death');return;}
   await action('flow_next',data);const r=await room();check(r.phase==='NIGHT'&&r.night===3&&r.bmr_state.cursor===0&&!r.bmr_state.completed,'night transition resets cursor');
   if(candidate){const m=(await db.query('select * from clocktower_live_members where room_id=$1 and user_id=$2',[rid,candidate])).rows[0];check(m.bmr.life===life&&m.public_alive===(life==='ALIVE'),'execution result published');}executionCases++;
  });
 }
 coverage.executionCases=executionCases;
 // Every role and alignment can be persisted for both outcomes, and saving remains idempotent.
 let resultCases=0;
 for(const winner of ['GOOD','EVIL'])for(const faction of ['GOOD','EVIL'])for(const role of BMR_ROLES){
  await isolated(async()=>{await uid(host);await action('bmr_member',{user_id:ids[0],actual_role:role.name,shown_role:role.name==='미치광이'?'포':role.name,bmr:{life:'ALIVE',faction}});
   await action('bmr_end',{winner,reason:'Test result'});const r=await room();const result=(await db.query('select * from event_round_players where round_id=$1 and user_id=$2',[r.result_round_id,ids[0]])).rows[0];
   check(result.is_winner===(faction===winner)&&result.role_name===role.name,'winner uses true role/faction');
   await db.query('select clocktower_save_finished_result($1)',[rid]);check(Number((await db.query('select count(*) c from event_round_players where round_id=$1',[r.result_round_id])).rows[0].c)===16,'one result per player plus host');
   await rejects(()=>action('bmr_end',{winner,reason:'retry'}),'cannot end twice');resultCases++;
  });
 }
 coverage.resultCases=resultCases;
 await db.exec('rollback');await db.close();
 console.log(JSON.stringify({checks,coverage},null,2));
})().catch(e=>{console.error(e.message,e.where||'',e.stack);process.exit(1)});
