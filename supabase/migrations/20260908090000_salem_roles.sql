begin;

insert into public.game_roles (game_id, name, team_name, sort_order)
select g.id, role.name, role.team_name, role.sort_order
from public.games g
cross join (values
  ('마녀', '마녀 팀', 1),
  ('시민', '시민 팀', 2)
) as role(name, team_name, sort_order)
where g.name = '세일럼'
  and not exists (
    select 1 from public.game_roles r
    where r.game_id = g.id and r.name = role.name
  );

commit;
