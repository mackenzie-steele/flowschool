-- ⚠ SUPERSEDED IN PART — the energy ceiling in this file is 10, and it is 8
--   as of Aug 2026. supabase/energy-max-eight.sql narrows music_staging.energy and approve_song().
--   Re-running THIS file would put the ceiling back to 10; run that one after.
-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — MUSIC LIBRARY STAGING  (v1)
-- Run once in the Supabase dashboard → SQL editor.
--
-- WHY THIS TABLE EXISTS
-- The catalogue lives in data/songs.js, a static file in the repo. A browser
-- cannot write to it, so an admin approving a song in the Music tab has
-- nowhere to put it. This table is that place: approved rows are read by the
-- Playlist Builder alongside songs.js and merged at load, so a song is usable
-- the moment it is approved rather than the next time somebody deploys.
--
-- IT IS A STAGING BUFFER, NOT A SECOND CATALOGUE
-- scripts/publish-approved.js folds approved rows into data/songs.js and
-- marks them `published`. songs.js stays the source of truth and the table
-- stays small. If the two ever disagree, the file wins — the merge in the
-- Builder skips any staged song whose id already exists in SONGS.
--
-- THE ONE FIELD A MACHINE CANNOT FILL
-- Apple hands us title, artist, duration, artwork, preview and genre. energy,
-- vocal, electronic and bright stay NULL until a human sets them, and the
-- approve step REFUSES to run while energy is null. A plausible guessed
-- number is how the existing catalogue got its wrong numbers.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.music_staging (
  -- the id this song will carry in songs.js once published. Assigned at
  -- insert from max(existing)+1 and never reused, because saved playlists
  -- store song ids and a reused id silently repoints someone's playlist.
  song_id      integer primary key,

  apple_id     bigint not null unique,   -- Apple Music catalog id
  title        text   not null,
  artist       text   not null,
  dur          integer not null,         -- seconds
  genre        text,
  art          text,                     -- artwork URL, {px} placeholder
  preview      text,                     -- 30-second preview URL
  isrc         text,

  -- the human judgement. NULL until reviewed; approval is blocked while
  -- energy is null (see approve_song below).
  energy       smallint check (energy between 0 and 10),
  vocal        boolean,
  electronic   boolean,
  bright       boolean,

  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected', 'published')),

  added_at     timestamptz not null default now(),
  reviewed_by  uuid references auth.users(id),
  reviewed_at  timestamptz,
  note         text                      -- why it was rejected, usually
);

create index if not exists music_staging_status_idx on public.music_staging (status);
create index if not exists music_staging_added_idx  on public.music_staging (added_at desc);

alter table public.music_staging enable row level security;

-- ── who may see and touch it ───────────────────────────────────────────────
-- Everyone signed in reads APPROVED rows — that is what the Playlist Builder
-- merges. Pending and rejected rows are admin-only: a half-judged song with a
-- null energy has no business reaching a teacher's playlist.
drop policy if exists "authed read approved songs" on public.music_staging;
create policy "authed read approved songs"
  on public.music_staging for select
  to authenticated
  using (status in ('approved', 'published'));

drop policy if exists "admins read everything" on public.music_staging;
create policy "admins read everything"
  on public.music_staging for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admins write" on public.music_staging;
create policy "admins write"
  on public.music_staging for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.music_staging to authenticated;
grant insert, update, delete on public.music_staging to authenticated;  -- RLS still gates it


-- ═══════════════════════════════════════════════════════════════════════════
-- STAGE A SONG — called once per track pulled from the Apple playlist
-- ═══════════════════════════════════════════════════════════════════════════
-- Idempotent on apple_id, so re-reading the playlist after adding two songs
-- queues those two and disturbs nothing else. `p_known_max` is the highest id
-- currently in songs.js, passed by the client so ids continue the file's
-- sequence rather than restarting.
create or replace function public.stage_song(
  p_apple_id bigint, p_title text, p_artist text, p_dur integer,
  p_genre text default null, p_art text default null,
  p_preview text default null, p_isrc text default null,
  p_known_max integer default 0
) returns public.music_staging
language plpgsql security definer set search_path = public as $$
declare
  row public.music_staging;
  next_id integer;
