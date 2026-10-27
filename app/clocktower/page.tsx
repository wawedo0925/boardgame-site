import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ClocktowerLobby from '@/components/clocktower/ClocktowerLobby';
export const metadata={title:'시계탑에 흐른 피 · 게임월드'};
export default async function Page(){
 const client=await createClient();const {data:{user}}=await client.auth.getUser();if(!user)redirect('/login');
 return <ClocktowerLobby/>;
}
