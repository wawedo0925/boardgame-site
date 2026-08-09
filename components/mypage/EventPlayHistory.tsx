"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type EventRow = { id: string; title: string; started_at: string; event_status: "OPEN" | "CLOSED" | null; attendance_status?: "REGISTERED" | "PRESENT" | "ABSENT" };
type JoinedRow = { event_id: string; attendance_status: EventRow["attendance_status"] };
type SessionRow = { id: string; event_id: string; game_id: string; result_type: "SCORE" | "SIMPLE_SCORE" | "ROLE" | null; games: { id: string; name: string } | { id: string; name: string }[] | null };
type RoundRow = { id: string; session_id: string; round_number: number; created_at: string };
type ResultRow = { id: string; round_id: string; score: number | null; rank: number | null; role_name: string | null; team_name: string | null; is_winner: boolean | null };
type PlayItem = ResultRow & { eventId: string; eventTitle: string; eventDate: string; gameId: string; gameName: string; resultType: SessionRow["result_type"]; roundNumber: number; playedAt: string };

function singleGame(value: SessionRow["games"]) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function resultLabel(item: PlayItem) {
  if (item.resultType === "ROLE") {
    if (item.is_winner === null) return "결과 미입력";
    return `${item.role_name || "역할 미정"} · ${item.is_winner ? "승리" : "패배"}`;
  }
  if (item.resultType === "SIMPLE_SCORE") return item.rank ? `${item.rank}등` : "결과 미입력";
  return item.score !== null ? `${item.score}점` : "결과 미입력";
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

export default function EventPlayHistory({ userId }: { userId?: string } = {}) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [plays, setPlays] = useState<PlayItem[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError("");
        let targetUserId = userId;
        if (!targetUserId) {
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError) throw userError;
          targetUserId = user?.id;
        }
        if (!targetUserId) return;

        const { data: joined, error: joinedError } = await supabase.from("event_participants").select("event_id, attendance_status").eq("user_id", targetUserId);
        if (joinedError) throw joinedError;
        const joinedRows = (joined ?? []) as JoinedRow[];
        const eventIds = [...new Set(joinedRows.map(row => row.event_id))];
        if (!eventIds.length) return;

        const [{ data: eventData, error: eventError }, { data: sessionData, error: sessionError }] = await Promise.all([
          supabase.from("events").select("id, title, started_at, event_status").in("id", eventIds).order("started_at", { ascending: false }),
          supabase.from("event_game_sessions").select("id, event_id, game_id, result_type, games(id, name)").in("event_id", eventIds),
        ]);
        if (eventError) throw eventError;
        if (sessionError) throw sessionError;

        const attendanceMap = new Map(joinedRows.map(row => [row.event_id, row.attendance_status]));
        const eventRows = ((eventData ?? []) as EventRow[]).map(event => ({
          ...event,
          attendance_status: attendanceMap.get(event.id),
        }));
        const sessions = (sessionData ?? []) as unknown as SessionRow[];
        if (active) setEvents(eventRows);
        if (!sessions.length) return;

        const { data: roundData, error: roundError } = await supabase.from("event_game_rounds").select("id, session_id, round_number, created_at").in("session_id", sessions.map(session => session.id));
        if (roundError) throw roundError;
        const rounds = (roundData ?? []) as RoundRow[];
        if (!rounds.length) return;

        const { data: resultData, error: resultError } = await supabase.from("event_round_players").select("id, round_id, score, rank, role_name, team_name, is_winner").eq("user_id", targetUserId).in("round_id", rounds.map(round => round.id));
        if (resultError) throw resultError;

        const eventMap = new Map(eventRows.map(event => [event.id, event]));
        const sessionMap = new Map(sessions.map(session => [session.id, session]));
        const roundMap = new Map(rounds.map(round => [round.id, round]));
        const items = ((resultData ?? []) as ResultRow[]).flatMap(result => {
          const round = roundMap.get(result.round_id);
          const session = round ? sessionMap.get(round.session_id) : null;
          const event = session ? eventMap.get(session.event_id) : null;
          const game = session ? singleGame(session.games) : null;
          if (!round || !session || !event || !game) return [];
          return [{ ...result, eventId: event.id, eventTitle: event.title, eventDate: event.started_at, gameId: game.id, gameName: game.name, resultType: session.result_type, roundNumber: round.round_number, playedAt: round.created_at }];
        }).sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
        if (active) setPlays(items);
      } catch (loadError) {
        console.error("마이페이지 이벤트 기록 조회 오류:", loadError);
        if (active) setError("이벤트 플레이 기록을 불러오지 못했습니다.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [supabase, userId]);

  const uniqueGames = new Set(plays.map(play => play.gameId)).size;
  const firstPlaces = plays.filter(play => play.rank === 1).length;
  const roleResults = plays.filter(play => play.resultType === "ROLE" && play.is_winner !== null);
  const roleWins = roleResults.filter(play => play.is_winner).length;
  const gameCounts = new Map<string, { id: string; name: string; count: number }>();
  plays.forEach(play => { const current = gameCounts.get(play.gameId); gameCounts.set(play.gameId, { id: play.gameId, name: play.gameName, count: (current?.count ?? 0) + 1 }); });
  const topGames = [...gameCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko")).slice(0, 5);
  const visiblePlays = showAll ? plays : plays.slice(0, 6);

  return <section className="mt-8 rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.035] p-5 sm:p-8">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold tracking-[0.2em] text-emerald-300">EVENT PLAY HISTORY</p><h2 className="mt-2 text-2xl font-bold">이벤트 플레이 기록</h2><p className="mt-2 text-sm text-zinc-500">이벤트에서 입력된 게임 판과 결과를 자동으로 모았습니다.</p></div><Link href="/events" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5">이벤트 보기</Link></div>
    {loading ? <div className="mt-6 h-40 animate-pulse rounded-2xl bg-white/[0.04]"/> : error ? <p className="mt-6 rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-4 text-sm text-red-300">{error}</p> : <>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5"><Stat label="참여 이벤트" value={`${events.length}개`}/><Stat label="전체 플레이" value={`${plays.length}판`}/><Stat label="플레이 게임" value={`${uniqueGames}종`}/><Stat label="점수형 1등" value={`${firstPlaces}회`}/><Stat label="역할형 승률" value={roleResults.length ? `${Math.round(roleWins / roleResults.length * 100)}%` : "-"}/></div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[0.85fr_1.5fr]">
        <article className="rounded-2xl border border-white/10 bg-zinc-950/40 p-4"><h3 className="font-bold">자주 플레이한 게임</h3><div className="mt-3 space-y-2">{topGames.map((game, index) => <Link key={game.id} href={`/boardgames/${game.id}`} className="flex justify-between rounded-xl bg-white/[0.04] px-3 py-3 text-sm hover:bg-white/[0.08]"><span><b className="mr-2 text-emerald-300">{index + 1}</b>{game.name}</span><strong>{game.count}판</strong></Link>)}{!topGames.length && <p className="py-6 text-center text-sm text-zinc-600">아직 입력된 결과가 없습니다.</p>}</div></article>
        <article className="rounded-2xl border border-white/10 bg-zinc-950/40 p-4"><h3 className="font-bold">최근 플레이</h3><div className="mt-3 space-y-2">{visiblePlays.map(play => <Link key={play.id} href={`/events/${play.eventId}`} className="block rounded-xl bg-white/[0.04] p-3 hover:bg-white/[0.08]"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{play.gameName}</strong><span className="text-xs text-zinc-500">{dateLabel(play.playedAt)} · {play.roundNumber}판</span></div><div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-zinc-400">{play.eventTitle}</span><b className="text-emerald-300">{resultLabel(play)}</b></div></Link>)}{!visiblePlays.length && <p className="py-6 text-center text-sm text-zinc-600">아직 입력된 결과가 없습니다.</p>}</div>{plays.length > 6 && <button onClick={() => setShowAll(value => !value)} className="mt-3 h-11 w-full rounded-xl border border-white/10 text-sm font-semibold text-zinc-300">{showAll ? "접기" : `전체 ${plays.length}판 보기`}</button>}</article>
      </div>
      {events.length > 0 && <div className="mt-5"><h3 className="font-bold">참여한 이벤트</h3><div className="mt-3 flex gap-2 overflow-x-auto pb-2">{events.map(event => <Link key={event.id} href={`/events/${event.id}`} className="min-w-52 rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="flex justify-between gap-2"><strong className="truncate">{event.title}</strong><span className={`shrink-0 text-xs ${event.event_status === "CLOSED" ? "text-emerald-300" : "text-amber-300"}`}>{event.event_status === "CLOSED" ? "마감" : "진행"}</span></div><div className="mt-2 flex items-center justify-between gap-2"><p className="text-xs text-zinc-500">{dateLabel(event.started_at)}</p>{!userId && <span className={`text-xs ${event.attendance_status === "PRESENT" ? "text-emerald-300" : event.attendance_status === "ABSENT" ? "text-red-300" : "text-zinc-600"}`}>{event.attendance_status === "PRESENT" ? "출석" : event.attendance_status === "ABSENT" ? "불참" : "미확인"}</span>}</div></Link>)}</div></div>}
    </>}
  </section>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-zinc-950/50 p-4"><p className="text-xs text-zinc-500">{label}</p><p className="mt-2 text-2xl font-bold text-emerald-300">{value}</p></div>;
}
