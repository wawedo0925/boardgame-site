"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { calendarTitle } from "@/lib/events/calendar";
import { formatEventLocation } from "@/lib/events/location";
import { koreanDay, koreanTime, monthDays, occursOn, shiftMonth } from "@/lib/events/month-calendar";
import { hasHolidayYear, holidayOn } from "@/lib/events/korean-holidays";
import { readGoogleCalendar, type PersonalEvent } from "@/lib/events/read-google-calendar";

type Event = { id: string; title: string; event_kind: string; started_at: string; ended_at: string | null; location: string | null; event_status: string };
type TokenResponse = { access_token?: string; scope?: string; error?: string };
type Google = { accounts: { oauth2: { initTokenClient(options: { client_id: string; scope: string; callback(response: TokenResponse): void; error_callback(): void }): { requestAccessToken(options: { prompt: string }): void } } } };
function monthTitle(kind: string) { return kind === "BOARDGAME" ? "보드겜" : calendarTitle(kind); }
const readScope = "https://www.googleapis.com/auth/calendar.events.readonly";
const clientId = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID ?? "663851688978-ro034m04imdlejkjc51d4f8c17la0ad4.apps.googleusercontent.com";
const colors: Record<string, string> = { BOARDGAME: "text-amber-300 bg-amber-300/10", MURDER_MYSTERY: "text-rose-300 bg-rose-300/10", CLOCKTOWER: "text-violet-300 bg-violet-300/10", HOLDEM: "text-emerald-300 bg-emerald-300/10" };

export default function EventsMonthCalendar({ userId }: { userId: string | null }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-amber-400/40 bg-amber-400/5 px-6 py-3 font-semibold text-amber-300 hover:bg-amber-400/10">▦ 달력으로 보기</button>
    {open && <CalendarDialog key={userId ?? "guest"} userId={userId} onClose={() => setOpen(false)} />}
  </>;
}

