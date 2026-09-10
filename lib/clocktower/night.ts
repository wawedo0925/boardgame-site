import type { LiveMember } from './live';
import { roleType, setupRoles } from './setup';
import { registeredRole, type InformationSetup } from './information';

export const FIRST_NIGHT = ['하수인 정보','악마 정보','독살범','첩자','세탁부','사서','수사관','요리사','초공감자','점쟁이','집사'];
export const OTHER_NIGHTS = ['독살범','수도사','첩자','역할 변경','임프','까마귀지기','장의사','초공감자','점쟁이','집사'];
export type NightTask = { user_id: string; role: string; key: string };
export type NightEffect = { source: string; target: string; night: number };
export type NightEngine = {
  night: number; cursor: number; tasks: NightTask[]; active?: string; finished: boolean;
  red_herring?: string; poison?: NightEffect; protection?: NightEffect; masters: Record<string,string>;
  conditions: Record<string,{drunk?:boolean;poisoned?:boolean;drunk_until?:number;poisoned_until?:number}>;
  deaths: Record<string,{night:number;role:string}>;
  execution?: {night:number;user_id:string;role:string}; notices?: string[];
  information?: InformationSetup;
};
export const emptyEngine = (): NightEngine => ({night:0,cursor:0,tasks:[],finished:false,masters:{},conditions:{},deaths:{}});
export const evil = (m: LiveMember) => ['하수인','악마'].includes(roleType(m.actual_role??'')??'');
export function impaired(m:LiveMember,e:NightEngine,members:LiveMember[]) {
  if(m.actual_role==='주정뱅이'||e.conditions[m.user_id]?.drunk||e.conditions[m.user_id]?.poisoned)return true;
  const p=e.poison;
  if(p?.target!==m.user_id || p.night!==e.night)return false;
  const source=members.find(x=>x.user_id===p.source);
  // A poisoner targeting themselves stays poisoned until their effect expires.
  return !!source?.alive && source.actual_role==='독살범' && !e.conditions[source.user_id]?.drunk && !e.conditions[source.user_id]?.poisoned;
}
export function beginNight(previous:NightEngine|undefined,night:number,members:LiveMember[]):NightEngine {
  const e={...emptyEngine(),...previous,night,cursor:0,active:undefined,finished:false,poison:undefined,protection:undefined,tasks:[] as NightTask[]};
  const order=night===1?FIRST_NIGHT:OTHER_NIGHTS;
  const sorted=[...members].sort((a,b)=>a.seat-b.seat);
  for(const role of order)for(const m of sorted){
    const include=role==='하수인 정보'?members.length>=7&&roleType(m.actual_role??'')==='하수인':role==='악마 정보'?members.length>=7&&m.actual_role==='임프':role==='역할 변경'?e.notices?.includes(m.user_id):m.shown_role===role;
    if(include)e.tasks.push({user_id:m.user_id,role,key:`${night}:${role}:${m.user_id}`});
  }
  return e;
}
export function eligible(task:NightTask,e:NightEngine,members:LiveMember[]) {
  const m=members.find(x=>x.user_id===task.user_id); if(!m)return false;
  if(task.role==='역할 변경')return m.alive;
  if(task.role==='까마귀지기')return !m.alive&&e.deaths[m.user_id]?.night===e.night&&e.deaths[m.user_id]?.role==='까마귀지기';
  if(!m.alive)return false;
  if(task.role==='장의사'&&e.execution?.night!==e.night-1)return false;
  return ['하수인 정보','악마 정보'].includes(task.role)||m.shown_role===task.role;
}
export function nextTask(engine:NightEngine,members:LiveMember[]) {
  let cursor=engine.cursor;
  while(cursor<engine.tasks.length&&!eligible(engine.tasks[cursor],engine,members))cursor++;
  return {...engine,cursor,finished:cursor>=engine.tasks.length,active:undefined};
}
export function taskRequest(task:NightTask) {
  const count=task.role==='점쟁이'?2:['독살범','수도사','임프','까마귀지기','집사'].includes(task.role)?1:0;
  return {user_id:task.user_id,target_count:count,allow_self:!['수도사','집사'].includes(task.role),prompt:count?`${task.role} · ${count===2?'확인할 참가자 두 명':'능력을 사용할 참가자 한 명'}을 선택해 주세요.`:'이야기꾼이 확인한 정보를 전달합니다.'};
}
export type NightProposal = {result:string;reason:string[];effect:string;victim?:string;successor?:string;requiresChoice?:boolean;choices?:LiveMember[]};
export function propose(task:NightTask,targets:string[],e:NightEngine,members:LiveMember[],override?:{victim?:string;successor?:string}):NightProposal {
  const m=members.find(x=>x.user_id===task.user_id)!;
  const name=(id:string)=>{const x=members.find(y=>y.user_id===id);return x?`${x.seat}번 ${x.name}`:'없음';};
  const disabled=impaired(m,e,members);
  const perceived=(x:LiveMember)=>registeredRole(x,e.information,impaired(x,e,members));
  const perceivedEvil=(x:LiveMember)=>['하수인','악마'].includes(roleType(perceived(x))??'');
  const reason:string[]=[];
  const p:NightProposal={result:'선택을 확인했습니다.',reason,effect:'상태 변경 없음'};
  const t=members.find(x=>x.user_id===targets[0]);
  if(disabled)reason.push('취함·중독 또는 주정뱅이: 능력 효과는 없으며 정보는 수정할 수 있습니다. 상태는 본인에게 알리지 않습니다.');
  if(['하수인 정보','악마 정보'].includes(task.role)){
    const minions=members.filter(x=>roleType(x.actual_role??'')==='하수인');
    p.result=task.role==='하수인 정보'?`악마: ${members.filter(x=>x.actual_role==='임프').map(x=>name(x.user_id)).join(', ')}\n하수인: ${minions.map(x=>name(x.user_id)).join(', ')}`:`하수인: ${minions.map(x=>name(x.user_id)).join(', ')}\n게임에 없는 선한 역할: ${(e.information?.bluffs??setupRoles.filter(r=>['주민','외지인'].includes(r.type)&&!members.some(x=>x.actual_role===r.name||x.shown_role===r.name)).slice(0,3).map(r=>r.name)).join(', ')}`;
    p.reason=['7명 이상 첫날 밤의 초기 정보입니다. 취함·중독과 무관한 준비 정보입니다. 악마 블러프는 전달 전에 수정할 수 있습니다.'];return p;
  }
  if(task.role==='역할 변경'){p.result=`당신의 역할은 ${m.shown_role}입니다.`;return p;}
  if(task.role==='독살범'){p.effect=disabled?'중독 적용 안 함':`${t?name(t.user_id):''} 중독 · 다음 황혼까지 (독살범이 능력을 잃으면 즉시 해제)`;return p;}
  if(task.role==='수도사'){p.effect=disabled?'보호 적용 안 함':`${t?name(t.user_id):''} 보호 · 오늘 밤`;return p;}
  if(task.role==='집사'){p.effect=disabled?'주인 지정 적용 안 함':`주인: ${t?name(t.user_id):''}`;return p;}
  if(task.role==='임프'){
    let victim=t;
    if(override?.victim!==undefined)victim=members.find(x=>x.user_id===override.victim);
    if(disabled){p.effect='임프의 능력이 없어 사망하지 않습니다.';return p;}
    const protectedByMonk=(x:LiveMember)=>{const protection=e.protection;const monk=members.find(y=>y.user_id===protection?.source);return protection?.night===e.night&&protection.target===x.user_id&&monk?.alive&&monk.actual_role==='수도사'&&!impaired(monk,e,members);};
    if(!victim?.alive){p.effect='생존한 사망 대상 없음';return p;}
    if(protectedByMonk(victim)||(victim.actual_role==='군인'&&!impaired(victim,e,members))){p.effect=`${name(victim.user_id)} 보호로 사망하지 않습니다.`;return p;}
    if(t?.actual_role==='시장'&&!impaired(t,e,members)&&!protectedByMonk(t)&&override?.victim===undefined){p.requiresChoice=true;p.reason.push('시장: 그대로 사망시키거나 다른 사망 대상을 선택해 주세요.');}
    p.victim=victim.user_id;p.effect=`${name(victim.user_id)} 사망 (새벽까지 비공개)`;
    if(victim.actual_role==='임프'){
      const scarlet=members.find(x=>x.actual_role==='탕녀'&&x.alive&&!impaired(x,e,members));
      const count=members.filter(x=>x.alive).length;
      const choices=members.filter(x=>x.alive&&roleType(x.actual_role??'')==='하수인');
      if(scarlet&&count>=5)p.successor=scarlet.user_id;
      else if(victim.user_id===m.user_id&&t?.user_id===m.user_id){p.choices=choices;p.successor=choices.find(x=>x.user_id===override?.successor)?.user_id??(choices.length===1?choices[0].user_id:undefined);if(choices.length>1&&!p.successor)p.requiresChoice=true;}
      if(p.successor)p.effect+=` · ${name(p.successor)} 임프 승계`;
      else if(p.requiresChoice)p.reason.push('임프가 자결했습니다. 승계할 생존 하수인을 선택해 주세요.');
      else p.reason.push('생존 악마가 없어질 수 있습니다. 승리 조건을 확인하고 게임 종료 여부를 결정하세요.');
    }
    return p;
  }
  if(task.role==='초공감자'){
    const all=[...members].sort((a,b)=>a.seat-b.seat),i=all.findIndex(x=>x.user_id===m.user_id);
    const neighbours=[-1,1].map(dir=>{for(let n=1;n<all.length;n++){const x=all[(i+dir*n+all.length)%all.length];if(x.alive)return x;}return undefined;}).filter((x):x is LiveMember=>!!x);
    p.result=String(neighbours.filter(perceivedEvil).length);reason.push(`이웃 생존자: ${neighbours.map(x=>name(x.user_id)).join(', ')}`);
    if(neighbours.some(x=>['은둔자','첩자'].includes(x.actual_role??'')&&!impaired(x,e,members)))reason.push('은둔자·첩자의 위장 감지 여부에 따라 숫자를 수정할 수 있습니다.');
  }else if(task.role==='점쟁이'){
    const selected=members.filter(x=>targets.includes(x.user_id));
    p.result=selected.some(x=>perceived(x)==='임프'||x.user_id===e.red_herring)?'악마가 있습니다.':'악마가 없습니다.';
    reason.push(`선택: ${selected.map(x=>name(x.user_id)).join(', ')} · 허상: ${e.red_herring?name(e.red_herring):'미지정'}`);
    if(!e.red_herring){p.requiresChoice=true;reason.push('밤 설정에서 선한 허상 한 명을 먼저 지정해 주세요.');}
    if(selected.some(x=>x.actual_role==='은둔자'&&!impaired(x,e,members)))reason.push('은둔자를 악마로 감지할지는 이야기꾼이 결정합니다.');
  }else if(task.role==='요리사'){
    const all=[...members].sort((a,b)=>a.seat-b.seat);p.result=String(all.filter((x,i)=>perceivedEvil(x)&&perceivedEvil(all[(i+1)%all.length])).length);reason.push('자리 번호 순서에서 악한 팀끼리 맞닿은 쌍 수입니다.');
    if(all.some(x=>['은둔자','첩자'].includes(x.actual_role??'')&&!impaired(x,e,members)))reason.push('은둔자·첩자 위장에 따라 쌍 수를 수정할 수 있습니다.');
  }else if(['세탁부','사서','수사관'].includes(task.role)){
    const type=task.role==='세탁부'?'주민':task.role==='사서'?'외지인':'하수인';
    const clue=e.information?.clues[m.user_id];
    const actual=members.find(x=>roleType(perceived(x))===type);
    if(clue){
      p.result=clue.none?'외지인은 0명입니다.':`${[clue.correct,clue.decoy].sort((a,b)=>(members.find(x=>x.user_id===a)?.seat??0)-(members.find(x=>x.user_id===b)?.seat??0)).map(name).join(' 또는 ')} 중 한 명은 ${clue.role}입니다.`;
      reason.push('게임 시작 전 저장한 정보 조합입니다.');
      const correct=members.find(x=>x.user_id===clue.correct);
      if(!disabled&&(clue.none?members.some(x=>roleType(perceived(x))==='외지인'):!correct||perceived(correct)!==clue.role)){p.requiresChoice=true;reason.push('현재 중독·취함 또는 위장 상태가 준비할 때와 달라졌습니다. 전달할 정보를 수정·확인해 주세요.');}
    }
    else if(!actual)p.result='외지인은 0명입니다.';
    else {const decoy=members.find(x=>x.user_id!==actual.user_id&&x.user_id!==m.user_id)??members.find(x=>x.user_id!==actual.user_id)!;const pair=[actual,decoy].sort((a,b)=>a.seat-b.seat);p.result=`${pair.map(x=>name(x.user_id)).join(' 또는 ')} 중 한 명은 ${actual.actual_role}입니다.`;}
    reason.push('제시할 두 사람과 역할의 기본 제안입니다. 원하는 조합이나 위장 감지를 반영해 수정할 수 있습니다.');
  }else if(task.role==='까마귀지기'||task.role==='장의사'){
    const id=task.role==='까마귀지기'?targets[0]:e.execution?.user_id;
    const target=members.find(x=>x.user_id===id);
    p.result=(task.role==='장의사'?target?registeredRole({...target,actual_role:e.execution?.role},e.information,impaired(target,e,members)):e.execution?.role:target?perceived(target):undefined)??'정보 없음';
    reason.push(`${id?name(id):'없음'}의 ${task.role==='장의사'?'처형으로 사망했을 때':'현재'} 실제 역할입니다.`);
    if(['은둔자','첩자'].includes(target?.actual_role??''))reason.push('은둔자·첩자의 위장 기본값을 반영했습니다. 이번 감지에서 보여줄 역할을 수정할 수 있습니다.');
  }else if(task.role==='첩자'){
    p.result=members.map(x=>`${name(x.user_id)}: ${x.actual_role}${x.actual_role!==x.shown_role?` (${x.shown_role}로 착각)`:''} / ${x.alive?'생존':'사망'}${impaired(x,e,members)?' / 능력 무효':''}${e.red_herring===x.user_id?' / 점쟁이 허상':''}${e.protection?.target===x.user_id?' / 보호 대상':''}${x.notes?` / ${x.notes}`:''}`).join('\n');
    reason.push('현재 마도서 정보입니다. 중독·취함이면 전달 내용을 수정하세요.');
  }
  if(e.information&&members.some(x=>perceived(x)!==x.actual_role))reason.push('은둔자·첩자의 저장된 위장 기본값을 적용한 제안입니다. 이번 감지 결과는 수정할 수 있습니다.');
  if(disabled && !['독살범','수도사','집사','임프'].includes(task.role)){
    reason.push(`정상 상태일 때의 참고 답: ${p.result}`);
    if(['초공감자','요리사'].includes(task.role))p.result=String((Number(p.result)+1)%(task.role==='초공감자'?3:Math.max(2,members.length)));
    else if(task.role==='점쟁이')p.result=p.result==='악마가 있습니다.'?'악마가 없습니다.':'악마가 있습니다.';
    else if(task.role==='까마귀지기'||task.role==='장의사')p.result=setupRoles.find(x=>x.type==='주민'&&x.name!==p.result)!.name;
    else {p.requiresChoice=true;reason.push('정보가 무효인 상황입니다. 전달할 내용을 수정한 뒤 승인해 주세요.');}
  }
  return p;
}
export function approveEffects(task:NightTask,targets:string[],e:NightEngine,members:LiveMember[],proposal:NightProposal) {
  const state:NightEngine=structuredClone(e);const changes:{user_id:string;alive:boolean;actual_role:string;shown_role:string}[]=[];
  const actor=members.find(m=>m.user_id===task.user_id)!;
  if(task.role==='역할 변경')state.notices=state.notices?.filter(id=>id!==actor.user_id);
  if(!impaired(actor,e,members)){
    if(task.role==='독살범')state.poison={source:actor.user_id,target:targets[0],night:e.night};
    if(task.role==='수도사')state.protection={source:actor.user_id,target:targets[0],night:e.night};
    if(task.role==='집사')state.masters[actor.user_id]=targets[0];
    if(task.role==='임프'&&proposal.victim){
      const dead=members.find(x=>x.user_id===proposal.victim)!;
      state.deaths[dead.user_id]={night:e.night,role:dead.shown_role??''};
      changes.push({user_id:dead.user_id,alive:false,actual_role:dead.actual_role!,shown_role:dead.shown_role!});
      if(proposal.successor){const successor=members.find(x=>x.user_id===proposal.successor)!;changes.push({user_id:successor.user_id,alive:true,actual_role:'임프',shown_role:'임프'});state.tasks.splice(state.cursor+1,0,{user_id:successor.user_id,role:'역할 변경',key:`${e.night}:승계:${successor.user_id}`});}
    }
  }
  return {state,changes};
}
