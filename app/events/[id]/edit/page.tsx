"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import Header from "../../../components/Header";
import { createClient } from "@/lib/supabase/client";

type EventRow = {
  id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  location: string | null;
  description: string | null;
  created_by: string;
  event_kind: "BOARDGAME" | "MURDER_MYSTERY" | "GENERAL";
};

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function kindLabel(kind: EventRow["event_kind"]) {
  if (kind === "GENERAL") return "일반 이벤트";
  if (kind === "MURDER_MYSTERY") return "머더미스터리";
  return "보드게임";
}

export default function EventEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [title, setTitle] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: userData }, { data, error }, { data: role }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("events").select("id,title,started_at,ended_at,location,description,created_by,event_kind").eq("id", params.id).maybeSingle(),
        supabase.rpc("current_site_role"),
      ]);
      if (!active) return;
      if (error || !data) { setErrorMessage("이벤트 정보를 불러오지 못했습니다."); setLoading(false); return; }
      const row = data as EventRow;
      const siteRole = (role as string) ?? "MEMBER";
      const allowed = siteRole === "MAIN_ADMIN" || siteRole === "ADMIN" || (siteRole === "RULE_MASTER" && row.created_by === userData.user?.id);
      if (!allowed) { setErrorMessage("이 이벤트를 수정할 권한이 없습니다."); setLoading(false); return; }
      setEvent(row);
      setTitle(row.title);
      setStartedAt(toLocalInput(row.started_at));
      setEndedAt(toLocalInput(row.ended_at));
      setLocation(row.location ?? "");
      setDescription(row.description ?? "");
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [params.id, supabase]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage("");
    if (!title.trim()) { setErrorMessage("이벤트 제목을 입력해 주세요."); return; }
    if (!startedAt) { setErrorMessage("시작 날짜와 시간을 입력해 주세요."); return; }
    const start = new Date(startedAt);
    const end = endedAt ? new Date(endedAt) : null;
    if (end && end <= start) { setErrorMessage("종료 시간은 시작 시간보다 늦어야 합니다."); return; }
    setSaving(true);
    const { error } = await supabase.rpc("update_event_information", {
      p_event_id: params.id,
      p_title: title.trim(),
      p_started_at: start.toISOString(),
      p_ended_at: end?.toISOString() ?? null,
      p_location: location.trim() || null,
      p_description: description.trim() || null,
    });
    setSaving(false);
    if (error) { console.error("이벤트 정보 수정 오류:", error); setErrorMessage(error.message || "이벤트 수정에 실패했습니다."); return; }
    alert("이벤트 정보를 수정했습니다.");
    router.push(`/events/${params.id}`);
    router.refresh();
  }

  const inputClass = "h-13 w-full rounded-xl border border-white/10 bg-zinc-900 px-4 text-white outline-none transition focus:border-sky-400/60";
  return <main className="min-h-screen bg-zinc-950 text-white"><Header />
    <section className="border-b border-white/10"><div className="mx-auto max-w-4xl px-5 py-12 sm:px-6 sm:py-16"><Link href={`/events/${params.id}`} className="text-sm text-zinc-500 hover:text-sky-300">← 이벤트 상세로</Link><p className="mt-8 text-sm font-semibold tracking-[0.3em] text-sky-300">EDIT EVENT</p><h1 className="mt-3 text-4xl font-bold">이벤트 정보 수정</h1><p className="mt-4 text-zinc-400">일정과 안내 정보를 변경할 수 있습니다.</p></div></section>
    <section className="mx-auto max-w-4xl px-5 py-10 sm:px-6 sm:py-14">
      {loading ? <div className="h-96 animate-pulse rounded-3xl border border-white/10 bg-white/[0.03]" /> : !event ? <div className="rounded-3xl border border-red-400/20 bg-red-400/5 p-8 text-center text-red-300">{errorMessage}</div> :
      <form onSubmit={save} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-8">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-zinc-500">이벤트 종류</p><p className="mt-1 font-bold">{kindLabel(event.event_kind)}</p><p className="mt-2 text-xs text-zinc-600">이벤트 종류와 머더미스터리 작품은 생성 후 변경할 수 없습니다.</p></div>
        <div className="mt-6 space-y-6">
          <label className="grid gap-2"><span className="text-sm font-semibold">이벤트 제목 *</span><input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className={inputClass} /><span className="text-right text-xs text-zinc-600">{title.length} / 80</span></label>
          <div className="grid gap-5 sm:grid-cols-2"><label className="grid gap-2"><span className="text-sm font-semibold">시작 날짜·시간 *</span><input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} className={inputClass} /></label><label className="grid gap-2"><span className="text-sm font-semibold">종료 날짜·시간</span><input type="datetime-local" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} className={inputClass} /></label></div>
          <label className="grid gap-2"><span className="text-sm font-semibold">장소</span><input value={location} maxLength={120} onChange={(e) => setLocation(e.target.value)} placeholder="예: 와위두" className={inputClass} /></label>
          <label className="grid gap-2"><span className="text-sm font-semibold">상세 설명</span><textarea value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} rows={7} className="w-full resize-none rounded-xl border border-white/10 bg-zinc-900 p-4 text-white outline-none focus:border-sky-400/60" /><span className="text-right text-xs text-zinc-600">{description.length} / 1000</span></label>
        </div>
        {errorMessage && <p className="mt-5 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-300">{errorMessage}</p>}
        <div className="mt-7 grid grid-cols-2 gap-3"><Link href={`/events/${params.id}`} className="flex min-h-12 items-center justify-center rounded-xl border border-white/10 font-semibold text-zinc-300">취소</Link><button disabled={saving} className="min-h-12 rounded-xl bg-sky-400 font-bold text-zinc-950 disabled:opacity-50">{saving ? "저장 중..." : "변경사항 저장"}</button></div>
      </form>}
    </section>
  </main>;
}
