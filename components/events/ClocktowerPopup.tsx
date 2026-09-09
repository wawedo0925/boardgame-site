"use client";
import { useEffect, useId, useRef, type ReactNode } from 'react';

export default function ClocktowerPopup({title,subtitle,children,onClose,busy=false}:{title:string;subtitle?:string;children:ReactNode;onClose:()=>void;busy?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null);
  const titleRef=useRef<HTMLHeadingElement>(null);
  const id=useId();
  useEffect(()=>{
    const dialog=ref.current;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const overflow=document.body.style.overflow;
    dialog?.showModal();document.body.style.overflow='hidden';titleRef.current?.focus();
    return ()=>{dialog?.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
  },[]);
  return <dialog ref={ref} aria-labelledby={id} onCancel={e=>{e.preventDefault();if(!busy)onClose();}} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-3xl border border-violet-300/25 bg-zinc-950 p-0 text-white shadow-2xl backdrop:bg-black/80 backdrop:backdrop-blur-sm">
    <div className="flex max-h-[90dvh] flex-col"><header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4"><div>{subtitle&&<p className="mb-1 text-xs tracking-wider text-violet-300">{subtitle}</p>}<h2 ref={titleRef} tabIndex={-1} id={id} className="text-2xl font-bold outline-none">{title}</h2></div><button disabled={busy} aria-label="팝업 잠시 닫기" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-2xl hover:bg-white/10 disabled:opacity-40" onClick={onClose}>×</button></header><div className="min-h-0 overflow-y-auto overscroll-contain p-5">{children}</div></div>
  </dialog>;
}
