"use client";
import ClocktowerRecap from './ClocktowerRecap';

import Link from "next/link";
import { clocktowerPlayTitle } from "@/lib/clocktower/play-title";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CLOCKTOWER_CHARACTERS, clocktowerDifficultyFromTitle } from "@/lib/clocktower/characters";
import type { EventParticipant } from "@/types/event";

type Props = { eventId: string; title: string; participants: EventParticipant[]; canManage: boolean; isMainAdmin: boolean; isClosed: boolean };
type SavedPlayer = { user_id: string; name: string; role_name: string | null; team_name: string | null; is_winner: boolean | null; is_gm: boolean };
type Play = { id: string; play_number: number; room_id: string | null; result_round_id: string | null; phase: string | null; winner: string | null; automatic: boolean; players: SavedPlayer[] };
type Command = (action: string, data?: Record<string, unknown>) => Promise<Record<string, string>>;
const nameOf = (p: EventParticipant) => p.profile?.activity_name?.trim() || "회원";
const errorOf = (error: unknown) => typeof error === "object" && error && "message" in error ? String(error.message) : "저장하지 못했습니다. 다시 시도해 주세요.";
const button = "rounded-xl bg-violet-400 px-5 py-3 font-bold text-zinc-950 disabled:opacity-40";

export default function ClocktowerResultPanel(props: Props) {
  const { eventId, canManage, isMainAdmin, isClosed } = props;
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [plays, setPlays] = useState<Play[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("clocktower_event_plays_command", { p_event_id: eventId, p_action: "list" });
    if (error) { setError(error.message); setLoading(false); return; }
    setPlays(data as Play[]); setError(""); setLoading(false);
  }, [eventId, supabase]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() { if (document.visibilityState === "visible") await load(); if (active) timer = setTimeout(poll, 5000); }
    void poll();
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => { active = false; clearTimeout(timer); window.removeEventListener("focus", focus); };
  }, [load]);
  const command: Command = async (action, data = {}) => {
    const result = await supabase.rpc("clocktower_event_plays_command", { p_event_id: eventId, p_action: action, p_data: data });
    if (result.error) throw result.error;
    await load();
    return result.data;
  };
  async function add() {
    if (busy) return;
    setBusy(true); setError("");
    try { await command("add", { after_id: plays.at(-1)?.id ?? null }); router.refresh(); }
    catch (error) { setError(errorOf(error)); }
    finally { setBusy(false); }
  }

  const hasActiveRoom = plays.some(play => play.room_id && play.phase !== "ENDED");
  return <section className="space-y-5 text-white">
    <div><p className="text-sm font-semibold tracking-[.18em] text-violet-300">CLOCKTOWER RESULT</p><h2 className="mt-1 text-2xl font-bold">캐릭터·승리 진영 기록</h2><p className="mt-2 text-sm text-zinc-400">판별로 프로그램에 입장하거나, 프로그램 없이 진행한 결과를 직접 기록하세요. 프로그램 결과는 승리 진영이 확정될 때 자동 저장됩니다.</p></div>
    {error && <p role="alert" className="rounded-xl bg-red-400/10 p-4 text-red-300">{error}</p>}
    {loading ? <p className="text-zinc-400">기록을 불러오는 중…</p> : <>
      {plays.map(play => <PlayCard key={play.id} {...props} play={play} command={command} hasActiveRoom={hasActiveRoom} />)}
      {!plays.length && !canManage && <p className="rounded-2xl border border-white/10 p-5 text-zinc-400">이야기꾼이 첫 판을 준비하면 이곳에 입장 버튼이 표시됩니다.</p>}
      {canManage && (!plays.length || isMainAdmin) && !isClosed && <div><button onClick={() => void add()} disabled={busy} className={button}>{busy ? "준비 중…" : plays.length ? "한판 더" : "첫번째 시계탑 준비하기"}</button>{hasActiveRoom && <p className="mt-2 text-sm text-zinc-400">다음 게임 카드는 미리 추가할 수 있습니다. 새 마을은 현재 게임 종료 후 열 수 있습니다.</p>}</div>}
    </>}
  </section>;
}

