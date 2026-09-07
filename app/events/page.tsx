"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { createClient } from "@/lib/supabase/client";
import { formatEventLocation } from "@/lib/events/location";
import { getEventGuideSummary } from "@/lib/events/guide";

type EventParticipant = { id: string; user_id: string };
type EventRow = {
  id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  location: string | null;
  description: string | null;
  created_by: string;
  max_participants: number | null;
  participation_fee: number | null;
  event_kind: "BOARDGAME" | "MURDER_MYSTERY" | "CLOCKTOWER" | "GENERAL";
  event_status: "OPEN" | "CLOSED" | "CANCELLED";
  murder_mysteries: { title: string } | { title: string }[] | null;
  event_participants: EventParticipant[] | null;
};

type DateFilter = "all" | "week" | "month" | "next-month";
type StatusFilter = "all" | "upcoming" | "ongoing" | "cancelled";
type EventKindFilter = "all" | "GENERAL" | "BOARDGAME" | "MURDER_MYSTERY" | "CLOCKTOWER";
type MyEventFilter = "all" | "joined" | "waitlisted" | "created";

function EventDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return <dialog ref={ref} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}
    className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto overscroll-contain rounded-3xl border border-white/15 bg-zinc-950 p-0 text-white shadow-2xl backdrop:bg-black/75">
    <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/10 bg-zinc-950 px-5 py-4 sm:px-7">
      <h2 id={titleId} className="text-xl font-bold">{title}</h2>
      <button type="button" autoFocus onClick={onClose} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10">닫기</button>
    </div>
    <div className="p-5 sm:p-7">{children}</div>
  </dialog>;
}

function KindFilterDialog({ value, date, onApply, onClose }: { value: EventKindFilter; date: string; onApply: (kind: EventKindFilter, date: string) => void; onClose: () => void }) {
  const [selectedKind, setSelectedKind] = useState(value);
  const [selectedDate, setSelectedDate] = useState(date);
  const dateId = useId();

  return <EventDialog title="이벤트 필터" onClose={onClose}>
    <p className="mb-3 text-sm font-semibold text-zinc-300">이벤트 종류</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {(["all", "MURDER_MYSTERY", "BOARDGAME", "GENERAL", "CLOCKTOWER"] as const).map((kind) =>
        <button type="button" key={kind} aria-pressed={selectedKind === kind} onClick={() => setSelectedKind(kind)}
          className={`rounded-2xl border px-5 py-4 text-left font-semibold ${selectedKind === kind ? "border-amber-400 bg-amber-400 text-zinc-950" : "border-white/15 bg-white/5 hover:border-amber-400/50"}`}>
          {kind === "all" ? "전체 종류" : getKindMeta(kind).label}
        </button>)}
    </div>
    <div className="mt-6 border-t border-white/10 pt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <label htmlFor={dateId} className="text-sm font-semibold text-zinc-300">진행 날짜</label>
        <button type="button" onClick={() => setSelectedDate("")} className="text-sm text-zinc-400 hover:text-amber-300">전체 날짜</button>
      </div>
      <input id={dateId} type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}
        className="min-w-0 w-full rounded-2xl border border-white/15 bg-zinc-900 px-4 py-3 text-white outline-none [color-scheme:dark] focus:border-amber-400" />
      <p className="mt-2 text-xs leading-5 text-zinc-400">달력에서 날짜를 선택하면 그날 진행된 이벤트를 확인할 수 있습니다. (한국 시간 기준)</p>
    </div>
    <div className="mt-6 flex gap-3">
      <button type="button" onClick={() => { setSelectedKind("all"); setSelectedDate(""); }} className="rounded-2xl border border-white/15 px-5 py-3 text-sm text-zinc-300 hover:bg-white/5">초기화</button>
      <button type="button" onClick={() => { onApply(selectedKind, selectedDate); onClose(); }} className="flex-1 rounded-2xl bg-amber-400 px-5 py-3 font-semibold text-zinc-950 hover:bg-amber-300">필터 적용</button>
    </div>
  </EventDialog>;
}

