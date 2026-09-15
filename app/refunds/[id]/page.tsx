"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Refund = { id: string; event_id: string | null; activity_name: string; event_title: string; method: string;
  bank: string | null; account_number: string | null; first_joined_at: string; requested_at: string };
function time(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long", timeStyle: "medium" }).format(new Date(value));
}
export default function RefundDetailPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [refund, setRefund] = useState<Refund | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase.from("event_refund_requests")
        .select("id,event_id,activity_name,event_title,method,bank,account_number,first_joined_at,requested_at").eq("id", id).maybeSingle();
      if (!active) return;
      if (error || !data) setError("환불 요청을 볼 수 없습니다. 요청한 본인 또는 메인 관리자 계정으로 로그인해 주세요.");
      else setRefund(data);
    })().catch(() => { if (active) setError("요청을 불러오지 못했습니다. 새로고침해 주세요."); });
    return () => { active = false; };
  }, [supabase, id]);
  async function copy() {
    if (!refund?.account_number) return;
    try { await navigator.clipboard.writeText(refund.account_number); setCopied(true); }
    catch { window.prompt("계좌번호를 복사해 주세요.", refund.account_number); }
  }
  return <main className="mx-auto max-w-2xl px-5 py-12 text-white">
    <Link href="/notifications" className="text-sm text-zinc-400">← 알림으로 돌아가기</Link>
    <h1 className="mt-6 text-3xl font-bold">환불 요청</h1>
    {error ? <p role="alert" className="mt-6 text-red-300">{error}</p> : !refund ? <p className="mt-6">불러오는 중...</p> :
      <section className="mt-6 space-y-5 rounded-2xl border border-white/15 bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">{refund.activity_name}</h2>
        <p>{refund.event_title}</p>
        <dl className="space-y-4">
          <div><dt className="text-sm text-zinc-400">환불 방식</dt><dd className="mt-1 font-bold">{refund.method === "BANK" ? "계좌" : "카카오페이"}</dd></div>
          {refund.method === "BANK" && <div><dt className="text-sm text-zinc-400">은행 · 계좌번호</dt><dd className="mt-2 space-y-3"><p>{refund.bank}</p><p className="break-all text-xl font-bold">{refund.account_number}</p><button onClick={() => void copy()} className="min-h-11 rounded-xl bg-amber-400 px-4 font-bold text-black">{copied ? "복사 완료" : "계좌번호 복사"}</button></dd></div>}
          <div><dt className="text-sm text-zinc-400">최초 참가 신청 시간 (한국 시간)</dt><dd className="mt-1">{time(refund.first_joined_at)}</dd></div>
          <div><dt className="text-sm text-zinc-400">환불 요청 시간 (한국 시간)</dt><dd className="mt-1">{time(refund.requested_at)}</dd></div>
        </dl>
        <p className="text-sm text-zinc-400">환불 요청이 접수된 상태입니다. 실제 환불은 관리자가 별도로 진행합니다.</p>
        {refund.event_id && <Link href={`/events/${refund.event_id}`} className="inline-block text-amber-300 underline">이벤트 보기</Link>}
      </section>}
  </main>;
}
