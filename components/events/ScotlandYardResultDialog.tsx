"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EventGameRound } from "@/types/event";

type Props = {
  round: EventGameRound;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

const nameOf = (player: EventGameRound["players"][number]) =>
  player.profile?.activity_name?.trim() || "회원";

export default function ScotlandYardResultDialog({ round, onClose, onSaved }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [xUser, setXUser] = useState(
    round.players.find((player) => player.role_name === "X")?.user_id ?? "",
  );
  const [winner, setWinner] = useState<"X" | "경찰" | "">(() => {
    const saved = round.players.find((player) => player.is_winner);
    return saved?.team_name === "X" || saved?.team_name === "경찰"
      ? saved.team_name
      : "";
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasResult = round.players.some(
    (player) => player.role_name || player.team_name || player.is_winner !== null,
  );

  async function save() {
    if (round.players.length < 2 || round.players.length > 6) {
      setError("스코틀랜드 야드는 X 1명과 경찰 1~5명으로 기록할 수 있습니다.");
      return;
    }
    if (!xUser) return setError("X 역할을 맡은 참가자 한 명을 선택해 주세요.");
    if (!winner) return setError("X 승리 또는 경찰 승리를 선택해 주세요.");
    setBusy(true);
    setError("");
    try {
      const { error: saveError } = await supabase
        .from("event_round_players")
        .upsert(
          round.players.map((player) => {
            const isX = player.user_id === xUser;
            const team = isX ? "X" : "경찰";
            return {
              round_id: round.id,
              user_id: player.user_id,
              score: null,
              rank: null,
              role_name: team,
              team_name: team,
              is_gm: false,
              is_winner: team === winner,
              updated_at: new Date().toISOString(),
            };
          }),
          { onConflict: "round_id,user_id" },
        );
      if (saveError) throw saveError;
      await onSaved();
      onClose();
    } catch (reason) {
      setError(
        typeof reason === "object" && reason && "message" in reason
          ? String(reason.message)
          : "결과 저장에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!confirm("이 판의 X·경찰 결과를 삭제할까요?")) return;
    setBusy(true);
    try {
      const { error: clearError } = await supabase
        .from("event_round_players")
        .update({
          score: null,
          rank: null,
          role_name: null,
          team_name: null,
          is_winner: null,
          updated_at: new Date().toISOString(),
        })
        .eq("round_id", round.id);
      if (clearError) throw clearError;
      await onSaved();
      onClose();
    } catch {
      setError("결과 삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end bg-black/70 sm:items-center sm:justify-center">
      <section className="max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-5 text-white sm:max-w-xl sm:rounded-3xl sm:p-7">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-amber-300">{round.round_number}판 · 1 대 최대 5</p>
            <h2 className="text-xl font-bold">스코틀랜드 야드 결과</h2>
            <p className="mt-1 text-sm text-zinc-400">X가 잡히면 경찰 승리, 끝까지 도망치면 X 승리입니다.</p>
          </div>
          <button onClick={onClose} className="min-h-11 min-w-11 rounded-full bg-white/5 text-xl">×</button>
        </div>

        <h3 className="mt-6 font-bold">X 역할 선택 · 1명</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {round.players.map((player) => {
            const selected = xUser === player.user_id;
            return (
              <button
                key={player.user_id}
                type="button"
                aria-pressed={selected}
                onClick={() => setXUser(player.user_id)}
                className={`min-h-16 rounded-xl border p-3 font-bold ${selected ? "border-red-300 bg-red-600 text-white ring-2 ring-red-300" : "border-white/10 bg-white/5"}`}
              >
                {selected ? "✓ X · " : ""}{nameOf(player)}
                <small className="mt-1 block font-normal opacity-70">{selected ? "도망자" : "경찰"}</small>
              </button>
            );
          })}
        </div>

        <h3 className="mt-6 font-bold">승리 진영</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setWinner("X")} className={`min-h-14 rounded-xl border font-bold ${winner === "X" ? "border-red-300 bg-red-600 ring-2 ring-red-300" : "border-red-400/30 bg-red-950/40"}`}>X 승리</button>
          <button type="button" onClick={() => setWinner("경찰")} className={`min-h-14 rounded-xl border font-bold ${winner === "경찰" ? "border-blue-300 bg-blue-600 ring-2 ring-blue-300" : "border-blue-400/30 bg-blue-950/40"}`}>경찰 승리</button>
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
        <div className="sticky bottom-0 mt-6 grid grid-cols-2 gap-3 bg-zinc-950 pt-3">
          {hasResult ? <button disabled={busy} onClick={() => void clear()} className="min-h-12 rounded-xl border border-red-400/30 text-red-300">결과 삭제</button> : <button onClick={onClose} className="min-h-12 rounded-xl border border-white/10">취소</button>}
          <button disabled={busy || !xUser || !winner} onClick={() => void save()} className="min-h-12 rounded-xl bg-amber-400 font-bold text-zinc-950 disabled:opacity-40">{busy ? "저장 중…" : "결과 저장"}</button>
        </div>
      </section>
    </div>
  );
}
