-- Owner-run integration check. All fixture changes roll back.
begin;
do $$
declare r public.clocktower_live_rooms; m public.clocktower_live_missions;
 person uuid; size integer; tiles jsonb; answer text; denied boolean; iteration integer;
begin
 select * into r from public.clocktower_live_rooms
 where event_id='60cabf3d-9762-47fa-a1db-e4d55a548760' order by created_at desc,id desc limit 1;
 select user_id into person from public.clocktower_live_members where room_id=r.id order by seat limit 1;
 if person is null then raise exception 'A populated room is required'; end if;
 update public.clocktower_live_rooms set phase='NIGHT',night=1 where id=r.id returning * into r;
 for iteration in 1..20 loop
  delete from public.clocktower_live_missions where room_id=r.id;
  perform public.clocktower_make_missions(r,1);
  if not exists(select 1 from public.clocktower_live_missions where room_id=r.id) or exists(
   select 1 from public.clocktower_live_missions where room_id=r.id and jsonb_array_length(challenge->'tiles') not in (3,5)
  ) then raise exception 'Invalid generated mission size'; end if;
 end loop;
 delete from public.clocktower_live_missions where room_id=r.id;
 perform set_config('request.jwt.claim.sub',person::text,true);
 foreach size in array array[3,5,10] loop
  select jsonb_agg(i order by random()),string_agg(i::text,',' order by i) into tiles,answer from generate_series(1,size)i;
  insert into public.clocktower_live_missions(room_id,user_id,night,round,kind,challenge,available_at)
  values(r.id,person,r.night,size,'NUMBERS',jsonb_build_object('tiles',tiles),clock_timestamp()-interval '1 second') returning * into m;
  denied:=false;
  begin
   perform public.clocktower_live_command(r.event_id,'mission_complete',jsonb_build_object('room_id',r.id,'mission_id',m.id,'answer','1,2'));
  exception when others then denied:=true;
  end;
  if not denied then raise exception 'Incomplete answer accepted';end if;
  perform public.clocktower_live_command(r.event_id,'mission_complete',jsonb_build_object('room_id',r.id,'mission_id',m.id,'answer',answer));
  if not (select completed from public.clocktower_live_missions where id=m.id) then raise exception 'Correct answer rejected: %',size;end if;
 end loop;
end $$;
rollback;
select 'PASS: random 3/5 generation, incomplete answer rejection, 3/5/10 completion' as result;
