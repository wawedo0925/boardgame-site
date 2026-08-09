import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.20),transparent_38%)]" />

        <div className="relative mx-auto grid min-h-[650px] max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-2">
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

            <p className="mt-7 max-w-xl text-lg leading-8 text-zinc-400">
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
            <div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-zinc-800 to-zinc-900 p-4 shadow-2xl shadow-black/50">
              <div className="flex min-h-[420px] flex-col justify-end rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.18),transparent_50%)] p-8">
                <p className="text-sm text-amber-300">THIS WEEK</p>

                <h2 className="mt-3 text-3xl font-bold">
                  화요 정기 보드게임 모임
                </h2>

                <p className="mt-3 text-zinc-400">
                  다양한 보드게임과 새로운 사람들을 만나는 시간
                </p>

                <div className="mt-7 flex flex-wrap gap-3 text-sm">
                  <span className="rounded-full bg-white/10 px-4 py-2">
                    매주 화요일
                  </span>

                  <span className="rounded-full bg-white/10 px-4 py-2">
                    19:20
                  </span>

                  <span className="rounded-full bg-white/10 px-4 py-2">
                    와위두
                  </span>
                </div>
              </div>
            </div>
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
              {[
                "보드라운지 홈페이지를 준비하고 있습니다.",
                "정기 모임 참여 방법 안내",
                "모임 운영 규칙 및 이용 안내",
              ].map((notice, index) => (
                <article
                  key={notice}
                  className="flex items-center gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-amber-400/40"
                >
                  <span className="text-sm text-amber-400">
                    0{index + 1}
                  </span>

                  <p className="font-medium">{notice}</p>
                </article>
              ))}
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
              <article className="rounded-3xl border border-white/10 bg-zinc-900 p-6">
                <p className="text-sm text-amber-400">정기 모임</p>

                <h3 className="mt-3 text-xl font-bold">화요 보드게임 모임</h3>

                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  전략게임부터 파티게임까지 자유롭게 즐기는 정기 모임
                </p>

                <p className="mt-7 text-sm text-zinc-300">
                  매주 화요일 19:20
                </p>
              </article>

              <article className="rounded-3xl border border-white/10 bg-zinc-900 p-6">
                <p className="text-sm text-amber-400">SPECIAL EVENT</p>

                <h3 className="mt-3 text-xl font-bold">마피아 게임 나이트</h3>

                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  아발론, 레지스탕스, 마피아를 함께 즐기는 대규모 게임
                </p>

                <p className="mt-7 text-sm text-zinc-300">일정 준비 중</p>
              </article>
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