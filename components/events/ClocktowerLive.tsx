"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ClocktowerVoting from './ClocktowerVoting';
import ClocktowerPopup from './ClocktowerPopup';
import ClocktowerPlayerActivity from './ClocktowerPlayerActivity';
import { phaseAnnouncement } from '@/lib/clocktower/popups';
import ClocktowerNightFlow from './ClocktowerNightFlow';
import ClocktowerRoleSetup from './ClocktowerRoleSetup';
import ClocktowerInformationSetup from './ClocktowerInformationSetup';
import { informationErrors } from '@/lib/clocktower/information';
import { emptyEngine } from '@/lib/clocktower/night';
import { validateAssignments } from '@/lib/clocktower/setup';
import ClocktowerSeating, { ClocktowerName, birthYearLabel } from './ClocktowerSeating';
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
      const started=Date.now();
      const { data, error } = await supabase.rpc('clocktower_live_snapshot', { p_event_id: eventId });
      if (error) throw error;
      if (sequence === fetchSequence.current) { const snapshot=data as LiveState;setState({...snapshot,clock_offset:snapshot.server_now?Date.parse(snapshot.server_now)-(started+Date.now())/2:0}); setConnectionError(''); }
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
      const { error } = action === 'save_layout' ? await supabase.rpc('clocktower_save_layout', { p_event_id: eventId, p_room_id: state?.room?.id, p_revision: data.revision, p_layout: data.layout }) : await supabase.rpc('clocktower_live_command', { p_event_id: eventId, p_action: action, p_data: { room_id: state?.room?.id, ...data } });
      if (error) throw error;
      await refresh(); return true;
    } catch (e) { setError(typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : '저장하지 못했습니다. 다시 확인해 주세요.'); return false; }
    finally { setBusy(false); }
  };
  const room = state?.room;
  const [seenPhase,setSeenPhase]=useState('');
  const announcement=state?phaseAnnouncement(state):null;
  const allowPopup=!announcement||seenPhase===announcement.key;
  return <div className="mt-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-zinc-400">화면을 켜 두세요. 투표 차례는 서버 시간에 맞춰 자동으로 표시됩니다.</span><div className="flex gap-2"><button className={subtle} onClick={() => setHidden(!hidden)}>{hidden ? '화면 다시 보기' : '화면 가리기'}</button><button className={subtle} onClick={() => void refresh()}>새로고침</button></div></div>
    {connectionError && <p role="alert" className="mb-4 rounded-xl bg-red-400/10 p-4 text-red-300">{connectionError}</p>}
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-400/10 p-4 text-red-300">{error}</p>}
    {hidden ? <div className="rounded-3xl border border-white/10 p-16 text-center text-zinc-500">화면을 가렸습니다.</div> : !state ? <p>진행방을 불러오는 중…</p> : !room ? <div className="rounded-3xl border border-white/10 p-6">
      <h2 className="text-xl font-bold">{state.waiting ? '이야기꾼의 참가자 배정을 기다리고 있습니다.' : '이야기꾼의 진행방 준비를 기다리고 있습니다.'}</h2>
      {state.can_create && <><p className="my-4 text-sm leading-7 text-zinc-400">진행방을 만든 계정이 이야기꾼이 됩니다. 이야기꾼만 실제 역할과 전체 선택을 볼 수 있습니다. 일정 참가자를 자동으로 불러옵니다. 자리와 역할을 배정한 뒤 첫날 밤을 시작하면 각자의 역할이 공개됩니다.</p><button disabled={busy} className={button} onClick={() => void run('create')}>내가 이야기꾼으로 진행방 만들기</button></>}
    </div> : <>
      <div className="mb-6 rounded-2xl border border-violet-400/30 bg-violet-400/5 p-5"><h2 className="text-xl font-bold text-violet-200">{room.phase === 'SETUP' ? '역할·자리 배정' : room.phase === 'ENDED' ? '게임 종료' : `${room.night}일차 ${room.phase === 'NIGHT' ? '밤' : '낮'}`}</h2><p className="mt-2 text-sm text-zinc-400">{state.is_host ? '이야기꾼 화면 · 역할과 메모는 본인만 볼 수 있습니다.' : '참가자 화면 · 요청이 오면 선택하고 결과를 확인해 주세요.'}</p></div>
      {room.phase==='DAY'&&<ClocktowerVoting state={state} run={run} busy={busy} error={error}/> }
      {state.is_host ? <Host key={room.id} state={state} run={run} busy={busy} allowPopup={allowPopup} error={error} /> : <Player key={room.id} state={state} run={run} busy={busy} allowPopup={allowPopup} error={error} />}
    </>}
    {!hidden&&announcement&&!allowPopup&&!(room?.phase==='DAY'&&room.day_activity==='VOTING')&&<ClocktowerPopup title={announcement.title} onClose={()=>setSeenPhase(announcement.key)}><div className="space-y-6 text-center"><p aria-hidden="true" className="text-6xl">{announcement.icon}</p><p className="text-lg leading-8">{announcement.description}</p><button className={`${button} w-full`} onClick={()=>setSeenPhase(announcement.key)}>확인</button></div></ClocktowerPopup>}
  </div>;
}

