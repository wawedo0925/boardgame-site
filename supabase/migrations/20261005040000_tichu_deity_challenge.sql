begin;

alter table public.tichu_players drop constraint if exists tichu_players_bot_difficulty_check;
alter table public.tichu_players add constraint tichu_players_bot_difficulty_check
  check (bot_difficulty in ('beginner', 'intermediate', 'advanced', 'god', 'deity'));

create table if not exists public.tichu_deity_title (
  singleton boolean primary key default true check (singleton),
  holder_user_id uuid references auth.users(id) on delete set null,
  display_name text not null default '티츄신',
  conquered_at timestamptz
);
alter table public.tichu_deity_title enable row level security;
insert into public.tichu_deity_title(singleton, display_name)
values(true, '티츄신') on conflict(singleton) do nothing;

create or replace function public.tichu_deity_name()
returns text language sql stable security definer set search_path=public as $$
  select display_name from public.tichu_deity_title where singleton
$$;
revoke all on function public.tichu_deity_name() from public, anon;
grant execute on function public.tichu_deity_name() to authenticated;

-- Unlike ordinary God AI, the challenge boss deliberately reads the nearest
-- human opponent's hand. It enumerates that hand's legal answers, then chooses
-- a legal play that the human cannot counter whenever one exists.
create or replace function public.tichu_deity_best_play(
  p_room uuid,
  p_bot uuid,
  p_bot_team int,
  p_hand int[],
  p_lead jsonb,
  p_wish_rank int default null
) returns int[]
language plpgsql stable security definer set search_path=public as $$
declare
  base_play int[];
  bot_seat int;
  target_hand int[];
  target_count int;
  n int := cardinality(p_hand);
  hn int;
  mask int;
  i int;
  subset int[];
  made jsonb;
  legal boolean;
  key_name text;
  ceilings jsonb := '{}';
  bomb_four numeric := 0;
  bomb_straight_size int := 0;
  bomb_straight_strength numeric := 0;
  answerable int;
  finish_cost int;
  special_cost int;
  shape_cost int;
  best int[] := '{}';
  best_key numeric[];
  candidate_key numeric[];
  wish_required boolean;
