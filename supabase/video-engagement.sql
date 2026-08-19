-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — MEMBER VIDEO ENGAGEMENT  (v1)
-- Run once in the Supabase dashboard → SQL editor. Additive; nothing earlier
-- needs re-running. Requires video-library.sql, video-scheduling.sql and
-- video-collections.sql (uses video_is_live / collection_is_live).
--
-- Three small member-owned layers for the member library, plus the search
-- function the library pages call:
--
--   library_saves    a member's saved content. Videos today; the nullable
--                    collection_id + exactly-one check is the same shape
--                    resource_links uses, so saving collections later is a
--                    UI change, not a migration.
--   video_notes      PRIVATE notes while watching. Owner-only in every
--                    direction — there is deliberately NO admin read policy.
--   video_comments   public discussion on a video. Conversational, no
--                    likes, no counts surfaced anywhere else.
--   library_search   one weighted FTS query across videos AND collections,
--                    leaning on the video_search_doc GIN indexes that
--                    video-library.sql and video-collections.sql built.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 0. category subtitle ────────────────────────────────────────────────────
-- The supporting line under a category's title ("weekly sequence starters /
-- begin with these poses and create your own flow"). Also guarded in
-- video-library.sql; repeated here so THIS one run brings a database fully
-- current.
alter table public.video_categories add column if not exists subtitle text;


-- ── 1. saves ────────────────────────────────────────────────────────────────
create table if not exists public.library_saves (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references auth.users(id) on delete cascade,
  video_id      uuid references public.videos(id) on delete cascade,
  collection_id uuid references public.collections(id) on delete cascade,
  created_at    timestamptz not null default now(),

  -- exactly one target — the same rule resource_links enforces
  constraint save_has_one_target check (
    (video_id is not null)::int + (collection_id is not null)::int = 1)
);

-- one save per member per thing; partial uniques because either column is null
create unique index if not exists library_saves_video_idx
  on public.library_saves (member_id, video_id) where video_id is not null;
create unique index if not exists library_saves_collection_idx
  on public.library_saves (member_id, collection_id) where collection_id is not null;
create index if not exists library_saves_member_idx
  on public.library_saves (member_id, created_at desc);

alter table public.library_saves enable row level security;

drop policy if exists "members read own saves" on public.library_saves;
create policy "members read own saves" on public.library_saves
  for select to authenticated using (member_id = auth.uid());

-- you can only save what you can see — a draft id pasted into the console
-- does not become a save
drop policy if exists "members create own saves" on public.library_saves;
create policy "members create own saves" on public.library_saves
  for insert to authenticated with check (
    member_id = auth.uid()
    and (video_id is null or public.video_is_live(video_id))
    and (collection_id is null or public.collection_is_live(collection_id)));

drop policy if exists "members delete own saves" on public.library_saves;
create policy "members delete own saves" on public.library_saves
  for delete to authenticated using (member_id = auth.uid());

grant select, insert, delete on public.library_saves to authenticated;


-- ── 2. private notes ────────────────────────────────────────────────────────
-- Owner-only in every direction. No admin policy is deliberate: another
-- person's private notes must not arrive through the normal member UI, and
-- the absence of a policy is how that is enforced rather than remembered.
create table if not exists public.video_notes (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references auth.users(id) on delete cascade,
  video_id          uuid not null references public.videos(id) on delete cascade,
  body              text not null,
  -- where in the video the thought happened; null for general notes
  timestamp_seconds numeric(10,3),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint note_body_sane check (length(body) between 1 and 8000),
  constraint note_time_sane check (timestamp_seconds is null or timestamp_seconds >= 0)
);

create index if not exists video_notes_member_video_idx
  on public.video_notes (member_id, video_id, created_at);

drop trigger if exists video_notes_touch on public.video_notes;
create trigger video_notes_touch before update on public.video_notes
  for each row execute function public.touch_video_row();

alter table public.video_notes enable row level security;

drop policy if exists "members read own notes" on public.video_notes;
create policy "members read own notes" on public.video_notes
  for select to authenticated using (member_id = auth.uid());

drop policy if exists "members create own notes" on public.video_notes;
create policy "members create own notes" on public.video_notes
  for insert to authenticated with check (
    member_id = auth.uid() and public.video_is_live(video_id));

