"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EventParticipant } from "@/types/event";

type Work = { id: string; title: string; min_players: number | null; max_players: number | null; host_requirement: string | null };
type Member = { user_id: string; role: "PLAYER" | "GM" };
type Play = { id: string; murder_mystery_id: string; members: Member[] };
type Candidate = { user_id: string; activity_name: string; site_role: string; played_before: boolean };
const button = "min-h-11 rounded-xl border border-white/20 px-4 py-2 text-sm font-bold disabled:opacity-40";
const input = "min-h-11 w-full rounded-xl border border-white/15 bg-zinc-900 p-3 text-base";

export default function MurderEventWorks({ eventId, mysteryId, participants, canManage, isClosed }: {
  eventId: string; mysteryId: string; participants: EventParticipant[]; canManage: boolean; isClosed: boolean;
}) {
  const db = useMemo(() => createClient(), []);
  const [works, setWorks] = useState<Work[]>([]);
  const [plays, setPlays] = useState<Play[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"CHANGE" | "ADD" | "EDIT" | null>(null);
  const [playId, setPlayId] = useState("");
  const [workId, setWorkId] = useState("");
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState("");
  const [allowRepeat, setAllowRepeat] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const eligible = participants.filter(p => p.attendance_status !== "ABSENT");
  const load = useCallback(async () => {
    const [w, p] = await Promise.all([
      db.from("murder_mysteries").select("id,title,min_players,max_players,host_requirement").order("title"),
      db.from("murder_event_plays").select("id,murder_mystery_id,members").eq("event_id", eventId).eq("cancelled", false).order("created_at").order("id"),
    ]);
    if (w.error || p.error) { setError(w.error?.message || p.error?.message || "작품을 불러오지 못했습니다."); }
    else { setWorks(w.data as Work[]); setPlays(p.data as Play[]); setError(""); }
    setLoading(false);
  }, [db, eventId]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  useEffect(() => {
    if (!mode || !workId) return;
    let active = true;
    void db.rpc("murder_event_work_candidates", { p_event_id: eventId, p_work_id: workId }).then(({ data, error: e }) => {
      if (!active) return;
      setCandidates((data ?? []) as Candidate[]); setCandidateError(e?.message ?? ""); setCandidateLoading(false);
    });
    return () => { active = false; };
  }, [db, eventId, workId, mode]);
  useEffect(() => { if (mode) dialog.current?.showModal(); else dialog.current?.close(); }, [mode]);

  function chooseWork(id: string) { setWorkId(id); setAllowRepeat(false); setCandidates([]); setCandidateError(""); setCandidateLoading(!!id); }
  function open(next: "CHANGE" | "ADD" | "EDIT", play?: Play) {
    setMode(next); setPlayId(play?.id ?? crypto.randomUUID()); setSearch(""); setError("");
    setMembers(play?.members ?? eligible.filter(p => !p.gm_pending).map(p => ({ user_id: p.user_id, role: p.participation_role ?? "PLAYER" })));
    chooseWork(play?.murder_mystery_id ?? "");
  }
  async function save(remove = false, target?: Play) {
    if (lock.current) return;
    if (remove && !window.confirm("이 추가 작품을 목록에서 제외할까요? 이벤트 마감 시 이 작품은 기록되지 않습니다.")) return;
    if (mode === "CHANGE" && !window.confirm("첫 작품을 변경할까요? 아직 플레이하지 않은 경우에만 변경해 주세요. 기존 작품은 플레이 기록에 남지 않습니다.")) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const { error: e } = mode === "CHANGE" && !remove
        ? await db.rpc("change_event_murder_work", { p_event_id: eventId, p_work_id: workId, p_allow_repeat: allowRepeat })
        : await db.rpc("save_event_murder_play", { p_event_id: eventId, p_play_id: target?.id ?? playId, p_work_id: target?.murder_mystery_id ?? workId, p_members: target?.members ?? members, p_allow_repeat: allowRepeat, p_remove: remove });
      if (e) throw e;
      if (mode === "CHANGE" && !remove) { window.location.reload(); return; }
      setMode(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : (e as { message?: string }).message ?? "저장하지 못했습니다."); }
    finally { lock.current = false; setBusy(false); }
  }
  const work = works.find(w => w.id === workId);
  const selectedMembers = mode === "CHANGE" ? eligible.map(p => ({ user_id: p.user_id, role: p.participation_role ?? "PLAYER" })) : members;
  const playerCount = selectedMembers.filter(m => m.role === "PLAYER").length;
  const repeatPlayers = candidates.filter(c => c.played_before && selectedMembers.some(m => m.user_id === c.user_id && m.role === "PLAYER"));
  const choices = works.filter(w => w.id !== mysteryId && !plays.some(p => p.murder_mystery_id === w.id && p.id !== playId) && (!search.trim() || w.id === workId || w.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const memberName = (id: string) => participants.find(p => p.user_id === id)?.profile?.activity_name ?? "참가자";

  return <div className="mt-5 border-t border-white/10 pt-5">
    {canManage && !isClosed && <div className="flex flex-wrap gap-2"><button disabled={loading || busy} className={button} onClick={() => open("CHANGE")}>작품 변경</button><button disabled={loading || busy} className={`${button} bg-red-400 text-zinc-950`} onClick={() => open("ADD")}>+ 다른 작품 추가</button></div>}
    {canManage && <p className="mt-3 text-sm leading-6 text-zinc-400">추가 작품마다 참여 인원과 GM을 지정할 수 있습니다. 이벤트 마감 시 선택한 멤버의 개인 기록에 저장됩니다. 플레이하지 않은 추가 작품은 마감 전에 제외해 주세요.</p>}
    {error && !mode && <p role="alert" className="mt-3 text-sm text-red-300">{error}<button className={`${button} ml-2`} onClick={() => void load()}>다시 불러오기</button></p>}
    {plays.map((play, i) => <article key={play.id} className="mt-4 rounded-2xl border border-white/15 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">{i + 2}번째 작품 · {works.find(w => w.id === play.murder_mystery_id)?.title ?? "작품"}</h3>{canManage && !isClosed && <div className="flex gap-2"><button disabled={busy} className={button} onClick={() => open("EDIT", play)}>작품·인원 수정</button><button disabled={busy} className={`${button} text-red-300`} onClick={() => void save(true, play)}>제외</button></div>}</div><div className="mt-3 flex flex-wrap gap-2">{play.members.map(m => <span key={m.user_id} className="rounded-lg bg-white/5 px-3 py-2 text-sm">{memberName(m.user_id)}{m.role === "GM" ? " · GM" : ""}</span>)}</div></article>)}
    <dialog ref={dialog} onCancel={e => { e.preventDefault(); if (!busy) setMode(null); }} aria-labelledby="murder-work-dialog-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-3xl border border-red-300/30 bg-zinc-950 p-5 text-white backdrop:bg-black/75 sm:p-7">
      <h3 id="murder-work-dialog-title" className="text-xl font-bold">{mode === "CHANGE" ? "첫 작품 변경" : mode === "EDIT" ? "추가 작품·인원 수정" : "다른 작품 추가"}</h3>
      <fieldset disabled={busy} className="mt-5 space-y-4 disabled:opacity-60">
        <label className="block text-sm">작품 검색<input className={`${input} mt-2`} value={search} onChange={e => setSearch(e.target.value)} placeholder="작품 이름" /></label>
        <label className="block text-sm">작품 선택<select className={`${input} mt-2`} value={workId} onChange={e => chooseWork(e.target.value)}><option value="">작품을 선택해 주세요</option>{choices.map(w => <option key={w.id} value={w.id}>{w.title} ({w.min_players ?? "?"}~{w.max_players ?? "?"}명)</option>)}</select></label>
        {work && <p className="text-sm text-zinc-300">작품 인원 {work.min_players ?? "?"}~{work.max_players ?? "?"}명 · 선택한 플레이어 {playerCount}명 · 진행자 {work.host_requirement === "REQUIRED" ? "필요" : work.host_requirement === "RECOMMENDED" ? "권장" : "불필요"}</p>}
        {work && ((work.min_players != null && playerCount < work.min_players) || (work.max_players != null && playerCount > work.max_players)) && <p className="text-sm text-amber-300">선택한 플레이어 수가 작품 인원 범위와 다릅니다. 진행 가능한 인원인지 확인해 주세요.</p>}
        {work?.host_requirement === "REQUIRED" && !selectedMembers.some(m => m.role === "GM") && <p className="text-sm text-amber-300">진행자가 필요한 작품입니다. GM 배정을 확인해 주세요.</p>}
        {mode === "CHANGE" ? <p className="text-sm leading-6 text-zinc-400">현재 참가자와 GM은 유지됩니다. 이벤트 제목·정원은 자동 변경되지 않습니다. 이미 첫 작품을 플레이했다면 ‘다른 작품 추가’를 이용해 주세요.</p> : <div><p className="mb-2 font-bold">참여 인원·GM</p>{eligible.map(p => { const member = members.find(m => m.user_id === p.user_id); const c = candidates.find(c => c.user_id === p.user_id); const gmEligible = c && ["MAIN_ADMIN", "ADMIN", "RULE_MASTER", "MURDER_GM"].includes(c.site_role); return <label key={p.user_id} className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-white/10 p-3"><span className="min-w-0 text-sm">{p.profile?.activity_name ?? "참가자"}{c?.played_before && <small className="block text-amber-300">플레이 이력 있음</small>}</span><select aria-label={`${p.profile?.activity_name ?? "참가자"} 참여 역할`} value={member?.role ?? "NONE"} className="min-h-11 rounded-lg bg-zinc-900 px-2" onChange={e => setMembers(current => [...current.filter(m => m.user_id !== p.user_id), ...(e.target.value === "NONE" ? [] : [{ user_id: p.user_id, role: e.target.value as Member["role"] }])])}><option value="NONE">참여 안 함</option><option value="PLAYER">플레이어</option>{(gmEligible || member?.role === "GM") && <option value="GM">GM</option>}</select></label>; })}</div>}
        {candidateLoading && <p role="status" className="text-sm text-zinc-400">플레이 이력 확인 중…</p>}
        {candidateError && <p role="alert" className="text-sm text-red-300">{candidateError}</p>}
        {repeatPlayers.length > 0 && <p className="text-sm text-amber-300">이미 경험한 플레이어: {repeatPlayers.map(p => p.activity_name).join(", ")}</p>}
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={allowRepeat} onChange={e => setAllowRepeat(e.target.checked)} />이미 경험한 플레이어의 재참가 허용</label>
      </fieldset>
      {error && mode && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button disabled={busy} className={button} onClick={() => setMode(null)}>취소</button><button disabled={busy || !workId || candidateLoading || !!candidateError || (mode !== "CHANGE" && playerCount === 0) || (repeatPlayers.length > 0 && !allowRepeat)} className={`${button} bg-red-400 text-zinc-950`} onClick={() => void save()}>{busy ? "저장 중…" : mode === "CHANGE" ? "작품 변경" : "저장"}</button></div>
    </dialog>
  </div>;
}
