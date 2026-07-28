-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — ADMIN ANALYTICS  (v1)
-- Run once in the Supabase dashboard → SQL editor.
--
-- ADDITIVE ONLY. Creates the admin allowlist, the analytics event log, the
-- admin audit log, an is_admin() gate, RLS that denies normal users, indexes,
-- and every admin read RPC. It does NOT alter any existing user-facing table
-- or weaken any existing RLS policy.
--
-- Authorization model:
--   · admin_users        — the allowlist, keyed to auth.users.id
--   · is_admin(uid)      — SECURITY DEFINER gate; the single source of truth
--   · every admin RPC    — SECURITY DEFINER + `if not is_admin() then raise`
--   · RLS on new tables  — normal users read nothing
-- Admin RPCs read auth.users and bypass user_data RLS (definer) but return
-- ONLY whitelisted identity/aggregate fields — never private note text,
-- story bodies, cue wording, or class contents.
--
-- After this, run supabase/seed-admins.sql to grant Bonnie + Mackenzie admin.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── safe helpers ────────────────────────────────────────────────────────────

create or replace function public.jsonb_arr_len(p jsonb)
returns int language sql immutable as $$
  select case when jsonb_typeof(p) = 'array' then jsonb_array_length(p) else 0 end;
$$;

-- collection (localStorage key) → human content type
create or replace function public.admin_content_type(collection text)
returns text language sql immutable as $$
  select case collection
    when 'flowschool_classes'        then 'class'
    when 'flowschool_flows'          then 'flow'
    when 'fs-cue-flows'              then 'cue_sheet'
    when 'flowschool_stories'        then 'story'
    when 'flowschool_playlists'      then 'playlist'
    when 'flowschool_arules'         then 'arbitrary_rule'
    when 'fs-pose-connector-saved'   then 'pose_chain'
    when 'flowschool_favs'           then 'experiment'
    when 'flowschool_lognotes'       then 'teaching_note'
    when 'flowschool_shorthand'      then 'shorthand'
    else collection end;
$$;

-- ── admin allowlist ─────────────────────────────────────────────────────────

create table if not exists public.admin_users (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  email    text,
  note     text,
  added_by uuid,
  added_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = uid);
$$;
revoke all on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated;

-- admins may read the allowlist; the client never writes it (server/definer only)
drop policy if exists "admins read admin_users" on public.admin_users;
create policy "admins read admin_users" on public.admin_users
  for select to authenticated using (public.is_admin());

-- ── analytics events ────────────────────────────────────────────────────────

create table if not exists public.analytics_events (
  id             bigint generated always as identity primary key,
  user_id        uuid references auth.users(id) on delete set null,  -- delete = anonymize, keep aggregate
  session_id     text,
  event_name     text not null,
  event_category text,
  tool           text,
  resource_type  text,
  resource_id    text,
  metadata       jsonb not null default '{}'::jsonb,   -- IDs + safe summaries only, incl. device class
  created_at     timestamptz not null default now()
);
alter table public.analytics_events enable row level security;

-- users insert ONLY their own events; admins read; nobody updates or deletes (immutable)
drop policy if exists "own insert events" on public.analytics_events;
create policy "own insert events" on public.analytics_events
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "admins read events" on public.analytics_events;
create policy "admins read events" on public.analytics_events
  for select to authenticated using (public.is_admin());

create index if not exists ae_created_idx on public.analytics_events (created_at);
create index if not exists ae_user_idx    on public.analytics_events (user_id, created_at);
create index if not exists ae_event_idx   on public.analytics_events (event_name, created_at);
create index if not exists ae_tool_idx    on public.analytics_events (tool, created_at);
create index if not exists ae_res_idx     on public.analytics_events (resource_type, resource_id);

-- ── admin audit log ─────────────────────────────────────────────────────────

