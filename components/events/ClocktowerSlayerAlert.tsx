"use client";

import { useEffect, useRef, type ReactNode } from 'react';
import ClocktowerPopup from './ClocktowerPopup';
import { vibrateNomination } from './ClocktowerNominationAlert';

export default function ClocktowerSlayerAlert({actor,target,children,onClose,busy}:{actor:string;target:string;children:ReactNode;onClose:()=>void;busy:boolean}) {
  const alerted=useRef(false);
  useEffect(()=>{
    if(alerted.current)return;
    alerted.current=true;
    vibrateNomination();
  },[]);
  return <ClocktowerPopup title="처단자 사용 선언이 도착했습니다" subtitle="이야기꾼 판정 요청" busy={busy} onClose={onClose}>
    <p className="mb-5 text-xl leading-9"><strong>{actor}</strong>님이 <strong className="text-violet-300">{target}</strong>님을 대상으로 처단자 사용을 선언했습니다.</p>
    <div className="space-y-4">{children}</div>
    <button className="mt-5 min-h-11 w-full rounded-xl border border-white/20 p-3 disabled:opacity-40" disabled={busy} onClick={onClose}>확인 · 판정은 잠시 후</button>
  </ClocktowerPopup>;
}
