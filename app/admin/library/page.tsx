import { redirect } from "next/navigation";
import Header from "../../components/Header";
import { createClient } from "../../../lib/supabase/server";
import LibraryManager from "./LibraryManager";
import ExistingLibraryEditor from "./ExistingLibraryEditor";

export default async function LibraryRegistrationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: isMainAdmin } = await supabase.rpc("is_main_admin");
  if (!isMainAdmin) redirect("/");
  return <main className="min-h-screen bg-[#08090b] text-white">
    <Header />
    <section className="mx-auto max-w-5xl px-5 py-14">
      <p className="text-xs font-bold tracking-[0.28em] text-violet-400">LIBRARY REGISTRATION</p>
      <h1 className="mt-2 text-3xl font-black">게임 등록·관리</h1>
      <p className="mt-3 text-sm text-zinc-400">새 작품을 등록하거나 기존 보드게임·머더미스터리 정보를 수정합니다.</p>
      <LibraryManager />
      <ExistingLibraryEditor />
    </section>
  </main>;
}
