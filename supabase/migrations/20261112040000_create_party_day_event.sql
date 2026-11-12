begin;
create function public.create_party_day_event(
  p_started_at timestamptz, p_location text, p_description text, p_max_participants integer default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare s public.event_recurrence_series%rowtype; v integer; result uuid; actor uuid:=auth.uid();
begin
  if actor is null then raise exception '로그인이 필요합니다.'; end if;
  if p_started_at is null or not isfinite(p_started_at) or p_started_at<=now() then
    raise exception '시작 전 날짜와 시간을 선택해 주세요.';
  end if;
  if p_max_participants is not null and p_max_participants<1 then raise exception '정원을 확인해 주세요.'; end if;
  -- Use the same lock order and volume allocation as the daily generator.
  lock table public.events in share row exclusive mode;
  select * into s from public.event_recurrence_series where title='[팟 데이] 팟참가자만' for update;
  if not found then raise exception '팟 데이 자동 일정 설정을 찾을 수 없습니다.'; end if;
  if exists(select 1 from public.events where recurrence_series_id=s.id
    and recurrence_date=(p_started_at at time zone 'Asia/Seoul')::date) then
    raise exception '이 날짜에는 이미 팟 데이가 있습니다. 기존 일정을 이용해 주세요.';
  end if;
  select greatest(s.volume_seed,coalesce(max(volume_number)+1,s.volume_seed)) into v
    from public.events where recurrence_series_id=s.id;
  insert into public.events(title,started_at,ended_at,location,description,created_by,max_participants,
    event_kind,participation_fee,recurrence_series_id,recurrence_date,recurrence_base_title,volume_number)
  values(s.title||' Vol.'||v,p_started_at,p_started_at+interval '3 hours',p_location,
    coalesce(nullif(trim(p_description),''),s.description),actor,p_max_participants,
    'BOARDGAME',10000,s.id,(p_started_at at time zone 'Asia/Seoul')::date,s.title,v)
  returning id into result;
  update public.event_recurrence_series set volume_seed=v+1 where id=s.id;
  -- The creator joins separately, just like automatically generated party days.
  return result;
end $$;
revoke all on function public.create_party_day_event(timestamptz,text,text,integer) from public,anon;
grant execute on function public.create_party_day_event(timestamptz,text,text,integer) to authenticated;
commit;
