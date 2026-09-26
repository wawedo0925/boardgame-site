import { BMR_ROLES, bmrOrder, bmrPreset, bmrInformationDraft, type BmrMemberState, type BmrRequestOptions } from './bmr';
import type { LiveMember } from './live';

// All private adjudication state is persisted under the host-only bmr snapshot.
export type Player = { id:string; name:string; seat:number; role:string; shown:string; life:BmrMemberState['life']; faction:'GOOD'|'EVIL'; spent:boolean };
type Effect = { source:string; role:string; target:string; kind:'drunk'|'poison'|'safe'|'execution'|'exorcism'; until:number };
type Task = { actor:string; role:string; key:string };
export type Decision = { key:string; title:string; description:string; options:{value:string;label:string}[]; text?:boolean; initial?:string };
type Operation = { kind:'task'; task:Task; targets:string[]; answer:{character?:string;pass?:boolean}; requestId?:string } | {kind:'execution';target:string|null} | {kind:'tinker';target:string};
export type BmrAuto = {
 moonBluffs?:Record<string,boolean>; executionPending?:boolean;
 version:1; night:number; phase:'NIGHT'|'DAY'|'ENDED'; players:Player[]; effects:Effect[];
 tasks:Task[]; cursor:number; serial:number; finished:boolean; awake:string[];
 pending?:{op:Operation; answers:Record<string,string>; decision:Decision};
 waiting?:{task:Task; spec:RequestSpec};
 previous:Record<string,{night:number;targets:string[]}>; charged:Record<string,boolean>; regurgitated?:Record<string,number>;
 grandchildren:Record<string,string>; goonNight:Record<string,number>;
 deaths:{id:string;role:string;night:number;phase:string;demon:boolean}[];
 gossip?:{day:number;text:string;truth:boolean;actor?:string;declaration_id?:string}; moon:Record<string,{due:number;target?:string;good?:boolean}>;
 mastermind?:{day:number;source:string}; winner?:'GOOD'|'EVIL'; reason?:string;
 log:string[]; out:Out;
};
export type RequestSpec = {user_id:string;target_count:number;allow_self:boolean;prompt:string;options:BmrRequestOptions & {engine_key:string}};
type Out = { request?:RequestSpec; resolved?:{id:string;result:string}; notices:{user_id:string;result:string}[]; retry?:string };
export type BmrInput = {type:'tick'} | {type:'answer';id:string;targets:string[];answer?:{character?:string;pass?:boolean}}
 | {type:'choice';key:string;value:string} | {type:'dawn'} | {type:'execution';target:string|null}
 | {type:'moon_night'} | {type:'gossip';text:string;truth:boolean} | {type:'moon';actor:string;target:string} | {type:'tinker';target:string};
