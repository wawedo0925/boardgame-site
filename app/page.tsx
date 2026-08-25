import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type HomeNotice = { id: string; title: string; important: boolean };
type HomeEvent = {
  id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  location: string | null;
  description: string | null;
  event_kind: "BOARDGAME" | "MURDER_MYSTERY" | "GENERAL";
  max_participants: number | null;
  event_participants: { id: string }[] | null;
};

function eventKindLabel(kind: HomeEvent["event_kind"]) {
  if (kind === "MURDER_MYSTERY") return "머더미스터리";
  if (kind === "GENERAL") return "SPECIAL EVENT";
  return "보드게임 이벤트";
}

function eventDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function eventTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function remainingSeats(event: HomeEvent) {
  if (event.max_participants === null) return null;
  return Math.max(0, event.max_participants - (event.event_participants?.length ?? 0));
}

export default async function Home() {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const [{ data: noticeData }, { data: eventData }] = await Promise.all([
    supabase
      .from("notices")
      .select("id,title,important")
      .order("important", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("events")
      .select("id,title,started_at,ended_at,location,description,event_kind,max_participants,event_participants(id)")
      .gte("started_at", now)
      .eq("event_status", "OPEN")
      .order("started_at", { ascending: true })
      .limit(20),
  ]);
  const notices = (noticeData ?? []) as HomeNotice[];
  const events = (eventData ?? []) as HomeEvent[];
  const urgentEvents = events
    .filter((event) => {
      const remaining = remainingSeats(event);
      return remaining !== null && remaining > 0 && remaining <= 2;
    })
    .sort((a, b) => {
      const seatDifference = (remainingSeats(a) ?? 99) - (remainingSeats(b) ?? 99);
      return seatDifference || new Date(a.started_at).getTime() - new Date(b.started_at).getTime();
    });
  const featuredEvent = urgentEvents[0] ?? events[0] ?? null;
  const featuredRemaining = featuredEvent ? remainingSeats(featuredEvent) : null;
  const featuredIsUrgent = featuredEvent ? urgentEvents.some((event) => event.id === featuredEvent.id) : false;
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-y-0 left-1/2 w-full max-w-7xl -translate-x-1/2 overflow-hidden">
          <Image
            src="/space/wawedo-neon.jpg"
            alt=""
            fill
            priority
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="object-cover object-[center_38%] md:origin-center md:-translate-x-[20%] md:scale-[1.45]"
          />
          <div className="absolute inset-0 bg-black/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-black/5" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/65 via-transparent to-black/15" />
        </div>

        <div className="relative mx-auto grid min-h-[650px] max-w-7xl items-end gap-12 px-6 py-20 lg:grid-cols-2">
          <div>
            <p className="mb-5 text-sm font-semibold tracking-[0.3em] text-amber-400">
              BOARD GAME COMMUNITY
            </p>

            <h1 className="text-5xl font-bold leading-tight sm:text-6xl">
              함께 플레이하고
              <br />
              우리의 게임을
              <br />
              기록합니다.
            </h1>

            <p className="mt-7 max-w-xl text-lg leading-8 text-zinc-200">
              보드라운지는 와위두에서 만나는 보드게임 커뮤니티입니다.
              이벤트에 참여하고, 플레이 기록과 평가를 남겨보세요.
            </p>

            <div className="mt-9 flex flex-wrap gap-4">
              <Link
                href="/events"
                className="rounded-full bg-amber-400 px-7 py-3 font-semibold text-zinc-950 transition hover:bg-amber-300"
              >
                이벤트 둘러보기
              </Link>

              <Link
                href="/boardgames"
                className="rounded-full border border-white/20 px-7 py-3 font-semibold text-white transition hover:border-white/50 hover:bg-white/5"
              >
                보드게임 찾기
              </Link>
            </div>
          </div>

          <div className="relative">
            <Link href={featuredEvent ? `/events/${featuredEvent.id}` : "/events"} className="block rounded-[32px] border border-white/20 bg-black/40 p-3 shadow-2xl shadow-black/40 backdrop-blur-[2px] transition hover:border-amber-400/50">
              <div className="flex min-h-[250px] flex-col justify-end rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.10),transparent_55%)] p-7">
                <p className="text-sm text-amber-300">{featuredIsUrgent ? "마감 임박" : "UPCOMING EVENT"}</p>

                <h2 className="mt-3 text-3xl font-bold">
                  {featuredEvent?.title ?? "예정된 이벤트를 확인해보세요"}
                </h2>

                <p className="mt-3 text-zinc-300">
                  {featuredEvent?.description?.trim() || "보드라운지의 새로운 모임과 이벤트가 여기에 표시됩니다."}
                </p>

                <div className="mt-7 flex flex-wrap gap-3 text-sm">
                  <span className="rounded-full bg-white/10 px-4 py-2">
                    {featuredEvent ? eventDate(featuredEvent.started_at) : "이벤트 일정 보기"}
                  </span>

                  {featuredEvent && <span className="rounded-full bg-white/10 px-4 py-2">{eventTime(featuredEvent.started_at)}</span>}

                  {featuredIsUrgent && featuredRemaining !== null && <span className="rounded-full bg-red-400/15 px-4 py-2 font-semibold text-red-300">{featuredRemaining}자리 남음</span>}

                  <span className="rounded-full bg-white/10 px-4 py-2">
                    {featuredEvent?.location?.trim() || "장소 미정"}
                  </span>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <div className="mb-7 flex items-end justify-between">
              <div>
                <p className="text-sm font-semibold tracking-[0.25em] text-amber-400">
                  NOTICE
                </p>

                <h2 className="mt-2 text-3xl font-bold">최신 공지</h2>
              </div>

              <Link
                href="/notice"
                className="text-sm text-zinc-400 hover:text-white"
              >
                전체 보기 →
              </Link>
            </div>

            <div className="space-y-3">
              {notices.map((notice, index) => (
                <Link
                  key={notice.id}
                  href={`/notice/${notice.id}`}
                  className="flex items-center gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-amber-400/40"
                >
                  <span className="text-sm text-amber-400">
                    0{index + 1}
                  </span>

                  <p className="font-medium">{notice.title}</p>
                  {notice.important && <span className="ml-auto rounded-full bg-amber-400/15 px-2 py-1 text-xs text-amber-300">중요</span>}
                </Link>
              ))}
              {notices.length === 0 && <Link href="/notice" className="block rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-zinc-500">등록된 공지가 없습니다.</Link>}
            </div>
          </div>

          <div>
            <div className="mb-7 flex items-end justify-between">
              <div>
                <p className="text-sm font-semibold tracking-[0.25em] text-amber-400">
                  UPCOMING EVENTS
                </p>

                <h2 className="mt-2 text-3xl font-bold">예정된 이벤트</h2>
              </div>

              <Link
                href="/events"
                className="text-sm text-zinc-400 hover:text-white"
              >
                전체 보기 →
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {events.slice(0, 2).map((event) => (
                <Link key={event.id} href={`/events/${event.id}`} className="rounded-3xl border border-white/10 bg-zinc-900 p-6 transition hover:border-amber-400/40">
                  <p className="text-sm text-amber-400">{eventKindLabel(event.event_kind)}</p>
                  <h3 className="mt-3 text-xl font-bold">{event.title}</h3>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-400">{event.description?.trim() || "이벤트 상세 내용을 확인해보세요."}</p>
                  <p className="mt-7 text-sm text-zinc-300">{eventDate(event.started_at)}</p>
                </Link>
              ))}
              {events.length === 0 && <Link href="/events" className="rounded-3xl border border-dashed border-white/15 p-8 text-center text-sm text-zinc-500 sm:col-span-2">예정된 이벤트가 없습니다.</Link>}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-6 py-8 text-sm text-zinc-500 sm:flex-row">
          <p>© 2026 보드라운지</p>
          <p>WAWEDO · 신사역 인근</p>
        </div>
      </footer>
    </main>
  );
}
