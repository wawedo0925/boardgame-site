"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

type Props = {
  action: (state: { error: string }, data: FormData) => Promise<{ error: string }>;
};

export default function NewNoticeForm({ action }: Props) {
  const [state, save, pending] = useActionState(action, { error: "" });
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [important, setImportant] = useState(false);
  const [templateLoaded, setTemplateLoaded] = useState(false);

  function loadTemplate() {
    if ((title.trim() || content.trim()) && !window.confirm("입력한 제목과 내용을 업데이트 노트 양식으로 바꿀까요? 기존 입력 내용은 사라집니다.")) return;
    const date = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }).format(new Date());
    setTitle(`[업데이트] ${date} · 주요 변경 내용을 적어 주세요`);
    setContent(`보드라운지가 이렇게 달라졌어요!

✨ 새로 생긴 기능
• 기능 이름: 어떤 기능인지 적어 주세요.
  이용 방법: 어느 화면에서 어떤 버튼을 누르면 되는지 안내해 주세요.

🔧 달라진 기능
• 변경된 기능과 달라진 사용 방법을 적어 주세요.

👑 운영진 안내
• 운영진이 알아야 할 변경 사항을 적어 주세요.

💬 의견을 들려주세요
사용 중 불편한 점이나 원하는 기능이 있다면 운영진에게 알려 주세요.
여러분의 의견을 반영해 더 편하게 이용할 수 있도록 개선하겠습니다.`);
    setTemplateLoaded(true);
  }

  return (
        <form
          action={save}
          className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8"
        >
          <fieldset disabled={pending} className="disabled:opacity-60">
          <div className="mb-7 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
            <button type="button" onClick={loadTemplate} className="rounded-xl border border-amber-400/40 px-4 py-3 font-semibold text-amber-300 transition hover:bg-amber-400/10">업데이트 노트 양식 불러오기</button>
            <p className="mt-3 text-sm leading-6 text-zinc-400">새 기능과 변경 사항을 알리는 공지 양식입니다. 제목과 모든 내용은 자유롭게 고치거나 지울 수 있으며, 등록 후에도 수정할 수 있습니다.</p>
            {templateLoaded && <p role="status" className="mt-2 text-sm text-amber-300">양식을 불러왔습니다. 예시를 이번 업데이트 내용으로 바꿔 주세요.</p>}
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-zinc-300">
              제목
            </span>

            <input
              type="text"
              name="title"
              value={title}
              onChange={event => setTitle(event.target.value)}
              required
              maxLength={150}
              placeholder="공지사항 제목을 입력하세요."
              className="h-14 w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 text-white outline-none placeholder:text-zinc-600 focus:border-amber-400/60"
            />
          </label>

          <label className="mt-6 block">
            <span className="mb-2 block text-sm font-semibold text-zinc-300">
              내용
            </span>

            <textarea
              name="content"
              value={content}
              onChange={event => setContent(event.target.value)}
              required
              rows={14}
              maxLength={10000}
              placeholder="공지사항 내용을 입력하세요."
              className="w-full resize-y rounded-2xl border border-white/10 bg-zinc-900 px-4 py-4 leading-7 text-white outline-none placeholder:text-zinc-600 focus:border-amber-400/60"
            />
          </label>

          <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900 px-4 py-4">
            <input
              type="checkbox"
              name="important"
              checked={important}
              onChange={event => setImportant(event.target.checked)}
              className="h-5 w-5 accent-amber-400"
            />

            <span className="font-semibold text-zinc-300">
              중요 공지로 표시
            </span>
          </label>

          </fieldset>
          {state.error && <p role="alert" className="mt-5 rounded-xl bg-red-400/10 p-4 text-sm text-red-300">{state.error}</p>}
          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link
              href="/notice"
              className="inline-flex justify-center rounded-xl border border-white/15 px-6 py-3 font-semibold text-zinc-300"
            >
              취소
            </Link>

            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-amber-400 px-7 py-3 font-bold text-zinc-950 transition hover:bg-amber-300"
            >
              {pending ? "등록 중…" : "공지 등록"}
            </button>
          </div>
        </form>
  );
}
