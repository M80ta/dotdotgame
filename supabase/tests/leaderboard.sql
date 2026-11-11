-- Run in the SQL editor. Test rows are rolled back and never published.
begin;
set local role anon;
do $$
declare
    first_id uuid := pg_catalog.gen_random_uuid();
    second_id uuid := pg_catalog.gen_random_uuid();
    third_id uuid := pg_catalog.gen_random_uuid();
    result jsonb;
    before_count integer;
begin
    if has_table_privilege(current_user, 'public.leaderboard_entries', 'select')
       or has_table_privilege(current_user, 'public.leaderboard_entries', 'insert')
       or has_table_privilege(current_user, 'public.leaderboard_entries', 'update')
       or has_table_privilege(current_user, 'public.leaderboard_entries', 'delete') then
        raise exception 'Direct table access must remain denied';
    end if;
    result := public.get_leaderboard(50);
    before_count := jsonb_array_length(result->'entries');
    if before_count <> 0 then
        raise exception 'This bootstrap verification expects an empty leaderboard';
    end if;
    result := public.submit_score(first_id, 'Connection check A', 'Temporary test', 10, 8, 3);
    if (result->>'rank')::integer <> 1 then raise exception 'First score rank failed'; end if;
    result := public.submit_score(first_id, 'Connection check A', 'Temporary test', 10, 8, 3);
    if jsonb_array_length(public.get_leaderboard(50)->'entries') <> 1 then
        raise exception 'Idempotent retry failed';
    end if;
    result := public.submit_score(second_id, 'Connection check B', '', 20, 9, 4);
    result := public.submit_score(third_id, 'Connection check C', '', 20, 10, 5);
    result := public.get_leaderboard(50);
    if jsonb_array_length(result->'entries') <> 3
       or (result->'entries'->0->>'score')::integer <> 20
       or (result->'entries'->0->>'rank')::integer <> 1
       or (result->'entries'->1->>'rank')::integer <> 1
       or (result->'entries'->2->>'rank')::integer <> 3 then
        raise exception 'Ranking order or shared ranks failed';
    end if;
end;
$$;
rollback;
select jsonb_build_object(
    'entries_after_test', public.get_leaderboard(50),
    'anonymous_table_access', has_table_privilege('anon', 'public.leaderboard_entries', 'select')
        or has_table_privilege('anon', 'public.leaderboard_entries', 'insert'),
    'anonymous_read_api', has_function_privilege('anon', 'public.get_leaderboard(integer)', 'execute'),
    'anonymous_submit_api', has_function_privilege('anon', 'public.submit_score(uuid,text,text,integer,integer,integer)', 'execute')
) as verification;
