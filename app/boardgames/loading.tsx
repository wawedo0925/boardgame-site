export default function BoardgamesLoading() {
  return (
    <main className="min-h-screen bg-[#090a0b] pb-24 text-white" aria-busy="true" aria-label="보드게임 목록 불러오는 중">
      <section className="mx-auto flex min-h-[310px] w-[min(1232px,calc(100%-40px))] items-end py-16">
        <div className="w-full max-w-2xl">
          <div className="h-4 w-28 animate-pulse rounded bg-amber-400/20" />
          <div className="mt-5 h-14 w-56 animate-pulse rounded-xl bg-white/10" />
          <div className="mt-6 h-5 w-full animate-pulse rounded bg-white/[0.06]" />
        </div>
      </section>
      <section className="mx-auto w-[min(1232px,calc(100%-40px))] overflow-hidden rounded-3xl border border-white/10">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex gap-5 border-b border-white/10 p-5 last:border-0">
            <div className="h-[130px] w-[104px] shrink-0 animate-pulse rounded-2xl bg-white/[0.07]" />
            <div className="flex-1 py-2">
              <div className="h-5 w-2/5 animate-pulse rounded bg-white/10" />
              <div className="mt-4 h-4 w-3/5 animate-pulse rounded bg-white/[0.06]" />
              <div className="mt-4 h-4 w-1/4 animate-pulse rounded bg-white/[0.05]" />
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