function Host({ state, run, busy, allowPopup, error }: { state: LiveState; run: Run; busy: boolean; allowPopup:boolean; error:string }) {
  const room = state.room!;
  const members = state.members ?? [];
  const requests = state.requests ?? [];
  const unassigned = members.filter(m => !m.actual_role || !m.shown_role).length;
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [rolesEditing, setRolesEditing] = useState(false);
  const [informationEditing, setInformationEditing] = useState(false);
  const invalidInformation=informationErrors(state.engine?.information,state.engine?.red_herring,members).length>0;
  const invalidSetup = validateAssignments(members.map(m=>({user_id:m.user_id,actual_role:m.actual_role??'',shown_role:m.shown_role??''}))).length > 0;
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
      {room.phase !== 'NIGHT' ? <button disabled={busy || layoutEditing || rolesEditing || informationEditing || (room.phase === 'SETUP' && (invalidSetup||invalidInformation))} className={button} onClick={() => void phase('NIGHT')}>{room.phase === 'SETUP' ? '첫날 밤 시작' : '다음 밤 시작'}</button> : <button disabled={busy || (state.mission_progress??[]).some(m=>m.completed<m.total) || pending.length > 0 || (state.engine?.night !== room.night || !state.engine?.finished)} className={button} onClick={() => void phase('DAY')}>낮 시작 · 사망 공개</button>}
      <button disabled={busy} className={subtle} onClick={() => void phase('ENDED')}>게임 종료</button>
    </>}</div>
    {room.phase === 'SETUP' && <p className="text-sm text-amber-200">역할 미배정 {unassigned}명 · 역할 구성과 비밀 정보를 저장한 뒤 첫날 밤을 시작하세요.</p>}

    {room.phase==='NIGHT'&&!!state.mission_progress?.length&&<section className="rounded-2xl border border-white/15 p-5"><h3 className="font-bold">공통 미션 진행</h3><p className="my-3 text-sm text-zinc-400">모든 참가자가 두 차례 완료하면 낮으로 넘어갈 수 있습니다.</p><div className="space-y-2">{state.mission_progress.map(m=><div key={m.user_id} className="flex flex-wrap items-center justify-between gap-2"><span>{members.find(p=>p.user_id===m.user_id)?.name} · {m.completed}/{m.total}</span>{m.completed<m.total&&<button disabled={busy} className={subtle} onClick={()=>{if(confirm('휴대폰 사용이 어려운 참가자의 현재 미션을 현장에서 완료 처리할까요?'))void run('mission_offline',{user_id:m.user_id});}}>현장 완료 처리</button>}</div>)}</div></section>}
    <ClocktowerNightFlow state={state} run={run} busy={busy} allowPopup={allowPopup} error={error} />
    {room.phase === 'SETUP' && <ClocktowerRoleSetup key={members.map(m=>m.user_id).sort().join(',')} members={members} busy={busy || layoutEditing} onEditingChange={setRolesEditing} save={(rows,expected)=>run('save_roles',{rows,expected})} />}
    {room.phase === 'SETUP' && <ClocktowerInformationSetup members={members} engine={{...emptyEngine(),...state.engine}} busy={busy||rolesEditing||layoutEditing} onEditingChange={setInformationEditing} save={draft=>run('engine_information',{version:state.engine_version??0,state:{...emptyEngine(),...state.engine,...draft}})} />}
    <ClocktowerSeating key={members.map(m => m.user_id + ':' + m.seat).join(',')} members={members} onEditingChange={setLayoutEditing} layout={room.seating_layout} revision={room.seating_revision} save={(layout, revision) => run('save_layout', { layout, revision })} editable={room.phase === 'SETUP'} busy={busy || rolesEditing} myId={state.my_id} sync={() => void run('sync_participants')} swap={(a, b) => run('swap_seats', { first_user_id: a.user_id, second_user_id: b.user_id, first_seat: a.seat, second_seat: b.seat })} />
    <p className="text-sm leading-7 text-zinc-400">밤 시트 순서로 요청하고 이야기꾼의 전달 승인 후 효과를 반영합니다. 허상·위장 감지와 특수 판정은 제안을 확인·수정하세요. 남작의 초기 인원 구성은 역할 배정에서 검증합니다. 독살범 중독과 수도사 보호는 자동 반영됩니다. 추가 상태는 밤 설정에 기록하세요. 밤의 사망 상태는 낮 시작 때 공개됩니다.</p>
    <section className="rounded-3xl border border-white/10 p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">마도서 · {members.length}명</h2>{room.phase === 'SETUP' && <button disabled={busy} className={subtle} onClick={() => setEdit({ user_id: '', name: '', seat: Array.from({length:20}, (_,i)=>i+1).find(seat=>!members.some(m=>m.seat===seat)) ?? 20, alive: true, actual_role: '', shown_role: '', notes: '' })}>참가자 배정</button>}</div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{members.map(m => <div key={m.user_id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{m.seat}. <ClocktowerName member={m} /> · {m.alive ? '생존' : '사망'}</h3><span className="text-violet-300">{m.actual_role || '역할 미배정'}{m.actual_role !== m.shown_role ? ` (본인 표시: ${m.shown_role})` : ''}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-zinc-400">{m.notes || '메모 없음'}</p><div className="mt-3 flex flex-wrap gap-2">{room.phase !== 'ENDED' && <button className={subtle} onClick={() => setEdit(m)}>역할·상태 수정</button>}{room.phase === 'NIGHT' && !state.engine?.night && <button className={subtle} onClick={() => prepare(m)}>능력·정보 요청 준비</button>}</div></div>)}</div>
    </section>
    {edit && <div ref={editorArea} className="scroll-mt-6"><MemberEditor key={edit.user_id || 'new'} member={edit} candidates={state.candidates ?? []} members={members} setup={room.phase === 'SETUP'} busy={busy || layoutEditing || rolesEditing} run={run} close={() => setEdit(null)} /></div>}
    {room.phase === 'NIGHT' && !state.engine?.night && <form ref={requestForm} className="scroll-mt-6 rounded-3xl border border-violet-400/30 p-5" onSubmit={async e => { e.preventDefault(); if (await run('request', { user_id: recipient, night: room.night, prompt, target_count: count, allow_self: self })) { setPrompt(''); setRecipient(''); } }}>
      <h2 className="mb-4 text-xl font-bold">비공개 요청 보내기</h2>
      <fieldset disabled={busy} className="space-y-4"><label className="block">받는 사람<select required value={recipient} onChange={e => { const m = members.find(m=>m.user_id===e.target.value); if(m) prepare(m); else setRecipient(''); }} className={`${field} mt-2`}><option value="">참가자 선택</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.seat}. {m.name}{birthYearLabel(m.birth_year) ? ` · ${birthYearLabel(m.birth_year)}` : ''} · {m.shown_role || '역할 미배정'}</option>)}</select></label>
        {target && <p className="text-sm text-amber-200">{nightPreset(target.shown_role ?? '',room.night).hint}</p>}
        <div className="grid gap-3 sm:grid-cols-2"><label>요청 방식<select className={`${field} mt-2`} value={count} onChange={e=>setCount(Number(e.target.value))}><option value={0}>정보 전달 · 읽고 확인</option><option value={1}>대상 1명 선택</option><option value={2}>대상 2명 선택</option></select></label><label className="flex items-center gap-3"><input type="checkbox" checked={self} onChange={e=>setSelf(e.target.checked)} />본인도 대상 선택 가능</label></div>
        <label className="block">참가자에게 보낼 내용<textarea required maxLength={2000} rows={4} className={`${field} mt-2`} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="정보를 받는 역할은 여기서 전달할 정보를 직접 작성하세요." /></label>
        {target?.shown_role === '첩자' && <button type="button" className={subtle} onClick={()=>setPrompt(members.map(m=>`${m.seat}. ${m.name}: ${m.actual_role} / ${m.alive?'생존':'사망'}${m.notes?` / ${m.notes}`:''}`).join('\n'))}>마도서 초안 불러오기 · 보내기 전 수정 가능</button>}
        <button disabled={!recipient || !prompt.trim()} className={button}>선택한 참가자에게 요청 보내기</button>
      </fieldset>
    </form>}
    <section><h2 className="mb-4 text-xl font-bold">요청·결과 기록 <span className="text-violet-300">미완료 {pending.length}</span></h2><div className="space-y-3">{requests.map(q=><HostRequest key={q.id} request={q} members={members} run={run} busy={busy} ended={room.phase === 'ENDED' || !!state.engine?.night} />)}</div></section>
  </div>;
}

