begin;

create or replace function public.tichu_leave_room(p_room uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare room_row public.tichu_rooms%rowtype;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into room_row from public.tichu_rooms where id=p_room for update;
  if not found then return; end if;
  if not exists(select 1 from public.tichu_players where room_id=p_room and user_id=auth.uid()) then return; end if;

  -- A host leaving closes the room for everyone, regardless of game phase.
  if room_row.host_id=auth.uid() then
    delete from public.tichu_rooms where id=p_room;
    return;
  end if;

  if room_row.status='WAITING' then
    delete from public.tichu_players where room_id=p_room and user_id=auth.uid();
    update public.tichu_rooms set revision=revision+1,updated_at=now() where id=p_room;
  else
    update public.tichu_rooms
    set status='FINISHED',turn_seat=null,turn_deadline=null,winner_team=null,
        revision=revision+1,updated_at=now()
    where id=p_room;
    delete from public.tichu_players where room_id=p_room and user_id=auth.uid();
  end if;
end $$;

create or replace function public.tichu_lobby() returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',r.id,'title',r.title,'status',r.status,
   'players',(select count(*) from tichu_players p where p.room_id=r.id),
   'mine',exists(select 1 from tichu_players p where p.room_id=r.id and p.user_id=auth.uid()),
   'host_name',coalesce(pr.activity_name,'멤버'),
   'target_score',r.target_score,'turn_seconds',r.turn_seconds
 ) order by r.created_at desc),'[]'::jsonb)
 from tichu_rooms r
 left join profiles pr on pr.id=r.host_id
 where r.status<>'FINISHED'
$$;

revoke all on function public.tichu_leave_room(uuid) from public,anon;
grant execute on function public.tichu_leave_room(uuid) to authenticated;
revoke all on function public.tichu_lobby() from public,anon;
grant execute on function public.tichu_lobby() to authenticated;

commit;
