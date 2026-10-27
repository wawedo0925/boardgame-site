'use client';
import ClocktowerPhaseBar from './ClocktowerPhaseBar';
import { useEffect, useRef, useState } from 'react';
import { advanceBmr, bmrProjection, startBmr, withNightGossip, bmrSelectionStatus, type BmrAuto, type BmrInput, type Decision } from '@/lib/clocktower/bmr-engine';
import { bmrExecutionCandidate } from '@/lib/clocktower/bmr';
import type { LiveState } from '@/lib/clocktower/live';
import ClocktowerPopup from './ClocktowerPopup';
import ClocktowerReadiness from './ClocktowerReadiness';
import ClocktowerMemberChoices from './ClocktowerMemberChoices';
import { nextFlowLabel } from '@/lib/clocktower/flow';
import ClocktowerBmrReview from './ClocktowerBmrReview';
type Props={state:LiveState;busy:boolean;error:string;allowPopup:boolean;run:(action:string,data?:Record<string,unknown>)=>Promise<boolean>};
const button='rounded-xl bg-violet-400 px-4 py-3 font-bold text-zinc-950 disabled:opacity-40';
const field='w-full rounded-xl border border-white/20 bg-zinc-900 p-3 text-white';

export default function ClocktowerBmrAutomatic({state,busy,error,run,allowPopup}:Props){
 const room=state.room!,engine=state.bmr?.auto;
 const [localError,setLocalError]=useState(''),[paused,setPaused]=useState(false);
 const [hiddenDecision,setHiddenDecision]=useState('');
 const attempted=useRef('');
 const request=state.requests?.find(q=>q.bmr_options?.engine_key===engine?.waiting?.task.key&&q.night===room.night&&['OPEN','SUBMITTED'].includes(q.status));
 async function commit(next:BmrAuto,input?:BmrInput){
  const op=input?.type==='execution'?input:engine?.pending?.op.kind==='execution'?engine.pending.op:undefined;
  const qid=next.out.resolved?.id??(input?.type==='answer'?input.id:undefined);
  const q=state.requests?.find(q=>q.id===qid);
  const ok=await run(input?.type==='skip'?'bmr_skip':'bmr_auto_commit',{auto:next,projection:bmrProjection(next),revision:room.flow_revision??0,bmr_revision:state.bmr_revision??0,
   ...(input?.type==='approve'||input?.type==='revise'?{operation:input.type}:{}),...(q?{request_id:q.id,targets:q.targets,answer:q.bmr_answer??{}}:{}),...(op?{operation:'execution',execution:op.target}:{})});
  if(!ok)setPaused(true);return ok;
 }
 async function dispatch(input:BmrInput){
  if(!engine)return;
  try{setLocalError('');const ok=await commit(advanceBmr({...engine,reviewEnabled:true},input),input);if(ok)setPaused(false);}catch(e){setLocalError(e instanceof Error?e.message:'판정을 확인해 주세요.');setPaused(true);}
 }
 useEffect(()=>{
  if(busy||paused||room.phase!=='NIGHT'||engine?.pending||engine?.review||engine?.finished)return;
  if(engine?.waiting&&request?.status!=='SUBMITTED')return;
  const key=`${room.id}:${state.bmr_revision}:${request?.id??''}:${request?.status??''}`;
  if(attempted.current===key)return;attempted.current=key;
  const input:BmrInput=request?.status==='SUBMITTED'?{type:'answer',id:request.id,targets:request.targets,answer:request.bmr_answer}:{type:'tick'};
  void Promise.resolve().then(()=>commit(engine?advanceBmr(withNightGossip({...engine,reviewEnabled:true},state.gossip_declarations??[]),input):{...startBmr(state.members??[]),reviewEnabled:true,initialInformation:state.bmr?.information?.messages,initialGrandchildren:state.bmr?.information?.grandchildren},input)).catch(e=>{setLocalError(e instanceof Error?e.message:'자동 판정 오류');setPaused(true);});
 // The persisted revision/request status is the idempotency boundary, not callback identity.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[busy,paused,room.id,room.phase,state.bmr_revision,request?.id,request?.status]);
 const pending=(state.requests??[]).some(q=>q.status==='OPEN'||q.status==='SUBMITTED'||q.status==='RESOLVED'&&!q.acknowledged)||(state.mission_progress??[]).some(m=>m.completed<m.total);

 const unread=(state.requests??[]).filter(q=>q.status==='RESOLVED'&&!q.acknowledged);
 const voting=(state.votes??[]).some(v=>['WAITING','RUNNING'].includes(v.status));
 const candidate=bmrExecutionCandidate((state.votes??[]).filter(v=>v.day===room.night));
 return <section className="space-y-4 rounded-3xl border border-violet-300/30 p-5">
  <div className="flex items-center justify-between gap-3"><h3 className="text-xl font-bold">밤 시트 자동 진행</h3><button className="rounded-xl border border-white/20 px-4 py-3 text-sm" onClick={()=>setPaused(!paused)}>{paused?'자동 진행 재개':'자동 진행 일시정지'}</button></div>
  <p className="text-sm text-zinc-300">밤을 시작하면 시트 순서로 요청합니다. 제안은 이야기꾼에게만 보이며, 전달을 승인하면 효과를 반영하고 다음 차례로 넘어갑니다. 멤버의 결과는 확인할 때까지 남습니다. 낮으로 넘어가기 전에는 모두 확인해 주세요. 자동 진행 중에는 이야기꾼 화면을 켜 두세요.</p>
  {(localError||error)&&<p role="alert" className="text-red-300">{localError||error}</p>}
  {paused&&<button className={button} disabled={busy} onClick={()=>{attempted.current='';setLocalError('');setPaused(false);}}>최신 상태로 다시 진행</button>}
  {room.phase==='NIGHT'&&<><p>{engine?.finished?'밤 판정 완료':engine?.review?'이야기꾼 결과 검토 중':engine?.pending?'이야기꾼 판정 대기':request?`${state.members?.find(m=>m.user_id===request.user_id)?.name} · 선택 대기`:'다음 차례 준비 중'}</p>
   <ClocktowerPhaseBar><button className={button} disabled={busy||pending||!engine?.finished||!!engine?.pending||!!engine?.review} onClick={()=>{if(confirm('밤을 마치고 사망·부활을 공개하며 밀담을 시작할까요?'))void dispatch({type:'dawn'});}}>다음 페이즈 · {nextFlowLabel(state)}</button></ClocktowerPhaseBar>
   {engine&&<div className="space-y-2 rounded-2xl border border-white/15 p-4"><h4 className="font-bold">{engine.night}번째 밤 진행 현황 · 이야기꾼 전용</h4>{engine.tasks.map((t,i)=><p key={t.key} aria-current={i===engine.cursor&&!engine.finished?'step':undefined} className={i===engine.cursor&&!engine.finished?'rounded-xl border-2 border-violet-300 bg-violet-400/15 p-3 text-sm font-bold':'p-2 text-sm text-zinc-400'}>{t.role} ({engine.players.find(p=>p.id===t.actor)?.name}) · {i<engine.cursor||engine.finished?'처리 완료 또는 조건 없음':i>engine.cursor?'진행 전':engine.review?'이야기꾼 결과 검토 중':engine.pending?'이야기꾼 선택 대기':request?.status==='OPEN'?'멤버 선택 중':'요청 준비 중'}</p>)}</div>}
   {engine&&!engine.finished&&<button disabled={busy} className="rounded-xl border border-white/20 px-4 py-3 text-sm disabled:opacity-40" onClick={()=>{if(confirm('이 차례를 건너뛸까요? 능력 효과는 적용하지 않습니다.'))void dispatch({type:'skip'});}}>예외 처리 · 이 차례 건너뛰기</button>}
   <ClocktowerReadiness state={state} busy={busy}/>
  </>}
  {room.phase==='DAY'&&engine&&<>
   {engine.players.filter(p=>p.role==='땜장이'&&p.life!=='DEAD').map(p=><button key={p.id} className={button} disabled={busy||voting} onClick={()=>{if(confirm(`${p.name}의 땜장이 능력으로 사망을 시도할까요?`))void dispatch({type:'tinker',target:p.id});}}>땜장이 · 사망 판정</button>)}
   <ClocktowerPhaseBar>{engine.executionPending?<button className={button} disabled={busy||!!engine.review||!!engine.pending||(state.moon_choices??[]).some(c=>c.status==='OPEN')} onClick={()=>void dispatch({type:'moon_night'})}>다음 페이즈 · 다음 밤 시작</button>:room.day_stage==='PRIVATE'?<button className={button} disabled={busy||!!engine.pending||!!engine.review} onClick={()=>void run('flow_next',{revision:room.flow_revision??0})}>다음 페이즈 · 전체 토론·지목 시작</button>:<button className={button} disabled={busy||voting||!!engine.pending||!!engine.review} onClick={()=>{if(confirm(`처형 대상: ${state.members?.find(m=>m.user_id===candidate)?.name??'없음'}. 처형을 확정하고 다음 단계로 넘어갈까요?`))void dispatch({type:'execution',target:candidate});}}>다음 페이즈 · 처형 확정 · 다음 밤</button>}</ClocktowerPhaseBar>
  </>}
  {!!unread.length&&<details><summary>전달 완료 · 확인 대기 {unread.length}건</summary>{unread.map(q=><p className="mt-2 text-sm" key={q.id}>{state.members?.find(m=>m.user_id===q.user_id)?.name} · {q.prompt}</p>)}</details>}
  {engine&&<details><summary>자동 판정 기록</summary>{engine.log.map((line,i)=><p className="mt-2 text-sm text-zinc-300" key={i}>{line}</p>)}</details>}
  {engine?.pending&&hiddenDecision===`${state.bmr_revision}:${engine.pending.decision.key}`&&<button className={button} onClick={()=>setHiddenDecision('')}>이야기꾼 판정 계속하기</button>}
  {allowPopup&&engine?.pending&&hiddenDecision!==`${state.bmr_revision}:${engine.pending.decision.key}`&&<DecisionPopup key={`${state.bmr_revision}:${engine.pending.decision.key}`} engine={engine} decision={engine.pending.decision} busy={busy} error={error||localError} close={()=>setHiddenDecision(`${state.bmr_revision}:${engine.pending!.decision.key}`)} decide={value=>dispatch({type:'choice',key:engine.pending!.decision.key,value})}/>}
  {engine?.review&&<ClocktowerBmrReview key={`${room.id}:${state.bmr_revision}`} engine={engine} busy={busy} error={error||localError} allowPopup={allowPopup} approve={(result,notices)=>dispatch({type:'approve',result,notices})} revise={()=>dispatch({type:'revise'})}/>}
 </section>;
}
function DecisionPopup({engine,decision,busy,error,decide,close}:{engine:BmrAuto;decision:Decision;busy:boolean;error:string;decide:(value:string)=>Promise<void>;close:()=>void}){
 const [value,setValue]=useState(decision.initial??'');
 const memberOptions=decision.options.filter(o=>engine.players.some(p=>p.id===o.value));
 return <ClocktowerPopup title={decision.title} busy={busy} onClose={close}><p className="my-4 whitespace-pre-wrap text-sm text-zinc-300">{decision.description}</p>{decision.text?<form onSubmit={e=>{e.preventDefault();void decide(value);}}><textarea required maxLength={2000} className={field} rows={5} value={value} onChange={e=>setValue(e.target.value)}/><button disabled={busy||!value.trim()} className={`${button} mt-3`}>입력 완료 · 결과 검토</button></form>:<div className="space-y-3">{!!memberOptions.length&&<ClocktowerMemberChoices members={engine.players.map(p=>({id:p.id,name:p.name,role:p.role,...bmrSelectionStatus(engine,p)}))} allowed={memberOptions.map(o=>o.value)} busy={busy} onChoose={id=>void decide(id)}/>}<div className="grid gap-3">{decision.initial&&decision.options.some(o=>o.value===decision.initial)&&<button disabled={busy} className={button} onClick={()=>void decide(decision.initial!)}>기본 설정으로 진행 · {decision.options.find(o=>o.value===decision.initial)?.label}</button>}{decision.options.filter(o=>!memberOptions.includes(o)).map(o=><button key={o.value} disabled={busy} className={button} onClick={()=>void decide(o.value)}>{o.label}</button>)}</div></div>}{error&&<p className="mt-3 text-red-300" role="alert">{error}</p>}<p className="mt-3 text-xs text-zinc-400">이 판정은 이야기꾼에게만 보입니다. 밤 능력은 선택을 마친 뒤 결과 검토창에서 승인해야 반영됩니다. 잠시 닫아도 판정은 유지됩니다.</p></ClocktowerPopup>;
}