"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getEventGroups, saveGroups, clearGroups } from "@/lib/services/groups";
import { getEventGames } from "@/lib/services/events";
import type { GroupDraft, GroupParticipant } from "@/types/group";
import type { EventGame } from "@/types/event";
import AddGroupRoundDialog from "./AddGroupRoundDialog";
import GroupRoundHistory from "./GroupRoundHistory";
import GameRecommendationDialog from "./GameRecommendationDialog";

type Props = { eventId: string; participants: GroupParticipant[]; currentUserId?: string | null; canManage?: boolean; isClosed?: boolean };
const participantLabel = (participant: GroupParticipant) => participant.profile?.activity_name || "회원";
const participantBirthLabel = (participant?: GroupParticipant) => {
  const value = participant?.profile?.birth_year?.trim();
  if (!value) return "";
  const numeric = Number(value.replace(/[^0-9]/g, ""));
  if (!Number.isFinite(numeric)) return value.includes("년생") ? value : `${value}년생`;
  const shortYear = numeric >= 1900 ? numeric % 100 : numeric;
  return `${String(shortYear).padStart(2, "0")}년생`;
};
const ParticipantName = ({ participant }: { participant: GroupParticipant }) => <span className="inline-flex items-start gap-1.5"><span>{participantLabel(participant)}</span>{participantBirthLabel(participant) && <small className="mt-0.5 text-[10px] font-medium leading-none text-zinc-500">{participantBirthLabel(participant)}</small>}</span>;
const draftId = () => `draft-${Date.now()}-${Math.random()}`;

