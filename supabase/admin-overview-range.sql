-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — THE OVERVIEW OBEYS THE HEADER RANGE  (v1)
-- Run once in the Supabase dashboard → SQL editor.
--
-- WHY
-- admin_overview() took no argument, so nothing about the header's date range
-- could reach it. Growth carried TWO fixed tiles — "New · 7 days" and
-- "New · 30 days" — that reported the same thing over two frozen windows and
-- ignored the control above them. Changing the header appeared to do nothing.
--
-- This makes the function range-aware and collapses that pair into ONE tile
-- that answers whatever the header is set to, with its own prior-period
-- comparison for the delta.
--
-- WHAT DELIBERATELY DOES NOT MOVE
-- Not every number can honestly follow a window, and pretending otherwise
-- would be worse than not filtering at all:
--   · Total users, Never used, Public classes  — these are STATE, not events.
--   · DAU / WAU / MAU                          — the window IS the definition.
--   · Active today                             — 24h by definition.
--   · Experiment saves, Saved items            — counted from jsonb library
--     blobs, which carry no per-item timestamp. There is no date to filter on;
--     a ranged version would be a guess wearing a number's clothes.
-- The UI now labels each of these so it's clear they're fixed on purpose
-- rather than broken.
--
-- BACKWARD COMPATIBLE ON PURPOSE. The old new_users_7d / new_users_30d keys
-- are still returned alongside the new ones, and p_days defaults to 30, so
-- this can be run before or after the client deploys without a broken window
-- in either direction.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.admin_overview(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
declare d int;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  -- clamp: a hand-typed or stale value can't ask for a decade of scans
  d := greatest(1, least(coalesce(p_days, 30), 3650));
  select jsonb_build_object(
    'generated_at', now(),
    'range_days', d,
    'total_users',   (select count(*) from auth.users where banned_until is null or banned_until <= now()),

    -- ── the ranged pair: this is what the header drives ──
    'new_users', (select count(*) from auth.users
        where created_at >= now() - make_interval(days => d)),
    'new_users_prev', (select count(*) from auth.users
        where created_at >= now() - make_interval(days => d * 2)
          and created_at <  now() - make_interval(days => d)),

    -- kept so an older client (or one deployed after this) still renders
    'new_users_7d',  (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'new_users_30d', (select count(*) from auth.users where created_at >= now() - interval '30 days'),
    'new_users_prev_7d',  (select count(*) from auth.users where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'),
    'new_users_prev_30d', (select count(*) from auth.users where created_at >= now() - interval '60 days' and created_at < now() - interval '30 days'),

    -- "active today" = used the platform in the last 24h by ANY signal.
    -- last_sign_in_at alone misses persistent sessions (it only updates on a
    -- fresh password sign-in), so we also credit content updates and events.
    'active_today', (select count(*) from auth.users u
        where u.last_sign_in_at >= now() - interval '24 hours'
           or exists (select 1 from user_data d2 where d2.user_id = u.id and d2.updated_at >= now() - interval '24 hours')
           or exists (select 1 from analytics_events ae where ae.user_id = u.id and ae.created_at >= now() - interval '24 hours')),
    'signed_in_7d',  (select count(*) from auth.users where last_sign_in_at >= now() - interval '7 days'),
    'dau', (select count(distinct user_id) from analytics_events
              where user_id is not null and created_at >= now() - interval '1 day' and admin_is_meaningful(event_name)),
    'wau', (select count(distinct user_id) from analytics_events
              where user_id is not null and created_at >= now() - interval '7 days' and admin_is_meaningful(event_name)),
    'mau', (select count(distinct user_id) from analytics_events
              where user_id is not null and created_at >= now() - interval '30 days' and admin_is_meaningful(event_name)),
    'total_public_classes',   (select count(*) from public_classes where published),
    'total_public_saves',     (select count(*) from class_saves),
    'total_experiment_saves', (select coalesce(sum(jsonb_arr_len(payload)),0) from user_data where collection = 'flowschool_favs'),
    'total_saved_items',      (select coalesce(sum(jsonb_arr_len(payload)),0) from user_data),
    'admin_count',            (select count(*) from admin_users),
    'inactive_users', (select count(*) from auth.users u
        where (u.banned_until is null or u.banned_until <= now())
          and not exists (select 1 from user_data d2 where d2.user_id = u.id and jsonb_arr_len(d2.payload) > 0)),
    'events_tracked_since',   (select min(created_at) from analytics_events),
    'active_yesterday', (select count(*) from auth.users u
        where (u.last_sign_in_at >= now() - interval '48 hours' and u.last_sign_in_at < now() - interval '24 hours')
           or exists (select 1 from user_data d2 where d2.user_id = u.id and d2.updated_at >= now() - interval '48 hours' and d2.updated_at < now() - interval '24 hours')
           or exists (select 1 from analytics_events ae where ae.user_id = u.id and ae.created_at >= now() - interval '48 hours' and ae.created_at < now() - interval '24 hours'))
  ) into r;
  return r;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY
-- These stay COMMENTED because the SQL editor runs as postgres, not as a
-- signed-in admin — the function's is_admin() gate rejects it ("not
-- authorized ... at RAISE"), and that error rolls back the whole run.
-- The real verify is step 3, done in the app as yourself.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. The range actually moves the number:
-- select
--   (public.admin_overview(7)   ->> 'new_users')::int as new_7,
--   (public.admin_overview(30)  ->> 'new_users')::int as new_30,
--   (public.admin_overview(365) ->> 'new_users')::int as new_365;
--    expect: non-decreasing left to right. If all three match, every account
--    you have was created inside the last 7 days — check signup dates before
--    assuming it's broken.

-- 2. The default still works for any caller that passes nothing:
-- select (public.admin_overview() ->> 'range_days')::int;   -- expect 30

-- 3. In the UI: /admin → Overview → change the header range. The Growth
--    section should now show ONE "New · <range>" tile whose value and delta
--    both change with the control.

-- ═══════════════════════════════════════════════════════════════════════════
-- HISTORY
--   The zero-argument admin_overview() this file replaced is retired for good
--   (2026-08-21) — admin-analytics.sql now DROPs it rather than defining it,
--   because carrying both versions made any argument-less call ambiguous.
--   This ranged function is the only admin_overview.
-- ═══════════════════════════════════════════════════════════════════════════
