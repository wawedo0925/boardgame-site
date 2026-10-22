"use client";

import { useEffect, useRef, useState } from "react";

export default function EventCopyButtons({ title, eventId }: { title: string; eventId: string }) {
  const [copied, setCopied] = useState<"title" | "link" | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy(kind: "title" | "link") {
    const text = kind === "title" ? title : new URL(`/events/${eventId}`, window.location.origin).href;
    setError("");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Some in-app browsers do not expose the Clipboard API.
      const input = document.createElement("textarea");
      const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      input.value = text;
      input.readOnly = true;
      input.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
      document.body.appendChild(input);
      input.select();
      input.setSelectionRange(0, text.length);
      let success = false;
      try { success = document.execCommand("copy"); } catch { /* Show a visible failure below. */ }
      finally { input.remove(); focused?.focus({ preventScroll: true }); }
      if (!success) {
        setCopied(null);
        setError("복사하지 못했어요. 브라우저에서 다시 시도해 주세요.");
        return;
      }
    }
    setCopied(kind);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 2000);
  }

  return <div className="relative ml-auto flex shrink-0 items-center gap-1.5">
    {(["title", "link"] as const).map(kind => <button
      key={kind}
      type="button"
      aria-label={kind === "title" ? "이벤트 제목 복사" : "이벤트 링크 복사"}
      onClick={() => void copy(kind)}
      className="min-h-10 w-16 whitespace-nowrap rounded-xl border border-white/15 bg-white/5 px-1 text-[10px] font-semibold text-zinc-300 transition hover:border-amber-300/50 hover:text-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 sm:w-auto sm:px-3 sm:text-xs"
    >{copied === kind ? "복사 완료 ✓" : kind === "title" ? "제목 복사" : "링크 복사"}</button>)}
    <span role="status" className="sr-only">{copied ? `${copied === "title" ? "제목" : "링크"}을 복사했어요.` : ""}</span>
    {error && <p role="alert" className="absolute right-0 top-full z-10 mt-1 w-60 rounded-lg border border-red-400/30 bg-zinc-900 p-2 text-xs text-red-300">{error}</p>}
  </div>;
}