function newestFirst(a: EventRow, b: EventRow) {
  return new Date(b.started_at).getTime() - new Date(a.started_at).getTime() || a.id.localeCompare(b.id);
}

function onSelectedDate(event: Pick<EventRow, "started_at" | "ended_at">, date: string) {
  if (!date) return true;
  const dayStart = new Date(`${date}T00:00:00+09:00`).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const start = new Date(event.started_at).getTime();
  const end = event.ended_at ? new Date(event.ended_at).getTime() : start;
  return start < dayEnd && (start >= dayStart || end > dayStart);
}

function getKindMeta(kind: EventRow["event_kind"]) {
  if (kind === "GENERAL") return { label: "일반 이벤트", className: "bg-sky-400/10 text-sky-300" };
  if (kind === "MURDER_MYSTERY") return { label: "머더미스터리", className: "bg-red-400/10 text-red-300" };
  if (kind === "CLOCKTOWER") return { label: "시계탑에 흐른 피", className: "bg-violet-400/10 text-violet-300" };
  return { label: "보드게임", className: "bg-amber-400/10 text-amber-300" };
}

function getMysteryTitle(value: EventRow["murder_mysteries"]) {
  return Array.isArray(value) ? value[0]?.title ?? null : value?.title ?? null;
}

function renderEventTitle(event: Pick<EventRow, "title" | "event_kind">) {
  const matched = event.title.match(/^(\[[^\]]+\])\s*(.*)$/);
  if (!matched) return event.title;
  const [, prefix, rest] = matched;
  const presentation = event.event_kind === "MURDER_MYSTERY"
    ? { icon: "🎭", color: "text-red-400" }
    : event.event_kind === "CLOCKTOWER"
      ? { icon: "🕰️", color: "text-violet-400" }
      : event.event_kind === "BOARDGAME"
        ? { icon: "🎲", color: "text-amber-400" }
        : { icon: "", color: "text-sky-400" };
  return <><span aria-hidden="true" className="mr-2">{presentation.icon}</span><span className={presentation.color}>{prefix}</span>{rest && <span> {rest}</span>}</>;
}

function getStatus(event: EventRow): "예정" | "진행 중" | "종료" | "취소됨" {
  if (event.event_status === "CANCELLED") return "취소됨";
  const now = Date.now();
  const start = new Date(event.started_at).getTime();
  const end = event.ended_at ? new Date(event.ended_at).getTime() : null;
  if (end && now > end) return "종료";
  if (now >= start && (!end || now <= end)) return "진행 중";
  return "예정";
}

function statusStyle(status: ReturnType<typeof getStatus>) {
  if (status === "취소됨") return "bg-red-400/15 text-red-300";
  if (status === "진행 중") return "bg-emerald-400/10 text-emerald-300";
  if (status === "예정") return "bg-amber-400/10 text-amber-300";
  return "bg-zinc-400/10 text-zinc-400";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(value)).replaceAll(". ", ".").replace(/\.$/, "");
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { weekday: "long" }).format(new Date(value));
}

function formatTimeRange(startedAt: string, endedAt: string | null) {
  const formatter = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const start = formatter.format(new Date(startedAt));
  return endedAt ? `${start}–${formatter.format(new Date(endedAt))}` : start;
}

function startOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function endOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999); }
function startOfWeek(date: Date) {
  const result = startOfDay(date);
  result.setDate(result.getDate() + (result.getDay() === 0 ? -6 : 1 - result.getDay()));
  return result;
}
function endOfWeek(date: Date) { const result = startOfWeek(date); result.setDate(result.getDate() + 6); return endOfDay(result); }

function inDateRange(event: EventRow, filter: DateFilter) {
  if (filter === "all") return true;
  const now = new Date();
  const date = new Date(event.started_at);
  if (filter === "week") return date >= startOfWeek(now) && date <= endOfWeek(now);
  if (filter === "month") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return date.getFullYear() === next.getFullYear() && date.getMonth() === next.getMonth();
}

