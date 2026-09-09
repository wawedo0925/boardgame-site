"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

type Props = {
  notice: { id: string; title: string; content: string | null; important: boolean | null; is_update: boolean };
  action: (state: { error: string }, data: FormData) => Promise<{ error: string }>;
};

export default function EditNoticeForm({ notice, action }: Props) {
  const [state, save, pending] = useActionState(action, { error: "" });
  const [isUpdate, setIsUpdate] = useState(notice.is_update);
  const [title, setTitle] = useState(notice.title);
  const [content, setContent] = useState(notice.content ?? "");
  const [important, setImportant] = useState(notice.important === true);
  return <form action={save} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
    <fieldset disabled={pending} className="space-y-6 disabled:opacity-60">
      <label className="flex items-center gap-3"><input type="checkbox" name="is_update" checked={isUpdate} onChange={event => setIsUpdate(event.target.checked)} className="h-5 w-5 accent-amber-400" /><span>업데이트 글로 등록 (최신업데이트 확인하기에 모아서 표시)</span></label>
      <label className="block"><span className="mb-2 block text-sm font-semibold text-zinc-300">제목</span><input name="title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={150} className="h-14 w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 outline-none focus:border-amber-400" /></label>
      <label className="block"><span className="mb-2 block text-sm font-semibold text-zinc-300">내용</span><textarea name="content" value={content} onChange={event => setContent(event.target.value)} required rows={14} maxLength={10000} className="w-full resize-y rounded-2xl border border-white/10 bg-zinc-900 px-4 py-4 leading-7 outline-none focus:border-amber-400" /></label>
      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900 p-4"><input type="checkbox" name="important" checked={important} onChange={event => setImportant(event.target.checked)} className="h-5 w-5 accent-amber-400" /><span>중요 공지로 표시</span></label>
    </fieldset>
    {state.error && <p role="alert" className="mt-5 rounded-xl bg-red-400/10 p-4 text-sm text-red-300">{state.error}</p>}
    <div className="mt-8 flex flex-wrap justify-end gap-3"><Link href={`/notice/${notice.id}`} className="rounded-xl border border-white/15 px-6 py-3 font-semibold text-zinc-300">취소</Link><button type="submit" disabled={pending} className="rounded-xl bg-amber-400 px-7 py-3 font-bold text-zinc-950 disabled:opacity-50">{pending ? "저장 중…" : "수정 저장"}</button></div>
  </form>;
}
