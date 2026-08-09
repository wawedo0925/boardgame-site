import Link from "next/link";
import { createClient } from "../../lib/supabase/server";

export default async function AdminLibraryButton() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: isMainAdmin } = await supabase.rpc("is_main_admin");
  if (!isMainAdmin) return null;
  return <Link href="/admin/library" className="inline-flex shrink-0 items-center justify-center rounded-xl border border-violet-400/40 bg-violet-400/10 px-4 py-2.5 text-sm font-bold text-violet-200 transition hover:bg-violet-400/20">게임 등록·관리</Link>;
}