function PlayCard({ play, command, hasActiveRoom, ...props }: Props & { play: Play; command: Command; hasActiveRoom: boolean }) {
  const { eventId, canManage, isClosed } = props;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = Boolean(play.room_id) && play.phase !== "ENDED";
  async function open() {
    setBusy(true); setError("");
    try { const result = await command("open", { play_id: play.id }); router.push(`/events/${eventId}/clocktower?room=${result.room_id}`); }
    catch (error) { setError(errorOf(error)); setBusy(false); }
  }
  return <article id={`clocktower-play-${play.id}`} className="rounded-3xl border border-violet-400/25 bg-violet-400/[0.035] p-5 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-xl font-bold">{clocktowerPlayTitle(play.play_number)}</h3><p className="mt-1 text-sm text-zinc-400">{play.result_round_id ? play.automatic ? "승패 확정 · 자동 저장 완료" : "수동 기록 저장 완료" : play.phase === "ENDED" ? "진행 종료 · 승패 기록 없음" : active ? play.phase === "SETUP" ? "프로그램 준비 중" : "프로그램 진행 중" : "새 게임 준비"}</p></div>
      {active ? <Link className={button} href={`/events/${eventId}/clocktower?room=${play.room_id}`}>시계탑 마을 입장</Link> : !play.result_round_id && !play.room_id && !isClosed && (canManage ? <button className={button} disabled={busy || hasActiveRoom} onClick={() => void open()}>{busy ? "준비 중…" : hasActiveRoom ? "현재 게임 종료 후 마을 열기" : "이야기꾼으로 프로그램 시작"}</button> : <span className="text-sm text-zinc-400">이야기꾼의 프로그램 시작 대기 중</span>)}
    </div>
    {error && <p role="alert" className="mt-4 text-red-300">{error}</p>}
    {play.result_round_id && <div className="mt-5 space-y-2">{play.players.map(player => <div key={player.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-4 py-3"><strong>{player.name}</strong><span className={player.is_winner ? "text-amber-300" : "text-zinc-400"}>{player.is_gm ? "이야기꾼 · 진행" : `${player.role_name} · ${player.is_winner ? "승리" : "패배"}`}</span></div>)}</div>}
    {canManage && !isClosed && !active && !play.automatic && <>
      <button className="mt-5 rounded-xl border border-white/15 px-4 py-3 text-sm" onClick={() => setEditing(!editing)}>{editing ? "입력창 접기" : play.result_round_id ? "수동 기록 수정" : "프로그램 없이 진행 · 결과 직접 기록"}</button>
      {editing && <ManualResult {...props} play={play} command={command} onSaved={() => { setEditing(false); router.refresh(); }} />}
    </>}
    {play.room_id && play.phase === "ENDED" && <details className="mt-5"><summary className="cursor-pointer text-violet-200">게임 복기 로그 보기</summary><ClocktowerRecap key={play.room_id} roomId={play.room_id} /></details>}
    {active && <p className="mt-4 text-sm text-zinc-400">브라우저를 닫아도 승패 결과는 저장되지 않습니다. 선·악 진영 중 승자가 확정되면 이 카드에 기록됩니다.</p>}
  </article>;
}

function ManualResult({ title, participants, play, command, onSaved }: Props & { play: Play; command: Command; onSaved: () => void }) {
  const difficulty = clocktowerDifficultyFromTitle(title);
  const characters = difficulty ? CLOCKTOWER_CHARACTERS[difficulty] : [];
  const [characterByUser, setCharacterByUser] = useState<Record<string, string>>(() => Object.fromEntries(play.players.map(p => [p.user_id, p.is_gm ? "이야기꾼" : p.role_name ?? ""])));
  const [winningFaction, setWinningFaction] = useState<"선" | "악" | "">(() => { const winner = play.players.find(p => p.is_winner); return winner ? winner.team_name?.endsWith(" · 악") ? "악" : "선" : ""; });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const eligible = play.result_round_id ? play.players.map(p => ({ user_id: p.user_id, name: p.name })) : participants.filter(p => p.attendance_status === "PRESENT").map(p => ({ user_id: p.user_id, name: nameOf(p) }));
  async function save() {
    if (busy) return;
    if (!difficulty || !winningFaction) { setError("난이도와 승리 진영을 확인해 주세요."); return; }
    const missing = eligible.find(p => !characters.some(c => c.name === characterByUser[p.user_id]));
    if (missing) { setError(`${missing.name}님의 캐릭터를 선택해 주세요.`); return; }
    const assignments = eligible.map(p => { const c = characters.find(c => c.name === characterByUser[p.user_id])!; return { user_id: p.user_id, character_name: c.name, character_type: c.type, faction: c.faction }; });
    setBusy(true); setError("");
    try { await command("save", { play_id: play.id, difficulty, winning_faction: winningFaction, assignments }); onSaved(); }
    catch (error) { setError(errorOf(error)); }
    finally { setBusy(false); }
  }
  return <div className="mt-5 border-t border-white/10 pt-5">
    <p className="text-sm text-zinc-400">게임이 끝난 뒤 최종 캐릭터와 승리 진영을 기록해 주세요.</p>
    {!characters.length ? <p className="mt-3 text-red-300">이 일정의 캐릭터 목록을 확인할 수 없습니다.</p> : <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{eligible.map(member => <label key={member.user_id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><span className="font-bold">{member.name}</span><select disabled={busy} value={characterByUser[member.user_id] ?? ""} onChange={e => setCharacterByUser(current => ({ ...current, [member.user_id]: e.target.value }))} className="mt-3 h-12 w-full rounded-xl border border-white/10 bg-zinc-900 px-3"><option value="">캐릭터 선택</option>{(["이야기꾼", "주민", "외지인", "하수인", "악마"] as const).map(type => <optgroup key={type} label={type}>{characters.filter(c => c.type === type).map(c => <option key={c.name} value={c.name}>{c.name} · {c.faction}</option>)}</optgroup>)}</select></label>)}</div>
      {!eligible.length && <p className="mt-4 text-zinc-400">먼저 참가자를 출석 처리해 주세요.</p>}
      <p className="mt-5 font-bold">승리 진영</p><div className="mt-2 grid grid-cols-2 gap-3">{(["선", "악"] as const).map(faction => <button key={faction} disabled={busy} onClick={() => setWinningFaction(faction)} className={`h-12 rounded-xl font-bold ${winningFaction === faction ? "bg-violet-400 text-zinc-950" : "bg-white/5 text-zinc-300"}`}>{faction} 진영</button>)}</div>
      {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
      <button disabled={busy || !eligible.length} onClick={() => void save()} className={`${button} mt-5 w-full`}>{busy ? "저장 중…" : "캐릭터·결과 저장"}</button>
    </>}
  </div>;
}