function CalendarDialog({ userId, onClose }: { userId: string | null; onClose(): void }) {
  const today = koreanDay(new Date());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [personal, setPersonal] = useState<PersonalEvent[]>([]);
  const [personalError, setPersonalError] = useState("");
  const [personalLoading, setPersonalLoading] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const authGeneration = useRef(0);
  const days = useMemo(() => monthDays(month), [month]);
  const from = days[0];
  const until = new Date(Date.parse(`${days.at(-1)}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

  useEffect(() => {
    const dialog = ref.current;
    const generation = authGeneration;
    const previous = document.body.style.overflow;
    dialog?.showModal(); document.body.style.overflow = "hidden";
    return () => { generation.current++; dialog?.close(); document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setEvents([]); setError("");
      try {
        const rows: Event[] = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await createClient().from("events").select("id,title,event_kind,started_at,ended_at,location,event_status")
            .lt("started_at", `${until}T00:00:00+09:00`)
            .gte("started_at", `${from}T00:00:00+09:00`)
            .order("started_at").order("id").range(offset, offset + 499).abortSignal(controller.signal);
          if (controller.signal.aborted) return;
          if (error) throw new Error("모임을 불러오지 못했어요. 새로고침을 눌러 주세요.");
          rows.push(...(data ?? []));
          if (!data || data.length < 500) break;
        }
        setEvents(rows);
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "일정 조회 실패"); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [from, until, revision]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setPersonal([]); setPersonalError("");
      if (!token) { setPersonalLoading(false); return; }
      setPersonalLoading(true);
      try { const rows = await readGoogleCalendar(token, from, until, controller.signal); if (!controller.signal.aborted) setPersonal(rows); }
      catch (error) { if (!controller.signal.aborted) setPersonalError(error instanceof Error ? error.message : "개인 일정 조회 실패"); }
      finally { if (!controller.signal.aborted) setPersonalLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [token, from, until, revision]);

  function connect() {
    if (connecting) return;
    const google = (window as Window & { google?: Google }).google;
    if (!google) { setPersonalError("구글 연결을 불러오지 못했어요. 다시 열어 주세요."); return; }
    const generation = ++authGeneration.current;
    setConnecting(true); setPersonalError("");
    try {
      google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: readScope,
        callback: response => {
          if (generation !== authGeneration.current) return;
          setConnecting(false);
          if (response.error || !response.access_token || !response.scope?.split(" ").includes(readScope)) { setPersonalError("개인 일정을 보려면 캘린더 읽기 동의가 필요해요."); return; }
          setToken(response.access_token);
        }, error_callback: () => { if (generation === authGeneration.current) { setConnecting(false); setPersonalError("연결 창이 닫혔거나 차단됐어요. 다시 시도해 주세요."); } },
      }).requestAccessToken({ prompt: "select_account" });
    } catch { setConnecting(false); setPersonalError("구글 연결을 시작하지 못했어요."); }
  }
  function move(delta: number) { const next = shiftMonth(month, delta); setMonth(next); setSelected(`${next}-01`); }
  const dayEvents = events.filter(e => koreanDay(e.started_at) === selected);
  const dayPersonal = personal.filter(e => occursOn(e.start, e.end, selected));
  return <dialog ref={ref} aria-labelledby="month-calendar-title" onCancel={e => { e.preventDefault(); onClose(); }} className="fixed inset-0 m-auto max-h-[94dvh] w-[calc(100%-1rem)] max-w-4xl overflow-y-auto overscroll-contain rounded-3xl border border-white/15 bg-zinc-950 p-0 text-white backdrop:bg-black/80">
    {userId && <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setReady(true)} onError={() => setPersonalError("구글 연결을 불러오지 못했어요.")} />}
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-zinc-950 px-4 py-4 sm:px-6"><div><p className="text-[10px] tracking-[0.25em] text-amber-400">BOARDLOUNGE CALENDAR</p><h2 id="month-calendar-title" className="mt-1 text-xl font-bold">우리의 모임 달력</h2></div><button autoFocus type="button" onClick={onClose} className="min-h-11 rounded-xl border border-white/15 px-4">닫기</button></div>
    <div className="p-3 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2"><button type="button" aria-label="이전 달" onClick={() => move(-1)} className="min-h-11 min-w-11 rounded-xl bg-white/5">‹</button><h3 className="text-xl font-bold">{month.slice(0,4)}년 {Number(month.slice(5))}월</h3><button type="button" aria-label="다음 달" onClick={() => move(1)} className="min-h-11 min-w-11 rounded-xl bg-white/5">›</button></div>
      <div className="mb-4 flex items-center justify-between gap-2 text-xs text-zinc-400"><span>한국 시간 · 전체 모임 · 개인 일정은 하늘색</span><div className="flex gap-2"><button type="button" onClick={() => { setMonth(today.slice(0,7)); setSelected(today); }} className="min-h-10 px-2 text-amber-300">오늘</button><button type="button" onClick={() => setRevision(v => v + 1)} className="min-h-10 px-2">새로고침</button></div></div>
      {loading && <p role="status" className="mb-3 text-sm text-zinc-400">모임 불러오는 중…</p>}
      {error && <p role="alert" className="mb-3 text-sm text-rose-300">{error}</p>}
      <div className="grid grid-cols-7 text-center text-xs">{["일","월","화","수","목","금","토"].map((d,i) => <div key={d} className={`py-3 ${i===0 ? "text-rose-400" : i===6 ? "text-sky-400" : "text-zinc-400"}`}>{d}</div>)}</div>
      <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-white/10">
        {days.map((day,index) => {
          const holiday = holidayOn(day);
          const mine = personal.filter(e => occursOn(e.start,e.end,day));
          const meetings = events.filter(e => koreanDay(e.started_at) === day);
          const entries = [...meetings.map(e => ({ id: e.id, href: `/events/${e.id}`, label: monthTitle(e.event_kind), time: koreanTime(e.started_at), style: e.event_status === "CANCELLED" ? "text-zinc-500 line-through" : colors[e.event_kind] ?? "text-zinc-300 bg-white/5" })), ...mine.map(e => ({ id: `personal-${e.id}`, href: null, label: e.summary, time: koreanTime(e.start), style: "text-sky-300 bg-sky-300/10" }))];
          return <div key={day} className={`flex min-h-28 min-w-0 flex-col items-stretch border-b border-r border-white/5 p-0.5 text-left align-top sm:min-h-28 sm:p-2 ${selected===day ? "bg-amber-400/10 ring-1 ring-inset ring-amber-400" : "hover:bg-white/5"} ${day.startsWith(month) ? "" : "opacity-40"}`}>
            <button type="button" aria-label={`${day}${holiday ? ` ${holiday}` : ""}, 모임 ${meetings.length}개, 개인 일정 ${mine.length}개`} aria-pressed={selected===day} onClick={() => setSelected(day)} className="min-h-9 text-left">
            <span className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${day===today ? "bg-amber-400 font-bold text-black" : holiday || index%7===0 ? "text-rose-400" : index%7===6 ? "text-sky-400" : "text-zinc-200"}`}>{Number(day.slice(-2))}</span>
            {holiday && <span className="mb-1 block truncate text-[10px] text-rose-300 sm:text-xs">{holiday}</span>}
            </button>
            {entries.slice(0,3).map(e => {
              const className = `mb-0.5 block rounded px-0.5 py-0.5 text-[10px] leading-3 sm:text-xs sm:leading-4 ${e.style}`;
              const content = <><span className="block truncate sm:inline">{e.label}</span><span className="block tabular-nums sm:ml-1 sm:inline">{e.time}</span></>;
              return e.href ? <Link key={e.id} href={e.href} aria-label={`${day} ${e.label} ${e.time} 이벤트 상세 보기`} className={`${className} hover:brightness-125 focus-visible:outline focus-visible:outline-amber-300`}>{content}</Link> : <span key={e.id} className={className}>{content}</span>;
            })}
            {entries.length > 3 && <button type="button" onClick={() => setSelected(day)} aria-label={`${day} 전체 일정 보기`} className="min-h-8 text-left text-[10px] text-zinc-400">+{entries.length-3}개</button>}
          </div>;
        })}
      </div>
      <section aria-live="polite" className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><h3 className="font-bold">{selected.replaceAll("-", ".")} <span className="text-sm text-rose-300">{holidayOn(selected)}</span></h3><div className="mt-3 space-y-2">
        {dayEvents.map(e => <Link key={e.id} href={`/events/${e.id}`} className="block rounded-xl border border-white/10 p-3 hover:bg-white/5"><span className={`text-sm ${colors[e.event_kind]?.split(" ")[0] ?? "text-amber-300"}`}>{monthTitle(e.event_kind)} · {koreanTime(e.started_at)}{e.event_status === "CANCELLED" ? " · 취소됨" : ""}</span><p className="mt-1 break-words font-semibold">{e.title}</p><p className="mt-1 text-xs text-zinc-400">{formatEventLocation(e.location)} · 상세 보기 →</p></Link>)}
        {dayPersonal.map(e => <div key={e.id} className="rounded-xl border border-sky-400/20 bg-sky-400/5 p-3"><p className="text-xs text-sky-300">내 구글 일정 · {koreanTime(e.start)}</p><p className="mt-1 break-words">{e.summary}</p></div>)}
        {!loading && !error && !personalLoading && dayEvents.length===0 && dayPersonal.length===0 && <p className="text-sm text-zinc-400">표시할 일정이 없어요.</p>}
      </div></section>
      <section className="mt-4 rounded-2xl border border-sky-400/20 p-4"><h3 className="font-bold text-sky-200">내 일정도 함께 보기</h3><p className="mt-2 text-xs leading-5 text-zinc-400">선택한 구글 계정의 기본 캘린더를 읽어 본인 화면에만 표시해요. 개인 일정은 홈페이지 서버에 저장하거나 다른 멤버에게 공개하지 않아요. 팝업을 닫으면 연결과 표시가 초기화돼요. 삼성·애플 기기에만 있는 일정은 불러올 수 없어요.</p>
        {!userId ? <Link href="/login" className="mt-3 inline-block text-sm text-sky-300">로그인하고 연결하기 →</Link> : token ? <button type="button" onClick={() => { authGeneration.current++; setToken(null); setPersonal([]); setPersonalError(""); }} className="mt-3 min-h-11 rounded-xl border border-white/15 px-4 text-sm">개인 일정 연결 끄기</button> : <button type="button" disabled={!ready || connecting || !clientId} onClick={connect} className="mt-3 min-h-11 rounded-xl bg-sky-300 px-4 text-sm font-bold text-zinc-950 disabled:opacity-50">{connecting ? "연결 중…" : "구글 캘린더 읽기 허용하고 보기"}</button>}
        {personalLoading && <p role="status" className="mt-2 text-sm text-sky-300">개인 일정 불러오는 중…</p>}
        {personalError && <p role="alert" className="mt-2 text-sm text-rose-300">{personalError}</p>}
      </section>
      <p className="mt-4 text-xs leading-5 text-zinc-500">공휴일: <a href={`https://astro.kasi.re.kr/kor/life/post/calendarData?year=${month.slice(0,4)}`} target="_blank" rel="noreferrer" className="underline">한국천문연구원 월력요항</a> · 2026~2027년 자료 (2026.10.22 확인). 이후 지정되는 임시공휴일은 추가 반영이 필요해요.{!hasHolidayYear(month.slice(0,4)) && <span className="block text-amber-300">이 연도의 공휴일 자료는 아직 제공하지 않아요.</span>}</p>
    </div>
  </dialog>;
}
