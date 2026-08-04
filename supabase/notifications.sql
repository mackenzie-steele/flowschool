-- ═══════════════════════════════════════════════════════════════════════════
-- FLOW SCHOOL — IN-APP NOTIFICATIONS  (v1)
-- Run once in the Supabase dashboard → SQL editor.
-- Depends on admin-analytics.sql (it uses is_admin()).
--
-- TWO TABLES, NOT ONE ROW PER USER PER NOTIFICATION
-- Publishing writes ONE row. Unread is the ABSENCE of a read receipt, not a
-- flag somebody has to set. With ~900 teachers, fanning out a row each at
-- publish time would mean 900 writes to say one thing, and every later
-- signup would silently miss it. Here a new teacher sees the backlog for
-- free, because they have no receipts yet.
--
-- THE COST OF THAT CHOICE, PAID HERE
-- "Unread" becomes a NOT EXISTS, which is only cheap with the right index —
-- hence the (user_id, notification_id) primary key on the receipts table.
-- unread_notification_count() does the join server-side so the client never
-- pulls the whole history just to render a number on a bell.
--
-- STATUS IS THE GATE, published_at IS THE CLOCK
-- They are deliberately separate columns. A draft has no published_at; an
-- archived notification keeps the one it had. That is what makes scheduled
-- publishing a later `where published_at <= now()` rather than a migration.
--
-- ARCHIVED MUST NOT COUNT AS UNREAD
-- Every read path filters status = 'published'. Archiving is the undo for
-- "we published something wrong" — it has to remove the badge, not just the
-- row in a list.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. the notifications themselves ────────────────────────────────────────
create table if not exists public.notifications (
  id                bigint generated always as identity primary key,
  title             text        not null,
  message           text        not null,
  -- TEXT, not an enum: "add a type later" must not be a migration. The check
  -- is a guardrail against typos, and widening it is one ALTER.
  notification_type text        not null default 'announcement'
                      check (notification_type in
                        ('announcement', 'new_class', 'new_feature', 'platform_update')),
  link_url          text,
  link_label        text,
  image_url         text,                    -- reserved; no uploader in v1
  status            text        not null default 'draft'
                      check (status in ('draft', 'published', 'archived')),
  created_by        uuid        references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  published_at      timestamptz,
  archived_at       timestamptz,

  -- a published notification without a timestamp would sort into the void
  constraint published_has_a_time
    check (status <> 'published' or published_at is not null),
  -- a link label with nothing to link to is a button that does nothing
  constraint label_needs_a_link
    check (link_label is null or link_url is not null),
  constraint title_not_blank   check (length(btrim(title))   between 1 and 120),
  constraint message_not_blank check (length(btrim(message)) between 1 and 2000)
);

-- the user-facing query: published, newest first
create index if not exists notifications_published_idx
  on public.notifications (published_at desc)
  where status = 'published';
-- the admin list: everything, newest first
create index if not exists notifications_created_idx
  on public.notifications (created_at desc);

