export type HalfNightPart = "BOTH" | "FIRST" | "SECOND";
export const HALF_NIGHT_DESCRIPTION = `🌙 반나잇은 총 6시간, 1부와 2부로 나누어 진행합니다.
1부는 시작부터 3시간, 2부는 시작 3시간 후부터 3시간 진행합니다.
예: 19:20 시작 → 1부 19:20~22:20 / 2부 22:20~다음 날 01:20

💳 1부·2부 모두 참여: 20,000원
1부만 참여: 10,000원 / 2부만 참여: 10,000원
참여할 부의 금액을 입금한 뒤 참가 버튼에서 선택해 주세요.
국민은행 94849203451 · 예금주 이우영`;

export function halfNightTitle(date: string, volume?: number) {
  const day = new Date(`${date}T12:00:00+09:00`).getUTCDay();
  const name = day === 5 ? "불금" : day === 6 ? "불토" : "보드게임";
  return `[반나잇] ${name}${volume ? ` Vol.${volume}` : ""}`;
}

export function halfNightPartLabel(part?: HalfNightPart | null) {
  return part === "FIRST" ? "1부" : part === "SECOND" ? "2부" : "";
}

export function halfNightSchedule(startedAt: string) {
  const start = new Date(startedAt).getTime();
  const format = (offset: number) => new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(start + offset * 3600000));
  return { first: `${format(0)} ~ ${format(3)}`, second: `${format(3)} ~ ${format(6)}` };
}
