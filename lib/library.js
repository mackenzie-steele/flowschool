// ─────────────────────────────────────────────────────────────────────────────
// lib/library.js — shared helpers for the library pages
// (Your Classes · Your Flows · Your Stories)
//
// Load after lib/nav.js and before the page's own <script>. Everything here
// is either pure or wires elements the library pages share by convention:
//   #sort-label          — the sort toggle's text
//   #discard-modal / #discard-yes / #discard-keep — the unsaved-changes modal
// ─────────────────────────────────────────────────────────────────────────────

// ── text ─────────────────────────────────────────────────────────────────────

function fsEsc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fsFmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fsAutoGrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// poses are separated by slashes (or lines) in the shorthand convention
function fsPoseCount(text) {
  return (text || '').split(/[\/\n]/).map(function (p) { return p.trim(); }).filter(Boolean).length;
}

// ── created ↔ edited stamps — one site-wide preference ──────────────────────

function fsDateMode() {
  return localStorage.getItem('fs-date-mode') === 'edited' ? 'edited' : 'created';
}

function fsToggleDateMode() {
  localStorage.setItem('fs-date-mode', fsDateMode() === 'edited' ? 'created' : 'edited');
}

function fsStampFor(obj) {
  var edited = fsDateMode() === 'edited';
  return {
    label: edited ? 'Edited' : 'Created',
    ts: edited ? (obj.editedAt || obj.id) : obj.id,
  };
}

// ── sorting — a preference per library ───────────────────────────────────────

function fsSortMode(key) {
  return localStorage.getItem(key) === 'created' ? 'created' : 'edited';
}

function fsSorterFor(mode) {
  return mode === 'edited'
    ? function (a, b) { return (b.editedAt || b.id) - (a.editedAt || a.id); }
    : function (a, b) { return b.id - a.id; };
}

function fsRenderSortLabel(mode) {
  var el = document.getElementById('sort-label');
  if (el) el.textContent = mode === 'edited' ? 'Recently Edited' : 'Recently Created';
}

// ── unsaved-changes modal ────────────────────────────────────────────────────
// Wires the shared #discard-modal once and returns confirm(cb);
// cb(true) = discard, cb(false) = keep editing.

function fsWireDiscardModal() {
  var pending = null;
  var modal = document.getElementById('discard-modal');

  function settle(discard) {
    modal.hidden = true;
    var cb = pending;
    pending = null;
    if (cb) cb(discard);
  }

  document.getElementById('discard-yes').addEventListener('click', function () { settle(true); });
  document.getElementById('discard-keep').addEventListener('click', function () { settle(false); });
  modal.addEventListener('click', function (e) {
    if (e.target === e.currentTarget) settle(false);
  });

  return function confirm(cb) {
    pending = cb;
    modal.hidden = false;
  };
}

// ── editorial empty state — the ghost of the future index ────────────────────

function fsGhostRows() {
  return '<div class="library-empty-ghost" aria-hidden="true">' +
    '<div class="library-empty-ghost-row"><i></i><i></i></div>' +
    '<div class="library-empty-ghost-row"><i></i><i></i></div>' +
    '<div class="library-empty-ghost-row"><i></i><i></i></div>' +
    '</div>';
}

// ── custom shorthand — the teacher's own codes ───────────────────────────────

function fsCustomShorthand() {
  try { return JSON.parse(localStorage.getItem('flowschool_shorthand') || '[]'); } catch (_) { return []; }
}

// every write goes through here — the sync layer slots in at this seam
function fsSaveCustomShorthand(list) {
  localStorage.setItem('flowschool_shorthand', JSON.stringify(list));
}

function fsShorthandAll() {
  var base = typeof SHORTHAND === 'undefined' ? [] : SHORTHAND;
  return base.concat(fsCustomShorthand());
}

