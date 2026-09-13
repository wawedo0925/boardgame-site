import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import MissionEditor from './MissionEditor';

export default async function ClocktowerMissionsPage() {
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/login');
  const {data:admin}=await supabase.rpc('is_main_admin');
  if(!admin)redirect('/');
  const {data,error}=await supabase.from('clocktower_mission_settings').select('questions,messages').eq('id',true).single();
  return <main className="min-h-screen bg-zinc-950 px-5 py-14 text-white"><section className="mx-auto max-w-3xl">
    <Link href="/admin" className="text-sm text-zinc-400">← 관리자 페이지</Link>
    <h1 className="mt-5 text-3xl font-bold">시계탑 미션 수정</h1>
    <p className="mt-3 text-sm leading-6 text-zinc-400">밤에 참가자에게 무작위로 보여줄 질문과 안내 문구입니다. 저장 후 새로 생성되는 활동부터 적용됩니다. 이미 도착한 안내는 바뀌지 않습니다.</p>
    {error||!data?<p role="alert" className="mt-8 text-red-300">설정을 불러오지 못했습니다. 새로고침해 주세요.</p>:<MissionEditor initial={data}/>}
  </section></main>;
}