create table if not exists public.admin_audit_log (
  id             bigint generated always as identity primary key,
  actor_id       uuid,
  actor_email    text,
  action         text not null,
  target_user_id uuid,
  target_email   text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
drop policy if exists "admins read audit" on public.admin_audit_log;
create policy "admins read audit" on public.admin_audit_log
  for select to authenticated using (public.is_admin());
create index if not exists aal_created_idx on public.admin_audit_log (created_at);

-- speed up save aggregation
create index if not exists class_saves_pc_idx      on public.class_saves (public_class_id);
create index if not exists class_saves_created_idx on public.class_saves (created_at);

-- what counts as a real product action (not a page/tool open or a sign-in)
create or replace function public.admin_is_meaningful(event_name text)
returns boolean language sql immutable as $$
  select event_name not in ('tool_opened','user_signed_in','user_signed_up','public_item_viewed','profile_viewed','session_start','creation_started');
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ADMIN READ RPCs — every one is SECURITY DEFINER and gated by is_admin().
-- ═══════════════════════════════════════════════════════════════════════════

-- ── overview snapshot ───────────────────────────────────────────────────────
create or replace function public.admin_overview()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select jsonb_build_object(
    'generated_at', now(),
    'total_users',   (select count(*) from auth.users where banned_until is null or banned_until <= now()),
    'new_users_7d',  (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'new_users_30d', (select count(*) from auth.users where created_at >= now() - interval '30 days'),
    -- "active today" = used the platform in the last 24h by ANY signal.
    -- last_sign_in_at alone misses persistent sessions (it only updates on a
    -- fresh password sign-in), so we also credit content updates and events.
    'active_today', (select count(*) from auth.users u
        where u.last_sign_in_at >= now() - interval '24 hours'
           or exists (select 1 from user_data d where d.user_id = u.id and d.updated_at >= now() - interval '24 hours')
           or exists (select 1 from analytics_events ae where ae.user_id = u.id and ae.created_at >= now() - interval '24 hours')),
    'signed_in_7d',  (select count(*) from auth.users where last_sign_in_at >= now() - interval '7 days'),
    'dau', (select count(distinct user_id) from analytics_events
              where user_id is not null and created_at >= now() - interval '1 day' and admin_is_meaningful(event_name)),
    'wau', (select count(distinct user_id) from analytics_events
              where user_id is not null and created_at >= now() - interval '7 days' and admin_is_meaningful(event_name)),
    'mau', (select count(distinct user_id) from analytics_events
              where user_id is not null and created_at >= now() - interval '30 days' and admin_is_meaningful(event_name)),
    'total_public_classes',   (select count(*) from public_classes where published),
    'total_public_saves',     (select count(*) from class_saves),
    'total_experiment_saves', (select coalesce(sum(jsonb_arr_len(payload)),0) from user_data where collection = 'flowschool_favs'),
    'total_saved_items',      (select coalesce(sum(jsonb_arr_len(payload)),0) from user_data),
    'admin_count',            (select count(*) from admin_users),
    'inactive_users', (select count(*) from auth.users u
        where (u.banned_until is null or u.banned_until <= now())
          and not exists (select 1 from user_data d where d.user_id = u.id and jsonb_arr_len(d.payload) > 0)),
    'events_tracked_since',   (select min(created_at) from analytics_events),
    -- prior-period counts, so the UI can show trend deltas
    'new_users_prev_7d',  (select count(*) from auth.users where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'),
    'new_users_prev_30d', (select count(*) from auth.users where created_at >= now() - interval '60 days' and created_at < now() - interval '30 days'),
    'active_yesterday', (select count(*) from auth.users u
        where (u.last_sign_in_at >= now() - interval '48 hours' and u.last_sign_in_at < now() - interval '24 hours')
           or exists (select 1 from user_data d where d.user_id = u.id and d.updated_at >= now() - interval '48 hours' and d.updated_at < now() - interval '24 hours')
           or exists (select 1 from analytics_events ae where ae.user_id = u.id and ae.created_at >= now() - interval '48 hours' and ae.created_at < now() - interval '24 hours'))
  ) into r;
  return r;
end $$;

-- ── retention by signup-month cohort ────────────────────────────────────────
-- Historical caveat: we can only place each user by their LAST activity (that's
-- all the blobs store), so this shows current retention (active in last 30 days)
-- per cohort, not a full week-by-week retention matrix.
create or replace function public.admin_retention()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  with la as (
    select u.id, date_trunc('month', u.created_at) as cohort,
      greatest(u.last_sign_in_at,
        (select max(updated_at) from user_data d where d.user_id = u.id),
        (select max(created_at) from analytics_events ae where ae.user_id = u.id and admin_is_meaningful(ae.event_name))
      ) as last_active
    from auth.users u
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cohort', to_char(cohort, 'Mon YYYY'),
    'signups', signups,
    'active_30d', active_30d,
    'retention_pct', case when signups > 0 then round(active_30d::numeric / signups * 100) else 0 end
  ) order by cohort desc), '[]'::jsonb) into r
  from (
    select cohort, count(*) signups,
      count(*) filter (where last_active >= now() - interval '30 days') active_30d
    from la group by cohort
  ) z;
  return r;
end $$;

-- ── activation funnel: signed up → created content → shared a class ─────────
create or replace function public.admin_funnel()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select jsonb_build_object(
    'signed_up',       (select count(*) from auth.users where banned_until is null or banned_until <= now()),
    'created_content', (select count(*) from auth.users u
                          where exists (select 1 from user_data d where d.user_id = u.id and jsonb_arr_len(d.payload) > 0)),
    'shared_class',    (select count(distinct owner_id) from public_classes where published)
  ) into r;
  return r;
end $$;

-- ── impact / by-the-numbers (marketing-facing aggregates) ───────────────────
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
      'distinct_locations', (select count(distinct lower(trim(location))) from profiles where nullif(trim(location),'') is not null),
      'top', (select coalesce(jsonb_agg(jsonb_build_object('location', loc, 'count', c) order by c desc), '[]'::jsonb)
          from (select trim(location) loc, count(*) c from profiles where nullif(trim(location),'') is not null
                group by trim(location) order by count(*) desc limit 12) z)
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

-- ── users list (search + sort + status filter + signup filter + pagination) ─
-- drop the pre-signup-filter signature so the new one isn't left as an
-- ambiguous overload (adding a param makes a NEW function, not a replacement)
drop function if exists public.admin_list_users(text, text, text, int, int);
create or replace function public.admin_list_users(
  p_search text default null,
  p_sort   text default 'recent_activity',   -- recent_activity | signup | saved_items | events | name
  p_status text default null,                -- active | deactivated | admin | inactive | null(all)
  p_limit  int  default 50,
  p_offset int  default 0,
  p_signup_days int default null             -- signed up within the last N days (null = all)
) returns jsonb language plpgsql security definer set search_path = public as $$
declare total bigint; rows jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;

  create temp table _rows on commit drop as
  with counts as (
    select user_id,
      coalesce(sum(jsonb_arr_len(payload)),0) as saved_items,
      coalesce(sum(case when collection='flowschool_classes' then jsonb_arr_len(payload) else 0 end),0) as classes,
      coalesce(sum(case when collection='flowschool_favs'    then jsonb_arr_len(payload) else 0 end),0) as experiments,
      max(updated_at) as last_update
    from user_data group by user_id
  ),
  pub as (select owner_id, count(*) filter (where published) as public_classes from public_classes group by owner_id),
  sav as (select user_id, count(*) as public_saves from class_saves group by user_id),
  ev  as (select user_id, count(*) as events,
                 max(created_at) filter (where admin_is_meaningful(event_name)) as last_action
          from analytics_events where user_id is not null group by user_id)
  select
    u.id as user_id, u.email, u.created_at as signed_up, u.last_sign_in_at,
    (u.email_confirmed_at is not null) as email_confirmed,
    (u.banned_until is not null and u.banned_until > now()) as deactivated,
    coalesce(nullif(trim(p.full_name),''), p.display_name) as name,
    h.handle,
    (a.user_id is not null) as is_admin,
    coalesce(c.saved_items,0) as saved_items, coalesce(c.classes,0) as classes,
    coalesce(c.experiments,0) as experiments,
    coalesce(pb.public_classes,0) as public_classes, coalesce(s.public_saves,0) as public_saves,
    coalesce(e.events,0) as events,
    greatest(u.last_sign_in_at, c.last_update, e.last_action) as last_activity
  from auth.users u
  left join profiles p on p.id = u.id
  left join handles  h on h.user_id = u.id
  left join admin_users a on a.user_id = u.id
  left join counts c on c.user_id = u.id
  left join pub pb on pb.owner_id = u.id
  left join sav s on s.user_id = u.id
  left join ev  e on e.user_id = u.id;

  if p_search is not null and p_search <> '' then
    delete from _rows where not (
      email ilike '%'||p_search||'%' or coalesce(name,'') ilike '%'||p_search||'%' or coalesce(handle,'') ilike '%'||p_search||'%'
    );
  end if;
  if p_status = 'active'      then delete from _rows where deactivated; end if;
  if p_status = 'deactivated' then delete from _rows where not deactivated; end if;
  if p_status = 'admin'       then delete from _rows where not is_admin; end if;
  if p_status = 'inactive'    then delete from _rows where saved_items > 0; end if;
  if p_signup_days is not null and p_signup_days > 0 then
    delete from _rows where signed_up < now() - (p_signup_days || ' days')::interval;
  end if;

  select count(*) into total from _rows;

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into rows from (
    select * from _rows order by
      case when p_sort='recent_activity' then last_activity end desc nulls last,
      case when p_sort='signup'          then signed_up     end desc nulls last,
      case when p_sort='saved_items'     then saved_items   end desc nulls last,
      case when p_sort='events'          then events        end desc nulls last,
      (case when p_sort='name' then lower(coalesce(name,email)) end) asc nulls last,
      last_activity desc nulls last
    limit greatest(p_limit,1) offset greatest(p_offset,0)
  ) t;

  return jsonb_build_object('total', total, 'rows', rows);
end $$;

-- ── one user, full non-sensitive detail ─────────────────────────────────────
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
    'recent_activity', (select coalesce(jsonb_agg(jsonb_build_object(
        'event', event_name, 'tool', tool, 'resource_type', resource_type, 'at', created_at) order by created_at desc), '[]'::jsonb)
        from (select * from analytics_events where user_id = p_uid order by created_at desc limit 25) x),
    'last_activity', (select greatest(u.last_sign_in_at,
        (select max(updated_at) from user_data where user_id = p_uid),
        (select max(created_at) from analytics_events where user_id = p_uid and admin_is_meaningful(event_name)))
        from auth.users u where u.id = p_uid)
  ) into r;
  return r;
