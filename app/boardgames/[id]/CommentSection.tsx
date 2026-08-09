"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Comment = {
  id: string;
  game_id: string;
  user_id: string | null;
  author_name: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string | null;
};

type Profile = {
  id: string;
  activity_name: string | null;
  birth_year: string | number | null;
  region: string | null;
  gender: string | null;
};

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-400/60";

export default function CommentSection({ gameId }: { gameId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [comments, setComments] = useState<Comment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [myName, setMyName] = useState("회원");
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const displayName = useCallback(
    (comment: Comment) => {
      const profile = comment.user_id ? profiles[comment.user_id] : null;
      if (!profile) return comment.author_name || "회원";
      return [profile.activity_name, profile.birth_year, profile.region, profile.gender]
        .filter(Boolean)
        .join(" / ");
    },
    [profiles],
  );

  const load = useCallback(async () => {
    setError("");
    const [{ data: authData }, { data, error: commentError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("game_comments")
        .select("id,game_id,user_id,author_name,content,parent_id,created_at,updated_at")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true }),
    ]);
    if (commentError) {
      setError("댓글을 불러오지 못했습니다.");
      return;
    }

    const rows = (data ?? []) as Comment[];
    setComments(rows);
    const currentId = authData.user?.id ?? null;
    setUserId(currentId);
    const profileIds = Array.from(
      new Set([...rows.map((row) => row.user_id), currentId].filter(Boolean) as string[]),
    );
    if (!profileIds.length) return;

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id,activity_name,birth_year,region,gender")
      .in("id", profileIds);
    const map = Object.fromEntries(
      ((profileRows ?? []) as Profile[]).map((profile) => [profile.id, profile]),
    );
    setProfiles(map);
    const mine = currentId ? map[currentId] : null;
    if (mine) {
      setMyName(
        [mine.activity_name, mine.birth_year, mine.region, mine.gender].filter(Boolean).join(" / "),
      );
    }
  }, [gameId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addComment(event: FormEvent, parentId: string | null = null) {
    event.preventDefault();
    const value = (parentId ? replyContent : content).trim();
    if (!userId) return setError("로그인 후 댓글을 작성할 수 있습니다.");
    if (!value) return;
    setBusy(true);
    const { error: insertError } = await supabase.from("game_comments").insert({
      game_id: gameId,
      user_id: userId,
      author_name: myName,
      content: value,
      parent_id: parentId,
    });
    setBusy(false);
    if (insertError) return setError("댓글 등록에 실패했습니다.");
    setContent("");
    setReplyContent("");
    setReplyTo(null);
    await load();
  }

  async function saveEdit(id: string) {
    const value = editingContent.trim();
    if (!value) return;
    setBusy(true);
    const { error: updateError } = await supabase
      .from("game_comments")
      .update({ content: value, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);
    setBusy(false);
    if (updateError) return setError("댓글 수정에 실패했습니다.");
    setEditingId(null);
    await load();
  }

  async function removeComment(id: string) {
    if (!confirm("이 댓글을 삭제할까요? 답글도 함께 삭제됩니다.")) return;
    const { error: deleteError } = await supabase
      .from("game_comments")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (deleteError) return setError("댓글 삭제에 실패했습니다.");
    await load();
  }

  const roots = comments.filter((comment) => !comment.parent_id);
  const replies = (id: string) => comments.filter((comment) => comment.parent_id === id);

  function commentCard(comment: Comment, isReply = false) {
    const mine = Boolean(userId && comment.user_id === userId);
    return (
      <article
        key={comment.id}
        className={`rounded-xl border border-white/10 bg-white/[0.025] p-4 ${isReply ? "ml-5 mt-2" : "mt-3"}`}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <strong className="text-white">{displayName(comment)}</strong>
          <span className="text-slate-600">{new Date(comment.created_at).toLocaleString("ko-KR")}</span>
          {comment.updated_at && <span className="text-slate-600">수정됨</span>}
        </div>
        {editingId === comment.id ? (
          <div className="mt-3 flex gap-2">
            <input
              className={inputClass}
              value={editingContent}
              onChange={(event) => setEditingContent(event.target.value)}
              maxLength={500}
            />
            <button className="rounded-lg bg-amber-400 px-4 text-xs font-bold text-black" onClick={() => void saveEdit(comment.id)}>
              저장
            </button>
          </div>
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{comment.content}</p>
        )}
        <div className="mt-3 flex gap-3 text-xs">
          {!isReply && userId && (
            <button className="text-cyan-300" onClick={() => { setReplyTo(comment.id); setReplyContent(""); }}>
              답글
            </button>
          )}
          {mine && editingId !== comment.id && (
            <button className="text-slate-400" onClick={() => { setEditingId(comment.id); setEditingContent(comment.content); }}>
              수정
            </button>
          )}
          {mine && <button className="text-rose-400" onClick={() => void removeComment(comment.id)}>삭제</button>}
        </div>
      </article>
    );
  }

  return (
    <section className="mt-14 border-t border-white/10 pt-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-amber-300">COMMENTS</p>
          <h2 className="mt-1 text-2xl font-bold text-white">댓글</h2>
          <p className="mt-2 text-sm text-slate-500">게임에 관한 질문과 이야기를 자유롭게 나눠보세요.</p>
        </div>
        <span className="text-sm text-slate-500">{comments.length}개</span>
      </div>

      {userId ? (
        <form className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-4" onSubmit={(event) => void addComment(event)}>
          <label className="text-xs font-semibold text-slate-400">댓글 작성 · {myName}</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <textarea className={`${inputClass} min-h-20 resize-y`} value={content} maxLength={500} onChange={(event) => setContent(event.target.value)} placeholder="댓글 내용을 입력하세요." />
            <button disabled={busy} className="rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-black disabled:opacity-50">등록</button>
          </div>
        </form>
      ) : (
        <p className="mt-6 rounded-xl border border-white/10 p-4 text-sm text-slate-500">로그인하면 댓글을 작성할 수 있습니다.</p>
      )}

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      <div className="mt-5">
        {roots.length ? roots.map((root) => (
          <div key={root.id}>
            {commentCard(root)}
            {replies(root.id).map((reply) => commentCard(reply, true))}
            {replyTo === root.id && (
              <form className="ml-5 mt-2 flex gap-2" onSubmit={(event) => void addComment(event, root.id)}>
                <input className={inputClass} value={replyContent} maxLength={500} onChange={(event) => setReplyContent(event.target.value)} placeholder={`${displayName(root)}님에게 답글`} autoFocus />
                <button className="rounded-lg bg-cyan-400 px-4 text-xs font-bold text-black">등록</button>
                <button type="button" className="text-xs text-slate-500" onClick={() => setReplyTo(null)}>취소</button>
              </form>
            )}
          </div>
        )) : <p className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-600">아직 등록된 댓글이 없습니다.</p>}
      </div>
    </section>
  );
}
