"use client";

import { useEffect, useRef, useState } from 'react';
import ClocktowerPopup from './ClocktowerPopup';
import useClocktowerPinch from './useClocktowerPinch';
import ClocktowerPersonalNotes from './ClocktowerPersonalNotes';
import useClocktowerMemberNotes from './useClocktowerMemberNotes';
import { emptyEngine, type NightEngine } from '@/lib/clocktower/night';
import { seatingStatus } from '@/lib/clocktower/seating-status';
import type { LiveMember, LiveVote, SeatLayout } from '@/lib/clocktower/live';

export function birthYearLabel(value?: string | null) {
  const digits = value?.replace(/[^0-9]/g, '') ?? '';
  return /^(\d{2}|\d{4})$/.test(digits) ? `${digits.slice(-2)}년생` : '';
}

export function ClocktowerName({ member }: { member: { name: string; birth_year?: string | null } }) {
  const year = birthYearLabel(member.birth_year);
  return <span className="inline-flex max-w-full flex-wrap items-baseline justify-center gap-x-1.5"><span className="break-words">{member.name}</span>{year && <small className="text-[10px] font-normal text-zinc-400">{year}</small>}</span>;
}

const control = 'min-h-11 min-w-11 rounded-xl border border-white/20 px-3 py-2 text-sm disabled:opacity-40';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value / 10) * 10));
export function gridLayout(members: LiveMember[]): SeatLayout {
  const ordered = [...members].sort((a, b) => a.seat - b.seat);
  const columns = Math.min(5, Math.max(1, ordered.length));
  const rows = Math.ceil(ordered.length / columns);
  return Object.fromEntries(ordered.map((m, i) => [m.user_id, { x: 100 + (i % columns) * 800 / Math.max(1, columns - 1), y: rows === 1 ? 350 : 100 + Math.floor(i / columns) * 500 / (rows - 1) }]));
}

