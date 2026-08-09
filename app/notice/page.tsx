import Header from "../components/Header";

const notices = [
  {
    id: 1,
    title: "보드라운지 홈페이지를 준비하고 있습니다.",
    date: "2026.07.29",
    important: true,
  },
  {
    id: 2,
    title: "정기 모임 참여 방법 안내",
    date: "2026.07.28",
    important: true,
  },
  {
    id: 3,
    title: "모임 운영 규칙 및 이용 안내",
    date: "2026.07.27",
    important: false,
  },
  {
    id: 4,
    title: "룰마스터 플레이 기록 작성 안내",
    date: "2026.07.26",
    important: false,
  },
];

export default function NoticePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <Header />

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <p className="text-sm font-semibold tracking-[0.3em] text-amber-400">
            NOTICE
          </p>

          <h1 className="mt-3 text-4xl font-bold sm:text-5xl">
            공지사항
          </h1>

          <p className="mt-5 text-lg text-zinc-400">
            보드라운지의 중요한 소식과 운영 안내를 확인하세요.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="overflow-hidden rounded-3xl border border-white/10">
          <div className="hidden grid-cols-[100px_1fr_140px] border-b border-white/10 bg-white/[0.04] px-6 py-4 text-sm text-zinc-400 sm:grid">
            <p>번호</p>
            <p>제목</p>
            <p className="text-right">작성일</p>
          </div>

          <div>
            {notices.map((notice) => (
              <article
                key={notice.id}
                className="grid gap-3 border-b border-white/10 px-6 py-5 last:border-b-0 sm:grid-cols-[100px_1fr_140px] sm:items-center"
              >
                <p className="text-sm text-zinc-500">
                  {String(notice.id).padStart(2, "0")}
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  {notice.important && (
                    <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-300">
                      중요
                    </span>
                  )}

                  <h2 className="font-medium text-zinc-100">
                    {notice.title}
                  </h2>
                </div>

                <p className="text-sm text-zinc-500 sm:text-right">
                  {notice.date}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}