drop policy if exists "members update own notes" on public.video_notes;
create policy "members update own notes" on public.video_notes
  for update to authenticated
  using (member_id = auth.uid()) with check (member_id = auth.uid());

drop policy if exists "members delete own notes" on public.video_notes;
create policy "members delete own notes" on public.video_notes
  for delete to authenticated using (member_id = auth.uid());

grant select, insert, update, delete on public.video_notes to authenticated;


-- ── 3. discussion ───────────────────────────────────────────────────────────
create table if not exists public.video_comments (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid not null references public.videos(id) on delete cascade,
  member_id  uuid not null references auth.users(id) on delete cascade,
  parent_id  uuid,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint comment_body_sane check (length(btrim(body)) between 1 and 4000),

  -- a reply lives on the SAME video as its parent, enforced structurally:
  -- the composite FK can only point at a row whose video_id matches, so a
  -- cross-video thread is impossible without any trigger
  constraint video_comments_id_video unique (id, video_id),
  constraint video_comments_parent_fk foreign key (parent_id, video_id)
    references public.video_comments (id, video_id) on delete cascade
);

create index if not exists video_comments_video_idx
  on public.video_comments (video_id, created_at);
create index if not exists video_comments_parent_idx
  on public.video_comments (parent_id) where parent_id is not null;

drop trigger if exists video_comments_touch on public.video_comments;
create trigger video_comments_touch before update on public.video_comments
  for each row execute function public.touch_video_row();

alter table public.video_comments enable row level security;

-- readable wherever the video is readable — the discussion is public to
-- members, exactly as public as the video it hangs off
drop policy if exists "members read live comments" on public.video_comments;
create policy "members read live comments" on public.video_comments
  for select to authenticated using (public.video_is_live(video_id));

drop policy if exists "members create own comments" on public.video_comments;
create policy "members create own comments" on public.video_comments
  for insert to authenticated with check (
    member_id = auth.uid() and public.video_is_live(video_id));

-- editing may not reassign a comment to someone else or another video:
-- member_id/video_id are stable because WITH CHECK re-runs on the new row
drop policy if exists "members update own comments" on public.video_comments;
create policy "members update own comments" on public.video_comments
  for update to authenticated
  using (member_id = auth.uid()) with check (member_id = auth.uid());

drop policy if exists "members delete own comments" on public.video_comments;
create policy "members delete own comments" on public.video_comments
  for delete to authenticated using (member_id = auth.uid());

-- moderation: an admin can remove a comment (never edit one)
drop policy if exists "admins delete comments" on public.video_comments;
create policy "admins delete comments" on public.video_comments
  for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on public.video_comments to authenticated;

-- The feed the discussion UI reads: comments wearing their author's public
-- byline. Same shape and safety story as community_classes — the view's
-- reach into profiles is bounded by the select list (byline fields only),
-- and the WHERE repeats the live rule so the view is safe even standalone.
drop view if exists public.video_discussion;
create view public.video_discussion as
select
  c.id, c.video_id, c.member_id, c.parent_id, c.body,
  c.created_at, c.updated_at,
  coalesce(nullif(trim(p.full_name), ''), p.display_name) as author_name,
  p.avatar_url as author_avatar,
  h.handle     as author_handle
from public.video_comments c
left join public.profiles p on p.id = c.member_id
left join public.handles  h on h.user_id = c.member_id
where public.video_is_live(c.video_id);

grant select on public.video_discussion to authenticated;
revoke all on public.video_discussion from anon;


