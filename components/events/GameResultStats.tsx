"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EventGame } from "@/types/event";

type Stats = {
  game_id: string; average_score: number | null; high_score: number | null;
  score_count: number; good_rate: number | null; evil_rate: number | null;
  role_count: number; success_rate: number | null; coop_count: number;
};

export function useGameResultStats(games: EventGame[]) {
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState<Record<string, Stats>>({});
  // Include current results so saving, editing or deleting refreshes the totals.
  const signature = JSON.stringify(games.map(g => [g.game_id, g.rounds]));
  useEffect(() => {
    let cancelled = false;
    const ids = [...new Set((JSON.parse(signature) as [string, unknown][]).map(g => g[0]))];
    if (ids.length) void supabase.rpc("get_game_result_statistics", { p_game_ids: ids }).then(({ data, error }) => {
      if (!cancelled) setStats(error ? {} : Object.fromEntries((data as Stats[] ?? []).map(s => [s.game_id, s])));
    });
    return () => { cancelled = true; };
  }, [signature, supabase]);
  return stats;
}

const number = (value: number | null) => value === null ? "—" : Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 1 });

export default function GameResultStats({ game, stats }: { game: EventGame; stats?: Stats }) {
  if (!stats) return null;
  const cooperative = game.game?.type === "COOP";
  const role = game.result_type === "ROLE";
  const text = cooperative ? `성공 ${number(stats.success_rate)}%` : role
    ? `선 ${number(stats.good_rate)}% · 악 ${number(stats.evil_rate)}%`
    : `평균 ${number(stats.average_score)} · 최고 ${number(stats.high_score)}`;
  const count = cooperative ? stats.coop_count : role ? stats.role_count : stats.score_count;
  const detail = cooperative ? "완료된 판 기준 · 반협력은 플레이어 팀의 성공률" : role
    ? "선·악 진영으로 구분되는 완료된 판 기준 (인원수와 무관하게 한 판씩 집계)"
    : "전체 멤버의 저장된 점수 기준 · GM과 점수 없는 기록 제외";
  return <span className="ml-2 text-[10px] font-normal text-zinc-400" title={`${detail} · ${count}${role || cooperative ? "판" : "건"}`}>
    {count ? text : "기록 없음"}
  </span>;
}
