import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ClocktowerLive from '@/components/events/ClocktowerLive';

export default async function ClocktowerLivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: event } = await supabase.from('events').select('id,title,event_kind').eq('id', id).maybeSingle();
  if (!event || event.event_kind !== 'CLOCKTOWER') notFound();
  return <main className="min-h-screen bg-zinc-950 px-4 py-8 text-white sm:px-6">
    <div className="mx-auto max-w-6xl"><Link href={`/events/${id}`} className="text-sm text-zinc-400 hover:text-violet-300">← 이벤트로 돌아가기</Link>
      <p className="mt-6 text-sm font-semibold text-violet-300">점철되는 혼란 · 밤 진행 도우미</p>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{event.title}</h1>
      <ClocktowerLive eventId={id} />
    </div>
  </main>;
}