// ── shorthand suggest — the platform's signature completion ─────────────────
// Caret-anchored panel over an auto-growing textarea. Tab inserts the
// top (or armed) match, arrows arm, Enter only when armed, Esc
// dismisses for the current token. cfg:
//   container   — element (or selector) the panel positions within
//   sep(el)     — separator appended after an inserted code (default ' / ')
//   afterInsert — optional callback(el) after an insert lands

function fsShorthandSuggest(cfg) {
  var container = typeof cfg.container === 'string'
    ? document.querySelector(cfg.container) : cfg.container;
  var panel = document.createElement('div');
  panel.className = 'sh-suggest';
  panel.hidden = true;
  container.appendChild(panel);

  var state = { el: null, items: [], sel: -1, tokenStart: 0, dismissed: null };

  function tokenAt(el) {
    var upto = el.value.slice(0, el.selectionStart);
    var start = Math.max(upto.lastIndexOf('/'), upto.lastIndexOf('\n')) + 1;
    return { start: start, text: upto.slice(start) };
  }

  function rank(q) {
    q = q.toLowerCase();
    var scored = [];
    fsShorthandAll().forEach(function (e) {
      var code = e.short.toLowerCase();
      var full = e.full.toLowerCase();
      var sc = -1;
      if (code.indexOf(q) === 0) sc = 0;
      else if (full.split(/\s+/).some(function (w) { return w.indexOf(q) === 0; })) sc = 1;
      else if (code.indexOf(q) !== -1) sc = 2;
      else if (full.indexOf(q) !== -1) sc = 3;
      if (sc >= 0) scored.push({ e: e, sc: sc });
    });
    scored.sort(function (a, b) { return a.sc - b.sc || a.e.short.length - b.e.short.length; });
    return scored.slice(0, 6).map(function (x) { return x.e; });
  }

  function caretXY(el) {
    var m = document.createElement('div');
    var cs = getComputedStyle(el);
    m.style.cssText = 'position:absolute;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;box-sizing:border-box;' +
      'width:' + el.clientWidth + 'px;padding:' + cs.padding + ';font:' + cs.font + ';line-height:' + cs.lineHeight + ';letter-spacing:' + cs.letterSpacing + ';';
    m.textContent = el.value.slice(0, el.selectionStart);
    var mark = document.createElement('span');
    mark.textContent = '\u200b';
    m.appendChild(mark);
    document.body.appendChild(m);
    var xy = { x: mark.offsetLeft, y: mark.offsetTop + mark.offsetHeight };
    document.body.removeChild(m);
    return xy;
  }

  function hide() {
    panel.hidden = true;
    state.el = null;
    state.sel = -1;
  }

  function hideIfStale() {
    if (document.activeElement !== state.el) hide();
  }

  function render() {
    panel.innerHTML = state.items.map(function (e, i) {
      return '<div class="sh-row' + (i === state.sel ? ' sel' : '') + '" data-i="' + i + '">' +
        '<span class="sh-code">' + fsEsc(e.short) + '</span>' +
        '<span class="sh-full">' + fsEsc(e.full) + '</span>' +
      '</div>';
    }).join('') +
    '<div class="sh-hint"><span>tab &#183; insert</span><span>esc &#183; dismiss</span></div>';
  }

  function show(el) {
    var t = tokenAt(el);
    if (state.dismissed && state.dismissed.el === el && state.dismissed.start === t.start) return hide();
    var q = t.text.trim();
    if (q.length < 2) return hide();
    var items = rank(q);
    if (!items.length) return hide();

    var leading = t.text.length - t.text.replace(/^\s+/, '').length;
    state.el = el;
    state.items = items;
    state.sel = -1;
    state.tokenStart = t.start + leading;
    render();

    var xy = caretXY(el);
    var ed = container.getBoundingClientRect();
    var er = el.getBoundingClientRect();
    panel.hidden = false;
    var left = er.left - ed.left + xy.x;
    left = Math.min(left, ed.width - panel.offsetWidth);
    panel.style.left = Math.max(0, left) + 'px';
    panel.style.top = (er.top - ed.top + xy.y + 4) + 'px';
  }

  function insert(i) {
    var el = state.el;
    var e = state.items[i];
    if (!el || !e) return;
    var sep = cfg.sep ? cfg.sep(el) : ' / ';
    var before = el.value.slice(0, state.tokenStart);
    var after = el.value.slice(el.selectionStart);
    el.value = before + e.short + sep + after;
    var pos = (before + e.short + sep).length;
    el.setSelectionRange(pos, pos);
    hide();
    state.dismissed = null;
    fsAutoGrow(el);
    el.focus();
    if (cfg.afterInsert) cfg.afterInsert(el);
  }

  function onKey(ev) {
    if (panel.hidden || state.el !== ev.target) return;
    if (ev.key === 'Tab') {
      ev.preventDefault();
      insert(state.sel === -1 ? 0 : state.sel);
    } else if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      state.sel = (state.sel + 1) % state.items.length;
      render();
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      state.sel = state.sel <= 0 ? state.items.length - 1 : state.sel - 1;
      render();
    } else if (ev.key === 'Enter' && state.sel !== -1) {
      ev.preventDefault();
      insert(state.sel);
    } else if (ev.key === 'Escape') {
      state.dismissed = { el: ev.target, start: state.tokenStart };
      hide();
    }
  }

  panel.addEventListener('mousedown', function (ev) {
    var row = ev.target.closest('.sh-row');
    if (!row) return;
    ev.preventDefault();
    insert(parseInt(row.dataset.i, 10));
  });

  return { show: show, hide: hide, hideIfStale: hideIfStale, onKey: onKey };
}

