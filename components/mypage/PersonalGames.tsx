"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { favoriteGames } from "@/lib/favorite-games";

type Game = { id: string; name: string };
type Note = { id: string; game_id: string | null; custom_name: string | null; memo: string; rules: string; tips: string };
type Review = { game_id: string; rating: number; created_at: string; games: Game | Game[] | null };
type Item = { key: string; gameId: string | null; name: string; rating?: number; note?: Note };
const message = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "저장하지 못했습니다. 다시 시도해 주세요.";

export default function PersonalGames({ userId, kind }: { userId: string; kind: "FAVORITE" | "GM" }) {
  const supabase = useMemo(() => createClient(), []);
  const [games, setGames] = useState<Game[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [customName, setCustomName] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [catalog, saved, ratings] = await Promise.all([
          supabase.from("games").select("id,name").order("name").limit(1000),
          supabase.from("personal_game_notes").select("id,game_id,custom_name,memo,rules,tips").eq("user_id", userId).eq("kind", kind),
          kind === "FAVORITE" ? supabase.from("game_reviews").select("game_id,rating,created_at,games(id,name)").eq("user_id", userId).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
        ]);
        if (catalog.error || saved.error || ratings.error) throw catalog.error || saved.error || ratings.error;
        if (!cancelled) { setGames(catalog.data ?? []); setNotes(saved.data ?? []); setReviews((ratings.data ?? []) as Review[]); }
      } catch (e) { if (!cancelled) setError(message(e)); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [kind, supabase, userId]);

  const items: Item[] = kind === "FAVORITE"
    ? favoriteGames(reviews).map(review => ({ key: review.game_id, gameId: review.game_id, name: (Array.isArray(review.games) ? review.games[0] : review.games)?.name ?? "삭제된 게임", rating: review.rating, note: notes.find(note => note.game_id === review.game_id) }))
    : notes.map(note => ({ key: note.id, gameId: note.game_id, name: games.find(game => game.id === note.game_id)?.name ?? note.custom_name ?? "게임", note })).sort((a, b) => a.name.localeCompare(b.name, "ko"));

  async function add(game: Game | null) {
    const name = (game?.name ?? customName).trim();
    if (!name || busy) return;
    if (notes.some(note => game ? note.game_id === game.id : note.custom_name === name)) { setError("이미 등록한 게임입니다."); return; }
    setBusy(true); setError("");
    try {
      const { data, error } = await supabase.from("personal_game_notes").insert({ user_id: userId, kind: "GM", game_id: game?.id ?? null, custom_name: game ? null : name }).select("id,game_id,custom_name,memo,rules,tips").single();
      if (error) throw error;
      setNotes(current => [...current, data]); setCustomName(""); setQuery(""); setAdding(false);
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }

  async function save(item: Item, values: { memo: string; rules: string; tips: string }) {
    const { data, error } = await supabase.from("personal_game_notes").upsert({ ...(item.note ? { id: item.note.id } : {}), user_id: userId, kind, game_id: item.gameId, custom_name: item.gameId ? null : item.name, ...values, updated_at: new Date().toISOString() }, { onConflict: item.gameId ? "user_id,kind,game_id" : "id" }).select("id,game_id,custom_name,memo,rules,tips").single();
    if (error) throw error;
    setNotes(current => [...current.filter(note => note.id !== data.id), data]);
  }

  async function remove(item: Item) {
    if (!item.note || !confirm(`“${item.name}”을 GM 가능 목록에서 삭제할까요? 저장한 메모와 룰·팁도 삭제됩니다.`)) return;
    const { error } = await supabase.from("personal_game_notes").delete().eq("id", item.note.id).eq("user_id", userId);
    if (error) throw error;
    setNotes(current => current.filter(note => note.id !== item.note?.id));
  }

  if (loading) return <p className="py-10 text-center text-zinc-400">목록을 불러오는 중...</p>;
  const matches = games.filter(game => game.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && !notes.some(note => note.game_id === game.id));
  return <div>
    <p className="text-sm leading-6 text-zinc-400">{kind === "FAVORITE" ? "게임별 가장 최근 내 평가가 4점 이상인 목록입니다. 5점 게임이 먼저 표시됩니다." : "내가 보유하고 GM 진행이 가능한 게임을 등록해 보세요."} 메모는 나에게만 보입니다.</p>
    {error && <p role="alert" className="my-3 text-sm text-red-300">{error}</p>}
    {kind === "GM" && <><button onClick={() => setAdding(!adding)} className="mt-4 min-h-11 rounded-xl bg-amber-400 px-5 font-bold text-zinc-950">{adding ? "등록 닫기" : "+ 보드게임 등록"}</button>
      {adding && <div className="mt-4 space-y-3 rounded-2xl border border-white/15 p-4">
        <label className="block text-sm">등록된 보드게임 검색<input value={query} onChange={e => setQuery(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-zinc-900 px-3" placeholder="게임 이름 검색"/></label>
        <div className="max-h-56 overflow-y-auto">{matches.slice(0, 50).map(game => <button key={game.id} disabled={busy} onClick={() => void add(game)} className="flex min-h-11 w-full items-center justify-between border-b border-white/5 px-2 text-left text-sm hover:bg-white/5"><span>{game.name}</span><span className="text-amber-300">추가</span></button>)}{!matches.length && <p className="py-3 text-sm text-zinc-400">검색 결과가 없습니다. 아래에서 직접 등록할 수 있어요.</p>}</div>
        <form onSubmit={e => { e.preventDefault(); void add(null); }} className="border-t border-white/10 pt-3"><label className="block text-sm">목록에 없는 게임 직접 등록<input maxLength={150} value={customName} onChange={e => setCustomName(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-zinc-900 px-3" placeholder="보유 게임 이름"/></label><button disabled={busy || !customName.trim()} className="mt-2 min-h-11 rounded-xl bg-white/10 px-4 disabled:opacity-40">직접 등록</button></form>
      </div>}
    </>}
    <p className="mt-5 text-sm text-zinc-500">총 {items.length}개</p>
    <div className="mt-3 space-y-3">{items.map(item => <NoteCard key={item.key} item={item} kind={kind} onSave={values => save(item, values)} onRemove={() => remove(item)}/>)}
      {!items.length && !error && <p className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-zinc-400">{kind === "FAVORITE" ? "아직 4점 이상 평가한 게임이 없습니다." : "등록한 게임이 없습니다. 위 버튼으로 추가해 보세요."}</p>}
    </div>
  </div>;
}

function NoteCard({ item, kind, onSave, onRemove }: { item: Item; kind: string; onSave: (values: { memo: string; rules: string; tips: string }) => Promise<void>; onRemove: () => Promise<void> }) {
  const [memo, setMemo] = useState(item.note?.memo ?? "");
  const [rules, setRules] = useState(item.note?.rules ?? "");
  const [tips, setTips] = useState(item.note?.tips ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function action(remove = false) {
    setBusy(true); setStatus("");
    try { if (remove) await onRemove(); else { await onSave({ memo, rules, tips }); setStatus("저장했습니다."); } }
    catch (e) { setStatus(message(e)); } finally { setBusy(false); }
  }
  return <details className={`rounded-2xl border p-4 ${item.rating === 5 ? "border-amber-400/40 bg-amber-400/5" : "border-white/10 bg-white/[0.02]"}`}>
    <summary className="cursor-pointer text-base font-bold"><span>{item.name}</span>{item.rating && <span className="ml-3 whitespace-nowrap text-sm text-amber-300">{"★".repeat(item.rating)} {item.rating}점</span>}<span className="ml-2 text-xs font-normal text-zinc-400">메모 보기·수정</span></summary>
    {item.note?.memo && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-400">{item.note.memo}</p>}
    <form onSubmit={e => { e.preventDefault(); void action(); }} className="mt-4 space-y-4">
      {([{ label: "개인 메모", value: memo, set: setMemo }, ...(kind === "GM" ? [{ label: "놓치기 쉬운 룰", value: rules, set: setRules }, { label: "플레이 팁", value: tips, set: setTips }] : [])]).map(field => <label key={field.label} className="block text-sm font-medium">{field.label}<textarea maxLength={10000} disabled={busy} rows={3} value={field.value} onChange={e => { field.set(e.target.value); setStatus(""); }} className="mt-2 w-full resize-y rounded-xl border border-white/15 bg-zinc-900 p-3 font-normal"/></label>)}
      <div className="flex gap-2"><button disabled={busy} className="min-h-11 rounded-xl bg-amber-400 px-5 font-bold text-zinc-950 disabled:opacity-50">{busy ? "처리 중..." : "메모 저장"}</button>{kind === "GM" && <button type="button" disabled={busy} onClick={() => void action(true)} className="min-h-11 rounded-xl border border-red-400/30 px-4 text-red-300">목록에서 삭제</button>}</div>
      {status && <p role="status" className="text-sm text-amber-200">{status}</p>}
    </form>
  </details>;
}