function MemberEditor({ member, candidates, members, setup, busy, run, close }: { member: LiveMember; candidates: {user_id:string;name:string;birth_year?:string|null}[]; members: LiveMember[]; setup: boolean; busy: boolean; run: Run; close: ()=>void }) {
  const [draft, setDraft] = useState(member);
  return <form className="rounded-3xl border border-amber-400/30 bg-zinc-950 p-5" onSubmit={async e=>{e.preventDefault(); if(await run('member',{...draft, seat: members.find(m => m.user_id === draft.user_id)?.seat ?? draft.seat})) close();}}>
    <h2 className="mb-4 text-xl font-bold">참가자 역할·상태</h2><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
      <label>참가자<select required disabled={Boolean(member.user_id)} value={draft.user_id} onChange={e=>setDraft({...draft,user_id:e.target.value})} className={`${field} mt-2`}><option value="">선택하세요</option>{candidates.filter(c=>c.user_id===member.user_id||!members.some(m=>m.user_id===c.user_id)).map(c=><option key={c.user_id} value={c.user_id}>{c.name}{birthYearLabel(c.birth_year) ? ` · ${birthYearLabel(c.birth_year)}` : ''}</option>)}</select></label>
      <label>자리 번호<input disabled={Boolean(member.user_id) || !setup} required type="number" min={1} max={20} className={`${field} mt-2`} value={members.find(m => m.user_id === draft.user_id)?.seat ?? draft.seat} onChange={e=>setDraft({...draft,seat:Number(e.target.value)})}/></label>
      <label>실제 역할<select required className={`${field} mt-2`} value={draft.actual_role} onChange={e=>setDraft({...draft,actual_role:e.target.value,shown_role:e.target.value==='주정뱅이'?'':e.target.value})}><option value="">역할 선택</option>{roles.map(c=><option key={c.name}>{c.name}</option>)}</select></label>
      {draft.actual_role==='주정뱅이' && <label>본인에게 표시할 주민 역할<select required className={`${field} mt-2`} value={draft.shown_role} onChange={e=>setDraft({...draft,shown_role:e.target.value})}><option value="">주민 역할 선택</option>{roles.filter(c=>c.type==='주민').map(c=><option key={c.name}>{c.name}</option>)}</select></label>}
      <label className="flex items-center gap-3"><input type="checkbox" checked={draft.alive} onChange={e=>setDraft({...draft,alive:e.target.checked})}/>생존 상태</label>
      <label className="sm:col-span-2">이야기꾼 전용 메모<textarea maxLength={2000} rows={3} className={`${field} mt-2`} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} placeholder="중독 / 보호 / 점쟁이 오인 대상 / 집사의 주인 / 사용한 능력 등" /></label>
    </fieldset><div className="mt-4 flex flex-wrap gap-3"><button disabled={busy} className={button}>배정·수정 저장</button><button type="button" className={subtle} onClick={close}>닫기</button>{setup && member.user_id && <button type="button" disabled={busy} className={subtle} onClick={async()=>{if(await run('remove_member',{user_id:member.user_id}))close();}}>배정 해제</button>}</div>
  </form>;
}

