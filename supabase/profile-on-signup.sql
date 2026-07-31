-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — SEED A PROFILE AT SIGNUP  (v1)
-- Run once in the Supabase dashboard → SQL editor.
--
-- WHY THIS EXISTS
-- signup.html now collects a first (required) and last (optional) name and
-- passes it to auth.signUp() as options.data, which Supabase stores on
-- auth.users.raw_user_meta_data. Everything the teacher SEES already works
-- from there — the dashboard greeting, the sidebar identity block, and the
-- printed class byline all read user_metadata.full_name as their fallback.
--
-- One thing doesn't: attribution on a SHARED class. The community_classes
-- view reads profiles.full_name —
--     coalesce(nullif(trim(p.full_name), ''), p.display_name) as author_name
-- — and a brand-new account has no profiles row, because rows are only
-- created lazily when someone saves the profile page. So a teacher who
-- shares a class before ever opening her profile is credited as
-- "A Flow School teacher" despite having told us her name at signup.
--
-- This trigger closes that gap: the profile row is born with the account.
--
-- ADDITIVE ONLY. Creates one function and one trigger. It does not alter any
-- existing table, weaken any RLS policy, or change any existing row. It never
-- overwrites a profile that already exists (on conflict do nothing).
--
-- SAFETY — THE IMPORTANT PART
-- A trigger that raises on auth.users will BLOCK ACCOUNT CREATION for
-- everyone. The insert below is therefore wrapped in its own exception
-- handler: if anything at all goes wrong (a renamed column, a future
-- constraint, a permissions change), it logs a warning and lets the signup
-- through. A missing profile row is a cosmetic problem and self-heals the
-- moment the teacher saves her profile. A failed signup is not.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── the function ────────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can write public.profiles regardless of the RLS
-- policies (there is no session yet at this point — the account is mid-birth).
-- search_path is pinned empty and every name fully qualified, so nothing can
-- be hijacked by a schema earlier on the caller's path.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.profiles (id, full_name, email)
    values (
      new.id,
      -- '' and '   ' both become null, so coalesce/nullif in the
      -- community_classes view behaves the way it expects
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
      new.email
    )
    on conflict (id) do nothing;   -- never clobber an existing profile
  exception when others then
    -- never let a profile problem cost someone their account
    raise warning '[flow school] profile seed failed for user %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;


-- ── the trigger ─────────────────────────────────────────────────────────────
-- AFTER insert: the auth.users row must exist before profiles.id can
-- reference it. Dropped first so this file is safe to re-run.

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ── backfill ────────────────────────────────────────────────────────────────
-- Covers the window between deploying the new signup form and running this
-- file: accounts created with a name in metadata but no profiles row yet.
--
-- Deliberately narrow — it only touches users who actually gave a name.
-- Accounts with no name gain nothing from an empty profile row, so they're
-- left alone and keep creating their row lazily, exactly as before.

insert into public.profiles (id, full_name, email)
select
  u.id,
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
  u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
  and nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), '') is not null
on conflict (id) do nothing;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. The trigger is attached:
select tgname, tgenabled
from pg_trigger
where tgrelid = 'auth.users'::regclass
  and tgname = 'on_auth_user_created';
--    expect: one row, tgenabled = 'O'

-- 2. Nobody with a signup name is missing a profile:
select count(*) as still_missing
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
  and nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), '') is not null;
--    expect: 0

-- 3. Spot-check the most recent accounts:
select u.email,
       u.raw_user_meta_data ->> 'full_name' as name_at_signup,
       p.full_name                          as name_on_profile,
       u.created_at
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at desc
limit 10;
--    expect: name_at_signup and name_on_profile agree for new accounts;
--    both null for older ones that predate the name field

-- 4. End to end: create a throwaway account on /signup with a name, then
--    re-run query 3. The new row should appear with both columns filled.


-- ═══════════════════════════════════════════════════════════════════════════
-- TO UNDO
--   drop trigger if exists on_auth_user_created on auth.users;
--   drop function if exists public.handle_new_user();
-- Profile rows already created are left in place; they're ordinary rows and
-- the app treats them exactly like any other.
--
-- NOTE ON DISPLAY NAME
-- This seeds full_name only, not display_name. They're different questions —
-- full_name is who you are (attribution, bylines), display_name is how you
-- want to be known publicly, and the profile page asks it separately. If you
-- ever decide a first name is a good default for display_name, add it to the
-- insert above; nothing else needs to change.
-- ═══════════════════════════════════════════════════════════════════════════
