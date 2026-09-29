begin;

alter table public.tichu_rooms
  add column if not exists spectators_allowed boolean not null default true;

create table if not exists public.tichu_spectators (
  room_id uuid not null references public.tichu_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id,user_id)
);
alter table public.tichu_spectators enable row level security;
revoke all on public.tichu_spectators from public,anon,authenticated;

create or replace function public.tichu_watch_room(p_room uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare r public.tichu_rooms%rowtype;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into r from tichu_rooms where id=p_room;
  if not found then raise exception '방을 찾을 수 없습니다.'; end if;
  if exists(select 1 from tichu_players where room_id=p_room and user_id=auth.uid()) then return p_room; end if;
  if r.status='WAITING' then raise exception '대기 중인 방은 관전할 수 없습니다.'; end if;
  if r.status='FINISHED' then raise exception '종료된 방입니다.'; end if;
  if not r.spectators_allowed then raise exception '이 방은 관전을 허용하지 않습니다.'; end if;
  if exists(select 1 from tichu_players p join tichu_rooms rr on rr.id=p.room_id where p.user_id=auth.uid() and rr.status<>'FINISHED') then
    raise exception '참여 중인 방에서는 다른 방을 관전할 수 없습니다.';
  end if;
  insert into tichu_spectators(room_id,user_id) values(p_room,auth.uid()) on conflict do nothing;
  return p_room;
end $$;

create or replace function public.tichu_leave_spectator(p_room uuid) returns void
language sql security definer set search_path=public as $$
  delete from tichu_spectators where room_id=p_room and user_id=auth.uid()
$$;

create or replace function public.tichu_set_spectators_allowed(p_room uuid,p_allowed boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from tichu_rooms where id=p_room and host_id=auth.uid() and status='WAITING') then
    raise exception '대기실의 방장만 관전 설정을 바꿀 수 있습니다.';
  end if;
  update tichu_rooms set spectators_allowed=p_allowed,revision=revision+1,updated_at=now() where id=p_room;
  if not p_allowed then delete from tichu_spectators where room_id=p_room; end if;
end $$;

create or replace function public.tichu_lobby() returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',r.id,'title',r.title,'status',r.status,
   'players',(select count(*) from tichu_players p where p.room_id=r.id),
   'spectators',(select count(*) from tichu_spectators s where s.room_id=r.id),
   'mine',exists(select 1 from tichu_players p where p.room_id=r.id and p.user_id=auth.uid()),
   'spectating',exists(select 1 from tichu_spectators s where s.room_id=r.id and s.user_id=auth.uid()),
   'spectators_allowed',r.spectators_allowed,
   'host_name',coalesce(pr.activity_name,'멤버'),
   'target_score',r.target_score,'turn_seconds',r.turn_seconds
 ) order by r.created_at desc),'[]'::jsonb)
 from tichu_rooms r left join profiles pr on pr.id=r.host_id
 where r.status<>'FINISHED'
$$;

create or replace function public.tichu_snapshot(p_room uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'room',to_jsonb(r),
  'spectator',(me.user_id is null),
  'viewer_name',coalesce(viewer.activity_name,'멤버'),
  'me',jsonb_build_object('user_id',auth.uid(),'seat',me.seat,'team',me.team,'cards',case when me.user_id is null then '[]'::jsonb else to_jsonb(coalesce(h.cards,'{}')) end,'ready',coalesce(me.ready,false),'grand_choice',me.grand_choice,'grand_called',coalesce(me.grand_called,false),'small_called',coalesce(me.small_called,false),'has_played',coalesce(me.has_played,false)),
  'players',coalesce((select jsonb_agg(jsonb_build_object(
    'user_id',p.user_id,'seat',p.seat,'team',p.team,'name',case when p.is_bot then p.bot_name else coalesce(pr.activity_name,'멤버') end,'gender',pr.gender,'is_bot',p.is_bot,'bot_difficulty',p.bot_difficulty,
    'avatar',case when p.is_bot then (p.seat+8)%16 else coalesce(pr.tichu_avatar,0) end,'skin',coalesce(pr.tichu_skin,1),'hairColor',case when p.is_bot then (p.seat+1)%8 else coalesce(pr.tichu_hair_color,0) end,
    'expression',case when p.is_bot then 2 else coalesce(pr.tichu_expression,0) end,'outfit',coalesce(pr.tichu_outfit,0),'accessory',coalesce(pr.tichu_accessory,0),'frame',coalesce(pr.tichu_frame,0),
    'count',coalesce(cardinality(hh.cards),0),'ready',p.ready,'grand_choice',p.grand_choice,'grand_called',p.grand_called,'small_called',p.small_called,'finish_order',f.finish_order
  ) order by p.seat) from tichu_players p left join profiles pr on pr.id=p.user_id left join tichu_hands hh using(room_id,user_id) left join tichu_finished f using(room_id,user_id) where p.room_id=r.id),'[]'::jsonb),
  'exchange_count',(select count(*) from tichu_exchanges e where room_id=r.id and (select count(*) from jsonb_object_keys(e.gifts))=3),
  'my_gifts',case when me.user_id is null then '{}'::jsonb else coalesce((select gifts from tichu_exchanges where room_id=r.id and user_id=auth.uid()),'{}'::jsonb) end,
  'received',case when me.user_id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('card',x.card,'from_user_id',x.from_user_id,'from_name',case when fp.is_bot then fp.bot_name else coalesce(pr.activity_name,'멤버') end)) from tichu_received_cards x left join profiles pr on pr.id=x.from_user_id left join tichu_players fp on fp.room_id=x.room_id and fp.user_id=x.from_user_id where x.room_id=r.id and x.user_id=auth.uid()),'[]'::jsonb) end
 )
 from tichu_rooms r
 left join tichu_players me on me.room_id=r.id and me.user_id=auth.uid()
 left join tichu_hands h on h.room_id=r.id and h.user_id=auth.uid()
 left join profiles viewer on viewer.id=auth.uid()
 where r.id=p_room and (me.user_id is not null or exists(select 1 from tichu_spectators s where s.room_id=r.id and s.user_id=auth.uid()));
$$;

revoke all on function public.tichu_watch_room(uuid) from public,anon;
revoke all on function public.tichu_leave_spectator(uuid) from public,anon;
revoke all on function public.tichu_set_spectators_allowed(uuid,boolean) from public,anon;
grant execute on function public.tichu_watch_room(uuid) to authenticated;
grant execute on function public.tichu_leave_spectator(uuid) to authenticated;
grant execute on function public.tichu_set_spectators_allowed(uuid,boolean) to authenticated;
revoke all on function public.tichu_lobby() from public,anon;
grant execute on function public.tichu_lobby() to authenticated;

commit;