end $$;

-- ── Movement Experiments: how many + WHICH were saved ───────────────────────
create or replace function public.admin_experiment_saves()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(x order by x->>'saves' is null, (x->>'saves')::int desc), '[]'::jsonb) into r from (
    select jsonb_build_object(
      'experiment_id', (e->>'id'),
      'title',         max(e->>'title'),
      'saves',         count(*),
      'unique_savers', count(distinct d.user_id),
      'last_save',     max((e->>'savedAt'))
    ) as x
    from user_data d, jsonb_array_elements(d.payload) e
    where d.collection = 'flowschool_favs' and jsonb_typeof(d.payload) = 'array'
    group by (e->>'id')
  ) y;
  return r;
end $$;

-- ── public classes with engagement (sort + pagination) ──────────────────────
-- drop the pre-search signature so the new one isn't left as an ambiguous
-- overload (the Overview module calls this with 3 args and would otherwise
-- match both functions and error → "No public classes yet")
drop function if exists public.admin_public_content(text, int, int);
create or replace function public.admin_public_content(
  p_sort text default 'most_saved',   -- most_saved | recent_save | recent_publish | title
  p_limit int default 50, p_offset int default 0,
  p_search text default null           -- match on class title or creator (name / email)
) returns jsonb language plpgsql security definer set search_path = public as $$
declare total bigint; rows jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select count(*) into total from public_classes pc
    left join profiles p on p.id = pc.owner_id
    left join auth.users u on u.id = pc.owner_id
    where pc.published    -- unpublished classes aren't public: never listed or counted
      and (p_search is null or p_search = ''
        or pc.title ilike '%'||p_search||'%'
        or coalesce(p.full_name, p.display_name, u.email) ilike '%'||p_search||'%');
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into rows from (
    select pc.id, pc.title, pc.class_type, pc.length_minutes, pc.published,
      pc.created_at as published_at, pc.updated_at, pc.owner_id,
      coalesce(nullif(trim(p.full_name),''), p.display_name) as creator_name,
      u.email as creator_email, h.handle as creator_handle,
      count(cs.*) as saves, count(distinct cs.user_id) as unique_savers, max(cs.created_at) as last_save
    from public_classes pc
    left join class_saves cs on cs.public_class_id = pc.id
    left join profiles p on p.id = pc.owner_id
    left join handles h on h.user_id = pc.owner_id
    left join auth.users u on u.id = pc.owner_id
    where pc.published    -- unpublished classes aren't public: never listed or counted
      and (p_search is null or p_search = ''
        or pc.title ilike '%'||p_search||'%'
        or coalesce(p.full_name, p.display_name, u.email) ilike '%'||p_search||'%')
    group by pc.id, p.full_name, p.display_name, u.email, h.handle
    order by
      case when p_sort='most_saved'      then count(cs.*)     end desc nulls last,
      case when p_sort='recent_save'     then max(cs.created_at) end desc nulls last,
      case when p_sort='recent_publish'  then pc.created_at    end desc nulls last,
      (case when p_sort='title' then lower(pc.title) end) asc nulls last,
      count(cs.*) desc
    limit greatest(p_limit,1) offset greatest(p_offset,0)
  ) t;
  return jsonb_build_object('total', total, 'rows', rows);
