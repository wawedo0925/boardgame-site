"use client";

import { useEffect } from "react";

const clean = (value: string | null) => (value ?? "").replace(/\s+/g, "").trim();

function findCard(label: string) {
  const heading = Array.from(
    document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, strong"),
  ).find((element) => clean(element.textContent).includes(clean(label)));

  if (!heading) return null;

  const semantic = heading.closest<HTMLElement>("section, article");
  if (semantic) return semantic;

  let current = heading.parentElement;
  while (current && current !== document.body) {
    const style = getComputedStyle(current);
    if (parseFloat(style.borderRadius) >= 8 && current.offsetHeight >= 80) return current;
    current = current.parentElement;
  }

  return heading.parentElement;
}

function addCollapser(card: HTMLElement | null, label: string) {
  if (!card || card.dataset.compactReady === "true") return;
  card.dataset.compactReady = "true";
  card.classList.add("eventCompactCard", "isCollapsed");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "eventCompactToggle";
  button.textContent = "+ 더보기";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", `${label} 전체 보기`);
  button.addEventListener("click", () => {
    const collapsed = card.classList.toggle("isCollapsed");
    button.textContent = collapsed ? "+ 더보기" : "− 접기";
    button.setAttribute("aria-expanded", String(!collapsed));
  });
  card.appendChild(button);
}

function makeAttendanceGrid(card: HTMLElement | null) {
  if (!card) return;
  const statusLabels = new Set(["신청", "출석", "불참"]);
  const buttons = Array.from(card.querySelectorAll<HTMLButtonElement>("button")).filter((button) =>
    statusLabels.has(clean(button.textContent)),
  );
  if (!buttons.length) return;

  const rows = new Set<HTMLElement>();
  for (const button of buttons) {
    let current = button.parentElement;
    while (current && current !== card) {
      const count = Array.from(current.querySelectorAll("button")).filter((candidate) =>
        statusLabels.has(clean(candidate.textContent)),
      ).length;
      if (count >= 3) {
        rows.add(current);
        break;
      }
      current = current.parentElement;
    }
  }

  const rowList = Array.from(rows);
  if (rowList.length < 2) return;
  const parent = rowList[0].parentElement;
  if (!parent || !rowList.every((row) => row.parentElement === parent)) return;
  parent.classList.add("attendanceMemberGrid");
  rowList.forEach((row) => row.classList.add("attendanceMemberItem"));
}

function pairCards(first: HTMLElement | null, second: HTMLElement | null) {
  if (!first || !second || first.dataset.quickPaired === "true") return;
  if (!first.parentElement || first.parentElement !== second.parentElement) return;

  const wrapper = document.createElement("div");
  wrapper.className = "eventQuickPair";
  first.parentElement.insertBefore(wrapper, first);
  wrapper.append(first, second);
  first.dataset.quickPaired = "true";
  second.dataset.quickPaired = "true";
}

export default function EventPageLayoutEnhancer() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const enhance = () => {
      const guide = findCard("이벤트 안내");
      const attendance = findCard("이벤트 출석");
      const status = findCard("이벤트 진행 중") ?? findCard("이벤트 마감 완료");
      const notice = findCard("참가자 공지");

      addCollapser(guide, "이벤트 안내");
      addCollapser(attendance, "이벤트 출석");
      makeAttendanceGrid(attendance);
      pairCards(status, notice);
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(enhance, 80);
    };

    enhance();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <style jsx global>{`
      .eventCompactCard {
        position: relative !important;
        transition: max-height 0.25s ease;
      }
      .eventCompactCard.isCollapsed {
        max-height: 190px !important;
        overflow: hidden !important;
        padding-bottom: 58px !important;
      }
      .eventCompactCard.isCollapsed::after {
        content: "";
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        height: 64px;
        pointer-events: none;
        background: linear-gradient(transparent, rgba(9, 10, 11, 0.98) 68%);
      }
      .eventCompactToggle {
        position: absolute;
        z-index: 3;
        right: 22px;
        bottom: 16px;
        min-height: 34px;
        padding: 7px 13px;
        border: 1px solid #3a3a3a;
        border-radius: 999px;
        background: #202124;
        color: #fff;
        font-weight: 800;
        cursor: pointer;
      }
      .attendanceMemberGrid {
        display: grid !important;
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        gap: 10px !important;
      }
      .attendanceMemberGrid > .attendanceMemberItem {
        min-width: 0 !important;
        margin: 0 !important;
      }
      .attendanceMemberItem {
        display: flex !important;
        flex-wrap: wrap !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 8px !important;
      }
      .eventQuickPair {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        width: 100%;
      }
      .eventQuickPair > * {
        width: 100% !important;
        margin: 0 !important;
      }
      @media (max-width: 1050px) {
        .attendanceMemberGrid {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
      }
      @media (max-width: 700px) {
        .eventQuickPair,
        .attendanceMemberGrid {
          grid-template-columns: 1fr !important;
        }
        .eventCompactCard.isCollapsed {
          max-height: 170px !important;
        }
        .eventCompactToggle {
          right: 14px;
          bottom: 12px;
        }
      }
    `}</style>
  );
}
