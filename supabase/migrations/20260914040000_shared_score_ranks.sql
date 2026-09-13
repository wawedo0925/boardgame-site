begin;
-- Shared places are valid for both entered ranks and automatically ranked scores.
drop index if exists public.event_round_players_round_rank_uidx;
create index if not exists event_round_players_round_rank_idx on public.event_round_players(round_id,rank) where rank is not null;
commit;
