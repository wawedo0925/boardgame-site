"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type Game = { id: string; name: string; publisher: string | null; type: "SCORE" | "SIMPLE_SCORE" | "ROLE" | null };
type Ranking = { member_id: string; activity_name: string; play_count: number; first_place_count: number; average_rank: number | null; best_score: number | null; average_score: number | null; role_wins: number; role_losses: number; role_win_rate: number | null };
type MyGame = { game_id: string; game_name: string; game_type: Game["type"]; play_count: number; last_played_at: string; official_rank: number | null };
const MIN_PLAYS = 3;

function typeLabel(type: Game["type"]) {
  if (type === "ROLE") return "역할형";
  if (type === "SIMPLE_SCORE") return "등수형";
  return "점수형";
}

function orderRows(rows: Ranking[], type: Game["type"]) {
  return [...rows].sort((a, b) => {
    if (type === "ROLE") return (b.role_win_rate ?? -1) - (a.role_win_rate ?? -1) || b.role_wins - a.role_wins || b.play_count - a.play_count;
    if (type === "SIMPLE_SCORE") return b.first_place_count - a.first_place_count || (a.average_rank ?? 999) - (b.average_rank ?? 999) || b.play_count - a.play_count;
    return (b.average_score ?? -Infinity) - (a.average_score ?? -Infinity) || (b.best_score ?? -Infinity) - (a.best_score ?? -Infinity) || b.play_count - a.play_count;
  });
}

function sameRank(a: Ranking, b: Ranking, type: Game["type"]) {
  if (type === "ROLE") return a.role_win_rate === b.role_win_rate && a.role_wins === b.role_wins;
  if (type === "SIMPLE_SCORE") return a.first_place_count === b.first_place_count && a.average_rank === b.average_rank;
  return a.average_score === b.average_score && a.best_score === b.best_score;
}

function mainResult(row: Ranking, type: Game["type"]) {
  if (type === "ROLE") return row.role_win_rate === null ? "-" : `${row.role_win_rate}%`;
  if (type === "SIMPLE_SCORE") return `${row.first_place_count}회 우승`;
  return row.average_score === null ? "-" : `평균 ${row.average_score}점`;
}

function subResult(row: Ranking, type: Game["type"]) {
  if (type === "ROLE") return `${row.role_wins}승 ${row.role_losses}패`;
  if (type === "SIMPLE_SCORE") return row.average_rank === null ? "평균 순위 -" : `평균 ${row.average_rank}등`;
  return row.best_score === null ? "최고 점수 -" : `최고 ${row.best_score}점`;
}

