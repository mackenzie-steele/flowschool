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
  // the .08s height ease lives on textarea.fs-autogrow (global.css §15);
  // the first sizing is instant, every keystroke after unrolls
  if (!el._fsGrow) { el._fsGrow = true; el.classList.add('fs-autogrow'); }
  var prev = el.style.height;
  el.style.height = 'auto';
  var next = el.scrollHeight + 'px';
  if (prev === next) { el.style.height = next; return; }
  el.style.height = prev || next;
  void el.offsetHeight; // the ease starts from the current height
  el.style.height = next;
}

// poses are separated by slashes, commas, or lines in the shorthand
// convention
function fsPoseCount(text) {
  return (text || '').split(/[\/\n,]/).map(function (p) { return p.trim(); }).filter(Boolean).length;
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

// ── story html — rich text with a short leash ────────────────────────────────
// Stories may carry s.html (bold/italic/underline + paragraphs) written
// by the contenteditable editor. The whitelist is the whole grammar:
// p, br, b/strong, i/em, u. Everything else unwraps to its text;
// attributes never survive. Legacy plain-text stories render as
// paragraphs split on blank lines.

function fsStorySanitize(html) {
  var ALLOW = { P: 'p', BR: 'br', B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', DIV: 'p', UL: 'ul', OL: 'ol', LI: 'li' };
  var tpl = document.createElement('template');
  tpl.innerHTML = String(html || '');
  function walk(node) {
    var out = '';
    node.childNodes.forEach(function (ch) {
      if (ch.nodeType === 3) { out += fsEsc(ch.nodeValue); return; }
      if (ch.nodeType !== 1) return;
      var tag = ALLOW[ch.tagName];
      if (!tag) { out += walk(ch); return; }
      if (tag === 'br') { out += '<br>'; return; }
      // browsers sometimes nest blocks inside a paragraph (<p><ul>…) —
      // when a p holds only blocks, the wrapper unwraps
      if (tag === 'p') {
        var kids = Array.prototype.filter.call(ch.childNodes, function (k) {
          return !(k.nodeType === 3 && !k.nodeValue.trim());
        });
        var allBlocks = kids.length && kids.every(function (k) {
          return k.nodeType === 1 && /^(UL|OL|P|DIV)$/.test(k.tagName);
        });
        if (allBlocks) { out += walk(ch); return; }
      }
      var inner = walk(ch);
      if ((tag === 'p' || tag === 'li') && !inner.replace(/<br>/g, '').trim()) return; // empties don't ship
      out += '<' + tag + '>' + inner + '</' + tag + '>';
    });
    return out;
  }
  return walk(tpl.content);
}

function fsStoryHtml(s) {
  if (s && s.html) return fsStorySanitize(s.html);
  return (s && s.text || '')
    .split(/\n+/)
    .filter(function (p) { return p.trim(); })
    .map(function (p) { return '<p>' + fsEsc(p) + '</p>'; })
    .join('');
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

// ── in-page view swap (list ↔ reader ↔ editor) ───────────────────────────────
// The same grammar as page navigation: the outgoing view releases (a fast
// fade), the scroll reset happens while nothing is visible, then the incoming
// view runs the page-enter settle. `onVisible` fires the moment the target is
// displayed — rendering, autoGrow, and focus belong there (hidden elements
// measure zero). During initial page load the swap is instant: arrival is
// pageEnter's job, and a deep link must never flash the list first.

var fsSwapTimers = [];

function fsSwapView(views, to, onVisible) {
  var from = null;
  views.forEach(function (v) { if (v && v !== to && !v.hidden) from = v; });

  // a swap still in flight yields immediately — the new one owns the stage
  fsSwapTimers.forEach(clearTimeout);
  fsSwapTimers = [];
  views.forEach(function (v) { if (v) v.classList.remove('view-release', 'view-enter'); });

  function flip(animate) {
    views.forEach(function (v) { if (v) v.hidden = v !== to; });
    if (onVisible) onVisible();
    window.scrollTo(0, 0);
    if (animate) {
      to.classList.add('view-enter');
      fsSwapTimers.push(setTimeout(function () { to.classList.remove('view-enter'); }, 320));
    }
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!from || reduce || document.readyState === 'loading') { flip(false); return; }

  from.classList.add('view-release');
  fsSwapTimers.push(setTimeout(function () {
    from.classList.remove('view-release');
    flip(true);
  }, 100));
}

// ── the sketch becomes real ──────────────────────────────────────────────────
// The moment a library stops being empty, the freshly rendered index settles
// in where the ghost rows stood — once per library, the first time it earns
// its contents. Call after rendering items, passing whether the container
// held the ghost index beforehand.

function fsGhostSettle(el, hadGhosts) {
  if (!hadGhosts) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || document.readyState === 'loading') return;
  el.classList.add('view-enter');
  setTimeout(function () { el.classList.remove('view-enter'); }, 320);
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
// top (or armed) match; arrows arm and Enter takes the ARMED row only —
// an unarmed Enter is a real newline, so free writing never gets
// hijacked. Esc dismisses for the current token. cfg:
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
    // a token starts after any pose separator — slash, comma, or line
    var start = Math.max(upto.lastIndexOf('/'), upto.lastIndexOf(','), upto.lastIndexOf('\n')) + 1;
    return { start: start, text: upto.slice(start) };
  }

  function rank(q) {
    q = q.toLowerCase();
    var scored = [];
    fsShorthandAll().forEach(function (e) {
      if (e.retired) return;   // still expands, never suggested
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
    } else if (ev.key === 'Enter') {
      // an armed row is a choice — take it. Unarmed, Enter is a real
      // newline: the panel steps aside and the writing goes on
      if (state.sel >= 0) {
        ev.preventDefault();
        insert(state.sel);
      } else {
        hide();
      }
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
    // the exit transition needs the node alive — detach after it finishes
    // (a re-open within the window survives: open() re-appends and unhides)
    if (cfg.detach && menuEl.parentElement) {
      setTimeout(function () {
        if (menuEl.hidden && menuEl.parentElement) menuEl.parentElement.removeChild(menuEl);
      }, 160);
    }
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
      // the glyph crossfades in; the lapsing window eases shut instead
      // of the user discovering it closed
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var applyArm = function () { item.innerHTML = '<span class="material-symbols-sharp">delete</span>' + armLabel; };
      if (reduce) { applyArm(); }
      else {
        item.style.transition = 'opacity .09s ease';
        item.style.opacity = '0';
        setTimeout(function () {
          applyArm();
          item.style.opacity = '1';
          setTimeout(function () { item.style.cssText = ''; }, 100);
        }, 90);
      }
      clearTimeout(armTimer);
      armTimer = setTimeout(function () {
        if (menuEl.hidden) return;
        if (reduce) { render(); return; }
        item.style.transition = 'opacity .09s ease';
        item.style.opacity = '0';
        setTimeout(function () { if (!menuEl.hidden) render(); }, 90);
      }, 2200);
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

// ── the shape of your practice — six axes from real artifacts ────────────────
// A portrait, not a report card: every point is a receipt. Scores ease
// logarithmically toward 100 (the 3rd story moves more than the 30th).
// Reads existing keys only — no new tracking.

function fsPracticeShape() {
  var MONTH = Date.now() - 30 * 86400000;

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { return []; }
  }

  // hyperbolic ease: early work shows quickly, but the rim is
  // asymptotic — a practice can always grow, so the shape can too.
  // 15pts→20 · 60pts→50 · 240pts→80 · the edge is never reached.
  function ease(pts) { return Math.round(100 * pts / (pts + 60)); }

  var classes = load('flowschool_classes');
  var flows = load('flowschool_flows');
  var stories = load('flowschool_stories');
  var playlists = load('flowschool_playlists');
  var shorthand = fsCustomShorthand();
  var rules = load('flowschool_arules');
  var chains = load('fs-pose-connector-saved');
  var favs = load('flowschool_favs');
  var cueSheets = [];
  try {
    var store = JSON.parse(localStorage.getItem('fs-cue-flows') || '{}');
    cueSheets = Object.values(store);
  } catch (_) {}

  function stamp(x) {
    if (!x) return 0;
    return x.editedAt || (typeof x.savedAt === 'string' ? Date.parse(x.savedAt) : x.savedAt) || x.ts || x.id || 0;
  }

  // one axis accumulates {pts, monthPts, receipts:[{text, href}]}
  function axis(key, label) {
    var a = { key: key, label: label, pts: 0, monthPts: 0, receipts: [] };
    a.add = function (count, weight, href, receipt) {
      if (!count) return;
      a.pts += count * weight;
      a.receipts.push({ text: receipt, href: href });
    };
    return a;
  }

  function recent(list) { return list.filter(function (x) { return stamp(x) >= MONTH; }); }
  function label(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // ── PLAY ──
  var play = axis('play', 'Play');
  play.add(rules.length, 3, 'arbitrary-rules.html', label(rules.length, 'challenge saved', 'challenges saved'));
  play.monthPts += recent(rules).length * 3;
  play.add(chains.length, 3, 'pose-popcorn.html', label(chains.length, 'pose chain kept', 'pose chains kept'));
  play.monthPts += recent(chains).length * 3;
  play.add(favs.length, 2, 'movement-experiments.html', label(favs.length, 'experiment favorited', 'experiments favorited'));
  play.monthPts += recent(favs).length * 2;

  // ── SEQUENCE ──
  var seq = axis('sequence', 'Sequence');
  seq.add(flows.length, 3, 'your-flows.html', label(flows.length, 'flow built', 'flows built'));
  seq.monthPts += recent(flows).length * 3;
  var types = {};
  flows.forEach(function (f) { if (f.type) types[f.type] = 1; });
  var tv = Object.keys(types).length;
  seq.add(tv, 2, 'your-flows.html', label(tv, 'flow type explored', 'flow types explored'));
  seq.add(classes.length, 4, 'your-classes.html', label(classes.length, 'class written', 'classes written'));
  seq.monthPts += recent(classes).length * 4;
  var linked = 0, linkedMonth = 0;
  classes.forEach(function (c) {
    var m = c.sectionMeta || {};
    Object.keys(m).forEach(function (k) {
      if (m[k] && m[k].flowId != null) { linked++; if (stamp(c) >= MONTH) linkedMonth++; }
    });
  });
  seq.add(linked, 5, 'your-classes.html', label(linked, 'flow linked into a class', 'flows linked into classes'));
  seq.monthPts += linkedMonth * 5;

  // ── CUE ──
  var cue = axis('cue', 'Cue');
  cue.add(cueSheets.length, 4, 'your-cues.html', label(cueSheets.length, 'cue sheet saved', 'cue sheets saved'));
  cue.monthPts += recent(cueSheets).length * 4;
  cue.add(shorthand.length, 3, 'pose-library.html', label(shorthand.length, 'shorthand of your own', 'shorthand of your own'));
  cue.monthPts += recent(shorthand).length * 3;
  var pol = fsSessionCounts('fs-pol-sessions');
  cue.add(pol.total, 2, 'your-cues.html', label(pol.total, 'practice-out-loud session', 'practice-out-loud sessions'));
  cue.monthPts += pol.month * 2;

  // ── STORY ──
  var story = axis('story', 'Story');
  story.add(stories.length, 3, 'stories.html', label(stories.length, 'story written', 'stories written'));
  story.monthPts += recent(stories).length * 3;
  var titled = stories.filter(function (s) { return s.title; }).length;
  story.add(titled, 1, 'stories.html', label(titled, 'story titled', 'stories titled'));
  var told = 0, toldMonth = 0;
  classes.forEach(function (c) {
    var n = (c.storyIds || []).length;
    told += n;
    if (stamp(c) >= MONTH) toldMonth += n;
  });
  story.add(told, 5, 'your-classes.html', label(told, 'story attached to a class', 'stories attached to classes'));
  story.monthPts += toldMonth * 5;

  // ── SOUND ──
  var sound = axis('sound', 'Music');
  sound.add(playlists.length, 4, 'playlist-builder.html', label(playlists.length, 'playlist saved', 'playlists saved'));
  sound.monthPts += recent(playlists).length * 4;
  var scored = classes.filter(function (c) { return c.playlist || c.playlistUrl; }).length;
  sound.add(scored, 3, 'your-classes.html', label(scored, 'class given a playlist', 'classes given playlists'));
  var bp = fsSessionCounts('fs-breath-sessions');
  sound.add(bp.total, 2, 'breath-pace.html', label(bp.total, 'breath session', 'breath sessions'));
  sound.monthPts += bp.month * 2;

  // ── REFLECT ──
  var reflect = axis('reflect', 'Reflect');
  var notes = 0, notesMonth = 0, refined = 0;
  classes.forEach(function (c) {
    var log = c.notesLog || [];
    notes += log.length;
    log.forEach(function (n) { if ((n.ts || 0) >= MONTH) notesMonth++; });
    // edited after its latest note = the repeat-and-refine loop
    if (log.length && c.editedAt && c.editedAt > Math.max.apply(null, log.map(function (n) { return n.ts || 0; }))) refined++;
  });
  reflect.add(notes, 4, 'teaching-notes.html', label(notes, 'teaching note', 'teaching notes'));
  reflect.monthPts += notesMonth * 4;
  reflect.add(refined, 5, 'your-classes.html', label(refined, 'class refined after teaching', 'classes refined after teaching'));

  return [play, seq, cue, story, sound, reflect].map(function (a) {
    return { key: a.key, label: a.label, allTime: ease(a.pts), month: ease(a.monthPts), receipts: a.receipts };
  });
}

// ── session counters — the only new events the shape ever logs ──────────────
// One tiny key per instrument: total count + recent timestamps (for the
// 30-day window). Logged only when a session was real, not on a stray tap.

function fsLogSession(key) {
  var d = { total: 0, stamps: [] };
  try { d = JSON.parse(localStorage.getItem(key)) || d; } catch (_) {}
  d.total = (d.total || 0) + 1;
  d.stamps = (d.stamps || []).concat(Date.now()).slice(-100);
  localStorage.setItem(key, JSON.stringify(d));
}

function fsSessionCounts(key) {
  try {
    var d = JSON.parse(localStorage.getItem(key)) || {};
    var month = Date.now() - 30 * 86400000;
    return {
      total: d.total || 0,
      month: (d.stamps || []).filter(function (t) { return t >= month; }).length,
    };
  } catch (_) { return { total: 0, month: 0 }; }
}

// ── the back button goes where the visitor actually came from ────────────────
// History first: the previous page, or the previous in-page state (the
// pages' popstate routing repaints). The page's own default is only the
// fallback for direct links and fresh tabs with nowhere to go back to.
function fsGoBack(fallback) {
  if (window.history.length > 1) { history.back(); return; }
  if (fallback) fallback();
}

// ── history depth + the honest back label ────────────────────────────────────
// In-page navigations stamp a depth into history.state; popstate restores
// it. Depth > 0 means one back-step stays inside this page's own flow, so
// the back button keeps its in-page label. Depth 0 means back leaves the
// page — the label names the referrer when it's one of ours.
var fsNavDepth = (window.history.state && window.history.state.fsDepth) || 0;

function fsPushState(url) {
  fsNavDepth += 1;
  history.pushState({ fsDepth: fsNavDepth }, '', url);
}

function fsReplaceState(url) {
  history.replaceState({ fsDepth: fsNavDepth }, '', url);
}

function fsSyncNavDepth(state) {
  fsNavDepth = (state && state.fsDepth) || 0;
}

var FS_PAGE_NAMES = {
  'dashboard': 'Dashboard',
  'your-classes': 'Your Classes',
  'your-flows': 'Your Flows',
  'your-cues': 'Your Cues',
  'stories': 'Your Stories',
  'circle': 'The Circle',
  'saved': 'Saved',
  'class': 'Class',
  'pose-library': 'Pose Library',
  'playlist-builder': 'Playlist Builder',
  'movement-experiments': 'Movement Experiments',
  'arbitrary-rules': 'Arbitrary Rules',
  'breath-pace': 'Breath Pace',
  'teaching-notes': 'Teaching Notes',
  'pose-popcorn': 'Pose Popcorn',
  'story-starters': 'Story Starters',
  'shorthand-library': 'Shorthand Library',
  'profile': 'Profile',
  'settings': 'Settings',
};

function fsBackLabel(def) {
  if (fsNavDepth > 0) return def;             // back stays in this page's flow
  if (window.history.length <= 1) return def; // nowhere to go — fallback rules
  try {
    var r = document.referrer;
    if (!r) return def;
    var u = new URL(r);
    if (u.origin !== location.origin) return def;
    var path = u.pathname.replace(/^\//, '').replace(/\.html$/, '');
    if (/^@/.test(path)) return 'Profile';
    var here = location.pathname.replace(/^\//, '').replace(/\.html$/, '');
    if (path === here) return def;            // reload / same-page hop
    return FS_PAGE_NAMES[path] || def;
  } catch (e) { return def; }
}

// ─── Class card — the one grid card, shared by Your Classes (own + saved) and
// the dashboard's Your Favorite Classes deck. Styles live in global.css
// (.class-card / .cc-*). Callers pass a normalized spec so the markup stays
// identical everywhere:
//   { href, pinned, shared, classType, title, preview, meta:[...strings], dataId }
function fsClassCard(spec) {
  spec = spec || {};
  var meta = (spec.meta && spec.meta.length) ? spec.meta.join(' · ') : '';
  return '<a href="' + spec.href + '" class="class-card' + (spec.pinned ? ' pinned' : '') + '"' +
      (spec.dataId != null ? ' data-id="' + fsEsc(String(spec.dataId)) + '"' : '') + '>' +
    (spec.pinned ? '<span class="material-symbols-sharp fav-mark cc-fav">favorite</span>' : '') +
    (spec.shared ? '<span class="material-symbols-sharp cc-shared" title="Shared to your profile">language</span>' : '') +
    '<div class="cc-top">' + (spec.classType ? '<span class="cc-tag">' + fsEsc(spec.classType) + '</span>' : '') + '</div>' +
    '<span class="cc-title">' + fsEsc(spec.title || 'Untitled Class') + '</span>' +
    (spec.preview ? '<span class="cc-preview">' + fsEsc(spec.preview) + '</span>' : '') +
    (meta ? '<span class="cc-meta">' + meta + '</span>' : '') +
  '</a>';
}
