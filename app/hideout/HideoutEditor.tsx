"use client";

import { useEffect, useMemo, useState } from "react";
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
  chair: [{ id: "green", name: "녹색 의자", icon: "🪑" }, { id: "sofa", name: "가죽 소파", icon: "🛋️" }, { id: "stool", name: "게임 스툴", icon: "💺" }],
  lamp: [{ id: "classic", name: "클래식 조명", icon: "💡" }, { id: "lantern", name: "랜턴", icon: "🏮" }, { id: "candle", name: "캔들", icon: "🕯️" }],
  rug: [{ id: "forest", name: "포레스트 러그", icon: "🟩" }, { id: "wine", name: "와인 러그", icon: "🟥" }, { id: "night", name: "나이트 러그", icon: "🟦" }],
  plant: [{ id: "monstera", name: "몬스테라", icon: "🪴" }, { id: "flower", name: "꽃 화분", icon: "🌻" }, { id: "cactus", name: "선인장", icon: "🌵" }],
} as const;

function furnitureIcon(kind: keyof Furniture, id: string) {
  return FURNITURE[kind].find((item) => item.id === id)?.icon ?? "✨";
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

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.4fr_.8fr]">
          <div className="relative min-h-[500px] overflow-hidden rounded-[2rem] border border-amber-400/20 bg-gradient-to-b from-[#322419] via-[#201812] to-[#0e0d0c] p-5 shadow-2xl">
            <div className="absolute inset-x-0 top-0 h-[58%] bg-[linear-gradient(90deg,transparent_49%,rgba(255,255,255,.035)_50%,transparent_51%)] bg-[length:80px_100%]"/>
            <div className="relative flex items-start justify-between"><div><span className="rounded-full border border-amber-300/30 bg-black/30 px-3 py-1 text-xs text-amber-200">LV. 1 · 첫 번째 아지트</span></div><span className="text-3xl">{furnitureIcon("lamp", furniture.lamp)}</span></div>
            <div className="relative mt-8 grid grid-cols-[1fr_1.2fr] items-end gap-4">
              <div className="rounded-2xl border-4 border-[#5a3725] bg-[#160f0c] p-2 shadow-xl">
                <p className="mb-2 text-center text-[10px] font-bold tracking-widest text-amber-200/60">MY GAME SHELF</p>
                <div className="grid grid-cols-3 gap-1.5">{selectedGames.map((game, index) => <div key={index} className="grid aspect-[.72] place-items-center rounded-sm border border-amber-900/50 bg-gradient-to-br from-amber-800 to-zinc-950 p-1 text-center text-[9px] font-black leading-tight text-amber-50">{game?.name ?? <span className="text-amber-900">+</span>}</div>)}</div>
              </div>
              <div className="grid place-items-center"><MemberAvatar look={look} size="h-40 w-40 sm:h-52 sm:w-52" square/><p className="mt-2 rounded-full bg-black/40 px-3 py-1 text-xs font-bold">{data.ownerName}</p></div>
            </div>
            <div className="relative mt-6 grid grid-cols-3 items-end text-center"><span className="text-6xl">{furnitureIcon("plant", furniture.plant)}</span><div className={`rounded-[50%] p-7 ${furniture.rug === "wine" ? "bg-red-900/60" : furniture.rug === "night" ? "bg-blue-950/70" : "bg-emerald-950/70"}`}><span className="text-5xl">🎲</span></div><span className="text-6xl">{furnitureIcon("chair", furniture.chair)}</span></div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-zinc-950 p-5">
            <div className="grid grid-cols-3 gap-2">{([ ["room","가구"], ["avatar","아바타"], ["shelf","책장"] ] as const).map(([id,label]) => <button key={id} onClick={() => setTab(id)} className={`rounded-xl px-3 py-2.5 text-sm font-bold ${tab === id ? "bg-amber-400 text-zinc-950" : "bg-white/5 text-zinc-400"}`}>{label}</button>)}</div>
            {tab === "room" && <div className="mt-5 space-y-5">{(Object.keys(FURNITURE) as (keyof Furniture)[]).map((kind) => <fieldset key={kind}><legend className="mb-2 text-xs font-bold text-zinc-500">{{chair:"의자",lamp:"조명",rug:"러그",plant:"화분"}[kind]}</legend><div className="grid grid-cols-3 gap-2">{FURNITURE[kind].map((item) => <button key={item.id} onClick={() => setFurniture((old) => ({...old,[kind]:item.id}))} className={`rounded-xl border p-3 ${furniture[kind] === item.id ? "border-amber-400 bg-amber-400/10" : "border-white/10 bg-white/[.03]"}`}><span className="block text-3xl">{item.icon}</span><span className="mt-2 block text-[11px] text-zinc-400">{item.name}</span></button>)}</div></fieldset>)}</div>}
            {tab === "avatar" && <div className="mt-5 space-y-5"><div><p className="mb-2 text-xs font-bold text-zinc-500">헤어스타일</p><div className="grid grid-cols-4 gap-2">{Array.from({length:16},(_,hair) => <button key={hair} onClick={() => setLook((old) => ({...old,hair}))} className={`rounded-xl p-1 ${look.hair === hair ? "ring-2 ring-amber-400" : "opacity-70"}`}><MemberAvatar look={{...look,hair}} size="aspect-square w-full"/></button>)}</div></div><div><p className="mb-2 text-xs font-bold text-zinc-500">머리색</p><div className="grid grid-cols-5 gap-2">{HAIR_COLORS.map((color,index) => <button key={HAIR_COLOR_NAMES[index]} onClick={() => setLook((old) => ({...old,hairColor:index}))} title={HAIR_COLOR_NAMES[index]} className={`aspect-square rounded-full border-2 ${look.hairColor === index ? "border-white" : "border-white/10"}`} style={{background: index === 0 ? "linear-gradient(135deg,#fde68a,#f9a8d4,#7dd3fc)" : color}}/>)}</div></div><div><p className="mb-2 text-xs font-bold text-zinc-500">표정</p><div className="grid grid-cols-4 gap-2">{EXPRESSION_NAMES.map((name,expression) => <button key={name} onClick={() => setLook((old) => ({...old,expression}))} className={`rounded-xl p-1 ${look.expression === expression ? "ring-2 ring-amber-400" : "opacity-70"}`}><MemberAvatar look={{...look,expression}} size="aspect-square w-full"/><span className="mt-1 block text-[10px] text-zinc-500">{name}</span></button>)}</div></div></div>}
            {tab === "shelf" && <div className="mt-5"><p className="text-sm leading-6 text-zinc-400">실제로 플레이한 게임만 전시할 수 있어요. 같은 게임은 한 칸에만 놓을 수 있습니다.</p><div className="mt-4 space-y-3">{shelf.map((value,index) => <label key={index} className="grid grid-cols-[54px_1fr] items-center gap-3"><span className="text-xs font-bold text-zinc-500">{index+1}번 칸</span><select value={value} onChange={(event) => { const next=[...shelf]; next[index]=event.target.value; setShelf(next); }} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-3 text-sm"><option value="">비워두기</option>{data.games.map((game) => <option key={game.id} value={game.id} disabled={shelf.some((id,i) => i !== index && id === game.id)}>{game.name} · {game.playCount}판</option>)}</select></label>)}</div>{!data.games.length && <p className="mt-5 rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-zinc-500">아직 전시할 플레이 기록이 없습니다.</p>}</div>}
          </div>
        </div>
        {message && <p className={`mt-5 rounded-2xl border p-4 text-sm ${message.includes("저장했어요") ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-300" : "border-red-400/20 bg-red-400/5 text-red-300"}`}>{message}</p>}
      </section>
    </main>
  );
}