export default function GameRankingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [myGames, setMyGames] = useState<MyGame[]>([]);
  const [showAllMyGames, setShowAllMyGames] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Game | null>(null);
  const [rows, setRows] = useState<Ranking[]>([]);
  const [loadingGames, setLoadingGames] = useState(true);
  const [loadingRanking, setLoadingRanking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadGames() {
      const [{ data: { user: currentUser } }, { data, error: gamesError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("games").select("id, name, publisher, type").order("name", { ascending: true }).limit(300),
      ]);
      if (!active) return;
      setUser(currentUser);
      if (gamesError) setError("게임 목록을 불러오지 못했습니다.");
      else setGames((data ?? []) as Game[]);
      if (currentUser) {
        const { data: myGameData, error: myGameError } = await supabase.rpc("get_my_ranked_games");
        if (myGameError) console.error("내 랭킹 게임 조회 오류:", myGameError);
        else if (active) setMyGames(((myGameData ?? []) as MyGame[]).map((row) => ({
          ...row,
          play_count: Number(row.play_count),
          official_rank: row.official_rank === null ? null : Number(row.official_rank),
        })) as MyGame[]);
      }
      setLoadingGames(false);
    }
    void loadGames();
    return () => { active = false; };
  }, [supabase]);

  async function chooseGame(game: Game) {
    try {
      setSelected(game);
      setLoadingRanking(true);
      setError("");
      const { data, error: rankingError } = await supabase.rpc("get_game_rankings", { p_game_id: game.id });
      if (rankingError) throw rankingError;
      setRows(((data ?? []) as Ranking[]).map((row) => ({ ...row, play_count: Number(row.play_count), first_place_count: Number(row.first_place_count), role_wins: Number(row.role_wins), role_losses: Number(row.role_losses), average_rank: row.average_rank === null ? null : Number(row.average_rank), best_score: row.best_score === null ? null : Number(row.best_score), average_score: row.average_score === null ? null : Number(row.average_score), role_win_rate: row.role_win_rate === null ? null : Number(row.role_win_rate) })));
    } catch (rankingLoadError) {
      console.error("게임별 랭킹 조회 오류:", rankingLoadError);
      setError("게임별 랭킹을 불러오지 못했습니다. Feature 13 SQL이 적용되었는지 확인해 주세요.");
      setRows([]);
    } finally { setLoadingRanking(false); }
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredGames = normalizedQuery
    ? games.filter(game => `${game.name} ${game.publisher || ""}`.toLocaleLowerCase().includes(normalizedQuery)).slice(0, 12)
    : [];
  const official = selected ? orderRows(rows.filter(row => row.play_count >= MIN_PLAYS), selected.type) : [];
  const collecting = rows.filter(row => row.play_count < MIN_PLAYS).sort((a, b) => b.play_count - a.play_count);
  const visibleMyGames = showAllMyGames ? myGames : myGames.slice(0, 6);
  let prior: Ranking | null = null;
  let priorRank = 0;

  return <main className="min-h-screen bg-zinc-950 text-white"><section className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
    <div><p className="text-sm font-semibold tracking-[0.2em] text-amber-300">GAME RANKINGS</p><h1 className="mt-2 text-3xl font-bold sm:text-5xl">게임별 랭킹</h1><p className="mt-4 max-w-2xl leading-7 text-zinc-400">전체 게임을 한 순위로 섞지 않고, 선택한 게임 안에서만 기록을 비교합니다. 3판 이상 플레이한 회원부터 정식 순위에 포함됩니다.</p></div>
    <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">{user && <div className="mb-6 border-b border-white/10 pb-6"><div className="flex items-end justify-between gap-3"><div><p className="text-sm font-bold text-emerald-300">내가 플레이한 게임</p><p className="mt-1 text-xs text-zinc-500">최근 플레이 순서입니다. 카드를 누르면 해당 랭킹이 바로 열립니다.</p></div>{myGames.length > 6 && <button onClick={() => setShowAllMyGames(value => !value)} className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300">{showAllMyGames ? "접기" : `전체 ${myGames.length}개`}</button>}</div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{visibleMyGames.map(game => <button key={game.game_id} onClick={() => chooseGame({ id: game.game_id, name: game.game_name, publisher: null, type: game.game_type })} className={`rounded-xl border p-3 text-left transition ${selected?.id === game.game_id ? "border-emerald-400 bg-emerald-400/[0.08]" : "border-white/10 bg-white/[0.025] hover:bg-white/[0.06]"}`}><div className="flex items-start justify-between gap-2"><strong className="truncate">{game.game_name}</strong><span className="shrink-0 text-xs text-emerald-300">{typeLabel(game.game_type)}</span></div><div className="mt-2 flex justify-between text-xs"><span className="text-zinc-500">{game.play_count}판</span><b className={game.official_rank ? "text-amber-300" : "text-zinc-500"}>{game.official_rank ? `현재 ${game.official_rank}위` : `집계 중 ${game.play_count}/3판`}</b></div></button>)}{!loadingGames && !myGames.length && <p className="sm:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-white/10 py-6 text-center text-sm text-zinc-600">결과가 입력된 게임이 생기면 여기에 자동으로 표시됩니다.</p>}</div></div>}<label className="text-sm font-bold text-zinc-300">다른 게임 찾기</label><input value={query} onChange={event => setQuery(event.target.value)} placeholder="게임 이름 또는 출판사 검색" className="mt-3 h-12 w-full rounded-xl border border-white/10 bg-zinc-900 px-4 outline-none focus:border-amber-400"/>
      <div className="mt-4 grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{loadingGames ? <p className="text-sm text-zinc-500">게임을 불러오는 중입니다.</p> : !normalizedQuery ? <p className="sm:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-white/10 py-7 text-center text-sm text-zinc-600">게임 이름이나 출판사를 입력하면 검색 결과가 표시됩니다.</p> : filteredGames.length ? filteredGames.map(game => <button key={game.id} onClick={() => chooseGame(game)} className={`rounded-xl border p-3 text-left transition ${selected?.id === game.id ? "border-amber-400 bg-amber-400/[0.08]" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"}`}><div className="flex items-start justify-between gap-2"><strong>{game.name}</strong><span className="shrink-0 text-xs text-amber-300">{typeLabel(game.type)}</span></div><p className="mt-1 truncate text-xs text-zinc-600">{game.publisher || "출판사 미등록"}</p></button>) : <p className="sm:col-span-2 lg:col-span-3 py-7 text-center text-sm text-zinc-600">일치하는 게임이 없습니다.</p>}</div>
    </section>
    {error && <p className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-4 text-sm text-red-300">{error}</p>}
    {selected && <section className="mt-6 rounded-3xl border border-amber-400/20 bg-amber-400/[0.035] p-5 sm:p-7"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-amber-300">{typeLabel(selected.type)} RANKING</p><h2 className="mt-1 text-2xl font-bold">{selected.name}</h2></div><p className="text-sm text-zinc-500">정식 랭킹 {official.length}명 · 집계 중 {collecting.length}명</p></div>
      {loadingRanking ? <div className="mt-5 h-56 animate-pulse rounded-2xl bg-white/[0.04]"/> : <><div className="mt-5 overflow-hidden rounded-2xl border border-white/10">{official.map((row, index) => { const rank = prior && sameRank(prior, row, selected.type) ? priorRank : index + 1; prior = row; priorRank = rank; const mine = row.member_id === user?.id; return <Link key={row.member_id} href={`/members/${row.member_id}`} className={`grid min-h-20 grid-cols-[48px_1fr_auto] items-center gap-3 border-b border-white/10 px-4 last:border-0 ${mine ? "bg-amber-400/[0.09]" : "hover:bg-white/[0.04]"}`}><span className={`text-xl font-black ${rank <= 3 ? "text-amber-300" : "text-zinc-600"}`}>{rank}</span><div className="min-w-0"><p className="truncate font-bold">{row.activity_name}{mine && <span className="ml-2 text-xs text-amber-300">나</span>}</p><p className="mt-1 text-xs text-zinc-500">{row.play_count}판 · {subResult(row, selected.type)}</p></div><strong className="text-right text-amber-300">{mainResult(row, selected.type)}</strong></Link>; })}{!official.length && <p className="py-12 text-center text-sm text-zinc-600">아직 3판 이상 플레이한 회원이 없습니다.</p>}</div>
      {collecting.length > 0 && <div className="mt-5"><h3 className="text-sm font-bold text-zinc-400">기록 집계 중 · 3판 미만</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{collecting.map(row => <Link key={row.member_id} href={`/members/${row.member_id}`} className="flex justify-between rounded-xl bg-white/[0.03] px-3 py-3 text-sm"><span>{row.activity_name}</span><span className="text-zinc-500">{row.play_count}/3판</span></Link>)}</div></div>}</>}
    </section>}
  </section></main>;
}
