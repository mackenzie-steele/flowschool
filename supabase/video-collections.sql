-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — COLLECTIONS, RESOURCE LIBRARY, FILTERS, INSTRUCTORS  (v1)
-- Run once in the Supabase dashboard → SQL editor.
-- Additive: video-library.sql, video-scheduling.sql and video-thumbnails.sql
-- are unchanged and do NOT need re-running. Depends on all three.
--
-- THE SHAPE
--   Category → Collection → Videos
-- A category is a shelf. A collection is a curated set of videos meant to be
-- watched together (a class combo, a series). A video is the atom. Nothing
-- here duplicates a video or a Mux asset — membership is rows in junction
-- tables, so the same video can sit in three collections and five categories
-- and still be exactly one row in `videos` and one asset at Mux.
--
-- WHAT'S NEW
--   collections            what a collection IS (title, slug, art, SEO, state)
--   collection_items       the ordered playlist — video rows AND divider rows
--   collection_categories  collection ↔ category (many-to-many)
--   video_category_links   video ↔ category (many-to-many; the primary
--                          videos.category_id stays and is mirrored in here)
--   instructors            so Bonnie is data, not a hard-coded string
--   resources              the reusable file library (was: per-video rows)
--   resource_links         resource ↔ video OR collection
--   filters/filter_options/content_filter_values
--                          admin-defined attributes (Movement Focus: Hips…)
--   videos.admin_notes, videos.captions
--
-- ORDERING IS EXPLICIT
-- collection_items.position is the playlist. Never creation date, never id.
-- Dividers live in the SAME ordered list as videos, so the admin's exact
-- arrangement — FOUNDATION, two videos, BUILD, two videos — is one sequence
-- the frontend can replay without guessing.
--
-- RESOURCES BECOME A LIBRARY
-- video_resources rows are COPIED (same ids, same storage paths) into
-- `resources` + `resource_links`. The old table is left in place, untouched,
-- as a safety net; nothing reads or writes it after this runs and the site
-- deploys. Drop it later, once the new tables have been verified in use.
--
-- DELETION
-- Same philosophy as videos: archive, don't delete. Deleting a collection
-- removes its membership rows only — never a video, a Mux asset, a category
-- or a resource file.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. instructors ─────────────────────────────────────────────────────────
-- Almost everything is Bonnie today, but "Bonnie" should be a row, not a
-- string baked into every record. name/slug/bio/image are what a public
-- profile page will eventually need; nothing more is invented now.
create table if not exists public.instructors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null,
  bio         text,
  image_url   text,
  status      text not null default 'active'
                check (status in ('active','archived')),
  sort_order  integer not null default 0,
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint instructor_name_not_blank check (length(btrim(name)) between 1 and 120),
  constraint instructor_slug_shape     check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
create unique index if not exists instructors_slug_idx
  on public.instructors (lower(slug));

insert into public.instructors (name, slug)
select 'Bonnie Weeks', 'bonnie-weeks'
where not exists (select 1 from public.instructors where lower(slug) = 'bonnie-weeks');

alter table public.videos
  add column if not exists instructor_id uuid references public.instructors(id) on delete set null;

-- every existing video is Bonnie's; new ones default in the UI, not the DB
update public.videos set instructor_id =
  (select id from public.instructors where lower(slug) = 'bonnie-weeks')
where instructor_id is null;


-- ── 2. new columns on videos ───────────────────────────────────────────────
-- admin_notes: for Bonnie and Mackenzie only ("needs new thumbnail",
-- "reshoot intro"). Never rendered on a member surface — the member library
-- must simply never select it.
alter table public.videos add column if not exists admin_notes text;

-- captions: what Mux knows about this asset's text tracks, kept current by
-- the webhook. A jsonb list of {id, language_code, name, status, source}
-- rather than a table, because we only mirror Mux state — we are not (yet)
-- authoring caption files ourselves.
alter table public.videos add column if not exists captions jsonb not null default '[]'::jsonb;


