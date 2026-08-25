import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

type Summary = {
  registered_members: number;
  attended_members: number;
  new_members: number;
  upcoming_events: number;
  total_events: number;
};

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: isMainAdmin }, { data: summaryRows }] = await Promise.all([
    supabase.rpc("is_main_admin"),
    supabase.rpc("admin_dashboard_summary"),
  ]);
  if (!isMainAdmin) redirect("/");

  const summary = (summaryRows?.[0] ?? {}) as Partial<Summary>;
  const cards = [
    { label: "가입 회원", value: summary.registered_members ?? 0, unit: "명" },
    { label: "참여 경험 회원", value: summary.attended_members ?? 0, unit: "명" },
    { label: "첫 출석 전", value: summary.new_members ?? 0, unit: "명" },
    { label: "예정 이벤트", value: summary.upcoming_events ?? 0, unit: "개" },
  ];

  return (
    <main className="min-h-screen bg-[#08090b] text-white">
      <section className="mx-auto max-w-6xl px-5 py-14">
        <p className="text-xs font-bold tracking-[0.28em] text-amber-400">ADMIN DASHBOARD</p>
        <h1 className="mt-2 text-3xl font-black">관리자 페이지</h1>
        <p className="mt-3 text-sm text-zinc-400">회원과 이벤트 운영 기능을 한곳에서 확인합니다.</p>

        <div className="mt-9 grid grid-cols-2 gap-3 md:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
              <p className="text-xs text-zinc-500">{card.label}</p>
              <p className="mt-2 text-2xl font-black text-amber-400">{card.value}{card.unit}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Link href="/admin/members" className="rounded-2xl border border-emerald-900 bg-emerald-950/30 p-6 transition hover:border-emerald-500">
            <p className="text-xs font-bold tracking-widest text-emerald-400">MEMBER STATUS</p>
            <h2 className="mt-2 text-xl font-black">멤버들 현황</h2>
            <p className="mt-2 text-sm text-zinc-400">총 참여 횟수, 월별 참여, 마지막 참석일을 확인합니다.</p>
          </Link>
          <Link href="/admin/roles" className="rounded-2xl border border-sky-900 bg-sky-950/30 p-6 transition hover:border-sky-500">
            <p className="text-xs font-bold tracking-widest text-sky-400">ROLE MANAGEMENT</p>
            <h2 className="mt-2 text-xl font-black">회원 직위 관리</h2>
            <p className="mt-2 text-sm text-zinc-400">메인 관리자·관리자·룰마·일반 회원 직위를 관리합니다.</p>
          </Link>
          <Link href="/events" className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 transition hover:border-amber-500">
            <h2 className="text-xl font-black">이벤트 관리</h2>
            <p className="mt-2 text-sm text-zinc-400">총 {summary.total_events ?? 0}개의 이벤트를 확인합니다.</p>
          </Link>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/boardgames" className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-center font-bold hover:border-amber-500">보드게임</Link>
            <Link href="/murder-mystery" className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-center font-bold hover:border-red-500">머더미스터리</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
