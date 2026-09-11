"use client";

import { useEffect, useRef } from 'react';
import ClocktowerPopup from './ClocktowerPopup';

export function vibrateNomination() {
  try {
    return typeof navigator.vibrate === 'function' && navigator.vibrate([200, 100, 200]);
  } catch {
    return false;
  }
}

export default function ClocktowerNominationAlert({ nominator, nominee, onClose }: { nominator: string; nominee: string; onClose: () => void }) {
  const alerted = useRef(false);
  useEffect(() => {
    if (alerted.current) return;
    alerted.current = true;
    vibrateNomination();
  }, []);

  return <ClocktowerPopup title="새 지목이 도착했습니다" subtitle="이야기꾼 안내" onClose={onClose}>
    <p className="text-xl leading-9"><strong>{nominator}</strong>님이 <strong className="text-violet-300">{nominee}</strong>님을 지목했습니다.</p>
    <p className="mt-4 leading-7 text-zinc-300">지목한 이유와 지목받은 사람의 최후 변론을 들은 뒤, 투표 시작 버튼을 눌러 주세요.</p>
    <button className="mt-6 w-full rounded-xl bg-violet-400 px-4 py-3 font-bold text-zinc-950" onClick={onClose}>확인 · 이유와 변론 듣기</button>
  </ClocktowerPopup>;
}
