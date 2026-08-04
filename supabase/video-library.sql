-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — NATIVE VIDEO LIBRARY  (v1)
-- Run once in the Supabase dashboard → SQL editor.
-- Depends on admin-analytics.sql (is_admin).
--
-- WHO OWNS WHAT
-- Mux owns ingestion, transcoding, streaming, generated images and playback.
-- This schema owns everything Flow School means by "a video": title, slug,
-- descriptions, category, keywords, SEO, resources, status, ordering,
-- ownership, and the mapping to Mux ids. Mux is never queried to render a
-- list — the admin table and the member library read these tables only.
--
-- WHY UUID AND NOT bigint
-- Every other admin table here uses bigint identity. These use uuid because
-- the id becomes the Mux `passthrough` value: it travels to a third party and
-- comes back in webhook payloads and their logs. A sequential integer there
-- leaks how many videos exist and is guessable; a uuid is neither.
--
-- ACCESS, TODAY
-- There is no membership system yet — signup is open during beta and every
-- authenticated account can reach everything. So "may watch" means "is signed
-- in", and that is what the RLS below says. When Uscreen entitlement arrives,
-- the read policy on `videos` and the canWatch() helper in the API layer are
-- the only two places that change. No membership tier table is invented here,
-- because one invented now would certainly disagree with what Uscreen
-- eventually returns.
--
-- DELETION
-- Nothing hard-deletes by default. Videos and categories archive. Removing a
-- Flow School row NEVER touches the Mux asset — destroying the master file is
-- a separate, separately-confirmed action, because it cannot be undone.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. categories ──────────────────────────────────────────────────────────
create table if not exists public.video_categories (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              text not null,
  short_description text,
  description       text,
  cover_image_url   text,
  seo_title         text,
  seo_description   text,
  status            text not null default 'active'
                      check (status in ('active', 'archived')),
  sort_order        integer not null default 0,
  created_by        uuid references auth.users(id) on delete set null,
  updated_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint category_name_not_blank check (length(btrim(name)) between 1 and 80),
  constraint category_slug_shape     check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- slugs are compared case-insensitively because they arrive from a URL
create unique index if not exists video_categories_slug_idx
  on public.video_categories (lower(slug));
create index if not exists video_categories_order_idx
  on public.video_categories (sort_order, name);


-- ── 2. videos ──────────────────────────────────────────────────────────────
create table if not exists public.videos (
  id                     uuid primary key default gen_random_uuid(),
  title                  text not null,
  slug                   text not null,
  short_description      text,
  description            text,

  -- One column, not two. A separate is_published boolean beside a status
  -- enum is how records end up saying two different things.
  status                 text not null default 'draft'
                           check (status in ('draft','uploading','processing',
                                             'ready','errored','published','archived')),
  -- Reserved for §6 of the plan. Only 'members' is used today; the column
  -- exists so a public marketing page is a value change, not a migration.
  visibility             text not null default 'members'
                           check (visibility in ('members','public','unlisted')),

  category_id            uuid references public.video_categories(id) on delete restrict,

  -- ── Mux's side of the boundary ──
  mux_upload_id          text,
  mux_asset_id           text,
  mux_playback_id        text,
  mux_asset_status       text,
  mux_error              text,          -- the message from video.asset.errored
  duration_seconds       numeric(10,3),
  aspect_ratio           text,
  max_resolution         text,

  -- ── thumbnail ──
  thumbnail_mode         text not null default 'auto'
                           check (thumbnail_mode in ('auto','timestamp','custom')),
  thumbnail_time_seconds numeric(10,3),
  custom_thumbnail_url   text,          -- reserved; no uploader in v1

  -- ── discovery ──
  seo_title              text,
  seo_description        text,
  search_keywords        text[] not null default '{}',

  published_at           timestamptz,
  archived_at            timestamptz,
  sort_order             integer not null default 0,
  created_by             uuid references auth.users(id) on delete set null,
  updated_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint video_title_not_blank check (length(btrim(title)) between 1 and 160),
  constraint video_slug_shape      check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  -- A published video must be watchable. Without this, "published" could mean
  -- a row with no asset, and the member library would render a dead player.
  constraint published_is_watchable check (
    status <> 'published' or (
      mux_asset_id is not null and mux_playback_id is not null
      and category_id is not null and published_at is not null
    )
  ),

  -- A timestamp thumbnail needs a timestamp. The value is NOT checked against
  -- duration here on purpose: duration arrives asynchronously from a webhook,
  -- so a CHECK would reject the legitimate window where an admin picks a
  -- frame before the asset is ready. publish_video() enforces it instead.
  constraint timestamp_thumb_has_a_time check (
    thumbnail_mode <> 'timestamp' or thumbnail_time_seconds is not null
  ),
  constraint custom_thumb_has_a_url check (
    thumbnail_mode <> 'custom' or custom_thumbnail_url is not null
  ),

  -- caps, so one bad paste cannot become a slow query later
  constraint keywords_sane check (
    array_length(search_keywords, 1) is null or array_length(search_keywords, 1) <= 40
  )
);

create unique index if not exists videos_slug_idx on public.videos (lower(slug));
-- Partial uniques: many drafts legitimately have NULL mux ids, and a plain
-- UNIQUE would allow only one of them.
create unique index if not exists videos_asset_idx
  on public.videos (mux_asset_id) where mux_asset_id is not null;
create unique index if not exists videos_upload_idx
  on public.videos (mux_upload_id) where mux_upload_id is not null;

create index if not exists videos_published_idx
  on public.videos (published_at desc) where status = 'published';
create index if not exists videos_admin_idx  on public.videos (created_at desc);
create index if not exists videos_category_idx on public.videos (category_id);
create index if not exists videos_keywords_idx on public.videos using gin (search_keywords);

-- §7 search readiness: one index the member library can lean on later without
-- an external search service. English stemming, title weighted highest.
--
-- THIS HAS TO BE A FUNCTION, NOT AN INLINE EXPRESSION.
-- An index expression must be IMMUTABLE, and array_to_string() is only
-- STABLE — Postgres marks it so because in general it depends on the element
-- type's output function. Inline, it fails with
--   42P17: functions in index expression must be marked IMMUTABLE
-- For text[] the output is genuinely invariant, so wrapping it in a function
-- declared IMMUTABLE is correct rather than a fib. Keeping the whole document
-- in one function also means the index and any future search query cannot
-- drift apart about what "searchable" includes.
create or replace function public.video_search_doc(
  p_title text, p_short text, p_description text, p_keywords text[]
) returns tsvector language sql immutable parallel safe as $$
  select setweight(to_tsvector('english', coalesce(p_title, '')), 'A')
      || setweight(to_tsvector('english', coalesce(p_short, '')), 'B')
      || setweight(to_tsvector('english',
           coalesce(array_to_string(coalesce(p_keywords, '{}'), ' '), '')), 'B')
      || setweight(to_tsvector('english', coalesce(p_description, '')), 'C');
$$;

create index if not exists videos_fts_idx on public.videos using gin (
  public.video_search_doc(title, short_description, description, search_keywords)
);


-- ── 3. resources (PDFs) ────────────────────────────────────────────────────
create table if not exists public.video_resources (
  id           uuid primary key default gen_random_uuid(),
  video_id     uuid not null references public.videos(id) on delete cascade,
  title        text not null,
  description  text,
  -- a bucket-relative PATH, never a URL. URLs expire; paths do not, and
  -- storing a signed URL would bake an expiry into the database.
  storage_path text not null,
  file_name    text,
  file_size    bigint,
  mime_type    text not null default 'application/pdf',
  sort_order   integer not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint resource_title_not_blank check (length(btrim(title)) between 1 and 120),
  constraint resource_is_pdf          check (mime_type = 'application/pdf'),
  constraint resource_size_sane       check (file_size is null or file_size <= 26214400) -- 25MB
);

create index if not exists video_resources_video_idx
  on public.video_resources (video_id, sort_order);
-- ON DELETE CASCADE gives "no orphaned rows". Storage OBJECTS are removed by
-- the API layer — Postgres cannot delete from a bucket, so a cascade alone
-- would leave files behind paying for themselves forever.


-- ── 4. updated_at, without trusting the client ─────────────────────────────
create or replace function public.touch_video_row()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists videos_touch on public.videos;
create trigger videos_touch before update on public.videos
  for each row execute function public.touch_video_row();

drop trigger if exists video_categories_touch on public.video_categories;
create trigger video_categories_touch before update on public.video_categories
  for each row execute function public.touch_video_row();

drop trigger if exists video_resources_touch on public.video_resources;
create trigger video_resources_touch before update on public.video_resources
  for each row execute function public.touch_video_row();


-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- Hiding the admin UI is a courtesy. This is the enforcement.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.video_categories enable row level security;
alter table public.videos           enable row level security;
alter table public.video_resources  enable row level security;

-- ── categories ──
drop policy if exists "authed read active categories" on public.video_categories;
create policy "authed read active categories" on public.video_categories
  for select to authenticated using (status = 'active');

drop policy if exists "admins read all categories" on public.video_categories;
create policy "admins read all categories" on public.video_categories
  for select to authenticated using (public.is_admin());

drop policy if exists "admins write categories" on public.video_categories;
create policy "admins write categories" on public.video_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── videos ──
-- TODAY: signed in is the whole rule. This policy is the seam that becomes a
-- membership check later; nothing else needs to move.
drop policy if exists "members read published videos" on public.videos;
create policy "members read published videos" on public.videos
  for select to authenticated using (status = 'published');

drop policy if exists "admins read all videos" on public.videos;
create policy "admins read all videos" on public.videos
  for select to authenticated using (public.is_admin());

drop policy if exists "admins write videos" on public.videos;
create policy "admins write videos" on public.videos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── resources ──
-- Visible only through a published parent. A draft's worksheet is as private
-- as the draft itself.
drop policy if exists "members read published resources" on public.video_resources;
create policy "members read published resources" on public.video_resources
  for select to authenticated using (
    exists (select 1 from public.videos v
            where v.id = video_id and v.status = 'published')
  );

drop policy if exists "admins read all resources" on public.video_resources;
create policy "admins read all resources" on public.video_resources
  for select to authenticated using (public.is_admin());

drop policy if exists "admins write resources" on public.video_resources;
create policy "admins write resources" on public.video_resources
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.video_categories, public.videos, public.video_resources to authenticated;
grant insert, update, delete on public.video_categories, public.videos, public.video_resources to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- PRIVATE STORAGE FOR PDFs
-- The first private bucket in this project. Paid worksheets must not sit
-- behind permanent unauthenticated URLs.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('video-resources', 'video-resources', false, 26214400, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 26214400,
      allowed_mime_types = array['application/pdf'];

drop policy if exists "admins manage video resources" on storage.objects;
create policy "admins manage video resources" on storage.objects
  for all to authenticated
  using (bucket_id = 'video-resources' and public.is_admin())
  with check (bucket_id = 'video-resources' and public.is_admin());

-- Members never read the bucket directly. The API mints a short-lived signed
-- URL after checking access, which is why there is no member SELECT policy
-- here — a signed URL is generated with the service role and does not consult
-- these policies.


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS
-- Each exists because doing it from the client would be forgeable or wrong.
-- ═══════════════════════════════════════════════════════════════════════════

-- Slugs: lowercase, hyphen-joined, no leading/trailing hyphen, ascii only.
create or replace function public.video_slugify(p_text text)
returns text language sql immutable as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(coalesce(p_text,'')), '[^a-z0-9]+', '-', 'g'),
      '-{2,}', '-', 'g'));
