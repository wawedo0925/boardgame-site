"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import HeaderBase from "./HeaderBase";

const MOBILE_LINKS = [
  { href: "/notice", label: "공지사항" },
  { href: "/boardgames", label: "보드게임" },
  { href: "/murder-mystery", label: "머더미스터리" },
  { href: "/reviews", label: "게임 평가" },
  { href: "/events", label: "이벤트 일정" },
  { href: "/rankings", label: "게임 랭킹" },
  { href: "/notifications", label: "알림" },
  { href: "/mypage", label: "마이페이지" },
] as const;

export default function Header() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, []);

  return (
    <>
      <HeaderBase />

      <button
        type="button"
        aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
        aria-expanded={open}
        aria-controls="mobile-site-menu"
        onClick={() => setOpen((current) => !current)}
        className="fixed right-4 top-[84px] z-[80] flex h-11 w-11 items-center justify-center rounded-full border border-amber-400/50 bg-[#111113]/95 text-amber-300 shadow-xl backdrop-blur lg:hidden"
      >
        <span className="sr-only">{open ? "메뉴 닫기" : "메뉴 열기"}</span>
        <span className="relative block h-5 w-6" aria-hidden="true">
          <span
            className={`absolute left-0 top-0 h-0.5 w-6 rounded bg-current transition ${
              open ? "translate-y-[9px] rotate-45" : ""
            }`}
          />
          <span
            className={`absolute left-0 top-[9px] h-0.5 w-6 rounded bg-current transition ${
              open ? "opacity-0" : ""
            }`}
          />
          <span
            className={`absolute bottom-0 left-0 h-0.5 w-6 rounded bg-current transition ${
              open ? "-translate-y-[9px] -rotate-45" : ""
            }`}
          />
        </span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="모바일 메뉴 닫기"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[70] bg-black/60 lg:hidden"
          />
          <nav
            id="mobile-site-menu"
            aria-label="모바일 메뉴"
            className="fixed right-4 top-[140px] z-[80] w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/15 bg-[#111113]/98 p-2 shadow-2xl backdrop-blur lg:hidden"
          >
            <div className="px-4 pb-2 pt-3 text-xs font-bold tracking-[0.24em] text-amber-300">
              MENU
            </div>
            <div className="grid gap-1">
              {MOBILE_LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-3 text-base font-semibold text-white transition hover:bg-amber-400/15 hover:text-amber-300 focus:bg-amber-400/15 focus:text-amber-300 focus:outline-none"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </>
      ) : null}
    </>
  );
}