// ── ⋯ item menu — arm-to-confirm actions behind one button ──────────────────
// menuEl's first class name determines the item class ('tv-menu' →
// 'tv-menu-item'). cfg:
//   items()  — [{act, icon, label, iconClass?, iconStyle?}] built per open
//   on(act)  — action handler (confirmed acts included)
//   confirm  — {act: 'armed label'} for two-step actions
//   detach   — remove menuEl from the DOM on close (dynamic anchoring)

function fsWireItemMenu(menuEl, cfg) {
  var itemCls = menuEl.className.split(' ')[0] + '-item';
  var armTimer = null;

  function render() {
    menuEl.innerHTML = cfg.items().map(function (it) {
      var iconCls = 'material-symbols-sharp' + (it.iconClass ? ' ' + it.iconClass : '');
      return '<button class="' + itemCls + '" data-act="' + it.act + '">' +
        '<span class="' + iconCls + '"' + (it.iconStyle ? ' style="' + it.iconStyle + '"' : '') + '>' + it.icon + '</span>' +
        it.label + '</button>';
    }).join('');
  }

  function close() {
    menuEl.hidden = true;
    clearTimeout(armTimer);
    if (cfg.detach && menuEl.parentElement) menuEl.parentElement.removeChild(menuEl);
  }

  function open(parent) {
    if (parent) parent.appendChild(menuEl);
    render();
    menuEl.hidden = false;
  }

  function toggle(parent) {
    if (menuEl.hidden) open(parent); else close();
  }

  menuEl.addEventListener('click', function (e) {
    var item = e.target.closest('.' + itemCls);
    if (!item) return;
    e.stopPropagation();
    var act = item.dataset.act;
    var armLabel = cfg.confirm && cfg.confirm[act];
    if (armLabel && !item.classList.contains('armed')) {
      item.classList.add('armed');
      item.innerHTML = '<span class="material-symbols-sharp">delete</span>' + armLabel;
      clearTimeout(armTimer);
      armTimer = setTimeout(function () { if (!menuEl.hidden) render(); }, 2200);
      return;
    }
    close();
    cfg.on(act);
  });

  document.addEventListener('click', function () { if (!menuEl.hidden) close(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !menuEl.hidden) close();
  });

  return { open: open, close: close, toggle: toggle };
}
