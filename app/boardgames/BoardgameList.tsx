"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type Game = {
  id: string;
  name?: string | null;
  genre?: string | null;
  min_players?: number | null;
  max_players?: number | null;
  best_players?: string | null;
  play_time?: number | null;
  difficulty?: number | string | null;
  weight?: number | string | null;
  publisher?: string | null;
  thumbnail?: string | null;
  icon?: string | null;
};

type Props = {
  games: Game[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  query: string;
  selectedGenre: string;
  genres: string[];
  canManage: boolean;
};

function playerText(game: Game) {
  if (game.min_players && game.max_players) {
    return game.min_players === game.max_players
      ? `${game.min_players}명`
      : `${game.min_players}~${game.max_players}명`;
  }
  if (game.min_players) return `${game.min_players}명 이상`;
  if (game.max_players) return `${game.max_players}명 이하`;
  return "인원 미정";
}

function pageNumbers(current: number, total: number) {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, Math.max(5, current + 2));
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

export default function BoardgameList({
  games: suppliedGames,
  totalCount,
  currentPage,
  pageSize,
  query,
  selectedGenre,
  genres,
  canManage,
}: Props) {
  const [games, setGames] = useState<Game[]>(suppliedGames);
  const [searchText, setSearchText] = useState(query);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const uploadTarget = useRef<Game | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    setGames(suppliedGames);
    setSearchText(query);
  }, [suppliedGames, query]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  function move(next: { page?: number; q?: string; genre?: string }) {
    const params = new URLSearchParams(searchParams.toString());

    if (next.page !== undefined) {
      if (next.page <= 1) params.delete("page");
      else params.set("page", String(next.page));
    }
    if (next.q !== undefined) {
      if (next.q.trim()) params.set("q", next.q.trim());
      else params.delete("q");
    }
    if (next.genre !== undefined) {
      if (next.genre) params.set("genre", next.genre);
      else params.delete("genre");
    }

    router.push(params.size ? `${pathname}?${params.toString()}` : pathname);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    move({ q: searchText, page: 1 });
  }

  async function removeGame(game: Game) {
    if (!canManage || !window.confirm(`‘${game.name ?? "게임"}’을 삭제할까요?`)) return;
    setBusyId(game.id);
    const { error } = await supabase.from("games").delete().eq("id", game.id);
    setBusyId(null);
    if (error) {
      window.alert(`삭제하지 못했습니다. ${error.message}`);
      return;
    }
    router.refresh();
  }

  function chooseCover(game: Game) {
    uploadTarget.current = game;
    fileInput.current?.click();
  }

  async function uploadCover(file: File) {
    const game = uploadTarget.current;
    if (!game || !canManage) return;

    setBusyId(game.id);
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const objectPath = `${game.id}/${Date.now()}.${extension}`;
    let publicUrl = "";
    let lastError = "";

    for (const bucket of ["game-covers", "boardgame-covers", "covers"]) {
      const result = await supabase.storage.from(bucket).upload(objectPath, file, {
        cacheControl: "3600",
        upsert: true,
      });
      if (!result.error) {
        publicUrl = supabase.storage.from(bucket).getPublicUrl(result.data.path).data.publicUrl;
        break;
      }
      lastError = result.error.message;
    }

    if (!publicUrl) {
      setBusyId(null);
      window.alert(`표지를 업로드하지 못했습니다. ${lastError}`);
      return;
    }

    const { error } = await supabase
      .from("games")
      .update({ thumbnail: publicUrl })
      .eq("id", game.id);

    setBusyId(null);
    if (error) {
      window.alert(`표지를 저장하지 못했습니다. ${error.message}`);
      return;
    }

    setGames((current) =>
      current.map((item) => (item.id === game.id ? { ...item, thumbnail: publicUrl } : item)),
    );
    router.refresh();
  }

  return (
    <section className="boardgame-browser">
      <form className="filters" onSubmit={submitSearch}>
        <div className="search-row">
          <input
            aria-label="게임 이름 또는 출판사 검색"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="게임 이름 또는 출판사 검색"
          />
          <button type="submit">검색</button>
        </div>

        <select
          aria-label="장르 선택"
          value={selectedGenre}
          onChange={(event) => move({ genre: event.target.value, page: 1 })}
        >
          <option value="">전체 장르</option>
          {genres.map((genre) => (
            <option key={genre} value={genre}>
              {genre}
            </option>
          ))}
        </select>
      </form>

      <div className="result-head">
        <p>
          총 <b>{totalCount}</b>개의 게임
        </p>
        <span>
          {Math.min(totalCount, (currentPage - 1) * pageSize + 1)}–
          {Math.min(totalCount, currentPage * pageSize)} 표시
        </span>
      </div>

      {games.length ? (
        <div className="game-list">
          {games.map((game) => (
            <article className="game-card" key={game.id}>
              <Link className="cover-link" href={`/boardgames/${game.id}`}>
                {game.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={game.thumbnail} alt={`${game.name ?? "보드게임"} 표지`} />
                ) : (
                  <span className="cover-placeholder" aria-hidden="true">
                    {game.icon || "🎲"}
                  </span>
                )}
              </Link>

              <div className="game-info">
                <Link className="game-name" href={`/boardgames/${game.id}`}>
                  {game.name || "이름 미정"}
                </Link>
                <p className="game-summary">
                  {game.genre || "장르 미정"} · {playerText(game)} ·{" "}
                  {game.play_time ? `${game.play_time}분` : "시간 미정"}
                </p>
                <p className="publisher">{game.publisher || "출판사 미정"}</p>

                {canManage ? (
                  <div className="admin-actions">
                    <button disabled={busyId === game.id} onClick={() => chooseCover(game)} type="button">
                      표지 교체
                    </button>
                    <Link href={`/admin/library?edit=${game.id}`}>정보 수정</Link>
                    <button
                      className="danger"
                      disabled={busyId === game.id}
                      onClick={() => removeGame(game)}
                      type="button"
                    >
                      삭제
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">조건에 맞는 게임이 없습니다.</div>
      )}

      {totalPages > 1 ? (
        <nav className="pagination" aria-label="보드게임 페이지 이동">
          <button disabled={currentPage <= 1} onClick={() => move({ page: currentPage - 1 })}>
            이전
          </button>
          {pageNumbers(currentPage, totalPages).map((number) => (
            <button
              aria-current={number === currentPage ? "page" : undefined}
              className={number === currentPage ? "current" : ""}
              key={number}
              onClick={() => move({ page: number })}
            >
              {number}
            </button>
          ))}
          <button disabled={currentPage >= totalPages} onClick={() => move({ page: currentPage + 1 })}>
            다음
          </button>
        </nav>
      ) : null}

      <input
        accept="image/*"
        className="hidden-file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadCover(file);
          event.currentTarget.value = "";
        }}
        ref={fileInput}
        type="file"
      />

      <style jsx>{`
        .boardgame-browser{max-width:1232px;margin:0 auto;padding:0 20px}
        .filters{border:1px solid #292b2f;border-radius:22px;padding:20px;background:#111214;display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:14px}
        .search-row{display:flex;gap:10px;min-width:0}
        input,select{width:100%;min-height:52px;border:1px solid #33363b;border-radius:14px;background:#191a1d;color:#fff;padding:0 16px;font-size:15px}
        .search-row button,.pagination button{border:1px solid #8c6900;border-radius:13px;background:#ffbd00;color:#090a0b;font-weight:900;padding:0 20px;cursor:pointer}
        .result-head{display:flex;align-items:center;justify-content:space-between;margin:34px 0 18px;color:#9ba7bd}
        .result-head p{margin:0;font-size:18px}.result-head b{color:#ffbd00}.result-head span{font-size:13px}
        .game-list{display:grid;gap:14px}
        .game-card{min-width:0;border:1px solid #292b2f;border-radius:22px;background:#0d0e10;padding:20px;display:grid;grid-template-columns:150px minmax(0,1fr);gap:24px;overflow:hidden}
        .cover-link{display:block;width:150px;height:150px;border-radius:18px;overflow:hidden;background:#17181b}
        .cover-link img{width:100%;height:100%;display:block;object-fit:cover}
        .cover-placeholder{width:100%;height:100%;display:grid;place-items:center;font-size:44px}
        .game-info{min-width:0;display:flex;flex-direction:column;justify-content:center;align-items:flex-start}
        .game-name{color:#fff;text-decoration:none;font-size:25px;font-weight:900;line-height:1.3}
        .game-summary{margin:14px 0 0;color:#a6b2c8;font-size:16px;line-height:1.6;overflow-wrap:anywhere}
        .publisher{margin:5px 0 0;color:#647089;font-size:15px}
        .admin-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:20px}
        .admin-actions button,.admin-actions a{min-height:38px;border:1px solid #8c6900;border-radius:11px;background:transparent;color:#ffcf3f;padding:8px 13px;text-decoration:none;font-weight:800;cursor:pointer}
        .admin-actions button:first-child{background:#08b7d1;border-color:#08b7d1;color:#071013}
        .admin-actions .danger{border-color:#8f2730;color:#ff6b74}
        .admin-actions button:disabled,.pagination button:disabled{opacity:.45;cursor:not-allowed}
        .empty{border:1px dashed #34363a;border-radius:20px;padding:70px 20px;text-align:center;color:#7d879b}
        .pagination{display:flex;justify-content:center;align-items:center;gap:8px;margin-top:30px;flex-wrap:wrap}
        .pagination button{min-width:44px;min-height:44px;background:#151619;color:#e8e8e8;border-color:#35383d;padding:8px 13px}
        .pagination .current{background:#ffbd00;color:#08090a;border-color:#ffbd00}
        .hidden-file{display:none}
        @media(max-width:700px){
          .boardgame-browser{padding:0 16px}
          .filters{grid-template-columns:1fr;padding:14px}
          .search-row{display:grid;grid-template-columns:minmax(0,1fr) auto}
          .search-row button{padding:0 16px}
          .result-head{margin-top:26px}
          .game-card{grid-template-columns:112px minmax(0,1fr);gap:16px;padding:16px;border-radius:18px}
          .cover-link{width:112px;height:140px;border-radius:14px}
          .game-name{font-size:21px}
          .game-summary{font-size:14px;margin-top:9px}
          .publisher{font-size:13px}
          .admin-actions{gap:6px;margin-top:13px}
          .admin-actions button,.admin-actions a{font-size:12px;min-height:34px;padding:6px 9px}
        }
        @media(max-width:390px){
          .game-card{grid-template-columns:96px minmax(0,1fr);gap:13px;padding:13px}
          .cover-link{width:96px;height:124px}
          .game-name{font-size:19px}
        }
      `}</style>
    </section>
  );
}
