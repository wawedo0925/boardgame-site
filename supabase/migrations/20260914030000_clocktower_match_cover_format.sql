begin;
create or replace function public.clocktower_cover_missions() returns trigger language plpgsql set search_path=public as $$
declare m record;n integer;k text;challenge_value jsonb;
begin
 if not exists(select 1 from public.clocktower_live_rooms where id=new.room_id and phase='NIGHT' and night=new.night) then return new;end if;
 update public.clocktower_live_missions set completed=true,challenge=challenge||'{"superseded":true}'::jsonb
 where room_id=new.room_id and night=new.night and user_id=new.user_id and not completed;
 k:=case when new.status='RESOLVED' or new.target_count=0 then 'NOTICE' else 'SELECT' end;
 for m in select user_id from public.clocktower_live_members p where p.room_id=new.room_id and p.user_id<>new.user_id
 and not exists(select 1 from public.clocktower_live_requests where room_id=p.room_id and night=new.night and user_id=p.user_id and (status in ('OPEN','SUBMITTED') or (status='RESOLVED' and not acknowledged))) loop
  -- Keep issued text in the draw history, but retire obsolete cover UI.
  update public.clocktower_live_missions set completed=true,challenge=challenge||'{"superseded":true}'::jsonb
  where room_id=new.room_id and night=new.night and user_id=m.user_id and not completed;
  select coalesce(max(round),0)+1 into n from public.clocktower_live_missions where room_id=new.room_id and night=new.night and user_id=m.user_id;
  challenge_value:=public.clocktower_mission_challenge(k,new.room_id,m.user_id)||jsonb_build_object('target_count',case when k='SELECT' then new.target_count else 0 end);
  insert into public.clocktower_live_missions(room_id,user_id,night,round,kind,challenge,available_at)
  values(new.room_id,m.user_id,new.night,n,k,challenge_value,clock_timestamp());
 end loop;
 return new;
end $$;
do $migration$
declare definition text; old_validation text;
begin
 definition:=pg_get_functiondef('public.clocktower_live_command_v5(uuid,text,jsonb)'::regprocedure);
 old_validation:=$old$if not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id::text=p_data->>'answer') then raise exception '참가자 한 명을 선택해 주세요.';end if;$old$;
 if position(old_validation in definition)=0 then raise exception 'Expected selection validator not found';end if;
 execute replace(definition,old_validation,$new$
 if coalesce(cardinality(string_to_array(p_data->>'answer',',')),0)<>coalesce((m.challenge->>'target_count')::integer,1)
 or (select count(distinct t) from unnest(string_to_array(p_data->>'answer',',')) t)<>coalesce((m.challenge->>'target_count')::integer,1)
 or exists(select 1 from unnest(string_to_array(p_data->>'answer',',')) t where not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id::text=t))
 then raise exception '안내된 인원수만큼 서로 다른 참가자를 선택해 주세요.';end if;
 $new$);
end $migration$;
commit;
