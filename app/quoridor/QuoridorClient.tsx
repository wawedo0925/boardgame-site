"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { legalMoves, validWall, type Wall } from "@/lib/quoridor";
import styles from "./quoridor.module.css";

type Room = { id: string; code: string; host_name: string; guest_name: string | null; status: "WAITING" | "PLAYING" | "FINISHED";
  positions: number[]; walls: Wall[]; remaining: number[]; seat: number; turn: number; winner: number | null; revision: number; last_action: string; moves: number[] };
type Lobby = Pick<Room,"id"|"code"|"host_name"|"guest_name"|"status"> & { mine: boolean };
const supabase = createClient();
const initialPractice = (): Room => ({ id: "practice", code: "LOCAL", host_name: "블루", guest_name: "핑크", status: "PLAYING",
  positions: [76,4], walls: [], remaining: [10,10], seat: 0, turn: 0, winner: null, revision: 0, last_action: "기기를 번갈아 사용하며 연습하세요", moves: [67,75,77] });

export default function QuoridorClient() {
  const [user, setUser] = useState<string | null>(null), [authReady,setAuthReady] = useState(false);
  const [room,setRoom] = useState<Room | null>(null), [rooms,setRooms] = useState<Lobby[]>([]);
  const [code,setCode] = useState(""), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const [mode,setMode] = useState<"move"|"wall">("move"), [orientation,setOrientation] = useState<"h"|"v">("h");
  const [preview,setPreview] = useState<Wall | null>(null), [rules,setRules] = useState(false), [leaving,setLeaving] = useState(false);
  const activeId = useRef<string | null>(null), inflight = useRef(false);
  const seenRevision = useRef("");
  const savedRoomKey = useRef<string | null>(null);
  const roomId = room?.id;
  useEffect(() => {
    document.body.classList.toggle("game-in-room", !!roomId);
    return () => document.body.classList.remove("game-in-room");
  }, [roomId]);
  const loadRoom = useCallback(async (id: string) => {
    const { data,error } = await supabase.rpc("quoridor_snapshot", {p_room:id});
    if (activeId.current !== id) return;
    if (error) {
      if(error.message.includes("참여 중인 방이 아닙니다")) {
        activeId.current=null;setRoom(null);
        if(savedRoomKey.current)localStorage.removeItem(savedRoomKey.current);
        setError("방이 종료되었거나 더 이상 참여 중인 방이 아니에요.");
      } else setError(error.message);
      return;
    }
    const key=`${id}:${data.revision}`;
    if(seenRevision.current!==key) {setPreview(null);setMode("move");seenRevision.current=key;}
    setRoom(old => old && old.id===id && old.revision>data.revision ? old : data);
  },[]);
  const loadLobby = useCallback(async () => {
    const { data,error } = await supabase.rpc("quoridor_lobby");
    if (error) { setError("온라인 방을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."); return; }
    setRooms(data || []);
  },[]);
  useEffect(() => {
    let live=true;
    supabase.auth.getUser().then(({data})=> {
      if(!live)return; setUser(data.user?.id ?? null); setAuthReady(true);
      if(data.user) {
        savedRoomKey.current=`quoridor-room:${data.user.id}`;
        void loadLobby();
        const saved=localStorage.getItem(`quoridor-room:${data.user.id}`);
        if(saved && !activeId.current) { activeId.current=saved; void loadRoom(saved); }
      }
    });
    return ()=> {live=false;};
  },[loadLobby,loadRoom]);
  useEffect(() => {
    if(!user || room?.id==="practice") return;
    const timer=setInterval(()=> { if(document.hidden)return; if(activeId.current)void loadRoom(activeId.current); else void loadLobby(); },2000);
    return ()=>clearInterval(timer);
  },[user,room?.id,loadRoom,loadLobby]);

  async function enter(id: string) {
    activeId.current=id;
    if(user)localStorage.setItem(`quoridor-room:${user}`,id);
    await loadRoom(id);
  }
  async function request(fn: string,args?: Record<string,unknown>) {
    if(inflight.current)return;
    inflight.current=true;setBusy(true);setError("");
    try {
      const {data,error}=await supabase.rpc(fn,args);
      if(error)throw error;
      if(typeof data==="string")await enter(data);
    } catch(e) {setError(e instanceof Error ? e.message : (e as {message?:string}).message || "요청을 처리하지 못했어요.");}
    finally {inflight.current=false;setBusy(false);}
  }
  function exit() {
    activeId.current=null;setRoom(null);setLeaving(false);setPreview(null);
    if(user) {localStorage.removeItem(`quoridor-room:${user}`);void loadLobby();}
  }
  async function action(kind:string,payload:Record<string,unknown>={}) {
    if(!room || inflight.current)return;
    setError("");
    if(room.id==="practice") {
      if(kind==="leave"){exit();return;}
      const seat=room.turn, positions=[...room.positions], remaining=[...room.remaining], walls=[...room.walls];
      if(kind==="move") {
        const target=payload.target as number;
        if(!legalMoves(positions[seat],positions[1-seat],walls).includes(target))return;
        positions[seat]=target;
      } else if(kind==="wall") {
        const w=payload as Wall;
        if(!remaining[seat] || !validWall(walls,positions,w))return;
        walls.push({...w,seat});remaining[seat]--;
      } else return;
      const winner=Math.floor(positions[seat]/9)===(seat===0?0:8)?seat:null, next=1-seat;
      setPreview(null);setMode("move");
      setRoom({...room,positions,remaining,walls,turn:next,seat:next,winner,status:winner===null?"PLAYING":"FINISHED",revision:room.revision+1,
        last_action:kind==="wall"?"벽을 설치했어요":"말을 이동했어요",moves:legalMoves(positions[next],positions[seat],walls)});return;
    }
    inflight.current=true;setBusy(true);
    try {
      const {error}=await supabase.rpc("quoridor_action",{p_room:room.id,p_revision:room.revision,p_action:kind,p_payload:payload});
      if(error)throw error;
      if(kind==="leave")exit();else await loadRoom(room.id);
    } catch(e) {setError((e as {message?:string}).message || "연결을 확인해 주세요.");await loadRoom(room.id);}
    finally {inflight.current=false;setBusy(false);}
  }
  const practice=room?.id==="practice", myTurn=room?.status==="PLAYING" && room.turn===room.seat;
  // Local practice stays fixed; online players both see themselves at the bottom.
  const flip=!!room && !practice && room.seat===1;
  const displayPos=(n:number)=>flip?80-n:n;
  const displayWall=(w:Wall)=>flip?{...w,r:7-w.r,c:7-w.c}:w;
  const previewValid=!!room && !!preview && validWall(room.walls,room.positions,preview);
  const names=room?[room.host_name,room.guest_name || "입장 대기"]:[];
  const wallLine=(w:Wall,key:string,ghost=false)=> {
    const v=displayWall(w), x=8+v.c*10,y=8+v.r*10;
    return <line key={key} x1={v.o==="h"?x-4:x+5} y1={v.o==="h"?y+5:y-4} x2={v.o==="h"?x+14:x+5} y2={v.o==="h"?y+5:y+14}
      stroke={ghost?(previewValid?"#c5ff63":"#ff727e"):w.seat===1?"#ff65d5":"#51e9ff"} strokeWidth={ghost?1.3:1.1} strokeLinecap="round" strokeDasharray={ghost?"2 1":undefined} className={styles.wall} />;
  };
  return <main className={styles.space}>
    <div className={styles.shell}>
      <header className={styles.header}><div><Link href="/game-world" className={styles.back}>← 게임 월드</Link><p className={styles.eyebrow}>NEON ORBIT · 1 VS 1</p><h1>쿼리도 <span>✦</span></h1></div><button onClick={()=>setRules(true)} className={styles.circle} aria-label="게임 방법">?</button></header>
      {error && <div role="alert" className={styles.error}>{error}<button onClick={()=>{setError(""); if(room)void loadRoom(room.id);else if(user)void loadLobby();}}>다시 확인</button>{!room && <button onClick={exit}>로비로</button>}</div>}
      {!room ? <>
        <section className={styles.hero}><div className={styles.orbit}><span>◉</span><i/><b>✦</b></div><p className={styles.eyebrow}>FIND YOUR WAY THROUGH THE STARS</p><h2>길을 만들고,<br/><em>상대의 길을 바꾸세요.</em></h2><p>9 × 9 우주 격자 위의 두 탐험가.<br/>벽 10개로 펼치는 짧고 깊은 심리전.</p>
          {user ? <button className={styles.primary} disabled={busy} onClick={()=>request("quoridor_create")}>＋ 대결 방 만들기</button> : <Link className={styles.primary} href="/login">{authReady?"로그인하고 온라인 대결":"로그인 확인 중…"}</Link>}
          <button className={styles.secondary} onClick={()=>{activeId.current="practice";setError("");setRoom(initialPractice());}}>한 기기로 둘이 연습하기</button>
        </section>
        {user && <section className={styles.panel}><h2>친구와 만나기 <span>ROOM CODE</span></h2><form className={styles.join} onSubmit={e=>{e.preventDefault();void request("quoridor_join",{p_code:code});}}><input aria-label="방 코드" placeholder="방 코드 8자리" maxLength={8} value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/><button disabled={busy||code.trim().length!==8}>입장</button></form>
          <div className={styles.roomList}>{rooms.filter(r=>r.status!=="FINISHED").map(r=><button key={r.id} disabled={busy} onClick={()=>r.mine?enter(r.id):request("quoridor_join",{p_code:r.code})}><span>{r.host_name}님의 우주 <small>{r.status==="PLAYING"?"대결 중":r.guest_name?"2 / 2명":"1 / 2명 · 입장 가능"}</small></span><b>{r.mine?"이어하기":"입장 →"}</b></button>)}{!rooms.some(r=>r.status!=="FINISHED")&&<p className={styles.muted}>아직 열린 방이 없어요. 첫 대결을 시작해 보세요.</p>}</div>
        </section>}
      </> : <>
        <div className={styles.roomBar}><span>{practice?"한 기기 연습 · 번갈아 조작":`ROOM ${room.code}`}</span><div>{!practice && <button onClick={async()=>{try{await navigator.clipboard.writeText(room.code);}catch{setError(`방 코드: ${room.code}`);}}}>코드 복사</button>}<button onClick={()=>room.status==="PLAYING"&&!practice?setLeaving(true):action("leave")}>나가기</button></div></div>
        <div className={styles.players}>{names.map((name,i)=><div key={i} aria-label={`${name}, 벽 ${room.remaining[i]}개${room.status==="PLAYING"&&room.turn===i?", 현재 차례":""}`} className={`${styles.player} ${i===1?styles.pink:""} ${room.status==="PLAYING"&&room.turn===i?styles.active:""}`}><strong>{name}</strong><span>벽 {room.remaining[i]}개</span></div>)}</div>
        {room.status==="WAITING" && <section className={styles.waiting}><h2>{room.guest_name?"탐험가 두 명, 준비 완료":"상대를 기다리고 있어요"}</h2><p>방 코드를 친구에게 알려 주세요.</p>{room.seat===0?<button className={styles.primary} disabled={!room.guest_name||busy} onClick={()=>action("start")}>대결 시작 · 선공은 랜덤</button>:<p>방장이 시작하면 대결이 열립니다.</p>}</section>}
        <div className={styles.boardWrap}><div className={styles.goal}>✦ {practice?"블루의 목적지":"나의 목적지"} ✦</div><div className={styles.board}>
          <div className={styles.cells}>{Array.from({length:81},(_,v)=>{const n=displayPos(v),pawn=room.positions.indexOf(n),canMove=myTurn&&mode==="move"&&room.moves.includes(n),r=Math.floor(n/9),c=n%9;
            const anchor=flip?{r:r-1,c:c-1}:{r,c}; const canWall=myTurn&&mode==="wall"&&anchor.r>=0&&anchor.r<8&&anchor.c>=0&&anchor.c<8;
            return <button key={v} aria-label={`${r+1}행 ${c+1}열${pawn>=0?` ${names[pawn]}`:""}${canMove?" 이동 가능":""}${canWall?" 벽 위치 선택":""}`} disabled={busy||(!canMove&&!canWall)} className={`${styles.cell} ${canMove?styles.possible:""} ${canWall?styles.anchor:""}`}
              onClick={()=>canWall?setPreview({...anchor,o:orientation,seat:room.seat}):action("move",{target:n})}>
              {pawn>=0?<span className={`${styles.pawn} ${pawn===1?styles.pinkPawn:""}`}>◉</span>:canMove?<span className={styles.dot}/>:canWall?<span className={styles.cross}>＋</span>:null}
            </button>;
          })}</div>
          <svg className={styles.walls} viewBox="0 0 96 96" aria-hidden="true">{room.walls.map((w,i)=>wallLine(w,`wall-${i}`))}{preview&&wallLine(preview,"preview",true)}</svg>
        </div><div className={styles.boardFooter}><div className={styles.bottomGoal}>{practice?"핑크의 목적지":"상대의 목적지"}</div>{mode==="wall" && myTurn && <button className={styles.boardConfirm} disabled={busy||!previewValid} onClick={()=>preview&&action("wall",preview)}>설치 확정</button>}</div></div>
        {room.status==="PLAYING" && <section className={styles.controls}><div className={styles.turn}><span>{myTurn?(practice?`${names[room.turn]} 차례`:"내 차례"):"상대 차례"}</span><small>{myTurn?"이동 또는 벽 설치 중 하나를 선택하세요":"상대가 길을 고민하고 있어요"}</small></div>
          <div className={styles.tabs}><button disabled={!myTurn||busy} aria-pressed={mode==="move"} onClick={()=>{setMode("move");setPreview(null);}}>◉ 말 이동</button><button disabled={!myTurn||busy||!room.remaining[room.seat]} aria-pressed={mode==="wall"} onClick={()=>setMode("wall")}>▰ 벽 설치 <small>{room.remaining[room.seat]}</small></button></div>
          {mode==="wall" && myTurn && <div className={styles.wallControls}><div><button aria-pressed={orientation==="h"} onClick={()=>{setOrientation("h");setPreview(p=>p?{...p,o:"h"}:null);}}>━ 가로</button><button aria-pressed={orientation==="v"} onClick={()=>{setOrientation("v");setPreview(p=>p?{...p,o:"v"}:null);}}>┃ 세로</button></div><p>{preview?previewValid?"이 위치에 벽을 설치할까요?":"겹치거나 길이 막혀요. 다른 위치를 골라 주세요.":"판의 ＋를 눌러 벽 위치를 미리 보세요."}</p></div>}
        </section>}
        <p className={styles.activity} aria-live="polite">{busy?"전송 중…":room.last_action}</p>
        {room.status==="FINISHED" && <section className={styles.finish} role="status"><span>✦ MISSION COMPLETE ✦</span><h2>{names[room.winner??0]} 승리!</h2><p>다음 우주에서는 어떤 길을 만들까요?</p><button className={styles.primary} onClick={()=>practice?setRoom(initialPractice()):exit()}>{practice?"다시 연습하기":"로비로 돌아가기"}</button></section>}
      </>}
      {(rules||leaving) && <div className={styles.overlay}><section className={styles.modal} role="dialog" aria-modal="true" aria-label={rules?"게임 방법":"게임 나가기"}>{rules?<><p className={styles.eyebrow}>HOW TO PLAY</p><h2>반대편 끝줄까지, 먼저.</h2><ol><li>내 차례에는 상하좌우 한 칸 이동하거나 벽 하나를 설치해요.</li><li>각자 벽 10개. 벽은 두 칸 길이이며 겹치거나 교차할 수 없어요.</li><li>상대의 길을 돌아가게 할 수 있지만, 양쪽 모두 도착할 길 하나는 남겨야 해요.</li><li>붙어 있는 상대 말은 뛰어넘어요. 뒤가 벽이나 판 끝이면 상대의 옆 칸으로 이동할 수 있어요.</li><li>반대편 끝줄의 어느 칸이든 먼저 도착하면 승리!</li></ol><p>벽 설치 → 가로/세로 선택 → 판에서 위치 선택 → 확정</p><button className={styles.primary} onClick={()=>setRules(false)}>알겠어요</button></>:<><h2>대결에서 나갈까요?</h2><p>진행 중에 나가면 기권으로 처리되어 상대가 승리해요.</p><button className={styles.primary} disabled={busy} onClick={()=>action("leave")}>기권하고 나가기</button><button className={styles.secondary} onClick={()=>setLeaving(false)}>계속 대결하기</button></>}</section></div>}
    </div>
  </main>;
}

