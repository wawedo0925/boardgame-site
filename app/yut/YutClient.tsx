"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "INDIVIDUAL" | "TEAM_2V2" | "TEAM_3X2";
type Lobby = { id:string; code:string; title:string; mode:Mode; status:string; players:number; max_players:number; mine:boolean };
type Room = { id:string; code:string; title:string; host_id:string; mode:Mode; status:string; max_players:number; turn_seat:number|null; pending_moves:number[]; can_roll:boolean; last_roll:number|null; winner_team:number|null; revision:number };
type Player = { id:string; user_id:string|null; seat:number; team:number; name:string; ready:boolean; is_bot:boolean };
type Piece = { team:number; piece_no:number; route:"outer"|"diag1"|"diag2"; step_index:number };
type Snap = { room:Room; me:{id:string;seat:number;team:number;ready:boolean}; players:Player[]; pieces:Piece[] };

const supabase=createClient();
const teamStyles=[
  {name:"빨강",bg:"bg-red-500",text:"text-red-300",border:"border-red-400"},
  {name:"노랑",bg:"bg-amber-400",text:"text-amber-300",border:"border-amber-300"},
  {name:"파랑",bg:"bg-sky-500",text:"text-sky-300",border:"border-sky-400"},
  {name:"초록",bg:"bg-emerald-500",text:"text-emerald-300",border:"border-emerald-400"},
  {name:"보라",bg:"bg-violet-500",text:"text-violet-300",border:"border-violet-400"},
  {name:"분홍",bg:"bg-pink-500",text:"text-pink-300",border:"border-pink-400"},
];
const modeInfo:Record<Mode,{label:string;detail:string}>={
  INDIVIDUAL:{label:"개인전",detail:"2~4명 · 각자 말 4개"},
  TEAM_2V2:{label:"2 대 2",detail:"두 팀 · 팀별 말 4개"},
  TEAM_3X2:{label:"2 대 2 대 2",detail:"세 팀 6명 · 팀별 말 4개"},
};
const resultLabel:Record<number,string>={[-1]:"빽도",1:"도",2:"개",3:"걸",4:"윷",5:"모"};
const boardPos:Record<number,[number,number]>={
  0:[94,94],1:[78,94],2:[62,94],3:[46,94],4:[30,94],5:[6,94],6:[6,76],7:[6,59],8:[6,42],9:[6,25],10:[6,6],11:[24,6],12:[41,6],13:[59,6],14:[76,6],15:[94,6],16:[94,24],17:[94,41],18:[94,59],19:[94,76],20:[94,94],
  21:[24,76],22:[50,50],23:[68,32],24:[82,18],25:[24,24],26:[38,38],27:[62,62],28:[78,78],99:[104,50],
};
function nodeOf(piece:Piece){
  const paths={outer:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,99],diag1:[0,1,2,3,4,5,21,22,23,24,15,16,17,18,19,20,99],diag2:[0,1,2,3,4,5,6,7,8,9,10,25,26,22,27,28,20,99]};
  return paths[piece.route][piece.step_index]??99;
}
function errText(error:unknown){return error instanceof Error?error.message:"요청을 처리하지 못했습니다."}

