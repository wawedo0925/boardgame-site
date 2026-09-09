"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CLOCKTOWER_CHARACTERS } from '@/lib/clocktower/characters';
import { nightPreset, type LiveMember, type LiveRequest, type LiveState } from '@/lib/clocktower/live';

const field = 'w-full rounded-xl border border-white/15 bg-zinc-900 px-3 py-3 text-white';
const button = 'rounded-xl bg-violet-400 px-4 py-3 font-bold text-zinc-950 disabled:opacity-40';
const subtle = 'rounded-xl border border-white/20 px-4 py-3 text-sm disabled:opacity-40';
const roles = CLOCKTOWER_CHARACTERS['점철되는 혼란'].filter(c => c.type !== '이야기꾼');
type Run = (action: string, data?: Record<string, unknown>) => Promise<boolean>;

export default function ClocktowerLive({ eventId }: { eventId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<LiveState | null>(null);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const fetchSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++fetchSequence.current;
    try {
      const { data, error } = await supabase.rpc('clocktower_live_snapshot', { p_event_id: eventId });
      if (error) throw error;
      if (sequence === fetchSequence.current) { setState(data as LiveState); setConnectionError(''); }
    } catch { if (sequence === fetchSequence.current) setConnectionError('연결이 끊겼습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.'); }
  }, [eventId, supabase]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() { if (document.visibilityState === 'visible') await refresh(); if (active) timer = setTimeout(poll, 2000); }
    void poll();
    const focus = () => { void refresh(); };
    window.addEventListener('focus', focus);
    return () => { active = false; clearTimeout(timer); window.removeEventListener('focus', focus); };
  }, [refresh]);
  const run: Run = async (action, data = {}) => {
    if (busy) return false;
    setBusy(true); setError('');
    try {
      const { error } = await supabase.rpc('clocktower_live_command', { p_event_id: eventId, p_action: action, p_data: { room_id: state?.room?.id, ...data } });
      if (error) throw error;
      await refresh(); return true;
    } catch (e) { setError(typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : '저장하지 못했습니다. 다시 확인해 주세요.'); return false; }
    finally { setBusy(false); }
  };
  const room = state?.room;
  return <div className="mt-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-zinc-400">화면을 켜 두면 약 2초마다 갱신됩니다.</span><div className="flex gap-2"><button className={subtle} onClick={() => setHidden(!hidden)}>{hidden ? '화면 다시 보기' : '화면 가리기'}</button><button className={subtle} onClick={() => void refresh()}>새로고침</button></div></div>
    {connectionError && <p role="alert" className="mb-4 rounded-xl bg-red-400/10 p-4 text-red-300">{connectionError}</p>}
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-400/10 p-4 text-red-300">{error}</p>}
    {hidden ? <div className="rounded-3xl border border-white/10 p-16 text-center text-zinc-500">화면을 가렸습니다.</div> : !state ? <p>진행방을 불러오는 중…</p> : !room ? <div className="rounded-3xl border border-white/10 p-6">
      <h2 className="text-xl font-bold">{state.waiting ? '이야기꾼의 참가자 배정을 기다리고 있습니다.' : '진행방 준비'}</h2>
      {state.can_create && <><p className="my-4 text-sm leading-7 text-zinc-400">진행방을 만든 계정이 이야기꾼이 됩니다. 이야기꾼만 실제 역할과 전체 선택을 볼 수 있습니다. 참가자 배정 후 첫날 밤을 시작하면 각자의 역할이 공개됩니다.</p><button disabled={busy} className={button} onClick={() => void run('create')}>내가 이야기꾼으로 진행방 만들기</button></>}
    </div> : <>
      <div className="mb-6 rounded-2xl border border-violet-400/30 bg-violet-400/5 p-5"><h2 className="text-xl font-bold text-violet-200">{room.phase === 'SETUP' ? '역할·자리 배정' : room.phase === 'ENDED' ? '게임 종료' : `${room.night}일차 ${room.phase === 'NIGHT' ? '밤' : '낮'}`}</h2><p className="mt-2 text-sm text-zinc-400">{state.is_host ? '이야기꾼 화면 · 역할과 메모는 본인만 볼 수 있습니다.' : '참가자 화면 · 요청이 오면 선택하고 결과를 확인해 주세요.'}</p></div>
      {state.is_host ? <Host key={room.id} state={state} run={run} busy={busy} /> : <Player key={room.id} state={state} run={run} busy={busy} />}
    </>}
  </div>;
}

