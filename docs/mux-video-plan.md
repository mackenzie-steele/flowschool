═══════════════════════════════════════════════════════════════════════════════
FLOW SCHOOL — NATIVE VIDEO LIBRARY ON MUX
Phase A: audit findings and implementation plan
4 August 2026
═══════════════════════════════════════════════════════════════════════════════

This document is the plan. No application code has been written.


───────────────────────────────────────────────────────────────────────────────
1. THE FINDING THAT RESHAPES THE BRIEF
───────────────────────────────────────────────────────────────────────────────

The brief assumes a framework. It says "install the appropriate official Mux
packages for the framework already used by Flow School", "the official Mux
Player for the existing framework", and asks me to run linting and type
checking after each phase.

There is no framework, and no build step.

  package.json scripts     {}          (empty — there are no commands to run)
  bundler config           none        (no vite/webpack/rollup/next)
  tsconfig.json            none
  eslint config            none
  vercel buildCommand      none
  client dependencies      vendored by hand — lib/vendor/supabase-js-*.min.js

Flow School is ~28 static HTML pages, each loading hand-written scripts from
lib/ with <script src>. package.json exists only so Vercel's serverless
functions can require @supabase/supabase-js. Nothing is compiled. Nothing is
bundled. What is in the repo is what the browser receives.

WHY THIS IS FINE, AND IN ONE RESPECT BETTER

Both Mux browser components ship as standalone web components on a CDN:

  <script src="https://cdn.jsdelivr.net/npm/@mux/mux-uploader"></script>
  <mux-uploader endpoint="…"></mux-uploader>

  <script src="https://cdn.jsdelivr.net/npm/@mux/mux-player" defer></script>
  <mux-player playback-id="…" metadata-video-title="…"></mux-player>

Custom elements need no build step — that is what they are for. They will
drop into admin.html and a member page exactly the way lib/vendor/ already
works. The server-side @mux/mux-node SDK installs normally into
package.json and runs inside api/ functions, which DO have node_modules.

WHAT THIS CHANGES IN THE BRIEF

  · "Run linting / type checking after each phase" — there is nothing to run.
    I will substitute: node --check on every file, the jsdom suite, and an
    explicit pass confirming existing features still work.

  · Vendor the two Mux scripts rather than hot-linking jsdelivr. Every other
    third-party dependency here is committed at a pinned version
    (supabase-js-v2.110.7.min.js). A CDN in the critical path of a paid
    library is an availability dependency nobody chose. Pin and commit.

  · No React. The uploader and player are used as elements, wired with the
    same plain event listeners as everything else in lib/.

I am flagging this rather than quietly adapting, because the brief's phrasing
suggests it may have been written against a different mental model of the
codebase. If Flow School is expected to gain a framework, that is a much
larger decision than this feature and should be made on its own.


───────────────────────────────────────────────────────────────────────────────
2. AUDIT — WHAT EXISTS AND WILL BE REUSED
───────────────────────────────────────────────────────────────────────────────

