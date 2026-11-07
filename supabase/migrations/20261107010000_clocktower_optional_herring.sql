begin;
-- Keep all existing validation, but require a red herring only for Fortune Teller
-- (including a Drunk who believes they are the Fortune Teller).
do $patch$
declare definition text; previous text;
begin
 select pg_get_functiondef('public.clocktower_validate_information(uuid,jsonb,text)'::regprocedure) into definition;
 previous:=definition;
 definition:=replace(definition,
 'if not exists(select 1 from public.clocktower_live_members where room_id=room and user_id::text=herring',
 'if exists(select 1 from public.clocktower_live_members where room_id=room and (actual_role=''점쟁이'' or shown_role=''점쟁이'')) and not exists(select 1 from public.clocktower_live_members where room_id=room and user_id::text=herring');
 if definition=previous and position('shown_role=''점쟁이''' in definition)=0 then
  raise exception 'Could not locate red herring validation';
 end if;
 execute definition;
end $patch$;
commit;
