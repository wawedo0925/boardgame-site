"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import {
  EXPRESSION_NAMES,
  HAIR_COLORS,
  HAIR_COLOR_NAMES,
  StandingMemberAvatar,
  type AvatarMovablePart,
  type AvatarPartPosition,
  type MemberAvatarLook,
} from "@/components/avatar/MemberAvatar";

type Game = { id: string; name: string; playCount: number };
type FurnitureKind = "chair" | "lamp" | "rug" | "plant";
type RoomItemKey = "shelf" | "sofa" | "table" | "frames" | "clock" | "sconce" | "chair" | "lamp" | "rug" | "plant";
type RoomItemPosition = { x: number; y: number };
type Furniture = { chair: string; lamp: string; rug: string; plant: string; theme?: string; wall?: string; floor?: string; shelfStyle?: string; sofaStyle?: string; tableStyle?: string; positions?: Partial<Record<RoomItemKey, RoomItemPosition>> };
type AvatarPart = "hair" | "expression" | "hat" | "top" | "bottom" | "shoes";
type HideoutData = {
  ownerName: string;
  avatar: MemberAvatarLook;
  furniture: Furniture;
  shelf: string[];
  games: Game[];
};

const DEFAULT_LOOK: MemberAvatarLook = { hair: 0, skin: 1, hairColor: 0, expression: 0, outfit: 0, accessory: 0, frame: 0, top: 0, bottom: 0, shoes: 0, hat: 0 };
const HAT_OPTIONS = [0, 6, 13, 14, 15];
const MOVABLE_PARTS: AvatarMovablePart[] = ["hair", "hat", "top", "bottom", "shoes"];
const DEFAULT_ROOM_POSITIONS: Record<RoomItemKey, RoomItemPosition> = { shelf:{x:25,y:31}, sofa:{x:73,y:39}, table:{x:52,y:53}, frames:{x:76,y:20}, clock:{x:88,y:24}, sconce:{x:94,y:34}, chair:{x:82,y:72}, lamp:{x:67,y:67}, rug:{x:48,y:76}, plant:{x:16,y:67} };
const DEFAULT_FURNITURE: Furniture = { chair: "green", lamp: "classic", rug: "forest", plant: "monstera", wall: "walnut-parquet", floor: "walnut-parquet", shelfStyle: "classic", sofaStyle: "classic", tableStyle: "classic", positions: DEFAULT_ROOM_POSITIONS };
const WALL_OPTIONS = [{id:"walnut-parquet",name:"월넛 패널"},{id:"forest-oak",name:"포레스트"},{id:"cream-stone",name:"크림 벽"}] as const;
const FLOOR_OPTIONS = [{id:"walnut-parquet",name:"월넛 마루"},{id:"forest-oak",name:"라이트 오크"},{id:"cream-stone",name:"차콜 스톤"}] as const;
const ROOM_ITEM_STYLES = [
  { field:"shelfStyle", key:"shelf", label:"책장", options:[{id:"classic",name:"클래식 월넛"},{id:"oak",name:"라이트 오크"},{id:"modern",name:"모던 블랙"}] },
  { field:"sofaStyle", key:"sofa", label:"소파", options:[{id:"classic",name:"브라운 가죽"},{id:"sage",name:"세이지 벨벳"},{id:"modern",name:"모던 네이비"}] },
  { field:"tableStyle", key:"table", label:"테이블 · 의자", options:[{id:"classic",name:"월넛 그린"},{id:"oak",name:"오크 세이지"},{id:"modern",name:"블랙 네이비"}] },
] as const;
const roomItemAsset = (key: "shelf" | "sofa" | "table", style?: string) => `/hideout/room-items/${key}${!style || style === "classic" ? "" : `-${style}`}.png`;
const FURNITURE = {
  chair: [{ id: "green", name: "녹색 의자", col: 0 }, { id: "sofa", name: "가죽 소파", col: 1 }, { id: "stool", name: "게임 체어", col: 2 }],
  lamp: [{ id: "classic", name: "클래식 조명", col: 0 }, { id: "lantern", name: "펜던트 랜턴", col: 1 }, { id: "candle", name: "캔들 랜턴", col: 2 }],
  rug: [{ id: "forest", name: "포레스트 러그", col: 0 }, { id: "wine", name: "와인 러그", col: 1 }, { id: "night", name: "나이트 러그", col: 2 }],
  plant: [{ id: "monstera", name: "몬스테라", col: 0 }, { id: "flower", name: "꽃 화분", col: 1 }, { id: "cactus", name: "선인장", col: 2 }],
} as const;

