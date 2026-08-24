"use client";

import Link from "next/link";
import {
  type ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type Game = {
  id: string;
  name: string | null;
  genre: string | null;
  min_players: number | null;
  max_players: number | null;
  best_players: string | number | null;
  play_time: number | null;
  publisher: string | null;
  thumbnail: string | null;
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

function normalizeRole(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function hasManagementRole(value: unknown) {
  return [
    "MAIN_ADMIN",
    "ADMIN",
    "RULE_MASTER",
    "RULEMASTER",
    "MASTER",
    "MANAGER",
    "메인_관리자",
    "관리자",
    "룰마",
  ].includes(normalizeRole(value));
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

  const [items, setItems] = useState<Game[]>(games);
  const [resolvedCanManage, setResolvedCanManage] =
    useState(Boolean(canManage));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [coverGame, setCoverGame] = useState<Game | null>(null);

  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setItems(games);
  }, [games]);

  useEffect(() => {
    let active = true;

    setResolvedCanManage(Boolean(canManage));

    if (canManage) {
      return () => {
        active = false;
      };
    }

    async function checkPermission() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) return;

      const [
        { data: siteAdmin },
        { data: currentRole, error: roleError },
      ] = await Promise.all([
        supabase
          .from("site_admins")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.rpc("current_site_role"),
      ]);

      if (!active) return;

      if (roleError) {
        console.error("보드게임 직위 조회 오류:", roleError);
      }

      setResolvedCanManage(
        Boolean(siteAdmin) || hasManagementRole(currentRole),
      );
    }

    void checkPermission();

    return () => {
      active = false;
    };
  }, [canManage, supabase]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstNumber = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastNumber = Math.min(page * pageSize, total);

  function pageHref(targetPage: number) {
    const parameters = new URLSearchParams();

    if (query) parameters.set("q", query);
    if (genre) parameters.set("genre", genre);

    parameters.set("page", String(targetPage));

    return `/boardgames?${parameters.toString()}`;
  }

  function chooseCover(game: Game) {
    if (!resolvedCanManage) return;

    setCoverGame(game);
    fileInput.current?.click();
  }

  async function uploadCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const game = coverGame;

    event.target.value = "";

    if (!file || !game || !resolvedCanManage) return;

    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      alert("JPG, PNG, WEBP 이미지만 등록할 수 있습니다.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert("표지 이미지는 10MB 이하여야 합니다.");
      return;
    }

    setBusyId(game.id);

    const extension =
      file.name
        .split(".")
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "jpg";

    const path = `${game.id}/${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("game-covers")
      .upload(path, file, {
        upsert: false,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      setBusyId(null);
      alert(`표지를 업로드하지 못했습니다.\n${uploadError.message}`);
      return;
    }

    const { data } = supabase.storage
      .from("game-covers")
      .getPublicUrl(path);

    const { error: updateError } = await supabase
      .from("games")
      .update({ thumbnail: data.publicUrl })
      .eq("id", game.id);

    setBusyId(null);

    if (updateError) {
      await supabase.storage.from("game-covers").remove([path]);

      alert(
        `표지 주소를 저장하지 못했습니다.\n${updateError.message}`,
      );
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.id === game.id
          ? { ...item, thumbnail: data.publicUrl }
          : item,
      ),
    );

    setCoverGame(null);
    router.refresh();
  }

  async function removeGame(game: Game) {
    if (!resolvedCanManage) return;

    const confirmed = window.confirm(
      `"${game.name ?? "이 게임"}"을 정말 삭제할까요?\n관련 기록이 있으면 삭제되지 않을 수 있습니다.`,
    );

    if (!confirmed) return;

    setBusyId(game.id);

    const { error } = await supabase
      .from("games")
      .delete()
      .eq("id", game.id);

    setBusyId(null);

    if (error) {
      alert(`게임을 삭제하지 못했습니다.\n${error.message}`);
      return;
    }

    setItems((current) =>
      current.filter((item) => item.id !== game.id),
    );

    router.refresh();
  }

  return (
    <section className="listSection">
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={uploadCover}
      />

      {resolvedCanManage && (
        <div className="managementEntry">
          <Link
            href="/admin/library?kind=boardgame"
            className="managementEntryButton"
          >
            게임 등록·관리
          </Link>
        </div>
      )}

      <form
        method="get"
        action="/boardgames"
        className="searchForm"
      >
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="게임 이름 또는 출판사 검색"
          aria-label="게임 이름 또는 출판사 검색"
        />

        <select
          name="genre"
          defaultValue={genre}
          aria-label="장르 선택"
        >
          <option value="">전체 장르</option>

          {genres.map((genreName) => (
            <option value={genreName} key={genreName}>
              {genreName}
            </option>
          ))}
        </select>

        <button type="submit">검색</button>
      </form>

      <div className="listSummary">
        <p>
          총 <strong>{total}</strong>개의 게임
        </p>

        <p>
          {firstNumber}–{lastNumber} 표시
        </p>
      </div>

      {items.length === 0 ? (
        <div className="emptyBox">
          조건에 맞는 보드게임이 없습니다.
        </div>
      ) : (
        <div className="gameList">
          {items.map((game) => (
            <article className="gameCard" key={game.id}>
              <Link
                href={`/boardgames/${game.id}`}
                className="coverLink"
                aria-label={`${game.name ?? "보드게임"} 상세 정보`}
              >
                {game.thumbnail ? (
                  <img
                    src={game.thumbnail}
                    alt={`${game.name ?? "보드게임"} 표지`}
                    loading="lazy"
                  />
                ) : (
                  <span className="coverFallback">🎲</span>
                )}
              </Link>

              <div className="gameInfo">
                <Link
                  href={`/boardgames/${game.id}`}
                  className="gameTitle"
                >
                  {game.name ?? "이름 미정"}
                </Link>

                <p className="gameMeta">
                  {game.genre || "장르 미정"} · {playerText(game)} ·{" "}
                  {game.play_time
                    ? `${game.play_time}분`
                    : "시간 미정"}
                </p>

                <p className="publisher">
                  {game.publisher || "출판사 미정"}
                </p>

                {resolvedCanManage && (
                  <div className="managerActions">
                    <button
                      type="button"
                      className="coverButton"
                      disabled={busyId === game.id}
                      onClick={() => chooseCover(game)}
                    >
                      {busyId === game.id
                        ? "처리 중"
                        : game.thumbnail
                          ? "표지 교체"
                          : "표지 등록"}
                    </button>

                    <Link
                      className="editButton"
                      href={`/admin/library?edit=${encodeURIComponent(
                        game.id,
                      )}&kind=boardgame`}
                    >
                      정보 수정
                    </Link>

                    <button
                      type="button"
                      className="deleteButton"
                      disabled={busyId === game.id}
                      onClick={() => void removeGame(game)}
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav
          className="pagination"
          aria-label="보드게임 페이지 이동"
        >
          {page > 1 && (
            <Link
              href={pageHref(page - 1)}
              className="pageButton"
            >
              이전
            </Link>
          )}

          {Array.from(
            { length: totalPages },
            (_, index) => index + 1,
          )
            .filter(
              (pageNumber) =>
                pageNumber === 1 ||
                pageNumber === totalPages ||
                Math.abs(pageNumber - page) <= 2,
            )
            .map((pageNumber, index, visiblePages) => {
              const previous = visiblePages[index - 1];
              const showDots =
                previous !== undefined &&
                pageNumber - previous > 1;

              return (
                <span className="pageItem" key={pageNumber}>
                  {showDots && <span className="dots">…</span>}

                  <Link
                    href={pageHref(pageNumber)}
                    className={
                      pageNumber === page
                        ? "pageButton active"
                        : "pageButton"
                    }
                  >
                    {pageNumber}
                  </Link>
                </span>
              );
            })}

          {page < totalPages && (
            <Link
              href={pageHref(page + 1)}
              className="pageButton"
            >
              다음
            </Link>
          )}
        </nav>
      )}

      <style>{`
        .listSection {
          width: min(1232px, calc(100% - 40px));
          margin: 0 auto;
        }

        .managementEntry {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 16px;
        }

        .managementEntryButton {
          border: 1px solid #7054a5;
          border-radius: 14px;
          padding: 12px 18px;
          color: #d7c5ff;
          background: #15101d;
          font-weight: 800;
          text-decoration: none;
        }

        .managementEntryButton:hover {
          border-color: #9d70d7;
          background: #1d1429;
        }

        .searchForm {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 270px 84px;
          gap: 12px;
          border: 1px solid #2d2f34;
          border-radius: 20px;
          padding: 20px;
          background: #111214;
        }

        .searchForm input,
        .searchForm select {
          min-width: 0;
          height: 54px;
          border: 1px solid #34363d;
          border-radius: 14px;
          padding: 0 16px;
          color: #ffffff;
          background: #191a1e;
          font: inherit;
        }

        .searchForm button {
          border: 0;
          border-radius: 14px;
          color: #171000;
          background: #ffbd00;
          font-weight: 900;
          cursor: pointer;
        }

        .listSummary {
          margin: 28px 0 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          color: #91a0ba;
        }

        .listSummary p {
          margin: 0;
        }

        .listSummary strong {
          color: #ffbd00;
        }

        .gameList {
          overflow: hidden;
          border: 1px solid #2b2d32;
          border-radius: 20px;
          background: #090a0b;
        }

        .gameCard {
          display: grid;
          grid-template-columns: 150px minmax(0, 1fr);
          gap: 24px;
          padding: 20px;
          border-bottom: 1px solid #26282d;
        }

        .gameCard:last-child {
          border-bottom: 0;
        }

        .coverLink {
          display: block;
          width: 150px;
          height: 108px;
          overflow: hidden;
          border: 1px solid #3a3c42;
          border-radius: 12px;
          background: #15161a;
        }

        .coverLink img {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
        }

        .coverFallback {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          font-size: 34px;
        }

        .gameInfo {
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .gameTitle {
          width: fit-content;
          color: #ffffff;
          font-size: 18px;
          font-weight: 900;
          text-decoration: none;
        }

        .gameTitle:hover {
          color: #ffbd00;
        }

        .gameMeta {
          margin: 9px 0 0;
          color: #aebbd1;
          line-height: 1.6;
        }

        .publisher {
          margin: 5px 0 0;
          color: #73819a;
        }

        .managerActions {
          margin-top: 16px;
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
        }

        .managerActions button,
        .managerActions a {
          min-height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          padding: 8px 14px;
          text-decoration: none;
          font: inherit;
          font-size: 14px;
          font-weight: 900;
          cursor: pointer;
        }

        .managerActions button:disabled {
          cursor: wait;
          opacity: 0.6;
        }

        .coverButton {
          border: 1px solid #16b8d4;
          color: #031216;
          background: #17bad6;
        }

        .editButton {
          border: 1px solid #a77b00;
          color: #ffd342;
          background: transparent;
        }

        .deleteButton {
          border: 1px solid #9f2934;
          color: #ff6974;
          background: transparent;
        }

        .emptyBox {
          border: 1px dashed #34363d;
          border-radius: 20px;
          padding: 52px 20px;
          color: #73819a;
          text-align: center;
        }

        .pagination {
          margin-top: 30px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .pageItem {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .pageButton {
          min-width: 42px;
          height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #34363d;
          border-radius: 11px;
          padding: 0 12px;
          color: #dce3ef;
          background: #121317;
          text-decoration: none;
          font-weight: 800;
        }

        .pageButton.active {
          border-color: #ffbd00;
          color: #181000;
          background: #ffbd00;
        }

        .dots {
          color: #73819a;
        }

        @media (max-width: 700px) {
          .listSection {
            width: calc(100% - 32px);
          }

          .managementEntry {
            justify-content: stretch;
          }

          .managementEntryButton {
            width: 100%;
            text-align: center;
          }

          .searchForm {
            grid-template-columns: 1fr;
            padding: 14px;
          }

          .searchForm button {
            min-height: 50px;
          }

          .gameCard {
            grid-template-columns: 112px minmax(0, 1fr);
            gap: 16px;
            padding: 16px;
          }

          .coverLink {
            width: 112px;
            height: 112px;
          }

          .gameTitle {
            font-size: 17px;
          }

          .gameMeta,
          .publisher {
            font-size: 14px;
          }

          .managerActions {
            grid-column: 1 / -1;
          }

          .managerActions button,
          .managerActions a {
            flex: 1 1 auto;
          }
        }

        @media (max-width: 420px) {
          .gameCard {
            grid-template-columns: 96px minmax(0, 1fr);
            gap: 13px;
          }

          .coverLink {
            width: 96px;
            height: 112px;
          }

          .managerActions {
            margin-left: -109px;
          }
        }
      `}</style>
    </section>
  );
}