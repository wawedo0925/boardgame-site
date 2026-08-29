"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { DEFAULT_EVENT_LOCATION } from "@/lib/events/location";
import {
  BOARDGAME_EVENT_DESCRIPTION_PRESET,
  CLOCKTOWER_EVENT_DESCRIPTION_PRESET,
  MURDER_MYSTERY_EVENT_DESCRIPTION_PRESET,
} from "@/lib/events/guide";

type EventKind = "BOARDGAME" | "MURDER_MYSTERY" | "CLOCKTOWER" | "GENERAL";
type ClocktowerDifficulty = "점철되는 혼란" | "피로 물든 달" | "화단에 꽃피운 이단" | "캐러셀";

const CLOCKTOWER_DIFFICULTIES: ClocktowerDifficulty[] = [
  "점철되는 혼란",
  "피로 물든 달",
  "화단에 꽃피운 이단",
  "캐러셀",
];

type EventForm = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  maxParticipants: string;
  eventKind: EventKind;
  murderMysteryId: string;
  clocktowerDifficulty: ClocktowerDifficulty | "";
  creatorRole: "PLAYER" | "GM";
  recurrence: "NONE" | "WEEKLY" | "BIWEEKLY";
  participationFee: string;
};

type MurderMysteryOption = { id: string; title: string; min_players: number | null; max_players: number | null };

const initialForm: EventForm = {
  title: "",
  date: "",
  startTime: "19:20",
  endTime: "22:20",
  location: DEFAULT_EVENT_LOCATION,
  description: BOARDGAME_EVENT_DESCRIPTION_PRESET,
  maxParticipants: "",
  eventKind: "BOARDGAME",
  murderMysteryId: "",
  clocktowerDifficulty: "",
  creatorRole: "PLAYER",
  recurrence: "NONE",
  participationFee: "",
};

function toLocalDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function getMinimumDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addHoursToTime(time: string, hours: number) {
  const [hour, minute] = time.split(":").map(Number);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return "";
  }

  const minutesInDay = 24 * 60;
  const totalMinutes = (hour * 60 + minute + hours * 60) % minutesInDay;
  const nextHour = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const nextMinute = String(totalMinutes % 60).padStart(2, "0");

  return `${nextHour}:${nextMinute}`;
}

