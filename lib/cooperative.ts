export function cooperativeResultLabel(player:{team_name?:string|null;is_winner:boolean|null;score:number|null}) {
  if(player.team_name!=='협력 팀'||player.is_winner===null)return null;
  return `${player.is_winner?'팀 승리':'팀 패배'}${player.score===null?'':` · ${player.score}점`}`;
}