$$;

create or replace function public.video_slug_available(p_slug text, p_exclude uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from videos
    where lower(slug) = lower(p_slug)
      and (p_exclude is null or id <> p_exclude));
$$;

-- Keyword normalisation, in ONE place. Trim, drop blanks, collapse inner
-- whitespace, case-insensitive dedupe keeping the first spelling the admin
-- typed, cap at 40. Doing this client-side only would mean the rules drift.
create or replace function public.normalize_keywords(p_in text[])
returns text[] language sql immutable as $$
  select coalesce(array_agg(kw order by ord), '{}')
  from (
    select distinct on (lower(kw)) kw, ord
    from (
      select btrim(regexp_replace(k, '\s+', ' ', 'g')) as kw,
             row_number() over () as ord
      from unnest(coalesce(p_in, '{}')) as k
    ) cleaned
    where kw <> '' and length(kw) <= 60
    order by lower(kw), ord
  ) uniq
  where ord <= 40;
$$;

create or replace function public.set_video_keywords(p_id uuid, p_keywords text[])
returns public.videos language plpgsql security definer set search_path = public as $$
declare row public.videos;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  update videos set search_keywords = normalize_keywords(p_keywords), updated_by = auth.uid()
   where id = p_id returning * into row;
  if not found then raise exception 'no such video'; end if;
  return row;
