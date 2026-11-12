-- Individual gold totals after three rounds; preserve genre and past results.
begin;
update public.games set type='SCORE', result_category='SCORE'
where id in ('2f1db427-f68f-4a27-83d6-a543198de82a','10ff4aa3-c9b2-4dec-9a8f-e56d9f2f1f96');
update public.event_game_sessions set result_type='SCORE'
where game_id in ('2f1db427-f68f-4a27-83d6-a543198de82a','10ff4aa3-c9b2-4dec-9a8f-e56d9f2f1f96');
commit;
