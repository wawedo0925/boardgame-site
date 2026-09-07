export type HomeContent = { eyebrow: string; title: string; description: string };

export const defaultHomeContent: HomeContent = {
  eyebrow: "BOARD GAME COMMUNITY",
  title: "함께 플레이하고\n우리의 게임을\n기록합니다.",
  description: "보드라운지는 와위두에서 만나는 보드게임 커뮤니티입니다. 이벤트에 참여하고, 플레이 기록과 평가를 남겨보세요.",
};

export function validateHomeContent(value: HomeContent) {
  if (!value.eyebrow.trim() || value.eyebrow.length > 80) return "소제목은 1~80자로 입력해 주세요.";
  if (!value.title.trim() || value.title.length > 200) return "큰 제목은 1~200자로 입력해 주세요.";
  if (!value.description.trim() || value.description.length > 1000) return "소개글은 1~1,000자로 입력해 주세요.";
  return null;
}