export default function GroupPlaySection({ eventId, participants, currentUserId, canManage, isClosed = false }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [drafts, setDrafts] = useState<GroupDraft[]>([]);
  const [games, setGames] = useState<EventGame[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState<GroupDraft | null>(null);
  const [recommending, setRecommending] = useState<GroupDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = Boolean(canManage && !isClosed);

  const load = useCallback(async () => {
    const [groups, eventGames] = await Promise.all([getEventGroups(supabase, eventId), getEventGames(supabase, eventId)]);
    setDrafts(groups.map(group => ({ id: group.id, name: group.name, sessionId: null, ruleMasterUserId: group.rule_master_user_id, userIds: group.members.map(member => member.user_id) })));
    setGames(eventGames);
  }, [eventId, supabase]);

  useEffect(() => { void load(); }, [load]);

  const eligibleParticipants = useMemo(
    () => participants.filter(participant => participant.attendance_status === "PRESENT"),
    [participants],
  );
  const eligibleIds = useMemo(
    () => new Set(eligibleParticipants.map(participant => participant.user_id)),
    [eligibleParticipants],
  );

  useEffect(() => {
    if (!editable) return;
    setDrafts(current => current.map(group => ({
      ...group,
      userIds: group.userIds.filter(userId => eligibleIds.has(userId)),
      ruleMasterUserId: group.ruleMasterUserId && eligibleIds.has(group.ruleMasterUserId) ? group.ruleMasterUserId : null,
    })));
  }, [editable, eligibleIds]);

  const assigned = new Set(drafts.flatMap(group => group.userIds));
  const unassigned = eligibleParticipants.filter(participant => !assigned.has(participant.user_id));

  function move(userId: string, groupId: string) {
    if (!editable) return;
    setDrafts(current => current
      .map(group => ({ ...group, userIds: group.userIds.filter(id => id !== userId), ruleMasterUserId: group.ruleMasterUserId===userId?null:group.ruleMasterUserId }))
      .map(group => group.id === groupId ? { ...group, userIds: [...group.userIds, userId] } : group));
    setSelected(null);
  }

  function addGroup() {
    setDrafts(current => [...current, { id: draftId(), name: `${current.length + 1}조`, sessionId: null, ruleMasterUserId: null, userIds: [] }]);
  }

  function balance() {
    if (eligibleParticipants.length === 0) {
      alert("먼저 참가자의 출석 상태를 확인해 주세요.");
      return;
    }
    const count = Math.max(1, drafts.length || Math.ceil(eligibleParticipants.length / 4));
    const next = Array.from({ length: count }, (_, index) => ({
      id: drafts[index]?.id || draftId(), name: drafts[index]?.name || `${index + 1}조`, sessionId: null, ruleMasterUserId: null as string|null, userIds: [] as string[],
    }));
    eligibleParticipants.forEach((participant, index) => next[index % count].userIds.push(participant.user_id));
    setDrafts(next);
  }

  async function save() {
    if (!currentUserId || !editable) return;
    try {
      setBusy(true);
      await saveGroups(
        supabase,
        eventId,
        currentUserId,
        drafts.map(group => ({
          ...group,
          userIds: group.userIds.filter(userId => eligibleIds.has(userId)),
        })),
      );
      await load();
      alert("조 편성이 확정되었습니다.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally { setBusy(false); }
  }

  async function reset() {
    if (!editable || !confirm("조 편성을 전체 초기화할까요?")) return;
    await clearGroups(supabase, eventId);
    await load();
  }

  return <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-white sm:p-7">
    <div className="flex flex-wrap justify-between gap-3">
      <div><p className="text-sm text-amber-300">GROUP PLAY</p><h2 className="text-2xl font-bold">조 편성 및 플레이</h2></div>
      {editable && <div className="flex gap-2"><button onClick={balance} className="rounded-xl bg-white/10 px-4">자동 균등 배정</button><button onClick={addGroup} className="rounded-xl bg-amber-400 px-4 font-bold text-zinc-950">+ 조 추가</button></div>}
    </div>
    {isClosed && <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-200">이벤트가 마감되어 기록을 볼 수만 있습니다.</p>}
    <div className="mt-5 rounded-xl border border-dashed border-white/10 p-4"><p className="text-sm font-bold">미배정 {unassigned.length}명</p><div className="mt-2 flex flex-wrap gap-2">{unassigned.map(participant => <button disabled={!editable} key={participant.user_id} onClick={() => setSelected(participant.user_id)} className="rounded-xl bg-white/10 px-3 py-2 disabled:cursor-default"><ParticipantName participant={participant}/></button>)}</div></div>
    <div className="mt-5 space-y-5">{drafts.map(group => {
      const groupGames = games.map(game => ({ ...game, rounds: game.rounds.filter(round => round.group_id === group.id) })).filter(game => game.rounds.length);
      const groupEditable=Boolean(!isClosed&&(editable||group.ruleMasterUserId===currentUserId));
      return <article key={group.id} onClick={() => selected && move(selected, group.id)} className={`rounded-2xl border p-4 ${selected && editable ? "border-amber-400" : "border-white/10"}`}>
        <div className="flex gap-2"><input disabled={!editable} value={group.name} onChange={event => setDrafts(current => current.map(item => item.id === group.id ? { ...item, name: event.target.value } : item))} className="h-11 flex-1 rounded-xl bg-white/10 px-3 font-bold disabled:opacity-80"/>{editable && <button onClick={event => { event.stopPropagation(); setDrafts(current => current.filter(item => item.id !== group.id)); }} className="text-red-300">삭제</button>}</div>
        <div className="mt-3 flex flex-wrap gap-2">{group.userIds.map(userId => { const participant = participants.find(item => item.user_id === userId); return <button disabled={!editable} key={userId} onClick={event => { event.stopPropagation(); setSelected(userId); }} className="rounded-xl bg-white/5 px-3 py-2 disabled:cursor-default">{participant ? <ParticipantName participant={participant}/> : "회원"}{editable ? <span className="ml-1">· 이동</span> : null}</button>; })}</div>
        {editable&&<label className="mt-3 block text-sm text-zinc-400">조 룰마스터<select value={group.ruleMasterUserId??""} onChange={event=>setDrafts(current=>current.map(item=>item.id===group.id?{...item,ruleMasterUserId:event.target.value||null}:item))} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-white"><option value="">룰마스터 미지정</option>{group.userIds.map(userId=>{const participant=participants.find(item=>item.user_id===userId);return <option key={userId} value={userId}>{participant?`${participantLabel(participant)} · ${participantBirthLabel(participant)}`.replace(/ · $/,""):"회원"}</option>})}</select></label>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4"><h3 className="font-bold">플레이 기록</h3>{groupEditable && <div className="flex gap-2"><button onClick={event => { event.stopPropagation(); group.id.startsWith("draft-") ? alert("먼저 조 편성을 저장해 주세요.") : setRecommending(group); }} className="rounded-xl bg-emerald-400/15 px-4 py-2 font-bold text-emerald-300">게임 추천</button><button onClick={event => { event.stopPropagation(); group.id.startsWith("draft-") ? alert("먼저 조 편성을 저장해 주세요.") : setAdding(group); }} className="rounded-xl bg-amber-400 px-4 py-2 font-bold text-zinc-950">+ 게임 한 판 추가</button></div>}</div>
        <GroupRoundHistory games={groupGames} canManage={groupEditable} onChanged={load}/>
      </article>;
    })}</div>
    {editable && <div className="mt-5 grid grid-cols-2 gap-3"><button onClick={reset} className="h-12 rounded-xl border border-red-400/30 text-red-300">전체 초기화</button><button disabled={busy} onClick={save} className="h-12 rounded-xl bg-amber-400 font-bold text-zinc-950">조 편성 확정</button></div>}
    {adding && <AddGroupRoundDialog eventId={eventId} groupId={adding.id} userIds={adding.userIds} onClose={() => setAdding(null)} onSaved={load}/>} 
    {recommending && <GameRecommendationDialog eventId={eventId} groupId={recommending.id} userIds={recommending.userIds} history={games.map(game => ({ ...game, rounds: game.rounds.filter(round => round.group_id === recommending.id) }))} onClose={() => setRecommending(null)} onSaved={load}/>} 
  </section>;
}
