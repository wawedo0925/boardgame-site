"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Interest = { game_id: string; name: string; count: number; registered: boolean; members: { user_id: string; name: string }[] };
export default function BoardgameLearning({ gameId }: { gameId?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [rows, setRows] = useState<Interest[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(gameId));
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fetchData = useCallback(async () => {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return { userId: null, rows: [] as Interest[] };
    const { data, error } = await supabase.rpc("boardgame_learning_overview", { p_game_id: gameId ?? null });
    if (error) throw error;
    return { userId: auth.user.id, rows: (data ?? []) as Interest[] };
  }, [supabase, gameId]);
  useEffect(() => {
    if (!gameId) return;
    let active = true;
    void fetchData().then(result => { if (active) { setUserId(result.userId); setRows(result.rows); setLoading(false); } }, () => { if (active) { setError("배움 희망을 불러오지 못했습니다."); setLoading(false); } });
    return () => { active = false; };
  }, [fetchData, gameId]);
  async function refresh() {
    setLoading(true); setError("");
    try { const result = await fetchData(); setUserId(result.userId); setRows(result.rows); }
    catch { setRows([]); setError("배움 희망을 불러오지 못했습니다. 다시 시도해 주세요."); }
    finally { setLoading(false); }
  }
  async function toggle(row: Interest) {
    if (!userId || lock.current) return;
    lock.current = true; setSaving(row.game_id); setError("");
    try {
      const result = row.registered
        ? await supabase.from("boardgame_learning_interests").delete().eq("game_id", row.game_id).eq("user_id", userId)
        : await supabase.from("boardgame_learning_interests").insert({ game_id: row.game_id, user_id: userId });
      if (result.error && result.error.code !== "23505") throw result.error;
      await refresh();
    } catch { setError("등록·취소 결과를 확인하지 못했습니다. 현황을 새로고침해 주세요."); }
    finally { lock.current = false; setSaving(null); }
  }
  const content = <div aria-busy={loading || Boolean(saving)}>
    {error && <p role="alert" className="mb-3 text-sm text-red-300">{error}</p>}
    {loading ? <p role="status" className="py-5 text-zinc-400">불러오는 중...</p> : error ? null : !userId ? <Link href="/login" className="inline-flex min-h-11 items-center rounded-xl bg-amber-400 px-4 font-bold text-black">로그인하고 배움 희망 보기</Link> : !rows.length ? <p className="py-5 text-zinc-400">아직 배움 희망이 등록된 게임이 없습니다. 게임 상세 페이지에서 등록해 주세요.</p> : <ul className="space-y-4">{rows.map(row => <li key={row.game_id} className={gameId ? "" : "rounded-2xl border border-white/10 p-4"}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div>{!gameId && <Link className="font-bold underline decoration-white/20 underline-offset-4" href={`/boardgames/${row.game_id}`}>{row.name}</Link>}<p className="mt-1 font-bold text-amber-300">배움 희망 {row.count}명</p></div>
        <button disabled={Boolean(saving) || loading} aria-pressed={row.registered} onClick={() => void toggle(row)} className={`min-h-11 rounded-xl px-4 text-sm font-bold disabled:opacity-40 ${row.registered ? "border border-amber-400/50 text-amber-300" : "bg-amber-400 text-black"}`}>{saving === row.game_id ? "처리 중..." : row.registered ? "✓ 배움 희망 · 취소" : "배움 희망"}</button>
      </div>
      {!!row.members.length && <details className="mt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm text-zinc-400">배움 희망 멤버 보기 ({row.count}명)</summary><div className="flex flex-wrap gap-2">{row.members.map(m => <span key={m.user_id} className="rounded-lg bg-white/10 px-3 py-2 text-sm">{m.name}</span>)}</div></details>}
    </li>)}</ul>}
  </div>;
  if (gameId) return <section className="mt-8 rounded-3xl border border-amber-400/20 bg-amber-400/5 p-5 sm:p-7">
    <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-xl font-bold">이 게임을 배우고 싶어요</h2><button disabled={loading || Boolean(saving)} onClick={() => void refresh()} className="min-h-11 px-3 text-sm text-zinc-400">새로고침</button></div>
    <p className="mb-4 text-sm leading-6 text-zinc-400">배움 희망을 등록하면 다른 멤버들이 현황을 볼 수 있어요. 이후 새로 플레이한 결과가 저장되면 자동으로 해제돼요. 해본 게임도 언제든 다시 등록하거나 취소할 수 있어요.</p>{content}
  </section>;
  return <>
    <button onClick={() => { dialog.current?.showModal(); void refresh(); }} className="min-h-11 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-black">배움 희망 현황</button>
    <dialog ref={dialog} aria-labelledby="learning-overview-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-zinc-950 p-5 text-white backdrop:bg-black/75 sm:p-7">
      <div className="mb-5 flex items-start justify-between gap-3"><div><h2 id="learning-overview-title" className="text-xl font-bold">배움 희망 현황</h2><p className="mt-2 text-sm text-zinc-400">검색·페이지와 관계없이 전체 게임을 희망자가 많은 순으로 보여드려요.</p></div><button aria-label="닫기" onClick={() => dialog.current?.close()} className="min-h-11 min-w-11 rounded-full bg-white/10 text-xl">×</button></div>
      <button disabled={loading || Boolean(saving)} onClick={() => void refresh()} className="mb-4 min-h-11 rounded-xl border border-white/15 px-4 text-sm">새로고침</button>{content}
    </dialog>
  </>;
}
