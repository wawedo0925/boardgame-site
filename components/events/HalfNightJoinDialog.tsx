"use client";

import { halfNightSchedule, type HalfNightPart } from "@/lib/events/half-night";

export default function HalfNightJoinDialog({ title, startedAt, busy, waitlisted, onClose, onSelect }: {
  title: string; startedAt: string; busy: boolean; waitlisted: boolean;
  onClose: () => void; onSelect: (part: HalfNightPart) => void;
}) {
  const schedule = halfNightSchedule(startedAt);
  return <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="half-night-join-title">
    <section className="max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl border border-indigo-400/30 bg-zinc-950 p-6 text-white sm:max-w-lg sm:rounded-3xl">
      <h2 id="half-night-join-title" className="text-2xl font-black">반나잇 참가 안내</h2>
      <p className="mt-2 text-sm text-zinc-400">{title}</p>
      <div className="mt-5 rounded-2xl bg-indigo-400/10 p-4 text-sm leading-7">
        <p>총 6시간 · 1부와 2부는 각각 3시간입니다.</p>
        <p>1부: {schedule.first}</p><p>2부: {schedule.second}</p>
        <p className="mt-3 font-bold text-indigo-200">모두 참여 20,000원 / 한 부만 참여 10,000원</p>
      </div>
      <p className="mt-4 text-sm leading-7">참여할 부의 금액을 입금한 뒤 아래 버튼을 눌러 주세요.<br/>국민은행 94849203451 · 예금주 이우영</p>
      {waitlisted && <p className="mt-3 text-sm text-amber-300">정원이 가득 차 대기로 등록됩니다. 선택한 부는 참가 확정 시에도 유지됩니다.</p>}
      <div className="mt-5 grid gap-3">
        {([['BOTH', '1부/2부 참여', '20,000원'], ['FIRST', '1부만 참여', '10,000원'], ['SECOND', '2부만 참여', '10,000원']] as const).map(([part,label,fee]) =>
          <button key={part} type="button" disabled={busy} onClick={() => onSelect(part)} className="min-h-14 rounded-xl bg-indigo-300 px-4 font-black text-zinc-950 disabled:opacity-50">{busy ? "처리 중..." : `${label} · ${fee}`}</button>)}
        <button type="button" disabled={busy} onClick={onClose} className="min-h-12 rounded-xl border border-white/15 text-zinc-300">취소 하기</button>
      </div>
    </section>
  </div>;
}
