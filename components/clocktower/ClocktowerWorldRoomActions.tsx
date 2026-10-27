'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';
export default function ClocktowerWorldRoomActions({id,host,preparing}:{id:string;host:boolean;preparing:boolean}){
 const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function leave(){if(!confirm(host?'준비 중인 방을 닫을까요?':'준비방 참가를 취소할까요?'))return;setBusy(true);setMessage('');try{const {error}=await createClient().rpc('clocktower_world_rooms',{p_action:host?'close':'leave',p_room_id:id});if(error)throw error;router.push('/clocktower');}catch(e){setMessage(typeof e==='object'&&e&&'message'in e?String(e.message):'다시 시도해 주세요.');}finally{setBusy(false);}}
 return <div className="my-4"><div className="flex flex-wrap gap-3"><button className="rounded-xl border border-white/20 px-4 py-2 text-sm" onClick={async()=>{try{await navigator.clipboard.writeText(`${location.origin}/clocktower`);setMessage('대기실 링크를 복사했어요. 방 이름을 알려주면 멤버가 찾아올 수 있습니다.');}catch{setMessage('주소창의 링크를 복사해 주세요.');}}}>대기실 링크 복사</button>{preparing&&<button disabled={busy} className="rounded-xl border border-white/20 px-4 py-2 text-sm disabled:opacity-40" onClick={()=>void leave()}>{host?'준비방 닫기':'준비방 참가 취소'}</button>}</div><p className="mt-2 text-xs text-zinc-500">진행 중에는 대기실로 나가도 참가 상태가 유지됩니다.</p>{message&&<p role="status" className="mt-3 text-sm text-violet-200">{message}</p>}</div>;
}
