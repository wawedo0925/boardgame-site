"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "PSYCHOLOGY" | "INDIVIDUAL" | "TEAM_2V2" | "TEAM_3X2";
type Lobby = {
  id: string;
  code: string;
  title: string;
  mode: Mode;
  status: string;
  players: number;
  max_players: number;
  mine: boolean;
};
type Room = {
  id: string;
  code: string;
  title: string;
  host_id: string;
  mode: Mode;
  status: string;
  max_players: number;
  turn_seat: number | null;
  mind_round: number;
  action_deadline?: string | null;
  mind_selected?: string[];
  mind_my_choice?: number | null;
  mind_reveal?: {player_id: string; fronts: number}[] | null;
  pending_moves: number[];
  can_roll: boolean;
  last_roll: number | null;
  winner_team: number | null;
  finish_order: number[];
  revision: number;
};
type Player = {
  id: string;
  user_id: string | null;
  seat: number;
  team: number;
  name: string;
  ready: boolean;
  is_bot: boolean;
};
type Piece = {
  team: number;
  piece_no: number;
  route: "outer" | "diag1" | "diag2";
  step_index: number;
  back_at_start: boolean;
};
type Snap = {
  room: Room;
  me: { id: string; seat: number; team: number; ready: boolean };
  players: Player[];
  pieces: Piece[];
};
type MoveAnimation = {
  id: number;
  team: number;
  pieceNos: number[];
  nodes: number[];
};
type Chat = { id: string; user: string; text: string; at: number };

const supabase = createClient();
const teamStyles = [
  {
    name: "빨강",
    bg: "bg-red-500",
    text: "text-red-300",
    border: "border-red-400",
  },
  {
    name: "노랑",
    bg: "bg-amber-400",
    text: "text-amber-300",
    border: "border-amber-300",
  },
  {
    name: "파랑",
    bg: "bg-sky-500",
    text: "text-sky-300",
    border: "border-sky-400",
  },
  {
    name: "초록",
    bg: "bg-emerald-500",
    text: "text-emerald-300",
    border: "border-emerald-400",
  },
  {
    name: "보라",
    bg: "bg-violet-500",
    text: "text-violet-300",
    border: "border-violet-400",
  },
  {
    name: "분홍",
    bg: "bg-pink-500",
    text: "text-pink-300",
    border: "border-pink-400",
  },
];
const modeInfo: Record<Mode, { label: string; detail: string }> = {
  PSYCHOLOGY: { label: "1:1 심리전", detail: "각자 윷 2개 비밀 선택 · 도는 빽도" },
  INDIVIDUAL: { label: "개인전", detail: "2~4명 · 각자 말 4개" },
  TEAM_2V2: { label: "2 대 2", detail: "두 팀 · 팀별 말 4개" },
  TEAM_3X2: { label: "2 대 2 대 2", detail: "세 팀 6명 · 팀별 말 4개" },
};
const resultLabel: Record<number, string> = {
  [-1]: "빽도",
  1: "도",
  2: "개",
  3: "걸",
  4: "윷",
  5: "모",
};
const boardPos: Record<number, [number, number]> = {
  0: [90, 90],
  1: [90, 74],
  2: [90, 58],
  3: [90, 42],
  4: [90, 26],
  5: [90, 10],
  6: [74, 10],
  7: [58, 10],
  8: [42, 10],
  9: [26, 10],
  10: [10, 10],
  11: [10, 26],
  12: [10, 42],
  13: [10, 58],
  14: [10, 74],
  15: [10, 90],
  16: [26, 90],
  17: [42, 90],
  18: [58, 90],
  19: [74, 90],
  20: [90, 90],
  21: [74, 26],
  29: [62, 38],
  22: [50, 50],
  23: [38, 62],
  24: [26, 74],
  25: [26, 26],
  26: [38, 38],
  27: [62, 62],
  28: [74, 74],
  99: [50, 104],
};
const paths: Record<Piece["route"], number[]> = {
  outer: [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    99,
  ],
  diag1: [0, 1, 2, 3, 4, 5, 21, 29, 22, 23, 24, 15, 16, 17, 18, 19, 20, 99],
  diag2: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 25, 26, 22, 27, 28, 20, 99],
};
function nodeOf(piece: Piece) {
  return paths[piece.route][piece.step_index] ?? 99;
}
function movementNodes(before: Piece, after: Piece) {
  const destinationPath = paths[after.route],
    startNode = nodeOf(before),
    endIndex = Math.min(after.step_index, destinationPath.length - 1);
  let startIndex =
    before.route === after.route
      ? Math.min(before.step_index, destinationPath.length - 1)
      : destinationPath.lastIndexOf(startNode, endIndex);
  if (startIndex < 0) startIndex = 0;
  const direction = endIndex >= startIndex ? 1 : -1,
    nodes: number[] = [];
  for (
    let index = startIndex;
    direction > 0 ? index <= endIndex : index >= endIndex;
    index += direction
  )
    nodes.push(destinationPath[index] ?? 99);
  return nodes;
}
function errText(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}
function playCaptureSound() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass(),
      gain = context.createGain(),
      oscillator = context.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(420, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      880,
      context.currentTime + 0.16,
    );
    gain.gain.setValueAtTime(0.18, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.28);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.28);
    oscillator.onended = () => void context.close();
  } catch {}
}
// Short filtered noise bursts imitate wooden sticks colliding, without audio assets.
function playYutClack(context: AudioContext | null) {
  if (!context || context.state !== "running") return;
  try {
    for (const [delay, frequency, volume] of [[0, 1200, 0.4], [0.07, 1700, 0.3], [0.15, 950, 0.35], [0.24, 1400, 0.2]]) {
      const length = Math.floor(context.sampleRate * 0.075);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
      source.buffer = buffer;
      filter.type = "bandpass";
      filter.frequency.value = frequency;
      filter.Q.value = 2;
      const time = context.currentTime + delay;
      gain.gain.setValueAtTime(volume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
      source.connect(filter); filter.connect(gain); gain.connect(context.destination);
      source.start(time);
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    }
  } catch {}
}

function playTurnSound() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass(),
      gain = context.createGain();
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.55);
    gain.connect(context.destination);
    for (const [frequency, delay] of [
      [660, 0],
      [990, 0.16],
    ] as const) {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(context.currentTime + delay);
      oscillator.stop(context.currentTime + delay + 0.32);
    }
    setTimeout(() => void context.close(), 700);
  } catch {}
}

