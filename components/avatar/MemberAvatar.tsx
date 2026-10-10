"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export type AvatarMovablePart = "hair" | "hat" | "top" | "bottom" | "shoes";
export type AvatarPartPosition = { x: number; y: number };

export type MemberAvatarLook = {
  hair: number;
  skin: number;
  hairColor: number;
  expression: number;
  outfit: number;
  accessory: number;
  frame: number;
  top?: number;
  bottom?: number;
  shoes?: number;
  hat?: number;
  positions?: Partial<Record<AvatarMovablePart, AvatarPartPosition>>;
  scales?: Partial<Record<AvatarMovablePart, number>>;
};

export const HAIR_COLORS = [
  "transparent", "#171923", "#7a432f", "#e2b552", "#e76b67",
  "#62a9e8", "#8b65c6", "#65b77b", "#f472b6",
];

export const HAIR_COLOR_NAMES = [
  "기본", "검정", "갈색", "금발", "빨강", "파랑", "보라", "초록", "핑크",
];

export const EXPRESSION_NAMES = [
  "기본", "윙크", "웃음", "놀람", "화남", "울상", "장난", "졸림",
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
];

export default function MemberAvatar({
  look,
  size = "h-12 w-12",
  square = false,
}: {
  look: Partial<MemberAvatarLook>;
  size?: string;
  square?: boolean;
}) {
  const preset = Math.max(0, Math.min(15, Number(look.hair) || 0));
  const face = Math.max(0, Math.min(7, Number(look.expression) || 0));
  const hairColor = Math.max(0, Math.min(HAIR_COLORS.length - 1, Number(look.hairColor) || 0));
  const presetPos = `${((preset % 4) * 100) / 3}% ${(Math.floor(preset / 4) * 100) / 3}%`;

  return (
    <span className={`relative block shrink-0 overflow-hidden bg-gradient-to-br from-sky-300 to-blue-600 ${square ? "rounded-3xl" : "rounded-full"} ${size}`}>
      <span
        className="absolute inset-0 bg-[length:400%_400%] bg-no-repeat"
        style={{ backgroundImage: `url('${expressionAssets[face]}')`, backgroundPosition: presetPos }}
      />
      {hairColor > 0 && (
        <span
          className="absolute inset-0 opacity-90"
          style={{
            backgroundColor: HAIR_COLORS[hairColor],
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

export function StandingMemberAvatar({
  look,
  size = "h-36 w-24",
  editablePart,
  onPositionChange,
}: {
  look: Partial<MemberAvatarLook>;
  size?: string;
  editablePart?: AvatarMovablePart;
  onPositionChange?: (part: AvatarMovablePart, position: AvatarPartPosition) => void;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [drag, setDrag] = useState<{ part: AvatarMovablePart; pointerX: number; pointerY: number; start: AvatarPartPosition } | null>(null);
  const preset = Math.max(0, Math.min(15, Number(look.hair) || 0));
  const hairColor = Math.max(0, Math.min(HAIR_COLORS.length - 1, Number(look.hairColor) || 0));
  const asset = String(preset + 1).padStart(2, "0");
  const top = String(Math.max(0, Math.min(15, Number(look.top) || 0)) + 1).padStart(2, "0");
  const bottom = String(Math.max(0, Math.min(15, Number(look.bottom) || 0)) + 1).padStart(2, "0");
  const shoes = String(Math.max(0, Math.min(15, Number(look.shoes) || 0)) + 1).padStart(2, "0");
  const hat = Math.max(0, Math.min(16, Number(look.hat) || 0));
  const expression = Math.max(0, Math.min(7, Number(look.expression) || 0));
  const positionFor = (part: AvatarMovablePart) => look.positions?.[part] ?? { x: 0, y: 0 };
  const scaleFor = (part: AvatarMovablePart) => Math.max(0.6, Math.min(1.4, look.scales?.[part] ?? 1));
  const layerStyle = (part: AvatarMovablePart) => {
    const position = positionFor(part);
    return { transform: `translate(${(position.x / 384) * 100}%, ${(position.y / 384) * 100}%) scale(${scaleFor(part)})` };
  };
  const dragProps = (part: AvatarMovablePart) => editablePart === part && onPositionChange ? {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ part, pointerX: event.clientX, pointerY: event.clientY, start: positionFor(part) });
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const bounds = rootRef.current?.getBoundingClientRect();
      if (!drag || drag.part !== part || !bounds) return;
      const x = Math.max(-96, Math.min(96, Math.round(drag.start.x + ((event.clientX - drag.pointerX) / bounds.width) * 384)));
      const y = Math.max(-96, Math.min(96, Math.round(drag.start.y + ((event.clientY - drag.pointerY) / bounds.height) * 384)));
      onPositionChange(part, { x, y });
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      setDrag(null);
    },
    onPointerCancel: () => { setDrag(null); },
  } : {};
  const layerClass = (part: AvatarMovablePart) => `absolute inset-0 bg-contain bg-center bg-no-repeat ${editablePart === part ? "z-20 cursor-move touch-none drop-shadow-[0_0_5px_rgba(56,189,248,.9)]" : ""}`;

  return (
    <span ref={rootRef} className={`relative block shrink-0 ${size}`} aria-label="서 있는 멤버 아바타">
      <span className="absolute bottom-[1%] left-1/2 h-[6%] w-[62%] -translate-x-1/2 rounded-full bg-black/35 blur-[2px]" />
      <span aria-hidden="true" className="absolute inset-0 bg-contain bg-center bg-no-repeat drop-shadow-[0_6px_5px_rgba(0,0,0,.55)]" style={{ backgroundImage: "url('/avatars/base/body.png')" }} />
      <span aria-hidden="true" className="absolute inset-0 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url('/avatars/faces/${String(expression + 1).padStart(2, "0")}.png')` }} />
      <span aria-hidden="true" className={layerClass("hair")} style={{ backgroundImage: `url('/avatars/aligned/hair/${asset}.png')`, ...layerStyle("hair") }} {...dragProps("hair")} />
      {hairColor > 0 && <span aria-hidden="true" className={`pointer-events-none absolute inset-0 opacity-85 ${editablePart === "hair" ? "z-[21]" : ""}`} style={{
        backgroundColor: HAIR_COLORS[hairColor],
        WebkitMaskImage: `url('/avatars/aligned/hair/${asset}.png')`, maskImage: `url('/avatars/aligned/hair/${asset}.png')`,
        WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskPosition: "center", maskPosition: "center",
        WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", mixBlendMode: "color", ...layerStyle("hair"),
      }} />}
      <span aria-hidden="true" className={layerClass("bottom")} style={{ backgroundImage: `url('/avatars/aligned/bottoms/${bottom}.png')`, ...layerStyle("bottom") }} {...dragProps("bottom")} />
      <span aria-hidden="true" className={layerClass("top")} style={{ backgroundImage: `url('/avatars/aligned/tops/${top}.png')`, ...layerStyle("top") }} {...dragProps("top")} />
      <span aria-hidden="true" className={layerClass("shoes")} style={{ backgroundImage: `url('/avatars/aligned/shoes/${shoes}.png')`, ...layerStyle("shoes") }} {...dragProps("shoes")} />
      {hat > 0 && <span aria-hidden="true" className={layerClass("hat")} style={{ backgroundImage: `url('/avatars/aligned/hats/${String(hat).padStart(2, "0")}.png')`, ...layerStyle("hat") }} {...dragProps("hat")} />}
    </span>
  );
}
