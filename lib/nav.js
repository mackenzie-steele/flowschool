// ─── FLOW SCHOOL — Global Nav Component ──────────────────────────────────────
//
// Injects the sidebar nav into every page and handles auth state.
// Include via <script src="lib/nav.js"></script> — no other markup needed.
// The sidebar, toggle button, and overlay are all injected automatically.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  var STORAGE_KEY = 'sb-zizuopmcpzicbwngjagp-auth-token';
  var VERSION = 'v2.2.1'; // single source — the footer and the sidebar plate both read this
  window.fsVersion = VERSION; // telemetry stamps error logs with it

  // ── Theme ─────────────────────────────────────────────────────────────────

  function initTheme() {
    var saved = localStorage.getItem('fs-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') || 'light';
    var next = current === 'light' ? 'dark' : 'light';
    document.documentElement.classList.add('theme-transitioning');
    setTimeout(function () {
      document.documentElement.classList.remove('theme-transitioning');
    }, 350);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('fs-theme', next);
  }

  // Apply theme before first paint
  initTheme();

  // the switch itself lives on the profile page now — it calls this
  window.fsToggleTheme = toggleTheme;

  // ── Navigation structure ──────────────────────────────────────────────────

  var NAV = [
    { id: 'dashboard',            href: 'dashboard',                         icon: 'space_dashboard', label: 'Dashboard',            group: null },
    { id: 'class-writer',         href: 'your-classes',                  icon: 'edit_document',   label: 'Your Classes',         group: 'Create' },
    { id: 'your-flows',           href: 'your-flows',                    icon: 'airline_stops',   label: 'Your Flows',           group: 'Create' },
    { id: 'your-stories',         href: 'stories',                       icon: 'library_books',   label: 'Your Stories',         group: 'Create' },
    { id: 'movement-experiments', href: 'movement-experiments',          icon: 'gesture',         label: 'Movement Experiments', group: 'Play' },
    { id: 'arbitrary-rules',      href: 'arbitrary-rules',               icon: 'casino',          label: 'Arbitrary Rules',      group: 'Play' },
    { id: 'breath-pacer',         href: 'breath-pace',                   icon: 'air',             label: 'Breath Pace',          group: 'Play' },
    { id: 'pose-connector',       href: 'pose-popcorn',                  icon: 'conversion_path', label: 'Pose Popcorn',         group: 'Play' },
    { id: 'story-starters',       href: 'story-starters',                icon: 'auto_stories',    label: 'Story Starters',       group: 'Play' },
    { id: 'pose-library',         href: 'pose-library',                 icon: 'book',            label: 'Pose Library',         group: 'Plan' },
    { id: 'flow-checker',         href: 'elements-of-flow',              icon: 'checklist',       label: 'Elements of Flow',     group: 'Plan' },
    { id: 'cue-worksheet',        href: 'verb-your-body-part-direction', icon: 'edit_note',       label: 'V/YBP/D', group: 'Plan' },
    { id: 'playlist-builder',     href: 'playlist-builder',              icon: 'queue_music',     label: 'Playlist Builder',     group: 'Plan' },
    { id: 'teaching-log',         href: 'teaching-log',                  icon: 'history_edu',     label: 'Teaching Log',         group: 'Refine' },
  ];

  var PAGE_IDS = {
    'dashboard.html':                         'dashboard',
    'movement-experiments.html': 'movement-experiments',
    'arbitrary-rules.html':      'arbitrary-rules',
    'breath-pace.html':           'breath-pacer',
    'verb-your-body-part-direction.html':                 'cue-worksheet',
    'playlist-builder.html':              'playlist-builder',
    'pose-library.html':                  'pose-library',
    'teaching-log.html':                  'teaching-log',
    'elements-of-flow.html':                  'flow-checker',
    'pose-popcorn.html':                  'pose-connector',
    'story-starters.html':                'story-starters',
    'stories.html':                       'your-stories',
    'your-classes.html':                  'class-writer',
    'your-flows.html':                    'your-flows',
    'saved.html':                         'saved',
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  function currentPageId() {
    var file = window.location.pathname.split('/').pop() || 'dashboard.html';
    if (file && file.indexOf('.') === -1) file += '.html'; // clean URLs (Vercel cleanUrls)
    return PAGE_IDS[file] || '';
  }

  function buildNavHTML(activeId) {
    var groups = {};
    var groupOrder = [];
    var standalone = [];

    NAV.forEach(function (item) {
      if (!item.group) {
        standalone.push(item);
      } else {
        if (!groups[item.group]) {
          groups[item.group] = [];
          groupOrder.push(item.group);
        }
        groups[item.group].push(item);
      }
    });

    // a row carries the full active signature: wash + accent icon + LED dot
    function navLink(item) {
      var on = activeId === item.id;
      return '<a href="' + item.href + '" class="nav-item' + (on ? ' active' : '') + '">'
        + (item.icon ? '<span class="material-symbols-sharp">' + item.icon + '</span>' : '')
        + item.label
        + (on ? '<span class="nav-dot"></span>' : '')
        + '</a>';
    }

    var html = '';

    standalone.forEach(function (item) {
      html += '<div class="nav-section">' + navLink(item) + '</div>';
    });

    // groups are always open — the map never rearranges itself
    groupOrder.forEach(function (group) {
      html += '<div class="nav-section">'
        + '<span class="nav-section-label">' + group + '</span>'
        + '<div class="nav-section-items">' + groups[group].map(navLink).join('') + '</div>'
        + '</div>';
    });

    return html;
  }

  // ── Mobile bottom sheet ───────────────────────────────────────────────────
  // The phone's menu. Groups stay open (collapse is a desktop coping
  // mechanism); Dashboard and Saved live in the quiet footer row.

  function buildSheetHTML(activeId) {
    var groups = {};
    var groupOrder = [];
    NAV.forEach(function (item) {
      if (!item.group) return;
      if (!groups[item.group]) { groups[item.group] = []; groupOrder.push(item.group); }
      groups[item.group].push(item);
    });

    var html = '<div class="ns-drag" id="ns-drag" aria-hidden="true"><div class="ns-grabber"></div></div>'
      + '<div class="ns-identity" id="ns-identity"></div>'
      + '<nav class="ns-groups">';

    groupOrder.forEach(function (group) {
      html += '<div class="ns-eyebrow">' + group + '</div>';
      groups[group].forEach(function (item) {
        var on = activeId === item.id;
        html += '<a href="' + item.href + '" class="ns-row' + (on ? ' on' : '') + '">'
          + '<span class="material-symbols-sharp">' + item.icon + '</span>'
          + '<span class="ns-label">' + item.label + '</span>'
          + (on ? '<span class="ns-dot"></span>' : '')
          + '</a>';
      });
    });

    // the dock — one full-width home bar anchoring the sheet
    html += '</nav>'
      + '<a href="dashboard" class="ns-home' + (activeId === 'dashboard' ? ' on' : '') + '">'
      + '<span class="material-symbols-sharp">space_dashboard</span>Dashboard</a>';

    return html;
  }

  // identity row — avatar, name, email (tap → profile), theme switch at right
  function renderSheetIdentity() {
    var el = document.getElementById('ns-identity');
    if (!el) return;
    var session = getSession();
    if (!(session && session.user)) { el.innerHTML = ''; return; }
    var email   = session.user.email || '';
    var meta    = session.user.user_metadata || {};
    var name    = localStorage.getItem('fs-display-name') || meta.full_name || meta.name || '';
    var initial = (name || email).charAt(0).toUpperCase();
    var avatar  = localStorage.getItem('fs-avatar-url') || '';
    var circle  = avatar
      ? '<span class="nav-initial"><img src="' + avatar + '" alt=""></span>'
      : '<span class="nav-initial">' + initial + '</span>';
    el.innerHTML =
      '<a href="profile" class="ns-person" title="Your profile">'
      + circle
      + '<span class="ns-person-id">'
      +   (name ? '<span class="ns-person-name">' + name + '</span>' : '')
      +   '<span class="ns-person-email">' + email + '</span>'
      + '</span>'
      + '</a>'
      + '<button type="button" class="ns-feedback-btn" aria-label="Send feedback">'
      + '<span class="material-symbols-sharp">rate_review</span>'
      + '</button>';
  }

  // ── Feedback — one quiet door, always open ──────────────────────────────
  // One required field. The chips only change the placeholder; the context
  // (page, version, device) attaches silently and is disclosed honestly.

  var FB_TITLES = {
    bug:  'What broke?',
    idea: 'What should exist?',
    love: 'Say it out loud.',
  };
  var FB_PLACEHOLDERS = {
    bug:  'What happened? What did you expect instead?',
    idea: 'What would make this better?',
    love: 'Go on, we’re listening…',
  };
  var FB_THANKS = {
    bug:  'Thank you. We read every single one — if we need more detail, we’ll email you.',
    idea: 'Thank you. The best parts of this platform started as notes like yours.',
    love: 'That made our day. Thank you.',
  };
  var fbKind = 'bug';
  var fbSetKind = null;

  function fbPlatform() {
    var ua = navigator.userAgent;
    if (/iPad/.test(ua)) return 'iPad';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/Android/.test(ua)) return 'Android';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Win/.test(ua)) return 'Windows';
    return 'device';
  }

  function injectFeedback() {
    var modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'fb-modal';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="modal-card fb-card" role="dialog" aria-modal="true" aria-label="Send feedback">'
      + '<span class="fb-eyebrow">Feedback</span>'
      + '<h3 class="fb-title" id="fb-title">' + FB_TITLES.bug + '</h3>'
      + '<div class="fb-chips" id="fb-chips">'
      +   '<button type="button" class="fb-chip on" data-kind="bug"><span class="fb-chip-dot"></span>Bug</button>'
      +   '<button type="button" class="fb-chip" data-kind="idea"><span class="fb-chip-dot"></span>Idea</button>'
      +   '<button type="button" class="fb-chip" data-kind="love"><span class="fb-chip-dot"></span>Love note</button>'
      + '</div>'
      + '<textarea class="fb-text" id="fb-text" rows="5" placeholder="' + FB_PLACEHOLDERS.bug + '"></textarea>'
      + '<p class="fb-fine" id="fb-fine"></p>'
      + '<div class="fb-error" id="fb-error"></div>'
      + '<div class="modal-actions" id="fb-actions">'
      +   '<button type="button" class="btn-ghost" id="fb-cancel">Cancel</button>'
      +   '<button type="button" class="btn-primary" id="fb-send">Send it</button>'
      + '</div>'
      + '<div class="fb-thanks" id="fb-thanks" hidden>'
      +   '<span class="fb-thanks-row"><span class="fb-thanks-dot"></span><span class="fb-thanks-eyebrow">Received</span></span>'
      +   '<p class="fb-thanks-msg" id="fb-thanks-msg"></p>'
      + '</div>'
      + '</div>';
    document.body.appendChild(modal);

    function setKind(kind) {
      fbKind = kind;
      modal.querySelectorAll('.fb-chip').forEach(function (c) {
        c.classList.toggle('on', c.dataset.kind === kind);
      });
      document.getElementById('fb-text').placeholder = FB_PLACEHOLDERS[kind];
      // the title answers the chip — a quiet cross-fade, no theater
      var title = document.getElementById('fb-title');
      if (title.textContent !== FB_TITLES[kind]) {
        title.style.opacity = '0';
        setTimeout(function () {
          title.textContent = FB_TITLES[kind];
          title.style.opacity = '1';
        }, 110);
      }
    }
    fbSetKind = setKind;

    document.getElementById('fb-chips').addEventListener('click', function (e) {
      var chip = e.target.closest('.fb-chip');
      if (chip) setKind(chip.dataset.kind);
    });

    function closeModal() { modal.hidden = true; }
    document.getElementById('fb-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });

    document.getElementById('fb-send').addEventListener('click', function () {
      var textEl = document.getElementById('fb-text');
      var text = textEl.value.trim();
      var errEl = document.getElementById('fb-error');
      errEl.textContent = '';
      if (!text) { textEl.focus(); return; }

      var session = getSession();
      if (!session) { errEl.textContent = 'You’re signed out — sign in and try again.'; return; }

      var btn = document.getElementById('fb-send');
      btn.disabled = true;
      btn.textContent = 'Sending…';

      fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({
          kind: fbKind,
          message: text,
          context: {
            page: window.location.pathname,
            tool: currentPageId() || 'unknown',
            version: VERSION,
            theme: document.documentElement.getAttribute('data-theme') || 'light',
            platform: fbPlatform(),
            viewport: window.innerWidth + 'x' + window.innerHeight,
            ua: navigator.userAgent,
          },
        }),
      }).then(function (resp) {
        return resp.json().catch(function () { return {}; }).then(function (data) {
          btn.disabled = false;
          btn.textContent = 'Send it';
          if (!resp.ok) {
            errEl.textContent = (data && data.error) || 'Couldn’t send — try again in a moment.';
            return;
          }
          // the thank-you — a received transmission, then the card lets itself out
          textEl.value = '';
          document.getElementById('fb-chips').hidden = true;
          textEl.hidden = true;
          document.getElementById('fb-fine').hidden = true;
          document.getElementById('fb-actions').hidden = true;
          var thanks = document.getElementById('fb-thanks');
          document.getElementById('fb-thanks-msg').textContent = FB_THANKS[fbKind];
          thanks.hidden = false;
          setTimeout(function () {
            closeModal();
            document.getElementById('fb-chips').hidden = false;
            textEl.hidden = false;
            document.getElementById('fb-fine').hidden = false;
            document.getElementById('fb-actions').hidden = false;
            thanks.hidden = true;
            setKind('bug');
          }, 2400);
        });
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = 'Send it';
        errEl.textContent = 'Couldn’t send — try again in a moment.';
      });
    });

    // ⌘/Ctrl + Enter sends — no hint text, it's just there for those who try
    document.getElementById('fb-text').addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('fb-send').click();
      }
    });
  }

  function openFeedback(kind) {
    var modal = document.getElementById('fb-modal');
    if (!modal) return;
    if (kind && fbSetKind) fbSetKind(kind);
    var session = getSession();
    var email = session && session.user ? session.user.email : '';
    document.getElementById('fb-fine').textContent =
      email ? 'we’ll reply to ' + email : '';
    document.getElementById('fb-error').textContent = '';
    modal.hidden = false;
    document.getElementById('fb-text').focus();
  }

  // ── Sidebar injection ─────────────────────────────────────────────────────

  function injectSidebar() {
    var activeId = currentPageId();

    // both glyphs live in the button; open/close cross-fades them in place
    var toggleBtn = document.createElement('button');
    toggleBtn.className = 'sidebar-toggle';
    toggleBtn.id = 'sidebar-toggle';
    toggleBtn.setAttribute('aria-label', 'Open navigation');
    toggleBtn.innerHTML =
      '<span class="material-symbols-sharp nav-tg-icon nav-tg-menu">grid_view</span>'
      + '<span class="material-symbols-sharp nav-tg-icon nav-tg-close">close</span>';

    var overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.id = 'sidebar-overlay';

    var sidebar = document.createElement('aside');
    sidebar.className = 'app-sidebar';
    sidebar.id = 'app-sidebar';
    sidebar.innerHTML =
      '<div class="sidebar-logo-wrap">'
      + '<a href="dashboard" class="sidebar-logo">'
      + '<img src="img/flow-school-logo_black.png" class="sidebar-logo-img logo-light" alt="Flow School">'
      + '<img src="img/flow-school-logo_white.png" class="sidebar-logo-img logo-dark" alt="Flow School">'
      + '</a>'
      + '<span class="beta-tag">Beta</span>'
      + '</div>'
      + '<nav class="sidebar-nav">' + buildNavHTML(activeId) + '</nav>'
      + '<div class="sidebar-footer">'
      + '<div class="hdr-auth sidebar-identity" id="hdr-auth"></div>'
      + '<div class="sidebar-meta">'
      + '<span class="sidebar-version">' + VERSION + '</span>'
      + '<button type="button" class="sidebar-feedback" id="sidebar-feedback">'
      + '<span class="material-symbols-sharp">rate_review</span>Feedback</button>'
      + '</div>'
      + '</div>';

    // the mobile bottom sheet (desktop never shows it)
    var sheet = document.createElement('div');
    sheet.className = 'nav-sheet';
    sheet.id = 'nav-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Menu');
    sheet.tabIndex = -1;
    sheet.innerHTML = buildSheetHTML(activeId);

    // mobile brand mark — in flow at the top of the page (not sticky),
    // since the phone menu no longer carries the logo
    var brand = document.createElement('a');
    brand.className = 'mobile-brand';
    brand.href = 'dashboard';
    brand.setAttribute('aria-label', 'Flow School');
    brand.innerHTML =
      '<img src="img/flow-school-logo_black.png" class="logo-light" alt="Flow School">'
      + '<img src="img/flow-school-logo_white.png" class="logo-dark" alt="Flow School">'
      + '<span class="beta-tag">Beta</span>';

    document.body.prepend(sidebar);
    document.body.prepend(sheet);
    document.body.prepend(overlay);
    document.body.prepend(toggleBtn);
    document.body.prepend(brand);

    // iOS-proof scroll lock — overflow:hidden alone leaks on Safari, so the
    // body is pinned in place at its scroll position and restored on close
    var lockedScrollY = 0;

    function lockScroll() {
      lockedScrollY = window.scrollY || 0;
      document.body.classList.add('sidebar-open');
      document.body.style.top = -lockedScrollY + 'px';
    }

    function unlockScroll() {
      document.body.classList.remove('sidebar-open');
      document.body.style.top = '';
      window.scrollTo(0, lockedScrollY);
    }

    function openSheet() {
      sheet.classList.add('open');
      overlay.classList.add('show');
      lockScroll();
      toggleBtn.setAttribute('aria-label', 'Close navigation');
      sheet.focus({ preventScroll: true });
    }

    function closeSheet() {
      sheet.classList.remove('open');
      overlay.classList.remove('show');
      unlockScroll();
      toggleBtn.setAttribute('aria-label', 'Open navigation');
      toggleBtn.focus({ preventScroll: true });
      // reset any drag-detent state so the next open starts at rest
      isFull = false;
      sheet.classList.remove('full');
      sheet.style.height = '';
      sheet.style.transform = '';
    }

    // ── the grabber is a live handle ────────────────────────────────────────
    // One axis: visible height V ∈ [0 … full]. Detents: 0 (closed),
    // rest (natural height), full (whole screen). Above rest the sheet
    // GROWS (top edge rides the finger, dock stays put); below rest it
    // SLIDES down rigidly toward dismissal.
    var drag = null;
    var isFull = false;
    var restH = 0;

    window.addEventListener('resize', function () { restH = 0; });

    function metrics() {
      var full = window.innerHeight;
      if (!restH) {
        // measure the rest detent from the laid-out sheet (transform-free)
        var h = sheet.getBoundingClientRect().height;
        restH = Math.min(h || full * .6, full * .85);
      }
      return { full: full, rest: restH };
    }

    function setVisible(v, m) {
      if (v >= m.rest) {          // expanding — grow the sheet
        sheet.style.transform = 'translateY(0)';
        sheet.style.height = v + 'px';
      } else {                    // dismissing — slide it down whole
        sheet.style.height = m.rest + 'px';
        sheet.style.transform = 'translateY(' + (m.rest - v) + 'px)';
      }
    }

    var dragZone = sheet.querySelector('.ns-drag');

    dragZone.addEventListener('pointerdown', function (e) {
      if (!sheet.classList.contains('open')) return;
      var m = metrics();
      drag = {
        startY: e.clientY,
        baseV: isFull ? m.full : m.rest,
        m: m,
        v: null,
        samples: [{ t: e.timeStamp, y: e.clientY }],
      };
      sheet.classList.add('dragging');
      try { dragZone.setPointerCapture(e.pointerId); } catch (err) {}
    });

    dragZone.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var v = Math.max(0, Math.min(drag.m.full, drag.baseV - (e.clientY - drag.startY)));
      setVisible(v, drag.m);
      drag.v = v;
      drag.samples.push({ t: e.timeStamp, y: e.clientY });
      if (drag.samples.length > 6) drag.samples.shift();
    });

    function endDrag() {
      if (!drag) return;
      var m = drag.m;
      var v = drag.v == null ? drag.baseV : drag.v;
      // velocity over the last few samples (px/ms; positive = downward)
      var s = drag.samples;
      var vel = 0;
      if (s.length > 1) {
        var a = s[0], b = s[s.length - 1];
        if (b.t > a.t) vel = (b.y - a.y) / (b.t - a.t);
      }
      drag = null;
      sheet.classList.remove('dragging');

      var target;
      if (vel > .5)       target = v > m.rest ? m.rest : 0;   // flick down: one detent down
      else if (vel < -.5) target = m.full;                    // flick up: full screen
      else if (v < m.rest) target = v < m.rest * .7 ? 0 : m.rest;  // nearest below rest
      else target = (v - m.rest < m.full - v) ? m.rest : m.full;   // nearest above rest

      if (target === 0) {
        setVisible(0, m);                     // ride the transition down…
        setTimeout(closeSheet, 260);          // …then finish the close
        return;
      }
      isFull = target === m.full;
      sheet.classList.toggle('full', isFull);
      setVisible(target, m);
    }

    dragZone.addEventListener('pointerup', endDrag);
    dragZone.addEventListener('pointercancel', endDrag);

    toggleBtn.addEventListener('click', function () {
      if (sheet.classList.contains('open')) closeSheet();
      else openSheet();
    });

    overlay.addEventListener('click', closeSheet);
    // (desktop groups no longer collapse — no section-toggle wiring needed)

    document.addEventListener('keydown', function (e) {
      if (!sheet.classList.contains('open')) return;
      if (e.key === 'Escape') { closeSheet(); return; }
      // focus trap — Tab cycles inside the sheet while it's up
      if (e.key === 'Tab') {
        var focusables = sheet.querySelectorAll('a[href], button:not([disabled])');
        if (!focusables.length) return;
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        } else if (!sheet.contains(document.activeElement)) {
          e.preventDefault(); first.focus();
        }
      }
    });

    // sheet actions — delegated so identity re-renders keep working
    sheet.addEventListener('click', function (e) {
      if (e.target.closest('.ns-feedback-btn')) {
        closeSheet();
        openFeedback();
      }
    });

    // desktop door
    var fbDoor = document.getElementById('sidebar-feedback');
    if (fbDoor) fbDoor.addEventListener('click', function () { openFeedback(); });

  }

  // ── Auth state ────────────────────────────────────────────────────────────

  function getSession() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data.expires_at && data.expires_at < Date.now() / 1000) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function signOut() {
    var finish = function () {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('fs-display-name');
        localStorage.removeItem('fs-avatar-url');
      } catch (e) {}
      window.location.href = 'login';
    };
    // push any pending edits up to the account before clearing the cache
    if (window.fsSync) {
      try { fsSync.signOutCleanup().then(finish, finish); return; } catch (e) {}
    }
    finish();
  }

  function renderAuth() {
    var el = document.getElementById('hdr-auth');
    if (!el) return;
    var session = getSession();
    if (session && session.user) {
      var email    = session.user.email || '';
      var meta     = session.user.user_metadata || {};
      // display name comes from the profile (cached locally by
      // profile.html), then auth metadata; the initial follows it
      var name     = localStorage.getItem('fs-display-name') || meta.full_name || meta.name || '';
      var initial  = (name || email).charAt(0).toUpperCase();
      var avatar   = localStorage.getItem('fs-avatar-url') || '';
      var circle   = avatar
        ? '<span class="nav-initial"><img src="' + avatar + '" alt=""></span>'
        : '<span class="nav-initial">' + initial + '</span>';
      el.innerHTML =
        '<a href="profile" class="nav-avatar-btn" title="Your profile">'
        + circle
        + '<span class="nav-user-id">'
        +   (name ? '<span class="nav-user-name">' + name + '</span>' : '')
        +   '<span class="nav-user-email">' + email + '</span>'
        + '</span>'
        + '</a>';
    } else {
      el.innerHTML =
        '<div class="nav-auth-btns">'
        + '<a href="login" class="btn-ghost nav-signin">Sign in</a>'
        + '<a href="signup" class="btn-nav-signup">Sign up</a>'
        + '</div>';
    }
  }

  window.fsNavRefreshAuth = function () {
    renderAuth();
    renderSheetIdentity();
  };

  // ── Site footer ───────────────────────────────────────────────────────────

  var FOOTER_TEXT = 'Flow School \u00B7 Tools for Yoga Teachers \u00B7 ' + VERSION;

  function injectFooter() {
    var footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.textContent = FOOTER_TEXT;
    // after <main>, not inside it — some pages' <main> IS the padded .wrap,
    // and a footer inside it would hug the content above the wrap's padding
    var main = document.querySelector('main');
    if (main) { main.insertAdjacentElement('afterend', footer); }
    else { document.body.appendChild(footer); }
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    injectSidebar();
    injectFeedback();
    renderAuth();
    renderSheetIdentity();
    // the footer needs the full document parsed (it appends to <main>)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectFooter);
    } else {
      injectFooter();
    }
  }

  // Runs immediately rather than waiting for DOMContentLoaded — injectSidebar()
  // only needs document.body to exist (true as soon as the parser reaches this
  // script tag), and every element init() touches is one it just created
  // itself. Waiting for the whole document to finish parsing is exactly what
  // made the sidebar visibly pop in after the rest of the page had already
  // painted.
  init();
})();
