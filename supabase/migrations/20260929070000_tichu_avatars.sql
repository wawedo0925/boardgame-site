begin;

alter table public.profiles
  add column if not exists tichu_avatar int not null default 0
  check (tichu_avatar between 0 and 15),
  add column if not exists tichu_accessory int not null default 0
  check (tichu_accessory between 0 and 15),
  add column if not exists tichu_frame int not null default 0
  check (tichu_frame between 0 and 7);

create or replace function public.tichu_my_avatar()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select coalesce((select jsonb_build_object('avatar',tichu_avatar,'accessory',tichu_accessory,'frame',tichu_frame) from public.profiles where id=auth.uid()),'{"avatar":0,"accessory":0,"frame":0}'::jsonb)
$$;

create or replace function public.tichu_set_avatar(p_avatar int,p_accessory int,p_frame int)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_avatar not between 0 and 15 or p_accessory not between 0 and 15 or p_frame not between 0 and 7 then raise exception '올바른 아바타를 선택해 주세요.'; end if;
  update public.profiles set tichu_avatar=p_avatar,tichu_accessory=p_accessory,tichu_frame=p_frame,updated_at=now() where id=auth.uid();
  if not found then raise exception '프로필을 먼저 저장해 주세요.'; end if;
  return jsonb_build_object('avatar',p_avatar,'accessory',p_accessory,'frame',p_frame);
end $$;

revoke all on function public.tichu_my_avatar() from public,anon;
grant execute on function public.tichu_my_avatar() to authenticated;
revoke all on function public.tichu_set_avatar(int,int,int) from public,anon;
grant execute on function public.tichu_set_avatar(int,int,int) to authenticated;

-- Include each player's lightweight avatar key in the existing room snapshot.
create or replace function public.tichu_snapshot(p_room uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'room',to_jsonb(r),
  'me',jsonb_build_object('user_id',auth.uid(),'seat',me.seat,'team',me.team,'cards',coalesce(h.cards,'{}'),'ready',me.ready,'grand_choice',me.grand_choice,'grand_called',me.grand_called,'small_called',me.small_called,'has_played',me.has_played),
  'players',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.user_id,'seat',p.seat,'team',p.team,'name',coalesce(pr.activity_name,'멤버'),'gender',pr.gender,'avatar',coalesce(pr.tichu_avatar,0),'accessory',coalesce(pr.tichu_accessory,0),'frame',coalesce(pr.tichu_frame,0),'count',coalesce(cardinality(hh.cards),0),'ready',p.ready,'grand_choice',p.grand_choice,'grand_called',p.grand_called,'small_called',p.small_called,'finish_order',f.finish_order) order by p.seat) from tichu_players p left join profiles pr on pr.id=p.user_id left join tichu_hands hh using(room_id,user_id) left join tichu_finished f using(room_id,user_id) where p.room_id=r.id),'[]'::jsonb),
  'exchange_count',(select count(*) from tichu_exchanges e where room_id=r.id and (select count(*) from jsonb_object_keys(e.gifts))=3),
  'my_gifts',coalesce((select gifts from tichu_exchanges where room_id=r.id and user_id=auth.uid()),'{}'::jsonb),
  'received',coalesce((select jsonb_agg(jsonb_build_object('card',x.card,'from_user_id',x.from_user_id,'from_name',coalesce(pr.activity_name,'멤버'))) from tichu_received_cards x left join profiles pr on pr.id=x.from_user_id where x.room_id=r.id and x.user_id=auth.uid()),'[]'::jsonb)
 ) from tichu_rooms r join tichu_players me on me.room_id=r.id and me.user_id=auth.uid() left join tichu_hands h on h.room_id=r.id and h.user_id=auth.uid() where r.id=p_room;
$$;

revoke all on function public.tichu_snapshot(uuid) from public,anon;
grant execute on function public.tichu_snapshot(uuid) to authenticated;

commit;