-- ── 3. collections ─────────────────────────────────────────────────────────
-- Statuses mirror videos minus the file-pipeline states — a collection has
-- no upload to wait for. Scheduling works exactly like videos: 'scheduled'
-- + a future published_at, made visible by the read policy comparing that
-- timestamp to now(). No cron.
create table if not exists public.collections (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  slug                 text not null,
  short_description    text,          -- the card
  description          text,          -- the collection page

  status               text not null default 'draft'
                         check (status in ('draft','published','scheduled','archived')),
  -- 'unlisted' = reachable by direct link, absent from library browse.
  -- Deliberately separate from status: a private learning path is published
  -- AND hidden, and conflating the two makes both unreadable.
  visibility           text not null default 'members'
                         check (visibility in ('members','public','unlisted')),

  -- ── artwork ──
  -- 'first_video' borrows the first playlist video's thumbnail — the useful
  -- default. 'custom' is an uploaded image. Three ratios, three columns —
  -- horizontal is the catalog card; vertical and square exist for category
  -- rows that will eventually prefer them. Explicit columns, not a jsonb
  -- blob, so a missing ratio is visibly NULL.
  thumbnail_mode         text not null default 'first_video'
                           check (thumbnail_mode in ('first_video','custom')),
  custom_thumbnail_url   text,        -- horizontal / landscape
  thumbnail_vertical_url text,
  thumbnail_square_url   text,

  instructor_id        uuid references public.instructors(id) on delete set null,

  -- ── discovery ──
  seo_title            text,
  seo_description      text,
  search_keywords      text[] not null default '{}',

  admin_notes          text,          -- internal only, like videos.admin_notes

  published_at         timestamptz,
  archived_at          timestamptz,
  created_by           uuid references auth.users(id) on delete set null,
  updated_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint collection_title_not_blank check (length(btrim(title)) between 1 and 160),
  constraint collection_slug_shape      check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint collection_keywords_sane   check (
    array_length(search_keywords, 1) is null or array_length(search_keywords, 1) <= 40),
  constraint custom_thumb_has_a_url     check (
    thumbnail_mode <> 'custom' or custom_thumbnail_url is not null),
  -- category and ≥1 video are cross-table rules; publish_collection() below
  -- enforces those. This one a CHECK can hold: live means dated.
  constraint published_collection_is_dated check (
    status not in ('published','scheduled') or published_at is not null)
);

-- Self-heal for databases whose collections table predates these columns:
-- CREATE TABLE IF NOT EXISTS silently skips an existing table, so any column
-- added to the block above after a database's first run must ALSO be guarded
-- here or that database never gets it.
alter table public.collections add column if not exists thumbnail_vertical_url text;
alter table public.collections add column if not exists thumbnail_square_url   text;

create unique index if not exists collections_slug_idx on public.collections (lower(slug));
create index if not exists collections_admin_idx on public.collections (updated_at desc);
create index if not exists collections_published_idx
  on public.collections (published_at desc) where status in ('published','scheduled');
create index if not exists collections_keywords_idx
  on public.collections using gin (search_keywords);

-- same weighted search document videos use, same function, so library search
-- can treat both kinds of content identically
create index if not exists collections_fts_idx on public.collections using gin (
  public.video_search_doc(title, short_description, description, search_keywords)
);


-- ── 4. the playlist: collection_items ──────────────────────────────────────
-- ONE ordered list holding two kinds of row. A 'video' row points at a video;
-- a 'divider' row is a named heading (FOUNDATION, BUILD…). Keeping dividers
-- in the same sequence — rather than a separate "sections" table — means
-- drag-and-drop is one reorder of one list, and the frontend reproduces the
-- admin's exact arrangement by reading positions in order.
create table if not exists public.collection_items (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  kind          text not null check (kind in ('video','divider')),
  -- CASCADE: deleting a video removes its playlist rows. The collection
  -- survives; the video was the thing deleted.
  video_id      uuid references public.videos(id) on delete cascade,
  label         text,              -- the divider's name
  position      integer not null,
  created_at    timestamptz not null default now(),

  -- a video row has a video and no label; a divider has a label and no video
  constraint item_shape check (
    (kind = 'video'   and video_id is not null and label is null) or
    (kind = 'divider' and video_id is null
       and length(btrim(coalesce(label,''))) between 1 and 80)
  )
);

-- the same video once per collection — appearing twice in one playlist is
-- always a mistake, while appearing in many collections is the whole point
create unique index if not exists collection_items_video_once_idx
  on public.collection_items (collection_id, video_id) where kind = 'video';
create index if not exists collection_items_order_idx
  on public.collection_items (collection_id, position);
create index if not exists collection_items_video_idx
  on public.collection_items (video_id) where video_id is not null;


