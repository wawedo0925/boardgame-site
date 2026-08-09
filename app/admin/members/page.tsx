import { redirect } from "next/navigation";
import Header from "../../components/Header";
import { createClient } from "../../../lib/supabase/server";
import MemberStatusManager from "./MemberStatusManager";

export default async function AdminMembersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: isMainAdmin } = await supabase.rpc("is_main_admin");
  if (!isMainAdmin) redirect("/");

  return (
    <main className="min-h-screen bg-[#08090b] text-white">
      <Header />
      <MemberStatusManager />
    </main>
  );
}
