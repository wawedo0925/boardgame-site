import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VideoStudio from "./VideoStudio";
import type { StudioProject, StudioScene } from "./types";

export default async function VideoStudioPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: admin } = await supabase.rpc("is_main_admin");
  if (!admin) redirect("/");
  const [{data:projectRows,error:projectError},{data:sceneRows,error:sceneError}] = await Promise.all([
    supabase.from("video_studio_projects").select("id,title,style,target_duration,thumbnail_url,updated_at").order("updated_at",{ascending:false}),
    supabase.from("video_studio_scenes").select("*").order("position")
  ]);
  const scenes=(sceneRows??[]) as StudioScene[];
  const projects=(projectRows??[]).map(project=>({...project,scenes:scenes.filter(scene=>scene.project_id===project.id)})) as StudioProject[];
  return <main className="min-h-screen bg-[#090909] text-white"><div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6"><Link href="/admin" className="text-sm text-zinc-500 hover:text-white">← 관리자 페이지</Link>{(projectError||sceneError)&&<p role="alert" className="mt-5 rounded-xl border border-red-900 bg-red-950/30 p-4 text-red-300">영상 스튜디오 데이터를 불러오지 못했습니다. 데이터베이스 설정을 확인해 주세요.</p>}<VideoStudio initialProjects={projects}/></div></main>;
}
