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

function isManager(profile: Profile | null) {
  const role = String(profile?.site_role ?? profile?.role ?? "").toUpperCase();
  return ["MAIN_ADMIN", "ADMIN", "RULEMASTER", "MASTER", "MANAGER"].includes(role);
}

export default function Header() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!alive) return;
      setLoggedIn(Boolean(user));
      if (!user) {
        setProfile(null);
        return;
      }
      const result = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (alive) setProfile((result.data as Profile | null) ?? null);
    }
    void load();
    return () => {
      alive = false;
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

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const activityName = profile?.activity_name?.trim() || profile?.nickname?.trim() || "회원";
  const manager = isManager(profile);
  const fullName = [activityName, profile?.birth_year, profile?.region, profile?.gender]
    .filter((value) => value !== null && value !== undefined && String(value).trim())
    .join(" / ");

  return (
    <header className="siteHeader">
      <div className="headerInner">
        <Link href="/" className="brand" aria-label="보드라운지 홈">
          <strong>보드라운지</strong>
          <span>WAWEDO</span>
        </Link>

        <nav className="desktopNav" aria-label="주 메뉴">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className={pathname === href ? "active" : ""}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="desktopAccount">
          {manager && <Link href="/admin" className="adminButton">⚙ 관리자</Link>}
          {loggedIn && <Link href="/notifications" className="roundButton" aria-label="알림">🔔</Link>}
          {loggedIn ? (
            <>
              <Link href="/mypage" className="profileButton">
                {profile?.avatar_url && <img src={profile.avatar_url} alt="" />}
                <span>🌱 {fullName}</span>
              </Link>
              <button type="button" className="logoutButton" onClick={logout}>로그아웃</button>
            </>
          ) : (
            <Link href="/login" className="loginButton">로그인</Link>
          )}
        </div>

        <div className="mobileAccount">
          {loggedIn ? (
            <Link href="/mypage" className="mobileUser" aria-label="마이페이지">🌱 {activityName}</Link>
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
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="mobileMenu" role="dialog" aria-label="전체 메뉴">
          <nav>
            {links.map(([href, label]) => (
              <Link key={href} href={href} className={pathname === href ? "active" : ""}>
                <span>{label}</span><b>›</b>
              </Link>
            ))}
            {manager && <Link href="/admin"><span>관리자 페이지</span><b>›</b></Link>}
            {loggedIn && <Link href="/notifications"><span>알림</span><b>›</b></Link>}
          </nav>
          {loggedIn && <button type="button" onClick={logout}>로그아웃</button>}
        </div>
      )}

      <style jsx>{`
        .siteHeader{position:relative;z-index:1000;width:100%;border-bottom:1px solid #292929;background:#09090b;color:#fff}
        .headerInner{width:min(1232px,calc(100% - 40px));min-height:92px;margin:0 auto;display:flex;align-items:center;gap:28px}
        .brand{display:flex;flex-direction:column;text-decoration:none;line-height:1;flex:none}
        .brand strong{color:#ffbd00;font-size:25px;font-weight:900;letter-spacing:-1px;order:1}
        .brand span{align-self:flex-end;margin-top:6px;color:#9b9b9b;font-size:9px;font-weight:800;letter-spacing:2px;order:2}
        .desktopNav{display:flex;align-items:center;justify-content:center;gap:22px;margin-left:auto}
        .desktopNav a{color:#aaa;text-decoration:none;font-size:13px;font-weight:700;white-space:nowrap}
        .desktopNav a:hover,.desktopNav a.active{color:#ffbd00}
        .desktopAccount{display:flex;align-items:center;gap:9px;margin-left:auto;white-space:nowrap}
        .adminButton,.loginButton{border:1px solid #8c6900;border-radius:999px;padding:10px 14px;color:#ffbd00;text-decoration:none;font-weight:800;font-size:12px}
        .roundButton{width:40px;height:40px;display:grid;place-items:center;border:1px solid #383838;border-radius:50%;text-decoration:none}
        .profileButton{display:flex;align-items:center;gap:8px;max-width:250px;border:1px solid #383838;border-radius:999px;padding:6px 12px 6px 7px;color:#eee;text-decoration:none;font-size:12px;font-weight:700}
        .profileButton img{width:30px;height:30px;border-radius:50%;object-fit:cover}
        .profileButton span{overflow:hidden;text-overflow:ellipsis}
        .logoutButton{border:0;background:transparent;color:#666;cursor:pointer}
        .mobileAccount{display:none}
        .mobileMenu{display:none}
        @media(max-width:900px){
          .headerInner{width:100%;min-height:78px;padding:12px 16px;gap:10px}
          .brand strong{font-size:22px}.brand span{font-size:8px;margin-top:5px}
          .desktopNav,.desktopAccount{display:none}
          .mobileAccount{margin-left:auto;display:flex;align-items:center;gap:9px;min-width:0}
          .mobileUser,.mobileLogin{max-width:126px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff;text-decoration:none;font-size:15px;font-weight:900}
          .menuButton{width:52px;height:52px;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border:1px solid #8c6900;border-radius:18px;background:#17140c;cursor:pointer}
          .menuButton span{width:25px;height:3px;border-radius:3px;background:#ffbd00}
          .mobileMenu{position:fixed;inset:78px 0 0;z-index:1001;display:flex;flex-direction:column;background:rgba(8,8,10,.98);padding:18px 16px 28px;overflow-y:auto}
          .mobileMenu nav{display:grid;gap:8px}
          .mobileMenu a{min-height:56px;display:flex;align-items:center;justify-content:space-between;border:1px solid #2d2d2d;border-radius:14px;padding:0 18px;color:#eee;text-decoration:none;font-size:16px;font-weight:800;background:#121214}
          .mobileMenu a.active{border-color:#9a7200;color:#ffbd00;background:#1c1709}
          .mobileMenu b{color:#ffbd00;font-size:24px}
          .mobileMenu>button{min-height:50px;margin-top:16px;border:1px solid #633;border-radius:14px;background:transparent;color:#ff7777;font-weight:800}
        }
        @media(max-width:380px){.headerInner{padding-inline:12px}.brand strong{font-size:19px}.mobileUser{max-width:88px;font-size:14px}.menuButton{width:48px;height:48px}}
      `}</style>
    </header>
  );
}
