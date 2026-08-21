-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — HONEST REACH  (v1)
-- Run once in the Supabase dashboard → SQL editor.
--
-- THE PROBLEM
-- profiles.location is a FREE-TEXT field, so every number built on it
-- fragments — and the two halves of the Reach panel disagreed with each other:
--
--   distinct_locations   grouped case-INSENSITIVELY  (lower(trim(location)))
--   the ranked bars      grouped case-SENSITIVELY    (trim(location))
--
-- "Portland" and "portland" counted as ONE city in the headline and drew TWO
-- separate bars underneath it. Same data, two answers, one panel.
--
-- WHAT THIS CHANGES
-- The bars now group case-insensitively too, displaying the MOST COMMON
-- original spelling via mode() — casing stops splitting a place, without
-- flattening how teachers actually wrote it.
--
-- WHAT IT DELIBERATELY DOESN'T DO
-- It does not guess that "OR" means "Oregon". That road ends in a
-- hand-maintained abbreviation table that breaks on the first international
-- teacher and silently merges places that only look alike. Case isn't
-- semantic; everything else is.
--
-- distinct_locations is still returned so the DEPLOYED client keeps working.
-- The new client stops displaying it, because no string count can honestly be
-- labelled "Cities & towns".
--
-- Everything else in admin_impact is byte-for-byte unchanged: this file was
-- generated from the live function with only the reach block patched.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.admin_impact()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; cy int := extract(year from now())::int;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select jsonb_build_object(
    'teachers', (select count(*) from auth.users where banned_until is null or banned_until <= now()),
    'content', jsonb_build_object(
      'classes',    (select coalesce(sum(jsonb_arr_len(payload)),0) from user_data where collection='flowschool_classes'),
      'flows',      (select coalesce(sum(jsonb_arr_len(payload)),0) from user_data where collection='flowschool_flows'),
      'cue_sheets', (select coalesce(sum(jsonb_arr_len(payload)),0) from user_data where collection='fs-cue-flows'),
      'stories',    (select coalesce(sum(jsonb_arr_len(payload)),0) from user_data where collection='flowschool_stories'),
      'total',      (select coalesce(sum(jsonb_arr_len(payload)),0) from user_data)
    ),
    'teaching_minutes', (select coalesce(sum((e->>'length')::numeric),0)::bigint
        from user_data d, jsonb_array_elements(d.payload) e
        where d.collection='flowschool_classes' and jsonb_typeof(d.payload)='array' and (e->>'length') ~ '^[0-9]+$'),
    'shared_classes', (select count(*) from public_classes where published),
    'total_saves', (select count(*) from class_saves),
    'experiment_saves', (select coalesce(sum(jsonb_arr_len(payload)),0) from user_data where collection='flowschool_favs'),
    'generations', (select count(*) from analytics_events where event_name='item_generated'),
    'active_30d', (select count(*) from auth.users u where
        (u.banned_until is null or u.banned_until <= now())   -- deactivated accounts never count
        and (u.last_sign_in_at >= now() - interval '30 days'
          or exists (select 1 from user_data d where d.user_id=u.id and d.updated_at >= now()-interval '30 days')
          or exists (select 1 from analytics_events ae where ae.user_id=u.id and ae.created_at >= now()-interval '30 days' and admin_is_meaningful(ae.event_name)))),
    'reach', jsonb_build_object(
      'located_teachers',   (select count(*) from profiles where nullif(trim(location),'') is not null),
      -- kept ONLY so the deployed client keeps rendering. The new client stops
      -- showing it: a count of distinct STRINGS is not a count of places.
      'distinct_locations', (select count(distinct lower(trim(location))) from profiles where nullif(trim(location),'') is not null),
      -- group case-insensitively and DISPLAY the most common spelling, so
      -- "Portland" and "portland" stop drawing two bars. mode() picks the
      -- dominant original casing rather than flattening everyone's label.
      'top', (select coalesce(jsonb_agg(jsonb_build_object('location', label, 'count', c) order by c desc, label), '[]'::jsonb)
          from (select mode() within group (order by trim(location)) as label, count(*) as c
                from profiles where nullif(trim(location),'') is not null
                group by lower(trim(location))
                order by count(*) desc, 1
                limit 12) z)
    ),
    'experience', jsonb_build_object(
      'shared',        (select count(*) from profiles where teaching_since ~ '^(19|20)[0-9]{2}$'),
      'avg_years',     (select round(avg(cy - teaching_since::int), 1) from profiles where teaching_since ~ '^(19|20)[0-9]{2}$'),
      'newest_years',  (select cy - max(teaching_since::int) from profiles where teaching_since ~ '^(19|20)[0-9]{2}$'),
      'veteran_years', (select cy - min(teaching_since::int) from profiles where teaching_since ~ '^(19|20)[0-9]{2}$'),
      'buckets', (select coalesce(jsonb_agg(jsonb_build_object('bucket', b.label, 'count', coalesce(z.c, 0)) order by b.ord), '[]'::jsonb)
          -- fixed set of ranges, left-joined to counts, so every range shows even at 0
          from (values (1,'0–2 yrs'),(2,'3–5 yrs'),(3,'6–10 yrs'),(4,'11–15 yrs'),(5,'16–20 yrs'),(6,'20+ yrs')) as b(ord, label)
          left join (
            select case when yr <= 2 then 1 when yr <= 5 then 2 when yr <= 10 then 3 when yr <= 15 then 4 when yr <= 20 then 5 else 6 end ord, count(*) c
            from (select cy - teaching_since::int yr from profiles where teaching_since ~ '^(19|20)[0-9]{2}$') x group by 1
          ) z on z.ord = b.ord)
    ),
    'love', (select coalesce(jsonb_agg(jsonb_build_object(
        'message', f.message, 'email', f.email, 'at', f.created_at,
        'name', coalesce(nullif(trim(p.full_name),''), p.display_name)) order by f.created_at desc), '[]'::jsonb)
        from (select * from feedback where kind='love' order by created_at desc limit 24) f
        left join profiles p on p.id = f.user_id)
  ) into r;
  return r;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. See the fragmentation you actually have:
select lower(trim(location)) as grouped,
       count(*)              as teachers,
       array_agg(distinct trim(location)) as spellings
from profiles
where nullif(trim(location),'') is not null
group by lower(trim(location))
having count(distinct trim(location)) > 1
order by count(*) desc;
--    Every row here was drawing multiple bars before and now draws one.
--    An empty result means casing isn't splitting anything YET — the fix is
--    still worth having before it does.

-- 2. What the panel will show — stays COMMENTED: the SQL editor runs as
--    postgres, not a signed-in admin, so the is_admin() gate raises "not
--    authorized" and rolls back the run. Check the Impact tab instead.
-- select jsonb_pretty(public.admin_impact() -> 'reach');

-- ═══════════════════════════════════════════════════════════════════════════
-- THE REAL FIX IS UPSTREAM
-- This removes CASE as a source of fragmentation, nothing more. "Portland, OR"
-- and "Portland, Oregon" are still two places and no query can honestly merge
-- them. That has to be solved where the value is typed — an autocomplete on
-- the profile's location field, so the variants never enter the data at all.
-- Until then the panel reports COVERAGE ("9 of 34 teachers shared where they
-- teach"), which is a claim it can actually support.
-- ═══════════════════════════════════════════════════════════════════════════
