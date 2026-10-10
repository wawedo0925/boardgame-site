begin;

alter table public.yut_rooms
  add column if not exists finish_order int[] not null default '{}';

create or replace function public.yut_continue_until_last()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  ordered_teams int[]:=coalesce(new.finish_order,'{}');
  total_teams int;
  remaining_team int;
  candidate_seat int;
  offset_no int;
begin
  select count(distinct team) into total_teams
  from public.yut_players
  where room_id=new.id;

  if new.status='FINISHED' and new.winner_team is not null then
    if not (new.winner_team=any(ordered_teams)) then
      ordered_teams:=array_append(ordered_teams,new.winner_team);
    end if;

    if cardinality(ordered_teams)<greatest(total_teams-1,1) then
      new.status:='PLAYING';
      new.winner_team:=null;
      new.pending_moves:='{}';
      new.can_roll:=true;
      new.last_roll:=null;
      new.turn_seat:=(old.turn_seat+1)%new.max_players;
    else
      select team into remaining_team
      from public.yut_players
      where room_id=new.id and not (team=any(ordered_teams))
      order by seat
      limit 1;
      if remaining_team is not null then
        ordered_teams:=array_append(ordered_teams,remaining_team);
      end if;
      new.finish_order:=ordered_teams;
      new.winner_team:=ordered_teams[1];
      return new;
    end if;
  end if;

  new.finish_order:=ordered_teams;

  if new.status='PLAYING' and new.turn_seat is not null then
    for offset_no in 0..greatest(new.max_players-1,0) loop
      candidate_seat:=(new.turn_seat+offset_no)%new.max_players;
      if exists(
        select 1 from public.yut_players p
        where p.room_id=new.id
          and p.seat=candidate_seat
          and not (p.team=any(ordered_teams))
      ) then
        new.turn_seat:=candidate_seat;
        return new;
      end if;
    end loop;
  end if;

  return new;
end $$;

drop trigger if exists yut_continue_until_last_trigger on public.yut_rooms;
create trigger yut_continue_until_last_trigger
before update on public.yut_rooms
for each row execute function public.yut_continue_until_last();

commit;
