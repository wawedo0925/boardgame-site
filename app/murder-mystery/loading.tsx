export default function MurderMysteryLoading() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white" aria-busy="true" aria-label="머더미스터리 목록 불러오는 중">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="h-4 w-40 animate-pulse rounded bg-red-400/20" />
          <div className="mt-5 h-12 w-72 animate-pulse rounded-xl bg-white/10" />
          <div className="mt-6 h-5 max-w-2xl animate-pulse rounded bg-white/[0.06]" />
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-8 h-20 animate-pulse rounded-3xl border border-white/10 bg-white/[0.03]" />
        <div className="overflow-hidden rounded-3xl border border-white/10">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex gap-5 border-b border-white/10 p-5 last:border-0">
              <div className="h-28 w-20 shrink-0 animate-pulse rounded-2xl bg-white/[0.07]" />
              <div className="flex-1 py-2">
                <div className="h-5 w-2/5 animate-pulse rounded bg-white/10" />
                <div className="mt-4 h-4 w-3/5 animate-pulse rounded bg-white/[0.06]" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
