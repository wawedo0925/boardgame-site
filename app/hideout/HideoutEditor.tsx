"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import MemberAvatar, {
  EXPRESSION_NAMES,
  HAIR_COLORS,
  HAIR_COLOR_NAMES,
  type MemberAvatarLook,
} from "@/components/avatar/MemberAvatar";

type Game = { id: string; name: string; playCount: number };
type Furniture = { chair: string; lamp: string; rug: string; plant: string };
type HideoutData = {
  ownerName: string;
  avatar: MemberAvatarLook;
  furniture: Furniture;
  shelf: string[];
  games: Game[];
};

const DEFAULT_LOOK: MemberAvatarLook = { hair: 0, skin: 1, hairColor: 0, expression: 0, outfit: 0, accessory: 0, frame: 0 };
const DEFAULT_FURNITURE: Furniture = { chair: "green", lamp: "classic", rug: "forest", plant: "monstera" };
const FURNITURE = {
  chair: [{ id: "green", name: "녹색 의자", col: 0 }, { id: "sofa", name: "가죽 소파", col: 1 }, { id: "stool", name: "게임 체어", col: 2 }],
  lamp: [{ id: "classic", name: "클래식 조명", col: 0 }, { id: "lantern", name: "펜던트 랜턴", col: 1 }, { id: "candle", name: "캔들 랜턴", col: 2 }],
  rug: [{ id: "forest", name: "포레스트 러그", col: 0 }, { id: "wine", name: "와인 러그", col: 1 }, { id: "night", name: "나이트 러그", col: 2 }],
  plant: [{ id: "monstera", name: "몬스테라", col: 0 }, { id: "flower", name: "꽃 화분", col: 1 }, { id: "cactus", name: "선인장", col: 2 }],
} as const;

const FURNITURE_ROW: Record<keyof Furniture, number> = { chair: 0, lamp: 1, rug: 2, plant: 3 };
const SHELF_SLOTS = [
  { left: "17.0%", top: "19.0%", width: "9.2%", height: "9.4%" },
  { left: "27.9%", top: "17.4%", width: "9.0%", height: "9.2%" },
  { left: "38.8%", top: "15.4%", width: "8.6%", height: "8.9%" },
  { left: "17.0%", top: "29.9%", width: "9.2%", height: "9.4%" },
  { left: "27.9%", top: "28.1%", width: "9.0%", height: "9.2%" },
  { left: "38.8%", top: "26.0%", width: "8.6%", height: "8.9%" },
] as const;

const GAME_PALETTES = [
  ["#5b1021", "#d64b45", "#f5cf72"], ["#10253d", "#18789a", "#8fe3d1"],
  ["#253512", "#78952f", "#e8d66c"], ["#31144b", "#8d3c8e", "#f3a1be"],
  ["#3c2412", "#c16d24", "#f0cc82"], ["#172b25", "#2f7565", "#e7bd65"],
] as const;

function gameHash(name: string) {
  return [...name].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 17);
}

function ShelfGame({ game, slot }: { game?: Game; slot: (typeof SHELF_SLOTS)[number] }) {
  if (!game) return null;
  const hash = gameHash(game.name);
  const colors = GAME_PALETTES[hash % GAME_PALETTES.length];
  const symbol = ["◆", "●", "▲", "✦", "⬡", "♟"][hash % 6];
  return <div className="absolute grid place-items-center overflow-hidden rounded-[5%] border border-amber-100/45 text-center shadow-[0_4px_8px_rgba(0,0,0,.65)]" style={{ ...slot, backgroundColor: colors[0], backgroundImage: `linear-gradient(135deg,transparent 46%,${colors[1]} 47% 58%,transparent 59%),repeating-linear-gradient(0deg,transparent 0 8px,${colors[2]}22 8px 10px)` }} title={game.name}>
    <span aria-hidden="true" className="absolute text-[12px] text-white/25 sm:text-xl">{symbol}</span>
    <span className="relative z-10 max-w-[90%] break-keep text-[5px] font-black leading-[1.05] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.9)] sm:text-[8px]">{game.name}</span>
  </div>;
}

function FurnitureSprite({ kind, id, className = "" }: { kind: keyof Furniture; id: string; className?: string }) {
  const item = FURNITURE[kind].find((candidate) => candidate.id === id);
  const col = item?.col ?? 0;
  return <span aria-hidden="true" className={`block bg-[url('/hideout/furniture-sprites-v1.png')] bg-[length:300%_400%] bg-no-repeat ${className}`} style={{ backgroundPosition: `${col * 50}% ${FURNITURE_ROW[kind] * (100 / 3)}%` }} />;
}

