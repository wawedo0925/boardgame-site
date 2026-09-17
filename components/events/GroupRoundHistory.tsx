"use client";
import { useMemo, useState } from "react";
import { scoreRankLabel } from "@/lib/score-rank";
import { cooperativeResultLabel } from "@/lib/cooperative";
import { orderRoundResults } from "@/lib/round-result-order";
import TeamScoreSummary from "./TeamScoreSummary";
import { wolfScoreLabel, isWolfStreet } from "@/lib/wolfstreet";
import { teamScoreLabel } from "@/lib/tichu";
import { createClient } from "@/lib/supabase/client";
import { deleteRound } from "@/lib/services/rounds";
import type { EventGame, EventGameRound } from "@/types/event";
import RoundResultDialog from "./RoundResultDialog";
import RoleResultDialog from "./RoleResultDialog";
type Props = { games: EventGame[]; canManage: boolean; onChanged: () => Promise<void> | void; onRepeat?: (game: EventGame) => Promise<void>; repeatDisabled?: boolean };
const pname = (p: EventGameRound["players"][number]) => p.profile?.activity_name || "회원";
export default function GroupRoundHistory({ games, canManage, onChanged, onRepeat, repeatDisabled }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [scoreRound, setScoreRound] = useState<{ game: EventGame; round: EventGameRound } | null>(null);
  const [roleRound, setRoleRound] = useState<{ game: EventGame; round: EventGameRound } | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const rows = games.flatMap(game => game.rounds.map(round => ({ game, round }))).sort((a, b) => new Date(a.round.created_at).getTime() - new Date(b.round.created_at).getTime());
  async function remove(round: EventGameRound) {
    if (!confirm("이 판과 결과를 삭제할까요?")) return;
    try { await deleteRound(supabase, round.id); await onChanged(); }
    catch { alert("삭제하지 못했습니다. 다시 시도해 주세요."); }
  }
  return <div className="mt-4 space-y-3" onClick={event => event.stopPropagation()}>
    {rows.map(({ game, round }, index) => {
      const folded = collapsed.includes(round.id);
      return <article key={round.id} className="rounded-xl border border-white/10 bg-zinc-950/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-xs text-amber-300">{index + 1}판 · {game.game?.type === "COOP" ? "협력형" : game.result_type === "ROLE" ? "역할형" : "점수/등수형"}</p><h4 className="break-words font-bold">{game.game?.name}</h4></div>
          <div className="flex flex-wrap gap-2">
            {canManage && <>
              <button onClick={() => game.game?.type !== "COOP" && game.result_type === "ROLE" && !isWolfStreet(game.game?.name) ? setRoleRound({ game, round }) : setScoreRound({ game, round })} className="min-h-11 rounded-lg bg-white/10 px-3 py-2 text-sm">결과 입력/수정</button>
              {onRepeat && <button disabled={repeatDisabled} title="확정된 현재 조원으로 같은 게임을 추가합니다. 조원 변경 후에는 먼저 조 편성을 확정해 주세요." onClick={() => void onRepeat(game)} className="min-h-11 rounded-lg bg-amber-400/15 px-3 text-sm font-bold text-amber-300 disabled:opacity-40">한판 더</button>}
              <button onClick={() => void remove(round)} className="min-h-11 rounded-lg border border-red-400/20 px-3 text-sm text-red-300">삭제</button>
            </>}
            <button aria-expanded={!folded} onClick={() => setCollapsed(current => folded ? current.filter(id => id !== round.id) : [...current, round.id])} className="min-h-11 px-2 text-sm text-amber-300">{folded ? "더보기" : "접기"}</button>
          </div>
        </div>
        {!folded && <><TeamScoreSummary players={round.players}/><div className="mt-3 space-y-1">{orderRoundResults(round.players, game.result_type).map(p => <div key={p.user_id} className="flex justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2 text-sm"><span>{pname(p)}</span><strong className="text-amber-300">{p.is_gm ? "GM 진행" : cooperativeResultLabel(p) ?? scoreRankLabel(p, round.players) ?? wolfScoreLabel(p) ?? teamScoreLabel(p) ?? (game.result_type === "ROLE" ? (p.role_name ? `${p.role_name} · ${p.is_winner ? "승리" : "패배"}` : "미입력") : game.result_type === "SIMPLE_SCORE" ? (p.rank ? `${p.rank}등` : "미입력") : (p.score !== null ? `${p.score}점` : "미입력"))}</strong></div>)}</div></>}
      </article>;
    })}
    {rows.length === 0 && <p className="py-5 text-center text-sm text-zinc-600">아직 진행한 판이 없습니다.</p>}
    {scoreRound && <RoundResultDialog cooperative={scoreRound.game.game?.type === "COOP"} gameName={scoreRound.game.game?.name} round={scoreRound.round} resultType={scoreRound.game.result_type} onClose={() => setScoreRound(null)} onSaved={onChanged}/>}
    {roleRound?.game.game && <RoleResultDialog round={roleRound.round} gameId={roleRound.game.game.id} onClose={() => setRoleRound(null)} onSaved={onChanged}/>}
  </div>;
}
