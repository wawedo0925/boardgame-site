"use client";
import { useState } from 'react';
import type { LiveState } from '@/lib/clocktower/live';
import ClocktowerPopup from './ClocktowerPopup';
import { ClocktowerName } from './ClocktowerSeating';

const button='min-h-12 rounded-xl bg-violet-400 px-5 py-3 font-bold text-zinc-950 disabled:opacity-40';
export default function ClocktowerPlayerActivity({state,run,busy,allowPopup,error}:{state:LiveState;run:(action:string,data?:Record<string,unknown>)=>Promise<boolean>;busy:boolean;allowPopup:boolean;error:string}) {
  const [confirmedPrivate,setConfirmedPrivate]=useState<string[]>([]);
  const [dismissed,setDismissed]=useState<string[]>([]);
  const [selected,setSelected]=useState<Record<string,string[]>>({});
  const [numbers,setNumbers]=useState<Record<string,number>>({});
  const [texts,setTexts]=useState<Record<string,string>>({});
  const [hint,setHint]=useState('');
  const members=state.members??[];
  const requests=(state.requests??[]).filter(q=>q.night===state.room?.night);
  const actionable=requests.filter(q=>q.status==='OPEN'||(q.status==='RESOLVED'&&!q.acknowledged&&!confirmedPrivate.includes(q.id)));
  const missions=(state.missions??[]).filter(m=>!m.completed);
  const activeNight=state.room?.phase==='NIGHT';
  const q=activeNight?actionable.find(q=>!dismissed.includes(`request:${q.id}:${q.status}`)):undefined;
  const mission=activeNight&&!q?missions.find(m=>!dismissed.includes(`mission:${m.id}`)):undefined;
  const numberTiles=mission?.challenge.tiles??[];
  const numberCount=numberTiles.length;
  const numberAnswer=[...numberTiles].sort((a,b)=>a-b).join(',');
  const key=q?`request:${q.id}:${q.status}`:mission?`mission:${mission.id}`:'';
  const privateResult=!!q&&(q.private_once||q.prompt.startsWith('첩자 · '));
  const picked=q?selected[q.id]??[]:[];
  const close=()=>{setDismissed([...dismissed,key]);setHint('');};
  const reopen=(key:string)=>{setDismissed(dismissed.filter(k=>k!==key));setHint('');};
  const name=(id:string)=>{const member=members.find(m=>m.user_id===id);return member?<ClocktowerName member={member}/>:<span>참가자</span>;};
  return <section className="space-y-4">
    {activeNight&&<div className="rounded-2xl border border-violet-300/25 bg-violet-400/5 p-5"><h3 className="font-bold text-violet-200">밤 활동</h3><p className="mt-2 text-sm leading-6 text-zinc-400">화면을 계속 확인해 주세요. 밤 시작 직후 첫 미션이 도착하고, 밤 동안 추가 미션이 무작위로 도착합니다. 잠시 닫은 활동은 아래 버튼으로 다시 열 수 있습니다.</p>
      <div className="mt-3 flex flex-wrap gap-2">{actionable.map(q=><button key={q.id} className={button} onClick={()=>reopen(`request:${q.id}:${q.status}`)}>{q.status==='RESOLVED'?'도착한 결과 확인':'능력 요청 열기'}</button>)}{missions.map(m=><button key={m.id} className={button} onClick={()=>reopen(`mission:${m.id}`)}>공통 미션 {m.round} 열기</button>)}</div>
      {!actionable.length&&!missions.length&&<p className="mt-3 text-sm">{requests.some(q=>q.status==='SUBMITTED')?'이야기꾼이 제출한 선택을 확인하고 있습니다.':'다음 활동을 기다리고 있습니다.'}</p>}
      {!!state.missions?.length&&<p className="mt-3 text-xs text-zinc-500">공통 미션 {state.missions.filter(m=>m.completed).length}/{state.missions.length} 완료</p>}
    </div>}
    {allowPopup&&(q||mission)&&<ClocktowerPopup key={key} title={privateResult?'첩자 · 마도서 확인':'밤 활동'} subtitle={`${state.room?.night}일차 · 나에게 온 안내`} onClose={close} busy={busy||privateResult}>
      {error&&<p role="alert" className="mb-4 rounded-xl bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
      {q&&<div className="space-y-4"><p className="whitespace-pre-wrap text-lg leading-8">{q.status==='RESOLVED'?'이야기꾼이 확인한 결과입니다.':q.prompt}</p>
        {q.status==='RESOLVED'?<>{privateResult&&<p className="text-sm text-amber-200">메모하지 말고 기억해 주세요. 아래 확인 버튼을 눌러야 다음 차례로 넘어갑니다. 확인 후 이 내용은 다시 볼 수 없고, 다음 밤 능력 차례에 새 정보를 받습니다.</p>}<p className="whitespace-pre-wrap rounded-2xl bg-violet-400/10 p-5 text-2xl font-bold leading-relaxed">{q.result}</p><button disabled={busy} className={`${button} w-full`} onClick={async()=>{if(await run('ack',{request_id:q.id})&&privateResult)setConfirmedPrivate(ids=>[...ids,q.id]);}}>{privateResult?'확인 · 다음 단계로 진행 (다시 볼 수 없음)':'결과 확인했습니다'}</button></>:<>
          {q.target_count>0&&<><p className="text-sm text-violet-200">{q.target_count}명 선택 · {picked.length}/{q.target_count}</p><div className="grid grid-cols-2 gap-2">{members.filter(m=>q.allow_self||m.user_id!==state.my_id).map(m=><button key={m.user_id} aria-pressed={picked.includes(m.user_id)} disabled={busy} className={`min-h-16 rounded-xl border p-3 text-left ${picked.includes(m.user_id)?'border-violet-300 bg-violet-400/20':'border-white/15'}`} onClick={()=>setSelected({...selected,[q.id]:picked.includes(m.user_id)?picked.filter(id=>id!==m.user_id):picked.length<q.target_count?[...picked,m.user_id]:picked})}>{m.seat}. <ClocktowerName member={m}/>{picked.includes(m.user_id)&&<span aria-hidden="true" className="ml-2 text-violet-200">✓</span>}</button>)}</div></>}
          <button disabled={busy||picked.length!==q.target_count} className={`${button} w-full`} onClick={()=>void run('reply',{request_id:q.id,targets:picked})}>{q.target_count?'선택 제출':'내용 확인했습니다'}</button>
        </>}
      </div>}
      {mission&&<div className="space-y-4"><p className="text-lg font-bold">{mission.kind==='NUMBERS'?`1부터 ${numberCount}까지 차례대로 눌러 주세요`:'아래 문장을 똑같이 입력해 주세요'}</p>
        {mission.kind==='NUMBERS'?<><p aria-live="polite" className="text-sm text-violet-200">{(numbers[mission.id]??0)===numberCount?'모두 눌렀습니다. 확인 버튼을 눌러 주세요.':`다음 숫자: ${(numbers[mission.id]??0)+1}`}</p><div className={`grid gap-2 ${numberCount===3?'grid-cols-3':'grid-cols-5'}`}>{numberTiles.map(n=><button key={n} disabled={busy||n<=(numbers[mission.id]??0)} className="aspect-square min-h-11 rounded-xl border border-violet-300/30 bg-violet-400/10 text-xl font-bold disabled:border-transparent disabled:bg-white/5 disabled:text-zinc-600" onClick={()=>{if(n===(numbers[mission.id]??0)+1){setNumbers({...numbers,[mission.id]:n});setHint('');}else setHint('작은 숫자부터 차례대로 눌러 주세요.');}}>{n}</button>)}</div></>:<><p className="rounded-xl bg-violet-400/10 p-4 text-lg leading-8">{mission.challenge.text}</p><label className="block text-sm">문장 입력<input autoComplete="off" maxLength={200} disabled={busy} className="mt-2 w-full rounded-xl border border-white/20 bg-zinc-900 p-3 text-base" value={texts[mission.id]??''} onChange={e=>setTexts({...texts,[mission.id]:e.target.value})}/></label></>}
        {hint&&<p role="status" className="text-sm text-amber-200">{hint}</p>}
        <button disabled={busy||(mission.kind==='NUMBERS'?!numberCount||(numbers[mission.id]??0)!==numberCount:(texts[mission.id]??'').trim()!==mission.challenge.text)} className={`${button} w-full`} onClick={()=>void run('mission_complete',{mission_id:mission.id,answer:mission.kind==='NUMBERS'?numberAnswer:(texts[mission.id]??'').trim()})}>미션 확인</button>
      </div>}
      {!privateResult&&<p className="mt-4 text-center text-xs text-zinc-500">팝업을 닫아도 제출·확인 처리되지 않습니다.</p>}
    </ClocktowerPopup>}
    <details className="rounded-2xl border border-white/10 p-5"><summary>내 요청·결과 기록</summary><div className="mt-4 space-y-3">{state.requests?.filter(q=>!q.private_once&&!q.prompt.startsWith('첩자 · ')).map(q=><div key={q.id} className="rounded-xl bg-white/5 p-4"><p className="text-sm text-violet-300">{q.night}일차 · {q.status==='OPEN'?'선택 대기':q.status==='SUBMITTED'?'이야기꾼 확인 중':q.status==='CANCELLED'?'취소':'결과 도착'}</p><p className="mt-2 whitespace-pre-wrap">{q.prompt}</p>{q.targets.length>0&&<p className="mt-2 text-sm text-zinc-400">제출: {q.targets.map(id=><span key={id} className="mr-2">{name(id)}</span>)}</p>}{q.result&&<p className="mt-3 whitespace-pre-wrap font-semibold text-violet-200">{q.result}</p>}</div>)}</div></details>
  </section>;
}
