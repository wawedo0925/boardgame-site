begin;
do $test$
declare r public.clocktower_live_rooms; person uuid; k text; j jsonb; used text[]; last_text text; i integer; n integer;
begin
 select * into r from public.clocktower_live_rooms where event_id='60cabf3d-9762-47fa-a1db-e4d55a548760' order by created_at desc,id desc limit 1;
 select user_id into person from public.clocktower_live_members where room_id=r.id order by seat limit 1;
 if person is null then raise exception 'Populated room required';end if;
 update public.clocktower_mission_settings set questions=array['TEST Q1','TEST Q2','TEST Q3',' TEST Q1 '],messages=array['TEST M1','TEST M2'] where id;
 foreach k in array array['SELECT','NOTICE'] loop
  n:=case when k='SELECT' then 3 else 2 end;used:=array[]::text[];last_text:=null;
  for i in 1..12 loop
   j:=public.clocktower_mission_challenge(k,r.id,person);
   if (i-1)%n=0 then used:=array[]::text[];end if;
   if j->>'text'=any(used) then raise exception 'Repeated before exhaustion: %',j;end if;
   if last_text=j->>'text' then raise exception 'Immediate repeat at cycle boundary';end if;
   used:=array_append(used,j->>'text');last_text:=j->>'text';
   insert into public.clocktower_live_missions(room_id,user_id,night,round,kind,challenge,completed)
   values(r.id,person,9992+i/4,case when k='SELECT' then i else i+20 end,k,j,false);
  end loop;
 end loop;
 -- New admin text is prioritized even in the middle of an ongoing game.
 update public.clocktower_mission_settings set questions=array['TEST Q1','TEST Q2','TEST Q3','TEST NEW'] where id;
 if public.clocktower_mission_challenge('SELECT',r.id,person)->>'text'<>'TEST NEW' then raise exception 'New text was not prioritized';end if;
 -- History for this player must not restrict another game.
 update public.clocktower_mission_settings set questions=array['TEST Q1','TEST NEW'] where id;
 -- A different game has zero usage for both; repeated sampling should see both.
 used:=array[]::text[];
 for i in 1..100 loop
  used:=array_append(used,public.clocktower_mission_challenge('SELECT','00000000-0000-0000-0000-000000000001'::uuid,person)->>'text');
 end loop;
 if not('TEST Q1'=any(used)) or not('TEST NEW'=any(used)) then raise exception 'Game history leaked';end if;
end $test$;
rollback;
select 'PASS: per-type no repeats across nights, repeated cycles, boundary repeat avoidance, duplicate text, newly added text, game isolation' as result;
