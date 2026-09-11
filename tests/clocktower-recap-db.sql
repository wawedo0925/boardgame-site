-- Owner-run integration check; fixture changes and publication are rolled back.
begin;
do $$
declare r public.clocktower_live_rooms; ids uuid[]; qid uuid; vid uuid; e jsonb; s jsonb; denied boolean;
begin
 select * into r from public.clocktower_live_rooms where event_id='60cabf3d-9762-47fa-a1db-e4d55a548760' order by created_at desc limit 1;
 select array_agg(user_id order by seat) into ids from public.clocktower_live_members where room_id=r.id;
 if array_length(ids,1)<5 then raise exception 'Five-member fixture required';end if;
 delete from public.clocktower_live_requests where room_id=r.id;
 delete from public.clocktower_live_votes where room_id=r.id;
 delete from public.clocktower_shots where room_id=r.id;
 update public.clocktower_live_members set alive=true,public_alive=true,ghost_vote_used=false,
 actual_role=case user_id when ids[1] then '독살범' when ids[2] then '임프' else '사서' end,
 shown_role=case user_id when ids[1] then '독살범' when ids[2] then '임프' else '사서' end where room_id=r.id;
 update public.clocktower_live_rooms set phase='NIGHT',night=1,winner=null,recap_shared=false,engine_version=0 where id=r.id;
 insert into public.clocktower_live_requests(room_id,user_id,night,prompt,target_count,status,targets)
 values(r.id,ids[1],1,'독살범 테스트',1,'SUBMITTED',array[ids[3]]) returning id into qid;
 e:=jsonb_build_object('night',1,'cursor',0,'tasks',jsonb_build_array(jsonb_build_object('user_id',ids[1],'role','독살범')),'active',qid,'conditions','{}'::jsonb);
 update public.clocktower_live_rooms set night_engine=e where id=r.id;
 perform set_config('request.jwt.claim.sub',r.storyteller_id::text,true);
 perform public.clocktower_live_command(r.event_id,'engine_approve',jsonb_build_object('room_id',r.id,'request_id',qid,'version',0,'result','선택 확인','state',e||jsonb_build_object('poison',jsonb_build_object('source',ids[1],'target',ids[3],'night',1))));
 if not exists(select 1 from public.clocktower_recap_entries where room_id=r.id and details::text like '%중독 적용%') then raise exception 'Poison effect missing';end if;
 insert into public.clocktower_live_requests(room_id,user_id,night,prompt,target_count,status,targets)
 values(r.id,ids[2],1,'임프 테스트',1,'SUBMITTED',array[ids[3]]) returning id into qid;
 e:=jsonb_build_object('night',1,'cursor',0,'tasks',jsonb_build_array(jsonb_build_object('user_id',ids[2],'role','임프')),'active',qid,'conditions','{}'::jsonb);
 update public.clocktower_live_rooms set night_engine=e,engine_version=1 where id=r.id;
 perform public.clocktower_live_command(r.event_id,'engine_approve',jsonb_build_object('room_id',r.id,'request_id',qid,'version',1,'result','사망 처리','state',e,'changes',jsonb_build_array(jsonb_build_object('user_id',ids[3],'actual_role','사서','shown_role','사서','alive',false))));
 if not exists(select 1 from public.clocktower_recap_entries where room_id=r.id and details::text like '%의 공격으로%사망%') then raise exception 'Kill attribution missing';end if;
 update public.clocktower_live_rooms set phase='DAY',day_stage='NOMINATIONS' where id=r.id;
 perform public.clocktower_live_command(r.event_id,'vote_nominate',jsonb_build_object('room_id',r.id,'nominator',ids[4],'nominee',ids[5]));
 select id into vid from public.clocktower_live_votes where room_id=r.id and status='WAITING';
 perform public.clocktower_live_command(r.event_id,'vote_start',jsonb_build_object('room_id',r.id,'vote_id',vid));
 perform public.clocktower_live_command(r.event_id,'vote_record',jsonb_build_object('room_id',r.id,'vote_id',vid,'user_id',ids[1],'yes',true));
 perform public.clocktower_live_command(r.event_id,'vote_finish',jsonb_build_object('room_id',r.id,'vote_id',vid,'butler_checked',true));
 if not exists(select 1 from public.clocktower_recap_entries where room_id=r.id and title='투표 집계 완료') then raise exception 'Vote result missing';end if;
 s:=public.clocktower_recap(r.id);
 if jsonb_array_length(s->'entries')<4 then raise exception 'Host logs missing';end if;
 denied:=false;begin perform public.clocktower_recap(r.id,true,false);exception when others then denied:=true;end;
 if not denied then raise exception 'Missing confirmation accepted';end if;
 denied:=false;begin perform public.clocktower_recap(r.id,true,null);exception when others then denied:=true;end;
 if not denied then raise exception 'Null confirmation accepted';end if;
 perform set_config('request.jwt.claim.sub',ids[4]::text,true);
 s:=public.clocktower_recap(r.id);
 if s->>'visible'<>'false' or jsonb_array_length(s->'entries')<>0 then raise exception 'Private log leaked';end if;
 denied:=false;begin perform public.clocktower_recap(r.id,true,true);exception when others then denied:=true;end;
 if not denied then raise exception 'Player published';end if;
 perform set_config('request.jwt.claim.sub',r.storyteller_id::text,true);
 perform public.clocktower_recap(r.id,true,true);
 perform set_config('request.jwt.claim.sub',ids[4]::text,true);
 if public.clocktower_recap(r.id)->>'visible'<>'true' then raise exception 'Published log unavailable';end if;
 update public.clocktower_live_rooms set recap_shared=false where id=r.id;
 perform set_config('request.jwt.claim.sub',r.storyteller_id::text,true);
 perform public.clocktower_live_command(r.event_id,'phase',jsonb_build_object('room_id',r.id,'phase','ENDED'));
 perform set_config('request.jwt.claim.sub',ids[4]::text,true);
 if public.clocktower_recap(r.id)->>'visible'<>'true' then raise exception 'Ended log unavailable';end if;
end $$;
rollback;
select 'PASS: poison, kill attribution, voting, host privacy, double confirmation, publication, ended access' as result;
