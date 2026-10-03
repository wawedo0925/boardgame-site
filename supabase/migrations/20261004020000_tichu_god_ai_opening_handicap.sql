begin;

alter table public.tichu_hands
  add column if not exists initial_cards int[] not null default '{}';

create or replace function public.tichu_god_safe_hand(p_cards int[])
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  suit_no int;
  rank_no int;
  run_length int;
begin
  -- A cards are ids 48..51.
  if (select count(*) from unnest(p_cards) c where c between 48 and 51) > 1 then
    return false;
  end if;

  -- Four cards of one rank form a bomb.
  if exists (
    select 1 from unnest(p_cards) c
    where c < 52
    group by c / 4
    having count(*) = 4
  ) then
    return false;
  end if;

  -- Five or more consecutive cards of one suit form a straight-flush bomb.
  for suit_no in 0..3 loop
    run_length := 0;
    for rank_no in 2..14 loop
      if exists (
        select 1 from unnest(p_cards) c
        where c < 52 and c % 4 = suit_no and c / 4 + 2 = rank_no
      ) then
        run_length := run_length + 1;
        if run_length >= 5 then return false; end if;
      else
        run_length := 0;
      end if;
    end loop;
  end loop;

  return true;
end;
$$;

-- Once the last six cards have been dealt, keep each player's original eight
-- cards and only reshuffle the supplemental 24 cards until human opening hands
-- satisfy the God-mode handicap. Card exchange happens later and is untouched.
create or replace function public.tichu_apply_god_opening_handicap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  supplemental int[];
  shuffled int[];
  player_row record;
  candidate int[];
  attempt int := 0;
  valid_deal boolean;
begin
  if old.status <> 'GRAND' or new.status <> 'EXCHANGE' or not exists (
    select 1 from public.tichu_players
    where room_id = new.id and is_bot and bot_difficulty = 'god'
  ) then
    return new;
  end if;

  -- Do not touch a round that was already in progress when this migration was
  -- installed and therefore has no recorded original eight-card hands.
  if exists (
    select 1 from public.tichu_hands
    where room_id = new.id and cardinality(initial_cards) <> 8
  ) then
    return new;
  end if;

  select array_agg(card order by card) into supplemental
  from generate_series(0, 55) card
  where not exists (
    select 1
    from public.tichu_hands h
    cross join lateral unnest(h.initial_cards) initial_card
    where h.room_id = new.id and initial_card = card
  );

  loop
    attempt := attempt + 1;
    select array_agg(card order by random()) into shuffled
    from unnest(supplemental) card;
    valid_deal := true;

    for player_row in
      select p.user_id, p.seat, p.is_bot, h.initial_cards
      from public.tichu_players p
      join public.tichu_hands h using (room_id, user_id)
      where p.room_id = new.id
      order by p.seat
    loop
      candidate := player_row.initial_cards || (
        select array_agg(shuffled[i])
        from generate_series(player_row.seat * 6 + 1, player_row.seat * 6 + 6) i
      );
      if not player_row.is_bot and not public.tichu_god_safe_hand(candidate) then
        valid_deal := false;
        exit;
      end if;
    end loop;

    exit when valid_deal;
    if attempt >= 5000 then
      raise exception '신 AI용 최초 손패를 안전하게 배분하지 못했습니다. 다시 시작해 주세요.';
    end if;
  end loop;

  for player_row in
    select user_id, seat from public.tichu_players
    where room_id = new.id order by seat
  loop
    update public.tichu_hands
    set cards = initial_cards || (
      select array_agg(shuffled[i] order by shuffled[i])
      from generate_series(player_row.seat * 6 + 1, player_row.seat * 6 + 6) i
    )
    where room_id = new.id and user_id = player_row.user_id;
  end loop;

  return new;
end;
$$;

drop trigger if exists tichu_apply_god_opening_handicap_trigger on public.tichu_rooms;
create trigger tichu_apply_god_opening_handicap_trigger
after update of status on public.tichu_rooms
for each row execute function public.tichu_apply_god_opening_handicap();

create or replace function public.tichu_start_room(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare
  r tichu_rooms%rowtype;
  p record;
  deck int[];
  opening int[];
  god_room boolean;
  valid_deal boolean;
  attempt int := 0;
begin
  select * into r from tichu_rooms where id=p_room for update;
  if r.host_id<>auth.uid() or r.status not in('WAITING','ROUND_END') then raise exception '방장만 시작할 수 있습니다.'; end if;
  if (select count(*) from tichu_players where room_id=p_room)<>4 or (select count(*) from tichu_players where room_id=p_room and ready)<>4 then raise exception '4명 모두 준비해야 합니다.'; end if;
  if r.game_mode='TEAM' then
    if (select count(*) from tichu_players where room_id=p_room and team=0)<>2 or (select count(*) from tichu_players where room_id=p_room and team=1)<>2 then raise exception '각 팀에 2명씩 있어야 합니다.'; end if;
    with ordered as (select user_id,team,row_number() over(partition by team order by joined_at)-1 as n from tichu_players where room_id=p_room)
    update tichu_players tp set seat=case when o.team=0 then o.n*2 else o.n*2+1 end from ordered o where tp.room_id=p_room and tp.user_id=o.user_id;
  end if;

  delete from tichu_hands where room_id=p_room;
  delete from tichu_exchanges where room_id=p_room;
  delete from tichu_finished where room_id=p_room;
  delete from tichu_received_cards where room_id=p_room;

  god_room := exists (
    select 1 from tichu_players
    where room_id=p_room and is_bot and bot_difficulty='god'
  );

  loop
    attempt := attempt + 1;
    select array_agg(x order by random()) into deck from generate_series(0,55)x;
    valid_deal := true;
    if god_room then
      for p in select * from tichu_players where room_id=p_room and not is_bot loop
        select array_agg(deck[i]) into opening
        from generate_series(p.seat*8+1,p.seat*8+8)i;
        if not public.tichu_god_safe_hand(opening) then
          valid_deal := false;
          exit;
        end if;
      end loop;
    end if;
    exit when valid_deal;
    if attempt >= 5000 then raise exception '신 AI용 최초 손패를 안전하게 배분하지 못했습니다. 다시 시작해 주세요.'; end if;
  end loop;

  for p in select * from tichu_players where room_id=p_room loop
    select array_agg(deck[i] order by deck[i]) into opening
    from generate_series(p.seat*8+1,p.seat*8+8)i;
    insert into tichu_hands(room_id,user_id,cards,initial_cards)
    values(p_room,p.user_id,opening,opening);
  end loop;

  update tichu_players set grand_choice=null,grand_called=false,small_called=false,has_played=false,captured='{}',ready=false where room_id=p_room;
  update tichu_rooms set status='GRAND',round_no=round_no+1,turn_seat=null,lead=null,trick='[]',pass_count=0,wish_rank=null,last_trick_seat=null,dragon_pending_seat=null,dragon_target=null,winner_user_id=null,revision=revision+1,updated_at=now() where id=p_room;
end $$;

revoke all on function public.tichu_god_safe_hand(int[]) from public, anon, authenticated;

commit;
