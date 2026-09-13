"use client";
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function MissionEditor({initial}:{initial:{questions:string[];messages:string[]}}){
 const [questions,setQuestions]=useState(initial.questions),[messages,setMessages]=useState(initial.messages);
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('');
 async function save(){
  setBusy(true);setStatus('');
  const {error}=await createClient().rpc('clocktower_save_mission_settings',{p_questions:questions.map(s=>s.trim()),p_messages:messages.map(s=>s.trim())});
  setBusy(false);setStatus(error?'저장하지 못했습니다. 각 문구를 1~300자로 입력하고 관리자 권한을 확인해 주세요.':'저장했습니다. 다음에 생성되는 밤 활동부터 적용됩니다.');
 }
 return <div className="mt-8 space-y-8">
  {([{title:'참가자 선택형 질문',items:questions,set:setQuestions,help:'참가자 한 명을 고르는 연습 질문입니다. 선택은 게임 판정에 영향을 주지 않습니다.'},{title:'확인형 안내 문구',items:messages,set:setMessages,help:'내용을 읽고 확인하는 보드라운지 안내입니다.'}]).map(({title,items,set,help})=><section key={title} className="rounded-2xl border border-white/15 p-4 sm:p-6">
   <h2 className="text-xl font-bold">{title}</h2><p className="mt-2 text-sm text-zinc-400">{help}</p>
   <div className="mt-4 space-y-3">{items.map((value,i)=><div key={i} className="flex items-start gap-2">
    <label className="flex-1"><span className="sr-only">{title} {i+1}</span><textarea disabled={busy} maxLength={300} rows={2} value={value} className="w-full resize-y rounded-xl border border-white/20 bg-zinc-900 p-3 text-base" onChange={e=>{set(items.map((v,j)=>j===i?e.target.value:v));setStatus('');}}/></label>
    <button disabled={busy||items.length===1} className="min-h-11 rounded-xl border border-white/20 px-3 disabled:opacity-40" aria-label={`${title} ${i+1} 삭제`} onClick={()=>{set(items.filter((_,j)=>j!==i));setStatus('');}}>삭제</button>
   </div>)}</div>
   <button disabled={busy||items.length>=100} className="mt-3 min-h-11 rounded-xl border border-violet-300/40 px-4 text-violet-200 disabled:opacity-40" onClick={()=>{set([...items,'']);setStatus('');}}>문구 추가</button>
  </section>)}
  <p className="text-sm text-zinc-400">선택형·확인형 모두 확인 버튼이 1~5초 뒤 활성화됩니다.</p>
  {status&&<p role="status" className="text-violet-200">{status}</p>}
  <button disabled={busy||[...questions,...messages].some(s=>!s.trim())} className="min-h-12 w-full rounded-xl bg-violet-400 p-3 font-bold text-black disabled:opacity-40" onClick={()=>void save()}>{busy?'저장 중…':'미션 문구 저장'}</button>
 </div>;
}
