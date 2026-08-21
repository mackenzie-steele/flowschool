-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — SORTABLE COLUMNS ON THE USERS TABLE  (v1)
-- Run once in the Supabase dashboard → SQL editor.
--
-- WHY THIS NEEDS SQL AT ALL
-- Every other admin table sorts in the browser, because every other table is
-- fully fetched. The Users table is PAGINATED SERVER-SIDE — sorting the fifty
-- rows on screen would reorder a page out of four hundred and quietly answer a
-- different question than the one asked. The sort has to happen in the query.
--
-- WHAT WAS MISSING
--   · NO DIRECTION. Each sort ran one way only. A header you can click but
--     can't reverse is a broken affordance, so every column needed asc + desc.
--   · THREE COLUMNS HAD NO SORT AT ALL — Status, Published and Saves were
--     displayed but unsortable, though _rows already carries every value.
--
-- WHAT THIS DOES
--   · Adds p_dir ('asc' | 'desc'), defaulting to 'desc' and clamped.
--   · Adds three sort keys: status, published, saves.
--   · Leaves filtering, searching, paging and the return shape untouched.
--
-- SIGNATURE CHANGE — the drop below is REQUIRED. `create or replace` with a new
-- parameter list creates an OVERLOAD rather than replacing, and PostgREST would
-- then face two candidates and refuse the call. Dropping first is what makes
-- this a replacement.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.admin_list_users(text, text, text, int, int, int);

