import type {LiveMember} from './live';
import {impaired,type NightEngine} from './night';
export function seatingStatus(m:LiveMember,members:LiveMember[],e:NightEngine,phase:string,night:number) {
 e={...e,night};
 const flags:string[]=[];
 if(m.actual_role==='주정뱅이'||e.conditions[m.user_id]?.drunk)flags.push('취함');
 const poisoner=members.find(x=>x.user_id===e.poison?.source);
 const poisoned=e.conditions[m.user_id]?.poisoned||(e.poison?.target===m.user_id&&e.poison.night===night&&poisoner?.alive&&poisoner.actual_role==='독살범'&&!e.conditions[poisoner.user_id]?.drunk&&!e.conditions[poisoner.user_id]?.poisoned);
 if(poisoned)flags.push('중독');
 const monk=members.find(x=>x.user_id===e.protection?.source);
 if(phase==='NIGHT'&&e.protection?.target===m.user_id&&e.protection.night===night&&monk?.alive&&monk.actual_role==='수도사'&&!impaired(monk,e,members))flags.push('수도사 보호');
 if(m.alive&&m.actual_role==='군인'&&!impaired(m,e,members))flags.push('악마로부터 안전');
 if(e.red_herring===m.user_id)flags.push('점쟁이 허상');
 if(m.alive&&m.actual_role==='집사'&&!impaired(m,e,members)&&e.masters[m.user_id])flags.push(`주인: ${members.find(x=>x.user_id===e.masters[m.user_id])?.name??'미지정'}`);
 return flags;
}