-- ── 2. read receipts ───────────────────────────────────────────────────────
-- The composite PK is both the uniqueness constraint (a user cannot read the
-- same notification twice) and the index that makes the unread NOT EXISTS
-- fast. user_id leads because every query starts "for this user".
create table if not exists public.notification_reads (
  user_id         uuid        not null references auth.users(id)   on delete cascade,
  notification_id bigint      not null references public.notifications(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (user_id, notification_id)
);

-- reverse lookup: "who has read this one" (admin reach, later)
create index if not exists notification_reads_notification_idx
  on public.notification_reads (notification_id);

-- ── 3. updated_at, without trusting the client to send it ──────────────────
create or replace function public.touch_notification()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists notifications_touch on public.notifications;
create trigger notifications_touch before update on public.notifications
  for each row execute function public.touch_notification();


-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- The client is never trusted. Hiding the admin UI is a courtesy; these
-- policies are the actual enforcement.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.notifications      enable row level security;
alter table public.notification_reads enable row level security;

-- ── notifications ──
-- Everyone signed in reads PUBLISHED ones. Drafts and archived rows are
-- invisible: a teacher must not be able to read tomorrow's announcement by
-- querying the table directly.
drop policy if exists "authed read published" on public.notifications;
create policy "authed read published" on public.notifications
  for select to authenticated
  using (status = 'published');

-- Admins see everything, including drafts.
drop policy if exists "admins read all notifications" on public.notifications;
create policy "admins read all notifications" on public.notifications
  for select to authenticated
  using (public.is_admin());

-- Admins write. with_check on both sides of update so a row cannot be
-- edited INTO a state the policy would not have allowed creating.
drop policy if exists "admins write notifications" on public.notifications;
create policy "admins write notifications" on public.notifications
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── notification_reads ──
-- Yours and only yours, in both directions. The with_check is what stops a
-- teacher marking something read on somebody else's behalf.
drop policy if exists "own reads select" on public.notification_reads;
create policy "own reads select" on public.notification_reads
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own reads insert" on public.notification_reads;
create policy "own reads insert" on public.notification_reads
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own reads update" on public.notification_reads;
create policy "own reads update" on public.notification_reads
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own reads delete" on public.notification_reads;
create policy "own reads delete" on public.notification_reads
  for delete to authenticated using (user_id = auth.uid());

grant select                         on public.notifications      to authenticated;
grant insert, update, delete         on public.notifications      to authenticated;
grant select, insert, update, delete on public.notification_reads to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS
-- Each one exists because doing it from the client would be either slow or
-- forgeable.
-- ═══════════════════════════════════════════════════════════════════════════

-- The bell. One number, computed server-side — the alternative is shipping
-- every notification and every receipt to the browser to subtract them.
create or replace function public.unread_notification_count()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int
  from notifications n
  where n.status = 'published'
    and not exists (
      select 1 from notification_reads r
      where r.notification_id = n.id and r.user_id = auth.uid()
    );
$$;

-- The panel and the history page. Returns the notification plus whether THIS
-- user has read it, so the client renders in one pass.
create or replace function public.list_notifications(
  p_limit integer default 10, p_before timestamptz default null
) returns table (
  id bigint, title text, message text, notification_type text,
  link_url text, link_label text, image_url text,
  published_at timestamptz, is_read boolean
) language sql stable security definer set search_path = public as $$
  select n.id, n.title, n.message, n.notification_type,
         n.link_url, n.link_label, n.image_url, n.published_at,
         exists (select 1 from notification_reads r
                 where r.notification_id = n.id and r.user_id = auth.uid()) as is_read
  from notifications n
  where n.status = 'published'
    and (p_before is null or n.published_at < p_before)
  order by n.published_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

-- Idempotent by construction: the composite PK turns a double-click into a
-- no-op instead of an error. Read time is first-read time, deliberately —
-- re-reading something does not make it newer.
create or replace function public.mark_notification_read(p_id bigint)
returns void language sql security definer set search_path = public as $$
  insert into notification_reads (user_id, notification_id)
  select auth.uid(), p_id
  where exists (select 1 from notifications
                where id = p_id and status = 'published')
  on conflict (user_id, notification_id) do nothing;
$$;

-- One statement, so "mark all read" cannot half-succeed. Only published rows
-- get receipts — an archived notification is gone, not read.
create or replace function public.mark_all_notifications_read()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into notification_reads (user_id, notification_id)
  select auth.uid(), x.id from notifications x where x.status = 'published'
  on conflict (user_id, notification_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Publishing is a state machine, not a column assignment. Doing it in SQL is
-- what makes the double-click safe: the second call finds status already
-- 'published' and returns the same row rather than moving published_at and
-- re-notifying everyone.
create or replace function public.publish_notification(p_id bigint)
returns public.notifications
language plpgsql security definer set search_path = public as $$
declare row public.notifications;
begin
  if not is_admin() then raise exception 'admins only'; end if;

  select * into row from notifications where id = p_id;
  if not found then raise exception 'no such notification'; end if;
  if row.status = 'published' then return row; end if;   -- already done; not an error
  if length(btrim(row.title)) = 0 or length(btrim(row.message)) = 0 then
    raise exception 'a notification needs a title and a message';
  end if;

  update notifications
     set status = 'published',
         -- keep the ORIGINAL publish time if this is a republish from the
         -- archive, so it does not jump to the top of everyone's panel
         published_at = coalesce(published_at, now()),
         archived_at = null
   where id = p_id
  returning * into row;
  return row;
end $$;

create or replace function public.archive_notification(p_id bigint)
returns public.notifications
language plpgsql security definer set search_path = public as $$
declare row public.notifications;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  update notifications set status = 'archived', archived_at = now()
   where id = p_id returning * into row;
  if not found then raise exception 'no such notification'; end if;
  return row;
end $$;

revoke all on function public.unread_notification_count()      from public, anon;
revoke all on function public.list_notifications(integer, timestamptz) from public, anon;
revoke all on function public.mark_notification_read(bigint)   from public, anon;
revoke all on function public.mark_all_notifications_read()    from public, anon;
revoke all on function public.publish_notification(bigint)     from public, anon;
revoke all on function public.archive_notification(bigint)     from public, anon;

grant execute on function public.unread_notification_count()      to authenticated;
grant execute on function public.list_notifications(integer, timestamptz) to authenticated;
grant execute on function public.mark_notification_read(bigint)   to authenticated;
grant execute on function public.mark_all_notifications_read()    to authenticated;
grant execute on function public.publish_notification(bigint)     to authenticated;
grant execute on function public.archive_notification(bigint)     to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY  — run these; do not assume
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. policies exist
-- select tablename, policyname, cmd from pg_policies
-- where tablename in ('notifications','notification_reads') order by tablename, policyname;
--    expect: 3 on notifications, 4 on notification_reads

-- 2. a draft is invisible to a teacher. Signed in as a NON-admin:
--      select count(*) from notifications;
--    expect: only published ones. Then, as an admin, the same query returns more.

-- 3. the guard is real. As a non-admin:
--      select publish_notification(1);
--    expect: ERROR  admins only

-- 4. you cannot read on someone else's behalf. As any user:
--      insert into notification_reads (user_id, notification_id)
--      values ('00000000-0000-0000-0000-000000000000', 1);
--    expect: ERROR  new row violates row-level security policy

-- 5. double-publish is a no-op:
--      select published_at from publish_notification(1);
--      select published_at from publish_notification(1);
--    expect: the same timestamp twice

-- 6. archiving clears the badge:
--      select unread_notification_count();
--      select archive_notification(1);
--      select unread_notification_count();   -- one lower

-- ═══════════════════════════════════════════════════════════════════════════
-- TO UNDO
--   drop function if exists public.publish_notification(bigint);
--   drop function if exists public.archive_notification(bigint);
--   drop function if exists public.mark_all_notifications_read();
--   drop function if exists public.mark_notification_read(bigint);
--   drop function if exists public.list_notifications(integer, timestamptz);
--   drop function if exists public.unread_notification_count();
--   drop table if exists public.notification_reads;
--   drop table if exists public.notifications;
--   drop function if exists public.touch_notification();
-- ═══════════════════════════════════════════════════════════════════════════
