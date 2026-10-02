begin;

-- Deliberately independent of rooms: leaving/deleting a room keeps personal records.
create table public.tichu_personal_rounds (
  room_id uuid not null,
  round_no integer not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  game_mode text not null check (game_mode in ('TEAM', 'INDIVIDUAL')),
  score integer not null,
  declaration text check (declaration in ('SMALL', 'GRAND')),
  declaration_success boolean,
  first_place boolean not null,
  played_at timestamptz not null default now(),
  primary key (room_id, round_no, user_id)
);
alter table public.tichu_personal_rounds enable row level security;
revoke all on public.tichu_personal_rounds from anon, authenticated;
grant select on public.tichu_personal_rounds to authenticated;
create policy own_tichu_records on public.tichu_personal_rounds
  for select to authenticated using (user_id = (select auth.uid()));
create index on public.tichu_personal_rounds(user_id, played_at desc);

create function public.record_tichu_personal_round() returns trigger
language plpgsql security definer set search_path = public as $$
declare result jsonb; first_user uuid;
begin
  if jsonb_array_length(new.round_history) <= jsonb_array_length(old.round_history)
     or new.status not in ('ROUND_END', 'FINISHED') then return new; end if;
  -- A single AI excludes the entire round from all personal statistics.
  if (select count(*) from tichu_players where room_id=new.id) <> 4
     or exists(select 1 from tichu_players where room_id=new.id and is_bot) then return new; end if;
  result := new.round_history -> -1;
  first_user := (result->>'first_user')::uuid;
  insert into public.tichu_personal_rounds
    (room_id, round_no, user_id, game_mode, score, declaration, declaration_success, first_place)
  select new.id, new.round_no, p.user_id, new.game_mode,
    case when new.game_mode='INDIVIDUAL' then (result->'individual'->>p.user_id::text)::int
      when p.team=0 then (result->>'sky')::int else (result->>'pink')::int end,
    case when p.grand_called then 'GRAND' when p.small_called then 'SMALL' end,
    case when p.grand_called or p.small_called then p.user_id=first_user end,
    p.user_id=first_user
  from public.tichu_players p where p.room_id=new.id
  on conflict do nothing;
  return new;
end $$;
revoke all on function public.record_tichu_personal_round() from public, anon, authenticated;
create trigger tichu_personal_round_completed after update of round_history on public.tichu_rooms
  for each row execute function public.record_tichu_personal_round();

commit;