end $$;

-- who saved a given public class
create or replace function public.admin_public_content_savers(p_pcid uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', cs.user_id, 'email', u.email,
    'name', coalesce(nullif(trim(p.full_name),''), p.display_name),
    'saved_at', cs.created_at) order by cs.created_at desc), '[]'::jsonb) into r
  from class_saves cs
  left join auth.users u on u.id = cs.user_id
  left join profiles p on p.id = cs.user_id
  where cs.public_class_id = p_pcid;
  return r;
end $$;

-- ── tool usage (events since launch) ────────────────────────────────────────
create or replace function public.admin_top_tools(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by (t.opens + t.actions) desc), '[]'::jsonb) into r from (
    select tool,
      count(*) filter (where event_name = 'tool_opened') as opens,
      count(*) filter (where admin_is_meaningful(event_name)) as actions,
      count(distinct user_id) as unique_users
    from analytics_events
    where tool is not null and created_at >= now() - (p_days || ' days')::interval
    group by tool
  ) t;
  return r;
end $$;

-- ── time series (historical where the timestamps already exist) ─────────────
-- kind: signups | public_saves | experiment_saves | active
create or replace function public.admin_series(p_kind text, p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  with days as (
    select generate_series(date_trunc('day', now()) - ((p_days-1) || ' days')::interval,
                           date_trunc('day', now()), interval '1 day')::date as d
  ),
  vals as (
    select case p_kind
      when 'signups'          then (select count(*) from auth.users u where u.created_at::date = days.d)
      when 'public_saves'     then (select count(*) from class_saves cs where cs.created_at::date = days.d)
      when 'active'           then (select count(distinct ae.user_id) from analytics_events ae
                                      where ae.created_at::date = days.d and admin_is_meaningful(ae.event_name))
      when 'created'          then (select count(*) from analytics_events ae
                                      where ae.created_at::date = days.d and ae.event_name in ('item_created','item_saved'))
      when 'experiment_saves' then (select count(*) from user_data d2, jsonb_array_elements(d2.payload) e
                                      where d2.collection='flowschool_favs' and jsonb_typeof(d2.payload)='array'
                                        and (e->>'savedAt') is not null
                                        and (to_timestamp((e->>'savedAt')::bigint / 1000.0))::date = days.d)
      else 0 end as count, days.d
    from days
  )
  select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', count) order by d), '[]'::jsonb) into r from vals;
  return r;
end $$;

-- ── saved content summary + records ─────────────────────────────────────────
create or replace function public.admin_saved_content()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select jsonb_build_object(
    'by_type', (select coalesce(jsonb_agg(jsonb_build_object('type', t, 'items', n, 'users', users) order by n desc), '[]'::jsonb)
        from (select admin_content_type(collection) t, sum(jsonb_arr_len(payload)) n,
                     count(*) filter (where jsonb_arr_len(payload) > 0) users
              from user_data group by admin_content_type(collection)) z),
    'total_items', (select coalesce(sum(jsonb_arr_len(payload)),0) from user_data),
    'unique_savers', (select count(distinct user_id) from user_data where jsonb_arr_len(payload) > 0),
    'public_saves', (select count(*) from class_saves),
    'top_savers', (select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'email', email, 'name', name, 'items', items) order by items desc), '[]'::jsonb)
        from (select d.user_id, u.email,
                     coalesce(nullif(trim(p.full_name),''), p.display_name) as name,
                     sum(jsonb_arr_len(d.payload)) as items
              from user_data d left join auth.users u on u.id=d.user_id left join profiles p on p.id=d.user_id
              group by d.user_id, u.email, p.full_name, p.display_name
              order by sum(jsonb_arr_len(d.payload)) desc limit 15) s),
    'recent_public_saves', (select coalesce(jsonb_agg(jsonb_build_object(
        'user_email', u.email, 'class_title', pc.title, 'saved_at', cs.created_at,
        'active', pc.published, 'reference', true) order by cs.created_at desc), '[]'::jsonb)
        from (select * from class_saves order by created_at desc limit 50) cs
        join public_classes pc on pc.id = cs.public_class_id
        left join auth.users u on u.id = cs.user_id)
  ) into r;
  return r;
end $$;

-- ── recent meaningful activity (cross-user feed) ────────────────────────────
create or replace function public.admin_recent_activity(p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'event', ae.event_name, 'tool', ae.tool, 'resource_type', ae.resource_type,
    'at', ae.created_at, 'email', u.email) order by ae.created_at desc), '[]'::jsonb) into r
  from (select * from analytics_events where admin_is_meaningful(event_name) order by created_at desc limit p_limit) ae
  left join auth.users u on u.id = ae.user_id;
  return r;
end $$;

-- ── admin audit log ─────────────────────────────────────────────────────────
create or replace function public.admin_audit(p_limit int default 100)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb) into r
  from (select * from admin_audit_log order by created_at desc limit p_limit) t;
  return r;
end $$;

-- ── user feedback (bug / idea / love) — the feedback table is already collecting ──
create or replace function public.admin_feedback_summary()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select jsonb_build_object(
    'total',   (select count(*) from feedback),
    'last_7d', (select count(*) from feedback where created_at >= now() - interval '7 days'),
    'by_kind', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'count', c) order by c desc), '[]'::jsonb)
        from (select kind, count(*) c from feedback group by kind) z)
  ) into r;
  return r;
end $$;