end $$;

-- Publishing is a state machine, not a column assignment. In SQL so a
-- double-click is a no-op rather than a second publish that moves the date.
create or replace function public.publish_video(p_id uuid)
returns public.videos language plpgsql security definer set search_path = public as $$
declare row public.videos;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  select * into row from videos where id = p_id;
  if not found then raise exception 'no such video'; end if;
  if row.status = 'published' then return row; end if;   -- already done

  if length(btrim(coalesce(row.title,''))) = 0 then
    raise exception 'a video needs a title'; end if;
  if row.slug is null then
    raise exception 'a video needs a URL slug'; end if;
  if row.category_id is null then
    raise exception 'choose a category before publishing'; end if;
  if row.mux_asset_id is null or row.mux_playback_id is null then
    raise exception 'the video is still processing — publish once it is ready'; end if;
  if row.mux_asset_status is distinct from 'ready' then
    raise exception 'Mux has not finished processing this video yet'; end if;
  -- the check a CHECK constraint could not do, now that duration is known
  if row.thumbnail_mode = 'timestamp' and row.duration_seconds is not null
     and row.thumbnail_time_seconds > row.duration_seconds then
    raise exception 'the thumbnail time is past the end of the video'; end if;

  update videos
     set status = 'published',
         -- a republish from the archive keeps its original date, so it does
         -- not jump to the top of the library as though it were new
         published_at = coalesce(published_at, now()),
         archived_at = null,
         updated_by = auth.uid()
   where id = p_id returning * into row;
  return row;
