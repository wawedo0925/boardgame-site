begin;

-- A and Dragon leads have very few possible answers. Avoid the exponential
-- combination search when the bot has neither a higher single nor a bomb.
create or replace function public.tichu_should_fast_pass_high_single(
  p_hand int[],
  p_lead jsonb
) returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  card int;
  made jsonb;
begin
  if p_lead is null
    or coalesce((p_lead->>'bomb')::boolean, false)
    or p_lead->>'kind' <> 'single'
    or coalesce((p_lead->>'strength')::numeric, 0) < 14
  then
    return false;
  end if;

  if public.tichu_hand_has_bomb(p_hand) then return false; end if;

  foreach card in array p_hand loop
    if card = 53 then continue; end if;
    made := public.tichu_classify_cards(array[card], p_lead);
    if made is not null
      and made->>'kind' = 'single'
      and (made->>'strength')::numeric > (p_lead->>'strength')::numeric
    then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

do $$
declare
  signature regprocedure;
  fn text;
  changed text;
begin
  foreach signature in array array[
    'public.tichu_god_counted_play(uuid,uuid,int,int[],jsonb)'::regprocedure,
    'public.tichu_deity_best_play(uuid,uuid,int,int[],jsonb,int)'::regprocedure
  ] loop
    select pg_get_functiondef(signature) into fn;
    if strpos(fn, 'tichu_should_fast_pass_high_single') > 0 then continue; end if;

    changed := regexp_replace(
      fn,
      '\mbegin\s+',
      E'begin\n  if public.tichu_should_fast_pass_high_single(p_hand, p_lead) then\n    return ''{}'';\n  end if;\n\n  ',
      'i'
    );
    if changed = fn then
      raise exception '고속 패스 삽입 지점을 찾지 못했습니다: %', signature;
    end if;
    execute changed;
  end loop;
end;
$$;

do $$
begin
  if not public.tichu_should_fast_pass_high_single(
    array[0, 8, 16],
    jsonb_build_object('kind','single','size',1,'strength',14,'bomb',false)
  ) then
    raise exception 'A 리드 고속 패스 검증에 실패했습니다.';
  end if;

  if public.tichu_should_fast_pass_high_single(
    array[0, 8, 55],
    jsonb_build_object('kind','single','size',1,'strength',14,'bomb',false)
  ) then
    raise exception '용 카운터를 고속 패스로 오판했습니다.';
  end if;

  if public.tichu_should_fast_pass_high_single(
    array[0, 1, 2, 3],
    jsonb_build_object('kind','single','size',1,'strength',25,'bomb',false)
  ) then
    raise exception '폭탄 카운터를 고속 패스로 오판했습니다.';
  end if;
end;
$$;

revoke all on function public.tichu_should_fast_pass_high_single(int[],jsonb)
from public, anon, authenticated;

commit;
