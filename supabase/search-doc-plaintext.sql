-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — SEARCH READS WORDS, NOT MARKUP  (v1)
-- Run once in the Supabase dashboard → SQL editor. Requires
-- video-library.sql (video_search_doc) and video-collections.sql.
--
-- Descriptions now carry the rich editor's small HTML dialect, and the
-- search document was indexing it raw: every bolded description contained
-- the token "strong" — a real search term in a movement app — and escaped
-- ampersands contributed "amp". This strips tags and decodes the four
-- entities the editor writes, BEFORE anything reaches to_tsvector.
--
-- ORDER MATTERS: replacing video_search_doc makes both GIN indexes stale
-- (they store values computed by the OLD body), so the two REINDEXes at the
-- end are not optional. Queries and index must agree on what "searchable"
-- means, or search silently misses.
-- ═══════════════════════════════════════════════════════════════════════════

-- tags → spaces, then the editor's four entities back to characters.
-- IMMUTABLE is honest here: pure string work, no catalog lookups.
create or replace function public.video_search_plain(p text)
returns text language sql immutable parallel safe as $$
  select replace(replace(replace(replace(
           regexp_replace(coalesce(p, ''), '<[^>]*>', ' ', 'g'),
         '&amp;', '&'), '&lt;', '<'), '&gt;', '>'), '&quot;', '"');
$$;

grant execute on function public.video_search_plain(text) to authenticated;

-- same signature, same weights — only the description is laundered.
-- Titles and short descriptions are plain by design and pass untouched.
create or replace function public.video_search_doc(
  p_title text, p_short text, p_description text, p_keywords text[]
) returns tsvector language sql immutable parallel safe as $$
  select setweight(to_tsvector('english', coalesce(p_title, '')), 'A')
      || setweight(to_tsvector('english', coalesce(p_short, '')), 'B')
      || setweight(to_tsvector('english',
           coalesce(array_to_string(coalesce(p_keywords, '{}'), ' '), '')), 'B')
      || setweight(to_tsvector('english', public.video_search_plain(p_description)), 'C');
$$;

-- rebuild the stored values under the new definition
reindex index public.videos_fts_idx;
reindex index public.collections_fts_idx;

-- ── verify ──────────────────────────────────────────────────────────────────
-- select public.video_search_doc('t', 's', '<p>Wrists get <strong>prepped</strong> &amp; ready</p>', '{}');
--   → must contain 'prep' and 'readi', and must NOT contain 'strong' or 'amp'