export default function YutClient(){
  const [userId,setUserId]=useState<string|null>(null),[lobby,setLobby]=useState<Lobby[]>([]),[snap,setSnap]=useState<Snap|null>(null);
  const [mode,setMode]=useState<Mode>("INDIVIDUAL"),[playerCount,setPlayerCount]=useState(4),[title,setTitle]=useState(""),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const roomId=snap?.room.id??null, botBusy=useRef(false);
  const rpc=useCallback(async(name:string,args:Record<string,unknown>={})=>{setBusy(true);setNotice("");try{const {data,error}=await supabase.rpc(name,args);if(error)throw error;return data;}catch(e){setNotice(errText(e));throw e;}finally{setBusy(false)}},[]);
  const loadLobby=useCallback(async()=>{const {data}=await supabase.rpc("yut_lobby");setLobby((data??[]) as Lobby[])},[]);
  const loadRoom=useCallback(async(id:string)=>{const {data,error}=await supabase.rpc("yut_snapshot",{p_room:id});if(error||!data){localStorage.removeItem("yut-room");setSnap(null);return}setSnap(data as Snap)},[]);
  useEffect(()=>{supabase.auth.getUser().then(({data})=>{setUserId(data.user?.id??null);const saved=localStorage.getItem("yut-room");if(saved)loadRoom(saved);else loadLobby()})},[loadLobby,loadRoom]);
  useEffect(()=>{const timer=setInterval(()=>roomId?loadRoom(roomId):loadLobby(),1000);return()=>clearInterval(timer)},[roomId,loadRoom,loadLobby]);
  useEffect(()=>{const current=snap?.players.find(p=>p.seat===snap.room.turn_seat);if(!roomId||snap?.room.status!=="PLAYING"||!current?.is_bot||botBusy.current)return;botBusy.current=true;const timer=setTimeout(async()=>{try{await supabase.rpc("yut_bot_tick",{p_room:roomId});await loadRoom(roomId)}finally{botBusy.current=false}},850);return()=>clearTimeout(timer)},[snap,roomId,loadRoom]);
  const openRoom=async(id:string)=>{localStorage.setItem("yut-room",id);await loadRoom(id)};
  const create=async()=>{const id=await rpc("yut_create_room",{p_title:title||null,p_mode:mode,p_max_players:playerCount});if(id)await openRoom(id as string)};
  const action=async(name:string,args:Record<string,unknown>={})=>{if(!roomId)return;try{await rpc(name,{p_room:roomId,...args});await loadRoom(roomId)}catch{}}
  const leave=async()=>{if(!roomId)return;try{await rpc("yut_leave_room",{p_room:roomId});localStorage.removeItem("yut-room");setSnap(null);await loadLobby()}catch{}}
  if(!userId)return <main className="mx-auto max-w-xl px-4 py-20 text-center"><h1 className="text-3xl font-black">윷놀이</h1><p className="mt-4 text-zinc-400">게임을 하려면 먼저 로그인해 주세요.</p><a href="/login" className="mt-8 inline-flex rounded-2xl bg-amber-400 px-8 py-4 font-black text-black">로그인</a></main>;
  if(!snap)return <LobbyView lobby={lobby} mode={mode} setMode={setMode} playerCount={playerCount} setPlayerCount={setPlayerCount} title={title} setTitle={setTitle} busy={busy} notice={notice} create={create} join={async id=>{try{await rpc("yut_join_room",{p_room:id});await openRoom(id)}catch{}}}/>;
  const {room,players,pieces,me}=snap,current=players.find(p=>p.seat===room.turn_seat),host=room.host_id===userId;
  if(room.status==="WAITING")return <Waiting room={room} players={players} me={me} host={host} busy={busy} notice={notice} action={action} leave={leave}/>;
  return <Game room={room} players={players} pieces={pieces} me={me} current={current} busy={busy} notice={notice} action={action} leave={leave}/>;
}

