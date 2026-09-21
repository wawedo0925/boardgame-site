"use client";

import { useState } from "react";
import { arrivalLimits, seoulDateTime, type ArrivalChoice, type ArrivalMode } from "@/lib/event-arrival";

const BANK_NAME = "국민은행";
const ACCOUNT_NUMBER = "94849203451";
const ACCOUNT_HOLDER = "이우영";

export default function EventJoinPaymentDialog({
  eventTitle,
  participationFee,
  eventKind,
  startedAt,
  endedAt,
  waitlisted,
  busy,
  onClose,
  onConfirm,
}: {
  eventTitle: string;
  participationFee: number;
  eventKind: "BOARDGAME" | "MURDER_MYSTERY" | "CLOCKTOWER" | "HOLDEM" | "GENERAL";
  startedAt: string;
  endedAt: string | null;
  waitlisted: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (choice: ArrivalChoice) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [showMurderNotice, setShowMurderNotice] = useState(false);
  const [step, setStep] = useState<"payment" | "murderLate" | "clocktower" | "clocktowerNew" | "time">("payment");
  const [mode, setMode] = useState<ArrivalMode>("NORMAL");
  const [time, setTime] = useState("");
  const [arrival, setArrival] = useState<string | null>(null);
  const [timeError, setTimeError] = useState("");
  const limits = arrivalLimits(startedAt, endedAt, eventKind, mode);
  const isFree = participationFee === 0;
  const isMurderMystery = eventKind === "MURDER_MYSTERY";

  async function copyAccount() {
    try {
      await navigator.clipboard.writeText(ACCOUNT_NUMBER);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("계좌번호를 복사해 주세요.", ACCOUNT_NUMBER);
    }
  }

  function handlePaymentConfirm(arrivalAt: string | null = null) {
    setArrival(arrivalAt);
    if (isMurderMystery) {
      setShowMurderNotice(true);
      return;
    }

    void onConfirm({ arrivalAt, mode: arrivalAt ? mode : "NORMAL" });
  }

  function chooseTime(nextMode: ArrivalMode) {
    setMode(nextMode); setTimeError("");
    const bounds = arrivalLimits(startedAt, endedAt, eventKind, nextMode);
    setTime(seoulDateTime(bounds.initial)); setStep("time");
  }

  if (!showMurderNotice && step !== "payment") return <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="late-arrival-title">
    <section className="max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-6 text-white sm:max-w-lg sm:rounded-3xl">
      <h2 id="late-arrival-title" className="text-2xl font-bold">{step === "time" ? "몇 시에 도착하시나요?" : "늦참 안내"}</h2>
      {step === "murderLate" && <p className="mt-5 leading-7">이 이벤트는 늦게 참여가 불가능합니다. 단 5~10분은 가능하니 꼭 GM이나 운영진에게 언급해 주세요.</p>}
      {step === "clocktower" && <p className="mt-5 leading-7">이 이벤트는 늦참이 불가합니다. 혹시 룰 숙지자이신가요?</p>}
      {step === "clocktowerNew" && <p className="mt-5 leading-7">첫플이시면 늦참이 불가하오나 5분은 가능하니 꼭 GM이나 운영진에게 언급해 주세요.</p>}
      {step === "time" && <form onSubmit={event => {
        event.preventDefault();
        const value = new Date(`${time}:00+09:00`).getTime();
        if (!Number.isFinite(limits.end) || !Number.isFinite(value) || value < limits.start || value > limits.end) { setTimeError("허용된 시간 안에서 도착 시간을 선택해 주세요."); return; }
        handlePaymentConfirm(new Date(value).toISOString());
      }}>
        {Number.isFinite(limits.end) ? <><p className="mt-4 text-sm leading-6 text-zinc-400">한국 시간 기준 {seoulDateTime(limits.start).replace("T", " ")} ~ {seoulDateTime(limits.end).replace("T", " ")} 사이로 입력해 주세요.</p>
          {mode === "CLOCKTOWER_EXPERIENCED" && <p className="mt-2 text-sm text-amber-300">시작 40분 뒤를 기본으로 설정했어요. 행사 종료 전까지 변경할 수 있어요.</p>}
          <label className="mt-5 block text-sm">도착 예정 시간<input required type="datetime-local" min={seoulDateTime(limits.start)} max={seoulDateTime(limits.end)} value={time} onChange={e => {setTime(e.target.value);setTimeError("");}} className="mt-2 min-h-12 w-full min-w-0 rounded-xl border border-white/20 bg-zinc-900 px-3 text-white [color-scheme:dark]" /></label></> : <p className="mt-5 text-amber-300">종료 시간이 설정되어야 늦참을 신청할 수 있어요. 운영진에게 종료 시간 설정을 요청해 주세요.</p>}
        {timeError && <p role="alert" className="mt-3 text-red-300">{timeError}</p>}
        <div className="mt-6 grid grid-cols-2 gap-3"><button type="button" disabled={busy} onClick={() => setStep(eventKind === "CLOCKTOWER" ? "clocktower" : eventKind === "MURDER_MYSTERY" ? "murderLate" : "payment")} className="min-h-12 rounded-xl border border-white/15">뒤로가기</button><button disabled={busy || !Number.isFinite(limits.end)} className="min-h-12 rounded-xl bg-amber-400 font-bold text-black disabled:opacity-40">{busy ? "처리 중..." : "확인"}</button></div>
      </form>}
      {step === "clocktower" ? <><div className="mt-6 grid grid-cols-2 gap-3"><button onClick={() => chooseTime("CLOCKTOWER_EXPERIENCED")} className="min-h-12 rounded-xl bg-amber-400 font-bold text-black">예</button><button onClick={() => setStep("clocktowerNew")} className="min-h-12 rounded-xl border border-white/15">아니요</button></div><button onClick={() => setStep("payment")} className="mt-3 min-h-11 w-full text-zinc-400">뒤로가기</button></> : step !== "time" && <div className="mt-6 grid grid-cols-2 gap-3"><button onClick={() => setStep(step === "clocktowerNew" ? "clocktower" : "payment")} className="min-h-12 rounded-xl border border-white/15">뒤로가기</button><button onClick={() => chooseTime(step === "clocktowerNew" ? "CLOCKTOWER_NEW" : "NORMAL")} className="min-h-12 rounded-xl bg-amber-400 font-bold text-black">확인</button></div>}
    </section>
  </div>;

  if (showMurderNotice) {
    return (
      <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="murder-join-notice-title">
        <section className="w-full rounded-t-3xl border border-red-400/25 bg-zinc-950 p-6 text-white shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-8">
          <p className="text-sm font-bold tracking-[0.18em] text-red-300">MURDER MYSTERY NOTICE</p>
          <h2 id="murder-join-notice-title" className="mt-2 text-2xl font-black">참가 전 꼭 확인해 주세요!</h2>

          <div className="mt-6 space-y-4 rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-5 leading-7 text-zinc-200">
            <p className="font-bold text-white">절대 일정을 잊거나 늦지 마세요!</p>
            <p>늦으면 다른 멤버들이 기다리게 됩니다.</p>
            <p>📅 캘박 바로 ㄱㄱ! 일정을 잊거나 늦을 경우 불이익이 생길 수 있습니다.</p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setShowMurderNotice(false)} disabled={busy} className="min-h-12 rounded-xl border border-white/15 font-semibold text-zinc-300 disabled:opacity-50">이전으로</button>
            <button type="button" onClick={() => void onConfirm({ arrivalAt: arrival, mode: "NORMAL" })} disabled={busy} className="min-h-12 rounded-xl bg-red-400 font-black text-zinc-950 disabled:opacity-50">{busy ? "처리 중..." : "인지했습니다"}</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="join-payment-title">
      <section className="max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-5 text-white shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-amber-300">JOIN EVENT</p>
            <h2 id="join-payment-title" className="mt-2 text-2xl font-bold">입금 후 참가해 주세요</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl disabled:opacity-50" aria-label="닫기">×</button>
        </div>

        <p className="mt-4 text-sm leading-6 text-zinc-400"><strong className="text-zinc-200">{eventTitle}</strong><br />{isFree ? "무료 이벤트입니다. 안내를 확인한 뒤 참가해 주세요." : "아래 계좌로 참가비를 입금한 뒤 완료 버튼을 눌러 주세요."}</p>

        <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-5">
          <div className="flex items-end justify-between gap-3"><span className="text-sm text-zinc-400">참가비</span><strong className="text-2xl text-amber-300">{isFree ? "무료" : `${participationFee.toLocaleString("ko-KR")}원`}</strong></div>
          {!isFree && <div className="mt-5 border-t border-white/10 pt-4">
            <p className="text-sm text-zinc-400">{BANK_NAME} · 예금주 {ACCOUNT_HOLDER}</p>
            <div className="mt-2 flex items-center gap-2"><strong className="min-w-0 flex-1 text-xl tracking-wide">{ACCOUNT_NUMBER}</strong><button type="button" onClick={copyAccount} className="shrink-0 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-zinc-950">{copied ? "복사 완료" : "계좌번호 복사"}</button></div>
          </div>}
        </div>

        <div className="mt-5 space-y-2 rounded-2xl bg-white/[0.04] p-4 text-sm leading-6 text-zinc-400">
          {!isFree && <p>• 입금자명은 사이트 활동명과 동일하게 입력해 주세요.</p>}
          <p>• 모임 시작 <strong className="text-white">24시간 전까지 취소하면 100% 환불</strong>됩니다.</p>
          <p>• 시작 24시간 이내 취소는 환불되지 않습니다.</p>
          {waitlisted && <p className="text-sky-300">• 현재 정원이 가득 차 있어 완료하면 대기 명단에 등록됩니다. 입금 전 관리자에게 확인해 주세요.</p>}
          {!isFree && <p className="text-amber-200">• 이 버튼은 자동 결제가 아닙니다. 실제 입금 여부는 관리자가 별도로 확인합니다.</p>}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-12 rounded-xl border border-white/15 font-semibold text-zinc-300 disabled:opacity-50">나중에 하기</button>
          <button type="button" onClick={() => { if (eventKind === "MURDER_MYSTERY") setStep("murderLate"); else if (eventKind === "CLOCKTOWER") setStep("clocktower"); else chooseTime("NORMAL"); }} disabled={busy} className="min-h-12 rounded-xl border border-amber-400/50 font-black text-amber-300 disabled:opacity-50">입완! 늦참</button>
          <button type="button" onClick={() => handlePaymentConfirm()} disabled={busy} className="col-span-2 min-h-12 rounded-xl bg-amber-400 font-black text-zinc-950 disabled:opacity-50">{busy ? "처리 중..." : "입완! 정참"}</button>
        </div>
      </section>
    </div>
  );
}
