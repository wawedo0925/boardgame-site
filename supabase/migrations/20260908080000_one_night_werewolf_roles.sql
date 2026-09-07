begin;

-- Doppelganger requires an explicit final team after copying another role.
insert into public.game_roles (game_id, name, team_name, sort_order)
select g.id, role.name, role.team_name, role.sort_order
from public.games g
cross join (values
  ('늑대인간', '늑대인간 팀', 1),
  ('하수인', '늑대인간 팀', 2),
  ('예언자', '시민 팀', 3),
  ('프리메이슨', '시민 팀', 4),
  ('불면증환자', '시민 팀', 5),
  ('도플갱어', '팀 선택', 6),
  ('강도', '시민 팀', 7),
  ('말썽쟁이', '시민 팀', 8),
  ('주정뱅이', '시민 팀', 9),
  ('시민', '시민 팀', 10)
) as role(name, team_name, sort_order)
where g.name = '한밤의 늑대인간'
  and not exists (
    select 1 from public.game_roles r
    where r.game_id = g.id and r.name = role.name
  );

commit;
