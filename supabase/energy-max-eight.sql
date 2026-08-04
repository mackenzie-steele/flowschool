-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — THE ENERGY SCALE TOPS OUT AT 8  (v1)
-- Run once in the Supabase dashboard → SQL editor.
-- Depends on music-library.sql and music-edits.sql.
--
-- WHY
-- Nothing in the catalogue has ever reached 9. Two gridlines on the Playlist
-- Builder's curve were therefore places a teacher could drag to and receive a
-- silent fallback instead of what she asked for — the same failure the peak
-- famine produces, in miniature and permanently.
--
-- The scale is still ABSOLUTE: a 5 means what it always meant, and every song
-- keeps its value. Only the ceiling moves. If genuinely bigger music is ever
-- added, this goes back up and nothing has to be re-judged.
--
-- WHAT MOVES
-- Two approved rows in music_staging sit at 10. On a scale that stops at 8,
-- "the biggest" is 8 — so they are clamped rather than re-judged, which
-- preserves the intent exactly. Nothing else in the database is above 8.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. bring the outliers in BEFORE tightening the constraint ──────────────
-- (the other way round and the ALTER fails on its own data)
update public.music_staging set energy = 8 where energy > 8;
update public.music_edits   set energy = 8 where energy > 8;

-- ── 2. the constraints ─────────────────────────────────────────────────────
alter table public.music_staging drop constraint if exists music_staging_energy_check;
alter table public.music_staging
  add constraint music_staging_energy_check check (energy between 0 and 8);

alter table public.music_edits drop constraint if exists music_edits_energy_check;
alter table public.music_edits
  add constraint music_edits_energy_check check (energy between 0 and 8);

-- ── 3. the guards, so a bad value is refused with a sentence rather than a
--       constraint violation ─────────────────────────────────────────────────
create or replace function public.approve_song(
  p_song_id integer, p_energy smallint,
  p_vocal boolean, p_electronic boolean, p_bright boolean
) returns public.music_staging
language plpgsql security definer set search_path = public as $$
declare row public.music_staging;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if p_energy is null then raise exception 'energy is required'; end if;
  if p_energy < 0 or p_energy > 8 then raise exception 'energy must be 0-8'; end if;
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

create or replace function public.edit_song(
  p_song_id integer, p_energy smallint,
  p_vocal boolean, p_electronic boolean, p_bright boolean
) returns public.music_edits
language plpgsql security definer set search_path = public as $$
declare row public.music_edits;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if p_energy is null then raise exception 'energy is required'; end if;
  if p_energy < 0 or p_energy > 8 then raise exception 'energy must be 0-8'; end if;
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

  update music_staging set
    energy = p_energy, vocal = p_vocal, electronic = p_electronic, bright = p_bright
  where song_id = p_song_id and status in ('approved', 'published');

  return row;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. nothing above 8 survives anywhere
select 'staging' as t, count(*) from music_staging where energy > 8
union all
select 'edits',        count(*) from music_edits   where energy > 8;
--    expect: 0 and 0

-- 2. the two that moved
select song_id, title, energy from music_staging where energy = 8 order by song_id;

-- 3. the guard says so in words
--      select edit_song(1, 9::smallint, true, true, true);
--    expect: ERROR  energy must be 0-8

-- ═══════════════════════════════════════════════════════════════════════════
-- TO UNDO
--   alter table public.music_staging drop constraint music_staging_energy_check;
--   alter table public.music_staging add constraint music_staging_energy_check
--     check (energy between 0 and 10);
--   alter table public.music_edits drop constraint music_edits_energy_check;
--   alter table public.music_edits add constraint music_edits_energy_check
--     check (energy between 0 and 10);
--   -- then re-run the 0-10 guards from music-library.sql and music-edits.sql.
--   -- The two clamped songs keep 8; their original 10 is not recoverable.
-- ═══════════════════════════════════════════════════════════════════════════
