# Flow School — Admin Analytics Dashboard: Implementation Plan

Status: **Phase 1 (audit + plan) complete.** Author: engineering. Audience: Mackenzie + (later) Bonnie.

This plan is written against the **actual** Flow School architecture as audited on 2026‑07‑24, not a generic template. Read it before touching the admin feature.

---

## 1. Existing relevant architecture

- **Static HTML + vanilla JS.** No build step, no framework. Every page is a file at repo root; shared logic in `/lib/*.js`; one global stylesheet `global.css`. Deployed on **Vercel** with `cleanUrls: true` (so `admin.html` will serve at `/admin` with no config).
- **Supabase** backend, project `zizuopmcpzicbwngjagp`. Client key is the publishable/anon key in `lib/supabase.js` (`db` is a lexical `const` global). Auth token in `localStorage['sb-zizuopmcpzicbwngjagp-auth-token']`.
- **Site lock.** `lib/sync.js`, included on every signed‑in page, redirects to `/login` before paint if there is no valid session. `login.html`/`signup.html` do not include it.
- **Server side already exists.** `/api/*.js` are Vercel Node serverless functions using `@supabase/supabase-js` with the **service‑role key** (`SUPABASE_SERVICE_ROLE_KEY`, injected by the Vercel↔Supabase integration, never shipped to the browser). Existing functions: `api/delete-account.js` (self‑delete, verifies the caller's token, cascades) and `api/feedback.js` (writes `feedback`, emails via Resend). **These are the template for all admin server operations.**
- **Data model — the load‑bearing fact.** Nearly all user content lives in one table, **`user_data(user_id, collection, payload jsonb, updated_at)`**, unique on `(user_id, collection)`. `collection` is a localStorage key; `payload` is the *entire* JSON array/object for that library. Items are elements inside jsonb arrays, **not rows**. The write path is a mirror over `localStorage.setItem` in `sync.js` (debounced 800 ms, flushed on `pagehide`).
- **The 10 synced collections** (`sync.js:29`): `flowschool_classes`, `flowschool_flows`, `flowschool_stories`, `flowschool_playlists`, `flowschool_shorthand`, `flowschool_arules`, `flowschool_favs`, `fs-pose-connector-saved`, `fs-cue-flows`, `flowschool_lognotes`.
- **The one relational content path** is public class sharing (`lib/publish.js`): `public_classes` (the whitelisted projection), `class_saves` (reader bookmarks — references, not copies), and the `community_classes` DEFINER view (adds author name/handle). Defined in `supabase/community-classes.sql`.
- **Other known tables** (referenced across lib/api): `profiles`, `handles`, `schedules`, `follows`, `blocks`, `reports`, `feedback`, `client_errors`, plus views `circle_directory`, `circle_schedules`. Only `community-classes.sql` is tracked in the repo; the rest were created in the Supabase dashboard.
- **Design system.** Tokens in `global.css :root` (colors `--ink-solid/--paper-solid/--text-1/2/3/--accent/--danger`, radius `--r/--rb/--rs`, type `--fs-h4..h6`, fonts `--font/--font-mono`, shadows `--crest/--shadow-float`). Sidebar nav is **injected** by `lib/nav.js` from a `NAV` array + `PAGE_IDS` map. Icons are owned Lucide SVGs injected by `lib/icons.js` (`.material-symbols-sharp` text → svg; new glyphs must be added to its registry). Modals = toggle `hidden` on `.modal-backdrop`. Toast = `window.toast()`. Theme = `data-theme` on `<html>`, default dark, `fs-theme` in localStorage. **No table component and no role concept exist** — both are introduced here.

## 2. Existing data we can use immediately (no new tracking required)

A large amount of the dashboard can be built from data that already exists, including **historical** data:

| Metric | Source (already exists) |
|---|---|
| Total registered users, signups over time, account age | `auth.users.created_at` |
| Last sign‑in | `auth.users.last_sign_in_at` |
| Email verified / not | `auth.users.email_confirmed_at` |
| Deactivated/banned status | `auth.users.banned_until` |
| Profile: name, handle, circle opt‑in, teaching info | `profiles`, `handles` |
| Per‑user library counts (classes, flows, cues, stories, playlists, rules, pose chains) | `jsonb_array_length` of each `user_data` row |
| "Last touched content" (works historically) | `max(user_data.updated_at)` per user |
| **Movement Experiment saves — count and *which*** | aggregate `flowschool_favs` payloads across all users (`elem->>'id'` = experiment 1–28); each fav carries `savedAt`, so **save‑over‑time works historically too** |
| Public classes, their creators, publish/update dates, visibility | `public_classes` |
| **Public class saves — total, unique savers, over time, who** | `class_saves` (row per save, has `created_at`) |
| Inactive‑after‑signup users | users whose every `user_data` payload is empty AND no events |

## 3. Missing data that must be tracked going forward

Because content writes are jsonb blob upserts, **there is no event history of actions**. We cannot reconstruct: tool opens over time, generate counts, print/export counts, publish events, create‑vs‑edit distinction, sessions, or historical daily‑active‑users. These require a **new event system, collecting forward from launch**. The dashboard will clearly label any such metric as "since tracking began (<launch date>)."

## 4. Proposed database changes (migration: `supabase/admin-analytics.sql`)

All new objects are additive. **No existing user‑facing RLS is weakened.** New tables get RLS that denies normal users.

**Tables**
- `admin_users(user_id uuid pk → auth.users on delete cascade, email text, note text, added_by uuid, added_at timestamptz default now())` — the allowlist, keyed to the auth user.
- `analytics_events(id bigint identity pk, user_id uuid → auth.users on delete set null, session_id text, event_name text, event_category text, tool text, resource_type text, resource_id text, metadata jsonb default '{}', created_at timestamptz default now())` — `on delete set null` = **deleting a user anonymizes their events, retaining aggregate history**. Immutable (no update/delete policy for anyone).
- `admin_audit_log(id bigint identity pk, actor_id uuid, actor_email text, action text, target_user_id uuid, target_email text, metadata jsonb default '{}', created_at timestamptz default now())` — written only by server/definer code.

**Function**
- `is_admin(uid uuid default auth.uid()) returns boolean` — `security definer`, `stable`, `set search_path = public`, body `select exists(select 1 from admin_users where user_id = uid)`. The single source of truth for authorization, usable in RLS and RPCs.
- `jsonb_arr_len(p jsonb) returns int` — safe length (0 if not an array), for aggregating blobs.

**Indexes**: `analytics_events(created_at)`, `(user_id, created_at)`, `(event_name, created_at)`, `(tool, created_at)`, `(resource_type, resource_id)`; `class_saves(public_class_id)`, `class_saves(created_at)`; `admin_audit_log(created_at)`.

**Admin read RPCs** — all `security definer`, and **every one begins with `if not is_admin() then raise exception 'not authorized'`**. They return only whitelisted aggregate/identity fields — **never private note text, story bodies, or class notes**. This keeps all heavy aggregation in Postgres (no downloading tables to the browser, no N+1):
- `admin_overview(range)` → headline metrics JSON.
- `admin_list_users(search, status, sort, lim, off)` → user rows + joined counts.
- `admin_user_detail(uid)` → one user, full non‑sensitive detail.
- `admin_tool_analytics(range)` → per‑tool event + current‑state counts.
- `admin_experiment_saves()` → per‑experiment save count + unique savers (the Movement Experiments requirement).
- `admin_public_content(sort, range)` and `admin_public_content_detail(id)` → public classes + save engagement + savers.
- `admin_saved_content(range, type)` → save summaries and records.
- `admin_activity(range)` and time‑series helpers (`admin_signups_series`, `admin_saves_series`, `admin_active_series`).

**RLS policies**
- `analytics_events`: INSERT to `authenticated` **with check `user_id = auth.uid()`** (users log only their own); SELECT only where `is_admin()`; no UPDATE/DELETE.
- `admin_users`, `admin_audit_log`: SELECT only where `is_admin()`; no client INSERT/UPDATE/DELETE (managed by server/definer only).

## 5. Proposed analytics event structure

`fsTrack(eventName, { category, tool, resourceType, resourceId, metadata })` in a new `lib/analytics.js`, inserting into `analytics_events` with a `session_id` from `sessionStorage`. **Naming convention**: `snake_case`, `<noun>_<verb>` past tense. Canonical events:

`tool_opened`, `item_created`, `item_updated`, `item_deleted`, `item_saved`, `item_unsaved`, `item_printed`, `item_generated`, `item_exported`, `item_published`, `item_unpublished`, `public_item_saved`, `public_item_unsaved`, `user_signed_in`. `tool` names come from `tracker.js`'s META map (Movement Experiments, Arbitrary Rules, Playlist Builder, Pose Popcorn, Your Cues, Your Flows, Your Classes, Your Stories, Breath Pace, Teaching Notes). `resourceType` ∈ {class, flow, cue_sheet, story, playlist, arbitrary_rule, pose_chain, experiment, teaching_note, public_class}.

**Rules (privacy + integrity):** metadata carries **IDs and safe summary fields only** — never note text, story bodies, cue wording, or class contents. `tool_opened` fires once per page load (deduped in `sessionStorage`). Idempotent events are deduped client‑side within the session to survive re‑fires. Events are immutable. `session_id` is per‑tab (created in `sessionStorage`); "sessions" is documented as approximate. Wire order and call sites are the audited action‑point map (§ tool analytics below).

## 6. Admin authorization approach

- **Source of truth:** the `admin_users` table + `is_admin()`. Enforced in **RLS** (normal users' client reads return nothing) and re‑checked at the top of **every admin RPC** and **every `api/admin/*` serverless function** (which verifies the caller's token with the service role, then checks `admin_users`).
- **Configuring admins:** a documented, git‑ignored seed step, `supabase/seed-admins.sql`, that inserts by email lookup against `auth.users` using placeholders `BONNIE_ADMIN_EMAIL` / `MACKENZIE_ADMIN_EMAIL`. Mackenzie substitutes the real emails and runs it in the SQL editor. **The allowlist is never in client code**, and no fake emails are committed.
- **Nav link** appears only when a cheap `is_admin()` RPC returns true — but that's UX only; the link's visibility is never the security boundary. A normal user hitting `/admin` directly loads the shell, every data call is refused server‑side, and they see a permission‑denied state.
- Adding/removing an admin later = one INSERT/DELETE in `admin_users` (or the serverless `admin role add/remove`, which also writes the audit log). No code change.

## 7. Pages and components to create

- `admin.html` — single page, own sub‑nav (Overview · Users · Tool Analytics · Movement Experiments · Public Content · Saved Content · Activity · Exports), hash‑routed sections. Uses existing tokens/components; a page‑scoped `.admin-table` built in the Flow School grammar (mono column heads, hairline rows, `--crest` surfaces). Loading/empty/error/permission‑denied/no‑results/export states on every section.
- `lib/analytics.js` — `fsTrack`, session id, dedupe, `user_signed_in` on login.
- `lib/admin.js` — admin client helpers (RPC wrappers, CSV export + injection sanitization, formatting, the gate check).
- `api/admin/users.js`, `api/admin/user-action.js` (deactivate/reactivate/delete/add‑admin/remove‑admin) — serverless, admin‑verified, service‑role, audit‑logged.
- Nav change: conditional `NAV.push({id:'admin', …, bottom:true})` + `PAGE_IDS['admin.html']='admin'` in `lib/nav.js`, gated by the `is_admin()` check.
- New icons if needed added to `lib/icons.js` registry (e.g. `download`, `groups`, `view_list`, `visibility`, `space_dashboard` already exist).

## 8. Security considerations

- Service‑role key stays server‑only (serverless env). Never in the browser or repo.
- RLS denies normal users on all admin tables; admin RPCs double‑check `is_admin()`; serverless triple‑checks (token → user → admin_users).
- Definer RPCs return whitelisted fields; **private notes/story/class text never leave the DB** into analytics or admin views.
- CSV export sanitizes formula‑injection (`= + - @`, tab, CR prefixed with `'`).
- No admin authorization in localStorage/editable client metadata.
- Public‑content analytics read only already‑public projections + save references — they cannot surface private content.

## 9. User deactivation & deletion strategy

- **Deactivate/reactivate** (`api/admin/user-action.js`, service‑role): Supabase‑native ban via `auth.admin.updateUserById(uid, { ban_duration })` — banned users cannot obtain/refresh a token, so they're locked out **while all content and data are preserved**. Status shown from `auth.users.banned_until`. Reactivate clears it.
- **Permanent delete** (same function, `action: 'delete'`): requires the admin to type the target's **email** (verified server‑side), refuses **self‑deletion** and **deletion of the last remaining admin**, then `auth.admin.deleteUser(uid)`. Cascades: their `user_data`, `profiles`, and their `public_classes` (and, per the existing live‑reference model, other users' `class_saves` of those classes — consistent with today's unpublish/delete behavior). `analytics_events.user_id` → **NULL (anonymized, retained)**. Avatar storage cleared first (as in `delete-account.js`). Every action writes `admin_audit_log`.
- Never a client‑side profile delete.

## 10. Export strategy

- CSV generated **client‑side** from data already returned by the RPCs. "Export current view" respects active filters; "Export all" pulls the full RPC result. Injection‑sanitized, readable headers, ISO timestamps, an "Exported at" row, descriptive names `flow-school-<dataset>-YYYY-MM-DD.csv`. Datasets: users, user activity, tool usage, movement experiments, public content, public‑content saves, saved items, overview metrics, admin audit log.
- `.xlsx` multi‑sheet: **deferred** (documented). CSV opens cleanly in Excel and imports to Sheets; xlsx can be added later via a serverless generator without touching the UI.

## 11. Metric definitions (documented, shown in‑UI where helpful)

- **Meaningful action** = an `analytics_events` row whose event is a create/save/edit/publish/print/generate/export — **not** a page view and **not** `tool_opened` alone.
- **DAU / WAU / MAU** = distinct users with ≥1 meaningful action in the trailing 1 / 7 / 30 days (from `analytics_events`; forward‑only, labeled).
- **Last meaningful activity** = for historical validity, `greatest(last_sign_in_at, max(user_data.updated_at), max(analytics_events.created_at))`, with each source labeled.
- **Active user** = ≥1 meaningful action in the selected window. **Inactive user** = signed up but never produced content (all payloads empty) and no meaningful events.
- **Session** = a `session_id` (per tab load); count is approximate and labeled.
- **Authentication sign‑in ≠ product usage**: sign‑in is tracked separately (`user_signed_in` + `last_sign_in_at`); opening the site/tool is `tool_opened`; a meaningful action is the above. The UI never calls a bare page load "active usage."

## 12. Rollout steps

1. Run `supabase/admin-analytics.sql` (tables, `is_admin`, RLS, indexes, RPCs).
2. Run `supabase/seed-admins.sql` with real emails → Bonnie + Mackenzie become admins.
3. Deploy `lib/analytics.js` + wire the top action points → events start collecting.
4. Deploy `api/admin/*` + `admin.html` + nav gate.
5. Verify: normal user denied everywhere; admin sees data; exports open in Excel/Sheets; deactivate/delete safeguards; private notes never appear.
6. Backfill note: historical action metrics start empty and fill from step 3 onward; current‑state, signup, and public‑save history are available immediately.

## 13. Assumptions & unresolved limitations

- **Public flows do not exist** as a feature; "public content" = public **classes** only. The plan/UI reflect that (no fabricated public‑flow analytics).
- **Historical action‑over‑time analytics cannot be reconstructed** (tool opens, generates, prints, DAU history). They begin at launch and are labeled as such. Signups‑over‑time, public‑save‑over‑time, and experiment‑save‑over‑time **are** historical (timestamps already exist).
- Profile/schedules/etc. column lists are inferred from client queries (no tracked migration); the migration reads them defensively.
- `.xlsx` export deferred to CSV for v1.
- Sessions are approximate (client‑generated ids).
