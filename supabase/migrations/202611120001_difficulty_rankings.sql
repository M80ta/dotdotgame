-- Required Notice: Copyright (c) 2026 M80ta
-- Separate rankings by board size AND beans per turn. Existing scores are retained.
begin;
create index if not exists leaderboard_difficulty_order
    on public.leaderboard_entries (board_size, batch_size, score desc, created_at, id);

-- Retire the unscoped RPC; callers must supply both difficulty settings.
drop function if exists public.get_leaderboard(integer);
create or replace function public.get_leaderboard(
    p_board_size integer, p_batch_size integer, p_limit integer default 50
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if p_board_size is null or p_board_size not in (8, 9, 10)
       or p_batch_size is null or p_batch_size not in (3, 4, 5) then
        raise exception 'Invalid difficulty';
    end if;
    return (
        with ranked as (
            select *, rank() over (order by score desc) as ranking
            from public.leaderboard_entries
            where board_size = p_board_size and batch_size = p_batch_size
        ), top_entries as (
            select * from ranked order by score desc, created_at, id
            limit greatest(1, least(coalesce(p_limit, 50), 50))
        )
        select jsonb_build_object('entries', coalesce(jsonb_agg(jsonb_build_object(
            'id', id, 'name', name, 'comment', comment, 'score', score,
            'boardSize', board_size, 'batchSize', batch_size, 'createdAt', created_at, 'rank', ranking
        ) order by score desc, created_at, id), '[]'::jsonb)) from top_entries
    );
end;
$$;

create or replace function public.submit_score(
    p_id uuid, p_name text, p_comment text, p_score integer, p_board_size integer, p_batch_size integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    saved public.leaderboard_entries;
    placement bigint;
begin
    if p_id is null or p_name is null or p_comment is null
       or char_length(btrim(p_name)) not between 1 and 24 or char_length(p_comment) > 160
       or p_name ~ '[[:cntrl:]]' or p_comment ~ '[[:cntrl:]]'
       or p_score is null or p_score not between 0 and 10000000
       or p_board_size is null or p_board_size not in (8, 9, 10)
       or p_batch_size is null or p_batch_size not in (3, 4, 5) then
        raise exception 'Invalid score entry';
    end if;
    insert into public.leaderboard_entries(id, name, comment, score, board_size, batch_size)
    values (p_id, btrim(p_name), btrim(p_comment), p_score, p_board_size, p_batch_size)
    on conflict (id) do nothing;
    select * into saved from public.leaderboard_entries where id = p_id;
    if saved.score <> p_score or saved.name <> btrim(p_name) or saved.comment <> btrim(p_comment)
       or saved.board_size <> p_board_size or saved.batch_size <> p_batch_size then
        raise exception 'Score id already used';
    end if;
    select 1 + count(*) into placement from public.leaderboard_entries
    where board_size = saved.board_size and batch_size = saved.batch_size and score > saved.score;
    return jsonb_build_object('rank', placement);
end;
$$;
revoke all on function public.get_leaderboard(integer, integer, integer) from public;
revoke all on function public.submit_score(uuid, text, text, integer, integer, integer) from public;
grant execute on function public.get_leaderboard(integer, integer, integer) to anon, authenticated;
grant execute on function public.submit_score(uuid, text, text, integer, integer, integer) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
