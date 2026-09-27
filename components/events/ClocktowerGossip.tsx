'use client';

import { useState } from 'react';
import type { LiveGossip, LiveState } from '@/lib/clocktower/live';
import ClocktowerPopup from './ClocktowerPopup';

const button = 'min-h-11 rounded-xl border border-white/20 px-4 py-3 disabled:opacity-40';
const field = 'mt-2 w-full rounded-xl border border-white/20 bg-zinc-900 p-3 text-white';
type Props = { state: LiveState; busy: boolean; error: string; allowPopup: boolean; run: (action: string, data?: Record<string, unknown>) => Promise<boolean> };

export default function ClocktowerGossip({ state, busy, error, allowPopup, run }: Props) {
  const [open, setOpen] = useState(false);
  const [actor, setActor] = useState('');
  const [statement, setStatement] = useState('');
  const room = state.room!;
  const declarations = state.gossip_declarations ?? [];
  const today = declarations.filter(g => g.day === room.night);
  const who = state.is_host ? actor : state.my_id;
  const available = (state.members ?? []).filter(m => m.alive && !today.some(g => g.actor === m.user_id));
  const unread = declarations.find(g => !g.acknowledged);
  const blocked = room.phase !== 'DAY' || !!state.bmr?.auto?.pending;
  const canDeclare = available.some(m => m.user_id === who);
  const name = (id: string) => state.members?.find(m => m.user_id === id)?.name ?? '참가자';
  const acknowledge = async (g: LiveGossip) => { await run('gossip_ack', { declaration_id: g.id }); };
  const judgment = (g: LiveGossip) => gossipJudgment({g,state,busy,blocked,run});

  return <section className="my-5 space-y-3 rounded-2xl border border-violet-300/30 p-4">
    <h2 className="text-xl font-bold">험담 공개 선언</h2>
    <p className="text-sm text-zinc-400">실제 역할과 관계없이 살아 있는 참가자 누구나 낮마다 한 번 선언할 수 있습니다. 선언한 내용은 모두에게 공개됩니다.</p>
    <button className={button} disabled={busy || blocked || (!state.is_host && !canDeclare) || (state.is_host && !available.length)} onClick={() => setOpen(true)}>험담 선언</button>
    {today.map(g => <article key={g.id} className="rounded-xl bg-white/5 p-4"><p className="font-bold">{name(g.actor)}님의 험담 선언</p><p className="mt-2 whitespace-pre-wrap break-words">{g.statement}</p>{judgment(g)}</article>)}
    {state.is_host && today.some(g => g.truth == null) && <p className="text-sm text-amber-200">처형 확정 전에 모든 선언의 참거짓을 판정해 주세요.</p>}
    {open && <ClocktowerPopup title="험담 선언" busy={busy} onClose={() => setOpen(false)}>
      <form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (await run('gossip_declare', { actor: who, day: room.night, statement })) { setOpen(false); setStatement(''); setActor(''); } }}>
        {state.is_host && <label className="block">선언한 사람<select className={field} required value={actor} onChange={e => setActor(e.target.value)}><option value="">선택</option>{available.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}</select></label>}
        <label className="block">공개할 험담 내용<textarea className={field} rows={4} required maxLength={2000} value={statement} onChange={e => setStatement(e.target.value)} placeholder="예: 악마는 내 양옆 중 한 명입니다." /></label>
        <p className="text-sm text-zinc-400">제출하면 모두에게 선언 팝업이 표시됩니다. 제출한 내용은 취소하거나 바꿀 수 없습니다.</p>
        {error && <p role="alert" className="text-red-300">{error}</p>}
        <button className={`${button} w-full bg-violet-400 font-bold text-zinc-950`} disabled={busy || blocked || !canDeclare || !statement.trim()}>모두에게 선언하기</button>
      </form>
    </ClocktowerPopup>}
    {!open && allowPopup && unread && <ClocktowerPopup key={unread.id} title="험담 선언이 도착했습니다" busy={busy} onClose={() => void acknowledge(unread)}>
      <p className="text-lg"><strong>{name(unread.actor)}</strong>님이 {unread.day}일차에 험담을 선언했습니다.</p>
      <blockquote className="my-4 whitespace-pre-wrap break-words rounded-xl bg-violet-400/10 p-4 text-lg">{unread.statement}</blockquote>
      {judgment(unread)}
      {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
      <button className={`${button} mt-5 w-full`} disabled={busy} onClick={() => void acknowledge(unread)}>확인</button>
    </ClocktowerPopup>}
  </section>;
}

export function gossipJudgment({g,state,busy,blocked,run}: {g:LiveGossip; state:LiveState; busy:boolean; blocked:boolean; run:Props["run"]}) {
  return state.is_host && g.day === state.room?.night && <div className="mt-3 space-y-2">
    <p className="text-sm text-amber-200">이야기꾼 전용 · 실제 역할: {state.members?.find(m => m.user_id === g.actor)?.actual_role} · 판정: {g.truth == null ? (g.deferred ? '판정 보류' : '미판정') : g.truth ? '참' : '거짓'}</p>
    <div className="flex flex-wrap gap-3">{[true, false].map(truth => <button key={String(truth)} className={`${button} flex-1 ${g.truth === truth ? 'border-violet-300 bg-violet-400/20' : ''}`} aria-pressed={g.truth === truth} disabled={busy || blocked || g.truth === truth} onClick={() => void run('gossip_judge', { declaration_id: g.id, day: g.day, truth, previous_truth: g.truth ?? null })}>{truth ? '참' : '거짓'}</button>)}<button className={button} disabled={busy || blocked || !!g.deferred && g.truth == null} onClick={() => void run('gossip_defer', { declaration_id:g.id, day:g.day, previous_truth:g.truth ?? null })}>나중에 판단</button></div>
    <p className="text-xs text-zinc-400">판정은 참가자에게 공개되지 않습니다. 진짜 험담꾼의 발언만 밤 능력에 반영되며, 취함·중독·생존 여부는 밤에 확인합니다.</p>
  </div>;
}
