"use client";

import { useEffect, useRef, useState } from "react";
import { calendarFile, calendarTimes, calendarTitle, googleCalendarUrl, type CalendarEvent } from "@/lib/events/calendar";
import { formatEventLocation } from "@/lib/events/location";

export default function EventCalendar({ event, promptOpen, onPromptClose }: { event: CalendarEvent; promptOpen: boolean; onPromptClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [downloaded, setDownloaded] = useState(false);
  const times = calendarTimes(event);
  const title = calendarTitle(event.event_kind);
  useEffect(() => {
    if (promptOpen && !dialog.current?.open) dialog.current?.showModal();
  }, [promptOpen]);
  if (!times) return null;
  function open() { setDownloaded(false); dialog.current?.showModal(); }
  function close() { dialog.current?.close(); onPromptClose(); }
  function download() {
    const content = calendarFile(event, window.location.origin);
    if (!content) return;
    const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${title}-${event.id}.ics`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    setDownloaded(true);
  }
  const format = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
  return <>
    <div className="mt-5 rounded-2xl border border-sky-300/20 bg-sky-300/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-sky-100">내 캘린더에 모임 저장</h3><p className="mt-1 text-sm text-zinc-400">{title} · 날짜, 시간, 장소를 자동으로 채워드려요.</p></div><button type="button" onClick={open} className="min-h-12 rounded-xl bg-sky-300 px-5 font-bold text-zinc-950">캘린더에 추가</button></div>
    </div>
    <dialog ref={dialog} onCancel={onPromptClose} onClose={onPromptClose} aria-labelledby="event-calendar-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border border-white/15 bg-zinc-950 p-6 text-white backdrop:bg-black/75">
      <h2 id="event-calendar-title" className="text-xl font-bold">캘린더에도 추가할까요?</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">아래 정보가 입력된 일정을 확인하고, 캘린더에서 저장해 주세요.</p>
      <dl className="my-5 space-y-3 rounded-2xl bg-white/5 p-4 text-sm"><div><dt className="text-zinc-500">제목</dt><dd className="mt-1 text-lg font-bold">{title}</dd></div><div><dt className="text-zinc-500">날짜·시간 (한국 시간)</dt><dd className="mt-1">{format(event.started_at)}{times.end && event.ended_at ? <> ~<br/>{format(event.ended_at)}</> : " · 종료 미정"}</dd></div><div><dt className="text-zinc-500">장소</dt><dd className="mt-1 break-words">{formatEventLocation(event.location)}</dd></div></dl>
      {!times.end && <p className="mb-3 text-xs text-amber-200">종료 시간이 정해지지 않았어요. 캘린더에서 저장 전에 확인해 주세요.</p>}
      <div className="grid gap-3"><button type="button" onClick={() => { const url = googleCalendarUrl(event, window.location.origin); if (url) window.open(url, "_blank", "noopener,noreferrer"); }} className="min-h-12 rounded-xl bg-sky-300 font-bold text-zinc-950">구글 캘린더로 추가</button><button type="button" onClick={download} className="min-h-12 rounded-xl border border-white/20 font-bold">아이폰·기타 캘린더용 파일 받기</button></div>
      {downloaded && <p role="status" className="mt-3 text-sm text-sky-200">받은 .ics 파일을 캘린더 앱에서 열고 추가해 주세요. 기기에 따라 파일 가져오기가 필요할 수 있어요.</p>}
      <p className="mt-4 text-xs leading-5 text-zinc-500">일정 변경·참가 취소는 자동 반영되지 않아요. 이미 저장했다면 중복 추가하지 않도록 확인해 주세요.</p>
      <button type="button" onClick={close} className="mt-3 min-h-11 w-full text-sm text-zinc-400">닫기</button>
    </dialog>
  </>;
}
