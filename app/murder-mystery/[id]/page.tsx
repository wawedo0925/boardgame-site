"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mystery = {
  id: string;
  title: string;
  cover_url: string | null;
  min_players: number | null;
  max_players: number | null;
  play_time: number | null;
  difficulty: string | null;
  host_requirement: string | null;
  replayable: boolean | null;
  theme: string | null;
  synopsis: string | null;
};

type Profile = { id: string; activity_name: string | null; birth_year: string | number | null; region: string | null; gender: string | null };
type History = { user_id: string; participation_role: "PLAYER" | "GM"; completed_at: string | null };
type Review = { id: string; user_id: string; review_text: string; created_at: string; updated_at: string | null };

const hostLabel = (value: string | null) =>
  value === "REQUIRED" ? "진행자 필요" : value === "RECOMMENDED" ? "진행자 권장" : "진행자 불필요";

const profileName = (profile?: Profile) => {
  if (!profile) return "알 수 없는 멤버";
  return [profile.activity_name, profile.birth_year, profile.region, profile.gender].filter(Boolean).join(" / ");
};

export default function MurderMysteryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const id = params.id;

  const [mystery, setMystery] = useState<Mystery | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [reviews, setReviews] = useState<Review[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [warningAccepted, setWarningAccepted] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [{ data: mysteryData, error: mysteryError }, { data: historyData, error: historyError }, { data: reviewData, error: reviewError }, auth] = await Promise.all([
        supabase.from("murder_mysteries").select("id,title,cover_url,min_players,max_players,play_time,difficulty,host_requirement,replayable,theme,synopsis").eq("id", id).single(),
        supabase.from("murder_mystery_history").select("user_id,participation_role,completed_at").eq("murder_mystery_id", id).order("completed_at", { ascending: false }),
        supabase.from("murder_mystery_reviews").select("id,user_id,review_text,created_at,updated_at").eq("murder_mystery_id", id).order("created_at", { ascending: false }),
        supabase.auth.getUser(),
      ]);
      if (mysteryError) throw mysteryError;
      if (historyError) throw historyError;
      if (reviewError && reviewError.code !== "42P01") throw reviewError;
      setMystery(mysteryData as Mystery);
      setHistory((historyData ?? []) as History[]);
      setReviews((reviewData ?? []) as Review[]);
      setUserId(auth.data.user?.id ?? null);

      const ids = [...new Set([...(historyData ?? []).map((row) => row.user_id), ...(reviewData ?? []).map((row) => row.user_id)])];
      if (ids.length) {
        const { data } = await supabase.from("profiles").select("id,activity_name,birth_year,region,gender").in("id", ids);
        setProfiles(Object.fromEntries(((data ?? []) as Profile[]).map((profile) => [profile.id, profile])));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "작품 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [id]);

  const players = history.filter((row) => row.participation_role === "PLAYER");
  const gms = history.filter((row) => row.participation_role === "GM");
  const canReview = Boolean(userId && players.some((row) => row.user_id === userId));

  const grouped = (rows: History[]) => Object.entries(rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.user_id] = (acc[row.user_id] ?? 0) + 1;
    return acc;
  }, {}));

  async function saveReview() {
    if (!userId || !canReview || !text.trim() || !warningAccepted) return;
    setSaving(true);
    const payload = { murder_mystery_id: id, user_id: userId, review_text: text.trim(), updated_at: new Date().toISOString() };
    const result = editingId
      ? await supabase.from("murder_mystery_reviews").update(payload).eq("id", editingId).eq("user_id", userId)
      : await supabase.from("murder_mystery_reviews").insert(payload);
    setSaving(false);
    if (result.error) return alert(`리뷰 저장에 실패했습니다: ${result.error.message}`);
    setText(""); setEditingId(null); setWarningAccepted(false); await load();
  }

  async function removeReview(reviewId: string) {
    if (!confirm("이 리뷰를 삭제할까요?")) return;
    const { error: removeError } = await supabase.from("murder_mystery_reviews").delete().eq("id", reviewId).eq("user_id", userId);
    if (removeError) return alert(removeError.message);
    await load();
  }

  if (loading) return <main className="mx-auto min-h-screen max-w-5xl px-5 py-20 text-white">불러오는 중...</main>;
  if (error || !mystery) return <main className="mx-auto min-h-screen max-w-5xl px-5 py-20 text-red-300">{error || "작품이 없습니다."}</main>;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-12 text-white">
      <button onClick={() => router.push("/murder-mystery")} className="mb-8 text-sm text-slate-400 hover:text-white">← 머더미스터리 목록</button>
      <section className="grid gap-8 rounded-3xl border border-red-900/60 bg-[#101012] p-6 md:grid-cols-[220px_1fr]">
        <div className="aspect-[3/4] overflow-hidden rounded-2xl bg-zinc-900">
          {mystery.cover_url ? <img src={mystery.cover_url} alt={mystery.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-5xl">🕵️</div>}
        </div>
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-red-400">MURDER MYSTERY</p>
          <h1 className="mt-2 text-3xl font-black">{mystery.title}</h1>
          <div className="mt-5 flex flex-wrap gap-2 text-sm text-slate-300">
            <span className="rounded-full bg-zinc-800 px-3 py-2">{mystery.min_players ?? "?"}~{mystery.max_players ?? "?"}명</span>
            <span className="rounded-full bg-zinc-800 px-3 py-2">{mystery.play_time ?? "?"}분</span>
            <span className="rounded-full bg-zinc-800 px-3 py-2">{hostLabel(mystery.host_requirement)}</span>
            <span className="rounded-full bg-zinc-800 px-3 py-2">{mystery.replayable ? "리플레이 가능" : "리플레이 불가"}</span>
          </div>
          <h2 className="mt-8 text-lg font-bold">스포일러 없는 작품 소개</h2>
          <p className="mt-3 whitespace-pre-wrap break-words leading-8 text-slate-300">{mystery.synopsis || "등록된 소개가 없습니다."}</p>
        </div>
      </section>

      <section className="mt-8 grid gap-5 md:grid-cols-2">
        {[{ title: "플레이한 멤버", rows: grouped(players), empty: "아직 플레이 이력이 없습니다." }, { title: "GM 진행 이력", rows: grouped(gms), empty: "아직 GM 이력이 없습니다." }].map((section) => (
          <div key={section.title} className="rounded-3xl border border-zinc-800 bg-[#101012] p-6">
            <h2 className="text-xl font-black">{section.title}</h2>
            <div className="mt-4 space-y-2">
              {section.rows.length ? section.rows.map(([memberId, count]) => <div key={memberId} className="flex items-center justify-between rounded-xl bg-zinc-900 px-4 py-3"><span>{profileName(profiles[memberId])}</span><strong className="text-red-300">{count}회</strong></div>) : <p className="text-sm text-slate-500">{section.empty}</p>}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-8 rounded-3xl border border-zinc-800 bg-[#101012] p-6">
        <h2 className="text-2xl font-black">플레이어 리뷰</h2>
        <p className="mt-2 text-sm text-slate-400">이 작품을 플레이한 멤버만 리뷰를 작성할 수 있습니다.</p>
        {canReview && (
          <div className="mt-6 rounded-2xl border border-red-800/70 bg-red-950/20 p-4">
            <p className="font-bold text-red-300">⚠ 스포일러 작성 금지</p>
            <p className="mt-1 text-sm leading-6 text-red-200/80">범인, 반전, 단서, 역할 등 스포일러가 포함된 리뷰는 경고 또는 수위에 따라 강퇴 처리될 수 있습니다.</p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} className="mt-4 min-h-28 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3" placeholder="스포일러 없이 작품의 분위기와 감상을 남겨주세요." />
            <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={warningAccepted} onChange={(e) => setWarningAccepted(e.target.checked)} className="mt-1" /><span>스포일러 금지 안내와 운영 규정을 확인했습니다.</span></label>
            <button disabled={saving || !text.trim() || !warningAccepted} onClick={saveReview} className="mt-4 rounded-xl bg-red-500 px-5 py-3 font-bold text-white disabled:opacity-40">{saving ? "저장 중..." : editingId ? "리뷰 수정 저장" : "리뷰 등록"}</button>
          </div>
        )}
        {!canReview && <p className="mt-5 rounded-xl border border-dashed border-zinc-700 p-4 text-sm text-slate-500">플레이 이력이 확인되면 리뷰 작성 영역이 열립니다.</p>}
        <div className="mt-6 space-y-3">
          {reviews.length ? reviews.map((review) => <article key={review.id} className="rounded-2xl bg-zinc-900 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{profileName(profiles[review.user_id])}</strong><span className="text-xs text-slate-500">{new Date(review.updated_at || review.created_at).toLocaleDateString("ko-KR")}</span></div><p className="mt-3 whitespace-pre-wrap break-words leading-7 text-slate-300">{review.review_text}</p>{review.user_id === userId && <div className="mt-3 flex gap-2"><button onClick={() => { setEditingId(review.id); setText(review.review_text); setWarningAccepted(false); }} className="text-xs text-amber-300">수정</button><button onClick={() => removeReview(review.id)} className="text-xs text-red-400">삭제</button></div>}</article>) : <p className="text-sm text-slate-500">아직 등록된 리뷰가 없습니다.</p>}
        </div>
      </section>
    </main>
  );
}