end $$;

create or replace function public.unpublish_video(p_id uuid)
returns public.videos language plpgsql security definer set search_path = public as $$
declare row public.videos;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  update videos set status = 'ready', updated_by = auth.uid()
   where id = p_id and status = 'published' returning * into row;
  if not found then raise exception 'that video is not published'; end if;
  return row;
end $$;

create or replace function public.archive_video(p_id uuid)
returns public.videos language plpgsql security definer set search_path = public as $$
declare row public.videos;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  update videos set status = 'archived', archived_at = now(), updated_by = auth.uid()
   where id = p_id returning * into row;
  if not found then raise exception 'no such video'; end if;
  return row;
end $$;

-- Reordering categories in one statement, so a half-applied order is not a
-- state the UI can land in.
create or replace function public.reorder_video_categories(p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  update video_categories c
     set sort_order = x.ord, updated_by = auth.uid()
    from (select unnest(p_ids) as id, generate_subscripts(p_ids, 1) as ord) x
   where c.id = x.id;
end $$;

revoke all on function public.set_video_keywords(uuid, text[])        from public, anon;
revoke all on function public.publish_video(uuid)                     from public, anon;
revoke all on function public.unpublish_video(uuid)                   from public, anon;
revoke all on function public.archive_video(uuid)                     from public, anon;
revoke all on function public.reorder_video_categories(uuid[])        from public, anon;
revoke all on function public.video_slug_available(text, uuid)        from public, anon;

grant execute on function public.video_slugify(text)                  to authenticated;
grant execute on function public.video_search_doc(text,text,text,text[]) to authenticated;
grant execute on function public.video_slug_available(text, uuid)     to authenticated;
grant execute on function public.normalize_keywords(text[])           to authenticated;
grant execute on function public.set_video_keywords(uuid, text[])     to authenticated;
grant execute on function public.publish_video(uuid)                  to authenticated;
grant execute on function public.unpublish_video(uuid)                to authenticated;
grant execute on function public.archive_video(uuid)                  to authenticated;
grant execute on function public.reorder_video_categories(uuid[])     to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY — run these, do not assume
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. policies exist
-- select tablename, policyname, cmd from pg_policies
--  where tablename in ('video_categories','videos','video_resources')
--  order by tablename, policyname;
--    expect: 3 on categories, 3 on videos, 3 on resources

-- 2. the bucket is PRIVATE
-- select id, public, file_size_limit, allowed_mime_types
--   from storage.buckets where id = 'video-resources';
--    expect: public = false

-- 3. slugify behaves
-- select public.video_slugify('  Reach Back: Standing Pigeon!! ');
--    expect: reach-back-standing-pigeon

-- 4. keyword normalisation
-- select public.normalize_keywords(array[' arm balances ','Arm Balances','','  ','cueing']);
--    expect: {"arm balances","cueing"}   — trimmed, deduped case-insensitively

-- 5. a draft is invisible to a member. As a NON-admin:
--      select count(*) from videos;
--    expect: only published ones (0 right now). As an admin: all of them.

-- 6. publishing refuses an unready video:
--      insert into videos (title, slug) values ('Test','test-video');
--      select publish_video((select id from videos where slug='test-video'));
--    expect: ERROR  the video is still processing — publish once it is ready
--      delete from videos where slug = 'test-video';

-- 8. the search document builds (this is what the FTS index calls)
-- select public.video_search_doc('Chair Pose', 'A short one', 'Longer text', array['cueing','transitions']);
--    expect: a tsvector with weighted lexemes

-- 7. the guard is real. As a NON-admin:
--      select archive_video(gen_random_uuid());
--    expect: ERROR  admins only

-- ═══════════════════════════════════════════════════════════════════════════
-- TO UNDO
--   drop function if exists public.reorder_video_categories(uuid[]);
--   drop function if exists public.archive_video(uuid);
--   drop function if exists public.unpublish_video(uuid);
--   drop function if exists public.publish_video(uuid);
--   drop function if exists public.set_video_keywords(uuid, text[]);
--   drop function if exists public.normalize_keywords(text[]);
--   drop function if exists public.video_slug_available(text, uuid);
--   drop function if exists public.video_slugify(text);
--   drop table if exists public.video_resources;
--   drop table if exists public.videos;
--   drop table if exists public.video_categories;
--   drop function if exists public.touch_video_row();
--   delete from storage.buckets where id = 'video-resources';
-- ═══════════════════════════════════════════════════════════════════════════
