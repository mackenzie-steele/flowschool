-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — WATCH PROGRESS  (v1)
-- Run once in the Supabase dashboard → SQL editor. Additive; nothing earlier
-- needs re-running. Requires video-library.sql (video_is_live).
--
-- One small member-owned table: where each member is in each video. It
-- powers Continue watching on /library, resume on the video page, the thin
-- progress line on cards, and the watched check on playlist rows.
--
-- PRIVACY: owner-only in every direction, like video_notes — there is
-- deliberately NO admin read policy. What someone watches and rewatches is
-- theirs. Aggregate engagement lives in Mux Data, where it is anonymous.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.video_watch_progress (
  member_id        uuid not null references auth.users(id) on delete cascade,
  video_id         uuid not null references public.videos(id) on delete cascade,
  position_seconds numeric not null default 0 check (position_seconds >= 0),

  -- denormalized so the shelf can say "12 min left" without joining videos
  duration_seconds numeric,

  -- completed survives a rewatch: scrubbing back to the start never takes
  -- the check away. The client sets it near the end (or on 'ended') and
  -- only ever writes it true.
  completed        boolean not null default false,

  updated_at       timestamptz not null default now(),
  primary key (member_id, video_id)
);

-- the Continue watching query: my rows, newest activity first
create index if not exists video_watch_progress_member_idx
  on public.video_watch_progress (member_id, updated_at desc);

alter table public.video_watch_progress enable row level security;

drop policy if exists "members read own progress" on public.video_watch_progress;
create policy "members read own progress" on public.video_watch_progress
  for select to authenticated using (member_id = auth.uid());

-- progress can only exist on a video you can actually watch
drop policy if exists "members write own progress" on public.video_watch_progress;
create policy "members write own progress" on public.video_watch_progress
  for insert to authenticated with check (
    member_id = auth.uid() and public.video_is_live(video_id));

drop policy if exists "members update own progress" on public.video_watch_progress;
create policy "members update own progress" on public.video_watch_progress
  for update to authenticated
  using (member_id = auth.uid()) with check (member_id = auth.uid());

drop policy if exists "members delete own progress" on public.video_watch_progress;
create policy "members delete own progress" on public.video_watch_progress
  for delete to authenticated using (member_id = auth.uid());

grant select, insert, update, delete on public.video_watch_progress to authenticated;
