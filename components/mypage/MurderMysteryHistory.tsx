"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mystery = { id: string; title: string };
type RecordRow = {
  id: string; murder_mystery_id: string | null; custom_title: string | null;
  participation_role: "PLAYER" | "GM"; rating: number | null;
  private_memo: string | null; played_at: string;
  source: "MANUAL" | "EVENT" | "LEGACY"; event_id: string | null;
};

export default function MurderMysteryHistory() {
  const supabase = useMemo(() => createClient(), []);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [mysteries, setMysteries] = useState<Mystery[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [mode, setMode] = useState<"LIST" | "CUSTOM">("LIST");
  const [mysteryId, setMysteryId] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [role, setRole] = useState<"PLAYER" | "GM">("PLAYER");
  const [rating, setRating] = useState("");
  const [memo, setMemo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [recordResult, mysteryResult] = await Promise.all([
      supabase.from("murder_mystery_personal_records").select("id,murder_mystery_id,custom_title,participation_role,rating,private_memo,played_at,source,event_id,created_at").order("played_at", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("murder_mysteries").select("id,title").order("title"),
    ]);
    if (recordResult.error) console.error("개인 머더미스터리 기록 조회 오류:", recordResult.error);
    if (mysteryResult.error) console.error("머더미스터리 목록 조회 오류:", mysteryResult.error);
    setRecords((recordResult.data ?? []) as RecordRow[]);
    setMysteries((mysteryResult.data ?? []) as Mystery[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const titleMap = useMemo(() => new Map(mysteries.map((item) => [item.id, item.title])), [mysteries]);
  const titleOf = (record: RecordRow) => record.murder_mystery_id ? titleMap.get(record.murder_mystery_id) ?? "삭제된 작품" : record.custom_title ?? "직접 등록 작품";

  function resetForm() {
    setMysteryId(""); setCustomTitle(""); setRole("PLAYER"); setRating(""); setMemo("");
  }

  async function addRecord(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "LIST" && !mysteryId) return alert("진행한 작품을 선택해 주세요.");
    if (mode === "CUSTOM" && !customTitle.trim()) return alert("작품 이름을 입력해 주세요.");
    const parsedRating = rating ? Number(rating) : null;
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setSaving(false); return alert("로그인이 필요합니다."); }
    const { error } = await supabase.from("murder_mystery_personal_records").insert({
      user_id: auth.user.id, murder_mystery_id: mode === "LIST" ? mysteryId : null,
      custom_title: mode === "CUSTOM" ? customTitle.trim() : null,
      participation_role: role, rating: parsedRating, private_memo: memo.trim() || null, source: "MANUAL",
    });
    setSaving(false);
    if (error) return alert(`기록을 추가하지 못했습니다: ${error.message}`);
    resetForm(); setFormOpen(false); await load();
  }

  async function updateRecord(record: RecordRow, nextRating: string, nextMemo: string) {
    const { error } = await supabase.from("murder_mystery_personal_records").update({
      rating: nextRating ? Number(nextRating) : null,
      private_memo: nextMemo.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", record.id);
    if (error) return alert(`기록을 수정하지 못했습니다: ${error.message}`);
    await load();
  }

  async function removeRecord(record: RecordRow) {
    if (record.source === "EVENT" || !confirm(`“${titleOf(record)}” 기록을 삭제할까요?`)) return;
    const { error } = await supabase.from("murder_mystery_personal_records").delete().eq("id", record.id);
    if (error) return alert(`기록을 삭제하지 못했습니다: ${error.message}`);
    await load();
  }

  return <section className="mt-8 rounded-3xl border border-red-400/25 bg-red-400/[0.035] p-6 sm:p-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold tracking-[.15em] text-red-300">MY MURDER MYSTERY</p><h2 className="mt-1 text-2xl font-bold">내 머더미스터리 기록</h2><p className="mt-2 text-sm text-zinc-500">이벤트 플레이는 자동 기록됩니다. 평점과 메모는 나만 볼 수 있어요.</p></div><button type="button" onClick={() => setFormOpen((value) => !value)} className="rounded-xl bg-red-400 px-5 py-3 font-bold text-zinc-950">{formOpen ? "닫기" : "+ 과거 기록 추가"}</button></div>

    {formOpen && <form onSubmit={addRecord} className="mt-6 rounded-2xl border border-red-400/20 bg-black/20 p-5">
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setMode("LIST")} className={`rounded-lg px-4 py-2 text-sm font-bold ${mode === "LIST" ? "bg-red-400 text-zinc-950" : "bg-white/10 text-zinc-300"}`}>보유 작품 선택</button><button type="button" onClick={() => setMode("CUSTOM")} className={`rounded-lg px-4 py-2 text-sm font-bold ${mode === "CUSTOM" ? "bg-red-400 text-zinc-950" : "bg-white/10 text-zinc-300"}`}>작품명 직접 입력</button></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{mode === "LIST" ? <select value={mysteryId} onChange={(event) => setMysteryId(event.target.value)} className="h-12 rounded-xl border border-white/10 bg-zinc-900 px-4"><option value="">진행한 작품 선택</option>{mysteries.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select> : <input value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} maxLength={100} placeholder="머더미스터리 작품 이름" className="h-12 rounded-xl border border-white/10 bg-zinc-900 px-4"/>}<select value={role} onChange={(event) => setRole(event.target.value as "PLAYER" | "GM")} className="h-12 rounded-xl border border-white/10 bg-zinc-900 px-4"><option value="PLAYER">플레이</option><option value="GM">GM 진행</option></select><select value={rating} onChange={(event) => setRating(event.target.value)} className="h-12 rounded-xl border border-white/10 bg-zinc-900 px-4"><option value="">평점 선택 (선택)</option>{Array.from({length: 10}, (_, index) => 10 - index).map((score) => <option key={score} value={score}>{score}점</option>)}</select><input value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={150} placeholder="나만 보는 한줄 메모 (선택)" className="h-12 rounded-xl border border-white/10 bg-zinc-900 px-4"/></div>
      <button disabled={saving} className="mt-4 w-full rounded-xl bg-red-400 py-3 font-black text-zinc-950 disabled:opacity-50">{saving ? "저장 중..." : "내 기록에 추가"}</button>
    </form>}

    {loading ? <div className="mt-6 h-32 animate-pulse rounded-2xl bg-white/[0.03]"/> : records.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-white/10 py-12 text-center text-zinc-500">아직 기록이 없습니다. 예전에 플레이한 작품을 추가해 보세요.</div> : <div className="mt-6 grid gap-4 lg:grid-cols-2">{records.map((record) => <RecordCard key={record.id} record={record} title={titleOf(record)} onSave={updateRecord} onDelete={removeRecord}/>)}</div>}
  </section>;
}

function RecordCard({ record, title, onSave, onDelete }: { record: RecordRow; title: string; onSave: (record: RecordRow, rating: string, memo: string) => Promise<void>; onDelete: (record: RecordRow) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(record.rating?.toString() ?? "");
  const [memo, setMemo] = useState(record.private_memo ?? "");
  return <article className="rounded-2xl border border-white/10 bg-black/20 p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-lg font-bold text-white">{title}</p><p className="mt-1 text-xs text-zinc-500">{record.participation_role === "GM" ? "GM 진행" : "플레이"} · {record.played_at} · {record.source === "EVENT" ? "이벤트 자동 기록" : "직접 추가"}</p></div>{record.rating && <span className="shrink-0 rounded-full bg-amber-400/10 px-3 py-1 font-black text-amber-300">{record.rating}/10</span>}</div>
    {record.private_memo && !editing && <p className="mt-4 rounded-xl bg-white/[0.04] px-4 py-3 text-sm text-zinc-300">🔒 {record.private_memo}</p>}
    {editing ? <div className="mt-4 grid gap-2 sm:grid-cols-[110px_1fr_auto]"><select value={rating} onChange={(event) => setRating(event.target.value)} className="h-11 rounded-xl bg-zinc-900 px-3"><option value="">평점 없음</option>{Array.from({length:10},(_,index)=>10-index).map(score=><option key={score} value={score}>{score}점</option>)}</select><input value={memo} onChange={(event)=>setMemo(event.target.value)} maxLength={150} placeholder="나만 보는 한줄 메모" className="h-11 min-w-0 rounded-xl bg-zinc-900 px-3"/><button type="button" onClick={async()=>{await onSave(record,rating,memo);setEditing(false);}} className="rounded-xl bg-amber-400 px-4 font-bold text-zinc-950">저장</button></div> : <div className="mt-4 flex gap-4 text-sm"><button type="button" onClick={()=>setEditing(true)} className="font-semibold text-amber-300">평점·메모 수정</button>{record.source !== "EVENT" && <button type="button" onClick={()=>void onDelete(record)} className="text-red-300">기록 삭제</button>}</div>}
  </article>;
}
