export const MURDER_QUESTIONS = [
  { key: "culprit", label: "범인 역할", question: "범인이 되어 정체를 숨기고 거짓말하는 역할도 좋아요." },
  { key: "acting", label: "역할 연기", question: "캐릭터에 몰입해서 감정이나 말투를 표현하는 게 좋아요." },
  { key: "deduction", label: "추리 중심", question: "단서를 분석하고 사건의 진상을 밝혀내는 게 좋아요." },
  { key: "suspected", label: "의심받는 역할", question: "범인이 아니어도 강하게 의심받으며 해명하는 역할이 좋아요." },
  { key: "support", label: "조력자 역할", question: "다른 인물의 목표를 돕거나 누군가를 보호하는 역할이 좋아요." },
  { key: "objective", label: "개인 목표", question: "범인을 찾는 것 외에, 나만의 비밀 목표를 달성하는 것도 좋아요." },
  { key: "leading", label: "토론 주도", question: "사람들에게 먼저 질문하고 토론을 이끄는 역할이 좋아요." },
] as const;
export const MURDER_CHOICES = { like: "좋아요", neutral: "상관없어요", avoid: "피하고 싶어요", unsure: "아직 모르겠어요" } as const;
export type MurderAnswers = Record<(typeof MURDER_QUESTIONS)[number]["key"], keyof typeof MURDER_CHOICES>;
export function completeMurderAnswers(value: Partial<MurderAnswers>): value is MurderAnswers {
  return MURDER_QUESTIONS.every(q => Object.hasOwn(MURDER_CHOICES, value[q.key] ?? ""));
}
