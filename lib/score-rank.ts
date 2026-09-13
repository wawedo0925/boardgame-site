type Input={userId:string;isGm?:boolean;score:number|null;rank:number|null};
export function scoreRanks<T extends Input>(values:T[]) {
  const players=values.filter(p=>!p.isGm);
  const scored=players.some(p=>p.score!==null);
  if(scored&&players.some(p=>p.score===null||!Number.isFinite(p.score)))throw new Error('점수를 기록할 때는 GM을 제외한 모든 참가자의 점수를 입력해 주세요. 등수만 기록하려면 점수를 모두 비워 주세요.');
  if(!scored&&players.some(p=>p.rank===null||!Number.isInteger(p.rank)||p.rank<1||p.rank>players.length))throw new Error('모든 참가자의 등수를 선택해 주세요. 같은 등수도 선택할 수 있습니다.');
  return values.map(p=>({...p,score:p.isGm?null:p.score,rank:p.isGm?null:scored?1+players.filter(other=>other.score!>p.score!).length:p.rank}));
}
type Saved={score:number|null;rank:number|null;is_gm?:boolean;team_name?:string|null;role_name?:string|null};
export function scoreRankLabel(player:Saved,peers:Saved[]=[]) {
  if(player.team_name||player.role_name)return null;
  const active=peers.filter(p=>!p.is_gm);
  const rank=player.rank??(player.score!==null&&active.length&&active.every(p=>p.score!==null)?1+active.filter(p=>p.score!>player.score!).length:null);
  const tied=rank!==null&&active.filter(p=>(p.rank??(p.score!==null?1+active.filter(other=>other.score!>p.score!).length:null))===rank).length>1;
  return [player.score===null?'':`${player.score}점`,rank===null?'':`${tied?'공동 ':''}${rank}등`].filter(Boolean).join(' · ')||null;
}
