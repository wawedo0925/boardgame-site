-- Store both board-game and murder-mystery difficulty on a 1-5 decimal scale.
alter table public.games
  alter column difficulty type numeric(3,2)
  using difficulty::numeric;

alter table public.murder_mysteries
  alter column difficulty type numeric(3,2)
  using case
    when difficulty is null or trim(difficulty::text) = '' then null
    when difficulty::text ~ '^\s*[0-9]+([.][0-9]+)?\s*$' then difficulty::numeric
    when difficulty::text = '쉬움' then 1.50
    when difficulty::text = '보통' then 3.00
    when difficulty::text = '어려움' then 4.00
    else null
  end;

alter table public.games drop constraint if exists games_difficulty_range;
alter table public.games add constraint games_difficulty_range
  check (difficulty is null or difficulty between 1 and 5);

alter table public.murder_mysteries drop constraint if exists murder_mysteries_difficulty_range;
alter table public.murder_mysteries add constraint murder_mysteries_difficulty_range
  check (difficulty is null or difficulty between 1 and 5);