export default function HideoutEditor() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<HideoutData | null>(null);
  const [look, setLook] = useState(DEFAULT_LOOK);
  const [furniture, setFurniture] = useState(DEFAULT_FURNITURE);
  const [shelf, setShelf] = useState<string[]>(Array(6).fill(""));
  const [tab, setTab] = useState<"room" | "avatar" | "shelf">("room");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.rpc("my_hideout_beta").then(({ data: payload, error }) => {
      if (!active) return;
      if (error) { setMessage(error.message); return; }
      const loaded = payload as HideoutData;
      setData(loaded);
      setLook({ ...DEFAULT_LOOK, ...(loaded.avatar ?? {}) });
      setFurniture({ ...DEFAULT_FURNITURE, ...(loaded.furniture ?? {}) });
      setShelf([...Array(6)].map((_, index) => loaded.shelf?.[index] ?? ""));
    });
    return () => { active = false; };
  }, [supabase]);

  async function save() {
    setSaving(true);
    setMessage("");
    const avatarResult = await supabase.rpc("tichu_set_avatar", {
      p_hair: look.hair, p_skin: look.skin, p_hair_color: look.hairColor,
      p_expression: look.expression, p_outfit: look.outfit,
      p_accessory: look.accessory, p_frame: look.frame,
    });
    if (avatarResult.error) { setMessage(avatarResult.error.message); setSaving(false); return; }
    const { error } = await supabase.rpc("save_my_hideout_beta", { p_furniture: furniture, p_shelf: shelf.filter(Boolean) });
    setMessage(error ? error.message : "아지트와 대표 아바타를 저장했어요. 티츄 테이블에도 같은 모습이 적용됩니다.");
    setSaving(false);
  }

  if (!data) return <main className="min-h-screen bg-[#08090b] px-5 py-16 text-white"><div className="mx-auto h-96 max-w-6xl animate-pulse rounded-3xl bg-white/[0.04]"/><p className="mt-4 text-center text-sm text-zinc-500">{message || "아지트를 준비하고 있어요."}</p></main>;

  const selectedGames = shelf.map((id) => data.games.find((game) => game.id === id));
  return (
    <main className="min-h-screen bg-[#08090b] text-white">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-black tracking-[.28em] text-amber-400">PRIVATE BETA</p><h1 className="mt-2 text-3xl font-black">{data.ownerName}의 아지트</h1><p className="mt-2 text-sm text-zinc-500">현재 우영 메인 관리자 계정에만 보이는 테스트 공간입니다.</p></div>
          <button onClick={save} disabled={saving} className="rounded-full bg-amber-400 px-6 py-3 font-black text-zinc-950 disabled:opacity-50">{saving ? "저장 중…" : "저장"}</button>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.45fr_.75fr]">
          <div className="relative aspect-square overflow-hidden rounded-[2rem] border border-amber-300/30 bg-[#17120f] shadow-[0_30px_90px_rgba(0,0,0,.55)]">
            <Image src="/hideout/cozy-room-v2.png" alt="따뜻한 보드게임 아지트" fill priority sizes="(min-width: 1024px) 680px, 100vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/10" />
            <div className="absolute left-[4%] top-[4%] rounded-full border border-amber-200/30 bg-black/55 px-3 py-1.5 text-[10px] font-bold text-amber-100 shadow-lg backdrop-blur sm:text-xs">LV. 1 · 첫 번째 아지트</div>

            {selectedGames.map((game, index) => <ShelfGame key={index} game={game} slot={SHELF_SLOTS[index]} />)}

            <FurnitureSprite kind="rug" id={furniture.rug} className="absolute bottom-[7%] left-[29%] z-[1] h-[25%] w-[42%] opacity-90 drop-shadow-[0_8px_8px_rgba(0,0,0,.35)]" />
            <FurnitureSprite kind="plant" id={furniture.plant} className="absolute bottom-[15%] left-[7%] z-[3] h-[21%] w-[19%] drop-shadow-[0_12px_8px_rgba(0,0,0,.55)]" />
            <FurnitureSprite kind="chair" id={furniture.chair} className="absolute bottom-[11%] right-[6%] z-[3] h-[25%] w-[23%] drop-shadow-[0_14px_10px_rgba(0,0,0,.6)]" />
            <FurnitureSprite kind="lamp" id={furniture.lamp} className="absolute bottom-[28%] right-[24%] z-[2] h-[17%] w-[15%] drop-shadow-[0_10px_8px_rgba(0,0,0,.55)]" />

            <div className="absolute bottom-[13%] left-1/2 z-[4] grid -translate-x-1/2 place-items-center">
              <div className="rounded-full border-2 border-amber-200/80 bg-zinc-900 p-1 shadow-[0_10px_30px_rgba(0,0,0,.65)]"><MemberAvatar look={look} size="h-16 w-16 sm:h-24 sm:w-24" /></div>
              <p className="mt-1 rounded-full border border-white/10 bg-black/70 px-3 py-1 text-[10px] font-bold backdrop-blur sm:text-xs">{data.ownerName}</p>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-zinc-950 p-5">
            <div className="grid grid-cols-3 gap-2">{([ ["room","가구"], ["avatar","아바타"], ["shelf","책장"] ] as const).map(([id,label]) => <button key={id} onClick={() => setTab(id)} className={`rounded-xl px-3 py-2.5 text-sm font-bold ${tab === id ? "bg-amber-400 text-zinc-950" : "bg-white/5 text-zinc-400"}`}>{label}</button>)}</div>
            {tab === "room" && <div className="mt-5 space-y-5">{(Object.keys(FURNITURE) as (keyof Furniture)[]).map((kind) => <fieldset key={kind}><legend className="mb-2 text-xs font-bold text-zinc-500">{{chair:"의자",lamp:"조명",rug:"러그",plant:"화분"}[kind]}</legend><div className="grid grid-cols-3 gap-2">{FURNITURE[kind].map((item) => <button key={item.id} onClick={() => setFurniture((old) => ({...old,[kind]:item.id}))} className={`overflow-hidden rounded-xl border p-2 transition ${furniture[kind] === item.id ? "border-amber-400 bg-amber-400/10 shadow-[0_0_22px_rgba(251,191,36,.12)]" : "border-white/10 bg-white/[.03] hover:border-white/25"}`}><FurnitureSprite kind={kind} id={item.id} className="mx-auto aspect-square w-full"/><span className="mt-1 block text-[10px] text-zinc-400 sm:text-[11px]">{item.name}</span></button>)}</div></fieldset>)}</div>}
            {tab === "avatar" && <div className="mt-5 space-y-5"><div><p className="mb-2 text-xs font-bold text-zinc-500">헤어스타일</p><div className="grid grid-cols-4 gap-2">{Array.from({length:16},(_,hair) => <button key={hair} onClick={() => setLook((old) => ({...old,hair}))} className={`rounded-xl p-1 ${look.hair === hair ? "ring-2 ring-amber-400" : "opacity-70"}`}><MemberAvatar look={{...look,hair}} size="aspect-square w-full"/></button>)}</div></div><div><p className="mb-2 text-xs font-bold text-zinc-500">머리색</p><div className="grid grid-cols-5 gap-2">{HAIR_COLORS.map((color,index) => <button key={HAIR_COLOR_NAMES[index]} onClick={() => setLook((old) => ({...old,hairColor:index}))} title={HAIR_COLOR_NAMES[index]} className={`aspect-square rounded-full border-2 ${look.hairColor === index ? "border-white" : "border-white/10"}`} style={{background: index === 0 ? "linear-gradient(135deg,#fde68a,#f9a8d4,#7dd3fc)" : color}}/>)}</div></div><div><p className="mb-2 text-xs font-bold text-zinc-500">표정</p><div className="grid grid-cols-4 gap-2">{EXPRESSION_NAMES.map((name,expression) => <button key={name} onClick={() => setLook((old) => ({...old,expression}))} className={`rounded-xl p-1 ${look.expression === expression ? "ring-2 ring-amber-400" : "opacity-70"}`}><MemberAvatar look={{...look,expression}} size="aspect-square w-full"/><span className="mt-1 block text-[10px] text-zinc-500">{name}</span></button>)}</div></div></div>}
            {tab === "shelf" && <div className="mt-5"><p className="text-sm leading-6 text-zinc-400">실제로 플레이한 게임만 전시할 수 있어요. 같은 게임은 한 칸에만 놓을 수 있습니다.</p><div className="mt-4 space-y-3">{shelf.map((value,index) => <label key={index} className="grid grid-cols-[54px_1fr] items-center gap-3"><span className="text-xs font-bold text-zinc-500">{index+1}번 칸</span><select value={value} onChange={(event) => { const next=[...shelf]; next[index]=event.target.value; setShelf(next); }} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-3 text-sm"><option value="">비워두기</option>{data.games.map((game) => <option key={game.id} value={game.id} disabled={shelf.some((id,i) => i !== index && id === game.id)}>{game.name} · {game.playCount}판</option>)}</select></label>)}</div>{!data.games.length && <p className="mt-5 rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-zinc-500">아직 전시할 플레이 기록이 없습니다.</p>}</div>}
          </div>
        </div>
        {message && <p className={`mt-5 rounded-2xl border p-4 text-sm ${message.includes("저장했어요") ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-300" : "border-red-400/20 bg-red-400/5 text-red-300"}`}>{message}</p>}
      </section>
    </main>
  );
}
