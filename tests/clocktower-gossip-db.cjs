/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test harness. */
const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText,f);
const {createTestDb}=require('./clocktower-bmr-db.cjs');
const {startBmr,advanceBmr,bmrProjection}=require('../lib/clocktower/bmr-engine.ts');
(async()=>{
 const db=await createTestDb();for(const file of ['20260927010000_clocktower_bmr_automation.sql','20260927020000_clocktower_gossip.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
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
 await login(ids[0]);await act('gossip_declare',{statement:'악마는 모자를 썼습니다.'});
 await assert.rejects(()=>act('gossip_declare',{statement:'다시 선언'}),/이미/);
 s=await snapshot();const first=s.gossip_declarations[0];assert.equal(first.actor,ids[0]);assert.ok(!('truth' in first));assert.equal(s.bmr,undefined);
 await assert.rejects(()=>act('gossip_judge',{declaration_id:first.id,truth:true}),/이야기꾼/);
 await act('gossip_ack',{declaration_id:first.id});await act('gossip_ack',{declaration_id:first.id});assert.equal((await snapshot()).gossip_declarations[0].acknowledged,true);
 await login(ids[1]);assert.equal((await snapshot()).gossip_declarations[0].acknowledged,false);
 await act('gossip_declare',{actor:ids[0],statement:'블러핑 선언'});assert.equal((await snapshot()).gossip_declarations[1].actor,ids[1],'cannot impersonate another player');
 await login(outsider);await assert.rejects(()=>act('gossip_declare',{statement:'외부인'}),/참가자/);await assert.rejects(()=>act('gossip_ack',{declaration_id:first.id}),/참가자/);
 await login(host);s=await snapshot();const stale=await packet(advanceBmr(s.bmr.auto,{type:'execution',target:null}));
 await assert.rejects(()=>act('bmr_auto_commit',stale),/참거짓/);
 await act('gossip_judge',{declaration_id:first.id,truth:true,previous_truth:null});
 s=await snapshot();assert.equal(s.bmr.auto.gossip.actor,ids[0]);assert.equal(s.bmr.auto.gossip.truth,true);
 const real=structuredClone(s.bmr.auto.gossip),bluff=s.gossip_declarations[1];
 await act('gossip_judge',{declaration_id:bluff.id,truth:true,previous_truth:null});assert.deepEqual((await snapshot()).bmr.auto.gossip,real,'bluff does not replace genuine statement');
 await assert.rejects(()=>act('gossip_judge',{declaration_id:first.id,truth:false,previous_truth:null}),/変更|변경/);
 await act('gossip_judge',{declaration_id:first.id,truth:false,previous_truth:true});assert.equal((await snapshot()).bmr.auto.gossip.truth,false);
 await act('gossip_judge',{declaration_id:first.id,truth:true,previous_truth:false});
 await assert.rejects(()=>act('bmr_auto_commit',stale),/먼저 저장|선언 판정 화면/);
 await login(ids[2]);s=await snapshot();assert.ok(s.gossip_declarations.every(g=>!('truth' in g)));assert.equal(s.bmr,undefined);
 await assert.rejects(()=>act('gossip_declare',{statement:' '}),/1~2000/);await assert.rejects(()=>act('gossip_declare',{statement:'x'.repeat(2001)}),/1~2000/);
 await db.query('update public.clocktower_live_members set public_alive=false,alive=false where room_id=$1 and user_id=$2',[room,ids[2]]);await assert.rejects(()=>act('gossip_declare',{statement:'사망자'}),/살아/);
 await login(host);s=await snapshot();engine=advanceBmr(s.bmr.auto,{type:'execution',target:null});await act('bmr_auto_commit',await packet(engine));
 await assert.rejects(()=>act('gossip_judge',{declaration_id:first.id,truth:false,previous_truth:true}),/현재 낮/);
 await login(ids[3]);await assert.rejects(()=>act('gossip_declare',{statement:'밤 선언'}),/현재 낮/);
 // Saved public declaration feeds the genuine Gossip at the proper night action.
 await login(host);engine=(await snapshot()).bmr.auto;engine.tasks=[{actor:ids[0],role:'험담꾼',key:'gossip-test'}];engine.cursor=0;engine.finished=false;
 let decision=advanceBmr(engine,{type:'tick'});assert.equal(decision.pending.decision.key,'gossip-victim');
 const killed=advanceBmr(decision,{type:'choice',key:'gossip-victim',value:ids[2]});assert.equal(killed.players[2].life,'DEAD');
 for(const condition of ['false','wrongActor','dead','poison','drunk']){const e=structuredClone(engine);if(condition==='false')e.gossip.truth=false;if(condition==='wrongActor')e.gossip.actor=ids[1];if(condition==='dead')e.players[0].life='DEAD';if(['poison','drunk'].includes(condition))e.effects.push({source:ids[5],role:'암살자',target:ids[0],kind:condition,until:99});assert.equal(advanceBmr(e,{type:'tick'}).pending,undefined,condition);}
 // Night health is checked then: a declaration made while impaired can work after recovery.
 const protectedResult=advanceBmr(decision,{type:'choice',key:'gossip-victim',value:ids[1]});assert.equal(protectedResult.players[1].life,'ALIVE','Sailor protection still applies');
 await db.query("update public.clocktower_live_rooms set phase='DAY',night=2,day_stage='NOMINATIONS' where id=$1",[room]);await login(ids[0]);await assert.rejects(()=>act('gossip_declare',{statement:'지난 낮'}),/현재 낮/);await act('gossip_declare',{day:2,statement:'다음 낮 새 선언'});
 const privileges=(await db.query("select has_table_privilege('authenticated','public.clocktower_gossip','SELECT') as exposed,has_function_privilege('authenticated','public.clocktower_live_command_before_gossip(uuid,text,jsonb)','EXECUTE') as bypass")).rows[0];assert.equal(privileges.exposed,false);assert.equal(privileges.bypass,false);
 await db.close();console.log('PASS: public gossip, per-viewer acknowledgement, private judgment, impersonation/outsider/stale/phase guards, bluff isolation and automatic night effects');
})().catch(e=>{console.error(e,e.where);process.exit(1)});
