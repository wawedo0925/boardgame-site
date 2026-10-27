import { BMR_ROLES, bmrInformationDraft } from './bmr';
import type { LiveMember } from './live';

export type BmrInformation = {roster:string;messages:Record<string,string>;grandchildren:Record<string,string>};
export const bmrRoster = (members:LiveMember[]) => [...members].sort((a,b)=>a.user_id.localeCompare(b.user_id)).map(m=>`${m.user_id}:${m.actual_role??''}:${m.shown_role??''}`).join('|');
const type = (m:LiveMember) => BMR_ROLES.find(r=>r.name===m.actual_role)?.type;
export function bmrInformationRecipients(members:LiveMember[]) {
 return members.flatMap(m=>{
  const roles:string[]=[];
  if(type(m)==='하수인'&&members.length>=7)roles.push('하수인 정보');
  if(type(m)==='악마'&&(members.length>=7||members.some(p=>p.actual_role==='미치광이')))roles.push('악마 정보');
  if(m.actual_role==='미치광이'||m.actual_role==='대부')roles.push(m.actual_role);
  return roles.map(infoRole=>({...m,infoRole,infoKey:`${infoRole}:${m.user_id}`}));
 });
}
export function makeBmrInformation(members:LiveMember[]):BmrInformation {
 const messages:Record<string,string>={};
 for(const m of bmrInformationRecipients(members)) {
  messages[m.infoKey]=bmrInformationDraft(m.infoRole,members);
  if(m.infoRole==='악마 정보'&&members.length<7){const lunatic=members.find(p=>p.actual_role==='미치광이');if(lunatic)messages[m.infoKey]+=`\n미치광이: ${lunatic.name}`;}
 }
 return {roster:bmrRoster(members),messages,grandchildren:Object.fromEntries(members.filter(m=>m.actual_role==='할머니').map(m=>[m.user_id,members.find(x=>x.user_id!==m.user_id&&!['하수인','악마'].includes(type(x)??''))?.user_id??'']))};
}
export function bmrInformationErrors(info:BmrInformation|undefined,members:LiveMember[]):string[] {
 if(!info||info.roster!==bmrRoster(members))return ['역할 저장 후 비밀 정보 초안을 확인하고 저장해 주세요.'];
 const errors=bmrInformationRecipients(members).filter(m=>!info.messages[m.infoKey]?.trim()||info.messages[m.infoKey].length>2000).map(m=>`${m.name}에게 전달할 초기 정보를 확인해 주세요.`);
 for(const m of members.filter(m=>m.actual_role==='할머니'))if(!members.some(x=>x.user_id===info.grandchildren[m.user_id]&&x.user_id!==m.user_id&&!['하수인','악마'].includes(type(x)??'')))errors.push(`${m.name}의 손주를 선택해 주세요.`);
 return errors;
}
