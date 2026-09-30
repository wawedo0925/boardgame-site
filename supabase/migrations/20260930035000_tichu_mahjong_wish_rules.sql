create or replace function public.tichu_classify_cards(p_cards int[], p_lead jsonb default null)
returns jsonb language plpgsql immutable set search_path=public as $$
declare
  n int:=cardinality(p_cards); ph int:=case when 54=any(p_cards) then 1 else 0 end;
  counts int[]:=array_fill(0,array[15]); distinct_ranks int:=0; r int; s int; start_rank int;
  need int; missing int; top_rank int; same_suit boolean; first_suit int; c int;
begin
  if n is null or n=0 or (select count(distinct x) from unnest(p_cards)x)<>n then return null; end if;
  if n>1 and (53=any(p_cards) or 55=any(p_cards)) then return null; end if;
  if n=1 then
    c:=p_cards[1];
    return jsonb_build_object('kind','single','size',1,'strength',case when c<52 then c/4+2 when c=52 then 1 when c=53 then 0 when c=54 then case when p_lead->>'kind'='single' then least(14.5,(p_lead->>'strength')::numeric+.5) else 1.5 end else 15 end,'bomb',false);
  end if;
  foreach c in array p_cards loop if c<53 then r:=case when c=52 then 1 else c/4+2 end; counts[r]:=counts[r]+1; end if; end loop;
  for r in 1..14 loop if counts[r]>0 then distinct_ranks:=distinct_ranks+1; end if; end loop;
  if n=4 and ph=0 then for r in 2..14 loop if counts[r]=4 then return jsonb_build_object('kind','four','size',4,'strength',r,'bomb',true); end if; end loop; end if;
  if n in (2,3) and distinct_ranks=1 then for r in 2..14 loop if counts[r]+ph=n then return jsonb_build_object('kind',case when n=2 then 'pair' else 'triple' end,'size',n,'strength',r,'bomb',false); end if; end loop; end if;
  if n=5 then
    for r in 2..14 loop for s in 2..14 loop
      if r<>s and counts[r]+ph=3 and counts[s]=2 then return jsonb_build_object('kind','full','size',5,'strength',r,'bomb',false); end if;
    end loop; end loop;
  end if;
  if n>=4 and n%2=0 and counts[1]=0 then
    need:=n/2;
    for start_rank in 2..(15-need) loop
      missing:=0;
      for r in 2..14 loop
        if r between start_rank and start_rank+need-1 then if counts[r]>2 then missing:=99; else missing:=missing+(2-counts[r]); end if;
        elsif counts[r]>0 then missing:=99; end if;
      end loop;
      if missing=ph then return jsonb_build_object('kind','pair-straight','size',n,'strength',start_rank+need-1,'bomb',false); end if;
    end loop;
  end if;
  if n>=5 then
    for start_rank in 1..(15-n) loop
      if start_rank=1 and counts[1]=0 then continue; end if;
      missing:=0;
      for r in 1..14 loop
        if r between start_rank and start_rank+n-1 then if counts[r]>1 then missing:=99; else missing:=missing+(1-counts[r]); end if;
        elsif counts[r]>0 then missing:=99; end if;
      end loop;
      if missing=ph then
        top_rank:=start_rank+n-1; same_suit:=ph=0 and counts[1]=0; first_suit:=null;
        if same_suit then foreach c in array p_cards loop if first_suit is null then first_suit:=c%4; elsif c%4<>first_suit then same_suit:=false; end if; end loop; end if;
        return jsonb_build_object('kind',case when same_suit then 'straight-bomb' else 'straight' end,'size',n,'strength',top_rank,'bomb',same_suit);
      end if;
    end loop;
  end if;
  return null;
end $$;

create or replace function public.tichu_wish_play(p_hand int[],p_wish int,p_lead jsonb)
returns int[] language plpgsql immutable set search_path=public as $$
declare n int:=cardinality(p_hand); mask int; i int; subset int[]; made jsonb; legal boolean;
begin
  if p_wish is null or not exists(select 1 from unnest(p_hand)c where c<52 and c/4+2=p_wish) then return '{}'; end if;
  for mask in 1..(power(2,n)::int-1) loop
    subset:='{}';
    for i in 1..n loop if (mask/power(2,i-1)::int)%2=1 then subset:=array_append(subset,p_hand[i]); end if; end loop;
    if not exists(select 1 from unnest(subset)c where c<52 and c/4+2=p_wish) then continue; end if;
    made:=public.tichu_classify_cards(subset,p_lead); if made is null then continue; end if;
    legal:=p_lead is null or
      ((made->>'bomb')::boolean and not coalesce((p_lead->>'bomb')::boolean,false)) or
      ((made->>'bomb')::boolean and coalesce((p_lead->>'bomb')::boolean,false) and ((made->>'size')::int>(p_lead->>'size')::int or ((made->>'size')::int=(p_lead->>'size')::int and (made->>'strength')::numeric>(p_lead->>'strength')::numeric))) or
      (not coalesce((p_lead->>'bomb')::boolean,false) and p_lead->>'kind'=made->>'kind' and (p_lead->>'size')::int=(made->>'size')::int and (made->>'strength')::numeric>(p_lead->>'strength')::numeric);
    if legal then return subset; end if;
  end loop;
  return '{}';
