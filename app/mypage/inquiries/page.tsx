import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InquiryBoard from "@/components/inquiries/InquiryBoard";
export default async function Page() {
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user) redirect("/login");
 return <InquiryBoard userId={user.id} />;
}
