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
// Fires one open per page load: `tool_opened` on the twelve tools,
// `page_opened` (with metadata.page) everywhere else. Never both.
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
    tool_opened: 'engagement', page_opened: 'engagement', user_signed_in: 'auth',
    item_created: 'create', flow_created: 'create', class_created: 'create',
    item_updated: 'edit', item_deleted: 'delete',
    item_saved: 'save', item_unsaved: 'save', public_item_saved: 'save', public_item_unsaved: 'save',
    item_generated: 'generate', item_printed: 'print', item_exported: 'export',
    item_published: 'publish', item_unpublished: 'publish',
    // passive engagement — internal analytics only (never surfaced to users);
    // excluded from admin_is_meaningful so they don't inflate active-user counts
    profile_viewed: 'engagement', public_item_viewed: 'engagement',
    // a member fetching a PDF is active engagement — it counts as meaningful
    resource_opened: 'engagement',
    // a settled library search; the phrase rides in resource_id, the result
    // count in metadata — zero-result searches are the content roadmap
    library_searched: 'engagement',
  };

  // Everywhere that ISN'T a tool. tool_opened stays exactly what it was — the
  // twelve making surfaces, stamping the `tool` column that Most-used Tools and
  // the friction analysis group by. These get their own event so neither
  // pollutes the other: a dashboard visit must never rank as tool usage.
  var PAGE_NAMES = {
    'dashboard':        'Dashboard',
    'circle':           'The Circle',
    'saved':            'Saved',
    'profile':          'Profile',
    'settings':         'Settings',
    'class':            'Shared Class',
    'teacher':          'Teacher Profile',
    'elements-of-flow': 'Elements of Flow',
    'admin':            'Admin',
  };

  function currentSlug() {
    return (window.location.pathname.split('/').pop() || '').replace(/\.html$/, '');
  }

  function currentTool() {
    return TOOL_NAMES[currentSlug()] || null;
  }

  function currentPage() {
    var raw = currentSlug();
    // teacher.html is served at /@handle (the vercel.json rewrite), so the
    // slug is the handle, not the filename
    if (raw.charAt(0) === '@') return PAGE_NAMES.teacher;
    return PAGE_NAMES[raw] || null;
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

  // ── session_start: one event per tab-session ──
  // Fires the first time a session id is minted (fs-a-sid absent), so sessions
  // are cleanly countable and a "bounce" — a session with nothing but this —
  // is visible. Boundaries then come free: start = this event, end = the
  // session's last event, duration = the gap. Not a product action, so it's
  // excluded from admin_is_meaningful.
  try {
    if (uid() && !sessionStorage.getItem('fs-a-sid')) {
      track('session_start', { category: 'session' });
    }
  } catch (_) {}

  // ── one-time signup attribution ──
  // The signup form sets fs-signup-pending. When that just-created account first
  // lands here authenticated, fire user_signed_up carrying where they came from
  // (fs-acq: channel, landing, referrer, utm). Existing users signing in never
  // set the marker, so they never trip this. Fires once, then clears the marker.
  try {
    if (uid() && window.localStorage.getItem('fs-signup-pending')) {
      var _acq = {};
      try { _acq = JSON.parse(window.localStorage.getItem('fs-acq') || '{}') || {}; } catch (_) {}
      track('user_signed_up', { category: 'auth', metadata: _acq });
      window.localStorage.removeItem('fs-signup-pending');
    }
  } catch (_) {}

  // ── automatic create/edit/delete on synced-collection writes ──
  // sync.js's mirror is the ONE place every synced write is intercepted (it
  // installs robustly, including the iOS prototype fallback). It calls this hook
  // with the pre- and post-write values, so we infer create/edit/delete from the
  // collection's item-count delta without re-patching setItem ourselves. The old
  // instance re-patch silently no-op'd on iOS, dropping every mobile create/edit.
  // Dedupe (4s) absorbs autosave bursts; finer events (generated/printed/
  // published) stay explicit fsTrack calls.
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
  window.fsOnWrite = function (key, prev, value) {
    try {
      if (!COLLECTION_TYPE[key] || !uid()) return;
      // one item added = created, removed = deleted, same count = an edit
      var before = collLen(prev);
      var after = collLen(value);
      var ev = (before >= 0 && after > before) ? 'item_created'
             : (before >= 0 && after < before) ? 'item_deleted'
             : 'item_updated';
      track(ev, { resourceType: COLLECTION_TYPE[key] });
    } catch (_) {}
  };

  // ── one open per page load: tool_opened on a tool, page_opened elsewhere ──
  // Never both. The page name rides in metadata rather than the `tool` column,
  // so the tool analytics keep meaning tools.
  var opened = false;
  function markOpen() {
    if (opened) return;
    opened = true;
    if (currentTool()) { track('tool_opened', { category: 'engagement' }); return; }
    var page = currentPage();
    if (page) track('page_opened', { category: 'engagement', metadata: { page: page } });
  }
  if (document.readyState === 'complete') setTimeout(markOpen, 0);
  else window.addEventListener('load', function () { setTimeout(markOpen, 0); });
})();
