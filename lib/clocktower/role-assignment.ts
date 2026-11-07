import type { LiveMember } from './live';

export function assignedRoleLabel(role:string,members:LiveMember[]) {
 const names=members.filter(m=>m.actual_role===role).map(m=>m.name);
 return names.length?`${role} (${names.join(', ')})`:role;
}

export function tbAssignedRoleLabel(role:string,members:LiveMember[]) {
 const names=members.filter(m=>m.actual_role===role||m.shown_role===role).map(m=>m.actual_role===role?m.name:`${m.name} · 주정뱅이 표시`);
 return names.length?`${role} (${names.join(', ')})`:role;
}

// The displayed demon of a Lunatic does not occupy that actual role.
export function assignBmrDraft(members:LiveMember[],id:string,role:string):LiveMember[] {
 return members.map(m=>m.user_id===id
  ?{...m,actual_role:role,shown_role:role==='미치광이'?'':role}
  :role&&m.actual_role===role?{...m,actual_role:'',shown_role:''}:m);
}
