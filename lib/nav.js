// ─── FLOW SCHOOL — Global Nav Component ──────────────────────────────────────
//
// Injects the sidebar nav into every page and handles auth state.
// Include via <script src="lib/nav.js"></script> — no other markup needed.
// The sidebar, toggle button, and overlay are all injected automatically.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  var STORAGE_KEY = 'sb-zizuopmcpzicbwngjagp-auth-token';

  // ── Navigation structure ──────────────────────────────────────────────────

  var NAV = [
    { id: 'dashboard',            href: 'index.html',                         icon: 'space_dashboard', label: 'Dashboard',          group: null },
    { id: 'elements-of-flow',     href: 'elements-of-flow-lab.html',          label: 'Elements of Flow Lab', group: 'Learn' },
    { id: 'movement-experiments', href: 'movement-experiment-generator.html', label: 'Movement Experiments', group: 'Practice' },
    { id: 'arbitrary-rules',      href: 'arbitrary-rule-generator.html',      label: 'Arbitrary Rules',      group: 'Practice' },
    { id: 'breath-pacer',         href: 'breath-pace-trainer.html',           label: 'Breath Pacer',         group: 'Practice' },
    { id: 'cue-lab',              href: 'v-ybp-d.html',                       label: 'Cue Lab',              group: 'Practice' },
    { id: 'playlist-builder',     href: 'playlist-builder.html',              label: 'Playlist Builder',     group: 'Create' },
    { id: 'shorthand-library',    href: 'shorthand-library.html',             label: 'Shorthand Library',    group: 'Create' },
    { id: 'flow-checker',         href: 'flow-checker.html',                  label: 'Flow Checker',         group: 'Create' },
  ];

  var PAGE_IDS = {
    'index.html':                         'dashboard',
    'dashboard.html':                     'dashboard',
    'elements-of-flow-lab.html':          'elements-of-flow',
    'movement-experiment-generator.html': 'movement-experiments',
    'arbitrary-rule-generator.html':      'arbitrary-rules',
    'breath-pace-trainer.html':           'breath-pacer',
    'v-ybp-d.html':                       'cue-lab',
    'playlist-builder.html':              'playlist-builder',
    'shorthand-library.html':             'shorthand-library',
    'flow-checker.html':                  'flow-checker',
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

    groupOrder.forEach(function (group) {
      var items = groups[group];
      var links = items.map(function (item) {
        return '<a href="' + item.href + '" class="nav-item' + (activeId === item.id ? ' active' : '') + '">' + item.label + '</a>';
      }).join('');

      html += '<div class="nav-section">'
        + '<button class="nav-section-toggle" aria-expanded="true">'
        + group
        + '<span class="material-symbols-sharp nav-chevron">expand_more</span>'
        + '</button>'
        + '<div class="nav-section-items">' + links + '</div>'
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
      + '<a href="index.html" class="sidebar-logo">Flow School</a>'
      + '<span class="beta-tag">Beta</span>'
      + '</div>'
      + '<nav class="sidebar-nav">' + buildNavHTML(activeId) + '</nav>'
      + '<div class="sidebar-footer"><div class="hdr-auth" id="hdr-auth"></div></div>';

    document.body.prepend(sidebar);
    document.body.prepend(overlay);
    document.body.prepend(toggleBtn);

    function closeSidebar() {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
      toggleBtn.innerHTML = '<span class="material-symbols-sharp">menu</span>';
    }

    toggleBtn.addEventListener('click', function () {
      var isOpen = sidebar.classList.toggle('open');
      overlay.classList.toggle('show', isOpen);
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
      var email   = session.user.email || '';
      var initial = email.charAt(0).toUpperCase();
      el.innerHTML =
        '<a href="profile.html" class="nav-avatar-btn" title="Your profile"><span class="nav-initial">' + initial + '</span></a>'
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
    renderAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
