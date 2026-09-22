export const DEATH_HOST = "데스스테이션/진행자";
export const DEATH_PLAYER = "데스스테이션/플레이어";

export function isDeathStation(name?: string | null) {
  return /^(데스스테이션|deathstation|데스스테이션deathstation)$/i.test((name ?? "").replace(/[\s():：·-]/g, ""));
}

export function deathStationRole(role?: string | null) {
  return role === DEATH_HOST ? "진행자" : role === DEATH_PLAYER ? "일반 플레이어" : null;
}

export function deathStationResults(players: { userId: string; score: number | null }[], hostId: string) {
  if (players.length < 2) throw new Error("진행자와 일반 플레이어를 포함해 2명 이상 선택해 주세요.");
  if (!players.some(p => p.userId === hostId)) throw new Error("진행자 1명을 선택해 주세요.");
  if (players.some(p => p.score === null || !Number.isFinite(p.score))) throw new Error("진행자와 일반 플레이어의 최종 점수를 모두 입력해 주세요.");
  if (players.some(p => !Number.isInteger(p.score) || p.score! < 0 || p.score! > 99)) throw new Error("점수는 0~99 사이의 정수만 입력해 주세요.");
  return players.map(p => ({ ...p, roleName: p.userId === hostId ? DEATH_HOST : DEATH_PLAYER,
    rank: 1 + players.filter(other => other.score! > p.score!).length }));
}
