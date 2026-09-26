begin;
create function pg_temp.bmr_action(eid uuid,action text,extra jsonb default '{}') returns void language plpgsql as $$
declare r public.clocktower_live_rooms;
begin select * into r from public.clocktower_live_rooms where event_id=eid order by created_at desc,id desc limit 1;
perform public.clocktower_live_command(eid,action,jsonb_build_object('room_id',r.id,'bmr_revision',r.bmr_revision,'revision',r.flow_revision)||extra);end $$;
do $$
declare host uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); ids uuid[];eid uuid:=gen_random_uuid();rid uuid;qid uuid;mid uuid;s jsonb;rowdata jsonb;r public.clocktower_live_rooms;blocked boolean;i integer;role text;
begin
 insert into auth.users(id) values(host),(outsider);
 insert into public.profiles(id,activity_name,site_role) values(host,'Host','MAIN_ADMIN'),(outsider,'Other','MEMBER');
 for i in 1..6 loop ids:=array_append(ids,gen_random_uuid());insert into auth.users(id) values(ids[i]);insert into public.profiles(id,activity_name) values(ids[i],'P'||i);end loop;
 insert into public.events(id,title,event_kind,created_by) values(eid,'피로 물든 달 테스트','CLOCKTOWER',host);
 insert into public.games(name) values('시계탑에 흐른 피');
 insert into public.event_participants(event_id,user_id) select eid,u from unnest(ids) u;
 perform set_config('request.jwt.claim.sub',host::text,true);
 perform public.clocktower_live_command(eid,'create','{}');
 select id into rid from public.clocktower_live_rooms where event_id=eid;
 assert (select script='BMR' from public.clocktower_live_rooms where id=rid),'title should select BMR';
 -- Six players: 3 townsfolk, 1 outsider, 1 minion, 1 demon.
 for i in 1..6 loop
 role:=(array['선원','궁정대신','객실 청소부','미치광이','악마의 변호사','좀비얼'])[i];
 perform pg_temp.bmr_action(eid,'bmr_member',jsonb_build_object('user_id',ids[i],'actual_role',role,'shown_role',case when role='미치광이' then '포' else role end,'bmr',jsonb_build_object('life','ALIVE','faction',case when i>4 then 'EVIL' else 'GOOD' end)));
 end loop;
 select jsonb_agg(jsonb_build_object('user_id',user_id,'actual_role',actual_role,'shown_role',shown_role)) into rowdata from public.clocktower_live_members where room_id=rid;
 perform pg_temp.bmr_action(eid,'bmr_save_roles',jsonb_build_object('rows',rowdata));
 assert not has_function_privilege('authenticated','public.clocktower_live_command_before_bmr(uuid,text,jsonb)','execute'),'old command inaccessible';
 assert not has_table_privilege('authenticated','public.clocktower_live_members','select'),'private roster table inaccessible';
 perform pg_temp.bmr_action(eid,'flow_next');
 for i in 1..6 loop perform set_config('request.jwt.claim.sub',ids[i]::text,true);perform pg_temp.bmr_action(eid,'role_ack');end loop;
 s:=public.clocktower_live_snapshot(eid);
 assert not(s?'bmr') and not(s?'engine'),'player cannot see private engine';
 assert not exists(select 1 from jsonb_array_elements(s->'members') x where x?'bmr' or x?'actual_role' or x?'notes'),'private roster masked';
 perform set_config('request.jwt.claim.sub',ids[4]::text,true);s:=public.clocktower_live_snapshot(eid);
 assert (select x->>'shown_role'='포' and x->>'faction'='EVIL' from jsonb_array_elements(s->'members') x where x->>'user_id'=ids[4]::text),'Lunatic sees demon and apparent faction';
 blocked:=false;begin perform pg_temp.bmr_action(eid,'bmr_member',jsonb_build_object('user_id',ids[1]));exception when others then blocked:=true;end;assert blocked,'player cannot change state';
 perform set_config('request.jwt.claim.sub',host::text,true);perform pg_temp.bmr_action(eid,'flow_next');
 assert (select phase='NIGHT' and night=1 from public.clocktower_live_rooms where id=rid),'first night starts';
 perform pg_temp.bmr_action(eid,'bmr_request',jsonb_build_object('user_id',ids[4],'target_count',3,'allow_self',true,'prompt','세 명 선택','options',jsonb_build_object('pass',false)));
 select id into qid from public.clocktower_live_requests where room_id=rid and status='OPEN';
 perform set_config('request.jwt.claim.sub',ids[4]::text,true);
 blocked:=false;begin perform pg_temp.bmr_action(eid,'reply',jsonb_build_object('request_id',qid,'targets',jsonb_build_array(ids[1],ids[1],ids[2])));exception when others then blocked:=true;end;assert blocked,'duplicate target rejected';
 blocked:=false;begin perform pg_temp.bmr_action(eid,'reply',jsonb_build_object('request_id',qid,'targets','[]'::jsonb,'answer','{"pass":true}'::jsonb));exception when others then blocked:=true;end;assert blocked,'charged Po cannot pass';
 perform pg_temp.bmr_action(eid,'reply',jsonb_build_object('request_id',qid,'targets',jsonb_build_array(ids[1],ids[2],ids[3])));
 perform set_config('request.jwt.claim.sub',host::text,true);
 select * into r from public.clocktower_live_rooms where id=rid;
 blocked:=false;begin perform pg_temp.bmr_action(eid,'bmr_resolve',jsonb_build_object('request_id',qid,'result','ok','bmr_revision',r.bmr_revision-1));exception when others then blocked:=true;end;assert blocked,'stale host approval rejected';
 perform pg_temp.bmr_action(eid,'bmr_resolve',jsonb_build_object('request_id',qid,'result','확인했습니다.'));
 perform pg_temp.bmr_action(eid,'bmr_step','{"note":"전달 완료"}');
 assert (select not acknowledged and status='RESOLVED' from public.clocktower_live_requests where id=qid),'advance must not auto-ack';
 blocked:=false;begin perform pg_temp.bmr_action(eid,'bmr_resolve',jsonb_build_object('request_id',qid,'result','duplicate'));exception when others then blocked:=true;end;assert blocked,'duplicate resolution rejected';

 -- Character choice and passing use the same controls in real and cover requests.
 perform pg_temp.bmr_action(eid,'bmr_request',jsonb_build_object('user_id',ids[2],'target_count',0,'prompt','캐릭터 선택','options','{"character":true,"pass":true}'::jsonb));
 select id into mid from public.clocktower_live_requests where room_id=rid and status='OPEN';
 assert exists(select 1 from public.clocktower_live_missions where room_id=rid and not completed and kind='SELECT' and (challenge->'bmr_options'->>'character')::boolean and (challenge->>'target_count')::integer=0),'cover character controls match zero-target real request';
 perform set_config('request.jwt.claim.sub',ids[2]::text,true);
 blocked:=false;begin perform pg_temp.bmr_action(eid,'reply',jsonb_build_object('request_id',mid,'targets','[]'::jsonb,'answer','{"character":"임프"}'::jsonb));exception when others then blocked:=true;end;assert blocked,'non-script character rejected';
 perform pg_temp.bmr_action(eid,'reply',jsonb_build_object('request_id',mid,'targets','[]'::jsonb,'answer','{"character":"포"}'::jsonb));
 perform set_config('request.jwt.claim.sub',host::text,true);perform pg_temp.bmr_action(eid,'bmr_resolve',jsonb_build_object('request_id',mid,'result','확인했습니다.'));
 perform pg_temp.bmr_action(eid,'ack_offline',jsonb_build_object('request_id',mid));
 perform pg_temp.bmr_action(eid,'bmr_request',jsonb_build_object('user_id',ids[2],'target_count',0,'prompt','캐릭터 선택','options','{"character":true,"pass":true}'::jsonb));
 select id into mid from public.clocktower_live_requests where room_id=rid and status='OPEN';
 perform set_config('request.jwt.claim.sub',ids[2]::text,true);perform pg_temp.bmr_action(eid,'reply',jsonb_build_object('request_id',mid,'targets','[]'::jsonb,'answer','{"pass":true}'::jsonb));
 assert (select (bmr_answer->>'pass')::boolean from public.clocktower_live_requests where id=mid),'optional ability pass persisted';
 perform set_config('request.jwt.claim.sub',host::text,true);perform pg_temp.bmr_action(eid,'bmr_resolve',jsonb_build_object('request_id',mid,'result','확인했습니다.'));perform pg_temp.bmr_action(eid,'ack_offline',jsonb_build_object('request_id',mid));

 -- Goon faction changes create a private result; final records use the actual faction.
 perform pg_temp.bmr_action(eid,'bmr_member',jsonb_build_object('user_id',ids[1],'actual_role','건달','shown_role','건달','bmr','{"life":"ALIVE","faction":"EVIL"}'::jsonb));
 select id into mid from public.clocktower_live_requests where room_id=rid and user_id=ids[1] and prompt='소속 변경 안내';
 assert mid is not null,'Goon receives a faction change result';
 perform set_config('request.jwt.claim.sub',ids[1]::text,true);s:=public.clocktower_live_snapshot(eid);
 assert (select x->>'faction'='EVIL' from jsonb_array_elements(s->'members') x where x->>'user_id'=ids[1]::text),'Goon knows current faction';
 perform pg_temp.bmr_action(eid,'ack',jsonb_build_object('request_id',mid));
 perform set_config('request.jwt.claim.sub',host::text,true);
 -- True and apparent death remain separate until dawn, zombie uses ghost vote later.
 select to_jsonb(m) into rowdata from public.clocktower_live_members m where room_id=rid and user_id=ids[6];
 perform pg_temp.bmr_action(eid,'bmr_member',rowdata||jsonb_build_object('bmr',jsonb_set(rowdata->'bmr','{life}','"ZOMBIE"')));
 perform set_config('request.jwt.claim.sub',ids[1]::text,true);s:=public.clocktower_live_snapshot(eid);
 assert (select (x->>'alive')::boolean from jsonb_array_elements(s->'members') x where x->>'user_id'=ids[6]::text),'night death hidden';
 perform set_config('request.jwt.claim.sub',host::text,true);
 for i in 1..11 loop perform pg_temp.bmr_action(eid,'bmr_step','{"note":"조건 확인"}');end loop;
 blocked:=false;begin perform pg_temp.bmr_action(eid,'flow_next');exception when others then blocked:=true;end;assert blocked,'dawn waits for unread results and missions';
 perform pg_temp.bmr_action(eid,'ack_offline',jsonb_build_object('request_id',qid));
 for i in 1..6 loop perform pg_temp.bmr_action(eid,'mission_offline',jsonb_build_object('user_id',ids[i]));end loop;
 perform pg_temp.bmr_action(eid,'flow_next');
 assert (select phase='DAY' from public.clocktower_live_rooms where id=rid),'day starts';
 assert (select not alive and not public_alive and bmr->>'life'='ZOMBIE' from public.clocktower_live_members where room_id=rid and user_id=ids[6]),'zombie publicly dead but internally tracked';
 perform pg_temp.bmr_action(eid,'flow_next');
 perform pg_temp.bmr_action(eid,'vote_nominate',jsonb_build_object('nominator',ids[1],'nominee',ids[2]));
 select id into mid from public.clocktower_live_votes where room_id=rid;
 perform pg_temp.bmr_action(eid,'vote_start',jsonb_build_object('vote_id',mid));
 perform pg_temp.bmr_action(eid,'vote_record',jsonb_build_object('vote_id',mid,'user_id',ids[6],'yes',true));
 perform pg_temp.bmr_action(eid,'vote_finish',jsonb_build_object('vote_id',mid));
 assert (select ghost_vote_used from public.clocktower_live_members where room_id=rid and user_id=ids[6]),'zombie vote spends token';

 -- Shared role setup remains unchanged for TB, tested separately below.
 -- No automatic Imp-based victory check; explicit BMR winner records proper role and faction.
 assert (select phase='DAY' from public.clocktower_live_rooms where id=rid),'BMR does not auto-end for absent Imp';
 perform pg_temp.bmr_action(eid,'bmr_end','{"winner":"EVIL","reason":"좀비얼 실제 생존 확인 후 판정"}');
 select * into r from public.clocktower_live_rooms where id=rid;
 assert r.result_round_id is not null,'result auto saved';
 assert (select team_name='피로 물든 달 · 외지인 · 악' and is_winner from public.event_round_players where round_id=r.result_round_id and user_id=ids[1]),'changed Goon faction used in results';
 assert (select team_name='피로 물든 달 · 외지인 · 선' and is_winner=false from public.event_round_players where round_id=r.result_round_id and user_id=ids[4]),'Lunatic scored as good outsider';
 assert (select team_name='피로 물든 달 · 악마 · 악' and is_winner from public.event_round_players where round_id=r.result_round_id and user_id=ids[6]),'demon result correct';
 
 -- A completed BMR room can be followed by an ordinary TB room.
 perform public.clocktower_live_command(eid,'create','{}');
 perform pg_temp.bmr_action(eid,'script_set','{"script":"TB"}');
 select id into rid from public.clocktower_live_rooms where event_id=eid and phase='SETUP';
 update public.clocktower_live_members set actual_role=case seat when 1 then '임프' when 2 then '독살범' else '세탁부' end,shown_role=case seat when 1 then '임프' when 2 then '독살범' else '세탁부' end where room_id=rid;
 update public.clocktower_live_rooms set phase='ENDED',winner='GOOD' where id=rid;
 select * into r from public.clocktower_live_rooms where id=rid;
 assert exists(select 1 from public.event_round_players where round_id=r.result_round_id and team_name='점철되는 혼란 · 악마 · 악' and not is_winner),'TB autosave unchanged';
 perform set_config('request.jwt.claim.sub',outsider::text,true);s:=public.clocktower_live_snapshot(eid);assert s->'room'='null'::jsonb,'outsider cannot inspect room';
end $$;
rollback;
