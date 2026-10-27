'use client';
import { useState } from 'react';
import type { BmrAuto } from '@/lib/clocktower/bmr-engine';
import ClocktowerPopup from './ClocktowerPopup';

export default function ClocktowerBmrReview({engine,busy,error,allowPopup,approve,revise}:{engine:BmrAuto;busy:boolean;error:string;allowPopup:boolean;approve:(result:string|undefined,notices:string[])=>Promise<void>;revise:()=>Promise<void>}) {
 const review=engine.review!;
 const [closed,setClosed]=useState(false),[editing,setEditing]=useState(false);
 const [result,setResult]=useState(review.result),[notices,setNotices]=useState(review.notices.map(n=>n.result));
 const task=review.op.kind==='task'?review.op:undefined;
 const actor=engine.players.find(p=>p.id===task?.task.actor);
 const button='rounded-xl border border-white/20 px-4 py-3 text-sm disabled:opacity-40';
 const field='w-full rounded-xl border border-white/20 bg-zinc-900 p-3';
 const valid=(!task?.requestId||!!result.trim()&&result.length<=2000)&&notices.every(n=>!!n.trim()&&n.length<=2000);
 return <><button className={button} onClick={()=>setClosed(false)}>능력 결과 검토 열기</button>{allowPopup&&!closed&&<ClocktowerPopup title={`${task?.task.role}(${actor?.name}) · 결과 검토`} subtitle="이야기꾼 전용" busy={busy} onClose={()=>setClosed(true)}><div className="space-y-4">
 {!!task?.targets.length&&<p>멤버 선택: {task.targets.map(id=>{const p=engine.players.find(p=>p.id===id);return `${p?.name} (${p?.role})`;}).join(', ')}</p>}
 {task?.answer.character&&<p>선택 캐릭터: {task.answer.character}</p>}{task?.answer.pass&&<p>이번 능력 쉬기</p>}
 <h3 className="font-bold text-violet-200">시스템 제안 · 이야기꾼만 볼 수 있습니다</h3><div className="space-y-2 rounded-xl bg-white/5 p-4 text-sm text-amber-200">{review.changes.length?review.changes.map((s,i)=><p key={i}>{s}</p>):<p>추가 사망·상태 변경 없음</p>}</div>
 <p className="text-sm text-zinc-400">아직 적용되지 않았습니다. 아래 ‘확인하고 전달’을 누르면 효과를 반영하고 다음 차례로 넘어갑니다.</p>
 {!!Object.keys(review.answers).length&&<button disabled={busy} className={button} onClick={()=>void revise()}>이야기꾼 선택 다시 하기</button>}
 {task?.requestId&&<div className="space-y-2"><h4 className="font-bold">멤버에게 전달될 내용</h4>{editing?<textarea className={field} rows={3} maxLength={2000} value={result} onChange={e=>setResult(e.target.value)}/>:<p className="whitespace-pre-wrap rounded-xl bg-violet-400/10 p-4">{result}</p>}</div>}
 {review.notices.map((n,i)=><div key={i} className="space-y-2"><h4 className="font-bold">{engine.players.find(p=>p.id===n.user_id)?.name}에게 비공개 전달</h4>{editing?<textarea className={field} rows={4} maxLength={2000} value={notices[i]} onChange={e=>setNotices(notices.map((t,j)=>j===i?e.target.value:t))}/>:<p className="whitespace-pre-wrap rounded-xl bg-violet-400/10 p-4">{notices[i]}</p>}</div>)}
 {error&&<p role="alert" className="text-red-300">{error}</p>}
 <div className="flex flex-wrap gap-3"><button disabled={busy||!valid} className={`${button} bg-violet-400 font-bold text-zinc-950`} onClick={()=>void approve(task?.requestId?result:undefined,notices)}>확인하고 전달</button>{(task?.requestId||notices.length>0)&&<button disabled={busy} className={button} onClick={()=>setEditing(!editing)}>{editing?'수정 내용 미리보기':'수정'}</button>}</div><p className="text-xs text-zinc-500">전달 문구를 수정해도 위의 상태 반영 내용은 바뀌지 않습니다. 이 검토 내용은 참가자에게 보이지 않습니다.</p>
 </div></ClocktowerPopup>}</>;
}
