"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "../../../lib/supabase/client";

type Member = { user_id: string; activity_name: string; site_role: string; total_attendance: number; last_attended_at: string | null; inactive_days: number | null };
type MonthRow = { month_start: string; attendance_count: number };
type HistoryRow = { event_id: string; event_title: string; started_at: string };
type OperationRow = { activity_type: "GM" | "RULE_MASTER"; event_id: string; event_title: string; started_at: string; detail: string };
type Detail = { user_id: string; activity_name: string; birth_year: string | null; region: string | null; gender: string | null; site_role: string; attendance_count: number; gm_count: number; rule_master_count: number; admin_note: string; note_updated_at: string | null };
type Filter = "ALL" | "NEW" | "ATTENDED" | "INACTIVE_30" | "INACTIVE_90";

const roleName: Record<string, string> = { MAIN_ADMIN: "메인 관리자", ADMIN: "관리자", RULE_MASTER: "룰마", MEMBER: "일반 회원" };
const dateText = (value: string | null) => value ? new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value)) : "아직 없음";
const filterName: Record<Filter, string> = { ALL: "전체", ATTENDED: "참여 경험", NEW: "첫 출석 전", INACTIVE_30: "30일+ 미참여", INACTIVE_90: "90일+ 미참여" };

export default function MemberStatusManager() {
  const supabase = useMemo(() => createClient(), []);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Member | null>(null);
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [operations, setOperations] = useState<OperationRow[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [note, setNote] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteOnly, setNoteOnly] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const pageSize = 20;

  useEffect(() => {
    supabase.rpc("admin_list_member_status").then(({ data, error }) => {
      if (error) setError(error.message);
      else setMembers((data ?? []) as Member[]);
      setLoading(false);
    });
  }, [supabase]);

  const filtered = useMemo(() => members.filter((member) => {
    const matchesName = member.activity_name.toLocaleLowerCase("ko").includes(query.trim().toLocaleLowerCase("ko"));
    const matchesFilter = filter === "ALL"
      || (filter === "NEW" && member.total_attendance === 0)
      || (filter === "ATTENDED" && member.total_attendance > 0)
      || (filter === "INACTIVE_30" && member.inactive_days !== null && member.inactive_days >= 30)
      || (filter === "INACTIVE_90" && member.inactive_days !== null && member.inactive_days >= 90);
    return matchesName && matchesFilter;
  }).sort((a, b) => a.activity_name.localeCompare(b.activity_name, "ko")), [members, query, filter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  async function openDetail(member: Member) {
    setNoteOnly(false);
    setHistoryOpen(false);
    setSelected(member); setDetailLoading(true); setMonths([]); setHistory([]); setOperations([]); setDetail(null); setNote(""); setError("");
    const [monthResult, historyResult, operationResult, detailResult] = await Promise.all([
      supabase.rpc("admin_member_monthly_attendance", { p_target_user_id: member.user_id }),
      supabase.rpc("admin_member_attendance_history", { p_target_user_id: member.user_id }),
      supabase.rpc("admin_member_operation_history", { p_target_user_id: member.user_id }),
      supabase.rpc("admin_get_member_detail", { p_target_user_id: member.user_id }).single(),
    ]);
    const loadError = monthResult.error || historyResult.error || operationResult.error || detailResult.error;
    if (loadError) setError(loadError.message || "회원 상세 기록을 불러오지 못했습니다.");
    else {
      setMonths((monthResult.data ?? []) as MonthRow[]);
      setHistory((historyResult.data ?? []) as HistoryRow[]);
      setOperations((operationResult.data ?? []) as OperationRow[]);
      const nextDetail = detailResult.data as Detail;
      setDetail(nextDetail); setNote(nextDetail.admin_note ?? "");
    }
    setDetailLoading(false);
  }

  async function openNote(member: Member) {
    setHistoryOpen(false);
    setSelected(member); setNoteOnly(true); setDetailLoading(true); setDetail(null); setNote(""); setError("");
    const { data, error } = await supabase.rpc("admin_get_member_detail", { p_target_user_id: member.user_id }).single();
    if (error) setError(error.message || "관리자 메모를 불러오지 못했습니다.");
    else {
      const nextDetail = data as Detail;
      setDetail(nextDetail); setNote(nextDetail.admin_note ?? "");
    }
    setDetailLoading(false);
  }

  async function saveNote() {
    if (!selected) return;
    setNoteSaving(true);
    const { error } = await supabase.rpc("admin_save_member_note", { p_target_user_id: selected.user_id, p_note: note });
    setNoteSaving(false);
    if (error) { setError(error.message); return; }
    setDetail(current => current ? { ...current, admin_note: note, note_updated_at: new Date().toISOString() } : current);
    alert("관리자 메모를 저장했습니다.");
  }

  return (
    <section className="mx-auto max-w-7xl px-5 py-12">
      <Link href="/admin" className="text-sm text-zinc-500 hover:text-white">← 관리자 페이지</Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold tracking-[0.25em] text-emerald-400">MEMBER STATUS</p><h1 className="mt-2 text-3xl font-black">멤버들 현황</h1></div>
        <p className="text-sm text-zinc-400">전체 {members.length}명 · 참여 경험 {members.filter(m => m.total_attendance > 0).length}명 · 첫 출석 전 {members.filter(m => m.total_attendance === 0).length}명</p>
      </div>

      <div className="mt-7 grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="활동명 검색" className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-emerald-500" />
        <div className="flex flex-wrap gap-2">{(["ALL", "ATTENDED", "NEW", "INACTIVE_30", "INACTIVE_90"] as Filter[]).map(value => <button key={value} onClick={() => { setFilter(value); setPage(1); }} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${filter === value ? "bg-emerald-500 text-black" : "bg-zinc-800"}`}>{filterName[value]}</button>)}</div>
      </div>

      {loading ? <p className="py-16 text-center text-zinc-500">멤버 정보를 불러오는 중입니다.</p> : error && !selected ? <p className="mt-5 rounded-xl border border-red-900 bg-red-950/30 p-4 text-red-300">{error}</p> : (
        <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-800">
          <div className="hidden bg-zinc-900 px-5 py-3 text-xs text-zinc-500 md:grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,.72fr)_minmax(0,.58fr)_minmax(0,.9fr)_minmax(0,.62fr)_104px] md:gap-3"><span>멤버</span><span>직위</span><span>총 참여</span><span>마지막 참석</span><span>미참여 일수</span><span /></div>
          {visible.map(member => <div key={member.user_id} className="grid gap-3 border-t border-zinc-800 px-5 py-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,.72fr)_minmax(0,.58fr)_minmax(0,.9fr)_minmax(0,.62fr)_104px] md:items-center">
            <div className="flex min-w-0 items-center gap-2" title={`활동명: ${member.activity_name}`}><span className="truncate font-bold">{member.activity_name}</span>{member.total_attendance === 0 && <span className="shrink-0 text-[10px] font-black tracking-wider text-red-400">NEW</span>}</div>
            <span className="text-sm text-zinc-400">{roleName[member.site_role] ?? member.site_role}</span>
            <span className="font-black text-emerald-400">{member.total_attendance}회</span>
            <span className="text-sm text-zinc-300">{dateText(member.last_attended_at)}</span>
            <span className="text-sm text-zinc-400">{member.inactive_days === null ? "첫 출석 전" : `${member.inactive_days}일`}</span>
            <div className="flex w-[104px] justify-end gap-2"><button onClick={() => openNote(member)} className="w-fit rounded-lg border border-violet-900 px-3 py-2 text-xs font-bold text-violet-300 hover:border-violet-500">메모</button><button onClick={() => openDetail(member)} className="w-fit rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold hover:border-emerald-500 hover:text-emerald-400">상세</button></div>
          </div>)}
          {!visible.length && <p className="p-12 text-center text-zinc-500">조건에 맞는 멤버가 없습니다.</p>}
        </div>
      )}
      {totalPages > 1 && <div className="mt-5 flex justify-center gap-3"><button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="rounded-lg bg-zinc-800 px-4 py-2 disabled:opacity-30">이전</button><span className="px-2 py-2 text-sm">{page} / {totalPages}</span><button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="rounded-lg bg-zinc-800 px-4 py-2 disabled:opacity-30">다음</button></div>}

      {selected && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3" onMouseDown={(e) => { if (e.currentTarget === e.target) setSelected(null); }}>
        <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 sm:p-7">
          <div className="flex justify-between gap-4"><div><p className={`text-xs font-bold ${noteOnly ? "text-violet-400" : "text-emerald-400"}`}>{noteOnly ? "ADMIN NOTE" : "MEMBER DETAIL"}</p><h2 className="mt-1 text-2xl font-black">{selected.activity_name}</h2></div><button onClick={() => setSelected(null)} className="text-2xl text-zinc-500">×</button></div>
          {error && <p className="mt-4 rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
          {detailLoading ? <p className="py-16 text-center text-zinc-500">{noteOnly ? "관리자 메모를 불러오는 중입니다." : "회원 상세 기록을 불러오는 중입니다."}</p> : detail && <>
            {!noteOnly && <>
            <div className="mt-5 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div className="rounded-xl bg-zinc-900 p-3"><span className="text-zinc-500">직위</span><p className="mt-1 font-bold">{roleName[detail.site_role] ?? detail.site_role}</p></div>
              <div className="rounded-xl bg-zinc-900 p-3"><span className="text-zinc-500">출생 / 지역</span><p className="mt-1 font-bold">{detail.birth_year || "미정"} / {detail.region || "미정"}</p></div>
              <div className="rounded-xl bg-zinc-900 p-3"><span className="text-zinc-500">성별</span><p className="mt-1 font-bold">{detail.gender || "미정"}</p></div>
              <div className="rounded-xl bg-zinc-900 p-3"><span className="text-zinc-500">마지막 참석</span><p className="mt-1 font-bold">{dateText(selected.last_attended_at)}</p></div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl border border-emerald-900 bg-emerald-950/20 p-3"><p className="text-xs text-zinc-500">출석</p><strong className="text-xl text-emerald-400">{detail.attendance_count}회</strong></div><div className="rounded-xl border border-cyan-900 bg-cyan-950/20 p-3"><p className="text-xs text-zinc-500">GM</p><strong className="text-xl text-cyan-400">{detail.gm_count}회</strong></div><div className="rounded-xl border border-amber-900 bg-amber-950/20 p-3"><p className="text-xs text-zinc-500">룰마</p><strong className="text-xl text-amber-400">{detail.rule_master_count}회</strong></div></div>

            <h3 className="mt-7 font-black">최근 12개월 참여</h3><div className="mt-3 space-y-3">{months.map(row => { const max = Math.max(1, ...months.map(m => m.attendance_count)); return <div key={row.month_start} className="grid grid-cols-[72px_1fr_42px] items-center gap-3 text-sm"><span>{row.month_start.slice(0, 7)}</span><div className="h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${row.attendance_count / max * 100}%` }} /></div><span className="text-right font-bold text-emerald-400">{row.attendance_count}회</span></div>; })}</div>

            <h3 className="mt-7 font-black">GM · 룰마 활동</h3><div className="mt-3 space-y-2">{operations.map((row, index) => <Link key={`${row.activity_type}-${row.event_id}-${index}`} href={`/events/${row.event_id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm hover:bg-zinc-800"><span><b className={row.activity_type === "GM" ? "text-cyan-400" : "text-amber-400"}>{row.activity_type === "GM" ? "GM" : "룰마"}</b><span className="ml-3 font-bold">{row.event_title}</span><span className="ml-2 text-zinc-500">{row.detail}</span></span><span className="text-zinc-500">{dateText(row.started_at)}</span></Link>)}{!operations.length && <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-zinc-500">GM 또는 룰마 활동 기록이 없습니다.</p>}</div>

            <div className="mt-7 flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"><div><h3 className="font-black">참석 이벤트</h3><p className="mt-1 text-xs text-zinc-500">확정된 출석 기록 {history.length}개</p></div><button type="button" onClick={() => setHistoryOpen(true)} disabled={!history.length} className="shrink-0 rounded-lg border border-emerald-900 px-4 py-2 text-sm font-bold text-emerald-300 hover:border-emerald-500 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-600">{history.length ? `${history.length}개 보기` : "기록 없음"}</button></div>

            </>}
            <div className={`${noteOnly ? "mt-5" : "mt-7"} rounded-2xl border border-violet-900/60 bg-violet-950/10 p-4`}><div className="flex items-end justify-between gap-3"><div><h3 className="font-black">관리자 내부 메모</h3><p className="mt-1 text-xs text-zinc-500">메인 관리자에게만 표시되며 회원에게는 보이지 않습니다.</p></div><span className="text-xs text-zinc-600">{note.length}/2000</span></div><textarea value={note} onChange={e => setNote(e.target.value.slice(0, 2000))} rows={noteOnly ? 8 : 4} placeholder="아직 작성된 메모가 없습니다. 운영에 필요한 참고 사항을 기록하세요." className="mt-3 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900 p-3 outline-none focus:border-violet-500" /><button onClick={saveNote} disabled={noteSaving} className="mt-3 w-full rounded-xl bg-violet-500 px-4 py-3 font-black text-white disabled:opacity-50">{noteSaving ? "저장 중..." : "관리자 메모 저장"}</button></div>
          </>}
        </div>
      </div>}

      {selected && historyOpen && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-3" onMouseDown={(e) => { if (e.currentTarget === e.target) setHistoryOpen(false); }}>
        <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
          <div className="flex items-center justify-between gap-4 border-b border-zinc-800 p-5"><div><p className="text-xs font-bold tracking-wider text-emerald-400">ATTENDANCE HISTORY</p><h2 className="mt-1 text-xl font-black">{selected.activity_name} · 참석 이벤트</h2><p className="mt-1 text-sm text-zinc-500">총 {history.length}개의 확정된 출석 기록</p></div><button type="button" onClick={() => setHistoryOpen(false)} className="text-2xl text-zinc-500 hover:text-white">×</button></div>
          <div className="overflow-y-auto p-5"><div className="space-y-2">{history.map(row => <Link key={`${row.event_id}-${row.started_at}`} href={`/events/${row.event_id}`} className="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm hover:border-emerald-800 hover:bg-zinc-800"><span className="min-w-0 truncate font-bold">{row.event_title}</span><span className="shrink-0 text-zinc-500">{dateText(row.started_at)}</span></Link>)}</div></div>
        </div>
      </div>}
    </section>
  );
}