begin
  if not is_admin() then raise exception 'admins only'; end if;

  select * into row from music_staging where apple_id = p_apple_id;
  if found then return row; end if;      -- already queued or already judged

  select greatest(coalesce(max(song_id), 0), p_known_max) + 1
    into next_id from music_staging;

  insert into music_staging (song_id, apple_id, title, artist, dur, genre, art, preview, isrc)
  values (next_id, p_apple_id, p_title, p_artist, p_dur, p_genre, p_art, p_preview, p_isrc)
  returning * into row;
  return row;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- APPROVE — refuses to run on a half-judged song
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.approve_song(
  p_song_id integer, p_energy smallint,
  p_vocal boolean, p_electronic boolean, p_bright boolean
) returns public.music_staging
language plpgsql security definer set search_path = public as $$
declare row public.music_staging;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if p_energy is null then raise exception 'energy is required'; end if;
  if p_energy < 0 or p_energy > 10 then raise exception 'energy must be 0-10'; end if;
  if p_vocal is null or p_electronic is null or p_bright is null then
    raise exception 'vocal, electronic and bright are all required';
  end if;

  update music_staging set
    energy = p_energy, vocal = p_vocal, electronic = p_electronic, bright = p_bright,
    status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), note = null
  where song_id = p_song_id
  returning * into row;

  if not found then raise exception 'no such song'; end if;
  return row;
end $$;

create or replace function public.reject_song(p_song_id integer, p_note text default null)
returns public.music_staging
language plpgsql security definer set search_path = public as $$
declare row public.music_staging;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  update music_staging set status = 'rejected', reviewed_by = auth.uid(),
         reviewed_at = now(), note = p_note
  where song_id = p_song_id returning * into row;
  if not found then raise exception 'no such song'; end if;
  return row;
end $$;

revoke all on function public.stage_song   from public, anon;
revoke all on function public.approve_song from public, anon;
revoke all on function public.reject_song  from public, anon;
grant execute on function public.stage_song   to authenticated;
grant execute on function public.approve_song to authenticated;
grant execute on function public.reject_song  to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- MANUAL LINKS — songs the resolver could not match
-- ═══════════════════════════════════════════════════════════════════════════
-- 66 of the catalogue have no artwork and no preview: the resolver refused to
-- guess when the title, artist or duration disagreed, which was the right call
-- (a wrong match puts the wrong 30 seconds against a song and nobody notices
-- until it plays). But refusing leaves a gap only a person can close, so the
-- Music tab lets an admin search Apple and pick the right recording by ear.
--
-- Keyed by song_id, so this supplements data/apple-media.js rather than
-- replacing it. scripts/resolve-apple.js folds these in on its next run.

create table if not exists public.music_links (
  song_id    integer primary key,        -- the id in data/songs.js
  apple_id   bigint not null,
  art        text,
  preview    text,
  genre      text,
  isrc       text,
  linked_by  uuid references auth.users(id),
  linked_at  timestamptz not null default now()
);

alter table public.music_links enable row level security;

drop policy if exists "authed read links" on public.music_links;
create policy "authed read links"
  on public.music_links for select to authenticated using (true);

drop policy if exists "admins manage links" on public.music_links;
create policy "admins manage links"
  on public.music_links for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.music_links to authenticated;
grant insert, update, delete on public.music_links to authenticated;

create or replace function public.link_song(
  p_song_id integer, p_apple_id bigint,
  p_art text default null, p_preview text default null,
  p_genre text default null, p_isrc text default null
) returns public.music_links
language plpgsql security definer set search_path = public as $$
declare row public.music_links;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  insert into music_links (song_id, apple_id, art, preview, genre, isrc, linked_by)
  values (p_song_id, p_apple_id, p_art, p_preview, p_genre, p_isrc, auth.uid())
  on conflict (song_id) do update set
    apple_id = excluded.apple_id, art = excluded.art, preview = excluded.preview,
    genre = excluded.genre, isrc = excluded.isrc,
    linked_by = auth.uid(), linked_at = now()
  returning * into row;
  return row;
end $$;

create or replace function public.unlink_song(p_song_id integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  delete from music_links where song_id = p_song_id;
end $$;

revoke all on function public.link_song   from public, anon;
revoke all on function public.unlink_song from public, anon;
grant execute on function public.link_song   to authenticated;
grant execute on function public.unlink_song to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. the table and its policies exist
select tablename, policyname, cmd from pg_policies
where tablename = 'music_staging' order by policyname;
--    expect: three policies

-- 2. a normal teacher can only see approved rows. Sign in as one and run:
--      select status, count(*) from music_staging group by status;
--    expect: nothing but 'approved' / 'published'

-- 3. the approve gate really refuses a null energy:
--      select approve_song(1, null, true, true, true);
--    expect: ERROR  energy is required

-- ═══════════════════════════════════════════════════════════════════════════
-- TO UNDO
--   drop function if exists public.stage_song(bigint,text,text,integer,text,text,text,text,integer);
--   drop function if exists public.approve_song(integer,smallint,boolean,boolean,boolean);
--   drop function if exists public.reject_song(integer,text);
--   drop function if exists public.link_song(integer,bigint,text,text,text,text);
--   drop function if exists public.unlink_song(integer);
--   drop table if exists public.music_links;
--   drop table if exists public.music_staging;
-- ═══════════════════════════════════════════════════════════════════════════
