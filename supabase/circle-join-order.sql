-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — THE CIRCLE IN JOIN ORDER  (v1)
-- Run once in the Supabase dashboard → SQL editor.
--
-- THE PROBLEM
-- circle.html already asks for newest-first:
--
--     .order('created_at', { ascending: false })
--
-- and that query has been failing on EVERY load, silently, because
-- public.profiles has no created_at column — only updated_at. The client
-- caught the error and quietly re-queried ordered by updated_at, so The Circle
-- has been sorted by MOST RECENTLY EDITED all along. A teacher who fixes a typo
-- jumps to the front; someone who joined yesterday and hasn't touched their
-- profile sits below a founding member who just changed their photo.
--
-- The true join time exists — auth.users.created_at — it just never reached
-- the view.
--
-- WHAT THIS DOES
--   1. Adds profiles.created_at.
--   2. BACKFILLS it from auth.users.created_at, so existing teachers keep
--      their real join dates instead of every row landing on today. Doing
--      this in the wrong order (default first, backfill later) would stamp
--      now() on everyone and destroy the very history we're restoring.
--   3. Defaults it to now() for rows created from here on.
--   4. Adds the column to circle_directory.
--
-- ON THE VIEW
-- created_at is appended AFTER the existing columns, in the same order, with
-- the same types — which is what lets CREATE OR REPLACE work. That matters
-- beyond tidiness: `create or replace` PRESERVES GRANTS, where drop-and-create
-- would silently drop them and leave the room unreadable to signed-in
-- teachers. The select list below is byte-for-byte the live definition plus
-- one line.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. the column ──────────────────────────────────────────────────────────
alter table public.profiles add column if not exists created_at timestamptz;

-- ── 2. backfill BEFORE setting a default, or everyone becomes "today" ──────
update public.profiles p
   set created_at = u.created_at
  from auth.users u
 where u.id = p.id
   and p.created_at is null;

-- ── 3. new rows carry their own birth time ─────────────────────────────────
-- (handle_new_user inserts id/full_name/email at signup, so the default lands
--  at the moment the account is created — join time and creation time agree)
alter table public.profiles alter column created_at set default now();

-- ── 4. the view, plus one column ───────────────────────────────────────────
create or replace view public.circle_directory as
 SELECT p.id,
    p.display_name,
    p.location,
    p.why_i_teach,
    p.teaching_since,
    p.teaching_style,
    p.avatar_url,
    p.website,
    p.instagram,
    p.updated_at,
    h.handle,
    p.created_at
   FROM profiles p
     LEFT JOIN handles h ON h.user_id = p.id
  WHERE p.in_circle = true;

-- re-asserted rather than assumed. create or replace keeps existing grants,
-- so these are almost certainly already in place — but a Circle that is
-- readable by anon, or unreadable by members, are both worth ruling out in
-- the same breath as touching the view.
grant select on public.circle_directory to authenticated;
revoke all on public.circle_directory from anon;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Nobody lost their history — every profile should have a join date, and
--    it should match the account's:
select count(*) filter (where p.created_at is null)                as missing,
       count(*) filter (where p.created_at <> u.created_at)        as disagrees_with_signup,
       count(*)                                                    as total
from public.profiles p
join auth.users u on u.id = p.id;
--    expect: missing = 0, disagrees_with_signup = 0

-- 2. The room, in the order it will now appear:
select display_name, handle, created_at, updated_at
from public.circle_directory
order by created_at desc nulls last;
--    Compare the two columns. Wherever they differ, that teacher was being
--    sorted by the wrong one — which is the bug this fixes.

-- 3. The column the client asks for now exists:
select column_name from information_schema.columns
where table_name = 'circle_directory' and column_name = 'created_at';
--    expect: one row

-- ═══════════════════════════════════════════════════════════════════════════
-- TO UNDO
--   create or replace view public.circle_directory as   -- (without created_at)
--     SELECT p.id, p.display_name, p.location, p.why_i_teach, p.teaching_since,
--            p.teaching_style, p.avatar_url, p.website, p.instagram,
--            p.updated_at, h.handle
--       FROM profiles p LEFT JOIN handles h ON h.user_id = p.id
--      WHERE p.in_circle = true;
--   -- the profiles.created_at column is harmless; leave it.
-- ═══════════════════════════════════════════════════════════════════════════
