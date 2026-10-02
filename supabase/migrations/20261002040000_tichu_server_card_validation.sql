begin;

create or replace function public.tichu_play(p_room uuid,p_cards int[],p_combo jsonb,p_wish int default null,p_dragon_target uuid default null) returns void
language plpgsql security definer set search_path=public as $$
declare r tichu_rooms%rowtype; me tichu_players%rowtype; h int[]; nextseat int; active_count int; made jsonb;
begin
  select * into r from tichu_rooms where id=p_room for update;
  me:=tichu_assert_member(p_room);
  select cards into h from tichu_hands where room_id=p_room and user_id=auth.uid();
  if cardinality(p_cards)<1 or not p_cards<@h or (select count(distinct x) from unnest(p_cards)x)<>cardinality(p_cards) then raise exception '카드를 확인해 주세요.'; end if;

  -- Never trust the combo metadata supplied by a browser. Rebuild the combo
  -- from the cards on the server so lower full houses and forged bombs fail.
  made:=public.tichu_classify_cards(p_cards,r.lead);
  if made is null then raise exception '올바른 카드 조합이 아닙니다.'; end if;
  if r.status<>'PLAYING' or (me.seat<>r.turn_seat and not coalesce((made->>'bomb')::boolean,false)) then raise exception '지금은 내 차례가 아닙니다.'; end if;
  if 53=any(p_cards) and (cardinality(p_cards)<>1 or r.lead is not null) then raise exception '개는 새 트릭의 첫 카드로만 낼 수 있습니다.'; end if;
  if 52=any(p_cards) and p_wish is not null and p_wish not between 2 and 14 then raise exception '참새의 소원은 2부터 A까지만 선택할 수 있습니다.'; end if;
  if r.wish_rank is not null and me.seat=r.turn_seat and not exists(select 1 from unnest(p_cards)x where x<52 and x/4+2=r.wish_rank) and public.tichu_can_fulfill_wish(h,r.wish_rank,r.lead) then raise exception '현재 조합으로 낼 수 있는 참새 소원 카드를 포함해야 합니다.'; end if;
  if r.lead is not null and not (
    ((made->>'bomb')::boolean and not coalesce((r.lead->>'bomb')::boolean,false)) or
    ((made->>'bomb')::boolean and coalesce((r.lead->>'bomb')::boolean,false) and ((made->>'size')::int>(r.lead->>'size')::int or ((made->>'size')::int=(r.lead->>'size')::int and (made->>'strength')::numeric>(r.lead->>'strength')::numeric))) or
    (not coalesce((r.lead->>'bomb')::boolean,false) and (r.lead->>'kind')=(made->>'kind') and (r.lead->>'size')=(made->>'size') and (made->>'strength')::numeric>(r.lead->>'strength')::numeric)
  ) then raise exception '앞의 조합보다 강한 같은 조합을 내야 합니다.'; end if;
  if 55=any(p_cards) and (p_dragon_target is null or not exists(select 1 from tichu_players p join tichu_hands hh using(room_id,user_id) where p.room_id=p_room and p.user_id=p_dragon_target and p.user_id<>auth.uid() and cardinality(hh.cards)>0 and (r.game_mode='INDIVIDUAL' or p.team<>me.team))) then raise exception '용 트릭을 받을 상대를 선택해 주세요.'; end if;
  if 53=any(p_cards) and r.game_mode='INDIVIDUAL' and (p_dragon_target is null or not exists(select 1 from tichu_players p join tichu_hands hh using(room_id,user_id) where p.room_id=p_room and p.user_id=p_dragon_target and p.user_id<>auth.uid() and cardinality(hh.cards)>0)) then raise exception '첫 턴을 받을 플레이어를 선택해 주세요.'; end if;

  update tichu_hands set cards=array(select x from unnest(cards)x where not x=any(p_cards)) where room_id=p_room and user_id=auth.uid();
  update tichu_players set has_played=true where room_id=p_room and user_id=auth.uid();
  if cardinality(h)=cardinality(p_cards) then insert into tichu_finished values(p_room,auth.uid(),(select count(*)+1 from tichu_finished where room_id=p_room)); end if;
  if 53=any(p_cards) then
    if r.game_mode='INDIVIDUAL' then select seat into nextseat from tichu_players where room_id=p_room and user_id=p_dragon_target; else select seat into nextseat from tichu_players where room_id=p_room and team=me.team and user_id<>auth.uid(); end if;
    if not exists(select 1 from tichu_players p join tichu_hands hh using(room_id,user_id) where p.room_id=p_room and p.seat=nextseat and cardinality(hh.cards)>0) then nextseat=tichu_next_seat(p_room,nextseat); end if;
    update tichu_rooms set turn_seat=nextseat,turn_deadline=now()+make_interval(secs=>turn_seconds),lead=null,trick='[]',pass_count=0,revision=revision+1,wish_rank=coalesce(p_wish,wish_rank) where id=p_room;
  else
    nextseat=tichu_next_seat(p_room,me.seat);
    update tichu_rooms set turn_seat=nextseat,turn_deadline=now()+make_interval(secs=>turn_seconds),lead=made,trick=trick||jsonb_build_array(jsonb_build_object('seat',me.seat,'cards',p_cards)),pass_count=0,last_trick_seat=me.seat,dragon_target=case when 55=any(p_cards) then p_dragon_target else dragon_target end,revision=revision+1,wish_rank=case when p_wish is not null then p_wish when r.wish_rank is not null and exists(select 1 from unnest(p_cards)x where x<52 and x/4+2=r.wish_rank) then null else r.wish_rank end where id=p_room;
  end if;
  select count(*) into active_count from tichu_hands where room_id=p_room and cardinality(cards)>0;
  if active_count<=1 then perform tichu_end_round(p_room); end if;
end $$;

revoke all on function public.tichu_play(uuid,int[],jsonb,int,uuid) from public,anon;
grant execute on function public.tichu_play(uuid,int[],jsonb,int,uuid) to authenticated;

commit;
