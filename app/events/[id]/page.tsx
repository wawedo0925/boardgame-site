
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import Header from "../../components/Header";
import GroupPlaySection from "@/components/events/GroupPlaySection";
import EventStatistics from "@/components/events/EventStatistics";
import EventLifecycleCard from "@/components/events/EventLifecycleCard";
import EventNoticeCard from "@/components/events/EventNoticeCard";
import AttendanceManager from "@/components/events/AttendanceManager";
import MurderMysteryEventPanel from "@/components/events/MurderMysteryEventPanel";
import EventCapacityCard, { type WaitlistMember } from "@/components/events/EventCapacityCard";
import EventCancellationCard from "@/components/events/EventCancellationCard";
import type { AttendanceStatus } from "@/types/event";
import { createClient } from "@/lib/supabase/client";

type EventRow = {
  id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  location: string | null;
  description: string | null;
  created_by: string;
  created_at: string;
  event_status: "OPEN" | "CLOSED" | "CANCELLED";
  closed_at: string | null;
  max_participants: number | null;
  event_kind: "BOARDGAME" | "MURDER_MYSTERY" | "GENERAL";
  murder_mystery_id: string | null;
};

type ParticipantRow = {
  id: string;
  user_id: string;
  joined_at: string;
  attendance_status: AttendanceStatus;
  attendance_checked_at: string | null;
  participation_role: "PLAYER" | "GM";
  repeat_override: boolean;
};

type ProfileRow = {
  id: string;
  activity_name: string | null;
  birth_year: string | null;
  region: string | null;
  gender: string | null;
};

type ParticipantView = ParticipantRow & {
  profile: ProfileRow | null;
};

function formatDate(dateValue: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(dateValue));
}

function formatTime(dateValue: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(dateValue));
}

function getEventStatus(event: EventRow) {
  const now = new Date();
  const start = new Date(event.started_at);
  const end = event.ended_at ? new Date(event.ended_at) : null;

  if (end && now > end) {
    return "종료";
  }

  if (now >= start && (!end || now <= end)) {
    return "진행 중";
  }

  return "예정";
}

function getStatusStyle(status: string) {
  if (status === "진행 중") {
    return "bg-emerald-400/10 text-emerald-300";
  }

  if (status === "예정") {
    return "bg-amber-400/10 text-amber-300";
  }

  return "bg-zinc-400/10 text-zinc-400";
}

function makeParticipantName(profile: ProfileRow | null) {
  if (!profile) {
    return "회원";
  }

  return (
    [
      profile.activity_name,
      profile.birth_year,
      profile.region,
      profile.gender,
    ]
      .filter(Boolean)
      .join(" / ") || "회원"
  );
}

