-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — SCHEDULED PUBLISHING  (v1)
-- Run once in the Supabase dashboard → SQL editor.
-- Additive: video-library.sql is unchanged and does NOT need re-running.
--
-- NO CRON, NO JOB, NOTHING TO GO WRONG AT 6AM
-- A scheduled video is simply one whose published_at is in the future. It
-- becomes visible because the read policy compares that timestamp to now(),
-- not because something woke up and flipped a flag. There is no window where
-- the job has not run yet, no double-publish if it runs twice, and nothing to
-- monitor.
--
-- This is only cheap because status and published_at were kept as separate
-- columns from the start. A single is_published boolean would have made this
-- a migration and a scheduler.
--
-- The admin still sees a distinct 'scheduled' status, because "published, but
-- not yet" is a confusing thing to read in a list.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. the new status ──────────────────────────────────────────────────────
alter table public.videos drop constraint if exists videos_status_check;
alter table public.videos
  add constraint videos_status_check check (status in
    ('draft','uploading','processing','ready','errored','published','scheduled','archived'));

-- a scheduled video needs a time to go live at, and the same things a
-- published one needs — it IS published, just not yet
alter table public.videos drop constraint if exists published_is_watchable;
alter table public.videos
  add constraint published_is_watchable check (
    status not in ('published','scheduled') or (
      mux_asset_id is not null and mux_playback_id is not null
      and category_id is not null and published_at is not null
    )
  );

-- ── 2. members see it when its time comes ──────────────────────────────────
drop policy if exists "members read published videos" on public.videos;
create policy "members read published videos" on public.videos
  for select to authenticated
  using (
    status = 'published'
    or (status = 'scheduled' and published_at <= now())
  );

-- the same for anything hanging off a video
drop policy if exists "members read published resources" on public.video_resources;
create policy "members read published resources" on public.video_resources
  for select to authenticated using (
    exists (select 1 from public.videos v
            where v.id = video_id
              and (v.status = 'published'
                   or (v.status = 'scheduled' and v.published_at <= now())))
  );

create index if not exists videos_scheduled_idx
  on public.videos (published_at) where status = 'scheduled';

-- ── 3. scheduling ──────────────────────────────────────────────────────────
create or replace function public.schedule_video(p_id uuid, p_at timestamptz)
returns public.videos language plpgsql security definer set search_path = public as $$
declare row public.videos;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if p_at is null then raise exception 'choose a date and time'; end if;
  if p_at <= now() then
    raise exception 'that time has already passed — publish it now instead';
  end if;

  select * into row from videos where id = p_id;
  if not found then raise exception 'no such video'; end if;
  if row.category_id is null then raise exception 'choose a category first'; end if;
  if row.mux_playback_id is null or row.mux_asset_status is distinct from 'ready' then
    raise exception 'the video is still processing'; end if;

  update videos
     set status = 'scheduled', published_at = p_at, archived_at = null,
         updated_by = auth.uid()
   where id = p_id returning * into row;
  return row;
end $$;

-- unpublish already handles 'published'; it needs to handle a scheduled one
-- too, or cancelling a schedule would be impossible from the UI
create or replace function public.unpublish_video(p_id uuid)
returns public.videos language plpgsql security definer set search_path = public as $$
declare row public.videos;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  update videos set status = 'ready', published_at = null, updated_by = auth.uid()
   where id = p_id and status in ('published','scheduled') returning * into row;
  if not found then raise exception 'that video is not published or scheduled'; end if;
  return row;
end $$;

revoke all on function public.schedule_video(uuid, timestamptz) from public, anon;
grant execute on function public.schedule_video(uuid, timestamptz) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. the status is allowed now
-- select conname from pg_constraint where conname = 'videos_status_check';

-- 2. a past date is refused rather than silently publishing
--      select schedule_video('<a ready video id>', now() - interval '1 day');
--    expect: ERROR  that time has already passed — publish it now instead

-- 3. the policy is time-based, not flag-based
-- select policyname, qual from pg_policies
--  where tablename = 'videos' and policyname = 'members read published videos';
--    expect: the qual mentions published_at <= now()

-- ═══════════════════════════════════════════════════════════════════════════
-- TO UNDO
--   drop function if exists public.schedule_video(uuid, timestamptz);
--   -- then re-run the policy and constraint blocks from video-library.sql
-- ═══════════════════════════════════════════════════════════════════════════
