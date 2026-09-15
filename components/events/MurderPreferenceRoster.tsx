"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MurderPreferenceResult } from "@/components/mypage/MurderPlayPreferences";
import type { MurderAnswers } from "@/lib/murder-preferences";
type Roster = { allowed: boolean; members?: { user_id: string; name: string; answers: MurderAnswers | null; updated_at: string | null }[] };
export default function MurderPreferenceRoster({ eventId }: { eventId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("event_murder_preferences", { p_event_id: eventId });
      if (error) throw error;
      setRoster(data);
    } catch { setRoster(null); setError(true); }
    finally { setBusy(false); }
  }, [supabase, eventId]);
  useEffect(() => {
    let active = true;
    void supabase.rpc("event_murder_preferences", { p_event_id: eventId }).then(({ data, error }) => {
      if (!active) return;
      setRoster(error ? null : data); setError(Boolean(error)); setBusy(false);
    }, () => { if (active) { setRoster(null); setError(true); setBusy(false); } });
    return () => { active = false; };
  }, [supabase, eventId]);
  if (!roster?.allowed) return error ? <button className="mt-4 text-sm text-zinc-400" onClick={() => { setBusy(true); setError(false); void load(); }}>GM 성향 정보 조회 다시 시도</button> : null;
  return <section className="mt-5 border-t border-white/10 pt-5">
    <div className="flex items-center justify-between gap-3"><h3 className="font-bold text-purple-300">참가자 플레이 성향 · 담당 GM 전용</h3><button disabled={busy} onClick={() => { setBusy(true); setError(false); void load(); }} className="min-h-11 rounded-xl border border-white/15 px-3 text-sm">{busy ? "조회 중..." : "새로고침"}</button></div>
    <p className="mt-2 text-sm text-zinc-400">역할 배정을 위한 최신 선호 응답입니다. 멤버가 피하고 싶은 역할을 먼저 확인해 주세요.</p>
    <div className="mt-4 space-y-3">{roster.members?.map(m => <details key={m.user_id} className="rounded-xl border border-white/10 p-4"><summary className="cursor-pointer font-semibold">{m.name} <span className="ml-2 text-sm font-normal text-zinc-400">{m.answers ? "성향 보기" : "아직 응답하지 않았어요"}</span></summary>{m.answers && <><MurderPreferenceResult answers={m.answers} /><p className="mt-3 text-xs text-zinc-500">마지막 응답: {m.updated_at && new Date(m.updated_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</p></>}</details>)}</div>
    {!roster.members?.length && <p className="mt-4 text-sm text-zinc-400">참가한 플레이어가 없습니다.</p>}
  </section>;
}
