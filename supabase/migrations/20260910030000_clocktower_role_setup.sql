begin;
create function public.clocktower_validate_setup(rows jsonb) returns void
language plpgsql set search_path=public as $$
declare n integer; towns text[]:=array['세탁부','사서','수사관','요리사','초공감자','점쟁이','장의사','수도사','까마귀지기','성결자','처단자','군인','시장']; outsiders text[]:=array['집사','주정뱅이','은둔자','성자']; minions text[]:=array['독살범','첩자','남작','탕녀']; expected_t integer; expected_o integer; expected_m integer; r jsonb;
begin
 if rows is null or jsonb_typeof(rows)<>'array' then raise exception '배정안을 확인해 주세요.'; end if;
 n:=jsonb_array_length(rows);
 if n not between 5 and 15 then raise exception '이야기꾼 제외 5~15명만 배정할 수 있습니다.'; end if;
 expected_t:=(array[3,3,5,5,5,7,7,7,9,9,9])[n-4];
 expected_o:=(array[0,1,0,1,2,0,1,2,0,1,2])[n-4];
 expected_m:=(array[1,1,1,1,1,2,2,2,3,3,3])[n-4];
 if exists(select 1 from jsonb_array_elements(rows) x where x->>'actual_role'='남작') then expected_t:=expected_t-2;expected_o:=expected_o+2;end if;
 for r in select value from jsonb_array_elements(rows) loop
  if jsonb_typeof(r)<>'object' or r->>'actual_role' is null or not (r->>'actual_role'=any(towns||outsiders||minions||array['임프'])) then raise exception '점철되는 혼란의 역할을 선택해 주세요.'; end if;
  if r->>'actual_role'='주정뱅이' then
   if r->>'shown_role' is null or not (r->>'shown_role'=any(towns)) then raise exception '주정뱅이의 표시 역할은 주민이어야 합니다.';end if;
  elsif r->>'shown_role' is distinct from r->>'actual_role' then raise exception '본인 표시 역할을 확인해 주세요.';end if;
 end loop;
 if (select count(distinct x->>'actual_role') from jsonb_array_elements(rows) x)<>n or (select count(distinct x->>'shown_role') from jsonb_array_elements(rows) x)<>n then raise exception '실제 역할과 본인 표시 역할은 중복할 수 없습니다.';end if;
 if (select count(*) from jsonb_array_elements(rows) x where x->>'actual_role'=any(towns))<>expected_t or (select count(*) from jsonb_array_elements(rows) x where x->>'actual_role'=any(outsiders))<>expected_o or (select count(*) from jsonb_array_elements(rows) x where x->>'actual_role'=any(minions))<>expected_m or (select count(*) from jsonb_array_elements(rows) x where x->>'actual_role'='임프')<>1 then raise exception '인원별 역할 구성이 맞지 않습니다. 남작은 주민 2명을 외지인 2명으로 교체합니다.';end if;
end $$;
revoke all on function public.clocktower_validate_setup(jsonb) from public,anon,authenticated;

alter function public.clocktower_live_command(uuid,text,jsonb) rename to clocktower_live_command_v2;
revoke all on function public.clocktower_live_command_v2(uuid,text,jsonb) from public,anon,authenticated;
create function public.clocktower_live_command(p_event_id uuid,p_action text,p_data jsonb default '{}') returns void
language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; current_rows jsonb; rows jsonb; expected jsonb;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 if p_action='save_roles' or (p_action='phase' and p_data->>'phase'='NIGHT') then
  select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1 for update;
  if r.id is null or r.id::text is distinct from p_data->>'room_id' then raise exception '진행방이 변경되었습니다.';end if;
  if r.storyteller_id is distinct from auth.uid() then raise exception '이야기꾼만 역할을 배정할 수 있습니다.';end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'actual_role',actual_role,'shown_role',shown_role) order by user_id),'[]') into current_rows from public.clocktower_live_members where room_id=r.id;
  if p_action='save_roles' then
   if r.phase<>'SETUP' then raise exception '초기 역할 배정은 첫날 밤 전에만 저장할 수 있습니다.';end if;
   rows:=p_data->'rows'; expected:=p_data->'expected';
   if expected is null or jsonb_typeof(expected)<>'array' then raise exception '이전 배정안이 필요합니다.';end if;
   select jsonb_agg(x order by x->>'user_id') into expected from jsonb_array_elements(expected) x;
   if current_rows is distinct from expected then raise exception '참가자 또는 역할이 변경되었습니다. 취소 후 다시 편집해 주세요.';end if;
   perform public.clocktower_validate_setup(rows);
   if jsonb_array_length(rows)<>jsonb_array_length(current_rows) or (select count(distinct x->>'user_id') from jsonb_array_elements(rows) x)<>jsonb_array_length(rows) or exists(select 1 from jsonb_array_elements(rows) x where not exists(select 1 from public.clocktower_live_members m where m.room_id=r.id and m.user_id::text=x->>'user_id')) then raise exception '진행방 참가자 전체를 한 번씩 배정해 주세요.';end if;
   update public.clocktower_live_members m set actual_role=x->>'actual_role',shown_role=x->>'shown_role' from jsonb_array_elements(rows) x where m.room_id=r.id and m.user_id::text=x->>'user_id';
   return;
  elsif r.phase='SETUP' then perform public.clocktower_validate_setup(current_rows);end if;
 end if;
 perform public.clocktower_live_command_v2(p_event_id,p_action,p_data);
end $$;
revoke all on function public.clocktower_live_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_live_command(uuid,text,jsonb) to authenticated;
commit;
