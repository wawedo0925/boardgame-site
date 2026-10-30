/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test harness. */
const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText,f);
const {startBmr,advanceBmr,bmrImpaired,bmrProjection,correctBmrMember,withNightGossip}=require('../lib/clocktower/bmr-engine.ts');
const {BMR_ROLES,bmrRandomRoles}=require('../lib/clocktower/bmr.ts');
const fixture=(roles=['샤발로스','암살자','어릿광대','평화주의자','선원','교수','객실 청소부'])=>startBmr(roles.map((role,i)=>({user_id:String(i),name:'P'+i,seat:i+1,alive:true,actual_role:role,shown_role:role})));
function task(e,role,night=2){e=structuredClone(e);e.phase='NIGHT';e.night=night;e.tasks=[{actor:e.players.find(p=>p.role===role).id,role,key:`test:${role}:${night}`}];e.cursor=0;e.finished=false;e.out={notices:[]};delete e.waiting;delete e.pending;return advanceBmr(e,{type:'tick'});}
const answer=(e,targets,extra={})=>advanceBmr(e,{type:'answer',id:'request',targets,answer:extra});
const decide=(e,value)=>advanceBmr(e,{type:'choice',key:e.pending.decision.key,value});
const effect=(e,source,target,kind='drunk',until=99)=>e.effects.push({source,role:e.players.find(p=>p.id===source).role,target,kind,until});

