begin;
alter table public.events
  add column is_half_night boolean not null default false,
  add column half_night_volume integer;
alter table public.events add constraint half_night_boardgame_only
  check (not is_half_night or (event_kind='BOARDGAME' and recurrence_series_id is null));
alter table public.event_arrival_plans add column half_night_part text
  check (half_night_part in ('BOTH','FIRST','SECOND'));
alter table public.event_participants add column half_night_part text
  check (half_night_part in ('BOTH','FIRST','SECOND'));

create table public.half_night_counter (
  id boolean primary key default true check(id), last_volume integer not null
);
insert into public.half_night_counter values(true,4);
alter table public.half_night_counter enable row level security;
revoke all on public.half_night_counter from public,anon,authenticated;

create function public.set_half_night_defaults() returns trigger
language plpgsql security definer set search_path=public as $$
declare weekday integer;
begin
  if not new.is_half_night then return new; end if;
  if new.event_kind <> 'BOARDGAME' or new.recurrence_series_id is not null then
    raise exception '반나잇은 단일 보드게임 이벤트로 생성해 주세요.';
  end if;
  if tg_op='INSERT' then
    update public.half_night_counter set last_volume=last_volume+1 where id
      returning last_volume into new.half_night_volume;
  elsif not old.is_half_night then
    update public.half_night_counter set last_volume=last_volume+1 where id
      returning last_volume into new.half_night_volume;
  else
    new.half_night_volume:=old.half_night_volume;
  end if;
  weekday:=extract(dow from new.started_at at time zone 'Asia/Seoul');
  new.title:='[반나잇] '||case weekday when 5 then '불금' when 6 then '불토' else '보드게임' end||' Vol.'||new.half_night_volume;
  new.volume_number:=new.half_night_volume;
  new.ended_at:=new.started_at+interval '6 hours';
  new.participation_fee:=20000;
  return new;
end $$;
revoke all on function public.set_half_night_defaults() from public,anon,authenticated;
create trigger zzz_half_night_defaults before insert or update on public.events
for each row execute function public.set_half_night_defaults();

create function public.set_half_night_participant() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.events where id=new.event_id and is_half_night) then
    select coalesce(half_night_part,'BOTH') into new.half_night_part
      from public.event_arrival_plans where event_id=new.event_id and user_id=new.user_id;
    new.half_night_part:=coalesce(new.half_night_part,'BOTH');
  else new.half_night_part:=null;
  end if;
  return new;
end $$;
revoke all on function public.set_half_night_participant() from public,anon,authenticated;
create trigger half_night_participant before insert or update of half_night_part on public.event_participants
for each row execute function public.set_half_night_participant();

create function public.join_half_night_event(p_event_id uuid,p_part text) returns text
language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); result text;
begin
  if u is null then raise exception '로그인이 필요합니다.'; end if;
  if p_part is null or p_part not in ('BOTH','FIRST','SECOND') then raise exception '참여할 부를 선택해 주세요.'; end if;
  perform 1 from public.events where id=p_event_id and is_half_night for update;
  if not found then raise exception '반나잇 이벤트가 아닙니다.'; end if;
  if exists(select 1 from public.event_participants where event_id=p_event_id and user_id=u)
    or exists(select 1 from public.event_waitlist where event_id=p_event_id and user_id=u) then
    raise exception '이미 참가 또는 대기 중입니다. 변경하려면 기존 신청을 취소한 뒤 다시 선택해 주세요.';
  end if;
  insert into public.event_arrival_plans(event_id,user_id,arrival_at,arrival_mode,half_night_part)
    values(p_event_id,u,null,'NORMAL',p_part)
    on conflict(event_id,user_id) do update set arrival_at=null,arrival_mode='NORMAL',half_night_part=excluded.half_night_part;
  result:=public.join_event_with_capacity(p_event_id);
  if not exists(select 1 from public.event_participants where event_id=p_event_id and user_id=u)
    and not exists(select 1 from public.event_waitlist where event_id=p_event_id and user_id=u) then
    raise exception '참가 신청을 확인할 수 없습니다.';
  end if;
  return result;
end $$;
revoke all on function public.join_half_night_event(uuid,text) from public,anon;
grant execute on function public.join_half_night_event(uuid,text) to authenticated;

-- Preserve the existing inbox/push delivery, cancellation, and late-arrival logic.
do $$
declare source text; anchor text:=$anchor$dedupe:='participant:'$anchor$;
begin
  source:=pg_get_functiondef('public.notify_event_participation()'::regprocedure);
  if position(anchor in source)=0 then raise exception 'Unexpected notification function'; end if;
  source:=replace(source,anchor,$patch$
  if tg_op='INSERT' and e.is_half_night then
    heading:='반나잇 '||case new.half_night_part when 'FIRST' then '1부 참여' when 'SECOND' then '2부 참여' else '모두 참여' end;
    message:=coalesce(member_name,'멤버')||'님이 '||to_char(e.started_at at time zone 'Asia/Seoul','MM/DD')||' '||heading||'했습니다.';
  end if;
  $patch$||anchor);
  execute source;
  source:=pg_get_functiondef('public.join_event_party_gm(uuid)'::regprocedure);
  if position($anchor$where id=p_event_id and event_kind='BOARDGAME' for update$anchor$ in source)=0 then
    raise exception 'Unexpected party GM join function';
  end if;
  source:=replace(source,$anchor$where id=p_event_id and event_kind='BOARDGAME' for update$anchor$,
    $anchor$where id=p_event_id and event_kind='BOARDGAME' and not is_half_night for update$anchor$);
  execute source;
end $$;
commit;