const MOVABLE_SHELF_SLOTS = [
  { left:"10%",top:"18%",width:"24%",height:"23%" }, { left:"38%",top:"18%",width:"24%",height:"23%" }, { left:"66%",top:"18%",width:"24%",height:"23%" },
  { left:"10%",top:"47%",width:"24%",height:"23%" }, { left:"38%",top:"47%",width:"24%",height:"23%" }, { left:"66%",top:"47%",width:"24%",height:"23%" },
] as const;

const GAME_PALETTES = [
  ["#5b1021", "#d64b45", "#f5cf72"], ["#10253d", "#18789a", "#8fe3d1"],
  ["#253512", "#78952f", "#e8d66c"], ["#31144b", "#8d3c8e", "#f3a1be"],
  ["#3c2412", "#c16d24", "#f0cc82"], ["#172b25", "#2f7565", "#e7bd65"],
] as const;

function gameHash(name: string) {
  return [...name].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 17);
}

function ShelfGame({ game, slot }: { game?: Game; slot: { left: string; top: string; width: string; height: string } }) {
  if (!game) return null;
  const hash = gameHash(game.name);
  const colors = GAME_PALETTES[hash % GAME_PALETTES.length];
  const symbol = ["◆", "●", "▲", "✦", "⬡", "♟"][hash % 6];
  return <div className="absolute grid place-items-center overflow-hidden rounded-[5%] border border-amber-100/45 text-center shadow-[0_4px_8px_rgba(0,0,0,.65)]" style={{ ...slot, backgroundColor: colors[0], backgroundImage: `linear-gradient(135deg,transparent 46%,${colors[1]} 47% 58%,transparent 59%),repeating-linear-gradient(0deg,transparent 0 8px,${colors[2]}22 8px 10px)` }} title={game.name}>
    <span aria-hidden="true" className="absolute text-[12px] text-white/25 sm:text-xl">{symbol}</span>
    <span className="relative z-10 max-w-[90%] break-keep text-[5px] font-black leading-[1.05] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.9)] sm:text-[8px]">{game.name}</span>
  </div>;
}

function FurnitureSprite({ kind, id, className = "" }: { kind: FurnitureKind; id: string; className?: string }) {
  return <span aria-hidden="true" className={`relative block ${className}`}><Image src={`/hideout/furniture/${kind}-${id}.png`} alt="" fill className="object-contain"/></span>;
}