function HostRequest({ request:q, members, run, busy, ended }: { request: LiveRequest; members: LiveMember[]; run: Run; busy: boolean; ended: boolean }) {
  const [result,setResult]=useState(q.target_count===0?'확인 완료':'선택을 확인했습니다.');
  const name=(id:string)=>{ const m=members.find(m=>m.user_id===id); return m ? <ClocktowerName member={m} /> : '참가자'; };
  return <div className="rounded-2xl border border-white/10 p-5"><p className="font-bold">{q.night}일차 밤 · {name(q.user_id)} · <span className="text-violet-300">{q.status==='OPEN'?'응답 대기':q.status==='SUBMITTED'?'제출 완료':q.status==='CANCELLED'?'취소':q.acknowledged?'결과 확인 완료':'결과 확인 대기'}</span></p><p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{q.prompt}</p>{q.targets.length>0 && <p className="mt-3 text-amber-300">선택: {q.targets.map(id => <span key={id} className="mr-3 inline-block">{name(id)}</span>)}</p>}
    {q.status==='SUBMITTED'&&!ended && <div className="mt-4"><label>본인에게만 전달할 결과<textarea maxLength={2000} className={`${field} mt-2`} value={result} onChange={e=>setResult(e.target.value)}/></label><button disabled={busy||!result.trim()} className={`${button} mt-3`} onClick={()=>void run('resolve',{request_id:q.id,result})}>결과 전달</button></div>}
    {q.result && <p className="mt-3 whitespace-pre-wrap text-emerald-300">전달한 결과: {q.result}</p>}
    {!ended && q.status!=='CANCELLED' && <div className="mt-3 flex flex-wrap gap-2">{q.status==='RESOLVED'&&!q.acknowledged && <button disabled={busy} className={subtle} onClick={()=>{if(confirm('현장에서 참가자가 결과를 확인했나요?'))void run('ack_offline',{request_id:q.id});}}>현장에서 확인 완료</button>}<button disabled={busy} className={subtle} onClick={()=>{if(confirm('이 요청을 취소할까요? 이미 확인한 내용은 회수할 수 없습니다.'))void run('cancel',{request_id:q.id});}}>요청 취소</button></div>}
  </div>;
}

