-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — CUSTOM VIDEO THUMBNAILS  (v1)
-- Run once in the Supabase dashboard → SQL editor.
-- Additive: video-library.sql is unchanged and does NOT need re-running.
--
-- WHY THIS BUCKET IS PUBLIC WHEN video-resources IS NOT
-- A worksheet is the paid thing. A thumbnail is the poster outside the
-- cinema — it exists to be seen, it appears on every library card, and it
-- gives away nothing the title does not.
--
-- Making it private would mean minting a signed URL for every tile in a grid
-- of a hundred videos, on every page load, and they would expire while
-- somebody was still scrolling. Mux's own generated stills need a token only
-- because the ASSET is signed and they come from the video itself; a file we
-- uploaded has no such constraint.
--
-- Uploads stay admin-only. Public means readable, not writable.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('video-thumbnails', 'video-thumbnails', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- anyone signed in may look; only admins may put anything there
drop policy if exists "admins write video thumbnails" on storage.objects;
create policy "admins write video thumbnails" on storage.objects
  for all to authenticated
  using (bucket_id = 'video-thumbnails' and public.is_admin())
  with check (bucket_id = 'video-thumbnails' and public.is_admin());


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. the bucket exists and is public, capped at 5MB, images only
-- select id, public, file_size_limit, allowed_mime_types
--   from storage.buckets where id = 'video-thumbnails';

-- 2. and the OTHER one is still private — this is the one that matters
-- select id, public from storage.buckets where id = 'video-resources';
--    expect: public = false

-- ═══════════════════════════════════════════════════════════════════════════
-- TO UNDO
--   drop policy if exists "admins write video thumbnails" on storage.objects;
--   delete from storage.buckets where id = 'video-thumbnails';
-- ═══════════════════════════════════════════════════════════════════════════
