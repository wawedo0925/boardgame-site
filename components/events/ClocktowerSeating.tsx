"use client";

import { useEffect, useRef, useState } from 'react';
import type { LiveMember, SeatLayout } from '@/lib/clocktower/live';

export function birthYearLabel(value?: string | null) {
  const digits = value?.replace(/[^0-9]/g, '') ?? '';
  return /^(\d{2}|\d{4})$/.test(digits) ? `${digits.slice(-2)}년생` : '';
}

export function ClocktowerName({ member }: { member: { name: string; birth_year?: string | null } }) {
  const year = birthYearLabel(member.birth_year);
  return <span className="inline-flex max-w-full flex-wrap items-baseline justify-center gap-x-1.5"><span className="break-words">{member.name}</span>{year && <small className="text-[10px] font-normal text-zinc-400">{year}</small>}</span>;
}

const control = 'rounded-xl border border-white/20 px-3 py-2 text-sm disabled:opacity-40';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value / 10) * 10));
export function gridLayout(members: LiveMember[]): SeatLayout {
  const ordered = [...members].sort((a, b) => a.seat - b.seat);
  const columns = Math.min(5, Math.max(1, ordered.length));
  const rows = Math.ceil(ordered.length / columns);
  return Object.fromEntries(ordered.map((m, i) => [m.user_id, { x: 100 + (i % columns) * 800 / Math.max(1, columns - 1), y: rows === 1 ? 350 : 100 + Math.floor(i / columns) * 500 / (rows - 1) }]));
}

