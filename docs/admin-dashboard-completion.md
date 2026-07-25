# Flow School — Admin Analytics Dashboard: Completion Report

Companion to `docs/admin-dashboard-plan.md` (audit + design rationale). This is what was built, how it's secured, what's tracked, and **exactly what you must do by hand to turn it on**.

---

## TL;DR — what to do to go live

1. **Run `supabase/admin-analytics.sql`** in the Supabase dashboard → SQL editor (creates tables, `is_admin()`, RLS, indexes, all admin RPCs).
2. **Edit `supabase/seed-admins.sql`** — replace `BONNIE_ADMIN_EMAIL` / `MACKENZIE_ADMIN_EMAIL` with the real emails you each sign in with — then run it. (Each admin must have signed up first.)
3. **Deploy** the repo to Vercel as usual. `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are already present (the delete-account / feedback functions use them).
4. Sign in as an admin → an **Admin** link appears in the sidebar → `/admin`.
5. Run the verification checklist in "Testing" below against the live database.

Until step 1 runs, the dashboard shows a friendly error (the RPCs don't exist yet); no user-facing page is affected.

---

## What was built

A private admin area at **`/admin`** (single page, hash-routed sections) plus the secure backend and event system behind it. It reads a large amount from data that **already exists** (so it's useful on day one) and layers a **forward-collecting** event log for usage-over-time.

### Routes added
- **`/admin`** (`admin.html`) — the dashboard. Sections: Overview · Users · Tool Analytics · Movement Experiments · Public Content · Saved Content · Activity · Exports.
- **`/api/admin/user-action`** (`api/admin/user-action.js`) — serverless, service-role, admin-verified: deactivate / reactivate / delete / add-admin / remove-admin.

### Files added
| File | Role |
|---|---|
| `supabase/admin-analytics.sql` | Tables, `is_admin()`, RLS, indexes, all admin read RPCs |
| `supabase/seed-admins.sql` | Grant admin by email (placeholders) |
| `admin.html` | The dashboard UI (page-scoped `.adm-*` styles, Flow School tokens) |
| `lib/admin.js` | Admin client: RPC wrappers, gate check, CSV export (sanitized) |
| `lib/analytics.js` | Product event tracker (`fsTrack`) + auto `item_saved`/`tool_opened` |
| `api/admin/user-action.js` | Privileged user-management (server-only) |
| `docs/admin-dashboard-plan.md`, `docs/admin-dashboard-completion.md` | Docs |

### Files edited
- `lib/nav.js` — `PAGE_IDS['admin.html']`, and `window.fsNavAddAdmin()` (adds the Admin link post-injection, admins only).
- `lib/sync.js` — after a confirmed session, a fire-and-forget `is_admin()` check calls `fsNavAddAdmin()`.
- `login.html` — records `user_signed_in` on successful sign-in.
- All 21 signed-in pages — added `<script src="lib/analytics.js"></script>` after `sync.js` so tracking collects.

---

## Database changes

New tables (all RLS-enabled, additive — **no existing table or policy was altered**):
- **`admin_users`** — the allowlist, keyed to `auth.users.id`. RLS: admins read; no client writes.
- **`analytics_events`** — the product event log. `user_id` is `ON DELETE SET NULL` (deleting a user **anonymizes** their events, keeping aggregate history). RLS: a user may INSERT only their own events (`user_id = auth.uid()`), admins may SELECT, nobody may UPDATE/DELETE (immutable).
- **`admin_audit_log`** — every admin action. RLS: admins read; written only server-side.

Functions: `is_admin(uid)` (SECURITY DEFINER gate), `jsonb_arr_len()`, `admin_content_type()`, `admin_is_meaningful()`, and the admin read RPCs (all SECURITY DEFINER, all begin with `if not is_admin() then raise`): `admin_overview`, `admin_list_users`, `admin_user_detail`, `admin_experiment_saves`, `admin_public_content`, `admin_public_content_savers`, `admin_top_tools`, `admin_series`, `admin_saved_content`, `admin_recent_activity`, `admin_audit`. Indexes on `analytics_events` and `class_saves` for the common admin queries.

## RLS & authorization approach

- **Single source of truth:** `admin_users` + `is_admin()`.
- **Three enforcement layers:** (1) RLS on `analytics_events`/`admin_users`/`admin_audit_log` denies normal users; (2) every admin RPC re-checks `is_admin()`; (3) every `/api/admin/*` call verifies the caller's token *and* their `admin_users` membership with the service role before doing anything.
- **The nav link is not the boundary.** A normal user who types `/admin` gets the shell, `is_admin()` returns false → permission-denied state, and every data call is refused server-side.
- **Adding/removing admins:** one row in `admin_users` (or the in-dashboard "Make admin / Remove admin", which also writes the audit log). No code change, no redeploy. The allowlist is **never** in client code.

## How to configure admin users (and env vars)

- Admins are the rows of `public.admin_users`. Seed with `supabase/seed-admins.sql` (replace the two placeholder emails), or use the dashboard's Make-admin control on a user.
- **Env vars** (already configured for the existing functions): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. The client uses the publishable key in `lib/supabase.js`. No new secrets are required.

## Events now being tracked (forward-collecting)

`fsTrack(name, { category, tool, resourceType, resourceId, metadata })` → `analytics_events`. Currently wired:
- **`tool_opened`** — once per load on the 12 known tool pages (auto).
- **`item_saved`** — automatically on any write to a synced library (`analytics.js` wraps `localStorage.setItem`), keyed to content type (class/flow/cue_sheet/story/playlist/arbitrary_rule/pose_chain/experiment/teaching_note/shorthand). Captures save *volume* per collection; can't distinguish create vs edit.
- **`user_signed_in`** — on login.

**Privacy:** metadata is scrubbed to scalars + strings ≤80 chars; objects/arrays are dropped. Note text, story/class bodies, and cue wording are **never** sent. `resource_id` is an id, not content.

**Naming convention:** `snake_case`, `<noun>_<verb>` past tense. Category is derived centrally, not passed at call sites.

### How to add tracking to a tool (for finer events)
Call `fsTrack` at the real action site, e.g.:
```js
fsTrack('item_generated', { tool: 'Arbitrary Rules' });                 // a generate
fsTrack('item_printed',   { resourceType: 'class', resourceId: id });   // a print
fsTrack('item_published', { resourceType: 'public_class', resourceId: sourceId }); // intentional share
```
Audited call sites (from the plan) for finer events, not yet wired to avoid noise: intentional **publish** (`class-editor.js` `share-confirm` handler — *not* `publish.js`, which re-publishes on every reconcile), **generate** (each tool's generate button), **print** (`window.print()` sites), **public_item_saved/unsaved** (`publish.js` save/unsave). Add these incrementally; the dashboard already renders them when present.

## Metrics available

- **From existing data (complete, historical):** total users, signups over time, new-in-7/30d, last sign-in, per-user library counts, "never used" (signed up, no content), public classes, **public-class saves — count, unique savers, over time, and who** (from `class_saves`), and **Movement Experiment saves — how many and which experiment, over time** (from `flowschool_favs`; each save carries `savedAt`).
- **From events (forward-only, labeled "since tracking began"):** DAU/WAU/MAU, tool opens/actions, recent activity feed.

**Metric definitions** (also shown in-UI): *meaningful action* = a create/save/edit/publish/print/generate event (not a page view or a bare tool open or sign-in). *DAU/WAU/MAU* = distinct users with ≥1 meaningful action in the trailing 1/7/30 days. *Last activity* = `greatest(last_sign_in_at, max(user_data.updated_at), max(meaningful event))` so it's valid historically. *Inactive* = signed up but no content and no meaningful events. *Session* = per-tab id (approximate). Authentication sign-in, opening the site, opening a tool, and a meaningful action are treated as distinct — the UI never calls a page load "active usage."

## Export formats

CSV (UTF-8 with BOM → opens directly in Excel; imports cleanly to Google Sheets). Per-section "Export CSV" respects the active view; the Exports hub offers full-dataset pulls. Datasets: users, public content, movement experiments, tool usage, admin audit log (users/public/tools also from their sections). **Formula-injection guarded** (cells starting `= + - @` / tab / CR are prefixed with `'`), quotes escaped, readable headers, an "Exported at" note row, dated filenames (`flow-school-users-YYYY-MM-DD.csv`). `.xlsx` multi-sheet is deferred (documented); CSV covers Excel + Sheets.

## User-management behavior

- **Deactivate / reactivate** — Supabase-native ban (`ban_duration`); the user can't get/refresh a token (locked out) while all content is preserved. Reversible.
- **Permanent delete** — requires typing the target's **email** (verified server-side); refuses **self-deletion** and **deleting the last admin**; clears avatar storage; `auth.admin.deleteUser` cascades their `user_data`, `profiles`, and their `public_classes` (and, per the existing live-reference model, other users' saves of those classes). `analytics_events` are **anonymized (user_id → NULL), not deleted.** Every action is written to `admin_audit_log`. Service-role stays server-only.
- **Add / remove admin** — from the user drawer; refuses removing the last admin; audit-logged.

## Tests completed

Verified with the Puppeteer harness against the local server (mocked Supabase where the live DB is unreachable from here):
- **Admin route protection / normal-user denial** — non-admin (`is_admin=false`) → permission-denied state, zero data, no admin tabs. ✓
- **Admin render** — admin sees 8 tabs, 12 metric cards, all sections render, user-detail drawer + delete-confirmation open, no page errors. ✓
- **Admin nav gate** — Admin link appears only when `is_admin()` returns true, driven by the RPC. ✓
- **CSV sanitization** — implemented and unit-reasoned (`= + - @` / tab / CR neutralized; quotes escaped).
- **Deletion safeguards** — self-delete, last-admin, and typed-email confirmation enforced in `api/admin/user-action.js`.
- All new/edited JS parses.

**Not yet executed against the live database/Vercel (must be done at rollout — I can't reach them from here):** running the two SQL files; confirming `admin_overview()` etc. return data as an admin and `raise` for a normal user; confirming `analytics_events`/`admin_users` RLS returns zero rows to a normal user (use `docs/rls-testing-guide.md` patterns extended to the new tables); a live deactivate/reactivate/delete on a throwaway account; verifying an export opens in Excel. This is the rollout checklist.

## Analytics NOT historically available (be honest in the room)

There is **no historical action log** — the app stored content as jsonb blobs, not events. So DAU/WAU/MAU history, tool-open history, generate/print counts, and create-vs-edit history **start empty and fill from deployment forward.** The UI labels these "since tracking began." What **is** complete historically: signups, public-class saves (count/who/over-time), and Movement Experiment saves (count/which/over-time).

## Recommended next steps

1. Run the rollout checklist (above) against live.
2. Wire the finer explicit events (publish/generate/print/public-save) at the audited call sites when convenient.
3. Extend `docs/rls-testing-guide.md`'s Step-3 impersonation test to `analytics_events` and `admin_users` (a normal user must read 0 rows).
4. Optional later: `.xlsx` multi-sheet export via a serverless generator; materialized summary tables if `analytics_events` grows large (indexes cover the near term).

## Manual setup you must complete

1. Run `supabase/admin-analytics.sql`.
2. Edit + run `supabase/seed-admins.sql` with the real Bonnie/Mackenzie emails.
3. Deploy. Confirm the Admin link appears for you and the permission-denied state appears for a non-admin test account.
4. Do a live deactivate/reactivate on a throwaway account, and one guarded delete, to confirm the serverless path + audit log.
