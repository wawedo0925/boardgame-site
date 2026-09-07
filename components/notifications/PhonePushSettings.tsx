"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Settings = { allowed: boolean; publicKey?: string; subscribed?: boolean };

export default function PhonePushSettings({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data, error } = await supabase.rpc("my_push_settings");
        if (error) throw error;
        if (!active) return;
        setSettings(data);
        if (!data?.allowed) return;
        if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
          setSupported(false);
          return;
        }
        await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        const { data: current, error: statusError } = await supabase.rpc("my_push_settings", { p_endpoint: sub?.endpoint ?? null });
        if (statusError) throw statusError;
        if (active) { setRegistration(reg); setSubscription(sub); setSettings(current); }
      } catch {
        if (active) setMessage("휴대폰 알림 설정을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
      }
    }
    void load();
    return () => { active = false; };
  }, [supabase, userId]);

  async function enable() {
    if (!registration || !settings?.publicKey) return;
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("알림이 허용되지 않았습니다. 휴대폰의 이 사이트 알림 설정에서 허용해 주세요.");
        return;
      }
      const key = Uint8Array.from(atob(settings.publicKey.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
      const sub = subscription ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      setSubscription(sub);
      const json = sub.toJSON();
      const { error } = await supabase.rpc("save_push_subscription", { p_endpoint: sub.endpoint, p_p256dh: json.keys?.p256dh, p_auth: json.keys?.auth });
      if (error) throw error;
      setSettings({ ...settings, subscribed: true });
      setMessage("이 기기의 참가 알림을 켰습니다. 테스트 알림으로 수신을 확인해 주세요.");
    } catch {
      setMessage("알림을 연결하지 못했습니다. 설치한 앱이나 Chrome에서 다시 시도해 주세요.");
    } finally { setBusy(false); }
  }

  async function disable() {
    if (!subscription) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("remove_push_subscription", { p_endpoint: subscription.endpoint });
      if (error) throw error;
      setSettings((current) => current ? { ...current, subscribed: false } : current);
      await subscription.unsubscribe();
      setSubscription(null);
      setMessage("이 기기의 참가 알림을 껐습니다.");
    } catch { setMessage("알림 해제 중 오류가 발생했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  async function test() {
    if (!subscription) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("test_my_push", { p_endpoint: subscription.endpoint });
      if (error) throw error;
      setMessage("테스트 알림을 요청했습니다. 잠시 후 휴대폰 알림을 확인해 주세요.");
    } catch { setMessage("테스트 알림을 요청하지 못했습니다. 1분 후 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  if (!settings?.allowed) return null;
  return <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5">
    <h2 className="font-bold text-amber-300">내 휴대폰 참가 알림</h2>
    <p className="mt-2 text-sm leading-6 text-zinc-400">우영 계정 전용입니다. 새 참가자가 생기면 날짜와 이벤트 종류를 휴대폰으로 알려드립니다.</p>
    {!supported ? <p className="mt-3 text-sm text-zinc-300">이 브라우저는 푸시 알림을 지원하지 않습니다. 갤럭시의 Chrome이나 설치한 앱에서 열어 주세요.</p>
      : !settings.publicKey ? <p className="mt-3 text-sm text-zinc-300">알림 연결을 준비하고 있습니다. 잠시 후 새로고침해 주세요.</p>
      : <div className="mt-4 flex flex-wrap gap-3">
        {settings.subscribed && subscription ? <>
          <button disabled={busy} onClick={test} className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-50">테스트 알림 보내기</button>
          <button disabled={busy} onClick={disable} className="rounded-xl border border-white/20 px-4 py-2 text-sm disabled:opacity-50">이 기기 알림 끄기</button>
        </> : <button disabled={busy || !registration} onClick={enable} className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-50">{busy ? "연결 중…" : "이 기기 알림 켜기"}</button>}
      </div>}
    {message && <p role="status" className="mt-3 text-sm text-zinc-300">{message}</p>}
  </div>;
}
