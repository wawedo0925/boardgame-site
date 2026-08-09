"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SiteRole = "MAIN_ADMIN" | "ADMIN" | "RULE_MASTER" | "MEMBER";
type Member = { user_id: string; activity_name: string; site_role: SiteRole };
type History = {
  id: number;
  target_user_id: string;
  target_name: string;
  old_role: SiteRole;
  new_role: SiteRole;
  changed_by_name: string;
  changed_at: string;
};

const ROLE_LABEL: Record<SiteRole, string> = {
  MAIN_ADMIN: "메인 관리자",
  ADMIN: "관리자",
  RULE_MASTER: "룰마",
  MEMBER: "일반 회원",
};

const ROLE_DESCRIPTION: Record<SiteRole, string[]> = {
  MAIN_ADMIN: ["모든 운영 기능", "직위 변경", "영구 삭제", "게임 원본 정보·표지 관리"],
  ADMIN: ["모든 이벤트 운영", "참가자·출석·공지 관리", "영구 삭제와 원본 정보 변경 제외"],
  RULE_MASTER: ["이벤트 생성", "본인이 만든 이벤트 운영", "조 편성·게임 진행·결과 입력"],
  MEMBER: ["이벤트 참가", "댓글·평가 작성", "본인 기록과 랭킹 확인"],
};

const ROLE_STYLE: Record<SiteRole, string> = {
  MAIN_ADMIN: "border-amber-400/40 bg-amber-400/[.07] text-amber-200",
  ADMIN: "border-sky-400/30 bg-sky-400/[.06] text-sky-200",
  RULE_MASTER: "border-emerald-400/30 bg-emerald-400/[.06] text-emerald-200",
  MEMBER: "border-white/10 bg-white/[.03] text-zinc-200",
};

export default function RoleManager({ currentUserId }: { currentUserId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [members, setMembers] = useState<Member[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    const [memberResult, historyResult] = await Promise.all([
      supabase.rpc("admin_list_members"),
      supabase.rpc("admin_list_role_history", { p_limit: 30 }),
    ]);

    if (memberResult.error) {
      setErrorMessage(memberResult.error.message);
    } else {
      setMembers((memberResult.data ?? []) as Member[]);
    }

    if (!historyResult.error) {
      setHistory((historyResult.data ?? []) as History[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(member: Member, nextRole: SiteRole) {
    if (nextRole === member.site_role) return;
    if (member.user_id === currentUserId && nextRole !== "MAIN_ADMIN") {
      alert("현재 로그인한 메인 관리자 자신의 권한은 낮출 수 없습니다.");
      return;
    }
    if (!confirm(`${member.activity_name} 님의 직위를 '${ROLE_LABEL[nextRole]}'(으)로 변경할까요?`)) {
      return;
    }

    setBusyId(member.user_id);
    const { error } = await supabase.rpc("admin_set_member_role", {
      target_user_id: member.user_id,
      new_role: nextRole,
    });
    setBusyId(null);

    if (error) {
      alert(error.message);
      return;
    }
    await load();
  }

  const visibleMembers = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ko");
    if (!keyword) return members;
    return members.filter((member) =>
      `${member.activity_name} ${ROLE_LABEL[member.site_role]}`
        .toLocaleLowerCase("ko")
        .includes(keyword),
    );
  }, [members, query]);

  const counts = useMemo(
    () =>
      members.reduce<Record<SiteRole, number>>(
        (result, member) => {
          result[member.site_role] += 1;
          return result;
        },
        { MAIN_ADMIN: 0, ADMIN: 0, RULE_MASTER: 0, MEMBER: 0 },
      ),
    [members],
  );

  return (
    <div className="mt-9 space-y-7">
      <section>
        <h2 className="text-lg font-bold">직위별 권한</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(ROLE_LABEL) as SiteRole[]).map((role) => (
            <article key={role} className={`rounded-2xl border p-5 ${ROLE_STYLE[role]}`}>
              <div className="flex items-center justify-between gap-3">
                <strong>{ROLE_LABEL[role]}</strong>
                <span className="rounded-full bg-black/30 px-2.5 py-1 text-xs">{counts[role]}명</span>
              </div>
              <ul className="mt-4 space-y-2 text-xs leading-5 text-zinc-400">
                {ROLE_DESCRIPTION[role].map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[.03] p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">회원 직위 변경</h2>
            <p className="mt-1 text-sm text-zinc-500">활동명 또는 현재 직위로 찾을 수 있습니다.</p>
          </div>
          <span className="text-sm text-zinc-400">전체 {members.length}명</span>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="활동명 또는 직위 검색"
          className="mt-5 h-12 w-full rounded-xl border border-white/10 bg-zinc-900 px-4 outline-none focus:border-amber-400/60"
        />

        {errorMessage && <p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-300">{errorMessage}</p>}
        {loading ? (
          <p className="py-10 text-center text-sm text-zinc-500">회원 정보를 불러오는 중입니다.</p>
        ) : (
          <div className="mt-5 grid gap-2 lg:grid-cols-2">
            {visibleMembers.map((member) => (
              <article key={member.user_id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <strong>{member.activity_name}</strong>
                  <p className="mt-1 text-xs text-zinc-500">현재 직위 · {ROLE_LABEL[member.site_role]}</p>
                </div>
                <select
                  value={member.site_role}
                  disabled={busyId === member.user_id}
                  onChange={(event) => void changeRole(member, event.target.value as SiteRole)}
                  className="h-11 rounded-xl border border-white/10 bg-zinc-900 px-4 disabled:opacity-50"
                  aria-label={`${member.activity_name} 직위`}
                >
                  <option value="MEMBER">일반 회원</option>
                  <option value="RULE_MASTER">룰마</option>
                  <option value="ADMIN">관리자</option>
                  <option value="MAIN_ADMIN">메인 관리자</option>
                </select>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[.03] p-5 sm:p-7">
        <h2 className="text-xl font-bold">최근 직위 변경 기록</h2>
        <p className="mt-1 text-sm text-zinc-500">최근 30건을 표시합니다.</p>
        {history.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">아직 직위 변경 기록이 없습니다.</p>
        ) : (
          <div className="mt-5 space-y-2">
            {history.map((item) => (
              <article key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{item.target_name}</strong>
                  <span className="text-zinc-500">{ROLE_LABEL[item.old_role]}</span>
                  <span className="text-amber-300">→</span>
                  <span className="text-amber-200">{ROLE_LABEL[item.new_role]}</span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  변경자 {item.changed_by_name} · {new Date(item.changed_at).toLocaleString("ko-KR")}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