export default function YutClient() {
  const [userId, setUserId] = useState<string | null>(null),
    [lobby, setLobby] = useState<Lobby[]>([]),
    [snap, setSnap] = useState<Snap | null>(null);
  const [mode, setMode] = useState<Mode>("INDIVIDUAL"),
    [playerCount, setPlayerCount] = useState(4),
    [title, setTitle] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [captureNotice, setCaptureNotice] = useState(""),
    [turnNotice, setTurnNotice] = useState(""),
    [autoSeconds, setAutoSeconds] = useState<number | null>(null),
    [moveAnimation, setMoveAnimation] = useState<MoveAnimation | null>(null),
    [tutorialOpen, setTutorialOpen] = useState(false);
  const roomId = snap?.room.id ?? null,
    botBusy = useRef(false),
    autoBusy = useRef(false),
    snapRef = useRef<Snap | null>(null),
    botStateRef = useRef(""),
    botDueRef = useRef(0),
    captureKeyRef = useRef(""),
    lastTurnKeyRef = useRef(""),
    captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null),
    turnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null),
    moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rpc = useCallback(
    async (name: string, args: Record<string, unknown> = {}) => {
      setBusy(true);
      setNotice("");
      try {
        const { data, error } = await supabase.rpc(name, args);
        if (error) throw error;
        return data;
      } catch (e) {
        setNotice(errText(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [],
  );
  const loadLobby = useCallback(async () => {
    const { data } = await supabase.rpc("yut_lobby");
    setLobby((data ?? []) as Lobby[]);
  }, []);
  const loadRoom = useCallback(async (id: string) => {
    const { data, error } = await supabase.rpc("yut_snapshot", { p_room: id });
    if (error || !data) {
      localStorage.removeItem("yut-room");
      snapRef.current = null;
      setSnap(null);
      return;
    }
    const next = data as Snap,
      previous = snapRef.current;
    if (
      previous?.room.id === next.room.id &&
      previous.room.revision !== next.room.revision
    ) {
      const victims = new Set<string>();
      for (const oldPiece of previous.pieces) {
        const nextPiece = next.pieces.find(
          (piece) =>
            piece.team === oldPiece.team &&
            piece.piece_no === oldPiece.piece_no,
        );
        if (
          nextPiece &&
          nodeOf(oldPiece) !== 0 &&
          nodeOf(oldPiece) !== 99 &&
          nodeOf(nextPiece) === 0
        ) {
          for (const player of previous.players.filter(
            (item) => item.team === oldPiece.team,
          ))
            victims.add(player.name);
        }
      }
      const actor = previous.players.find(
        (player) => player.seat === previous.room.turn_seat,
      );
      const moved = actor
        ? previous.pieces.filter(
            (oldPiece) =>
              oldPiece.team === actor.team &&
              next.pieces.some(
                (piece) =>
                  piece.team === oldPiece.team &&
                  piece.piece_no === oldPiece.piece_no &&
                  (piece.route !== oldPiece.route ||
                    piece.step_index !== oldPiece.step_index),
              ),
          )
        : [];
      if (moved.length) {
        const before = moved[0],
          after = next.pieces.find(
            (piece) =>
              piece.team === before.team && piece.piece_no === before.piece_no,
          );
        if (after) {
          const nodes = movementNodes(before, after);
          if (nodes.length > 1) {
            const animation = {
              id: next.room.revision,
              team: before.team,
              pieceNos: moved.map((piece) => piece.piece_no),
              nodes,
            };
            setMoveAnimation(animation);
            if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
            moveTimerRef.current = setTimeout(
              () =>
                setMoveAnimation((current) =>
                  current?.id === animation.id ? null : current,
                ),
              nodes.length * 260 + 150,
            );
          }
        }
      }
      const captureKey = `${next.room.id}:${next.room.revision}:${[...victims].join("|")}`;
      if (victims.size && captureKeyRef.current !== captureKey) {
        captureKeyRef.current = captureKey;
        const capturer = actor?.name ?? "상대";
        setCaptureNotice(
          `${capturer}님이 ${[...victims].join(", ")}님의 말을 잡았습니다!`,
        );
        playCaptureSound();
        if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
        captureTimerRef.current = setTimeout(() => setCaptureNotice(""), 3000);
      }
    }
    snapRef.current = next;
    setSnap(next);
  }, []);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      if (data.user?.id && localStorage.getItem("yut-tutorial-seen") !== "1")
        setTutorialOpen(true);
      const saved = localStorage.getItem("yut-room");
      if (saved) loadRoom(saved);
      else loadLobby();
    });
  }, [loadLobby, loadRoom]);
  const closeTutorial = () => {
    localStorage.setItem("yut-tutorial-seen", "1");
    setTutorialOpen(false);
  };
  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);
  useEffect(() => {
    if (!snap || snap.room.status !== "PLAYING") {
      lastTurnKeyRef.current = "";
      setTurnNotice("");
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
      return;
    }
    const turnKey = `${snap.room.id}:${snap.room.turn_seat}`;
    if (lastTurnKeyRef.current === turnKey) return;
    lastTurnKeyRef.current = turnKey;
    const isMyTurn = snap.room.turn_seat === snap.me.seat;
    setTurnNotice(isMyTurn ? "내 턴입니다" : "상대 턴입니다");
    if (isMyTurn) playTurnSound();
    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    turnTimerRef.current = setTimeout(() => setTurnNotice(""), 1800);
  }, [snap]);
  useEffect(() => {
    const timer = setInterval(
      () => (roomId ? loadRoom(roomId) : loadLobby()),
      1000,
    );
    return () => clearInterval(timer);
  }, [roomId, loadRoom, loadLobby]);
  useEffect(() => {
    document.body.classList.toggle("game-in-room", Boolean(roomId));
    return () => document.body.classList.remove("game-in-room");
  }, [roomId]);
  useEffect(() => {
    if (!roomId) return;
    botStateRef.current = "";
    botDueRef.current = 0;
    const timer = setInterval(async () => {
      const latest = snapRef.current,
        current = latest?.players.find((p) => p.seat === latest.room.turn_seat);
      if (
        latest?.room.host_id !== userId ||
        latest.room.status !== "PLAYING" ||
        (latest.room.mode === "PSYCHOLOGY" && latest.room.can_roll) ||
        !current?.is_bot ||
        botBusy.current
      ) {
        botStateRef.current = "";
        botDueRef.current = 0;
        return;
      }
      const state = `${latest.room.turn_seat}:${latest.room.revision}`;
      if (botStateRef.current !== state) {
        botStateRef.current = state;
        botDueRef.current = Date.now() + 2000;
        return;
      }
      if (Date.now() < botDueRef.current) return;
      botBusy.current = true;
      botDueRef.current = Number.POSITIVE_INFINITY;
      try {
        const { error } = await supabase.rpc("yut_bot_tick", {
          p_room: roomId,
        });
        if (error) setNotice(`AI 진행 오류: ${error.message}`);
        await loadRoom(roomId);
      } finally {
        botBusy.current = false;
      }
    }, 200);
    return () => clearInterval(timer);
  }, [roomId, userId, loadRoom]);
  useEffect(() => {
    if (!roomId) return;
    setAutoSeconds(null);
    let retryAfter = 0;
    const timer = setInterval(async () => {
      const latest = snapRef.current;
      const current = latest?.players.find(player => player.seat === latest.room.turn_seat);
      const mindPicking = latest?.room.mode === "PSYCHOLOGY" && latest.room.can_roll;
      const deadline = latest?.room.action_deadline ? Date.parse(latest.room.action_deadline) : NaN;
      if (!latest || latest.room.status !== "PLAYING" || !current || (!mindPicking && current.is_bot) || !Number.isFinite(deadline)) {
        setAutoSeconds(null);
        return;
      }
      setAutoSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
      if (Date.now() < deadline || Date.now() < retryAfter || autoBusy.current || (!mindPicking && current.id !== latest.me.id)) return;
      autoBusy.current = true;
      retryAfter = Date.now() + 1000;
      try {
        const { error } = mindPicking
          ? await supabase.rpc("yut_mind_timeout", { p_room: roomId, p_round: latest.room.mind_round })
          : await supabase.rpc("yut_auto_act", { p_room: roomId, p_expected_revision: latest.room.revision });
        if (error) setNotice(`자동 진행 오류: ${error.message}`);
        await loadRoom(roomId);
      } finally {
        autoBusy.current = false;
      }
    }, 200);
    return () => clearInterval(timer);
  }, [roomId, loadRoom]);
  useEffect(
    () => () => {
      if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
    },
    [],
  );
  const openRoom = async (id: string) => {
    localStorage.setItem("yut-room", id);
    await loadRoom(id);
  };
  const create = async () => {
    const id = await rpc("yut_create_room", {
      p_title: title || null,
      p_mode: mode,
      p_max_players: playerCount,
    });
    if (id) await openRoom(id as string);
  };
  const action = async (name: string, args: Record<string, unknown> = {}) => {
    if (!roomId) return;
    try {
      await rpc(name, { p_room: roomId, ...args });
      await loadRoom(roomId);
    } catch {}
  };
  const leave = async () => {
    if (!roomId) return;
    try {
      await rpc("yut_leave_room", { p_room: roomId });
      localStorage.removeItem("yut-room");
      setSnap(null);
      await loadLobby();
    } catch {}
  };
  const exitGame = async () => {
    if (!roomId) return;
    try {
      if (snapRef.current?.room.host_id === userId) {
        await rpc("yut_leave_room", { p_room: roomId });
      }
      localStorage.removeItem("yut-room");
      snapRef.current = null;
      setSnap(null);
      await loadLobby();
    } catch {}
  };
  if (!userId)
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-3xl font-black">윷놀이</h1>
        <p className="mt-4 text-zinc-400">
          게임을 하려면 먼저 로그인해 주세요.
        </p>
        <a
          href="/login"
          className="mt-8 inline-flex rounded-2xl bg-amber-400 px-8 py-4 font-black text-black"
        >
          로그인
        </a>
      </main>
    );
  if (!snap)
    return (
      <>
        <LobbyView
          lobby={lobby}
          mode={mode}
          setMode={setMode}
          playerCount={playerCount}
          setPlayerCount={setPlayerCount}
          title={title}
          setTitle={setTitle}
          busy={busy}
          notice={notice}
          onTutorial={() => setTutorialOpen(true)}
          create={create}
          join={async (id, mine) => {
            try {
              if (!mine) await rpc("yut_join_room", { p_room: id });
              await openRoom(id);
            } catch {}
          }}
        />
        <YutTutorial open={tutorialOpen} onClose={closeTutorial} />
      </>
    );
  const { room, players, pieces, me } = snap,
    current = players.find((p) => p.seat === room.turn_seat),
    host = room.host_id === userId;
  if (room.status === "WAITING")
    return (
      <>
        <Waiting
          room={room}
          players={players}
          me={me}
          host={host}
          busy={busy}
          notice={notice}
          onTutorial={() => setTutorialOpen(true)}
          action={action}
          leave={leave}
        />
        <YutTutorial open={tutorialOpen} onClose={closeTutorial} />
      </>
    );
  return (
    <>
      <Game
        room={room}
        players={players}
        pieces={pieces}
        me={me}
        current={current}
        busy={busy}
        notice={notice}
        captureNotice={captureNotice}
        turnNotice={turnNotice}
        autoSeconds={autoSeconds}
        moveAnimation={moveAnimation}
        onTutorial={() => setTutorialOpen(true)}
        action={action}
        leave={exitGame}
      />
      <YutTutorial open={tutorialOpen} onClose={closeTutorial} />
    </>
  );
}

