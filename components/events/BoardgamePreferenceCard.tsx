"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { BoardgamePreference } from "@/types/event";

const OPTIONS: Array<{
  value: BoardgamePreference;
  label: string;
  description: string;
  className: string;
}> = [
  {
    value: "PARTY",
    label: "파티",
    description: "가볍고 함께 웃는 게임",
    className: "border-amber-400 bg-amber-400/10 text-amber-200",
  },
  {
    value: "NON_PARTY",
    label: "파티 X",
    description: "전략·추리 등 몰입하는 게임",
    className: "border-red-400 bg-red-400/10 text-red-200",
  },
  {
    value: "ANY",
    label: "아무거나",
    description: "어떤 게임이든 좋아요",
    className: "border-white/70 bg-white/10 text-white",
  },
  {
    value: "PREMADE_PARTY",
    label: "팟 참가 중",
    description: "이미 함께할 팟이 있어요",
    className: "border-emerald-400 bg-emerald-400/10 text-emerald-200",
  },
];

function PreferenceChoices({
  selected,
  busy,
  canChange,
  onChoose,
}: {
  selected: BoardgamePreference | null;
  busy: BoardgamePreference | null;
  canChange: boolean;
  onChoose: (preference: BoardgamePreference) => void;
}) {
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      {OPTIONS.map((option) => {
        const active = selected === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={!canChange || busy !== null}
            onClick={() => onChoose(option.value)}
            className={`min-h-20 rounded-2xl border-2 px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${
              active
                ? `${option.className} ring-2 ring-offset-2 ring-offset-zinc-950`
                : "border-white/10 bg-white/[0.025] text-zinc-300 hover:border-white/30"
            }`}
            aria-pressed={active}
          >
            <span className="block font-bold">{option.label}</span>
            <span className="mt-1 block text-xs opacity-70">{option.description}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function BoardgamePreferenceCard({
  eventId,
  startedAt,
  currentPreference,
  onChanged,
  promptOpen = false,
  onPromptClose,
}: {
  eventId: string;
  startedAt: string;
  currentPreference: BoardgamePreference | null;
  onChanged: () => Promise<void> | void;
  promptOpen?: boolean;
  onPromptClose?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [selected, setSelected] = useState(currentPreference);
  const [busy, setBusy] = useState<BoardgamePreference | null>(null);
  const changeDeadline = new Date(startedAt).getTime() - 60 * 60 * 1000;
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const canChange = currentTime < changeDeadline;

  useEffect(() => {
    const remaining = changeDeadline - Date.now();
    if (remaining <= 0) return;

    const timeout = window.setTimeout(
      () => setCurrentTime(Date.now()),
      remaining + 100,
    );
    return () => window.clearTimeout(timeout);
  }, [changeDeadline]);

  async function choose(preference: BoardgamePreference) {
    if (!canChange || busy) return;

    const previous = selected;
    setSelected(preference);
    setBusy(preference);

    const { error } = await supabase.rpc("set_boardgame_event_preference", {
      p_event_id: eventId,
      p_preference: preference,
    });

    if (error) {
      setSelected(previous);
      alert(error.message || "게임 취향을 저장하지 못했습니다.");
    } else {
      await onChanged();
      if (promptOpen) onPromptClose?.();
    }

    setBusy(null);
  }

  const intro = (
    <>
      <p className="text-sm font-semibold text-amber-300">GAME PREFERENCE</p>
      <h2 className="mt-1 text-2xl font-bold">이번 모임에서 어떤 게임을 하고 싶나요?</h2>
      <p className="mt-3 text-sm leading-6 text-zinc-400">
        가장 끌리는 플레이 스타일을 골라주세요. 선택 내용은 조 편성에 참고하지만,
        참여 인원과 현장 상황에 따라 실제 게임은 달라질 수 있습니다.
      </p>
      <p className={`mt-2 text-sm font-semibold ${canChange ? "text-amber-300" : "text-zinc-500"}`}>
        {canChange
          ? "이벤트 시작 1시간 전까지 언제든 편하게 변경할 수 있어요."
          : "게임 취향 변경 시간이 마감되었습니다."}
      </p>
    </>
  );

  return (
    <>
    <article className="rounded-3xl border border-amber-400/20 bg-amber-400/[0.035] p-6 sm:p-8">
      {intro}
      <PreferenceChoices selected={selected} busy={busy} canChange={canChange} onChoose={(value) => void choose(value)} />
    </article>
    {promptOpen && canChange && (
      <div className="fixed inset-0 z-[160] flex items-end bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" onClick={onPromptClose}>
        <section className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border border-amber-400/25 bg-zinc-950 p-6 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-8" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-start justify-between gap-4">
            <div>{intro}</div>
            <button type="button" onClick={onPromptClose} className="h-11 w-11 shrink-0 rounded-full bg-white/10 text-xl text-zinc-300" aria-label="닫기">×</button>
          </div>
          <PreferenceChoices selected={selected} busy={busy} canChange={canChange} onChoose={(value) => void choose(value)} />
        </section>
      </div>
    )}
    </>
  );
}
