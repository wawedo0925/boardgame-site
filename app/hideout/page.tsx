import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HideoutEditor from "./HideoutEditor";

export default async function HideoutPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: role } = await supabase.rpc("current_site_role");
  if (role !== "MAIN_ADMIN") redirect("/");

  return <HideoutEditor />;
}
