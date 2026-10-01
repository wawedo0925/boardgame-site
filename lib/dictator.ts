export const DICTATOR_ROLES = ["독재자", "광대", "귀족", "혁명가", "암살자", "성직자", "민중"] as const;

export function isDictator(name?: string | null) {
  return !!name && (name.replace(/\s/g, "").includes("이리하여나는독재자가되었다") || /in this way i become a dictator/i.test(name));
}

export function dictatorResults(players: { userId: string; role: string }[], winningRole: string) {
  const validRole = (role: string) => DICTATOR_ROLES.some(value => value === role);
  if (!players.length || players.some(player => !validRole(player.role))) throw new Error("모든 멤버의 직업을 선택해 주세요.");
  if (!validRole(winningRole) || !players.some(player => player.role === winningRole)) throw new Error("참가자가 선택한 직업 중 승리 직업을 선택해 주세요.");
  return players.map(player => ({ ...player, isWinner: player.role === winningRole }));
}
