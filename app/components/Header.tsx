"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  activity_name?: string | null;
  nickname?: string | null;
  birth_year?: string | number | null;
  region?: string | null;
  gender?: string | null;
  avatar_url?: string | null;
  site_role?: string | null;
  role?: string | null;
};

const links = [
  ["/notice", "공지사항"],
  ["/boardgames", "보드게임"],
  ["/murder-mystery", "머더미스터리"],
  ["/reviews", "게임 평가"],
  ["/events", "이벤트 일정"],
  ["/rankings", "게임 랭킹"],
  ["/mypage", "마이페이지"],
] as const;

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

export default function Header() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userName, setUserName] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!active) return;

      const user = data.user;
      setLoggedIn(Boolean(user));

      if (!user) {
        setProfile(null);
        setUserName("");
        return;
      }

      setUserName(
        text(user.user_metadata?.activity_name) ||
          text(user.user_metadata?.nickname) ||
          text(user.user_metadata?.name),
      );

      const response = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (active && !response.error) {
        setProfile((response.data ?? null) as Profile | null);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const activityName =
    text(profile?.activity_name) || text(profile?.nickname) || userName || "회원";
  const role = text(profile?.site_role || profile?.role).toUpperCase();
  const isManager = ["MAIN_ADMIN", "ADMIN", "RULE_MASTER", "RULEMASTER"].includes(role);

  const desktopName = [
    activityName,
    text(profile?.birth_year),
    text(profile?.region),
    text(profile?.gender),
  ]
    .filter(Boolean)
    .join(" / ");

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <header className="siteHeader">
      <div className="headerInner">
        <Link href="/" className="brand" aria-label="보드라운지 홈">
          <span>WAWEDO</span>
          <strong>보드라운지</strong>
        </Link>

        <nav className="desktopNav" aria-label="주 메뉴">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className={pathname === href ? "active" : ""}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="desktopAccount">
          {isManager && <Link href="/admin" className="adminButton">⚙ 관리자</Link>}
          {loggedIn ? (
            <>
              <Link href="/notifications" className="roundButton" aria-label="알림">🔔</Link>
              <Link href="/mypage" className="desktopUser">🌱 {desktopName}</Link>
              <button type="button" className="logout" onClick={logout}>로그아웃</button>
            </>
          ) : (
            <Link href="/login" className="loginButton">로그인</Link>
          )}
        </div>

        <div className="mobileAccount">
          {loggedIn ? (
            <Link href="/mypage" className="mobileUser" aria-label="마이페이지">
              <span aria-hidden="true">🌱</span>
              <b>{activityName}</b>
            </Link>
          ) : (
            <Link href="/login" className="mobileLogin">로그인</Link>
          )}
          <button
            type="button"
            className="menuButton"
            aria-label={menuOpen ? "전체 메뉴 닫기" : "전체 메뉴 열기"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="menuText">메뉴</span>
            <span className="menuLines" aria-hidden="true"><i /><i /><i /></span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="mobilePanel">
          <button className="backdrop" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)} />
          <nav className="mobileNav" aria-label="모바일 주 메뉴">
            <div className="mobileNavHead">
              <b>전체 메뉴</b>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기">×</button>
            </div>
            <div className="mobileNavGrid">
              {links.map(([href, label]) => (
                <Link key={href} href={href} className={pathname === href ? "active" : ""}>
                  {label}<span>›</span>
                </Link>
              ))}
              {isManager && <Link href="/admin" className="managerLink">관리자 페이지<span>›</span></Link>}
              {loggedIn && <Link href="/notifications">알림<span>›</span></Link>}
            </div>
            {loggedIn && <button type="button" className="mobileLogout" onClick={logout}>로그아웃</button>}
          </nav>
        </div>
      )}

      <style jsx>{`
        .siteHeader{position:relative;z-index:1000;width:100%;border-bottom:1px solid #2b2b2d;background:#09090b;color:#fff}
        .headerInner{width:min(1232px,calc(100% - 40px));min-height:92px;margin:0 auto;display:flex;align-items:center;gap:28px}
        .brand{display:flex;flex-direction:column;flex:none;text-decoration:none;color:#fff;line-height:1}.brand span{margin-bottom:8px;color:#ffc400;font-size:11px;font-weight:800;letter-spacing:.28em}.brand strong{font-size:23px;white-space:nowrap}
        .desktopNav{display:flex;align-items:center;justify-content:center;gap:22px;margin-left:auto}.desktopNav a{color:#aaa;text-decoration:none;font-size:13px;font-weight:700;white-space:nowrap}.desktopNav a:hover,.desktopNav a.active{color:#fff}
        .desktopAccount{display:flex;align-items:center;gap:9px;flex:none}.adminButton,.loginButton{border:1px solid #8c6900;border-radius:999px;padding:11px 16px;color:#ffc400;text-decoration:none;font-size:13px;font-weight:800;white-space:nowrap}.roundButton{display:grid;width:42px;height:42px;place-items:center;border:1px solid #38383c;border-radius:50%;text-decoration:none}.desktopUser{max-width:230px;overflow:hidden;text-overflow:ellipsis;border:1px solid #38383c;border-radius:999px;padding:11px 14px;color:#eee;text-decoration:none;font-size:13px;font-weight:700;white-space:nowrap}.logout{border:0;background:transparent;color:#777;cursor:pointer}
        .mobileAccount{display:none}.mobilePanel{display:none}
        @media(max-width:900px){
          .headerInner{width:100%;min-height:76px;padding:12px 16px;gap:10px}.brand span{margin-bottom:6px;font-size:9px}.brand strong{font-size:20px}.desktopNav,.desktopAccount{display:none}.mobileAccount{display:flex;align-items:center;gap:8px;margin-left:auto;min-width:0}.mobileUser{display:flex;align-items:center;gap:6px;min-width:0;max-width:116px;border:1px solid #343438;border-radius:999px;padding:9px 11px;color:#fff;text-decoration:none}.mobileUser b{overflow:hidden;text-overflow:ellipsis;font-size:13px;white-space:nowrap}.mobileLogin{color:#ffc400;text-decoration:none;font-size:13px;font-weight:800}.menuButton{display:flex;align-items:center;gap:8px;min-height:46px;border:1px solid #9b7400;border-radius:14px;padding:0 12px;background:#18150c;color:#ffc400;font-weight:900;cursor:pointer}.menuText{font-size:13px}.menuLines{display:flex;width:20px;flex-direction:column;gap:4px}.menuLines i{display:block;height:2px;border-radius:2px;background:currentColor}.mobilePanel{display:block;position:fixed;inset:0;z-index:1100}.backdrop{position:absolute;inset:0;border:0;background:rgba(0,0,0,.7)}.mobileNav{position:absolute;top:0;right:0;width:min(88vw,360px);height:100%;overflow:auto;background:#111113;padding:20px;box-shadow:-16px 0 50px rgba(0,0,0,.5)}.mobileNavHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid #333}.mobileNavHead b{font-size:21px}.mobileNavHead button{width:40px;height:40px;border:1px solid #444;border-radius:50%;background:#202023;color:#fff;font-size:28px}.mobileNavGrid{display:grid;gap:9px}.mobileNavGrid a{display:flex;align-items:center;justify-content:space-between;min-height:52px;border:1px solid #303035;border-radius:13px;padding:0 16px;color:#eee;text-decoration:none;font-size:15px;font-weight:800}.mobileNavGrid a.active{border-color:#a77c00;background:#211b09;color:#ffc400}.mobileNavGrid a.managerLink{border-color:#6b4f00;color:#ffc400}.mobileNavGrid a span{font-size:22px;color:#777}.mobileLogout{width:100%;margin-top:20px;border:1px solid #6b2525;border-radius:13px;padding:14px;background:transparent;color:#ff8585;font-weight:800}
        }
        @media(max-width:390px){.headerInner{padding-inline:12px}.brand strong{font-size:18px}.mobileUser{max-width:92px;padding-inline:9px}.menuButton{padding-inline:10px}.menuText{display:none}}
      `}</style>
    </header>
  );
}
