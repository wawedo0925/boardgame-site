begin;
-- The public wrapper still permits additional cards only for MAIN_ADMIN.
-- Preparing a card never ends a room or writes a result.
do $$
declare definition text; unfinished text := $guard$if last_play.id is not null and last_play.result_round_id is null and not exists(select 1 from public.clocktower_live_rooms where id=last_play.room_id and phase='ENDED') then raise exception '현재 판을 먼저 마쳐 주세요.';end if;$guard$;
 active_room text := $guard$if exists(select 1 from public.clocktower_live_rooms where event_id=p_event_id and phase<>'ENDED') then raise exception '진행 중인 판이 있습니다.';end if;$guard$;
begin
 definition:=pg_get_functiondef('public.clocktower_event_plays_command_before_main_admin(uuid,text,jsonb)'::regprocedure);
 assert strpos(definition,unfinished)>0 and strpos(definition,active_room)>0 and strpos(definition,' or p.id<>last_play.id')>0,'Unexpected play command definition';
 definition:=replace(replace(replace(definition,unfinished,''),active_room,''),' or p.id<>last_play.id','');
 execute definition;
end $$;
commit;
