"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Game = {
  id: string;
  name: string;
  type?: string | null;
  min_players?: number | null;
  max_players?: number | null;
  best_players?: string | number | null;
  play_time?: number | null;
  difficulty?: number | null;
  publisher?: string | null;
  thumbnail?: string | null;
  description?: string | null;
  genre?: string | null;
  weight?: number | null;
  icon?: string | null;
  min_age?: number | null;
  year_published?: number | null;
  bgg_url?: string | null;
  bgg_id?: number | null;
};

type Props = {
  initialGames: Game[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  query: string;
  selectedGenre: string;
  genres: string[];
  canManage: boolean;
};

function pageHref(page: number, query: string, genre: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (genre) params.set("genre", genre);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/boardgames?${suffix}` : "/boardgames";
}

export default function BoardgameList({
  initialGames,
  totalCount,
  currentPage,
  pageSize,
  query,
  selectedGenre,
  genres,
  canManage,
}: Props) {
  const [games, setGames] = useState<Game[]>(initialGames);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [coverGame, setCoverGame] = useState<Game | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    setGames(initialGames);
  }, [initialGames]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const firstItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, totalCount);

  const visiblePages = useMemo(() => {
    const start = Math.max(1, Math.min(currentPage - 3, totalPages - 6));
    const end = Math.min(totalPages, start + 6);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [currentPage, totalPages]);

  async function removeGame(game: Game) {
    if (!canManage || !window.confirm(`“${game.name}”을(를) 삭제할까요?`)) return;

    setBusyId(game.id);
    const { error } = await supabase.from("games").delete().eq("id", game.id);
    setBusyId(null);

    if (error) {
      window.alert(`삭제하지 못했습니다.\n${error.message}`);
      return;
    }

    setGames((current) => current.filter((item) => item.id !== game.id));
    router.refresh();
  }

  function chooseCover(game: Game) {
    if (!canManage) return;
    setCoverGame(game);
    fileInput.current?.click();
  }

  async function uploadCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const game = coverGame;
    event.target.value = "";
    if (!file || !game) return;

    setBusyId(game.id);
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${game.id}/${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("game-covers")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setBusyId(null);
      window.alert(`표지를 업로드하지 못했습니다.\n${uploadError.message}`);
      return;
    }

    const { data } = supabase.storage.from("game-covers").getPublicUrl(path);
    const publicUrl = data.publicUrl;
    const { error: updateError } = await supabase
      .from("games")
      .update({ thumbnail: publicUrl })
      .eq("id", game.id);

    setBusyId(null);
    if (updateError) {
      window.alert(`표지 주소를 저장하지 못했습니다.\n${updateError.message}`);
      return;
    }

    setGames((current) =>
      current.map((item) => (item.id === game.id ? { ...item, thumbnail: publicUrl } : item)),
    );
    router.refresh();
  }

  return (
    <>
      <form className="filters" method="get">
        <input
          name="q"
          defaultValue={query}
          placeholder="게임 이름 또는 출판사 검색"
          aria-label="게임 검색"
        />
        <select name="genre" defaultValue={selectedGenre} aria-label="장르 선택">
          <option value="">전체 장르</option>
          {genres.map((genre) => (
            <option key={genre} value={genre}>
              {genre}
            </option>
          ))}
        </select>
        <button type="submit">검색</button>
      </form>

      <div className="summary">
        <span>
          총 <b>{totalCount}</b>개의 게임
        </span>
        <span>
          {firstItem}–{lastItem} 표시
        </span>
      </div>

      <section className="gameList">
        {games.length === 0 ? (
          <div className="empty">검색 조건에 맞는 게임이 없습니다.</div>
        ) : (
          games.map((game) => (
            <article className="gameRow" key={game.id}>
              <Link className="cover" href={`/boardgames/${game.id}`}>
                {game.thumbnail ? (
                  <img src={game.thumbnail} alt={`${game.name} 표지`} />
                ) : (
                  <span aria-hidden="true">{game.icon || "🎲"}</span>
                )}
              </Link>

              <div className="gameBody">
                <Link className="title" href={`/boardgames/${game.id}`}>
                  {game.name}
                </Link>
                <p className="meta">
                  {game.genre || "장르 미정"} · {game.min_players ?? "–"}~
                  {game.max_players ?? "–"}명 · {game.play_time ? `${game.play_time}분` : "시간 미정"}
                </p>
                <p className="publisher">{game.publisher || "출판사 미정"}</p>

                {canManage && (
                  <div className="managerActions">
                    <button
                      type="button"
                      className="coverButton"
                      onClick={() => chooseCover(game)}
                      disabled={busyId === game.id}
                    >
                      표지 교체
                    </button>
                    <Link href={`/admin/library?type=boardgame&edit=${encodeURIComponent(game.id)}`}>
                      정보 수정
                    </Link>
                    <button
                      type="button"
                      className="deleteButton"
                      onClick={() => removeGame(game)}
                      disabled={busyId === game.id}
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </section>

      <input ref={fileInput} type="file" accept="image/*" hidden onChange={uploadCover} />

      {totalPages > 1 && (
        <nav className="pagination" aria-label="보드게임 페이지">
          {currentPage > 1 && <Link href={pageHref(currentPage - 1, query, selectedGenre)}>이전</Link>}
          {visiblePages.map((page) => (
            <Link
              key={page}
              href={pageHref(page, query, selectedGenre)}
              className={page === currentPage ? "active" : ""}
              aria-current={page === currentPage ? "page" : undefined}
            >
              {page}
            </Link>
          ))}
          {currentPage < totalPages && <Link href={pageHref(currentPage + 1, query, selectedGenre)}>다음</Link>}
        </nav>
      )}

      <style jsx>{`
        .filters {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 260px 76px;
          gap: 12px;
          padding: 20px;
          border: 1px solid #2d2d2d;
          border-radius: 20px;
          background: #111113;
        }
        .filters input,
        .filters select {
          min-width: 0;
          height: 52px;
          padding: 0 16px;
          border: 1px solid #36363a;
          border-radius: 12px;
          background: #1a1a1d;
          color: #fff;
          font: inherit;
        }
        .filters button {
          border: 0;
          border-radius: 12px;
          background: #ffbd00;
          color: #090909;
          font-weight: 900;
          cursor: pointer;
        }
        .summary {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin: 28px 0 14px;
          color: #9aa8bf;
        }
        .summary b {
          color: #ffbd00;
        }
        .gameList {
          overflow: hidden;
          border: 1px solid #2b2b2e;
          border-radius: 22px;
          background: #09090a;
        }
        .gameRow {
          display: grid;
          grid-template-columns: 150px minmax(0, 1fr);
          gap: 24px;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #262629;
        }
        .gameRow:last-child {
          border-bottom: 0;
        }
        .cover {
          display: grid;
          width: 150px;
          height: 110px;
          place-items: center;
          overflow: hidden;
          border: 1px solid #37373a;
          border-radius: 14px;
          background: #171719;
          text-decoration: none;
        }
        .cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .cover span {
          font-size: 42px;
        }
        .gameBody {
          min-width: 0;
        }
        .title {
          display: inline-block;
          margin-bottom: 9px;
          color: #fff;
          font-size: 20px;
          font-weight: 900;
          text-decoration: none;
        }
        .meta,
        .publisher {
          margin: 0;
          color: #9aa8bf;
          line-height: 1.55;
        }
        .publisher {
          margin-top: 3px;
          color: #71809a;
        }
        .managerActions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 14px;
        }
        .managerActions a,
        .managerActions button {
          min-height: 36px;
          padding: 7px 12px;
          border-radius: 10px;
          background: transparent;
          font: inherit;
          font-size: 13px;
          font-weight: 800;
          text-decoration: none;
          cursor: pointer;
        }
        .coverButton {
          border: 1px solid #07b7d6;
          color: #3bdaf5;
        }
        .managerActions a {
          border: 1px solid #9a7200;
          color: #ffcc38;
        }
        .deleteButton {
          border: 1px solid #842733;
          color: #ff6b78;
        }
        .managerActions button:disabled {
          cursor: wait;
          opacity: 0.5;
        }
        .empty {
          padding: 72px 20px;
          text-align: center;
          color: #77839a;
        }
        .pagination {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px;
          margin-top: 26px;
        }
        .pagination a {
          display: grid;
          min-width: 42px;
          height: 42px;
          place-items: center;
          padding: 0 12px;
          border: 1px solid #343438;
          border-radius: 10px;
          color: #d5d5d5;
          text-decoration: none;
        }
        .pagination a.active {
          border-color: #ffbd00;
          background: #ffbd00;
          color: #090909;
          font-weight: 900;
        }
        @media (max-width: 700px) {
          .filters {
            grid-template-columns: minmax(0, 1fr) 112px;
            padding: 14px;
          }
          .filters input {
            grid-column: 1 / -1;
          }
          .filters button {
            min-height: 52px;
          }
          .summary {
            margin-top: 22px;
            font-size: 14px;
          }
          .gameRow {
            grid-template-columns: 104px minmax(0, 1fr);
            gap: 14px;
            padding: 14px;
          }
          .cover {
            width: 104px;
            height: 104px;
          }
          .title {
            margin-bottom: 6px;
            font-size: 17px;
          }
          .meta,
          .publisher {
            font-size: 13px;
          }
          .managerActions {
            gap: 6px;
            margin-top: 10px;
          }
          .managerActions a,
          .managerActions button {
            min-height: 32px;
            padding: 5px 8px;
            font-size: 11px;
          }
        }
      `}</style>
    </>
  );
}
