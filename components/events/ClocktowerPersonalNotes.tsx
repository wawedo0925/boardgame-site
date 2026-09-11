"use client";

import { useState } from 'react';
import ClocktowerPopup from './ClocktowerPopup';

export default function ClocktowerPersonalNotes({ roomId, userId }: { roomId: string; userId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const storageKey = `clocktower:personal-notes:${roomId}:${userId}`;

  function show() {
    try {
      setText(localStorage.getItem(storageKey) ?? '');
      setError('');
    } catch {
      setError('브라우저 저장소를 사용할 수 없습니다. 닫기 전에 내용을 따로 복사해 주세요.');
    }
    setOpen(true);
  }

  function update(value: string) {
    setText(value);
    try {
      localStorage.setItem(storageKey, value);
      setError('');
    } catch {
      setError('저장하지 못했습니다. 닫기 전에 내용을 따로 복사해 주세요.');
    }
  }

  return <>
    <button className="rounded-xl border border-white/20 px-3 py-2 text-sm" onClick={show}>내 메모</button>
    {open && <ClocktowerPopup title="내 메모" subtitle="이번 게임의 개인 메모" onClose={() => setOpen(false)}>
      <p className="mb-4 text-sm leading-6 text-zinc-400">입력하면 이 브라우저에 자동 저장됩니다. 이야기꾼이나 다른 플레이어에게 공유되지 않습니다. 다른 기기에서는 볼 수 없으며 브라우저 데이터를 지우면 삭제됩니다.</p>
      <label htmlFor="clocktower-personal-notes" className="mb-2 block text-sm font-semibold">추리·대화 기록</label>
      <textarea id="clocktower-personal-notes" value={text} onChange={event => update(event.target.value)} maxLength={20000} placeholder="들은 역할, 밤에 받은 정보, 의심되는 사람 등을 자유롭게 적어 보세요." className="min-h-64 w-full resize-y rounded-xl border border-white/20 bg-zinc-900 p-4 text-base leading-7 text-white" />
      <p role={error ? 'alert' : 'status'} className={`mt-2 text-sm ${error ? 'text-amber-300' : 'text-zinc-400'}`}>{error || '자동 저장됨'} · {text.length.toLocaleString()}/20,000자</p>
      <button className="mt-4 w-full rounded-xl bg-violet-400 px-4 py-3 font-bold text-zinc-950" onClick={() => setOpen(false)}>닫기</button>
    </ClocktowerPopup>}
  </>;
}
