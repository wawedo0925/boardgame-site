import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RoleManager from "./RoleManager";

export default async function StaffRolesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: role } = await supabase.rpc("current_site_role");
  if (role !== "MAIN_ADMIN") redirect("/mypage");

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
        <p className="text-sm font-semibold tracking-[.25em] text-amber-300">
          PERMISSION MANAGEMENT
        </p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">운영 권한 및 회원 직위</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
          메인 관리자만 회원 직위를 변경할 수 있습니다. 직위 변경은 즉시 적용되며
          변경한 사람과 시간이 기록됩니다.
        </p>
        <RoleManager currentUserId={user.id} />
      </section>
    </main>
  );
}
