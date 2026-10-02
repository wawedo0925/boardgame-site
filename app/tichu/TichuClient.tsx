"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TichuTutorial from "./TichuTutorial";

type Combo = { kind: string; size: number; strength: number; bomb: boolean };
type Lobby = {
  id: string;
  title: string;
  host_name: string;
  status: string;
  players: number;
  spectators: number;
  mine: boolean;
  spectating: boolean;
  spectators_allowed: boolean;
  target_score: number;
  turn_seconds: number;
  game_mode: "TEAM" | "INDIVIDUAL";
};
type Player = {
  user_id: string;
  seat: number;
  team: number;
  name: string;
  gender: string | null;
  is_bot?: boolean;
  bot_difficulty?: "beginner" | "intermediate" | "advanced";
  avatar: number;
  skin: number;
  hairColor: number;
  expression: number;
  outfit: number;
  accessory: number;
  frame: number;
  count: number;
  ready: boolean;
  grand_choice: boolean | null;
  grand_called: boolean;
  small_called: boolean;
  finish_order: number | null;
  score: number;
};
type Room = {
  id: string;
  title: string;
  host_id: string;
  status: string;
  revision: number;
  turn_seat: number | null;
  lead: Combo | null;
  trick: { seat: number; cards: number[] }[];
  last_trick_seat: number | null;
  winner_team: number | null;
  winner_user_id: string | null;
  game_mode: "TEAM" | "INDIVIDUAL";
  target_score: number;
  turn_seconds: number;
  turn_deadline: string | null;
  exchange_deadline: string | null;
  round_no: number;
  sky_score: number;
  pink_score: number;
  round_history: {
    round: number;
    sky: number;
    pink: number;
    first_user: string;
    individual?: Record<string, number>;
  }[];
  wish_rank: number | null;
  dragon_target: string | null;
  spectators_allowed: boolean;
};
type Snap = {
  room: Room;
  spectator: boolean;
  viewer_name: string;
  me: {
    user_id: string;
    seat: number | null;
    team: number | null;
    cards: number[];
    ready: boolean;
    grand_choice: boolean | null;
    grand_called: boolean;
    small_called: boolean;
    has_played: boolean;
  };
  players: Player[];
  exchange_count: number;
  exchange_pending_ids: string[];
  spectator_names: string[];
  my_gifts: Record<string, number>;
  received: { card: number; from_name: string }[];
};
type Chat = { id: string; user: string; text: string; at: number };
const suits = ["●", "◆", "★", "▲"],
  colors = [
    "text-sky-500",
    "text-pink-500",
    "text-amber-500",
    "text-violet-500",
  ],
  teams = [
    { name: "하늘팀", border: "border-sky-400", text: "text-sky-300" },
    { name: "핑크팀", border: "border-pink-400", text: "text-pink-300" },
  ],
  individualColors = [
    { border: "border-red-400", text: "text-red-300", bg: "bg-red-400/10" },
    { border: "border-yellow-400", text: "text-yellow-300", bg: "bg-yellow-400/10" },
    { border: "border-blue-400", text: "text-blue-300", bg: "bg-blue-400/10" },
    { border: "border-emerald-400", text: "text-emerald-300", bg: "bg-emerald-400/10" },
  ];
function rank(c: number) {
  return c < 52
    ? Math.floor(c / 4) + 2
    : c === 52
      ? 1
      : c === 53
        ? 0
        : c === 54
          ? 14.5
          : 15;
}
function label(c: number) {
  if (c === 52) return "참새";
  if (c === 53) return "개";
  if (c === 54) return "봉황";
  if (c === 55) return "용";
  const r = rank(c);
  return r === 14
    ? "A"
    : r === 13
      ? "K"
      : r === 12
        ? "Q"
        : r === 11
          ? "J"
          : String(r);
}
function spokenRank(value: number) {
  return (
    {
      2: "Two",
      3: "Three",
      4: "Four",
      5: "Five",
      6: "Six",
      7: "Seven",
      8: "Eight",
      9: "Nine",
      10: "Ten",
      11: "Jack",
      12: "Queen",
      13: "King",
      14: "Ace",
    } as Record<number, string>
  )[Math.floor(value)] || String(Math.floor(value));
}
function rankSymbol(value: number) {
  return ({ 11: "J", 12: "Q", 13: "K", 14: "A" } as Record<number, string>)[
    value
  ] || String(value);
}
function combo(cards: number[]): Combo | null {
  if (
    !cards.length ||
    (cards.includes(53) && cards.length > 1) ||
    (cards.includes(55) && cards.length > 1)
  )
    return null;
  const ph = cards.includes(54),
    normal = cards.filter((c) => c < 53),
    rs = normal.map(rank),
    counts = new Map<number, number>();
  rs.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  const vals = [...counts.keys()].sort((a, b) => a - b),
    n = cards.length;
  if (n === 1)
    return { kind: "single", size: 1, strength: rank(cards[0]), bomb: false };
  if (n === 4 && vals.length === 1 && !ph)
    return { kind: "four", size: 4, strength: vals[0], bomb: true };
  if (
    (n === 2 || n === 3) &&
    vals.length === 1 &&
    vals[0] >= 2 &&
    (counts.get(vals[0]) || 0) + (ph ? 1 : 0) === n
  )
    return {
      kind: n === 2 ? "pair" : "triple",
      size: n,
      strength: vals[0],
      bomb: false,
    };
  if (n === 5)
    for (const a of vals)
      for (const b of vals)
        if (
          a !== b &&
          (counts.get(a) || 0) + (ph ? 1 : 0) >= 3 &&
          (counts.get(b) || 0) >= 2
        )
          return { kind: "full", size: 5, strength: a, bomb: false };
  if (n >= 4 && n % 2 === 0 && !cards.includes(52)) {
    const need = n / 2;
    if (
      vals.at(-1)! - vals[0] === need - 1 &&
      vals.reduce((s, v) => s + Math.floor((counts.get(v) || 0) / 2), 0) +
        (ph ? 0.5 : 0) >=
        need
    )
      return {
        kind: "pair-straight",
        size: n,
        strength: vals.at(-1)!,
        bomb: false,
      };
  }
  const seq = [...new Set(rs)].sort((a, b) => a - b);
  if (
    n >= 5 &&
    seq.length + (ph ? 1 : 0) === n &&
    seq.at(-1)! - seq[0] <= n - 1
  ) {
    const bomb = !ph && cards.every((c) => c < 52 && c % 4 === cards[0] % 4);
    return {
      kind: bomb ? "straight-bomb" : "straight",
      size: n,
      strength: seq.at(-1)!,
      bomb,
    };
  }
  return null;
}
function canBeatLead(made: Combo | null, lead: Combo | null) {
  if (!made) return false;
  if (!lead) return true;
  if (made.bomb)
    return !lead.bomb || made.size > lead.size || (made.size === lead.size && made.strength > lead.strength);
  return !lead.bomb && made.kind === lead.kind && made.size === lead.size && made.strength > lead.strength;
}
function comboCall(cards: number[]) {
  const made = combo(cards);
  if (!made || made.kind === "single") return undefined;
  const high = spokenRank(made.strength);
  if (made.kind === "pair") return `${high} Double!`;
  if (made.kind === "triple") return `${high} Triple!`;
  if (made.kind === "full") return `${high} Full House!`;
  if (made.kind === "pair-straight") return `${high} Pair Straight!`;
  if (made.kind === "straight") return `${high} Straight!`;
  if (made.kind === "four") return `${high} Bomb!`;
  if (made.kind === "straight-bomb") return `${high} Straight Bomb!`;
  return `${high} Combo!`;
}
function Card({
  card,
  onClick,
  selected = false,
  tiny = false,
  disabled = false,
}: {
  card: number;
  onClick?: () => void;
  selected?: boolean;
  tiny?: boolean;
  disabled?: boolean;
}) {
  const special = card >= 52,
    pos =
      card === 52
        ? "100% 100%"
        : card === 53
          ? "0 100%"
          : card === 54
            ? "100% 0"
            : "0 0";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative shrink-0 overflow-hidden rounded-lg border-2 bg-[#fffaf0] shadow-md transition ${tiny ? "h-16 w-11" : "aspect-[2/3] h-auto w-[min(3.8rem,12.2vw)] min-w-9"} ${disabled ? "cursor-not-allowed border-zinc-500 opacity-35 grayscale" : selected ? "-translate-y-2 border-amber-400" : "border-black/10"}`}
    >
      <span
        className={`absolute left-1 top-0.5 z-10 text-[9px] font-black ${special ? "text-zinc-800" : colors[card % 4]}`}
      >
        {label(card)} {!special && suits[card % 4]}
      </span>
      {special ? (
        <span
          className="absolute inset-x-0.5 bottom-0.5 top-5 bg-[url('/tichu-special-mascots-v1.png')] bg-[length:200%_200%] bg-no-repeat"
          style={{ backgroundPosition: pos }}
        />
      ) : (
        <span
          className={`absolute inset-0 grid place-content-center text-center font-black ${colors[card % 4]}`}
        >
          <b className="text-2xl leading-none sm:text-3xl">{label(card)}</b>
          <small className="mt-1 text-xs">{suits[card % 4]}</small>
        </span>
      )}
    </button>
  );
}
const avatarFrames = [
  "from-sky-300 to-blue-600",
  "from-pink-300 to-rose-500",
  "from-amber-200 to-orange-500",
  "from-emerald-300 to-teal-600",
  "from-violet-300 to-purple-700",
  "from-zinc-200 to-zinc-600",
  "from-red-300 to-yellow-400",
  "from-cyan-200 via-pink-300 to-amber-200",
];
const skinColors = [
    "#f8d8c0",
    "#efbd96",
    "#c98b61",
    "#8a563d",
    "#5c3528",
    "#ef6262",
    "#72d58a",
    "#69aef5",
    "#a983e8",
    "#f2cf52",
  ],
  hairColors = [
    "transparent",
    "#171923",
    "#7a432f",
    "#e2b552",
    "#e76b67",
    "#62a9e8",
    "#8b65c6",
    "#65b77b",
    "#f472b6",
  ],
  hairColorNames = [
    "기본",
    "검정",
    "갈색",
    "금발",
    "빨강",
    "파랑",
    "보라",
    "초록",
    "핑크",
  ],
  outfitColors = [
    "#5aa7e8",
    "#ed6b91",
    "#f2b94b",
    "#56b99a",
    "#936bd1",
    "#343b4d",
    "#e6654f",
    "#efefef",
    "#172554",
    "#7f1d1d",
    "#14532d",
    "#f5d0fe",
  ];
