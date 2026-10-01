"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const loading = () => <p className="p-8 text-center text-zinc-400">불러오는 중...</p>;
const EventPlayHistory = dynamic(() => import("./EventPlayHistory"), { loading });
const MurderMysteryHistory = dynamic(() => import("./MurderMysteryHistory"), { loading });
const Achievements = dynamic(() => import("./Achievements"), { loading });
const PersonalGames = dynamic(() => import("./PersonalGames"), { loading });
const panels = [
  ["favorites", "⭐", "좋아하는 보드게임", "내 평가 4점 이상 · 5점 게임부터"],
  ["gm", "🎲", "GM 가능 보드게임", "보유 게임 · 메모 · 놓치기 쉬운 룰 · 플레이 팁"],
  ["events", "📅", "이벤트 플레이 기록", "참여한 모임과 게임 결과"],
  ["mysteries", "🔎", "내 머더미스터리 기록", "플레이 및 GM 기록"],
  ["achievements", "🏅", "업적 배지", "달성한 업적과 진행 현황"],
] as const;

export default function MyPageCollections({ userId }: { userId: string }) {
  const [active, setActive] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!active) return;
    const modal = dialog.current;
    const overflow = document.body.style.overflow;
    modal?.showModal();
    document.body.style.overflow = "hidden";
    return () => { modal?.close(); document.body.style.overflow = overflow; trigger.current?.focus(); };
  }, [active]);
  return <section className="mt-8">
    <h2 className="text-xl font-bold">나의 게임 공간</h2>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">{panels.map(([id, icon, title, description]) => <button key={id} onClick={event => { trigger.current = event.currentTarget; setActive(id); }} className="flex min-h-24 items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left hover:border-amber-400/50 focus-visible:outline-2 focus-visible:outline-amber-400">
      <span className="text-2xl" aria-hidden="true">{icon}</span><span className="flex-1"><strong className="block text-base sm:text-lg">{title}</strong><span className="mt-1 block text-xs leading-5 text-zinc-400">{description}</span></span><span aria-hidden="true">›</span>
    </button>)}</div>
    {active && <dialog ref={dialog} onCancel={() => setActive(null)} onClick={event => { if (event.target === event.currentTarget) setActive(null); }} aria-labelledby="collection-title" className="m-auto max-h-[92dvh] w-[calc(100%-1rem)] max-w-4xl overflow-y-auto rounded-3xl border border-white/15 bg-zinc-950 p-0 text-white backdrop:bg-black/75">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-zinc-950 p-4 sm:px-6"><h2 id="collection-title" className="text-lg font-bold sm:text-xl">{panels.find(panel => panel[0] === active)?.[2]}</h2><button autoFocus aria-label="팝업 닫기" onClick={() => setActive(null)} className="h-11 w-11 rounded-full bg-white/10 text-xl">×</button></div>
      <div className="p-4 sm:p-6">
        {active === "favorites" && <PersonalGames userId={userId} kind="FAVORITE"/>}
        {active === "gm" && <PersonalGames userId={userId} kind="GM"/>}
        {active === "events" && <EventPlayHistory/>}
        {active === "mysteries" && <MurderMysteryHistory/>}
        {active === "achievements" && <Achievements userId={userId}/>}
      </div>
    </dialog>}
  </section>;
}
