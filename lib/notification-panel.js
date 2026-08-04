// ─── FLOW SCHOOL — the Notification Center ───────────────────────────────────
//
// The bell in the rail, and the panel behind it. Data comes from
// lib/notifications.js; this file only draws and handles input.
//
// WHY THIS IS NOT IN nav.js
// nav.js is loaded by every authenticated page — a mistake there takes the
// whole app down, not one feature. This mounts itself through a two-line hook
// and fails quietly if anything is missing, so the worst case is a rail with
// no bell rather than a rail that does not render.
//
// ONE ELEMENT, TWO SHAPES
// Desktop gets a right-side drawer, mobile a bottom sheet. Same DOM, same
// state, different CSS — two implementations would drift, and this one has a
// focus trap and a read-marking rule that must behave identically in both.
//
// READ IS AN INTENTION, NOT AN IMPRESSION
// Opening the panel marks nothing. Expanding a notification or following its
// link does. Otherwise the badge clears the first time somebody glances at
// the bell, and the announcement they never actually read is gone forever.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  var N = null;                 // lib/notifications.js
  var panel = null, overlay = null, listEl = null, badgeEls = [];
  var rows = [], loading = false, exhausted = false, lastError = null;
  var lastFocus = null, mounted = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ── the bell ─────────────────────────────────────────────────────────────

  function bellHTML(cls, id) {
    return '<button type="button" class="' + cls + ' fs-bell" id="' + id + '"'
      + ' aria-label="Notifications" aria-expanded="false" title="Notifications">'
      + '<span class="material-symbols-sharp">notifications</span>'
      + '<span class="fs-bell-badge" hidden></span></button>';
  }

  // Injected beside the settings gear in both the desktop rail and the mobile
  // sheet, mirroring how the admin button finds its home.
  function mount() {
    if (!window.fsNotify) return;
    N = window.fsNotify;
    try {
      // ANCHOR TO THE AVATAR, NOT THE GEAR.
      // The admin button also inserts itself before the gear, and it arrives
      // whenever the admin check resolves — so anchoring here to the gear too
      // made the order a race: bell-then-admin on one load, admin-then-bell on
      // the next, and the icon visibly moved between refreshes. The avatar is
      // always present and never re-inserted, so "just after it" is stable no
      // matter who mounts first. Final order: avatar · bell · admin · gear.
      var hdr = document.getElementById('hdr-auth');
      var avatar = hdr && hdr.querySelector('.nav-avatar-btn');
      if (avatar && !document.getElementById('fs-bell')) {
        avatar.insertAdjacentHTML('afterend', bellHTML('nav-settings-btn', 'fs-bell'));
      }
      var sheet = document.getElementById('ns-identity');
      var person = sheet && sheet.querySelector('.ns-person');
      if (person && !document.getElementById('fs-bell-m')) {
        person.insertAdjacentHTML('afterend', bellHTML('ns-feedback-btn', 'fs-bell-m'));
      }
      badgeEls = [].slice.call(document.querySelectorAll('.fs-bell'));
      badgeEls.forEach(function (b) {
        if (b.dataset.wired) return;
        b.dataset.wired = '1';
        b.addEventListener('click', function (e) { e.preventDefault(); toggle(b); });
      });
      if (!mounted) {
        mounted = true;
        N.onCountChange(paintBadge);
        N.unreadCount().then(paintBadge);
      } else {
        N.unreadCount().then(paintBadge);
      }
    } catch (_) { /* a rail with no bell beats a rail that did not render */ }
  }

  // Not red. Red is for things that have gone wrong; an announcement has not.
  // The count is also spoken, because a dot is invisible to a screen reader.
  function paintBadge(n) {
    n = Number(n) || 0;
    [].slice.call(document.querySelectorAll('.fs-bell')).forEach(function (b) {
      var dot = b.querySelector('.fs-bell-badge');
      if (!dot) return;
      if (n > 0) {
        dot.textContent = n > 9 ? '9+' : String(n);
        dot.hidden = false;
        b.setAttribute('aria-label', n === 1 ? '1 unread notification' : n + ' unread notifications');
        b.classList.add('has-unread');
      } else {
        dot.hidden = true;
        b.setAttribute('aria-label', 'Notifications');
        b.classList.remove('has-unread');
      }
    });
    var live = document.getElementById('fs-bell-live');
    if (live) live.textContent = n > 0
      ? (n === 1 ? '1 unread notification' : n + ' unread notifications') : '';
  }

  // ── the panel ────────────────────────────────────────────────────────────

  function build() {
    if (panel) return;
    overlay = document.createElement('div');
    overlay.className = 'fs-np-overlay';
    overlay.addEventListener('click', close);

    panel = document.createElement('div');
    panel.className = 'fs-np';
    panel.id = 'fs-np';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Notifications');
    panel.tabIndex = -1;
    panel.innerHTML =
      '<div class="fs-np-head">'
      +   '<h2 class="fs-np-title">Notifications</h2>'
      +   '<div class="fs-np-head-actions">'
      +     '<button type="button" class="fs-np-allread" id="fs-np-allread">Mark all as read</button>'
      +     '<button type="button" class="btn-icon fs-np-close" aria-label="Close notifications">'
      +       '<span class="material-symbols-sharp">close</span></button>'
      +   '</div>'
      + '</div>'
      // No "view all" page: the panel pages its own history through Show
      // older, and a second surface showing the same rows is a second place
      // for the read/unread rules to drift.
      + '<div class="fs-np-body" id="fs-np-body"></div>';

    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    listEl = panel.querySelector('#fs-np-body');

    panel.querySelector('.fs-np-close').addEventListener('click', close);
    panel.querySelector('#fs-np-allread').addEventListener('click', markAll);
    listEl.addEventListener('click', onListClick);

    var live = document.createElement('span');
    live.id = 'fs-bell-live';
    live.className = 'sr-only';
    live.setAttribute('aria-live', 'polite');
    document.body.appendChild(live);
  }

  function isOpen() { return panel && panel.classList.contains('open'); }

  function toggle(btn) { isOpen() ? close() : open(btn); }

  function open(btn) {
    build();
    lastFocus = btn || document.activeElement;
    panel.classList.add('open');
    overlay.classList.add('show');
    document.querySelectorAll('.fs-bell').forEach(function (b) {
      b.setAttribute('aria-expanded', 'true');
    });
    panel.focus({ preventScroll: true });
    if (typeof fsTrack === 'function') fsTrack('notification_panel_opened');
    // the panel opening is the one moment a stale count is visible, so this
    // read is forced past the cache
    N.unreadCount(true).then(paintBadge);
    rows = []; exhausted = false; lastError = null;
    render();
    load();
  }

  function close() {
    if (!panel) return;
    panel.classList.remove('open');
    overlay.classList.remove('show');
    document.querySelectorAll('.fs-bell').forEach(function (b) {
      b.setAttribute('aria-expanded', 'false');
    });
    // On mobile the bell lives in the nav sheet, which closed behind the
    // panel — returning focus to a hidden element strands the keyboard. Fall
    // back to the desktop bell, then to nothing, rather than focusing a
    // control the user can no longer see.
    // Ask the question directly — "is the opener inside a sheet that has since
    // closed" — rather than inferring it from layout. offsetParent is null for
    // position:fixed elements too, and is always null under jsdom, so it
    // answers a different question than the one being asked.
    var back = lastFocus;
    var sheet = back && back.closest && back.closest('.nav-sheet');
    if (back && (!back.isConnected || (sheet && !sheet.classList.contains('open')))) {
      back = document.getElementById('fs-bell');   // the desktop bell, if there is one
    }
    if (back && back.focus) back.focus({ preventScroll: true });
    lastFocus = null;
  }

  // ── data ─────────────────────────────────────────────────────────────────

  async function load(more) {
    if (loading || exhausted) return;
    loading = true;
    if (!more) render();
    var before = more && rows.length ? rows[rows.length - 1].published_at : null;
    var res = await N.list({ limit: N.PAGE_SIZE, before: before });
    loading = false;
    if (res.error) { lastError = res.error; render(); return; }
    lastError = null;
    if (res.rows.length < N.PAGE_SIZE) exhausted = true;
    // de-dupe by id: a notification published mid-scroll could otherwise
    // arrive in two pages
    var seen = {};
    rows = rows.concat(res.rows).filter(function (r) {
      if (seen[r.id]) return false; seen[r.id] = true; return true;
    });
    render();
  }

  async function markAll() {
    var btn = document.getElementById('fs-np-allread');
    if (btn) btn.disabled = true;
    var was = rows.map(function (r) { return r.is_read; });
    rows.forEach(function (r) { r.is_read = true; });   // optimistic
    render();
    var okay = await N.markAllRead();
    if (!okay) {
      rows.forEach(function (r, i) { r.is_read = was[i]; });   // reconcile
      render();
      if (typeof toast === 'function') toast('Could not mark those as read');
      N.unreadCount(true).then(paintBadge);
    }
    if (btn) btn.disabled = false;
  }

  async function markOne(id) {
    var row = rows.filter(function (r) { return String(r.id) === String(id); })[0];
    if (!row || row.is_read) return;
    row.is_read = true;                                   // optimistic
    render();
    var okay = await N.markRead(id);
    if (!okay) {
      row.is_read = false;
      render();
      N.unreadCount(true).then(paintBadge);
    }
  }

  // ── interaction ──────────────────────────────────────────────────────────

  function onListClick(e) {
    var older = e.target.closest && e.target.closest('.fs-np-more');
    if (older) { load(true); return; }
    var retry = e.target.closest && e.target.closest('.fs-np-retry');
    if (retry) { lastError = null; load(); return; }

    var link = e.target.closest && e.target.closest('.fs-np-action');
    var item = e.target.closest && e.target.closest('.fs-np-item');
    if (!item) return;
    var id = item.dataset.id;
    var row = rows.filter(function (r) { return String(r.id) === String(id); })[0];

    if (link) {
      // following the link is unambiguous intent — mark it, then let the
      // browser navigate; no preventDefault, so cmd-click still opens a tab
      N.track('notification_action_clicked', id, row && row.notification_type);
      markOne(id);
      return;
    }
    // Expansion lives on the ROW, not the element. Marking read re-renders
    // the list, which replaces the DOM — toggling a class here meant a click
    // opened the notification and it snapped shut a moment later.
    if (!row) return;
    row._open = !row._open;
    render();
    if (row._open) {
      N.track('notification_viewed', id, row && row.notification_type);
      markOne(id);
    }
  }

  // ── render ───────────────────────────────────────────────────────────────

  function render() {
    if (!listEl) return;

    if (lastError) {
      listEl.innerHTML =
        '<div class="fs-np-state">'
        + '<span class="material-symbols-sharp">error</span>'
        + '<p>Couldn’t load your notifications.</p>'
        + '<button type="button" class="btn-secondary fs-np-retry">Try again</button>'
        + '</div>';
      return;
    }
    if (loading && !rows.length) {
      listEl.innerHTML = '<div class="fs-np-skel"></div><div class="fs-np-skel"></div><div class="fs-np-skel"></div>';
      return;
    }
    if (!rows.length) {
      listEl.innerHTML =
        '<div class="fs-np-state">'
        + '<span class="material-symbols-sharp">notifications</span>'
        + '<p>Nothing new yet.</p>'
        + '<span class="fs-np-state-sub">Announcements from Flow School will show up here.</span>'
        + '</div>';
      return;
    }

    listEl.innerHTML = rows.map(item).join('')
      + (exhausted
          ? ''
          : '<button type="button" class="fs-np-more">Show older</button>');

    var anyUnread = rows.some(function (r) { return !r.is_read; });
    var all = document.getElementById('fs-np-allread');
    if (all) all.hidden = !anyUnread;
  }

  function item(r) {
    var href = N.safeHref(r.link_url);
    var ext = href && N.isExternal(href);
    var label = r.link_label || (ext ? 'Open link' : 'Take a look');
    return '<article class="fs-np-item' + (r.is_read ? ' read' : ' unread')
      + (r._open ? ' expanded' : '') + '" data-id="' + r.id + '"'
      + ' tabindex="0" role="button" aria-expanded="' + (r._open ? 'true' : 'false') + '">'
      + '<div class="fs-np-item-top">'
      +   '<span class="fs-np-type">' + esc(N.typeLabel(r.notification_type)) + '</span>'
      // never colour alone: unread also says so, and reads out
      +   (r.is_read ? '' : '<span class="fs-np-new">New</span>')
      +   '<time class="fs-np-when" datetime="' + esc(r.published_at || '') + '"'
      +     ' title="' + esc(N.exact(r.published_at)) + '">' + esc(N.relative(r.published_at)) + '</time>'
      + '</div>'
      // Collapsed, the row is a headline and a chevron — the panel scans as a
      // list of what happened rather than a wall of paragraphs. The chevron is
      // the affordance that says the rest is behind a tap.
      + '<div class="fs-np-item-head">'
      +   '<h3 class="fs-np-item-title">' + esc(r.title) + '</h3>'
      +   '<span class="fs-np-chev material-symbols-sharp" aria-hidden="true">expand_more</span>'
      + '</div>'
      + '<div class="fs-np-item-detail">'
      +   '<p class="fs-np-item-msg">' + esc(r.message) + '</p>'
      + (href
          ? '<a class="fs-np-action" href="' + esc(href) + '"'
            + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>'
            + esc(label)
            + '<span class="material-symbols-sharp">' + (ext ? 'open_in_new' : 'arrow_forward') + '</span></a>'
          : '')
      + '</div>'
      + '</article>';
  }

  // keyboard: the item is a button, so it must answer to Enter and Space
  document.addEventListener('keydown', function (e) {
    if (!isOpen()) return;
    if (e.key === 'Escape') { close(); return; }
    var it = document.activeElement && document.activeElement.classList
             && document.activeElement.classList.contains('fs-np-item')
             ? document.activeElement : null;
    if (it && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      // click() runs the same handler, which re-renders from the row state —
      // so the element `it` points at is stale by the time this returns.
      // aria-expanded is set in item(); setting it here would write to a
      // detached node. Move focus onto the replacement so the keyboard keeps
      // its place.
      var id = it.dataset.id;
      it.click();
      var fresh = panel.querySelector('.fs-np-item[data-id="' + id + '"]');
      if (fresh) fresh.focus({ preventScroll: true });
      return;
    }
    if (e.key === 'Tab') {
      var f = panel.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  });

  // nav.js calls this after it draws identity, on desktop and mobile alike
  window.fsNotifyMount = mount;
  window.fsNotifyPanel = { open: open, close: close, refresh: function () {
    if (isOpen()) { rows = []; exhausted = false; load(); }
  },
  // The admin composer's preview renders through THIS, not a copy of it.
  // A hand-built preview drifts the moment the item changes shape — which it
  // just did, when the body moved behind a chevron.
  renderItem: item };

  if (document.readyState !== 'loading') setTimeout(mount, 0);
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(mount, 0); });
})();
