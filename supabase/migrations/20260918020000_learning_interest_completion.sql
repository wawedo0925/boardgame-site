begin;

-- Remember completed participations so editing an old result cannot consume a new request.
create table public.boardgame_learning_completions (
  round_id uuid not null references public.event_game_rounds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (round_id, user_id)
);
alter table public.boardgame_learning_completions enable row level security;
revoke all on public.boardgame_learning_completions from public, anon, authenticated;

-- Existing results are history, not new plays; preserve all current requests.
insert into public.boardgame_learning_completions(round_id, user_id)
select round_id, user_id from public.event_round_players
where not coalesce(is_gm, false)
  and (score is not null or rank is not null or is_winner is not null)
on conflict do nothing;

create function public.complete_boardgame_learning_interest()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_game uuid;
begin
  if coalesce(new.is_gm, false) or
    (new.score is null and new.rank is null and new.is_winner is null) then
    return new;
  end if;
  insert into public.boardgame_learning_completions(round_id, user_id)
  values(new.round_id, new.user_id) on conflict do nothing;
  if not found then return new; end if;

  select s.game_id into target_game from public.event_game_rounds r
  join public.event_game_sessions s on s.id = r.session_id where r.id = new.round_id;
  delete from public.boardgame_learning_interests
  where game_id = target_game and user_id = new.user_id
    and created_at <= statement_timestamp();
  return new;
end;
$$;
revoke all on function public.complete_boardgame_learning_interest() from public, anon, authenticated;
create trigger complete_boardgame_learning_interest
after insert or update on public.event_round_players
for each row execute function public.complete_boardgame_learning_interest();

commit;