-- ── 5. collection ↔ category ───────────────────────────────────────────────
-- RESTRICT on the category side: a category in use cannot be deleted out
-- from under a collection (same rule videos already have). Archiving a
-- category never touches these rows.
create table if not exists public.collection_categories (
  collection_id uuid not null references public.collections(id) on delete cascade,
  category_id   uuid not null references public.video_categories(id) on delete restrict,
  -- the category page's MANUAL order. Videos and collections share one
  -- sequence per category (the category editor interleaves both tables by
  -- this number), which is how "reorder featured content" stays one drag.
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  primary key (collection_id, category_id)
);
-- self-heal: sort_order arrived after some databases first created this table
alter table public.collection_categories
  add column if not exists sort_order integer not null default 0;

create index if not exists collection_categories_cat_idx
  on public.collection_categories (category_id);


-- ── 6. video ↔ category, many-to-many ──────────────────────────────────────
-- videos.category_id stays: it is the PRIMARY category, publish_video()
-- depends on it, and the existing admin and member reads use it. This table
-- is the full membership, and a trigger keeps the primary mirrored into it,
-- so "videos in category X" is always ONE query against one table.
create table if not exists public.video_category_links (
  video_id    uuid not null references public.videos(id) on delete cascade,
  category_id uuid not null references public.video_categories(id) on delete restrict,
  sort_order  integer not null default 0,   -- see collection_categories
  created_at  timestamptz not null default now(),
  primary key (video_id, category_id)
);
-- self-heal: sort_order arrived after some databases first created this table
alter table public.video_category_links
  add column if not exists sort_order integer not null default 0;

create index if not exists video_category_links_cat_idx
  on public.video_category_links (category_id);

create or replace function public.sync_video_primary_category()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category_id is not null then
    insert into video_category_links (video_id, category_id)
    values (new.id, new.category_id)
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists videos_sync_primary_category on public.videos;
create trigger videos_sync_primary_category
  after insert or update of category_id on public.videos
  for each row execute function public.sync_video_primary_category();

-- backfill what already exists
insert into public.video_category_links (video_id, category_id)
select id, category_id from public.videos where category_id is not null
on conflict do nothing;


-- ── 7. the resource library ────────────────────────────────────────────────
-- A resource is a FILE with a name, owned by nobody in particular; links say
-- where it appears. The same worksheet can sit on a collection and on three
-- videos without existing four times. mime_type is open-ended on purpose —
-- the bucket still only admits PDFs today, so widening to audio or slides is
-- a bucket-settings change, not a schema change.
create table if not exists public.resources (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  storage_path text not null,       -- bucket-relative PATH, never a URL
  file_name    text,
  file_size    bigint,
  mime_type    text not null default 'application/pdf',
  status       text not null default 'active'
                 check (status in ('active','archived')),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint library_resource_title_not_blank check (length(btrim(title)) between 1 and 120),
  constraint library_resource_size_sane check (file_size is null or file_size <= 26214400)
);
create unique index if not exists resources_path_idx on public.resources (storage_path);

create table if not exists public.resource_links (
  id            uuid primary key default gen_random_uuid(),
  resource_id   uuid not null references public.resources(id) on delete cascade,
  video_id      uuid references public.videos(id) on delete cascade,
  collection_id uuid references public.collections(id) on delete cascade,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),

  -- exactly one parent — a link is to a video OR to a collection
  constraint link_has_one_parent check (
    (video_id is not null)::int + (collection_id is not null)::int = 1)
);
create unique index if not exists resource_links_video_once_idx
  on public.resource_links (resource_id, video_id) where video_id is not null;
create unique index if not exists resource_links_collection_once_idx
  on public.resource_links (resource_id, collection_id) where collection_id is not null;
create index if not exists resource_links_video_idx
  on public.resource_links (video_id, sort_order) where video_id is not null;
create index if not exists resource_links_collection_idx
  on public.resource_links (collection_id, sort_order) where collection_id is not null;
create index if not exists resource_links_resource_idx
  on public.resource_links (resource_id);

-- migrate: same ids, same paths, so nothing already uploaded moves or breaks.
-- Idempotent — running this file twice copies nothing twice.
insert into public.resources
  (id, title, description, storage_path, file_name, file_size, mime_type,
   created_by, created_at, updated_at)
select id, title, description, storage_path, file_name, file_size, mime_type,
       created_by, created_at, updated_at
