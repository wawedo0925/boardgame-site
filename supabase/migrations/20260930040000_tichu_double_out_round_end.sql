begin;

create or replace function public.tichu_finish_double_out()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  room_status text;
  double_team int;
begin
  select status into room_status
  from public.tichu_rooms
  where id=new.room_id;

  if room_status<>'PLAYING' or new.finish_order<>2 then
    return new;
  end if;

  select p.team into double_team
  from public.tichu_finished f
  join public.tichu_players p using(room_id,user_id)
  where f.room_id=new.room_id and f.finish_order in(1,2)
  group by p.team
  having count(*)=2;

  if double_team is not null then
    perform public.tichu_end_round(new.room_id);
  end if;

  return new;
end
$$;

drop trigger if exists tichu_finish_double_out_trigger on public.tichu_finished;
create trigger tichu_finish_double_out_trigger
after insert on public.tichu_finished
for each row execute function public.tichu_finish_double_out();

revoke all on function public.tichu_finish_double_out() from public,anon,authenticated;

-- Repair any round that was already left playing after teammates placed first and second.
do $$
declare
  stuck_room uuid;
begin
  for stuck_room in
    select r.id
    from public.tichu_rooms r
    where r.status='PLAYING'
      and exists(
        select 1
        from public.tichu_finished f
        join public.tichu_players p using(room_id,user_id)
        where f.room_id=r.id and f.finish_order in(1,2)
        group by p.team
        having count(*)=2
      )
  loop
    perform public.tichu_end_round(stuck_room);
  end loop;
end
$$;

commit;
