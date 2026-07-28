// ─── FLOW SCHOOL — PRODUCT ANALYTICS ─────────────────────────────────────────
//
// Records meaningful product events to the `analytics_events` table so the
// admin dashboard can show real usage over time. Forward-collecting only:
// there is no historical action log to backfill.
//
// Usage anywhere (after lib/supabase.js so `db` exists):
//   fsTrack('item_saved', { resourceType: 'class', resourceId: id });
//   fsTrack('item_generated', { tool: 'Arbitrary Rules' });
//
// Fires `tool_opened` automatically once per page load on known tool pages.
//
// PRIVACY: metadata is scrubbed to scalars + short strings. NEVER pass note
// text, story bodies, cue wording, or class contents — pass IDs, types, and
// short titles only. The scrubber truncates strings to 80 chars as a backstop,
// but callers must not send private content in the first place.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  var TOKEN_KEY = 'sb-zizuopmcpzicbwngjagp-auth-token';

  // clean-url filename → display tool name (mirrors lib/tracker.js)
  var TOOL_NAMES = {
    'movement-experiments': 'Movement Experiments',
    'arbitrary-rules':      'Arbitrary Rules',
    'playlist-builder':     'Playlist Builder',
    'pose-popcorn':         'Pose Popcorn',
    'your-cues':            'Your Cues',
    'your-flows':           'Your Flows',
    'your-classes':         'Your Classes',
    'stories':              'Your Stories',
    'breath-pace':          'Breath Pace',
    'teaching-notes':       'Teaching Notes',
    'pose-library':         'Pose Library',
    'story-starters':       'Story Starters',
  };

  // event → category (kept out of call sites so naming stays consistent)
  var CATEGORY = {
    tool_opened: 'engagement', user_signed_in: 'auth',
    item_created: 'create', flow_created: 'create', class_created: 'create',
    item_updated: 'edit', item_deleted: 'delete',
    item_saved: 'save', item_unsaved: 'save', public_item_saved: 'save', public_item_unsaved: 'save',
    item_generated: 'generate', item_printed: 'print', item_exported: 'export',
    item_published: 'publish', item_unpublished: 'publish',
    // passive engagement — internal analytics only (never surfaced to users);
    // excluded from admin_is_meaningful so they don't inflate active-user counts
    profile_viewed: 'engagement', public_item_viewed: 'engagement',
  };

  function currentTool() {
    var raw = (window.location.pathname.split('/').pop() || '').replace(/\.html$/, '');
    return TOOL_NAMES[raw] || null;
  }

  function uid() {
    try {
      var raw = localStorage.getItem(TOKEN_KEY);
      return raw ? (JSON.parse(raw).user || {}).id || null : null;
    } catch (_) { return null; }
  }

  // device class — best-effort, computed once per load. Tablet is the fuzzy
  // one: iPadOS Safari reports as "Macintosh", so we recover it via touch
  // points (real Macs report 0). A signal for where to focus, not gospel.
  var DEVICE = (function () {
    try {
      var ua = navigator.userAgent || '';
      var isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
      if (isIPad || /Tablet|PlayBook|Silk/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) return 'tablet';
      if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|Opera Mini/i.test(ua)) return 'mobile';
      return 'desktop';
    } catch (_) { return 'desktop'; }
  })();

  function sessionId() {
    try {
      var s = sessionStorage.getItem('fs-a-sid');
      if (!s) {
        s = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem('fs-a-sid', s);
      }
      return s;
    } catch (_) { return null; }
  }

  // scalars + short strings only — the privacy backstop
  function scrubMeta(m) {
    if (!m || typeof m !== 'object') return {};
    var out = {}, keys = Object.keys(m).slice(0, 12);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], v = m[k];
      if (v == null) continue;
      if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
      else if (typeof v === 'string') out[k] = v.slice(0, 80);
      // objects/arrays are dropped — never let content structures through
    }
    return out;
  }

  var recent = {};   // in-page dedupe: suppress identical events within 4s

  function track(eventName, opts) {
    try {
      opts = opts || {};
      var user = uid();
      if (!user) return;                                  // nothing to attribute
      if (typeof db === 'undefined' || !db) return;       // client not on this page

      var key = eventName + '|' + (opts.resourceType || '') + '|' + (opts.resourceId || '');
      var now = Date.now();
      if (recent[key] && now - recent[key] < 4000) return;
      recent[key] = now;

      db.from('analytics_events').insert({
        user_id: user,
        session_id: sessionId(),
        event_name: String(eventName).slice(0, 60),
        event_category: opts.category || CATEGORY[eventName] || null,
        tool: opts.tool || currentTool(),
        resource_type: opts.resourceType || null,
        resource_id: opts.resourceId != null ? String(opts.resourceId).slice(0, 80) : null,
        // device rides inside metadata (an always-present jsonb) so shipping
        // the client never depends on a schema change landing first
        metadata: scrubMeta(Object.assign({ device: DEVICE }, opts.metadata)),
      }).then(function () {}, function () {});            // fire-and-forget; never surfaces errors
    } catch (_) {}
  }

  window.fsTrack = track;

  // ── automatic item_saved on synced-collection writes ──
  // sync.js wraps localStorage.setItem to mirror saves to the account. We wrap
  // it once more (loaded after sync.js) so any real save to a library also
  // records an item_saved event, keyed to the content type — broad coverage
  // with no edits to each tool's save function. Dedupe (4s) absorbs autosave
  // bursts. This captures save VOLUME per collection; it can't tell create
  // from edit — finer events (generated/printed/published) are explicit calls.
  var COLLECTION_TYPE = {
    flowschool_classes: 'class', flowschool_flows: 'flow', 'fs-cue-flows': 'cue_sheet',
    flowschool_stories: 'story', flowschool_playlists: 'playlist', flowschool_arules: 'arbitrary_rule',
    'fs-pose-connector-saved': 'pose_chain', flowschool_favs: 'experiment',
    flowschool_lognotes: 'teaching_note', flowschool_shorthand: 'shorthand',
  };
  function collLen(v) {
    try { var a = JSON.parse(v); return Array.isArray(a) ? a.length : (a && typeof a === 'object' ? Object.keys(a).length : 0); }
    catch (_) { return -1; }
  }
  try {
    var prevSet = window.localStorage.setItem;   // sync.js's mirror (or native)
    window.localStorage.setItem = function (key, value) {
      try {
        if (COLLECTION_TYPE[key] && uid()) {
          // infer create/edit/delete from the collection's item-count delta —
          // one item added = created, removed = deleted, same count = an edit
          var before = collLen(window.localStorage.getItem(key));
          var after = collLen(value);
          var ev = (before >= 0 && after > before) ? 'item_created'
                 : (before >= 0 && after < before) ? 'item_deleted'
                 : 'item_updated';
          track(ev, { resourceType: COLLECTION_TYPE[key] });
        }
      } catch (_) {}
      return prevSet.call(window.localStorage, key, value);
    };
  } catch (_) {}

  // ── tool_opened, once per page load on a known tool page ──
  var opened = false;
  function markOpen() {
    if (opened) return;
    opened = true;
    if (currentTool()) track('tool_opened', { category: 'engagement' });
  }
  if (document.readyState === 'complete') setTimeout(markOpen, 0);
  else window.addEventListener('load', function () { setTimeout(markOpen, 0); });
})();
