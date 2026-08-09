"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type RuleNote = { id:string; category:"PREP"|"PLAY"|"SCORING"|"TIP"; content:string; sort_order:number };
type OrganizerImage = { id:string; storage_path:string; caption:string|null; sort_order:number };
type GuideVideo = { id:string; title:string; youtube_url:string; youtube_id:string; sort_order:number };

const CATEGORY = {
  PREP: "게임 준비", PLAY: "진행 중", SCORING: "점수 계산", TIP: "기타 팁",
} as const;

function youtubeId(value:string) {
  try {
    const url = new URL(value.trim());
    if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (url.hostname.endsWith("youtube.com")) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const parts=url.pathname.split("/").filter(Boolean);
      if (["embed","shorts","live"].includes(parts[0] ?? "")) return parts[1] ?? null;
    }
  } catch { return null; }
  return null;
}

export default function GameGuideSection({gameId}:{gameId:string}) {
  const supabase=useMemo(()=>createClient(),[]);
  const [userId,setUserId]=useState<string|null>(null);
  const [isAdmin,setIsAdmin]=useState(false);
  const [notes,setNotes]=useState<RuleNote[]>([]);
  const [images,setImages]=useState<OrganizerImage[]>([]);
  const [videos,setVideos]=useState<GuideVideo[]>([]);
  const [category,setCategory]=useState<RuleNote["category"]>("PLAY");
  const [note,setNote]=useState("");
  const [videoTitle,setVideoTitle]=useState("");
  const [videoUrl,setVideoUrl]=useState("");
  const [caption,setCaption]=useState("");
  const [busy,setBusy]=useState(false);
  const [selectedImage,setSelectedImage]=useState<string|null>(null);
  const [organizerOpen,setOrganizerOpen]=useState(false);
  const [notesOpen,setNotesOpen]=useState(false);

  const load=useCallback(async()=>{
    const [{data:n},{data:i},{data:v},{data:{user}}]=await Promise.all([
      supabase.from("game_rule_notes").select("id,category,content,sort_order").eq("game_id",gameId).order("sort_order").order("created_at"),
      supabase.from("game_organizer_images").select("id,storage_path,caption,sort_order").eq("game_id",gameId).order("sort_order").order("created_at"),
      supabase.from("game_guide_videos").select("id,title,youtube_url,youtube_id,sort_order").eq("game_id",gameId).order("sort_order").order("created_at"),
      supabase.auth.getUser(),
    ]);
    setNotes((n??[]) as RuleNote[]); setImages((i??[]) as OrganizerImage[]); setVideos((v??[]) as GuideVideo[]);
    setUserId(user?.id??null);
    if(user){ const {data}=await supabase.rpc("is_site_admin"); setIsAdmin(Boolean(data)); } else setIsAdmin(false);
  },[gameId,supabase]);

  useEffect(()=>{void load()},[load]);
  const publicUrl=(path:string)=>supabase.storage.from("game-organizers").getPublicUrl(path).data.publicUrl;

  async function addNote(e:FormEvent){e.preventDefault();if(!userId||!note.trim())return;try{setBusy(true);const{error}=await supabase.from("game_rule_notes").insert({game_id:gameId,category,content:note.trim(),sort_order:notes.length,created_by:userId});if(error)throw error;setNote("");await load()}catch(e){alert(e instanceof Error?e.message:"룰 메모를 저장하지 못했습니다.")}finally{setBusy(false)}}
  async function editNote(row:RuleNote){const content=prompt("룰 메모를 수정하세요.",row.content)?.trim();if(!content||content===row.content)return;const{error}=await supabase.from("game_rule_notes").update({content,updated_at:new Date().toISOString()}).eq("id",row.id);if(error)alert(error.message);else await load()}
  async function removeNote(id:string){if(!confirm("이 룰 메모를 삭제할까요?"))return;const{error}=await supabase.from("game_rule_notes").delete().eq("id",id);if(error)alert(error.message);else await load()}

  async function uploadImage(file:File|null){if(!file||!userId)return;if(images.length>=3){alert("사진은 게임당 최대 3장입니다.");return}if(!["image/jpeg","image/png","image/webp"].includes(file.type)){alert("JPG, PNG, WEBP 사진만 올릴 수 있습니다.");return}if(file.size>5*1024*1024){alert("사진 한 장은 5MB 이하여야 합니다.");return}const ext=file.name.split(".").pop()?.toLowerCase()||"jpg";const path=`${gameId}/${crypto.randomUUID()}.${ext}`;try{setBusy(true);const{error:uploadError}=await supabase.storage.from("game-organizers").upload(path,file,{contentType:file.type});if(uploadError)throw uploadError;const{error}=await supabase.from("game_organizer_images").insert({game_id:gameId,storage_path:path,caption:caption.trim()||null,sort_order:images.length,created_by:userId});if(error){await supabase.storage.from("game-organizers").remove([path]);throw error}setCaption("");await load()}catch(e){alert(e instanceof Error?e.message:"사진을 올리지 못했습니다.")}finally{setBusy(false)}}
  async function editImage(row:OrganizerImage){const value=prompt("사진 설명을 수정하세요.",row.caption??"");if(value===null)return;const{error}=await supabase.from("game_organizer_images").update({caption:value.trim()||null,updated_at:new Date().toISOString()}).eq("id",row.id);if(error)alert(error.message);else await load()}
  async function removeImage(row:OrganizerImage){if(!confirm("이 사진을 삭제할까요?"))return;const{error}=await supabase.from("game_organizer_images").delete().eq("id",row.id);if(error){alert(error.message);return}await supabase.storage.from("game-organizers").remove([row.storage_path]);await load()}

  async function addVideo(e:FormEvent){e.preventDefault();if(!userId)return;const id=youtubeId(videoUrl);if(!id){alert("올바른 유튜브 주소를 입력해 주세요.");return}if(!videoTitle.trim()){alert("영상 제목을 입력해 주세요.");return}try{setBusy(true);const{error}=await supabase.from("game_guide_videos").insert({game_id:gameId,title:videoTitle.trim(),youtube_url:videoUrl.trim(),youtube_id:id,sort_order:videos.length,created_by:userId});if(error)throw error;setVideoTitle("");setVideoUrl("");await load()}catch(e){alert(e instanceof Error?e.message:"영상을 등록하지 못했습니다.")}finally{setBusy(false)}}
  async function editVideo(row:GuideVideo){const title=prompt("영상 제목",row.title);if(title===null)return;const url=prompt("유튜브 주소",row.youtube_url);if(url===null)return;const id=youtubeId(url);if(!title.trim()||!id){alert("제목과 올바른 유튜브 주소가 필요합니다.");return}const{error}=await supabase.from("game_guide_videos").update({title:title.trim(),youtube_url:url.trim(),youtube_id:id,updated_at:new Date().toISOString()}).eq("id",row.id);if(error)alert(error.message);else await load()}
  async function removeVideo(id:string){if(!confirm("이 영상을 삭제할까요?"))return;const{error}=await supabase.from("game_guide_videos").delete().eq("id",id);if(error)alert(error.message);else await load()}

  return <section className="mt-12 space-y-8">
    <div className="grid gap-4 md:grid-cols-2">
      <article className="flex min-h-36 flex-col justify-between rounded-2xl border border-amber-400/20 bg-amber-400/[0.035] p-5"><div><p className="text-xs font-semibold tracking-[.18em] text-amber-400">QUICK RULE NOTES</p><h2 className="mt-1.5 text-xl font-bold">놓치기 쉬운 룰 · 플레이 팁</h2><p className="mt-1 text-xs text-zinc-500">등록된 메모 {notes.length}개</p></div><button type="button" onClick={()=>setNotesOpen(true)} className="mt-4 w-fit rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-zinc-950">{notes.length?"룰 메모 보기":"룰 메모 등록"}</button></article>
      {(images.length>0||isAdmin)&&<article className="flex min-h-36 flex-col justify-between rounded-2xl border border-sky-400/20 bg-sky-400/[0.035] p-5"><div><p className="text-xs font-semibold tracking-[.18em] text-sky-300">ORGANIZER GUIDE</p><h2 className="mt-1.5 text-xl font-bold">오거나이저 정리 방법</h2><p className="mt-1 text-xs text-zinc-500">등록된 사진 {images.length}장</p></div><button type="button" onClick={()=>setOrganizerOpen(true)} className="mt-4 w-fit rounded-lg bg-sky-400 px-4 py-2 text-sm font-bold text-zinc-950">{images.length?"오거나이저 보기":"오거나이저 등록"}</button></article>}
    </div>

    {notesOpen&&<div className="fixed inset-0 z-[110] overflow-y-auto bg-black/85 p-4 sm:p-8" onClick={()=>setNotesOpen(false)}><article className="mx-auto max-w-4xl rounded-3xl border border-amber-400/30 bg-zinc-950 p-5 shadow-2xl sm:p-7" onClick={event=>event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold tracking-[.2em] text-amber-400">QUICK RULE NOTES</p><h2 className="mt-2 text-2xl font-bold">놓치기 쉬운 룰 · 플레이 팁</h2><p className="mt-2 text-sm text-zinc-500">게임 준비와 진행 중 다시 확인하기 좋은 핵심 메모입니다.</p></div><button type="button" onClick={()=>setNotesOpen(false)} className="h-11 w-11 shrink-0 rounded-full bg-white/10 text-xl">×</button></div>
      {notes.length?<div className="mt-5 space-y-3">{notes.map(row=><div key={row.id} className="rounded-2xl border border-white/10 bg-black/10 p-4"><div className="flex justify-between gap-3"><span className="text-xs font-bold text-amber-300">{CATEGORY[row.category]}</span>{isAdmin&&<span className="flex gap-2"><button onClick={()=>editNote(row)} className="text-xs text-zinc-400">수정</button><button onClick={()=>removeNote(row.id)} className="text-xs text-red-300">삭제</button></span>}</div><p className="mt-2 whitespace-pre-wrap leading-7 text-zinc-200">{row.content}</p></div>)}</div>:<p className="mt-5 text-sm text-zinc-600">등록된 룰 메모가 없습니다.</p>}
      {isAdmin&&<form onSubmit={addNote} className="mt-5 grid gap-2 sm:grid-cols-[150px_1fr_auto]"><select value={category} onChange={e=>setCategory(e.target.value as RuleNote["category"])} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-3">{Object.entries(CATEGORY).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={1000} rows={2} placeholder="놓치기 쉬운 룰이나 팁" className="resize-none rounded-xl border border-white/10 bg-zinc-900 px-4 py-3"/><button disabled={busy} className="rounded-xl bg-amber-400 px-5 font-bold text-zinc-950">메모 추가</button></form>}
    </article></div>}

    {organizerOpen&&<div className="fixed inset-0 z-[110] overflow-y-auto bg-black/85 p-4 sm:p-8" onClick={()=>setOrganizerOpen(false)}><article className="mx-auto max-w-5xl rounded-3xl border border-sky-400/30 bg-zinc-950 p-5 shadow-2xl sm:p-7" onClick={event=>event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold tracking-[.2em] text-sky-300">ORGANIZER GUIDE</p><h2 className="mt-2 text-2xl font-bold">오거나이저 정리 방법</h2><p className="mt-2 text-sm text-zinc-500">사진을 눌러 크게 볼 수 있습니다. 최대 3장까지 등록됩니다.</p></div><button type="button" onClick={()=>setOrganizerOpen(false)} className="h-11 w-11 shrink-0 rounded-full bg-white/10 text-xl">×</button></div>
      {images.length?<div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{images.map((row,index)=><div key={row.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/10"><button onClick={()=>setSelectedImage(publicUrl(row.storage_path))} className="block aspect-[4/3] w-full overflow-hidden"><img src={publicUrl(row.storage_path)} alt={row.caption||`오거나이저 사진 ${index+1}`} className="h-full w-full object-cover"/></button><div className="p-3"><p className="text-sm text-zinc-300">{index+1}. {row.caption||"설명 없음"}</p>{isAdmin&&<div className="mt-2 flex gap-3"><button onClick={()=>editImage(row)} className="text-xs text-zinc-400">설명 수정</button><button onClick={()=>removeImage(row)} className="text-xs text-red-300">삭제</button></div>}</div></div>)}</div>:<p className="mt-5 text-sm text-zinc-600">등록된 오거나이저 사진이 없습니다.</p>}
      {isAdmin&&images.length<3&&<div className="mt-5 grid gap-2 sm:grid-cols-[1fr_220px]"><input value={caption} onChange={e=>setCaption(e.target.value)} maxLength={300} placeholder="사진 설명 (선택)" className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-3"/><label className="cursor-pointer rounded-xl bg-sky-400 px-5 py-3 text-center font-bold text-zinc-950">{busy?"업로드 중...":"사진 선택·업로드"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{void uploadImage(e.target.files?.[0]??null);e.currentTarget.value=""}} className="hidden"/></label></div>}
    </article></div>}

    <article className="rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.035] p-5 sm:p-7">
      <p className="text-sm font-semibold tracking-[.2em] text-emerald-300">HOW TO PLAY VIDEO</p><h2 className="mt-2 text-2xl font-bold">게임 설명·참고 영상</h2><p className="mt-2 text-sm text-zinc-500">유튜브 영상을 여러 개 등록할 수 있습니다. 참고 영상과 직접 만든 영상을 함께 모아보세요.</p>
      {videos.length?<div className="mt-5 grid gap-5 lg:grid-cols-2">{videos.map(row=><div key={row.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/10"><div className="aspect-video"><iframe src={`https://www.youtube-nocookie.com/embed/${row.youtube_id}`} title={row.title} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen/></div><div className="p-4"><h3 className="font-bold">{row.title}</h3>{isAdmin&&<div className="mt-2 flex gap-3"><button onClick={()=>editVideo(row)} className="text-xs text-zinc-400">수정</button><button onClick={()=>removeVideo(row.id)} className="text-xs text-red-300">삭제</button></div>}</div></div>)}</div>:<p className="mt-5 text-sm text-zinc-600">등록된 설명 영상이 없습니다.</p>}
      {isAdmin&&<form onSubmit={addVideo} className="mt-5 grid gap-2 lg:grid-cols-[220px_1fr_auto]"><input value={videoTitle} onChange={e=>setVideoTitle(e.target.value)} maxLength={100} placeholder="영상 제목" className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-3"/><input value={videoUrl} onChange={e=>setVideoUrl(e.target.value)} placeholder="유튜브 영상 주소" className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-3"/><button disabled={busy} className="rounded-xl bg-emerald-400 px-5 font-bold text-zinc-950">영상 추가</button></form>}
    </article>
    {selectedImage&&<div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4" onClick={()=>setSelectedImage(null)}><button className="absolute right-5 top-5 h-12 w-12 rounded-full bg-white/10 text-2xl">×</button><img src={selectedImage} alt="확대된 오거나이저 사진" className="max-h-[90vh] max-w-full object-contain"/></div>}
  </section>;
}