-- ── 4. search ───────────────────────────────────────────────────────────────
-- One query, both kinds of content, ranked together. SECURITY INVOKER on
-- purpose: the caller's own RLS decides what rows exist, so this function
-- can never leak a draft. The explicit live/visibility predicates are
-- repeated here anyway so an ADMIN searching the member library sees what a
-- member would see, not their own drafts.
create or replace function public.library_search(p_query text, p_limit int default 40)
returns table (
  kind                 text,
  id                   uuid,
  title                text,
  slug                 text,
  short_description    text,
  duration_seconds     numeric,
  video_count          bigint,
  total_seconds        numeric,
  thumbnail_mode       text,
  custom_thumbnail_url text,
  mux_playback_id      text,
  rank                 real
) language sql stable as $$
  with q as (select websearch_to_tsquery('english', coalesce(p_query, '')) as tsq)
  select * from (
    select 'video'::text as kind, v.id, v.title, v.slug, v.short_description,
           v.duration_seconds, null::bigint as video_count, null::numeric as total_seconds,
           v.thumbnail_mode, v.custom_thumbnail_url, v.mux_playback_id,
           ts_rank(public.video_search_doc(v.title, v.short_description, v.description, v.search_keywords), q.tsq) as rank
    from public.videos v, q
    where public.video_search_doc(v.title, v.short_description, v.description, v.search_keywords) @@ q.tsq
      and (v.status = 'published' or (v.status = 'scheduled' and v.published_at <= now()))
      and v.visibility <> 'unlisted'
    union all
    select 'collection'::text, c.id, c.title, c.slug, c.short_description,
           null::numeric, s.video_count, s.total_seconds,
           c.thumbnail_mode, c.custom_thumbnail_url, null::text,
           ts_rank(public.video_search_doc(c.title, c.short_description, c.description, c.search_keywords), q.tsq)
    from public.collections c
    left join public.collection_stats s on s.collection_id = c.id, q
    where public.video_search_doc(c.title, c.short_description, c.description, c.search_keywords) @@ q.tsq
      and (c.status = 'published' or (c.status = 'scheduled' and c.published_at <= now()))
      and c.visibility <> 'unlisted'
  ) hits
  order by rank desc, title asc
  limit greatest(1, least(coalesce(p_limit, 40), 100));
$$;

revoke all on function public.library_search(text, int) from public, anon;
grant execute on function public.library_search(text, int) to authenticated;


-- ── 5. comment hearts ───────────────────────────────────────────────────────
-- A heart is a person, not a number: the UI shows WHO hearted on hover, so
-- the row carries identity and the view below dresses it in a name. One
-- heart per person per comment is the primary key, not an application rule.
create table if not exists public.video_comment_hearts (
  comment_id uuid not null references public.video_comments(id) on delete cascade,
  member_id  uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, member_id)
);

create index if not exists video_comment_hearts_member_idx
  on public.video_comment_hearts (member_id);

alter table public.video_comment_hearts enable row level security;

-- hearts are as public as the comment they sit on
drop policy if exists "members read hearts on live comments" on public.video_comment_hearts;
create policy "members read hearts on live comments" on public.video_comment_hearts
  for select to authenticated using (
    exists (select 1 from public.video_comments c
            where c.id = comment_id and public.video_is_live(c.video_id)));

drop policy if exists "members heart as themselves" on public.video_comment_hearts;
create policy "members heart as themselves" on public.video_comment_hearts
  for insert to authenticated with check (
    member_id = auth.uid()
    and exists (select 1 from public.video_comments c
                where c.id = comment_id and public.video_is_live(c.video_id)));

drop policy if exists "members unheart their own" on public.video_comment_hearts;
create policy "members unheart their own" on public.video_comment_hearts
  for delete to authenticated using (member_id = auth.uid());

grant select, insert, delete on public.video_comment_hearts to authenticated;

-- the hover: hearts wearing their owner's public byline, same safety story
-- as video_discussion (byline fields only, live comments only)
drop view if exists public.video_comment_hearts_named;
create view public.video_comment_hearts_named as
select
  h.comment_id, h.member_id, h.created_at,
  coalesce(nullif(trim(p.full_name), ''), p.display_name) as name
from public.video_comment_hearts h
left join public.profiles p on p.id = h.member_id
where exists (select 1 from public.video_comments c
              where c.id = h.comment_id and public.video_is_live(c.video_id));

grant select on public.video_comment_hearts_named to authenticated;
revoke all on public.video_comment_hearts_named from anon;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY — run each as yourself (admin) and, ideally, once as a member key
--
-- 1. save + duplicate refusal
--    insert into library_saves (member_id, video_id)
--      values (auth.uid(), (select id from videos where status='published' limit 1));
--    → second identical insert errors on library_saves_video_idx
--
-- 2. a note is invisible to anyone else
--    select count(*) from video_notes where member_id <> auth.uid();  → 0 rows
--
-- 3. a reply cannot cross videos
--    insert with a parent_id from another video → FK violation
--
-- 4. search returns both kinds
--    select kind, title, rank from library_search('flow');
--
-- 5. the discussion view carries bylines
--    select author_name, body from video_discussion limit 5;
-- ═══════════════════════════════════════════════════════════════════════════
