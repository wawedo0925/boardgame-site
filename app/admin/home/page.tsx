import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HomeContentEditor from "./HomeContentEditor";

export default async function HomeContentPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: role } = await supabase.rpc("current_site_role");
  if (role !== "MAIN_ADMIN") redirect("/");
  const { data, error } = await supabase.from("home_content").select("eyebrow,title,description").eq("id", true).single();

  return <main className="min-h-screen bg-zinc-950 px-5 py-14 text-white">
    <section className="mx-auto max-w-6xl">
      <Link href="/admin" className="text-sm text-zinc-400 hover:text-white">← 관리자 페이지</Link>
      <h1 className="mt-5 text-3xl font-bold">메인 소개 문구 수정</h1>
      <p className="mt-3 text-sm text-zinc-400">메인 화면의 소제목, 큰 제목과 소개글을 수정합니다.</p>
      {error || !data ? <p role="alert" className="mt-8 text-red-300">문구를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : <HomeContentEditor initial={data} />}
    </section>
  </main>;
}
