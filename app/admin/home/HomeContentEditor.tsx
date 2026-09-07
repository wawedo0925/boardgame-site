"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { type HomeContent } from "@/lib/home-content";
import { saveHomeContent } from "./actions";

export default function HomeContentEditor({ initial }: { initial: HomeContent }) {
  const [content, setContent] = useState(initial);
  const [state, formAction, pending] = useActionState(saveHomeContent, { error: "", success: false });
  const [edited, setEdited] = useState(false);
  const fields = [
    { name: "eyebrow", label: "소제목", max: 80, rows: 1 },
    { name: "title", label: "큰 제목", max: 200, rows: 4 },
    { name: "description", label: "소개글", max: 1000, rows: 5 },
  ] as const;

  return <div className="mt-8 grid gap-8 lg:grid-cols-2">
    <form action={formAction} onSubmit={() => setEdited(false)} className="space-y-5">
      <fieldset disabled={pending} className="space-y-5 disabled:opacity-60">
        {fields.map(({ name, label, max, rows }) => <div key={name}>
          <label htmlFor={name} className="mb-2 block text-sm font-semibold">{label}</label>
          <textarea id={name} name={name} required maxLength={max} rows={rows} value={content[name]}
            onChange={(event) => { setEdited(true); setContent({ ...content, [name]: event.target.value }); }}
            className="w-full resize-y rounded-2xl border border-white/15 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-amber-400" />
          <p className="mt-1 text-right text-xs text-zinc-500">{content[name].length} / {max}</p>
        </div>)}
        <p className="text-sm text-zinc-400">줄바꿈도 그대로 반영됩니다. 저장하면 모든 방문자에게 적용됩니다.</p>
        <button type="submit" className="w-full rounded-2xl bg-amber-400 px-5 py-3 font-bold text-zinc-950 hover:bg-amber-300 disabled:opacity-50">{pending ? "저장 중…" : "문구 저장"}</button>
      </fieldset>
      {!edited && state.error && <p role="alert" className="text-sm text-red-300">{state.error}</p>}
      {!edited && state.success && <p role="status" className="text-sm text-emerald-300">저장했습니다. <Link href="/" className="underline underline-offset-4">메인 화면 확인</Link></p>}
    </form>
    <div>
      <p className="mb-3 text-sm text-zinc-400">미리보기</p>
      <div className="rounded-3xl border border-white/10 bg-zinc-900 p-6 sm:p-8">
        <p className="whitespace-pre-wrap break-words text-sm font-semibold tracking-[0.3em] text-amber-400">{content.eyebrow}</p>
        <h2 className="mt-5 whitespace-pre-wrap break-words text-4xl font-bold leading-tight">{content.title}</h2>
        <p className="mt-7 whitespace-pre-wrap break-words text-lg leading-8 text-zinc-200">{content.description}</p>
      </div>
    </div>
  </div>;
}
