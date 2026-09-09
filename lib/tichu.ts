export const TICHU_TEAMS = ["A팀", "B팀"] as const;
export type TichuTeam = typeof TICHU_TEAMS[number];

export function isTichu(name?: string | null) {
  return ["티츄", "tichu"].includes((name ?? "").replace(/\s/g, "").toLowerCase());
}

type TeamPlayer = { isGm?: boolean; teamName?: string | null; score: number | null };

export function tichuResult(players: TeamPlayer[]) {
  const active = players.filter(player => !player.isGm);
  if (active.length !== 4 || TICHU_TEAMS.some(team => active.filter(player => player.teamName === team).length !== 2)) {
    throw new Error("티츄는 GM을 제외하고 A팀 2명, B팀 2명으로 지정해 주세요.");
  }
  if (active.some(player => player.score === null || !Number.isFinite(player.score))) {
    throw new Error("모든 참가자의 점수를 입력해 주세요.");
  }
  const totals = { "A팀": 0, "B팀": 0 };
  active.forEach(player => { totals[player.teamName as TichuTeam] += player.score!; });
  if (!Object.values(totals).every(Number.isFinite)) throw new Error("팀 합계가 너무 큽니다. 점수를 확인해 주세요.");
  const winner: TichuTeam | null = totals["A팀"] === totals["B팀"] ? null : totals["A팀"] > totals["B팀"] ? "A팀" : "B팀";
  return { totals, winner };
}

export function teamScoreLabel(player: { score: number | null; team_name: string | null; is_winner: boolean | null }) {
  if (player.score === null || !TICHU_TEAMS.includes(player.team_name as TichuTeam)) return null;
  return `${player.team_name} · ${player.score}점 · ${player.is_winner === null ? "무승부" : player.is_winner ? "승리" : "패배"}`;
}
