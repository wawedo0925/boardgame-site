begin;
-- Draw cycles persist across nights and reconnects, independently for each game/member/type.
create function public.clocktower_mission_challenge(p_kind text,p_room_id uuid,p_user_id uuid) returns jsonb language plpgsql set search_path=public as $$
declare phrases text[]; candidates text[]; chosen text; previous text; cycle integer;
begin
 select case when p_kind='SELECT' then questions else messages end into strict phrases from public.clocktower_mission_settings where id;
 select challenge->>'text' into previous from public.clocktower_live_missions
 where room_id=p_room_id and user_id=p_user_id and kind=p_kind order by night desc,round desc limit 1;
 select coalesce(max(coalesce((challenge->>'draw_cycle')::integer,0)),0) into cycle
 from public.clocktower_live_missions where room_id=p_room_id and user_id=p_user_id and kind=p_kind;
 select array_agg(phrase) into candidates from (select distinct trim(t) as phrase from unnest(phrases) t where length(trim(t))>0) options
 where not exists(select 1 from public.clocktower_live_missions m where m.room_id=p_room_id and m.user_id=p_user_id and m.kind=p_kind
 and coalesce((m.challenge->>'draw_cycle')::integer,0)=cycle and trim(m.challenge->>'text')=options.phrase);
 if coalesce(cardinality(candidates),0)=0 then
  cycle:=cycle+1;
  select array_agg(distinct trim(t)) into candidates from unnest(phrases) t where length(trim(t))>0;
 end if;
 select t into chosen from unnest(candidates) t order by case when t=previous then 1 else 0 end,random() limit 1;
 if chosen is null then raise exception '밤 활동 문구를 먼저 설정해 주세요.';end if;
 return jsonb_build_object('text',chosen,'draw_cycle',cycle,'target_count',case when p_kind='SELECT' then 1 else 0 end,'delay_seconds',1+floor(random()*5)::integer);
end $$;
revoke all on function public.clocktower_mission_challenge(text,uuid,uuid) from public,anon,authenticated;
do $migration$
declare definition text;signature text;replacement text;
begin
 foreach signature in array array['public.clocktower_make_missions(public.clocktower_live_rooms,integer)','public.clocktower_cover_missions()'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('public.clocktower_mission_challenge(k)' in definition)=0 then raise exception 'Expected challenge call not found: %',signature;end if;
  replacement:=case when signature like '%make_missions%' then 'public.clocktower_mission_challenge(k,r.id,m.user_id)' else 'public.clocktower_mission_challenge(k,new.room_id,m.user_id)' end;
  execute replace(definition,'public.clocktower_mission_challenge(k)',replacement);
 end loop;
end $migration$;
commit;

