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

const BOARDGAME_COVER_BUCKET = "boardgame-covers";

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

type GameEditDraft = {
  name: string;
  type: string;
  min_players: string;
  max_players: string;
  best_players: string;
  play_time: string;
  difficulty: string;
  genre: string;
  weight: string;
  publisher: string;
  icon: string;
  min_age: string;
  year_published: string;
  bgg_url: string;
  description: string;
  thumbnail: string;
};

const emptyEditDraft: GameEditDraft = {
  name: "",
  type: "SCORE",
  min_players: "",
  max_players: "",
  best_players: "",
  play_time: "",
  difficulty: "",
  genre: "",
  weight: "",
  publisher: "",
  icon: "",
  min_age: "",
  year_published: "",
  bgg_url: "",
  description: "",
  thumbnail: "",
};

function draftText(value: unknown) {
  return value == null ? "" : String(value);
}

function nullableText(value: string) {
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function nullableNumber(value: string) {
  return value.trim() === "" ? null : Number(value);
}

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
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [editDraft, setEditDraft] =
    useState<GameEditDraft>(emptyEditDraft);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editMessage, setEditMessage] = useState("");

  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setItems(games);
  }, [games]);

  useEffect(() => {
    setResolvedCanManage(Boolean(canManage));
  }, [canManage]);

  useEffect(() => {
    if (!editingGame) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !editSaving) setEditingGame(null);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [editingGame, editSaving]);

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
      .from(BOARDGAME_COVER_BUCKET)
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
      .from(BOARDGAME_COVER_BUCKET)
      .getPublicUrl(path);

    const { error: updateError } = await supabase
      .from("games")
      .update({ thumbnail: data.publicUrl })
      .eq("id", game.id);

    setBusyId(null);

    if (updateError) {
      await supabase.storage.from(BOARDGAME_COVER_BUCKET).remove([path]);

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

    const { error } = await supabase.rpc("admin_delete_boardgame", {
      p_game_id: game.id,
    });

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

  async function openEditModal(game: Game) {
    if (!resolvedCanManage) return;

    setEditingGame(game);
    setEditDraft({ ...emptyEditDraft, name: game.name ?? "" });
    setEditMessage("");
    setEditLoading(true);

    const { data, error } = await supabase
      .from("games")
      .select(
        "id,name,type,min_players,max_players,best_players,play_time,difficulty,genre,weight,publisher,icon,min_age,year_published,bgg_url,description,thumbnail",
      )
      .eq("id", game.id)
      .single();

    setEditLoading(false);

    if (error) {
      setEditMessage(`정보를 불러오지 못했습니다. ${error.message}`);
      return;
    }

    setEditDraft({
      name: draftText(data.name),
      type: draftText(data.type) || "SCORE",
      min_players: draftText(data.min_players),
      max_players: draftText(data.max_players),
      best_players: draftText(data.best_players),
      play_time: draftText(data.play_time),
      difficulty: draftText(data.difficulty),
      genre: draftText(data.genre),
      weight: draftText(data.weight),
      publisher: draftText(data.publisher),
      icon: draftText(data.icon),
      min_age: draftText(data.min_age),
      year_published: draftText(data.year_published),
      bgg_url: draftText(data.bgg_url),
      description: draftText(data.description),
      thumbnail: draftText(data.thumbnail),
    });
  }

  function updateEditDraft(name: keyof GameEditDraft, value: string) {
    setEditDraft((current) => ({ ...current, [name]: value }));
  }

  async function saveEdit() {
    if (!editingGame || !resolvedCanManage || editLoading) return;

    if (!editDraft.name.trim()) {
      setEditMessage("게임 이름을 입력해 주세요.");
      return;
    }

    setEditSaving(true);
    setEditMessage("");

    const payload = {
      name: editDraft.name.trim(),
      type: editDraft.type || "SCORE",
      min_players: nullableNumber(editDraft.min_players),
      max_players: nullableNumber(editDraft.max_players),
      best_players: nullableText(editDraft.best_players),
      play_time: nullableNumber(editDraft.play_time),
      difficulty: nullableNumber(editDraft.difficulty),
      genre: nullableText(editDraft.genre),
      weight: nullableNumber(editDraft.weight),
      publisher: nullableText(editDraft.publisher),
      icon: nullableText(editDraft.icon),
      min_age: nullableNumber(editDraft.min_age),
      year_published: nullableNumber(editDraft.year_published),
      bgg_url: nullableText(editDraft.bgg_url),
      description: nullableText(editDraft.description),
      thumbnail: nullableText(editDraft.thumbnail),
    };

    const { error } = await supabase
      .from("games")
      .update(payload)
      .eq("id", editingGame.id);

    setEditSaving(false);

    if (error) {
      setEditMessage(`수정하지 못했습니다. ${error.message}`);
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.id === editingGame.id
          ? {
              ...item,
              name: payload.name,
              genre: payload.genre,
              min_players: payload.min_players,
              max_players: payload.max_players,
              best_players: payload.best_players,
              play_time: payload.play_time,
              publisher: payload.publisher,
              thumbnail: payload.thumbnail,
            }
          : item,
      ),
    );
    setEditingGame(null);
    router.refresh();
  }

  const EditField = ({
    label,
    name,
    type = "text",
    min,
    max,
    step,
  }: {
    label: string;
    name: keyof GameEditDraft;
    type?: string;
    min?: number;
    max?: number;
    step?: number;
  }) => (
    <label className="editField">
      <span>{label}</span>
      <input
        type={type}
        min={min}
        max={max}
        step={step}
        value={editDraft[name]}
        onChange={(event) => updateEditDraft(name, event.target.value)}
      />
    </label>
  );

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

                    <button
                      type="button"
                      className="editButton"
                      disabled={busyId === game.id}
                      onClick={() => void openEditModal(game)}
                    >
                      정보 수정
                    </button>

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

      {editingGame && (
        <div
          className="editModalBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !editSaving) {
              setEditingGame(null);
            }
          }}
        >
          <section
            className="editModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="boardgame-edit-title"
          >
            <header className="editModalHeader">
              <div>
                <p>BOARDGAME EDIT</p>
                <h2 id="boardgame-edit-title">게임 정보 수정</h2>
              </div>
              <button
                type="button"
                aria-label="팝업 닫기"
                disabled={editSaving}
                onClick={() => setEditingGame(null)}
              >
                ×
              </button>
            </header>

            {editLoading ? (
              <div className="editModalLoading">게임 정보를 불러오는 중...</div>
            ) : (
              <>
                <div className="editFormGrid">
                  <EditField label="게임 이름" name="name" />
                  <label className="editField">
                    <span>결과 방식</span>
                    <select
                      value={editDraft.type}
                      onChange={(event) =>
                        updateEditDraft("type", event.target.value)
                      }
                    >
                      <option value="SCORE">점수형</option>
                      <option value="SIMPLE_SCORE">등수형</option>
                      <option value="ROLE">역할형</option>
                      <option value="COOP">협력형</option>
                    </select>
                  </label>
                  <EditField label="최소 인원" name="min_players" type="number" />
                  <EditField label="최대 인원" name="max_players" type="number" />
                  <EditField label="베스트 인원" name="best_players" />
                  <EditField label="플레이 시간(분)" name="play_time" type="number" />
                  <EditField label="난이도(1~5)" name="difficulty" type="number" min={1} max={5} step={0.01} />
                  <EditField label="장르" name="genre" />
                  <EditField label="BGG 웨이트" name="weight" type="number" min={0} max={5} step={0.01} />
                  <EditField label="출판사" name="publisher" />
                  <EditField label="아이콘" name="icon" />
                  <EditField label="권장 나이" name="min_age" type="number" />
                  <EditField label="출시 연도" name="year_published" type="number" />
                  <EditField label="BGG 주소" name="bgg_url" />
                  <div className="editWideField">
                    <EditField label="표지 이미지 주소" name="thumbnail" />
                  </div>
                  <label className="editField editWideField">
                    <span>게임 설명</span>
                    <textarea
                      value={editDraft.description}
                      onChange={(event) =>
                        updateEditDraft("description", event.target.value)
                      }
                    />
                  </label>
                </div>

                {editMessage && <p className="editMessage">{editMessage}</p>}

                <footer className="editModalActions">
                  <button
                    type="button"
                    className="editCancelButton"
                    disabled={editSaving}
                    onClick={() => setEditingGame(null)}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="editSaveButton"
                    disabled={editSaving}
                    onClick={() => void saveEdit()}
                  >
                    {editSaving ? "저장 중..." : "수정사항 저장"}
                  </button>
                </footer>
              </>
            )}
          </section>
        </div>
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
          grid-template-columns: 120px minmax(0, 1fr);
          gap: 24px;
          padding: 20px;
          border-bottom: 1px solid #26282d;
        }

        .gameCard:last-child {
          border-bottom: 0;
        }

        .coverLink {
          display: block;
          width: 120px;
          height: 150px;
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

        .editModalBackdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          padding: 24px;
          background: rgba(0, 0, 0, 0.78);
          backdrop-filter: blur(8px);
        }

        .editModal {
          width: min(920px, 100%);
          max-height: min(860px, calc(100dvh - 48px));
          overflow-y: auto;
          border: 1px solid #4b3b17;
          border-radius: 24px;
          padding: 24px;
          color: #fff;
          background: #101113;
          box-shadow: 0 28px 90px rgba(0, 0, 0, 0.65);
        }

        .editModalHeader {
          position: sticky;
          top: -24px;
          z-index: 2;
          margin: -24px -24px 22px;
          padding: 22px 24px 18px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 1px solid #292b30;
          background: rgba(16, 17, 19, 0.96);
          backdrop-filter: blur(10px);
        }

        .editModalHeader p {
          margin: 0 0 6px;
          color: #ffbd00;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.2em;
        }

        .editModalHeader h2 {
          margin: 0;
          font-size: 25px;
        }

        .editModalHeader button {
          width: 42px;
          height: 42px;
          flex: none;
          border: 1px solid #383a40;
          border-radius: 50%;
          color: #fff;
          background: #202126;
          font-size: 26px;
          line-height: 1;
          cursor: pointer;
        }

        .editModalLoading {
          padding: 70px 20px;
          color: #91a0ba;
          text-align: center;
        }

        .editFormGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .editField {
          min-width: 0;
          display: block;
        }

        .editField > span {
          display: block;
          margin-bottom: 7px;
          color: #b8becb;
          font-size: 13px;
          font-weight: 800;
        }

        .editField input,
        .editField select,
        .editField textarea {
          width: 100%;
          min-width: 0;
          border: 1px solid #35373d;
          border-radius: 12px;
          padding: 12px 14px;
          color: #fff;
          background: #191a1e;
          font: inherit;
          outline: none;
        }

        .editField input,
        .editField select {
          height: 48px;
        }

        .editField textarea {
          min-height: 130px;
          resize: vertical;
          line-height: 1.6;
        }

        .editField input:focus,
        .editField select:focus,
        .editField textarea:focus {
          border-color: #ffbd00;
          box-shadow: 0 0 0 3px rgba(255, 189, 0, 0.1);
        }

        .editWideField {
          grid-column: 1 / -1;
        }

        .editMessage {
          margin: 16px 0 0;
          border: 1px solid #8a3138;
          border-radius: 12px;
          padding: 12px 14px;
          color: #ff9ca3;
          background: #1d0d10;
          font-size: 14px;
        }

        .editModalActions {
          position: sticky;
          bottom: -24px;
          margin: 22px -24px -24px;
          padding: 18px 24px 24px;
          display: grid;
          grid-template-columns: 0.7fr 1.3fr;
          gap: 12px;
          border-top: 1px solid #292b30;
          background: rgba(16, 17, 19, 0.96);
          backdrop-filter: blur(10px);
        }

        .editModalActions button {
          min-height: 50px;
          border-radius: 13px;
          font: inherit;
          font-weight: 900;
          cursor: pointer;
        }

        .editModalActions button:disabled,
        .editModalHeader button:disabled {
          cursor: wait;
          opacity: 0.55;
        }

        .editCancelButton {
          border: 1px solid #3a3c42;
          color: #d6d9df;
          background: #191a1e;
        }

        .editSaveButton {
          border: 1px solid #ffbd00;
          color: #171000;
          background: #ffbd00;
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
            grid-template-columns: 104px minmax(0, 1fr);
            gap: 16px;
            padding: 16px;
          }

          .coverLink {
            width: 104px;
            height: 130px;
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

          .editModalBackdrop {
            place-items: end center;
            padding: 0;
          }

          .editModal {
            width: 100%;
            max-height: 92dvh;
            border-right: 0;
            border-bottom: 0;
            border-left: 0;
            border-radius: 24px 24px 0 0;
            padding: 20px;
          }

          .editModalHeader {
            top: -20px;
            margin: -20px -20px 18px;
            padding: 18px 20px 15px;
          }

          .editFormGrid {
            grid-template-columns: 1fr;
            gap: 14px;
          }

          .editWideField {
            grid-column: auto;
          }

          .editModalActions {
            bottom: -20px;
            margin: 20px -20px -20px;
            padding: 15px 20px calc(18px + env(safe-area-inset-bottom));
          }
        }

        @media (max-width: 420px) {
          .gameCard {
            grid-template-columns: 88px minmax(0, 1fr);
            gap: 13px;
          }

          .coverLink {
            width: 88px;
            height: 110px;
          }

          .managerActions {
            margin-left: -101px;
          }
        }
      `}</style>
    </section>
  );
}
