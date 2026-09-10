-- Align the catalog with the supported 3–4 and 5–11 money-scoring presets.
update public.games
set min_players=3,max_players=11,type='SCORE'
where id='ef8e079a-921e-441e-b51f-4304614d1bf8' and name='울프스트리트';