export default function ClocktowerSeating({ vote, onRecordVote, roomId, members, layout = {}, revision = 0, editable = false, busy = false, myId, swap, sync, save, onEditingChange, storyteller=false, onNominate, nominated=[], engine, phase='SETUP', night=0 }: {
  vote?: LiveVote; onRecordVote?: (voteId: string, userId: string, yes: boolean) => Promise<boolean>;
  roomId?: string;
  onNominate?:(id:string)=>Promise<boolean>;nominated?:string[];
  storyteller?:boolean;engine?:NightEngine;phase?:string;night?:number;
  members: LiveMember[]; layout?: SeatLayout; revision?: number; editable?: boolean; busy?: boolean; myId?: string;
  swap?: (first: LiveMember, second: LiveMember) => Promise<boolean>; sync?: () => void;
  onEditingChange?: (editing: boolean) => void;
  save?: (layout: SeatLayout, revision: number) => Promise<boolean>;
}) {
  const {notes: memberNotes, update: updateMemberNote, error: noteError} = useClocktowerMemberNotes(storyteller ? undefined : roomId, myId);
  const [nominee,setNominee]=useState<LiveMember|null>(null);
  const [view,setView]=useState<'map'|'list'>('map');
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<SeatLayout | null>(null);
  const [baseRevision, setBaseRevision] = useState(0);
  const [mode, setMode] = useState<'view' | 'move' | 'order'>('view');
  const [orderDraft, setOrderDraft] = useState<Record<string,number> | null>(null);
  const [swaps, setSwaps] = useState<[LiveMember,LiveMember][]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  busy = busy || savingOrder;
  const [showOrder, setShowOrder] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const [fit, setFit] = useState(0.7);
  const viewport = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const ordered = members.map(m=>({...m,seat:orderDraft?.[m.user_id]??m.seat})).sort((a, b) => a.seat - b.seat);
  const defaults = gridLayout(members);
  const positions = (editable ? draft : null) ?? Object.fromEntries(ordered.map(m => [m.user_id, layout[m.user_id] ?? defaults[m.user_id]]));
  const scale = zoom ?? (fit < 0.6 ? 1 : fit);
  const editing = editable && mode === 'move';
  const pinch = useClocktowerPinch(viewport, scale, setZoom, editing, () => { drag.current = null; });
  const tallying = storyteller && phase === 'DAY' && vote?.status === 'RUNNING' && !!onRecordVote;

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {if(element.clientWidth>0)setFit(Math.min(1, Math.max(0.2, element.clientWidth / 1160)));});
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const focusPosition = positions[myId ?? ''] ?? positions[ordered[0]?.user_id];
  const focusX = focusPosition?.x ?? 500;
  const focusY = focusPosition?.y ?? 350;
  useEffect(() => {
    if (zoom !== null || fit >= 0.6 || !viewport.current) return;
    const element = viewport.current;
    element.scrollLeft = Math.max(0, (focusX + 80) * scale - element.clientWidth / 2);
    element.scrollTop = Math.max(0, (focusY + 80) * scale - element.clientHeight / 2);
  }, [fit, zoom, scale, focusX, focusY]);

  useEffect(() => () => onEditingChange?.(false), [onEditingChange]);

  function point(clientX: number, clientY: number) {
    const rect = board.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  }
  function move(id: string, x: number, y: number) {
    setDraft(current => ({ ...(current ?? positions), [id]: { x: clamp(x, 60, 940), y: clamp(y, 40, 660) } }));
  }
  function cancel() { onEditingChange?.(false); setDraft(null); setOrderDraft(null); setSwaps([]); setMode('view'); setSelected(null); drag.current = null; }
  async function chooseOrder(member: LiveMember) {
    if (!editable || busy || mode !== 'order') return;
    const first = ordered.find(m => m.user_id === selected);
    if (!first) { setSelected(member.user_id); return; }
    if (first.user_id === member.user_id) { setSelected(null); return; }
    setOrderDraft(current=>({...current,[first.user_id]:member.seat,[member.user_id]:first.seat}));
    setSwaps(current=>[...current,[first,member]]);
    setSelected(null);
  }
  async function saveOrder() {
    if(busy||!swap)return;
    setSavingOrder(true);
    try {
      for(const [first,second] of swaps) {
        if(!await swap(first,second))return;
        setSwaps(current=>current.slice(1));
      }
      cancel();
    } finally {setSavingOrder(false);}
  }

  return <section className="rounded-3xl border border-violet-400/25 bg-violet-400/[0.025] p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">마을 자리 배치</h2><div className="flex flex-wrap gap-2">{roomId && myId && <ClocktowerPersonalNotes key={`${roomId}:${myId}`} roomId={roomId} userId={myId} />}{editable && sync && <button disabled={busy || mode !== 'view'} onClick={sync} className={control}>일정 참가자 불러오기</button>}</div></div>
    <p className="mt-3 text-sm leading-6 text-zinc-400">{editable ? '실제로 앉은 위치에 맞춰 카드를 자유롭게 배치하세요. 저장하면 참가자들에게도 같은 모양으로 보입니다.' : '실제 앉은 위치에 맞춰 이야기꾼이 배치한 자리입니다. 작게 보이면 확대해서 확인하세요.'}</p>
    <p className="mt-2 text-xs text-zinc-400">흰색: 생존 · 회색: 사망 · ●: 남은 투표권 · ○: 투표권 사용 완료{storyteller?' · 직업·상태·메모는 이야기꾼에게만 표시됩니다.':''}</p>
    {tallying && vote && <div className="mt-4 rounded-xl bg-violet-400/15 p-4"><p className="font-bold">{members.find(m=>m.user_id===vote.nominee)?.name} 처형 투표 · 찬성 {Object.values(vote.ballots).filter(Boolean).length}표 / 필요 {vote.threshold}표</p><p className="mt-2 text-sm">손 든 멤버의 카드를 누르면 찬성표로 집계됩니다. 다시 누르면 취소됩니다. 모두 확인한 뒤 위의 지목·투표 섹션에서 집계 완료를 눌러 주세요.</p></div>}
    {!storyteller && roomId && myId && <div className="mt-4 flex gap-2" role="group" aria-label="멤버 보기 방식"><button className={`${control} aria-pressed:bg-violet-400 aria-pressed:text-zinc-950 aria-pressed:font-bold`} aria-pressed={view==='map'} onClick={()=>setView('map')}>마을 배치</button><button className={`${control} aria-pressed:bg-violet-400 aria-pressed:text-zinc-950 aria-pressed:font-bold`} aria-pressed={view==='list'} onClick={()=>setView('list')}>멤버 목록</button></div>}
    {view==='list' && !storyteller && <div className="mt-4 space-y-3">
      <p className="text-sm text-zinc-400">멤버를 누르면 예상 역할과 개인 메모를 작성할 수 있습니다. 본인이 적은 내용만 표시됩니다.</p>
      {!ordered.length && <p className="py-6 text-center text-zinc-400">아직 배정된 참가자가 없습니다.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">{ordered.map(member=>{
        const note=memberNotes[member.user_id];
        return <li key={member.user_id} className="min-w-0"><button type="button" onClick={()=>setNominee(member)} aria-label={member.name+' · 예상 역할과 개인 메모'} className={`w-full min-w-0 rounded-2xl border p-4 text-left ${member.alive?'border-white bg-white text-zinc-950':'border-zinc-600 bg-zinc-800 text-zinc-300'}`}>
          <span className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-lg font-bold">{member.name}<small className="ml-2 text-xs font-normal opacity-60">{birthYearLabel(member.birth_year).replace('년생','')}</small></span><span className="text-xs opacity-70">{member.seat}번 · {member.user_id===myId?'나 · ':''}{member.alive?'생존':'사망'}</span></span>
          <span className={`mt-2 block break-words text-base font-semibold ${member.alive?'text-violet-700':'text-violet-300'}`}>예상 역할: {note?.role.trim() || '아직 작성하지 않았어요'}</span>
          <span className="mt-2 block whitespace-pre-wrap break-words text-sm opacity-80 line-clamp-2">{note?.memo.trim() || '눌러서 개인 메모 작성하기'}</span>
          {!member.alive && <span className="mt-2 block text-xs">{member.ghost_vote_used===undefined?'투표권 확인 중':member.ghost_vote_used?'○ 투표권 없음':'● 투표권 1표'}</span>}
          {nominated.includes(member.user_id)&&<span className="mt-2 block text-xs">오늘 지목받음</span>}
        </button></li>;
      })}</ul>
    </div>}
    <div hidden={view==='list' && !storyteller}>
    {editable && <div className="mt-4 flex flex-wrap gap-2">
      {mode === 'view' ? <><button disabled={busy || !members.length} className="rounded-xl bg-violet-400 px-4 py-3 text-sm font-bold text-zinc-950 disabled:opacity-40" onClick={() => { onEditingChange?.(true); setDraft(positions); setBaseRevision(revision); setMode('move'); setZoom(Math.max(fit, 0.7)); }}>배치 편집</button><button disabled={busy || members.length < 2} className={control} onClick={() => { onEditingChange?.(true); setOrderDraft(Object.fromEntries(members.map(m=>[m.user_id,m.seat]))); setSwaps([]); setSelected(null); setMode('order'); setShowOrder(true); setZoom(Math.max(fit, 0.7)); }}>이웃 순서 바꾸기</button></> : <>
        {editing && <><button disabled={busy} className="rounded-xl bg-violet-400 px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-40" onClick={async () => { if (draft && await save?.(draft, baseRevision)) cancel(); }}>배치 저장</button><button disabled={busy} className={control} onClick={() => { setDraft(gridLayout(members)); setSelected(null); }}>줄 맞추기</button></>}
        {mode === 'order' && <button disabled={busy} className={control} onClick={() => void saveOrder()}>순서 저장</button>}
        <button disabled={busy} className={control} onClick={cancel}>취소</button>
      </>}
    </div>}
    {editing && <p role="status" className="mt-3 text-sm text-violet-200">카드를 끌어 놓거나, 카드를 누른 뒤 빈 곳을 누르세요. 선택한 카드는 방향키로도 이동할 수 있습니다. 저장 전에는 본인 화면에만 보입니다.</p>}
    {editable && mode === 'order' && <p role="status" className="mt-3 text-sm text-violet-200">두 사람씩 계속 선택해 순서를 바꾸세요. 저장을 누르면 변경 사항이 반영되고 편집이 종료됩니다.</p>}
    <div className="mt-4 flex flex-wrap items-center gap-2"><button className={control} onClick={() => setZoom(fit)}>전체 보기</button><button className={control} onClick={() => setZoom(1)}>읽기 편하게</button><button className={control} onClick={() => setZoom(Math.max(0.25, scale - 0.15))} aria-label="배치 축소">−</button><span className="w-12 text-center text-xs text-zinc-400">{Math.round(scale * 100)}%</span><button className={control} onClick={() => setZoom(Math.min(2.5, scale + 0.15))} aria-label="배치 확대">＋</button><label className="ml-auto flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={showOrder} onChange={e => setShowOrder(e.target.checked)} />이웃 연결선</label></div>
    <div ref={viewport} {...pinch} className="mt-4 overflow-auto rounded-2xl border border-white/10 bg-zinc-950" style={{ maxHeight: 'min(70dvh, 750px)', touchAction: 'none' }}>
      {!ordered.length ? <p className="p-10 text-center text-zinc-400">아직 배정된 참가자가 없습니다.</p> : <div style={{ width: 1160 * scale, height: 860 * scale }} className="relative">
        <div ref={board} data-testid="seating-board" className="absolute origin-top-left" style={{ left:80*scale,top:80*scale,width: 1000, height: 700, transform: `scale(${scale})`, backgroundImage: 'radial-gradient(#ffffff16 1px, transparent 1px)', backgroundSize: '20px 20px' }} onClick={e => { if (editing && !busy && selected) { const p = point(e.clientX, e.clientY); move(selected, p.x, p.y); setSelected(null); } }}>
          {showOrder && ordered.length > 1 && <svg width="1000" height="700" className="pointer-events-none absolute inset-0" aria-hidden="true">{ordered.map((member, i) => { const a = positions[member.user_id], b = positions[ordered[(i + 1) % ordered.length].user_id]; return <line key={member.user_id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#a78bfa" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="6 6" />; })}</svg>}
          {ordered.map(member => {
            const pos = positions[member.user_id];
            const voted = vote?.ballots[member.user_id] === true;
            const flags=storyteller?seatingStatus(member,members,engine??emptyEngine(),phase,night):[];
            const className = `absolute flex w-max max-w-[160px] flex-col items-center justify-center rounded-xl border-2 px-3 py-2 text-center text-sm font-semibold ${member.alive?'border-white bg-white text-zinc-950':'border-zinc-600 bg-zinc-800 text-zinc-400'} ${selected===member.user_id?'z-10 ring-4 ring-violet-400':member.user_id===myId?'ring-2 ring-violet-400':''}`;
            const style = { left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' };
            const year=birthYearLabel(member.birth_year).replace('년생','');
            const content = <><span className="mb-1 block text-[10px] opacity-70">{member.seat}번{member.user_id===myId?' · 내 자리':''} · {member.alive?'생존':'사망'}</span><span className="relative inline-block mx-3 max-w-[100px] text-lg font-bold leading-7"><span className="break-all">{member.name}</span>{year&&<small aria-label={`${year}년생`} className="absolute left-full top-0 ml-1 text-[10px] font-normal opacity-60">{year}</small>}</span>
              {tallying&&<span className={`mt-1 rounded-md px-2 py-1 text-xs ${voted?'bg-violet-600 text-white':'bg-zinc-200 text-zinc-700'}`}>{voted?'✓ 찬성':!member.alive&&member.ghost_vote_used?'투표권 없음':'기권'}</span>}
              {!storyteller&&memberNotes[member.user_id]?.role.trim()&&<span className="mt-1 max-w-full break-words text-xs text-violet-600">예상: {memberNotes[member.user_id].role}</span>}
              {!member.alive&&<span className="mt-2 rounded-full border border-zinc-500 px-2 py-0.5 text-[10px]">{member.ghost_vote_used===undefined?'투표권 확인 중':member.ghost_vote_used?'○ 투표권 없음':'● 투표권 1표'}</span>}
              {storyteller&&<><span className="mt-1 text-xs font-bold">{member.actual_role||'역할 미배정'}</span>{member.actual_role!==member.shown_role&&member.shown_role&&<span className="text-[10px] opacity-70">본인 표시: {member.shown_role}</span>}<span className="mt-1 flex flex-wrap justify-center gap-1 empty:hidden">{flags.map(flag=><span key={flag} className={`rounded-md px-1.5 py-0.5 text-[10px] ${member.alive?(flag==='중독'?'bg-emerald-100 text-emerald-900':flag==='취함'?'bg-amber-100 text-amber-900':'bg-violet-100 text-violet-900'):'bg-zinc-700 text-zinc-300'}`}>{flag}</span>)}</span>{member.notes&&<span className="mt-1 line-clamp-2 break-all text-[10px] font-normal opacity-70">{member.notes}</span>}</>}
            </>;
            return editable && mode !== 'view' ? <button key={member.user_id} data-testid={`seat-${member.user_id}`} title={storyteller?`${member.name} · ${member.actual_role??'미배정'} · ${flags.join(' / ')}${member.notes?` · ${member.notes}`:''}`:member.name} style={{ ...style, touchAction: editing ? 'none' : 'auto' }} className={`${className} ${editing ? 'cursor-grab active:cursor-grabbing' : ''} disabled:opacity-50`} aria-pressed={selected === member.user_id} disabled={busy}
              onClick={e => { e.stopPropagation(); if (mode === 'order') void chooseOrder(member); }}
              onPointerDown={e => { if (!editing || busy) return; e.stopPropagation(); const p = point(e.clientX, e.clientY); drag.current = { id: member.user_id, dx: p.x - pos.x, dy: p.y - pos.y }; setSelected(member.user_id); e.currentTarget.setPointerCapture(e.pointerId); }}
              onPointerMove={e => { if (!editing || busy || drag.current?.id !== member.user_id) return; const p = point(e.clientX, e.clientY); move(member.user_id, p.x - drag.current.dx, p.y - drag.current.dy); }}
              onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
              onKeyDown={e => { if (!editing || busy) return; const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key]; if (delta) { e.preventDefault(); setSelected(member.user_id); move(member.user_id, pos.x + delta[0], pos.y + delta[1]); } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(member.user_id); } }}
            >{content}</button> : tallying && vote ? <button key={member.user_id} aria-pressed={voted} aria-label={`${member.name} · ${voted?'찬성 취소':'찬성으로 집계'}`} disabled={busy||!vote.voter_order.includes(member.user_id)||(!member.alive&&member.ghost_vote_used&&!voted)} className={`${className} ${voted?'outline outline-4 outline-violet-500':''} disabled:cursor-not-allowed`} style={style} onClick={()=>void onRecordVote?.(vote.id,member.user_id,!voted)}>{content}</button> : !storyteller && roomId && myId ? <button key={member.user_id} title={`${member.name} · 예상 역할과 메모`} className={`${className} disabled:cursor-not-allowed`} style={style} onClick={()=>setNominee(member)}>{content}{nominated.includes(member.user_id)&&<span className="mt-1 text-[10px]">오늘 지목받음</span>}</button> : <div key={member.user_id} title={member.name} className={className} style={style}>{content}</div>;
          })}
        </div>
      </div>}
    </div>
    <p className="mt-2 text-xs text-zinc-500">두 손가락을 벌리거나 오므려 확대·축소하고, 한 손가락으로 밀어 이동하세요. 자리 번호는 이웃 순서입니다.</p>
    </div>
    {nominee&&!storyteller&&<ClocktowerPopup title={`${nominee.name} · 개인 메모`} onClose={()=>setNominee(null)}>
      <p className="mb-4 text-sm leading-6 text-zinc-400">본인에게만 보이는 예상과 메모입니다. 이 게임·계정별로 현재 브라우저에 자동 저장되며, 다른 기기로 동기화되지 않습니다.</p>
      <label className="block text-sm font-semibold">예상 역할<input maxLength={60} value={memberNotes[nominee.user_id]?.role??''} onChange={e=>updateMemberNote(nominee.user_id,{role:e.target.value,memo:memberNotes[nominee.user_id]?.memo??''})} placeholder="예: 점쟁이, 수사관 또는 임프?" className="mt-2 w-full rounded-xl border border-white/20 bg-zinc-900 p-3 text-base"/></label>
      <label className="mt-4 block text-sm font-semibold">추가 메모<textarea maxLength={10000} value={memberNotes[nominee.user_id]?.memo??''} onChange={e=>updateMemberNote(nominee.user_id,{role:memberNotes[nominee.user_id]?.role??'',memo:e.target.value})} placeholder="이 사람이 말한 정보, 의심되는 점 등을 적어 보세요." className="mt-2 min-h-40 w-full rounded-xl border border-white/20 bg-zinc-900 p-3 text-base"/></label>
      <p role={noteError?'alert':'status'} className={`mt-2 text-sm ${noteError?'text-amber-300':'text-zinc-400'}`}>{noteError||'자동 저장됨'}</p>
      <div className="mt-5 flex flex-wrap gap-3"><button className={control} onClick={()=>setNominee(null)}>닫기</button><button disabled={busy||!onNominate||nominated.includes(nominee.user_id)} className={control} onClick={async()=>{if(onNominate&&confirm(`${nominee.name}님을 지목할까요?`)&&await onNominate(nominee.user_id))setNominee(null);}}>지목하기</button></div>
      <p className="mt-3 text-xs leading-6 text-zinc-400">지목은 전체 토론·지목 단계에서만 가능합니다. 다른 지목·투표가 진행 중이거나 오늘 지목권을 사용했거나 사망한 경우에는 할 수 없습니다. 이미 지목받은 사람도 다시 지목할 수 없습니다.</p>
    </ClocktowerPopup>}
  </section>;
}
