type GuideEvent = {
  event_kind: "BOARDGAME" | "MURDER_MYSTERY" | "GENERAL";
  participation_fee: number | null;
};

export const BOARDGAME_EVENT_DESCRIPTION_PRESET = `🎲 정기 모임은 기본적으로 파티·전략·마피아 게임으로 진행되며, 팟 구성이나 룰마에 따라 달라질 수 있습니다.
신입 회원은 우선 정기 모임부터 참가할 수 있어요.

💳 참가비를 먼저 입금한 뒤 웹사이트의 참가 버튼을 눌러 주세요.
국민은행 94849203451 · 예금주 이우영
또는 카카오페이

⏰ 늦게 도착할 예정이라면 댓글에 “늦참”과 도착 예정 시간을 남겨 주세요.

🙋 원하는 게임이 있다면 팟을 만들어 주세요. 자세한 방법은 관련 공지를 확인해 주세요.

⚠️ 입금이 확인되지 않으면 참석이 어려울 수 있습니다.`;

export const MURDER_MYSTERY_EVENT_DESCRIPTION_PRESET = `🎭 머더미스터리 특성상 늦참은 불가능합니다.
5~10분 정도 늦을 경우 GM 또는 운영진에게 필히 알려 주세요.

💳 참가비 13,000원을 먼저 입금한 뒤 웹사이트의 참가 버튼을 눌러 주세요.
국민은행 94849203451 · 예금주 이우영
또는 카카오페이

🤫 원활한 진행을 위해 작품 내용과 역할에 관한 스포일러는 금지됩니다.
이미 플레이한 작품은 일반 참가가 제한될 수 있습니다.

⚠️ 입금이 확인되지 않거나 사전 연락 없이 시작 시간에 늦으면 참석이 어렵습니다.`;

export function getEventGuideSummary(event: GuideEvent) {
  const defaultFee = event.event_kind === "MURDER_MYSTERY" ? 13000 : event.event_kind === "BOARDGAME" ? 10000 : 0;
  const fee = event.participation_fee ?? defaultFee;
  const feeLabel = fee === 0 ? "무료" : `${fee.toLocaleString("ko-KR")}원 선입금`;

  if (event.event_kind === "BOARDGAME") {
    return `🎲 파티·전략·마피아 중심 · 💳 ${feeLabel} 후 웹 참가 · ⏰ 늦참은 댓글 · 🙋 원하는 게임은 팟 만들기`;
  }

  if (event.event_kind === "MURDER_MYSTERY") {
    return `🎭 머더미스터리 특성상 늦참 불가 · 💳 ${feeLabel} 후 웹 참가 · ⏰ 5~10분 지각 시 GM·운영진에게 필히 연락 · 🤫 스포일러 금지`;
  }

  return `📌 이벤트 안내 확인 · 💳 ${feeLabel} 후 웹 참가`;
}
