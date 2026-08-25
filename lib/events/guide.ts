type GuideEvent = {
  event_kind: "BOARDGAME" | "MURDER_MYSTERY" | "GENERAL";
  participation_fee: number | null;
};

export function getEventGuideSummary(event: GuideEvent) {
  const defaultFee = event.event_kind === "MURDER_MYSTERY" ? 13000 : event.event_kind === "BOARDGAME" ? 10000 : 0;
  const fee = event.participation_fee ?? defaultFee;
  const feeLabel = fee === 0 ? "무료" : `${fee.toLocaleString("ko-KR")}원 선입금`;

  if (event.event_kind === "BOARDGAME") {
    return `🎲 파티·전략·마피아 중심 · 💳 ${feeLabel} 후 웹 참가 · ⏰ 늦참은 댓글 · 🙋 원하는 게임은 팟 만들기`;
  }

  return `📌 이벤트 안내 확인 · 💳 ${feeLabel} 후 웹 참가 · ⏰ 늦참은 댓글로 알려 주세요`;
}
