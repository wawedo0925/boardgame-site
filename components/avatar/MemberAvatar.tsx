"use client";

export type MemberAvatarLook = {
  hair: number;
  skin: number;
  hairColor: number;
  expression: number;
  outfit: number;
  accessory: number;
  frame: number;
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
}: {
  look: Partial<MemberAvatarLook>;
  size?: string;
}) {
  const preset = Math.max(0, Math.min(15, Number(look.hair) || 0));
  const hairColor = Math.max(0, Math.min(HAIR_COLORS.length - 1, Number(look.hairColor) || 0));
  const asset = String(preset + 1).padStart(2, "0");

  return (
    <span className={`relative block shrink-0 ${size}`} aria-label="서 있는 멤버 아바타">
      <span className="absolute bottom-[1%] left-1/2 h-[6%] w-[62%] -translate-x-1/2 rounded-full bg-black/35 blur-[2px]" />
      <span aria-hidden="true" className="absolute inset-0 bg-contain bg-center bg-no-repeat drop-shadow-[0_6px_5px_rgba(0,0,0,.55)]" style={{ backgroundImage: `url('/avatars/full/${asset}.png')` }} />
      {hairColor > 0 && <span aria-hidden="true" className="absolute inset-0 opacity-85" style={{
        backgroundColor: HAIR_COLORS[hairColor],
        WebkitMaskImage: `url('/avatars/hair/${asset}.png')`, maskImage: `url('/avatars/hair/${asset}.png')`,
        WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskPosition: "center", maskPosition: "center",
        WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", mixBlendMode: "color",
      }} />}
    </span>
  );
}
