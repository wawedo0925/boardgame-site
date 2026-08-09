"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import EventPlayHistory from "@/components/mypage/EventPlayHistory";
import Achievements from "@/components/mypage/Achievements";
import { createClient } from "@/lib/supabase/client";

type PublicProfile = {
  id: string;
  activity_name: string | null;
  region: string | null;
  created_at: string;
};

function joinedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" }).format(date);
}

export default function MemberProfilePage() {
  const params = useParams<{ id: string }>();
  const memberId = params.id;
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const { data, error: profileError } = await supabase
          .rpc("get_public_member_profile", { p_member_id: memberId })
          .maybeSingle();
        if (profileError) throw profileError;
        if (!data) throw new Error("회원을 찾을 수 없습니다.");
        if (active) setProfile(data as PublicProfile);
      } catch (loadError) {
        console.error("회원 공개 프로필 조회 오류:", loadError);
        if (active) setError(loadError instanceof Error ? loadError.message : "회원 정보를 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [memberId, supabase]);

  return <main className="min-h-screen bg-zinc-950 text-white">
    <section className="mx-auto max-w-5xl px-5 py-10 sm:px-6 sm:py-14">
      <Link href="/events" className="text-sm text-zinc-500 transition hover:text-amber-300">← 이벤트 목록</Link>
      {loading ? <div className="mt-6 h-64 animate-pulse rounded-3xl bg-white/[0.04]"/> : error || !profile ? <div className="mt-6 rounded-3xl border border-red-400/20 bg-red-400/[0.05] p-10 text-center text-red-300">{error || "회원을 찾을 수 없습니다."}</div> : <>
        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-amber-400 text-3xl font-bold text-zinc-950">{profile.activity_name?.trim().slice(0, 1) || "회"}</div>
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-[0.2em] text-amber-300">MEMBER PROFILE</p>
              <h1 className="mt-2 truncate text-3xl font-bold sm:text-4xl">{profile.activity_name?.trim() || "보드라운지 회원"}</h1>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-zinc-400"><span className="rounded-full bg-white/[0.05] px-3 py-1.5">활동 지역 · {profile.region?.trim() || "미등록"}</span><span className="rounded-full bg-white/[0.05] px-3 py-1.5">가입 · {joinedLabel(profile.created_at)}</span></div>
            </div>
          </div>
          <p className="mt-6 rounded-2xl bg-white/[0.03] p-4 text-sm leading-6 text-zinc-500">공개 프로필에는 활동명과 활동 지역, 공개 이벤트 플레이 기록만 표시됩니다. 이메일과 로그인 정보는 공개되지 않습니다.</p>
        </section>
        <Achievements userId={memberId} publicView />
        <EventPlayHistory userId={memberId}/>
      </>}
    </section>
  </main>;
}
