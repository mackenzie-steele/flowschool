-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — REMOVING SONGS FROM THE CATALOGUE  (v1)
-- Run once in the Supabase dashboard → SQL editor.
-- Depends on music-library.sql having been run first (it uses is_admin()).
--
-- WHY A TABLE AND NOT A DELETE
-- The catalogue is data/songs.js, a static file in the repo. A browser cannot
-- delete a line from it. So a removal is RECORDED here, the Playlist Builder
-- filters against it immediately, and scripts/publish-approved.js takes the
-- line out of the file on the next publish.
--
-- THE ROW OUTLIVES THE SONG ON PURPOSE
-- title and artist are copied in rather than looked up. Once the song is gone
-- from songs.js there is nothing left to join to, and "you removed song 1421"
-- is not something anyone can check a month later.
--
-- IDS ARE NEVER REUSED
-- Saved playlists store song ids. A reused id silently repoints somebody's
-- saved playlist at a different song, which is worse than a missing track
-- because nothing about it looks wrong. The row staying here is what stops a
-- later insert picking the id back up.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.music_removed (
  song_id     integer primary key,
  title       text,                      -- snapshot; songs.js won't have it later
  artist      text,
  reason      text,
  removed_by  uuid references auth.users(id),
  removed_at  timestamptz not null default now()
);

alter table public.music_removed enable row level security;

-- every signed-in teacher reads it, because the Builder has to filter by it.
-- Knowing a song was removed leaks nothing.
drop policy if exists "authed read removals" on public.music_removed;
create policy "authed read removals"
  on public.music_removed for select to authenticated using (true);

drop policy if exists "admins manage removals" on public.music_removed;
create policy "admins manage removals"
  on public.music_removed for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.music_removed to authenticated;
grant insert, update, delete on public.music_removed to authenticated;


create or replace function public.remove_song(
  p_song_id integer, p_title text default null,
  p_artist text default null, p_reason text default null
) returns public.music_removed
language plpgsql security definer set search_path = public as $$
declare row public.music_removed;
begin
  if not is_admin() then raise exception 'admins only'; end if;

  insert into music_removed (song_id, title, artist, reason, removed_by)
  values (p_song_id, p_title, p_artist, p_reason, auth.uid())
  on conflict (song_id) do update set
    title = coalesce(excluded.title, music_removed.title),
    artist = coalesce(excluded.artist, music_removed.artist),
    reason = excluded.reason, removed_by = auth.uid(), removed_at = now()
  returning * into row;

  -- a song can be staged AND removed if it was pulled in, approved, then
  -- thought better of. Clear the staging row so it cannot come back through
  -- the merge — the removal is the later decision and should win.
  delete from music_staging where song_id = p_song_id;
  delete from music_links   where song_id = p_song_id;

  return row;
end $$;

-- Undo. The id is still reserved, so restoring is safe — nothing else can
-- have taken it in the meantime.
create or replace function public.restore_song(p_song_id integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  delete from music_removed where song_id = p_song_id;
end $$;

revoke all on function public.remove_song  from public, anon;
revoke all on function public.restore_song from public, anon;
grant execute on function public.remove_song  to authenticated;
grant execute on function public.restore_song to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. the policies exist
select policyname, cmd from pg_policies
where tablename = 'music_removed' order by policyname;
--    expect: two

-- 2. a teacher can read it (needed for the Builder's filter). Signed in as a
--    normal user:
--      select count(*) from music_removed;
--    expect: a number, not an error

-- 3. removing also clears any staging or link row for that song:
--      select remove_song(999999, 'Test', 'Test');
--      select count(*) from music_staging where song_id = 999999;   -- 0
--      select restore_song(999999);

-- ═══════════════════════════════════════════════════════════════════════════
-- TO UNDO
--   drop function if exists public.remove_song(integer,text,text,text);
--   drop function if exists public.restore_song(integer);
--   drop table if exists public.music_removed;
-- ═══════════════════════════════════════════════════════════════════════════
