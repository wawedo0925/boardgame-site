"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { MurderMystery } from "./page";

const BUCKET = "murder-mystery-covers";

function playerText(item: MurderMystery) {
  if (item.min_players && item.max_players) {
    return item.min_players === item.max_players
      ? `${item.min_players}명`
      : `${item.min_players}~${item.max_players}명`;
  }
  return item.min_players ? `${item.min_players}명 이상` : "인원 미정";
}

function hostText(item: MurderMystery) {
  if (item.host_requirement === "RECOMMENDED") return "진행자 권장";
  if (item.host_requirement === "NOT_REQUIRED") return "진행자 불필요";
  return "진행자 필요";
}

function safeFileName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() || "jpg";
  return `cover-${Date.now()}.${extension.replace(/[^a-z0-9]/g, "") || "jpg"}`;
}

export default function MurderMysteryList({ mysteries, isAdmin, interestCounts }: { mysteries: MurderMystery[]; isAdmin: boolean; interestCounts: Record<string, number> }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [hostFilter, setHostFilter] = useState("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<MurderMystery | null>(null);

  const visible = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ko");
    return mysteries.filter((item) => {
      const matchesQuery = !keyword || item.title.toLocaleLowerCase("ko").includes(keyword);
      const matchesHost = hostFilter === "ALL" || item.host_requirement === hostFilter;
      return matchesQuery && matchesHost;
    });
  }, [hostFilter, mysteries, query]);

  async function uploadCover(item: MurderMystery, file: File) {
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      alert("JPG, PNG, WEBP 사진만 올릴 수 있습니다.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("사진 크기는 10MB 이하여야 합니다.");
      return;
    }

    setBusyId(item.id);
    const path = `${item.id}/${safeFileName(file.name)}`;
    try {
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error: updateError } = await supabase
        .from("murder_mysteries")
        .update({ cover_url: publicData.publicUrl, cover_path: path })
        .eq("id", item.id);
      if (updateError) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw updateError;
      }

      if (item.cover_path) await supabase.storage.from(BUCKET).remove([item.cover_path]);
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("표지 저장에 실패했습니다. SQL 적용 여부와 로그인 계정을 확인해주세요.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteCover(item: MurderMystery) {
    if (!confirm(`${item.title} 표지를 삭제할까요?`)) return;
    setBusyId(item.id);
    try {
      const { error } = await supabase
        .from("murder_mysteries")
        .update({ cover_url: null, cover_path: null })
        .eq("id", item.id);
      if (error) throw error;
      if (item.cover_path) await supabase.storage.from(BUCKET).remove([item.cover_path]);
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("표지 삭제에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const numberOrNull = (key: string) => {
      const value = String(form.get(key) ?? "").trim();
      return value === "" ? null : Number(value);
    };
    const title = String(form.get("title") ?? "").trim();
    if (!title) {
      alert("작품 제목을 입력해주세요.");
      return;
    }
    const minPlayers = numberOrNull("min_players");
    const maxPlayers = numberOrNull("max_players");
    if (minPlayers !== null && maxPlayers !== null && minPlayers > maxPlayers) {
      alert("최대 인원은 최소 인원보다 작을 수 없습니다.");
      return;
    }

    setBusyId(editing.id);
    try {
      const { error } = await supabase
        .from("murder_mysteries")
        .update({
          title,
          min_players: minPlayers,
          max_players: maxPlayers,
          play_time: numberOrNull("play_time"),
          difficulty: numberOrNull("difficulty"),
          host_requirement: String(form.get("host_requirement")),
          host_required: form.get("host_requirement") !== "NOT_REQUIRED",
          replayable: form.get("replayable") === "true",
          theme: String(form.get("theme") ?? "").trim() || null,
          synopsis: String(form.get("synopsis") ?? "").trim() || null,
        })
        .eq("id", editing.id);
      if (error) throw error;
      setEditing(null);
      router.refresh();
    } catch (error) {
      console.error("머더미스터리 작품 정보 저장 오류:", error);
      const message = error instanceof Error
        ? error.message
        : typeof error === "object" && error && "message" in error
          ? String(error.message)
          : "알 수 없는 오류";
      alert(`작품 정보 저장에 실패했습니다.\n${message}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="mb-8 grid gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:grid-cols-[1fr_220px]">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="작품명 검색" className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm outline-none" />
        <select value={hostFilter} onChange={(event) => setHostFilter(event.target.value)} className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-300 outline-none">
          <option value="ALL">전체 진행 방식</option>
          <option value="REQUIRED">진행자 필요</option>
          <option value="RECOMMENDED">진행자 권장</option>
          <option value="NOT_REQUIRED">진행자 불필요</option>
        </select>
      </div>

      <p className="mb-5 text-sm text-zinc-400">총 <span className="font-semibold text-red-400">{visible.length}</span>개의 작품</p>
      <div className="overflow-hidden rounded-3xl border border-white/10">
        {visible.map((item) => (
          <article
            key={item.id}
            role="link"
            tabIndex={0}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("button,input,select,textarea,label,form")) return;
              router.push(`/murder-mystery/${item.id}`);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                router.push(`/murder-mystery/${item.id}`);
              }
            }}
            className="grid cursor-pointer gap-5 border-b border-white/10 px-5 py-5 last:border-b-0 hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 lg:grid-cols-[100px_1.5fr_0.65fr_0.65fr_0.75fr_0.75fr] lg:items-center lg:px-6"
          >
            <div>
              <div className="flex h-28 w-20 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-red-400/10 text-4xl">
                {item.cover_url ? <img src={item.cover_url} alt={`${item.title} 표지`} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : "🎭"}
              </div>
              {isAdmin && (
                <div className="mt-2 flex w-20 flex-col gap-1">
                  <label className="cursor-pointer rounded-lg bg-cyan-500 px-2 py-1 text-center text-[11px] font-bold text-zinc-950 hover:bg-cyan-400">
                    {busyId === item.id ? "처리 중" : item.cover_url ? "표지 교체" : "표지 등록"}
                    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busyId)} className="hidden" onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadCover(item, file);
                      event.currentTarget.value = "";
                    }} />
                  </label>
                  {item.cover_url && (
                    <button type="button" disabled={Boolean(busyId)} onClick={() => void deleteCover(item)} className="rounded-lg border border-red-400/40 px-2 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-400/10">삭제</button>
                  )}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-red-400">{item.theme ?? "머더미스터리"}</p>
              <h2 className="mt-1 text-lg font-bold">{item.title}</h2>
              <p className="mt-2 text-xs text-zinc-500">리플레이 {item.replayable ? "가능" : "불가"}</p>
              {item.synopsis && <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-400">{item.synopsis}</p>}
              {isAdmin && <button type="button" onClick={() => setEditing(item)} className="mt-3 rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-400/10">정보 수정</button>}
            </div>
            <p className="text-sm text-zinc-300">{playerText(item)}</p>
            <p className="text-sm text-zinc-300">{item.play_time ? `${item.play_time}분` : "시간 미정"}</p>
            <p className="text-sm text-zinc-300">{hostText(item)}</p>
            <p className="text-sm font-bold text-amber-300">플레이 희망 {interestCounts[item.id] ?? 0}명</p>
          </article>
        ))}
        {!visible.length && <div className="px-6 py-16 text-center text-sm text-zinc-500">조건에 맞는 작품이 없습니다.</div>}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => {
          if (event.currentTarget === event.target && !busyId) setEditing(null);
        }}>
          <form onSubmit={saveInfo} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-5 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-semibold tracking-[0.2em] text-amber-300">ADMIN EDIT</p><h2 className="mt-1 text-2xl font-bold">작품 정보 수정</h2></div>
              <button type="button" disabled={Boolean(busyId)} onClick={() => setEditing(null)} className="rounded-full border border-white/10 px-3 py-1 text-zinc-400">닫기</button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="mb-2 block text-xs text-zinc-400">작품 제목</span><input name="title" defaultValue={editing.title} required className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 outline-none focus:border-amber-400" /></label>
              <label><span className="mb-2 block text-xs text-zinc-400">최소 인원</span><input name="min_players" type="number" min="1" defaultValue={editing.min_players ?? ""} placeholder="미정" className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 outline-none" /></label>
              <label><span className="mb-2 block text-xs text-zinc-400">최대 인원</span><input name="max_players" type="number" min="1" defaultValue={editing.max_players ?? ""} placeholder="미정" className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 outline-none" /></label>
              <label><span className="mb-2 block text-xs text-zinc-400">플레이 시간(분)</span><input name="play_time" type="number" min="1" defaultValue={editing.play_time ?? ""} placeholder="미정" className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 outline-none" /></label>
              <label><span className="mb-2 block text-xs text-zinc-400">난이도 (1~5)</span><input name="difficulty" type="number" min="1" max="5" step="0.1" defaultValue={editing.difficulty ?? ""} placeholder="미정" className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 outline-none" /></label>
              <label><span className="mb-2 block text-xs text-zinc-400">진행자</span><select name="host_requirement" defaultValue={editing.host_requirement ?? (editing.host_required ? "REQUIRED" : "NOT_REQUIRED")} className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3"><option value="REQUIRED">필요</option><option value="RECOMMENDED">권장</option><option value="NOT_REQUIRED">불필요</option></select></label>
              <label><span className="mb-2 block text-xs text-zinc-400">리플레이</span><select name="replayable" defaultValue={String(editing.replayable)} className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3"><option value="false">불가</option><option value="true">가능</option></select></label>
              <label className="sm:col-span-2"><span className="mb-2 block text-xs text-zinc-400">테마·장르</span><input name="theme" defaultValue={editing.theme ?? ""} placeholder="예: 현대 추리, 판타지, 호러" className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 outline-none" /></label>
              <label className="sm:col-span-2"><span className="mb-2 block text-xs text-zinc-400">스포일러 없는 소개</span><textarea name="synopsis" defaultValue={editing.synopsis ?? ""} rows={4} maxLength={1000} placeholder="사건의 정답이나 범인을 제외한 간단한 소개" className="w-full resize-none rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 leading-6 outline-none" /></label>
            </div>

            <button type="submit" disabled={Boolean(busyId)} className="mt-6 w-full rounded-xl bg-amber-400 px-5 py-3.5 font-bold text-zinc-950 hover:bg-amber-300 disabled:opacity-50">{busyId ? "저장 중..." : "작품 정보 저장"}</button>
          </form>
        </div>
      )}
    </>
  );
}
