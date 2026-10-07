begin;

-- Common single/pair/triple replies do not need the deity's exhaustive
-- opponent-hand search.  Resolve them directly so a legal higher group is
-- never lost to a long search or the bot-tick statement timeout.
create or replace function public.tichu_deity_quick_response(
  p_hand int[],
  p_lead jsonb,
  p_wish_rank int default null
) returns int[]
language plpgsql
immutable
set search_path = public
as $$
declare
  lead_kind text := p_lead->>'kind';
  lead_strength numeric := (p_lead->>'strength')::numeric;
  needed int := case lead_kind when 'single' then 1 when 'pair' then 2 when 'triple' then 3 else 0 end;
  wish_required boolean;
  candidate int[];
  remainder int[];
  rank_no int;
  phoenix_present boolean := 54 = any(p_hand);
begin
  if p_lead is null or coalesce((p_lead->>'bomb')::boolean, false)
    or needed = 0
  then
    return '{}';
  end if;

  wish_required := p_wish_rank is not null and exists (
    select 1 from unnest(p_hand) card
    where card < 52 and card / 4 + 2 = p_wish_rank
  ) and public.tichu_can_fulfill_wish(p_hand, p_wish_rank, p_lead);

  if lead_kind = 'single' then
    select array[card] into candidate
    from unnest(p_hand) card
    where card <> 53
      and (not wish_required or (card < 52 and card / 4 + 2 = p_wish_rank))
      and (public.tichu_classify_cards(array[card], p_lead)->>'strength')::numeric > lead_strength
    order by
      case when card = 55 then 3 when card = 54 then 2 else 1 end,
      (public.tichu_classify_cards(array[card], p_lead)->>'strength')::numeric,
      card
    limit 1;
    return coalesce(candidate, '{}');
  end if;

  -- Prefer the lowest natural pair/triple that legally beats the lead.
  for rank_no in 2..14 loop
    continue when rank_no <= lead_strength;
    continue when wish_required and rank_no <> p_wish_rank;

    select array_agg(card order by card) into candidate
    from (
      select card from unnest(p_hand) card
      where card < 52 and card / 4 + 2 = rank_no
      order by card
      limit needed
    ) cards;

    if cardinality(candidate) = needed then
      -- Advanced-plus policy: keep grouped Aces unless this play finishes the
      -- hand or leaves one complete final play.
      if rank_no = 14 and needed >= 2 and cardinality(candidate) < cardinality(p_hand) then
        remainder := array(select card from unnest(p_hand) card where not card = any(candidate));
        if public.tichu_classify_cards(remainder, null) is null then
          continue;
        end if;
      end if;
      return candidate;
    end if;
  end loop;

  -- Phoenix may complete a pair/triple. Keep it as the fallback rather than
  -- spending it before an available natural group.
  if phoenix_present then
    for rank_no in 2..14 loop
      continue when rank_no <= lead_strength;
      continue when wish_required and rank_no <> p_wish_rank;
      select array_agg(card order by card) || array[54] into candidate
      from (
        select card from unnest(p_hand) card
        where card < 52 and card / 4 + 2 = rank_no
        order by card
        limit needed - 1
      ) cards;
      if cardinality(candidate) = needed then
        if rank_no = 14 and needed >= 2 and cardinality(candidate) < cardinality(p_hand) then
          remainder := array(select card from unnest(p_hand) card where not card = any(candidate));
          if public.tichu_classify_cards(remainder, null) is null then
            continue;
          end if;
        end if;
        return candidate;
      end if;
    end loop;
  end if;

  return '{}';
end;
$$;

do $$
declare
  picked int[];
begin
  picked := public.tichu_deity_quick_response(
    array[0, 1, 8, 9],
    jsonb_build_object('kind', 'pair', 'size', 2, 'strength', 3, 'bomb', false),
    null
  );
  if picked <> array[8, 9] then
    raise exception '티츄신 상위 페어 빠른 판정 검증에 실패했습니다: %', picked;
  end if;

  picked := public.tichu_deity_quick_response(
    array[0, 1],
    jsonb_build_object('kind', 'pair', 'size', 2, 'strength', 3, 'bomb', false),
    null
  );
  if cardinality(picked) <> 0 then
    raise exception '티츄신 하위 페어 차단 검증에 실패했습니다: %', picked;
  end if;
end;
$$;

do $$
declare
  fn text;
  changed text;
begin
  select pg_get_functiondef(
    'public.tichu_deity_best_play(uuid,uuid,int,int[],jsonb,int)'::regprocedure
  ) into fn;

  if strpos(fn, 'tichu_deity_quick_response') = 0 then
    changed := replace(fn, E'begin\n  base_play :=', E'begin\n  -- Fast path for the overwhelmingly common responses. This also guarantees\n  -- that a higher pair/triple is selected before any exhaustive search.\n  if p_lead is not null then\n    best := public.tichu_deity_quick_response(p_hand, p_lead, p_wish_rank);\n    if cardinality(best) > 0 then return best; end if;\n  end if;\n\n  base_play :=');
    if changed = fn then
      raise exception '티츄신 빠른 응답 로직 삽입 지점을 찾지 못했습니다.';
    end if;
    execute changed;
  end if;
end;
$$;

revoke all on function public.tichu_deity_quick_response(int[],jsonb,int)
from public, anon, authenticated;

commit;