function LobbyView({
  lobby,
  mode,
  setMode,
  playerCount,
  setPlayerCount,
  title,
  setTitle,
  busy,
  notice,
  onTutorial,
  create,
  join,
}: {
  lobby: Lobby[];
  mode: Mode;
  setMode: (m: Mode) => void;
  playerCount: number;
  setPlayerCount: (n: number) => void;
  title: string;
  setTitle: (s: string) => void;
  busy: boolean;
  notice: string;
  onTutorial: () => void;
  create: () => void;
  join: (id: string, mine: boolean) => void;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-amber-400/10 via-zinc-950 to-emerald-400/10 p-6 sm:p-9">
        <p className="text-xs font-black tracking-[.3em] text-amber-300">
          KOREAN TRADITIONAL GAME
        </p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <h1 className="text-4xl font-black">윷놀이</h1>
          <button
            type="button"
            onClick={onTutorial}
            className="rounded-xl border border-amber-300/50 bg-amber-300/10 px-4 py-2 text-sm font-black text-amber-200"
          >
            ? <span className="hidden sm:inline">조작법</span>
          </button>
        </div>
        <p className="mt-3 text-zinc-300">
          윷을 던지고, 업고, 잡고, 지름길로 먼저 네 말을 완주하세요.
        </p>
      </section>
      <section className="mt-6 rounded-3xl border border-white/10 bg-white/[.035] p-5">
        <h2 className="text-xl font-black">새 게임 만들기</h2>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(Object.keys(modeInfo) as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`min-w-0 rounded-xl border px-1.5 py-3 text-center text-sm font-black whitespace-nowrap sm:px-3 sm:text-base ${mode === m ? "border-amber-300 bg-amber-300/15 text-amber-300" : "border-white/10 bg-black/20"}`}
            >
              {modeInfo[m].label.replaceAll(" ", "")}
            </button>
          ))}
        </div>
        {mode === "PSYCHOLOGY" && <p className="mt-3 text-sm text-amber-200">2명 전용 · 각자 윷 2개를 비밀 선택하고 함께 공개해요. 도는 항상 빽도! 윷·모와 잡기는 다시 선택해요.</p>}
        {mode === "INDIVIDUAL" && (
          <div className="mt-4 flex items-center gap-2">
            <span className="mr-2 text-sm text-zinc-400">참가 인원</span>
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setPlayerCount(n)}
                className={`h-10 w-12 rounded-xl border font-bold ${playerCount === n ? "border-amber-300 bg-amber-300 text-black" : "border-white/10"}`}
              >
                {n}명
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="방 이름 (선택)"
            maxLength={30}
            className="min-h-12 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 outline-none focus:border-amber-300"
          />
          <button
            disabled={busy}
            onClick={create}
            className="rounded-xl bg-amber-400 px-7 py-3 font-black text-black disabled:opacity-50"
          >
            게임 만들기
          </button>
        </div>
        {notice && <p className="mt-3 text-sm text-red-300">{notice}</p>}
      </section>
      <section className="mt-6">
        <h2 className="text-xl font-black">참여 가능한 방</h2>
        <div className="mt-3 grid gap-3">
          {lobby.length ? (
            lobby.map((r) => (
              <article
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.035] p-4"
              >
                <div>
                  <b>{r.title}</b>
                  <p className="mt-1 text-xs text-zinc-400">
                    {modeInfo[r.mode].label} · {r.players}/{r.max_players}명 ·
                    코드 {r.code}
                    {r.status !== "WAITING" ? " · 진행 중" : ""}
                  </p>
                </div>
                <button
                  onClick={() => join(r.id, r.mine)}
                  className="shrink-0 rounded-xl border border-amber-300/60 px-4 py-2 font-bold text-amber-300"
                >
                  {r.mine ? "돌아가기" : "참가"}
                </button>
              </article>
            ))
          ) : (
            <p className="rounded-2xl border border-dashed border-white/10 py-10 text-center text-zinc-500">
              아직 열린 방이 없습니다.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

function Waiting({
  room,
  players,
  me,
  host,
  busy,
  notice,
  onTutorial,
  action,
  leave,
}: {
  room: Room;
  players: Player[];
  me: Snap["me"];
  host: boolean;
  busy: boolean;
  notice: string;
  onTutorial: () => void;
  action: (n: string, a?: Record<string, unknown>) => void;
  leave: () => void;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs text-zinc-400">
            {modeInfo[room.mode].label} · 방 코드 {room.code}
          </p>
          <h1 className="text-3xl font-black">{room.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTutorial}
            aria-label="윷놀이 조작법"
            className="grid h-10 min-w-10 place-items-center rounded-xl border border-amber-300/40 px-2 text-sm font-black text-amber-200"
          >
            ? <span className="hidden sm:inline">조작법</span>
          </button>
          <RoomChat
            roomId={room.id}
            name={players.find((player) => player.id === me.id)?.name ?? "멤버"}
          />
          <button
            onClick={leave}
            className="rounded-xl border border-red-400/30 px-4 py-2 text-red-300"
          >
            방 나가기
          </button>
        </div>
      </header>
      <section className="mt-6 rounded-3xl border border-white/10 bg-white/[.035] p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: room.max_players }, (_, seat) => {
            const p = players.find((x) => x.seat === seat),
              style = teamStyles[p?.team ?? seat];
            return (
              <div
                key={seat}
                className={`flex min-h-20 items-center justify-between rounded-2xl border bg-black/25 p-4 ${p ? style.border : "border-dashed border-white/10"}`}
              >
                <div>
                  {p ? (
                    <>
                      <b className={style.text}>{p.name}</b>
                      <p className="text-xs text-zinc-400">
                        {p.is_bot
                          ? "AI · 준비 완료"
                          : p.user_id === room.host_id
                            ? "방장"
                            : "플레이어"}
                      </p>
                    </>
                  ) : (
                    <span className="text-zinc-600">빈자리</span>
                  )}
                </div>
                {p?.is_bot && host ? (
                  <button
                    onClick={() => action("yut_remove_bot", { p_player: p.id })}
                    className="text-xs text-red-300"
                  >
                    내보내기
                  </button>
                ) : (
                  p && (
                    <span
                      className={`text-xs font-bold ${p.ready || p.user_id === room.host_id ? "text-emerald-300" : "text-zinc-500"}`}
                    >
                      {p.ready || p.user_id === room.host_id
                        ? "준비 완료"
                        : "대기"}
                    </span>
                  )
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          {host && players.length < room.max_players && (
            <button
              onClick={() => action("yut_add_bot")}
              className="rounded-xl border border-violet-300/50 bg-violet-400/10 px-5 py-3 font-bold text-violet-200"
            >
              + AI 추가
            </button>
          )}
          {!host && (
            <button
              onClick={() => action("yut_toggle_ready")}
              className={`rounded-xl px-6 py-3 font-black ${me.ready ? "bg-zinc-700" : "bg-emerald-400 text-black"}`}
            >
              {me.ready ? "준비 취소" : "준비하기"}
            </button>
          )}
          {host && (
            <button
              disabled={busy || players.length !== room.max_players}
              onClick={() => action("yut_start_room")}
              className="flex-1 rounded-xl bg-amber-400 px-6 py-3 font-black text-black disabled:opacity-30"
            >
              게임 시작
            </button>
          )}
        </div>
        {notice && <p className="mt-4 text-sm text-red-300">{notice}</p>}
      </section>
      <Rules />
    </main>
  );
}

function Game({
  room,
  players,
  pieces,
  me,
  current,
  busy,
  notice,
  captureNotice,
  turnNotice,
  autoSeconds,
  moveAnimation,
  onTutorial,
  action,
  leave,
}: {
  room: Room;
  players: Player[];
  pieces: Piece[];
  me: Snap["me"];
  current?: Player;
  busy: boolean;
  notice: string;
  captureNotice: string;
  turnNotice: string;
  autoSeconds: number | null;
  moveAnimation: MoveAnimation | null;
  onTutorial: () => void;
  action: (n: string, a?: Record<string, unknown>) => void;
  leave: () => void;
}) {
  const [routeChoice, setRouteChoice] = useState<Piece | null>(null);
  const [rollNotice, setRollNotice] = useState<number | null>(null);
  const previousRoll = useRef({ id: room.id, round: room.mind_round });
  const rollAudio = useRef<AudioContext | null>(null);
  useEffect(() => {
    const unlock = () => {
      try {
        const Audio = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Audio) return;
        rollAudio.current ??= new Audio();
        void rollAudio.current.resume().catch(() => {});
      } catch {}
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      void rollAudio.current?.close().catch(() => {});
      rollAudio.current = null;
    };
  }, []);
  useEffect(() => {
    const previous = previousRoll.current;
    previousRoll.current = { id: room.id, round: room.mind_round };
    if (room.mode !== "PSYCHOLOGY" || room.status !== "PLAYING" || previous.id !== room.id) {
      setRollNotice(null);
      return;
    }
    if (previous.round === room.mind_round || !room.mind_reveal || room.last_roll === null) return;
    setRollNotice(room.last_roll);
    playYutClack(rollAudio.current);
    const timer = setTimeout(() => setRollNotice(null), 1800);
    return () => clearTimeout(timer);
  }, [room.id, room.mode, room.status, room.mind_round]);

  const moveListKey = `${room.id}:${room.turn_seat}:${room.status}:${room.pending_moves.join(",")}`;
  const [moveSelection, setMoveSelection] = useState<{ key: string; index: number } | null>(null);
  const selectedMoveIndex = moveSelection?.key === moveListKey && moveSelection.index < room.pending_moves.length ? moveSelection.index : 0;
  useEffect(() => { setRouteChoice(null); }, [moveListKey]);
  const mePlayer = players.find((player) => player.id === me.id),
    myTurn = current?.id === me.id,
    selectedMove = room.pending_moves[selectedMoveIndex],
    host = room.host_id === mePlayer?.user_id,
    everyoneReady =
      players.length > 0 && players.every((player) => player.ready);
  const movable = pieces.filter(
    (p) =>
      !(room.mode === "PSYCHOLOGY" && room.can_roll) &&
      p.team === me.team &&
      nodeOf(p) !== 99 &&
      !(selectedMove === -1 && p.step_index === 0 && !p.back_at_start),
  );
  const waitingPiece = pieces.find(
    (piece) =>
      piece.team === me.team && nodeOf(piece) === 0 && !piece.back_at_start,
  );
  const movePiece = (piece: Piece) => {
    if (!myTurn || room.pending_moves.length === 0 || busy || (room.mode === "PSYCHOLOGY" && room.can_roll)) return;
    if ([5, 10, 22].includes(nodeOf(piece)) && selectedMove > 0) {
      setRouteChoice(piece);
      return;
    }
    action("yut_move", { p_piece: piece.piece_no, p_move_index: selectedMoveIndex + 1 });
  };
  const chooseRoute = async (
    route: "LEFT" | "RIGHT" | "OUTER" | "DIAGONAL",
  ) => {
    if (!routeChoice) return;
    try {
      await action("yut_move_choice", {
        p_piece: routeChoice.piece_no,
        p_move_index: selectedMoveIndex + 1,
        p_center_route: route,
      });
    } finally {
      setRouteChoice(null);
    }
  };
  const activeRouteChoice =
    routeChoice && myTurn && room.pending_moves.length > 0
      ? (pieces.find(
          (piece) =>
            piece.team === routeChoice.team &&
            piece.piece_no === routeChoice.piece_no &&
            [5, 10, 22].includes(nodeOf(piece)),
        ) ?? null)
      : null;
  return (
    <main className="relative mx-auto max-w-6xl px-3 py-5">
      <header className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 p-4">
        <div>
          <p className="text-xs text-zinc-400">
            {modeInfo[room.mode].label} · {room.status}
          </p>
          <h1 className="text-2xl font-black">{room.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTutorial}
            aria-label="윷놀이 조작법"
            className="grid h-10 min-w-10 place-items-center rounded-xl border border-amber-300/40 px-2 text-xs font-black text-amber-200"
          >
            ? <span className="hidden sm:inline">조작법</span>
          </button>
          <RoomChat
            roomId={room.id}
            name={players.find((player) => player.id === me.id)?.name ?? "멤버"}
          />
          <button
            type="button"
            onClick={leave}
            className="rounded-xl border border-red-400/40 px-4 py-2 text-sm font-bold text-red-300 transition hover:bg-red-400/10"
          >
            게임 나가기
          </button>
        </div>
      </header>
      <div className="mt-3 flex w-full gap-1.5 overflow-x-auto">
        {players.map((p) => {
          const remaining = pieces.filter(
            (piece) => piece.team === p.team && nodeOf(piece) !== 99,
          ).length;
          const finishedRank = (room.finish_order ?? []).indexOf(p.team) + 1;
          return (
            <div
              key={p.id}
              className={`min-w-0 flex-1 whitespace-nowrap rounded-xl border-[3px] px-2 py-2 text-center ${room.status === "PLAYING" && p.seat === room.turn_seat ? "border-white bg-white/10" : `${teamStyles[p.team].border} bg-black/20`}`}
            >
              <span className={`mb-1 block text-xs font-black text-white ${room.status === "PLAYING" && p.seat === room.turn_seat ? "" : "invisible"}`}>현재 턴</span>
              <b
                className={`block truncate text-xs sm:text-sm ${teamStyles[p.team].text}`}
              >
                {p.name}
              </b>
              <div
                className="mt-1 flex min-h-3 items-center justify-center gap-1"
                aria-label={`남은 말 ${remaining}개`}
              >
                {finishedRank > 0 ? (
                  <span className="text-[10px] font-black text-amber-200">
                    {finishedRank}위 완주
                  </span>
                ) : remaining > 0 ? (
                  Array.from({ length: remaining }, (_, index) => (
                    <span
                      key={index}
                      className={`h-2.5 w-2.5 rounded-full ${teamStyles[p.team].bg}`}
                    />
                  ))
                ) : (
                  <span className="text-[9px] font-bold text-zinc-400">
                    완주
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {room.status === "FINISHED" ? (
        <section className="mt-5 rounded-3xl border border-amber-300/50 bg-amber-300/10 p-10 text-center">
          <p className="text-lg text-amber-200">최종 순위</p>
          <div className="mx-auto mt-5 grid max-w-xl gap-3">
            {(room.finish_order ?? []).map((team, index) => {
              const names = players
                .filter((player) => player.team === team)
                .map((player) => player.name)
                .join("/");
              return (
                <div
                  key={team}
                  className={`flex items-center justify-between rounded-2xl border bg-black/35 px-5 py-4 ${teamStyles[team].border}`}
                >
                  <strong className={teamStyles[team].text}>
                    {index + 1}위 · {names}
                  </strong>
                  <span className="text-sm text-zinc-300">
                    {index === (room.finish_order ?? []).length - 1
                      ? "미완주"
                      : "완주"}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-5 text-zinc-300">
            마지막 한 팀을 제외한 모든 팀이 완주했습니다.
          </p>
          <div className="mx-auto mt-7 grid max-w-xl gap-2 sm:grid-cols-2">
            {players.map((player) => (
              <div
                key={player.id}
                className={`rounded-xl border px-4 py-3 text-sm font-black ${teamStyles[player.team].border}`}
              >
                <span className={teamStyles[player.team].text}>
                  {player.name}
                </span>
                <span
                  className={`ml-2 ${player.ready ? "text-emerald-300" : "text-zinc-500"}`}
                >
                  {player.ready ? "준비 완료" : "대기 중"}
                </span>
              </div>
            ))}
          </div>
          {!mePlayer?.is_bot && (
            <button
              type="button"
              disabled={busy}
              onClick={() => action("yut_toggle_rematch")}
              className={`mt-6 rounded-2xl px-8 py-4 font-black ${me.ready ? "bg-zinc-700 text-white" : "bg-emerald-400 text-black"}`}
            >
              {me.ready ? "다시 하기 취소" : "다시 하기"}
            </button>
          )}
          {host && (
            <button
              type="button"
              disabled={busy || !everyoneReady}
              onClick={() => action("yut_start_rematch")}
              className="ml-2 mt-6 rounded-2xl bg-amber-400 px-8 py-4 font-black text-black disabled:opacity-30"
            >
              {everyoneReady ? "새 게임 시작" : "모두 준비하면 시작 가능"}
            </button>
          )}
        </section>
      ) : (
        <>
          <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_18rem]">
            <div className="relative min-w-0 self-start">
            <YutBoard
              room={room}
              players={players}
              me={me}
              pieces={pieces}
              onPiece={movePiece}
              movable={new Set(movable.map((p) => `${p.team}-${p.piece_no}`))}
              routeChoice={activeRouteChoice}
              onRouteChoice={chooseRoute}
              captureNotice={captureNotice}
              turnNotice={turnNotice}
        autoSeconds={autoSeconds}
              moveAnimation={moveAnimation}
            />
              {room.mode === "PSYCHOLOGY" && room.can_roll && rollNotice === null && (
                <div className="absolute bottom-[8%] left-1/2 z-40 grid w-[84%] max-w-sm -translate-x-1/2 grid-cols-3 gap-2 opacity-50">
                  {[1, 2, 0].map(fronts => (
                    <button key={fronts} type="button" aria-label={stickChoiceLabel(fronts)}
                      aria-pressed={room.mind_selected?.includes(me.id) && room.mind_my_choice === fronts}
                      disabled={busy || room.mind_selected?.includes(me.id)}
                      onClick={() => action("yut_mind_choose", { p_round: room.mind_round, p_fronts: fronts })}
                      className={`rounded-xl border-2 px-1 py-2 ${room.mind_selected?.includes(me.id) && room.mind_my_choice === fronts ? "border-emerald-300 bg-emerald-700" : "border-amber-200/60 bg-zinc-950"}`}>
                      <YutStickPair fronts={fronts} />
                    </button>
                  ))}
                </div>
              )}
              {rollNotice !== null && (
                <div role="status" aria-live="polite" className="pointer-events-none absolute left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-amber-200 bg-zinc-950/90 px-10 py-5 text-center shadow-2xl">
                  <p className="text-sm text-amber-100">윷 결과</p>
                  <p className="mt-1 whitespace-nowrap text-5xl font-black text-amber-300">{resultLabel[rollNotice]}!</p>
                </div>
              )}
            </div>
            <aside className="rounded-3xl border border-white/10 bg-white/[.035] p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 max-w-[35%] shrink-0">
                  <p className="text-lg font-bold text-zinc-200">현재 차례</p>
                  <h2
                    className={`mt-1 break-words text-4xl font-black sm:text-5xl ${teamStyles[current?.team ?? 0].text}`}
                  >
                    {current?.name}
                  </h2>
                </div>
              {room.pending_moves.length > 0 && <div className="min-w-0 flex-1 text-center">
                <p className="mb-2 text-xs text-zinc-300">사용할 결과를 골라 주세요</p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {room.pending_moves.map((m, i) => (
                    <button key={`${m}-${i}`} type="button"
                      aria-label={`${i + 1}번째 결과 ${resultLabel[m]} 사용`}
                      aria-pressed={i === selectedMoveIndex}
                      disabled={!myTurn || busy || (room.mode === "PSYCHOLOGY" && room.can_roll)}
                      onClick={() => { setMoveSelection({ key: moveListKey, index: i }); setRouteChoice(null); }}
                      className={`min-h-11 rounded-full border-2 px-2 py-2 text-sm font-black disabled:cursor-default ${i === selectedMoveIndex ? "border-white bg-amber-300 text-black" : "border-amber-300/50 bg-black/30 text-amber-200"}`}>
                      {resultLabel[m]}{i === selectedMoveIndex ? " ✓" : ""}
                    </button>
                  ))}
                </div>
              </div>}
                {room.mode === "PSYCHOLOGY" && room.can_roll && (
                  <div className="min-w-0 max-w-[65%] text-right text-xs text-zinc-300">
                    <p className="font-bold text-amber-200">판 위에서 윷 두 개를 골라 주세요</p>
                    <p className="mt-1">15초 안에 선택 · 미선택 시 랜덤</p>
                    <div className="mt-2 space-y-1">{players.map(p => <p key={p.id} className={room.mind_selected?.includes(p.id) ? "text-emerald-300" : ""}>{p.name}: {room.mind_selected?.includes(p.id) ? "선택 완료" : "선택 중"}</p>)}</div>
                  </div>
                )}
                {myTurn && !(room.mode === "PSYCHOLOGY" && room.can_roll) && waitingPiece && selectedMove > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => movePiece(waitingPiece)}
                    className="shrink-0 rounded-xl border border-emerald-300 bg-emerald-400/15 px-3 py-2 text-sm font-black text-emerald-200 disabled:opacity-50"
                  >
                    새 말 출발
                  </button>
                )}
              </div>
              {room.last_roll !== null && (
                <div className="mt-5 rounded-2xl bg-black/30 p-5 text-center">
                  <span className="text-sm text-zinc-400">최근 결과</span>
                  <b className="block text-4xl text-amber-300">
                    {resultLabel[room.last_roll]}
                  </b>
                </div>
              )}
              {myTurn && room.can_roll && room.mode !== "PSYCHOLOGY" && (
                <button
                  disabled={busy}
                  onClick={() => action("yut_roll")}
                  className="mt-5 w-full rounded-2xl bg-amber-400 py-5 text-xl font-black text-black"
                >
                  윷 던지기
                </button>
              )}
              {room.mode === "PSYCHOLOGY" && (
                <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/5 p-3">
                  <p className="font-black text-amber-200">1:1 심리전 · 도는 빽도</p>
                  {room.mind_reveal && <div className="mt-2 text-sm text-zinc-300"><p>지난 선택 공개</p>{room.mind_reveal.map(c=><p key={c.player_id}>{players.find(p=>p.id===c.player_id)?.name}: <YutStickPair fronts={c.fronts} compact /></p>)}</div>}

                </div>
              )}
              {!myTurn && (
                <p className="mt-5 text-sm text-zinc-400">
                  상대의 차례를 기다리는 중입니다.
                </p>
              )}
              {notice && (
                <p className="mt-4 break-words text-sm text-red-300">
                  {notice}
                </p>
              )}
            </aside>
          </section>
        </>
      )}
      <Rules />
    </main>
  );
}

function stickChoiceLabel(fronts: number) {
  return ["무늬 있는 윷 두 개", "민무늬 윷 하나와 무늬 있는 윷 하나", "민무늬 윷 두 개"][fronts];
}

function YutStickPair({ fronts, compact = false }: { fronts: number; compact?: boolean }) {
  return (
    <svg role="img" aria-label={stickChoiceLabel(fronts)} viewBox="0 0 80 104"
      className={compact ? "mx-1 inline-block h-10 w-8 align-middle" : "mx-auto h-24 w-full max-w-20"}>
      {[0, 1].map(index => (
        <g key={index} transform={`translate(${index * 38 + 7}, 4)`}>
          <rect x="0" y="0" width="26" height="96" rx="6" fill="#edbd65" stroke="#69492c" strokeWidth="3" />
          <path d="M5 8V87" stroke="#ffe0a0" strokeWidth="3" strokeLinecap="round" />
          {index >= fronts && [18, 38, 58, 78].map(y => (
            <path key={y} d={`M9 ${y-4}l8 8m0-8l-8 8`} stroke="#69492c" strokeWidth="3" strokeLinecap="round" />
          ))}
        </g>
      ))}
    </svg>
  );
}

function YutBoard({
  room,
  players,
  me,
  pieces,
  onPiece,
  movable,
  routeChoice,
  onRouteChoice,
  captureNotice,
  turnNotice,
  autoSeconds,
  moveAnimation,
}: {
  room: Room;
  players: Player[];
  me: Snap["me"];
  pieces: Piece[];
  onPiece: (p: Piece) => void;
  movable: Set<string>;
  routeChoice: Piece | null;
  onRouteChoice: (route: "LEFT" | "RIGHT" | "OUTER" | "DIAGONAL") => void;
  captureNotice: string;
  turnNotice: string;
  autoSeconds: number | null;
  moveAnimation: MoveAnimation | null;
}) {
  const nodes = [
    ...Array.from({ length: 21 }, (_, i) => i),
    21,
    29,
    22,
    23,
    24,
    25,
    26,
    27,
    28,
  ];
  const groups = new Map<string, Piece[]>();
  for (const piece of pieces) {
    if (
      (piece.step_index === 0 && !piece.back_at_start) ||
      nodeOf(piece) === 99
    )
      continue;
    const key = `${piece.team}-${nodeOf(piece)}`;
    groups.set(key, [...(groups.get(key) ?? []), piece]);
  }
  const teamLabel = (team: number) => {
    const members = players.filter((p) => p.team === team);
    if (room.mode !== "INDIVIDUAL" && team === me.team)
      members.sort((a, b) => Number(b.id === me.id) - Number(a.id === me.id));
    return members.map((p) => p.name).join("/");
  };
  const choiceNode = routeChoice ? nodeOf(routeChoice) : null;
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-amber-200/20 bg-[radial-gradient(circle,#174432_0%,#0b241c_60%,#07100d_100%)] p-4">
      <svg
        viewBox="0 0 100 100"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-50"
      >
        <path
          d="M10 90L10 10L90 10L90 90L10 90M10 90L90 10M10 10L90 90"
          fill="none"
          stroke="#fde68a"
          strokeWidth="1"
        />
      </svg>
      {nodes.map((n) => {
        const [x, y] = boardPos[n];
        return (
          <span
            key={n}
            className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-100/60 bg-[#102d23] ${[5, 10, 15, 20, 22].includes(n) ? "h-7 w-7" : "h-4 w-4"}`}
            style={{ left: `${x}%`, top: `${y}%` }}
          />
        );
      })}
      {autoSeconds !== null && room.status === "PLAYING" && (
        <div role="timer" aria-label={`자동 진행까지 ${autoSeconds}초`} className="pointer-events-none absolute left-1/2 top-[19%] z-10 -translate-x-1/2 text-center">
          <p className="text-[10px] font-bold text-white/70 sm:text-xs">자동 진행</p>
          <p className={`text-3xl font-black tabular-nums drop-shadow-lg sm:text-4xl ${autoSeconds <= 3 ? "text-red-300" : "text-white"}`}>{autoSeconds}<span className="ml-0.5 text-sm">초</span></p>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-amber-100/50">
        출발 / 도착
      </div>
      {(captureNotice || turnNotice) && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-50 w-[82%] -translate-x-1/2 -translate-y-1/2 text-center">
          {captureNotice && (
            <div
              role="status"
              className="animate-pulse rounded-2xl border-2 border-amber-300 bg-zinc-950/95 px-4 py-4 text-sm font-black text-amber-200 shadow-2xl shadow-amber-400/30 sm:text-base"
            >
              💥 {captureNotice}
            </div>
          )}
          {turnNotice && (
            <div
              role="status"
              className="inline-flex rounded-full border-2 border-white bg-amber-300 px-6 py-3 text-base font-black text-black shadow-2xl sm:text-lg"
            >
              🔔 {turnNotice}
            </div>
          )}
        </div>
      )}
      {[...groups.entries()].map(([key, group]) => {
        const visibleGroup = moveAnimation
          ? group.filter(
              (item) =>
                item.team !== moveAnimation.team ||
                !moveAnimation.pieceNos.includes(item.piece_no),
            )
          : group;
        if (!visibleGroup.length) return null;
        const piece = visibleGroup[0],
          node = nodeOf(piece),
          [x, y] = boardPos[node] ?? [50, 104],
          enabled = visibleGroup.some((p) =>
            movable.has(`${p.team}-${p.piece_no}`),
          ),
          chosen =
            visibleGroup.find((p) => movable.has(`${p.team}-${p.piece_no}`)) ??
            piece;
        return (
          <button
            type="button"
            key={key}
            onClick={() => onPiece(chosen)}
            disabled={!enabled}
            aria-label={`${teamLabel(piece.team)} 말 ${visibleGroup.length}개`}
            className={`pointer-events-auto absolute z-20 flex min-h-8 max-w-28 touch-manipulation items-center justify-center gap-1 rounded-full border-2 border-white/80 px-2 text-[10px] font-black leading-tight text-black shadow-lg sm:min-h-10 sm:text-xs ${teamStyles[piece.team].bg} disabled:cursor-default disabled:opacity-80 ${enabled ? "cursor-pointer ring-4 ring-white/60" : ""}`}
            style={{
              left: `${Math.min(x, 94)}%`,
              top: `${Math.min(y, 94)}%`,
              transform: "translate(-50%,-115%)",
            }}
          >
            <span className="truncate">{teamLabel(piece.team)}</span>
            {visibleGroup.length > 1 && (
              <span className="shrink-0 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] text-white">
                ×{visibleGroup.length}
              </span>
            )}
          </button>
        );
      })}
      {moveAnimation && (
        <AnimatedYutPiece
          key={moveAnimation.id}
          animation={moveAnimation}
          label={teamLabel(moveAnimation.team)}
        />
      )}
      {choiceNode === 22 && (
        <div className="absolute left-1/2 top-1/2 z-40 flex w-56 -translate-x-1/2 translate-y-4 items-center justify-between">
          <button
            type="button"
            onClick={() => onRouteChoice("LEFT")}
            className="rounded-full border-2 border-white bg-amber-300 px-4 py-3 text-xl font-black text-black shadow-xl"
            aria-label="왼쪽 길 선택"
          >
            ↙
          </button>
          <span className="rounded-full bg-black/90 px-3 py-2 text-xs font-black text-white">
            방향 선택
          </span>
          <button
            type="button"
            onClick={() => onRouteChoice("RIGHT")}
            className="rounded-full border-2 border-white bg-amber-300 px-4 py-3 text-xl font-black text-black shadow-xl"
            aria-label="오른쪽 길 선택"
          >
            ↘
          </button>
        </div>
      )}
      {choiceNode === 5 && (
        <div className="absolute right-[3%] top-[13%] z-40 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onRouteChoice("OUTER")}
            className="rounded-full border-2 border-white bg-amber-300 px-3 py-2 text-lg font-black text-black shadow-xl"
            aria-label="바깥길 선택"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => onRouteChoice("DIAGONAL")}
            className="rounded-full border-2 border-white bg-amber-300 px-3 py-2 text-lg font-black text-black shadow-xl"
            aria-label="중앙 지름길 선택"
          >
            ↙
          </button>
        </div>
      )}
      {choiceNode === 10 && (
        <div className="absolute left-[3%] top-[13%] z-40 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onRouteChoice("DIAGONAL")}
            className="rounded-full border-2 border-white bg-amber-300 px-3 py-2 text-lg font-black text-black shadow-xl"
            aria-label="중앙 지름길 선택"
          >
            ↘
          </button>
          <button
            type="button"
            onClick={() => onRouteChoice("OUTER")}
            className="rounded-full border-2 border-white bg-amber-300 px-3 py-2 text-lg font-black text-black shadow-xl"
            aria-label="바깥길 선택"
          >
            ↓
          </button>
        </div>
      )}
    </div>
  );
}

function AnimatedYutPiece({
  animation,
  label,
}: {
  animation: MoveAnimation;
  label: string;
}) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step >= animation.nodes.length - 1) return;
    const timer = setTimeout(() => setStep((current) => current + 1), 260);
    return () => clearTimeout(timer);
  }, [animation.nodes.length, step]);
  const currentNode = animation.nodes[step];
  if (currentNode === 99) return null;
  const [x, y] = boardPos[currentNode] ?? [50, 104];
  return (
    <div
      aria-label={`${label} 이동 중`}
      className={`pointer-events-none absolute z-30 flex min-h-8 max-w-28 items-center justify-center gap-1 rounded-full border-2 border-white px-2 text-[10px] font-black leading-tight text-black shadow-xl transition-[left,top] duration-200 ease-out sm:min-h-10 sm:text-xs ${teamStyles[animation.team].bg}`}
      style={{
        left: `${Math.min(x, 94)}%`,
        top: `${Math.min(y, 94)}%`,
        transform: "translate(-50%,-115%)",
      }}
    >
      <span className="truncate">{label}</span>
      {animation.pieceNos.length > 1 && (
        <span className="shrink-0 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] text-white">
          ×{animation.pieceNos.length}
        </span>
      )}
    </div>
  );
}

function RoomChat({ roomId, name }: { roomId: string; name: string }) {
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null),
    endRef = useRef<HTMLDivElement | null>(null),
    inputRef = useRef<HTMLInputElement | null>(null),
    composingRef = useRef(false);
  const [open, setOpen] = useState(false),
    [opacity, setOpacity] = useState(90),
    [text, setText] = useState(""),
    [chats, setChats] = useState<Chat[]>([]),
    [position, setPosition] = useState<{ x: number; y: number } | null>(null),
    [size, setSize] = useState({ width: 288, height: 288 });

  useEffect(() => {
    const roomChannel = supabase.channel(`yut:${roomId}`, {
      config: { broadcast: { self: false } },
    });
    roomChannel
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        const item = payload as Chat;
        setChats((current) => [...current.slice(-99), item]);
      })
      .subscribe();
    channel.current = roomChannel;
    return () => {
      channel.current = null;
      void supabase.removeChannel(roomChannel);
    };
  }, [roomId]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ block: "end" });
      inputRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, chats]);

  const openChat = () => {
    const width = Math.min(size.width, window.innerWidth - 24),
      height = Math.min(size.height, window.innerHeight - 96);
    setSize({ width, height });
    setPosition((current) =>
      current
        ? {
            x: Math.max(
              12,
              Math.min(current.x, window.innerWidth - width - 12),
            ),
            y: Math.max(
              12,
              Math.min(current.y, window.innerHeight - height - 12),
            ),
          }
        : { x: Math.max(12, (window.innerWidth - width) / 2), y: 80 },
    );
    setOpen(true);
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      !position ||
      (event.target as HTMLElement).closest("button,input,label")
    )
      return;
    const startX = event.clientX,
      startY = event.clientY,
      origin = position;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) =>
      setPosition({
        x: Math.max(
          12,
          Math.min(
            origin.x + next.clientX - startX,
            window.innerWidth - size.width - 12,
          ),
        ),
        y: Math.max(
          12,
          Math.min(
            origin.y + next.clientY - startY,
            window.innerHeight - size.height - 12,
          ),
        ),
      });
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!position) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX,
      startY = event.clientY,
      origin = size;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) =>
      setSize({
        width: Math.max(
          240,
          Math.min(
            origin.width + next.clientX - startX,
            window.innerWidth - position.x - 12,
          ),
        ),
        height: Math.max(
          208,
          Math.min(
            origin.height + next.clientY - startY,
            window.innerHeight - position.y - 12,
          ),
        ),
      });
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const send = () => {
    const message = text.trim().slice(0, 200);
    if (!message) return;
    const item: Chat = {
      id: crypto.randomUUID(),
      user: name,
      text: message,
      at: Date.now(),
    };
    setChats((current) => [...current.slice(-99), item]);
    void channel.current?.send({
      type: "broadcast",
      event: "chat",
      payload: item,
    });
    setText("");
  };

  return (
    <>
      <button
        type="button"
        onClick={openChat}
        aria-label="실시간 채팅 열기"
        className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-lg"
      >
        💬
      </button>
      {open && (
        <div className="pointer-events-none fixed inset-0 z-[70]">
          <aside
            className="pointer-events-auto fixed flex min-h-[13rem] min-w-[15rem] flex-col overflow-hidden rounded-2xl border p-3"
            style={{
              left: position?.x ?? 12,
              top: position?.y ?? 80,
              width: size.width,
              height: size.height,
              backgroundColor: `rgba(255,255,255,${opacity / 100})`,
              borderColor: `rgba(255,255,255,${(opacity / 100) * 0.75})`,
              boxShadow: `0 24px 48px rgba(0,0,0,${(opacity / 100) * 0.45})`,
            }}
          >
            <div
              onPointerDown={startDrag}
              className="flex cursor-move touch-none items-center justify-between select-none"
              title="드래그해서 채팅창 이동"
            >
              <button
                type="button"
                aria-label="채팅 닫기"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setOpen(false)}
                className="order-first relative z-20 mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-base"
                style={{
                  backgroundColor: `rgba(255,255,255,${(opacity / 100) * 0.7})`,
                  borderColor: `rgba(212,212,216,${opacity / 100})`,
                  color: `rgba(9,9,11,${Math.min(1, 0.55 + opacity / 200)})`,
                }}
              >
                ✕
              </button>
              <div
                className="min-w-0 flex-1"
                style={{ opacity: Math.min(1, 0.55 + opacity / 200) }}
              >
                <h2 className="text-sm font-black text-zinc-950">
                  실시간 채팅
                </h2>
                <p className="text-[9px] text-zinc-600">
                  방이 닫히면 대화도 사라집니다.
                </p>
              </div>
            </div>
            <label
              className="mt-2 flex items-center gap-2 text-[10px] font-bold text-zinc-600"
              style={{ opacity: Math.min(1, 0.55 + opacity / 200) }}
            >
              <span className="shrink-0">투명도</span>
              <input
                type="range"
                min={5}
                max={100}
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
                className="h-4 min-w-0 flex-1 accent-emerald-500"
                aria-label="채팅창 투명도"
              />
              <span className="w-7 text-right">{opacity}%</span>
            </label>
            <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-1">
              {chats.length === 0 && (
                <p
                  className="py-8 text-center text-sm text-zinc-600"
                  style={{ opacity: Math.min(1, 0.55 + opacity / 200) }}
                >
                  아직 채팅이 없습니다.
                </p>
              )}
              {chats.map((chat) => (
                <div key={chat.id} className="px-1 py-1">
                  <b
                    className="text-[10px] text-emerald-700"
                    style={{ opacity: Math.min(1, 0.62 + opacity / 250) }}
                  >
                    {chat.user}
                  </b>
                  <p
                    className="break-words text-xs text-zinc-950"
                    style={{ opacity: Math.min(1, 0.62 + opacity / 250) }}
                  >
                    {chat.text}
                  </p>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div className="mt-2 flex shrink-0 gap-1.5">
              <input
                ref={inputRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={() => {
                  composingRef.current = false;
                }}
                onKeyDown={(event) => {
                  if (
                    event.key !== "Enter" ||
                    composingRef.current ||
                    event.nativeEvent.isComposing ||
                    event.nativeEvent.keyCode === 229
                  )
                    return;
                  event.preventDefault();
                  send();
                }}
                maxLength={200}
                placeholder="메시지 입력"
                className="min-w-0 flex-1 rounded-lg border p-2 text-sm placeholder:text-zinc-500"
                style={{
                  backgroundColor: `rgba(255,255,255,${(opacity / 100) * 0.85})`,
                  borderColor: `rgba(212,212,216,${opacity / 100})`,
                  color: `rgba(9,9,11,${Math.min(1, 0.62 + opacity / 250)})`,
                }}
              />
              <button
                type="button"
                onClick={send}
                className="rounded-lg px-2.5 text-xs font-black"
                style={{
                  backgroundColor: `rgba(16,185,129,${(opacity / 100) * 0.9})`,
                  color: `rgba(9,9,11,${Math.min(1, 0.62 + opacity / 250)})`,
                }}
              >
                전송
              </button>
            </div>
            <button
              type="button"
              aria-label="채팅창 크기 조절"
              title="드래그해서 채팅창 크기 조절"
              onPointerDown={startResize}
              className="absolute bottom-0 right-0 h-6 w-6 cursor-se-resize touch-none text-zinc-600 after:absolute after:bottom-1 after:right-1 after:h-2.5 after:w-2.5 after:border-b-2 after:border-r-2 after:border-current"
            />
          </aside>
        </div>
      )}
    </>
  );
}
const tutorialSteps = [
  {
    icon: "🎲",
    title: "내 차례에 윷 던지기",
    description:
      "화면에 ‘내 차례’ 알림이 뜨면 오른쪽의 윷 던지기를 누르세요. 5초 동안 누르지 않으면 자동으로 던집니다.",
    tip: "도·개·걸은 1·2·3칸, 윷·모는 4·5칸이며 윷·모가 나오면 한 번 더 던져요.",
  },
  {
    icon: "👆",
    title: "움직일 말 선택하기",
    description:
      "나온 결과를 확인한 뒤 게임판에서 움직일 말을 직접 누르세요. 아직 출발하지 않은 말은 ‘새 말 출발’을 누르면 됩니다.",
    tip: "15초 동안 고르지 않으면 유리한 말을 자동으로 움직여요.",
  },
  {
    icon: "↗️",
    title: "갈림길 방향 고르기",
    description:
      "모서리나 중앙에서 말이 멈추면 이동 가능한 방향에 화살표가 나타납니다. 원하는 화살표를 눌러 바깥길이나 지름길을 선택하세요.",
    tip: "말은 선택한 경로를 따라 칸마다 이동하는 모습이 표시돼요.",
  },
  {
    icon: "💥",
    title: "업기와 상대 말 잡기",
    description:
      "같은 팀 말과 같은 칸에 도착하면 함께 업혀 움직입니다. 상대 말이 있는 칸에 도착하면 그 말을 잡고 윷을 한 번 더 던집니다.",
    tip: "잡기 알림과 효과음은 게임판 중앙에 표시돼요.",
  },
  {
    icon: "↩️",
    title: "우리 방의 빽도 규칙",
    description:
      "첫 칸의 말이 빽도를 맞으면 출발 지역으로 돌아갑니다. 그 말이 다시 빽도를 맞으면 바로 완주합니다.",
    tip: "잡혀서 출발로 돌아온 말은 이 특수 완주 규칙에 포함되지 않아요.",
  },
] as const;

function YutTutorial({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  if (!open) return null;
  const item = tutorialSteps[step],
    last = step === tutorialSteps.length - 1,
    close = () => {
      setStep(0);
      onClose();
    };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="yut-tutorial-title"
      className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <section className="w-full max-w-md overflow-hidden rounded-3xl border border-amber-300/40 bg-[#101713] shadow-2xl shadow-black">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[10px] font-black tracking-[.25em] text-amber-300">
              YUTNORI TUTORIAL
            </p>
            <h2 id="yut-tutorial-title" className="mt-1 text-xl font-black">
              윷놀이 조작법
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="튜토리얼 닫기"
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-lg text-zinc-300"
          >
            ✕
          </button>
        </div>
        <div className="p-5">
          <div
            className="flex gap-2"
            aria-label={`${step + 1}/${tutorialSteps.length} 단계`}
          >
            {tutorialSteps.map((_, index) => (
              <span
                key={index}
                className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-amber-300" : "bg-white/10"}`}
              />
            ))}
          </div>
          <div className="mt-6 rounded-3xl border border-white/10 bg-black/30 p-6 text-center">
            <span className="text-5xl" aria-hidden="true">
              {item.icon}
            </span>
            <p className="mt-4 text-xs font-black text-amber-300">
              {step + 1}단계
            </p>
            <h3 className="mt-1 text-2xl font-black">{item.title}</h3>
            <p className="mt-4 text-sm leading-6 text-zinc-200">
              {item.description}
            </p>
          </div>
          <p className="mt-4 rounded-2xl bg-emerald-400/10 px-4 py-3 text-xs leading-5 text-emerald-200">
            💡 {item.tip}
          </p>
          <div className="mt-5 flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((current) => current - 1)}
                className="rounded-xl border border-white/15 px-5 py-3 font-bold text-zinc-200"
              >
                이전
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                last ? close() : setStep((current) => current + 1)
              }
              className="flex-1 rounded-xl bg-amber-400 px-5 py-3 font-black text-black"
            >
              {last ? "게임 시작하기" : "다음"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Rules() {
  return (
    <details className="mt-5 rounded-2xl border border-white/10 bg-white/[.025] p-4 text-sm text-zinc-300">
      <summary className="cursor-pointer font-bold text-amber-300">
        게임 방법
      </summary>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>
          도·개·걸은 1·2·3칸, 윷·모는 4·5칸 이동하고 윷·모는 한 번 더 던집니다.
        </li>
        <li>
          상대 말을 잡아도 한 번 더 던지며, 같은 팀 말끼리는 업어서 함께
          움직입니다.
        </li>
        <li>
          모서리에서 안쪽 길로 들어가 지름길을 이용합니다. 빽도는 판 위의 말을
          한 칸 뒤로 움직입니다.
        </li>
        <li>
          개인전은 각자, 팀전은 팀원이 공동으로 말 4개를 모두 완주하면
          승리합니다.
        </li>
      </ul>
    </details>
  );
}
