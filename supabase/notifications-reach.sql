-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — NOTIFICATION REACH  (v1)
-- Run once in the Supabase dashboard → SQL editor.
-- Depends on notifications.sql and admin-analytics.sql (is_admin, auth.users).
--
-- ADDITIVE. notifications.sql is unchanged and does NOT need re-running.
--
-- WHY A FUNCTION AND NOT A QUERY
-- notification_reads is locked to `user_id = auth.uid()` — a teacher can only
-- ever see their own receipts, which is the whole point. Counting across all
-- users therefore cannot happen from the client at any privilege the client
-- has. This runs as definer and refuses anyone who is not an admin.
--
-- THE DENOMINATOR IS THE SAME ONE THE ADMIN ALREADY SHOWS
-- `auth.users` minus banned accounts — the exact predicate behind "Total
-- users" in admin_overview. A reach percentage measured against a different
-- population than the one on the next tile is worse than no percentage.
--
-- IT COUNTS WHO CAN SEE IT NOW, NOT WHO COULD SEE IT THEN
-- Someone who signed up after publication still has the notification sitting
-- unread in their panel, so they belong in the denominator. The effect is
-- that an old notification's percentage drifts down as the platform grows —
-- which is honest: it says "this share of today's teachers have read it".
-- ═══════════════════════════════════════════════════════════════════════════

-- NOTE ON THE COLUMN NAMES
-- The output columns are nid/reads/audience, NOT notification_id. A plpgsql
-- OUT parameter shares a namespace with column references in the body, so
-- naming one `notification_id` shadows notification_reads.notification_id in
-- the subquery below and the function fails to create with an ambiguity
-- error. Renaming the output is the fix; qualifying the column is not
-- reliably enough.
create or replace function public.notification_reach()
returns table (nid bigint, reads integer, audience integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;

  return query
  select n.id::bigint,
         (select count(*)::int
            from notification_reads rr
           where rr.notification_id = n.id),
         (select count(*)::int
            from auth.users u
           where u.banned_until is null or u.banned_until <= now())
    from notifications n
   where n.status = 'published';
end $$;

revoke all on function public.notification_reach() from public, anon;
grant execute on function public.notification_reach() to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. as an admin, one row per published notification:
--      select * from notification_reach();

-- 2. as a NON-admin:
--      select * from notification_reach();
--    expect: ERROR  admins only

-- 3. the denominator matches the Total users tile:
--      select (notification_reach()).audience limit 1;
--      select (admin_overview(30)->>'total_users');
--    expect: the same number

-- ═══════════════════════════════════════════════════════════════════════════
-- TO UNDO
--   drop function if exists public.notification_reach();
-- ═══════════════════════════════════════════════════════════════════════════