begin
  base_play := public.tichu_god_counted_play(
    p_room, p_bot, p_bot_team, p_hand, p_lead, p_wish_rank
  );
  if n is null or n = 0 then return base_play; end if;

  select seat into bot_seat from public.tichu_players
  where room_id=p_room and user_id=p_bot;
  select h.cards, cardinality(h.cards) into target_hand, target_count
  from public.tichu_players p join public.tichu_hands h using(room_id,user_id)
  where p.room_id=p_room and not p.is_bot and cardinality(h.cards)>0
  order by ((p.seat-bot_seat+4)%4), cardinality(h.cards) limit 1;
  if target_hand is null then return base_play; end if;

  -- Build an exact response ceiling from the human's hidden hand once. The
  -- chooser below can then test every bot play without nested exponential work.
  hn := cardinality(target_hand);
  for mask in 1..(power(2, hn)::int - 1) loop
    subset := '{}';
    for i in 1..hn loop
      if (mask / power(2, i-1)::int) % 2 = 1 then
        subset := array_append(subset, target_hand[i]);
      end if;
    end loop;
    if 53=any(subset) then continue; end if;
    made := public.tichu_classify_cards(subset, null);
    if made is null then continue; end if;
    if (made->>'bomb')::boolean then
      if made->>'kind'='four' then bomb_four:=greatest(bomb_four,(made->>'strength')::numeric);
      else
        if (made->>'size')::int > bomb_straight_size or
          ((made->>'size')::int=bomb_straight_size and (made->>'strength')::numeric>bomb_straight_strength)
        then bomb_straight_size:=(made->>'size')::int; bomb_straight_strength:=(made->>'strength')::numeric; end if;
      end if;
    else
      key_name := (made->>'kind')||':'||(made->>'size');
      ceilings := jsonb_set(
        ceilings, array[key_name],
        to_jsonb(greatest(coalesce((ceilings->>key_name)::numeric,0),(made->>'strength')::numeric)), true
      );
    end if;
  end loop;

  wish_required := p_wish_rank is not null and exists(
    select 1 from unnest(p_hand)c where c<52 and c/4+2=p_wish_rank
  );
  for mask in 1..(power(2,n)::int - 1) loop
    subset := '{}';
    for i in 1..n loop
      if (mask / power(2,i-1)::int)%2=1 then subset:=array_append(subset,p_hand[i]); end if;
    end loop;
    if 53=any(subset) and (p_lead is not null or cardinality(subset)<>1) then continue; end if;
    if wish_required and not exists(select 1 from unnest(subset)c where c<52 and c/4+2=p_wish_rank) then continue; end if;
    made:=public.tichu_classify_cards(subset,p_lead);
    if made is null then continue; end if;
    if cardinality(subset)<n and (
      (select count(*) from unnest(subset)c where c between 48 and 51)>=2 or
      (54=any(subset) and (made->>'strength')::numeric=14 and made->>'kind' in('pair','triple','full','pair-straight'))
    ) then continue; end if;
    legal:=p_lead is null or
      ((made->>'bomb')::boolean and not coalesce((p_lead->>'bomb')::boolean,false)) or
      ((made->>'bomb')::boolean and coalesce((p_lead->>'bomb')::boolean,false) and
        ((made->>'size')::int>(p_lead->>'size')::int or ((made->>'size')::int=(p_lead->>'size')::int and (made->>'strength')::numeric>(p_lead->>'strength')::numeric))) or
      (not coalesce((p_lead->>'bomb')::boolean,false) and made->>'kind'=p_lead->>'kind' and
        (made->>'size')::int=(p_lead->>'size')::int and (made->>'strength')::numeric>(p_lead->>'strength')::numeric);
    if not legal then continue; end if;

    answerable:=0;
    if (made->>'bomb')::boolean then
      if made->>'kind'='four' then
        if bomb_four>(made->>'strength')::numeric or bomb_straight_size>0 then answerable:=1; end if;
      elsif bomb_straight_size>(made->>'size')::int or
        (bomb_straight_size=(made->>'size')::int and bomb_straight_strength>(made->>'strength')::numeric)
      then answerable:=1; end if;
    else
      key_name:=(made->>'kind')||':'||(made->>'size');
      if coalesce((ceilings->>key_name)::numeric,0)>(made->>'strength')::numeric or bomb_four>0 or bomb_straight_size>0
      then answerable:=1; end if;
    end if;

    finish_cost:=case when cardinality(subset)=n then 0 else 1 end;
    special_cost:=(case when 55=any(subset) then 5 else 0 end)
      +(case when 54=any(subset) then 2 else 0 end)
      +(case when (made->>'bomb')::boolean then 6 else 0 end);
    shape_cost:=(select count(distinct c/4+2) from unnest(array(select c from unnest(p_hand)c where not c=any(subset)))c where c<52)
      +(select count(*) from unnest(array(select c from unnest(p_hand)c where not c=any(subset)))c where c>=52);
    candidate_key:=array[
      finish_cost::numeric,
      answerable::numeric,
      shape_cost::numeric,
      special_cost::numeric,
      -cardinality(subset)::numeric,
      (made->>'strength')::numeric
    ];
    if best_key is null or candidate_key<best_key then best:=subset; best_key:=candidate_key; end if;
  end loop;
  return case when cardinality(best)>0 then best else base_play end;
end;
$$;

create or replace function public.tichu_add_bot(p_room uuid,p_difficulty text default 'beginner') returns uuid
language plpgsql security definer set search_path=public as $$
declare room_row public.tichu_rooms%rowtype; bot_id uuid:=gen_random_uuid(); open_seat int; bot_team int; bot_label text;
begin
  if p_difficulty not in('beginner','intermediate','advanced','god','deity') then raise exception '지원하지 않는 AI 난이도입니다.'; end if;
  select * into room_row from public.tichu_rooms where id=p_room for update;
  if room_row.host_id<>auth.uid() or room_row.status<>'WAITING' then raise exception '방장만 대기방에서 AI를 추가할 수 있습니다.'; end if;
  if (select count(*) from public.tichu_players where room_id=p_room)>=4 then raise exception '빈자리가 없습니다.'; end if;
  if p_difficulty='deity' then
    if room_row.game_mode<>'INDIVIDUAL' then raise exception '티츄신은 개인전에만 참가할 수 있습니다.'; end if;
    if exists(select 1 from public.tichu_players where room_id=p_room and bot_difficulty='deity') then raise exception '티츄신은 한 명만 추가할 수 있습니다.'; end if;
    select display_name into bot_label from public.tichu_deity_title where singleton;
  end if;
  select x into open_seat from generate_series(0,3)x where not exists(select 1 from public.tichu_players where room_id=p_room and seat=x) order by x limit 1;
  select case when count(*) filter(where team=0)<=count(*) filter(where team=1) then 0 else 1 end into bot_team from public.tichu_players where room_id=p_room;
  if (select count(*) from public.tichu_players where room_id=p_room and team=bot_team)>=2 then bot_team:=1-bot_team; end if;
  if p_difficulty<>'deity' then
    select candidate into bot_label from unnest(case when open_seat in(0,2)
      then array['장원영','아이유','카리나','전지현','제니'] else array['차은우','박보검','변우석','이병현','유재석','지디'] end)names(candidate)
    where not exists(select 1 from public.tichu_players p where p.room_id=p_room and p.is_bot and p.bot_name=candidate)
    order by random() limit 1;
  end if;
  insert into public.tichu_players(room_id,user_id,seat,team,ready,is_bot,bot_name,bot_difficulty)
  values(p_room,bot_id,open_seat,bot_team,true,true,bot_label,p_difficulty);
  update public.tichu_rooms set revision=revision+1,updated_at=now() where id=p_room;
  return bot_id;
