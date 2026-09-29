"use client";

import {useState,type ReactNode} from "react";

function Info({children,tone="sky"}:{children:ReactNode;tone?:"sky"|"pink"|"amber"|"violet"}){
 const color={sky:"border-sky-300/30 bg-sky-300/10",pink:"border-pink-300/30 bg-pink-300/10",amber:"border-amber-300/30 bg-amber-300/10",violet:"border-violet-300/30 bg-violet-300/10"}[tone];
 return <div className={`rounded-2xl border p-3 ${color}`}>{children}</div>;
}

const titles=["처음 오셨나요?","게임의 목표","낼 수 있는 카드 조합","네 장의 특수 카드","한 라운드 진행 순서","티츄 선언과 점수","직접 풀어보기"];

export default function TichuTutorial({onClose}:{onClose:()=>void}){
 const[step,setStep]=useState(0),[answer,setAnswer]=useState<number|null>(null);
 return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-3" onClick={onClose}>
  <section className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-sky-300/20 bg-zinc-950 shadow-2xl" onClick={e=>e.stopPropagation()}>
   <header className="flex items-start gap-3 border-b border-white/10 p-5"><button onClick={onClose} className="shrink-0 rounded-xl border border-white/10 px-3 py-2 text-zinc-400" aria-label="튜토리얼 닫기">✕</button><div><p className="text-xs font-black tracking-[.25em] text-sky-300">3분 티츄 튜토리얼</p><h2 className="mt-1 text-2xl font-black">{titles[step]}</h2></div></header>
   <div className="min-h-0 flex-1 overflow-y-auto p-5 text-sm leading-6 text-zinc-300">
    {step===0&&<div className="space-y-4 text-center"><div className="text-6xl">🀄</div><p className="text-lg font-bold text-white">처음이어도 괜찮아요!</p><p>팀 구성부터 카드 내는 법, 특수 카드와 티츄 선언까지 핵심만 빠르게 알려드릴게요.</p><Info><b className="text-sky-300">언제든 다시 보기</b><p className="text-xs text-zinc-400">방 목록 화면의 ‘게임 방법’ 버튼으로 다시 열 수 있습니다.</p></Info></div>}
    {step===1&&<div className="space-y-3"><Info><b className="text-sky-300">2 대 2 팀전</b><p>마주 보는 두 사람이 같은 팀입니다. 내 손의 카드를 먼저 모두 내는 것이 목표예요.</p></Info><Info tone="pink"><b className="text-pink-300">라운드 종료</b><p>세 명이 카드를 모두 내면 끝납니다. 같은 팀 두 명이 1·2등이면 카드 점수 대신 200점을 얻어요.</p></Info><Info tone="amber"><b className="text-amber-300">점수 카드</b><p>5는 5점, 10과 K는 10점, 용은 +25점, 봉황은 -25점입니다.</p></Info></div>}
    {step===2&&<div className="space-y-3"><div className="grid grid-cols-2 gap-2">{[["싱글","7"],["페어","9 · 9"],["트리플","Q · Q · Q"],["풀하우스","5 · 5 · K · K · K"],["스트레이트","3 · 4 · 5 · 6 · 7"],["연속 페어","4·4 · 5·5 · 6·6"]].map(([name,cards])=><Info key={name}><b className="text-white">{name}</b><p className="text-xs text-sky-300">{cards}</p></Info>)}</div><Info tone="amber"><b className="text-amber-300">폭탄</b><p>같은 숫자 4장 또는 같은 문양의 5장 이상 스트레이트입니다. 다른 사람 차례에도 낼 수 있어요.</p></Info><p className="text-xs text-zinc-500">앞사람과 같은 종류·같은 장수로 더 높은 조합을 내고, 낼 수 없거나 아끼고 싶으면 패스합니다.</p></div>}
    {step===3&&<div className="grid gap-2 sm:grid-cols-2"><Info tone="amber"><b className="text-amber-300">참새 · 1</b><p>참새를 낼 때 2~A 중 하나를 소원합니다. 그 숫자를 낼 수 있는 사람은 반드시 포함해야 하고, 누군가 낼 때까지 소원은 계속돼요.</p></Info><Info><b className="text-sky-300">개</b><p>새 트릭을 시작할 때만 냅니다. 차례가 맞은편 팀원에게 바로 넘어갑니다.</p></Info><Info tone="violet"><b className="text-violet-300">봉황 · -25점</b><p>조합의 조커로 쓰거나 싱글에서 직전 카드보다 0.5 높게 냅니다. 폭탄에는 쓸 수 없어요.</p></Info><Info tone="pink"><b className="text-pink-300">용 · +25점</b><p>가장 높은 싱글입니다. 용으로 트릭을 먹으면 그 트릭을 상대 한 명에게 줍니다.</p></Info></div>}
    {step===4&&<ol className="space-y-2">{["처음 받은 8장을 보고 라지 티츄 선언 여부를 정한 뒤, 나머지 6장을 받습니다.","다른 세 사람에게 카드 한 장씩, 총 3장을 교환합니다.","참새를 가진 사람이 첫 트릭을 시작합니다.","차례대로 더 높은 같은 조합을 내거나 패스합니다.","모두 패스하면 마지막으로 카드를 낸 사람이 트릭을 가져가고 새로 시작합니다.","세 명이 손패를 비우면 점수를 계산하고 다음 라운드로 갑니다."].map((text,i)=><li key={text} className="flex gap-3 rounded-xl bg-white/[.04] p-3"><b className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-300 text-zinc-950">{i+1}</b><span>{text}</span></li>)}</ol>}
    {step===5&&<div className="space-y-3"><Info tone="amber"><b className="text-amber-300">라지 티츄 · ±200점</b><p>처음 받은 8장을 본 뒤 선언합니다. 선언자가 1등이면 +200점, 실패하면 -200점이에요.</p></Info><Info tone="violet"><b className="text-violet-300">스몰 티츄 · ±100점</b><p>자신의 첫 카드를 내기 전까지 선언할 수 있습니다. 1등이면 +100점, 실패하면 -100점이에요.</p></Info><p className="rounded-xl bg-red-500/10 p-3 text-xs text-red-200">팀이 이겨도 선언한 본인이 1등이 아니면 선언은 실패합니다.</p></div>}
    {step===6&&<div className="space-y-4"><Info><b className="text-white">문제</b><p>싱글 7이 나와 있습니다. 다음 중 정상적으로 낼 수 있는 카드는?</p></Info><div className="grid grid-cols-3 gap-2">{["5","9","10·10"].map((text,i)=><button key={text} onClick={()=>setAnswer(i)} className={`rounded-2xl border p-5 text-2xl font-black ${answer===i?i===1?"border-emerald-300 bg-emerald-300/15 text-emerald-200":"border-red-300 bg-red-300/10 text-red-200":"border-white/10 bg-white/[.04]"}`}>{text}</button>)}</div>{answer!==null&&<p className={`rounded-xl p-3 text-center font-bold ${answer===1?"bg-emerald-400/15 text-emerald-200":"bg-red-400/15 text-red-200"}`}>{answer===1?"정답! 같은 싱글이면서 7보다 높은 9를 낼 수 있어요.":"다시 생각해 보세요. 같은 종류로 더 높은 조합이어야 해요."}</p>}<p className="text-center text-xs text-zinc-500">이제 실제 게임에서 카드를 눌러 선택하고 ‘카드 내기’를 누르면 됩니다.</p></div>}
   </div>
   <footer className="border-t border-white/10 p-4"><div className="mb-3 flex gap-1">{titles.map((_,i)=><span key={i} className={`h-1.5 flex-1 rounded-full ${i<=step?"bg-sky-300":"bg-white/10"}`}/>)}</div><div className="flex gap-2">{step>0&&<button onClick={()=>setStep(v=>v-1)} className="rounded-xl border border-white/15 px-5 py-3 font-bold">이전</button>}{step<titles.length-1?<button onClick={()=>setStep(v=>v+1)} className="flex-1 rounded-xl bg-sky-300 px-5 py-3 font-black text-zinc-950">{step===0?"튜토리얼 시작":"다음"}</button>:<button onClick={onClose} className="flex-1 rounded-xl bg-emerald-300 px-5 py-3 font-black text-zinc-950">게임하러 가기</button>}</div></footer>
  </section>
 </div>;
}
