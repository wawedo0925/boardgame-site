"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../../../lib/supabase/client";

type Section = "BOARDGAME" | "MYSTERY";
type Item = Record<string, unknown> & { id: string };

const inputClass = "w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400/60";

function text(value: unknown) { return value == null ? "" : String(value); }
function nullable(value: string) { const v = value.trim(); return v === "" ? null : v; }
function numberOrNull(value: string) { return value.trim() === "" ? null : Number(value); }

export default function ExistingLibraryEditor() {
  const supabase = useMemo(() => createClient(), []);
  const [section, setSection] = useState<Section>("BOARDGAME");
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Item | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function load(nextSection = section) {
    setLoading(true); setMessage(""); setSelected(null);
    const request = nextSection === "BOARDGAME"
      ? supabase.from("games").select("id,name,type,min_players,max_players,best_players,play_time,difficulty,genre,weight,publisher,icon,min_age,year_published,bgg_url,description,thumbnail").eq("library_section", "BOARDGAME").order("name")
      : supabase.from("murder_mysteries").select("id,title,min_players,max_players,play_time,difficulty,host_requirement,replayable,theme,synopsis,cover_url").order("title");
    const { data, error } = await request;
    if (error) setMessage(error.message); else setItems((data ?? []) as Item[]);
    setLoading(false);
  }

  useEffect(() => { void load(section); }, [section]);

  const filtered = items.filter((item) => {
    const name = section === "BOARDGAME" ? item.name : item.title;
    return text(name).toLocaleLowerCase("ko").includes(query.toLocaleLowerCase("ko"));
  });

  function choose(item: Item) {
    setSelected(item);
    const next: Record<string, string> = {};
    Object.entries(item).forEach(([key, value]) => { next[key] = text(value); });
    setDraft(next); setMessage("");
  }

  function set(key: string, value: string) { setDraft((prev) => ({ ...prev, [key]: value })); }

  async function save() {
    if (!selected) return;
    setSaving(true); setMessage("");
    const payload = section === "BOARDGAME" ? {
      name: draft.name.trim(), type: draft.type || "SCORE",
      min_players: numberOrNull(draft.min_players), max_players: numberOrNull(draft.max_players),
      best_players: nullable(draft.best_players), play_time: numberOrNull(draft.play_time),
      difficulty: numberOrNull(draft.difficulty), genre: nullable(draft.genre), weight: numberOrNull(draft.weight),
      publisher: nullable(draft.publisher), icon: nullable(draft.icon), min_age: numberOrNull(draft.min_age),
      year_published: numberOrNull(draft.year_published), bgg_url: nullable(draft.bgg_url),
      description: nullable(draft.description), thumbnail: nullable(draft.thumbnail),
    } : {
      title: draft.title.trim(), min_players: numberOrNull(draft.min_players), max_players: numberOrNull(draft.max_players),
      play_time: numberOrNull(draft.play_time), difficulty: numberOrNull(draft.difficulty),
      host_requirement: draft.host_requirement || "RECOMMENDED", host_required: draft.host_requirement === "REQUIRED",
      replayable: draft.replayable === "true", theme: nullable(draft.theme), synopsis: nullable(draft.synopsis),
      cover_url: nullable(draft.cover_url),
    };
    const table = section === "BOARDGAME" ? "games" : "murder_mysteries";
    const { error } = await supabase.from(table).update(payload).eq("id", selected.id);
    if (error) setMessage(`수정 실패: ${error.message}`);
    else { setMessage("수정한 정보가 저장되었습니다."); await load(section); }
    setSaving(false);
  }

  const Field = ({ label, name, type = "text", min, max, step }: { label: string; name: string; type?: string; min?: number; max?: number; step?: number }) => (
    <label className="block"><span className="mb-1.5 block text-xs font-semibold text-zinc-400">{label}</span>
      <input type={type} min={min} max={max} step={step} value={draft[name] ?? ""} onChange={(e) => set(name, e.target.value)} className={inputClass} />
    </label>
  );

  return <section className="mt-10 rounded-3xl border border-violet-400/20 bg-violet-400/[0.04] p-5 sm:p-7">
    <p className="text-xs font-bold tracking-[0.2em] text-violet-300">EXISTING LIBRARY</p>
    <h2 className="mt-2 text-2xl font-black">기존 게임 정보 수정</h2>
    <p className="mt-2 text-sm text-zinc-400">오타나 잘못된 정보를 찾아 수정할 수 있습니다.</p>
    <div className="mt-5 grid grid-cols-2 gap-2">
      {(["BOARDGAME", "MYSTERY"] as Section[]).map((value) => <button key={value} onClick={() => setSection(value)} className={`rounded-xl px-4 py-3 text-sm font-bold ${section === value ? "bg-violet-500 text-white" : "bg-white/5 text-zinc-400"}`}>{value === "BOARDGAME" ? "보드게임" : "머더미스터리"}</button>)}
    </div>
    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="게임 이름 검색" className={`${inputClass} mt-4`} />
    <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-white/10 p-2">
      {loading ? <p className="p-4 text-sm text-zinc-500">불러오는 중...</p> : filtered.map((item) => {
        const label = text(section === "BOARDGAME" ? item.name : item.title);
        return <button key={item.id} onClick={() => choose(item)} className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm ${selected?.id === item.id ? "bg-violet-500/20 text-violet-200" : "bg-white/[0.03] hover:bg-white/[0.06]"}`}><span className="font-semibold">{label}</span><span className="text-xs text-zinc-500">수정 ›</span></button>;
      })}
    </div>
    {selected && <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-6">
      <h3 className="text-lg font-bold">선택한 작품 수정</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {section === "BOARDGAME" ? <>
          <Field label="게임 이름" name="name" /><label className="block"><span className="mb-1.5 block text-xs font-semibold text-zinc-400">결과 방식</span><select value={draft.type ?? "SCORE"} onChange={(e) => set("type", e.target.value)} className={inputClass}><option value="SCORE">점수형</option><option value="SIMPLE_SCORE">등수형</option><option value="ROLE">역할형</option><option value="COOP">협력형</option></select></label>
          <Field label="최소 인원" name="min_players" type="number" /><Field label="최대 인원" name="max_players" type="number" />
          <Field label="베스트 인원" name="best_players" /><Field label="플레이 시간(분)" name="play_time" type="number" />
          <Field label="난이도(1~5)" name="difficulty" type="number" min={1} max={5} step={0.01} /><Field label="장르" name="genre" />
          <Field label="BGG 웨이트" name="weight" type="number" /><Field label="출판사" name="publisher" />
          <Field label="아이콘" name="icon" /><Field label="권장 나이" name="min_age" type="number" />
          <Field label="출시 연도" name="year_published" type="number" /><Field label="BGG 주소" name="bgg_url" />
          <div className="sm:col-span-2"><Field label="표지 이미지 주소" name="thumbnail" /></div>
          <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-zinc-400">설명</span><textarea value={draft.description ?? ""} onChange={(e) => set("description", e.target.value)} className={`${inputClass} min-h-28`} /></label>
        </> : <>
          <Field label="작품 이름" name="title" /><Field label="난이도(1~5)" name="difficulty" type="number" min={1} max={5} step={0.01} />
          <Field label="최소 인원" name="min_players" type="number" /><Field label="최대 인원" name="max_players" type="number" />
          <Field label="진행 시간(분)" name="play_time" type="number" /><label><span className="mb-1.5 block text-xs font-semibold text-zinc-400">진행자</span><select value={draft.host_requirement ?? "RECOMMENDED"} onChange={(e) => set("host_requirement", e.target.value)} className={inputClass}><option value="REQUIRED">필요</option><option value="RECOMMENDED">권장</option><option value="NOT_REQUIRED">불필요</option></select></label>
          <label><span className="mb-1.5 block text-xs font-semibold text-zinc-400">리플레이</span><select value={draft.replayable ?? "false"} onChange={(e) => set("replayable", e.target.value)} className={inputClass}><option value="false">불가</option><option value="true">가능</option></select></label><Field label="테마" name="theme" />
          <div className="sm:col-span-2"><Field label="표지 이미지 주소" name="cover_url" /></div>
          <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-zinc-400">작품 소개</span><textarea value={draft.synopsis ?? ""} onChange={(e) => set("synopsis", e.target.value)} className={`${inputClass} min-h-28`} /></label>
        </>}
      </div>
      <button disabled={saving} onClick={save} className="mt-5 w-full rounded-xl bg-violet-500 px-4 py-3 font-bold text-white disabled:opacity-50">{saving ? "저장 중..." : "수정사항 저장"}</button>
    </div>}
    {message && <p className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-zinc-200">{message}</p>}
  </section>;
}
