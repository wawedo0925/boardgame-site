begin;
-- Advance on delivery without marking the recipient's result as read.
do $$
declare s text; old_guard text := 'q.status=''CANCELLED'' or (q.status=''RESOLVED'' and q.acknowledged)';
begin
 s:=pg_get_functiondef('public.clocktower_live_command_v4(uuid,text,jsonb)'::regprocedure);
 if position(old_guard in s)=0 then raise exception 'Night progression guard not found; inspect the current function before migrating.'; end if;
 s:=replace(s,old_guard,'q.status in (''CANCELLED'',''RESOLVED'')');
 s:=replace(s,'현재 결과 전달과 확인을 먼저 완료해 주세요.','현재 능력의 결과를 먼저 전달해 주세요.');
 execute s;
end $$;
commit;
