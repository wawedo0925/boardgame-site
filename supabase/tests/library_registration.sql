-- Run as postgres. Role changes and all test records are rolled back.
begin;
do $$
declare test_role text; g uuid; m uuid; n integer; denied boolean;
begin
  perform set_config('request.jwt.claim.sub','330488c9-cce1-4758-a70a-3ff63b676ea8',true);
  foreach test_role in array array['ADMIN','RULE_MASTER','MEMBER','MAIN_ADMIN'] loop
    update public.site_roles set role=test_role where user_id='330488c9-cce1-4758-a70a-3ff63b676ea8';
    execute 'set local role authenticated';
    denied:=false;
    begin
      insert into public.games(name,type,library_section,is_unowned) values('Permission test '||gen_random_uuid(),'SCORE','BOARDGAME',true) returning id into g;
    exception when insufficient_privilege then denied:=true;
    end;
    if (test_role='MEMBER') is distinct from denied then raise exception 'Boardgame insert permission failed: %',test_role; end if;
    denied:=false;
    begin
      insert into public.murder_mysteries(title,is_unowned) values('Permission test '||gen_random_uuid(),true) returning id into m;
    exception when insufficient_privilege then denied:=true;
    end;
    if (test_role='MEMBER') is distinct from denied then raise exception 'Mystery insert permission failed: %',test_role; end if;
    if test_role<>'MEMBER' then
      if not (select is_unowned from public.games where id=g) or not (select is_unowned from public.murder_mysteries where id=m) then raise exception 'Unowned state not saved'; end if;
      insert into storage.objects(bucket_id,name) values('boardgame-covers','permission-test/'||gen_random_uuid()||'.png'),('murder-mystery-covers','permission-test/'||gen_random_uuid()||'.png');
    end if;
    if test_role in ('ADMIN','RULE_MASTER') then
      delete from public.games where id=g;
      get diagnostics n=row_count;
      if n<>0 then raise exception 'Direct game delete allowed'; end if;
      delete from public.murder_mysteries where id=m;
      get diagnostics n=row_count;
      if n<>0 then raise exception 'Direct mystery delete allowed'; end if;
      denied:=false;
      begin perform public.admin_delete_boardgame(g);
      exception when raise_exception then
        if sqlerrm<>'메인 관리자만 보드게임을 삭제할 수 있습니다.' then raise; end if;
        denied:=true;
      end;
      if not denied then raise exception 'Staff RPC delete allowed'; end if;
    elsif test_role='MAIN_ADMIN' then
      perform public.admin_delete_boardgame(g);
      if exists(select 1 from public.games where id=g) then raise exception 'Main admin delete failed'; end if;
    end if;
    execute 'reset role';
  end loop;
end $$;
rollback;
select 'Staff registration, cover uploads, unowned state, member denial and main-admin-only deletion passed' as verification;
