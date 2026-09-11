begin;
alter table public.clocktower_live_requests add column private_once boolean not null default false;

create function public.clocktower_mark_spy_request() returns trigger
language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms;
begin
 select * into r from public.clocktower_live_rooms where id=new.room_id;
 if new.prompt like '첩자 · %' or
    (r.night_engine->>'active'=new.id::text and
     r.night_engine->'tasks'->coalesce((r.night_engine->>'cursor')::integer,0)->>'role'='첩자') then
   new.private_once:=true;
 end if;
 return new;
end $$;
revoke all on function public.clocktower_mark_spy_request() from public,anon,authenticated;
create trigger clocktower_mark_spy_request before insert or update on public.clocktower_live_requests
for each row execute function public.clocktower_mark_spy_request();

-- Identify existing delivered grimoire summaries without restricting initial minion information.
update public.clocktower_live_requests q set private_once=true
from public.clocktower_live_members m
where m.room_id=q.room_id and m.user_id=q.user_id and m.shown_role='첩자'
and (q.prompt like '첩자 · %' or
 (q.prompt='이야기꾼이 확인한 정보를 전달합니다.' and (q.result like '% / 생존%' or q.result like '% / 사망%')));

alter function public.clocktower_live_snapshot(uuid) rename to clocktower_live_snapshot_before_spy_once;
revoke all on function public.clocktower_live_snapshot_before_spy_once(uuid) from public,anon,authenticated;
create function public.clocktower_live_snapshot(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s jsonb; requests jsonb;
begin
 s:=public.clocktower_live_snapshot_before_spy_once(p_event_id);
 if s->'room' is null or s->'room'='null'::jsonb then return s;end if;
 select coalesce(jsonb_agg(
   (entry.value||jsonb_build_object('private_once',q.private_once)) ||
   case when q.private_once and not coalesce((s->>'is_host')::boolean,false)
     and (q.acknowledged or q.status<>'RESOLVED' or s->'room'->>'phase'<>'NIGHT'
       or q.night<>(s->'room'->>'night')::integer)
   then jsonb_build_object('result','') else '{}'::jsonb end
   order by entry.ordinality),'[]'::jsonb) into requests
 from jsonb_array_elements(coalesce(s->'requests','[]'::jsonb)) with ordinality entry(value,ordinality)
 join public.clocktower_live_requests q on q.id=(entry.value->>'id')::uuid;
 return jsonb_set(s,'{requests}',requests);
end $$;
revoke all on function public.clocktower_live_snapshot(uuid) from public,anon;
grant execute on function public.clocktower_live_snapshot(uuid) to authenticated;
commit;
