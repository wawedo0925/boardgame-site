"use client";

import { useState } from 'react';
import type { LiveMember } from '@/lib/clocktower/live';

export function birthYearLabel(value?: string | null) {
  const digits = value?.replace(/[^0-9]/g, '') ?? '';
  return /^(\d{2}|\d{4})$/.test(digits) ? `${digits.slice(-2)}년생` : '';
}

export function ClocktowerName({ member }: { member: { name: string; birth_year?: string | null } }) {
  const year = birthYearLabel(member.birth_year);
  return <span className="inline-flex max-w-full flex-wrap items-baseline justify-center gap-x-1.5"><span className="break-words">{member.name}</span>{year && <small className="text-[10px] font-normal text-zinc-400">{year}</small>}</span>;
}

export default function ClocktowerSeating({ members, editable = false, busy = false, myId, swap, sync }: {
  members: LiveMember[]; editable?: boolean; busy?: boolean; myId?: string;
  swap?: (first: LiveMember, second: LiveMember) => Promise<boolean>; sync?: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const ordered = [...members].sort((a, b) => a.seat - b.seat);
  // An elongated oval gives every seat a readable touch target on narrow phones.
  const rightCount = Math.max(0, Math.ceil((ordered.length - 2) / 2));
  const leftCount = Math.max(0, ordered.length - 2 - rightCount);
  const height = Math.max(440, rightCount * 90 + 140);
  async function choose(member: LiveMember) {
    if (!editable || busy) return;
    const first = members.find(m => m.user_id === selected);
    if (!first) { setSelected(member.user_id); return; }
    if (first.user_id === member.user_id) { setSelected(null); return; }
    if (await swap?.(first, member)) setSelected(null);
  }
  return <section className="rounded-3xl border border-violet-400/25 bg-violet-400/[0.025] p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">마을 자리 배치</h2>{editable && sync && <button disabled={busy} onClick={sync} className="rounded-xl border border-white/20 px-4 py-3 text-sm disabled:opacity-40">일정 참가자 불러오기</button>}</div>
    <p className="mt-3 text-sm leading-6 text-zinc-400">{editable ? '두 사람을 차례로 누르면 자리가 바뀝니다. 실제 앉은 순서대로 배치한 뒤 역할을 정해 주세요.' : '위쪽부터 시계 방향으로 배치된 자리입니다. 실제 자리와 다르면 이야기꾼에게 알려주세요.'}</p>
    {editable && <p role="status" className="mt-2 min-h-6 text-sm text-violet-200">{selected && members.some(m => m.user_id === selected) ? '바꿀 상대를 누르세요. 같은 사람을 누르면 선택이 취소됩니다.' : '첫 번째 참가자를 선택하세요.'}</p>}
    {ordered.length === 0 ? <p className="py-10 text-center text-zinc-400">아직 배정된 참가자가 없습니다.</p> : <div className="relative mx-auto mt-5 max-w-2xl" style={{ height }}>
      <div aria-hidden="true" className="absolute inset-x-[20%] inset-y-12 rounded-[50%] border border-violet-400/20 bg-zinc-950" />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-zinc-500"><span className="text-sm">마을 광장</span><span className="text-xs">{ordered.length}명 · 시계 방향 ↻</span></div>
      {ordered.map((member, index) => {
        const bottom = index === rightCount + 1;
        const right = index > 0 && index <= rightCount;
        const x = index === 0 || bottom ? 50 : right ? 83 : 17;
        const y = index === 0 ? 38 : bottom ? height - 38 : right ? 38 + index * (height - 76) / (rightCount + 1) : height - 38 - (index - rightCount - 1) * (height - 76) / (leftCount + 1);
        const style = { left: `${x}%`, top: y, transform: 'translate(-50%, -50%)', width: '31%' };
        const content = <><span className="mb-1 block text-[10px] text-zinc-500">{member.seat}번{member.user_id === myId ? ' · 내 자리' : ''}</span><ClocktowerName member={member} /></>;
        const className = `absolute min-h-16 rounded-2xl border px-2 py-2 text-center text-sm font-semibold ${selected === member.user_id ? 'border-violet-300 bg-violet-950 ring-2 ring-violet-300/30' : member.user_id === myId ? 'border-violet-400/70 bg-zinc-900' : 'border-white/15 bg-zinc-900'}`;
        return editable ? <button key={member.user_id} style={style} className={`${className} disabled:opacity-50`} aria-pressed={selected === member.user_id} disabled={busy} onClick={() => void choose(member)}>{content}</button> : <div key={member.user_id} style={style} className={className}>{content}</div>;
      })}
    </div>}
  </section>;
}