function Host({ state, run, busy }: { state: LiveState; run: Run; busy: boolean }) {
  const room = state.room!;
  const members = state.members ?? [];
  const requests = state.requests ?? [];
  const [edit, setEdit] = useState<LiveMember | null>(null);
  const [recipient, setRecipient] = useState('');
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(0);
  const [self, setSelf] = useState(true);
  const requestForm = useRef<HTMLFormElement>(null);
  const editorArea = useRef<HTMLDivElement>(null);
  const target = members.find(m => m.user_id === recipient);
  const pending = requests.filter(q => q.status === 'OPEN' || q.status === 'SUBMITTED' || (q.status === 'RESOLVED' && !q.acknowledged));
  function prepare(member: LiveMember) { const preset = nightPreset(member.shown_role ?? '', room.night); setRecipient(member.user_id); setPrompt(preset.prompt); setCount(preset.count); setSelf(preset.self); requestForm.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  useEffect(() => { if (edit) editorArea.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [edit]);
  const phase = async (next: string) => { if (window.confirm(next === 'ENDED' ? '게임을 종료할까요? 진행 중 요청은 취소되며 이 게임을 다시 진행할 수 없습니다.' : next === 'NIGHT' ? '밤을 시작할까요? 첫날 밤에는 참가자에게 자신의 역할이 표시됩니다.' : '밤을 마치고 사망 상태를 모두에게 공개할까요?')) await run('phase', { phase: next }); };
  return <div className="space-y-6">
    <div className="flex flex-wrap gap-3">{room.phase === 'ENDED' ? <button disabled={busy} className={button} onClick={() => { if (confirm('새 게임을 준비할까요? 이전 게임은 보관되고 화면은 새 게임으로 전환됩니다.')) void run('create'); }}>새 게임 준비</button> : <>
      {room.phase !== 'NIGHT' ? <button disabled={busy} className={button} onClick={() => void phase('NIGHT')}>{room.phase === 'SETUP' ? '첫날 밤 시작' : '다음 밤 시작'}</button> : <button disabled={busy || pending.length > 0} className={button} onClick={() => void phase('DAY')}>낮 시작 · 사망 공개</button>}
      <button disabled={busy} className={subtle} onClick={() => void phase('ENDED')}>게임 종료</button>
    </>}</div>
    <p className="text-sm leading-7 text-zinc-400">능력 순서와 판정은 이야기꾼이 결정합니다. 첫날 악의 팀 정보·악마 블러프, 점쟁이의 오인 대상, 남작의 구성 변경을 준비하세요. 중독·보호·역할 변경은 메모와 배정 수정으로 기록합니다. 밤의 사망 상태는 낮 시작 때 공개됩니다.</p>
    <section className="rounded-3xl border border-white/10 p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">마도서 · {members.length}명</h2>{room.phase === 'SETUP' && <button disabled={busy} className={subtle} onClick={() => setEdit({ user_id: '', name: '', seat: Array.from({length:20}, (_,i)=>i+1).find(seat=>!members.some(m=>m.seat===seat)) ?? 20, alive: true, actual_role: '', shown_role: '', notes: '' })}>참가자 배정</button>}</div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{members.map(m => <div key={m.user_id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{m.seat}. {m.name} · {m.alive ? '생존' : '사망'}</h3><span className="text-violet-300">{m.actual_role}{m.actual_role !== m.shown_role ? ` (본인 표시: ${m.shown_role})` : ''}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-zinc-400">{m.notes || '메모 없음'}</p><div className="mt-3 flex flex-wrap gap-2">{room.phase !== 'ENDED' && <button className={subtle} onClick={() => setEdit(m)}>역할·상태 수정</button>}{room.phase === 'NIGHT' && <button className={subtle} onClick={() => prepare(m)}>능력·정보 요청 준비</button>}</div></div>)}</div>
    </section>
    {edit && <div ref={editorArea} className="scroll-mt-6"><MemberEditor key={edit.user_id || 'new'} member={edit} candidates={state.candidates ?? []} members={members} setup={room.phase === 'SETUP'} busy={busy} run={run} close={() => setEdit(null)} /></div>}
    {room.phase === 'NIGHT' && <form ref={requestForm} className="scroll-mt-6 rounded-3xl border border-violet-400/30 p-5" onSubmit={async e => { e.preventDefault(); if (await run('request', { user_id: recipient, night: room.night, prompt, target_count: count, allow_self: self })) { setPrompt(''); setRecipient(''); } }}>
      <h2 className="mb-4 text-xl font-bold">비공개 요청 보내기</h2>
      <fieldset disabled={busy} className="space-y-4"><label className="block">받는 사람<select required value={recipient} onChange={e => { const m = members.find(m=>m.user_id===e.target.value); if(m) prepare(m); else setRecipient(''); }} className={`${field} mt-2`}><option value="">참가자 선택</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.seat}. {m.name} · {m.shown_role}</option>)}</select></label>
        {target && <p className="text-sm text-amber-200">{nightPreset(target.shown_role ?? '',room.night).hint}</p>}
        <div className="grid gap-3 sm:grid-cols-2"><label>요청 방식<select className={`${field} mt-2`} value={count} onChange={e=>setCount(Number(e.target.value))}><option value={0}>정보 전달 · 읽고 확인</option><option value={1}>대상 1명 선택</option><option value={2}>대상 2명 선택</option></select></label><label className="flex items-center gap-3"><input type="checkbox" checked={self} onChange={e=>setSelf(e.target.checked)} />본인도 대상 선택 가능</label></div>
        <label className="block">참가자에게 보낼 내용<textarea required maxLength={2000} rows={4} className={`${field} mt-2`} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="정보를 받는 역할은 여기서 전달할 정보를 직접 작성하세요." /></label>
        {target?.shown_role === '첩자' && <button type="button" className={subtle} onClick={()=>setPrompt(members.map(m=>`${m.seat}. ${m.name}: ${m.actual_role} / ${m.alive?'생존':'사망'}${m.notes?` / ${m.notes}`:''}`).join('\n'))}>마도서 초안 불러오기 · 보내기 전 수정 가능</button>}
        <button disabled={!recipient || !prompt.trim()} className={button}>선택한 참가자에게 요청 보내기</button>
      </fieldset>
    </form>}
    <section><h2 className="mb-4 text-xl font-bold">요청·결과 기록 <span className="text-violet-300">미완료 {pending.length}</span></h2><div className="space-y-3">{requests.map(q=><HostRequest key={q.id} request={q} members={members} run={run} busy={busy} ended={room.phase === 'ENDED'} />)}</div></section>
  </div>;
}

function MemberEditor({ member, candidates, members, setup, busy, run, close }: { member: LiveMember; candidates: {user_id:string;name:string}[]; members: LiveMember[]; setup: boolean; busy: boolean; run: Run; close: ()=>void }) {
  const [draft, setDraft] = useState(member);
  return <form className="rounded-3xl border border-amber-400/30 bg-zinc-950 p-5" onSubmit={async e=>{e.preventDefault(); if(await run('member',draft)) close();}}>
    <h2 className="mb-4 text-xl font-bold">참가자 역할·상태</h2><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
      <label>참가자<select required disabled={Boolean(member.user_id)} value={draft.user_id} onChange={e=>setDraft({...draft,user_id:e.target.value})} className={`${field} mt-2`}><option value="">선택하세요</option>{candidates.filter(c=>c.user_id===member.user_id||!members.some(m=>m.user_id===c.user_id)).map(c=><option key={c.user_id} value={c.user_id}>{c.name}</option>)}</select></label>
      <label>자리 번호<input required type="number" min={1} max={20} className={`${field} mt-2`} value={draft.seat} onChange={e=>setDraft({...draft,seat:Number(e.target.value)})}/></label>
      <label>실제 역할<select required className={`${field} mt-2`} value={draft.actual_role} onChange={e=>setDraft({...draft,actual_role:e.target.value,shown_role:e.target.value==='주정뱅이'?'':e.target.value})}><option value="">역할 선택</option>{roles.map(c=><option key={c.name}>{c.name}</option>)}</select></label>
      {draft.actual_role==='주정뱅이' && <label>본인에게 표시할 주민 역할<select required className={`${field} mt-2`} value={draft.shown_role} onChange={e=>setDraft({...draft,shown_role:e.target.value})}><option value="">주민 역할 선택</option>{roles.filter(c=>c.type==='주민').map(c=><option key={c.name}>{c.name}</option>)}</select></label>}
      <label className="flex items-center gap-3"><input type="checkbox" checked={draft.alive} onChange={e=>setDraft({...draft,alive:e.target.checked})}/>생존 상태</label>
      <label className="sm:col-span-2">이야기꾼 전용 메모<textarea maxLength={2000} rows={3} className={`${field} mt-2`} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} placeholder="중독 / 보호 / 점쟁이 오인 대상 / 집사의 주인 / 사용한 능력 등" /></label>
    </fieldset><div className="mt-4 flex flex-wrap gap-3"><button disabled={busy} className={button}>배정·수정 저장</button><button type="button" className={subtle} onClick={close}>닫기</button>{setup && member.user_id && <button type="button" disabled={busy} className={subtle} onClick={async()=>{if(await run('remove_member',{user_id:member.user_id}))close();}}>배정 해제</button>}</div>
  </form>;
}

function HostRequest({ request:q, members, run, busy, ended }: { request: LiveRequest; members: LiveMember[]; run: Run; busy: boolean; ended: boolean }) {
  const [result,setResult]=useState(q.target_count===0?'확인 완료':'선택을 확인했습니다.');
  const name=(id:string)=>members.find(m=>m.user_id===id)?.name ?? '참가자';
  return <div className="rounded-2xl border border-white/10 p-5"><p className="font-bold">{q.night}일차 밤 · {name(q.user_id)} · <span className="text-violet-300">{q.status==='OPEN'?'응답 대기':q.status==='SUBMITTED'?'제출 완료':q.status==='CANCELLED'?'취소':q.acknowledged?'결과 확인 완료':'결과 확인 대기'}</span></p><p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{q.prompt}</p>{q.targets.length>0 && <p className="mt-3 text-amber-300">선택: {q.targets.map(name).join(', ')}</p>}
    {q.status==='SUBMITTED'&&!ended && <div className="mt-4"><label>본인에게만 전달할 결과<textarea maxLength={2000} className={`${field} mt-2`} value={result} onChange={e=>setResult(e.target.value)}/></label><button disabled={busy||!result.trim()} className={`${button} mt-3`} onClick={()=>void run('resolve',{request_id:q.id,result})}>결과 전달</button></div>}
    {q.result && <p className="mt-3 whitespace-pre-wrap text-emerald-300">전달한 결과: {q.result}</p>}
    {!ended && q.status!=='CANCELLED' && <div className="mt-3 flex flex-wrap gap-2">{q.status==='RESOLVED'&&!q.acknowledged && <button disabled={busy} className={subtle} onClick={()=>{if(confirm('현장에서 참가자가 결과를 확인했나요?'))void run('ack_offline',{request_id:q.id});}}>현장에서 확인 완료</button>}<button disabled={busy} className={subtle} onClick={()=>{if(confirm('이 요청을 취소할까요? 이미 확인한 내용은 회수할 수 없습니다.'))void run('cancel',{request_id:q.id});}}>요청 취소</button></div>}
  </div>;
}

function Player({ state, run, busy }: { state: LiveState; run: Run; busy: boolean }) {
  const members=state.members ?? [];
  const me=members.find(m=>m.user_id===state.my_id);
  return <div className="space-y-5"><div className="rounded-3xl border border-violet-400/30 p-6"><p className="text-zinc-400">내 역할</p><h2 className="mt-2 text-3xl font-bold text-violet-200">{me?.shown_role ?? '이야기꾼이 준비하고 있습니다'}</h2><p className="mt-3 text-sm text-zinc-400">{me?.seat}번 자리 · {me?.name}</p></div>
    {state.room?.phase==='NIGHT' && <p className="text-sm text-zinc-400">휴대폰 화면을 다른 사람에게 보여주지 말고, 이야기꾼의 안내에 따라 확인해 주세요.</p>}
    {!(state.requests?.length) && <p className="p-5 text-center text-zinc-400">아직 도착한 요청이 없습니다.</p>}
    {state.requests?.map(q=><PlayerRequest key={q.id} q={q} members={members} myId={state.my_id!} run={run} busy={busy}/>)}
    <details className="rounded-2xl border border-white/10 p-5"><summary>자리·참가자 보기</summary><ul className="mt-3 space-y-2">{members.map(m=><li key={m.user_id}>{m.seat}. {m.name} · {m.alive?'생존':'사망'}</li>)}</ul></details>
  </div>;
}

function PlayerRequest({q,members,myId,run,busy}:{q:LiveRequest;members:LiveMember[];myId:string;run:Run;busy:boolean}) {
  const [picked,setPicked]=useState<string[]>([]);
  return <div className="rounded-2xl border border-white/15 p-5"><p className="text-sm text-violet-300">{q.night}일차 밤 · {q.status==='OPEN'?'새 요청':q.status==='SUBMITTED'?'이야기꾼 확인 중':q.status==='CANCELLED'?'취소된 요청':'결과 도착'}</p><p className="mt-3 whitespace-pre-wrap text-lg leading-8">{q.prompt}</p>
    {q.status==='OPEN' && <>{q.target_count>0 && <><p className="my-3 text-sm text-zinc-400">{q.target_count}명 선택 · {picked.length}/{q.target_count}</p><div className="grid grid-cols-2 gap-2">{members.filter(m=>q.allow_self||m.user_id!==myId).map(m=><button key={m.user_id} aria-pressed={picked.includes(m.user_id)} disabled={busy} className={`rounded-xl border p-4 text-left ${picked.includes(m.user_id)?'border-violet-300 bg-violet-400/20':'border-white/15'}`} onClick={()=>setPicked(current=>current.includes(m.user_id)?current.filter(id=>id!==m.user_id):current.length<q.target_count?[...current,m.user_id]:current)}>{m.seat}. {m.name}</button>)}</div></>}
      <button disabled={busy||picked.length!==q.target_count} className={`${button} mt-4 w-full`} onClick={()=>void run('reply',{request_id:q.id,targets:picked})}>{q.target_count===0?'내용 확인했습니다':'선택 제출'}</button></>}
    {q.targets.length>0 && <p className="mt-3 text-sm text-zinc-400">제출한 선택: {q.targets.map(id=>members.find(m=>m.user_id===id)?.name ?? '참가자').join(', ')}</p>}
    {q.status==='RESOLVED' && <div className="mt-4 rounded-xl bg-violet-400/10 p-4"><p className="whitespace-pre-wrap text-xl font-semibold">{q.result}</p>{!q.acknowledged ? <button disabled={busy} className={`${button} mt-4`} onClick={()=>void run('ack',{request_id:q.id})}>결과 확인했습니다</button>:<p className="mt-3 text-sm text-zinc-400">확인 완료</p>}</div>}
  </div>;
}
