alter table public.game_reviews
  add column if not exists round_id uuid references public.event_game_rounds(id) on delete cascade,
  add column if not exists event_id uuid references public.events(id) on delete set null,
  add column if not exists play_number integer,
  add column if not exists review_number integer;

alter table public.game_reviews
  drop constraint if exists game_reviews_game_id_user_id_key;

drop index if exists public.game_reviews_game_id_user_id_idx;

create unique index if not exists game_reviews_round_user_key
  on public.game_reviews(round_id, user_id)
  where round_id is not null;

create or replace function public.save_event_play_review(
  p_round_id uuid,
  p_rating integer,
  p_content text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_game_id uuid;
  target_event_id uuid;
  target_played_at timestamptz;
  display_name text;
  calculated_play_number integer;
  calculated_review_number integer;
  saved_id uuid;
begin
  if current_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_rating not between 1 and 5 then
    raise exception '별점은 1점부터 5점까지 입력해 주세요.';
  end if;
  if length(coalesce(p_content, '')) > 200 then
    raise exception '한줄평은 200자 이내로 입력해 주세요.';
  end if;

  select s.game_id, s.event_id, coalesce(r.created_at, e.started_at)
    into target_game_id, target_event_id, target_played_at
  from public.event_game_rounds r
  join public.event_game_sessions s on s.id = r.session_id
  join public.events e on e.id = s.event_id
  join public.event_round_players rp on rp.round_id = r.id
  where r.id = p_round_id and rp.user_id = current_user_id;

  if target_game_id is null then
    raise exception '본인이 실제 참여한 플레이 기록만 평가할 수 있습니다.';
  end if;

  select coalesce(nullif(trim(activity_name), ''), nullif(trim(nickname), ''), '보드라운지 회원')
    into display_name
  from public.profiles where id = current_user_id;

  select count(*) into calculated_play_number
  from public.event_round_players rp
  join public.event_game_rounds r on r.id = rp.round_id
  join public.event_game_sessions s on s.id = r.session_id
  where rp.user_id = current_user_id
    and s.game_id = target_game_id
    and coalesce(r.created_at, target_played_at) <= target_played_at;

  select count(*) + 1 into calculated_review_number
  from public.game_reviews gr
  where gr.user_id = current_user_id
    and gr.game_id = target_game_id
    and gr.round_id is not null
    and gr.round_id <> p_round_id;

  insert into public.game_reviews (
    game_id, user_id, author_name, rating, content, round_id, event_id,
    play_number, review_number, updated_at
  ) values (
    target_game_id, current_user_id, coalesce(display_name, '보드라운지 회원'),
    p_rating, nullif(trim(p_content), ''), p_round_id, target_event_id,
    calculated_play_number, calculated_review_number, now()
  )
  on conflict (round_id, user_id) where round_id is not null
  do update set
    rating = excluded.rating,
    content = excluded.content,
    author_name = excluded.author_name,
    play_number = excluded.play_number,
    updated_at = now()
  returning id into saved_id;

  return saved_id;
end;
$$;

revoke all on function public.save_event_play_review(uuid, integer, text) from public, anon;
grant execute on function public.save_event_play_review(uuid, integer, text) to authenticated;
