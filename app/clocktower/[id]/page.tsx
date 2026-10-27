import Link from 'next/link';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import ClocktowerLive from '@/components/events/ClocktowerLive';
export default async function Page({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const client=await createClient();const {data:{user}}=await client.auth.getUser();if(!user)redirect('/login');
 const {data:room,error}=await client.rpc('clocktower_world_rooms',{p_action:'details',p_room_id:id});
 if(error||!room)return <main className="min-h-screen bg-zinc-950 p-8 text-white"><h1 className="text-2xl font-bold">대기실에서 방에 입장해 주세요</h1><Link href="/clocktower" className="mt-6 inline-block text-violet-300">시계탑 대기실로 →</Link></main>;
 return <main className="min-h-screen bg-zinc-950 px-4 py-8 text-white sm:px-6"><div className="mx-auto max-w-6xl"><Link href="/clocktower" className="text-sm text-zinc-400">← 시계탑 대기실</Link><h1 className="mt-6 break-words text-2xl font-bold">{room.title}</h1><ClocktowerLive eventId={id} expectedRoomId={id} world/></div></main>;
}