const kind=(role:string)=>BMR_ROLES.find(r=>r.name===role)?.type;
const actualAlive=(p:Player)=>p.life!=='DEAD';
const publicAlive=(p:Player)=>p.life==='ALIVE';
const emptyOut=():Out=>({notices:[]});
export function startBmr(members:LiveMember[]):BmrAuto {
 const e:BmrAuto={version:1,night:1,phase:'NIGHT',players:members.map(m=>({id:m.user_id,name:m.name,seat:m.seat,role:m.actual_role!,shown:m.shown_role!,life:'ALIVE',faction:kind(m.actual_role!)==='악마'||kind(m.actual_role!)==='하수인'?'EVIL':'GOOD',spent:false})),effects:[],tasks:[],cursor:0,serial:0,finished:false,awake:[],previous:{},charged:{},grandchildren:{},goonNight:{},deaths:[],moon:{},log:[],out:emptyOut()};
 e.tasks=tasks(e);return e;
}
function tasks(e:BmrAuto):Task[]{
 const list:Task[]=[];
 for(const role of bmrOrder(e.night).filter(r=>!['황혼','새벽'].includes(r)))for(const p of [...e.players].sort((a,b)=>a.seat-b.seat)){
  if(role==='하수인 정보'?e.players.length>=7&&kind(p.role)==='하수인':role==='악마 정보'?kind(p.role)==='악마'&&(e.players.length>=7||e.players.some(x=>x.role==='미치광이')):p.role===role)
   list.push({actor:p.id,role,key:`${e.night}:${++e.serial}`});
 }
 return list;
}
const player=(e:BmrAuto,id:string)=>{const p=e.players.find(x=>x.id===id);if(!p)throw Error('참가자가 변경되었습니다.');return p;};
// Self-intoxication persists; mutually intoxicating sources use the first effect as the tie break.
export function bmrImpaired(e:BmrAuto,id:string,visited:string[]=[]):boolean {
 if(visited.includes(id))return false;
 return e.effects.some(f=>f.target===id&&['drunk','poison'].includes(f.kind)&&effectOn(e,f,[...visited,id]));
}
function effectOn(e:BmrAuto,f:Effect,visited:string[]=[]):boolean {
 const p=e.players.find(x=>x.id===f.source);
 if(!p||!actualAlive(p)||p.role!==f.role||f.until<=e.night)return false;
 if(f.source===f.target)return true;
 return !bmrImpaired(e,p.id,visited);
}
const works=(e:BmrAuto,p:Player)=>actualAlive(p)&&!bmrImpaired(e,p.id);
function effect(e:BmrAuto,p:Player,target:string,k:Effect['kind'],until=e.night+1){e.effects.push({source:p.id,role:p.role,target,kind:k,until});}
function note(e:BmrAuto,text:string){e.log.push(`${e.night}일차 ${e.phase==='DAY'?'낮':'밤'} · ${text}`);}
function notice(e:BmrAuto,id:string,result:string){e.out.notices.push({user_id:id,result});}
class NeedDecision extends Error {constructor(public decision:Decision){super(decision.title);Object.setPrototypeOf(this,new.target.prototype);}}
function choose(answers:Record<string,string>,d:Decision):string {
 const v=answers[d.key];if(v===undefined)throw new NeedDecision(d);
 if(d.text?!v.trim()||v.length>2000:!d.options.some(o=>o.value===v))throw Error('판정 선택이 올바르지 않습니다.');
 return v;
}
function options(ps:Player[]){return ps.map(p=>({value:p.id,label:`${p.name} · ${p.role}`}));}
function checkWin(e:BmrAuto){
 if(e.winner)return;
 const demons=e.players.filter(p=>kind(p.role)==='악마'&&actualAlive(p));
 if(!demons.length){
  if(e.mastermind&&works(e,player(e,e.mastermind.source)))return;
  e.winner='GOOD';e.reason='생존한 악마가 없습니다.';
 }else if(e.players.filter(publicAlive).length<=2){e.winner='EVIL';e.reason='생존자가 두 명 이하입니다.';}
 if(e.winner){e.phase='ENDED';note(e,e.reason!);}
}
function protectedFromDeath(e:BmrAuto,p:Player,execution:boolean):boolean {
 if(p.role==='선원'&&works(e,p))return true;
 if(e.effects.some(f=>f.target===p.id&&(f.kind==='safe'&&e.phase==='NIGHT'||f.kind==='execution'&&execution)&&effectOn(e,f)))return true;
 const alive=e.players.filter(publicAlive).sort((a,b)=>a.seat-b.seat);
 for(const tea of alive.filter(t=>t.role==='찻집 여인'&&works(e,t))){
  if(alive.length<3)continue;const i=alive.indexOf(tea),a=alive[(i+alive.length-1)%alive.length],b=alive[(i+1)%alive.length];
  if(a.faction==='GOOD'&&b.faction==='GOOD'&&(a.id===p.id||b.id===p.id))return true;
 }
 return false;
}
function kill(e:BmrAuto,id:string,cause:string,answers:Record<string,string>,execution=false,pierce=false,demon=false){
 const p=player(e,id);if(!actualAlive(p)||e.winner)return;
 if(!pierce&&protectedFromDeath(e,p,execution)){note(e,`${p.name}: 사망 방지 (${cause})`);return;}
 if(!pierce&&execution&&p.faction==='GOOD'&&e.players.some(x=>x.role==='평화주의자'&&works(e,x))){
  const save=choose(answers,{key:`pacifist:${id}`,title:`평화주의자 · ${p.name}을 살릴까요?`,description:'선한 참가자의 처형입니다. 살려도 오늘의 처형은 끝납니다.',options:[{value:'save',label:'살리기'},{value:'die',label:'구제하지 않기'}]});
  if(save==='save'){note(e,`${p.name}: 평화주의자로 생존`);return;}
 }
 if(!pierce&&p.role==='어릿광대'&&!p.spent&&works(e,p)){p.spent=true;note(e,`${p.name}: 어릿광대 능력 소모·생존`);return;}
 if(!pierce&&p.role==='좀비얼'&&p.life==='ALIVE'&&works(e,p)){
  p.life='ZOMBIE';if(e.moonBluffs?.[id])e.moon[id]={due:e.night+1};e.deaths.push({id,role:p.role,night:e.night,phase:e.phase,demon});note(e,`${p.name}: 사망 위장`);checkWin(e);return;
 }
 const healthy=!bmrImpaired(e,id);
 const minstrel=execution&&kind(p.role)==='하수인'?e.players.find(x=>x.role==='음유시인'&&works(e,x)):undefined;
 const mastermind=execution&&kind(p.role)==='악마'?e.players.find(x=>x.role==='주모자'&&works(e,x)):undefined;
 p.life='DEAD';e.deaths.push({id,role:p.role,night:e.night,phase:e.phase,demon});note(e,`${p.name}: 사망 (${cause})`);
 if(p.role==='달의 자손'||e.moonBluffs?.[id])e.moon[id]={due:e.night+1};
 if(minstrel)for(const x of e.players)if(x.id!==minstrel.id)effect(e,minstrel,x.id,'drunk',e.night+2);
 if(mastermind)e.mastermind={source:mastermind.id,day:e.night+1};
 if(!healthy&&p.role==='좀비얼')note(e,'능력이 무효인 좀비얼은 실제로 사망합니다.');
 checkWin(e);
}
function revive(e:BmrAuto,id:string){
 const p=player(e,id);if(p.life!=='DEAD')return;
 p.life='ALIVE';p.spent=false;delete e.charged[id];delete e.grandchildren[id];delete e.moon[id];delete e.previous[id];
 e.effects=e.effects.filter(f=>f.source!==id);note(e,`${p.name}: 부활 · 능력 회복`);
 if(['할머니','대부'].includes(p.role))e.tasks.splice(e.cursor+1,0,{actor:id,role:`초기:${p.role}`,key:`${e.night}:${++e.serial}`});
}
function eligible(e:BmrAuto,t:Task){
 const p=player(e,t.actor),role=t.role.replace('초기:','');
 if(role==='달의 자손')return !!e.moon[p.id]?.target&&e.moon[p.id].due===e.night;
 if(!actualAlive(p))return false;
 if(['교수','암살자','궁정대신'].includes(role)&&p.spent)return false;
 if(role==='할머니'&&!t.role.startsWith('초기:')&&e.night>1)return !!e.grandchildren[p.id];
 if(role==='대부'&&e.night>1&&!t.role.startsWith('초기:'))return e.deaths.some(d=>d.phase==='DAY'&&d.night===e.night-1&&kind(d.role)==='외지인');
 if(role==='좀비얼'&&e.deaths.some(d=>d.phase==='DAY'&&d.night===e.night-1))return false;
 return true;
}
const hostOnly=(e:BmrAuto,t:Task)=>['하수인 정보','악마 정보','할머니','험담꾼','땜장이','달의 자손','샤발로스 부활','미치광이'].includes(t.role)||t.role.startsWith('초기:')||t.role==='대부'&&e.night===1;
function spec(e:BmrAuto,t:Task):RequestSpec {
 const p=player(e,t.actor),role=t.role.startsWith('미치광이')?p.shown:t.role;
 const preset=bmrPreset(role,e.night,!!e.charged[p.id]);
 return {user_id:p.id,target_count:preset.count,allow_self:preset.self,prompt:preset.count?`능력을 사용할 참가자 ${preset.count}명을 선택해 주세요.`:preset.prompt,options:{...preset.options,engine_key:t.key}};
}
function goon(e:BmrAuto,actor:Player,targets:string[]){
 for(const id of targets){const p=player(e,id);if(p.role!=='건달'||!works(e,p)||e.goonNight[id]===e.night)continue;
  e.goonNight[id]=e.night;effect(e,p,actor.id,'drunk');
  if(p.faction!==actor.faction){p.faction=actor.faction;notice(e,p.id,`현재 당신은 ${p.faction==='EVIL'?'악한':'선한'} 팀입니다.`);}
  note(e,`${p.name}: 건달 발동 · ${actor.name} 취함`);
 }
}
function information(answers:Record<string,string>,key:string,title:string,description:string,initial?:string){return choose(answers,{key,title,description,text:true,initial,options:[]});}
function resolveTask(e:BmrAuto,op:Extract<Operation,{kind:'task'}>,answers:Record<string,string>):string {
 const t=op.task,p=player(e,t.actor),role=t.role.replace('초기:',''),targets=op.targets;
 const init=e.night===1||t.role.startsWith('초기:');
 if(role==='샤발로스 부활'){
  const candidates=(e.previous[p.id]?.targets??[]).map(id=>player(e,id)).filter(x=>x.life==='DEAD');
  if(works(e,p)&&candidates.length){
   const id=choose(answers,{key:'regurgitate',title:'샤발로스 · 누구를 토해낼까요?',description:'지난 밤 선택한 사망자 한 명을 부활시키거나, 아무도 부활시키지 않을 수 있습니다.',options:[{value:'none',label:'토해내지 않기'},...options(candidates)]});
   if(id!=='none')revive(e,id);
  }
  e.regurgitated={...e.regurgitated,[p.id]:e.night};return '샤발로스 부활 판정 완료';
 }
 if(role==='하수인 정보'||role==='악마 정보'||role==='대부'&&init){
  let draft=bmrInformationDraft(role,e.players.map(x=>({user_id:x.id,name:x.name,seat:x.seat,alive:publicAlive(x),actual_role:x.role,shown_role:x.shown})));
  if(role==='악마 정보'&&e.players.length<7){const lunatic=e.players.find(x=>x.role==='미치광이');if(lunatic)draft+=`\n미치광이: ${lunatic.name}`;}
  const result=role==='악마 정보'?information(answers,'evil-info','악마 초기 정보 · 블러프 확인','참여하지 않는 선한 캐릭터 3개 등 전달할 초기 정보를 확인하세요.',draft):role==='대부'&&bmrImpaired(e,p.id)?information(answers,'false-godfather','대부 · 무효 상태 정보','취함·중독 상태에서 전달할 외지인 정보를 입력하세요.',draft):draft;
  if(role==='대부')e.awake.push(p.id);notice(e,p.id,result);return result;
 }
 if(role==='미치광이'&&init){
  e.awake.push(p.id);
  notice(e,p.id,information(answers,'lunatic-info','미치광이에게 보낼 초기 정보','본인이 믿는 악마에 맞는 가짜 하수인·블러프 정보를 입력하세요.'));
  // Pukka acts on the first night as well as receiving its setup information.
  if(p.shown==='푸카')e.tasks.splice(e.cursor+1,0,{actor:p.id,role:'미치광이 선택',key:`${e.night}:${++e.serial}`});
  return '초기 정보 전달';
 }
 if(role==='미치광이'){
  const wake=choose(answers,{key:'lunatic-wake',title:`미치광이 · ${p.name}을 깨울까요?`,description:`본인이 믿는 악마: ${p.shown}. 가짜 사망·구마·좀비얼 조건을 고려해 결정하세요. 선택을 받으면 실제 악마에게 자동 전달합니다.`,options:[{value:'yes',label:'능력 선택 받기'},{value:'no',label:'이번 밤 깨우지 않기'}]});
  if(wake==='yes')e.tasks.splice(e.cursor+1,0,{actor:p.id,role:'미치광이 선택',key:`${e.night}:${++e.serial}`});return '미치광이 밤 판정';
 }
 if(role==='할머니'){
  if(init){
   e.awake.push(p.id);
   const candidates=e.players.filter(x=>x.id!==p.id&&x.faction==='GOOD');
   const id=choose(answers,{key:'grandchild',title:`${p.name} · 손주 선택`,description:'선한 참가자 중 손주를 선택하세요.',options:options(candidates)});
   e.grandchildren[p.id]=id;
   notice(e,p.id,bmrImpaired(e,p.id)?information(answers,'false-grandmother','할머니 · 무효 상태 정보','취함·중독 상태입니다. 전달할 참가자와 역할 정보를 입력하세요.'):`손주: ${player(e,id).name} · ${player(e,id).role}`);
  }else if(works(e,p)&&e.deaths.some(d=>d.id===e.grandchildren[p.id]&&d.night===e.night&&d.phase==='NIGHT'&&d.demon))kill(e,p.id,'할머니',answers);
  return '할머니 처리';
 }
 if(role==='험담꾼'){
  if(e.gossip?.day===e.night-1&&e.gossip.truth&&(!e.gossip.actor||e.gossip.actor===p.id)&&works(e,p)){
   const id=choose(answers,{key:'gossip-victim',title:'험담꾼 · 사망 대상',description:`참인 공개 발언: ${e.gossip.text}`,options:options(e.players.filter(actualAlive))});kill(e,id,'험담꾼',answers);
  }return '험담 처리';
 }
 if(role==='땜장이'){
  if(works(e,p)&&choose(answers,{key:'tinker',title:`땜장이 · ${p.name}`,description:'이번에 능력으로 사망시킬까요? 사망 방지 능력은 적용됩니다.',options:[{value:'no',label:'그대로 두기'},{value:'yes',label:'사망시키기'}]})==='yes')kill(e,p.id,'땜장이',answers);
  return '땜장이 처리';
 }
 if(role==='달의 자손'){
  const moon=e.moon[p.id];if(moon?.good&&!bmrImpaired(e,p.id)&&moon.target)kill(e,moon.target,'달의 자손',answers);delete e.moon[p.id];return '달의 자손 처리';
 }
 if(op.answer.pass){
  if(role==='포'||role.startsWith('미치광이')&&p.shown==='포')e.charged[p.id]=true;
  if(role.startsWith('미치광이')&&!bmrImpaired(e,p.id)){const demon=e.players.find(x=>kind(x.role)==='악마'&&actualAlive(x));if(demon)notice(e,demon.id,`미치광이 ${p.name}: 이번 능력 쉬기`);}
  return '선택을 확인했습니다.';
 }
 // Character selection is not player selection and must not trigger the Goon.
 const sequential=['포','샤발로스','좀비얼','암살자','대부'].includes(role);
 if(role!=='궁정대신'&&!sequential)goon(e,p,targets);
 if(['궁정대신','교수','암살자'].includes(role))p.spent=true;
 if(role.startsWith('미치광이')){
  const demon=e.players.find(x=>kind(x.role)==='악마'&&actualAlive(x));
  if(demon&&!bmrImpaired(e,p.id))notice(e,demon.id,`미치광이 ${p.name}의 선택: ${targets.map(id=>player(e,id).name).join(', ')||'선택 없음'}`);
  e.charged[p.id]=false;return '선택을 확인했습니다.';
 }
 if(role==='포')e.charged[p.id]=false;
 if(role==='샤발로스')e.previous[p.id]={night:e.night,targets:[...targets]};
 if(['악마의 변호사','구마사제'].includes(role))e.previous[p.id]={night:e.night,targets:[...targets]};
 if(!sequential&&bmrImpaired(e,p.id))return role==='객실 청소부'?choose(answers,{key:'false-chambermaid',title:'객실 청소부 · 무효 상태 정보',description:'취함·중독 상태입니다. 전달할 숫자를 선택하세요.',options:[0,1,2].map(n=>({value:`${n}명`,label:`${n}명`}))}):'선택을 확인했습니다.';
 if(role==='선원'||role==='여관 주인'){
  const ids=role==='선원'?[...new Set([p.id,...targets])]:targets;
  const id=choose(answers,{key:'drink',title:`${role} · 취할 사람 선택`,description:'선택한 사람의 능력 무효화와 기간은 자동 반영됩니다.',options:options(ids.map(id=>player(e,id)))});
  if(role==='여관 주인')for(const target of targets)effect(e,p,target,'safe');
  effect(e,p,id,'drunk');note(e,`${player(e,id).name}: ${role}에 의한 취함`);
 }else if(role==='궁정대신'){
  const target=e.players.find(x=>x.role===op.answer.character);if(target)effect(e,p,target.id,'drunk',e.night+3);
 }else if(role==='도박사'){
  if(player(e,targets[0]).role!==op.answer.character)kill(e,p.id,'도박사',answers);
 }else if(role==='악마의 변호사')effect(e,p,targets[0],'execution');
 else if(role==='구마사제'){
  const target=player(e,targets[0]);if(kind(target.role)==='악마'){effect(e,p,target.id,'exorcism');notice(e,target.id,`구마사제 ${p.name}이 당신을 선택했습니다.`);}
 }else if(role==='푸카'){
  const old=e.effects.filter(f=>f.source===p.id&&f.kind==='poison');
  effect(e,p,targets[0],'poison',Number.MAX_SAFE_INTEGER);
  for(const f of old){if(works(e,p))kill(e,f.target,'푸카',answers,false,false,true);e.effects=e.effects.filter(x=>x!==f);}
 }else if(['포','샤발로스','좀비얼','암살자','대부'].includes(role)){
  for(const id of targets){if(!actualAlive(p)||e.winner)break;const assassinWorks=role==='암살자'&&works(e,p);goon(e,p,[id]);if(!works(e,p)&&!assassinWorks)continue;kill(e,id,role,answers,false,role==='암살자',kind(role)==='악마');}
 }else if(role==='교수'){
  const target=player(e,targets[0]);if(kind(target.role)==='주민')revive(e,target.id);
 }else if(role==='객실 청소부')return `${targets.filter(id=>e.awake.includes(id)).length}명`;
 return '선택을 확인했습니다.';
}
function validateTargets(e:BmrAuto,w:NonNullable<BmrAuto['waiting']>,targets:string[],answer:Extract<BmrInput,{type:'answer'}>['answer']):string|null {
 const o=w.spec.options,pass=!!answer?.pass;
 if(pass)return o.pass?null:'이번 능력은 쉬기를 선택할 수 없습니다.';
 if(targets.length!==w.spec.target_count||new Set(targets).size!==targets.length)return '안내된 수만큼 서로 다른 참가자를 선택하세요.';
 const p=player(e,w.task.actor);
 if(targets.some(id=>!e.players.some(x=>x.id===id)||!w.spec.allow_self&&id===p.id))return '선택할 수 없는 참가자입니다.';
 if(o.character&&!BMR_ROLES.some(r=>r.name===answer?.character))return '캐릭터를 선택하세요.';
 if(o.living&&targets.some(id=>!publicAlive(player(e,id))&&!(w.task.role==='악마의 변호사'&&player(e,id).life==='ZOMBIE'))||o.dead&&targets.some(id=>publicAlive(player(e,id))))return '대상을 다시 선택해 주세요.';
 if(['악마의 변호사','구마사제'].includes(w.task.role)&&e.previous[p.id]?.night===e.night-1&&e.previous[p.id].targets[0]===targets[0])return '지난 밤과 다른 참가자를 선택해 주세요.';
 return null;
}
function execute(e:BmrAuto,op:Operation,answers:Record<string,string>):BmrAuto {
 const draft=structuredClone(e);delete draft.pending;
 try{
  if(op.kind==='task'){
   const result=resolveTask(draft,op,answers);
   if(op.requestId)draft.out.resolved={id:op.requestId,result};
   delete draft.waiting;draft.cursor++;note(draft,`${op.task.role}: 처리 완료`);
  }else if(op.kind==='execution'){
   if(draft.mastermind?.day===draft.night&&works(draft,player(draft,draft.mastermind.source))){draft.winner=op.target&&player(draft,op.target).faction==='GOOD'?'EVIL':'GOOD';draft.reason='주모자의 추가 낮 판정';draft.phase='ENDED';}
   else if(op.target)kill(draft,op.target,'처형',answers,true);
   if(!draft.winner){if(Object.values(draft.moon).some(m=>!m.target))draft.executionPending=true;else beginNextNight(draft);}
  }else kill(draft,op.target,'땜장이',answers);
  return draft;
 }catch(error){
  if(!(error instanceof NeedDecision))throw error;
  e.pending={op,answers,decision:error.decision};return e;
 }
}
function beginNextNight(e:BmrAuto){
 delete e.executionPending;e.night++;e.phase='NIGHT';e.effects=e.effects.filter(f=>f.until>e.night);e.awake=[];e.tasks=tasks(e);e.cursor=0;e.finished=false;
}
export function advanceBmr(previous:BmrAuto,input:BmrInput):BmrAuto {
 const e=structuredClone(previous);e.out=emptyOut();
 if(e.phase==='ENDED')throw Error('종료된 게임입니다.');
 if(input.type==='choice'){
  if(!e.pending||e.pending.decision.key!==input.key)throw Error('이미 처리되었거나 변경된 판정입니다.');
  const {op,answers}=e.pending;return execute(e,op,{...answers,[input.key]:input.value});
 }
 if(e.pending)throw Error('이야기꾼 판정을 먼저 완료해 주세요.');
 if(input.type==='gossip'){
  if(e.phase!=='DAY'||!input.text.trim())throw Error('낮에 공개한 발언을 입력하세요.');
  e.gossip={day:e.night,text:input.text.slice(0,2000),truth:input.truth};note(e,'험담 공개 발언 기록');return e;
 }
 if(input.type==='moon'){
  if(e.phase!=='DAY'||!e.moon[input.actor]||e.moon[input.actor].target||!publicAlive(player(e,input.target)))throw Error('공개 선택을 확인하세요.');
  e.moon[input.actor]={due:e.night+1,target:input.target,good:player(e,input.target).faction==='GOOD'};note(e,`${player(e,input.actor).name}: 달의 자손 공개 선택 기록`);return e;
 }
 if(input.type==='tinker'){
  const p=player(e,input.target);if(p.role!=='땜장이'||!works(e,p))throw Error('현재 땜장이 능력을 사용할 수 없습니다.');
  return execute(e,{kind:'tinker',target:p.id},{});
 }
 if(input.type==='moon_night'){
  if(e.phase!=='DAY'||!e.executionPending||Object.values(e.moon).some(m=>!m.target))throw Error('달의 자손 선택을 먼저 완료하세요.');
  beginNextNight(e);return e;
 }
 if(input.type==='execution'){
  if(e.executionPending)throw Error('이미 처형을 마쳤습니다. 달의 자손 선택을 기다려 주세요.');
  if(e.phase!=='DAY')throw Error('낮에만 처형할 수 있습니다.');
  if(Object.values(e.moon).some(m=>!m.target))throw Error('달의 자손의 공개 선택을 먼저 기록해 주세요.');
  return execute(e,{kind:'execution',target:input.target},{});
 }
 if(input.type==='dawn'){
  if(!e.finished||e.waiting)throw Error('밤 순서를 먼저 완료해 주세요.');
  e.effects=e.effects.filter(f=>f.kind!=='safe');e.phase='DAY';checkWin(e);return e;
 }
 if(e.phase!=='NIGHT')throw Error('밤에만 진행할 수 있습니다.');
 if(input.type==='answer'){
  if(!e.waiting)throw Error('선택 요청이 없습니다.');
  const invalid=validateTargets(e,e.waiting,input.targets,input.answer);
  if(invalid){e.out.retry=invalid;return e;}
  return execute(e,{kind:'task',task:e.waiting.task,targets:input.targets,answer:input.answer??{},requestId:input.id},{});
 }
 if(e.waiting||e.finished)return e;
 while(e.cursor<e.tasks.length&&!eligible(e,e.tasks[e.cursor]))e.cursor++;
 if(e.cursor===e.tasks.length){e.finished=true;checkWin(e);return e;}
 const t=e.tasks[e.cursor],p=player(e,t.actor);
 if(hostOnly(e,t))return execute(e,{kind:'task',task:t,targets:[],answer:{}},{});
 const exorcised=kind(p.role)==='악마'&&e.effects.some(f=>f.target===p.id&&f.kind==='exorcism'&&effectOn(e,f));
 if(exorcised){
  // Exorcism suppresses waking, not ongoing Pukka poison or Shabaloth regurgitation.
  if(p.role==='푸카'&&works(e,p))for(const f of [...e.effects].filter(f=>f.source===p.id&&f.kind==='poison')){kill(e,f.target,'푸카',{},false,false,true);e.effects=e.effects.filter(x=>x!==f);}
  if(p.role!=='샤발로스'){e.cursor++;return e;}
 }
 if(t.role==='샤발로스'&&works(e,p)&&e.previous[p.id]?.night===e.night-1&&e.regurgitated?.[p.id]!==e.night){
  // A distinct pre-action task lets the choice persist independently of the attack request.
  const ids=e.previous[p.id].targets.filter(id=>player(e,id).life==='DEAD');
  if(ids.length){
   e.tasks.splice(e.cursor,0,{actor:p.id,role:'샤발로스 부활',key:`${e.night}:${++e.serial}`});
   return advanceBmr(e,{type:'tick'});
  }
 }
 if(exorcised){e.cursor++;return e;}
 if(!e.awake.includes(p.id))e.awake.push(p.id);
 const request=spec(e,t);e.waiting={task:t,spec:request};e.out.request=request;return e;
}

export function bmrProjection(e:BmrAuto):{user_id:string;bmr:BmrMemberState}[]{return e.players.map(p=>({user_id:p.id,bmr:{life:p.life,faction:p.faction,spent:p.spent,drunk:e.effects.some(f=>f.target===p.id&&f.kind==='drunk'&&effectOn(e,f)),poisoned:e.effects.some(f=>f.target===p.id&&f.kind==='poison'&&effectOn(e,f)),protected:protectedFromDeath(e,p,e.phase==='DAY')}}));}
