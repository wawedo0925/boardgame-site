"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DICTATOR_ROLES, dictatorResults } from "@/lib/dictator";
import type { EventGameRound } from "@/types/event";

type Props = { round: EventGameRound; onClose: () => void; onSaved: () => Promise<void> | void };

export default function DictatorResultDialog({ round, onClose, onSaved }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [roles, setRoles] = useState<Record<string, string>>(() => Object.fromEntries(round.players.map(p => [p.user_id, p.role_name ?? ""])));
  const [winner, setWinner] = useState(round.players.find(p => p.is_winner)?.role_name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasResult = round.players.some(p => p.role_name || p.is_winner !== null);
  const winningRoles = DICTATOR_ROLES.filter(role => Object.values(roles).includes(role));

  async function save() {
    setError("");
    try {
      const results = dictatorResults(round.players.map(p => ({ userId: p.user_id, role: roles[p.user_id] })), winner);
      setBusy(true);
      const { error } = await supabase.from("event_round_players").upsert(results.map(p => ({
        round_id: round.id, user_id: p.userId, role_name: p.role, team_name: p.role,
        is_winner: p.isWinner, score: null, rank: null, is_gm: false, updated_at: new Date().toISOString(),
      })), { onConflict: "round_id,user_id" });
      if (error) throw error;
      await onSaved();
      onClose();
    } catch (e) {
      setError(e && typeof e === "object" && "message" in e ? String(e.message) : "결과 저장에 실패했습니다.");
    } finally { setBusy(false); }
  }

  async function clear() {
    if (!confirm("직업과 승패 기록을 삭제할까요?")) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.from("event_round_players").update({ role_name: null, team_name: null, is_winner: null, score: null, rank: null, is_gm: false, updated_at: new Date().toISOString() }).eq("round_id", round.id);
      if (error) throw error;
      await onSaved();
      onClose();
    } catch (e) {
      setError(e && typeof e === "object" && "message" in e ? String(e.message) : "결과 삭제에 실패했습니다.");
    } finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-[100] flex items-end bg-black/70 sm:items-center sm:justify-center">
    <section role="dialog" aria-modal="true" aria-labelledby="dictator-result-title" className="max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-5 text-white sm:max-w-2xl sm:rounded-3xl sm:p-7">
      <div className="flex items-center justify-between gap-3"><h2 id="dictator-result-title" className="text-xl font-bold">{round.round_number}판 · 직업별 결과</h2><button disabled={busy} aria-label="닫기" onClick={onClose} className="min-h-11 min-w-11 rounded-full bg-white/5 text-xl">×</button></div>
      <p className="mt-3 text-sm text-zinc-400">여러 멤버가 같은 직업을 선택할 수 있습니다. 승리 직업에 해당하는 멤버가 모두 승리로 기록됩니다.</p>
      <div className="mt-5 space-y-3">{round.players.map(p => <label key={p.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4">
        <span className="font-bold">{p.profile?.activity_name?.trim() || "회원"}</span>
        <select disabled={busy} value={roles[p.user_id]} onChange={e => setRoles(current => ({ ...current, [p.user_id]: e.target.value }))} className="min-h-12 rounded-xl border border-white/20 bg-zinc-900 px-4 text-base">
          <option value="">직업 선택</option>{DICTATOR_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
        </select>
      </label>)}</div>
      <fieldset disabled={busy} className="mt-6"><legend className="font-bold">승리 직업</legend>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{winningRoles.map(role => <button key={role} type="button" aria-pressed={winner === role} onClick={() => setWinner(role)} className={`min-h-12 rounded-xl border px-3 font-bold ${winner === role ? "border-amber-300 bg-amber-400 text-zinc-950" : "border-white/10 bg-white/10"}`}>{winner === role ? "✓ " : ""}{role}</button>)}</div>
        {!winningRoles.length && <p className="mt-2 text-sm text-zinc-400">먼저 멤버들의 직업을 선택해 주세요.</p>}
      </fieldset>
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      <div className="sticky bottom-0 mt-6 grid grid-cols-2 gap-3 bg-zinc-950 pt-3"><button disabled={busy} onClick={hasResult ? clear : onClose} className="min-h-12 rounded-xl border border-white/20">{hasResult ? "결과 삭제" : "취소"}</button><button disabled={busy} onClick={save} className="min-h-12 rounded-xl bg-amber-400 font-bold text-zinc-950 disabled:opacity-50">{busy ? "저장 중..." : "결과 저장"}</button></div>
    </section>
  </div>;
}
