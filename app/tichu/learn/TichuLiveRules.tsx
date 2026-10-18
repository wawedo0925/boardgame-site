"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import styles from "./live-rules.module.css";

const lessons = [
  { title: "마주 앉으면, 같은 팀", tag: "TEAM", text: "티츄는 네 명이 두 팀으로 즐깁니다. 맞은편 파트너와 한 팀이 되어 손의 카드를 먼저 비우세요.", tip: "같은 팀이어도 손패를 서로 보여주지 않습니다." },
  { title: "여덟 장을 먼저 확인해요", tag: "DEAL", text: "일반 카드 52장과 특수 카드 4장, 총 56장을 사용합니다. 먼저 8장을 확인하고 라지 티츄 선언 여부를 정해요.", tip: "라지 티츄는 아홉 번째 카드를 보기 전 선언합니다. 본인이 1등하면 +200점, 실패하면 −200점." },
  { title: "여섯 장을 더 받아요", tag: "HAND", text: "나머지 6장을 받으면 각자 14장. 같은 숫자나 이어지는 숫자가 있는지 살펴보세요.", tip: "이번 시연에서는 라지 티츄를 선언하지 않고 진행합니다." },
  { title: "세 사람에게 한 장씩", tag: "EXCHANGE", text: "왼쪽 상대, 맞은편 파트너, 오른쪽 상대에게 줄 카드를 한 장씩 고르세요. 다른 사람도 나에게 한 장씩 보냅니다.", tip: "보낼 3장을 먼저 결정한 뒤 받은 카드를 확인합니다. 교환이 끝나도 손패는 14장입니다." },
  { title: "참새를 가진 내가 선", tag: "LEAD", text: "참새를 가진 사람이 첫 트릭을 시작합니다. 여기서는 7 한 장을 내볼게요. 아래 손패에서 7을 선택하세요.", tip: "참새를 가지고 시작하지만, 첫 카드로 반드시 참새를 낼 필요는 없어요." },
  { title: "더 높은 싱글로 이어가요", tag: "PLAY", text: "내 7 위에 오른쪽 상대가 9를 냈습니다. 파트너와 왼쪽 상대는 패스했어요. 이제 9보다 높은 싱글을 골라 내세요.", tip: "일반 조합은 같은 종류와 장수로 더 높게 냅니다. 폭탄은 예외예요. 이 연습에서는 특수 카드와 폭탄을 사용하지 않습니다." },
  { title: "세 번의 패스, 내 트릭!", tag: "TRICK", text: "다른 세 사람이 차례대로 패스했습니다. 마지막으로 가장 높은 카드를 낸 내가 이번 트릭을 가져가고, 다음 트릭을 시작해요.", tip: "한 번 패스했다고 트릭에서 빠지는 것은 아닙니다. 트릭이 계속되면 자기 차례에 다시 낼 수 있어요." },
  { title: "첫 트릭을 마쳤어요", tag: "READY", text: "팀 배치, 카드 받기, 교환, 카드 내기까지 완료! 이제 실제 게임의 흐름을 익힐 준비가 됐어요.", tip: "이 체험은 기본 진행 입문입니다. 전체 게임에는 조합, 특수 카드, 티츄 선언과 점수 계산도 적용됩니다." },
];

type Card = { id: string; rank: string; suit: number };
const ranks = ["참새", "2", "4", "5", "7", "8", "9", "J", "Q", "K", "A", "3", "6", "10"];
const initialHand: Card[] = ranks.map((rank, i) => ({ id: `h${i}`, rank, suit: i % 4 }));
const received: Card[] = [{ id: "r0", rank: "2", suit: 3 }, { id: "r1", rank: "Q", suit: 1 }, { id: "r2", rank: "6", suit: 2 }];
const symbols = ["◆", "✦", "●", "▲"];
const players = ["나", "오른쪽 상대", "파트너", "왼쪽 상대"];
const recipients = ["왼쪽 상대", "파트너", "오른쪽 상대"];

function CardFace({ card }: { card: Card }) {
  return <span className={styles.cardFace} data-suit={card.suit}><span>{card.rank === "참새" ? "1" : card.rank}</span><b aria-hidden="true">{card.rank === "참새" ? "雀" : symbols[card.suit]}</b><small>{card.rank === "참새" ? "참새" : "TICHU"}</small></span>;
}