create or replace function public.admin_feedback(p_limit int default 100, p_kind text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id, 'created_at', f.created_at, 'email', f.email, 'kind', f.kind,
    'message', f.message, 'page', f.context->>'page') order by f.created_at desc), '[]'::jsonb) into r
  from (select * from feedback where p_kind is null or kind = p_kind order by created_at desc limit p_limit) f;
  return r;
end $$;

-- delete one feedback row (admin only, audit-logged). p_id is text so it works
-- whether the feedback primary key is bigint or uuid.
create or replace function public.admin_delete_feedback(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare fb record; n int;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select f.email, f.kind, f.created_at into fb from feedback f where f.id::text = p_id;
  delete from feedback where id::text = p_id;
  get diagnostics n = row_count;
  if n > 0 then
    insert into admin_audit_log (actor_id, actor_email, action, metadata)
    values (auth.uid(), (auth.jwt() ->> 'email'), 'feedback_deleted',
            jsonb_build_object('feedback_id', p_id, 'email', fb.email, 'kind', fb.kind, 'created_at', fb.created_at));
  end if;
  return jsonb_build_object('deleted', n);
end $$;

-- ── admins roster (for the dedicated Admins management screen) ───────────────
create or replace function public.admin_admins()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', a.user_id, 'email', coalesce(a.email, u.email),
    'name', coalesce(nullif(trim(p.full_name),''), p.display_name),
    'note', a.note, 'granted_at', a.added_at,
    'granted_by', (select coalesce(nullif(trim(p2.full_name),''), p2.display_name, u2.email)
                   from auth.users u2 left join profiles p2 on p2.id = u2.id where u2.id = a.added_by),
    'is_self', (a.user_id = auth.uid())
  ) order by a.added_at), '[]'::jsonb) into r
  from admin_users a
  left join auth.users u on u.id = a.user_id
  left join profiles p on p.id = a.user_id;
  return r;
end $$;

-- ── client errors — the client_errors table is already collecting ──
create or replace function public.admin_errors_summary(p_days int default 7)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select jsonb_build_object(
    'total',   (select count(*) from client_errors),
    'today',   (select count(*) from client_errors where created_at >= now() - interval '24 hours'),
    'window',  (select count(*) from client_errors where created_at >= now() - (p_days || ' days')::interval),
    'affected_users', (select count(distinct user_id) from client_errors
        where user_id is not null and created_at >= now() - (p_days || ' days')::interval),
    'top', (select coalesce(jsonb_agg(jsonb_build_object('message', m, 'count', c, 'last', last_at) order by c desc), '[]'::jsonb)
        from (select message m, count(*) c, max(created_at) last_at
              from client_errors where created_at >= now() - (p_days || ' days')::interval
              group by message order by count(*) desc limit 10) z)
  ) into r;
  return r;
end $$;

create or replace function public.admin_errors(p_limit int default 100)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'created_at', e.created_at, 'message', e.message, 'source', e.source,
    'page', e.context->>'page', 'version', e.context->>'version',
    'email', u.email) order by e.created_at desc), '[]'::jsonb) into r
  from (select * from client_errors order by created_at desc limit p_limit) e
  left join auth.users u on u.id = e.user_id;
  return r;
end $$;

-- ── storage & capacity — database size, per-table breakdown, file storage ──
-- Plan limits are baked in so the admin UI can show "used of available".
-- FREE PLAN: 500 MB database, 1 GB file storage. If the Supabase plan
-- changes, update database_limit_bytes / storage_limit_bytes below.
create or replace function public.admin_storage()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  storage_by_bucket jsonb := '[]'::jsonb;
  storage_total bigint := 0;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;

  -- file storage lives in the storage schema; guard it so a permissions hiccup
  -- there never blocks the database numbers below
  begin
    select coalesce(jsonb_agg(to_jsonb(s) order by s.bytes desc), '[]'::jsonb),
           coalesce(sum(s.bytes), 0)
      into storage_by_bucket, storage_total
    from (
      select o.bucket_id as bucket,
             count(*)::bigint as files,
             coalesce(sum((o.metadata->>'size')::bigint), 0) as bytes
      from storage.objects o
      group by o.bucket_id
    ) s;
  exception when others then
    storage_by_bucket := '[]'::jsonb;
    storage_total := 0;
  end;

  select jsonb_build_object(
    'generated_at',         now(),
    'database_bytes',       pg_database_size(current_database()),
    'database_limit_bytes', 524288000,       -- Free plan: 500 MB
    'storage_total_bytes',  storage_total,
    'storage_limit_bytes',  1073741824,      -- Free plan: 1 GB
    'storage',              storage_by_bucket,
    'tables', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.total_bytes desc), '[]'::jsonb)
      from (
        select c.relname as name,
               pg_total_relation_size(c.oid) as total_bytes,
               nullif(c.reltuples, -1)::bigint as row_estimate
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by pg_total_relation_size(c.oid) desc
        limit 20
      ) t
    )
  ) into r;

  return r;
end $$;

