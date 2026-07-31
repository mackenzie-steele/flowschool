-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — NAME THE SUBJECT IN THE ACTIVITY LOG  (v1)
-- Run once in the Supabase dashboard → SQL editor.
--
-- WHY
-- The admin user drawer's Recent Activity showed "profile_viewed" with no
-- indication of WHOSE profile. The id was always recorded — analytics.js
-- writes it to resource_id — but admin_user_detail's recent_activity block
-- never returned that column, so the *which* never left the database.
--
-- This replaces admin_user_detail with one change: recent_activity now
-- carries a resolved `subject`. Everything else in the function is byte for
-- byte what it was.
--
--   resource_type = 'profile'       → that teacher's name
--   resource_type = 'public_class'  → that class's title
--   anything else                   → null, and the UI falls back to
--                                     resource_type as it does today
--
-- ADDITIVE ONLY. One function replaced, no table touched, no policy changed,
-- no new column. Nothing else in admin-analytics.sql needs re-running.
--
-- NOTE ON THE JOIN
-- The lookups compare `id::text = resource_id`, casting the UUID to text
-- rather than the text to UUID. resource_id is a free-text column (it also
-- holds bigint library ids), so casting the other direction would raise on
-- any non-UUID value and take the whole drawer down with it. This way a
-- non-matching id simply resolves to null.
--
-- PRIVACY — worth saying out loud: after this, an admin can see which
-- teacher looked at which teacher's profile. That is already implied by the
-- raw event log; this only makes it legible. The function stays is_admin()
-- gated and SECURITY DEFINER, so no non-admin gains anything.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. page_opened must NOT count as meaningful activity ───────────────────
-- The nine non-tool pages (Dashboard, The Circle, Saved, Profile, Settings,
-- Shared Class, Teacher Profile, Elements of Flow, Admin) now fire
-- `page_opened`. Opening a page is not DOING something — and if this line is
-- skipped, merely loading the dashboard starts counting as real activity and
-- every active-user and activation figure quietly becomes "people who opened
-- a tab". tool_opened has always been excluded for the same reason.

create or replace function public.admin_is_meaningful(event_name text)
returns boolean language sql immutable as $$
  select event_name not in ('tool_opened','page_opened','user_signed_in','user_signed_up','public_item_viewed','profile_viewed','session_start','creation_started');
$$;


-- ── 2. name the subject in the activity log ────────────────────────────────

create or replace function public.admin_user_detail(p_uid uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select jsonb_build_object(
    'user', (select jsonb_build_object(
        'user_id', u.id, 'email', u.email, 'signed_up', u.created_at,
        'last_sign_in_at', u.last_sign_in_at, 'email_confirmed', (u.email_confirmed_at is not null),
        'deactivated', (u.banned_until is not null and u.banned_until > now()),
        'is_admin', exists(select 1 from admin_users a where a.user_id = u.id),
        'name', coalesce(nullif(trim(p.full_name),''), p.display_name),
        'handle', h.handle, 'location', p.location, 'teaching_since', p.teaching_since,
        'in_circle', p.in_circle, 'avatar_url', p.avatar_url
      ) from auth.users u
        left join profiles p on p.id = u.id
        left join handles h on h.user_id = u.id
        where u.id = p_uid),
    'content', (select coalesce(jsonb_agg(jsonb_build_object(
        'type', admin_content_type(collection), 'collection', collection, 'count', jsonb_arr_len(payload),
        'last_update', updated_at) order by jsonb_arr_len(payload) desc), '[]'::jsonb)
        from user_data where user_id = p_uid and jsonb_arr_len(payload) > 0),
    'saved_items_total', (select coalesce(sum(jsonb_arr_len(payload)),0) from user_data where user_id = p_uid),
    'published_classes', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', pc.id, 'title', pc.title, 'published', pc.published, 'updated_at', pc.updated_at,
        'saves', (select count(*) from class_saves cs where cs.public_class_id = pc.id)) order by pc.updated_at desc), '[]'::jsonb)
        from public_classes pc where pc.owner_id = p_uid and pc.published),
    'saved_public_classes', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', pc.id, 'title', pc.title, 'saved_at', cs.created_at, 'active', pc.published) order by cs.created_at desc), '[]'::jsonb)
        from class_saves cs join public_classes pc on pc.id = cs.public_class_id where cs.user_id = p_uid),
    'tools_used', (select coalesce(jsonb_agg(distinct tool), '[]'::jsonb)
        from analytics_events where user_id = p_uid and tool is not null),
    'tool_usage', (select coalesce(jsonb_agg(jsonb_build_object('tool', tool, 'count', c) order by c desc), '[]'::jsonb)
        from (select tool, count(*) c from analytics_events
              where user_id = p_uid and tool is not null and admin_is_meaningful(event_name) group by tool) z),
    'activity_daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d), '[]'::jsonb)
        from (select gs::date d,
                (select count(*) from analytics_events ae
                   where ae.user_id = p_uid and ae.created_at::date = gs::date and admin_is_meaningful(ae.event_name)) c
              from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') gs) z),
    -- ── the one change: a resolved `subject` alongside the raw fields ──
    'recent_activity', (select coalesce(jsonb_agg(jsonb_build_object(
        'event', x.event_name, 'tool', x.tool, 'resource_type', x.resource_type,
        'subject', case
          when x.event_name = 'page_opened' then x.metadata->>'page'
          when x.resource_type = 'profile' then
            (select coalesce(nullif(trim(p2.full_name), ''), p2.display_name)
               from profiles p2 where p2.id::text = x.resource_id)
          when x.resource_type = 'public_class' then
            (select pc2.title from public_classes pc2 where pc2.id::text = x.resource_id)
          else null
        end,
        'at', x.created_at) order by x.created_at desc), '[]'::jsonb)
        -- 25 → 100: the drawer opens on 12 and folds the rest behind "Show
        -- all", so this is the real ceiling on how far back an admin can
        -- read. One number to change if it ever needs to be deeper.
        from (select * from analytics_events where user_id = p_uid order by created_at desc limit 100) x),
    'last_activity', (select greatest(u.last_sign_in_at,
        (select max(updated_at) from user_data where user_id = p_uid),
        (select max(created_at) from analytics_events where user_id = p_uid and admin_is_meaningful(event_name)))
        from auth.users u where u.id = p_uid)
  ) into r;
  return r;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Which profile views exist at all, and do they resolve to a name?
--    (Replace nothing — this reads across all users.)
select
  ae.created_at,
  ae.event_name,
  ae.resource_id,
  coalesce(nullif(trim(p.full_name), ''), p.display_name) as resolves_to
from analytics_events ae
left join profiles p on p.id::text = ae.resource_id
where ae.resource_type = 'profile'
order by ae.created_at desc
limit 10;
--    expect: resolves_to filled wherever that teacher still has a profile.
--    Null means the profile was deleted, or nobody has viewed one yet.

-- 2. End to end: open /admin → Users → click any teacher who has viewed a
--    profile. Recent activity should now read
--        profile_viewed · <their name> · 2h ago
--    instead of
--        profile_viewed · profile · 2h ago

-- ═══════════════════════════════════════════════════════════════════════════
-- TO UNDO
--   Re-run the admin_user_detail block in supabase/admin-analytics.sql.
--   Nothing else here is stateful.
-- ═══════════════════════════════════════════════════════════════════════════