export default function NewEventPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState<EventForm>(initialForm);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [murderMysteries, setMurderMysteries] = useState<MurderMysteryOption[]>([]);
  const [siteRole, setSiteRole] = useState("MEMBER");

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      const {
        data: { user: currentUser },
        error,
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("이벤트 생성 사용자 조회 오류:", error);
      }

      setUser(currentUser);
      if (currentUser) {
        const [{ data: works }, { data: role }] = await Promise.all([
          supabase.from("murder_mysteries").select("id,title,min_players,max_players").order("title"),
          supabase.rpc("current_site_role"),
        ]);
        setMurderMysteries((works ?? []) as MurderMysteryOption[]);
        setSiteRole((role as string) ?? "MEMBER");
      }
      setIsAuthLoading(false);
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      setUser(session?.user ?? null);
      setIsAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  function updateForm<Key extends keyof EventForm>(
    key: Key,
    value: EventForm[Key],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function selectEventKind(eventKind: EventKind) {
    setForm((current) => {
      const usesPreset =
        !current.description.trim() ||
        current.description === BOARDGAME_EVENT_DESCRIPTION_PRESET ||
        current.description === MURDER_MYSTERY_EVENT_DESCRIPTION_PRESET ||
        current.description === CLOCKTOWER_EVENT_DESCRIPTION_PRESET;

      return {
        ...current,
        eventKind,
        title: eventKind === "MURDER_MYSTERY" || eventKind === "CLOCKTOWER" ? "" : current.title,
        murderMysteryId: eventKind === "MURDER_MYSTERY" ? current.murderMysteryId : "",
        clocktowerDifficulty: eventKind === "CLOCKTOWER" ? current.clocktowerDifficulty : "",
        maxParticipants:
          eventKind === "CLOCKTOWER"
            ? "16"
            : current.eventKind === "CLOCKTOWER" && current.maxParticipants === "16"
              ? ""
              : current.maxParticipants,
        recurrence: eventKind === "BOARDGAME" ? current.recurrence : "NONE",
        description: usesPreset
          ? eventKind === "MURDER_MYSTERY"
            ? MURDER_MYSTERY_EVENT_DESCRIPTION_PRESET
            : eventKind === "CLOCKTOWER"
              ? CLOCKTOWER_EVENT_DESCRIPTION_PRESET
            : eventKind === "BOARDGAME"
              ? BOARDGAME_EVENT_DESCRIPTION_PRESET
              : ""
          : current.description,
      };
    });
  }

  function selectMurderMystery(murderMysteryId: string) {
    const work = murderMysteries.find((item) => item.id === murderMysteryId);
    setForm((current) => ({
      ...current,
      murderMysteryId,
      title: work ? `[머미] ${work.title}` : "",
    }));
  }

  function selectClocktowerDifficulty(clocktowerDifficulty: ClocktowerDifficulty | "") {
    setForm((current) => ({
      ...current,
      clocktowerDifficulty,
      title: clocktowerDifficulty ? `[시계탑] ${clocktowerDifficulty}` : "",
    }));
  }

  function updateStartTime(startTime: string) {
    setForm((current) => ({
      ...current,
      startTime,
      endTime: startTime ? addHoursToTime(startTime, 3) : "",
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) {
      setErrorMessage("이벤트를 만들려면 먼저 로그인해야 합니다.");
      return;
    }

    const selectedMystery = murderMysteries.find((work) => work.id === form.murderMysteryId);
    const title = form.eventKind === "MURDER_MYSTERY" && selectedMystery
      ? `[머미] ${selectedMystery.title}`
      : form.eventKind === "CLOCKTOWER" && form.clocktowerDifficulty
        ? `[시계탑] ${form.clocktowerDifficulty}`
        : form.title.trim();
    const location = form.location.trim();
    const description = form.description.trim();
    const maxParticipants = form.maxParticipants.trim() === "" ? null : Number(form.maxParticipants);
    const defaultParticipationFee = form.eventKind === "MURDER_MYSTERY" ? 13000 : form.eventKind === "BOARDGAME" || form.eventKind === "CLOCKTOWER" ? 10000 : 0;
    const participationFee = form.participationFee.trim() === "" ? defaultParticipationFee : Number(form.participationFee);

    if (form.eventKind === "MURDER_MYSTERY" && !form.murderMysteryId) {
      setErrorMessage("진행할 머더미스터리 작품을 선택해 주세요.");
      return;
    }
    if (form.creatorRole === "GM" && !["MAIN_ADMIN", "ADMIN", "RULE_MASTER"].includes(siteRole)) {
      setErrorMessage("GM은 관리자 또는 룰마만 선택할 수 있습니다.");
      return;
    }

    if (maxParticipants !== null && (!Number.isInteger(maxParticipants) || maxParticipants < 1)) {
      setErrorMessage("참가 정원은 1명 이상의 정수로 입력해 주세요.");
      return;
    }
    if (form.eventKind === "CLOCKTOWER" && !form.clocktowerDifficulty) {
      setErrorMessage("시계탑에 흐른 피 난이도를 선택해 주세요.");
      return;
    }
    if (!Number.isInteger(participationFee) || participationFee < 0) {
      setErrorMessage("참가비는 0원 이상의 정수로 입력해 주세요.");
      return;
    }

    if (!title) {
      setErrorMessage("이벤트 제목을 입력해 주세요.");
      return;
    }

    if (!form.date) {
      setErrorMessage("이벤트 날짜를 선택해 주세요.");
      return;
    }

    if (!form.startTime) {
      setErrorMessage("시작 시간을 선택해 주세요.");
      return;
    }

    const startedAt = toLocalDateTime(form.date, form.startTime);
    let endedAt = form.endTime
      ? toLocalDateTime(form.date, form.endTime)
      : null;

    if (endedAt && endedAt <= startedAt) {
      endedAt = new Date(endedAt.getTime() + 24 * 60 * 60 * 1000);
    }

    if (Number.isNaN(startedAt.getTime())) {
      setErrorMessage("날짜와 시작 시간을 다시 확인해 주세요.");
      return;
    }

    if (endedAt && Number.isNaN(endedAt.getTime())) {
      setErrorMessage("종료 시간을 다시 확인해 주세요.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    if (form.eventKind === "MURDER_MYSTERY" && form.creatorRole === "PLAYER") {
      const { data: previous } = await supabase.from("murder_mystery_history").select("id").eq("murder_mystery_id", form.murderMysteryId).eq("user_id", user.id).eq("participation_role", "PLAYER").limit(1);
      if ((previous ?? []).length > 0) {
        setErrorMessage("이미 플레이한 작품입니다. 다른 담당자가 이벤트를 만든 뒤 재참가를 허용해 주세요.");
        setIsSaving(false);
        return;
      }
    }

    if (form.recurrence !== "NONE") {
      const { data: recurringEventId, error: recurringError } = await supabase.rpc(
        "create_recurring_event_series",
        {
          p_title: title,
          p_started_at: startedAt.toISOString(),
          p_ended_at: endedAt?.toISOString() ?? null,
          p_location: location || null,
          p_description: description || null,
          p_max_participants: maxParticipants,
          p_event_kind: form.eventKind,
          p_murder_mystery_id: form.eventKind === "MURDER_MYSTERY" ? form.murderMysteryId : null,
          p_interval_weeks: form.recurrence === "WEEKLY" ? 1 : 2,
          p_creator_role: form.eventKind === "MURDER_MYSTERY" ? form.creatorRole : "PLAYER",
          p_participation_fee: participationFee,
        },
      );

      if (recurringError) {
        setErrorMessage(`반복 이벤트 저장에 실패했습니다: ${recurringError.message}`);
        setIsSaving(false);
        return;
      }

      router.push(`/events/${recurringEventId}`);
      router.refresh();
      return;
    }

    const { data, error } = await supabase
      .from("events")
      .insert({
        title,
        started_at: startedAt.toISOString(),
        ended_at: endedAt?.toISOString() ?? null,
        location: location || null,
        description: description || null,
        created_by: user.id,
        max_participants: maxParticipants,
        event_kind: form.eventKind,
        murder_mystery_id: form.eventKind === "MURDER_MYSTERY" ? form.murderMysteryId : null,
        participation_fee: participationFee,
      })
      .select("id")
      .single();

    if (error) {
      console.error("이벤트 저장 오류:", error);
      setErrorMessage(`이벤트 저장에 실패했습니다: ${error.message}`);
      setIsSaving(false);
      return;
    }

    const { error: participantError } = await supabase
      .from("event_participants")
      .insert({
        event_id: data.id,
        user_id: user.id,
        participation_role: form.eventKind === "MURDER_MYSTERY" ? form.creatorRole : "PLAYER",
      });

    if (participantError) {
      console.error("이벤트 생성자 참가 등록 오류:", participantError);
    }

    if (form.eventKind === "MURDER_MYSTERY" && form.creatorRole === "GM") {
      await supabase.from("event_staff").insert({ event_id: data.id, user_id: user.id, duty: "GM", assigned_by: user.id });
    }

    router.push(`/events/${data.id}`);
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <p className="text-sm font-semibold tracking-[0.3em] text-amber-400">
            CREATE EVENT
          </p>

          <h1 className="mt-3 text-4xl font-bold sm:text-5xl">
            이벤트 만들기
          </h1>

          <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-400">
            보드라운지에서 진행할 모임의 날짜, 시간, 장소와 안내 내용을
            등록하세요.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14">
        {isAuthLoading ? (
          <div className="h-[560px] animate-pulse rounded-3xl border border-white/10 bg-white/[0.03]" />
        ) : !user ? (
          <div className="rounded-3xl border border-amber-400/20 bg-amber-400/5 px-6 py-20 text-center">
            <p className="text-2xl font-bold text-zinc-100">
              로그인이 필요합니다.
            </p>

            <p className="mt-3 text-zinc-400">
              이벤트를 만들려면 카카오 로그인 후 다시 이용해 주세요.
            </p>

            <Link
              href="/login"
              className="mt-7 inline-flex rounded-2xl bg-amber-400 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-amber-300"
            >
              로그인하러 가기
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8"
          >
            <div className="grid gap-7">
              <div className="grid gap-3">
                <span className="text-sm font-semibold text-zinc-200">이벤트 종류</span>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <button type="button" onClick={() => selectEventKind("GENERAL")} className={`rounded-2xl border px-4 py-4 font-bold ${form.eventKind === "GENERAL" ? "border-sky-400 bg-sky-400/10 text-sky-300" : "border-white/10 text-zinc-500"}`}>일반 이벤트</button>
                  <button type="button" onClick={() => selectEventKind("BOARDGAME")} className={`rounded-2xl border px-4 py-4 font-bold ${form.eventKind === "BOARDGAME" ? "border-amber-400 bg-amber-400/10 text-amber-300" : "border-white/10 text-zinc-500"}`}>보드게임</button>
                  <button type="button" onClick={() => selectEventKind("MURDER_MYSTERY")} className={`rounded-2xl border px-4 py-4 font-bold ${form.eventKind === "MURDER_MYSTERY" ? "border-red-400 bg-red-400/10 text-red-300" : "border-white/10 text-zinc-500"}`}>머더미스터리</button>
                  <button type="button" onClick={() => selectEventKind("CLOCKTOWER")} className={`rounded-2xl border px-4 py-4 font-bold ${form.eventKind === "CLOCKTOWER" ? "border-violet-400 bg-violet-400/10 text-violet-300" : "border-white/10 text-zinc-500"}`}>시계탑에 흐른 피</button>
                </div>
              </div>

              {form.eventKind === "MURDER_MYSTERY" && <div className="grid gap-4 rounded-2xl border border-red-400/20 bg-red-400/[0.04] p-4">
                <label className="grid gap-2"><span className="text-sm font-semibold text-red-200">진행 작품 *</span><select value={form.murderMysteryId} onChange={e => selectMurderMystery(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-3"><option value="">작품을 선택하세요</option>{murderMysteries.map(work => <option key={work.id} value={work.id}>{work.title} ({work.min_players ?? "?"}~{work.max_players ?? "?"}명)</option>)}</select></label>
                {form.title && <div className="rounded-xl border border-red-400/20 bg-black/10 px-4 py-3"><p className="text-xs text-zinc-500">자동 생성 제목</p><p className="mt-1 font-bold text-red-200">{form.title}</p></div>}
                <label className="grid gap-2"><span className="text-sm font-semibold text-red-200">내 참여 역할</span><select value={form.creatorRole} onChange={e => updateForm("creatorRole", e.target.value as "PLAYER" | "GM")} className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-3"><option value="PLAYER">플레이어</option>{["MAIN_ADMIN","ADMIN","RULE_MASTER"].includes(siteRole) && <option value="GM">GM</option>}</select></label>
                <p className="text-xs leading-5 text-zinc-500">같은 작품을 이미 플레이한 멤버는 일반 참가가 제한됩니다. 담당자는 상세 화면에서 재참가를 별도로 허용할 수 있습니다.</p>
              </div>}

              {form.eventKind === "CLOCKTOWER" && <div className="grid gap-4 rounded-2xl border border-violet-400/20 bg-violet-400/[0.04] p-4">
                <label className="grid gap-2"><span className="text-sm font-semibold text-violet-200">난이도 *</span><select value={form.clocktowerDifficulty} onChange={(event) => selectClocktowerDifficulty(event.target.value as ClocktowerDifficulty)} className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-3"><option value="">난이도를 선택하세요</option>{CLOCKTOWER_DIFFICULTIES.map((difficulty) => <option key={difficulty} value={difficulty}>{difficulty}</option>)}</select></label>
                {form.title && <div className="rounded-xl border border-violet-400/20 bg-black/10 px-4 py-3"><p className="text-xs text-zinc-500">자동 생성 제목</p><p className="mt-1 font-bold text-violet-200">{form.title}</p></div>}
                <p className="text-xs leading-5 text-zinc-500">선택한 난이도로 제목이 자동 생성됩니다. 시계탑에 흐른 피 이벤트는 정시에 함께 시작합니다.</p>
              </div>}

              {form.eventKind === "GENERAL" && <div className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.04] p-4 text-sm leading-6 text-zinc-400"><strong className="text-sky-300">일반 이벤트</strong><br/>페스티벌, 엠티, 번개 모임처럼 게임 진행이 필요 없는 일정입니다. 참가 신청·정원·대기자·출석·공지 기능만 사용합니다.</div>}
              {form.eventKind !== "MURDER_MYSTERY" && form.eventKind !== "CLOCKTOWER" && <label className="grid gap-3">
                <span className="text-sm font-semibold text-zinc-200">
                  이벤트 제목 <span className="text-amber-400">*</span>
                </span>

                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  placeholder="예: 화요일 보드게임 정기 모임"
                  maxLength={80}
                  className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3.5 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400/60"
                />

                <span className="text-right text-xs text-zinc-600">
                  {form.title.length} / 80
                </span>
              </label>}

              <div className="grid gap-6 md:grid-cols-3">
                <label className="grid gap-3">
                  <span className="text-sm font-semibold text-zinc-200">
                    날짜 <span className="text-amber-400">*</span>
                  </span>

                  <input
                    type="date"
                    min={getMinimumDate()}
                    value={form.date}
                    onChange={(event) => updateForm("date", event.target.value)}
                    className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3.5 text-zinc-200 outline-none transition focus:border-amber-400/60"
                  />
                </label>

                <label className="grid gap-3">
                  <span className="text-sm font-semibold text-zinc-200">
                    시작 시간 <span className="text-amber-400">*</span>
                  </span>

                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(event) => updateStartTime(event.target.value)}
                    className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3.5 text-zinc-200 outline-none transition focus:border-amber-400/60"
                  />
                </label>

                <label className="grid gap-3">
                  <span className="text-sm font-semibold text-zinc-200">
                    종료 시간
                  </span>

                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(event) =>
                      updateForm("endTime", event.target.value)
                    }
                    className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3.5 text-zinc-200 outline-none transition focus:border-amber-400/60"
                  />
                </label>
              </div>

              <label className="grid gap-3">
                <span className="text-sm font-semibold text-zinc-200">
                  장소
                </span>

                <input
                  type="text"
                  value={form.location}
                  onChange={(event) =>
                    updateForm("location", event.target.value)
                  }
                  placeholder={DEFAULT_EVENT_LOCATION}
                  maxLength={100}
                  className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3.5 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400/60"
                />
              </label>

              {form.eventKind !== "MURDER_MYSTERY" && <label className="grid gap-3">
                <span className="text-sm font-semibold text-zinc-200">참가 정원</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.maxParticipants}
                  onChange={(event) => updateForm("maxParticipants", event.target.value)}
                  placeholder="비워두면 무제한"
                  className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3.5 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400/60"
                />
                <span className="text-xs text-zinc-500">이벤트를 만든 뒤에도 관리자가 변경할 수 있습니다.</span>
              </label>}

              <label className="grid gap-3">
                <span className="text-sm font-semibold text-zinc-200">참가비</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={form.participationFee}
                  onChange={(event) => updateForm("participationFee", event.target.value)}
                  placeholder={form.eventKind === "BOARDGAME" || form.eventKind === "CLOCKTOWER" ? "기본 10,000원" : form.eventKind === "MURDER_MYSTERY" ? "기본 13,000원" : "기본 무료"}
                  className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3.5 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400/60"
                />
                <span className="text-xs leading-5 text-zinc-500">
                  비워두면 현재 이벤트의 기본 참가비 <strong className="text-zinc-300">{form.eventKind === "BOARDGAME" || form.eventKind === "CLOCKTOWER" ? "10,000원" : form.eventKind === "MURDER_MYSTERY" ? "13,000원" : "무료"}</strong>가 적용됩니다. 무료 이벤트는 0원을 입력하세요.
                </span>
              </label>

              {form.eventKind === "BOARDGAME" && <label className="grid gap-3">
                <span className="text-sm font-semibold text-zinc-200">반복 일정</span>
                <select
                  value={form.recurrence}
                  onChange={(event) => updateForm("recurrence", event.target.value as EventForm["recurrence"])}
                  className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3.5 text-zinc-100 outline-none transition focus:border-amber-400/60"
                >
                  <option value="NONE">반복 안 함</option>
                  <option value="WEEKLY">매주 반복</option>
                  <option value="BIWEEKLY">격주 반복</option>
                </select>
                <span className="text-xs leading-5 text-zinc-500">
                  반복 일정은 선택한 날짜를 기준으로 앞으로 2개월치가 생성되며, 일정별 Vol 번호가 독립적으로 붙습니다. 공휴일도 생성됩니다.
                </span>
              </label>}

              <label className="grid gap-3">
                <span className="text-sm font-semibold text-zinc-200">
                  이벤트 안내 프리셋 <span className="text-xs font-normal text-zinc-500">(수정 가능)</span>
                </span>

                <textarea
                  value={form.description}
                  onChange={(event) =>
                    updateForm("description", event.target.value)
                  }
                  placeholder="참가 대상, 진행 방식, 준비물, 주의사항 등을 작성해 주세요."
                  maxLength={1000}
                  rows={9}
                  className="resize-none rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3.5 leading-7 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400/60"
                />

                <span className="text-right text-xs text-zinc-600">
                  {form.description.length} / 1000
                </span>
              </label>
            </div>

            {errorMessage && (
              <div className="mt-7 rounded-2xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">
                {errorMessage}
              </div>
            )}

            <div className="mt-9 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Link
                href="/events"
                className="rounded-2xl border border-white/10 px-6 py-3 text-center font-semibold text-zinc-300 transition hover:border-white/20 hover:bg-white/5"
              >
                취소
              </Link>

              <button
                type="submit"
                disabled={isSaving}
                className="rounded-2xl bg-amber-400 px-7 py-3 font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? "저장 중..." : "이벤트 만들기"}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