-- ── activation — the first week: funnel, time-to-first-create, cohorts ──────
-- "created / meaningful action" = a non-passive analytics event (see
-- admin_is_meaningful). Timestamps come from analytics_events (append-only),
-- since user_data is upserted and its updated_at moves with every edit.
create or replace function public.admin_activation()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  with u as (
    select usr.id,
           usr.created_at as signed_up_at,
           (select min(ae.created_at) from analytics_events ae
              where ae.user_id = usr.id and admin_is_meaningful(ae.event_name)) as first_action_at
    from auth.users usr
  )
  select jsonb_build_object(
    'generated_at', now(),
    'funnel', jsonb_build_array(
      jsonb_build_object('step','signed_up',   'label','Signed up',
        'count', (select count(*) from auth.users where banned_until is null or banned_until <= now())),
      jsonb_build_object('step','confirmed',   'label','Confirmed email',
        'count', (select count(*) from auth.users where email_confirmed_at is not null and (banned_until is null or banned_until <= now()))),
      jsonb_build_object('step','signed_in',   'label','Signed in',
        'count', (select count(*) from auth.users where last_sign_in_at is not null and (banned_until is null or banned_until <= now()))),
      jsonb_build_object('step','opened_tool', 'label','Opened a tool',
        'count', (select count(distinct user_id) from analytics_events where event_name = 'tool_opened')),
      jsonb_build_object('step','created',     'label','Created something',
        'count', (select count(distinct user_id) from analytics_events where admin_is_meaningful(event_name))),
      jsonb_build_object('step','returned',    'label','Came back (day 2+)',
        'count', (select count(distinct ae.user_id) from analytics_events ae join u on u.id = ae.user_id
                    where admin_is_meaningful(ae.event_name) and ae.created_at::date > u.signed_up_at::date))
    ),
    'creators',               (select count(*) from u where first_action_at is not null),
    'median_hours_to_create', (select round((percentile_cont(0.5) within group (
                                 order by extract(epoch from (first_action_at - signed_up_at)) / 3600.0))::numeric, 1)
                               from u where first_action_at is not null),
    'unconfirmed_count',      (select count(*) from auth.users where email_confirmed_at is null),
    'cohorts', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.cohort_week desc), '[]'::jsonb) from (
        select date_trunc('week', signed_up_at)::date as cohort_week,
               count(*)::int as signups,
               count(*) filter (where first_action_at is not null
                                  and first_action_at <= signed_up_at + interval '7 days')::int as activated,
               round(100.0 * count(*) filter (where first_action_at is not null
                                  and first_action_at <= signed_up_at + interval '7 days')
                     / nullif(count(*), 0))::int as pct
        from u
        group by date_trunc('week', signed_up_at)::date
        order by cohort_week desc
        limit 12
      ) c
    ),
    -- where activated teachers came from: signups by acquisition channel (from
    -- the user_signed_up event's captured source), with how many activated in
    -- week one. Pre-tracking signups have no source and read as 'unknown'.
    'acquisition', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.signups desc), '[]'::jsonb) from (
        select coalesce(a.channel, 'unknown') as channel,
               count(*)::int as signups,
               count(*) filter (where uu.first_action_at is not null
                                 and uu.first_action_at <= uu.signed_up_at + interval '7 days')::int as activated
        from u uu
        left join (
          select distinct on (user_id) user_id, metadata->>'channel' as channel
          from analytics_events where event_name = 'user_signed_up'
          order by user_id, created_at asc
        ) a on a.user_id = uu.id
        group by coalesce(a.channel, 'unknown')
      ) x
    )
  ) into r;
  return r;
end $$;

-- teachers who signed up but never confirmed their email — they can't sign in.
-- The confirmation dead-end made visible so they can be helped before churning.
create or replace function public.admin_unconfirmed(p_limit int default 100, p_offset int default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select jsonb_build_object(
    'total', (select count(*) from auth.users where email_confirmed_at is null),
    'rows', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
        select usr.id, usr.email, usr.created_at,
               round(extract(epoch from (now() - usr.created_at)) / 3600.0)::int as hours_waiting
        from auth.users usr
        where usr.email_confirmed_at is null
        order by usr.created_at desc
        limit p_limit offset p_offset
      ) x
    )
  ) into r;
  return r;
end $$;

-- ── engagement depth — stickiness, tool-usage rate, action distribution, ─────
-- and per-tool reach + return. "Return" = used a tool on 2+ distinct days.
create or replace function public.admin_engagement()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; v_members bigint; v_wau bigint;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select count(*) into v_members from auth.users where banned_until is null or banned_until <= now();
  select count(distinct user_id) into v_wau from analytics_events where created_at >= now() - interval '7 days';

  with tu as (
    select tool, user_id, count(distinct created_at::date) as days
    from analytics_events
    where tool is not null
    group by tool, user_id
  ),
  mact as (
    select u.id, coalesce(m.cnt, 0) as cnt
    from auth.users u
    left join (
      select user_id, count(*) as cnt from analytics_events
      where admin_is_meaningful(event_name) group by user_id
    ) m on m.user_id = u.id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'members', v_members,
    'dau', (select count(distinct user_id) from analytics_events where created_at >= now() - interval '1 day'),
    'dau_prev', (select count(distinct user_id) from analytics_events where created_at >= now() - interval '2 days' and created_at < now() - interval '1 day'),
    'wau', v_wau,
    'wau_prev', (select count(distinct user_id) from analytics_events where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'),
    'mau', (select count(distinct user_id) from analytics_events where created_at >= now() - interval '30 days'),
    'mau_prev', (select count(distinct user_id) from analytics_events where created_at >= now() - interval '60 days' and created_at < now() - interval '30 days'),
    'tool_users_7d', (select count(distinct user_id) from analytics_events
                        where tool is not null and created_at >= now() - interval '7 days'),
    'tool_users_7d_prev', (select count(distinct user_id) from analytics_events
                        where tool is not null and created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'),
    -- total shared-class views (non-owner opens; refreshes count) with a prior-week delta
    'shared_class_views_7d', (select count(*) from analytics_events
                        where event_name = 'public_item_viewed' and created_at >= now() - interval '7 days'),
    'shared_class_views_7d_prev', (select count(*) from analytics_events
                        where event_name = 'public_item_viewed' and created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'),
    'distribution', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.ord), '[]'::jsonb) from (
        select b.ord, b.label, count(*)::int as users from (
          select case when cnt = 0 then 0 when cnt between 1 and 4 then 1
                      when cnt between 5 and 19 then 2 when cnt between 20 and 49 then 3
                      else 4 end as ord,
                 case when cnt = 0 then 'None yet' when cnt between 1 and 4 then '1–4'
                      when cnt between 5 and 19 then '5–19' when cnt between 20 and 49 then '20–49'
                      else '50+' end as label
          from mact
        ) b
        group by b.ord, b.label
      ) d
    ),
    'tools', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.users desc), '[]'::jsonb) from (
        select tool, count(*)::int as users, count(*) filter (where days >= 2)::int as returned
        from tu group by tool
      ) t
    )
  ) into r;
  return r;
