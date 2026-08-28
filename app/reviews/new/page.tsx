"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ResultRow = { round_id: string; score: number | null; rank: number | null; role_name: string | null; team_name: string | null; is_winner: boolean | null };
type RoundRow = { id: string; session_id: string; round_number: number; created_at: string };
type SessionRow = { id: string; event_id: string; game_id: string; games: { name: string } | { name: string }[] | null };
type EventRow = { id: string; title: string; started_at: string };
type Play = ResultRow & { roundId: string; gameId: string; gameName: string; eventId: string; eventTitle: string; eventDate: string; roundNumber: number; playedAt: string; playNumber: number; reviewNumber: number; totalPlays: number };

function one<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] ?? null : value; }
function dateText(value: string) { return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value)); }
function resultText(play: Play) {
  const details = [play.score !== null ? `${play.score}점` : null, play.rank !== null ? `${play.rank}등` : null, play.is_winner !== null ? (play.is_winner ? "승리" : "패배") : null, play.role_name, play.team_name].filter(Boolean);
  return details.length ? details.join(" · ") : "결과 입력 없음";
}

export default function NewReviewPage() {
  const supabase = useMemo(() => createClient(), []);
  const [plays, setPlays] = useState<Play[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true); setError("");
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) { setError("로그인 후 평가를 작성할 수 있습니다."); return; }
        const { data: resultData, error: resultError } = await supabase.from("event_round_players").select("round_id, score, rank, role_name, team_name, is_winner").eq("user_id", user.id);
        if (resultError) throw resultError;
        const results = (resultData ?? []) as ResultRow[];
        if (!results.length) { if (active) setPlays([]); return; }
        const { data: roundData, error: roundError } = await supabase.from("event_game_rounds").select("id, session_id, round_number, created_at").in("id", results.map(row => row.round_id));
        if (roundError) throw roundError;
        const rounds = (roundData ?? []) as RoundRow[];
        const { data: sessionData, error: sessionError } = await supabase.from("event_game_sessions").select("id, event_id, game_id, games(name)").in("id", [...new Set(rounds.map(row => row.session_id))]);
        if (sessionError) throw sessionError;
        const sessions = (sessionData ?? []) as unknown as SessionRow[];
        const eventIds = [...new Set(sessions.map(row => row.event_id))];
        const gameIds = [...new Set(sessions.map(row => row.game_id))];
        const [{ data: eventData, error: eventError }, { data: reviewData, error: reviewError }] = await Promise.all([
          supabase.from("events").select("id, title, started_at").in("id", eventIds),
          supabase.from("game_reviews").select("round_id, game_id").eq("user_id", user.id).in("game_id", gameIds),
        ]);
        if (eventError) throw eventError;
        if (reviewError) throw reviewError;
        const reviewedRounds = new Set((reviewData ?? []).map(row => row.round_id).filter(Boolean));
        const reviewedByGame = new Map<string, number>();
        (reviewData ?? []).forEach(row => { if (row.round_id) reviewedByGame.set(row.game_id, (reviewedByGame.get(row.game_id) ?? 0) + 1); });
        const roundMap = new Map(rounds.map(row => [row.id, row]));
        const sessionMap = new Map(sessions.map(row => [row.id, row]));
        const eventMap = new Map(((eventData ?? []) as EventRow[]).map(row => [row.id, row]));
        const all = results.flatMap(result => {
          const round = roundMap.get(result.round_id); const session = round ? sessionMap.get(round.session_id) : null; const event = session ? eventMap.get(session.event_id) : null; const game = session ? one(session.games) : null;
          if (!round || !session || !event || !game) return [];
          return [{ ...result, roundId: round.id, gameId: session.game_id, gameName: game.name, eventId: event.id, eventTitle: event.title, eventDate: event.started_at, roundNumber: round.round_number, playedAt: round.created_at }];
        }).sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime());
        const counts = new Map<string, number>(); const totals = new Map<string, number>();
        all.forEach(play => totals.set(play.gameId, (totals.get(play.gameId) ?? 0) + 1));
        const numbered = all.map(play => { const n = (counts.get(play.gameId) ?? 0) + 1; counts.set(play.gameId, n); return { ...play, playNumber: n, totalPlays: totals.get(play.gameId) ?? n, reviewNumber: (reviewedByGame.get(play.gameId) ?? 0) + 1 }; });
        if (active) setPlays(numbered.filter(play => !reviewedRounds.has(play.roundId)).reverse());
      } catch (cause) { console.error(cause); if (active) setError(cause instanceof Error ? cause.message : "평가할 플레이 기록을 불러오지 못했습니다."); }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [supabase]);

  async function save(play: Play) {
    try {
      setSaving(play.roundId);
      const rating = ratings[play.roundId] ?? 0;
      if (!rating) throw new Error("별점을 선택해 주세요.");
      const { error: saveError } = await supabase.rpc("save_event_play_review", { p_round_id: play.roundId, p_rating: rating, p_content: comments[play.roundId]?.trim() || null });
      if (saveError) throw saveError;
      setPlays(current => current.filter(item => item.roundId !== play.roundId));
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : typeof cause === "object" &&
              cause !== null &&
              "message" in cause &&
              typeof cause.message === "string"
            ? cause.message
            : "평가를 저장하지 못했습니다.";
      console.error("평가 저장 실패", cause);
      alert(`평가를 저장하지 못했습니다.\n${message}`);
    }
    finally { setSaving(null); }
  }

  return <main className="min-h-screen bg-zinc-950 text-white"><section className="mx-auto max-w-5xl px-5 py-14 sm:px-6 sm:py-20">
    <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-sm font-semibold tracking-[0.3em] text-amber-400">WRITE A REVIEW</p><h1 className="mt-3 text-4xl font-bold">플레이 평가 작성</h1><p className="mt-4 text-zinc-400">이벤트에서 본인이 실제로 참여한 게임만 평가할 수 있습니다.</p></div><Link href="/reviews" className="rounded-xl border border-white/10 px-5 py-3 text-sm text-zinc-300">평가 목록으로</Link></div>
    {loading ? <div className="mt-10 h-48 animate-pulse rounded-3xl bg-white/[0.04]"/> : error ? <div className="mt-10 rounded-3xl border border-red-400/20 bg-red-400/[0.05] p-6 text-red-300">{error}</div> : plays.length === 0 ? <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.025] px-6 py-20 text-center"><p className="text-xl font-bold text-zinc-200">새로 플레이한 게임이 없습니다</p><p className="mt-3 text-sm text-zinc-500">이벤트에서 새 게임을 플레이하면 이곳에 자동으로 표시됩니다.</p></div> : <div className="mt-10 space-y-5">{plays.map(play => <article key={play.roundId} className="rounded-3xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm text-amber-300">{dateText(play.eventDate)} · {play.roundNumber}판</p><h2 className="mt-2 text-2xl font-bold">{play.gameName}</h2><Link href={`/events/${play.eventId}`} className="mt-2 inline-block text-sm text-zinc-400 hover:text-white">{play.eventTitle} →</Link></div><div className="rounded-2xl bg-white/[0.05] px-4 py-3 text-sm"><b className="text-emerald-300">{resultText(play)}</b><p className="mt-1 text-zinc-500">총 {play.totalPlays}회 플레이 · 이번은 {play.playNumber}번째 플레이</p><p className="text-zinc-500">작성하면 {play.reviewNumber}번째 평가</p></div></div>
      <div className="mt-6 flex gap-1" aria-label="별점 선택">{[1,2,3,4,5].map(n => <button type="button" key={n} onClick={() => setRatings(value => ({ ...value, [play.roundId]: n }))} className={`text-4xl ${n <= (ratings[play.roundId] ?? 0) ? "text-amber-400" : "text-zinc-700"}`} aria-label={`${n}점`}>★</button>)}</div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row"><input value={comments[play.roundId] ?? ""} onChange={event => setComments(value => ({ ...value, [play.roundId]: event.target.value }))} maxLength={200} placeholder="한줄평을 남겨주세요. (선택)" className="h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-900 px-4 outline-none focus:border-amber-400/60"/><button onClick={() => void save(play)} disabled={saving === play.roundId} className="h-12 rounded-xl bg-amber-400 px-7 font-bold text-zinc-950 disabled:opacity-50">{saving === play.roundId ? "저장 중..." : "평가 저장"}</button></div>
    </article>)}</div>}
  </section></main>;
}