export default function ClocktowerSeating({ members, layout = {}, revision = 0, editable = false, busy = false, myId, swap, sync, save, onEditingChange }: {
  members: LiveMember[]; layout?: SeatLayout; revision?: number; editable?: boolean; busy?: boolean; myId?: string;
  swap?: (first: LiveMember, second: LiveMember) => Promise<boolean>; sync?: () => void;
  onEditingChange?: (editing: boolean) => void;
  save?: (layout: SeatLayout, revision: number) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<SeatLayout | null>(null);
  const [baseRevision, setBaseRevision] = useState(0);
  const [mode, setMode] = useState<'view' | 'move' | 'order'>('view');
  const [showOrder, setShowOrder] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const [fit, setFit] = useState(0.7);
  const viewport = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const ordered = [...members].sort((a, b) => a.seat - b.seat);
  const defaults = gridLayout(members);
  const positions = (editable ? draft : null) ?? Object.fromEntries(ordered.map(m => [m.user_id, layout[m.user_id] ?? defaults[m.user_id]]));
  const scale = zoom ?? fit;
  const editing = editable && mode === 'move';

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setFit(Math.min(1, Math.max(0.2, element.clientWidth / 1000))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => onEditingChange?.(false), [onEditingChange]);

  function point(clientX: number, clientY: number) {
    const rect = board.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  }
  function move(id: string, x: number, y: number) {
    setDraft(current => ({ ...(current ?? positions), [id]: { x: clamp(x, 60, 940), y: clamp(y, 40, 660) } }));
  }
  function cancel() { onEditingChange?.(false); setDraft(null); setMode('view'); setSelected(null); drag.current = null; }
  async function chooseOrder(member: LiveMember) {
    if (!editable || busy || mode !== 'order') return;
    const first = members.find(m => m.user_id === selected);
    if (!first) { setSelected(member.user_id); return; }
    if (first.user_id === member.user_id) { setSelected(null); return; }
    if (await swap?.(first, member)) setSelected(null);
  }

  return <section className="rounded-3xl border border-violet-400/25 bg-violet-400/[0.025] p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">마을 자리 배치</h2>{editable && sync && <button disabled={busy || mode !== 'view'} onClick={sync} className={control}>일정 참가자 불러오기</button>}</div>
    <p className="mt-3 text-sm leading-6 text-zinc-400">{editable ? '실제로 앉은 위치에 맞춰 카드를 자유롭게 배치하세요. 저장하면 참가자들에게도 같은 모양으로 보입니다.' : '실제 앉은 위치에 맞춰 이야기꾼이 배치한 자리입니다. 작게 보이면 확대해서 확인하세요.'}</p>
    {editable && <div className="mt-4 flex flex-wrap gap-2">
      {mode === 'view' ? <><button disabled={busy || !members.length} className="rounded-xl bg-violet-400 px-4 py-3 text-sm font-bold text-zinc-950 disabled:opacity-40" onClick={() => { onEditingChange?.(true); setDraft(positions); setBaseRevision(revision); setMode('move'); setZoom(Math.max(fit, 0.7)); }}>배치 편집</button><button disabled={busy || members.length < 2} className={control} onClick={() => { setMode('order'); setShowOrder(true); setZoom(Math.max(fit, 0.7)); }}>이웃 순서 바꾸기</button></> : <>
        {editing && <><button disabled={busy} className="rounded-xl bg-violet-400 px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-40" onClick={async () => { if (draft && await save?.(draft, baseRevision)) cancel(); }}>배치 저장</button><button disabled={busy} className={control} onClick={() => { setDraft(gridLayout(members)); setSelected(null); }}>줄 맞추기</button></>}
        <button disabled={busy} className={control} onClick={cancel}>{editing ? '취소' : '순서 변경 마치기'}</button>
      </>}
    </div>}
    {editing && <p role="status" className="mt-3 text-sm text-violet-200">카드를 끌어 놓거나, 카드를 누른 뒤 빈 곳을 누르세요. 선택한 카드는 방향키로도 이동할 수 있습니다. 저장 전에는 본인 화면에만 보입니다.</p>}
    {editable && mode === 'order' && <p role="status" className="mt-3 text-sm text-violet-200">두 사람을 차례로 누르면 자리 번호가 서로 바뀝니다. 번호와 연결선이 실제 이웃 순서와 맞는지 확인하세요.</p>}
    <div className="mt-4 flex flex-wrap items-center gap-2"><button className={control} onClick={() => setZoom(null)}>전체 보기</button><button className={control} onClick={() => setZoom(Math.max(0.25, scale - 0.15))} aria-label="배치 축소">−</button><span className="w-12 text-center text-xs text-zinc-400">{Math.round(scale * 100)}%</span><button className={control} onClick={() => setZoom(Math.min(1.5, scale + 0.15))} aria-label="배치 확대">＋</button><label className="ml-auto flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={showOrder} onChange={e => setShowOrder(e.target.checked)} />이웃 연결선</label></div>
    <div ref={viewport} className="mt-4 overflow-auto rounded-2xl border border-white/10 bg-zinc-950" style={{ maxHeight: 750 }}>
      {!ordered.length ? <p className="p-10 text-center text-zinc-400">아직 배정된 참가자가 없습니다.</p> : <div style={{ width: 1000 * scale, height: 700 * scale }} className="relative">
        <div ref={board} data-testid="seating-board" className="absolute left-0 top-0 origin-top-left" style={{ width: 1000, height: 700, transform: `scale(${scale})`, backgroundImage: 'radial-gradient(#ffffff16 1px, transparent 1px)', backgroundSize: '20px 20px' }} onClick={e => { if (editing && !busy && selected) { const p = point(e.clientX, e.clientY); move(selected, p.x, p.y); setSelected(null); } }}>
          {showOrder && ordered.length > 1 && <svg width="1000" height="700" className="pointer-events-none absolute inset-0" aria-hidden="true">{ordered.map((member, i) => { const a = positions[member.user_id], b = positions[ordered[(i + 1) % ordered.length].user_id]; return <line key={member.user_id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#a78bfa" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="6 6" />; })}</svg>}
          {ordered.map(member => {
            const pos = positions[member.user_id];
            const className = `absolute flex h-[72px] w-[112px] flex-col items-center justify-center overflow-hidden rounded-2xl border px-2 py-2 text-center text-sm font-semibold ${selected === member.user_id ? 'z-10 border-violet-300 bg-violet-950 ring-2 ring-violet-300/30' : member.user_id === myId ? 'border-violet-400/70 bg-zinc-900' : 'border-white/20 bg-zinc-900'}`;
            const style = { left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' };
            const content = <><span className="mb-1 block text-[10px] text-zinc-400">{member.seat}번{member.user_id === myId ? ' · 내 자리' : ''}</span><ClocktowerName member={member} /></>;
            return editable && mode !== 'view' ? <button key={member.user_id} data-testid={`seat-${member.user_id}`} title={member.name} style={{ ...style, touchAction: editing ? 'none' : 'auto' }} className={`${className} ${editing ? 'cursor-grab active:cursor-grabbing' : ''} disabled:opacity-50`} aria-pressed={selected === member.user_id} disabled={busy}
              onClick={e => { e.stopPropagation(); if (mode === 'order') void chooseOrder(member); }}
              onPointerDown={e => { if (!editing || busy) return; e.stopPropagation(); const p = point(e.clientX, e.clientY); drag.current = { id: member.user_id, dx: p.x - pos.x, dy: p.y - pos.y }; setSelected(member.user_id); e.currentTarget.setPointerCapture(e.pointerId); }}
              onPointerMove={e => { if (!editing || busy || drag.current?.id !== member.user_id) return; const p = point(e.clientX, e.clientY); move(member.user_id, p.x - drag.current.dx, p.y - drag.current.dy); }}
              onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
              onKeyDown={e => { if (!editing || busy) return; const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key]; if (delta) { e.preventDefault(); setSelected(member.user_id); move(member.user_id, pos.x + delta[0], pos.y + delta[1]); } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(member.user_id); } }}
            >{content}</button> : <div key={member.user_id} title={member.name} className={className} style={style}>{content}</div>;
          })}
        </div>
      </div>}
    </div>
    <p className="mt-2 text-xs text-zinc-500">확대한 화면은 빈 공간을 밀어 이동할 수 있습니다. 자리 번호는 이웃 순서입니다.</p>
  </section>;
}
