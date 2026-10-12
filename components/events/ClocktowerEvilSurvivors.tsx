"use client";
import { useState } from 'react';
import type { LiveState } from '@/lib/clocktower/live';
import ClocktowerPopup from './ClocktowerPopup';

type Props = { state:LiveState; run:(action:string,data?:Record<string,unknown>)=>Promise<boolean>; busy:boolean; error:string; allowPopup:boolean };
export default function ClocktowerEvilSurvivors({state,run,busy,error,allowPopup}:Props) {
 const [closed,setClosed]=useState('');
 const [reopened,setReopened]=useState('');
 const key=state.evil_survivors;
 if(!state.is_host||!key)return null;
 const show=allowPopup&&(closed!==key||reopened===key);
 const later=()=>{setClosed(key);setReopened('');};
 return <section className="my-4 rounded-2xl border border-amber-300/30 p-4">
  <p>악 팀만 생존했습니다. 이야기꾼이 승리 여부를 확인해 주세요.</p>
  <button className="mt-3 rounded-xl border border-white/20 px-4 py-3" onClick={()=>setReopened(key)}>승리 판정 열기</button>
  {show&&<ClocktowerPopup title="악 팀 승리로 종료할까요?" subtitle="이야기꾼 전용" busy={busy} onClose={later}>
   <p className="leading-7">현재 실제 생존자는 모두 악 팀입니다. 남은 능력이나 진행 상황을 확인한 뒤 종료를 결정해 주세요.</p>
   {state.room?.script==='BMR'&&<p className="mt-3 text-sm text-amber-200">부활 등으로 선한 팀이 다시 승리할 가능성도 확인해 주세요. 좀비얼의 위장 사망은 실제 생존으로 계산합니다.</p>}
   <p className="mt-3 text-sm text-zinc-400">종료하면 악 팀 승리와 플레이 결과가 저장됩니다. 계속 진행하면 같은 상황에서는 다시 묻지 않습니다.</p>
   {error&&<p role="alert" className="mt-3 text-red-300">{error}</p>}
   <div className="mt-5 flex flex-wrap gap-3">
    <button disabled={busy} className="rounded-xl border border-white/20 px-4 py-3 disabled:opacity-40" onClick={()=>void run('evil_survivors_continue',{key})}>계속 진행</button>
    <button disabled={busy} className="rounded-xl bg-violet-400 px-4 py-3 font-bold text-zinc-950 disabled:opacity-40" onClick={()=>void run('evil_survivors_end',{key})}>악 팀 승리로 종료</button>
   </div>
  </ClocktowerPopup>}
 </section>;
}
