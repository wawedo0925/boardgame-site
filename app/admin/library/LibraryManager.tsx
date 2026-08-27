"use client";

import { FormEvent, useState } from "react";
import { createClient } from "../../../lib/supabase/client";

type Tab = "BOARDGAME" | "MYSTERY";
const field = "w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-amber-400/60";

function value(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

function numberValue(data: FormData, name: string) {
  const text = value(data, name);
  return text ? Number(text) : null;
}

export default function LibraryManager() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("BOARDGAME");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(file: File, bucket: string, folder: string) {
    if (file.size > 10 * 1024 * 1024) throw new Error("표지 파일은 10MB 이하여야 합니다.");
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("JPG, PNG, WEBP 이미지만 등록할 수 있습니다.");
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${folder}/cover-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file);
    if (error) throw error;
    return { path, url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const name = value(data, "name");
      if (!name) throw new Error("이름을 입력해 주세요.");

      if (tab === "BOARDGAME") {
        const { data: duplicate } = await supabase.from("games").select("id").ilike("name", name).limit(1).maybeSingle();
        if (duplicate) throw new Error("같은 이름의 보드게임이 이미 등록되어 있습니다.");
        const cover = data.get("cover") as File;
        const uploaded = cover?.size ? await upload(cover, "boardgame-covers", crypto.randomUUID()) : null;
        const { error } = await supabase.from("games").insert({
          name,
          library_section: "BOARDGAME",
          type: value(data, "result_type") || "SCORE",
          min_players: numberValue(data, "min_players"),
          max_players: numberValue(data, "max_players"),
          best_players: value(data, "best_players") || null,
          play_time: numberValue(data, "play_time"),
          difficulty: numberValue(data, "difficulty"),
          genre: value(data, "genre") || null,
          weight: numberValue(data, "weight"),
          publisher: value(data, "publisher") || null,
          icon: value(data, "icon") || "🎲",
          min_age: numberValue(data, "min_age"),
          year_published: numberValue(data, "year_published"),
          bgg_url: value(data, "bgg_url") || null,
          description: value(data, "description") || null,
          thumbnail: uploaded?.url || null,
        });
        if (error) throw error;
      } else {
        const { data: duplicate } = await supabase.from("murder_mysteries").select("id").ilike("title", name).limit(1).maybeSingle();
        if (duplicate) throw new Error("같은 이름의 머더미스터리가 이미 등록되어 있습니다.");
        const cover = data.get("cover") as File;
        const uploaded = cover?.size ? await upload(cover, "murder-mystery-covers", crypto.randomUUID()) : null;
        const { error } = await supabase.from("murder_mysteries").insert({
          title: name,
          min_players: numberValue(data, "min_players"),
          max_players: numberValue(data, "max_players"),
          play_time: numberValue(data, "play_time"),
          difficulty: numberValue(data, "mystery_difficulty"),
          host_required: value(data, "host_requirement") === "REQUIRED",
          host_requirement: value(data, "host_requirement") || "RECOMMENDED",
          replayable: value(data, "replayable") === "true",
          theme: value(data, "theme") || null,
          synopsis: value(data, "synopsis") || null,
          cover_url: uploaded?.url || null,
          cover_path: uploaded?.path || null,
        });
        if (error) throw error;
      }

      form.reset();
      setMessage(`${name} 등록이 완료되었습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "등록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-9 rounded-3xl border border-zinc-800 bg-zinc-950 p-5 md:p-8">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => { setTab("BOARDGAME"); setMessage(""); }} className={`rounded-xl px-4 py-3 font-bold ${tab === "BOARDGAME" ? "bg-amber-400 text-black" : "bg-zinc-900 text-zinc-400"}`}>보드게임</button>
        <button type="button" onClick={() => { setTab("MYSTERY"); setMessage(""); }} className={`rounded-xl px-4 py-3 font-bold ${tab === "MYSTERY" ? "bg-red-500 text-white" : "bg-zinc-900 text-zinc-400"}`}>머더미스터리</button>
      </div>

      <form key={tab} onSubmit={submit} className="mt-7 grid gap-4 md:grid-cols-2">
        <label className="md:col-span-2"><span className="mb-2 block text-sm font-bold">{tab === "BOARDGAME" ? "게임 이름" : "작품명"} *</span><input name="name" required className={field} /></label>
        <label><span className="mb-2 block text-sm">최소 인원</span><input name="min_players" type="number" min="1" className={field} /></label>
        <label><span className="mb-2 block text-sm">최대 인원</span><input name="max_players" type="number" min="1" className={field} /></label>
        <label><span className="mb-2 block text-sm">플레이 시간(분)</span><input name="play_time" type="number" min="1" className={field} /></label>

        {tab === "BOARDGAME" ? (
          <>
            <label><span className="mb-2 block text-sm">결과 방식</span><select name="result_type" className={field}><option value="SCORE">점수형</option><option value="SIMPLE_SCORE">등수형</option><option value="ROLE">역할형</option><option value="COOP">협력형</option></select></label>
            <label><span className="mb-2 block text-sm">난이도(1~5)</span><input name="difficulty" type="number" min="1" max="5" step="0.01" className={field} /></label>
            <label><span className="mb-2 block text-sm">장르</span><input name="genre" className={field} /></label>
            <label><span className="mb-2 block text-sm">베스트 인원</span><input name="best_players" placeholder="예: 4명" className={field} /></label>
            <label><span className="mb-2 block text-sm">BGG 웨이트</span><input name="weight" type="number" min="0" max="5" step="0.01" className={field} /></label>
            <label><span className="mb-2 block text-sm">퍼블리셔</span><input name="publisher" className={field} /></label>
            <label><span className="mb-2 block text-sm">아이콘</span><input name="icon" defaultValue="🎲" className={field} /></label>
            <label><span className="mb-2 block text-sm">최소 연령</span><input name="min_age" type="number" min="0" className={field} /></label>
            <label><span className="mb-2 block text-sm">출시 연도</span><input name="year_published" type="number" className={field} /></label>
            <label className="md:col-span-2"><span className="mb-2 block text-sm">BGG 주소</span><input name="bgg_url" type="url" className={field} /></label>
            <label className="md:col-span-2"><span className="mb-2 block text-sm">게임 설명</span><textarea name="description" rows={4} className={field} /></label>
          </>
        ) : (
          <>
            <label><span className="mb-2 block text-sm">난이도(1~5)</span><input name="mystery_difficulty" type="number" min="1" max="5" step="0.01" placeholder="예: 3.25" className={field} /></label>
            <label><span className="mb-2 block text-sm">진행자</span><select name="host_requirement" className={field}><option value="REQUIRED">필요</option><option value="RECOMMENDED">권장</option><option value="NOT_REQUIRED">불필요</option></select></label>
            <label><span className="mb-2 block text-sm">리플레이</span><select name="replayable" className={field}><option value="false">불가</option><option value="true">가능</option></select></label>
            <label><span className="mb-2 block text-sm">테마</span><input name="theme" className={field} /></label>
            <label className="md:col-span-2"><span className="mb-2 block text-sm">줄거리</span><textarea name="synopsis" rows={4} className={field} /></label>
          </>
        )}

        <label className="md:col-span-2"><span className="mb-2 block text-sm">표지 이미지 (선택)</span><input name="cover" type="file" accept="image/jpeg,image/png,image/webp" className={field} /></label>
        {message && <p className={`md:col-span-2 rounded-xl border p-3 text-sm ${message.includes("완료") ? "border-emerald-800 text-emerald-300" : "border-red-900 text-red-300"}`}>{message}</p>}
        <button disabled={busy} className="md:col-span-2 rounded-xl bg-amber-400 px-5 py-4 font-black text-black disabled:opacity-50">{busy ? "등록 중..." : `${tab === "BOARDGAME" ? "보드게임" : "머더미스터리"} 등록`}</button>
      </form>
    </div>
  );
}