export default function TichuLiveRules() {
  const [step, setStep] = useState(0);
  const [hand, setHand] = useState(initialHand);
  const [chosen, setChosen] = useState<string[]>([]);
  const [exchanged, setExchanged] = useState(false);
  const [played, setPlayed] = useState<Card | null>(null);
  const [message, setMessage] = useState("");
  const [flat, setFlat] = useState(false);
  const [angle, setAngle] = useState(0);
  const lesson = lessons[step];
  const ready = step === 3 ? exchanged : step === 4 || step === 5 ? played !== null : true;
  const visibleHand = step === 0 ? [] : step === 1 ? hand.slice(0, 8) : hand;
  const tableCards: Card[] = step === 4 && played ? [played] : step === 5 ? [{ id: "lead", rank: "7", suit: 0 }, { id: "reply", rank: "9", suit: 1 }, ...(played ? [played] : [])] : [];

  function reset() {
    setStep(0); setHand(initialHand); setChosen([]); setExchanged(false); setPlayed(null); setMessage("");
  }
  function next() {
    if (!ready || step === lessons.length - 1) return;
    setStep(step + 1); setPlayed(null); setMessage("");
  }
  function select(card: Card) {
    if (step === 3 && !exchanged) {
      // Keep the opening example deterministic and teach the sparrow in the next scene.
      if (card.rank === "참새" || card.rank === "7" || card.rank === "A") {
        setMessage("이번 연습에서는 참새·7·A를 남겨 주세요. 나머지 카드 중 3장을 자유롭게 고를 수 있어요."); return;
      }
      setChosen(chosen.includes(card.id) ? chosen.filter(id => id !== card.id) : chosen.length < 3 ? [...chosen, card.id] : chosen);
      setMessage(""); return;
    }
    if (played) return;
    if (step === 4 || step === 5) {
      const value = ({ J: 11, Q: 12, K: 13, A: 14 } as Record<string, number>)[card.rank] ?? Number(card.rank);
      if (step === 4 ? card.rank !== "7" : !(value > 9)) {
        setMessage(step === 4 ? "첫 시연은 7 한 장으로 시작해요. 7을 골라 주세요." : "9보다 높은 싱글이 필요해요. 10, J, Q, K, A 중 손에 있는 카드를 골라 보세요."); return;
      }
      setPlayed(card); setHand(hand.filter(c => c.id !== card.id));
      setMessage(step === 4 ? "좋아요! 7 한 장으로 첫 트릭을 시작했습니다." : `${card.rank}을 냈어요! 9보다 높은 싱글입니다. 다음 단계에서 트릭을 가져가세요.`);
    }
  }
  function exchange() {
    if (chosen.length !== 3 || exchanged) return;
    setHand([...hand.filter(c => !chosen.includes(c.id)), ...received]);
    setExchanged(true); setChosen([]); setMessage("교환 완료! 2 · Q · 6을 받았어요. 손패는 다시 14장입니다.");
  }

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/tichu">← 티츄 놀이터</Link><span>BOARD LOUNGE / LIVE RULES</span><button onClick={reset}>처음부터 ↺</button></header>
    <div className={styles.intro}><div><p className={styles.eyebrow}>보고, 움직이고, 이해하는</p><h1>티츄 <em>라이브 룰</em></h1></div><p>4인 · 2 대 2 팀전<br/>기본 세팅과 첫 트릭 체험</p></div>
    <div className={styles.layout}>
      <section className={styles.stage} aria-label="티츄 입체 테이블">
        <div className={styles.stageToolbar}><span><i/> {lesson.tag} <small>학습용 예시 배치</small></span><button onClick={() => setFlat(!flat)} aria-pressed={flat}>{flat ? "입체로 보기" : "위에서 보기"}</button></div>
        <div className={styles.scene}>
          <div className={styles.table} style={{ transform: `rotateX(${flat ? 0 : 28}deg) rotateZ(${angle}deg)` }}>
            <div className={styles.rim}/><div className={styles.tableMark}>TICHU<span>BOARD LOUNGE</span></div>
            {players.map((name, i) => <div key={name} className={`${styles.seat} ${styles[`seat${i}`]}`} data-team={i % 2 === 0 ? "ours" : "theirs"}>
              <span className={styles.avatar}>{i === 0 ? "나" : i === 2 ? "팀" : "상대"}</span><strong>{name}</strong><small>{step === 0 ? i % 2 === 0 ? "우리 팀" : "상대 팀" : `${i === 0 ? visibleHand.length : step === 1 ? 8 : (i === 1 && step >= 5 ? 13 : 14)}장`}</small>
              {step > 0 && i !== 0 && <div className={styles.fan} aria-hidden="true">{Array.from({length: 5}, (_, j) => <span key={j} style={{ "--fan": j - 2 } as CSSProperties}>✦</span>)}</div>}
              {step === 5 && (i === 2 || i === 3) && <span className={styles.pass}>패스</span>}
              {step === 6 && i !== 0 && <span className={styles.pass}>패스</span>}
            </div>)}
            <div className={styles.center} key={step}>
              {step <= 2 && <div className={styles.deck}>✦<small>{step === 0 ? "56 CARDS" : step === 1 ? "나머지 6장씩" : "준비 완료"}</small></div>}
              {step === 3 && <div className={styles.exchangeArrows}>{exchanged ? "✓" : "↖  ↑  ↗"}<small>{exchanged ? "교환 완료" : "각자에게 1장씩"}</small></div>}
              {tableCards.map(c => <div className={styles.tableCard} key={c.id}><CardFace card={c}/></div>)}
              {step === 4 && !played && <div className={styles.prompt}>내가 첫 시작<small>손패의 7을 눌러 보세요</small></div>}
              {step === 6 && <div className={styles.won}>✦<strong>트릭 획득</strong><small>다음 선도 나!</small></div>}
              {step === 7 && <div className={styles.prompt}>잘했어요!<small>다음에는 실제 플레이로</small></div>}
            </div>
          </div>
        </div>
        <div className={styles.viewControl}><label>테이블 회전 <input aria-label="테이블 회전" type="range" min="-18" max="18" value={angle} onChange={e => setAngle(Number(e.target.value))}/></label><button onClick={() => {setAngle(0); setFlat(false);}}>시점 초기화</button></div>
        <div className={styles.handArea}><div className={styles.handTitle}><strong>{step === 0 ? "마주 보는 두 사람이 한 팀이에요" : "내 손패"}</strong><span>{step === 3 && !exchanged ? `교환할 카드 ${chosen.length}/3` : step > 0 ? `${visibleHand.length}장` : "우리 팀 · 민트 / 상대 팀 · 코랄"}</span></div>
          <div className={styles.hand}>{visibleHand.map(card => <button key={card.id} className={styles.handCard} aria-label={`${card.rank} ${symbols[card.suit]}${chosen.includes(card.id) ? `, ${recipients[chosen.indexOf(card.id)]}에게 보냄` : ""}`} aria-pressed={chosen.includes(card.id)} disabled={!((step === 3 && !exchanged) || ((step === 4 || step === 5) && !played))} onClick={() => select(card)}><CardFace card={card}/>{chosen.includes(card.id) && <span className={styles.recipient}>{recipients[chosen.indexOf(card.id)]}</span>}</button>)}</div>
        </div>
      </section>
      <aside className={styles.lesson}>
        <div className={styles.progress}><span>STEP {String(step + 1).padStart(2, "0")}</span><span>{step + 1} / {lessons.length}</span></div>
        <div className={styles.progressBars}>{lessons.map((_, i) => <span key={i} data-active={i <= step}/>)}</div>
        <div className={styles.lessonBody} key={step}><span className={styles.lessonTag}>{lesson.tag}</span><h2>{lesson.title}</h2><p>{lesson.text}</p><div className={styles.tip}><strong>기억해 두세요</strong><p>{lesson.tip}</p></div>
          {step === 3 && !exchanged && <p className={styles.note}>연습 진행을 위해 참새·7·A는 남겨 둡니다. 선택 순서대로 왼쪽 상대 → 파트너 → 오른쪽 상대에게 보내요.</p>}
          <p className={styles.feedback} role="status" aria-live="polite">{message}</p>
        </div>
        <div className={styles.actions}>{step === 3 && !exchanged ? <button className={styles.primary} disabled={chosen.length !== 3} onClick={exchange}>선택한 3장 교환하기 →</button> : step === 7 ? <Link className={styles.primary} href="/tichu">티츄 놀이터로 →</Link> : <button className={styles.primary} disabled={!ready} onClick={next}>{!ready ? "손패에서 카드를 골라 주세요" : step === 0 ? "테이블에 앉기 →" : "다음 단계 →"}</button>}<button className={styles.secondary} onClick={reset}>처음부터 다시 배우기</button></div>
      </aside>
    </div>
    <footer className={styles.footer}><span>입문 체험 · 자체 제작한 카드 도형 · AI 호출 없음</span><a href="https://www.riograndegames.com/wp-content/uploads/2013/02/Tichu-Rules.pdf" target="_blank" rel="noreferrer">기준 규칙: Rio Grande Games 공식 규칙서 ↗</a></footer>
  </main>;
}
