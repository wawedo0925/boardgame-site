"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MURDER_QUESTIONS, MURDER_CHOICES, completeMurderAnswers, type MurderAnswers } from "@/lib/murder-preferences";

export function MurderPreferenceResult({ answers }: { answers: MurderAnswers }) {
  return <dl className="mt-4 grid gap-2 sm:grid-cols-2">{MURDER_QUESTIONS.map(q => <div key={q.key} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 p-3 text-sm"><dt>{q.label}</dt><dd className={answers[q.key] === "avoid" ? "font-bold text-rose-300" : answers[q.key] === "like" ? "font-bold text-emerald-300" : "text-zinc-400"}>{MURDER_CHOICES[answers[q.key]]}</dd></div>)}</dl>;
}
function Questionnaire({ initial, busy, error, onClose, onSave }: { initial: Partial<MurderAnswers>; busy: boolean; error: string; onClose: () => void; onSave: (a: MurderAnswers) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [answers, setAnswers] = useState(initial);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} aria-labelledby="murder-preference-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl border border-white/15 bg-zinc-950 p-5 text-white backdrop:bg-black/80 sm:p-7">
    <h2 id="murder-preference-title" className="text-xl font-bold">내 머더미스터리 플레이 성향</h2>
    <p className="mt-3 text-sm leading-6 text-zinc-400">정답은 없어요. 지금 느끼는 대로 골라 주세요. 모든 질문에 답하면 저장할 수 있고, 나중에 다시 바꿀 수 있어요.</p>
    <form onSubmit={e => { e.preventDefault(); if (completeMurderAnswers(answers)) onSave(answers); }}>
      <fieldset disabled={busy} className="mt-6 space-y-6">{MURDER_QUESTIONS.map((q, i) => <fieldset key={q.key}>
        <legend className="font-semibold leading-6">{i + 1}. {q.question}</legend>
        <div className="mt-3 grid grid-cols-2 gap-2">{Object.entries(MURDER_CHOICES).map(([key, label]) => <label key={key} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${answers[q.key] === key ? "border-purple-400 bg-purple-400/15" : "border-white/15"}`}><input type="radio" name={q.key} value={key} checked={answers[q.key] === key} onChange={() => setAnswers(a => ({ ...a, [q.key]: key }))} className="accent-purple-400" />{label}</label>)}</div>
      </fieldset>)}</fieldset>
      {error && <p role="alert" className="mt-4 text-rose-300">{error}</p>}
      <p className="mt-5 text-sm text-zinc-400">결과는 본인의 마이페이지와 참여한 머더미스터리 일정의 담당 GM에게만 표시됩니다.</p>
      <div className="mt-5 flex gap-3"><button type="button" disabled={busy} onClick={onClose} className="min-h-12 rounded-xl border border-white/20 px-5">취소</button><button disabled={busy || !completeMurderAnswers(answers)} className="min-h-12 flex-1 rounded-xl bg-purple-400 font-bold text-black disabled:opacity-40">{busy ? "저장 중..." : "내 성향 저장"}</button></div>
    </form>
  </dialog>;
}
export default function MurderPlayPreferences({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [saved, setSaved] = useState<MurderAnswers | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => { let active = true; void (async () => {
    try {
      const { data, error } = await supabase.from("murder_play_preferences").select("answers").eq("user_id", userId).maybeSingle();
      if (!active) return;
      if (error) throw error;
      setSaved(data?.answers ?? null);
    } catch { if (active) setError("성향을 불러오지 못했습니다. 새로고침해 주세요."); }
    finally { if (active) setLoading(false); }
  })(); return () => { active = false; }; }, [supabase, userId]);
  async function save(answers: MurderAnswers) {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try {
      const { error } = await supabase.from("murder_play_preferences").upsert({ user_id: userId, answers }, { onConflict: "user_id" });
      if (error) throw error;
      setSaved(answers); setOpen(false);
    } catch { setError("저장하지 못했습니다. 입력한 답변은 유지됩니다. 다시 시도해 주세요."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="mt-8 rounded-3xl border border-purple-400/25 bg-purple-400/5 p-5 sm:p-7">
    <h2 className="text-2xl font-bold">머더미스터리 플레이 성향</h2>
    <p className="mt-3 text-sm leading-6 text-zinc-400">어떤 역할과 플레이를 좋아하는지 알아보세요. 능력이나 성격을 평가하는 검사가 아니라, GM의 역할 배정을 돕는 선호 정보예요.</p>
    {saved && <MurderPreferenceResult answers={saved} />}
    {!open && error && <p role="alert" className="mt-3 text-rose-300">{error}</p>}
    <button disabled={loading} onClick={() => { setError(""); setOpen(true); }} className="mt-5 min-h-12 rounded-xl bg-purple-400 px-5 font-bold text-black disabled:opacity-40">{loading ? "불러오는 중..." : saved ? "다시 답하기" : "내 성향 알아보기"}</button>
    <p className="mt-3 text-sm text-zinc-500">본인과 해당 일정에 배정된 GM만 볼 수 있어요. 다시 저장하면 최신 답변으로 바뀝니다.</p>
    {open && <Questionnaire initial={saved ?? {}} busy={busy} error={error} onClose={() => setOpen(false)} onSave={a => void save(a)} />}
  </section>;
}