export default function HideoutEditor() {
  const supabase = useMemo(() => createClient(), []);
  const roomRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<HideoutData | null>(null);
  const [look, setLook] = useState(DEFAULT_LOOK);
  const [furniture, setFurniture] = useState(DEFAULT_FURNITURE);
  const [shelf, setShelf] = useState<string[]>(Array(6).fill(""));
  const [tab, setTab] = useState<"room" | "avatar" | "shelf">("room");
  const [avatarPart, setAvatarPart] = useState<AvatarPart>("hair");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [draggingRoomItem, setDraggingRoomItem] = useState<RoomItemKey | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.rpc("my_hideout_beta").then(({ data: payload, error }) => {
      if (!active) return;
      if (error) { setMessage(error.message); return; }
      const loaded = payload as HideoutData;
      setData(loaded);
      setLook({ ...DEFAULT_LOOK, ...(loaded.avatar ?? {}) });
      const loadedFurniture = loaded.furniture ?? DEFAULT_FURNITURE;
      setFurniture({ ...DEFAULT_FURNITURE, ...loadedFurniture, wall: loadedFurniture.wall ?? loadedFurniture.theme ?? "walnut-parquet", floor: loadedFurniture.floor ?? loadedFurniture.theme ?? "walnut-parquet" });
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
    const { error } = await supabase.rpc("save_my_hideout_beta", { p_furniture: furniture, p_shelf: shelf.filter(Boolean), p_avatar: look });
    setMessage(error ? error.message : "아지트와 대표 아바타를 저장했어요. 티츄 테이블에도 같은 모습이 적용됩니다.");
    setSaving(false);
  }

  function updatePartPosition(part: AvatarMovablePart, position: AvatarPartPosition) {
    setLook((old) => ({ ...old, positions: { ...old.positions, [part]: position } }));
  }

  function resetPartPosition(part: AvatarMovablePart) {
    setLook((old) => ({ ...old, positions: { ...old.positions, [part]: { x: 0, y: 0 } } }));
  }

  const roomPosition = (key: RoomItemKey) => furniture.positions?.[key] ?? DEFAULT_ROOM_POSITIONS[key];
  const roomDragProps = (key: RoomItemKey) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDraggingRoomItem(key); },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      if (draggingRoomItem !== key || !roomRef.current) return;
      const bounds = roomRef.current.getBoundingClientRect();
      const x = Math.max(5, Math.min(95, ((event.clientX - bounds.left) / bounds.width) * 100));
      const y = Math.max(8, Math.min(92, ((event.clientY - bounds.top) / bounds.height) * 100));
      setFurniture((old) => ({ ...old, positions: { ...old.positions, [key]: { x, y } } }));
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setDraggingRoomItem(null); },
    onPointerCancel: () => setDraggingRoomItem(null),
  });
  const roomStyle = (key: RoomItemKey) => ({ left: `${roomPosition(key).x}%`, top: `${roomPosition(key).y}%`, transform: "translate(-50%,-50%)" });

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
          <div ref={roomRef} className="relative aspect-square overflow-hidden rounded-[2rem] border border-amber-300/30 bg-[#17120f] shadow-[0_30px_90px_rgba(0,0,0,.55)]">
            <Image src={`/hideout/floors/${furniture.floor ?? "walnut-parquet"}.png`} alt="꾸밀 수 있는 보드게임 아지트 바닥" fill priority sizes="(min-width: 1024px) 680px, 100vw" className="object-cover" />
            <Image src={`/hideout/walls/${furniture.wall ?? "walnut-parquet"}.png`} alt="꾸밀 수 있는 보드게임 아지트 벽" fill priority sizes="(min-width: 1024px) 680px, 100vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/10" />
            <div className="absolute left-[4%] top-[4%] rounded-full border border-amber-200/30 bg-black/55 px-3 py-1.5 text-[10px] font-bold text-amber-100 shadow-lg backdrop-blur sm:text-xs">LV. 1 · 첫 번째 아지트</div>
            <div className="absolute z-[2] h-[34%] w-[39%] cursor-move touch-none" style={roomStyle("shelf")} {...roomDragProps("shelf")}><Image src={roomItemAsset("shelf",furniture.shelfStyle)} alt="책장" fill className="pointer-events-none object-contain drop-shadow-xl"/>{selectedGames.map((game,index)=><ShelfGame key={index} game={game} slot={MOVABLE_SHELF_SLOTS[index]}/>)}</div>
            {([['sofa','소파','h-[25%] w-[38%]',roomItemAsset("sofa",furniture.sofaStyle)],['table','게임 테이블','h-[30%] w-[38%]',roomItemAsset("table",furniture.tableStyle)],['frames','액자','h-[22%] w-[24%]','/hideout/room-items/frames.png'],['clock','시계','h-[14%] w-[14%]','/hideout/room-items/clock.png'],['sconce','벽 조명','h-[16%] w-[15%]','/hideout/room-items/sconce.png']] as const).map(([key,label,size,src])=><div key={key} className={`absolute z-[2] cursor-move touch-none ${size}`} style={roomStyle(key)} {...roomDragProps(key)}><Image src={src} alt={label} fill className="pointer-events-none object-contain drop-shadow-xl"/></div>)}
            {([['rug','h-[25%] w-[42%] z-[1]'],['plant','h-[21%] w-[19%] z-[3]'],['chair','h-[25%] w-[23%] z-[3]'],['lamp','h-[17%] w-[15%] z-[3]']] as const).map(([key,size])=><div key={key} className={`absolute cursor-move touch-none ${size}`} style={roomStyle(key)} {...roomDragProps(key)}><FurnitureSprite kind={key} id={furniture[key]} className="h-full w-full drop-shadow-xl"/></div>)}

            <div className="absolute bottom-[8%] left-1/2 z-[4] grid -translate-x-1/2 place-items-center">
              <StandingMemberAvatar look={look} size="h-28 w-20 sm:h-44 sm:w-28" />
              <p className="-mt-1 rounded-full border border-white/10 bg-black/70 px-3 py-1 text-[10px] font-bold shadow-lg backdrop-blur sm:text-xs">{data.ownerName}</p>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-zinc-950 p-5">
            <div className="grid grid-cols-3 gap-2">{([ ["room","가구"], ["avatar","아바타"], ["shelf","책장"] ] as const).map(([id,label]) => <button key={id} onClick={() => setTab(id)} className={`rounded-xl px-3 py-2.5 text-sm font-bold ${tab === id ? "bg-amber-400 text-zinc-950" : "bg-white/5 text-zinc-400"}`}>{label}</button>)}</div>
            {tab === "room" && <div className="mt-5 space-y-5"><div className="rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-xs leading-5 text-amber-100/70">방 안의 책장·액자·소파·테이블·의자·조명을 직접 끌어서 배치할 수 있어요.</div>{([['wall','벽',WALL_OPTIONS],['floor','바닥',FLOOR_OPTIONS]] as const).map(([field,label,options])=><fieldset key={field}><legend className="mb-2 text-xs font-bold text-zinc-500">{label}</legend><div className="grid grid-cols-3 gap-2">{options.map((option)=><button key={option.id} onClick={()=>setFurniture((old)=>({...old,[field]:option.id}))} className={`overflow-hidden rounded-xl border p-1.5 ${furniture[field]===option.id?'border-amber-400 bg-amber-400/10':'border-white/10 bg-white/[.03]'}`}><span className="relative block aspect-square overflow-hidden rounded-lg"><Image src={`/hideout/${field === 'wall' ? 'walls' : 'floors'}/${option.id}.png`} alt="" fill className="object-cover"/></span><span className="mt-1 block text-[10px] text-zinc-400">{option.name}</span></button>)}</div></fieldset>)}{ROOM_ITEM_STYLES.map(({field,key,label,options})=><fieldset key={field}><legend className="mb-2 text-xs font-bold text-zinc-500">{label}</legend><div className="grid grid-cols-3 gap-2">{options.map((option)=><button key={option.id} onClick={()=>setFurniture((old)=>({...old,[field]:option.id}))} className={`overflow-hidden rounded-xl border p-1.5 ${furniture[field]===option.id?'border-amber-400 bg-amber-400/10':'border-white/10 bg-white/[.03]'}`}><span className="relative block aspect-square overflow-hidden rounded-lg"><Image src={roomItemAsset(key,option.id)} alt="" fill className="object-contain"/></span><span className="mt-1 block text-[10px] text-zinc-400">{option.name}</span></button>)}</div></fieldset>)}{(Object.keys(FURNITURE) as (keyof typeof FURNITURE)[]).map((kind) => <fieldset key={kind}><legend className="mb-2 text-xs font-bold text-zinc-500">{{chair:"의자",lamp:"조명",rug:"러그",plant:"화분"}[kind]}</legend><div className="grid grid-cols-3 gap-2">{FURNITURE[kind].map((item) => <button key={item.id} onClick={() => setFurniture((old) => ({...old,[kind]:item.id}))} className={`overflow-hidden rounded-xl border p-2 transition ${furniture[kind] === item.id ? "border-amber-400 bg-amber-400/10 shadow-[0_0_22px_rgba(251,191,36,.12)]" : "border-white/10 bg-white/[.03] hover:border-white/25"}`}><FurnitureSprite kind={kind} id={item.id} className="mx-auto aspect-square w-full"/><span className="mt-1 block text-[10px] text-zinc-400 sm:text-[11px]">{item.name}</span></button>)}</div></fieldset>)}</div>}
            {tab === "avatar" && <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-sky-400/20 bg-gradient-to-b from-sky-400/10 to-transparent p-3">
                <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black text-sky-300">직접 위치 맞추기</p><p className="mt-1 text-[10px] text-zinc-500">선택한 파츠를 캐릭터 위에서 끌어 움직이세요.</p></div>{MOVABLE_PARTS.includes(avatarPart as AvatarMovablePart) && <button onClick={() => resetPartPosition(avatarPart as AvatarMovablePart)} className="rounded-lg border border-white/10 px-2 py-1.5 text-[10px] font-bold text-zinc-400">위치 초기화</button>}</div>
                <div className="mt-2 grid min-h-80 place-items-center overflow-visible rounded-xl bg-black/20 px-3 py-3"><StandingMemberAvatar look={look} size="h-72 w-56" editablePart={MOVABLE_PARTS.includes(avatarPart as AvatarMovablePart) ? avatarPart as AvatarMovablePart : undefined} onPositionChange={updatePartPosition}/></div>
                {MOVABLE_PARTS.includes(avatarPart as AvatarMovablePart) && <p className="mt-2 text-center text-[10px] tabular-nums text-zinc-500">위치 X {look.positions?.[avatarPart as AvatarMovablePart]?.x ?? 0} · Y {look.positions?.[avatarPart as AvatarMovablePart]?.y ?? 0}</p>}
              </div>
              <div className="grid grid-cols-3 gap-2">{([['hair','머리'],['expression','표정'],['hat','모자'],['top','상의'],['bottom','하의'],['shoes','신발']] as const).map(([id,label]) => <button key={id} onClick={() => setAvatarPart(id)} className={`rounded-xl px-2 py-2 text-xs font-bold ${avatarPart === id ? 'bg-sky-400 text-zinc-950' : 'bg-white/5 text-zinc-400'}`}>{label}</button>)}</div>
              {(['hair','top','bottom','shoes'] as const).includes(avatarPart as 'hair'|'top'|'bottom'|'shoes') && (() => { const part = avatarPart as 'hair'|'top'|'bottom'|'shoes'; const label = {hair:'머리',top:'상의',bottom:'하의',shoes:'신발'}[part]; const scale = look.scales?.[part] ?? 1; return <div className="rounded-xl bg-white/[.03] p-3"><div className="mb-2 flex items-center justify-between text-xs font-bold"><span className="text-zinc-400">{label} 크기</span><span className="tabular-nums text-sky-300">{Math.round(scale * 100)}%</span></div><input aria-label={`${label} 크기`} type="range" min="60" max="140" step="5" value={Math.round(scale * 100)} onChange={(event) => setLook((old) => ({...old,scales:{...old.scales,[part]:Number(event.target.value) / 100}}))} className="w-full accent-sky-400"/><div className="mt-1 flex justify-between text-[10px] text-zinc-600"><span>작게</span><button type="button" onClick={() => setLook((old) => ({...old,scales:{...old.scales,[part]:1}}))} className="text-zinc-400">기본 크기</button><span>크게</span></div></div>; })()}
              {avatarPart === "hair" && <><div className="grid grid-cols-4 gap-2">{Array.from({length:16},(_,hair) => <button key={hair} onClick={() => setLook((old) => ({...old,hair}))} className={`grid min-h-24 place-items-center rounded-xl bg-white/[.03] p-1 ${look.hair === hair ? "ring-2 ring-amber-400" : "opacity-70"}`}><StandingMemberAvatar look={{...look,hair,hat:0}} size="h-24 w-16"/></button>)}</div><div><p className="mb-2 text-xs font-bold text-zinc-500">머리색</p><div className="grid grid-cols-5 gap-2">{HAIR_COLORS.map((color,index) => <button key={HAIR_COLOR_NAMES[index]} onClick={() => setLook((old) => ({...old,hairColor:index}))} title={HAIR_COLOR_NAMES[index]} className={`aspect-square rounded-full border-2 ${look.hairColor === index ? "border-white" : "border-white/10"}`} style={{background:index===0?"linear-gradient(135deg,#fde68a,#f9a8d4,#7dd3fc)":color}}/>)}</div></div></>}
              {avatarPart === "expression" && <div className="grid grid-cols-4 gap-2">{EXPRESSION_NAMES.map((name,expression) => <button key={name} onClick={() => setLook((old) => ({...old,expression}))} className={`grid place-items-center rounded-xl p-1 ${look.expression === expression ? "ring-2 ring-amber-400" : "opacity-70"}`}><StandingMemberAvatar look={{...look,expression}} size="h-24 w-16"/><span className="text-[10px] text-zinc-500">{name}</span></button>)}</div>}
              {avatarPart === "hat" && <div className="grid grid-cols-3 gap-2">{HAT_OPTIONS.map((hat) => <button key={hat} onClick={() => setLook((old) => ({...old,hat}))} className={`grid min-h-28 place-items-center rounded-xl bg-white/[.03] ${look.hat === hat ? 'ring-2 ring-amber-400' : 'opacity-70'}`}><StandingMemberAvatar look={{...look,hat}} size="h-28 w-20"/><span className="text-[10px] text-zinc-500">{hat===0?'착용 안 함':`${hat}번 모자`}</span></button>)}</div>}
              {(['top','bottom','shoes'] as const).includes(avatarPart as 'top'|'bottom'|'shoes') && <div className="grid grid-cols-4 gap-2">{Array.from({length:16},(_,value) => <button key={value} onClick={() => setLook((old) => ({...old,[avatarPart]:value}))} className={`grid min-h-24 place-items-center rounded-xl bg-white/[.03] p-1 ${look[avatarPart as 'top'|'bottom'|'shoes'] === value ? 'ring-2 ring-amber-400' : 'opacity-70'}`}><StandingMemberAvatar look={{...look,[avatarPart]:value}} size="h-24 w-16"/></button>)}</div>}
            </div>}
            {tab === "shelf" && <div className="mt-5"><p className="text-sm leading-6 text-zinc-400">실제로 플레이한 게임만 전시할 수 있어요. 같은 게임은 한 칸에만 놓을 수 있습니다.</p><div className="mt-4 space-y-3">{shelf.map((value,index) => <label key={index} className="grid grid-cols-[54px_1fr] items-center gap-3"><span className="text-xs font-bold text-zinc-500">{index+1}번 칸</span><select value={value} onChange={(event) => { const next=[...shelf]; next[index]=event.target.value; setShelf(next); }} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-3 text-sm"><option value="">비워두기</option>{data.games.map((game) => <option key={game.id} value={game.id} disabled={shelf.some((id,i) => i !== index && id === game.id)}>{game.name} · {game.playCount}판</option>)}</select></label>)}</div>{!data.games.length && <p className="mt-5 rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-zinc-500">아직 전시할 플레이 기록이 없습니다.</p>}</div>}
          </div>
        </div>
        {message && <p className={`mt-5 rounded-2xl border p-4 text-sm ${message.includes("저장했어요") ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-300" : "border-red-400/20 bg-red-400/5 text-red-300"}`}>{message}</p>}
      </section>
    </main>
  );
}
