"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ClocktowerWorldToggle() {
  const supabase = useMemo(() => createClient(), []);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    void supabase.rpc("clocktower_world_enabled").then(({ data, error }) => {
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
      const { data, error } = await supabase.rpc("set_clocktower_world_enabled", { p_enabled: !enabled });
      if (error) throw error;
      setEnabled(data === true);
      setMessage(data ? "기능을 켰습니다." : "게임월드에서 숨겼습니다. 기존 방은 유지됩니다.");
    } catch { setMessage("설정을 변경하지 못했습니다. 다시 시도해 주세요."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="mt-8 rounded-2xl border border-purple-400/25 bg-purple-400/5 p-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h2 id="clocktower-world-label" className="text-xl font-bold">게임월드 · 시계탑 노출</h2>
      <button role="switch" aria-labelledby="clocktower-world-label" aria-checked={enabled === true} disabled={busy || enabled === null} onClick={() => void toggle()} className={`min-h-12 rounded-xl px-5 font-bold disabled:opacity-40 ${enabled ? "bg-purple-400 text-black" : "border border-white/20 text-zinc-300"}`}>{busy ? "변경 중..." : enabled === null ? "불러오는 중..." : enabled ? "켜짐 · 누르면 끄기" : "꺼짐 · 누르면 켜기"}</button>
    </div>
    <p className="mt-3 text-sm leading-6 text-zinc-400">끄면 게임월드의 시계탑 카드가 숨겨지고 새 방 만들기·새 멤버 입장이 중단됩니다. 이미 참가한 방과 이벤트의 시계탑 프로그램은 계속 이용할 수 있습니다.</p>
    <p className="mt-2 text-xs text-zinc-500">이미 열린 화면은 최대 15초 안에, 또는 화면으로 돌아올 때 반영됩니다.</p>
    {message && <p role="status" className="mt-3 text-sm text-purple-200">{message}</p>}
  </section>;
}
