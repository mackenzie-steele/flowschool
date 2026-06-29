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
    var saved = localStorage.getItem('fs-theme') || 'light';
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
    { id: 'dashboard',            href: 'index.html',                         icon: 'space_dashboard', label: 'Dashboard',          group: null },
    { id: 'playlist-builder',     href: 'playlist-builder.html',              icon: 'queue_music',      label: 'Playlist Builder',     group: 'Create' },
    { id: 'shorthand-library',    href: 'shorthand-library.html',             icon: 'book',             label: 'Shorthand Library',    group: 'Create' },
    { id: 'flow-checker',         href: 'flow-checker.html',                  icon: 'checklist',        label: 'Flow Checker',         group: 'Create' },
    { id: 'movement-experiments', href: 'movement-experiment-generator.html', icon: 'gesture',          label: 'Movement Experiments', group: 'Practice' },
    { id: 'arbitrary-rules',      href: 'arbitrary-rule-generator.html',      icon: 'casino',           label: 'Arbitrary Rules',      group: 'Practice' },
    { id: 'breath-pacer',         href: 'breath-pace-trainer.html',           icon: 'air',              label: 'Breath Pacer',         group: 'Practice' },
    { id: 'cue-worksheet',        href: 'cue-worksheet.html',                 icon: 'edit_note',        label: 'Cue Worksheet',        group: 'Practice' },
  ];

  var PAGE_IDS = {
    'index.html':                         'dashboard',
    'dashboard.html':                     'dashboard',
    'elements-of-flow-lab.html':          'elements-of-flow',
    'movement-experiment-generator.html': 'movement-experiments',
    'arbitrary-rule-generator.html':      'arbitrary-rules',
    'breath-pace-trainer.html':           'breath-pacer',
    'cue-worksheet.html':                 'cue-worksheet',
    'v-ybp-d.html':                       'cue-lab',
    'playlist-builder.html':              'playlist-builder',
    'shorthand-library.html':             'shorthand-library',
    'flow-checker.html':                  'flow-checker',
    'saved.html':                         'saved',
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  function currentPageId() {
    var file = window.location.pathname.split('/').pop() || 'index.html';
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

  // ── Sidebar injection ─────────────────────────────────────────────────────

  function injectSidebar() {
    var activeId = currentPageId();

    var toggleBtn = document.createElement('button');
    toggleBtn.className = 'sidebar-toggle';
    toggleBtn.id = 'sidebar-toggle';
    toggleBtn.setAttribute('aria-label', 'Open navigation');
    toggleBtn.innerHTML = '<span class="material-symbols-sharp">menu</span>';

    var overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.id = 'sidebar-overlay';

    var sidebar = document.createElement('aside');
    sidebar.className = 'app-sidebar';
    sidebar.id = 'app-sidebar';
    sidebar.innerHTML =
      '<div class="sidebar-logo-wrap">'
      + '<a href="index.html" class="sidebar-logo">'
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

    document.body.prepend(sidebar);
    document.body.prepend(overlay);
    document.body.prepend(toggleBtn);

    function closeSidebar() {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
      document.body.classList.remove('sidebar-open');
      toggleBtn.innerHTML = '<span class="material-symbols-sharp">menu</span>';
    }

    toggleBtn.addEventListener('click', function () {
      var isOpen = sidebar.classList.toggle('open');
      overlay.classList.toggle('show', isOpen);
      document.body.classList.toggle('sidebar-open', isOpen);
      toggleBtn.innerHTML = isOpen
        ? '<span class="material-symbols-sharp">close</span>'
        : '<span class="material-symbols-sharp">menu</span>';
    });

    overlay.addEventListener('click', closeSidebar);

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
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    window.location.href = 'login.html';
  }

  function renderAuth() {
    var el = document.getElementById('hdr-auth');
    if (!el) return;
    var session = getSession();
    if (session && session.user) {
      var email    = session.user.email || '';
      var meta     = session.user.user_metadata || {};
      var name     = meta.full_name || meta.name || email;
      var initial  = email.charAt(0).toUpperCase();
      el.innerHTML =
        '<a href="profile.html" class="nav-avatar-btn" title="Your profile">'
        + '<span class="nav-initial">' + initial + '</span>'
        + '<span class="nav-user-name">' + name + '</span>'
        + '</a>'
        + '<button class="nav-signout-btn" id="nav-signout-btn">Sign out</button>';
      var signOutBtn = el.querySelector('#nav-signout-btn');
      if (signOutBtn) signOutBtn.addEventListener('click', signOut);
    } else {
      el.innerHTML =
        '<div class="nav-auth-btns">'
        + '<a href="login.html" class="btn-ghost nav-signin">Sign in</a>'
        + '<a href="signup.html" class="btn-nav-signup">Sign up</a>'
        + '</div>';
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    injectSidebar();
    var themeToggle = document.getElementById('nav-theme-toggle');
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    renderAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
