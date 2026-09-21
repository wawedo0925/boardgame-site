"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Inquiry={id:string;user_id:string;author_name:string;is_anonymous:boolean;body:string;status:"RECEIVED"|"ANSWERED"|"CHECKED";reply:string|null;created_at:string;handled_at:string|null};
const statusLabel={RECEIVED:"접수됨",ANSWERED:"답변 완료",CHECKED:"확인 완료"};
const date=(value:string)=>new Date(value).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
const button="min-h-11 rounded-xl border border-white/15 px-4 py-2 text-sm font-bold disabled:opacity-40";
const input="mt-3 w-full resize-y rounded-xl border border-white/15 bg-zinc-900 p-4 text-base leading-7 text-white";
export default function InquiryBoard({userId,admin=false}:{userId:string;admin?:boolean}) {
 const supabase=useMemo(()=>createClient(),[]);
 const [rows,setRows]=useState<Inquiry[]>([]),[loading,setLoading]=useState(true),[more,setMore]=useState(false);
 const [error,setError]=useState(""),[dialogError,setDialogError]=useState(""),[busy,setBusy]=useState(false);
 const [selected,setSelected]=useState<Inquiry|null>(null),[body,setBody]=useState(""),[anonymous,setAnonymous]=useState(true),[reply,setReply]=useState("");
 const dialog=useRef<HTMLDialogElement>(null),lock=useRef(false),requestId=useRef<string|null>(null);
 const fetchRows=useCallback(async(offset=0)=>{
     let query=supabase.from("member_inquiries").select("id,user_id,author_name,is_anonymous,body,status,reply,created_at,handled_at").order("created_at",{ascending:false}).order("id").range(offset,offset+29);
     if(!admin)query=query.eq("user_id",userId);
     const {data,error}=await query;if(error)throw error;
     return (data??[]) as Inquiry[];
 },[supabase,userId,admin]);
 async function load(offset=0){
   setLoading(true);setError("");
   try {
     const next=await fetchRows(offset);setRows(current=>offset?[...current,...next]:next);setMore(next.length===30);
   } catch {setError("문의/제보 목록을 불러오지 못했습니다. 새로고침해 주세요.");}
   finally {setLoading(false);}
 }
 useEffect(()=>{let active=true;void fetchRows().then(next=>{if(active){setRows(next);setMore(next.length===30);setLoading(false);}},()=>{if(active){setError("문의/제보 목록을 불러오지 못했습니다. 새로고침해 주세요.");setLoading(false);}});return()=>{active=false;};},[fetchRows]);
 function open(item:Inquiry|null){
   setSelected(item);setReply(item?.reply??"");setDialogError("");
   if(!item){setBody("");setAnonymous(true);requestId.current=crypto.randomUUID();}
   dialog.current?.showModal();
 }
 async function send(status?:"ANSWERED"|"CHECKED"){
   if(lock.current)return;lock.current=true;setBusy(true);setDialogError("");
   try {
     const result=selected&&admin
       ? await supabase.rpc("handle_member_inquiry",{p_id:selected.id,p_status:status,p_reply:status==="ANSWERED"?reply:null})
       : await supabase.rpc("submit_member_inquiry",{p_id:requestId.current,p_body:body,p_anonymous:anonymous});
     if(result.error)throw result.error;
     dialog.current?.close();await load();
   } catch(err){setDialogError(err&&typeof err==="object"&&"message" in err?String(err.message):"저장하지 못했습니다. 다시 시도해 주세요.");}
   finally {lock.current=false;setBusy(false);}
 }
 return <main className="min-h-screen bg-[#08090b] px-5 py-12 text-white"><div className="mx-auto max-w-3xl">
   <Link href={admin?"/admin":"/mypage"} className="text-sm text-zinc-400">← {admin?"관리자 페이지":"마이페이지"}</Link>
   <div className="mt-6 flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-bold">{admin?"문의/제보 관리":"내 문의/제보"}</h1>{!admin&&<button className={`${button} bg-amber-400 text-black`} onClick={()=>open(null)}>문의/제보하기</button>}</div>
   <p className="mt-4 text-sm leading-6 text-zinc-400">{admin?"익명 선택 여부와 관계없이 작성자를 확인하고 답변하거나 확인 완료로 처리할 수 있습니다.":"내가 보낸 내용과 관리자 답변을 확인할 수 있어요. 다른 멤버에게는 공개되지 않아요."}</p>
   <button disabled={loading} className={`${button} mt-5`} onClick={()=>void load()}>새로고침</button>
   {error&&<p role="alert" className="mt-4 text-red-300">{error}</p>}
   {!loading&&!error&&!rows.length&&<p className="mt-8 rounded-2xl border border-dashed border-white/15 p-8 text-center text-zinc-400">아직 문의/제보가 없습니다.</p>}
   <ul className="mt-6 space-y-3">{rows.map(item=><li key={item.id}><button onClick={()=>open(item)} className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left hover:border-amber-400/40"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-zinc-400">{item.is_anonymous?"익명":"활동명 제보"}{admin?` · ${item.author_name}`:""}</span><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.status==="RECEIVED"?"bg-amber-400/10 text-amber-300":"bg-emerald-400/10 text-emerald-300"}`}>{statusLabel[item.status]}</span></div><p className="mt-3 line-clamp-2 break-words font-semibold">{item.body}</p><time className="mt-3 block text-xs text-zinc-500">{date(item.created_at)}</time></button></li>)}</ul>
   {loading&&<p role="status" className="mt-6 text-zinc-400">불러오는 중...</p>}{more&&!error&&<button disabled={loading} onClick={()=>void load(rows.length)} className={`${button} mt-5 w-full`}>더 보기</button>}
   <dialog ref={dialog} onCancel={event=>{if(busy)event.preventDefault();}} aria-labelledby="inquiry-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl border border-white/15 bg-zinc-950 p-5 text-white backdrop:bg-black/80 sm:p-7">
     <div className="flex items-center justify-between gap-3"><h2 id="inquiry-title" className="text-xl font-bold">{selected?"문의/제보 내용":"문의/제보하기"}</h2><button disabled={busy} className={button} onClick={()=>dialog.current?.close()}>닫기</button></div>
     {selected?<>
       <p className="mt-4 text-sm text-zinc-400">{selected.is_anonymous?"익명":"활동명 제보"}{admin?` · 작성자 ${selected.author_name}`:""} · {date(selected.created_at)}</p>
       <p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-white/5 p-4 leading-7">{selected.body}</p>
       <p className="mt-5 font-bold text-emerald-300">{statusLabel[selected.status]}</p>
       {selected.reply&&<div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4"><h3 className="font-bold text-amber-300">관리자 답변</h3><p className="mt-2 whitespace-pre-wrap break-words leading-7">{selected.reply}</p></div>}
       {selected.status==="CHECKED"&&<p className="mt-3 text-sm text-zinc-400">관리자가 내용을 확인했습니다.</p>}
       {selected.handled_at&&<p className="mt-2 text-xs text-zinc-500">처리 일시 · {date(selected.handled_at)}</p>}
       {admin&&<form onSubmit={e=>{e.preventDefault();void send("ANSWERED");}} className="mt-6 border-t border-white/10 pt-5"><label className="font-semibold">답변<textarea className={input} rows={5} required maxLength={5000} value={reply} disabled={busy} onChange={e=>setReply(e.target.value)} /></label><div className="mt-4 flex flex-wrap gap-3"><button disabled={busy||!reply.trim()} className={`${button} bg-amber-400 text-black`}>{busy?"처리 중...":"답변 저장"}</button>{selected.status!=="ANSWERED"&&<button type="button" disabled={busy} className={button} onClick={()=>void send("CHECKED")}>답변 없이 확인 완료</button>}</div></form>}
     </>:<form onSubmit={e=>{e.preventDefault();void send();}}>
       <fieldset disabled={busy} className="mt-5"><legend className="text-sm font-semibold">제보 방식</legend><div className="mt-3 grid grid-cols-2 gap-3">{[true,false].map(value=><label key={String(value)} className={`${button} flex cursor-pointer items-center justify-center gap-2 ${anonymous===value?"border-amber-400 bg-amber-400/10 text-amber-300":""}`}><input type="radio" name="inquiry-mode" checked={anonymous===value} onChange={()=>setAnonymous(value)} />{value?"익명":"활동명 제보"}</label>)}</div></fieldset>
       <p className="mt-4 text-sm leading-6 text-zinc-400">다른 멤버에게는 공개되지 않으며, 익명으로 보내도 메인 관리자는 작성자를 확인할 수 있습니다.</p>
       {!anonymous&&<p className="mt-3 text-sm text-amber-300">카톡 1대1 문의가 더 빠른 답변을 받을 수 있습니다.</p>}
       <label className="mt-5 block font-semibold">문의/제보 내용<textarea autoFocus className={input} rows={7} required maxLength={5000} value={body} disabled={busy} onChange={e=>setBody(e.target.value)} placeholder="문의하거나 제보할 내용을 적어 주세요." /></label><p className="text-right text-xs text-zinc-500">{body.length.toLocaleString()} / 5,000</p>
       <button disabled={busy||!body.trim()} className={`${button} mt-5 w-full bg-amber-400 text-black`}>{busy?"보내는 중...":"보내기"}</button>
     </form>}
     {dialogError&&<p role="alert" className="mt-4 text-sm text-red-300">{dialogError}</p>}
   </dialog>
 </div></main>;
}
