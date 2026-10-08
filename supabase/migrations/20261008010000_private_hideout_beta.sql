begin;

create table if not exists public.member_hideouts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  furniture jsonb not null default '{"chair":"green","lamp":"classic","rug":"forest","plant":"monstera"}'::jsonb,
  shelf uuid[] not null default '{}'::uuid[],
  updated_at timestamptz not null default now()
);

alter table public.member_hideouts enable row level security;
revoke all on public.member_hideouts from public, anon, authenticated;

create or replace function public.my_hideout_beta()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if coalesce(public.current_site_role(),'MEMBER') <> 'MAIN_ADMIN' then raise exception '비공개 베타에 참여할 수 없습니다.'; end if;

  with played as (
    select prg.game_id, sum(greatest(coalesce(prg.play_count,0),0))::bigint play_count
    from public.play_records pr join public.play_record_games prg on prg.play_record_id=pr.id
    where pr.user_id=auth.uid() group by prg.game_id
    union all
    select s.game_id, count(*)::bigint
    from public.event_round_players p
    join public.event_game_rounds r on r.id=p.round_id
    join public.event_game_sessions s on s.id=r.session_id
    where p.user_id=auth.uid() and not coalesce(p.is_gm,false)
    group by s.game_id
  ), totals as (
    select game_id,sum(play_count)::bigint play_count from played group by game_id
  )
  select jsonb_build_object(
    'ownerName',coalesce(nullif(trim(p.activity_name),''),'우영'),
    'avatar',jsonb_build_object('hair',coalesce(p.tichu_avatar,0),'skin',coalesce(p.tichu_skin,1),'hairColor',coalesce(p.tichu_hair_color,0),'expression',coalesce(p.tichu_expression,0),'outfit',coalesce(p.tichu_outfit,0),'accessory',coalesce(p.tichu_accessory,0),'frame',coalesce(p.tichu_frame,0)),
    'furniture',coalesce(h.furniture,'{"chair":"green","lamp":"classic","rug":"forest","plant":"monstera"}'::jsonb),
    'shelf',coalesce(to_jsonb(h.shelf),'[]'::jsonb),
    'games',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'playCount',t.play_count) order by t.play_count desc,g.name) from totals t join public.games g on g.id=t.game_id),'[]'::jsonb)
  ) into result
  from public.profiles p left join public.member_hideouts h on h.user_id=p.id
  where p.id=auth.uid();
  return coalesce(result,'{}'::jsonb);
end $$;

create or replace function public.save_my_hideout_beta(p_furniture jsonb,p_shelf uuid[])
returns void language plpgsql security definer set search_path=public as $$
declare game_id uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if coalesce(public.current_site_role(),'MEMBER') <> 'MAIN_ADMIN' then raise exception '비공개 베타에 참여할 수 없습니다.'; end if;
  if jsonb_typeof(p_furniture) <> 'object' or array_length(p_shelf,1) > 6 then raise exception '올바른 아지트 설정이 아닙니다.'; end if;
  if p_furniture->>'chair' not in ('green','sofa','stool') or p_furniture->>'lamp' not in ('classic','lantern','candle') or p_furniture->>'rug' not in ('forest','wine','night') or p_furniture->>'plant' not in ('monstera','flower','cactus') then raise exception '지원하지 않는 가구입니다.'; end if;
  if cardinality(p_shelf) <> cardinality(array(select distinct unnest(p_shelf))) then raise exception '같은 게임은 한 번만 전시할 수 있습니다.'; end if;
  foreach game_id in array p_shelf loop
    if not exists(
      select 1 from public.play_records pr join public.play_record_games pg on pg.play_record_id=pr.id where pr.user_id=auth.uid() and pg.game_id=game_id
      union all
      select 1 from public.event_round_players ep join public.event_game_rounds er on er.id=ep.round_id join public.event_game_sessions es on es.id=er.session_id where ep.user_id=auth.uid() and es.game_id=game_id and not coalesce(ep.is_gm,false)
    ) then raise exception '플레이한 게임만 전시할 수 있습니다.'; end if;
  end loop;
  insert into public.member_hideouts(user_id,furniture,shelf) values(auth.uid(),p_furniture,p_shelf)
  on conflict(user_id) do update set furniture=excluded.furniture,shelf=excluded.shelf,updated_at=now();
end $$;

revoke all on function public.my_hideout_beta() from public,anon;
grant execute on function public.my_hideout_beta() to authenticated;
revoke all on function public.save_my_hideout_beta(jsonb,uuid[]) from public,anon;
grant execute on function public.save_my_hideout_beta(jsonb,uuid[]) to authenticated;

commit;
