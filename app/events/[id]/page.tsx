"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import GroupPlaySection from "@/components/events/GroupPlaySection";
import ClocktowerResultPanel from "@/components/events/ClocktowerResultPanel";
import EventStatistics from "@/components/events/EventStatistics";
import EventLifecycleCard from "@/components/events/EventLifecycleCard";
import EventNoticeCard from "@/components/events/EventNoticeCard";
import AttendanceManager from "@/components/events/AttendanceManager";
import MurderMysteryEventPanel from "@/components/events/MurderMysteryEventPanel";
import EventCapacityCard, {
  type WaitlistMember,
} from "@/components/events/EventCapacityCard";
import EventCancellationCard from "@/components/events/EventCancellationCard";
import EventJoinPaymentDialog from "@/components/events/EventJoinPaymentDialog";
import EventCommentSection from "@/components/events/EventCommentSection";
import type { AttendanceStatus } from "@/types/event";
import { createClient } from "@/lib/supabase/client";
import { formatEventLocation } from "@/lib/events/location";
import { CLOCKTOWER_EVENT_DESCRIPTION_PRESET } from "@/lib/events/guide";

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
  event_kind: "BOARDGAME" | "MURDER_MYSTERY" | "CLOCKTOWER" | "GENERAL";
  murder_mystery_id: string | null;
  participation_fee: number | null;
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
  const [accountCopied, setAccountCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [canOperate, setCanOperate] = useState(false);
  const [siteRole, setSiteRole] = useState("MEMBER");
  const [guideOpen, setGuideOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);

  async function loadParticipants() {
    const { data: participantData, error: participantError } = await supabase
      .from("event_participants")
      .select(
        "id, user_id, joined_at, attendance_status, attendance_checked_at, participation_role, repeat_override",
      )
      .eq("event_id", eventId)
      .order("joined_at", { ascending: true });

    if (participantError) {
      console.error("이벤트 참가자 조회 오류:", participantError);
      setParticipants([]);
      return;
    }

    const participantRows = (participantData ?? []) as ParticipantRow[];
    const userIds = participantRows.map(
      (participant) => participant.user_id,
    );

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
    const { data, error } = await supabase
      .from("event_waitlist")
      .select("id, user_id, joined_at")
      .eq("event_id", eventId)
      .order("joined_at", { ascending: true });

    if (error) {
      console.error("대기 명단 조회 오류:", error);
      setWaitlist([]);
      return;
    }

    const rows = (data ?? []) as Array<{
      id: string;
      user_id: string;
      joined_at: string;
    }>;

    const ids = rows.map((row) => row.user_id);

    const { data: profiles } = ids.length
      ? await supabase
          .from("profiles")
          .select("id, activity_name")
          .in("id", ids)
      : { data: [] };

    const profileMap = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile]),
    );

    setWaitlist(
      rows.map((row) => ({
        ...row,
        profile: profileMap.get(row.user_id) ?? null,
      })),
    );
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
            "id, title, started_at, ended_at, location, description, created_by, created_at, event_status, closed_at, max_participants, event_kind, murder_mystery_id, participation_fee",
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
          supabase.rpc("can_operate_event", {
            target_event_id: eventId,
          }),
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
    } = supabase.auth.onAuthStateChange((_authEvent, session) => {
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

  const isWaitlisted = waitlist.some(
    (member) => member.user_id === user?.id,
  );

  const isCreator = Boolean(
    user && event && event.created_by === user.id,
  );

  const canManage = isCreator || canOperate;

  const canEditEvent =
    siteRole === "MAIN_ADMIN" ||
    siteRole === "ADMIN" ||
    (siteRole === "RULE_MASTER" && isCreator);

  const status = event ? getEventStatus(event) : "";
  const isEnded = status === "종료";
  const isClosed = event?.event_status === "CLOSED";
  const isCancelled = event?.event_status === "CANCELLED";
  const isUpcoming = event ? new Date(event.started_at).getTime() > Date.now() : false;
  const isLocked = isClosed || isCancelled;
  const participationFee = event?.participation_fee ?? (event?.event_kind === "MURDER_MYSTERY" ? 13000 : event?.event_kind === "BOARDGAME" || event?.event_kind === "CLOCKTOWER" ? 10000 : 0);
  const isAtCapacity = Boolean(event?.max_participants !== null && participants.length >= (event?.max_participants ?? 0));


  async function copyAccountNumber() {
    const accountNumber = "94849203451";
    try {
      await navigator.clipboard.writeText(accountNumber);
      setAccountCopied(true);
      window.setTimeout(() => setAccountCopied(false), 1800);
    } catch {
      window.prompt("계좌번호를 복사해 주세요.", accountNumber);
    }
  }

  async function handleJoin() {
    if (!user) {
      alert("이벤트에 참가하려면 먼저 로그인해 주세요.");
      return;
    }

    setIsActionLoading(true);

    const { data, error } = await supabase.rpc(
      "join_event_with_capacity",
      {
        p_event_id: eventId,
      },
    );

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

    setJoinDialogOpen(false);
    setIsActionLoading(false);
  }

  function openJoinDialog() {
    if (!user) return;
    setJoinDialogOpen(true);
  }

  async function handleCancelJoin() {
    if (!user) {
      return;
    }

    if (isCreator) {
      alert("이벤트 생성자는 참가를 취소할 수 없습니다.");
      return;
    }

    if (!window.confirm("이 이벤트 참가를 취소할까요?")) {
      return;
    }

    setIsActionLoading(true);

    const { error } = await supabase.rpc(
      "cancel_event_join_or_waitlist",
      {
        p_event_id: eventId,
      },
    );

    if (error) {
      console.error("이벤트 참가 취소 오류:", error);
      alert(`참가 취소에 실패했습니다: ${error.message}`);
      setIsActionLoading(false);
      return;
    }

    await reloadParticipation();
    setIsActionLoading(false);
  }

  async function handleRemoveMember(targetUserId: string, memberName: string) {
    if (!canManage || !window.confirm(`${memberName} 님을 이 이벤트에서 제외할까요?`)) return;

    setIsActionLoading(true);
    const { error } = await supabase.rpc("remove_event_member", {
      p_event_id: eventId,
      p_user_id: targetUserId,
    });

    if (error) {
      console.error("이벤트 멤버 제외 오류:", error);
      alert(`멤버를 제외하지 못했습니다: ${error.message}`);
      setIsActionLoading(false);
      return;
    }

    await reloadParticipation();
    setIsActionLoading(false);
  }

  return (
    <main className="min-h-screen bg-zinc-950 pb-28 text-white">
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
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${event.event_kind === "MURDER_MYSTERY" ? "bg-red-400/10 text-red-300" : event.event_kind === "CLOCKTOWER" ? "bg-violet-400/10 text-violet-300" : event.event_kind === "GENERAL" ? "bg-sky-400/10 text-sky-300" : "bg-amber-400/10 text-amber-300"}`}>
                      {event.event_kind === "MURDER_MYSTERY"
                        ? "머더미스터리 이벤트"
                        : event.event_kind === "CLOCKTOWER"
                          ? "시계탑에 흐른 피"
                        : event.event_kind === "GENERAL"
                          ? "일반 이벤트"
                          : "보드게임 이벤트"}
                    </span>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle(status)}`}
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
                          : isWaitlisted
                            ? "대기 취소"
                            : "참가 취소"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={openJoinDialog}
                      disabled={
                        isActionLoading || isEnded || isCancelled
                      }
                      className="rounded-2xl bg-amber-400 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isCancelled
                        ? "취소된 이벤트"
                        : isEnded
                          ? "종료된 이벤트"
                          : isActionLoading
                            ? "처리 중..."
                            : isAtCapacity
                              ? "대기 신청"
                              : `이벤트 참가 · ${participationFee === 0 ? "무료" : `${participationFee.toLocaleString("ko-KR")}원`}`}
                    </button>
                  )}

                  <EventCancellationCard
                    eventId={eventId}
                    eventTitle={event.title}
                    isCancelled={isCancelled}
                    canCancel={canEditEvent && isUpcoming && !isCancelled}
                    canDelete={siteRole === "MAIN_ADMIN" && isUpcoming}
                    onChanged={(cancelled) =>
                      setEvent((current) =>
                        current
                          ? {
                              ...current,
                              event_status: cancelled
                                ? "CANCELLED"
                                : "OPEN",
                              closed_at: cancelled
                                ? current.closed_at
                                : null,
                            }
                          : current,
                      )
                    }
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="mx-auto grid max-w-7xl gap-8 px-6 pb-8 pt-14 lg:grid-cols-[1fr_360px]">
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
                      {formatEventLocation(event.location)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5 sm:col-span-2">
                    <p className="text-xs font-semibold tracking-wider text-zinc-500">참가비</p>
                    <p className="mt-2 text-xl font-bold text-amber-300">{participationFee === 0 ? "무료" : `${participationFee.toLocaleString("ko-KR")}원`}</p>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">모임 시작 24시간 전까지 취소하면 100% 환불됩니다.</p>
                  </div>
                </div>
              </article>

              <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-2xl font-bold">이벤트 안내</h2>

                  <button
                    type="button"
                    onClick={() => setGuideOpen((value) => !value)}
                    className="shrink-0 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-amber-400/40 hover:text-amber-300"
                  >
                    {guideOpen ? "접기 −" : "더보기 +"}
                  </button>
                </div>

                {guideOpen && event.event_kind === "CLOCKTOWER" ? (
                  <div className="mt-6 whitespace-pre-line rounded-2xl border border-violet-400/20 bg-violet-400/[0.04] px-5 py-5 text-sm leading-7 text-zinc-300 sm:text-base sm:leading-8">
                    {event.description?.trim() || CLOCKTOWER_EVENT_DESCRIPTION_PRESET}
                  </div>
                ) : guideOpen ? (
                  <div className="mt-6 space-y-6 text-sm leading-7 text-zinc-300 sm:text-base sm:leading-8">
                    <ol className="space-y-5">
                      <li className="flex gap-3">
                        <span aria-hidden="true" className="text-xl">{event.event_kind === "MURDER_MYSTERY" ? "🎭" : "🎲"}</span>
                        <div>
                          <strong className="text-zinc-100">{event.event_kind === "MURDER_MYSTERY" ? "머더미스터리 진행 안내" : "정기 모임 진행 방식"}</strong>
                          {event.event_kind === "MURDER_MYSTERY" ? (
                            <>
                              <p className="mt-1 text-zinc-400">머더미스터리 특성상 늦참은 불가능합니다.</p>
                              <p className="mt-1 font-semibold text-red-300">5~10분 정도 늦을 경우 GM 또는 운영진에게 필히 알려 주세요.</p>
                            </>
                          ) : (
                            <>
                              <p className="mt-1 text-zinc-400">기본적으로 파티·전략·마피아 게임으로 진행되며, 팟 구성이나 룰마에 따라 달라질 수 있습니다.</p>
                              <p className="mt-1 font-semibold text-amber-300">신입 회원은 우선 정기 모임부터 참가할 수 있어요.</p>
                            </>
                          )}
                        </div>
                      </li>

                      <li className="flex gap-3">
                        <span aria-hidden="true" className="text-xl">💳</span>
                        <div>
                          <strong className="text-zinc-100">참가비 및 신청 방법</strong>
                          <p className="mt-1 text-zinc-400">
                            참가비 {participationFee === 0 ? "무료" : `${participationFee.toLocaleString("ko-KR")}원`}을 먼저 입금한 뒤, 웹사이트의 참가 버튼을 눌러 주세요.
                          </p>
                          {participationFee > 0 && (
                            <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] px-4 py-3 text-sm leading-6">
                              <p className="font-semibold text-amber-300">boardlounge.kr</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <p>국민은행 94849203451 · 예금주 이우영</p>
                                <button
                                  type="button"
                                  onClick={() => void copyAccountNumber()}
                                  className="rounded-lg bg-amber-400 px-3 py-1 text-xs font-bold text-zinc-950 transition hover:bg-amber-300"
                                >
                                  {accountCopied ? "복사 완료 ✓" : "계좌번호 복사"}
                                </button>
                              </div>
                              <p>또는 카카오페이</p>
                            </div>
                          )}
                        </div>
                      </li>

                      <li className="flex gap-3">
                        <span aria-hidden="true" className="text-xl">{event.event_kind === "MURDER_MYSTERY" ? "🤫" : "⏰"}</span>
                        <div>
                          <strong className="text-zinc-100">{event.event_kind === "MURDER_MYSTERY" ? "스포일러 및 재참가 안내" : "늦게 참가하는 경우"}</strong>
                          {event.event_kind === "MURDER_MYSTERY" ? (
                            <p className="mt-1 text-zinc-400">작품 내용과 역할에 관한 스포일러는 금지됩니다. 이미 플레이한 작품은 일반 참가가 제한될 수 있습니다.</p>
                          ) : (
                            <p className="mt-1 text-zinc-400">입금 후 늦게 도착할 예정이라면 댓글에 <span className="font-semibold text-zinc-200">“늦참”</span>과 도착 예정 시간을 꼭 남겨 주세요.</p>
                          )}
                        </div>
                      </li>

                      {event.event_kind !== "MURDER_MYSTERY" && <li className="flex gap-3">
                        <span aria-hidden="true" className="text-xl">🙋</span>
                        <div>
                          <strong className="text-zinc-100">하고 싶은 게임이 있다면</strong>
                          <p className="mt-1 text-zinc-400">
                            원하는 게임의 팟을 꼭 만들어 주세요. 자세한 방법은 관련 공지를 확인해 주세요.
                          </p>
                        </div>
                      </li>}
                    </ol>

                    <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.05] px-4 py-3 text-red-200">
                      {event.event_kind === "MURDER_MYSTERY"
                        ? "⚠️ 입금이 확인되지 않거나 사전 연락 없이 시작 시간에 늦으면 참석이 어렵습니다."
                        : "⚠️ 입금이 확인되지 않으면 참석이 어려울 수 있으니 꼭 확인해 주세요."}
                    </div>

                    <p className={`font-bold ${event.event_kind === "MURDER_MYSTERY" ? "text-red-300" : "text-amber-300"}`}>
                      {event.event_kind === "MURDER_MYSTERY" ? "모두 함께 정시에 시작해요! 🎭" : "함께 재미있는 보드게임 해요! 🎉"}
                    </p>
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm leading-6 text-zinc-400">
                    {event.event_kind === "MURDER_MYSTERY"
                      ? "🎭 머더미스터리 특성상 늦참 불가 · 5~10분 지각 시 GM·운영진에게 필히 연락해 주세요."
                      : event.event_kind === "CLOCKTOWER"
                        ? "🕰️ 시계탑에 흐른 피 · 늦참 불가 · 초보자는 시작 30분 전까지 와 주세요."
                      : "🎲 진행 방식 · 💳 참가비와 입금 · ⏰ 늦참 · 🙋 팟 만들기 안내를 확인해 주세요."}
                  </div>
                )}
              </article>

              {isCancelled && (
                <div className="rounded-3xl border border-red-400/30 bg-red-400/[0.07] px-6 py-5 text-sm font-semibold text-red-200">
                  이 이벤트는 취소되었습니다. 기존 기록은
                  보존되지만 참가 및 운영 기능은 사용할 수
                  없습니다.
                </div>
              )}

              {canManage && (
                <>
                  <div className={`grid gap-4 ${!isCancelled ? "xl:grid-cols-2" : ""}`}>
                    <EventLifecycleCard
                      eventId={eventId}
                      isClosed={isClosed}
                      canManage={!isCancelled}
                      closedAt={event.closed_at}
                      onChanged={(closed, closedAt) =>
                        setEvent((current) =>
                          current
                            ? {
                                ...current,
                                event_status: closed ? "CLOSED" : "OPEN",
                                closed_at: closedAt,
                              }
                            : current,
                        )
                      }
                    />

                    {!isCancelled && (
                      <EventNoticeCard
                        eventId={eventId}
                        canManage
                      />
                    )}
                  </div>

                  <EventCapacityCard
                    eventId={eventId}
                    maxParticipants={event.max_participants}
                    participantCount={participants.length}
                    waitlist={waitlist}
                    canManage
                    isClosed={isLocked}
                    onChanged={async (maxParticipants) => {
                      setEvent((current) =>
                        current
                          ? {
                              ...current,
                              max_participants: maxParticipants,
                            }
                          : current,
                      );

                      await reloadParticipation();
                    }}
                    onMemberRemove={handleRemoveMember}
                  />

                  <AttendanceManager
                    eventId={eventId}
                    participants={participants}
                    canManage
                    isClosed={isLocked}
                    onChanged={loadParticipants}
                  />
                </>
              )}

              {event.event_kind === "MURDER_MYSTERY" &&
              event.murder_mystery_id ? (
                <MurderMysteryEventPanel
                  eventId={eventId}
                  mysteryId={event.murder_mystery_id}
                  canManage={canManage}
                  isClosed={isLocked}
                />
              ) : event.event_kind === "BOARDGAME" ? (
                <GroupPlaySection
                  eventId={eventId}
                  participants={participants}
                  currentUserId={user?.id ?? null}
                  canManage={canManage}
                  isClosed={isLocked}
                />
              ) : event.event_kind === "CLOCKTOWER" && canManage ? (
                <ClocktowerResultPanel
                  eventId={eventId}
                  title={event.title}
                  participants={participants}
                  canManage={canManage}
                  isClosed={isLocked}
                />
              ) : null}

              {event.event_kind !== "GENERAL" && (
                <EventStatistics
                  eventId={eventId}
                  participants={participants}
                />
              )}
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
                      <div
                        key={participant.id}
                        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900/60 p-3 transition hover:border-amber-400/30 hover:bg-white/[0.06]"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-zinc-950">
                          {getInitial(participant.profile)}
                        </div>

                        <Link href={`/members/${participant.user_id}`} className="min-w-0 flex-1">
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

                          <p
                            className={`mt-1 text-xs ${
                              participant.attendance_status ===
                              "PRESENT"
                                ? "text-emerald-300"
                                : participant.attendance_status ===
                                    "ABSENT"
                                  ? "text-red-300"
                                  : "text-zinc-600"
                            }`}
                          >
                            {participant.attendance_status ===
                            "PRESENT"
                              ? "출석"
                              : participant.attendance_status ===
                                  "ABSENT"
                                ? "불참"
                                : "출석 미확인"}
                          </p>

                          {event.event_kind ===
                            "MURDER_MYSTERY" && (
                            <p
                              className={`mt-1 text-xs font-semibold ${
                                participant.participation_role ===
                                "GM"
                                  ? "text-red-300"
                                  : "text-zinc-500"
                              }`}
                            >
                              {participant.participation_role ===
                              "GM"
                                ? "GM"
                                : "플레이어"}
                              {participant.repeat_override
                                ? " · 재참가 허용"
                                : ""}
                            </p>
                          )}
                        </Link>

                        {canManage && isUpcoming && !isLocked && !participantIsCreator ? (
                          <button type="button" onClick={() => void handleRemoveMember(participant.user_id, participantName)} disabled={isActionLoading} className="shrink-0 rounded-lg border border-red-400/25 px-3 py-2 text-xs font-bold text-red-300 disabled:opacity-50">참가 제외</button>
                        ) : <span className="text-zinc-600">›</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </aside>
          </section>

          <div className="mx-auto max-w-7xl px-5 pb-28 sm:px-6">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
              <EventCommentSection
                eventId={eventId}
                currentUserId={user?.id ?? null}
                canManage={canManage}
              />
            </div>
          </div>

          {!isEnded && !isCancelled && !isClosed && (
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-zinc-950/95 px-4 py-4 shadow-[0_-12px_35px_rgba(0,0,0,0.45)] backdrop-blur">
              <div className="mx-auto flex max-w-5xl flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-6">
                <div className="min-w-0 flex-1"><p className="truncate text-base font-black sm:text-xl">{event.title}</p></div>
                {!user ? <Link href="/login" className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-amber-400 px-10 text-base font-black text-zinc-950 sm:w-[360px]">로그인 후 참가</Link>
                  : isJoined || isWaitlisted ? <button type="button" onClick={handleCancelJoin} disabled={isActionLoading || isCreator} className="min-h-14 w-full rounded-2xl border border-white/15 px-10 text-base font-bold text-zinc-200 disabled:opacity-50 sm:w-[360px]">{isCreator ? "생성자 참가 중" : isWaitlisted ? "대기 신청 취소" : "이벤트 나가기"}</button>
                  : <button type="button" onClick={openJoinDialog} disabled={isActionLoading} className="min-h-14 w-full rounded-2xl bg-amber-400 px-10 text-base font-black text-zinc-950 disabled:opacity-50 sm:w-[360px]">{isAtCapacity ? "대기 신청" : "참가 신청"}</button>}
              </div>
            </div>
          )}

          {joinDialogOpen && <EventJoinPaymentDialog eventTitle={event.title} participationFee={participationFee} eventKind={event.event_kind} waitlisted={isAtCapacity} busy={isActionLoading} onClose={() => setJoinDialogOpen(false)} onConfirm={handleJoin} />}
        </>
      )}
    </main>
  );
}
