"use client";

import Script from "next/script";
import { useRef, useState } from "react";
import { type CalendarEvent } from "@/lib/events/calendar";
import { saveGoogleCalendarEvent } from "@/lib/events/google-calendar";

type TokenResponse = { access_token?: string; expires_in?: number; scope?: string; error?: string };
type Identity = { accounts: { oauth2: { initTokenClient: (options: { client_id: string; scope: string; callback: (response: TokenResponse) => void; error_callback: () => void }) => { requestAccessToken: (options: { prompt: string }) => void } } } };
const scope = "https://www.googleapis.com/auth/calendar.events.owned";
// OAuth web client IDs are public identifiers, not client secrets.
const clientId = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID ?? "663851688978-ro034m04imdlejkjc51d4f8c17la0ad4.apps.googleusercontent.com";
export const directCalendarConfigured = Boolean(clientId);

export default function GoogleCalendarSave({ event }: { event: CalendarEvent }) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const token = useRef<{ value: string; until: number } | null>(null);
  const inFlight = useRef(false);
  if (!directCalendarConfigured) return null;
  function finish(text: string) { setMessage(text); setBusy(false); inFlight.current = false; }
  async function insert(value: string) {
    try { finish(await saveGoogleCalendarEvent(event, window.location.origin, value)); }
    catch (error) { token.current = null; finish(error instanceof Error ? error.message : "저장에 실패했어요. 다시 시도해 주세요."); }
  }
  function save() {
    if (inFlight.current) return;
    const google = (window as Window & { google?: Identity }).google;
    if (!google) { setMessage("구글 연결을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요."); return; }
    inFlight.current = true; setBusy(true); setMessage("");
    if (token.current && token.current.until > Date.now()) { void insert(token.current.value); return; }
    try {
      google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope,
        callback: response => {
          if (response.error || !response.access_token || !response.scope?.split(" ").includes(scope)) { finish("저장하려면 구글 캘린더 접근 동의가 필요해요."); return; }
          token.current = { value: response.access_token, until: Date.now() + Math.max(0, (Number(response.expires_in) || 0) - 60) * 1000 };
          void insert(response.access_token);
        },
        error_callback: () => finish("구글 연결 창이 닫혔거나 차단됐어요. 팝업을 허용하고 다시 눌러 주세요."),
      }).requestAccessToken({ prompt: "" });
    } catch { finish("구글 연결을 시작하지 못했어요. 다시 시도해 주세요."); }
  }
  return <>
    <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setReady(true)} onError={() => setMessage("구글 연결을 불러오지 못했어요. 다른 저장 방법을 이용해 주세요.")} />
    <button type="button" disabled={!ready || busy} onClick={save} className="min-h-12 rounded-xl bg-sky-300 px-5 font-bold text-zinc-950 disabled:opacity-50">{busy ? "저장 중…" : "구글 캘린더에 바로 저장"}</button>
    <p className="text-xs leading-5 text-zinc-400">정보 수정 화면 없이 내 기본 구글 캘린더에 저장합니다. 처음에는 구글 계정 연결과 권한 동의가 필요하며, 연결 만료 시 다시 연결할 수 있어요.</p>
    {message && <p role="status" className="text-sm text-sky-200">{message}</p>}
  </>;
}
