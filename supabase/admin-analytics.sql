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
  metadata       jsonb not null default '{}'::jsonb,   -- IDs + safe summaries only, never private content
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
  select event_name not in ('tool_opened','user_signed_in','public_item_viewed');
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
    'total_users',   (select count(*) from auth.users),
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
        where not exists (select 1 from user_data d where d.user_id = u.id and jsonb_arr_len(d.payload) > 0)),
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
        from public_classes pc where pc.owner_id = p_uid),
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
    where p_search is null or p_search = ''
       or pc.title ilike '%'||p_search||'%'
       or coalesce(p.full_name, p.display_name, u.email) ilike '%'||p_search||'%';
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
    where p_search is null or p_search = ''
       or pc.title ilike '%'||p_search||'%'
       or coalesce(p.full_name, p.display_name, u.email) ilike '%'||p_search||'%'
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
