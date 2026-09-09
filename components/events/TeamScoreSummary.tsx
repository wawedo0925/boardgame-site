import { tichuResult, TICHU_TEAMS } from "@/lib/tichu";
import type { RoundPlayer } from "@/types/event";

export default function TeamScoreSummary({ players }: { players: RoundPlayer[] }) {
  let result;
  try {
    result = tichuResult(players.map(player => ({ isGm: player.is_gm, teamName: player.team_name, score: player.score })));
  } catch { return null; }
  return <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm"><div className="flex flex-wrap gap-x-5 gap-y-2">{TICHU_TEAMS.map(team => <span key={team}>{team} 합계 <strong className="text-amber-300">{result.totals[team]}점</strong></span>)}</div><p className="mt-2 font-bold text-amber-300">{result.winner ? `${result.winner} 승리` : "무승부"}</p></div>;
}
