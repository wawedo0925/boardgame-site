"use client";
import {useState} from 'react';
import type {LiveState} from '@/lib/clocktower/live';
import {emptyEngine,impaired} from '@/lib/clocktower/night';
import ClocktowerPopup from './ClocktowerPopup';
import ClocktowerSlayerAlert from './ClocktowerSlayerAlert';
const button='rounded-xl border border-white/20 p-3 disabled:opacity-40';
export default function ClocktowerSlayer({state,run,busy,allowPopup=true,error}:{allowPopup?:boolean;error?:string;state:LiveState;run:(action:string,data?:Record<string,unknown>)=>Promise<boolean>;busy:boolean}) {
 const [open,setOpen]=useState(false);const [actor,setActor]=useState('');const [target,setTarget]=useState('');const [recluse,setRecluse]=useState(false);
 const [seenShot,setSeenShot]=useState('');
 const members=state.members??[];const shots=state.shots??[];const pending=shots.find(s=>s.status==='PENDING');
 const who=state.is_host?actor:state.my_id;const blocked=(state.votes??[]).some(v=>v.status==='RUNNING');
 const mayDeclare=members.some(m=>m.user_id===who&&m.alive);
 const dead=!state.is_host&&!members.find(m=>m.user_id===state.my_id)?.alive;
 const source=members.find(m=>m.user_id===pending?.actor);const victim=members.find(m=>m.user_id===pending?.target);
 const actual=!!source?.alive&&source.actual_role==='처단자'&&!impaired(source,{...emptyEngine(),...state.engine},members);
 const kills=actual&&victim?.alive&&(victim.actual_role==='임프'||(victim.actual_role==='은둔자'&&!impaired(victim,{...emptyEngine(),...state.engine},members)&&recluse));
 const adjudication=pending&&<><p>이 선언은 아직 판정되지 않았습니다.</p><p>이야기꾼 전용: {actual?'정상 처단자 능력':'능력 효과 없음 (블러핑·사망·능력 무효)'}</p>{victim?.actual_role==='은둔자'&&<label className="flex gap-2"><input type="checkbox" checked={recluse} onChange={e=>setRecluse(e.target.checked)}/>이번에는 은둔자를 악마로 감지</label>}<p>판정 제안: {kills?`${victim?.name} 사망 · 승계와 승리 조건도 확인`:'아무 일도 일어나지 않음'}</p><button className={button} disabled={busy} onClick={async()=>{if(await run('slayer_resolve',{shot_id:pending.id,recluse_as_demon:recluse}))setRecluse(false);}}>판정 확정 · 공개</button>{error&&<p role="alert" className="text-red-300">{error}</p>}</>;
 return <section className="my-5 space-y-3 rounded-2xl border border-white/15 p-4"><h2 className="text-xl font-bold">처단자 공개 선언</h2><p className="text-sm text-zinc-400">살아 있는 참가자는 실제 역할과 관계없이 누구나 선언할 수 있습니다. 이 버튼은 처단자가 게임에 있는지 알려주지 않습니다. 선언은 게임당 한 번 기록합니다.</p>
 <button className={button} disabled={busy||dead||blocked||!!pending||(!state.is_host&&shots.some(s=>s.actor===who))} onClick={()=>setOpen(true)}>처단자 능력 사용 선언</button>
 {dead&&<p className="text-sm text-zinc-400">사망한 참가자는 처단자 능력을 사용할 수 없습니다.</p>}
 {blocked&&<p>현재 투표 집계가 끝나면 선언할 수 있습니다.</p>}
 {open&&<ClocktowerPopup title="모두에게 처단자 사용을 선언합니다" busy={busy} onClose={()=>setOpen(false)}><div className="space-y-4">{state.is_host&&<label className="block">선언한 사람<select className="block bg-zinc-900 p-3" value={actor} onChange={e=>setActor(e.target.value)}><option value="">선택</option>{members.filter(m=>m.alive&&!shots.some(s=>s.actor===m.user_id)).map(m=><option key={m.user_id} value={m.user_id}>{m.name}</option>)}</select></label>}<label className="block">대상<select className="block bg-zinc-900 p-3" value={target} onChange={e=>setTarget(e.target.value)}><option value="">선택</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.name}</option>)}</select></label><p>현장에서 모두에게 능력 사용을 말한 뒤 제출하세요. 제출한 선언은 취소할 수 없습니다.</p><button disabled={busy||blocked||!!pending||!mayDeclare||!target} className={button} onClick={async()=>{if(await run('slayer_declare',{actor:who,target})){setOpen(false);setRecluse(false);}}}>공개 선언 제출</button></div></ClocktowerPopup>}
 {state.is_host&&allowPopup&&!open&&pending&&seenShot!==pending.id&&<ClocktowerSlayerAlert key={pending.id} actor={source?.name??'참가자'} target={victim?.name??'참가자'} busy={busy} onClose={()=>setSeenShot(pending.id)}>{adjudication}</ClocktowerSlayerAlert>}
 {pending&&<div className="space-y-3 rounded-xl bg-violet-400/10 p-4"><p>{source?.name} → {victim?.name} · 이야기꾼 판정 대기</p>{state.is_host&&adjudication}</div>}
 {shots.filter(s=>s.status==='DONE').map(s=><p key={s.id}>{members.find(m=>m.user_id===s.actor)?.name} → {members.find(m=>m.user_id===s.target)?.name}: {s.killed?'대상이 사망했습니다.':'아무 일도 일어나지 않았습니다.'}</p>)}
 </section>;
}
