begin;

-- Per-round participation, independent of the group's rule master.
alter table public.event_round_players
  add column if not exists is_gm boolean not null default false;

alter table public.event_round_players
  add constraint round_gm_has_no_result check (
    not is_gm or (score is null and rank is null and role_name is null
      and team_name is null and is_winner is null)
  );

comment on column public.event_round_players.is_gm is
  'GM for this round only; no player score, rank or win/loss. Independent of group rule master.';

commit;
