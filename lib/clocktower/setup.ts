import { CLOCKTOWER_CHARACTERS } from './characters';

export const setupRoles = CLOCKTOWER_CHARACTERS['점철되는 혼란'].filter(r => r.type !== '이야기꾼');
export const groups = ['주민', '외지인', '하수인', '악마'] as const;
export type Assignment = { user_id: string; actual_role: string; shown_role: string };
export const roleType = (name: string) => setupRoles.find(r => r.name === name)?.type;
export function composition(n: number, baron: boolean) {
  if (!Number.isInteger(n) || n < 5 || n > 15) return null;
  const base = [[3,0,1,1],[3,1,1,1],[5,0,1,1],[5,1,1,1],[5,2,1,1],[7,0,2,1],[7,1,2,1],[7,2,2,1],[9,0,3,1],[9,1,3,1],[9,2,3,1]][n-5];
  return [base[0]-(baron?2:0),base[1]+(baron?2:0),base[2],1];
}
export function validateAssignments(rows: Assignment[]) {
  const expected = composition(rows.length, rows.some(r => r.actual_role === '남작'));
  if (!expected) return ['이야기꾼을 제외한 참가자 5~15명을 배정해 주세요.'];
  const errors: string[] = [];
  if (new Set(rows.map(r=>r.user_id)).size !== rows.length) errors.push('참가자가 중복되었습니다.');
  if (rows.some(r=>!roleType(r.actual_role))) errors.push('모든 참가자의 역할을 선택해 주세요.');
  if (new Set(rows.map(r=>r.actual_role).filter(Boolean)).size !== rows.filter(r=>r.actual_role).length) errors.push('실제 역할은 중복할 수 없습니다.');
  if (rows.some(r=>r.actual_role==='주정뱅이' ? roleType(r.shown_role)!=='주민' : r.shown_role!==r.actual_role)) errors.push('주정뱅이에게 표시할 주민 역할을 선택해 주세요.');
  if (new Set(rows.map(r=>r.shown_role).filter(Boolean)).size !== rows.filter(r=>r.shown_role).length) errors.push('주정뱅이의 표시 역할은 다른 참가자의 역할과 겹칠 수 없습니다.');
  groups.forEach((g,i)=>{const count=rows.filter(r=>roleType(r.actual_role)===g).length; if(count!==expected[i]) errors.push(`${g} ${expected[i]}명 필요 · 현재 ${count}명`);});
  return errors;
}
export function shuffle<T>(input: T[], random = Math.random): T[] {
  const result=[...input]; for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1)); [result[i],result[j]]=[result[j],result[i]];} return result;
}
export function randomAssignments(ids: string[], baron: 'random'|'include'|'exclude', random = Math.random): Assignment[] {
  const base=composition(ids.length,false); if(!base) throw new Error('5~15명만 자동 배정할 수 있습니다.');
  const minions=shuffle(setupRoles.filter(r=>r.type==='하수인' && (baron==='random'||r.name!=='남작')).map(r=>r.name),random).slice(0,base[2]-(baron==='include'?1:0));
  if(baron==='include') minions.push('남작');
  const counts=composition(ids.length,minions.includes('남작'))!;
  const towns=shuffle(setupRoles.filter(r=>r.type==='주민').map(r=>r.name),random);
  const outsiders=shuffle(setupRoles.filter(r=>r.type==='외지인').map(r=>r.name),random).slice(0,counts[1]);
  const bag=shuffle([...towns.slice(0,counts[0]),...outsiders,...minions,'임프'],random);
  return ids.map((id,i)=>({user_id:id,actual_role:bag[i],shown_role:bag[i]==='주정뱅이'?towns[counts[0]]:bag[i]}));
}
// Only the two setup replacements caused by adding/removing the Baron are automatic.
export function changeRole(rows: Assignment[], id: string, role: string) {
  const had=rows.some(r=>r.actual_role==='남작');
  const next=rows.map(r=>r.user_id===id?{...r,actual_role:role,shown_role:role==='주정뱅이'?'':role}:{...r});
  const has=next.some(r=>r.actual_role==='남작');
  if(had!==has){
    const from=has?'주민':'외지인', to=has?'외지인':'주민';
    const available=setupRoles.filter(r=>r.type===to&&!next.some(a=>a.actual_role===r.name||a.shown_role===r.name));
    next.filter(r=>r.user_id!==id&&roleType(r.actual_role)===from).slice(0,2).forEach((r,i)=>{if(available[i]){r.actual_role=available[i].name;r.shown_role=r.actual_role==='주정뱅이'?'':r.actual_role;}});
  }
  next.filter(r=>r.actual_role==='주정뱅이').forEach(r=>{if(roleType(r.shown_role)!=='주민'||next.some(a=>a!==r&&a.shown_role===r.shown_role))r.shown_role=setupRoles.find(t=>t.type==='주민'&&!next.some(a=>a.actual_role===t.name||a.shown_role===t.name))?.name??'';});
  return next;
}
