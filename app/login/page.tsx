"use client";

import { useState } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleKakaoLogin() {
    setIsLoading(true);
    setErrorMessage(null);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo,
      },
    });

    if (error) {
      setErrorMessage(`카카오 로그인을 시작하지 못했습니다: ${error.message}`);
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 py-16 text-white">
      <section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/30 sm:p-8">
        <Link
          href="/"
          className="inline-flex text-sm font-medium text-zinc-500 transition hover:text-amber-300"
        >
          ← 홈으로 돌아가기
        </Link>

        <div className="mt-8">
          <p className="text-sm font-semibold tracking-[0.3em] text-amber-400">
            WAWEDO
          </p>

          <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-100">
            보드라운지 로그인
          </h1>

          <p className="mt-4 text-sm leading-6 text-zinc-500">
            카카오 계정으로 로그인하고 리뷰, 댓글, 플레이 기록을 하나의
            계정으로 관리해보세요.
          </p>
        </div>

        <button
          type="button"
          onClick={handleKakaoLogin}
          disabled={isLoading}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#FEE500] px-5 py-4 text-sm font-bold text-[#191919] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-[#191919] text-xs font-bold text-[#FEE500]"
          >
            K
          </span>

          {isLoading ? "카카오로 이동 중..." : "카카오로 로그인"}
        </button>

        {errorMessage && (
          <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-300">
            {errorMessage}
          </div>
        )}

        <p className="mt-6 text-center text-xs leading-5 text-zinc-600">
          로그인하면 보드라운지의 서비스 이용을 위한 기본 계정 정보가
          Supabase에 저장됩니다.
        </p>
      </section>
    </main>
  );
}