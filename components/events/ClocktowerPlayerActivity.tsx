"use client";
import { useState } from 'react';
import type { LiveState } from '@/lib/clocktower/live';
import ClocktowerPopup from './ClocktowerPopup';
import { ClocktowerName } from './ClocktowerSeating';
import ClocktowerNightActivity from './ClocktowerNightActivity';

const button='min-h-12 rounded-xl bg-violet-400 px-5 py-3 font-bold text-zinc-950 disabled:opacity-40';
export default function ClocktowerPlayerActivity({state,run,busy,allowPopup,error}:{state:LiveState;run:(action:string,data?:Record<string,unknown>)=>Promise<boolean>;busy:boolean;allowPopup:boolean;error:string}) {
  const [confirmedPrivate,setConfirmedPrivate]=useState<string[]>([]);
  const [dismissed,setDismissed]=useState<string[]>([]);
  const members=state.members??[];
  const requests=(state.requests??[]).filter(q=>q.night===state.room?.night);
  const actionable=requests.filter(q=>q.status==='OPEN'||(q.status==='RESOLVED'&&!q.acknowledged&&!confirmedPrivate.includes(q.id)));
  const missions=(state.missions??[]).filter(m=>!m.completed);
  const activeNight=state.room?.phase==='NIGHT';
  const q=activeNight?actionable.find(q=>!dismissed.includes(`request:${q.id}:${q.status}`)):undefined;
  const mission=activeNight&&!q?missions.find(m=>!dismissed.includes(`mission:${m.id}`)):undefined;
  const key=q?`request:${q.id}:${q.status}`:mission?`mission:${mission.id}`:'';
  const privateResult=!!q&&(q.private_once||q.prompt.startsWith('첩자 · '));
  const close=()=>{setDismissed([...dismissed,key])};
  const reopen=(key:string)=>{setDismissed(dismissed.filter(k=>k!==key))};
  const name=(id:string)=>{const member=members.find(m=>m.user_id===id);return member?<ClocktowerName member={member}/>:<span>참가자</span>;};
  return <section className="space-y-4">
    {activeNight&&<div className="rounded-2xl border border-violet-300/25 bg-violet-400/5 p-5"><h3 className="font-bold text-violet-200">밤 활동</h3><p className="mt-2 text-sm leading-6 text-zinc-400">화면을 계속 확인해 주세요. 밤 시작 직후 첫 미션이 도착하고, 밤 동안 추가 미션이 무작위로 도착합니다. 잠시 닫은 활동은 아래 버튼으로 다시 열 수 있습니다.</p>
      <div className="mt-3 flex flex-wrap gap-2">{actionable.map(q=><button key={q.id} className={button} onClick={()=>reopen(`request:${q.id}:${q.status}`)}>{q.status==='RESOLVED'?'도착한 결과 확인':'능력 요청 열기'}</button>)}{missions.map(m=><button key={m.id} className={button} onClick={()=>reopen(`mission:${m.id}`)}>공통 미션 {m.round} 열기</button>)}</div>
      {!actionable.length&&!missions.length&&<p className="mt-3 text-sm">{requests.some(q=>q.status==='SUBMITTED')?'이야기꾼이 제출한 선택을 확인하고 있습니다.':'다음 활동을 기다리고 있습니다.'}</p>}
      {!!state.missions?.length&&<p className="mt-3 text-xs text-zinc-500">공통 미션 {state.missions.filter(m=>m.completed).length}/{state.missions.length} 완료</p>}
    </div>}
    {allowPopup&&(q||mission)&&<ClocktowerPopup key={key} title='밤 활동' subtitle={`${state.room?.night}일차 · 나에게 온 안내`} onClose={close} busy={busy||privateResult}>
      {error&&<p role="alert" className="mb-4 rounded-xl bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
      {q&&<ClocktowerNightActivity key={key} id={key}
        prompt={q.status==='RESOLVED'?'도착한 안내를 확인해 주세요.':q.prompt}
        message={q.status==='RESOLVED'?q.result:undefined}
        members={members.filter(m=>q.allow_self||m.user_id!==state.my_id)}
        count={q.status==='RESOLVED'?0:q.target_count} busy={busy}
        onConfirm={async targets=>{
          if(q.status==='RESOLVED'){
            if(await run('ack',{request_id:q.id})&&privateResult)setConfirmedPrivate(ids=>[...ids,q.id]);
          }else await run('reply',{request_id:q.id,targets});
        }}>
        {q.status==='RESOLVED'&&privateResult&&<p className="text-sm text-amber-200">메모하지 말고 기억해 주세요. 아래 확인 버튼을 눌러야 다음 차례로 넘어갑니다. 확인 후 이 내용은 다시 볼 수 없고, 다음 밤 능력 차례에 새 정보를 받습니다.</p>}
      </ClocktowerNightActivity>}
      {mission&&<ClocktowerNightActivity key={key} id={key} seconds={mission.challenge.delay_seconds}
        prompt={mission.kind==='SELECT'?(mission.challenge.text??'참가자 한 명을 선택해 주세요.'):'도착한 안내를 확인해 주세요.'}
        message={mission.kind==='SELECT'?undefined:(mission.kind==='NOTICE'?mission.challenge.text:'화면을 계속 확인해 주세요.')}
        members={members} count={mission.kind==='SELECT'?1:0} busy={busy}
        onConfirm={async targets=>{await run('mission_complete',{mission_id:mission.id,answer:mission.kind==='SELECT'?targets[0]:mission.kind==='NOTICE'?'ACK':mission.kind==='NUMBERS'?[...(mission.challenge.tiles??[])].sort((a,b)=>a-b).join(','):mission.challenge.text});}}
      />}
      {!privateResult&&<p className="mt-4 text-center text-xs text-zinc-500">팝업을 닫아도 제출·확인 처리되지 않습니다.</p>}
    </ClocktowerPopup>}
    <details className="rounded-2xl border border-white/10 p-5"><summary>내 요청·결과 기록</summary><div className="mt-4 space-y-3">{state.requests?.filter(q=>!q.private_once&&!q.prompt.startsWith('첩자 · ')).map(q=><div key={q.id} className="rounded-xl bg-white/5 p-4"><p className="text-sm text-violet-300">{q.night}일차 · {q.status==='OPEN'?'선택 대기':q.status==='SUBMITTED'?'이야기꾼 확인 중':q.status==='CANCELLED'?'취소':'결과 도착'}</p><p className="mt-2 whitespace-pre-wrap">{q.prompt}</p>{q.targets.length>0&&<p className="mt-2 text-sm text-zinc-400">제출: {q.targets.map(id=><span key={id} className="mr-2">{name(id)}</span>)}</p>}{q.result&&<p className="mt-3 whitespace-pre-wrap font-semibold text-violet-200">{q.result}</p>}</div>)}</div></details>
  </section>;
}
