import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InquiryBoard from "@/components/inquiries/InquiryBoard";
export default async function Page() {
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user) redirect("/login");
 const {data:admin}=await supabase.rpc("is_main_admin");
 if(!admin) redirect("/");
 return <InquiryBoard userId={user.id} admin />;
}