STRUCTURE
  Static multi-page app. lib/*.js per page. global.css holds every token and
  component. No routing layer — Vercel cleanUrls maps /foo to foo.html, plus
  a rewrites table in vercel.json (/@handle → teacher.html).

SUPABASE
  Client: a global `const db` from lib/supabase.js (anon key, RLS enforced).
  Server: api/ functions build a service-role client per request.
  Migrations: hand-written .sql files in supabase/, run by paste into the
  dashboard SQL editor. 15 of them. House style is a long comment header
  explaining WHY, then tables, then RLS, then functions, then a VERIFY block
  of statements to actually run, then TO UNDO. I will match this exactly.

AUTH AND ADMIN
  is_admin(uid) — SECURITY DEFINER over the admin_users table. One source of
  truth, already used by ~12 RPCs. The brief says not to introduce a second
  concept of admin; there is no need to.

  API functions authenticate by taking the caller's Supabase bearer token and
  calling admin.auth.getUser(token) with the service-role client
  (api/feedback.js is the reference implementation). Every Mux endpoint will
  do the same, then additionally check is_admin().

  MEMBERSHIP: there is currently NO membership tier concept. Every
  authenticated account has access to everything. Signup is deliberately open
  during beta. This matters for Phase E — see §6.

ADMIN CENTER
  admin.html, ~3400 lines. Three-level structure I built earlier today:
    AREAS   → the landing cards: Analytics, Content, Communications
    GROUPS  → pills within an area
    SECTIONS→ { id, label, render } — hash-routed, #sectionid
  Adding a section is a registry entry plus a render function. Video Library
  belongs in the CONTENT area, beside Music Library — that is exactly what
  that area was created for ("the material the app hands to teachers").
  It does NOT belong in Communications.

DESIGN SYSTEM
  Tokens in global.css: --accent (fig/periwinkle), --danger, --text-1..3,
  --border-light, --raised, --crest, --well, --r 12px, --rb 8px, --rs, --rf,
  --transition-base, full [data-theme="dark"] set.
  Components already built and to be reused, not recreated:
    .adm-panel / .adm-panel-head     section container
    .adm-table / .adm-scroll         tables
    .adm-metric                      stat tiles
    .adm-pill (+ .on/.off)           status badges — outlined, mono, uppercase
    .btn-primary/.btn-secondary/.btn-ghost/.btn-icon
    .btn-icon.adm-del + .armed       two-step destructive delete
    .modal-backdrop/.modal-card      dialogs
    .modal-input                     text inputs, selects, textareas
    .adm-select                      select with its own chevron
    .adm-state / stateEmpty/Loading/Error()
    .adm-explain                     the "how this works" prose block
    toast(msg)                       feedback
    .nf-* patterns from the notification composer — a directly analogous form

STORAGE
  ONE bucket: `avatars`. Public, user-scoped by path (uid/avatar.jpg).
  There is no private bucket and no signed-URL pattern anywhere in the app.
  PDFs will need both, built from scratch. This is new ground, not reuse.

ANALYTICS
  fsTrack(name, {category, resourceType, resourceId, metadata}) →
  analytics_events. Fire-and-forget, 4s dedupe, scrubs metadata. Ready to use.

DEPLOYMENT
  Vercel. api/*.js as module.exports = async (req,res). Node 22 available.
  Env vars set via `vercel env add` — note that `vercel env pull` returns
  EMPTY for sensitive values, so the local .env cannot be relied on to
  mirror production.

EXISTING VIDEO
  Uscreen only, as outbound links:
    nav item 'Video Library' → https://flowschool.uscreen.io (external)
    data/sequence-starters.js → uscreen.io/programs/… per starter
    output/uscreen-integration-plan.txt — the plan to package app access
    with the Uscreen membership
  No embedded video anywhere. No video tables. This is greenfield.


───────────────────────────────────────────────────────────────────────────────
3. ARCHITECTURE
───────────────────────────────────────────────────────────────────────────────

  Browser (admin.html)          Vercel api/            Mux              Supabase
  ────────────────────          ───────────            ───              ────────
  <mux-uploader> ──────────────────────────────────────► direct PUT
        │                                                    │
        └─► POST /api/mux/upload ─► creates upload ──────────┘
              (admin-gated)         passthrough = video id
                                                        │
                                    webhook ◄───────────┘
              POST /api/mux/webhook  (signature verified)
                      │
                      └──────────────────────────────────────────► videos row
                                                                   updated

  <mux-player> ◄─── playback token ◄─ POST /api/mux/playback-token
                                        (auth + published check, RS256)

DIVISION OF TRUTH, as the brief requires
  Mux owns: ingestion, transcoding, streaming, generated thumbnails,
            storyboards, playback IDs, Mux Data.
  Supabase owns: everything Flow School means by "a video" — title, slug,
            descriptions, category, keywords, SEO, resources, status,
            ordering, ownership, timestamps, and the mapping to Mux ids.
  Mux is never queried to render a list. The admin table and the member
  library read Supabase only.

CORRELATION
  Every direct upload is created with passthrough = the Supabase video row's
  id (a uuid). Webhooks carry it back. This is the documented mechanism and it
  survives out-of-order and duplicate delivery, which the brief requires.


───────────────────────────────────────────────────────────────────────────────
4. PHASE B — DATABASE  (supabase/video-library.sql)
───────────────────────────────────────────────────────────────────────────────

Three tables, one storage bucket, matching house conventions (bigint identity
for admin-facing rows elsewhere; but uuid here, because the id becomes the Mux
passthrough value and is visible in webhook payloads — a guessable sequential
id in a third party's logs is worse than a uuid).

video_categories
  id uuid pk default gen_random_uuid()
  name text not null, slug text not null unique
  short_description text, description text
  cover_image_url text
  seo_title text, seo_description text
  status text not null default 'active' check in (active, archived)
  sort_order integer not null default 0
  created_by/updated_by uuid → auth.users on delete set null
  created_at/updated_at timestamptz, touch trigger

videos
  id uuid pk default gen_random_uuid()          ← the Mux passthrough value
  title text not null
  slug text not null unique                     ← citext-style lower() unique index
  short_description text, description text
  status text not null default 'draft'
    check in (draft, uploading, processing, ready, errored, published, archived)
  visibility text not null default 'members'
    check in (members, public, unlisted)        ← §6; only 'members' used now
  category_id uuid → video_categories on delete restrict
  mux_upload_id text unique
  mux_asset_id text unique                      ← prevents duplicate association
  mux_playback_id text
  mux_asset_status text
  mux_error text                                ← the message from asset.errored
  duration_seconds numeric
  aspect_ratio text
  max_resolution text
  thumbnail_mode text default 'auto' check in (auto, timestamp, custom)
  thumbnail_time_seconds numeric
  custom_thumbnail_url text
  seo_title text, seo_description text
  search_keywords text[] not null default '{}'
  published_at, archived_at timestamptz
  created_by/updated_by, created_at/updated_at
  sort_order integer not null default 0

  CONSTRAINTS the brief asks for:
    published_needs_an_asset —
      check (status <> 'published' or (mux_playback_id is not null
             and mux_asset_id is not null and category_id is not null))
    published_has_a_time —
      check (status <> 'published' or published_at is not null)
    thumbnail_time_within_duration — enforced in the RPC, not a CHECK,
      because duration arrives asynchronously and a CHECK would reject the
      legitimate window where the timestamp is set before the asset is ready
    slug_shape — check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')

  INDEXES
    (status, published_at desc) where status='published'   member library
    (created_at desc)                                      admin list
    gin (search_keywords)                                  keyword filter
    gin (to_tsvector('english', title||' '||coalesce(short_description,'')
         ||' '||coalesce(description,'')))                 §7 full-text
    unique (lower(slug))
    (category_id)

video_resources
  id uuid pk, video_id uuid → videos on delete cascade
  title text not null, description text
  storage_path text not null                    ← bucket-relative, never a URL
  file_name text, file_size bigint, mime_type text
  sort_order integer not null default 0
  created_by uuid, created_at/updated_at
  check (mime_type = 'application/pdf')
  check (file_size <= 26214400)                 ← 25MB
  ON DELETE CASCADE gives the brief's "no orphaned resources". Storage objects
  are removed by the delete RPC, not by the cascade — Postgres cannot delete
  from a bucket.

STORAGE
  New PRIVATE bucket `video-resources`, path video_id/resource_id.pdf.
  Policies: admins insert/update/delete; authenticated select (so a signed URL
  can be minted). Downloads go through a short-lived createSignedUrl (60s)
  generated server-side after an access check — never a public URL. This is
  the first private bucket in the project; the pattern is new and documented.

RLS
  video_categories  authenticated read where status='active'
                    admins read all, write all
  videos            authenticated read where status='published'
                    admins read all, write all
  video_resources   authenticated read where the parent video is published
                    admins read all, write all
  Draft rows are invisible to members at the database, not by hidden UI.

RPCs (SECURITY DEFINER, is_admin()-gated, matching publish_notification's shape)
  create_video_draft(title) → videos
  publish_video(id)   — validates title/slug/category/playback id, sets
                        published_at = coalesce(published_at, now()) so a
                        republish does not jump the library ordering
  unpublish_video(id) / archive_video(id) / restore_video(id)
  set_video_keywords(id, text[])   — normalises: trim, drop empties,
                                     case-insensitive dedupe, cap length/count
  reorder_categories(uuid[])
  video_slug_available(slug, exclude_id) → boolean

DELETION
  Soft by default: archive. Hard delete of a Flow School row is a separate
  admin action behind the .armed two-step. Deleting the MUX ASSET is a third,
  separately confirmed action with its own copy — the brief is explicit, and
  the failure is unrecoverable.


───────────────────────────────────────────────────────────────────────────────
5. PHASE C — MUX SERVER INTEGRATION
───────────────────────────────────────────────────────────────────────────────

npm i @mux/mux-node   (server only; never reaches the browser)

  api/mux/upload.js           POST  admin-gated. Creates a videos row if
                                    needed, then mux.video.uploads.create({
                                      cors_origin, new_asset_settings: {
                                        playback_policy: ['signed'],
                                        passthrough: <video id> }})
                                    Returns { uploadUrl, videoId }.
                                    Idempotent per video row: an existing
                                    un-consumed upload id is returned rather
                                    than creating a second.

  api/mux/webhook.js          POST  NO auth (Mux calls it) but EVERY request
                                    verified with mux.webhooks.unwrap(body,
                                    headers, MUX_WEBHOOK_SECRET). Requires the
                                    RAW body — Vercel parses JSON by default,
                                    so the handler must read the stream itself.
                                    This is the single most likely thing to
                                    silently break; it gets its own test.
                                    Handles: video.upload.asset_created,
                                             video.asset.created,
                                             video.asset.ready,
                                             video.asset.errored,
                                             video.asset.deleted,
                                             video.upload.errored,
                                             video.upload.cancelled
                                    Idempotency: every write is a conditional
                                    UPDATE keyed on the passthrough id, and
                                    asset.ready never downgrades a row that is
                                    already published. Replaying an event is a
                                    no-op by construction, not by a dedupe
                                    table.

  api/mux/playback-token.js   POST  Signed in + video published (or caller is
                                    an admin previewing). Mints RS256 JWTs:
                                      sub = playback id
                                      aud = 'v' (video) and 't' (thumbnail)
                                      exp = now + 6h
                                      kid = MUX_SIGNING_KEY_ID
                                    Returns both tokens. The private key never
                                    leaves the server — same discipline as
                                    api/musickit-token.js, which is the
                                    reference for this whole file.

  api/mux/resource-url.js     POST  Access check, then a 60-second Supabase
                                    signed URL for one PDF.

  api/mux/delete-asset.js     POST  The explicit destructive action. Separate
                                    endpoint so it cannot be reached by
                                    accident from an ordinary save.

ENV (server-only, added to .env.example with placeholders, never values)
  MUX_TOKEN_ID
  MUX_TOKEN_SECRET
  MUX_WEBHOOK_SECRET
  MUX_SIGNING_KEY_ID
  MUX_SIGNING_PRIVATE_KEY     base64 PEM as Mux returns it


───────────────────────────────────────────────────────────────────────────────
6. THE MEMBERSHIP PROBLEM — PHASE E NEEDS A DECISION
───────────────────────────────────────────────────────────────────────────────

The brief says: "confirm that the user has permission to access the video
library" and "use the existing membership and authorization system rather
than introducing a duplicate concept of active users."

There is no membership system. Every authenticated account currently has
access to everything; signup is open during beta. output/uscreen-integration-
plan.txt describes the intended future — app access packaged with the Uscreen
membership — but none of it is built.

So "has permission" today can only mean "is signed in". I will:
  · gate playback on authenticated + published, and
  · put the check behind one function, canWatch(user, video), that is the
    only place the rule lives.
When Uscreen entitlement arrives, that function changes and nothing else does.

I will NOT invent a membership tier table. Inventing one now guarantees it
disagrees with whatever Uscreen actually returns later, and the brief warns
against exactly that.

Confirm this is the right call before Phase E.


───────────────────────────────────────────────────────────────────────────────
7. PHASES D, E, F — SUMMARY
───────────────────────────────────────────────────────────────────────────────

D — ADMIN (admin.html + lib/video-admin.js)
    New GROUP 'Videos' in the CONTENT area, two sections: Videos, Categories.
    List: thumbnail, title, category, duration, Mux state, status, updated.
      Search + category filter + status filter, 20-per-page "Show more"
      (the pattern already in the music catalogue).
    Form: eight sections per the brief, built from .adm-panel + .modal-input +
      the .nf-* composer patterns. Live preview of the search card.
      Slug: generated from title, frozen once edited, uniqueness checked
      against video_slug_available before save, warns on changing a published
      slug (no redirect system exists — documented as follow-up, per the brief).
    Upload: <mux-uploader> styled inside a Flow School panel. beforeunload
      warning while uploading. The upload button is disabled between click and
      response so a double-click cannot mint two uploads.
    Thumbnail: mux image URL at the chosen timestamp, "use current frame" from
      the preview player, reset to auto. Custom upload deferred (see §9).

E — MEMBER (video.html, rewritten as /video/:slug in vercel.json)
    Server-rendered metadata is impossible without a build step — the page is
    static HTML. SEO fields will be set client-side into document.title and
    meta tags, which search engines do execute, but this is weaker than SSR.
    Since library videos default to member-only and non-indexable, that is
    acceptable NOW and becomes a real constraint if public marketing pages are
    ever wanted. Documented, not papered over.
    <mux-player> with playback-token, thumbnail-token, metadata-* for Mux Data,
    styled with tokens; native controls, captions, PiP, AirPlay all kept.

F — TESTS + DOCS
    jsdom suites in the existing harness for the admin form, validation, slug
    rules, keyword normalisation, status gating.
    Node tests for webhook signature verification and idempotency, token
    claim shape, PDF validation — these are pure functions and testable
    without Mux.
    docs/mux-video.md covering all 13 documentation points in the brief.
    Manual QA checklist, upload → playback.


───────────────────────────────────────────────────────────────────────────────
8. WHAT I RECOMMEND CUTTING FROM PHASE 1
───────────────────────────────────────────────────────────────────────────────

Not because they are bad, but because they add surface without reducing risk,
and this phase is foundation:

  · CUSTOM THUMBNAIL UPLOAD. Mux generates thumbnails from any timestamp; the
    brief itself says "at minimum, implement the timestamp approach". A custom
    upload means a second public bucket, image validation, and a second
    codepath through every thumbnail render. The column ships; the uploader
    does not. Add it when someone actually wants a frame the video does not
    contain.

  · RICH TEXT for the full description. There is no rich-text system in the
    app. The brief says not to introduce a heavy editor unnecessarily. Plain
    text with preserved line breaks (the notification composer's pattern),
    rendered with escaping. Markdown later if it is ever asked for.

  · DUPLICATE-INTO-DRAFT and DELETE MUX ASSET in the list. Both are real, both
    are better added once there are enough videos to want them.

  · RATE LIMITING. Every mutating endpoint is admin-gated, and there are two
    admins. Rate limiting a two-person surface is ceremony. The webhook is the
    one open endpoint and it is protected by signature verification, which is
    stronger.


───────────────────────────────────────────────────────────────────────────────
9. RISKS, HONESTLY
───────────────────────────────────────────────────────────────────────────────

  1. RAW BODY FOR WEBHOOK VERIFICATION. Vercel's Node runtime parses JSON
     before the handler sees it; signature verification needs the exact bytes.
     Getting this wrong produces a webhook that silently rejects everything,
     which looks like "Mux is broken". Highest-risk item in the build.

  2. NO SSR MEANS WEAK SEO. Phase 6 of the brief asks for canonical URLs and
     Open Graph. Client-set meta tags work for Google and not much else.
     Fine while everything is member-only; a real limit the day a public
     marketing page is wanted.

  3. LOCAL WEBHOOK TESTING needs the Mux CLI forwarding to a tunnel, or a
     Vercel preview deployment. There is no local server for api/ today.

  4. SCOPE. This is the largest feature in the app by a wide margin —
     3 tables, 1 bucket, 5 endpoints, ~2 admin sections, a member page, and a
     new third-party dependency. I would rather ship B and C, prove an upload
     reaches "ready" end to end, and then build D on something known to work,
     than build all of it and debug it at once.


───────────────────────────────────────────────────────────────────────────────
10. WHAT I NEED FROM YOU BEFORE PHASE B
───────────────────────────────────────────────────────────────────────────────

  1. A Mux account, with: an API access token (ID + secret), a signing key
     (Video → Signing Keys), and a webhook pointed at
     https://flowschool.io/api/mux/webhook once deployed.
     I will write the exact click-path in docs/mux-video.md first so you are
     not guessing.

  2. Confirmation on §6 — that "signed in" is the right access rule for now.

  3. Confirmation on §8 — the four things I propose deferring.

  4. A decision on the framework question in §1. My recommendation: stay
     vanilla. The web components fit, and adopting a framework for one feature
     would fork the codebase into two idioms.


═══════════════════════════════════════════════════════════════════════════════
No code written. Awaiting sign-off on §6, §8 and §10 before Phase B.
═══════════════════════════════════════════════════════════════════════════════
