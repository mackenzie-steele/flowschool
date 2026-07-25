-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — COMMUNITY CLASSES (v4.3)
-- Run once in the Supabase dashboard → SQL editor, BEFORE deploying v4.3.
--
-- The model, in one breath:
--   · public_classes — a teacher's deliberate, whitelisted PROJECTION of one
--     class. Never a copy of the private library: the client builds the row
--     from named teaching fields only (notes, stories, drafts can't leak
--     because they are never selected). Republished in place on every save,
--     so the row is always current.
--   · class_saves — a reference (user, public_class). No copy. Savers read
--     the live row, so an update by the author is seen by everyone
--     instantly. Unpublish flips `published` off: saves survive but RLS
--     hides the row, and re-sharing restores it to every saver's library.
--     Deleting the class deletes the row and cascades the saves away.
--   · community_classes — the read view, joined to profile identity for
--     attribution. Auth-only, like circle_directory.
--
-- Deliberately absent (the library, not the feed): save counts for authors,
-- follower mechanics, activity, rankings. class_saves is readable only by
-- its own user — nobody can count an audience, including the author.
--
-- Future features (collections, featured, forks, comments) hang off
-- public_classes.id without touching this core.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── the published projection ──────────────────────────────────────────────

create table if not exists public_classes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  source_id      bigint not null,          -- the class id inside the owner's library
  title          text not null default 'Untitled Class',
  class_type     text,
  length_minutes integer,
  payload        jsonb not null default '{}'::jsonb,  -- whitelisted teaching content only
  published      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, source_id)
);

create index if not exists public_classes_owner_idx
  on public_classes (owner_id) where published;

alter table public_classes enable row level security;

-- the author owns the row, always
create policy "owners manage their public classes"
  on public_classes for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- everyone signed in may read what is published
create policy "authed users read published classes"
  on public_classes for select to authenticated
  using (published);

-- ── the saved reference ───────────────────────────────────────────────────

create table if not exists class_saves (
  user_id         uuid not null references auth.users (id) on delete cascade,
  public_class_id uuid not null references public_classes (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (user_id, public_class_id)
);

alter table class_saves enable row level security;

-- your saves are yours alone — no audience counts exist for anyone
create policy "users manage their own saves"
  on class_saves for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── the read view: published classes wearing their author ─────────────────
-- DEFINER view, the circle_directory pattern: it reads profiles/handles
-- with owner rights so attribution works even when the profiles table's
-- own RLS is locked to own-row-only. The bypass is the intent — and it
-- is bounded by the select list below (public byline fields only) plus
-- the WHERE pc.published visibility rule. Anonymous keys get nothing.
-- LEFT joins: an author who never opened their profile page still
-- appears (the client falls back to "A Flow School teacher").

drop view if exists community_classes;

create view community_classes as
select
  pc.id,
  pc.owner_id,
  pc.source_id,
  pc.title,
  pc.class_type,
  pc.length_minutes,
  pc.payload,
  pc.created_at,
  pc.updated_at,
  -- attribution wears the person's real name (first + last), falling
  -- back to the display name for profiles that haven't filled it in
  coalesce(nullif(trim(p.full_name), ''), p.display_name) as author_name,
  p.avatar_url   as author_avatar,
  h.handle       as author_handle
from public_classes pc
left join profiles p on p.id = pc.owner_id
left join handles h on h.user_id = pc.owner_id
where pc.published;

grant select on community_classes to authenticated;
revoke all on community_classes from anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- END — after running, verify from outside (anon key):
--   SELECT public_classes    → 200, zero rows
--   SELECT class_saves       → 200, zero rows
--   SELECT community_classes → 401/permission denied
-- ═══════════════════════════════════════════════════════════════════════════
