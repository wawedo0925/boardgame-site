'use client';

import { useState } from 'react';
import type { LiveMoonChoice, LiveState } from '@/lib/clocktower/live';
import ClocktowerPopup from './ClocktowerPopup';

type Props = { state: LiveState; busy: boolean; error: string; allowPopup?: boolean; run: (action: string, data?: Record<string, unknown>) => Promise<boolean> };
const button = 'min-h-11 rounded-xl border border-white/20 px-4 py-3 disabled:opacity-40';

export function ClocktowerMoonchildToggle({ state, busy, error, run }: Props) {
  const me = state.members?.find(m => m.user_id === state.my_id);
  const real = me?.shown_role === '달의 자손';
  return <details className="mt-3 rounded-xl border border-white/15 p-3 text-sm"><summary>달의 자손 행동 설정</summary>
    {real ? <p className="mt-3">달의 자손은 사망 공개 후 대상 선택창이 자동으로 열립니다. 따로 설정할 필요가 없습니다.</p> : <>
      <p className="my-3">미리 켜두면 사망 공개 후 1분 동안 생존자 한 명을 선택하고, 달의 자손 선언을 모두에게 보여줍니다. 실제 능력은 발동하지 않습니다. 설정은 본인과 이야기꾼만 볼 수 있습니다.</p>
      <button className={button} aria-pressed={!!state.moon_bluff_enabled} disabled={busy || !me?.alive || !state.room?.roles_released || !['DAY','SETUP'].includes(state.room.phase) || !!state.bmr?.auto?.pending} onClick={() => void run('moon_bluff', { enabled: !state.moon_bluff_enabled })}>{state.moon_bluff_enabled ? '달의 자손인 척하기 켜짐 · 해제' : '달의 자손인 척하기'}</button>
      <p className="mt-2 text-xs text-zinc-400">역할 공개 후 준비 단계나 낮에, 살아 있을 때 설정할 수 있습니다.</p>
    </>}{error && <p role="alert" className="mt-2 text-red-300">{error}</p>}
  </details>;
}

export default function ClocktowerMoonchild({ state, busy, error, allowPopup = true, run }: Props) {
  const choices = state.moon_choices ?? [];
  const now = Date.parse(state.server_now ?? new Date().toISOString());
  const open = choices.filter(c => c.status === 'OPEN');
  const mine = open.find(c => c.actor === state.my_id);
  const announcement = choices.find(c => c.status === 'DONE' && !c.acknowledged);
  const expired = state.is_host ? open.find(c => Date.parse(c.expires_at) <= now) : undefined;
  const [proxy, setProxy] = useState('');
  const name = (id: string | null) => state.members?.find(m => m.user_id === id)?.name ?? '참가자';
  const ack = async () => { if (announcement) await run('moon_ack', { choice_id: announcement.id }); };
  return <>
    {state.is_host && open.length > 0 && <section className="my-4 space-y-3 rounded-xl border border-violet-300/30 p-4"><h3 className="font-bold">달의 자손 공개 선택 대기</h3>{open.map(c => <details key={c.id}><summary>{name(c.actor)} · {c.real_ability ? '실제 능력' : '블러핑'} · {Math.max(0, Math.ceil((Date.parse(c.expires_at) - now) / 1000))}초</summary><p className="my-2 text-sm text-zinc-400">현장에서 말한 대상을 대신 입력할 수 있습니다.</p><TargetChoice key={c.id} choice={c} state={state} busy={busy} run={run} /></details>)}</section>}
    {allowPopup && expired && state.room?.phase === 'DAY' && <ClocktowerPopup title="달의 자손 · 선택 시간이 끝났어요" busy={busy} onClose={() => {}}>
      <p className="my-4"><strong>{name(expired.actor)}</strong>님이 아직 대상을 고르지 않았습니다. 어떻게 진행할까요?</p>
      <div className="grid gap-3"><button className={button} disabled={busy} onClick={() => void run('moon_extend', { choice_id: expired.id, expires_at: expired.expires_at })}>30초 더 주기</button><button className={button} disabled={busy} onClick={() => setProxy(expired.id)}>대신 입력하기</button><button className={button} disabled={busy} onClick={() => void run('moon_expire', { choice_id: expired.id, expires_at: expired.expires_at })}>선택 없이 종료</button></div>
      {proxy === expired.id && <div className="mt-4"><TargetChoice key={expired.id} choice={expired} state={state} busy={busy} run={run} /></div>}
      {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
    </ClocktowerPopup>}
    {allowPopup && !expired && mine && state.room?.phase === 'DAY' && <ClocktowerPopup title="달의 자손 · 대상을 선택해 주세요" busy={busy} onClose={() => {}}><p className="my-3">사망이 공개되었습니다. 생존자 한 명을 선택하면 모두에게 공개됩니다.</p><p className="mb-4 text-amber-200">남은 시간: {Math.max(0, Math.ceil((Date.parse(mine.expires_at) - now) / 1000))}초</p><TargetChoice key={mine.id} choice={mine} state={state} busy={busy} run={run} />{Date.parse(mine.expires_at) <= now && <p className="mt-3">선택 시간이 끝났습니다. 이야기꾼이 시간 연장이나 대신 입력을 결정하고 있습니다.</p>}{error && <p role="alert" className="mt-3 text-red-300">{error}</p>}</ClocktowerPopup>}
    {allowPopup && !expired && !mine && announcement && <ClocktowerPopup key={announcement.id} title="달의 자손 공개 선택" busy={busy} onClose={() => void ack()}><p className="my-6 text-xl leading-9"><strong>{name(announcement.actor)}</strong>님이 달의 자손으로 <strong className="text-violet-300">{name(announcement.target)}</strong>님을 골랐습니다!</p><button className={`${button} w-full`} disabled={busy} onClick={() => void ack()}>확인</button>{error && <p role="alert" className="mt-3 text-red-300">{error}</p>}</ClocktowerPopup>}
  </>;
}

function TargetChoice({ choice, state, busy, run }: { choice: LiveMoonChoice } & Pick<Props, 'state'|'busy'|'run'>) {
  const [target, setTarget] = useState('');
  const expired = !state.is_host && Date.parse(choice.expires_at) <= Date.parse(state.server_now ?? new Date().toISOString());
  return <div className="space-y-3"><label className="block">공개할 대상<select className="mt-2 w-full rounded-xl border border-white/20 bg-zinc-900 p-3" value={target} onChange={e => setTarget(e.target.value)} disabled={busy || expired}><option value="">생존자 선택</option>{state.members?.filter(m => m.alive).map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}</select></label><button className={`${button} w-full bg-violet-400 font-bold text-zinc-950`} disabled={busy || expired || !target} onClick={() => void run('moon_choose', { choice_id: choice.id, target })}>선택 확정 · 모두에게 공개</button></div>;
}
