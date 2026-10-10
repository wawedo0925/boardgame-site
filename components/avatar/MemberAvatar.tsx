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

const OUTFIT_COLORS = [
  ["#5aa7e8", "#2563a8"], ["#ed6b91", "#a92f58"],
  ["#f2b94b", "#a96816"], ["#56b99a", "#25745d"],
  ["#936bd1", "#5b3696"], ["#4b5568", "#202633"],
  ["#e6654f", "#9d3428"], ["#f1f1ed", "#9ca3af"],
] as const;

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
  const outfit = Math.max(0, Math.min(OUTFIT_COLORS.length - 1, Number(look.outfit) || 0));
  const skin = ["#ffd4b8", "#f5bf9f", "#d9956e", "#8d573e"][Math.max(0, Math.min(3, Number(look.skin) || 0))];
  const [shirt, shade] = OUTFIT_COLORS[outfit];

  return (
    <span className={`relative block shrink-0 ${size}`} aria-label="서 있는 멤버 아바타">
      <span className="absolute bottom-[1%] left-1/2 h-[7%] w-[72%] -translate-x-1/2 rounded-full bg-black/35 blur-[2px]" />
      <svg aria-hidden="true" viewBox="0 0 100 150" className="absolute inset-x-0 bottom-0 h-[72%] w-full overflow-visible drop-shadow-[0_5px_4px_rgba(0,0,0,.5)]">
        <path d="M27 50C21 55 17 70 15 88" fill="none" stroke={shade} strokeWidth="13" strokeLinecap="round" />
        <circle cx="14" cy="92" r="7" fill={skin} stroke="#713f32" strokeWidth="2" />
        <path d="M73 50C79 55 83 70 85 88" fill="none" stroke={shade} strokeWidth="13" strokeLinecap="round" />
        <circle cx="86" cy="92" r="7" fill={skin} stroke="#713f32" strokeWidth="2" />
        <path d="M28 42Q50 33 72 42L76 92Q63 101 50 99Q37 101 24 92Z" fill={shirt} stroke="#172033" strokeWidth="3" />
        <path d="M42 40L50 51L58 40" fill="#fffaf1" stroke="#172033" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M50 51V86" stroke={shade} strokeWidth="3" opacity=".65" />
        <path d="M29 91L46 91L44 132L25 132Z" fill="#293753" stroke="#151b2a" strokeWidth="3" strokeLinejoin="round" />
        <path d="M54 91L71 91L75 132L56 132Z" fill="#293753" stroke="#151b2a" strokeWidth="3" strokeLinejoin="round" />
        <path d="M23 128Q34 124 45 131L44 141Q28 145 20 139Z" fill="#4b2f28" stroke="#17131a" strokeWidth="3" />
        <path d="M56 131Q67 124 77 128L80 139Q71 145 56 141Z" fill="#4b2f28" stroke="#17131a" strokeWidth="3" />
        <path d="M30 62Q50 72 70 62" fill="none" stroke="#fff" strokeWidth="2" opacity=".18" />
      </svg>
      <span className="absolute left-1/2 top-0 z-10 -translate-x-1/2 drop-shadow-[0_5px_5px_rgba(0,0,0,.5)]">
        <MemberAvatar look={look} size="h-[4.6rem] w-[4.6rem] sm:h-24 sm:w-24" />
      </span>
    </span>
  );
}
