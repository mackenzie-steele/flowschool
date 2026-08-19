# Collections — content-management foundation (v1)

Category → Collection → Videos. A category is a shelf; a collection is a
curated, ordered set of videos with its own page, art, resources and SEO;
a video is the atom. Nothing duplicates: membership is junction rows, so one
video (one Mux asset) can sit in any number of collections and categories.

## Rollout order (matters)

1. Run `supabase/video-collections.sql` in the Supabase dashboard → SQL editor
   (run-once, additive; nothing earlier needs re-running). Run its VERIFY
   queries.
2. Deploy the site (admin.html, lib/icons.js, api/mux/*).

Deploying the site first is safe everywhere except uploads: the webhook now
writes a `captions` column on `videos`, so a Mux upload finishing between
site-deploy and SQL-run would fail to record. Run the SQL first and there is
no window. No new environment variables. No Vercel config changes.

`video_resources` (the old per-video table) is migrated into
`resources` + `resource_links` with the SAME ids and storage paths, then left
in place untouched as a safety net. Nothing reads or writes it any more —
drop it by hand once the new tables are verified in production.

## What owns what

- `collections` — title, slug, descriptions, status (draft/published/
  scheduled/archived), visibility (members/unlisted/public), artwork
  (mode first_video | custom; three ratio columns — horizontal is the
  catalog card, vertical 1188×1682 and square 1080×1080 are optional),
  SEO, keywords, admin_notes, instructor.
- `collection_items` — the playlist. One ordered list (`position` 1..n)
  holding BOTH `video` rows and `divider` rows, so the admin's exact
  arrangement (FOUNDATION, two videos, BUILD…) replays on the frontend by
  reading positions in order. Reordering goes through
  `reorder_collection_items()` — one statement, no half-applied orders.
- `collection_categories`, `video_category_links` — many-to-many. The video's
  `category_id` column stays as the PRIMARY category (publish validation and
  existing reads depend on it) and a trigger mirrors it into the link table,
  so "everything in category X" is one query against links. Both junctions
  carry `sort_order`: ONE manual sequence per category, interleaving videos
  and collections — this is the category page's featured order.
- The Category editor (Categories → Edit) manages title, position,
  descriptions, the combined content list (add/remove/drag-reorder), a cover
  image, and SEO. Removing a video from a category is refused when that
  category is the video's primary — change the primary in the video editor
  first, so the mirror trigger and publish validation never disagree.
- `resources` + `resource_links` — the shared file library. A link points at
  a video OR a collection. Detaching in an editor removes the link only; real
  deletion (with an "attached to N pieces of content" warning) lives in
  Content → Resources.
- `filters` / `filter_options` / `content_filter_values` — admin-defined
  taxonomy (Movement Focus → Hips…), multi-select by construction, applies to
  both videos and collections. Nothing yoga-specific is hard-coded.
- `instructors` — Bonnie is a seeded row, not a string; videos and
  collections carry a nullable `instructor_id`.
- `collection_stats` — a security-invoker view computing video count and
  total runtime. Never typed by hand; respects RLS.

Scheduling is the same trick videos use: `scheduled` + future `published_at`,
made live by the read policy comparing to `now()`. No cron.

## Edge-case decisions

- Same video in multiple collections — junction rows; one Mux asset. The
  video editor shows "In collections" with jump links.
- Removing a video from a collection — deletes the item row only.
- Deleting a video — its playlist rows and resource links cascade away; the
  collection, the files and the Mux asset survive.
- Deleting a collection — two-step, in-menu; cascades items and links only.
  Archive is the preferred verb and is what bulk actions offer.
- Draft/archived video inside a published collection — allowed; the playlist
  flags it ("members will not see it yet") and the publish checklist counts
  them. Member RLS hides the video rows themselves, so nothing leaks.
- Category archived while in use — links survive; archiving never cascades.
  Category DELETE is blocked by FK RESTRICT (was already true for videos).
- Duplicate slug — checked via `collection_slug_available` on save; suffixed
  on create, refused with a message on rename.
- Duplicate collection — `duplicate_collection()` copies metadata, category
  assignments, filter values, playlist (order + dividers) and resource links;
  lands as Draft named "… — Copy". Files and Mux assets are not copied.
- Changing a published collection's slug — inline warning that shared links
  break (same behavior as videos).
- Mux still processing — unchanged from videos: `publish_video()` refuses
  until the asset is ready; collections have no processing states.
- Replace video — the existing flow already preserves all metadata and
  relationships (same row, new asset via passthrough); collections reference
  the row id, so membership survives a replace. Old assets stay on Mux.
- Non-admin — every new table has RLS: members read only live content and
  what hangs off it; all writes require `is_admin()`. UI hiding is a
  courtesy, not the enforcement.

## Captions

Automatic English captions are ON for every new upload
(`generated_subtitles` in `api/mux/upload.js`; supported on the `basic`
video quality tier, per Mux's video-quality guide). Generation runs after
the asset is ready, so the track arrives as "Preparing" and flips to
"Ready" via the webhook's track events, which keep `videos.captions`
(jsonb) current. The editor's "Captions & transcript" section shows track
status; for videos uploaded before this was switched on, it offers a
**Generate captions** button backed by `api/mux/generate-captions.js`
(admin-only; finds the asset's audio track and asks Mux to caption it).
Caption files added in the Mux dashboard appear on their own via the
webhook. Editing caption text still happens in the Mux dashboard.

## Deliberately deferred

- Member-facing library pages (`/collection/<slug>` etc.) — the admin links
  assume that route shape when they arrive.
- Bulk status changes (publish needs per-video validation); bulk archive,
  add-to-category and add-to-collection are built.
- Access gating / pricing / trailers on collections (the Uscreen reference's
  Access and Subscription cards) — entitlement arrives with the Uscreen
  integration; `canWatch()`/`canBrowseCollection()` are the single seams.
- Watch progress / favorites — stable uuids everywhere make both a pure
  addition (`member_id + video_id/collection_id` tables) later.
- Server-side paginated video picker — the FTS index (`video_search_doc`)
  and keyword GIN indexes are already in place for when the library outgrows
  client-side filtering.
