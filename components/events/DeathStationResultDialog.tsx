"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEATH_HOST, deathStationResults } from "@/lib/death-station";
import { clearRoundResults } from "@/lib/services/rounds";
import type { EventGameRound } from "@/types/event";
import SignedScoreInput from "./SignedScoreInput";

type Props = { round: EventGameRound; onClose: () => void; onSaved: () => Promise<void> | void };

export default function DeathStationResultDialog({ round, onClose, onSaved }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [hostId, setHostId] = useState(round.players.find(p => p.role_name === DEATH_HOST)?.user_id ?? "");
  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries(round.players.map(p => [p.user_id, p.score?.toString() ?? ""])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = (id: string) => round.players.find(p => p.user_id === id)?.profile?.activity_name?.trim() || "회원";
  let results: ReturnType<typeof deathStationResults> = [];
  let validation = "";
  try {
    results = deathStationResults(round.players.map(p => ({ userId: p.user_id, score: scores[p.user_id]?.trim() ? Number(scores[p.user_id]) : null })), hostId);
  } catch (e) { validation = (e as Error).message; }

  async function save() {
    if (validation) return;
    setBusy(true); setError("");
    try {
      const { error } = await supabase.from("event_round_players").upsert(results.map(p => ({
        round_id: round.id, user_id: p.userId, score: p.score, rank: p.rank,
        role_name: p.roleName, team_name: null, is_gm: false, is_winner: p.rank === 1,
        updated_at: new Date().toISOString(),
      })), { onConflict: "round_id,user_id" });
      if (error) throw error;
      await onSaved(); onClose();
    } catch { setError("결과를 저장하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  async function clear() {
    if (!confirm("이 판의 역할과 점수 결과를 지울까요? 참가자는 유지됩니다.")) return;
    setBusy(true); setError("");
    try { await clearRoundResults(supabase, round.id); await onSaved(); onClose(); }
    catch { setError("결과를 지우지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 sm:items-center">
    <section role="dialog" aria-modal="true" aria-label="데스스테이션 점수 기록" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-5 text-white sm:max-w-lg sm:rounded-3xl">
      <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">데스스테이션 · {round.round_number}판</h2><button disabled={busy} onClick={onClose} aria-label="닫기" className="h-11 w-11">×</button></div>
      <p className="mt-2 text-sm text-zinc-400">진행자도 점수 경쟁에 참여합니다. 모든 참가자의 최종 점수로 함께 순위를 계산합니다.</p>
      <label className="mt-5 block font-bold">진행자 1명<select value={hostId} disabled={busy} onChange={e => setHostId(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-zinc-900 px-3"><option value="">진행자 선택</option>{round.players.map(p => <option key={p.user_id} value={p.user_id}>{name(p.user_id)}</option>)}</select></label>
      {[true, false].map(host => <div key={String(host)} className="mt-5"><h3 className={host ? "font-bold text-violet-300" : "font-bold text-amber-300"}>{host ? "진행자 점수" : "일반 플레이어 점수"}</h3>
        {host && !hostId && <p className="mt-2 text-sm text-zinc-500">위에서 진행자를 선택해 주세요.</p>}
        {round.players.filter(p => (p.user_id === hostId) === host).map(p => <div key={p.user_id} className="mt-3 rounded-xl border border-white/10 p-3"><p className="font-semibold">{name(p.user_id)}</p><SignedScoreInput name={name(p.user_id)} value={scores[p.user_id] ?? ""} disabled={busy} onChange={value => setScores(current => ({ ...current, [p.user_id]: value }))}/></div>)}
      </div>)}
      {results.length > 0 && <div className="mt-5 rounded-xl bg-amber-400/10 p-3"><h3 className="font-bold">전체 순위</h3>{[...results].sort((a,b) => a.rank-b.rank).map(p => <p key={p.userId} className="mt-2 text-sm">{results.filter(other => other.rank === p.rank).length > 1 ? "공동 " : ""}{p.rank}등 · {name(p.userId)} ({p.userId === hostId ? "진행자" : "플레이어"}) · {p.score}점</p>)}</div>}
      {validation && <p className="mt-4 text-sm text-amber-200">{validation}</p>}{error && <p role="alert" className="mt-4 text-red-300">{error}</p>}
      <div className="sticky bottom-0 mt-5 flex gap-3 bg-zinc-950 py-3"><button disabled={busy} onClick={clear} className="min-h-12 rounded-xl border border-red-400/30 px-4 text-red-300">결과 삭제</button><button disabled={busy || !!validation} onClick={save} className="min-h-12 flex-1 rounded-xl bg-amber-400 font-bold text-black disabled:opacity-40">{busy ? "저장 중…" : "결과 저장"}</button></div>
    </section>
  </div>;
}
