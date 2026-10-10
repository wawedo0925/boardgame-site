"use client";

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
  const top = String(Math.max(0, Math.min(15, Number(look.top) || 0)) + 1).padStart(2, "0");
  const bottom = String(Math.max(0, Math.min(15, Number(look.bottom) || 0)) + 1).padStart(2, "0");
  const shoes = String(Math.max(0, Math.min(15, Number(look.shoes) || 0)) + 1).padStart(2, "0");
  const hat = Math.max(0, Math.min(16, Number(look.hat) || 0));
  const expression = Math.max(0, Math.min(7, Number(look.expression) || 0));
  const face = [
    <><ellipse key="l" cx="160" cy="105" rx="15" ry="20"/><ellipse key="r" cx="224" cy="105" rx="15" ry="20"/><path key="m" d="M181 139Q192 148 203 139"/></>,
    <><path key="l" d="M145 106Q160 94 175 106"/><ellipse key="r" cx="224" cy="105" rx="15" ry="20"/><path key="m" d="M183 139Q192 146 201 139"/></>,
    <><path key="l" d="M145 105Q160 119 175 105"/><path key="r" d="M209 105Q224 119 239 105"/><path key="m" d="M178 137Q192 157 206 137Z"/></>,
    <><ellipse key="l" cx="160" cy="105" rx="17" ry="22"/><ellipse key="r" cx="224" cy="105" rx="17" ry="22"/><ellipse key="m" cx="192" cy="143" rx="7" ry="10"/></>,
    <><path key="b1" d="M143 85L176 94"/><path key="b2" d="M241 85L208 94"/><ellipse key="l" cx="160" cy="108" rx="14" ry="18"/><ellipse key="r" cx="224" cy="108" rx="14" ry="18"/><path key="m" d="M181 147Q192 137 203 147"/></>,
    <><path key="b1" d="M145 91Q160 82 175 91"/><path key="b2" d="M209 91Q224 82 239 91"/><ellipse key="l" cx="160" cy="108" rx="14" ry="18"/><ellipse key="r" cx="224" cy="108" rx="14" ry="18"/><path key="m" d="M181 148Q192 138 203 148"/></>,
    <><ellipse key="l" cx="160" cy="105" rx="15" ry="20"/><path key="r" d="M209 106Q224 94 239 106"/><path key="m" d="M181 139Q192 149 203 139"/><path key="t" d="M194 145Q202 153 207 143"/></>,
    <><path key="l" d="M145 107Q160 116 175 107"/><path key="r" d="M209 107Q224 116 239 107"/><path key="m" d="M184 141Q192 145 200 141"/></>,
  ][expression];

  return (
    <span className={`relative block shrink-0 ${size}`} aria-label="서 있는 멤버 아바타">
      <span className="absolute bottom-[1%] left-1/2 h-[6%] w-[62%] -translate-x-1/2 rounded-full bg-black/35 blur-[2px]" />
      <span aria-hidden="true" className="absolute inset-0 bg-contain bg-center bg-no-repeat drop-shadow-[0_6px_5px_rgba(0,0,0,.55)]" style={{ backgroundImage: "url('/avatars/base/body.png')" }} />
      <span aria-hidden="true" className="absolute inset-0 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url('/avatars/hair/${asset}.png')` }} />
      {hairColor > 0 && <span aria-hidden="true" className="absolute inset-0 opacity-85" style={{
        backgroundColor: HAIR_COLORS[hairColor],
        WebkitMaskImage: `url('/avatars/hair/${asset}.png')`, maskImage: `url('/avatars/hair/${asset}.png')`,
        WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskPosition: "center", maskPosition: "center",
        WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", mixBlendMode: "color",
      }} />}
      <svg aria-hidden="true" viewBox="0 0 384 384" className="absolute inset-0 h-full w-full fill-[#2d2230] stroke-[#2d2230] stroke-[5] [stroke-linecap:round] [stroke-linejoin:round]">
        {face}
        <circle cx="154" cy="99" r="4" className="fill-white stroke-none"/><circle cx="218" cy="99" r="4" className="fill-white stroke-none"/>
      </svg>
      <span aria-hidden="true" className="absolute inset-0 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url('/avatars/bottoms/${bottom}.png')` }} />
      <span aria-hidden="true" className="absolute inset-0 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url('/avatars/tops/${top}.png')` }} />
      <span aria-hidden="true" className="absolute inset-0 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url('/avatars/shoes/${shoes}.png')` }} />
      {hat > 0 && <span aria-hidden="true" className="absolute inset-0 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url('/avatars/hats/${String(hat).padStart(2, "0")}.png')` }} />}
    </span>
  );
}
