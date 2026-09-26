'use client';
import { useEffect, useRef, useState } from 'react';
import { advanceBmr, bmrProjection, startBmr, type BmrAuto, type BmrInput, type Decision } from '@/lib/clocktower/bmr-engine';
import { bmrExecutionCandidate } from '@/lib/clocktower/bmr';
import type { LiveState } from '@/lib/clocktower/live';
import ClocktowerPopup from './ClocktowerPopup';
type Props={state:LiveState;busy:boolean;error:string;run:(action:string,data?:Record<string,unknown>)=>Promise<boolean>};
const button='rounded-xl bg-violet-400 px-4 py-3 font-bold text-zinc-950 disabled:opacity-40';
const field='w-full rounded-xl border border-white/20 bg-zinc-900 p-3 text-white';

export default function ClocktowerBmrAutomatic({state,busy,error,run}:Props){
 const room=state.room!,engine=state.bmr?.auto;
 const [localError,setLocalError]=useState(''),[paused,setPaused]=useState(false);
 const [executionOpen,setExecutionOpen]=useState(false);
 const [hiddenDecision,setHiddenDecision]=useState('');
 const attempted=useRef('');
 const request=state.requests?.find(q=>q.bmr_options?.engine_key===engine?.waiting?.task.key&&q.night===room.night&&['OPEN','SUBMITTED'].includes(q.status));
 async function commit(next:BmrAuto,input?:BmrInput){
  const op=input?.type==='execution'?input:engine?.pending?.op.kind==='execution'?engine.pending.op:undefined;
  const qid=next.out.resolved?.id??(input?.type==='answer'?input.id:undefined);
  const q=state.requests?.find(q=>q.id===qid);
  const ok=await run('bmr_auto_commit',{auto:next,projection:bmrProjection(next),revision:room.flow_revision??0,bmr_revision:state.bmr_revision??0,
   ...(q?{request_id:q.id,targets:q.targets,answer:q.bmr_answer??{}}:{}),...(op?{operation:'execution',execution:op.target}:{})});
  if(!ok)setPaused(true);return ok;
 }
 async function dispatch(input:BmrInput){
  if(!engine)return;
  try{setLocalError('');const ok=await commit(advanceBmr(engine,input),input);if(ok)setExecutionOpen(false);}catch(e){setLocalError(e instanceof Error?e.message:'판정을 확인해 주세요.');setPaused(true);}
 }
 useEffect(()=>{
  if(busy||paused||room.phase!=='NIGHT'||engine?.pending||engine?.finished)return;
  if(engine?.waiting&&request?.status!=='SUBMITTED')return;
  const key=`${room.id}:${state.bmr_revision}:${request?.id??''}:${request?.status??''}`;
  if(attempted.current===key)return;attempted.current=key;
  const input:BmrInput=request?.status==='SUBMITTED'?{type:'answer',id:request.id,targets:request.targets,answer:request.bmr_answer}:{type:'tick'};
  void Promise.resolve().then(()=>commit(engine?advanceBmr(engine,input):startBmr(state.members??[]),input)).catch(e=>{setLocalError(e instanceof Error?e.message:'자동 판정 오류');setPaused(true);});
 // The persisted revision/request status is the idempotency boundary, not callback identity.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[busy,paused,room.id,room.phase,state.bmr_revision,request?.id,request?.status]);
 const pending=(state.requests??[]).some(q=>q.status==='OPEN'||q.status==='SUBMITTED'||q.status==='RESOLVED'&&!q.acknowledged)||(state.mission_progress??[]).some(m=>m.completed<m.total);
 const voting=(state.votes??[]).some(v=>['WAITING','RUNNING'].includes(v.status));
 const candidate=bmrExecutionCandidate((state.votes??[]).filter(v=>v.day===room.night));
 return <section className="space-y-4 rounded-3xl border border-violet-300/30 p-5">
  <h3 className="text-xl font-bold">피로 물든 달 · 자동 진행</h3>
  <p className="text-sm text-zinc-300">능력 선택 후 결과와 상태가 자동 반영됩니다. 이야기꾼의 선택이 필요한 순간에는 비공개 판정 창이 열립니다. 자동 진행 중에는 이 화면을 열어 두세요.</p>
  {(localError||error)&&<p role="alert" className="text-red-300">{localError||error}</p>}
  {paused&&<button className={button} disabled={busy} onClick={()=>{attempted.current='';setLocalError('');setPaused(false);}}>최신 상태로 다시 진행</button>}
  {room.phase==='NIGHT'&&<><p>{engine?.finished?'밤 판정 완료':engine?.pending?'이야기꾼 판정 대기':request?`${state.members?.find(m=>m.user_id===request.user_id)?.name} · 선택 대기`:'다음 차례 준비 중'}</p>
   {engine?.finished&&<button className={button} disabled={busy||pending} onClick={()=>void dispatch({type:'dawn'})}>낮 시작 · 사망/부활 공개</button>}
   {engine?.finished&&pending&&<p className="text-sm text-amber-200">참가자들이 받은 결과와 공통 미션을 확인하면 낮을 시작할 수 있습니다.</p>}
  </>}
  {room.phase==='DAY'&&engine&&<>
   {engine.players.filter(p=>p.role==='땜장이'&&p.life!=='DEAD').map(p=><button key={p.id} className={button} disabled={busy||voting} onClick={()=>{if(confirm(`${p.name}의 땜장이 능력으로 사망을 시도할까요?`))void dispatch({type:'tinker',target:p.id});}}>땜장이 · 사망 판정</button>)}
   {engine.executionPending?<button className={button} disabled={busy||!!engine.pending||(state.moon_choices??[]).some(c=>c.status==='OPEN')} onClick={()=>void dispatch({type:'moon_night'})}>달의 자손 선택 완료 · 다음 밤 시작</button>:room.day_stage==='PRIVATE'?<button className={button} disabled={busy||!!engine.pending} onClick={()=>void run('flow_next',{revision:room.flow_revision??0})}>전체 토론·지목 시작</button>:<button className={button} disabled={busy||voting||!!engine.pending} onClick={()=>setExecutionOpen(true)}>처형 확정 · 다음 단계</button>}
  </>}
  {engine&&<details><summary>자동 판정 기록</summary>{engine.log.map((line,i)=><p className="mt-2 text-sm text-zinc-300" key={i}>{line}</p>)}</details>}
  {engine?.pending&&hiddenDecision===`${state.bmr_revision}:${engine.pending.decision.key}`&&<button className={button} onClick={()=>setHiddenDecision('')}>이야기꾼 판정 계속하기</button>}
  {engine?.pending&&hiddenDecision!==`${state.bmr_revision}:${engine.pending.decision.key}`&&<DecisionPopup key={`${state.bmr_revision}:${engine.pending.decision.key}`} decision={engine.pending.decision} busy={busy} error={error||localError} close={()=>setHiddenDecision(`${state.bmr_revision}:${engine.pending!.decision.key}`)} decide={value=>dispatch({type:'choice',key:engine.pending!.decision.key,value})}/>}
  {executionOpen&&<ClocktowerPopup title="처형 확정" busy={busy} onClose={()=>setExecutionOpen(false)}><p className="my-4">처형 대상: {state.members?.find(m=>m.user_id===candidate)?.name??'없음'}</p><p className="mb-4 text-sm text-zinc-300">보호·생존 능력과 후속 효과를 자동으로 확인합니다. 평화주의자의 구제가 가능하면 별도 판정 창이 열립니다.</p><button className={button} disabled={busy||voting} onClick={()=>void dispatch({type:'execution',target:candidate})}>확정</button></ClocktowerPopup>}
 </section>;
}
function DecisionPopup({decision,busy,error,decide,close}:{decision:Decision;busy:boolean;error:string;decide:(value:string)=>Promise<void>;close:()=>void}){
 const [value,setValue]=useState(decision.initial??'');
 return <ClocktowerPopup title={decision.title} busy={busy} onClose={close}><p className="my-4 whitespace-pre-wrap text-sm text-zinc-300">{decision.description}</p>{decision.text?<form onSubmit={e=>{e.preventDefault();void decide(value);}}><textarea required maxLength={2000} className={field} rows={5} value={value} onChange={e=>setValue(e.target.value)}/><button disabled={busy||!value.trim()} className={`${button} mt-3`}>확정 · 비공개 전달</button></form>:<div className="grid gap-3">{decision.options.map(o=><button key={o.value} disabled={busy} className={button} onClick={()=>void decide(o.value)}>{o.label}</button>)}</div>}{error&&<p className="mt-3 text-red-300" role="alert">{error}</p>}<p className="mt-3 text-xs text-zinc-400">이 판정은 이야기꾼에게만 보입니다. 확정하면 상태를 반영하고 다음 차례로 이어집니다. 잠시 닫아도 판정은 유지됩니다.</p></ClocktowerPopup>;
}