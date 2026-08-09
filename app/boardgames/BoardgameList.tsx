"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Game = {
  id: string; name: string; type: string | null; min_players: number | null; max_players: number | null;
  best_players: string | null; play_time: number | null; difficulty: number | null; genre: string | null;
  weight: number | null; publisher: string | null; icon: string | null; min_age: number | null;
  year_published: number | null; bgg_url: string | null; description: string | null; thumbnail: string | null;
};

const empty = (game: Game) => ({ ...game });
const numberOrNull = (value: string) => value.trim() === "" ? null : Number(value);

export default function BoardgameList({ boardgames, isAdmin }: { boardgames: Game[]; isAdmin: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState(boardgames);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [editing, setEditing] = useState<Game | null>(null);
  const [coverGame, setCoverGame] = useState<Game | null>(null);
  const [busy, setBusy] = useState(false);

  const genres = useMemo(() => [...new Set(items.map((g) => g.genre?.trim()).filter(Boolean) as string[])].sort((a,b) => a.localeCompare(b,"ko")), [items]);
  const shown = useMemo(() => items.filter((g) => {
    const text = `${g.name} ${g.publisher ?? ""} ${g.genre ?? ""}`.toLocaleLowerCase();
    return text.includes(query.trim().toLocaleLowerCase()) && (!genre || g.genre === genre);
  }).sort((a,b) => a.name.localeCompare(b.name,"ko")), [items, query, genre]);

  async function uploadCover(file?: File) {
    if (!file || !coverGame) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return alert("JPG, PNG, WEBP 이미지만 가능합니다.");
    if (file.size > 10 * 1024 * 1024) return alert("이미지는 10MB 이하여야 합니다.");
    setBusy(true);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${coverGame.id}/cover-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("boardgame-covers").upload(path, file, { upsert: true });
    if (uploadError) { setBusy(false); return alert(`표지 업로드 실패: ${uploadError.message}`); }
    const { data } = supabase.storage.from("boardgame-covers").getPublicUrl(path);
    const { error } = await supabase.from("games").update({ thumbnail: data.publicUrl }).eq("id", coverGame.id);
    setBusy(false);
    if (error) return alert(`표지 저장 실패: ${error.message}`);
    setItems((old) => old.map((g) => g.id === coverGame.id ? { ...g, thumbnail: data.publicUrl } : g));
    setCoverGame(null);
  }

  async function save() {
    if (!editing?.name.trim()) return alert("게임 이름을 입력해 주세요.");
    if (editing.min_players && editing.max_players && editing.min_players > editing.max_players) return alert("최소 인원은 최대 인원보다 클 수 없습니다.");
    setBusy(true);
    const { id, ...payload } = { ...editing, name: editing.name.trim(), genre: editing.genre?.trim() || null };
    const { error } = await supabase.from("games").update(payload).eq("id", id);
    setBusy(false);
    if (error) return alert(`정보 저장 실패: ${error.message}`);
    setItems((old) => old.map((g) => g.id === id ? { ...payload, id } : g));
    setEditing(null);
  }

  async function remove(game: Game) {
    if (!confirm(`‘${game.name}’을 영구 삭제할까요?\n플레이 기록이 연결되어 있으면 삭제되지 않을 수 있습니다.`)) return;
    const { error } = await supabase.from("games").delete().eq("id", game.id);
    if (error) return alert(`삭제 실패: ${error.message}`);
    setItems((old) => old.filter((g) => g.id !== game.id));
  }

  return <>
    <div className="mb-8 grid gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-4 md:grid-cols-[1fr_260px]">
      <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="게임 이름 또는 출판사 검색" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none" />
      <select value={genre} onChange={(e)=>setGenre(e.target.value)} className="rounded-xl border border-white/10 bg-[#17181c] px-4 py-3">
        <option value="">전체 장르</option>{genres.map((value)=><option key={value}>{value}</option>)}
      </select>
    </div>
    <p className="mb-5 text-sm text-slate-400">총 <b className="text-amber-400">{shown.length}</b>개의 게임</p>
    <div className="overflow-hidden rounded-2xl border border-white/10">
      {shown.map((game) => <article key={game.id} className="grid gap-5 border-b border-white/10 p-5 last:border-0 md:grid-cols-[100px_1fr_auto] md:items-center">
        <Link href={`/boardgames/${game.id}`} className="block h-24 w-20 overflow-hidden rounded-xl border border-white/10 bg-amber-400/10">
          {game.thumbnail ? <img src={game.thumbnail} alt={game.name} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-3xl">🎲</span>}
        </Link>
        <div>
          <Link href={`/boardgames/${game.id}`} className="text-xl font-black hover:text-amber-400">{game.name}</Link>
          <p className="mt-2 text-sm text-slate-400">{game.genre || "장르 미정"} · {game.min_players ?? "—"}~{game.max_players ?? "—"}명 · {game.play_time ? `${game.play_time}분` : "시간 미정"}</p>
          <p className="mt-1 text-xs text-slate-500">{game.publisher || "출판사 미정"}</p>
        </div>
        {isAdmin && <div className="flex flex-wrap gap-2 md:max-w-[250px] md:justify-end">
          <button onClick={()=>{setCoverGame(game); setTimeout(()=>inputRef.current?.click(),0)}} className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-bold text-black">표지 교체</button>
          <button onClick={()=>setEditing(empty(game))} className="rounded-lg border border-amber-400/60 px-3 py-2 text-sm font-bold text-amber-300">정보 수정</button>
          <button onClick={()=>remove(game)} className="rounded-lg border border-red-500/50 px-3 py-2 text-sm font-bold text-red-400">삭제</button>
        </div>}
      </article>)}
    </div>
    <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>uploadCover(e.target.files?.[0])} />
    {busy && <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70"><div className="rounded-xl bg-white px-6 py-4 font-bold text-black">저장 중...</div></div>}
    {editing && <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/80 p-4" onMouseDown={()=>setEditing(null)}><div className="mx-auto my-8 max-w-3xl rounded-2xl border border-white/15 bg-[#111216] p-6" onMouseDown={(e)=>e.stopPropagation()}>
      <div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-black">보드게임 정보 수정</h2><button onClick={()=>setEditing(null)}>✕</button></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="게임 이름" value={editing.name} onChange={(v)=>setEditing({...editing,name:v})}/>
        <Field label="장르 (새 장르 직접 입력 가능)" value={editing.genre ?? ""} onChange={(v)=>setEditing({...editing,genre:v})}/>
        <Field label="결과 형식 (SCORE/SIMPLE_SCORE/ROLE/COOP)" value={editing.type ?? ""} onChange={(v)=>setEditing({...editing,type:v})}/>
        <Field label="출판사" value={editing.publisher ?? ""} onChange={(v)=>setEditing({...editing,publisher:v})}/>
        <Num label="최소 인원" value={editing.min_players} onChange={(v)=>setEditing({...editing,min_players:v})}/>
        <Num label="최대 인원" value={editing.max_players} onChange={(v)=>setEditing({...editing,max_players:v})}/>
        <Field label="베스트 인원" value={editing.best_players ?? ""} onChange={(v)=>setEditing({...editing,best_players:v})}/>
        <Num label="플레이 시간(분)" value={editing.play_time} onChange={(v)=>setEditing({...editing,play_time:v})}/>
        <Num label="난이도(1~5)" value={editing.difficulty} onChange={(v)=>setEditing({...editing,difficulty:v})}/>
        <Num label="BGG 웨이트" value={editing.weight} onChange={(v)=>setEditing({...editing,weight:v})}/>
        <Field label="아이콘" value={editing.icon ?? ""} onChange={(v)=>setEditing({...editing,icon:v})}/>
        <Num label="권장 나이" value={editing.min_age} onChange={(v)=>setEditing({...editing,min_age:v})}/>
        <Num label="출시 연도" value={editing.year_published} onChange={(v)=>setEditing({...editing,year_published:v})}/>
        <Field label="BGG 주소" value={editing.bgg_url ?? ""} onChange={(v)=>setEditing({...editing,bgg_url:v})}/>
      </div>
      <label className="mt-4 block text-sm font-bold">설명<textarea value={editing.description ?? ""} onChange={(e)=>setEditing({...editing,description:e.target.value})} rows={6} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 p-3 font-normal outline-none"/></label>
      <button onClick={save} className="mt-6 w-full rounded-xl bg-violet-500 py-3 font-black">수정사항 저장</button>
    </div></div>}
  </>;
}

function Field({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}) { return <label className="text-sm font-bold">{label}<input value={value} onChange={(e)=>onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 font-normal outline-none"/></label> }
function Num({label,value,onChange}:{label:string;value:number|null;onChange:(v:number|null)=>void}) { return <label className="text-sm font-bold">{label}<input type="number" value={value ?? ""} onChange={(e)=>onChange(numberOrNull(e.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 font-normal outline-none"/></label> }