const {makeBmrInformation,bmrInformationErrors}=require('../lib/clocktower/bmr-information.ts');
let e=fixture();e.reviewEnabled=true;
e=task(e,'선원');const initial=structuredClone(e);e=answer(e,['5']);assert.equal(e.pending.decision.key,'drink');
e=decide(e,'5');assert.ok(e.review);assert.deepEqual(e.players,initial.players);assert.deepEqual(e.effects,initial.effects);assert.equal(e.out.notices.length,0);assert.equal(e.out.resolved,undefined);
assert.throws(()=>advanceBmr(e,{type:'dawn'}),/확인하고 전달/);
const reopened=advanceBmr(e,{type:'revise'});assert.equal(reopened.pending.decision.key,'drink');assert.equal(reopened.effects.length,0);
const approved=advanceBmr(JSON.parse(JSON.stringify(e)),{type:'approve',result:'선택을 확인했습니다.',notices:[]});assert.equal(bmrImpaired(approved,'5'),true);assert.equal(approved.review,undefined);assert.equal(approved.out.resolved.result,'선택을 확인했습니다.');assert.throws(()=>advanceBmr(approved,{type:'approve'}),/검토할/);
let attack=fixture();attack.reviewEnabled=true;attack=answer(task(attack,'암살자'),['2']);assert.ok(attack.review);assert.equal(attack.players[2].life,'ALIVE');assert.equal(advanceBmr(attack,{type:'approve'}).players[2].life,'DEAD');
const correction=correctBmrMember(attack,'2','어릿광대','어릿광대',{life:'ALIVE',faction:'GOOD',spent:false,drunk:false,poisoned:false,protected:true});assert.equal(correction.auto.review,undefined);assert.ok(correction.auto.waiting,'target correction preserves player submission');
const skipped=advanceBmr(attack,{type:'skip'});assert.equal(skipped.cursor,attack.cursor+1);assert.deepEqual(skipped.players,attack.players);assert.equal(skipped.waiting,undefined);assert.equal(skipped.review,undefined);
let endedNight=fixture(['포','암살자','할머니','선원','교수']);endedNight.phase='NIGHT';endedNight.finished=true;endedNight.cursor=endedNight.tasks.length;endedNight.players[2].life='DEAD';
const revived=correctBmrMember(endedNight,'2','할머니','할머니',{life:'ALIVE',faction:'GOOD',spent:false,drunk:false,poisoned:false,protected:false}).auto;assert.equal(revived.finished,false);assert.equal(revived.tasks[revived.cursor].role,'초기:할머니');
let gossip=fixture(['포','암살자','험담꾼','선원','교수','할머니','어릿광대']);gossip.reviewEnabled=true;gossip.phase='NIGHT';gossip.night=2;gossip=withNightGossip(gossip,[{id:'declaration',actor:'2',day:1,statement:'선언'}]);gossip=task(gossip,'험담꾼');assert.equal(gossip.pending.decision.key,'gossip-truth');gossip=decide(gossip,'true');gossip=decide(gossip,'1');assert.ok(gossip.review);assert.equal(gossip.players[1].life,'ALIVE');assert.equal(advanceBmr(gossip,{type:'approve'}).players[1].life,'DEAD');
const six=[{user_id:'0',name:'악마',seat:1,alive:true,actual_role:'포',shown_role:'포'},{user_id:'1',name:'미치광이',seat:2,alive:true,actual_role:'미치광이',shown_role:'포'}];const setup=makeBmrInformation(six);assert.ok(setup.messages['악마 정보:0'].includes('미치광이'));assert.equal(bmrInformationErrors(setup,six).length,0);
console.log('PASS: no effects before approval, persisted review, revise, corrected state, editable result, duplicate approval rejection, Gossip night choices retained');
let seed=27092026,transitions=0;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const pick=a=>a[Math.floor(random()*a.length)];
for(let game=0;game<120;game++){
 const size=5+game%11,roster=bmrRandomRoles(Array.from({length:size},(_,i)=>({user_id:String(i),name:'P'+i,seat:i+1,alive:true})),random);
 let x={...startBmr(roster),reviewEnabled:true},count=0;
 while(x.phase!=='ENDED'&&x.night<=8&&count++<800){
  transitions++;
  if(x.review){x=advanceBmr(x,{type:'approve'});continue;}
  if(x.pending){const d=x.pending.decision;assert.ok(d.text||d.options.length,`empty decision ${d.title}`);x=decide(x,d.text?(d.initial||'이야기꾼 정보'):pick(d.options).value);continue;}
  if(x.phase==='DAY'){
   if(x.executionPending&&!Object.values(x.moon).some(m=>!m.target)){x=advanceBmr(x,{type:'moon_night'});continue;}
   const moon=Object.keys(x.moon).find(id=>!x.moon[id].target);
   if(moon){x=advanceBmr(x,{type:'moon',actor:moon,target:pick(x.players.filter(p=>p.life==='ALIVE')).id});continue;}
   if(x.players.some(p=>p.role==='험담꾼'&&p.life!=='DEAD')&&x.gossip?.day!==x.night){x=advanceBmr(x,{type:'gossip',text:'오늘의 공개 발언',truth:random()<.5});continue;}
   x=advanceBmr(x,{type:'execution',target:random()<.15?null:pick(x.players.filter(p=>p.life==='ALIVE')).id});continue;
  }
  if(x.finished){x=advanceBmr(x,{type:'dawn'});continue;}
  if(x.waiting){
   const w=x.waiting,o=w.spec.options,actor=x.players.find(p=>p.id===w.task.actor);
   if(o.pass&&random()<.5){x=answer(x,[],{pass:true});continue;}
   let choices=x.players.filter(p=>(w.spec.allow_self||p.id!==actor.id)&&(!o.living||p.life==='ALIVE')&&(!o.dead||p.life!=='ALIVE')&&(!['악마의 변호사','구마사제'].includes(w.task.role)||x.previous[actor.id]?.night!==x.night-1||x.previous[actor.id].targets[0]!==p.id));
   if(choices.length<w.spec.target_count&&o.pass){x=answer(x,[],{pass:true});continue;}
   assert.ok(choices.length>=w.spec.target_count,`not enough targets ${w.task.role}`);
   const targets=[];while(targets.length<w.spec.target_count){const p=pick(choices);targets.push(p.id);choices=choices.filter(c=>c.id!==p.id);}
   x=answer(x,targets,{...(o.character?{character:pick(BMR_ROLES).name}:{})});assert.equal(x.out.retry,undefined);continue;
  }
  x=advanceBmr(x,{type:'tick'});
 }
 assert.ok(count<800,`non-terminating game ${game} ${x.tasks[x.cursor]?.role}`);
}
console.log(`PASS: 120 reviewed seeded 5–15-player games, ${transitions} transitions, no empty choices or infinite progress`);
