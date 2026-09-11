import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ClocktowerLive from '@/components/events/ClocktowerLive';

export default async function ClocktowerLivePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ room?: string }> }) {
  const { id } = await params;
  const { room } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: event } = await supabase.from('events').select('id,title,event_kind').eq('id', id).maybeSingle();
  if (!event || event.event_kind !== 'CLOCKTOWER') notFound();
  const [{ data: participant }, { data: canOperate }, { data: snapshot }] = await Promise.all([
    supabase.from('event_participants').select('user_id').eq('event_id', id).eq('user_id', user.id).maybeSingle(),
    supabase.rpc('can_operate_event', { target_event_id: id }),
    supabase.rpc('clocktower_live_snapshot', { p_event_id: id }),
  ]);
  if (!participant && !canOperate && !snapshot?.room) return <main className="min-h-screen bg-zinc-950 px-6 py-16 text-white"><div className="mx-auto max-w-xl rounded-3xl border border-violet-400/30 p-8"><h1 className="text-2xl font-bold">일정 참가 후 입장할 수 있습니다</h1><p className="mt-4 text-zinc-400">이 일정에 참가한 멤버와 이야기꾼이 함께 사용하는 시계탑 프로그램입니다.</p><Link href={`/events/${id}`} className="mt-6 inline-block rounded-xl bg-violet-400 px-5 py-3 font-bold text-zinc-950">일정으로 돌아가기</Link></div></main>;
  return <main className="min-h-screen bg-zinc-950 px-4 py-8 text-white sm:px-6">
    <div className="mx-auto max-w-6xl"><Link href={`/events/${id}`} className="text-sm text-zinc-400 hover:text-violet-300">← 이벤트로 돌아가기</Link>
      <p className="mt-6 text-sm font-semibold text-violet-300">시계탑 프로그램 · 점철되는 혼란</p>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{event.title}</h1>
      <ClocktowerLive eventId={id} expectedRoomId={room} />
    </div>
  </main>;
}
