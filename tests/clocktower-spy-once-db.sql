-- Owner-run integration test. All fixture changes are rolled back.
begin;
do $$
declare r public.clocktower_live_rooms; uid uuid; qid uuid; normal_id uuid; s jsonb; entry jsonb;
begin
 select * into r from public.clocktower_live_rooms
 where event_id='60cabf3d-9762-47fa-a1db-e4d55a548760' order by created_at desc limit 1;
 select user_id into uid from public.clocktower_live_members where room_id=r.id and user_id<>r.storyteller_id limit 1;
 if uid is null then raise exception 'Test requires a room with a player';end if;
 update public.clocktower_live_rooms set phase='NIGHT',night=greatest(night,1) where id=r.id;
 insert into public.clocktower_live_requests(room_id,user_id,night,prompt,target_count,status,result)
 values(r.id,uid,greatest(r.night,1),'첩자 · 테스트',0,'RESOLVED','private grimoire') returning id into qid;
 insert into public.clocktower_live_requests(room_id,user_id,night,prompt,target_count,status,result,acknowledged)
 values(r.id,uid,greatest(r.night,1),'일반 정보 테스트',0,'RESOLVED','normal result',true) returning id into normal_id;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 s:=public.clocktower_live_snapshot(r.event_id);
 select value into entry from jsonb_array_elements(s->'requests') where value->>'id'=qid::text;
 if entry->>'result' is distinct from 'private grimoire' or entry->>'private_once' is distinct from 'true' then raise exception 'New grimoire not visible';end if;
 update public.clocktower_live_requests set acknowledged=true where id=qid;
 s:=public.clocktower_live_snapshot(r.event_id);
 select value into entry from jsonb_array_elements(s->'requests') where value->>'id'=qid::text;
 if entry->>'result' is distinct from '' then raise exception 'Acknowledged grimoire leaked';end if;
 select value into entry from jsonb_array_elements(s->'requests') where value->>'id'=normal_id::text;
 if entry->>'result' is distinct from 'normal result' then raise exception 'Normal result incorrectly hidden';end if;
 perform set_config('request.jwt.claim.sub',r.storyteller_id::text,true);
 s:=public.clocktower_live_snapshot(r.event_id);
 select value into entry from jsonb_array_elements(s->'requests') where value->>'id'=qid::text;
 if entry->>'result' is distinct from 'private grimoire' then raise exception 'Storyteller result lost';end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 update public.clocktower_live_requests set acknowledged=false where id=qid;
 update public.clocktower_live_rooms set night=greatest(r.night,1)+1 where id=r.id;
 s:=public.clocktower_live_snapshot(r.event_id);
 select value into entry from jsonb_array_elements(s->'requests') where value->>'id'=qid::text;
 if entry->>'result' is distinct from '' then raise exception 'Old night grimoire leaked';end if;
 insert into public.clocktower_live_requests(room_id,user_id,night,prompt,target_count,status,result)
 values(r.id,uid,greatest(r.night,1)+1,'첩자 · 다음 밤 테스트',0,'RESOLVED','new grimoire') returning id into qid;
 s:=public.clocktower_live_snapshot(r.event_id);
 select value into entry from jsonb_array_elements(s->'requests') where value->>'id'=qid::text;
 if entry->>'result' is distinct from 'new grimoire' then raise exception 'Next night unavailable';end if;
end $$;
rollback;
select 'PASS: visible before acknowledgement, hidden after, host retained, normal history retained, next night fresh' as result;
