-- Run after both migrations. Existing genuine scores are never changed.
-- Temporary scores exist only inside this transaction; ROLLBACK removes them.
begin;
do $$
declare
    first_id uuid := pg_catalog.gen_random_uuid();
    second_id uuid := pg_catalog.gen_random_uuid();
    third_id uuid := pg_catalog.gen_random_uuid();
    other_board_id uuid := pg_catalog.gen_random_uuid();
    other_batch_id uuid := pg_catalog.gen_random_uuid();
    previous_higher integer;
    result jsonb;
    item jsonb;
    size integer;
    batch integer;
begin
    select count(*) into previous_higher from public.leaderboard_entries
    where board_size = 9 and batch_size = 4 and score > 9999999;
    execute 'set local role anon';
    if has_table_privilege(current_user, 'public.leaderboard_entries', 'select')
       or has_table_privilege(current_user, 'public.leaderboard_entries', 'insert')
       or has_table_privilege(current_user, 'public.leaderboard_entries', 'update')
       or has_table_privilege(current_user, 'public.leaderboard_entries', 'delete') then
        raise exception 'Direct table access must remain denied';
    end if;
    result := public.submit_score(first_id, 'Difficulty check A', 'Temporary test', 10000000, 9, 4);
    if (result->>'rank')::integer <> 1 then raise exception 'First rank failed'; end if;
    result := public.submit_score(first_id, 'Difficulty check A', 'Temporary test', 10000000, 9, 4);
    select count(*) into size from jsonb_array_elements(public.get_leaderboard(9, 4, 50)->'entries') e
    where e->>'id' = first_id::text;
    if size <> 1 then raise exception 'Idempotent retry failed'; end if;
    result := public.submit_score(second_id, 'Difficulty check B', '', 10000000, 9, 4);
    if (result->>'rank')::integer <> 1 then raise exception 'Tied rank failed'; end if;
    result := public.submit_score(other_board_id, 'Other board', '', 10000000, 10, 4);
    if (result->>'rank')::integer <> 1 then raise exception 'Other board rank failed'; end if;
    result := public.submit_score(other_batch_id, 'Other batch', '', 10000000, 9, 5);
    if (result->>'rank')::integer <> 1 then raise exception 'Other batch rank failed'; end if;
    result := public.submit_score(third_id, 'Difficulty check C', '', 9999999, 9, 4);
    if (result->>'rank')::integer <> previous_higher + 3 then
        raise exception 'Submission rank includes other difficulties';
    end if;
    result := public.get_leaderboard(9, 4, 50);
    select e into item from jsonb_array_elements(result->'entries') e where e->>'id' = third_id::text;
    if item is null or (item->>'rank')::integer <> previous_higher + 3 then
        raise exception 'Read rank differs from submission rank';
    end if;
    foreach size in array array[8, 9, 10] loop
        foreach batch in array array[3, 4, 5] loop
            for item in select * from jsonb_array_elements(public.get_leaderboard(size, batch, 50)->'entries') loop
                if (item->>'boardSize')::integer <> size or (item->>'batchSize')::integer <> batch then
                    raise exception 'Difficulty isolation failed';
                end if;
            end loop;
        end loop;
    end loop;
    if to_regprocedure('public.get_leaderboard(integer)') is not null then
        raise exception 'Unscoped read API must be retired';
    end if;
end;
$$;
rollback;
select jsonb_build_object(
    'temporary_scores_remaining', (select count(*) from public.leaderboard_entries
        where name in ('Difficulty check A', 'Difficulty check B', 'Difficulty check C', 'Other board', 'Other batch')),
    'anonymous_table_access', has_table_privilege('anon', 'public.leaderboard_entries', 'select')
        or has_table_privilege('anon', 'public.leaderboard_entries', 'insert'),
    'anonymous_read_api', has_function_privilege('anon', 'public.get_leaderboard(integer,integer,integer)', 'execute'),
    'anonymous_submit_api', has_function_privilege('anon', 'public.submit_score(uuid,text,text,integer,integer,integer)', 'execute')
) as verification;