function Player({ state, run, busy, allowPopup, error }: { state: LiveState; run: Run; busy: boolean; allowPopup:boolean; error:string }) {
  const members=state.members ?? [];
  const me=members.find(m=>m.user_id===state.my_id);
  return <div className="space-y-5"><div className="rounded-3xl border border-violet-400/30 p-6"><p className="text-zinc-400">내 역할</p><h2 className="mt-2 text-3xl font-bold text-violet-200">{me?.shown_role ?? '이야기꾼이 준비하고 있습니다'}</h2><p className="mt-3 text-sm text-zinc-400">{me?.seat}번 자리 · {me && <ClocktowerName member={me} />}</p></div>
    {state.room?.phase === 'NIGHT' ? <details className="rounded-2xl border border-white/10 p-4"><summary>마을 자리 배치 보기</summary><ClocktowerSeating members={members} layout={state.room?.seating_layout} revision={state.room?.seating_revision} myId={state.my_id} /></details> : <ClocktowerSeating members={members} layout={state.room?.seating_layout} revision={state.room?.seating_revision} myId={state.my_id} />}
    {state.room?.phase==='NIGHT' && <p className="text-sm text-zinc-400">휴대폰 화면을 다른 사람에게 보여주지 말고, 이야기꾼의 안내에 따라 확인해 주세요.</p>}
    <ClocktowerPlayerActivity state={state} run={run} busy={busy} allowPopup={allowPopup} error={error} />
    <details className="rounded-2xl border border-white/10 p-5"><summary>자리·참가자 보기</summary><ul className="mt-3 space-y-2">{members.map(m=><li key={m.user_id}>{m.seat}. {m.name} · {m.alive?'생존':'사망'}</li>)}</ul></details>
  </div>;
}
