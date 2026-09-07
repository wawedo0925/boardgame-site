begin;

insert into public.game_roles (game_id, name, team_name, sort_order)
select g.id, role.name, role.team_name, role.sort_order
from public.games g
cross join (values
  ('치즈 도둑', '치즈 도둑 팀', 1),
  ('추종자', '치즈 도둑 팀', 2),
  ('잠꾸러기', '쥐 팀', 3),
  ('쥐', '쥐 팀', 4)
) as role(name, team_name, sort_order)
where g.name = '누가 치즈를 훔쳤을까?'
  and not exists (
    select 1 from public.game_roles r
    where r.game_id = g.id and r.name = role.name
  );

commit;
