"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function MurderPreferenceToggle() {
  const supabase = useMemo(() => createClient(), []);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    void supabase.rpc("murder_preferences_enabled").then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage("설정을 불러오지 못했습니다. 새로고침해 주세요.");
      else setEnabled(data === true);
    }, () => { if (active) setMessage("설정을 불러오지 못했습니다. 새로고침해 주세요."); });
    return () => { active = false; };
  }, [supabase]);
  async function toggle() {
    if (enabled === null || lock.current) return;
    lock.current = true; setBusy(true); setMessage("");
    try {
      const { data, error } = await supabase.rpc("set_murder_preferences_enabled", { p_enabled: !enabled });
      if (error) throw error;
      setEnabled(data === true);
      setMessage(data ? "기능을 켰습니다." : "기능을 껐습니다. 저장된 응답은 유지됩니다.");
    } catch { setMessage("설정을 변경하지 못했습니다. 다시 시도해 주세요."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="mt-8 rounded-2xl border border-purple-400/25 bg-purple-400/5 p-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h2 id="murder-feature-label" className="text-xl font-bold">머더미스터리 플레이 성향</h2>
      <button role="switch" aria-labelledby="murder-feature-label" aria-checked={enabled === true} disabled={busy || enabled === null} onClick={() => void toggle()} className={`min-h-12 rounded-xl px-5 font-bold disabled:opacity-40 ${enabled ? "bg-purple-400 text-black" : "border border-white/20 text-zinc-300"}`}>{busy ? "변경 중..." : enabled === null ? "불러오는 중..." : enabled ? "켜짐 · 누르면 끄기" : "꺼짐 · 누르면 켜기"}</button>
    </div>
    <p className="mt-3 text-sm leading-6 text-zinc-400">끄면 마이페이지 성향 설문과 일정의 GM 성향 조회가 숨겨지고, 조회·저장이 중단됩니다. 다시 켜면 기존 응답을 그대로 사용할 수 있습니다.</p>
    <p className="mt-2 text-xs text-zinc-500">이미 열린 화면은 최대 15초 안에, 또는 화면으로 돌아올 때 반영됩니다.</p>
    {message && <p role="status" className="mt-3 text-sm text-purple-200">{message}</p>}
  </section>;
}
