import type { LiveState } from './live';
import { validateAssignments } from './setup';
import { informationErrors } from './information';
import { bmrSetupErrors } from './bmr';
import { bmrInformationErrors } from './bmr-information';

export function readiness(state:LiveState, editing:string[]=[], busy=false):string[] {
 const room=state.room;
 if(!room||!['SETUP','NIGHT'].includes(room.phase))return [];
 const members=state.members??[], reasons=[...editing];
 if(busy)reasons.push('저장·처리 중입니다. 잠시 기다려 주세요.');
 const name=(id:string)=>members.find(m=>m.user_id===id)?.name??'참가자';
 if(room.phase==='SETUP'){
  for(const m of members)if(!m.actual_role||!m.shown_role)reasons.push(m.name+'님의 역할과 표시 역할을 선택하고 저장해 주세요.');
  if(room.script==='BMR'){reasons.push(...bmrSetupErrors(members));if(state.bmr?.automated&&!room.roles_released)reasons.push(...bmrInformationErrors(state.bmr.information,members));}
  else {
   reasons.push(...validateAssignments(members.map(m=>({user_id:m.user_id,actual_role:m.actual_role??'',shown_role:m.shown_role??''}))));
   reasons.push(...informationErrors(state.engine?.information,state.engine?.red_herring,members));
  }
  if(room.roles_released)for(const m of members.filter(m=>!m.role_confirmed))reasons.push(m.name+'님이 배포된 역할을 확인해야 합니다.');
 }else{
  const finished=room.script==='BMR'?(state.bmr?.automated?state.bmr.auto?.finished:state.bmr?.completed):state.engine?.night===room.night&&state.engine?.finished;
  if(!finished)reasons.push('밤 능력과 이야기꾼 판정을 마지막 순서까지 완료해 주세요. 자동 진행을 멈췄다면 재개해 주세요.');
  for(const q of state.requests??[]){
   if(q.status==='OPEN')reasons.push(name(q.user_id)+'님이 능력 요청에 응답해야 합니다.');
   if(q.status==='SUBMITTED')reasons.push(name(q.user_id)+'님의 응답을 판정하고 결과를 전달해 주세요.');
   if(q.status==='RESOLVED'&&!q.acknowledged)reasons.push(name(q.user_id)+'님이 받은 결과의 확인 버튼을 눌러야 합니다.');
  }
  for(const m of state.mission_progress??[])if(m.completed<m.total)reasons.push(name(m.user_id)+'님의 공통 미션이 '+(m.total-m.completed)+'개 남았습니다.');
 }
 if((state.votes??[]).some(v=>v.status==='WAITING'||v.status==='RUNNING'))reasons.push('진행 중인 투표를 완료해 주세요.');
 return [...new Set(reasons)];
}
