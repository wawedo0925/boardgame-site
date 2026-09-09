"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import UnownedBadge from "@/components/UnownedBadge";
import type { MurderMystery } from "./page";

type Interest = { murder_mystery_id: string; user_id: string };

export default function InterestOverview({ mysteries, onCountsChanged }: {
  mysteries: MurderMystery[];
  onCountsChanged: (counts: Record<string, number>) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [interests, setInterests] = useState<Interest[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [played, setPlayed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const counts = interests.reduce<Record<string, number>>((result, row) => {
    result[row.murder_mystery_id] = (result[row.murder_mystery_id] ?? 0) + 1;
    return result;
  }, {});
  const ranked = mysteries.filter(item => counts[item.id] > 0)
    .sort((a, b) => counts[b.id] - counts[a.id] || a.title.localeCompare(b.title, "ko"));

  async function load() {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) throw new Error("로그인 후 플레이 희망 현황을 확인할 수 있습니다.");
    setUserId(auth.user.id);
    const rows: Interest[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("murder_mystery_interests")
        .select("murder_mystery_id,user_id").order("murder_mystery_id").order("user_id").range(offset, offset + 999);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const [history, personal] = await Promise.all([
      supabase.from("murder_mystery_history").select("murder_mystery_id").eq("user_id", auth.user.id),
      supabase.from("murder_mystery_personal_records").select("murder_mystery_id").eq("user_id", auth.user.id),
    ]);
    if (history.error) throw history.error;
    if (personal.error) throw personal.error;
    setPlayed(new Set([...history.data, ...personal.data].map(row => row.murder_mystery_id)));
    setInterests(rows);
    onCountsChanged(rows.reduce<Record<string, number>>((result, row) => {
      result[row.murder_mystery_id] = (result[row.murder_mystery_id] ?? 0) + 1;
      return result;
    }, {}));
  }

  async function open() {
    dialog.current?.showModal();
    setLoading(true);
    setError("");
    try { await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "현황을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    finally { setLoading(false); }
  }

  async function register(id: string) {
    if (!userId) { router.push("/login"); return; }
    if (saving || played.has(id) || interests.some(row => row.murder_mystery_id === id && row.user_id === userId)) return;
    setSaving(id);
    setError("");
    try {
      const { error } = await supabase.from("murder_mystery_interests").insert({ murder_mystery_id: id, user_id: userId });
      if (error && error.code !== "23505") throw error;
      await load();
      router.refresh();
    } catch {
      setError("희망 등록 결과를 확인하지 못했습니다. 이미 플레이한 작품인지 확인하거나 현황을 다시 불러와주세요.");
    } finally { setSaving(null); }
  }

  return <>
    <button type="button" onClick={() => void open()} className="min-h-11 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-zinc-950 hover:bg-amber-300">플레이 희망 현황</button>
    <dialog ref={dialog} aria-labelledby="interest-overview-title" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-zinc-950 p-0 text-white shadow-2xl backdrop:bg-black/75">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-zinc-950 p-5 sm:p-6">
        <div><h2 id="interest-overview-title" className="text-xl font-bold">플레이 희망 현황</h2><p className="mt-2 text-sm text-zinc-400">희망자가 있는 작품을 인원 많은 순으로 보여드립니다.</p></div>
        <button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="닫기" className="min-h-11 min-w-11 shrink-0 rounded-full bg-white/10 text-xl">×</button>
      </div>
      <div className="p-5 sm:p-6" aria-busy={loading || Boolean(saving)}>
        {error && <div role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}<div className="mt-3 flex gap-3"><button type="button" disabled={loading || Boolean(saving)} onClick={() => void open()} className="underline">다시 불러오기</button>{!userId && <Link href="/login">로그인</Link>}</div></div>}
        {loading ? <p role="status" className="py-12 text-center text-zinc-400">희망 현황을 불러오는 중…</p> : !error && !ranked.length ? <p className="py-12 text-center text-zinc-400">아직 플레이 희망이 등록된 작품이 없습니다.</p> : <ul className="space-y-3">
          {ranked.map(item => {
            const registered = interests.some(row => row.murder_mystery_id === item.id && row.user_id === userId);
            return <li key={item.id} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><h3 className="break-words font-bold">{item.title}<UnownedBadge isUnowned={item.is_unowned} /></h3><p className="mt-2 text-sm font-bold text-amber-300">희망자 {counts[item.id]}명</p></div>
              <div className="flex shrink-0 gap-2">
                <button type="button" disabled={Boolean(saving) || registered || played.has(item.id)} onClick={() => void register(item.id)} className="min-h-11 flex-1 rounded-xl bg-amber-400 px-4 text-sm font-bold text-zinc-950 disabled:bg-white/10 disabled:text-zinc-400 sm:flex-none">{saving === item.id ? "등록 중…" : registered ? "희망 등록 완료" : played.has(item.id) ? "플레이 완료" : "희망 등록"}</button>
                <Link href={`/murder-mystery/${item.id}`} className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-white/20 px-4 text-sm font-bold hover:bg-white/10 sm:flex-none">상세 페이지</Link>
              </div>
            </li>;
          })}
        </ul>}
      </div>
    </dialog>
  </>;
}