end $$;

-- ── device mix — reach (sessions by device) + depth (events per session),
-- and which device each tool leans on. Device is best-effort from the UA and
-- only present from when tracking shipped, so older rows read as 'unknown'.
create or replace function public.admin_devices(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; cutoff timestamptz := now() - (p_days || ' days')::interval; started timestamptz;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;

  -- device tracking began at the first event that carried a device; everything
  -- before it is pre-tracking noise that would pile up as 'unknown'. Clamp the
  -- window to that start so past unknowns drop out, while a genuine post-launch
  -- unknown (should one ever occur) still counts going forward.
  select min(created_at) into started from analytics_events where metadata->>'device' is not null;
  if started is not null and started > cutoff then cutoff := started; end if;

  with ev as (
    select coalesce(nullif(metadata->>'device', ''), 'unknown') as device, session_id, tool
    from analytics_events
    where created_at >= cutoff and session_id is not null
  ),
  per_device as (
    select device, count(distinct session_id) as sessions, count(*) as events
    from ev group by device
  ),
  tot as (select nullif(sum(sessions), 0) as s from per_device)
  select jsonb_build_object(
    'generated_at', now(),
    'days', p_days,
    'reach', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'device', device,
        'sessions', sessions,
        'events', events,
        'share', round(100.0 * sessions / (select s from tot), 1),
        'per_session', round(events::numeric / nullif(sessions, 0), 1)
      ) order by sessions desc), '[]'::jsonb)
      from per_device
    ),
    'by_tool', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.total desc), '[]'::jsonb) from (
        select tool,
          count(distinct session_id) filter (where device = 'mobile')  as mobile,
          count(distinct session_id) filter (where device = 'tablet')  as tablet,
          count(distinct session_id) filter (where device = 'desktop') as desktop,
          count(distinct session_id) as total
        from ev where tool is not null
        group by tool
      ) t
    )
  ) into r;
  return r;
end $$;

-- ── friction — where sessions/creations stall. All derived from existing
-- events: session boundaries (session_id + timestamps), abandonment
-- (creation_started without a same-session item_created), and empty-state
-- exits (tool_opened with no engaged follow-on for that tool in the session).
create or replace function public.admin_friction(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; cutoff timestamptz := now() - (p_days || ' days')::interval;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;

  with ev as (
    select session_id, event_name, tool, resource_type, created_at,
           admin_is_meaningful(event_name) as meaningful
    from analytics_events
    where created_at >= cutoff and session_id is not null
  ),
  sess as (
    select session_id,
           extract(epoch from (max(created_at) - min(created_at))) / 60.0 as mins,
           count(*) filter (where meaningful) as meaningful_events,
           count(*) filter (where event_name = 'creation_started') as starts
    from ev group by session_id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'days', p_days,
    'sessions', jsonb_build_object(
      'total', (select count(*) from sess),
      'bounce', (select count(*) from sess where meaningful_events = 0 and starts = 0),
      'bounce_pct', (select round(100.0 * count(*) filter (where meaningful_events = 0 and starts = 0)
                                  / nullif(count(*), 0), 1) from sess),
      'median_minutes', (select round(percentile_cont(0.5) within group (order by mins)::numeric, 1)
                         from sess where meaningful_events > 0 or starts > 0)
    ),
    'abandonment', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.starts desc), '[]'::jsonb) from (
        select s.surface,
               count(*)::int as starts,
               count(*) filter (where c.session_id is not null)::int as completed
        from (select distinct session_id, resource_type as surface from ev where event_name = 'creation_started' and resource_type is not null) s
        left join (select distinct session_id, resource_type as surface from ev where event_name = 'item_created' and resource_type is not null) c
          on c.session_id = s.session_id and c.surface = s.surface
        group by s.surface
      ) x
    ),
    'empty_states', (
      select coalesce(jsonb_agg(to_jsonb(y) order by y.opens desc), '[]'::jsonb) from (
        select o.tool,
               count(*)::int as opens,
               count(*) filter (where e.session_id is null)::int as dead
        from (select distinct session_id, tool from ev where event_name = 'tool_opened' and tool is not null) o
        left join (select distinct session_id, tool from ev where tool is not null and (meaningful or event_name = 'creation_started')) e
          on e.session_id = o.session_id and e.tool = o.tool
        group by o.tool
      ) y
    )
  ) into r;
  return r;
end $$;

