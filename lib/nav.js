// ─── FLOW SCHOOL — Global Nav Component ──────────────────────────────────────
//
// Injects the sidebar nav into every page and handles auth state.
// Include via <script src="lib/nav.js"></script> — no other markup needed.
// The sidebar, toggle button, and overlay are all injected automatically.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  var STORAGE_KEY = 'sb-zizuopmcpzicbwngjagp-auth-token';

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

  // ── Nav group collapse persistence ───────────────────────────────────────

  var NAV_COLLAPSE_KEY = 'fs-nav-groups';

  function getCollapsedGroups() {
    try { return JSON.parse(localStorage.getItem(NAV_COLLAPSE_KEY) || '{}'); } catch (e) { return {}; }
  }

  function setGroupCollapsed(group, collapsed) {
    try {
      var state = getCollapsedGroups();
      state[group] = collapsed;
      localStorage.setItem(NAV_COLLAPSE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

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
    { id: 'cue-worksheet',        href: 'verb-your-body-part-direction', icon: 'edit_note',       label: 'Verb / Your Body Part / Direction', group: 'Plan' },
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

    var html = '';

    standalone.forEach(function (item) {
      html += '<div class="nav-section">'
        + '<a href="' + item.href + '" class="nav-item' + (activeId === item.id ? ' active' : '') + '">'
        + (item.icon ? '<span class="material-symbols-sharp">' + item.icon + '</span>' : '')
        + item.label
        + '</a></div>';
    });

    var collapsed = getCollapsedGroups();

    groupOrder.forEach(function (group) {
      var items = groups[group];
      var isCollapsed = collapsed[group] === true;
      var links = items.map(function (item) {
        return '<a href="' + item.href + '" class="nav-item' + (activeId === item.id ? ' active' : '') + '">'
          + (item.icon ? '<span class="material-symbols-sharp">' + item.icon + '</span>' : '')
          + item.label + '</a>';
      }).join('');

      html += '<div class="nav-section">'
        + '<button class="nav-section-toggle" aria-expanded="' + String(!isCollapsed) + '" data-group="' + group + '">'
        + group
        + '<span class="material-symbols-sharp nav-chevron">expand_more</span>'
        + '</button>'
        + '<div class="nav-section-items' + (isCollapsed ? ' collapsed' : '') + '">' + links + '</div>'
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

    var html = '<div class="ns-grabber" aria-hidden="true"></div>'
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
      + '<button type="button" class="nav-theme-switch" aria-label="Toggle theme">'
      + '<span class="material-symbols-sharp nav-ts-icon">light_mode</span>'
      + '<span class="nav-ts-rail"><span class="nav-ts-thumb"></span></span>'
      + '<span class="material-symbols-sharp nav-ts-icon">dark_mode</span>'
      + '</button>';
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
      + '<div class="nav-theme-row">'
      + '<span class="nav-theme-label">Appearance</span>'
      + '<button class="nav-theme-switch" id="nav-theme-toggle" aria-label="Toggle theme">'
      + '<span class="material-symbols-sharp nav-ts-icon" id="nav-ts-icon">light_mode</span>'
      + '<span class="nav-ts-rail"><span class="nav-ts-thumb"></span></span>'
      + '<span class="material-symbols-sharp nav-ts-icon" id="nav-ts-moon">dark_mode</span>'
      + '</button>'
      + '</div>'
      + '<div class="hdr-auth" id="hdr-auth"></div>'
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

    document.body.prepend(sidebar);
    document.body.prepend(sheet);
    document.body.prepend(overlay);
    document.body.prepend(toggleBtn);

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
    }

    toggleBtn.addEventListener('click', function () {
      if (sheet.classList.contains('open')) closeSheet();
      else openSheet();
    });

    overlay.addEventListener('click', closeSheet);

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
      if (e.target.closest('.nav-theme-switch')) toggleTheme();
    });

    sidebar.querySelectorAll('.nav-section-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        var items = btn.nextElementSibling;
        if (items) items.classList.toggle('collapsed', expanded);
        var group = btn.getAttribute('data-group');
        if (group) setGroupCollapsed(group, expanded);
      });
    });
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

  var FOOTER_TEXT = 'Flow School \u00B7 Tools for Yoga Teachers \u00B7 v2.1.1';

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
    var themeToggle = document.getElementById('nav-theme-toggle');
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
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
