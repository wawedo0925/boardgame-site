begin;

-- Hitler is a distinct role on the Fascist team, sharing its win/loss result.
insert into public.game_roles (game_id, name, team_name, sort_order)
select g.id, role.name, role.team_name, role.sort_order
from public.games g
cross join (values
  ('리버럴', '리버럴', 1),
  ('파시스트', '파시스트', 2),
  ('히틀러', '파시스트', 3)
) as role(name, team_name, sort_order)
where g.name = '시크릿 히틀러'
  and not exists (
    select 1 from public.game_roles r
    where r.game_id = g.id and r.name = role.name
  );

commit;