-- ── creation output — what teachers build: over-time, library, class depth ──
-- C1 (weekly + by-type) reads creation EVENTS (item_created/item_saved); C2
-- (library) reads the persisted truth in user_data; C3 (class depth) parses
-- the class payload's blockCount. Content collections are whitelisted below.
create or replace function public.admin_creation(p_days int default 90)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  with content(coll, label) as (values
    ('flowschool_classes','Classes'), ('flowschool_flows','Flows'),
    ('flowschool_stories','Stories'), ('flowschool_playlists','Playlists'),
    ('flowschool_arules','Arbitrary Rules')
  ),
  cls as (
    select c from user_data d, jsonb_array_elements(d.payload) c
    where d.collection = 'flowschool_classes' and jsonb_typeof(d.payload) = 'array'
  )
  select jsonb_build_object(
    'generated_at', now(),
    'creators', (select count(distinct d.user_id) from user_data d
                   where d.collection in (select coll from content) and jsonb_arr_len(d.payload) > 0),
    'by_type', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.created desc), '[]'::jsonb) from (
        select coalesce(resource_type, 'other') as type, count(*)::int as created
        from analytics_events
        where event_name in ('item_created','item_saved') and created_at >= now() - (p_days || ' days')::interval
        group by coalesce(resource_type, 'other')
      ) t
    ),
    'library', (
      select coalesce(jsonb_agg(to_jsonb(l) order by l.items desc), '[]'::jsonb) from (
        select content.label as label,
               coalesce(sum(jsonb_arr_len(d.payload)), 0)::int as items,
               count(distinct d.user_id) filter (where jsonb_arr_len(d.payload) > 0)::int as teachers,
               round(coalesce(sum(jsonb_arr_len(d.payload)), 0)::numeric
                     / nullif(count(distinct d.user_id) filter (where jsonb_arr_len(d.payload) > 0), 0), 1) as avg_each
        from content
        left join user_data d on d.collection = content.coll
        group by content.label
      ) l
    ),
    'class_depth', jsonb_build_object(
      'total',       (select count(*) from cls),
      'avg_blocks',  (select round(avg(nullif(c->>'blockCount','')::numeric), 1) from cls),
      'avg_length',  (select round(avg(nullif(regexp_replace(c->>'length','[^0-9]','','g'),'')::numeric), 0)
                        from cls where nullif(regexp_replace(c->>'length','[^0-9]','','g'),'') is not null),
      'substantial', (select count(*) from cls where coalesce(nullif(c->>'blockCount','')::int, 0) >= 3),
      'stubs',       (select count(*) from cls where coalesce(nullif(c->>'blockCount','')::int, 0) < 3)
    )
  ) into r;
  return r;
end $$;

-- ── retention grid — weekly signup cohorts × weeks-since (the triangle) ─────
-- Unlike admin_retention (current-30d snapshot), this reads per-week activity
-- from analytics_events, so it's a real week-by-week retention curve per cohort.
create or replace function public.admin_retention_grid()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  with u as (
    select id, date_trunc('week', created_at) as cohort_week from auth.users
  ),
  sizes as (
    select cohort_week, count(*)::int as size from u group by cohort_week
  ),
  cellagg as (
    select u.cohort_week,
           floor(extract(epoch from (date_trunc('week', ae.created_at) - u.cohort_week)) / 604800)::int as k,
           count(distinct ae.user_id)::int as active
    from analytics_events ae
    join u on u.id = ae.user_id
    where admin_is_meaningful(ae.event_name)
    group by u.cohort_week,
             floor(extract(epoch from (date_trunc('week', ae.created_at) - u.cohort_week)) / 604800)::int
  )
  select jsonb_build_object(
    'generated_at', now(),
    'cohorts', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.cohort_week desc), '[]'::jsonb) from (
        select s.cohort_week, s.size,
               floor(extract(epoch from (date_trunc('week', now()) - s.cohort_week)) / 604800)::int as weeks_elapsed,
               (select coalesce(jsonb_agg(jsonb_build_object(
                         'k', ca.k, 'active', ca.active,
                         'pct', round(100.0 * ca.active / nullif(s.size, 0))::int) order by ca.k), '[]'::jsonb)
                from cellagg ca where ca.cohort_week = s.cohort_week and ca.k between 0 and 8) as cells
        from sizes s
        order by s.cohort_week desc
        limit 10
      ) c
    )
  ) into r;
  return r;
end $$;

-- ── churn signals — at-risk (went quiet) and resurrected (came back) ────────
create or replace function public.admin_churn()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  with act as (
    select u.id, u.email,
      greatest(u.last_sign_in_at,
        (select max(ae.created_at) from analytics_events ae where ae.user_id = u.id and admin_is_meaningful(ae.event_name))
      ) as last_seen,
      (select count(*) from analytics_events ae where ae.user_id = u.id and admin_is_meaningful(ae.event_name)) as actions
    from auth.users u
  ),
  ev as (
    select user_id, created_at,
           lag(created_at) over (partition by user_id order by created_at) as prev
    from analytics_events where admin_is_meaningful(event_name)
  ),
  gaps as (
    select user_id, created_at as return_at, created_at - prev as gap
    from ev where prev is not null and created_at - prev >= interval '21 days'
  ),
  resurrected as (
    select g.user_id, max(g.return_at) as returned_at,
           max(extract(epoch from g.gap) / 86400)::int as gap_days
    from gaps g where g.return_at >= now() - interval '30 days'
    group by g.user_id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'at_risk_count', (select count(*) from act
                        where actions >= 3 and last_seen < now() - interval '14 days'
                          and last_seen >= now() - interval '90 days'),
    'at_risk', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.last_seen desc), '[]'::jsonb) from (
        select id, email, last_seen, actions,
               round(extract(epoch from (now() - last_seen)) / 86400)::int as days_quiet
        from act
        where actions >= 3 and last_seen < now() - interval '14 days'
          and last_seen >= now() - interval '90 days'
        order by last_seen desc
        limit 100
      ) x
    ),
    'resurrected_count', (select count(*) from resurrected),
    'resurrected', (
      select coalesce(jsonb_agg(to_jsonb(y) order by y.returned_at desc), '[]'::jsonb) from (
        select r.user_id as id, u.email, r.returned_at, r.gap_days
        from resurrected r join auth.users u on u.id = r.user_id
        order by r.returned_at desc
        limit 50
      ) y
    )
  ) into r;
  return r;
end $$;

-- grants: callable by signed-in users, but every function refuses non-admins
do $$ declare fn text;
begin
  for fn in
    select 'public.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'admin\_%'
  loop
    execute 'revoke all on function '||fn||' from public, anon';
    execute 'grant execute on function '||fn||' to authenticated';
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verify (as a normal user, these must fail):
--   select public.admin_overview();          -- ERROR: not authorized
--   select * from public.analytics_events;   -- 0 rows (RLS)
--   select * from public.admin_users;        -- 0 rows (RLS)
-- As an admin, admin_overview() returns the snapshot.
-- ═══════════════════════════════════════════════════════════════════════════
