import type { LiveMember } from './live';
import { roleType, setupRoles, shuffle } from './setup';

export const clueTypes: Record<string,string> = {세탁부:'주민',사서:'외지인',수사관:'하수인'};
export type InitialClue = { role:string; correct:string; decoy:string; none?:boolean };
export type InformationSetup = { roster:string; bluffs:string[]; clues:Record<string,InitialClue>; registrations:Record<string,string> };
export const rosterKey=(members:LiveMember[])=>[...members].sort((a,b)=>a.user_id.localeCompare(b.user_id)).map(m=>`${m.user_id}:${m.actual_role}:${m.shown_role}`).join('|');
export const bluffOptions=(members:LiveMember[])=>setupRoles.filter(r=>['주민','외지인'].includes(r.type)&&!members.some(m=>m.actual_role===r.name||m.shown_role===r.name));
export const registrationOptions=(m:LiveMember)=>setupRoles.filter(r=>m.actual_role==='은둔자'?['하수인','악마'].includes(r.type):m.actual_role==='첩자'?['주민','외지인'].includes(r.type):false);
export function registeredRole(m:LiveMember,info?:InformationSetup,disabled=false) {
  const choice=info?.registrations[m.user_id];
  return !disabled&&registrationOptions(m).some(r=>r.name===choice)?choice!:m.actual_role??'';
}
export function randomInformation(members:LiveMember[],random=Math.random): { information:InformationSetup; red_herring?:string } {
  const registrations:Record<string,string>={};
  for(const m of members.filter(m=>['은둔자','첩자'].includes(m.actual_role??'')))registrations[m.user_id]=shuffle(['',...registrationOptions(m).map(r=>r.name)],random)[0];
  if(members.some(m=>m.actual_role==='수사관')&&!members.some(m=>roleType(registrations[m.user_id]||m.actual_role||'')==='하수인')) {
    const minion=members.find(m=>roleType(m.actual_role??'')==='하수인');
    if(minion)registrations[minion.user_id]='';
  }
  const information:InformationSetup={roster:rosterKey(members),bluffs:shuffle(bluffOptions(members),random).slice(0,3).map(r=>r.name),clues:{},registrations};
  for(const observer of members.filter(m=>clueTypes[m.shown_role??''])) {
    const type=clueTypes[observer.shown_role!];
    const correct=shuffle(members.filter(m=>roleType(registeredRole(m,information))===type),random)[0];
    if(!correct&&observer.shown_role==='사서'){information.clues[observer.user_id]={role:'',correct:'',decoy:'',none:true};continue;}
    // Drunk information need not match a real role. A missing healthy match is left for validation.
    const target=correct??shuffle(members,random)[0];
    const decoy=shuffle(members.filter(m=>m.user_id!==target?.user_id),random)[0];
    information.clues[observer.user_id]={role:correct?registeredRole(correct,information):setupRoles.find(r=>r.type===type)!.name,correct:target?.user_id??'',decoy:decoy?.user_id??''};
  }
  return {information,red_herring:shuffle(members.filter(m=>['주민','외지인'].includes(roleType(m.actual_role??'')??'')),random)[0]?.user_id};
}
export function informationErrors(info:InformationSetup|undefined,herring:string|undefined,members:LiveMember[]) {
  if(!info)return ['역할 저장 후 비밀 정보 초안을 만들고 저장해 주세요.'];
  const errors:string[]=[];
  if(info.roster!==rosterKey(members))errors.push('참가자 또는 역할 배정이 바뀌었습니다. 비밀 정보를 다시 확인하고 저장해 주세요.');
  if(info.bluffs.length!==3||new Set(info.bluffs).size!==3||info.bluffs.some(b=>!bluffOptions(members).some(r=>r.name===b)))errors.push('블러프는 사용하지 않는 선한 역할 3개를 중복 없이 골라 주세요. 주정뱅이의 표시 역할도 제외합니다.');
  if(!members.some(m=>m.user_id===herring&&['주민','외지인'].includes(roleType(m.actual_role??'')??'')))errors.push('점쟁이 허상으로 선한 참가자 한 명을 골라 주세요.');
  for(const [id,role] of Object.entries(info.registrations))if(role&&!members.some(m=>m.user_id===id&&registrationOptions(m).some(r=>r.name===role)))errors.push('은둔자·첩자의 위장 역할을 다시 선택해 주세요.');
  for(const observer of members.filter(m=>clueTypes[m.shown_role??''])) {
    const clue=info.clues[observer.user_id],type=clueTypes[observer.shown_role!],prefix=`${observer.name} (${observer.shown_role})`;
    if(!clue){errors.push(`${prefix}: 정보 조합을 정해 주세요.`);continue;}
    if(clue.none){if(observer.shown_role!=='사서'||(observer.actual_role!=='주정뱅이'&&members.some(m=>roleType(registeredRole(m,info))==='외지인')))errors.push(`${prefix}: 외지인 0명 정보를 사용할 수 없습니다.`);continue;}
    const correct=members.find(m=>m.user_id===clue.correct);
    if(!correct||!members.some(m=>m.user_id===clue.decoy)||clue.correct===clue.decoy||roleType(clue.role)!==type)errors.push(`${prefix}: 서로 다른 두 참가자와 ${type} 역할을 선택해 주세요.`);
    else if(observer.actual_role!=='주정뱅이'&&registeredRole(correct,info)!==clue.role)errors.push(`${prefix}: 정답 대상의 실제 역할 또는 위장 기본값과 일치해야 합니다.`);
  }
  return errors;
}
