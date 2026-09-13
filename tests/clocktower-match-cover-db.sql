begin;
do $test$
declare r public.clocktower_live_rooms; actor uuid; person uuid; busy_person uuid; req uuid; busy_req uuid; m public.clocktower_live_missions; old_id uuid; denied boolean; engine jsonb; members_before jsonb;
begin
 select * into r from public.clocktower_live_rooms where event_id='60cabf3d-9762-47fa-a1db-e4d55a548760' order by created_at desc,id desc limit 1;
 select user_id into actor from public.clocktower_live_members where room_id=r.id order by seat limit 1;
 select user_id into person from public.clocktower_live_members where room_id=r.id and user_id<>actor order by seat limit 1;
 select user_id into busy_person from public.clocktower_live_members where room_id=r.id and user_id not in(actor,person) order by seat limit 1;
 if busy_person is null then raise exception 'Three members required';end if;
 update public.clocktower_live_rooms set phase='NIGHT',night=9999 where id=r.id returning * into r;engine:=r.night_engine;
 update public.clocktower_live_requests set status='CANCELLED' where room_id=r.id and status in('OPEN','SUBMITTED');
 insert into public.clocktower_live_requests(room_id,user_id,night,prompt,target_count) values(r.id,busy_person,9999,'test own ability',1) returning id into busy_req;
 -- Leave an unfinished notice to verify it is replaced by the next selection.
 update public.clocktower_live_missions set completed=true where room_id=r.id and night=9999 and user_id=person;
 insert into public.clocktower_live_missions(room_id,user_id,night,round,kind,challenge) values(r.id,person,9999,10,'NOTICE',public.clocktower_mission_challenge('NOTICE',r.id,person)) returning id into old_id;
 insert into public.clocktower_live_requests(room_id,user_id,night,prompt,target_count) values(r.id,actor,9999,'test two targets',2) returning id into req;
 if not(select completed and (challenge->>'superseded')::boolean from public.clocktower_live_missions where id=old_id) then raise exception 'Old cover not retired';end if;
 select * into m from public.clocktower_live_missions where room_id=r.id and night=9999 and user_id=person and not completed;
 if m.kind is distinct from 'SELECT' or (m.challenge->>'target_count')::integer<>2 then raise exception 'Two-target format mismatch';end if;
 if exists(select 1 from public.clocktower_live_missions where room_id=r.id and night=9999 and user_id=busy_person and not completed) then raise exception 'Own ability interrupted';end if;
 perform set_config('request.jwt.claim.sub',person::text,true);
 denied:=false;
 begin perform public.clocktower_live_command(r.event_id,'mission_complete',jsonb_build_object('room_id',r.id,'mission_id',m.id,'answer',actor));exception when others then denied:=true;end;
 if not denied then raise exception 'One target accepted for two';end if;
 denied:=false;
 begin perform public.clocktower_live_command(r.event_id,'mission_complete',jsonb_build_object('room_id',r.id,'mission_id',m.id,'answer',actor::text||','||actor::text));exception when others then denied:=true;end;
 if not denied then raise exception 'Duplicate targets accepted';end if;
 perform public.clocktower_live_command(r.event_id,'mission_complete',jsonb_build_object('room_id',r.id,'mission_id',m.id,'answer',actor::text||','||person::text));
 if not(select completed from public.clocktower_live_missions where id=m.id) then raise exception 'Two targets rejected';end if;
 update public.clocktower_live_requests set status='RESOLVED',result='test result' where id=req;
 select * into m from public.clocktower_live_missions where room_id=r.id and night=9999 and user_id=person and not completed;
 if m.kind is distinct from 'NOTICE' then raise exception 'Result notice missing';end if;
 perform public.clocktower_live_command(r.event_id,'mission_complete',jsonb_build_object('room_id',r.id,'mission_id',m.id,'answer','ACK'));
 if (select night_engine from public.clocktower_live_rooms where id=r.id) is distinct from engine then raise exception 'Cover changed engine';end if;
end $test$;
rollback;
select 'PASS: pending cover replaced, two-target selection, own ability protected, invalid/duplicate target rejection, result notice, no engine effects' as result;