end $$;

create or replace function public.tichu_can_fulfill_wish(p_hand int[],p_wish int,p_lead jsonb)
returns boolean language sql immutable set search_path=public as $$ select cardinality(public.tichu_wish_play(p_hand,p_wish,p_lead))>0 $$;

do $$ declare fn text;
begin
  select pg_get_functiondef('public.tichu_play(uuid,integer[],jsonb,integer,uuid)'::regprocedure) into fn;
  fn:=replace(fn,
    'if 52=any(p_cards) and (p_wish is null or p_wish not between 2 and 14) then raise exception ''참새의 소원 숫자를 선택해 주세요.''; end if;',
    'if 52=any(p_cards) and p_wish is not null and p_wish not between 2 and 14 then raise exception ''참새의 소원은 2부터 A까지만 선택할 수 있습니다.''; end if;');
  fn:=replace(fn,
    'if r.wish_rank is not null and exists(select 1 from unnest(h)x where x<52 and x/4+2=r.wish_rank) and not exists(select 1 from unnest(p_cards)x where x<52 and x/4+2=r.wish_rank) then raise exception ''가능하다면 참새의 소원을 지켜야 합니다.''; end if;',
    'if r.wish_rank is not null and me.seat=r.turn_seat and not exists(select 1 from unnest(p_cards)x where x<52 and x/4+2=r.wish_rank) and public.tichu_can_fulfill_wish(h,r.wish_rank,r.lead) then raise exception ''현재 조합으로 낼 수 있는 참새 소원 카드를 포함해야 합니다.''; end if;');
  execute fn;

  select pg_get_functiondef('public.tichu_pass(uuid)'::regprocedure) into fn;
  fn:=replace(fn,
    'if r.status<>''PLAYING'' or me.seat<>r.turn_seat or r.lead is null then raise exception ''패스할 수 없습니다.''; end if;',
    'if r.status<>''PLAYING'' or me.seat<>r.turn_seat or r.lead is null then raise exception ''패스할 수 없습니다.''; end if; if r.wish_rank is not null and public.tichu_can_fulfill_wish((select cards from tichu_hands where room_id=p_room and user_id=auth.uid()),r.wish_rank,r.lead) then raise exception ''낼 수 있는 참새 소원 카드가 있어 패스할 수 없습니다.''; end if;');
  execute fn;

  select pg_get_functiondef('public.tichu_timeout(uuid)'::regprocedure) into fn;
  fn:=replace(fn,
    'if r.status<>''PLAYING'' or r.turn_deadline is null or r.turn_deadline>now() then return; end if;',
    'if r.status<>''PLAYING'' or r.turn_deadline is null or r.turn_deadline>now() then return; end if; if r.wish_rank is not null and public.tichu_can_fulfill_wish((select h.cards from tichu_hands h join tichu_players p using(room_id,user_id) where h.room_id=p_room and p.seat=r.turn_seat),r.wish_rank,r.lead) then update tichu_rooms set turn_deadline=now()+make_interval(secs=>turn_seconds),revision=revision+1 where id=p_room; return; end if;');
  execute fn;

  select pg_get_functiondef('public.tichu_bot_tick(uuid)'::regprocedure) into fn;
  fn:=replace(fn,'dragon_receiver uuid; has_wish boolean:=false;','dragon_receiver uuid; wish_combo jsonb; has_wish boolean:=false;');
  fn:=replace(fn,'  -- tichu teammate support policy: all AI levels protect a teammate''s call.',E'  if room_row.wish_rank is not null then\n    play_cards:=public.tichu_wish_play(hand_cards,room_row.wish_rank,room_row.lead);\n    if cardinality(play_cards)>0 then wish_combo:=public.tichu_classify_cards(play_cards,room_row.lead); play_kind:=wish_combo->>''kind''; play_size:=(wish_combo->>''size'')::int; play_strength:=(wish_combo->>''strength'')::numeric; play_bomb:=(wish_combo->>''bomb'')::boolean; wish_legal:=true; end if;\n  end if;\n\n  -- tichu teammate support policy: all AI levels protect a teammate''s call.');
  fn:=replace(fn,'when 52=any(play_cards) then 2','when 52=any(play_cards) then 2+floor(random()*13)::int');
  execute fn;
end $$;

revoke all on function public.tichu_classify_cards(int[],jsonb),public.tichu_wish_play(int[],int,jsonb),public.tichu_can_fulfill_wish(int[],int,jsonb) from public,anon,authenticated;
