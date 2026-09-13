"use client";

import { useEffect, useState } from 'react';

export default function ClocktowerPrivateRole({role}:{role?:string|null}) {
  const [held,setHeld]=useState(false);
  useEffect(()=>{
    const hide=()=>setHeld(false);
    const visibility=()=>{if(document.visibilityState!=='visible')hide();};
    window.addEventListener('blur',hide);
    window.addEventListener('pointerup',hide);
    window.addEventListener('pointercancel',hide);
    document.addEventListener('visibilitychange',visibility);
    return ()=>{
      window.removeEventListener('blur',hide);
      window.removeEventListener('pointerup',hide);
      window.removeEventListener('pointercancel',hide);
      document.removeEventListener('visibilitychange',visibility);
    };
  },[]);
  return <button type="button" disabled={!role} aria-label="누르고 있는 동안 내 역할 보기" aria-pressed={held}
    className="mt-3 flex min-h-28 w-full select-none items-center justify-center rounded-2xl border border-violet-300/30 bg-violet-400/10 p-5 text-center text-violet-200 disabled:text-zinc-400"
    style={{touchAction:'none',WebkitTouchCallout:'none',WebkitUserSelect:'none'}}
    onPointerDown={e=>{if(!role||!e.isPrimary||e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);setHeld(true);}}
    onPointerMove={e=>{const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)setHeld(false);}}
    onPointerUp={()=>setHeld(false)} onPointerCancel={()=>setHeld(false)} onLostPointerCapture={()=>setHeld(false)} onPointerLeave={()=>setHeld(false)}
    onBlur={()=>setHeld(false)} onContextMenu={e=>e.preventDefault()}
    onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!e.repeat&&role)setHeld(true);}}}
    onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();setHeld(false);}}}>
    {held&&role?<span className="text-3xl font-bold">{role}</span>:<span className="text-base font-semibold">{role?'누르고 있는 동안만 역할이 보여요':'이야기꾼이 준비하고 있습니다'}</span>}
  </button>;
}
