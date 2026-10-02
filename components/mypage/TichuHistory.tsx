"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { summarizeTichu, type TichuRecord } from "@/lib/tichu-records";

export default function TichuHistory({ userId }: { userId: string }) {
  const [records, setRecords] = useState<TichuRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const all: TichuRecord[] = [];
      try {
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await supabase.from("tichu_personal_rounds")
            .select("room_id,round_no,game_mode,score,declaration,declaration_success,first_place,played_at")
            .eq("user_id", userId).order("played_at", { ascending: false }).order("room_id").order("round_no")
            .range(offset, offset + 999);
          if (error) throw error;
          all.push(...(data ?? []) as TichuRecord[]);
          if (cancelled || (data?.length ?? 0) < 1000) break;
        }
        if (!cancelled) setRecords(all);
      } catch { if (!cancelled) setError("티츄 기록을 불러오지 못했습니다. 잠시 후 다시 열어 주세요."); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [userId]);
  if (loading) return <p className="py-8 text-center text-zinc-400">티츄 기록을 불러오는 중...</p>;
  if (error) return <p role="alert" className="text-red-300">{error}</p>;
  return <div className="space-y-5">
    <p className="text-sm leading-6 text-zinc-400">완료한 라운드 1회를 1판으로 집계합니다. AI가 한 명이라도 포함된 판은 판수·점수·성공률에서 제외됩니다. 기록 기능 적용 이후의 플레이부터 저장됩니다.</p>
    <div className="grid gap-4 sm:grid-cols-2">{(["TEAM", "INDIVIDUAL"] as const).map(mode => {
      const stats = summarizeTichu(records.filter(record => record.game_mode === mode));
      return <section key={mode} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="text-lg font-bold">{mode === "TEAM" ? "팀전" : "개인전"}</h3>
        <p className="mt-3 text-3xl font-bold text-amber-300">{stats.rounds}판</p>
        <p className="mt-2 text-sm text-zinc-400">{mode === "TEAM" ? "내 팀 누적 점수" : "내 누적 점수"} <strong className="text-white">{stats.score.toLocaleString("ko-KR")}점</strong></p>
        <div className="mt-5 space-y-3">{([["스몰 티츄", stats.small], ["라지 티츄", stats.grand]] as const).map(([label, call]) => <div key={label} className="rounded-xl bg-black/20 p-3">
          <div className="flex justify-between gap-2"><span>{label} 성공률</span><strong className="text-sky-300">{call.rate === null ? "—" : `${call.rate.toFixed(1)}%`}</strong></div>
          <p className="mt-1 text-xs text-zinc-400">{call.attempts ? `${call.attempts}회 선언 · ${call.success}회 성공` : "아직 선언 기록이 없습니다."}</p>
        </div>)}</div>
      </section>;
    })}</div>
    <h3 className="font-bold">최근 기록</h3>
    {!records.length ? <p className="text-sm text-zinc-400">아직 집계할 플레이 기록이 없습니다.</p> : <div className="space-y-2">{records.slice(0, 20).map(record => <div key={`${record.room_id}-${record.round_no}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 p-3 text-sm">
      <div><p className="font-semibold">{record.game_mode === "TEAM" ? "팀전" : "개인전"} · {record.round_no}라운드</p><p className="mt-1 text-xs text-zinc-500">{new Date(record.played_at).toLocaleString("ko-KR")}</p></div>
      <div className="text-right"><p className="font-bold text-amber-300">{record.score > 0 ? "+" : ""}{record.score}점{record.game_mode === "TEAM" ? " · 팀 점수" : ""}</p><p className="mt-1 text-xs text-zinc-400">{record.declaration ? `${record.declaration === "SMALL" ? "스몰" : "라지"} 티츄 ${record.declaration_success ? "성공" : "실패"}` : "선언 없음"}</p></div>
    </div>)}</div>}
  </div>;
}
