begin;
create table public.boardgame_learning_interests (
 game_id uuid not null references public.games(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(game_id,user_id)
);
alter table public.boardgame_learning_interests enable row level security;
revoke all on public.boardgame_learning_interests from public,anon,authenticated;
grant select,insert,delete on public.boardgame_learning_interests to authenticated;
create policy learning_read on public.boardgame_learning_interests for select to authenticated using(true);
create policy learning_register on public.boardgame_learning_interests for insert to authenticated with check(user_id=auth.uid());
create policy learning_cancel on public.boardgame_learning_interests for delete to authenticated using(user_id=auth.uid());
create function public.boardgame_learning_overview(p_game_id uuid default null) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(item order by learner_count desc,game_name), '[]'::jsonb) from (
   select g.name as game_name,count(i.user_id) as learner_count,
   jsonb_build_object('game_id',g.id,'name',g.name,'count',count(i.user_id),
    'registered',coalesce(bool_or(i.user_id=auth.uid()),false),
    'members',coalesce(jsonb_agg(jsonb_build_object('user_id',i.user_id,'name',coalesce(p.activity_name,'멤버')) order by i.created_at,i.user_id) filter(where i.user_id is not null),'[]'::jsonb)) as item
   from public.games g left join public.boardgame_learning_interests i on i.game_id=g.id
   left join public.profiles p on p.id=i.user_id
   where auth.uid() is not null and (p_game_id is null or g.id=p_game_id)
   group by g.id,g.name having p_game_id is not null or count(i.user_id)>0
 ) overview;
$$;
revoke all on function public.boardgame_learning_overview(uuid) from public,anon;
grant execute on function public.boardgame_learning_overview(uuid) to authenticated;
commit;