from public.video_resources
on conflict (id) do nothing;

insert into public.resource_links (resource_id, video_id, sort_order)
select vr.id, vr.video_id, vr.sort_order
from public.video_resources vr
where not exists (select 1 from public.resource_links l
                  where l.resource_id = vr.id and l.video_id = vr.video_id);

-- video_resources is now legacy. It is intentionally NOT dropped here — drop
-- it by hand once the new tables are verified in production:
--   drop table public.video_resources;


-- ── 8. filters ─────────────────────────────────────────────────────────────
-- Admin-defined attributes: a filter ("Movement Focus") owns options
-- ("Hips", "Shoulders"), and values attach options to a video or a
-- collection. Nothing yoga-specific is hard-coded — Bonnie invents the
-- taxonomy in the admin, and multi-select falls out of values being rows.
create table if not exists public.filters (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null,
  sort_order  integer not null default 0,
  status      text not null default 'active'
                check (status in ('active','archived')),
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint filter_name_not_blank check (length(btrim(name)) between 1 and 80),
  constraint filter_slug_shape     check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
create unique index if not exists filters_slug_idx on public.filters (lower(slug));

create table if not exists public.filter_options (
  id          uuid primary key default gen_random_uuid(),
  filter_id   uuid not null references public.filters(id) on delete cascade,
  name        text not null,
  slug        text not null,
  sort_order  integer not null default 0,
  status      text not null default 'active'
                check (status in ('active','archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint option_name_not_blank check (length(btrim(name)) between 1 and 80),
  constraint option_slug_shape     check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
create unique index if not exists filter_options_unique_idx
  on public.filter_options (filter_id, lower(slug));
create index if not exists filter_options_filter_idx
  on public.filter_options (filter_id, sort_order);

create table if not exists public.content_filter_values (
  id            uuid primary key default gen_random_uuid(),
  option_id     uuid not null references public.filter_options(id) on delete cascade,
  video_id      uuid references public.videos(id) on delete cascade,
  collection_id uuid references public.collections(id) on delete cascade,
  created_at    timestamptz not null default now(),

  constraint value_has_one_parent check (
    (video_id is not null)::int + (collection_id is not null)::int = 1)
);
create unique index if not exists content_filter_values_video_idx
  on public.content_filter_values (option_id, video_id) where video_id is not null;
create unique index if not exists content_filter_values_collection_idx
  on public.content_filter_values (option_id, collection_id) where collection_id is not null;
create index if not exists content_filter_values_by_video_idx
  on public.content_filter_values (video_id) where video_id is not null;
create index if not exists content_filter_values_by_collection_idx
  on public.content_filter_values (collection_id) where collection_id is not null;


-- ── 9. collection_stats — count and runtime, computed, never typed ─────────
-- security_invoker so the view runs under the CALLER's RLS: a member summing
-- a draft collection sees nothing, because they cannot see its rows. Without
-- this a Supabase view runs as its owner and quietly bypasses every policy.
create or replace view public.collection_stats
with (security_invoker = true) as
select c.id as collection_id,
       count(i.id) filter (where i.kind = 'video')            as video_count,
       coalesce(sum(v.duration_seconds)
                filter (where i.kind = 'video'), 0)::numeric  as total_seconds
from public.collections c
left join public.collection_items i on i.collection_id = c.id
left join public.videos v on v.id = i.video_id
group by c.id;

grant select on public.collection_stats to authenticated;


-- ── 10. updated_at triggers (same function videos use) ─────────────────────
drop trigger if exists collections_touch on public.collections;
create trigger collections_touch before update on public.collections
  for each row execute function public.touch_video_row();
drop trigger if exists instructors_touch on public.instructors;
create trigger instructors_touch before update on public.instructors
  for each row execute function public.touch_video_row();
drop trigger if exists resources_touch on public.resources;
create trigger resources_touch before update on public.resources
  for each row execute function public.touch_video_row();
drop trigger if exists filters_touch on public.filters;
create trigger filters_touch before update on public.filters
  for each row execute function public.touch_video_row();
drop trigger if exists filter_options_touch on public.filter_options;
create trigger filter_options_touch before update on public.filter_options
  for each row execute function public.touch_video_row();

-- editing the playlist or a collection's category set should read as "the
-- collection changed" in the admin list, so those junctions touch the parent
create or replace function public.touch_parent_collection()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update collections set updated_at = now()
   where id = coalesce(new.collection_id, old.collection_id);
  return coalesce(new, old);
end $$;

drop trigger if exists collection_items_touch_parent on public.collection_items;
create trigger collection_items_touch_parent
  after insert or update or delete on public.collection_items
  for each row execute function public.touch_parent_collection();
drop trigger if exists collection_categories_touch_parent on public.collection_categories;
create trigger collection_categories_touch_parent
  after insert or delete on public.collection_categories
  for each row execute function public.touch_parent_collection();


-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- Hiding admin UI is a courtesy; this is the enforcement. The member-facing
-- rule everywhere: you can read what hangs off a collection you can read,
-- and a collection is readable when it is published (or scheduled and due).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.collections           enable row level security;
alter table public.collection_items      enable row level security;
alter table public.collection_categories enable row level security;
alter table public.video_category_links  enable row level security;
alter table public.instructors           enable row level security;
alter table public.resources             enable row level security;
alter table public.resource_links        enable row level security;
alter table public.filters               enable row level security;
alter table public.filter_options        enable row level security;
alter table public.content_filter_values enable row level security;

-- one readable-by-members test, used by every dependent policy below
create or replace function public.collection_is_live(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from collections c
    where c.id = p_id
      and (c.status = 'published'
           or (c.status = 'scheduled' and c.published_at <= now())));
$$;
revoke all on function public.collection_is_live(uuid) from public, anon;
grant execute on function public.collection_is_live(uuid) to authenticated;

-- the matching test for videos (mirrors the existing member read policy)
create or replace function public.video_is_live(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from videos v
    where v.id = p_id
      and (v.status = 'published'
           or (v.status = 'scheduled' and v.published_at <= now())));
$$;
revoke all on function public.video_is_live(uuid) from public, anon;
grant execute on function public.video_is_live(uuid) to authenticated;

-- ── collections ──
drop policy if exists "members read live collections" on public.collections;
create policy "members read live collections" on public.collections
  for select to authenticated
  using (status = 'published' or (status = 'scheduled' and published_at <= now()));

drop policy if exists "admins read all collections" on public.collections;
create policy "admins read all collections" on public.collections
  for select to authenticated using (public.is_admin());

drop policy if exists "admins write collections" on public.collections;
create policy "admins write collections" on public.collections
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── collection_items ──
drop policy if exists "members read live collection items" on public.collection_items;
create policy "members read live collection items" on public.collection_items
  for select to authenticated using (public.collection_is_live(collection_id));

drop policy if exists "admins read all collection items" on public.collection_items;
create policy "admins read all collection items" on public.collection_items
  for select to authenticated using (public.is_admin());

drop policy if exists "admins write collection items" on public.collection_items;
create policy "admins write collection items" on public.collection_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── collection_categories ──
drop policy if exists "members read live collection categories" on public.collection_categories;
create policy "members read live collection categories" on public.collection_categories
  for select to authenticated using (public.collection_is_live(collection_id));

drop policy if exists "admins read all collection categories" on public.collection_categories;
create policy "admins read all collection categories" on public.collection_categories
  for select to authenticated using (public.is_admin());

drop policy if exists "admins write collection categories" on public.collection_categories;
create policy "admins write collection categories" on public.collection_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── video_category_links ──
drop policy if exists "members read live video category links" on public.video_category_links;
create policy "members read live video category links" on public.video_category_links
  for select to authenticated using (public.video_is_live(video_id));

drop policy if exists "admins read all video category links" on public.video_category_links;
create policy "admins read all video category links" on public.video_category_links
  for select to authenticated using (public.is_admin());

drop policy if exists "admins write video category links" on public.video_category_links;
create policy "admins write video category links" on public.video_category_links
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── instructors ──
drop policy if exists "authed read active instructors" on public.instructors;
create policy "authed read active instructors" on public.instructors
  for select to authenticated using (status = 'active');

drop policy if exists "admins read all instructors" on public.instructors;
create policy "admins read all instructors" on public.instructors
  for select to authenticated using (public.is_admin());

drop policy if exists "admins write instructors" on public.instructors;
create policy "admins write instructors" on public.instructors
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── resources ──
-- a member may see a resource's row when it is attached to something they
-- can see; the FILE still only arrives via a signed URL from the API
drop policy if exists "members read live resources" on public.resources;
create policy "members read live resources" on public.resources
  for select to authenticated using (
    exists (select 1 from public.resource_links l
            -- resources.id must be QUALIFIED: resource_links has its own id
            -- column, and an unqualified `id` here would bind to l.id
            where l.resource_id = resources.id
              and ((l.video_id is not null and public.video_is_live(l.video_id))
                or (l.collection_id is not null and public.collection_is_live(l.collection_id)))));

drop policy if exists "admins read all library resources" on public.resources;
create policy "admins read all library resources" on public.resources
  for select to authenticated using (public.is_admin());

drop policy if exists "admins write library resources" on public.resources;
create policy "admins write library resources" on public.resources
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── resource_links ──
drop policy if exists "members read live resource links" on public.resource_links;
create policy "members read live resource links" on public.resource_links
  for select to authenticated using (
    (video_id is not null and public.video_is_live(video_id))
    or (collection_id is not null and public.collection_is_live(collection_id)));

drop policy if exists "admins read all resource links" on public.resource_links;
create policy "admins read all resource links" on public.resource_links
  for select to authenticated using (public.is_admin());

drop policy if exists "admins write resource links" on public.resource_links;
create policy "admins write resource links" on public.resource_links
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── filters ──
drop policy if exists "authed read active filters" on public.filters;
create policy "authed read active filters" on public.filters
  for select to authenticated using (status = 'active');
drop policy if exists "admins read all filters" on public.filters;
create policy "admins read all filters" on public.filters
  for select to authenticated using (public.is_admin());
drop policy if exists "admins write filters" on public.filters;
create policy "admins write filters" on public.filters
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "authed read active filter options" on public.filter_options;
create policy "authed read active filter options" on public.filter_options
  for select to authenticated using (status = 'active');
drop policy if exists "admins read all filter options" on public.filter_options;
create policy "admins read all filter options" on public.filter_options
  for select to authenticated using (public.is_admin());
drop policy if exists "admins write filter options" on public.filter_options;
create policy "admins write filter options" on public.filter_options
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "members read live filter values" on public.content_filter_values;
create policy "members read live filter values" on public.content_filter_values
  for select to authenticated using (
    (video_id is not null and public.video_is_live(video_id))
    or (collection_id is not null and public.collection_is_live(collection_id)));
drop policy if exists "admins read all filter values" on public.content_filter_values;
create policy "admins read all filter values" on public.content_filter_values
  for select to authenticated using (public.is_admin());
drop policy if exists "admins write filter values" on public.content_filter_values;
create policy "admins write filter values" on public.content_filter_values
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.collections, public.collection_items,
  public.collection_categories, public.video_category_links, public.instructors,
  public.resources, public.resource_links, public.filters, public.filter_options,
  public.content_filter_values to authenticated;
grant insert, update, delete on public.collections, public.collection_items,
  public.collection_categories, public.video_category_links, public.instructors,
  public.resources, public.resource_links, public.filters, public.filter_options,
  public.content_filter_values to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS
-- Publishing is a state machine, not a column assignment — same as videos.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.collection_slug_available(p_slug text, p_exclude uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from collections
    where lower(slug) = lower(p_slug)
      and (p_exclude is null or id <> p_exclude));
$$;

create or replace function public.set_collection_keywords(p_id uuid, p_keywords text[])
returns public.collections language plpgsql security definer set search_path = public as $$
declare row public.collections;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  update collections
     set search_keywords = normalize_keywords(p_keywords), updated_by = auth.uid()
   where id = p_id returning * into row;
  if not found then raise exception 'no such collection'; end if;
  return row;
end $$;

-- The hard requirements: title, slug, a category, at least one video.
-- Thumbnail / descriptions / SEO are recommendations the UI surfaces as a
-- checklist — they never block, and the distinction lives HERE so it cannot
-- drift: what this function refuses is exactly what the UI calls required.
create or replace function public.publish_collection(p_id uuid)
returns public.collections language plpgsql security definer set search_path = public as $$
declare row public.collections;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  select * into row from collections where id = p_id;
  if not found then raise exception 'no such collection'; end if;
  if row.status = 'published' then return row; end if;   -- double-click is a no-op

  if length(btrim(coalesce(row.title,''))) = 0 then
    raise exception 'a collection needs a title'; end if;
  if row.slug is null then
    raise exception 'a collection needs a URL slug'; end if;
  if not exists (select 1 from collection_categories where collection_id = p_id) then
    raise exception 'choose at least one category before publishing'; end if;
  if not exists (select 1 from collection_items
                 where collection_id = p_id and kind = 'video') then
    raise exception 'add at least one video before publishing'; end if;

  update collections
     set status = 'published',
         -- a republish keeps its original date rather than jumping to the
         -- top of Recently Added as though it were new
         published_at = coalesce(published_at, now()),
         archived_at = null,
         updated_by = auth.uid()
   where id = p_id returning * into row;
  return row;
end $$;

create or replace function public.schedule_collection(p_id uuid, p_at timestamptz)
returns public.collections language plpgsql security definer set search_path = public as $$
declare row public.collections;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if p_at is null then raise exception 'choose a date and time'; end if;
  if p_at <= now() then
    raise exception 'that time has already passed — publish it now instead'; end if;
  select * into row from collections where id = p_id;
  if not found then raise exception 'no such collection'; end if;
  if not exists (select 1 from collection_categories where collection_id = p_id) then
    raise exception 'choose at least one category first'; end if;
  if not exists (select 1 from collection_items
                 where collection_id = p_id and kind = 'video') then
    raise exception 'add at least one video first'; end if;

  update collections
     set status = 'scheduled', published_at = p_at, archived_at = null,
         updated_by = auth.uid()
   where id = p_id returning * into row;
  return row;
end $$;

create or replace function public.unpublish_collection(p_id uuid)
returns public.collections language plpgsql security definer set search_path = public as $$
declare row public.collections;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  update collections
     set status = 'draft', published_at = null, updated_by = auth.uid()
   where id = p_id and status in ('published','scheduled') returning * into row;
  if not found then raise exception 'that collection is not published or scheduled'; end if;
  return row;
end $$;

create or replace function public.archive_collection(p_id uuid)
returns public.collections language plpgsql security definer set search_path = public as $$
declare row public.collections;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  update collections
     set status = 'archived', archived_at = now(), updated_by = auth.uid()
   where id = p_id returning * into row;
  if not found then raise exception 'no such collection'; end if;
  return row;
end $$;

-- Reordering in ONE statement — a half-applied order is not a state the UI
-- can land in. The array is authoritative: item n gets position n. Items not
-- named keep their positions (there should be none; the UI always sends all).
create or replace function public.reorder_collection_items(p_collection uuid, p_item_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  update collection_items i
     set position = x.ord
    from (select unnest(p_item_ids) as id, generate_subscripts(p_item_ids, 1) as ord) x
   where i.id = x.id and i.collection_id = p_collection;
end $$;

-- Duplicate: a NEW collection row carrying the metadata, categories, filter
-- values, playlist (order and dividers included) and resource LINKS.
-- Videos, Mux assets and resource files are never copied — links are.
-- The copy lands in Draft with no published date, whatever the original was.
create or replace function public.duplicate_collection(p_id uuid)
returns public.collections language plpgsql security definer set search_path = public as $$
declare
  src public.collections;
  row public.collections;
  new_slug text;
  n int := 1;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  select * into src from collections where id = p_id;
  if not found then raise exception 'no such collection'; end if;

  new_slug := src.slug || '-copy';
  while exists (select 1 from collections where lower(slug) = lower(new_slug)) loop
    n := n + 1;
    new_slug := src.slug || '-copy-' || n;
  end loop;

  insert into collections
    (title, slug, short_description, description, status, visibility,
     thumbnail_mode, custom_thumbnail_url, thumbnail_vertical_url,
     thumbnail_square_url, instructor_id,
     seo_title, seo_description, search_keywords, admin_notes,
     created_by, updated_by)
  values
    (left(src.title || ' — Copy', 160), new_slug, src.short_description,
     src.description, 'draft', src.visibility,
     src.thumbnail_mode, src.custom_thumbnail_url, src.thumbnail_vertical_url,
     src.thumbnail_square_url, src.instructor_id,
     src.seo_title, src.seo_description, src.search_keywords, src.admin_notes,
     auth.uid(), auth.uid())
  returning * into row;

  insert into collection_items (collection_id, kind, video_id, label, position)
  select row.id, kind, video_id, label, position
  from collection_items where collection_id = p_id;

  insert into collection_categories (collection_id, category_id)
  select row.id, category_id from collection_categories where collection_id = p_id;

  insert into content_filter_values (option_id, collection_id)
  select option_id, row.id from content_filter_values where collection_id = p_id;

  insert into resource_links (resource_id, collection_id, sort_order)
  select resource_id, row.id, sort_order from resource_links where collection_id = p_id;

  return row;
end $$;

revoke all on function public.collection_slug_available(text, uuid)      from public, anon;
revoke all on function public.set_collection_keywords(uuid, text[])      from public, anon;
revoke all on function public.publish_collection(uuid)                   from public, anon;
revoke all on function public.schedule_collection(uuid, timestamptz)     from public, anon;
revoke all on function public.unpublish_collection(uuid)                 from public, anon;
revoke all on function public.archive_collection(uuid)                   from public, anon;
revoke all on function public.reorder_collection_items(uuid, uuid[])     from public, anon;
revoke all on function public.duplicate_collection(uuid)                 from public, anon;

grant execute on function public.collection_slug_available(text, uuid)   to authenticated;
grant execute on function public.set_collection_keywords(uuid, text[])   to authenticated;
grant execute on function public.publish_collection(uuid)                to authenticated;
grant execute on function public.schedule_collection(uuid, timestamptz)  to authenticated;
grant execute on function public.unpublish_collection(uuid)              to authenticated;
grant execute on function public.archive_collection(uuid)                to authenticated;
grant execute on function public.reorder_collection_items(uuid, uuid[])  to authenticated;
grant execute on function public.duplicate_collection(uuid)              to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY — run these, do not assume
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. every new table has RLS on and policies
-- select tablename, count(*) from pg_policies
--  where tablename in ('collections','collection_items','collection_categories',
--    'video_category_links','instructors','resources','resource_links',
--    'filters','filter_options','content_filter_values')
--  group by tablename order by tablename;
--    expect: 3 rows of policies per table (2 for instructors/filters reads +1 write)

-- 2. the resource migration copied everything
-- select (select count(*) from video_resources) as old,
--        (select count(*) from resources)       as new_files,
--        (select count(*) from resource_links)  as new_links;
--    expect: new_files >= old and new_links >= old

-- 3. primary categories are mirrored
-- select count(*) from videos v
--  where v.category_id is not null
--    and not exists (select 1 from video_category_links l
--                    where l.video_id = v.id and l.category_id = v.category_id);
--    expect: 0

-- 4. the stats view respects RLS (as a NON-admin, a draft collection's id
--    must not appear):
-- select * from collection_stats;

-- 5. publishing refuses an empty collection:
--      insert into collections (title, slug) values ('Test','test-collection');
--      select publish_collection((select id from collections where slug='test-collection'));
--    expect: ERROR  choose at least one category before publishing
--      delete from collections where slug = 'test-collection';

-- 6. duplicate copies links, not files
--      select duplicate_collection('<some collection id>');
--    then compare collection_items/resource_links counts for both ids.

-- ═══════════════════════════════════════════════════════════════════════════
-- TO UNDO
--   drop function if exists public.duplicate_collection(uuid);
--   drop function if exists public.reorder_collection_items(uuid, uuid[]);
--   drop function if exists public.archive_collection(uuid);
--   drop function if exists public.unpublish_collection(uuid);
--   drop function if exists public.schedule_collection(uuid, timestamptz);
--   drop function if exists public.publish_collection(uuid);
--   drop function if exists public.set_collection_keywords(uuid, text[]);
--   drop function if exists public.collection_slug_available(text, uuid);
--   drop function if exists public.video_is_live(uuid);
--   drop function if exists public.collection_is_live(uuid);
--   drop view if exists public.collection_stats;
--   drop table if exists public.content_filter_values;
--   drop table if exists public.filter_options;
--   drop table if exists public.filters;
--   drop table if exists public.resource_links;
--   drop table if exists public.resources;
--   drop trigger if exists videos_sync_primary_category on public.videos;
--   drop function if exists public.sync_video_primary_category();
--   drop table if exists public.video_category_links;
--   drop table if exists public.collection_categories;
--   drop table if exists public.collection_items;
--   drop table if exists public.collections;
--   drop function if exists public.touch_parent_collection();
--   alter table public.videos drop column if exists instructor_id;
--   alter table public.videos drop column if exists admin_notes;
--   alter table public.videos drop column if exists captions;
--   drop table if exists public.instructors;
-- ═══════════════════════════════════════════════════════════════════════════
