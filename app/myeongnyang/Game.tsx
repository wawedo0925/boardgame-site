"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ROUND_MS, scoreChoices, type Pet as PetType } from "@/lib/myeongnyang";
import Pet from "./Pet";
import s from "./game.module.css";
type Stats = {mine:number|null;average:number|null;count:number;leaders:{name:string;score:number}[]};
type Run = {id:string|null;queue:number[];choices:number[];deadline:number;last:number};
export default function Game() {
 const db=useMemo(()=>createClient(),[]);
 const [user,setUser]=useState<string|null>(null),[ready,setReady]=useState(false);
 const [phase,setPhase]=useState<"idle"|"loading"|"playing"|"done">("idle");
 const [queue,setQueue]=useState<number[]>([0,1,1,0,1]),[index,setIndex]=useState(0);
 const [score,setScore]=useState(0),[seconds,setSeconds]=useState(30),[feedback,setFeedback]=useState("");
 const [stats,setStats]=useState<Stats|null>(null),[error,setError]=useState(""),[save,setSave]=useState("");
 const [ranking,setRanking]=useState(false),[retry,setRetry]=useState(false);
 const run=useRef<Run|null>(null),playing=useRef(false),saving=useRef(false),mounted=useRef(true);
 const loadStats=useCallback(async()=>{const {data,error}=await db.rpc("myeongnyang_stats");if(mounted.current){if(error)setError("멤버 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");else setStats(data as Stats);}},[db]);
 useEffect(()=>{mounted.current=true;document.body.classList.add("game-in-room");
  void db.auth.getUser().then(({data})=>{if(!mounted.current)return;setUser(data.user?.id??null);setReady(true);if(data.user)void loadStats();});
  const {data:{subscription}}=db.auth.onAuthStateChange((_event,session)=>{if(mounted.current){setUser(session?.user.id??null);if(!session)setStats(null);}});
  return()=>{mounted.current=false;playing.current=false;subscription.unsubscribe();document.body.classList.remove("game-in-room");};
 },[db,loadStats]);
 const persist=useCallback(async()=>{
  const r=run.current;if(!r?.id||saving.current)return;saving.current=true;setRetry(false);setSave("기록 저장 중…");
  const {data,error}=await db.rpc("myeongnyang_finish",{p_run:r.id,p_choices:r.choices});saving.current=false;
  if(!mounted.current)return;
  if(error){setSave("기록을 저장하지 못했어요. 아래 버튼으로 다시 시도해 주세요.");setRetry(true);}
  else {setScore(data as number);setSave("내 최고점에 반영했어요!");void loadStats();}
 },[db,loadStats]);
 const finish=useCallback(()=>{if(!playing.current)return;playing.current=false;setSeconds(0);setPhase("done");setFeedback("");if(run.current?.id)void persist();else setSave("연습 기록이에요. 로그인하면 멤버 기록에 도전할 수 있어요.");},[persist]);
 useEffect(()=>{if(phase!=="playing")return;const tick=()=>{const left=Math.max(0,(run.current!.deadline-performance.now())/1000);setSeconds(left);if(left<=0)finish();};const timer=window.setInterval(tick,40);const visible=()=>tick();document.addEventListener("visibilitychange",visible);return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",visible);};},[phase,finish]);
 const choose=useCallback((pet:PetType)=>{
  const r=run.current;if(!playing.current||!r)return;const now=performance.now();if(now>=r.deadline){finish();return;}if(now-r.last<50||r.choices.length>=r.queue.length)return;r.last=now;
  const correct=r.queue[r.choices.length]===pet;r.choices.push(pet);setIndex(r.choices.length);setScore(scoreChoices(r.queue,r.choices));setFeedback(correct?"정답 +1":"앗! -1");
 },[finish]);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.repeat||e.altKey||e.ctrlKey||e.metaKey||!playing.current)return;if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();choose(e.key==="ArrowLeft"?0:1);}};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[choose]);
 async function start(){if(phase==="loading"||playing.current||saving.current)return;setPhase("loading");setError("");setSave("");setRetry(false);let id:string|null=null;let animals:number[];
  if(user){const {data,error}=await db.rpc("myeongnyang_start");if(!mounted.current)return;if(error){setError(error.message);setPhase("idle");return;}id=data.id;animals=data.queue;}
  else {const random=new Uint8Array(600);crypto.getRandomValues(random);animals=Array.from(random,n=>n%2);}
  run.current={id,queue:animals,choices:[],deadline:performance.now()+ROUND_MS,last:0};setQueue(animals);setIndex(0);setScore(0);setSeconds(30);setFeedback("");playing.current=true;setPhase("playing");
 }
 const top=stats?.leaders[0];
 return <main className={s.page}><div className={s.shell}>
  <header className={s.header}><div><p>30 SECOND PET CLUB</p><h1>명냥게임 <span>🐾</span></h1></div><Link href="/game-world">나가기 ↗</Link></header>
  <section className={s.board} aria-label="명냥게임 게임판">
   <div className={s.hud}><div className={s.records}><b>BEST SCORE</b><p>내 최고 <strong>{stats?.mine??"—"}<small>점</small></strong></p><p>👑 {top?.name??"멤버 최고"} <strong>{top?.score??"—"}<small>점</small></strong></p><p>멤버 평균 <strong>{stats?.average??"—"}<small>점</small></strong></p></div><div className={`${s.timer} ${seconds<=5?s.hurry:""}`}><small>남은 시간</small><b>{seconds.toFixed(1)}</b><span>초</span></div></div>
   <div className={s.track}><div style={{width:`${seconds/30*100}%`}}/></div>
   <div className={s.score}><span>현재 점수</span><b>{score}</b><small className={feedback.startsWith("앗")?s.wrong:""}>{feedback||"차근차근, 빠르게!"}</small></div>
   <div className={s.pets} aria-label="분류할 동물"><div className={s.upcoming} aria-hidden="true">{queue.slice(index+1,index+4).reverse().map((pet,i)=><div key={`${index}-${i}`} style={{opacity:.35+i*.2,transform:`scale(${.65+i*.12})`}}><Pet cat={pet===1}/></div>)}</div><div className={s.current} key={index}><Pet cat={queue[index]===1}/><span>이 친구를 보내 주세요</span></div></div>
   <div className={s.controls}><button disabled={phase!=="playing"} onClick={()=>choose(0)} className={s.dog} aria-label="강아지 왼쪽"><Pet cat={false}/><b>← 강아지</b></button><button disabled={phase!=="playing"} onClick={()=>choose(1)} className={s.cat} aria-label="고양이 오른쪽"><Pet cat/><b>고양이 →</b></button></div>
   {phase!=="playing"&&<div className={s.overlay}><section className={s.card} aria-label={phase==="done"?"게임 결과":"게임 시작"}>
    <div className={s.duo}><Pet cat={false}/><Pet cat/></div><h2>{phase==="done"?`${score}점! 잘했어요 🐾`:"멍멍? 야옹!"}</h2>
    <p>{phase==="done"?save:"30초 동안 강아지는 왼쪽, 고양이는 오른쪽!"}</p><p className={s.hint}>정답 +1 · 오답 -1 (최소 0점)<br/>터치 버튼 또는 키보드 ← →</p>
    {retry&&<button className={s.start} onClick={()=>void persist()}>기록 저장 다시 시도</button>}
    <button className={s.start} disabled={!ready||phase==="loading"||save==="기록 저장 중…"} onClick={()=>void start()}>{phase==="loading"?"준비 중…":phase==="done"?"한 번 더 도전!":user?"30초 도전 시작":"30초 연습 시작"}</button>
    {!user&&ready&&<Link className={s.login} href="/login">로그인하고 최고점 남기기 →</Link>}
   </section></div>}
  </section>
  {error&&<p role="alert" className={s.error}>{error}</p>}
  <footer className={s.footer}><span>{user?`멤버 ${stats?.count??0}명의 개인 최고점 기준`:"로그인하면 멤버 기록을 볼 수 있어요"}</span><button disabled={!user||phase==="playing"} onClick={()=>{setRanking(!ranking);if(!ranking)void loadStats();}}>명냥 TOP 10 {ranking?"−":"+"}</button></footer>
  {ranking&&<ol className={s.ranking}>{stats?.leaders.map((p,i)=><li key={i}><span>{i+1}. {p.name}</span><b>{p.score}점</b></li>)}{!stats?.leaders.length&&<li>첫 기록의 주인공이 되어 주세요!</li>}</ol>}
 </div></main>;
}
