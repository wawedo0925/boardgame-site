create or replace function public.yut_create_room(p_title text default null, p_mode text default 'INDIVIDUAL', p_max_players int default 4) returns uuid
language plpgsql security definer set search_path=public as $$
declare rid uuid; c text; mode text:=upper(coalesce(p_mode,'INDIVIDUAL')); n int; member_name text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if mode not in ('INDIVIDUAL','TEAM_2V2','TEAM_3X2') then raise exception '게임 방식을 확인해 주세요.'; end if;

  -- A host owns at most one room. Child players, pieces, and messages are
  -- removed by their cascading foreign keys.
  delete from public.yut_rooms where host_id=auth.uid();

  n:=case when mode='INDIVIDUAL' then greatest(2,least(4,p_max_players)) when mode='TEAM_3X2' then 6 else 4 end;
  select coalesce(nullif(trim(activity_name),''),'멤버') into member_name from profiles where id=auth.uid();
  loop c:=upper(substr(md5(random()::text),1,6)); exit when not exists(select 1 from yut_rooms where code=c); end loop;
  insert into yut_rooms(code,title,host_id,mode,max_players) values(c,left(coalesce(nullif(trim(p_title),''),member_name||' 윷놀이'),30),auth.uid(),mode,n) returning id into rid;
  insert into yut_players(room_id,user_id,seat,team,name) values(rid,auth.uid(),0,public.yut_team_for_seat(mode,0),member_name);
  return rid;
end $$;

create or replace function public.yut_leave_room(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare h uuid; st text;
begin
  select host_id,status into h,st from yut_rooms where id=p_room for update;
  if not found then return; end if;

  -- The host closing either a waiting room or an active game removes it.
  if h=auth.uid() then
    delete from yut_rooms where id=p_room;
    return;
  end if;

  if st<>'WAITING' then raise exception '게임이 시작된 뒤에는 나갈 수 없습니다.'; end if;
  delete from yut_players where room_id=p_room and user_id=auth.uid();
  update yut_rooms set revision=revision+1,updated_at=now() where id=p_room;
end $$;
