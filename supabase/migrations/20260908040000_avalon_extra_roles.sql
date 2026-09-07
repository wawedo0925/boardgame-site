begin;

-- Preserve existing roles and results; add the three optional Avalon roles once.
insert into public.game_roles (game_id, name, team_name, sort_order)
select g.id, extra.name, extra.team_name,
       coalesce((select max(r.sort_order) from public.game_roles r where r.game_id = g.id), 0) + extra.position
from public.games g
cross join (values
  ('선의 렌슬롯', '선의 세력', 1),
  ('악마', '악의 세력', 2),
  ('악의 렌슬롯', '악의 세력', 3)
) as extra(name, team_name, position)
where g.name = '아발론'
  and not exists (
    select 1 from public.game_roles r
    where r.game_id = g.id and r.name = extra.name
  );

commit;