const expressionAssets = [
    "/tichu-avatar-presets-v4.png",
    "/tichu-avatar-presets-wink-v4.png",
    "/tichu-avatar-presets-laugh-v4.png",
    "/tichu-avatar-presets-surprised-v4.png",
    "/tichu-avatar-presets-angry-v4.png",
    "/tichu-avatar-presets-sad-v4.png",
    "/tichu-avatar-presets-playful-v4.png",
    "/tichu-avatar-presets-sleepy-v4.png",
  ],
  expressionNames = [
    "기본",
    "윙크",
    "웃음",
    "놀람",
    "화남",
    "울상",
    "장난",
    "졸림",
  ];
const hairBack = [
    "M24 34Q25 9 50 9T76 34L72 52H28Z",
    "M19 39Q18 8 50 7T81 39L78 78Q66 70 64 45H36Q34 70 22 78Z",
    "M22 35Q24 8 50 8T78 35L73 55Q67 40 62 30Q51 40 28 37Z",
    "M20 37Q20 12 38 9Q50 1 64 10Q80 13 80 38L72 67H28Z",
    "M23 37Q20 15 39 9Q54 0 70 14Q84 27 75 55L68 42H28Z",
    "M19 42Q18 12 48 7Q77 8 82 38L77 72L67 47H31L24 72Z",
    "M25 34Q28 6 52 8Q78 10 76 39Q72 28 62 22Q55 39 28 42Z",
    "M18 38Q18 7 48 7Q82 7 82 40L75 70Q67 51 65 35H35Q31 54 24 70Z",
  ],
  hairFront = [
    "M25 35Q24 11 49 10Q72 10 76 32Q62 20 52 29Q43 18 25 35Z",
    "M22 35Q23 10 51 9Q76 11 78 36Q65 19 57 34Q45 18 38 35Q30 25 22 35Z",
    "M24 36Q24 10 48 9Q67 8 77 31Q60 19 44 34Q35 23 24 36Z",
    "M22 35Q22 14 39 9Q54 2 70 15Q61 12 55 31Q44 18 37 35Q29 27 22 35Z",
    "M24 36Q20 15 42 9Q62 4 77 28Q63 19 53 34Q46 19 36 35Z",
    "M21 38Q20 12 48 8Q75 9 79 35Q65 18 57 34Q47 17 37 36Q29 25 21 38Z",
    "M25 36Q28 8 54 9Q76 13 76 35Q63 19 53 31Q45 17 36 34Z",
    "M20 37Q19 10 48 8Q77 9 80 37Q67 21 58 35Q46 18 37 36Q29 24 20 37Z",
  ];