create or replace function public.admin_list_users(
  p_search text default null,
  p_sort   text default 'recent_activity',   -- recent_activity | signup | saved_items
                                             -- | events | name | status | published | saves
  p_dir    text default 'desc',              -- asc | desc
  p_status text default null,                -- active | deactivated | admin | inactive | null(all)
  p_limit  int  default 50,
  p_offset int  default 0,
  p_signup_days int default null             -- signed up within the last N days (null = all)
) returns jsonb language plpgsql security definer set search_path = public as $$
declare total bigint; rows jsonb; dir text;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  -- anything that isn't a direction is treated as the default, so a stale or
  -- hand-typed value can never reach the order-by
  dir := case when lower(coalesce(p_dir,'')) = 'asc' then 'asc' else 'desc' end;

  create temp table _rows on commit drop as
  with counts as (
    select user_id,
      coalesce(sum(jsonb_arr_len(payload)),0) as saved_items,
      coalesce(sum(case when collection='flowschool_classes' then jsonb_arr_len(payload) else 0 end),0) as classes,
      coalesce(sum(case when collection='flowschool_favs'    then jsonb_arr_len(payload) else 0 end),0) as experiments,
      max(updated_at) as last_update
    from user_data group by user_id
  ),
  pub as (select owner_id, count(*) filter (where published) as public_classes from public_classes group by owner_id),
  sav as (select user_id, count(*) as public_saves from class_saves group by user_id),
  ev  as (select user_id, count(*) as events,
                 max(created_at) filter (where admin_is_meaningful(event_name)) as last_action
          from analytics_events where user_id is not null group by user_id)
  select
    u.id as user_id, u.email, u.created_at as signed_up, u.last_sign_in_at,
    (u.email_confirmed_at is not null) as email_confirmed,
    (u.banned_until is not null and u.banned_until > now()) as deactivated,
    coalesce(nullif(trim(p.full_name),''), p.display_name) as name,
    h.handle,
    (a.user_id is not null) as is_admin,
    coalesce(c.saved_items,0) as saved_items, coalesce(c.classes,0) as classes,
    coalesce(c.experiments,0) as experiments,
    coalesce(pb.public_classes,0) as public_classes, coalesce(s.public_saves,0) as public_saves,
    coalesce(e.events,0) as events,
    greatest(u.last_sign_in_at, c.last_update, e.last_action) as last_activity
  from auth.users u
  left join profiles p on p.id = u.id
  left join handles  h on h.user_id = u.id
  left join admin_users a on a.user_id = u.id
  left join counts c on c.user_id = u.id
  left join pub pb on pb.owner_id = u.id
  left join sav s on s.user_id = u.id
  left join ev  e on e.user_id = u.id;

  if p_search is not null and p_search <> '' then
    delete from _rows where not (
      email ilike '%'||p_search||'%' or coalesce(name,'') ilike '%'||p_search||'%' or coalesce(handle,'') ilike '%'||p_search||'%'
    );
  end if;
  if p_status = 'active'      then delete from _rows where deactivated; end if;
  if p_status = 'deactivated' then delete from _rows where not deactivated; end if;
  if p_status = 'admin'       then delete from _rows where not is_admin; end if;
  if p_status = 'inactive'    then delete from _rows where saved_items > 0; end if;
  if p_signup_days is not null and p_signup_days > 0 then
    delete from _rows where signed_up < now() - (p_signup_days || ' days')::interval;
  end if;

  select count(*) into total from _rows;

  -- One CASE per column per direction. Verbose, but the sort key can only ever
  -- be a literal this function wrote — there is no dynamic SQL and nothing from
  -- the client reaches the order-by. An unrecognised p_sort simply matches
  -- nothing and falls through to the last_activity tiebreak.
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into rows from (
    select * from _rows order by
      -- identity
      case when p_sort='name' and dir='asc'  then lower(coalesce(name,email)) end asc  nulls last,
      case when p_sort='name' and dir='desc' then lower(coalesce(name,email)) end desc nulls last,
      -- status: admin → active → deactivated, so "asc" reads most- to least-privileged
      case when p_sort='status' and dir='asc'  then (case when deactivated then 2 when is_admin then 0 else 1 end) end asc  nulls last,
      case when p_sort='status' and dir='desc' then (case when deactivated then 2 when is_admin then 0 else 1 end) end desc nulls last,
      -- dates
      case when p_sort='signup' and dir='asc'  then signed_up end asc  nulls last,
      case when p_sort='signup' and dir='desc' then signed_up end desc nulls last,
      case when p_sort='recent_activity' and dir='asc'  then last_activity end asc  nulls last,
      case when p_sort='recent_activity' and dir='desc' then last_activity end desc nulls last,
      -- counts
      case when p_sort='saved_items' and dir='asc'  then saved_items end asc  nulls last,
      case when p_sort='saved_items' and dir='desc' then saved_items end desc nulls last,
      case when p_sort='published' and dir='asc'  then public_classes end asc  nulls last,
      case when p_sort='published' and dir='desc' then public_classes end desc nulls last,
      case when p_sort='saves' and dir='asc'  then public_saves end asc  nulls last,
      case when p_sort='saves' and dir='desc' then public_saves end desc nulls last,
      case when p_sort='events' and dir='asc'  then events end asc  nulls last,
      case when p_sort='events' and dir='desc' then events end desc nulls last,
      last_activity desc nulls last
    limit greatest(p_limit,1) offset greatest(p_offset,0)
  ) t;

  return jsonb_build_object('total', total, 'rows', rows);
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY
-- Steps 1–3 stay COMMENTED: the SQL editor runs as postgres, not a signed-in
-- admin, so the is_admin() gate raises "not authorized" and rolls back the
-- whole run. Verify those in the app as yourself.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Direction actually reverses. The first email of an
--    ascending sort should be the last of a descending one:
-- select
--   (public.admin_list_users(p_sort=>'signup', p_dir=>'desc', p_limit=>1) -> 'rows' -> 0 ->> 'email') as newest,
--   (public.admin_list_users(p_sort=>'signup', p_dir=>'asc',  p_limit=>1) -> 'rows' -> 0 ->> 'email') as oldest;
--    expect: two different emails (identical only if you have exactly one user)

-- 2. The three new keys return something:
-- select
--   jsonb_array_length(public.admin_list_users(p_sort=>'published', p_limit=>5) -> 'rows') as published_ok,
--   jsonb_array_length(public.admin_list_users(p_sort=>'saves',     p_limit=>5) -> 'rows') as saves_ok,
--   jsonb_array_length(public.admin_list_users(p_sort=>'status',    p_limit=>5) -> 'rows') as status_ok;

-- 3. A nonsense direction falls back rather than erroring:
-- select (public.admin_list_users(p_sort=>'signup', p_dir=>'sideways', p_limit=>1) -> 'rows' -> 0 ->> 'email');
--    expect: the newest signup — same as p_dir=>'desc'

-- 4. Only ONE function exists (the drop worked — two would break PostgREST):
select count(*) from pg_proc where proname = 'admin_list_users';
--    expect: 1

-- ═══════════════════════════════════════════════════════════════════════════
-- TO UNDO
--   drop function if exists public.admin_list_users(text,text,text,text,int,int,int);
--   then re-run the admin_list_users block in supabase/admin-analytics.sql.
-- ═══════════════════════════════════════════════════════════════════════════
