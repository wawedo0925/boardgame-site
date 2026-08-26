"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type WaitlistMember = {
  id: string;
  user_id: string;
  joined_at: string;
  profile: { activity_name: string | null } | null;
};

export default function EventCapacityCard({
  eventId,
  maxParticipants,
  participantCount,
  waitlist,
  canManage,
  isClosed,
  onChanged,
  onMemberRemove,
}: {
  eventId: string;
  maxParticipants: number | null;
  participantCount: number;
  waitlist: WaitlistMember[];
  canManage: boolean;
  isClosed: boolean;
  onChanged: (maxParticipants: number | null) => Promise<void> | void;
  onMemberRemove: (userId: string, memberName: string) => Promise<void> | void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [value, setValue] = useState(maxParticipants?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => setValue(maxParticipants?.toString() ?? ""), [maxParticipants]);

  async function save() {
    const parsed = value.trim() === "" ? null : Number(value);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1)) {
      alert("참가 정원은 1명 이상의 정수로 입력해 주세요.");
      return;
    }
    try {
      setSaving(true);
      const { data, error } = await supabase.rpc("update_event_capacity", {
        p_event_id: eventId,
        p_max: parsed,
      });
      if (error) throw error;
      await onChanged(parsed);
      const promoted = Number(data ?? 0);
      alert(promoted > 0 ? `정원을 변경하고 대기자 ${promoted}명을 참가 확정했습니다.` : "참가 정원을 변경했습니다.");
    } catch (error) {
      console.error("참가 정원 변경 오류:", error);
      alert(error instanceof Error ? error.message : "참가 정원을 변경하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const overCapacity = maxParticipants !== null && participantCount > maxParticipants;

  return (
    <section className="rounded-3xl border border-sky-400/20 bg-sky-400/[0.035] p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-sky-300">PARTICIPANT CAPACITY</p>
          <h2 className="mt-1 text-2xl font-bold">참가 정원 및 대기자</h2>
          <p className="mt-2 text-sm text-zinc-500">정원을 늘리면 대기 순서대로 자동 참가 확정됩니다.</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-zinc-500">현재 참가</p>
          <p className="text-xl font-bold text-sky-300">{participantCount}명 / {maxParticipants ?? "무제한"}</p>
        </div>
      </div>

      {overCapacity && (
        <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
          현재 참가자는 유지됩니다. 인원이 정원 아래로 내려갈 때까지 새 신청자는 대기자로 등록됩니다.
        </p>
      )}

      {canManage && !isClosed && (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <input
            type="number"
            min={1}
            step={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="비워두면 무제한"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-sky-400/60"
          />
          <button type="button" onClick={save} disabled={saving} className="rounded-xl bg-sky-400 px-5 py-3 font-bold text-zinc-950 disabled:opacity-50">
            {saving ? "저장 중..." : "정원 변경"}
          </button>
        </div>
      )}

      <div className="mt-5 border-t border-white/10 pt-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">대기 명단</h3>
          <span className="text-sm font-semibold text-sky-300">{waitlist.length}명</span>
        </div>
        {waitlist.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600">현재 대기자가 없습니다.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {waitlist.map((member, index) => (
              <div key={member.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3">
                <span className="font-bold text-sky-300">{index + 1}</span>
                <span className="min-w-0 flex-1 font-semibold text-zinc-200">{member.profile?.activity_name?.trim() || "멤버"}</span>
                {canManage && !isClosed && <button type="button" onClick={() => void onMemberRemove(member.user_id, member.profile?.activity_name?.trim() || "멤버")} className="shrink-0 rounded-lg border border-red-400/25 px-3 py-2 text-xs font-bold text-red-300">대기 취소</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
