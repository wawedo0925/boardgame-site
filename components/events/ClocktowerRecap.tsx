"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ClocktowerPopup from './ClocktowerPopup';

type Entry = { id: number; night: number; phase: string; title: string; details: string[] };
type Recap = { is_host: boolean; visible: boolean; shared: boolean; ended: boolean; entries: Entry[] };
const button = 'rounded-xl border border-white/20 px-4 py-3 text-sm disabled:opacity-40';

export default function ClocktowerRecap({ roomId }: { roomId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Recap | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('clocktower_recap', { p_room_id: roomId });
    if (error) { setError('복기 로그를 불러오지 못했습니다. 다시 시도해 주세요.'); return; }
    setData(data as Recap); setError('');
  }, [supabase, roomId]);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 5000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [load]);
  async function publish() {
    setBusy(true);
    const { data, error } = await supabase.rpc('clocktower_recap', { p_room_id: roomId, p_publish: true, p_confirm: true });
    setBusy(false);
    if (error) { setError('공개하지 못했습니다. 다시 시도해 주세요.'); return; }
    setData(data as Recap); setError(''); setConfirming(false);
  }
  const groups: { label: string; entries: Entry[] }[] = [];
  for (const entry of data?.entries ?? []) {
    const label = entry.phase === 'SETUP' ? '게임 준비' : `${entry.night}번째 ${entry.phase === 'NIGHT' ? '밤' : '낮'}에 일어난 일`;
    const last = groups.at(-1);
    if (last?.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }
  return <section className="mt-6 rounded-3xl border border-violet-400/25 p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">게임 복기 로그</h2>{data?.is_host && !data.ended && !data.shared && <button className={button} onClick={() => setConfirming(true)}>플레이어에게 공개</button>}</div>
    {error && <p role="alert" className="mt-3 text-red-300">{error}<button className={`${button} ml-2`} onClick={() => void load()}>다시 불러오기</button></p>}
    {!data ? <p className="mt-3 text-zinc-400">로그를 불러오는 중…</p> : !data.visible ? <p className="mt-3 text-sm text-zinc-400">게임 종료 후 또는 이야기꾼이 공개하면 함께 볼 수 있습니다.</p> : <>
      <p className="mt-3 text-sm text-zinc-400">{data.ended || data.shared ? '참가자에게 공개된 로그입니다.' : '이야기꾼만 볼 수 있습니다. 게임 종료 시 자동 공개됩니다.'} 이 기능이 추가된 이후의 진행부터 기록됩니다.</p>
      {!groups.length && <p className="mt-4 text-sm">아직 기록된 진행이 없습니다.</p>}
      <div className="mt-5 space-y-5">{groups.map((group, index) => <details key={`${group.label}:${index}`} open className="rounded-2xl border border-white/10 p-4"><summary className="font-bold text-violet-200">{group.label}</summary><ol className="mt-4 space-y-4">{group.entries.map(entry => <li key={entry.id} className="border-l-2 border-violet-400/30 pl-3"><p className="font-semibold">{entry.title}</p>{entry.details.map((line, i) => <p key={i} className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">{line}</p>)}</li>)}</ol></details>)}</div>
    </>}
    {confirming && <ClocktowerPopup title="복기 로그를 공개할까요?" busy={busy} onClose={() => setConfirming(false)}><p className="leading-7">역할, 능력 사용 대상, 전달 결과 등 비밀 정보가 모든 참가자에게 공개됩니다. 이후 추가되는 로그도 계속 공개되며, 공개를 되돌릴 수 없습니다.</p><div className="mt-6 flex gap-3"><button disabled={busy} className={button} onClick={() => setConfirming(false)}>취소</button><button disabled={busy} className="rounded-xl bg-violet-400 px-4 py-3 font-bold text-zinc-950 disabled:opacity-40" onClick={() => void publish()}>확인 · 플레이어에게 공개</button></div></ClocktowerPopup>}
  </section>;
}
