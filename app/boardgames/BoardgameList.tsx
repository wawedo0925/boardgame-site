"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Game = {
  id: string;
  name: string;
  genre?: string | null;
  min_players?: number | null;
  max_players?: number | null;
  best_players?: string | null;
  play_time?: number | null;
  publisher?: string | null;
  thumbnail?: string | null;
  icon?: string | null;
};

type Props = {
  games: Game[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  genre: string;
  genres: string[];
  canManage: boolean;
};

function pageHref(page: number, query: string, genre: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (genre && genre !== "전체 장르") params.set("genre", genre);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/boardgames?${suffix}` : "/boardgames";
}

function playerText(game: Game) {
  const min = game.min_players;
  const max = game.max_players;
  if (min && max) return min === max ? `${min}명` : `${min}~${max}명`;
  if (min) return `${min}명 이상`;
  if (max) return `${max}명 이하`;
  return "인원 미정";
}

export default function BoardgameList({
  games,
  total,
  page,
  pageSize,
  query,
  genre,
  genres,
  canManage,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [items, setItems] = useState(games);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [coverGame, setCoverGame] = useState<Game | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => setItems(games), [games]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  function chooseCover(game: Game) {
    setCoverGame(game);
    fileInput.current?.click();
  }

  async function uploadCover(event: React.ChangeEvent<HTMLInputElement>) {
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
      alert(`표지를 업로드하지 못했습니다.\n${uploadError.message}`);
      return;
    }

    const { data } = supabase.storage.from("game-covers").getPublicUrl(path);
    const { error } = await supabase
      .from("games")
      .update({ thumbnail: data.publicUrl })
      .eq("id", game.id);

    setBusyId(null);
    if (error) {
      alert(`표지 주소를 저장하지 못했습니다.\n${error.message}`);
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.id === game.id ? { ...item, thumbnail: data.publicUrl } : item,
      ),
    );
    router.refresh();
  }

  async function removeGame(game: Game) {
    if (!confirm(`“${game.name}”을 정말 삭제할까요?`)) return;
    setBusyId(game.id);
    const { error } = await supabase.from("games").delete().eq("id", game.id);
    setBusyId(null);
    if (error) {
      alert(`삭제하지 못했습니다.\n${error.message}`);
      return;
    }
    setItems((current) => current.filter((item) => item.id !== game.id));
    router.refresh();
  }

  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (number) =>
      number === 1 ||
      number === totalPages ||
      Math.abs(number - page) <= 2,
  );

  return (
    <>
      <form className="filters" method="get" action="/boardgames">
        <input
          name="q"
          defaultValue={query}
          placeholder="게임 이름 또는 출판사 검색"
          aria-label="게임 검색"
        />
        <button type="submit">검색</button>
        <select name="genre" defaultValue={genre} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
          <option value="전체 장르">전체 장르</option>
          {genres.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </form>

      <div className="summary">
        <span>총 <b>{total}</b>개의 게임</span>
        <span>{first}–{last} 표시</span>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={uploadCover}
      />

      <div className="gameList">
        {items.length === 0 ? (
          <div className="empty">조건에 맞는 보드게임이 없습니다.</div>
        ) : items.map((game) => (
          <article className="gameRow" key={game.id}>
            <Link href={`/boardgames/${game.id}`} className="coverLink" aria-label={`${game.name} 상세 보기`}>
              {game.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={game.thumbnail} alt={`${game.name} 표지`} loading="lazy" />
              ) : (
                <span className="coverFallback">🎲</span>
              )}
            </Link>

            <div className="info">
              <Link href={`/boardgames/${game.id}`} className="title">{game.name}</Link>
              <p>{game.genre || "장르 미정"} · {playerText(game)} · {game.play_time ? `${game.play_time}분` : "시간 미정"}</p>
              <p className="publisher">{game.publisher || "출판사 미정"}</p>

              {canManage && (
                <div className="managerActions">
                  <button type="button" className="coverButton" disabled={busyId === game.id} onClick={() => chooseCover(game)}>
                    표지 교체
                  </button>
                  <Link className="editButton" href={`/admin/library?edit=${encodeURIComponent(game.id)}&kind=boardgame`}>
                    정보 수정
                  </Link>
                  <button type="button" className="deleteButton" disabled={busyId === game.id} onClick={() => removeGame(game)}>
                    삭제
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {totalPages > 1 && (
        <nav className="pagination" aria-label="보드게임 페이지">
          <Link className={page <= 1 ? "disabled" : ""} aria-disabled={page <= 1} href={pageHref(Math.max(1, page - 1), query, genre)}>이전</Link>
          {pageNumbers.map((number, index) => {
            const previous = pageNumbers[index - 1];
            return (
              <span className="pageGroup" key={number}>
                {previous && number - previous > 1 && <span className="ellipsis">…</span>}
                <Link className={number === page ? "active" : ""} aria-current={number === page ? "page" : undefined} href={pageHref(number, query, genre)}>{number}</Link>
              </span>
            );
          })}
          <Link className={page >= totalPages ? "disabled" : ""} aria-disabled={page >= totalPages} href={pageHref(Math.min(totalPages, page + 1), query, genre)}>다음</Link>
        </nav>
      )}

      <style jsx>{`
        .filters{display:grid;grid-template-columns:minmax(0,1fr) 70px 260px;gap:10px;padding:20px;border:1px solid #2a2a2d;border-radius:22px;background:#111113}
        .filters input,.filters select{min-width:0;height:52px;border:1px solid #343438;border-radius:12px;background:#1a1a1d;color:#fff;padding:0 16px;font:inherit}
        .filters button{border:0;border-radius:12px;background:#ffbd00;color:#090909;font-weight:900}
        .summary{display:flex;justify-content:space-between;margin:30px 0 18px;color:#9aa6bd}.summary b{color:#ffbd00}
        .gameList{border:1px solid #29292d;border-radius:22px;overflow:hidden;background:#08090a}
        .gameRow{display:grid;grid-template-columns:150px minmax(0,1fr);gap:24px;padding:20px;border-bottom:1px solid #242428}.gameRow:last-child{border-bottom:0}
        .coverLink{display:block;width:150px;height:106px;border-radius:10px;overflow:hidden;background:#171719}.coverLink img{width:100%;height:100%;object-fit:cover}.coverFallback{width:100%;height:100%;display:grid;place-items:center;font-size:38px}
        .info{min-width:0;align-self:center}.title{display:inline-block;color:#fff;font-size:18px;font-weight:900;text-decoration:none;margin-bottom:12px}.info p{margin:0 0 7px;color:#9ca9c1}.publisher{font-size:14px}
        .managerActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.managerActions button,.managerActions a{height:38px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;padding:0 14px;background:transparent;font-weight:800;text-decoration:none;cursor:pointer}.coverButton{border:1px solid #04b8d5;color:#22d3ee}.editButton{border:1px solid #9a7200;color:#ffbd00}.deleteButton{border:1px solid #7d2028;color:#ff6d75}
        .empty{padding:60px 20px;text-align:center;color:#778197}
        .pagination{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:28px;flex-wrap:wrap}.pagination a{min-width:42px;height:42px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #343438;border-radius:10px;color:#fff;text-decoration:none;padding:0 12px}.pagination a.active{background:#ffbd00;border-color:#ffbd00;color:#090909;font-weight:900}.pagination a.disabled{pointer-events:none;opacity:.35}.pageGroup{display:inline-flex;align-items:center;gap:8px}.ellipsis{color:#778197}
        @media(max-width:700px){.filters{grid-template-columns:minmax(0,1fr) 58px}.filters select{grid-column:1/-1}.summary{font-size:14px}.gameRow{grid-template-columns:112px minmax(0,1fr);gap:15px;padding:16px}.coverLink{width:112px;height:112px}.title{font-size:17px;margin-bottom:8px}.info p{font-size:13px;line-height:1.45}.managerActions{gap:6px}.managerActions button,.managerActions a{height:34px;padding:0 10px;font-size:12px}.pagination{gap:5px}.pagination a{min-width:36px;height:38px;padding:0 9px}}
      `}</style>
    </>
  );
}


