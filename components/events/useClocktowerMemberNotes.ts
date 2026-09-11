"use client";

import { useState, useSyncExternalStore } from 'react';

type Note = { role: string; memo: string };
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('clocktower-member-notes', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('clocktower-member-notes', callback);
  };
}

export default function useClocktowerMemberNotes(roomId?: string, userId?: string) {
  const key = roomId && userId ? `clocktower:member-notes:${roomId}:${userId}` : '';
  const [failed, setFailed] = useState<{ key: string; raw: string } | null>(null);
  const raw = useSyncExternalStore(subscribe, () => {
    try { return key ? localStorage.getItem(key) ?? '{}' : '{}'; }
    catch { return '{}'; }
  }, () => '{}');
  let notes: Record<string, Note> = {};
  try {
    const parsed = JSON.parse(failed?.key === key ? failed.raw : raw);
    if (parsed && typeof parsed === 'object') {
      notes = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, Note] => {
        const value = entry[1] as Note | null;
        return !!value && typeof value.role === 'string' && typeof value.memo === 'string';
      }));
    }
  } catch { /* Invalid local data is treated as an empty notebook. */ }

  function update(id: string, value: Note) {
    if (!key) return;
    const next = JSON.stringify({ ...notes, [id]: value });
    try {
      localStorage.setItem(key, next);
      setFailed(null);
      window.dispatchEvent(new Event('clocktower-member-notes'));
    } catch { setFailed({ key, raw: next }); }
  }
  return { notes, update, error: failed?.key === key ? '저장하지 못했습니다. 닫기 전에 내용을 따로 복사해 주세요.' : '' };
}