function LobbyView({lobby,mode,setMode,playerCount,setPlayerCount,title,setTitle,busy,notice,create,join}:{lobby:Lobby[];mode:Mode;setMode:(m:Mode)=>void;playerCount:number;setPlayerCount:(n:number)=>void;title:string;setTitle:(s:string)=>void;busy:boolean;notice:string;create:()=>void;join:(id:string)=>void}){
 return <main className="mx-auto w-full max-w-5xl px-4 py-8"><section className="rounded-3xl border border-white/10 bg-gradient-to-br from-amber-400/10 via-zinc-950 to-emerald-400/10 p-6 sm:p-9"><p className="text-xs font-black tracking-[.3em] text-amber-300">KOREAN TRADITIONAL GAME</p><h1 className="mt-2 text-4xl font-black">윷놀이</h1><p className="mt-3 text-zinc-300">윷을 던지고, 업고, 잡고, 지름길로 먼저 네 말을 완주하세요.</p></section>
 <section className="mt-6 rounded-3xl border border-white/10 bg-white/[.035] p-5"><h2 className="text-xl font-black">새 게임 만들기</h2><div className="mt-4 grid gap-3 sm:grid-cols-3">{(Object.keys(modeInfo) as Mode[]).map(m=><button key={m} onClick={()=>setMode(m)} className={`rounded-2xl border p-4 text-left ${mode===m?"border-amber-300 bg-amber-300/15":"border-white/10 bg-black/20"}`}><b className={mode===m?"text-amber-300":""}>{modeInfo[m].label}</b><span className="mt-1 block text-xs text-zinc-400">{modeInfo[m].detail}</span></button>)}</div>{mode==="INDIVIDUAL"&&<div className="mt-4 flex items-center gap-2"><span className="mr-2 text-sm text-zinc-400">참가 인원</span>{[2,3,4].map(n=><button key={n} onClick={()=>setPlayerCount(n)} className={`h-10 w-12 rounded-xl border font-bold ${playerCount===n?"border-amber-300 bg-amber-300 text-black":"border-white/10"}`}>{n}명</button>)}</div>}<div className="mt-4 flex flex-col gap-3 sm:flex-row"><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="방 이름 (선택)" maxLength={30} className="min-h-12 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 outline-none focus:border-amber-300"/><button disabled={busy} onClick={create} className="rounded-xl bg-amber-400 px-7 py-3 font-black text-black disabled:opacity-50">게임 만들기</button></div>{notice&&<p className="mt-3 text-sm text-red-300">{notice}</p>}</section>
 <section className="mt-6"><h2 className="text-xl font-black">참여 가능한 방</h2><div className="mt-3 grid gap-3">{lobby.length?lobby.map(r=><article key={r.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.035] p-4"><div><b>{r.title}</b><p className="mt-1 text-xs text-zinc-400">{modeInfo[r.mode].label} · {r.players}/{r.max_players}명 · 코드 {r.code}</p></div><button onClick={()=>join(r.id)} className="shrink-0 rounded-xl border border-amber-300/60 px-4 py-2 font-bold text-amber-300">{r.mine?"돌아가기":"참가"}</button></article>):<p className="rounded-2xl border border-dashed border-white/10 py-10 text-center text-zinc-500">아직 열린 방이 없습니다.</p>}</div></section></main>
}

function Waiting({room,players,me,host,busy,notice,action,leave}:{room:Room;players:Player[];me:Snap["me"];host:boolean;busy:boolean;notice:string;action:(n:string,a?:Record<string,unknown>)=>void;leave:()=>void}){
 return <main className="mx-auto max-w-3xl px-4 py-8"><header className="flex items-center justify-between"><div><p className="text-xs text-zinc-400">{modeInfo[room.mode].label} · 방 코드 {room.code}</p><h1 className="text-3xl font-black">{room.title}</h1></div><button onClick={leave} className="rounded-xl border border-red-400/30 px-4 py-2 text-red-300">방 나가기</button></header><section className="mt-6 rounded-3xl border border-white/10 bg-white/[.035] p-5"><div className="grid gap-3 sm:grid-cols-2">{Array.from({length:room.max_players},(_,seat)=>{const p=players.find(x=>x.seat===seat),style=teamStyles[p?.team??seat];return <div key={seat} className={`flex min-h-20 items-center justify-between rounded-2xl border bg-black/25 p-4 ${p?style.border:"border-dashed border-white/10"}`}><div>{p?<><b className={style.text}>{p.name}</b><p className="text-xs text-zinc-400">{p.is_bot?"AI · 준비 완료":p.user_id===room.host_id?"방장":"플레이어"}</p></>:<span className="text-zinc-600">빈자리</span>}</div>{p?.is_bot&&host?<button onClick={()=>action("yut_remove_bot",{p_player:p.id})} className="text-xs text-red-300">내보내기</button>:p&&<span className={`text-xs font-bold ${p.ready||p.user_id===room.host_id?"text-emerald-300":"text-zinc-500"}`}>{p.ready||p.user_id===room.host_id?"준비 완료":"대기"}</span>}</div>})}</div><div className="mt-5 flex flex-wrap gap-3">{host&&players.length<room.max_players&&<button onClick={()=>action("yut_add_bot")} className="rounded-xl border border-violet-300/50 bg-violet-400/10 px-5 py-3 font-bold text-violet-200">+ AI 추가</button>}{!host&&<button onClick={()=>action("yut_toggle_ready")} className={`rounded-xl px-6 py-3 font-black ${me.ready?"bg-zinc-700":"bg-emerald-400 text-black"}`}>{me.ready?"준비 취소":"준비하기"}</button>}{host&&<button disabled={busy||players.length!==room.max_players} onClick={()=>action("yut_start_room")} className="flex-1 rounded-xl bg-amber-400 px-6 py-3 font-black text-black disabled:opacity-30">게임 시작</button>}</div>{notice&&<p className="mt-4 text-sm text-red-300">{notice}</p>}</section><Rules/></main>
}

function Game({room,players,pieces,me,current,busy,notice,action,leave}:{room:Room;players:Player[];pieces:Piece[];me:Snap["me"];current?:Player;busy:boolean;notice:string;action:(n:string,a?:Record<string,unknown>)=>void;leave:()=>void}){
 const myTurn=current?.id===me.id,selectedMove=room.pending_moves[0];
 const teams=[...new Set(players.map(p=>p.team))];
 const movable=pieces.filter(p=>p.team===me.team&&nodeOf(p)!==99&&!(selectedMove===-1&&p.step_index===0));
 const movePiece=(piece:Piece)=>{
   if(!myTurn||room.pending_moves.length===0||busy)return;
   action("yut_move",{p_piece:piece.piece_no,p_move_index:1});
 };
 return <main className="mx-auto max-w-6xl px-3 py-5"><header className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 p-4"><div><p className="text-xs text-zinc-400">{modeInfo[room.mode].label} · {room.status}</p><h1 className="text-2xl font-black">{room.title}</h1></div><button onClick={leave} disabled={room.status!=="FINISHED"} className="rounded-xl border border-red-400/30 px-4 py-2 text-sm text-red-300 disabled:opacity-30">나가기</button></header>
 <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{players.map(p=><div key={p.id} className={`rounded-xl border p-3 ${p.seat===room.turn_seat?"border-white bg-white/10":teamStyles[p.team].border}`}><b className={teamStyles[p.team].text}>{p.name}</b><p className="text-xs text-zinc-400">{teamStyles[p.team].name}팀{p.is_bot?" · AI":""}</p></div>)}</div>
 {room.status==="FINISHED"?<section className="mt-5 rounded-3xl border border-amber-300/50 bg-amber-300/10 p-10 text-center"><p className="text-lg text-amber-200">게임 종료</p><h2 className={`mt-2 text-4xl font-black ${teamStyles[room.winner_team??0].text}`}>{teamStyles[room.winner_team??0].name}팀 승리!</h2><p className="mt-4 text-zinc-300">말 4개를 모두 먼저 완주했습니다.</p></section>:<><section className="mt-4 grid gap-4 lg:grid-cols-[1fr_18rem]"><YutBoard pieces={pieces} teams={teams} onPiece={movePiece} movable={new Set(movable.map(p=>`${p.team}-${p.piece_no}`))}/><aside className="rounded-3xl border border-white/10 bg-white/[.035] p-5"><p className="text-sm text-zinc-400">현재 차례</p><h2 className={`mt-1 text-2xl font-black ${teamStyles[current?.team??0].text}`}>{current?.name}</h2>{room.last_roll!==null&&<div className="mt-5 rounded-2xl bg-black/30 p-5 text-center"><span className="text-sm text-zinc-400">최근 결과</span><b className="block text-4xl text-amber-300">{resultLabel[room.last_roll]}</b></div>}<div className="mt-4 flex flex-wrap gap-2">{room.pending_moves.map((m,i)=><span key={`${m}-${i}`} className="rounded-full bg-amber-300 px-3 py-1 text-sm font-black text-black">{resultLabel[m]}</span>)}</div>{myTurn&&room.can_roll&&<button disabled={busy} onClick={()=>action("yut_roll")} className="mt-5 w-full rounded-2xl bg-amber-400 py-5 text-xl font-black text-black">윷 던지기</button>}{myTurn&&room.pending_moves.length>0&&<div className="mt-5 rounded-xl bg-sky-400/10 p-3"><p className="text-sm font-bold text-sky-200">움직일 말을 선택하세요</p><div className="mt-3 grid grid-cols-2 gap-2">{pieces.filter(p=>p.team===me.team).map(piece=>{const enabled=movable.some(p=>p.piece_no===piece.piece_no);return <button type="button" key={piece.piece_no} disabled={!enabled||busy} onClick={()=>movePiece(piece)} className="min-h-12 rounded-xl border border-sky-300/50 bg-sky-300/10 font-black text-sky-100 disabled:border-white/5 disabled:bg-white/5 disabled:text-zinc-600">{piece.piece_no+1}번 말{nodeOf(piece)===0?" · 출발":nodeOf(piece)===99?" · 완주":""}</button>})}</div><p className="mt-2 text-xs text-zinc-400">판 위의 말을 직접 눌러도 이동합니다.</p></div>}{!myTurn&&<p className="mt-5 text-sm text-zinc-400">상대의 차례를 기다리는 중입니다.</p>}{notice&&<p className="mt-4 text-sm text-red-300">{notice}</p>}</aside></section></>}
 <Rules/></main>
}

function YutBoard({pieces,teams,onPiece,movable}:{pieces:Piece[];teams:number[];onPiece:(p:Piece)=>void;movable:Set<string>}){
 const nodes=[...Array.from({length:21},(_,i)=>i),21,22,23,24,25,26,27,28];
 return <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-amber-200/20 bg-[radial-gradient(circle,#174432_0%,#0b241c_60%,#07100d_100%)] p-4"><svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-[6%] h-[88%] w-[88%] opacity-50"><path d="M6 94L6 6L94 6L94 94L6 94M6 94L94 6M6 6L94 94" fill="none" stroke="#fde68a" strokeWidth="1"/></svg>{nodes.map(n=>{const [x,y]=boardPos[n];return <span key={n} className={`pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-100/50 bg-[#102d23] ${[5,10,15,20,22].includes(n)?"h-7 w-7":""}`} style={{left:`${x}%`,top:`${y}%`}}/>})}<div className="pointer-events-none absolute bottom-1 right-1 text-[10px] text-amber-100/50">출발 / 도착</div>{pieces.map(p=>{const node=nodeOf(p),[x,y]=boardPos[node]??[104,50];const same=pieces.filter(q=>q.team===p.team&&nodeOf(q)===node);const index=same.findIndex(q=>q.piece_no===p.piece_no);return <button type="button" key={`${p.team}-${p.piece_no}`} onClick={()=>onPiece(p)} disabled={!movable.has(`${p.team}-${p.piece_no}`)} aria-label={`${teamStyles[p.team].name}팀 ${p.piece_no+1}번 말`} className={`pointer-events-auto absolute z-20 grid h-11 w-11 touch-manipulation -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white/80 text-sm font-black text-black shadow-lg ${teamStyles[p.team].bg} disabled:cursor-default disabled:opacity-75 ${movable.has(`${p.team}-${p.piece_no}`)?"cursor-pointer ring-4 ring-white/60":""}`} style={{left:`calc(${Math.min(x,97)}% + ${(index%2)*13-13}px)`,top:`calc(${Math.min(y,96)}% + ${Math.floor(index/2)*13-13}px)`}}>{p.piece_no+1}</button>})}{teams.map(t=><div key={t} className="hidden"/>)}</div>
}
function Rules(){return <details className="mt-5 rounded-2xl border border-white/10 bg-white/[.025] p-4 text-sm text-zinc-300"><summary className="cursor-pointer font-bold text-amber-300">게임 방법</summary><ul className="mt-3 list-disc space-y-2 pl-5"><li>도·개·걸은 1·2·3칸, 윷·모는 4·5칸 이동하고 윷·모는 한 번 더 던집니다.</li><li>상대 말을 잡아도 한 번 더 던지며, 같은 팀 말끼리는 업어서 함께 움직입니다.</li><li>모서리에서 안쪽 길로 들어가 지름길을 이용합니다. 빽도는 판 위의 말을 한 칸 뒤로 움직입니다.</li><li>개인전은 각자, 팀전은 팀원이 공동으로 말 4개를 모두 완주하면 승리합니다.</li></ul></details>}
