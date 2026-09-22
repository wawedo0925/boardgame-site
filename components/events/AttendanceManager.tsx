"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AttendanceStatus, EventParticipant } from "@/types/event";
import { arrivalTimeLabel } from "@/lib/event-arrival";

import { attendanceBirthYear, loadNameTags, NAME_TAG_LOAD_ERROR } from "@/lib/member-name-tags";

const STATUS: Record<
  AttendanceStatus,
  { label: string; className: string }
> = {
  REGISTERED: {
    label: "신청",
    className: "border-zinc-600 text-zinc-400",
  },
  PRESENT: {
    label: "출석",
    className:
      "border-emerald-400/50 bg-emerald-400/10 text-emerald-300",
  },
  ABSENT: {
    label: "불참",
    className: "border-red-400/50 bg-red-400/10 text-red-300",
  },
};

const OPTIONS = Object.keys(STATUS) as AttendanceStatus[];

export default function AttendanceManager({
  eventId,
  participants,
  canManage,
  isClosed = false,
  onChanged,
}: {
  eventId: string;
  participants: EventParticipant[];
  canManage: boolean;
  isClosed?: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [expanded, setExpanded] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [allBusy, setAllBusy] = useState(false);
  const [nameTags, setNameTags] = useState<Map<string, boolean>>(new Map());
  const [nameTagError, setNameTagError] = useState("");
  const participantIds = JSON.stringify(participants.map(p => p.user_id).sort());

  useEffect(() => {
    if (!canManage) return;
    let active = true;
    async function refresh() {
      try {
        const tags = await loadNameTags(supabase, JSON.parse(participantIds));
        if (active) { setNameTags(tags); setNameTagError(""); }
      } catch {
        if (active) { setNameTags(new Map()); setNameTagError(NAME_TAG_LOAD_ERROR); }
      }
    }
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, [supabase, participantIds, canManage]);

  const counts = OPTIONS.reduce<Record<AttendanceStatus, number>>(
    (result, status) => {
      result[status] = participants.filter(
        (participant) =>
          (participant.attendance_status ?? "REGISTERED") === status,
      ).length;

      return result;
    },
    {
      REGISTERED: 0,
      PRESENT: 0,
      ABSENT: 0,
    },
  );

  async function changeStatus(
    userId: string,
    status: AttendanceStatus,
  ) {
    try {
      setBusyUserId(userId);

      const { error } = await supabase.rpc("set_event_attendance", {
        p_event_id: eventId,
        p_user_id: userId,
        p_status: status,
      });

      if (error) {
        throw new Error(error.message);
      }

      await onChanged();
    } catch (error) {
      console.error("출석 상태 변경 오류:", error);

      alert(
        error instanceof Error
          ? error.message
          : "출석 상태를 변경하지 못했습니다.",
      );
    } finally {
      setBusyUserId(null);
    }
  }

  async function markAllPresent() {
    if (
      !window.confirm(
        "아직 확인하지 않은 참가자를 모두 출석 처리할까요?",
      )
    ) {
      return;
    }

    try {
      setAllBusy(true);

      const { error } = await supabase.rpc(
        "mark_all_event_participants_present",
        {
          p_event_id: eventId,
        },
      );

      if (error) {
        throw new Error(error.message);
      }

      await onChanged();
    } catch (error) {
      console.error("전원 출석 처리 오류:", error);

      alert(
        error instanceof Error
          ? error.message
          : "전원 출석 처리에 실패했습니다.",
      );
    } finally {
      setAllBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.035] p-5 text-white sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-emerald-300">
            ATTENDANCE
          </p>

          <h2 className="mt-1 text-2xl font-bold">이벤트 출석</h2>

          <p className="mt-2 text-sm text-zinc-500">
            참가자는 기본으로 출석 처리됩니다. 오지 않는 멤버만 불참으로 변경해 주세요.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canManage &&
            !isClosed &&
            counts.REGISTERED > 0 && (
              <button
                type="button"
                onClick={markAllPresent}
                disabled={allBusy}
                className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-zinc-950 disabled:opacity-50"
              >
                {allBusy ? "처리 중..." : "미확인 전원 출석"}
              </button>
            )}

          {canManage &&
            !isClosed &&
            participants.length > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="rounded-xl border border-emerald-400/30 px-4 py-3 text-sm font-bold text-emerald-300 transition hover:bg-emerald-400/10"
                aria-expanded={expanded}
              >
                {expanded ? "간략히 보기 −" : `명단 보기 +`}
              </button>
            )}
        </div>
      </div>

      {nameTagError && <p role="alert" className="mt-4 text-sm text-amber-300">{nameTagError}</p>}
      <div className="mt-5 grid grid-cols-3 gap-2">
        {OPTIONS.map((status) => (
          <div
            key={status}
            className={`rounded-xl border px-3 py-3 ${STATUS[status].className}`}
          >
            <p className="text-xs opacity-70">
              {STATUS[status].label}
            </p>

            <p className="mt-1 text-xl font-bold">
              {counts[status]}명
            </p>
          </div>
        ))}
      </div>

      {!expanded &&
        canManage &&
        !isClosed &&
        participants.length > 0 && (
          <div className="mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-4 text-center">
            <p className="text-sm text-zinc-500">
              참가자 {participants.length}명 · 명단 보기를 누르면
              출석 상태를 관리할 수 있습니다.
            </p>
          </div>
        )}

      {expanded &&
        canManage &&
        !isClosed &&
        participants.length > 0 && (
          <div className="mt-5 border-t border-white/10 pt-5">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {participants.map((participant) => {
                const current =
                  participant.attendance_status ?? "REGISTERED";

                const name =
                  participant.profile?.activity_name?.trim() ||
                  "멤버";

                const isBusy =
                  busyUserId === participant.user_id;

                return (
                  <article
                    key={participant.user_id}
                    className="min-w-0 rounded-2xl border border-white/10 bg-black/10 p-2 sm:p-3"
                  >
                    <div className="flex min-h-10 items-center justify-center gap-2 sm:justify-between">
                      <p
                        className="min-w-0 break-all text-center text-sm font-semibold text-zinc-200 sm:text-left sm:text-base"
                        title={name}
                      >
                        {name}
                        {attendanceBirthYear(participant.profile?.birth_year) && <span className="ml-1 text-xs text-zinc-400">{attendanceBirthYear(participant.profile?.birth_year)}</span>}
                        {nameTags.get(participant.user_id) && <span className="ml-1" role="img" aria-label="이름표 있음" title="이름표 있음">❤️</span>}
                        {participant.arrival_at && <small className="block text-[10px] leading-3 text-sky-300">{arrivalTimeLabel(participant.arrival_at)}</small>}
                      </p>

                      <span
                        className={`hidden shrink-0 rounded-full border px-2.5 py-1 text-xs sm:inline ${STATUS[current].className}`}
                      >
                        {STATUS[current].label}
                      </span>
                    </div>

                    <select
                      aria-label={`${name} 출석 상태`}
                      value={current}
                      disabled={isBusy || allBusy}
                      onChange={(event) => void changeStatus(participant.user_id, event.target.value as AttendanceStatus)}
                      className={`mt-2 min-h-11 w-full min-w-0 rounded-lg border bg-zinc-950 px-1 text-xs font-semibold disabled:opacity-40 sm:hidden ${STATUS[current].className}`}
                    >
                      {OPTIONS.map((status) => <option key={status} value={status}>{STATUS[status].label}</option>)}
                    </select>
                    <div className="mt-3 hidden grid-cols-3 gap-1.5 sm:grid">
                      {OPTIONS.map((status) => (
                        <button
                          key={status}
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            changeStatus(
                              participant.user_id,
                              status,
                            )
                          }
                          className={`rounded-lg border px-2 py-2 text-xs font-semibold transition disabled:opacity-40 ${
                            current === status
                              ? STATUS[status].className
                              : "border-white/10 text-zinc-600 hover:text-zinc-300"
                          }`}
                        >
                          {STATUS[status].label}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

      {participants.length === 0 && (
        <div className="mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center">
          <p className="text-sm text-zinc-500">
            등록된 참가자가 없습니다.
          </p>
        </div>
      )}

      {isClosed && participants.length > 0 && (
        <p className="mt-5 rounded-xl bg-black/20 px-4 py-3 text-sm text-zinc-500">
          마감된 이벤트의 출석 기록은 수정할 수 없습니다.
        </p>
      )}
    </section>
  );
}
