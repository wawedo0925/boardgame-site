/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test harness. */
const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText,f);
const {startBmr,advanceBmr,bmrImpaired,bmrProjection}=require('../lib/clocktower/bmr-engine.ts');
const {BMR_ROLES,bmrRandomRoles}=require('../lib/clocktower/bmr.ts');
const fixture=(roles=['샤발로스','암살자','어릿광대','평화주의자','선원','교수','객실 청소부'])=>startBmr(roles.map((role,i)=>({user_id:String(i),name:'P'+i,seat:i+1,alive:true,actual_role:role,shown_role:role})));
function task(e,role,night=2){e=structuredClone(e);e.phase='NIGHT';e.night=night;e.tasks=[{actor:e.players.find(p=>p.role===role).id,role,key:`test:${role}:${night}`}];e.cursor=0;e.finished=false;e.out={notices:[]};delete e.waiting;delete e.pending;return advanceBmr(e,{type:'tick'});}
const answer=(e,targets,extra={})=>advanceBmr(e,{type:'answer',id:'request',targets,answer:extra});
const decide=(e,value)=>advanceBmr(e,{type:'choice',key:e.pending.decision.key,value});
const effect=(e,source,target,kind='drunk',until=99)=>e.effects.push({source,role:e.players.find(p=>p.id===source).role,target,kind,until});
let e=fixture();e.players[2].life='DEAD';e.players[3].life='DEAD';e.previous['0']={night:2,targets:['2','3']};e=task(e,'샤발로스',3);
assert.equal(e.pending.decision.key,'regurgitate');assert.equal(e.players[2].life,'DEAD','popup cannot mutate before confirmation');
let revived=decide(e,'2');assert.equal(revived.players[2].life,'ALIVE');assert.equal(revived.players[2].spent,false);revived=advanceBmr(revived,{type:'tick'});assert.equal(revived.waiting.spec.target_count,2);
let declined=decide(e,'none');assert.equal(declined.players[2].life,'DEAD');assert.equal(advanceBmr(declined,{type:'tick'}).waiting.spec.target_count,2,'no repeated regurgitation popup');
for(const kind of ['drunk','poison']){let impaired=fixture();impaired.players[2].life='DEAD';impaired.previous['0']={night:2,targets:['2']};effect(impaired,'1','0',kind);impaired=task(impaired,'샤발로스',3);assert.equal(impaired.pending,undefined);impaired=answer(impaired,['3','4']);assert.equal(impaired.players[3].life,'ALIVE');assert.equal(impaired.players[2].life,'DEAD');}
// Pacifist choice survives JSON roundtrip and preserves execution semantics.
e=fixture();e.phase='DAY';e.night=2;e=advanceBmr(e,{type:'execution',target:'5'});assert.equal(e.pending.decision.key,'pacifist:5');
let saved=decide(JSON.parse(JSON.stringify(e)),'save');assert.equal(saved.players[5].life,'ALIVE');assert.equal(saved.night,3);assert.equal(saved.phase,'NIGHT');
let killed=decide(e,'die');assert.equal(killed.players[5].life,'DEAD');assert.equal(killed.night,3);
assert.throws(()=>decide(e,'forged'),/올바르지/);assert.throws(()=>advanceBmr(e,{type:'tick'}),/먼저/);
e=fixture();e.phase='DAY';effect(e,'1','3');e=advanceBmr(e,{type:'execution',target:'5'});assert.equal(e.pending,undefined);assert.equal(e.players[5].life,'DEAD');
e=fixture();e.phase='DAY';e=advanceBmr(e,{type:'execution',target:'1'});assert.equal(e.pending,undefined,'evil defendant never Pacifist');
// Protection ordering and two attacks recompute Tea Lady neighbours.
e=fixture(['샤발로스','암살자','찻집 여인','교수','어릿광대','객실 청소부','할머니']);e=task(e,'샤발로스');e=answer(e,['2','3']);assert.equal(e.players[2].life,'DEAD');assert.equal(e.players[3].life,'DEAD');
e=fixture();e=task(e,'암살자');e=answer(e,['2']);assert.equal(e.players[2].life,'DEAD','Assassin penetrates Fool');
e=fixture(['포','암살자','건달','교수','할머니','평화주의자','어릿광대']);e=task(e,'암살자');e=answer(e,['2']);assert.equal(e.players[2].life,'DEAD');assert.equal(e.players[2].faction,'EVIL','Assassin kills Goon and changes alignment');
// Po charge, self kill and sequential Goon interruption.
e=fixture(['포','암살자','건달','교수','할머니','평화주의자','객실 청소부']);e=task(e,'포');e=answer(e,[],{pass:true});assert.equal(e.charged['0'],true);e=task(e,'포',3);assert.equal(e.waiting.spec.target_count,3);assert.ok(answer(e,[],{pass:true}).out.retry);e=answer(e,['3','2','4']);assert.equal(e.players[3].life,'DEAD');assert.equal(e.players[4].life,'ALIVE');assert.equal(e.players[2].faction,'EVIL');
e=fixture(['포','암살자','건달','교수','할머니']);e=answer(task(e,'포'),['0']);assert.equal(e.winner,'GOOD');
// Sailor, Innkeeper, Courtier, Professor, Gambler, Chambermaid.
e=fixture();e=answer(task(e,'선원'),['5']);assert.equal(e.pending.decision.key,'drink');e=decide(e,'5');assert.ok(bmrImpaired(e,'5'));assert.ok(!bmrImpaired(e,'4'));e.phase='DAY';e.players[3].life='DEAD';e=advanceBmr(e,{type:'execution',target:'4'});assert.equal(e.players[4].life,'ALIVE');assert.ok(!bmrImpaired(e,'5'),'dusk expiration');
e=fixture(['포','암살자','여관 주인','교수','어릿광대']);e=answer(task(e,'여관 주인'),['2','3']);e=decide(e,'2');assert.ok(bmrImpaired(e,'2'));assert.equal(bmrProjection(e).find(x=>x.user_id==='3').bmr.protected,false,'self drunk innkeeper loses protection');
e=fixture(['포','암살자','궁정대신','교수','어릿광대']);e=answer(task(e,'궁정대신',1),[],{character:'포'});assert.ok(bmrImpaired(e,'0'));e.night=3;assert.ok(bmrImpaired(e,'0'));e.night=4;assert.ok(!bmrImpaired(e,'0'));
e=fixture(['포','암살자','도박사','교수','어릿광대']);e=answer(task(e,'도박사'),['0'],{character:'푸카'});assert.equal(e.players[2].life,'DEAD');
e=fixture();e.players[2].life='DEAD';e.players[2].spent=true;e=answer(task(e,'교수'),['2']);assert.equal(e.players[2].life,'ALIVE');assert.equal(e.players[2].spent,false);assert.equal(e.players[5].spent,true);
e=fixture();e.awake=['0','2'];e=answer(task(e,'객실 청소부'),['0','2']);assert.equal(e.out.resolved.result,'2명');
e=fixture();effect(e,'1','6');e=answer(task(e,'객실 청소부'),['0','2']);assert.equal(e.pending.decision.key,'false-chambermaid');assert.equal(decide(e,'0명').out.resolved.result,'0명');
// Pukka old poison persists through an impaired night; health returns after death.
e=fixture(['푸카','암살자','도박사','교수','어릿광대','할머니','객실 청소부']);e=answer(task(e,'푸카',1),['2']);assert.ok(bmrImpaired(e,'2'));e=answer(task(e,'푸카',2),['3']);assert.equal(e.players[2].life,'DEAD');assert.ok(!bmrImpaired(e,'2'));assert.ok(bmrImpaired(e,'3'));
// Mastermind adds one night/day and judges execution alignment, not death.
e=fixture(['포','주모자','교수','어릿광대','평화주의자']);e.phase='DAY';e=advanceBmr(e,{type:'execution',target:'0'});assert.equal(e.winner,undefined);assert.equal(e.mastermind.day,2);e.phase='DAY';e=advanceBmr(e,{type:'execution',target:'3'});assert.equal(e.winner,'EVIL');
// Zombie fake death, second death and no night action after a daytime death.
e=fixture(['좀비얼','암살자','교수','어릿광대','객실 청소부']);e.phase='DAY';e=advanceBmr(e,{type:'execution',target:'0'});assert.equal(e.players[0].life,'ZOMBIE');assert.equal(e.winner,undefined);assert.equal(task(e,'좀비얼',2).finished,true);e.phase='DAY';e=advanceBmr(e,{type:'execution',target:'0'});assert.equal(e.winner,'GOOD');
// Every selectable role's request is serializable; all pass/non-pass shapes.
for(const r of BMR_ROLES){let x=fixture([r.name,'포','교수','암살자','객실 청소부','어릿광대','할머니']);x.players[0].shown=r.name==='미치광이'?'포':r.name;x=task(x,r.name);assert.doesNotThrow(()=>JSON.stringify(x));}
console.log('PASS: BMR automatic effects, storyteller decisions, replay, poison, protection, deaths, revival and victory');
// Walk complete games with reproducible random legal lineups/choices. This catches
// tasks with no valid answer, repeated popup insertion, and resurrection turn bugs.
let seed=27092026,transitions=0;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const pick=a=>a[Math.floor(random()*a.length)];
for(let game=0;game<120;game++){
 const size=5+game%11,roster=bmrRandomRoles(Array.from({length:size},(_,i)=>({user_id:String(i),name:'P'+i,seat:i+1,alive:true})),random);
 let x=startBmr(roster),count=0;
 while(x.phase!=='ENDED'&&x.night<=8&&count++<800){
  transitions++;
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
   let choices=x.players.filter(p=>(w.spec.allow_self||p.id!==actor.id)&&(!o.living||p.life==='ALIVE'||w.task.role==='악마의 변호사'&&p.life==='ZOMBIE')&&(!o.dead||p.life!=='ALIVE')&&(!['악마의 변호사','구마사제'].includes(w.task.role)||x.previous[actor.id]?.night!==x.night-1||x.previous[actor.id].targets[0]!==p.id));
   if(choices.length<w.spec.target_count&&o.pass){x=answer(x,[],{pass:true});continue;}
   assert.ok(choices.length>=w.spec.target_count,`not enough targets ${w.task.role}`);
   const targets=[];while(targets.length<w.spec.target_count){const p=pick(choices);targets.push(p.id);choices=choices.filter(c=>c.id!==p.id);}
   x=answer(x,targets,{...(o.character?{character:pick(BMR_ROLES).name}:{})});assert.equal(x.out.retry,undefined);continue;
  }
  x=advanceBmr(x,{type:'tick'});
 }
 assert.ok(count<800,`non-terminating game ${game} ${x.tasks[x.cursor]?.role}`);
}
console.log(`PASS: 120 seeded 5–15-player games, ${transitions} transitions, no empty choices or infinite progress`);