end;
$$;

create or replace function public.tichu_crown_deity_champion() returns trigger
language plpgsql security definer set search_path=public as $$
declare champion text;
begin
  if old.status='FINISHED' or new.status<>'FINISHED' or new.game_mode<>'INDIVIDUAL' or new.target_score<>1000
    or new.winner_user_id is null
    or not exists(select 1 from public.tichu_players where room_id=new.id and bot_difficulty='deity')
    or exists(select 1 from public.tichu_players where room_id=new.id and user_id=new.winner_user_id and is_bot)
  then return new; end if;
  select coalesce(nullif(trim(activity_name),''),'새로운')||'신' into champion from public.profiles where id=new.winner_user_id;
  update public.tichu_deity_title set holder_user_id=new.winner_user_id,display_name=champion,conquered_at=now() where singleton;
  update public.tichu_players set bot_name=champion where is_bot and bot_difficulty='deity';
  return new;
end;
$$;
drop trigger if exists tichu_crown_deity_champion_trigger on public.tichu_rooms;
create trigger tichu_crown_deity_champion_trigger after update of status on public.tichu_rooms
for each row execute function public.tichu_crown_deity_champion();

do $$
declare fn text;
begin
  select pg_get_functiondef('public.tichu_bot_tick(uuid)'::regprocedure) into fn;
  fn:=replace(fn,
    'chosen := public.tichu_god_counted_play(p_room, bot.user_id, bot.team, hand_cards, room_row.lead, room_row.wish_rank);',
    'if bot.bot_difficulty=''deity'' then chosen:=public.tichu_deity_best_play(p_room,bot.user_id,bot.team,hand_cards,room_row.lead,room_row.wish_rank); else chosen:=public.tichu_god_counted_play(p_room,bot.user_id,bot.team,hand_cards,room_row.lead,room_row.wish_rank); end if;');
  fn:=replace(fn,'if bot.bot_difficulty = ''god'' then','if bot.bot_difficulty in (''god'',''deity'') then');
  fn:=replace(fn,'bot.bot_difficulty in (''advanced'', ''god'')','bot.bot_difficulty in (''advanced'', ''god'', ''deity'')');
  fn:=replace(fn,'ARRAY[''advanced''::text, ''god''::text]','ARRAY[''advanced''::text, ''god''::text, ''deity''::text]');
  if strpos(fn,'tichu_deity_best_play')=0 then raise exception '티츄신 선택 로직을 연결하지 못했습니다.'; end if;
  execute fn;

  select pg_get_functiondef('public.tichu_start_room(uuid)'::regprocedure) into fn;
  fn:=replace(fn,'bot_difficulty=''god''','bot_difficulty in (''god'',''deity'')');
  execute fn;

  select pg_get_functiondef('public.tichu_apply_god_opening_handicap()'::regprocedure) into fn;
  fn:=replace(fn,'bot_difficulty = ''god''','bot_difficulty in (''god'',''deity'')');
  execute fn;
end;
$$;

revoke all on function public.tichu_deity_best_play(uuid,uuid,int,int[],jsonb,int) from public,anon,authenticated;
revoke all on function public.tichu_add_bot(uuid,text) from public,anon;
grant execute on function public.tichu_add_bot(uuid,text) to authenticated;

commit;
