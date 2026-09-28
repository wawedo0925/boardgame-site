begin;

create or replace function public.tichu_set_target_score(p_room uuid,p_target_score int)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare room_row public.tichu_rooms%rowtype;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into room_row from public.tichu_rooms where id=p_room for update;
  if not found then raise exception '방을 찾을 수 없습니다.'; end if;
  if room_row.host_id<>auth.uid() then raise exception '방장만 목표 점수를 변경할 수 있습니다.'; end if;
  if room_row.status<>'WAITING' then raise exception '게임 시작 전 대기방에서만 변경할 수 있습니다.'; end if;
  if p_target_score<100 or p_target_score>5000 then raise exception '목표 점수는 100점부터 5,000점까지 설정할 수 있습니다.'; end if;
  update public.tichu_rooms
  set target_score=p_target_score,revision=revision+1,updated_at=now()
  where id=p_room;
end $$;

revoke all on function public.tichu_set_target_score(uuid,int) from public,anon;
grant execute on function public.tichu_set_target_score(uuid,int) to authenticated;

commit;
