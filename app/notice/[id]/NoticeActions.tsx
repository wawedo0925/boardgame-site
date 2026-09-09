"use client";

import Link from "next/link";
import { useActionState } from "react";
import { deleteNotice } from "./actions";

export default function NoticeActions({ id, title }: { id: string; title: string }) {
  const [state, action, pending] = useActionState(deleteNotice.bind(null, id), { error: "" });
  return <div className="mt-6">
    <div className="flex flex-wrap gap-3">
      <Link href={`/notice/${id}/edit`} className="inline-flex min-h-11 items-center rounded-xl bg-amber-400 px-5 py-3 font-bold text-zinc-950 hover:bg-amber-300">공지 수정</Link>
      <form action={action} onSubmit={event => { if (pending || !window.confirm(`‘${title}’ 공지를 삭제할까요?\n삭제한 글은 복구할 수 없습니다.`)) event.preventDefault(); }}>
        <button type="submit" disabled={pending} className="min-h-11 rounded-xl border border-red-400/40 px-5 py-3 font-bold text-red-300 hover:bg-red-400/10 disabled:opacity-50">{pending ? "삭제 중…" : "공지 삭제"}</button>
      </form>
    </div>
    {state.error && <p role="alert" className="mt-3 text-sm text-red-300">{state.error}</p>}
  </div>;
}
