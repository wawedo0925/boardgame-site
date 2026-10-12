import type { LiveState } from './live';
import {flowLabel} from './flow';

function memberName(state:LiveState,userId:string) {
 return state.members?.find(member=>member.user_id===userId)?.name??'이름을 확인할 수 없는 참가자';
}

function deathSentence(state:LiveState,userIds:string[]) {
 const names=Array.from(new Set(userIds)).map(userId=>`${memberName(state,userId)}님`);
 return names.length?`${names.join(', ')}이 사망하였습니다.`:'아무 일도 일어나지 않았습니다.';
}

function executionCandidate(state:LiveState) {
 const day=(state.room?.night??0)-1;
 const votes=(state.votes??[]).filter(vote=>vote.day===day&&vote.status==='DONE');
 const highest=Math.max(0,...votes.map(vote=>Object.values(vote.ballots).filter(Boolean).length));
 const leaders=votes.filter(vote=>Object.values(vote.ballots).filter(Boolean).length===highest);
 return leaders.length===1&&highest>=leaders[0].threshold?leaders[0].nominee:undefined;
}

function nightDeaths(state:LiveState) {
 if(state.public_outcomes)return state.public_outcomes.night_deaths;
 const night=state.room?.night;
 if(night==null)return [];
 const ids=state.room?.script==='BMR'
  ?(state.bmr?.auto?.deaths??[]).filter(death=>death.night===night&&death.phase==='NIGHT').map(death=>death.id)
  :Object.entries(state.engine?.deaths??{}).filter(([,death])=>death.night===night).map(([userId])=>userId);
 // 피로 물든 달에서는 같은 밤에 부활할 수 있으므로, 새벽에 실제로 공개되는 사망자만 안내한다.
 return ids.filter(userId=>state.members?.find(member=>member.user_id===userId)?.alive===false);
}

function dayDeaths(state:LiveState) {
 if(state.public_outcomes)return state.public_outcomes.day_deaths;
 const previousDay=(state.room?.night??0)-1;
 if(previousDay<1)return [];
 if(state.room?.script==='BMR')return (state.bmr?.auto?.deaths??[]).filter(death=>death.night===previousDay&&death.phase==='DAY').map(death=>death.id);
 const execution=state.engine?.execution;
 return execution?.night===previousDay?[execution.user_id]:[];
}

export function phaseAnnouncement(state:LiveState) {
 const r=state.room;if(!r||r.phase==='SETUP')return null;
 const key=`${r.id}:${r.night}:${r.phase}:${r.day_stage??'PRIVATE'}`;
 if(r.phase==='ENDED')return {key,title:flowLabel(state),icon:'⚑',description:r.end_reason??'이야기꾼의 안내를 들어 주세요.'};
 if(r.phase==='NIGHT') {
  if(r.night===1)return {key,title:flowLabel(state),icon:'☾',description:'첫날 밤이 시작되었습니다. 공통 미션 중에도 개인 능력 요청이 우선 표시됩니다.'};
  if(!state.public_outcomes&&!state.engine&&!state.bmr)return {key,title:'밤 시작',icon:'☾',description:'밤이 시작되었습니다. 처형 결과는 이야기꾼의 안내를 확인해 주세요.'};
  const deaths=dayDeaths(state);
  const execution=r.script==='BMR'?undefined:state.engine?.execution;
  const candidate=execution?.night===r.night-1?execution.user_id:executionCandidate(state)??(r.script!=='BMR'?deaths[0]:undefined);
  const notices:string[]=[];
  if(candidate) {
   const survived=!deaths.includes(candidate)&&state.members?.find(member=>member.user_id===candidate)?.alive===true;
   notices.push(survived
    ?`${memberName(state,candidate)}님이 처형되었지만 사망하지 않았습니다.`
    :`${memberName(state,candidate)}님이 처형되었습니다.`);
  }
  const otherDeaths=deaths.filter(id=>id!==candidate);
  if(otherDeaths.length)notices.push(deathSentence(state,otherDeaths));
  if(!notices.length)notices.push('오늘은 아무도 처형되지 않았습니다.');
  const description=`${notices.join(' ')} 밤이 시작되었습니다.`;
  return {key,title:'밤 시작 · 처형 결과',icon:'☾',description};
 }
 if(r.day_stage==='NOMINATIONS')return {key,title:flowLabel(state),icon:'☀',description:'모두 모여 토론하세요. 마을 자리에서 멤버를 선택해 지목할 수 있습니다.'};
 if(!state.public_outcomes&&!state.engine&&!state.bmr)return {key,title:'낮 시작 · 사망 공개',icon:'☀',description:'낮이 시작되었습니다. 사망 결과는 이야기꾼의 안내를 확인해 주세요.'};
 return {key,title:'낮 시작 · 사망 공개',icon:'☀',description:`지난밤 ${deathSentence(state,nightDeaths(state))} 자유롭게 밀담을 나누세요.`};
}
