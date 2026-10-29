"use client";

import { useState } from 'react';
import ClocktowerPopup from '@/components/events/ClocktowerPopup';
import { composition, groups } from '@/lib/clocktower/setup';

const counts = Array.from({ length: 11 }, (_, index) => index + 5);

export default function ClocktowerCompositionGuide({ playerCount }: { playerCount: number }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-200">인원별 역할 구성표</button>
    {open && <ClocktowerPopup title="인원별 역할 구성표" subtitle="점철되는 혼란 · 피로 물든 달 공통" onClose={() => setOpen(false)}>
      <p className="mb-4 text-sm leading-6 text-zinc-300">이야기꾼을 제외한 플레이어 수를 기준으로 보는 기본 구성입니다.</p>
      {playerCount >= 5 && playerCount <= 15 && <p className="mb-3 font-bold text-amber-200">현재 참가 인원 {playerCount}명 · 노란색으로 표시된 열을 확인해 주세요.</p>}
      <div role="region" aria-label="인원별 역할 구성표, 가로로 스크롤할 수 있습니다" tabIndex={0} className="overflow-x-auto rounded-xl border border-amber-200/30 focus-visible:outline-2 focus-visible:outline-amber-200">
        <table className="w-full min-w-[540px] border-collapse text-center text-base">
          <caption className="sr-only">플레이어 5명부터 15명 이상까지의 주민, 외지인, 하수인, 악마 수</caption>
          <thead><tr className="bg-amber-100/10"><th scope="col" className="sticky left-0 z-10 whitespace-nowrap bg-zinc-900 px-3 py-4 text-amber-100">플레이어 수</th>{counts.map(n => <th key={n} scope="col" className={`min-w-9 px-2 py-4 ${n === playerCount ? 'bg-amber-300/25 text-amber-200' : 'text-amber-100'}`}>{n === 15 ? '15+' : n}</th>)}</tr></thead>
          <tbody>{groups.map((group, index) => <tr key={group} className="border-t border-white/10"><th scope="row" className={`sticky left-0 bg-zinc-900 px-3 py-4 ${index < 2 ? 'text-sky-300' : 'text-rose-300'}`}>{group} 수</th>{counts.map(n => <td key={n} className={`px-2 py-4 font-semibold ${n === playerCount ? 'bg-amber-300/20 text-amber-100' : index < 2 ? 'text-sky-200' : 'text-rose-200'}`}>{composition(n, false)![index]}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-zinc-400">작은 화면에서는 표를 좌우로 밀어서 볼 수 있어요.</p>
      <p className="mt-4 text-sm leading-6 text-zinc-300">캐릭터 능력에 따라 실제 구성은 달라질 수 있습니다. 이 표에는 실제 배정된 역할이 표시되지 않습니다.</p>
      <p className="mt-2 text-sm leading-6 text-zinc-400">15명을 초과하는 인원은 여행자로 참여합니다. 현재 프로그램은 플레이어 5~15명을 지원합니다.</p>
      <button type="button" onClick={() => setOpen(false)} className="mt-5 w-full rounded-xl bg-violet-400 px-4 py-3 font-bold text-zinc-950">확인</button>
    </ClocktowerPopup>}
  </>;
}