export default function EventsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [waitlistedIds, setWaitlistedIds] = useState<Set<string>>(new Set());
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [kindFilter, setKindFilter] = useState<EventKindFilter>("all");
  const [selectedDate, setSelectedDate] = useState("");
  const [endedSelectedDate, setEndedSelectedDate] = useState("");
  const [myFilter, setMyFilter] = useState<MyEventFilter>("all");
  const [showEnded, setShowEnded] = useState(false);
  const [showKindFilter, setShowKindFilter] = useState(false);
  const [showEndedKindFilter, setShowEndedKindFilter] = useState(false);
  const [endedKindFilter, setEndedKindFilter] = useState<EventKindFilter>("all");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData.user?.id ?? null;
      const [eventResult, waitlistResult] = await Promise.all([
        supabase.from("events").select(`id,title,started_at,ended_at,location,description,created_by,max_participants,participation_fee,event_kind,event_status,murder_mysteries(title),event_participants(id,user_id)`).order("started_at", { ascending: true }),
        currentUserId
          ? supabase.from("event_waitlist").select("event_id").eq("user_id", currentUserId)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (!active) return;
      setUserId(currentUserId);
      if (eventResult.error) {
        console.error("이벤트 목록 조회 오류:", eventResult.error);
        setErrorMessage("이벤트 목록을 불러오지 못했습니다.");
        setEvents([]);
      } else {
        setEvents((eventResult.data ?? []) as EventRow[]);
      }
      if (waitlistResult.error) console.error("대기 목록 조회 오류:", waitlistResult.error);
      setWaitlistedIds(new Set((waitlistResult.data ?? []).map((row: { event_id: string }) => row.event_id)));
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [supabase]);

  const counts = useMemo(() => ({
    joined: events.filter((event) => event.event_participants?.some((p) => p.user_id === userId)).length,
    waitlisted: events.filter((event) => waitlistedIds.has(event.id)).length,
    created: events.filter((event) => event.created_by === userId).length,
  }), [events, userId, waitlistedIds]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const status = getStatus(event);
      if (status === "종료") return false;
      if (statusFilter === "upcoming" && status !== "예정") return false;
      if (statusFilter === "ongoing" && status !== "진행 중") return false;
      if (statusFilter === "cancelled" && status !== "취소됨") return false;
      if (selectedDate ? !onSelectedDate(event, selectedDate) : !inDateRange(event, dateFilter)) return false;
      if (kindFilter !== "all" && event.event_kind !== kindFilter) return false;
      const joined = event.event_participants?.some((p) => p.user_id === userId) ?? false;
      if (myFilter === "joined" && !joined) return false;
      if (myFilter === "waitlisted" && !waitlistedIds.has(event.id)) return false;
      if (myFilter === "created" && event.created_by !== userId) return false;
      return true;
    }).sort(newestFirst);
  }, [dateFilter, events, kindFilter, myFilter, selectedDate, statusFilter, userId, waitlistedIds]);

  const endedEvents = useMemo(() => events.filter((event) => getStatus(event) === "종료"
    && onSelectedDate(event, endedSelectedDate)
    && (endedKindFilter === "all" || event.event_kind === endedKindFilter)).sort(newestFirst), [events, endedKindFilter, endedSelectedDate]);

  const selectClass = "min-w-0 rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-300 outline-none focus:border-amber-400/60";

  return <main className="min-h-screen bg-zinc-950 text-white">
    <section className="border-b border-white/10"><div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 sm:py-20">
      <div className="flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between"><div>
        <p className="text-sm font-semibold tracking-[0.3em] text-amber-400">EVENTS</p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">이벤트 일정</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">참여할 이벤트와 내가 만든 이벤트를 한눈에 확인하세요.</p>
      </div><Link href="/events/new" className="inline-flex justify-center rounded-2xl bg-amber-400 px-6 py-3 font-semibold text-zinc-950 hover:bg-amber-300">이벤트 만들기</Link></div>
    </div></section>

    <section className="mx-auto max-w-7xl px-5 py-10 sm:px-6 sm:py-16">
      {userId && <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([ ["all", "전체", events.length], ["joined", "참가 중", counts.joined], ["waitlisted", "대기 중", counts.waitlisted], ["created", "내가 만든", counts.created] ] as const).map(([value, label, count]) =>
          <button key={value} onClick={() => setMyFilter(value)} className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition ${myFilter === value ? "border-amber-400 bg-amber-400 text-zinc-950" : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-amber-400/40"}`}>{label} <span className="ml-1 opacity-70">{count}</span></button>)}
      </div>}

      <div className="mb-5 grid grid-cols-2 gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4 lg:grid-cols-5">
        <button type="button" aria-haspopup="dialog" onClick={() => setShowKindFilter(true)} className={selectClass}>필터 · {kindFilter === "all" ? "전체 종류" : getKindMeta(kindFilter).label}</button>
        <select aria-label="일정 기간" value={selectedDate ? "selected" : dateFilter} onChange={(e) => { setSelectedDate(""); setDateFilter(e.target.value as DateFilter); }} className={selectClass}>{selectedDate && <option value="selected" disabled>{selectedDate}</option>}<option value="all">전체 일정</option><option value="week">이번 주</option><option value="month">이번 달</option><option value="next-month">다음 달</option></select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className={selectClass}><option value="all">예정·진행</option><option value="upcoming">예정</option><option value="ongoing">진행 중</option><option value="cancelled">취소됨</option></select>
        <p className="flex items-center justify-center px-4 py-3 text-sm text-zinc-400">개최일 최신순 ↓</p>
        <button type="button" aria-haspopup="dialog" onClick={() => setShowEnded(true)} className="col-span-2 rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-300 hover:border-amber-400/60 lg:col-span-1">종료 이벤트 표시</button>
      </div>

      <div className="mb-5 flex items-center justify-between"><p className="text-sm text-zinc-400">표시된 이벤트 <span className="font-semibold text-amber-400">{filteredEvents.length}</span>개</p><button onClick={() => { setDateFilter("all"); setSelectedDate(""); setStatusFilter("all"); setKindFilter("all"); setMyFilter("all"); }} className="text-xs text-zinc-500 hover:text-zinc-200">필터 초기화</button></div>
      {selectedDate && <p className="mb-5 text-sm text-zinc-400">{selectedDate}의 지난 이벤트는 <button type="button" onClick={() => { setEndedSelectedDate(selectedDate); setEndedKindFilter(kindFilter); setShowEnded(true); }} className="text-amber-300 underline underline-offset-4">종료 이벤트에서 보기</button></p>}

      {loading ? <div className="space-y-5">{[1,2,3].map((n) => <div key={n} className="h-48 animate-pulse rounded-3xl border border-white/10 bg-white/[0.03]" />)}</div>
      : errorMessage ? <div className="rounded-3xl border border-red-400/20 bg-red-400/5 px-6 py-14 text-center text-red-300">{errorMessage}</div>
      : filteredEvents.length === 0 ? <div className="rounded-3xl border border-dashed border-white/15 px-6 py-16 text-center"><p className="text-xl font-semibold">조건에 맞는 이벤트가 없습니다.</p><p className="mt-3 text-sm text-zinc-500">필터를 변경하거나 새로운 이벤트를 만들어보세요.</p></div>
      : <div className="space-y-5">{filteredEvents.map((event) => {
        const status = getStatus(event);
        const kind = getKindMeta(event.event_kind ?? "BOARDGAME");
        const joined = event.event_participants?.some((p) => p.user_id === userId) ?? false;
        const waitlisted = waitlistedIds.has(event.id);
        const created = event.created_by === userId;
        const mysteryTitle = getMysteryTitle(event.murder_mysteries);
        return <article key={event.id} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] transition hover:border-amber-400/30">
          <div className="grid lg:grid-cols-[180px_1fr_190px]">
            <div className="border-b border-white/10 p-6 lg:border-b-0 lg:border-r"><p className="text-base font-bold text-amber-400">{formatDate(event.started_at)}</p><p className="mt-2 text-3xl font-black tracking-tight">{formatDay(event.started_at)}</p><p className="mt-2 text-base font-semibold text-zinc-300">{formatTimeRange(event.started_at, event.ended_at)}</p></div>
            <div className="p-6"><div className="flex flex-wrap gap-2"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${kind.className}`}>{kind.label}</span><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(status)}`}>{status}</span>{joined && <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">참가 중</span>}{waitlisted && <span className="rounded-full bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-300">대기 중</span>}{created && <span className="rounded-full bg-violet-400/10 px-3 py-1 text-xs font-semibold text-violet-300">내가 만든 이벤트</span>}</div>
              <h2 className="mt-4 text-2xl font-bold">{renderEventTitle(event)}</h2>{event.event_kind === "MURDER_MYSTERY" && mysteryTitle && <p className="mt-2 text-sm font-semibold text-red-300">진행 작품 · {mysteryTitle}</p>}<p className="mt-3 line-clamp-2 leading-7 text-zinc-400">{getEventGuideSummary(event)}</p><div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-400"><p>장소 <span className="text-zinc-200">{formatEventLocation(event.location)}</span></p><p>참여 <span className="text-zinc-200">{event.event_participants?.length ?? 0}명 / {event.max_participants ?? "무제한"}</span></p></div>
            </div>
            <div className="flex items-center border-t border-white/10 p-6 lg:border-l lg:border-t-0"><Link href={`/events/${event.id}`} className="w-full rounded-2xl bg-amber-400 px-5 py-3 text-center font-semibold text-zinc-950 hover:bg-amber-300">상세 보기</Link></div>
          </div></article>;
      })}</div>}
    </section>
    {showKindFilter && <KindFilterDialog value={kindFilter} date={selectedDate} onApply={(kind, date) => { setKindFilter(kind); setSelectedDate(date); setDateFilter("all"); }} onClose={() => setShowKindFilter(false)} />}
    {showEnded && <EventDialog title="종료 이벤트" onClose={() => setShowEnded(false)}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">총 <span className="font-semibold text-amber-400">{endedEvents.length}</span>개 · 개최일 최신순</p>
        <button type="button" aria-haspopup="dialog" onClick={() => setShowEndedKindFilter(true)} className={selectClass}>필터 · {endedKindFilter === "all" ? "전체 종류" : getKindMeta(endedKindFilter).label}</button>
      </div>
      {endedSelectedDate && <div className="mb-5 flex flex-wrap items-center gap-3 text-sm"><span className="text-amber-300">진행 날짜 · {endedSelectedDate}</span><button type="button" onClick={() => setEndedSelectedDate("")} className="text-zinc-400 hover:text-white">날짜 해제</button></div>}
      {loading ? <p role="status" className="py-12 text-center text-zinc-400">이벤트를 불러오는 중입니다.</p>
        : errorMessage ? <p role="alert" className="py-12 text-center text-red-300">{errorMessage}</p>
        : endedEvents.length === 0 ? <p className="py-12 text-center text-zinc-400">조건에 맞는 종료 이벤트가 없습니다.</p>
        : <ul className="space-y-3">{endedEvents.map((event) => {
          const kind = getKindMeta(event.event_kind);
          return <li key={event.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-3 py-1 font-semibold ${kind.className}`}>{kind.label}</span><span className="text-zinc-500">종료</span></div>
            <h3 className="mt-3 break-words text-lg font-bold"><Link href={`/events/${event.id}`} className="hover:text-amber-300">{renderEventTitle(event)}</Link></h3>
            <p className="mt-2 text-sm text-zinc-400">{formatDate(event.started_at)} · {formatDay(event.started_at)} · {formatTimeRange(event.started_at, event.ended_at)}</p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-zinc-400">{formatEventLocation(event.location)}</p><Link href={`/events/${event.id}`} className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300">상세 보기</Link></div>
          </li>;
        })}</ul>}
      {showEndedKindFilter && <KindFilterDialog value={endedKindFilter} date={endedSelectedDate} onApply={(kind, date) => { setEndedKindFilter(kind); setEndedSelectedDate(date); }} onClose={() => setShowEndedKindFilter(false)} />}
    </EventDialog>}
  </main>;
}
