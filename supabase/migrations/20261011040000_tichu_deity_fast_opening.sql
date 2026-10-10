begin;

-- Full-hand deity openings must never enumerate every own/opponent subset.
-- Mahjong is mandatory for the initial leader, so release it immediately.
-- Dog-led/new-trick openings without Mahjong shed the lowest natural singleton
-- without breaking a pair/triple; grouped ranks are the bounded fallback.
create or replace function public.tichu_deity_fast_opening(p_hand int[])
returns int[]
language plpgsql
immutable
set search_path = public
as $$
declare
  picked int;
  picked_group int[];
begin
  if cardinality(p_hand) is null or cardinality(p_hand) = 0 then return '{}'; end if;

  if 52 = any(p_hand) then return array[52]; end if;

  select card into picked
  from unnest(p_hand) card
  where card < 52
    and card / 4 + 2 < 14
    and (select count(*) from unnest(p_hand) other
         where other < 52 and other / 4 = card / 4) = 1
  order by card / 4, card
  limit 1;
  if picked is not null then return array[picked]; end if;

  select array_agg(card order by card) into picked_group
  from unnest(p_hand) card
  where card < 52
    and card / 4 = (
      select grouped / 4
      from unnest(p_hand) grouped
      where grouped < 48
      group by grouped / 4
      order by grouped / 4
      limit 1
    );
  if cardinality(picked_group) between 2 and 3 then return picked_group; end if;

  select card into picked
  from unnest(p_hand) card
  where card <> 53
  order by case when card < 52 then 0 when card = 54 then 1 when card = 55 then 2 else 3 end,
           case when card < 52 then card / 4 else card end,
           card
  limit 1;
  if picked is not null then return array[picked]; end if;

  return array[53];
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

  if strpos(fn, 'tichu_deity_fast_opening') = 0 then
    changed := regexp_replace(
      fn,
      '\mbegin\s+',
      E'begin\n  if p_lead is null and cardinality(p_hand) >= 12 then\n    return public.tichu_deity_fast_opening(p_hand);\n  end if;\n\n  ',
      'i'
    );
    if changed = fn then
      raise exception '티츄신 빠른 오프닝 삽입 지점을 찾지 못했습니다.';
    end if;
    execute changed;
  end if;
end;
$$;

do $$
begin
  if public.tichu_deity_fast_opening(array[52,0,4,8]) <> array[52] then
    raise exception '참새 오프닝 검증에 실패했습니다.';
  end if;
  if public.tichu_deity_fast_opening(array[0,1,8,12]) <> array[8] then
    raise exception '낮은 단독패 오프닝 검증에 실패했습니다.';
  end if;
  if public.tichu_deity_fast_opening(array[0,1,8,9]) <> array[0,1] then
    raise exception '낮은 그룹 오프닝 검증에 실패했습니다.';
  end if;
end;
$$;

revoke all on function public.tichu_deity_fast_opening(int[])
from public, anon, authenticated;

commit;
