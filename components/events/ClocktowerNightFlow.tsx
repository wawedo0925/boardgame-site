"use client";
import { useEffect, useRef, useState } from 'react';
import { approveEffects, beginNight, emptyEngine, evil, nextTask, propose, taskRequest, FIRST_NIGHT, OTHER_NIGHTS, type NightEngine, type NightTask } from '@/lib/clocktower/night';
import type { LiveMember, LiveRequest, LiveState } from '@/lib/clocktower/live';
import ClocktowerPopup from './ClocktowerPopup';
import { ClocktowerName } from './ClocktowerSeating';
type Run=(action:string,data?:Record<string,unknown>)=>Promise<boolean>;
const button='rounded-xl border border-white/20 px-4 py-3 text-sm disabled:opacity-40';
const field='mt-2 w-full rounded-xl border border-white/15 bg-zinc-900 p-3 text-white';
export default function ClocktowerNightFlow({state,run,busy,allowPopup,error}:{state:LiveState;run:Run;busy:boolean;allowPopup:boolean;error:string}) {
  const room=state.room!;const members=state.members??[];
  const engine:NightEngine={...emptyEngine(),...state.engine};
  const version=state.engine_version??0;
  const [paused,setPaused]=useState(false);
  const [settings,setSettings]=useState(false);
  const attempted=useRef('');
  const current=state.requests?.find(q=>q.id===engine.active);
  const ready=!current||current.status==='CANCELLED'||(current.status==='RESOLVED'&&current.acknowledged);
  useEffect(()=>{
    if(room.phase!=='NIGHT'||busy||paused||settings)return;
    const key=`${room.night}:${version}`;
    if(attempted.current===key)return;
    if(engine.night===room.night&&(!ready||engine.finished))return;
    attempted.current=key;
    if(engine.night!==room.night){
      const started=beginNight(engine,room.night,members);
      if(!started.red_herring || (room.night===1&&!members.some(m=>m.user_id===started.red_herring&&!evil(m))))started.red_herring=members.find(m=>!evil(m))?.user_id;
      void run('engine_start',{version,state:started});
    }else{
      const updated=nextTask({...engine,cursor:engine.cursor+(current?1:0)},members);
      void run('engine_next',{version,state:updated,request:updated.finished?null:taskRequest(updated.tasks[updated.cursor])});
    }
  });
  if(room.phase==='ENDED')return null;
  const task=engine.tasks[engine.cursor];
  return <section className="space-y-4 rounded-3xl border border-violet-400/30 bg-violet-400/5 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">밤 시트 자동 진행</h2><button disabled={busy} className={button} onClick={()=>setSettings(!settings)}>{settings?'설정 닫기':'허상·취함·중독 설정'}</button></div>
    <p className="text-sm leading-6 text-zinc-400">밤을 시작하면 시트 순서로 요청합니다. 제안은 이야기꾼에게만 보이며, 전달을 승인한 뒤 멤버가 확인하면 다음 차례로 넘어갑니다. 자동 진행 중에는 이야기꾼 화면을 켜 두세요.</p>
    {settings&&<NightSettings key={version} engine={engine} members={members} locked={room.phase!=='SETUP'&&!!engine.red_herring} busy={busy} save={async updated=>{if(await run('engine_settings',{version,state:updated}))setSettings(false);}}/>}
    {room.phase==='NIGHT'&&<>
      <p className="text-sm text-violet-200">{room.night===1?'첫 번째 밤':'두 번째 밤부터 동일 순서'}: {(room.night===1?FIRST_NIGHT:OTHER_NIGHTS).join(' → ')} → 새벽</p>
      <div className="flex flex-wrap gap-2"><button className={button} onClick={()=>setPaused(!paused)}>{paused?'자동 진행 재개':'자동 진행 일시정지'}</button><button disabled={busy} className={button} onClick={()=>{attempted.current='';setPaused(false);void run('engine_settings',{version,state:engine});}}>연결 후 진행 재시도</button></div>
      {paused&&<p className="text-amber-200">자동 요청을 일시정지했습니다.</p>}
      {engine.night!==room.night?<p>밤 순서를 준비하고 있습니다.</p>:engine.finished?<p className="text-emerald-300">밤 시트 완료 · 낮 시작 버튼으로 사망을 공개하세요.</p>:<>
        <p className="font-bold">{engine.cursor+1} / {engine.tasks.length} · {task?.role} · {members.find(m=>m.user_id===task?.user_id)?.name}</p>
        {current?.status==='OPEN'&&<p>멤버가 대상을 선택하고 있습니다.</p>}
        {task&&current?.status==='SUBMITTED'&&<ProposalReview key={`${current.id}:${version}`} task={task} request={current} engine={engine} members={members} busy={busy} allowPopup={allowPopup} error={error} approve={(result,proposal)=>{const effects=approveEffects(task,current.targets,engine,members,proposal);return run('engine_approve',{version,request_id:current.id,result,...effects});}}/>}
        {current?.status==='RESOLVED'&&!current.acknowledged&&<><p className="text-violet-200">결과 전달 완료 · 멤버의 확인을 기다립니다.</p><button disabled={busy} className={button} onClick={()=>{if(confirm('멤버가 현장에서 결과를 확인했나요?'))void run('ack_offline',{request_id:current.id});}}>현장에서 확인 완료</button></>}
        {current&&['OPEN','SUBMITTED'].includes(current.status)&&<button disabled={busy} className={button} onClick={()=>{if(confirm('이 차례를 건너뛰나요? 능력 효과는 적용하지 않습니다.'))void run('cancel',{request_id:current.id});}}>예외 처리 · 이 차례 건너뛰기</button>}
      </>}
    </>}
  </section>;
}
function ProposalReview({task,request,engine,members,busy,allowPopup,error,approve}:{allowPopup:boolean;error:string;task:NightTask;request:LiveRequest;engine:NightEngine;members:LiveMember[];busy:boolean;approve:(result:string,p:ReturnType<typeof propose>)=>Promise<boolean>}){
  const [closed,setClosed]=useState(false);
  const [editing,setEditing]=useState(false);const [text,setText]=useState<string|null>(null);
  const [victim,setVictim]=useState<string|undefined>();const [successor,setSuccessor]=useState<string|undefined>();
  const [choosingReplacement,setChoosingReplacement]=useState(false);
  const proposal=propose(task,request.targets,engine,members,{victim,successor});
  const result=text??proposal.result;
  const choiceMissing=task.role==='임프'?proposal.requiresChoice:task.role==='점쟁이'&&!engine.red_herring?true:proposal.requiresChoice&&text===null;
  return <><button className={button} onClick={()=>setClosed(false)}>능력 결과 검토 열기</button>{allowPopup&&!closed&&<ClocktowerPopup title={`${task.role} · 결과 검토`} subtitle="이야기꾼 전용" busy={busy} onClose={()=>setClosed(true)}><div className="space-y-4">{error&&<p role="alert" className="text-red-300">{error}</p>}
    {request.targets.length>0&&<p className="text-sm">멤버 선택: {request.targets.map(id=>members.find(m=>m.user_id===id)?.name).join(', ')}</p>}
    <h3 className="font-bold text-violet-200">시스템 제안 · 이야기꾼만 볼 수 있습니다</h3>
    <ul className="space-y-2 text-sm leading-6 text-amber-200">{proposal.reason.map((reason,i)=><li key={i}>{reason}</li>)}</ul>
    <p aria-live="polite" className="rounded-xl bg-white/5 p-3 text-sm">{proposal.canRedirect&&victim===undefined?'시장 사망 여부와 대체 대상을 선택해 주세요.':`승인 시 반영: ${proposal.effect}`}</p>
    {task.role==='임프'&&proposal.canRedirect&&<div className="space-y-3 rounded-2xl border border-amber-300/30 p-4">
      <h4 className="font-bold text-amber-200">임프가 시장을 선택했습니다</h4>
      <p className="text-sm">시장을 사망시키겠습니까?</p>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} aria-pressed={victim===request.targets[0]} className={button} onClick={()=>{setVictim(request.targets[0]);setSuccessor(undefined);setChoosingReplacement(false);}}>시장 사망</button>
        <button disabled={busy} aria-pressed={choosingReplacement} className={button} onClick={()=>{setVictim(undefined);setSuccessor(undefined);setChoosingReplacement(true);}}>시장 생존 · 다른 플레이어 선택</button>
      </div>
      {choosingReplacement&&<div className="space-y-3">
        <p className="text-sm font-bold">시장 대신 공격받을 플레이어를 선택하세요</p>
        <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">{members.filter(m=>m.user_id!==request.targets[0]).map(m=><button key={m.user_id} disabled={busy} aria-pressed={victim===m.user_id} className={`${button} text-left ${victim===m.user_id?'border-violet-300 bg-violet-400/20':''}`} onClick={()=>{setVictim(m.user_id);setSuccessor(undefined);}}><span className="block font-bold">{m.seat}. {m.name}</span><span className="text-xs text-zinc-400">{m.actual_role}{m.alive?'':' · 이미 사망'}</span></button>)}</div>
        <p className="text-xs text-zinc-400">군인·수도사의 보호는 그대로 적용됩니다. 이미 사망한 사람을 선택해도 추가 사망은 없습니다.</p>
      </div>}
      <p className="text-xs text-zinc-400">대상 선택만으로 적용되지 않습니다. 판정을 확인한 뒤 아래 ‘확인하고 전달’을 누르세요.</p>
    </div>}
    {proposal.choices&&proposal.choices.length>1&&<label className="block">승계할 하수인<select className={field} value={successor??''} onChange={e=>setSuccessor(e.target.value)}><option value="">이야기꾼 선택 필요</option>{proposal.choices.map(m=><option key={m.user_id} value={m.user_id}>{m.name} · {m.actual_role}</option>)}</select></label>}
    <h4 className="text-sm font-bold">멤버에게 전달될 내용</h4>
    {editing?<textarea rows={6} maxLength={2000} className={field} value={result} onChange={e=>setText(e.target.value)}/>:<p className="whitespace-pre-wrap rounded-xl bg-violet-400/10 p-4">{result}</p>}
    <div className="flex flex-wrap gap-3"><button disabled={busy||!result.trim()||!!choiceMissing} className="rounded-xl bg-violet-400 px-4 py-3 font-bold text-zinc-950 disabled:opacity-40" onClick={()=>void approve(result,proposal)}>확인하고 전달</button><button disabled={busy} className={button} onClick={()=>{setEditing(!editing);if(!editing)setText(result);}}>{editing?'수정 내용 미리보기':'수정'}</button></div>
    <p className="text-xs text-zinc-500">답안 문구를 수정해도 위의 상태 반영 내용은 바뀌지 않습니다. 판정 상태는 설정에서 변경하세요.</p>
  </div></ClocktowerPopup>}</>;
}
function NightSettings({engine,members,locked,busy,save}:{engine:NightEngine;members:LiveMember[];locked:boolean;busy:boolean;save:(state:NightEngine)=>Promise<void>}){
  const [draft,setDraft]=useState(engine);
  return <div className="space-y-4 rounded-2xl border border-white/15 p-4"><label className="block text-sm">점쟁이의 허상 (게임 동안 고정)<select disabled={locked||busy} className={field} value={draft.red_herring??''} onChange={e=>setDraft({...draft,red_herring:e.target.value||undefined})}><option value="">첫 밤에 시스템이 선한 참가자 한 명 지정</option>{members.filter(m=>!evil(m)).map(m=><option key={m.user_id} value={m.user_id}>{m.name}</option>)}</select></label><p className="text-xs text-zinc-400">독살범의 중독과 수도사의 보호는 자동 반영됩니다. 아래 항목은 이야기꾼이 추가한 상태이며 각 상태의 종료 시점을 지정하세요. 실제 주정뱅이 역할은 기간이 지나도 바뀌지 않습니다.</p><div className="space-y-3">{members.map(m=><div key={m.user_id} className="flex flex-wrap items-center gap-3 text-sm"><span className="mr-auto"><ClocktowerName member={m}/></span>{(['drunk','poisoned'] as const).map(key=><label key={key} className="flex gap-2"><input disabled={busy} type="checkbox" checked={!!draft.conditions[m.user_id]?.[key]} onChange={e=>setDraft({...draft,conditions:{...draft.conditions,[m.user_id]:{...draft.conditions[m.user_id],[key]:e.target.checked}}})}/>{key==='drunk'?'취함':'중독'}<select disabled={busy||!draft.conditions[m.user_id]?.[key]} value={draft.conditions[m.user_id]?.[`${key}_until`]??0} onChange={e=>setDraft({...draft,conditions:{...draft.conditions,[m.user_id]:{...draft.conditions[m.user_id],[`${key}_until`]:Number(e.target.value)}}})}><option value={0}>직접 해제</option><option value={Math.max(1,engine.night+1)}>다음 밤 시작에 해제</option></select></label>)}</div>)}</div><button disabled={busy} className={button} onClick={()=>void save(draft)}>판정 설정 저장</button></div>;
}
