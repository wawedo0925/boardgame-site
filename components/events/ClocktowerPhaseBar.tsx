import type { ReactNode } from 'react';

export default function ClocktowerPhaseBar({ children }: { children: ReactNode }) {
  return <div aria-label="다음 페이즈 진행" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-zinc-950/95 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-[0_-12px_35px_rgba(0,0,0,0.45)] backdrop-blur">
    <div className="mx-auto max-w-3xl [&>button]:min-h-12 [&>button]:w-full [&>button]:whitespace-normal">{children}</div>
  </div>;
}
