"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type EventComment = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type Profile = {
  id: string;
  activity_name: string | null;
};

export default function EventCommentSection({
  eventId,
  currentUserId,
  canManage,
}: {
  eventId: string;
  currentUserId: string | null;
  canManage: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [comments, setComments] = useState<EventComment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadComments = useCallback(async () => {
    setErrorMessage("");
    const { data, error } = await supabase
      .from("event_comments")
      .select("id,user_id,content,created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("이벤트 댓글 조회 오류:", error);
      setErrorMessage("댓글을 불러오지 못했습니다.");
      return;
    }

    const rows = (data ?? []) as EventComment[];
    setComments(rows);
    const profileIds = Array.from(new Set(rows.map((comment) => comment.user_id)));
    if (profileIds.length === 0) {
      setProfiles({});
      return;
    }

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id,activity_name")
      .in("id", profileIds);

    setProfiles(
      Object.fromEntries(
        ((profileRows ?? []) as Profile[]).map((profile) => [profile.id, profile]),
      ),
    );
  }, [eventId, supabase]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = content.trim();
    if (!currentUserId) {
      setErrorMessage("로그인 후 댓글을 작성할 수 있습니다.");
      return;
    }
    if (!value) return;

    setBusy(true);
    setErrorMessage("");
    const { error } = await supabase.from("event_comments").insert({
      event_id: eventId,
      user_id: currentUserId,
      content: value,
    });
    setBusy(false);

    if (error) {
      console.error("이벤트 댓글 등록 오류:", error);
      setErrorMessage("댓글을 등록하지 못했습니다.");
      return;
    }

    setContent("");
    await loadComments();
  }

  async function removeComment(comment: EventComment) {
    if (!window.confirm("이 댓글을 삭제할까요?")) return;
    const { error } = await supabase
      .from("event_comments")
      .delete()
      .eq("id", comment.id);

    if (error) {
      console.error("이벤트 댓글 삭제 오류:", error);
      setErrorMessage("댓글을 삭제하지 못했습니다.");
      return;
    }

    await loadComments();
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-amber-300">COMMENTS</p>
          <h2 className="mt-1 text-2xl font-bold">댓글</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            늦게 참가한다면 도착 예정 시간을 댓글로 남겨 주세요.
          </p>
        </div>
        <span className="text-sm text-zinc-500">{comments.length}개</span>
      </div>

      {currentUserId ? (
        <form onSubmit={(event) => void addComment(event)} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={500}
            placeholder="예: 늦참 8:00"
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-900 px-4 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-amber-400/60"
          />
          <button
            type="submit"
            disabled={busy || !content.trim()}
            className="min-h-12 shrink-0 rounded-xl bg-amber-400 px-7 font-bold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "등록 중..." : "댓글 등록"}
          </button>
        </form>
      ) : (
        <p className="mt-6 rounded-2xl border border-white/10 px-4 py-4 text-sm text-zinc-500">
          로그인하면 댓글을 작성할 수 있습니다.
        </p>
      )}

      {errorMessage && <p className="mt-3 text-sm text-red-300">{errorMessage}</p>}

      <div className="mt-4 space-y-3">
        {comments.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-center text-sm text-zinc-600">
            아직 등록된 댓글이 없습니다.
          </p>
        ) : (
          comments.map((comment) => {
            const canDelete = canManage || comment.user_id === currentUserId;
            return (
              <article key={comment.id} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <strong className="text-zinc-200">
                      {profiles[comment.user_id]?.activity_name?.trim() || "멤버"}
                    </strong>
                    <span className="text-zinc-600">
                      {new Date(comment.created_at).toLocaleString("ko-KR")}
                    </span>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => void removeComment(comment)}
                      className="text-xs font-semibold text-red-300 hover:text-red-200"
                    >
                      삭제
                    </button>
                  )}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-300">
                  {comment.content}
                </p>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
