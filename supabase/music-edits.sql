-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — EDITING SONGS ALREADY IN THE CATALOGUE  (v1)
-- Run once in the Supabase dashboard → SQL editor.
-- Depends on music-library.sql (it uses is_admin()).
--
-- WHY
-- The catalogue is data/songs.js. Correcting an energy in the admin cannot
-- rewrite a file, so the correction is recorded here, the Playlist Builder
-- applies it at load, and publish-approved.js folds it into the file later.
-- Same shape as approvals, links and removals — the admin never waits on a
-- deploy for a change to reach teachers.
--
-- ONLY THE FOUR JUDGED FIELDS
-- energy, vocal, electronic, bright. Not title, artist or duration: those
-- come from Apple and disagreeing with Apple about them is a data-entry
-- error, not an opinion. Energy is the opinion, and the reason this exists —
-- ids 1000+ were scored by a machine from metadata and are meant to be
-- corrected by ear.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.music_edits (
  song_id     integer primary key,       -- the id in data/songs.js
  energy      smallint not null check (energy between 0 and 10),
  vocal       boolean not null,
  electronic  boolean not null,
  bright      boolean not null,
  edited_by   uuid references auth.users(id),
  edited_at   timestamptz not null default now()
);

alter table public.music_edits enable row level security;

-- every signed-in teacher reads it: the Builder has to apply corrections, and
-- knowing a song was re-scored leaks nothing
drop policy if exists "authed read edits" on public.music_edits;
create policy "authed read edits"
  on public.music_edits for select to authenticated using (true);

drop policy if exists "admins manage edits" on public.music_edits;
create policy "admins manage edits"
  on public.music_edits for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.music_edits to authenticated;
grant insert, update, delete on public.music_edits to authenticated;


create or replace function public.edit_song(
  p_song_id integer, p_energy smallint,
  p_vocal boolean, p_electronic boolean, p_bright boolean
) returns public.music_edits
language plpgsql security definer set search_path = public as $$
declare row public.music_edits;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if p_energy is null then raise exception 'energy is required'; end if;
  if p_energy < 0 or p_energy > 10 then raise exception 'energy must be 0-10'; end if;
  if p_vocal is null or p_electronic is null or p_bright is null then
    raise exception 'vocal, electronic and bright are all required';
  end if;

  insert into music_edits (song_id, energy, vocal, electronic, bright, edited_by)
  values (p_song_id, p_energy, p_vocal, p_electronic, p_bright, auth.uid())
  on conflict (song_id) do update set
    energy = excluded.energy, vocal = excluded.vocal,
    electronic = excluded.electronic, bright = excluded.bright,
    edited_by = auth.uid(), edited_at = now()
  returning * into row;

  -- a song still waiting for review should be judged there, not corrected
  -- here — keep the two out of each other's way
  update music_staging set
    energy = p_energy, vocal = p_vocal, electronic = p_electronic, bright = p_bright
  where song_id = p_song_id and status in ('approved', 'published');

  return row;
end $$;

revoke all on function public.edit_song from public, anon;
grant execute on function public.edit_song to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. policies
select policyname, cmd from pg_policies where tablename = 'music_edits';
--    expect: two

-- 2. the guard is real:
--      select edit_song(1, 99::smallint, true, true, true);
--    expect: ERROR  energy must be 0-10

-- 3. a teacher can read it (the Builder needs to). Signed in as a normal user:
--      select count(*) from music_edits;
--    expect: a number, not an error

-- ═══════════════════════════════════════════════════════════════════════════
-- TO UNDO
--   drop function if exists public.edit_song(integer,smallint,boolean,boolean,boolean);
--   drop table if exists public.music_edits;
-- ═══════════════════════════════════════════════════════════════════════════