function getInitial(profile: ProfileRow | null) {
  return profile?.activity_name?.trim().slice(0, 1) || "회";
}

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [participants, setParticipants] = useState<ParticipantView[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [canOperate, setCanOperate] = useState(false);
  const [siteRole, setSiteRole] = useState("MEMBER");

  async function loadParticipants() {
    const { data: participantData, error: participantError } = await supabase
      .from("event_participants")
      .select("id, user_id, joined_at, attendance_status, attendance_checked_at, participation_role, repeat_override")
      .eq("event_id", eventId)
      .order("joined_at", { ascending: true });

    if (participantError) {
      console.error("이벤트 참가자 조회 오류:", participantError);
      setParticipants([]);
      return;
    }

    const participantRows = (participantData ?? []) as ParticipantRow[];
    const userIds = participantRows.map((participant) => participant.user_id);

    if (userIds.length === 0) {
      setParticipants([]);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, activity_name, birth_year, region, gender")
      .in("id", userIds);

    if (profileError) {
      console.error("참가자 프로필 조회 오류:", profileError);
    }

    const profiles = (profileData ?? []) as ProfileRow[];
    const profileMap = new Map(
      profiles.map((profile) => [profile.id, profile]),
    );

    setParticipants(
      participantRows.map((participant) => ({
        ...participant,
        profile: profileMap.get(participant.user_id) ?? null,
      })),
    );
  }

  async function loadWaitlist() {
    const { data, error } = await supabase.from("event_waitlist")
      .select("id, user_id, joined_at").eq("event_id", eventId)
      .order("joined_at", { ascending: true });
    if (error) {
      console.error("대기 명단 조회 오류:", error);
      setWaitlist([]);
      return;
    }
    const rows = (data ?? []) as Array<{ id: string; user_id: string; joined_at: string }>;
    const ids = rows.map((row) => row.user_id);
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, activity_name").in("id", ids)
      : { data: [] };
    const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    setWaitlist(rows.map((row) => ({ ...row, profile: profileMap.get(row.user_id) ?? null })));
  }

  async function reloadParticipation() {
    await Promise.all([loadParticipants(), loadWaitlist()]);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      setIsLoading(true);
      setErrorMessage("");

      const [
        {
          data: { user: currentUser },
          error: userError,
        },
        { data: eventData, error: eventError },
      ] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from("events")
          .select(
            "id, title, started_at, ended_at, location, description, created_by, created_at, event_status, closed_at, max_participants, event_kind, murder_mystery_id",
          )
          .eq("id", eventId)
          .maybeSingle(),
      ]);

      if (!isMounted) {
        return;
      }

      if (userError) {
        console.error("이벤트 상세 사용자 조회 오류:", userError);
      }

      setUser(currentUser);

      if (eventError) {
        console.error("이벤트 상세 조회 오류:", eventError);
        setErrorMessage("이벤트 정보를 불러오지 못했습니다.");
        setIsLoading(false);
        return;
      }

      if (!eventData) {
        setErrorMessage("존재하지 않는 이벤트입니다.");
        setIsLoading(false);
        return;
      }

      setEvent(eventData as EventRow);
      if (currentUser) {
        const [{ data: operator }, { data: role }] = await Promise.all([
          supabase.rpc("can_operate_event", { target_event_id: eventId }),
          supabase.rpc("current_site_role"),
        ]);
        setCanOperate(Boolean(operator));
        setSiteRole((role as string) ?? "MEMBER");
      }
      await reloadParticipation();

      if (isMounted) {
        setIsLoading(false);
      }
    }

    void loadPage();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      setUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [eventId, supabase]);

  const isJoined = participants.some(
    (participant) => participant.user_id === user?.id,
  );
  const isWaitlisted = waitlist.some((member) => member.user_id === user?.id);
  const isCreator = Boolean(user && event && event.created_by === user.id);
  const canManage = isCreator || canOperate;
  const canEditEvent = siteRole === "MAIN_ADMIN" || siteRole === "ADMIN" || (siteRole === "RULE_MASTER" && isCreator);
  const status = event ? getEventStatus(event) : "";
  const isEnded = status === "종료";

  const isClosed = event?.event_status === "CLOSED";
  const isCancelled = event?.event_status === "CANCELLED";
  const isLocked = isClosed || isCancelled;

  async function handleJoin() {
    if (!user) {
      alert("이벤트에 참가하려면 먼저 로그인해 주세요.");
      return;
    }

    setIsActionLoading(true);

    const { data, error } = await supabase.rpc("join_event_with_capacity", {
      p_event_id: eventId,
    });

    if (error) {
      console.error("이벤트 참가 오류:", error);
      alert(`참가 신청에 실패했습니다: ${error.message}`);
      setIsActionLoading(false);
      return;
    }

    await reloadParticipation();
    if (data === "WAITLISTED") {
      alert("정원이 가득 차 대기 명단에 등록되었습니다.");
    }
    setIsActionLoading(false);
  }

  async function handleCancelJoin() {
    if (!user) {
      return;
    }

    if (isCreator) {
      alert("이벤트 생성자는 참가를 취소할 수 없습니다.");
      return;
    }

    const confirmed = window.confirm("이 이벤트 참가를 취소할까요?");

    if (!confirmed) {
      return;
    }

    setIsActionLoading(true);

    const { error } = await supabase.rpc("cancel_event_join_or_waitlist", {
      p_event_id: eventId,
    });

    if (error) {
      console.error("이벤트 참가 취소 오류:", error);
      alert(`참가 취소에 실패했습니다: ${error.message}`);
      setIsActionLoading(false);
      return;
    }

    await reloadParticipation();
    setIsActionLoading(false);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <Header />

      {isLoading ? (
        <section className="mx-auto max-w-7xl px-6 py-16">
          <div className="h-[520px] animate-pulse rounded-3xl border border-white/10 bg-white/[0.03]" />
        </section>
      ) : errorMessage || !event ? (
        <section className="mx-auto max-w-4xl px-6 py-24 text-center">
          <div className="rounded-3xl border border-red-400/20 bg-red-400/5 px-6 py-16">
            <p className="text-2xl font-bold text-red-300">
              {errorMessage || "이벤트를 찾을 수 없습니다."}
            </p>

            <Link
              href="/events"
              className="mt-7 inline-flex rounded-2xl border border-white/10 px-6 py-3 font-semibold text-zinc-200 transition hover:bg-white/5"
            >
              이벤트 목록으로
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="border-b border-white/10">
            <div className="mx-auto max-w-7xl px-6 py-16">
              <Link
                href="/events"
                className="text-sm text-zinc-500 transition hover:text-amber-300"
              >
                ← 이벤트 목록
              </Link>

              <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300">
                      {event.event_kind === "MURDER_MYSTERY" ? "머더미스터리 이벤트" : event.event_kind === "GENERAL" ? "일반 이벤트" : "보드게임 이벤트"}
                    </span>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle(
                        status,
                      )}`}
                    >
                      {status}
                    </span>
                    {isCancelled && (
                      <span className="rounded-full bg-red-400/15 px-3 py-1 text-xs font-semibold text-red-300">
                        취소됨
                      </span>
                    )}
                  </div>

                  <h1 className="mt-5 text-4xl font-bold leading-tight sm:text-5xl">
                    {event.title}
                  </h1>

                  <p className="mt-5 text-lg text-zinc-400">
                    {formatDate(event.started_at)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  {isCreator && (
                    <span className="inline-flex items-center rounded-2xl border border-amber-400/30 bg-amber-400/5 px-5 py-3 text-sm font-semibold text-amber-300">
                      내가 만든 이벤트
                    </span>
                  )}

                  {!user ? (
                    <Link
                      href="/login"
                      className="rounded-2xl bg-amber-400 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-amber-300"
                    >
                      로그인 후 참가
                    </Link>
                  ) : isJoined || isWaitlisted ? (
                    <button
                      type="button"
                      onClick={handleCancelJoin}
                      disabled={isActionLoading || isCreator}
                      className="rounded-2xl border border-white/15 px-6 py-3 font-semibold text-zinc-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isCreator
                        ? "생성자 참가 중"
                        : isActionLoading
                          ? "처리 중..."
                          : isWaitlisted ? "대기 취소" : "참가 취소"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleJoin}
                      disabled={isActionLoading || isEnded || isCancelled}
                      className="rounded-2xl bg-amber-400 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isCancelled
                        ? "취소된 이벤트"
                        : isEnded
                        ? "종료된 이벤트"
                        : isActionLoading
                          ? "처리 중..."
                          : event.max_participants !== null && participants.length >= event.max_participants
                            ? "대기 신청"
                            : "이벤트 참가"}
                    </button>
                  )}

                  <EventCancellationCard
                    eventId={eventId}
                    eventTitle={event.title}
                    isCancelled={isCancelled}
                    canCancel={canEditEvent}
                    canDelete={siteRole === "MAIN_ADMIN"}
                    onChanged={(cancelled) => setEvent((current) => current ? {
                      ...current,
                      event_status: cancelled ? "CANCELLED" : "OPEN",
                      closed_at: cancelled ? current.closed_at : null,
                    } : current)}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="mx-auto grid max-w-7xl gap-8 px-6 py-14 lg:grid-cols-[1fr_360px]">
            <div className="space-y-8">
              <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                <h2 className="text-2xl font-bold">이벤트 정보</h2>

                <div className="mt-7 grid gap-5 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-5">
                    <p className="text-xs font-semibold tracking-wider text-zinc-500">
                      날짜
                    </p>
                    <p className="mt-2 font-semibold text-zinc-100">
                      {formatDate(event.started_at)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-5">
                    <p className="text-xs font-semibold tracking-wider text-zinc-500">
                      시간
                    </p>
                    <p className="mt-2 font-semibold text-zinc-100">
                      {formatTime(event.started_at)}
                      {event.ended_at
                        ? ` – ${formatTime(event.ended_at)}`
                        : ""}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-5 sm:col-span-2">
                    <p className="text-xs font-semibold tracking-wider text-zinc-500">
                      장소
                    </p>
                    <p className="mt-2 font-semibold text-zinc-100">
                      {event.location?.trim() || "장소 미정"}
                    </p>
                  </div>
                </div>
              </article>

              <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                <h2 className="text-2xl font-bold">이벤트 안내</h2>

                <p className="mt-6 whitespace-pre-wrap leading-8 text-zinc-400">
                  {event.description?.trim() ||
                    "등록된 이벤트 설명이 없습니다."}
                </p>
              </article>
              {isCancelled && (
                <div className="rounded-3xl border border-red-400/30 bg-red-400/[0.07] px-6 py-5 text-sm font-semibold text-red-200">
                  이 이벤트는 취소되었습니다. 기존 기록은 보존되지만 참가 및 운영 기능은 사용할 수 없습니다.
                </div>
              )}
              <EventLifecycleCard
                eventId={eventId}
                isClosed={isClosed}
                canManage={canManage && !isCancelled}
                closedAt={event.closed_at}
                onChanged={(closed, closedAt) =>
                  setEvent((current) => current ? {
                    ...current,
                    event_status: closed ? "CLOSED" : "OPEN",
                    closed_at: closedAt,
                  } : current)
                }
              />
              <EventNoticeCard eventId={eventId} canManage={canManage && !isCancelled} />
              <EventCapacityCard
                eventId={eventId}
                maxParticipants={event.max_participants}
                participantCount={participants.length}
                waitlist={waitlist}
                canManage={canManage}
                isClosed={isLocked}
                onChanged={async (maxParticipants) => {
                  setEvent((current) => current ? { ...current, max_participants: maxParticipants } : current);
                  await reloadParticipation();
                }}
              />
              <AttendanceManager
                eventId={eventId}
                participants={participants}
                canManage={canManage}
                isClosed={isLocked}
                onChanged={loadParticipants}
              />
              {event.event_kind === "MURDER_MYSTERY" && event.murder_mystery_id ? <MurderMysteryEventPanel
                eventId={eventId}
                mysteryId={event.murder_mystery_id}
                canManage={canManage}
                isClosed={isLocked}
              /> : event.event_kind === "BOARDGAME" ? <GroupPlaySection
                eventId={eventId}
                participants={participants}
                currentUserId={user?.id ?? null}
                canManage={canManage}
                isClosed={isLocked}
              /> : null}
              {event.event_kind !== "GENERAL" && <EventStatistics eventId={eventId} participants={participants} />}
            </div>

            <aside className="h-fit rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-bold">참가자</h2>
                <span className="rounded-full bg-amber-400/10 px-3 py-1 text-sm font-semibold text-amber-300">
                  {participants.length}명
                </span>
              </div>

              {participants.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-zinc-500">
                    아직 참가자가 없습니다.
                  </p>
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  {participants.map((participant) => {
                    const participantName = makeParticipantName(
                      participant.profile,
                    );
                    const participantIsCreator =
                      participant.user_id === event.created_by;

                    return (
                      <Link
                        key={participant.id}
                        href={`/members/${participant.user_id}`}
                        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900/60 p-3 transition hover:border-amber-400/30 hover:bg-white/[0.06]"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-zinc-950">
                          {getInitial(participant.profile)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-sm font-semibold text-zinc-200"
                            title={participantName}
                          >
                            {participantName}
                          </p>

                          {participantIsCreator && (
                            <p className="mt-1 text-xs text-amber-400">
                              이벤트 생성자
                            </p>
                          )}
                          <p className={`mt-1 text-xs ${
                            participant.attendance_status === "PRESENT"
                              ? "text-emerald-300"
                              : participant.attendance_status === "ABSENT"
                                ? "text-red-300"
                                : "text-zinc-600"
                          }`}>
                            {participant.attendance_status === "PRESENT"
                              ? "출석"
                              : participant.attendance_status === "ABSENT"
                                ? "불참"
                                : "출석 미확인"}
                          </p>
                          {event.event_kind === "MURDER_MYSTERY" && <p className={`mt-1 text-xs font-semibold ${participant.participation_role === "GM" ? "text-red-300" : "text-zinc-500"}`}>{participant.participation_role === "GM" ? "GM" : "플레이어"}{participant.repeat_override ? " · 재참가 허용" : ""}</p>}
                        </div>
                        <span className="text-zinc-600">›</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </aside>
          </section>
        </>
      )}
    </main>
  );
}
