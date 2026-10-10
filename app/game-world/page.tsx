import Link from "next/link";

export const metadata = {
  title: "게임월드",
  description: "보드라운지에서 실시간 온라인 보드게임을 즐겨 보세요.",
};

const games = [
  {
    href: "/tichu",
    eyebrow: "CARD GAME",
    title: "티츄",
    description: "팀전과 개인전, 다양한 난이도의 AI와 즐기는 실시간 티츄",
    details: ["4인 플레이", "팀전 · 개인전", "AI 대전"],
    icon: "tichu",
    color: "from-sky-500/25 via-cyan-400/5 to-transparent",
    border: "hover:border-sky-300/70",
    button: "bg-sky-300 text-slate-950",
  },
  {
    href: "/yut",
    eyebrow: "TRADITIONAL GAME",
    title: "윷놀이",
    description: "잡기와 업기, 지름길의 재미를 담은 온라인 윷놀이",
    details: ["개인 2~4인", "2대2 · 2대2대2", "AI 대전"],
    icon: "yut",
    color: "from-amber-400/25 via-emerald-400/5 to-transparent",
    border: "hover:border-amber-300/70",
    button: "bg-amber-300 text-zinc-950",
  },
] as const;

export default function GameWorldPage() {
  return (
    <main className="min-h-[calc(100dvh-5rem)] bg-[radial-gradient(circle_at_top,#17251f_0%,#090b0a_48%,#050606_100%)] px-4 py-10 text-white sm:py-16">
      <div className="mx-auto w-full max-w-6xl">
        <header className="text-center">
          <p className="text-xs font-black tracking-[0.35em] text-amber-300">
            WAWEDO GAME WORLD
          </p>
          <h1 className="mt-3 text-4xl font-black sm:text-6xl">게임월드</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">
            원하는 게임을 골라 친구 또는 AI와 바로 시작하세요.
          </p>
        </header>

        <section className="mt-9 grid gap-5 md:mt-12 md:grid-cols-2">
          {games.map((game) => (
            <Link
              key={game.href}
              href={game.href}
              className={`group relative min-h-[23rem] overflow-hidden rounded-[2rem] border border-white/10 bg-[#101312] p-6 shadow-2xl transition duration-300 hover:-translate-y-1 ${game.border} sm:p-8`}
            >
              <div
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${game.color}`}
              />
              <div className="relative flex h-full flex-col">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-black tracking-[0.28em] text-zinc-400">
                      {game.eyebrow}
                    </p>
                    <h2 className="mt-2 text-4xl font-black">{game.title}</h2>
                  </div>
                  <span className="grid h-20 w-20 place-items-center rounded-3xl border border-white/10 bg-black/30 text-5xl shadow-xl transition group-hover:scale-105">
                    {game.icon === "tichu" ? (
                      "🀄"
                    ) : (
                      <span
                        className="relative block h-12 w-14 rotate-[-8deg]"
                        aria-label="윷가락 네 개"
                      >
                        {[0, 1, 2, 3].map((stick) => (
                          <span
                            key={stick}
                            className="absolute top-1 h-10 w-2.5 rounded-full border border-amber-100/70 bg-gradient-to-r from-amber-100 via-amber-300 to-amber-600 shadow-md"
                            style={{
                              left: `${stick * 13}px`,
                              transform: `rotate(${stick % 2 ? 8 : -5}deg) translateY(${stick % 2 ? 2 : 0}px)`,
                            }}
                          />
                        ))}
                      </span>
                    )}
                  </span>
                </div>

                <p className="mt-6 max-w-md leading-7 text-zinc-300">
                  {game.description}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {game.details.map((detail) => (
                    <span
                      key={detail}
                      className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs font-bold text-zinc-300"
                    >
                      {detail}
                    </span>
                  ))}
                </div>

                <span
                  className={`mt-auto flex min-h-14 items-center justify-center rounded-2xl text-base font-black shadow-lg transition group-hover:brightness-110 ${game.button}`}
                >
                  {game.title} 시작하기
                  <span className="ml-2" aria-hidden="true">→</span>
                </span>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
