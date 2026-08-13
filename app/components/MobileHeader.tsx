"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const menuItems = [
  { href: "/", label: "홈" },
  { href: "/notice", label: "공지사항" },
  { href: "/boardgames", label: "보드게임" },
  { href: "/murder-mystery", label: "머더미스터리" },
  { href: "/reviews", label: "게임 평가" },
  { href: "/events", label: "이벤트 일정" },
  { href: "/rankings", label: "게임 랭킹" },
  { href: "/mypage", label: "마이페이지" },
  { href: "/notifications", label: "알림" },
  { href: "/admin", label: "관리자 페이지" },
];

export default function MobileHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-[100] w-full border-b border-white/10 bg-[#09090b]/95 backdrop-blur md:hidden">
      <div className="mx-auto flex min-h-20 w-full max-w-full items-center justify-between gap-3 px-4">
        <Link href="/" className="min-w-0 shrink">
          <span className="block text-[10px] font-bold tracking-[0.32em] text-amber-400">
            WAWEDO
          </span>
          <span className="block truncate text-xl font-black text-white">
            보드라운지
          </span>
        </Link>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          className="flex min-h-12 shrink-0 items-center gap-2 rounded-full border border-amber-400/70 bg-amber-400 px-5 text-sm font-black text-black shadow-[0_0_24px_rgba(251,191,36,0.2)]"
        >
          <span aria-hidden="true">{open ? "×" : "☰"}</span>
          {open ? "메뉴 닫기" : "전체 메뉴"}
        </button>
      </div>

      {open && (
        <div
          id="mobile-navigation"
          className="fixed inset-x-0 top-20 z-[110] h-[calc(100dvh-5rem)] overflow-y-auto border-t border-white/10 bg-[#09090b] px-4 pb-8 pt-4"
        >
          <p className="mb-3 text-xs font-bold tracking-[0.24em] text-amber-400">
            MENU
          </p>
          <nav className="grid grid-cols-2 gap-3" aria-label="모바일 전체 메뉴">
            {menuItems.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-14 items-center justify-center rounded-2xl border px-3 text-center text-sm font-bold transition ${
                    active
                      ? "border-amber-400 bg-amber-400 text-black"
                      : "border-white/15 bg-white/[0.04] text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Link
            href="/login"
            className="mt-4 flex min-h-14 w-full items-center justify-center rounded-2xl border border-amber-400/60 text-sm font-bold text-amber-300"
          >
            로그인 / 계정 확인
          </Link>
        </div>
      )}
    </header>
  );
}
