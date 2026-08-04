// ─── FLOW SCHOOL — notifications, the data layer ─────────────────────────────
//
// Everything that talks to the notifications tables lives here. nav.js draws
// the bell and the panel, admin.html draws the composer; neither writes a
// query. That split is what keeps "how we count unread" in one place instead
// of drifting between two callers.
//
// NO REALTIME, ON PURPOSE
// Nothing else in this app uses Supabase Realtime, and a websocket held open
// on every page to deliver an announcement nobody is waiting on is a poor
// trade. Instead: read the count on load, again when the panel opens, and
// again when the tab regains focus after being away. An announcement that
// arrives within a minute of coming back to the tab is indistinguishable
// from instant, and this cannot leak a subscription.
//
// EVERY READ IS CACHED, EVERY WRITE INVALIDATES
// The bell renders on every page load. Without the cache that is one round
// trip per navigation for a number that changes a few times a month.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  var PAGE_SIZE = 10;
  var COUNT_TTL = 60 * 1000;      // a stale badge for up to a minute is fine

  var countCache = { value: null, at: 0 };
  var listeners = [];             // things to re-render when the count moves

  function ready() { return typeof db !== 'undefined' && db; }

  function emit(n) {
    listeners.forEach(function (fn) { try { fn(n); } catch (_) {} });
  }

  // ── reads ────────────────────────────────────────────────────────────────

  // Returns a number, always. A failed count must not blank the bell or throw
  // into nav.js — an unreachable server is not the same as "no news", so the
  // last known value is kept rather than replaced with zero.
  async function unreadCount(force) {
    if (!ready()) return 0;
    var now = Date.now();
    if (!force && countCache.value !== null && now - countCache.at < COUNT_TTL) {
      return countCache.value;
    }
    try {
      var res = await db.rpc('unread_notification_count');
      if (res.error) throw res.error;
      var n = Number(res.data) || 0;
      var changed = countCache.value !== n;
      countCache = { value: n, at: now };
      if (changed) emit(n);
      return n;
    } catch (e) {
      return countCache.value === null ? 0 : countCache.value;
    }
  }

  // `before` is the published_at of the last row you have — keyset paging, so
  // a notification published while you are reading cannot shift the page and
  // make you see the same row twice.
  async function list(opts) {
    opts = opts || {};
    if (!ready()) return { rows: [], error: 'offline' };
    try {
      var res = await db.rpc('list_notifications', {
        p_limit: opts.limit || PAGE_SIZE,
        p_before: opts.before || null,
      });
      if (res.error) throw res.error;
      return { rows: res.data || [], error: null };
    } catch (e) {
      return { rows: [], error: (e && e.message) || 'Could not load notifications' };
    }
  }

  // ── writes ───────────────────────────────────────────────────────────────

  // Safe to call twice: the composite primary key turns a repeat into a
  // no-op. Returns true only if the server confirmed, so the caller knows
  // whether an optimistic tick can stand.
  async function markRead(id) {
    if (!ready()) return false;
    // ids arrive from dataset attributes, i.e. as strings. The RPC parameter
    // is a bigint — Postgres would coerce, but sending the right type beats
    // depending on it.
    id = Number(id);
    if (!id) return false;
    try {
      var res = await db.rpc('mark_notification_read', { p_id: id });
      if (res.error) throw res.error;
      if (countCache.value !== null && countCache.value > 0) {
        countCache = { value: countCache.value - 1, at: Date.now() };
        emit(countCache.value);
      }
      track('notification_marked_read', id);
      return true;
    } catch (e) { return false; }
  }

  async function markAllRead() {
    if (!ready()) return false;
    try {
      var res = await db.rpc('mark_all_notifications_read');
      if (res.error) throw res.error;
      countCache = { value: 0, at: Date.now() };
      emit(0);
      if (typeof fsTrack === 'function') fsTrack('notification_mark_all_read');
      return true;
    } catch (e) { return false; }
  }

  function track(name, id, type) {
    if (typeof fsTrack !== 'function') return;
    // the ID and the type travel; the title and message never do
    fsTrack(name, { resourceType: 'notification', resourceId: id,
                    metadata: type ? { type: type } : undefined });
  }

  // ── formatting ───────────────────────────────────────────────────────────

  var TYPE_LABEL = {
    announcement:    'Announcement',
    new_class:       'New class',
    new_feature:     'New feature',
    platform_update: 'Platform update',
  };
  function typeLabel(t) { return TYPE_LABEL[t] || 'Announcement'; }

  // Relative for the recent past, absolute once "3 weeks ago" stops being
  // more useful than a date. The exact time always survives in the title
  // attribute, so nothing is lost to rounding.
  function relative(iso) {
    if (!iso) return '';
    var then = new Date(iso), now = new Date();
    var s = Math.floor((now - then) / 1000);
    if (s < 45) return 'Just now';
    if (s < 90) return 'A minute ago';
    var m = Math.floor(s / 60);
    if (m < 60) return m + ' minutes ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h === 1 ? 'An hour ago' : h + ' hours ago';
    var d = Math.floor(h / 24);
    if (d === 1) return 'Yesterday';
    if (d < 7) return d + ' days ago';
    if (d < 14) return 'Last week';
    if (d < 35) return Math.floor(d / 7) + ' weeks ago';
    return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric',
      year: then.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }

  function exact(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString(undefined,
      { dateStyle: 'full', timeStyle: 'short' }); } catch (_) { return iso; }
  }

  // A link is external if it leaves this origin. Everything else is treated
  // as an in-app route, which is what lets an admin paste either one.
  function isExternal(url) {
    if (!url) return false;
    if (/^(https?:)?\/\//i.test(url)) {
      try { return new URL(url, location.href).origin !== location.origin; }
      catch (_) { return true; }
    }
    return false;
  }

  // Anything that is not http(s), a root-relative path, or a bare route is
  // refused — this is the one place a stored string becomes an href, so
  // javascript: and data: URLs die here rather than in the DOM.
  function safeHref(url) {
    if (!url) return null;
    var u = String(url).trim();
    if (/^(javascript|data|vbscript):/i.test(u)) return null;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.charAt(0) === '/' || u.charAt(0) === '#') return u;
    if (/^[a-z0-9][a-z0-9\-_/?=&.]*$/i.test(u)) return u;   // bare in-app route
    return null;
  }

  // ── refresh triggers ─────────────────────────────────────────────────────

  function onCountChange(fn) { listeners.push(fn); }

  // Coming back to a tab that has been in the background is the moment a
  // stale badge is most likely and least excusable.
  // Any return to the tab, not just a long absence. The old threshold meant
  // switching away to publish something and switching straight back left the
  // badge showing its pre-publish value, and one RPC is cheap.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) unreadCount(true);
  });

  window.fsNotify = {
    unreadCount: unreadCount,
    list: list,
    markRead: markRead,
    markAllRead: markAllRead,
    onCountChange: onCountChange,
    invalidate: function () { countCache = { value: countCache.value, at: 0 }; },
    typeLabel: typeLabel,
    relative: relative,
    exact: exact,
    isExternal: isExternal,
    safeHref: safeHref,
    track: track,
    PAGE_SIZE: PAGE_SIZE,
  };
})();
