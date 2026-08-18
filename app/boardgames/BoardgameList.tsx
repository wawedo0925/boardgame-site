"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const PAGE_SIZE = 10;

function roleIsManager(value: unknown) {
  return ["MAIN_ADMIN", "ADMIN", "RULEMASTER", "MASTER", "MANAGER"].includes(String(value ?? "").toUpperCase());
}

function text(value: unknown, fallback = "미정") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

export default function BoardgameList(props: any) {
  const suppliedGames = props.games ?? props.initialGames ?? props.boardgames ?? [];
  const [games, setGames] = useState<any[]>(Array.isArray(suppliedGames) ? suppliedGames : []);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("전체 장르");
  const [page, setPage] = useState(1);
  const [canManage, setCanManage] = useState(Boolean(props.canManage ?? props.isManager ?? props.isAdmin ?? props.isSiteAdmin));
  const fileInput = useRef<HTMLInputElement | null>(null);
  const uploadTarget = useRef<any>(null);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    setGames(Array.isArray(suppliedGames) ? suppliedGames : []);
  }, [props.games, props.initialGames, props.boardgames]);

  useEffect(() => {
    if (canManage) return;
    let alive = true;
    async function checkRole() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { data: profile } = await supabase.from("profiles").select("site_role,role").eq("id", data.user.id).maybeSingle();
      if (alive) setCanManage(roleIsManager(profile?.site_role ?? profile?.role));
    }
    void checkRole();
    return () => { alive = false; };
  }, [canManage, supabase]);

  const genres = useMemo(() => {
    const values = games.map((game) => text(game.genre, "")).filter(Boolean);
    return ["전체 장르", ...Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "ko"))];
  }, [games]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ko");
    return games.filter((game) => {
      const matchesQuery = !keyword || `${game.name ?? ""} ${game.publisher ?? ""}`.toLocaleLowerCase("ko").includes(keyword);
      const matchesGenre = genre === "전체 장르" || text(game.genre, "") === genre;
      return matchesQuery && matchesGenre;
    });
  }, [games, query, genre]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleGames = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [query, genre]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  function movePage(next: number) {
    setPage(Math.min(totalPages, Math.max(1, next)));
    document.getElementById("boardgame-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function removeGame(game: any) {
    if (!canManage || !window.confirm(`'${game.name}' 게임을 삭제할까요?`)) return;
    const { error } = await supabase.from("games").delete().eq("id", game.id);
    if (error) return window.alert(`삭제 실패: ${error.message}`);
    setGames((current) => current.filter((item) => item.id !== game.id));
    router.refresh();
  }

  function chooseCover(game: any) {
    uploadTarget.current = game;
    fileInput.current?.click();
  }

  async function uploadCover(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const game = uploadTarget.current;
    event.target.value = "";
    if (!file || !game) return;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${game.id}/${Date.now()}-${safeName}`;
    const uploaded = await supabase.storage.from("game-covers").upload(path, file, { upsert: true });
    if (uploaded.error) return window.alert(`표지 업로드 실패: ${uploaded.error.message}`);
    const { data } = supabase.storage.from("game-covers").getPublicUrl(path);
    const updated = await supabase.from("games").update({ thumbnail: data.publicUrl }).eq("id", game.id);
    if (updated.error) return window.alert(`표지 저장 실패: ${updated.error.message}`);
    setGames((current) => current.map((item) => item.id === game.id ? { ...item, thumbnail: data.publicUrl } : item));
  }

  return (
    <section id="boardgame-list" className="boardgameList">
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={uploadCover} />

      <div className="filters">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="게임 이름 또는 출판사 검색" />
        <select value={genre} onChange={(event) => setGenre(event.target.value)}>
          {genres.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>

      <p className="count">총 <b>{filtered.length}</b>개의 게임</p>

      <div className="cards">
        {visibleGames.map((game) => {
          const min = game.min_players ?? game.minPlayers;
          const max = game.max_players ?? game.maxPlayers;
          const playerText = min && max ? `${min}~${max}명` : min ? `${min}명 이상` : "인원 미정";
          const image = game.thumbnail || game.cover_url || game.image_url;
          return (
            <article className="card" key={game.id}>
              <Link href={`/boardgames/${game.id}`} className="coverLink" aria-label={`${game.name} 상세 정보`}>
                {image ? <img src={image} alt={`${game.name} 표지`} loading="lazy" /> : <span>🎲</span>}
              </Link>
              <div className="info">
                <Link href={`/boardgames/${game.id}`} className="title">{text(game.name)}</Link>
                <p>{text(game.genre)} · {playerText} · {game.play_time ? `${game.play_time}분` : "시간 미정"}</p>
                <p className="publisher">{text(game.publisher, "출판사 미정")}</p>
                <Link href={`/boardgames/${game.id}`} className="detail">상세 정보 보기 →</Link>
              </div>
              {canManage && (
                <div className="actions">
                  <button type="button" className="cover" onClick={() => chooseCover(game)}>표지 교체</button>
                  <Link href={`/admin/library?gameId=${encodeURIComponent(game.id)}`}>정보 수정</Link>
                  <button type="button" className="delete" onClick={() => removeGame(game)}>삭제</button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {totalPages > 1 && (
        <nav className="pagination" aria-label="보드게임 페이지">
          <button type="button" disabled={page === 1} onClick={() => movePage(page - 1)}>이전</button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => (
            <button key={number} type="button" className={number === page ? "active" : ""} onClick={() => movePage(number)}>{number}</button>
          ))}
          <button type="button" disabled={page === totalPages} onClick={() => movePage(page + 1)}>다음</button>
        </nav>
      )}

      <style jsx>{`
        .boardgameList{width:min(1232px,calc(100% - 40px));margin:0 auto 80px;color:#fff;scroll-margin-top:20px}
        .filters{display:grid;grid-template-columns:1fr 280px;gap:14px;padding:20px;border:1px solid #303034;border-radius:24px;background:#111114}
        .filters input,.filters select{height:52px;border:1px solid #38383d;border-radius:14px;background:#1a1a1e;color:#eee;padding:0 16px;font-size:15px}
        .count{margin:28px 0 18px;color:#9ba6bc}.count b{color:#ffbd00}
        .cards{display:grid;gap:14px}
        .card{display:grid;grid-template-columns:120px minmax(0,1fr) auto;gap:22px;align-items:center;min-height:180px;padding:22px;border:1px solid #303034;border-radius:22px;background:#0c0c0f}
        .coverLink{width:120px;height:140px;display:grid;place-items:center;border-radius:16px;overflow:hidden;background:#191919;text-decoration:none}
        .coverLink img{width:100%;height:100%;object-fit:cover}.coverLink span{font-size:40px}
        .info{min-width:0}.title{display:block;color:#fff;text-decoration:none;font-size:22px;font-weight:900;margin-bottom:14px}.title:hover{color:#ffbd00}
        .info p{margin:6px 0;color:#a4aec1;font-size:15px}.publisher{color:#68758c!important}.detail{display:inline-block;margin-top:10px;color:#ffbd00;text-decoration:none;font-size:13px;font-weight:800}
        .actions{display:flex;gap:8px;align-items:center}.actions button,.actions a{height:40px;display:inline-flex;align-items:center;justify-content:center;border-radius:11px;padding:0 13px;background:transparent;text-decoration:none;font-size:13px;font-weight:900;cursor:pointer}
        .actions .cover{border:1px solid #00b9d7;color:#19d6f2}.actions a{border:1px solid #9b7500;color:#ffbd00}.actions .delete{border:1px solid #7e2630;color:#ff6e78}
        .pagination{display:flex;flex-wrap:wrap;justify-content:center;gap:7px;margin-top:28px}.pagination button{min-width:42px;height:42px;border:1px solid #393939;border-radius:11px;background:#131315;color:#bbb;cursor:pointer}.pagination button.active{border-color:#ffbd00;background:#ffbd00;color:#111;font-weight:900}.pagination button:disabled{opacity:.35;cursor:not-allowed}
        @media(max-width:760px){
          .boardgameList{width:calc(100% - 28px);margin-bottom:50px}
          .filters{grid-template-columns:1fr;padding:14px;border-radius:18px}
          .card{grid-template-columns:105px minmax(0,1fr);gap:15px;min-height:0;padding:15px;border-radius:18px;align-items:start}
          .coverLink{width:105px;height:132px;border-radius:13px}
          .title{font-size:19px;margin:4px 0 11px}.info p{font-size:13px;line-height:1.55;margin:3px 0}.detail{margin-top:7px}
          .actions{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-top:2px}.actions button,.actions a{width:100%;padding:0 8px}
          .pagination{gap:5px}.pagination button{min-width:36px;height:38px;font-size:12px}
        }
        @media(max-width:380px){.card{grid-template-columns:92px minmax(0,1fr);padding:12px;gap:12px}.coverLink{width:92px;height:120px}.title{font-size:17px}.info p{font-size:12px}.actions button,.actions a{font-size:11px}}
      `}</style>
    </section>
  );
}
