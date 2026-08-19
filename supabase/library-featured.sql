-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — THE FEATURED HERO  (v1)
-- Run once in the Supabase dashboard → SQL editor. Additive; requires
-- video-library.sql and video-collections.sql (uses video_is_live /
-- collection_is_live). Safe to re-run.
--
-- The library home's hero is admin-curated: a row here IS a slide, and
-- sort_order is the carousel order. One table across both kinds of content,
-- so a collection can sit between two videos — the exactly-one-target shape
-- resource_links and library_saves already use.
--
-- Members only see rows whose target is LIVE, which makes featuring
-- something scheduled safe: the slide appears the moment the video does,
-- with no cron and no second publish step. When the table is empty the
-- front end falls back to newest-live content — the hero can never go blank
-- because nobody curated this week.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.library_featured (
  id            uuid primary key default gen_random_uuid(),
  video_id      uuid references public.videos(id) on delete cascade,
  collection_id uuid references public.collections(id) on delete cascade,
  -- the slide's little label ("New in the library" when null; a collection
  -- defaults to "Collection"). Curation flavor, per slide.
  eyebrow       text,
  sort_order    integer not null default 0,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint featured_has_one_target check (
    (video_id is not null)::int + (collection_id is not null)::int = 1)
);

-- self-heal: eyebrow arrived after some databases first created this table —
-- CREATE TABLE IF NOT EXISTS silently skips an existing table, so any later
-- column needs its own guard here too
alter table public.library_featured add column if not exists eyebrow text;

-- a thing is featured once; either column may be null so partial uniques
create unique index if not exists library_featured_video_idx
  on public.library_featured (video_id) where video_id is not null;
create unique index if not exists library_featured_collection_idx
  on public.library_featured (collection_id) where collection_id is not null;
create index if not exists library_featured_order_idx
  on public.library_featured (sort_order);

alter table public.library_featured enable row level security;

-- members see a slide only when its content is live — a featured draft or
-- future-scheduled row simply does not exist for them yet
drop policy if exists "members read live featured" on public.library_featured;
create policy "members read live featured" on public.library_featured
  for select to authenticated using (
    (video_id is not null and public.video_is_live(video_id))
    or (collection_id is not null and public.collection_is_live(collection_id)));

drop policy if exists "admins read all featured" on public.library_featured;
create policy "admins read all featured" on public.library_featured
  for select to authenticated using (public.is_admin());

drop policy if exists "admins write featured" on public.library_featured;
create policy "admins write featured" on public.library_featured
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.library_featured to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY
-- 1. insert into library_featured (video_id, sort_order)
--      values ((select id from videos where status='published' limit 1), 1);
--    → select * from library_featured;  → one row
-- 2. the same insert again → unique violation (featured once)
-- 3. a row with both video_id and collection_id → check violation
-- ═══════════════════════════════════════════════════════════════════════════
