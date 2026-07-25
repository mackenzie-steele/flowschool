-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — SEED ADMINS
-- Run AFTER admin-analytics.sql, in the Supabase dashboard → SQL editor.
--
-- HOW TO CONFIGURE ADMINS:
--   1. Replace the two placeholder emails below with the real ones. They must
--      match the email each admin signs in with (auth.users.email).
--   2. Run this whole file. It only grants admin to accounts that already
--      exist — so each admin must have signed up first.
--   3. To ADD an admin later: add their email here and re-run (idempotent),
--      or insert one row manually. To REMOVE an admin: delete their row.
--
-- The allowlist lives ONLY in the database (public.admin_users). It is never
-- shipped to the browser and never hard-coded in client JS.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.admin_users (user_id, email, note, added_by)
select u.id, u.email, 'seed', u.id
from auth.users u
where lower(u.email) in (
  lower('BONNIE_ADMIN_EMAIL'),        -- ← replace with Bonnie's real email
  lower('MACKENZIE_ADMIN_EMAIL')      -- ← replace with Mackenzie's real email
)
on conflict (user_id) do nothing;

-- Confirm who is now an admin:
select au.email, au.added_at from public.admin_users au order by au.added_at;

-- If a row is missing, that email hasn't signed up yet. Have them create an
-- account, then re-run this file.
