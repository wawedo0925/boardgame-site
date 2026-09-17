export function cooperativeResultLabel(player:{team_name?:string|null;is_winner:boolean|null;score:number|null}) {
  if ((player.team_name==='반협력 플레이어'||player.team_name==='반협력 배신자') && player.is_winner!==null)
    return `반협력 · ${player.team_name==='반협력 배신자'?'배신자':'플레이어'} · ${player.is_winner?'승리':'패배'}${player.score===null?'':` · ${player.score}점`}`;
  if(player.team_name!=='협력 팀'||player.is_winner===null)return null;
  return `${player.is_winner?'팀 승리':'팀 패배'}${player.score===null?'':` · ${player.score}점`}`;
}
