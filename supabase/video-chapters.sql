-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — VIDEO CHAPTERS  (v1)
-- Run once in the Supabase dashboard → SQL editor. Additive.
--
-- Mux's AI-generated chapters are a dashboard beta with no read API — the
-- admin pastes them in once (JSON, VTT, or "0:00 Title" lines all parse)
-- and they live here: an array of { t: seconds, title } on the video row,
-- shown to members only while chapters_enabled is true.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.videos add column if not exists chapters jsonb;
alter table public.videos add column if not exists chapters_enabled boolean not null default false;

-- members already read live video rows (RLS from video-library.sql);
-- these columns ride the same policies — nothing else to grant.
