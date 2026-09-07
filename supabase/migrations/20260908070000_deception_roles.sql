begin;

insert into public.game_roles (game_id, name, team_name, sort_order)
select g.id, role.name, role.team_name, role.sort_order
from public.games g
cross join (values
  ('법의학자', '수사 팀', 1),
  ('수사관', '수사 팀', 2),
  ('목격자', '수사 팀', 3),
  ('살인범', '살인범 팀', 4),
  ('공범', '살인범 팀', 5)
) as role(name, team_name, sort_order)
where g.name = '디셉션'
  and not exists (
    select 1 from public.game_roles r
    where r.game_id = g.id and r.name = role.name
  );

commit;