function AvatarFace({
  expression,
  skin,
}: {
  expression: number;
  skin: string;
}) {
  const e = Math.max(0, Math.min(7, expression || 0));
  return (
    <>
      {e === 0 && (
        <>
          <ellipse cx="39" cy="49" rx="4.8" ry="6" fill="#201c2c" />
          <ellipse cx="61" cy="49" rx="4.8" ry="6" fill="#201c2c" />
          <circle cx="40.5" cy="47" r="1.5" fill="white" />
          <circle cx="62.5" cy="47" r="1.5" fill="white" />
          <path
            d="M42 61Q50 67 58 61"
            fill="none"
            stroke="#8e4052"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </>
      )}
      {e === 1 && (
        <>
          <path
            d="M34 49Q39 44 44 49"
            fill="none"
            stroke="#201c2c"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <ellipse cx="61" cy="49" rx="4.8" ry="6" fill="#201c2c" />
          <circle cx="62.5" cy="47" r="1.5" fill="white" />
          <path
            d="M42 61Q50 67 58 61"
            fill="none"
            stroke="#8e4052"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </>
      )}
      {e === 2 && (
        <>
          <path
            d="M34 49Q39 43 44 49M56 49Q61 43 66 49"
            fill="none"
            stroke="#201c2c"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M41 59Q50 70 59 59"
            fill="#9a4357"
            stroke="#682b3b"
            strokeWidth="1.5"
          />
          <path d="M45 65Q50 62 55 65" stroke="#f39aae" strokeWidth="2" />
        </>
      )}
      {e === 3 && (
        <>
          <ellipse cx="39" cy="48" rx="5.6" ry="7" fill="#201c2c" />
          <ellipse cx="61" cy="48" rx="5.6" ry="7" fill="#201c2c" />
          <circle cx="41" cy="46" r="1.8" fill="white" />
          <circle cx="63" cy="46" r="1.8" fill="white" />
          <ellipse cx="50" cy="62" rx="5" ry="6.5" fill="#8e4052" />
        </>
      )}
      {e === 4 && (
        <>
          <path
            d="M34 43L44 46M66 43L56 46"
            stroke="#201c2c"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <ellipse cx="39" cy="51" rx="4.5" ry="5.5" fill="#201c2c" />
          <ellipse cx="61" cy="51" rx="4.5" ry="5.5" fill="#201c2c" />
          <path
            d="M43 65Q50 58 57 65"
            fill="none"
            stroke="#8e4052"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </>
      )}
      {e === 5 && (
        <>
          <ellipse cx="39" cy="49" rx="4.8" ry="6" fill="#201c2c" />
          <circle cx="40.5" cy="47" r="1.5" fill="white" />
          <path
            d="M56 49Q61 43 66 49"
            fill="none"
            stroke="#201c2c"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path d="M41 59Q50 70 59 59Q58 69 50 69Q42 69 41 59" fill="#9a4357" />
          <path d="M45 66Q50 63 55 66" stroke="#f39aae" strokeWidth="2" />
        </>
      )}
      {e === 6 && (
        <>
          <path
            d="M34 48Q39 53 44 48M56 48Q61 53 66 48"
            fill="none"
            stroke="#201c2c"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M43 62H57"
            stroke="#8e4052"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </>
      )}
      {e === 7 && (
        <>
          <path
            d="M34 47L44 50M66 47L56 50"
            stroke="#201c2c"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M43 61Q50 66 57 61"
            fill="none"
            stroke="#8e4052"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M31 55L27 59M69 55L73 59"
            stroke="#69aef5"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </>
      )}
      <ellipse cx="31" cy="57" rx="5.5" ry="2.8" fill="#ef8fa0" opacity=".35" />
      <ellipse cx="69" cy="57" rx="5.5" ry="2.8" fill="#ef8fa0" opacity=".35" />
      <path d="M50 51v3" stroke={skin} strokeWidth="2" />
    </>
  );
}
function AvatarArt({
  index,
  hairColor = 0,
  expression = 0,
  size = "h-12 w-12",
}: {
  index: number;
  skin?: number;
  hairColor?: number;
  expression?: number;
  outfit?: number;
  accessory?: number;
  frame?: number;
  size?: string;
}) {
  const preset = Math.max(0, Math.min(15, index || 0)),
    face = Math.max(0, Math.min(7, expression || 0)),
    presetPos = `${((preset % 4) * 100) / 3}% ${(Math.floor(preset / 4) * 100) / 3}%`;
  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-sky-300 to-blue-600 ${size}`}
    >
      <span
        className="absolute inset-0 bg-[length:400%_400%] bg-no-repeat"
        style={{
          backgroundImage: `url('${expressionAssets[face]}')`,
          backgroundPosition: presetPos,
        }}
      />
      {hairColor > 0 && (
        <span
          className="absolute inset-0 opacity-90"
          style={{
            backgroundColor: hairColors[Math.max(0, Math.min(hairColors.length - 1, hairColor))],
            WebkitMaskImage: "url('/tichu-avatar-hair-mask-v4.png')",
            maskImage: "url('/tichu-avatar-hair-mask-v4.png')",
            WebkitMaskSize: "400% 400%",
            maskSize: "400% 400%",
            WebkitMaskPosition: presetPos,
            maskPosition: presetPos,
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            mixBlendMode: "color",
          }}
        />
      )}
    </span>
  );
}
function Avatar({
  p,
  active = false,
  lead = false,
  bubble,
  individual = false,
}: {
  p?: Player;
  active?: boolean;
  lead?: boolean;
  bubble?: string;
  individual?: boolean;
}) {
  if (!p) return <div />;
  const displayName = p.is_bot ? p.name.replace(/^연습\s*/, "") : p.name,
    theme = individual ? individualColors[p.seat % 4] : teams[p.team];
  return (
    <div className="relative">
      <div
        className={`relative mx-auto flex h-[4.4rem] w-[7.5rem] items-center gap-2 rounded-xl border-[3px] bg-zinc-900/95 p-1.5 shadow-xl transition ${active ? `${theme.border} scale-105 animate-pulse shadow-[0_0_28px_rgba(255,255,255,.5)] ring-2 ring-white ring-offset-2 ring-offset-zinc-950` : individual ? theme.border : "border-white/10"}`}
      >
        {active && (
          <span className="absolute -left-2 -top-2 z-10 rounded-full border-2 border-zinc-950 bg-amber-300 px-2 py-1 text-[10px] font-black text-black shadow-lg">
            현재 차례
          </span>
        )}
        {lead && (
          <span className="absolute -right-2 -top-2 z-10 animate-pulse rounded-full border-2 border-zinc-950 bg-amber-300 px-2 py-1 text-[10px] font-black text-black shadow-lg">
            리드
          </span>
        )}
        <AvatarArt
          index={p.avatar}
          skin={p.skin}
          hairColor={p.hairColor}
          expression={p.expression}
          outfit={p.outfit}
          accessory={p.accessory}
          frame={p.frame}
          size="h-11 w-11"
        />
        <div className="min-w-0 flex-1 text-left">
        <p className={`truncate font-black leading-tight ${displayName.length >= 3 ? "text-[11px]" : "text-xs"} ${theme.text}`}>
          {displayName}
        </p>
        <p className="mt-0.5 text-[9px] text-zinc-400">{p.count}장</p>
        <div className="mt-1 min-h-3 leading-none">
          {p.grand_called && (
            <span className="animate-pulse rounded-full bg-amber-300 px-1.5 py-0.5 text-[8px] font-black text-black">
              라지!
            </span>
          )}
          {p.small_called && !p.grand_called && (
            <span className="animate-pulse rounded-full bg-violet-400 px-1.5 py-0.5 text-[8px] font-black text-white">
              스몰!
            </span>
          )}
          {p.finish_order && (
            <span className="text-[9px] text-amber-300">
              {" "}
              {p.finish_order}등
            </span>
          )}
        </div>
        </div>
      </div>
      {bubble && (
        <div className="absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-36 -translate-x-1/2 rounded-2xl bg-white px-3 py-2 text-center text-xs font-bold text-zinc-900 shadow-xl after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-white">
          {bubble}
        </div>
      )}
    </div>
  );
}

export default function TichuClient() {
  const supabase = useMemo(() => createClient(), []),
    channel = useRef<ReturnType<typeof supabase.channel> | null>(null),
    bubbleTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({}),
    chatEnd = useRef<HTMLDivElement | null>(null),
    chatInput = useRef<HTMLInputElement | null>(null),
    chatComposing = useRef(false),
    dogCardTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    loadInFlight = useRef(false),
    botInFlight = useRef(false),
    timeoutInFlight = useRef(false);
  const [user, setUser] = useState<string | null>(null),
    [rooms, setRooms] = useState<Lobby[]>([]),
    [roomId, setRoomId] = useState<string | null>(null),
    [snap, setSnap] = useState<Snap | null>(null),
    [selected, setSelected] = useState<number[]>([]),
    [target, setTarget] = useState(1000),
    [waitingTarget, setWaitingTarget] = useState(1000),
    [seconds, setSeconds] = useState(15),
    [left, setLeft] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [wish, setWish] = useState(0),
    [chatOpen, setChatOpen] = useState(false),
    [chatOpacity, setChatOpacity] = useState(90),
    [chatText, setChatText] = useState(""),
    [chats, setChats] = useState<Chat[]>([]),
    [bubbles, setBubbles] = useState<Record<string, string>>({}),
    [sound, setSound] = useState(true),
    [announcement, setAnnouncement] = useState(""),
    [dogCardVisible, setDogCardVisible] = useState(false),
    [avatar, setAvatar] = useState(0),
    [skin, setSkin] = useState(1),
    [hairColor, setHairColor] = useState(0),
    [expression, setExpression] = useState(0),
    [outfit, setOutfit] = useState(0),
    [accessory, setAccessory] = useState(0),
    [frame, setFrame] = useState(0),
    [avatarOpen, setAvatarOpen] = useState(false),
    [tutorialOpen, setTutorialOpen] = useState(false),
    [botDifficulty, setBotDifficulty] = useState<
      "beginner" | "intermediate" | "advanced"
    >("beginner"),
    [dragonPicker, setDragonPicker] = useState(false),
    [gameMode, setGameMode] = useState<"TEAM" | "INDIVIDUAL">("TEAM"),
    [chatPosition, setChatPosition] = useState<{ x: number; y: number } | null>(null),
    [chatSize, setChatSize] = useState({ width: 288, height: 288 });

  useEffect(() => {
    document.body.classList.toggle("tichu-in-room", Boolean(roomId));
    return () => document.body.classList.remove("tichu-in-room");
  }, [roomId]);

  useEffect(() => {
    if (!chatOpen) return;
    const width = Math.min(chatSize.width, window.innerWidth - 24);
    const height = Math.min(chatSize.height, window.innerHeight - 96);
    setChatSize({ width, height });
    setChatPosition((current) =>
      current
        ? {
            x: Math.max(12, Math.min(current.x, window.innerWidth - width - 12)),
            y: Math.max(12, Math.min(current.y, window.innerHeight - height - 12)),
          }
        : { x: Math.max(12, (window.innerWidth - width) / 2), y: 80 },
    );
  }, [chatOpen]);

  function startChatDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!chatPosition) return;
    if ((event.target as HTMLElement).closest("button, input, label")) return;
    const startX = event.clientX,
      startY = event.clientY,
      origin = chatPosition;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) =>
      setChatPosition({
        x: Math.max(
          12,
          Math.min(origin.x + next.clientX - startX, window.innerWidth - chatSize.width - 12),
        ),
        y: Math.max(
          12,
          Math.min(origin.y + next.clientY - startY, window.innerHeight - chatSize.height - 12),
        ),
      });
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function startChatResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (!chatPosition) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX,
      startY = event.clientY,
      origin = chatSize;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) =>
      setChatSize({
        width: Math.max(
          240,
          Math.min(origin.width + next.clientX - startX, window.innerWidth - chatPosition.x - 12),
        ),
        height: Math.max(
          208,
          Math.min(origin.height + next.clientY - startY, window.innerHeight - chatPosition.y - 12),
        ),
      });
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  const soundFx = useCallback(
    (
      kind:
        | "card"
        | "sparrow"
        | "pair"
        | "triple"
        | "straight"
        | "full"
        | "pair-straight"
        | "combo"
        | "bomb"
        | "dog"
        | "phoenix"
        | "dragon"
        | "pass"
        | "grand"
        | "small",
      spokenCall?: string,
  ) => {
    if (!sound) return;
    if (kind === "dog") {
      const bark = new Audio("/tichu-dog-bark.mp3");
      bark.volume = 0.9;
      void bark.play().catch(() => {});
      return;
    }
    if (kind === "grand" || kind === "small") {
        if ("speechSynthesis" in window) {
          speechSynthesis.cancel();
          speechSynthesis.speak(
            new SpeechSynthesisUtterance(
              kind === "grand" ? "라지 티츄!" : "스몰 티츄!",
            ),
          );
        }
        return;
      }
      const ctx = new AudioContext(),
        now = ctx.currentTime;
      const calls: Partial<Record<typeof kind, string>> = {
        pair: "Double!",
        triple: "Triple!",
        straight: "Straight!",
        full: "Full House!",
        "pair-straight": "Pair Straight!",
        combo: "Combo!",
        bomb: "Bomb!",
      phoenix: "Phoenix!",
        dragon: "Dragon!",
        pass: "Pass!",
      };
      const call = spokenCall || calls[kind];
      if (call && "speechSynthesis" in window) {
        const voice = new SpeechSynthesisUtterance(call);
      voice.lang = "en-US";
      voice.rate = 0.95;
      voice.volume = kind === "pass" ? 0.65 : 1;
      speechSynthesis.cancel();
      speechSynthesis.speak(voice);
      }
      if (kind === "bomb") {
        const duration = 1.3,
          length = Math.floor(ctx.sampleRate * duration),
          buffer = ctx.createBuffer(1, length, ctx.sampleRate),
          data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++)
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 1.7);
        const src = ctx.createBufferSource(),
          filter = ctx.createBiquadFilter(),
          gain = ctx.createGain(),
          rumble = ctx.createOscillator(),
          rumbleGain = ctx.createGain();
        src.buffer = buffer;
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1400, now);
        filter.frequency.exponentialRampToValueAtTime(55, now + duration);
        gain.gain.setValueAtTime(0.62, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        rumble.type = "sine";
        rumble.frequency.setValueAtTime(75, now);
        rumble.frequency.exponentialRampToValueAtTime(28, now + 1.2);
        rumbleGain.gain.setValueAtTime(0.38, now);
        rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);
        src.connect(filter).connect(gain).connect(ctx.destination);
        rumble.connect(rumbleGain).connect(ctx.destination);
        src.start();
        rumble.start();
        rumble.stop(now + 1.3);
        return;
      }
      if (kind === "card") {
        const duration = 0.24,
          length = Math.floor(ctx.sampleRate * duration),
          buffer = ctx.createBuffer(1, length, ctx.sampleRate),
          data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
          const edge = Math.sin((Math.PI * i) / length);
          data[i] = (Math.random() * 2 - 1) * edge * (1 - i / length);
        }
        const src = ctx.createBufferSource(),
          filter = ctx.createBiquadFilter(),
          gain = ctx.createGain();
        src.buffer = buffer;
        filter.type = "bandpass";
        filter.frequency.value = 1750;
        filter.Q.value = 0.7;
        gain.gain.setValueAtTime(0.64, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        src.connect(filter).connect(gain).connect(ctx.destination);
        src.start();
        return;
      }
      if (kind === "sparrow") {
        [2300, 2900, 2450].forEach((f, i) => {
          const osc = ctx.createOscillator(),
            gain = ctx.createGain(),
            start = now + i * 0.11;
          osc.type = "sine";
          osc.frequency.setValueAtTime(f, start);
          osc.frequency.exponentialRampToValueAtTime(f * 1.22, start + 0.075);
          gain.gain.setValueAtTime(0.18, start);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.09);
          osc.connect(gain).connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.1);
        });
        return;
      }
      if (kind === "phoenix") {
        [260, 520].forEach((f, i) => {
          const osc = ctx.createOscillator(),
            gain = ctx.createGain();
          osc.type = i ? "sine" : "triangle";
          osc.frequency.setValueAtTime(f, now);
          osc.frequency.exponentialRampToValueAtTime(f * 4.2, now + 0.95);
          gain.gain.setValueAtTime(0.13 - i * 0.03, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 1.05);
          osc.connect(gain).connect(ctx.destination);
          osc.start();
          osc.stop(now + 1.08);
        });
        return;
      }
      if (kind === "dragon") {
        [55, 82.4, 110].forEach((f, i) => {
          const osc = ctx.createOscillator(),
            gain = ctx.createGain();
          osc.type = i === 1 ? "sawtooth" : "sine";
          osc.frequency.setValueAtTime(f, now);
          osc.frequency.exponentialRampToValueAtTime(f * 0.72, now + 1.15);
          gain.gain.setValueAtTime(i === 1 ? 0.08 : 0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);
          osc.connect(gain).connect(ctx.destination);
          osc.start();
          osc.stop(now + 1.28);
        });
        return;
      }
      const notes =
        kind === "pass"
          ? [190, 145]
          : kind === "pair"
            ? [330, 440]
            : kind === "triple"
              ? [330, 440, 550]
              : ["straight", "full", "pair-straight", "combo"].includes(kind)
                ? [300, 400, 500, 650]
                : [180];
      notes.forEach((frequency, i) => {
        const osc = ctx.createOscillator(),
          gain = ctx.createGain(),
          start = now + i * 0.07;
        osc.type = "sine";
        osc.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(kind === "pass" ? 0.065 : 0.1, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.13);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.14);
      });
    },
    [sound],
  );
  const cardSound = useCallback((cards: number[]) => {
    const made = combo(cards);
    if (made?.kind === "single" && cards.includes(52)) return "sparrow" as const;
    if (made?.kind === "single" && cards.includes(53)) return "dog" as const;
    if (made?.kind === "single" && cards.includes(54)) return "phoenix" as const;
    if (made?.kind === "single" && cards.includes(55)) return "dragon" as const;
    if (made?.bomb) return "bomb" as const;
    if (made?.kind === "straight") return "straight" as const;
    if (made?.kind === "full") return "full" as const;
    if (made?.kind === "pair-straight") return "pair-straight" as const;
    if (cards.length === 2) return "pair" as const;
    if (cards.length === 3) return "triple" as const;
    if (cards.length > 3) return "combo" as const;
    return "card" as const;
  }, []);
  const showAnnouncement = useCallback(
    (text: string, kind: "grand" | "small") => {
      setAnnouncement(text);
      soundFx(kind);
      setTimeout(() => setAnnouncement(""), 2600);
    },
    [soundFx],
  );
  const showDogCard = useCallback(() => {
    setDogCardVisible(true);
    if (dogCardTimer.current) clearTimeout(dogCardTimer.current);
    dogCardTimer.current = setTimeout(() => {
      setDogCardVisible(false);
      dogCardTimer.current = null;
    }, 2000);
  }, []);
  const showDragonRecipient = useCallback((name: string) => {
    setAnnouncement(`🐉 용 트릭 → ${name}에게 전달`);
    setTimeout(() => setAnnouncement(""), 2600);
  }, []);
  const showBubble = useCallback((id: string, text: string) => {
    setBubbles((v) => ({ ...v, [id]: text }));
    clearTimeout(bubbleTimers.current[id]);
    bubbleTimers.current[id] = setTimeout(
      () =>
        setBubbles((v) => {
          const n = { ...v };
          delete n[id];
          return n;
        }),
      3000,
    );
  }, []);
  const lobby = useCallback(async () => {
    const { data } = await supabase.rpc("tichu_lobby");
    setRooms((data || []) as Lobby[]);
  }, [supabase]),
    load = useCallback(async () => {
      if (!roomId || loadInFlight.current) return;
      loadInFlight.current = true;
      try {
        const [
          { data, error },
          { data: pending },
          { data: spectatorNames },
        ] = await Promise.all([
          supabase.rpc("tichu_snapshot", { p_room: roomId }),
          supabase.rpc("tichu_exchange_pending", { p_room: roomId }),
          supabase.rpc("tichu_spectator_names", { p_room: roomId }),
        ]);
        if (error) return;
        if (data)
          setSnap({
            ...(data as Snap),
            exchange_pending_ids: (pending || []) as string[],
            spectator_names: (spectatorNames || []) as string[],
          });
        else {
          setRoomId(null);
          setSnap(null);
        }
      } finally {
        loadInFlight.current = false;
      }
    }, [roomId, supabase]);
  const rpc = useCallback(
    async (name: string, args: Record<string, unknown> = {}) => {
      setBusy(true);
      setMessage("");
      const { data, error } = await supabase.rpc(name, args);
      setBusy(false);
      if (error) {
        setMessage(error.message);
        throw error;
      }
      return data;
    },
    [supabase],
  );
  const refresh = useCallback(() => {
      void channel.current?.send({
        type: "broadcast",
        event: "refresh",
        payload: {},
      });
    }, []),
    act = useCallback(
      async (name: string, args: Record<string, unknown>) => {
        try {
          await rpc(name, args);
          setSelected([]);
          await load();
          await lobby();
          refresh();
        } catch {}
      },
      [load, lobby, refresh, rpc],
    ),
    botAct = useCallback(async () => {
      if (!roomId || botInFlight.current) return;
      botInFlight.current = true;
      const oldTrickLength = snap?.room.trick.length || 0,
        actingBot = snap?.players.find((p) => p.seat === snap.room.turn_seat);
      try {
        const { error } = await supabase.rpc("tichu_bot_tick", {
          p_room: roomId,
        });
        if (!error) {
          const [
            { data },
            { data: pending },
            { data: spectatorNames },
          ] = await Promise.all([
            supabase.rpc("tichu_snapshot", { p_room: roomId }),
            supabase.rpc("tichu_exchange_pending", { p_room: roomId }),
            supabase.rpc("tichu_spectator_names", { p_room: roomId }),
          ]);
          if (data) {
            const next: Snap = {
                ...(data as Snap),
                exchange_pending_ids: (pending || []) as string[],
                spectator_names: (spectatorNames || []) as string[],
              },
              setCards = next.room.trick.at(-1)?.cards || [];
            setSnap(next);
            if (next.room.status === "PLAYING" && actingBot) {
              const afterBot = next.players.find(
                  (p) => p.user_id === actingBot.user_id,
                ),
                played = !!afterBot && afterBot.count < actingBot.count;
              let kind: ReturnType<typeof cardSound> | "pass" | null = null;
              if (
                played &&
                next.room.lead === null &&
                next.room.trick.length === 0
              )
                kind = "dog";
              else if (
                played &&
                next.room.trick.length > oldTrickLength &&
                setCards.length
              )
                kind = cardSound(setCards);
              else if (!played && next.room.turn_seat !== snap?.room.turn_seat)
                kind = "pass";
              if (kind) {
                const spokenCall = played ? comboCall(setCards) : undefined,
                  dragonTargetName =
                    kind === "dragon"
                      ? next.players.find(
                          (p) => p.user_id === next.room.dragon_target,
                        )?.name
                      : undefined,
                  dogTargetName =
                    kind === "dog"
                      ? next.players.find(
                          (p) => p.seat === next.room.turn_seat,
                        )?.name
                      : undefined;
                soundFx(kind, spokenCall);
                if (dragonTargetName)
                  showDragonRecipient(
                    dragonTargetName.replace(/^연습\s*/, ""),
                  );
                void channel.current?.send({
                  type: "broadcast",
                  event: "card",
                  payload: {
                    kind,
                    spokenCall,
                    dragonTargetName,
                    dogTargetName,
                    individual: next.room.game_mode === "INDIVIDUAL",
                  },
                });
              if (kind === "dog") {
                showDogCard();
                setAnnouncement(
                  next.room.game_mode === "INDIVIDUAL" && dogTargetName
                    ? `🐶 멍멍! ${dogTargetName.replace(/^연습\s*/, "")}님에게 선이 넘어갑니다`
                    : "🐶 멍멍! 팀원에게 턴이 넘어갑니다",
                );
                  setTimeout(() => setAnnouncement(""), 2000);
                }
              }
            }
          }
          refresh();
        }
      } finally {
        botInFlight.current = false;
      }
    }, [
      cardSound,
      refresh,
      roomId,
      snap?.players,
      snap?.room.trick.length,
      snap?.room.turn_seat,
      showDogCard,
      showDragonRecipient,
      soundFx,
      supabase,
    ]);
  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user?.id || null);
      if (data.user) {
        const { data: mine } = await supabase.rpc("tichu_my_avatar");
        const look = mine as {
          hair?: number;
          skin?: number;
          hairColor?: number;
          expression?: number;
          outfit?: number;
          accessory?: number;
          frame?: number;
        } | null;
        setAvatar(Number(look?.hair) || 0);
        setSkin(Number(look?.skin ?? 1));
        setHairColor(Number(look?.hairColor) || 0);
        setExpression(Number(look?.expression) || 0);
        setOutfit(Number(look?.outfit) || 0);
        setAccessory(Number(look?.accessory) || 0);
        setFrame(Number(look?.frame) || 0);
      }
    });
    void lobby();
  }, [lobby, supabase]);
  useEffect(() => {
    const i = setInterval(
      () => void (roomId ? load() : lobby()),
      roomId ? 3500 : 4000,
    );
    return () => clearInterval(i);
  }, [load, lobby, roomId]);
  useEffect(() => {
    if (localStorage.getItem("tichu-tutorial-seen") !== "1")
      setTutorialOpen(true);
  }, []);
  useEffect(() => {
    if (!roomId) return;
    const c = supabase.channel(`tichu:${roomId}`, {
      config: { broadcast: { self: false } },
    });
    c.on("broadcast", { event: "refresh" }, () => void load())
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        const item = payload as Chat;
        setChats((x) => [...x.slice(-99), item]);
        showBubble(item.id.split(":")[0], item.text);
      })
      .on("broadcast", { event: "announce" }, ({ payload }) =>
        showAnnouncement(
          String(payload.text),
          payload.kind as "grand" | "small",
        ),
      )
      .on("broadcast", { event: "card" }, ({ payload }) => {
        const kind = (payload.kind || "card") as ReturnType<typeof cardSound>;
        soundFx(
          kind,
          typeof payload.spokenCall === "string" ? payload.spokenCall : undefined,
        );
        if (
          kind === "dragon" &&
          typeof payload.dragonTargetName === "string"
        )
          showDragonRecipient(payload.dragonTargetName.replace(/^연습\s*/, ""));
        if (kind === "dog") {
          showDogCard();
          const dogTargetName =
            typeof payload.dogTargetName === "string"
              ? payload.dogTargetName.replace(/^연습\s*/, "")
              : null;
          setAnnouncement(
            payload.individual && dogTargetName
              ? `🐶 멍멍! ${dogTargetName}님에게 선이 넘어갑니다`
              : "🐶 멍멍! 팀원에게 턴이 넘어갑니다",
          );
          setTimeout(() => setAnnouncement(""), 2000);
        }
      })
      .subscribe();
    channel.current = c;
    return () => {
      channel.current = null;
      void supabase.removeChannel(c);
    };
  }, [
    cardSound,
    load,
    roomId,
    showAnnouncement,
    showBubble,
    showDogCard,
    showDragonRecipient,
    soundFx,
    supabase,
  ]);
  useEffect(() => {
    if (!roomId || snap?.spectator || !snap?.players.some((p) => p.is_bot))
      return;
    const current = snap.players.find((p) => p.seat === snap.room.turn_seat),
      should =
        (snap.room.status === "GRAND" &&
          snap.players.some((p) => p.is_bot && p.grand_choice === null)) ||
        (snap.room.status === "EXCHANGE" && snap.exchange_count < 4) ||
        (snap.room.status === "PLAYING" && current?.is_bot);
    if (!should) return;
    let stopped = false,
      retry: ReturnType<typeof setTimeout>;
    const run = async () => {
      await botAct();
      if (!stopped) retry = setTimeout(run, 3000);
    };
    const timer = setTimeout(() => void run(), 2300);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(retry);
    };
  }, [botAct, roomId, snap]);
  useEffect(() => {
    const tick = () => {
      if (!snap) return setLeft(0);
      const deadline =
        snap.room.status === "EXCHANGE"
          ? snap.room.exchange_deadline
          : snap.room.turn_deadline;
      if (!deadline) return setLeft(0);
      const n = Math.max(
        0,
        Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000),
      );
      setLeft(n);
      if (!n && roomId && !snap.spectator && !timeoutInFlight.current) {
        const timeoutRpc =
          snap.room.status === "PLAYING"
            ? "tichu_timeout"
            : snap.room.status === "EXCHANGE"
              ? "tichu_exchange_timeout"
              : null;
        if (timeoutRpc) {
          timeoutInFlight.current = true;
          void act(timeoutRpc, { p_room: roomId }).finally(() => {
            timeoutInFlight.current = false;
          });
        }
      }
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [
    act,
    roomId,
    snap?.room.status,
    snap?.room.exchange_deadline,
    snap?.room.turn_deadline,
    snap?.spectator,
  ]);
  useEffect(() => {
    if (snap?.room.target_score) setWaitingTarget(snap.room.target_score);
  }, [snap?.room.target_score]);
  useEffect(() => {
    if (!chatOpen) return;
    const id = requestAnimationFrame(() => {
      chatEnd.current?.scrollIntoView({ block: "end" });
      chatInput.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [chatOpen, chats]);
  async function create() {
    try {
      setRoomId(
        (await rpc("tichu_create_room", {
          p_title: null,
          p_target_score: target,
          p_turn_seconds: seconds,
          p_game_mode: gameMode,
        })) as string,
      );
    } catch {}
  }
  async function join(id: string) {
    try {
      setRoomId((await rpc("tichu_join_room", { p_room: id })) as string);
    } catch {}
  }
  async function watch(id: string) {
    try {
      setRoomId((await rpc("tichu_watch_room", { p_room: id })) as string);
    } catch {}
  }
  async function leave() {
    if (!roomId) return;
    const watching = snap?.spectator;
    if (
      !confirm(
        watching
          ? "관전을 종료하시겠습니까?"
          : waiting
            ? "정말 방에서 나가시겠습니까?"
            : "정말 게임에서 나가시겠습니까?\n진행 중인 게임은 중단됩니다.",
      )
    )
      return;
    try {
      await rpc(watching ? "tichu_leave_spectator" : "tichu_leave_room", {
        p_room: roomId,
      });
      refresh();
      setRoomId(null);
      setSnap(null);
      await lobby();
    } catch {}
  }
  async function saveAvatar() {
    try {
      await rpc("tichu_set_avatar", {
        p_hair: avatar,
        p_skin: skin,
        p_hair_color: hairColor,
        p_expression: expression,
        p_outfit: outfit,
        p_accessory: accessory,
        p_frame: frame,
      });
      setAvatarOpen(false);
      if (roomId) {
        await load();
        refresh();
      }
    } catch {}
  }
  function closeTutorial() {
    localStorage.setItem("tichu-tutorial-seen", "1");
    setTutorialOpen(false);
  }
  function send() {
    const text = chatText.trim().slice(0, 200),
      me = snap?.players.find((p) => p.user_id === user),
      name = me?.name || snap?.viewer_name;
    if (!text || !user || !name) return;
    const x = {
      id: `${user}:${crypto.randomUUID()}`,
      user: name,
      text,
      at: Date.now(),
    };
    setChats((v) => [...v.slice(-99), x]);
    if (me) showBubble(user, text);
    void channel.current?.send({
      type: "broadcast",
      event: "chat",
      payload: x,
    });
    setChatText("");
  }
  async function declare(kind: "grand" | "small", call = true) {
    if (!roomId) return;
    if (
      call &&
      !confirm(
        `${kind === "grand" ? "라지 티츄(±200점)" : "스몰 티츄(±100점)"}를 정말 선언하시겠습니까?\n선언 후에는 취소할 수 없습니다.`,
      )
    )
      return;
    const text = `${mine?.name || "멤버"}님이 ${kind === "grand" ? "라지 티츄" : "스몰 티츄"}를 선언했습니다!`;
    await act(
      kind === "grand" ? "tichu_grand_choice" : "tichu_declare_small",
      kind === "grand" ? { p_room: roomId, p_call: call } : { p_room: roomId },
    );
    if (call) {
      showAnnouncement(text, kind);
      void channel.current?.send({
        type: "broadcast",
        event: "announce",
        payload: { text, kind },
      });
    }
  }
  async function passTurn() {
    if (!roomId) return;
    await act("tichu_pass", { p_room: roomId });
    soundFx("pass");
    void channel.current?.send({
      type: "broadcast",
      event: "card",
      payload: { kind: "pass" },
    });
  }
  if (!user)
    return (
      <main className="p-20 text-center">
        <h1 className="text-4xl font-black">티츄</h1>
        <p className="mt-4 text-zinc-400">
          로그인한 멤버만 플레이할 수 있습니다.
        </p>
      </main>
    );
  if (!roomId)
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold tracking-[.3em] text-sky-300">
              WAWEDO TICHU
            </p>
            <h1 className="mt-2 text-4xl font-black">티츄 놀이터</h1>
            <p className="mt-2 text-zinc-400">
              방을 누르면 코드 없이 바로 참여합니다.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row">
            <button
              onClick={() => setTutorialOpen(true)}
              className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-black text-amber-200"
            >
              게임 방법
            </button>
            <button
              onClick={() => setAvatarOpen(true)}
              className="flex items-center gap-2 rounded-2xl border border-sky-300/30 bg-sky-300/5 p-2 pr-3 text-sm font-bold"
            >
              <AvatarArt
                index={avatar}
                hairColor={hairColor}
                expression={expression}
              />
              <span className="hidden sm:inline">캐릭터 고르기</span>
              <span className="sm:hidden">캐릭터</span>
            </button>
          </div>
        </div>
        <section className="mt-7 grid gap-3 rounded-3xl border border-sky-300/20 bg-sky-300/5 p-5 sm:grid-cols-[1fr_1fr_auto]">
          <div className="sm:col-span-3">
            <p className="mb-2 text-sm font-bold text-zinc-400">게임 방식</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGameMode("TEAM")}
                className={`rounded-xl border p-3 font-black ${gameMode === "TEAM" ? "border-sky-300 bg-sky-300 text-zinc-950" : "border-white/15 bg-zinc-900 text-zinc-300"}`}
              >
                팀전
              </button>
              <button
                type="button"
                onClick={() => setGameMode("INDIVIDUAL")}
                className={`rounded-xl border p-3 font-black ${gameMode === "INDIVIDUAL" ? "border-amber-300 bg-amber-300 text-zinc-950" : "border-white/15 bg-zinc-900 text-zinc-300"}`}
              >
                개인전
              </button>
            </div>
          </div>
          <label className="text-sm text-zinc-400">
            목표 점수
            <input
              type="number"
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              className="mt-1 w-full rounded-xl bg-zinc-900 p-3 text-white"
            />
          </label>
          <label className="text-sm text-zinc-400">
            턴 제한 초
            <input
              type="number"
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
              className="mt-1 w-full rounded-xl bg-zinc-900 p-3 text-white"
            />
          </label>
          <button
            disabled={busy}
            onClick={() => void create()}
            className="self-end rounded-xl bg-sky-300 px-6 py-3 font-black text-black"
          >
            내 방 만들기
          </button>
        </section>
        {message && <p className="mt-3 text-red-300">{message}</p>}
        <div className="mt-7 grid gap-3">
          {rooms.map((r) => {
            const active = r.status !== "WAITING",
              canWatch = active && r.spectators_allowed;
            return (
              <button
                key={r.id}
                disabled={active && !canWatch && !r.mine && !r.spectating}
                onClick={() =>
                  r.mine || r.spectating
                    ? setRoomId(r.id)
                    : canWatch
                      ? void watch(r.id)
                      : void join(r.id)
                }
                className={`flex items-center justify-between rounded-2xl border p-5 text-left disabled:opacity-40 ${r.mine || r.spectating ? "border-sky-300/50 bg-sky-300/10" : "border-white/10"}`}
              >
                <span>
                  <b className="text-lg">{r.host_name} 방</b>
                  <small className="ml-2 text-zinc-500">
                    {r.target_score}점 · {r.turn_seconds}초
                    {` · ${r.game_mode === "INDIVIDUAL" ? "개인전" : "팀전"}`}
                    {active && ` · 관전자 ${r.spectators || 0}명`}
                  </small>
                </span>
                <span className="shrink-0 text-sky-300">
                  {r.players}/4 ·{" "}
                  {r.mine
                    ? "복귀"
                    : r.spectating
                      ? "관전 복귀"
                      : canWatch
                        ? "관전"
                        : active
                          ? "관전 불가"
                          : "참여"}
                </span>
              </button>
            );
          })}
        </div>
        {tutorialOpen && <TichuTutorial onClose={closeTutorial} />}
        {avatarOpen && (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
            onClick={() => setAvatarOpen(false)}
          >
            <section
              className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/10 bg-zinc-950 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black">내 캐릭터 고르기</h2>
                  <p className="text-xs text-zinc-500">
                    마음에 드는 완성 캐릭터를 선택하세요.
                  </p>
                </div>
                <button
                  onClick={() => setAvatarOpen(false)}
                  className="order-first mr-3 shrink-0 text-2xl"
                >
                  ×
                </button>
              </div>
              <div className="my-4 flex justify-center">
                <AvatarArt
                  index={avatar}
                  hairColor={hairColor}
                  expression={expression}
                  size="h-32 w-32"
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 16 }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setAvatar(i)}
                    className={`rounded-2xl border-2 p-1 transition ${avatar === i ? "scale-105 border-sky-300 bg-sky-300/10" : "border-white/10 bg-white/5"}`}
                    aria-label={`캐릭터 ${i + 1}`}
                  >
                    <AvatarArt
                      index={i}
                      hairColor={hairColor}
                      expression={expression}
                      size="aspect-square w-full"
                    />
                  </button>
                ))}
              </div>
              <h3 className="mt-5 text-sm font-black text-amber-300">머리색</h3>
              <div className="mt-2 grid grid-cols-8 gap-2">
                {hairColors.map((color, i) => (
                  <button
                    key={hairColorNames[i]}
                    onClick={() => setHairColor(i)}
                    className={`grid aspect-square place-items-center rounded-full border-2 text-[9px] font-black ${hairColor === i ? "border-white" : "border-white/15"} ${i === 0 ? "bg-gradient-to-br from-amber-200 via-rose-300 to-sky-300" : ""}`}
                    style={i ? { backgroundColor: color } : undefined}
                    aria-label={hairColorNames[i]}
                    title={hairColorNames[i]}
                  >
                    {i === 0 && "기본"}
                  </button>
                ))}
              </div>
              <h3 className="mt-5 text-sm font-black text-emerald-300">표정</h3>
              <div className="mt-2 grid grid-cols-8 gap-1">
                {expressionAssets.map((_, i) => (
                  <button
                    key={expressionNames[i]}
                    onClick={() => setExpression(i)}
                    className={`rounded-xl border-2 p-0.5 ${expression === i ? "border-emerald-300 bg-emerald-300/10" : "border-white/10"}`}
                    aria-label={expressionNames[i]}
                    title={expressionNames[i]}
                  >
                    <AvatarArt
                      index={avatar}
                      hairColor={hairColor}
                      expression={i}
                      size="aspect-square w-full"
                    />
                  </button>
                ))}
              </div>
              <button
                disabled={busy}
                onClick={() => void saveAvatar()}
                className="mt-6 w-full rounded-xl bg-sky-300 p-3 font-black text-zinc-950 disabled:opacity-40"
              >
                이 캐릭터로 저장
              </button>
            </section>
          </div>
        )}
      </main>
    );
  if (!snap) return <main className="p-20 text-center">방을 불러오는 중…</main>;
  const { room, me, players, spectator } = snap,
    individual = room.game_mode === "INDIVIDUAL",
    mine = players.find((p) => p.user_id === me.user_id),
    baseSeat = spectator ? 0 : (me.seat ?? 0),
    atOffset = (n: number) =>
      players.find((p) => p.seat === (baseSeat + n) % 4),
    bottom = atOffset(0),
    leftPlayer = atOffset(1),
    topPlayer = atOffset(2),
    rightPlayer = atOffset(3),
    opps = mine
      ? players
          .filter((p) =>
            individual ? p.user_id !== mine.user_id && p.count > 0 : p.team !== mine.team,
          )
          .sort(
            (a, b) =>
              ((a.seat - baseSeat + 4) % 4) - ((b.seat - baseSeat + 4) % 4),
          )
      : [],
    myTurn = !spectator && room.turn_seat === me.seat,
    picked = combo(selected),
    selectedCombo =
      picked && selected.length === 1 && selected[0] === 54
        ? {
            ...picked,
            strength:
              room.lead?.kind === "single"
                ? Math.min(14.5, room.lead.strength + 0.5)
                : 1.5,
          }
        : picked,
    legalPick =
      !!selectedCombo &&
      canBeatLead(selectedCombo, room.lead) &&
      !(selected.includes(53) && room.lead !== null),
    leader = players.find((p) => p.seat === room.last_trick_seat),
    turnPlayer = players.find((p) => p.seat === room.turn_seat),
    waiting = room.status === "WAITING",
    grand = room.status === "GRAND",
    exchange = room.status === "EXCHANGE",
    playing = room.status === "PLAYING",
    roundEnd = room.status === "ROUND_END",
    host = !spectator && room.host_id === me.user_id,
    allReady = players.length === 4 && players.every((p) => p.ready),
    teamsOk =
      individual ||
      (players.filter((p) => p.team === 0).length === 2 &&
        players.filter((p) => p.team === 1).length === 2);
  async function play(specialTarget?: string) {
    if (!roomId || !picked) return;
    if (
      !individual && leader?.team === me.team &&
      leader.user_id !== me.user_id &&
      leader.count > 0 &&
      !confirm(
        "현재 우리 팀이 리드입니다. 그래도 내시겠습니까?\n취소하면 패스합니다.",
      )
    )
      return void passTurn();
    if ((selected.includes(55) || (individual && selected.includes(53))) && !specialTarget) {
      setDragonPicker(true);
      return;
    }
    const targetPlayer = selected.includes(55) || (individual && selected.includes(53)) ? specialTarget : null,
      playCombo = selectedCombo;
    setDragonPicker(false);
    await act("tichu_play", {
      p_room: roomId,
      p_cards: selected,
      p_combo: playCombo,
      p_wish: selected.includes(52) && wish >= 2 ? wish : null,
      p_dragon_target: targetPlayer,
    });
    const kind = cardSound(selected);
    const spokenCall = comboCall(selected),
      dragonTargetName =
        kind === "dragon"
          ? players.find((p) => p.user_id === targetPlayer)?.name
          : undefined;
    soundFx(kind, spokenCall);
    if (dragonTargetName)
      showDragonRecipient(dragonTargetName.replace(/^연습\s*/, ""));
    if (kind === "dog") {
      showDogCard();
      const dogTargetName = players.find((p) => p.user_id === targetPlayer)?.name;
      setAnnouncement(
        individual && dogTargetName
          ? `🐶 멍멍! ${dogTargetName}님에게 선이 넘어갑니다`
          : "🐶 멍멍! 팀원에게 턴이 넘어갑니다",
      );
      setTimeout(() => setAnnouncement(""), 2000);
    }
    void channel.current?.send({
      type: "broadcast",
      event: "card",
      payload: { kind, spokenCall, dragonTargetName },
    });
  }
  return (
    <main className="mx-auto max-w-5xl px-2 py-2 sm:px-5">
      <header className="sticky top-0 z-20 rounded-2xl border border-white/10 bg-zinc-950/95 p-3">
        <div className="flex justify-between">
          <div>
            <p className="text-xs text-zinc-500">
              {room.round_no}라운드 · {spectator ? "관전 중" : room.status}
            </p>
            <b>{room.title}</b>
          </div>
          <div className="mr-14 flex gap-2 sm:mr-0">
            <button
              onClick={() => setSound((v) => !v)}
              className="rounded-xl border border-white/10 p-2"
              aria-label="효과음 켜기 또는 끄기"
            >
              {sound ? "🔊" : "🔇"}
            </button>
            <button
              onClick={() => setChatOpen(true)}
              className="rounded-xl border border-white/10 p-2"
            >
              💬
            </button>
            <button
              onClick={() => void leave()}
              className="rounded-xl border border-red-400/30 px-2 text-[11px] text-red-300"
            >
              {spectator
                ? "관전 나가기"
                : waiting
                  ? "방 나가기"
                  : "게임 나가기"}
            </button>
          </div>
        </div>
        {individual ? (
          <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px]">
            {players.map((p) => (
              <span key={p.user_id} className={`truncate rounded-lg border px-1 py-1.5 ${individualColors[p.seat % 4].border} ${individualColors[p.seat % 4].bg} ${individualColors[p.seat % 4].text}`}>
                <b>{p.name}</b> {p.score}점
              </span>
            ))}
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] text-center">
            <b className="text-sky-300">하늘팀 {room.sky_score}</b>
            <span className="rounded-full bg-white/10 px-3 py-1">{room.target_score}점</span>
            <b className="text-pink-300">{room.pink_score} 핑크팀</b>
          </div>
        )}
      </header>
      {dragonPicker && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4"
          onClick={() => setDragonPicker(false)}
        >
          <section
            className="w-full max-w-sm rounded-3xl border border-amber-300/30 bg-zinc-950 p-5 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-black text-amber-300">
              {selected.includes(53) ? "누구에게 첫 턴을 넘길까요?" : "용 트릭을 누구에게 줄까요?"}
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              {selected.includes(53) ? "선택한 플레이어가 새 트릭을 시작합니다." : "선택한 상대가 이번 트릭의 카드를 받습니다."}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {opps.map((p, i) => (
                <button
                  key={p.user_id}
                  onClick={() => void play(p.user_id)}
                  className={`rounded-2xl border-2 p-4 font-black ${(individual ? individualColors[p.seat % 4] : teams[p.team]).border} bg-white/5`}
                >
                  <span className="block text-xs text-zinc-400">
                    {individual ? `선택 ${i + 1}` : i === 0 ? "내 기준 왼쪽" : "내 기준 오른쪽"}
                  </span>
                  <span className={`mt-1 block ${(individual ? individualColors[p.seat % 4] : teams[p.team]).text}`}>
                    {p.is_bot ? p.name.replace(/^연습\s*/, "") : p.name}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setDragonPicker(false)}
              className="mt-4 w-full rounded-xl border border-white/15 p-3 text-sm text-zinc-300"
            >
              취소
            </button>
          </section>
        </div>
      )}
      {announcement && (
        <button
          type="button"
          onClick={() => setAnnouncement("")}
          className="fixed left-1/2 top-28 z-50 -translate-x-1/2 animate-bounce rounded-full bg-amber-300 px-5 py-3 text-center font-black text-black shadow-2xl"
        >
          {announcement}
          <span className="ml-2 rounded-full bg-black/15 px-2 py-1 text-[10px]">
            확인
          </span>
        </button>
      )}
      {waiting && (
        <section className="mt-4 rounded-3xl border border-white/10 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">{individual ? "개인전 준비" : "팀 선택 및 준비"}</h2>
              <p className="mt-1 text-xs text-zinc-500">
                현재 목표 {room.target_score.toLocaleString()}점
              </p>
            </div>
            {host && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={100}
                  max={5000}
                  step={100}
                  value={waitingTarget}
                  onChange={(e) => setWaitingTarget(Number(e.target.value))}
                  className="w-24 rounded-xl bg-zinc-900 p-2 text-right text-sm"
                  aria-label="목표 점수"
                />
                <button
                  disabled={busy || waitingTarget === room.target_score}
                  onClick={() =>
                    void act("tichu_set_target_score", {
                      p_room: roomId,
                      p_target_score: waitingTarget,
                    })
                  }
                  className="rounded-xl bg-sky-300 px-3 py-2 text-sm font-black text-black disabled:opacity-30"
                >
                  점수 변경
                </button>
              </div>
            )}
          </div>
          {!individual && <div className="mt-4 grid grid-cols-2 gap-3">
            {[0, 1].map((t) => (
              <button
                key={t}
                onClick={() =>
                  void act("tichu_set_team", { p_room: roomId, p_team: t })
                }
                className={`rounded-2xl border-2 p-4 font-black ${me.team === t ? `${teams[t].border} ${teams[t].text}` : "border-white/10"}`}
              >
                {teams[t].name} {players.filter((p) => p.team === t).length}/2
              </button>
            ))}
          </div>}
          {!individual && host && (
            <button
              disabled={busy || players.length < 2}
              onClick={() =>
                void act("tichu_randomize_teams", { p_room: roomId })
              }
              className="mt-3 w-full rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 font-black text-amber-200 disabled:opacity-30"
            >
              🎲 팀 무작위 배정
            </button>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {players.map((p) => (
              <div
                key={p.user_id}
                className={`flex justify-between rounded-xl border p-3 ${(individual ? individualColors[p.seat % 4] : teams[p.team]).border} ${individual ? individualColors[p.seat % 4].bg : ""}`}
              >
                <span>
                  {p.name}{" "}
                  {p.is_bot && (
                    <small className="rounded-full bg-violet-400/15 px-2 py-0.5 text-violet-300">
                      {p.bot_difficulty === "advanced"
                        ? "고급 AI"
                        : p.bot_difficulty === "intermediate"
                          ? "중급 AI"
                          : "초급 AI"}
                    </small>
                  )}{" "}
                  <small
                    className={p.ready ? "text-emerald-300" : "text-zinc-600"}
                  >
                    {p.ready ? "READY" : "대기"}
                  </small>
                </span>
                {host &&
                  p.user_id !== me.user_id &&
                  (p.is_bot ? (
                    <button
                      onClick={() =>
                        void act("tichu_remove_bot", {
                          p_room: roomId,
                          p_bot: p.user_id,
                        })
                      }
                      className="text-xs text-red-300"
                    >
                      AI 제거
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        void act("tichu_kick", {
                          p_room: roomId,
                          p_user: p.user_id,
                        })
                      }
                      className="text-xs text-red-300"
                    >
                      강퇴
                    </button>
                  ))}
              </div>
            ))}
          </div>
          {host && players.length < 4 && (
            <div className="mt-4 flex gap-2">
              <select
                value={botDifficulty}
                onChange={(e) =>
                  setBotDifficulty(e.target.value as typeof botDifficulty)
                }
                className="rounded-xl border border-violet-300/30 bg-zinc-900 px-3 text-sm font-bold text-white"
                aria-label="AI 난이도"
              >
                <option value="beginner">초급</option>
                <option value="intermediate">중급</option>
                <option value="advanced">고급</option>
              </select>
              <button
                onClick={() =>
                  void act("tichu_add_bot", {
                    p_room: roomId,
                    p_difficulty: botDifficulty,
                  })
                }
                className="flex-1 rounded-xl border border-violet-300/40 bg-violet-400/10 p-3 font-black text-violet-200"
              >
                연습 AI 추가 ({players.length}/4)
              </button>
            </div>
          )}
          <button
            onClick={() => void act("tichu_toggle_ready", { p_room: roomId })}
            className={`mt-2 w-full rounded-xl p-3 font-black ${me.ready ? "bg-emerald-400 text-black" : "bg-white/10"}`}
          >
            {me.ready ? "준비 완료!" : "준비하기"}
          </button>
          {host && (
            <button
              disabled={!allReady || !teamsOk}
              onClick={() => void act("tichu_start_room", { p_room: roomId })}
              className="mt-2 w-full rounded-xl bg-amber-300 p-3 font-black text-black disabled:opacity-30"
            >
              게임 시작
            </button>
          )}
        </section>
      )}
      {waiting && host && (
        <button
          onClick={() =>
            void act("tichu_set_spectators_allowed", {
              p_room: roomId,
              p_allowed: !room.spectators_allowed,
            })
          }
          className={`mt-3 w-full rounded-xl border p-3 text-sm font-black ${room.spectators_allowed ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-200" : "border-white/15 text-zinc-400"}`}
        >
          관전 {room.spectators_allowed ? "허용 중" : "차단 중"}
        </button>
      )}
      {waiting && host && players.length < 4 && (
        <section className="mt-3 rounded-2xl border border-violet-300/30 bg-violet-400/10 p-3">
          <style>{`select[aria-label="AI 난이도"],select[aria-label="AI 난이도"]+button{display:none}`}</style>
          <p className="mb-2 text-center text-sm font-black text-violet-200">
            추가할 AI 난이도 선택
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["beginner", "초급"],
                ["intermediate", "중급"],
                ["advanced", "고급"],
              ] as const
            ).map(([difficulty, label]) => (
              <button
                key={difficulty}
                disabled={busy}
                onClick={() =>
                  void act("tichu_add_bot", {
                    p_room: roomId,
                    p_difficulty: difficulty,
                  })
                }
                className="rounded-xl border border-violet-300/40 bg-zinc-950 px-2 py-3 text-sm font-black text-white disabled:opacity-40"
              >
                <span className="block text-violet-300">{label}</span>
                <small className="text-[10px] text-zinc-500">AI 추가</small>
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-[10px] text-zinc-500">
            현재 {players.length}/4명
          </p>
        </section>
      )}
      {grand && (
        <section className="mt-4 rounded-3xl border border-amber-300/30 p-4 text-center">
          <h2 className="text-lg font-black">8장을 확인했습니다</h2>
          <p className="mt-1 text-sm text-zinc-400">
            손패 위에서 라지 티츄 선언 여부를 선택해 주세요.
          </p>
        </section>
      )}
      {(grand || exchange || playing) && (
        <section className="relative mt-2 min-h-[18.5rem] rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_center,#18342d,#09090b_72%)] sm:min-h-[19rem]">
          {(snap.spectator_names ?? []).length > 0 && (
            <div className="absolute left-4 top-4 z-10 max-w-[42%] rounded-xl border border-sky-300/20 bg-zinc-950/85 px-3 py-2 text-[11px] shadow-lg backdrop-blur-sm">
              <span className="block font-black text-sky-300">관전 중</span>
              <span className="mt-0.5 block truncate text-zinc-300">
                {(snap.spectator_names ?? []).join(" · ")}
              </span>
            </div>
          )}
          {playing && room.wish_rank && (
            <div className="absolute right-4 top-4 z-10 rounded-full border border-sky-300/50 bg-sky-300/15 px-3 py-1.5 text-[10px] font-black text-sky-200 shadow-[0_0_18px_rgba(125,211,252,.25)] backdrop-blur-sm">
              현재 소원 · <span className="text-sm text-white">{rankSymbol(room.wish_rank)}</span>
            </div>
          )}
          <div className="absolute left-1/2 top-1 -translate-x-1/2">
            <Avatar
              p={topPlayer}
              individual={individual}
              active={room.turn_seat === topPlayer?.seat}
              lead={playing && room.last_trick_seat === topPlayer?.seat}
              bubble={topPlayer && bubbles[topPlayer.user_id]}
            />
          </div>
          <div className="absolute left-2 top-1/2 -translate-y-1/2">
            <Avatar
              p={leftPlayer}
              individual={individual}
              active={room.turn_seat === leftPlayer?.seat}
              lead={playing && room.last_trick_seat === leftPlayer?.seat}
              bubble={leftPlayer && bubbles[leftPlayer.user_id]}
            />
          </div>
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <Avatar
              p={rightPlayer}
              individual={individual}
              active={room.turn_seat === rightPlayer?.seat}
              lead={playing && room.last_trick_seat === rightPlayer?.seat}
              bubble={rightPlayer && bubbles[rightPlayer.user_id]}
            />
          </div>
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
            <Avatar
              p={bottom}
              individual={individual}
              active={room.turn_seat === bottom?.seat}
              lead={playing && room.last_trick_seat === bottom?.seat}
              bubble={bottom && bubbles[bottom.user_id]}
            />
          </div>
          <div className="absolute left-1/2 top-1/2 max-w-[40%] -translate-x-1/2 -translate-y-1/2 text-center">
            {playing && (
              <div className="mx-auto mb-2 w-fit">
                {turnPlayer && (
                  <p className="mb-1 whitespace-nowrap rounded-full border border-amber-300/50 bg-amber-300 px-3 py-1 text-[11px] font-black text-zinc-950 shadow-[0_0_18px_rgba(250,204,21,.35)]">
                    {turnPlayer.is_bot
                      ? turnPlayer.name.replace(/^연습\s*/, "")
                      : turnPlayer.name}
                    님 차례
                  </p>
                )}
                <div
                  className={`mx-auto w-fit rounded-full px-3 py-1 text-lg font-black ${left <= 5 ? "bg-red-500 text-white" : "bg-white/10"}`}
                >
                  {left}초
                </div>
              </div>
            )}
            {leader && (
              <p
                className={`mx-auto mb-2 w-fit rounded-full border border-amber-300/40 bg-zinc-950/90 px-3 py-1 text-[11px] font-black ${(individual ? individualColors[leader.seat % 4] : teams[leader.team]).text}`}
              >
                <span className="mr-1 text-amber-300">리드</span>·{" "}
                {leader.is_bot
                  ? leader.name.replace(/^연습\s*/, "")
                  : leader.name}
              </p>
            )}
            <div className="flex justify-center -space-x-5">
              {[...(dogCardVisible ? [53] : room.trick.at(-1)?.cards || [])]
                .sort((a, b) => rank(a) - rank(b) || a - b)
                .map((c) => <Card key={c} card={c} tiny />)}
            </div>
          </div>
          {playing && !spectator && (
            <div className="absolute inset-x-3 bottom-5 flex items-center justify-between sm:inset-x-auto sm:right-3 sm:justify-start sm:gap-2">
              <button
                disabled={!myTurn || !room.lead || busy}
                onClick={() => void passTurn()}
                className="w-[5.5rem] rounded-xl border border-white bg-white px-2 py-3 text-sm font-black text-zinc-950 shadow-lg disabled:opacity-30"
              >
                패스
              </button>
              <button
                disabled={(!myTurn && !selectedCombo?.bomb) || !legalPick || busy}
                onClick={() => void play()}
                className="w-[5.5rem] rounded-xl bg-amber-300 px-2 py-3 text-sm font-black text-black disabled:opacity-30"
              >
                {!myTurn && selectedCombo?.bomb ? "폭탄" : "카드 내기"}
              </button>
            </div>
          )}
        </section>
      )}
      {!spectator && exchange && (
        <section className="mt-4 rounded-3xl border border-white/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <b>카드 한 장 선택 → 받을 멤버 선택</b>
              <p className="text-xs text-zinc-400">
                {(snap.exchange_pending_ids ?? []).length > 0 ? (
                  <>
                    <span className="font-black text-amber-300">
                      {(snap.exchange_pending_ids ?? [])
                        .map((id) => players.find((p) => p.user_id === id))
                        .filter((p): p is Player => Boolean(p))
                        .map((p) =>
                          p.is_bot ? p.name.replace(/^연습\s*/, "") : p.name,
                        )
                        .join(" · ")}
                    </span>{" "}
                    진행 중
                  </>
                ) : (
                  <span className="font-black text-emerald-300">
                    모두 교환 완료
                  </span>
                )}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-sm font-black ${left <= 5 ? "bg-red-500 text-white" : "bg-amber-300 text-black"}`}
            >
              {left}초
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white/5 p-3">
            <p className="text-xs text-zinc-500">
              시간 종료 시 남은 카드는 자동으로 선택됩니다.
            </p>
            <button
              disabled={busy || Object.keys(snap.my_gifts).length === 0}
              onClick={() =>
                void act("tichu_undo_gift", { p_room: roomId })
              }
              className="shrink-0 rounded-lg border border-rose-300/40 bg-rose-400/10 px-3 py-2 text-xs font-black text-rose-200 disabled:opacity-30"
            >
              최근 카드 번복
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {players
              .filter((p) => p.user_id !== me.user_id)
              .map((p) => {
                const targetClasses = individual
                  ? `${individualColors[p.seat % 4].border} ${individualColors[p.seat % 4].bg} ${individualColors[p.seat % 4].text}`
                  : teams[p.team].border;
                return (
                  <button
                    key={p.user_id}
                    disabled={
                      selected.length !== 1 || snap.my_gifts[p.user_id] != null
                    }
                    onClick={() =>
                      void act("tichu_give_card", {
                        p_room: roomId,
                        p_target: p.user_id,
                        p_card: selected[0],
                      })
                    }
                    className={`rounded-xl border p-2 font-bold disabled:opacity-30 ${targetClasses}`}
                  >
                    {p.name}
                    {snap.my_gifts[p.user_id] != null && " ✓"}
                  </button>
                );
              })}
          </div>
        </section>
      )}
      {!spectator && playing && selected.includes(52) && (
        <section className="mx-auto mt-2 w-fit max-w-full text-center">
            <div className="flex max-w-[18rem] items-center gap-1 overflow-x-auto rounded-xl border border-sky-300/20 bg-zinc-950 p-1.5 shadow-lg">
              <span className="shrink-0 px-1 text-[10px] font-black text-sky-300">
                소원
              </span>
              {[0, ...Array.from({ length: 13 }, (_, i) => i + 2)].map(
                (n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setWish(n)}
                    className={`h-7 min-w-7 shrink-0 rounded-md px-1 text-[11px] font-black ${wish === n ? "bg-sky-300 text-zinc-950" : "bg-white/10 text-zinc-300"}`}
                  >
                    {n === 0 ? "없음" : rankSymbol(n)}
                  </button>
                ),
              )}
            </div>
        </section>
      )}
      {!spectator && (grand || exchange || playing) && (
        <section className="mt-2 overflow-x-auto rounded-3xl border border-white/10 bg-zinc-950 p-2">
          <div className="flex justify-center gap-2 pt-2">
            {grand && me.grand_choice === null && (
              <>
                <button
                  onClick={() => void declare("grand")}
                  className="rounded-xl bg-amber-300 px-5 py-2 text-sm font-black text-black"
                >
                  라지 티츄!
                </button>
                <button
                  onClick={() =>
                    void act("tichu_grand_choice", {
                      p_room: roomId,
                      p_call: false,
                    })
                  }
                  className="rounded-xl border border-white/15 px-5 py-2 text-sm"
                >
                  선언 안 함
                </button>
              </>
            )}
            {grand && me.grand_choice !== null && (
              <span className="rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-bold text-emerald-300">
                선택 완료
              </span>
            )}
            {(exchange || playing) && !me.has_played && !me.small_called && (
              <button
                onClick={() => void declare("small")}
                className="rounded-xl bg-violet-500 px-6 py-2 text-sm font-black text-white"
              >
                스몰 티츄!
              </button>
            )}
          </div>
          <div className="mx-auto grid min-w-[18rem] max-w-[28rem] grid-cols-7 justify-items-center gap-0.5 py-3">
            {[...me.cards]
              .sort((a, b) => rank(a) - rank(b) || a - b)
              .map((c) => {
                const sent =
                  exchange && Object.values(snap.my_gifts).includes(c);
                return (
                  <Card
                    key={c}
                    card={c}
                    disabled={sent}
                    selected={!sent && selected.includes(c)}
                    onClick={
                      sent
                        ? undefined
                        : () =>
                            setSelected((s) =>
                              s.includes(c)
                                ? s.filter((x) => x !== c)
                                : [...s, c],
                            )
                    }
                  />
                );
              })}
          </div>
          {picked && (
            <p className={`text-center text-xs ${legalPick ? "text-sky-300" : "font-bold text-red-300"}`}>
              {legalPick ? `${picked.kind} · ${picked.size}장` : "현재 조합보다 강한 같은 종류의 패를 선택해 주세요"}
            </p>
          )}
          {snap.received.length > 0 && !exchange && (
            <p className="mt-2 text-center text-sm font-semibold text-zinc-300">
              {snap.received
                .map((x) => `${x.from_name} → ${label(x.card)}`)
                .join(" · ")}
            </p>
          )}
        </section>
      )}
      {spectator && (grand || exchange || playing) && (
        <section className="mt-4 rounded-2xl border border-sky-300/20 bg-sky-300/5 p-4 text-center text-sm font-bold text-sky-200">
          관전 중입니다 · 참가자의 손패는 공개되지 않습니다.
        </section>
      )}
      {roundEnd && (
        <section className="mt-4 rounded-3xl border p-6 text-center">
          <h2 className="text-2xl font-black">{room.round_no}라운드 종료</h2>
          <Score room={room} players={players} />
          <div className="mx-auto mt-4 grid max-w-sm grid-cols-2 gap-2 text-xs">
            {players.map((p) => (
              <span key={p.user_id} className={`rounded-lg border px-2 py-2 font-bold ${(individual ? individualColors[p.seat % 4] : teams[p.team]).border} ${p.ready ? "text-emerald-300" : "text-zinc-500"}`}>
                {p.name} · {p.ready ? "준비 완료" : "준비 중"}
              </span>
            ))}
          </div>
          {!spectator && (
            <button
              onClick={() => void act("tichu_toggle_ready", { p_room: roomId })}
              className={`mt-4 w-full max-w-sm rounded-xl px-8 py-3 font-black ${me.ready ? "bg-emerald-400 text-black" : "bg-white/10 text-white"}`}
            >
              {me.ready ? "준비 취소" : "다음 라운드 준비"}
            </button>
          )}
          {host ? (
            <button
              disabled={!allReady}
              onClick={() => void act("tichu_start_room", { p_room: roomId })}
              className="mt-2 w-full max-w-sm rounded-xl bg-amber-300 px-8 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-30"
            >
              {allReady ? "다음 라운드 시작" : "모두 준비하면 시작 가능"}
            </button>
          ) : (
            <p className="mt-5 text-sm text-zinc-400">
              방장이 다음 라운드를 시작할 때까지 기다려 주세요.
            </p>
          )}
        </section>
      )}
      {room.status === "FINISHED" && (
        <section className="mt-4 rounded-3xl border border-amber-300/30 p-8 text-center">
          <h2 className="text-3xl font-black">
            {individual
              ? `${players.find((p) => p.user_id === room.winner_user_id)?.name || "개인전 우승자"} 승리!`
              : `${teams[room.winner_team || 0].name} 승리!`}
          </h2>
          <Score room={room} players={players} />
        </section>
      )}
      {message && (
        <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-center text-red-300">
          {message}
        </p>
      )}
      {chatOpen && (
        <div className="pointer-events-none fixed inset-0 z-50">
          <aside
            className="pointer-events-auto fixed flex min-h-[13rem] min-w-[15rem] flex-col overflow-hidden rounded-2xl border p-3"
            style={{
              left: chatPosition?.x ?? 12,
              top: chatPosition?.y ?? 80,
              width: chatSize.width,
              height: chatSize.height,
              backgroundColor: `rgba(255,255,255,${chatOpacity / 100})`,
              borderColor: `rgba(255,255,255,${(chatOpacity / 100) * 0.75})`,
              boxShadow: `0 24px 48px rgba(0,0,0,${(chatOpacity / 100) * 0.45})`,
            }}
          >
            <div
              onPointerDown={startChatDrag}
              className="flex cursor-move touch-none items-center justify-between select-none"
              title="드래그해서 채팅창 이동"
            >
              <div style={{ opacity: Math.min(1, 0.55 + chatOpacity / 200) }}>
                <h2 className="text-sm font-black">실시간 채팅</h2>
                <p className="text-[9px] text-zinc-500">
                  방이 닫히면 대화도 사라집니다.
                </p>
              </div>
              <button
                type="button"
                aria-label="채팅 닫기"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setChatOpen(false)}
                className="order-first relative z-20 mr-2 grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg border text-base"
                style={{
                  backgroundColor: `rgba(255,255,255,${(chatOpacity / 100) * 0.7})`,
                  borderColor: `rgba(212,212,216,${chatOpacity / 100})`,
                  color: `rgba(9,9,11,${Math.min(1, 0.55 + chatOpacity / 200)})`,
                }}
              >
                ✕
              </button>
            </div>
            <label
              className="mt-2 flex items-center gap-2 text-[10px] font-bold text-zinc-600"
              style={{ opacity: Math.min(1, 0.55 + chatOpacity / 200) }}
            >
              <span className="shrink-0">투명도</span>
              <input
                type="range"
                min={5}
                max={100}
                value={chatOpacity}
                onChange={(e) => setChatOpacity(Number(e.target.value))}
                className="h-4 min-w-0 flex-1 accent-sky-500"
                aria-label="채팅창 투명도"
              />
              <span className="w-7 text-right">{chatOpacity}%</span>
            </label>
            <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-1">
              {chats.length === 0 && (
                <p
                  className="py-8 text-center text-sm text-zinc-600"
                  style={{ opacity: Math.min(1, 0.55 + chatOpacity / 200) }}
                >
                  아직 채팅이 없습니다.
                </p>
              )}
              {chats.map((c) => (
                <div
                  key={c.id}
                  className="px-1 py-1"
                >
                  <b
                    className="text-[10px] text-sky-700"
                    style={{ opacity: Math.min(1, 0.62 + chatOpacity / 250) }}
                  >
                    {c.user}
                  </b>
                  <p
                    className="break-words text-xs text-zinc-900"
                    style={{ opacity: Math.min(1, 0.62 + chatOpacity / 250) }}
                  >
                    {c.text}
                  </p>
                </div>
              ))}
              <div ref={chatEnd} />
            </div>
            <div className="mt-2 flex shrink-0 gap-1.5">
              <input
                ref={chatInput}
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onCompositionStart={() => {
                  chatComposing.current = true;
                }}
                onCompositionEnd={() => {
                  chatComposing.current = false;
                }}
                onKeyDown={(e) => {
                  if (
                    e.key !== "Enter" ||
                    chatComposing.current ||
                    e.nativeEvent.isComposing ||
                    e.nativeEvent.keyCode === 229
                  )
                    return;
                  e.preventDefault();
                  send();
                }}
                placeholder="메시지 입력"
                className="min-w-0 flex-1 rounded-lg border p-2 text-sm placeholder:text-zinc-500"
                style={{
                  backgroundColor: `rgba(255,255,255,${(chatOpacity / 100) * 0.85})`,
                  borderColor: `rgba(212,212,216,${chatOpacity / 100})`,
                  color: `rgba(9,9,11,${Math.min(1, 0.62 + chatOpacity / 250)})`,
                }}
              />
              <button
                onClick={send}
                className="rounded-lg px-2.5 text-xs font-black"
                style={{
                  backgroundColor: `rgba(56,189,248,${(chatOpacity / 100) * 0.9})`,
                  color: `rgba(9,9,11,${Math.min(1, 0.62 + chatOpacity / 250)})`,
                }}
              >
                전송
              </button>
            </div>
            <button
              type="button"
              aria-label="채팅창 크기 조절"
              title="드래그해서 채팅창 크기 조절"
              onPointerDown={startChatResize}
              className="absolute bottom-0 right-0 h-6 w-6 cursor-se-resize touch-none text-zinc-600 after:absolute after:bottom-1 after:right-1 after:h-2.5 after:w-2.5 after:border-b-2 after:border-r-2 after:border-current"
            />
          </aside>
        </div>
      )}
    </main>
  );
}
function Score({ room, players }: { room: Room; players: Player[] }) {
  if (room.game_mode === "INDIVIDUAL") {
    return (
      <div className="mx-auto mt-4 max-w-sm space-y-2">
        {[...players]
          .sort((a, b) => b.score - a.score)
          .map((p, index) => (
            <div key={p.user_id} className={`flex items-center justify-between rounded-xl border p-3 ${individualColors[p.seat % 4].border} ${individualColors[p.seat % 4].bg}`}>
              <span>{index + 1}위 · {p.name}</span>
              <b className={individualColors[p.seat % 4].text}>{p.score}점</b>
            </div>
          ))}
      </div>
    );
  }
  return (
    <div className="mx-auto mt-4 max-w-sm space-y-2">
      {room.round_history.map((h) => (
        <div
          key={h.round}
          className="grid grid-cols-3 rounded-xl bg-white/[.04] p-3"
        >
          <span>{h.round}R</span>
          <b className="text-sky-300">{h.sky}</b>
          <b className="text-pink-300">{h.pink}</b>
        </div>
      ))}
      <div className="grid grid-cols-3 p-3 font-black">
        <span>합계</span>
        <span className="text-sky-300">{room.sky_score}</span>
        <span className="text-pink-300">{room.pink_score}</span>
      </div>
    </div>
  );
}
