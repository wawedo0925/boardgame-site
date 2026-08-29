alter table public.game_reviews
  add column if not exists clocktower_difficulty text,
  add column if not exists character_name text,
  add column if not exists character_tip text;

create table if not exists public.clocktower_tip_votes (
  review_id uuid not null references public.game_reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

alter table public.clocktower_tip_votes enable row level security;
grant select on table public.clocktower_tip_votes to anon, authenticated;
grant insert, delete on table public.clocktower_tip_votes to authenticated;
drop policy if exists "clocktower tip votes readable" on public.clocktower_tip_votes;
create policy "clocktower tip votes readable" on public.clocktower_tip_votes for select using (true);
drop policy if exists "members create own clocktower tip votes" on public.clocktower_tip_votes;
create policy "members create own clocktower tip votes" on public.clocktower_tip_votes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "members delete own clocktower tip votes" on public.clocktower_tip_votes;
create policy "members delete own clocktower tip votes" on public.clocktower_tip_votes for delete to authenticated using (user_id = auth.uid());

create or replace function public.save_clocktower_event_results(
  p_event_id uuid,
  p_difficulty text,
  p_winning_faction text,
  p_assignments jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  target_game_id uuid;
  target_session_id uuid;
  target_round_id uuid;
  assignment jsonb;
  target_user_id uuid;
  target_character text;
  target_type text;
  target_faction text;
begin
  if not public.can_operate_event(p_event_id) then raise exception '이 이벤트의 결과를 기록할 권한이 없습니다.'; end if;
  if p_winning_faction not in ('선','악') then raise exception '승리 진영을 선택해 주세요.'; end if;
  select id into target_game_id from public.games where name ilike '%시계탑에 흐른 피%' order by name limit 1;
  if target_game_id is null then raise exception '보드게임 목록에 시계탑에 흐른 피를 먼저 등록해 주세요.'; end if;

  select id into target_session_id from public.event_game_sessions where event_id=p_event_id and game_id=target_game_id order by created_at limit 1;
  if target_session_id is null then
    insert into public.event_game_sessions(event_id,game_id,result_type,created_by)
    values(p_event_id,target_game_id,'ROLE',auth.uid()) returning id into target_session_id;
  end if;
  select id into target_round_id from public.event_game_rounds where session_id=target_session_id order by round_number limit 1;
  if target_round_id is null then
    insert into public.event_game_rounds(session_id,round_number,created_by)
    values(target_session_id,1,auth.uid()) returning id into target_round_id;
  end if;

  delete from public.event_round_players where round_id=target_round_id;
  for assignment in select * from jsonb_array_elements(coalesce(p_assignments,'[]'::jsonb)) loop
    target_user_id := (assignment->>'user_id')::uuid;
    target_character := nullif(trim(assignment->>'character_name'),'');
    target_type := nullif(trim(assignment->>'character_type'),'');
    target_faction := nullif(trim(assignment->>'faction'),'');
    if target_character is null or target_faction not in ('선','악') then raise exception '모든 멤버의 캐릭터를 선택해 주세요.'; end if;
    if not exists(select 1 from public.event_participants where event_id=p_event_id and user_id=target_user_id) then raise exception '참가자가 아닌 회원은 기록할 수 없습니다.'; end if;
    insert into public.event_round_players(round_id,user_id,role_name,team_name,is_winner,updated_at)
    values(target_round_id,target_user_id,target_character,concat(p_difficulty,' · ',target_type,' · ',target_faction),target_faction=p_winning_faction,now());
  end loop;
  return target_round_id;
end; $$;

revoke all on function public.save_clocktower_event_results(uuid,text,text,jsonb) from public,anon;
grant execute on function public.save_clocktower_event_results(uuid,text,text,jsonb) to authenticated;

create or replace function public.save_clocktower_play_review(
  p_round_id uuid,
  p_rating integer,
  p_content text default null,
  p_character_tip text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare saved_id uuid; target_role text; target_team text;
begin
  if length(coalesce(p_character_tip,'')) > 1000 then raise exception '캐릭터 팁은 1,000자 이내로 입력해 주세요.'; end if;
  select role_name,team_name into target_role,target_team from public.event_round_players where round_id=p_round_id and user_id=auth.uid();
  if target_role is null then raise exception '기록된 캐릭터가 없습니다.'; end if;
  saved_id := public.save_event_play_review(p_round_id,p_rating,p_content);
  update public.game_reviews set character_name=target_role,
    clocktower_difficulty=split_part(coalesce(target_team,''),' · ',1),
    character_tip=nullif(trim(p_character_tip),'') where id=saved_id;
  return saved_id;
end; $$;

revoke all on function public.save_clocktower_play_review(uuid,integer,text,text) from public,anon;
grant execute on function public.save_clocktower_play_review(uuid,integer,text,text) to authenticated;
