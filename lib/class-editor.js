// ─────────────────────────────────────────────────────────────────────────────
// lib/class-editor.js — the Your Classes page script
// (list · teaching view · editor). Extracted from your-classes.html so the
// hub page stays maintainable; loads last, after nav/data/toast/confirm-
// delete/library. All element ids it wires live in your-classes.html.
// ─────────────────────────────────────────────────────────────────────────────

// ─── TEMPLATE ────────────────────────────────────────────────────────────────
// Source: Flow School Manual, pp. 39-40 (Writing a Class) + pp. 20-21
// (Peak Flow Matrix / Stack Circles) for the pose-count and timing hints.

var SECTIONS = [
  { key: 'begin',      label: 'Begin',         placeholder: 'ON BELLY', rows: 1 },
  { key: 'warmup',     label: 'Warm Up Flow',  placeholder: 'QPED / BIRD DOG / SL CHILD / COBRA / …', rows: 2 },
  // the section keeps its historical 'nohands' key so saved classes
  // still open — the taxonomy renamed No Hands → Bridge (Jul 2026)
  { key: 'nohands',    label: 'Bridge Flow',   placeholder: 'TADA / CHAIR / TWIST CHAIR / FF / …', rows: 2 },
  { key: 'peak',       label: 'Peak Flow',     placeholder: 'W2 / HANDS HEART SKAN / REV CL / HM / …', rows: 3 },
  { key: 'cooldown',   label: 'Cool Down',     placeholder: 'PIGEON / JANU / SUPINE TWIST / …', rows: 2 },
];

// ─── EXTRA FLOW SLOTS ────────────────────────────────────────────────────────
// "Add a flow" seats up to MAX_EXTRAS typed sections between the Bridge
// and Peak flows. A slot's type is decided at insert; its text lives in
// c.sections under the slot key, its link in c.sectionMeta, its order
// and type in c.extras. (The old optional 'workshop' section folds into
// the first slot on load.)

var SLOT_TYPES = {
  bridge:   { label: 'Bridge Flow',   placeholder: 'TADA / CHAIR / TWIST CHAIR / FF / …', rows: 2 },
  nohands:  { label: 'No Hands Flow', placeholder: 'TADA / CHAIR / TWIST CHAIR / FF / …', rows: 2 },
  workshop: { label: 'Workshop',      placeholder: 'Demo the step up transition', rows: 1 },
};
var MAX_EXTRAS = 4;

function extrasOf(c) { return (c && c.extras) || []; }

function freeSlotKey(extras) {
  for (var i = 1; i <= MAX_EXTRAS; i++) {
    var k = 'x' + i;
    if (!extras.some(function (x) { return x.key === k; })) return k;
  }
  return null;
}

// standing sections with the class's slots seated after the bridge —
// ONE order for the editor, teach view, card skeleton, and search
function orderedSections(c) {
  var out = [];
  SECTIONS.forEach(function (s) {
    out.push(s);
    if (s.key === 'nohands') {
      extrasOf(c).forEach(function (x) {
        var t = SLOT_TYPES[x.type] || SLOT_TYPES.workshop;
        out.push({ key: x.key, label: t.label, placeholder: t.placeholder, rows: t.rows, slotType: x.type });
      });
    }
  });
  return out;
}

var KEY = 'flowschool_classes';
var STORIES_KEY = 'flowschool_stories';

// ─── STATE ───────────────────────────────────────────────────────────────────

function loadClasses() {
  try {
    var list = JSON.parse(localStorage.getItem(KEY) || '[]');
    list.forEach(function (c) {
      if (!c.extras) c.extras = [];
      // the old optional workshop section becomes the first slot
      if (c.sections && c.sections.workshop != null) {
        var hadWork = (c.sections.workshop || '').trim() || (c.sectionMeta && c.sectionMeta.workshop);
        var k = hadWork ? freeSlotKey(c.extras) : null;
        if (k) {
          c.extras.push({ key: k, type: 'workshop' });
          c.sections[k] = c.sections.workshop;
          if (c.sectionMeta && c.sectionMeta.workshop) {
            c.sectionMeta[k] = c.sectionMeta.workshop;
            delete c.sectionMeta.workshop;
          }
        }
        delete c.sections.workshop;
      }
    });
    return list;
  } catch (_) { return []; }
}

function loadStories() {
  try { return JSON.parse(localStorage.getItem(STORIES_KEY) || '[]'); } catch (_) { return []; }
}

function persist() { localStorage.setItem(KEY, JSON.stringify(classes)); }

var classes = loadClasses();
var currentId = null;      // class open in teaching view
var editingId = null;      // class open in editor (null = new)
var editLength = 60;       // selected class length (minutes)
var attachedIds = [];      // editor working set of story ids
var wakeLock = null;

// ─── HELPERS ─────────────────────────────────────────────────────────────────



// ─── SORT — per-category preference, edited-first by default ─────────────────
var SORT_KEY = 'fs-sort-classes';
function sortMode() { return fsSortMode(SORT_KEY); }
var sorterFor = fsSorterFor;
function renderSortBtn() { fsRenderSortLabel(sortMode()); }

// ─── DATE STAMPS — Created ↔ Edited, apple-notes style ──────────────────────
// Clicking a stamp flips the mode; the choice persists site-wide.
var dateMode = fsDateMode, toggleDateMode = fsToggleDateMode, stampFor = fsStampFor;

var fmtDate = fsFmtDate, esc = fsEsc;

function byId(id) { return classes.find(function (c) { return c.id === id; }); }

// link hygiene — only http(s) leaves the app (the teacher page's rule)
function safeVideoUrl(raw) {
  if (!raw) return null;
  var u = String(raw).trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    var parsed = new URL(u);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : null;
  } catch (e) { return null; }
}

function sectionCount(c) {
  return orderedSections(c).filter(function (s) { return (c.sections[s.key] || '').trim(); }).length;
}

// circles — the filled flow sections. Begin and Cool Down bookend the
// class; they aren't circles and don't count.
function circleCount(c) {
  return orderedSections(c).filter(function (s) {
    return s.key !== 'begin' && s.key !== 'cooldown' && (c.sections[s.key] || '').trim();
  }).length;
}

var autoGrow = fsAutoGrow;

function dayStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// one note per teach: migrate the old single-notes field into the log
function normalizeNotes(c) {
  if (!c.notesLog) c.notesLog = [];
  if (c.notes) {
    var ts = c.editedAt || c.id;
    c.notesLog.push({ ts: ts, day: dayStr(new Date(ts)), text: c.notes });
    delete c.notes;
  }
}

// ─── LIST VIEW ───────────────────────────────────────────────────────────────

// Saved wears the Favorites toggle's clothes: on, the room shows the
// classes you bookmarked from other teachers (read live); off, your own
var savedOnly = false;

function renderList(filter) {
  var index = document.getElementById('class-index');
  var hadGhosts = !!index.querySelector('.library-empty-ghost');
  var bar = document.getElementById('library-bar');
  var q = (filter || '').trim().toLowerCase();

  if (savedOnly) { renderSavedList(q); return; }
  document.getElementById('sort-btn').hidden = false;
  document.getElementById('fav-filter-btn').hidden = false;

  if (!classes.length) {
    bar.hidden = true;
    // the Saved toggle stays reachable — bookmarked classes may exist
    // even before the first created one
    document.getElementById('sort-row').hidden = false;
    document.getElementById('sort-btn').hidden = true;
    document.getElementById('fav-filter-btn').hidden = true;
    document.getElementById('class-type-filter').hidden = true;
    document.getElementById('result-count').textContent = '';
    index.innerHTML =
      '<div class="library-empty">' +
      '<h4 class="library-empty-title">Add your first class.</h4>' +
      '<p class="library-empty-sub">Everything you make lives here.</p>' +
      '<div class="library-empty-actions">' +
      '<button class="btn-primary" id="empty-new-btn">Write a Class</button>' +
      '</div>' +
      fsGhostRows() +
      '</div>';
    document.getElementById('empty-new-btn').addEventListener('click', function () {
      showEdit(null, true);
    });
    return;
  }

  bar.hidden = false;
  document.getElementById('sort-row').hidden = false;
  renderSortBtn();
  renderTypeFilter();
  var list = classes.slice().sort(sorterFor(sortMode()));
  if (favOnly) list = list.filter(function (c) { return c.pinned; });
  if (typeFilter !== 'all') {
    list = list.filter(function (c) { return (c.classType || '').toLowerCase() === typeFilter; });
  }
  if (q) {
    list = list.filter(function (c) {
      if ((c.title || '').toLowerCase().indexOf(q) !== -1) return true;
      if ((c.playlist || '').toLowerCase().indexOf(q) !== -1) return true;
      return orderedSections(c).some(function (s) {
        return (c.sections[s.key] || '').toLowerCase().indexOf(q) !== -1;
      });
    });
  }

  if (!list.length) {
    document.getElementById('result-count').textContent = '0 results';
    index.innerHTML = '<div class="library-empty"><p class="library-empty-sub">' +
      (q ? 'Nothing matches &#8220;' + esc(filter) + '&#8221;.'
         : (favOnly ? 'No favorites yet &#8212; use the &#8943; menu on a class.'
                    : 'No classes of this type yet.')) +
      '</p></div>';
    return;
  }

  document.getElementById('result-count').textContent =
    list.length + ' result' + (list.length !== 1 ? 's' : '');

  index.innerHTML = list.map(function (c) {
    // the meta speaks plainly: duration, circles, date — nothing else
    var n = circleCount(c);
    var bits = [(c.length || 60) + ' min', n + (n === 1 ? ' circle' : ' circles')];
    // the card date speaks the sort's language: created order shows
    // created dates, edited order shows edited dates
    bits.push(fmtDate(sortMode() === 'edited' ? (c.editedAt || c.id) : c.id));
    // the tag zone is always rendered — untyped cards keep the slot so
    // titles sit on one line across the grid
    var top = '<div class="cc-top">' +
      (c.classType ? '<span class="cc-tag">' + esc(c.classType) + '</span>' : '') +
      '</div>';
    // the peak flow speaks for the class — linked flows read live
    var pm = c.sectionMeta && c.sectionMeta.peak;
    var pf = pm && pm.flowId != null ? resolveFlow(pm.flowId) : null;
    var preview = ((pf ? pf.text : (c.sections || {}).peak) || '').trim();
    return '<a href="your-classes?id=' + c.id + '" class="class-card' + (c.pinned ? ' pinned' : '') + '" data-id="' + c.id + '">' +
      (c.pinned ? '<span class="material-symbols-sharp fav-mark cc-fav">favorite</span>' : '') +
      // shared wears the globe from the share menu — a mark, not a word
      (c.shared ? '<span class="material-symbols-sharp cc-shared" title="Shared to your profile">language</span>' : '') +
      top +
      '<span class="cc-title">' + esc(c.title || 'Untitled Class') + '</span>' +
      (preview ? '<span class="cc-preview">' + esc(preview) + '</span>' : '') +
      '<span class="cc-meta">' + bits.join(' &#183; ') + '</span>' +
    '</a>';
  }).join('');
  sizeTagCol();
  fsGhostSettle(index, hadGhosts);
}

// ─── SAVED CLASSES — references, read live from the source rows ──────────────
// No copies exist: every card is the author's current version. A class
// the author stopped sharing simply isn't in the room anymore.

var savedCache = null;
var savedState = 'idle';   // idle → loading → ready | error

function fetchSaved() {
  savedState = 'loading';
  fsPublish.savedClasses().then(function (res) {
    if (res.error) { savedState = 'error'; }
    else { savedCache = res.data; savedState = 'ready'; }
    if (savedOnly) renderList(document.getElementById('class-search').value);
  }, function () {
    savedState = 'error';
    if (savedOnly) renderList(document.getElementById('class-search').value);
  });
}

function renderSavedList(q) {
  var index = document.getElementById('class-index');
  document.getElementById('library-bar').hidden = false;
  document.getElementById('sort-row').hidden = false;
  // the room keeps all its furniture — Saved filters, it doesn't strip
  document.getElementById('sort-btn').hidden = false;
  document.getElementById('fav-filter-btn').hidden = false;

  if (savedState === 'idle') { fetchSaved(); }
  if (savedState === 'idle' || savedState === 'loading') {
    document.getElementById('class-type-filter').hidden = true;
    document.getElementById('result-count').textContent = '';
    index.innerHTML = '<div class="library-empty">' + fsGhostRows() + '</div>';
    return;
  }
  if (savedState === 'error') {
    document.getElementById('class-type-filter').hidden = true;
    document.getElementById('result-count').textContent = '';
    index.innerHTML = '<div class="library-empty">' +
      '<p class="library-empty-sub">Your saved classes couldn’t load.</p>' +
      '<div class="library-empty-actions"><button class="btn-secondary" id="saved-retry">Try again</button></div>' +
      '</div>';
    document.getElementById('saved-retry').addEventListener('click', function () {
      savedState = 'idle';
      renderList(document.getElementById('class-search').value);
    });
    return;
  }

  renderSortBtn();
  renderTypeFilter();

  var list = savedCache.slice().sort(sortMode() === 'edited'
    ? function (a, b) { return new Date(b.updated_at) - new Date(a.updated_at); }
    : function (a, b) { return new Date(b.created_at || b.updated_at) - new Date(a.created_at || a.updated_at); });
  if (typeFilter !== 'all') {
    list = list.filter(function (r) { return (r.class_type || '').toLowerCase() === typeFilter; });
  }
  if (q) {
    list = list.filter(function (r) {
      return (r.title || '').toLowerCase().indexOf(q) !== -1
        || (r.author_name || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  if (!list.length) {
    document.getElementById('result-count').textContent = savedCache.length ? '0 results' : '';
    index.innerHTML = '<div class="library-empty"><p class="library-empty-sub">' +
      (q ? 'Nothing matches “' + esc(q) + '”.'
         : (savedCache.length ? 'No saved classes of this type yet.'
            : 'Nothing saved yet. Classes you save from other teachers’ profiles live here — always their current version.')) +
      '</p></div>';
    return;
  }

  document.getElementById('result-count').textContent =
    list.length + ' result' + (list.length !== 1 ? 's' : '');

  index.innerHTML = list.map(function (r) {
    var secs = (r.payload && r.payload.sections) || [];
    // circles: the flow sections — Begin and Cool Down bookend, not count
    var nc = secs.filter(function (s) {
      return s.label !== 'Begin' && s.label !== 'Cool Down';
    }).length;
    var bits = [(r.length_minutes || 60) + ' min'];
    if (nc) bits.push(nc + (nc === 1 ? ' circle' : ' circles'));
    bits.push('By ' + (r.author_name || 'a teacher'));
    var top = '<div class="cc-top">' +
      (r.class_type ? '<span class="cc-tag">' + esc(r.class_type) + '</span>' : '') +
      '</div>';
    return '<a href="class?p=' + esc(r.id) + '" class="class-card">' +
      top +
      '<span class="cc-title">' + esc(r.title || 'Untitled Class') + '</span>' +
      '<span class="cc-meta">' + bits.join(' · ') + '</span>' +
    '</a>';
  }).join('');
  sizeTagCol();
}

document.getElementById('saved-filter-btn').addEventListener('click', function () {
  savedOnly = !savedOnly;
  this.classList.toggle('on', savedOnly);
  // saved references carry no favorites — the two lenses don't stack
  if (savedOnly && favOnly) {
    favOnly = false;
    document.getElementById('fav-filter-btn').classList.remove('on');
  }
  renderList(document.getElementById('class-search').value);
});

// the list's tag column hugs the widest tag actually present —
// re-measured once the mono font lands (widths shift a pixel)
function sizeTagCol() {
  var index = document.getElementById('class-index');
  var tagW = 0;
  index.querySelectorAll('.cc-tag').forEach(function (t) {
    tagW = Math.max(tagW, Math.ceil(t.getBoundingClientRect().width));
  });
  index.style.setProperty('--tag-col', tagW + 'px');
  index.classList.toggle('no-tags', tagW === 0);
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeTagCol);

// ─── TEACHING VIEW ───────────────────────────────────────────────────────────

function renderTeach(id) {
  var c = byId(id);
  if (!c) { showList(); return; }
  currentId = id;

  renderTitleFav(c);
  renderTvMeta(c);

  // the video seal — present only when a link is
  var vUrl = safeVideoUrl(c.videoUrl);
  var vBtn = document.getElementById('tv-video');
  vBtn.hidden = !vUrl;
  if (vUrl) vBtn.href = vUrl;

  // playlist — a link when one exists, plain text otherwise
  var plName = (c.playlist || '').trim();
  var plUrl = (c.playlistUrl || '').trim();
  document.getElementById('tv-playlist').hidden = !(plName || plUrl);
  document.getElementById('tv-playlist-body').innerHTML = plUrl
    ? '<a class="tv-playlist-link" href="' + esc(plUrl) + '" target="_blank" rel="noopener">' +
        esc(plName || 'Open playlist') +
        '<span class="material-symbols-sharp">open_in_new</span></a>'
    : esc(plName);

  // attached stories — the class opener(s)
  var stories = loadStories();
  var attached = (c.storyIds || []).map(function (sid) {
    return stories.find(function (s) { return s.id === sid; });
  }).filter(Boolean);
  document.getElementById('tv-stories').innerHTML = attached.map(function (s) {
    // a folded drawer, the cue-sheet anatomy — open it to read the story
    var name = s.title || s.starter || 'Untitled Story';
    return '<div class="tv-story fd-cues">' +
      '<button type="button" class="fd-cues-head" aria-expanded="false">' +
        '<span class="fd-cues-name">' + esc(name) + '</span>' +
        '<span class="fd-cues-title">Story</span>' +
        '<span class="material-symbols-sharp fd-cues-chev i-md">expand_more</span>' +
      '</button>' +
      '<div class="fd-cues-body" hidden>' +
        (s.title && s.starter ? '<p class="tv-story-starter">' + esc(s.starter) + '</p>' : '') +
        '<div class="tv-story-text">' + fsStoryHtml(s) + '</div>' +
        '<div class="fd-cues-foot">' +
          '<a class="fd-cues-open" href="stories?id=' + s.id + '" data-tooltip="Open in Your Stories" aria-label="Open in Your Stories">' +
            '<span class="material-symbols-sharp i-sm">open_in_new</span>' +
          '</a>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  // sections — the flow exactly as they wrote it; a linked flow's cue
  // sheets ride below it as drawers, the flow page's anatomy
  document.getElementById('tv-sections').innerHTML = orderedSections(c).map(function (s) {
    var m = c.sectionMeta && c.sectionMeta[s.key];
    var flow = m && m.flowId != null ? resolveFlow(m.flowId) : null;
    // linked sections read live from the parent flow; the stored
    // text is the fallback if the flow was deleted — and a deleted
    // flow's name goes with it: the words stay, the label doesn't
    var raw = (flow ? flow.text : (c.sections[s.key] || '')).trim();
    if (!raw) return '';
    var name = flow ? flow.name : null;
    var nm = name ? '<span class="tv-flow-name">' + esc(name) + '</span>' : '';
    var drawers = flow ? cueSheetsForFlow(flow.id).map(tvCueDrawerHtml).join('') : '';
    return '<div class="tv-section">' +
      '<div class="tv-label label-1">' + s.label + nm + '</div>' +
      '<div class="tv-flow">' + esc(raw) + '</div>' +
      (drawers ? '<div class="tv-cues-stack">' + drawers + '</div>' : '') +
    '</div>';
  }).join('');

  // props — what to grab before the room fills
  var props = sortProps(c.props || []).map(function (p) {
    if (p !== 'Blocks') return p;
    var n = c.blockCount || 2;
    return n + (n === 1 ? ' Block' : ' Blocks');
  });
  document.getElementById('tv-props').hidden = !props.length;
  document.getElementById('tv-props-body').textContent = props.join(' \u00B7 ');

  // teaching log — today's note is open; past teaches stack below
  normalizeNotes(c);
  document.getElementById('tv-note-composer').hidden = true;
  document.getElementById('add-note-btn').hidden = false;
  document.getElementById('tv-notes-area').value = '';

  var past = c.notesLog
    .slice()
    .sort(function (a, b) { return b.ts - a.ts; });
  var log = document.getElementById('tv-notes-log');
  log.innerHTML = past.map(function (n) {
    return '<div class="tv-note" data-ts="' + n.ts + '">' +
      '<div class="tv-note-main">' +
        '<span class="tv-note-date">' + fmtDate(n.ts) + '</span>' +
        '<p class="tv-note-text" title="Edit note">' + esc(n.text) + '</p>' +
      '</div>' +
      '<button class="tv-note-act" title="Edit note" aria-label="Edit note"><span class="material-symbols-sharp i-sm">edit</span></button>' +
      '<button class="tv-note-del" data-ts="' + n.ts + '" title="Delete note"><span class="material-symbols-sharp i-sm">close</span></button>' +
    '</div>';
  }).join('');
  log.querySelectorAll('.tv-note-text, .tv-note-act').forEach(function (el) {
    el.addEventListener('click', function () {
      startNoteEdit(el.closest('.tv-note'));
    });
  });
  log.querySelectorAll('.tv-note-del').forEach(function (btn) {
    wireConfirmDelete(btn, function () {
      var cc = byId(currentId);
      if (!cc) return;
      cc.notesLog = cc.notesLog.filter(function (n) { return n.ts !== parseInt(btn.dataset.ts); });
      persist();
      renderTeach(currentId);
      toast('Note removed.');
    });
  });
}

// the margin's notes — the teach view's note interaction, compacted
// for the 300px column: date line carries the pencil and the x, the
// words are touchable, the editor is the same well. Notes are the
// journal stream, not draft state — edits persist immediately.
function renderCwNotes(classId) {
  var c = classId != null ? byId(classId) : null;
  var pastNotes = (c && c.notesLog ? c.notesLog.slice() : [])
    .sort(function (a, b) { return b.ts - a.ts; });
  document.getElementById('cw-notes').hidden = !pastNotes.length;
  var list = document.getElementById('cw-notes-list');
  list.innerHTML = pastNotes.map(function (n) {
    return '<div class="cw-note" data-ts="' + n.ts + '">' +
      '<div class="cw-note-hdr">' +
        '<span class="cw-note-date">' + fmtDate(n.ts) + '</span>' +
        '<button type="button" class="tv-note-act" title="Edit note" aria-label="Edit note"><span class="material-symbols-sharp i-sm">edit</span></button>' +
        '<button type="button" class="tv-note-del" data-ts="' + n.ts + '" title="Delete note"><span class="material-symbols-sharp i-sm">close</span></button>' +
      '</div>' +
      '<p class="cw-note-text" title="Edit note">' + esc(n.text) + '</p>' +
    '</div>';
  }).join('');
  list.querySelectorAll('.cw-note-text, .tv-note-act').forEach(function (el) {
    el.addEventListener('click', function () {
      startCwNoteEdit(el.closest('.cw-note'), classId);
    });
  });
  list.querySelectorAll('.tv-note-del').forEach(function (btn) {
    wireConfirmDelete(btn, function () {
      var cc = byId(classId);
      if (!cc) return;
      cc.notesLog = cc.notesLog.filter(function (n) { return n.ts !== parseInt(btn.dataset.ts); });
      persist();
      renderCwNotes(classId);
      toast('Note removed.');
    });
  });
}

function startCwNoteEdit(row, classId) {
  var ts = parseInt(row.dataset.ts, 10);
  var c = byId(classId);
  var note = c && (c.notesLog || []).find(function (n) { return n.ts === ts; });
  if (!note || row.classList.contains('editing')) return;
  row.classList.add('editing');
  row.innerHTML =
    '<div class="cw-note-hdr">' +
      '<span class="cw-note-date">' + fmtDate(ts) + '</span>' +
      '<button type="button" class="tv-note-act" data-act="save" title="Save note" aria-label="Save note"><span class="material-symbols-sharp i-sm">check</span></button>' +
      '<button type="button" class="tv-note-act" data-act="cancel" title="Cancel" aria-label="Cancel"><span class="material-symbols-sharp i-sm">close</span></button>' +
    '</div>' +
    '<textarea class="tv-note-edit" aria-label="Teaching note"></textarea>';

  var area = row.querySelector('.tv-note-edit');
  area.value = note.text;
  autoGrow(area);
  area.focus();
  area.setSelectionRange(area.value.length, area.value.length);
  area.addEventListener('input', function () { autoGrow(area); });

  var closed = false;
  function done() {
    if (closed) return;
    closed = true;
    renderCwNotes(classId);
  }
  function save() {
    if (closed) return;
    var t = area.value.trim();
    if (!t || t === note.text) { done(); return; }
    note.text = t;
    persist();
    done();
    toast('Note updated.');
  }

  area.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.stopPropagation(); done(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); }
  });
  row.querySelector('[data-act="save"]').addEventListener('click', save);
  row.querySelector('[data-act="cancel"]').addEventListener('click', done);

  var cancelDown = false;
  row.querySelector('[data-act="cancel"]').addEventListener('mousedown', function () {
    cancelDown = true;
  });
  area.addEventListener('blur', function () {
    setTimeout(function () {
      if (cancelDown) { cancelDown = false; return; }
      save();
    }, 0);
  });
}

// the note's words are the edit control — click them and they become
// an auto-growing well in place. Esc keeps the old words, Cmd/Ctrl+Enter
// (or Save) keeps the new ones; an emptied note is a cancel, not a
// delete — the x already owns deletion.
function startNoteEdit(row) {
  var ts = parseInt(row.dataset.ts, 10);
  var c = byId(currentId);
  var note = c && (c.notesLog || []).find(function (n) { return n.ts === ts; });
  if (!note || row.classList.contains('editing')) return;
  row.classList.add('editing');
  row.innerHTML =
    '<div class="tv-note-main">' +
      '<span class="tv-note-date">' + fmtDate(ts) + '</span>' +
      '<textarea class="tv-note-edit" aria-label="Teaching note"></textarea>' +
    '</div>' +
    '<button type="button" class="tv-note-act" data-act="save" title="Save note" aria-label="Save note"><span class="material-symbols-sharp i-sm">check</span></button>' +
    '<button type="button" class="tv-note-act" data-act="cancel" title="Cancel" aria-label="Cancel"><span class="material-symbols-sharp i-sm">close</span></button>';

  var area = row.querySelector('.tv-note-edit');
  area.value = note.text;
  autoGrow(area);
  area.focus();
  area.setSelectionRange(area.value.length, area.value.length);
  area.addEventListener('input', function () { autoGrow(area); });

  var closed = false;
  function done() {
    if (closed) return;
    closed = true;
    renderTeach(currentId);
  }
  function save() {
    if (closed) return;
    var t = area.value.trim();
    if (!t || t === note.text) { done(); return; }
    note.text = t;
    persist();
    done();
    toast('Note updated.');
  }

  area.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.stopPropagation(); done(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); }
  });
  row.querySelector('[data-act="save"]').addEventListener('click', save);
  row.querySelector('[data-act="cancel"]').addEventListener('click', done);

  // clicking away keeps the words too — the check is a promise, not a
  // toll. Cancel is the one exit that must still mean cancel, and its
  // mousedown lands before the blur, so it can wave the save off.
  var cancelDown = false;
  row.querySelector('[data-act="cancel"]').addEventListener('mousedown', function () {
    cancelDown = true;
  });
  area.addEventListener('blur', function () {
    setTimeout(function () {
      if (cancelDown) { cancelDown = false; return; }
      save();
    }, 0);
  });
}

function renderTvMeta(c) {
  var st = stampFor(c);
  document.getElementById('tv-meta').innerHTML =
    (c.classType ? esc(c.classType) + ' \u00B7 ' : '') +
    esc((c.length || 60) + ' min') + ' \u00B7 ' +
    '<span class="date-toggle" title="Show ' + (dateMode() === 'edited' ? 'created' : 'edited') + ' date">' +
    st.label + ' ' + fmtDate(st.ts) + '</span>';
}

// ─── SHARING — the public projection ─────────────────────────────────────────
// The whitelist builder lives in lib/publish.js (fsPublish.buildProjection)
// so every room can keep a shared class current — this page just calls it.

function renderTitleFav(c) {
  // each mark rides in a wrapper anchor so the house tooltip can hang
  // off it (the glyph span itself is a clipped 1em box)
  document.getElementById('tv-title').innerHTML =
    esc(c.title || 'Untitled Class') +
    (c.pinned ? '<span class="tv-mark" data-tooltip="In your favorites"><span class="material-symbols-sharp tv-title-fav">favorite</span></span>' : '') +
    (c.shared ? '<span class="tv-mark" data-tooltip="Shared to your profile"><span class="material-symbols-sharp tv-title-shared">language</span></span>' : '');
}

// ─── EDITOR ──────────────────────────────────────────────────────────────────

// which flow types belong in which class section
var SECTION_FLOWS = {
  warmup:     ['warmup'],
  nohands:    ['bridge', 'nohands', 'slomo'],
  peak:       ['peak', 'slomo'],
};

// the added slots pick by their chosen type (slomo rides along, the
// peak section's precedent)
var SLOT_FLOWS = {
  bridge:   ['bridge', 'slomo'],
  nohands:  ['nohands', 'slomo'],
  workshop: ['workshop'],
};

var editExtras = [];   // the editor's working set of added flow slots

// which flow types a section's picker offers
function typesForKey(key) {
  var x = editExtras.find(function (e) { return e.key === key; });
  if (x) return SLOT_FLOWS[x.type] || [x.type];
  return SECTION_FLOWS[key];
}

function sectionHtml(s) {
  var isSlot = !!s.slotType;
  var removeBtn = isSlot
    ? '<button type="button" class="cw-remove-btn" data-remove="' + s.key + '" title="Remove section" data-tooltip="Remove">' +
        '<span class="material-symbols-sharp">close</span>' +
      '</button>'
    : '';
  var hasPicker = isSlot || SECTION_FLOWS[s.key];
  var right = hasPicker
    ? '<span class="cw-head-right">' +
        '<span class="cw-flow-name" data-flowname="' + s.key + '"></span>' +
        '<button type="button" class="cw-swap-btn" data-insert="' + s.key + '" title="Replace flow" data-tooltip="Replace" hidden>' +
          '<span class="material-symbols-sharp">swap_horiz</span>' +
        '</button>' +
        '<button type="button" class="cw-insert-btn" data-insert="' + s.key + '">' +
          '<span class="material-symbols-sharp">airline_stops</span>Insert a Flow' +
        '</button>' +
        removeBtn +
      '</span>'
    : (removeBtn ? '<span class="cw-head-right">' + removeBtn + '</span>' : '');
  var head = '<div class="cw-section-head"><span class="label-1">' + s.label + '</span>' + right + '</div>';
  var area = '<textarea class="cw-area" data-key="' + s.key + '" rows="' + s.rows + '" placeholder="' + s.placeholder + '"></textarea>';
  return '<div class="cw-section">' + head + area + '</div>';
}

function buildEditor() {
  var parts = [];
  orderedSections({ extras: editExtras }).forEach(function (s) {
    parts.push(sectionHtml(s));
    // the add-a-flow door stands after the last slot (or the bridge),
    // as long as there's a seat left
    var last = editExtras.length
      ? s.key === editExtras[editExtras.length - 1].key
      : s.key === 'nohands';
    if (last && editExtras.length < MAX_EXTRAS) {
      parts.push(
        '<div class="cw-section cw-flow-add">' +
          '<button type="button" class="cw-add-row" id="flow-add-row">' +
            '<span class="cw-attach-name">Add a flow</span>' +
            '<span class="cw-attach-title">Flow</span>' +
            '<span class="material-symbols-sharp i-md">add</span>' +
          '</button>' +
        '</div>');
    }
  });
  document.getElementById('cw-sections').innerHTML = parts.join('');
  document.querySelectorAll('.cw-area').forEach(function (el) {
    el.addEventListener('input', function () { autoGrow(el); });
  });
  // slot removal arms first — the site's two-press delete
  document.querySelectorAll('#cw-sections .cw-remove-btn').forEach(function (btn) {
    wireConfirmDelete(btn, function () { removeSlot(btn.dataset.remove); });
  });
}

function removeSlot(key) {
  var vals = collectSections();
  delete vals[key];
  editExtras = editExtras.filter(function (x) { return x.key !== key; });
  delete editMeta[key];
  rebuildSections(vals);
  markDirty();
}

// slot add/remove re-renders the sections — the written words ride along
function rebuildSections(vals) {
  buildEditor();
  document.querySelectorAll('.cw-area').forEach(function (el) {
    el.value = vals[el.dataset.key] || '';
    autoGrow(el);
  });
  updateSectionLinks();
}

function setLengthCollapsed(collapsed) {
  document.getElementById('cw-length-bar').hidden = !collapsed;
  document.getElementById('cw-length-btns').hidden = collapsed;
}

function setLength(mins) {
  document.getElementById('cw-length-tag').textContent = mins + ' min';
  editLength = mins;
  document.querySelectorAll('#cw-length-btns .chip').forEach(function (b) {
    b.classList.toggle('on', parseInt(b.dataset.len) === mins);
  });
}

document.getElementById('cw-length-change').addEventListener('click', function () {
  setLengthCollapsed(false);
});

document.getElementById('cw-length-btns').addEventListener('click', function (e) {
  var btn = e.target.closest('.chip');
  if (btn) { setLength(parseInt(btn.dataset.len)); setLengthCollapsed(true); markDirty(); }
});

// the attached story lives in the writing column, read live from
// the library — like a linked flow, its parent is the truth
function renderStoryChips() {
  var stories = loadStories();
  var items = attachedIds
    .map(function (sid) { return stories.find(function (x) { return x.id === sid; }); })
    .filter(Boolean);

  document.getElementById('story-add-row').hidden = !!items.length;
  document.getElementById('cw-story-body').hidden = !items.length;

  document.getElementById('cw-story-list').innerHTML = items.map(function (st) {
    var label = st.title || st.starter || 'Untitled Story';
    // same folded drawer as the teach view, plus a detach control
    return '<div class="cw-story-item fd-cues fd-cues-editable">' +
      '<button type="button" class="fd-cues-head" aria-expanded="false">' +
        '<span class="fd-cues-name">' + esc(label) + '</span>' +
        '<span class="fd-cues-title">Story</span>' +
        '<span class="material-symbols-sharp fd-cues-chev i-md">expand_more</span>' +
      '</button>' +
      '<button type="button" class="fd-cues-x cw-remove-btn" data-rmstory="' + st.id + '" title="Detach story" data-tooltip="Detach" aria-label="Detach story">' +
        '<span class="material-symbols-sharp i-sm">close</span>' +
      '</button>' +
      '<div class="fd-cues-body" hidden>' +
        (st.title && st.starter ? '<p class="tv-story-starter">' + esc(st.starter) + '</p>' : '') +
        '<div class="tv-story-text">' + fsStoryHtml(st) + '</div>' +
        '<div class="fd-cues-foot">' +
          '<a class="fd-cues-open" href="stories?id=' + st.id + '" data-tooltip="Open in Your Stories" aria-label="Open in Your Stories">' +
            '<span class="material-symbols-sharp i-sm">open_in_new</span>' +
          '</a>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function classViews() {
  return [document.getElementById('list-view'), document.getElementById('teach-view'), document.getElementById('edit-view')];
}

// `after` runs once the editor is visible and composed — callers that
// pre-fill the fresh editor (duplicate) must go through it, or the
// deferred render would wipe their writes
function showEdit(id, push, after) {
  editingId = id;
  var c = id != null ? byId(id) : null;

  fsSwapView(classViews(), document.getElementById('edit-view'), function () {
    document.getElementById('cw-title').value = c ? (c.title || '') : '';
    document.getElementById('cw-playlist').value = c ? (c.playlist || '') : '';
    document.getElementById('cw-class-type').value = c ? (c.classType || '') : '';
    hideTypeMenu();
    editProps = c && c.props ? c.props.slice() : [];
    editBlockCount = c && c.blockCount ? c.blockCount : 2;
    renderPropChips();
    setPropsCollapsed(true);
    setLengthCollapsed(true);
    document.getElementById('cw-playlist-url').value = c ? (c.playlistUrl || '') : '';
    document.getElementById('cw-video-url').value = c ? (c.videoUrl || '') : '';
    setLength(c && c.length ? c.length : 60);
    attachedIds = c && c.storyIds ? c.storyIds.slice() : [];
    renderStoryChips();

    editExtras = c ? extrasOf(c).map(function (x) { return { key: x.key, type: x.type }; }) : [];
    buildEditor();
    document.querySelectorAll('.cw-area').forEach(function (el) {
      el.value = c ? (c.sections[el.dataset.key] || '') : '';
      autoGrow(el);
    });
    editMeta = c && c.sectionMeta ? JSON.parse(JSON.stringify(c.sectionMeta)) : {};
    updateSectionLinks();

    // the margin remembers — past teaching notes ride along while
    // you revise, editable right here with the teach view's grammar
    renderCwNotes(c ? c.id : null);

    document.getElementById('editor-back-label').textContent =
      fsBackLabel(c ? (c.title || 'Untitled Class') : 'Your Classes');
    dirty = false;
    // an untouched existing class IS saved; a fresh one has nothing to save yet
    setSaveButton(c ? 'saved' : 'idle');

    if (!c) document.getElementById('cw-title').focus();
    document.title = ((c && c.title) || 'New Class') + ' — Flow School';
    if (after) after();
  });

  if (push) fsPushState(c ? 'your-classes?edit=' + id : 'your-classes?new=1');
}

// ─── UNSAVED-CHANGES GUARD + SAVED STATE ─────────────────────────────────────
// Explicit save model: edits set a dirty flag; leaving with unsaved
// changes asks first (refresh/close gets the browser's native warning).
// Saving stays in the editor and the button holds a "Saved ✓" state
// until the next change.

var dirty = false;
// legacy cleanup from the earlier draft-slot approach
try { localStorage.removeItem('flowschool_class_draft'); } catch (_) {}

function isEditing() {
  return !document.getElementById('edit-view').hidden;
}

function editorUrl() {
  return editingId != null ? 'your-classes?edit=' + editingId : 'your-classes?new=1';
}

// 'saved'  → ✓ Saved, disabled (current state is committed)
// 'idle'   → labeled but disabled (new class, nothing to save yet)
// 'ready'  → labeled and enabled (unsaved changes exist)
function setSaveButton(state) {
  var btn = document.getElementById('save-btn');
  if (state === 'saved') {
    fsSetLabel(btn, '<span class="material-symbols-sharp i-md fs-check-in">check</span>Saved');
    btn.disabled = true;
  } else {
    fsSetLabel(btn, editingId != null ? 'Save Changes' : 'Save');
    btn.disabled = (state === 'idle');
  }
}

function markDirty() {
  if (!isEditing()) return;
  if (!dirty) setSaveButton('ready');
  dirty = true;
}

var confirmDiscard = fsWireDiscardModal();

window.addEventListener('beforeunload', function (e) {
  if (isEditing() && dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ─── PROPS — decided by default; choices appear on demand ────────────────────

var PROP_ORDER = ['Blocks', 'Strap', 'Bolster', 'Blanket', 'Wall', 'Chair'];

function sortProps(list) {
  return list.slice().sort(function (a, b) {
    return PROP_ORDER.indexOf(a) - PROP_ORDER.indexOf(b);
  });
}

var editProps = [];
var editBlockCount = 2;

function propTagText(p) {
  if (p !== 'Blocks') return p;
  return editBlockCount + (editBlockCount === 1 ? ' Block' : ' Blocks');
}

function propTagList() {
  return sortProps(editProps).map(propTagText);
}

function renderPropChips() {
  document.querySelectorAll('#cw-props-chips .chip').forEach(function (chip) {
    chip.classList.toggle('on', editProps.indexOf(chip.dataset.prop) !== -1);
  });
  var hasBlocks = editProps.indexOf('Blocks') !== -1;
  document.getElementById('cw-blocks-count').hidden = !hasBlocks;
  document.getElementById('cw-blocks-input').value = editBlockCount;
}

function renderPropsBar() {
  document.getElementById('cw-props-tags').innerHTML =
    propTagList().map(function (t) { return '<span class="cw-props-tag">' + esc(t) + '</span>'; }).join('');
  document.getElementById('cw-props-change').textContent = editProps.length ? 'Change' : 'Add Props';
}

function setPropsCollapsed(collapsed) {
  document.getElementById('cw-props-bar').hidden = !collapsed;
  document.getElementById('cw-props-open').hidden = collapsed;
  if (collapsed) renderPropsBar();
}

document.getElementById('cw-props-change').addEventListener('click', function () {
  renderPropChips();
  setPropsCollapsed(false);
});

document.getElementById('cw-props-done').addEventListener('click', function () {
  setPropsCollapsed(true);
});

document.getElementById('cw-props-chips').addEventListener('click', function (e) {
  var chip = e.target.closest('.chip');
  if (!chip) return;
  var p = chip.dataset.prop;
  var i = editProps.indexOf(p);
  if (i === -1) editProps.push(p); else editProps.splice(i, 1);
  renderPropChips();
  markDirty();
});

document.getElementById('cw-blocks-input').addEventListener('input', function () {
  var n = parseInt(this.value, 10);
  if (isNaN(n)) return; // mid-typing; clamp on blur
  editBlockCount = Math.min(99, Math.max(1, n));
  markDirty();
});

document.getElementById('cw-blocks-input').addEventListener('blur', function () {
  var n = parseInt(this.value, 10);
  editBlockCount = isNaN(n) ? 2 : Math.min(99, Math.max(1, n));
  this.value = editBlockCount;
});

// ─── CLASS TYPE — combo: type freely, or pick a type you've used ─────────────

function knownClassTypes() {
  var seen = {}, out = [];
  // the chips describe the room you're in: your classes, or the saved ones
  var source = savedOnly
    ? (savedCache || []).map(function (r) { return { classType: r.class_type }; })
    : classes;
  source.forEach(function (c) {
    var t = (c.classType || '').trim();
    if (!t) return;
    var k = t.toLowerCase();
    if (!seen[k]) { seen[k] = 1; out.push(t); }
  });
  return out.sort(function (a, b) { return a.localeCompare(b); });
}

var typeSel = -1;

function renderTypeMenu() {
  var input = document.getElementById('cw-class-type');
  var menu = document.getElementById('cw-type-menu');
  var q = input.value.trim().toLowerCase();
  var items = knownClassTypes().filter(function (t) {
    return !q || (t.toLowerCase().indexOf(q) !== -1 && t.toLowerCase() !== q);
  });
  if (!items.length) { menu.hidden = true; typeSel = -1; return; }
  typeSel = Math.min(typeSel, items.length - 1);
  menu.innerHTML = items.map(function (t, i) {
    return '<button type="button" class="cw-type-row' + (i === typeSel ? ' sel' : '') + '" data-v="' + esc(t) + '">' + esc(t) + '</button>';
  }).join('');
  menu.hidden = false;
}

function hideTypeMenu() {
  document.getElementById('cw-type-menu').hidden = true;
  typeSel = -1;
}

(function () {
  var input = document.getElementById('cw-class-type');
  var menu = document.getElementById('cw-type-menu');

  input.addEventListener('focus', renderTypeMenu);
  input.addEventListener('input', function () {
    typeSel = -1;
    renderTypeMenu();
    markDirty();
  });
  input.addEventListener('blur', function () {
    setTimeout(hideTypeMenu, 120);
  });

  input.addEventListener('keydown', function (e) {
    if (menu.hidden) return;
    var rows = menu.querySelectorAll('.cw-type-row');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      typeSel = (typeSel + 1) % rows.length;
      renderTypeMenu();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      typeSel = typeSel <= 0 ? rows.length - 1 : typeSel - 1;
      renderTypeMenu();
    } else if (e.key === 'Enter' && typeSel !== -1) {
      e.preventDefault();
      input.value = rows[typeSel].dataset.v;
      hideTypeMenu();
      markDirty();
    } else if (e.key === 'Escape') {
      hideTypeMenu();
    }
  });

  menu.addEventListener('mousedown', function (e) {
    var row = e.target.closest('.cw-type-row');
    if (!row) return;
    e.preventDefault();
    input.value = row.dataset.v;
    hideTypeMenu();
    markDirty();
    input.focus();
  });
})();

function playlistUrlValue() {
  var v = document.getElementById('cw-playlist-url').value.trim();
  if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
  return v;
}

// ─── ADD A FLOW — the slot type picker ───────────────────────────────────────
// The door asks which kind of section this is; the chosen slot renders
// in place and the door moves below it.

var SLOT_PICK = (function () {
  var panel = document.createElement('div');
  panel.className = 'sh-suggest flow-pick';
  panel.hidden = true;
  document.querySelector('.cw-editor').appendChild(panel);

  function close() { panel.hidden = true; }

  function open(anchor) {
    panel.innerHTML = Object.keys(SLOT_TYPES).map(function (t) {
      return '<div class="sh-row" data-slottype="' + t + '">' +
        '<span class="sh-code">' + SLOT_TYPES[t].label + '</span>' +
      '</div>';
    }).join('');
    var ed = document.querySelector('.cw-editor').getBoundingClientRect();
    var ar = anchor.getBoundingClientRect();
    panel.hidden = false;
    panel.style.left = (ar.left - ed.left) + 'px';
    panel.style.top = (ar.bottom - ed.top + 6) + 'px';
  }

  panel.addEventListener('click', function (ev) {
    var row = ev.target.closest('.sh-row');
    if (!row) return;
    close();
    addSlot(row.dataset.slottype);
  });

  document.addEventListener('click', function (ev) {
    if (!panel.hidden && !panel.contains(ev.target) && !ev.target.closest('#flow-add-row')) close();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !panel.hidden) close();
  });

  return { open: open, close: close };
})();

function addSlot(type) {
  var key = freeSlotKey(editExtras);
  if (!key) return;
  var vals = collectSections();
  editExtras.push({ key: key, type: type });
  rebuildSections(vals);
  var area = document.querySelector('.cw-area[data-key="' + key + '"]');
  if (area) area.focus();
  markDirty();
}

document.getElementById('cw-sections').addEventListener('click', function (ev) {
  var btn = ev.target.closest('#flow-add-row');
  if (!btn) return;
  SLOT_PICK.open(btn);
});

function collectSections() {
  var out = {};
  document.querySelectorAll('.cw-area').forEach(function (el) {
    out[el.dataset.key] = el.value.trim();
  });
  return out;
}

// ─── FLOWS ↔ SECTIONS ────────────────────────────────────────────────────────
// Insert a saved flow into its matching section (copy with
// provenance), or save a written section back to Your Flows.

var editMeta = {};

var FLOW_TAGS = { warmup: 'Warm Up', bridge: 'Bridge', nohands: 'No Hands', peak: 'Peak', workshop: 'Workshop', slomo: 'Slo Mo', restorative: 'Restorative' };

function loadFlowLib() {
  try {
    return JSON.parse(localStorage.getItem('flowschool_flows') || '[]');
  } catch (_) { return []; }
}

function saveFlowLib(list) {
  localStorage.setItem('flowschool_flows', JSON.stringify(list));
}

var flowPoseCount = fsPoseCount;

function resolveFlow(id) {
  return loadFlowLib().find(function (f) { return f.id === id; });
}

// ─── CUE SHEETS UNDER A LINKED FLOW (teach view) ─────────────────────────────
// Read-only drawers below each linked flow, the flow page's anatomy.
// fs-cue-flows is normalized exactly the way its own pages normalize it,
// so every reader agrees on ids and the one-flow-per-sheet cap.

var TV_INEX = { IN: 'Inhale', EX: 'Exhale' };

function classCueStore() {
  try {
    var raw = JSON.parse(localStorage.getItem('fs-cue-flows') || '[]');
    var list = Array.isArray(raw) ? raw : Object.keys(raw || {}).map(function (k) { return raw[k]; });
    return list.filter(Boolean).map(function (e, i) {
      if (e.id == null) e.id = (Date.parse(e.savedAt) || 0) + i;
      if (e.flowIds == null) e.flowIds = (e.flowId != null ? [e.flowId] : []);
      if (e.flowIds.length > 1) e.flowIds = e.flowIds.slice(0, 1);
      return e;
    });
  } catch (_) { return []; }
}

function cueSheetsForFlow(flowId) {
  return classCueStore()
    .filter(function (e) { return (e.flowIds || []).indexOf(flowId) !== -1; })
    .sort(function (a, b) { return new Date(b.savedAt) - new Date(a.savedAt); });
}

// one row's parts — the cue viewer's grammar, pose always in caps
function tvCueLineParts(r) {
  var verb = (r.verb || '').trim();
  var body = (r.body || '').trim();
  var dir  = (r.dir  || '').trim();
  var pose = (r.pose || '').trim().toUpperCase();
  if (!verb && !body && !dir && !pose) return null;
  var sentence = '';
  if (verb || body || dir) {
    var bodyNorm = body && !/\byour\b/i.test(body) ? 'your ' + body : body;
    sentence = [verb, bodyNorm, dir].filter(Boolean).join(' ');
    if (sentence.slice(-1) !== '.') sentence += '.';
    sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  }
  var line = sentence || pose;
  if (sentence && pose) line = sentence + ' ' + pose + '.';
  return { breath: TV_INEX[r.inex] || '', line: line, pose: pose };
}

function tvCueDrawerHtml(entry) {
  var parts = (entry.rows || []).map(tvCueLineParts).filter(Boolean);
  var hasBreath = parts.some(function (x) { return x.breath; });
  return '<div class="fd-cues" data-sheet="' + entry.id + '">' +
    '<button type="button" class="fd-cues-head" aria-expanded="false">' +
      '<span class="fd-cues-name">' + esc(entry.name || 'Untitled') + '</span>' +
      '<span class="fd-cues-title">Cues</span>' +
      '<span class="material-symbols-sharp fd-cues-chev i-md">expand_more</span>' +
    '</button>' +
    '<div class="fd-cues-body" hidden>' +
      (parts.length
        ? parts.map(function (x) {
            return '<div class="fd-cue">' +
              (hasBreath ? '<span class="fd-cue-breath">' + esc(x.breath) + '</span>' : '') +
              '<span class="fd-cue-text">' + esc(x.line) + '</span>' +
              (x.pose ? '<span class="fd-cue-pose">' + esc(x.pose) + '</span>' : '') +
            '</div>';
          }).join('')
        : '<p class="fd-cues-none">Nothing written on this sheet yet.</p>') +
      '<div class="fd-cues-foot">' +
        '<a class="fd-cues-open" href="your-cues?id=' + entry.id + '" data-tooltip="Open in Your Cues" aria-label="Open in Your Cues">' +
          '<span class="material-symbols-sharp i-sm">open_in_new</span>' +
        '</a>' +
      '</div>' +
    '</div>' +
  '</div>';
}

// one delegated ear — heads unfold; survives every teach re-render
function fsToggleDrawerHead(e) {
  var head = e.target.closest('.fd-cues-head');
  if (!head) return false;
  var body = head.parentElement.querySelector('.fd-cues-body');
  var open = head.getAttribute('aria-expanded') !== 'true';
  fsUnfold(body, open);
  head.setAttribute('aria-expanded', open ? 'true' : 'false');
  return true;
}
document.getElementById('tv-sections').addEventListener('click', fsToggleDrawerHead);
// stories are drawers too, in a container of their own
document.getElementById('tv-stories').addEventListener('click', fsToggleDrawerHead);

// linked sections read from the parent flow; the class stores a
// snapshot only as a fallback for deleted flows
function updateSectionLinks() {
  // every section wearing a picker, standing or slot — read from the DOM
  var keys = [].map.call(document.querySelectorAll('.cw-flow-name[data-flowname]'), function (el) {
    return el.dataset.flowname;
  });
  keys.forEach(function (key) {
    var nameEl = document.querySelector('.cw-flow-name[data-flowname="' + key + '"]');
    var swapBtn = document.querySelector('.cw-swap-btn[data-insert="' + key + '"]');
    var insBtn = document.querySelector('.cw-insert-btn[data-insert="' + key + '"]');
    var area = document.querySelector('.cw-area[data-key="' + key + '"]');
    if (!nameEl || !area) return;
    var m = editMeta[key];
    var flow = m && m.flowId != null ? resolveFlow(m.flowId) : null;

    if (m && !flow) {
      // parent flow was deleted — the section keeps its snapshot, unlinked
      delete editMeta[key];
      m = null;
    }

    if (flow) {
      area.value = flow.text;
      area.readOnly = true;
      area.tabIndex = -1;
      area.classList.add('linked');
      autoGrow(area);
      nameEl.textContent = flow.name;
      swapBtn.hidden = false;
      insBtn.hidden = true;
      if (m.flowName !== flow.name) m.flowName = flow.name;
    } else {
      area.readOnly = false;
      area.tabIndex = 0;
      area.classList.remove('linked');
      nameEl.textContent = '';
      swapBtn.hidden = true;
      insBtn.hidden = false;
    }
  });
}

var FLP = (function () {
  var panel = document.createElement('div');
  panel.className = 'sh-suggest flow-pick';
  panel.hidden = true;
  document.querySelector('.cw-editor').appendChild(panel);

  var openKey = null;

  function close() { panel.hidden = true; openKey = null; }

  function open(key, anchor) {
    openKey = key;
    var types = typesForKey(key) || [];
    var flows = loadFlowLib()
      .filter(function (f) { return types.indexOf(f.type) !== -1; })
      .sort(function (a, b) { return (b.editedAt || b.id) - (a.editedAt || a.id); });
    var area = document.querySelector('.cw-area[data-key="' + key + '"]');
    var linked = !!editMeta[key];
    var hasText = area && area.value.trim().length > 0;
    var linkedId = linked ? editMeta[key].flowId : null;

    panel.innerHTML =
      (flows.length
        ? flows.map(function (f, i) {
            return '<div class="sh-row' + (f.id === linkedId ? ' sel' : '') + '" data-fid="' + f.id + '">' +
              '<span class="sh-code">' + esc(f.name || 'Untitled Flow') + '</span>' +
              '<span class="sh-full">' + FLOW_TAGS[f.type] + ' &#183; ' + flowPoseCount(f.text) + ' poses</span>' +
            '</div>';
          }).join('')
        : '<div class="flp-empty">No ' + (FLOW_TAGS[types[0]] || '').toLowerCase() + ' flows saved yet.</div>') +
      (linked
        ? '<button type="button" class="flp-action" data-detach="' + key + '">' +
            '<span class="material-symbols-sharp">link_off</span>Detach &#8212; edit freely in this class' +
          '</button>'
        : (hasText
          ? '<button type="button" class="flp-action" data-saveflow="' + key + '">' +
              '<span class="material-symbols-sharp">add</span>Save this section as a flow' +
            '</button>'
          : ''));

    var ed = document.querySelector('.cw-editor').getBoundingClientRect();
    var ar = anchor.getBoundingClientRect();
    panel.hidden = false;
    var left = ar.right - ed.left - panel.offsetWidth;
    panel.style.left = Math.max(0, left) + 'px';
    panel.style.top = (ar.bottom - ed.top + 6) + 'px';
  }

  panel.addEventListener('click', function (ev) {
    var row = ev.target.closest('.sh-row');
    if (row) {
      insertFlow(openKey, parseInt(row.dataset.fid, 10));
      close();
      return;
    }
    var act = ev.target.closest('.flp-action');
    if (act) {
      if (act.dataset.detach) {
        var dkey = act.dataset.detach;
        close();
        detachFlow(dkey);
      } else {
        var key = act.dataset.saveflow;
        close();
        openSaveFlowModal(key);
      }
    }
  });

  document.addEventListener('click', function (ev) {
    if (!panel.hidden && !panel.contains(ev.target) && !ev.target.closest('.cw-insert-btn') && !ev.target.closest('.cw-swap-btn')) close();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !panel.hidden) close();
  });

  return { open: open, close: close };
})();

function insertFlow(key, fid) {
  var f = loadFlowLib().find(function (x) { return x.id === fid; });
  var area = document.querySelector('.cw-area[data-key="' + key + '"]');
  if (!f || !area) return;
  var hadText = area.value.trim().length > 0 && !editMeta[key];
  editMeta[key] = { flowId: f.id, flowName: f.name };
  updateSectionLinks();
  markDirty();
  if (hadText) toast('Replaced with ' + f.name + '.');
}

function detachFlow(key) {
  // the text stays as a copy — editable, theirs
  delete editMeta[key];
  updateSectionLinks();
  markDirty();
  var area = document.querySelector('.cw-area[data-key="' + key + '"]');
  if (area) area.focus();
}

// section → flow-type when saving back to the library
function primaryTypeOf(key) {
  return (typesForKey(key) || [])[0] || 'warmup';
}

var saveFlowKey = null;

function openSaveFlowModal(key) {
  saveFlowKey = key;
  var input = document.getElementById('sf-name-input');
  input.value = '';
  document.getElementById('sf-modal').hidden = false;
  requestAnimationFrame(function () { input.focus(); });
}

document.getElementById('sf-modal-cancel').addEventListener('click', function () {
  document.getElementById('sf-modal').hidden = true;
});

document.getElementById('sf-modal').addEventListener('click', function (e) {
  if (e.target === e.currentTarget) e.currentTarget.hidden = true;
});

document.getElementById('sf-modal-confirm').addEventListener('click', function () {
  var input = document.getElementById('sf-name-input');
  var name = input.value.trim();
  if (!name) { input.focus(); return; }
  var area = document.querySelector('.cw-area[data-key="' + saveFlowKey + '"]');
  var text = area ? area.value.trim() : '';
  if (!text) { document.getElementById('sf-modal').hidden = true; return; }
  var lib = loadFlowLib();
  var entry = { id: Date.now(), name: name, type: primaryTypeOf(saveFlowKey), text: text, editedAt: Date.now() };
  lib.push(entry);
  saveFlowLib(lib);
  editMeta[saveFlowKey] = { flowId: entry.id, flowName: entry.name };
  updateSectionLinks();
  markDirty();
  document.getElementById('sf-modal').hidden = true;
  toast('Saved to Your Flows.');
});

document.getElementById('cw-sections').addEventListener('click', function (ev) {
  // slot removal is wired per-button in buildEditor (two-press confirm)
  var btn = ev.target.closest('.cw-insert-btn') || ev.target.closest('.cw-swap-btn');
  if (btn) FLP.open(btn.dataset.insert, btn);
});

// ─── FOCUS DIMMING — the room narrows around the section you're in ──────────

(function () {
  var editorEl = document.querySelector('.cw-editor');

  function clearDim() {
    editorEl.classList.remove('dimming');
    editorEl.querySelectorAll('.cw-section.is-focused').forEach(function (el) {
      el.classList.remove('is-focused');
    });
  }

  editorEl.addEventListener('focusin', function (e) {
    if (!e.target.classList || !e.target.classList.contains('cw-area')) { clearDim(); return; }
    var sec = e.target.closest('.cw-section');
    if (!sec) { clearDim(); return; }
    editorEl.querySelectorAll('.cw-section.is-focused').forEach(function (el) {
      el.classList.remove('is-focused');
    });
    sec.classList.add('is-focused');
    editorEl.classList.add('dimming');
  });

  editorEl.addEventListener('focusout', function () {
    setTimeout(function () {
      var ae = document.activeElement;
      if (!ae || !ae.classList || !ae.classList.contains('cw-area')) clearDim();
    }, 10);
  });
})();

// ─── SHORTHAND SUGGEST ───────────────────────────────────────────────────────
// While writing a flow, matches from the shorthand library appear under
// the caret. Tab and Enter insert the top match; arrows arm a row;
// Esc dismisses for the current pose token (Esc first when you want a
// literal newline mid-token).

// no auto ' / ' after a pick — the flows editor's rule; the separator
// stays the writer's move
var SH = fsShorthandSuggest({
  container: '.cw-editor',
  sep: function () { return ''; },
});

document.getElementById('cw-sections').addEventListener('input', function (ev) {
  if (ev.target.classList.contains('cw-area')) SH.show(ev.target);
  markDirty();
});
document.getElementById('cw-title').addEventListener('input', markDirty);
document.getElementById('cw-playlist').addEventListener('input', markDirty);
document.getElementById('cw-playlist-url').addEventListener('input', markDirty);
document.getElementById('cw-video-url').addEventListener('input', markDirty);
document.getElementById('cw-sections').addEventListener('keydown', function (ev) {
  if (ev.target.classList.contains('cw-area')) SH.onKey(ev);
});
document.getElementById('cw-sections').addEventListener('focusout', function () {
  setTimeout(SH.hideIfStale, 120); // allow row clicks + field-to-field moves
});

// ─── VIEW SWITCHING ──────────────────────────────────────────────────────────

function showList(push) {
  releaseWake();
  currentId = null;
  editingId = null;
  fsSwapView(classViews(), document.getElementById('list-view'), function () {
    renderList(document.getElementById('class-search').value);
    document.title = 'Your Classes — Flow School';
  });
  if (push) fsPushState('your-classes');
}

function showTeach(id, push) {
  // the back button names where one step actually lands
  document.getElementById('back-label').textContent = fsBackLabel('Classes');
  fsSwapView(classViews(), document.getElementById('teach-view'), function () {
    renderTeach(id);
    // the printed PDF is named from document.title
    var c = byId(id);
    document.title = ((c && c.title) || 'Untitled Class') + ' — Flow School';
  });
  if (push) fsPushState('your-classes?id=' + id);
}

function route() {
  releaseWake();
  var params = new URLSearchParams(window.location.search);
  if (params.get('new')) { showEdit(null); return; }
  var eid = params.get('edit');
  if (eid && byId(parseInt(eid))) { showEdit(parseInt(eid)); return; }
  var id = params.get('id');
  if (id && byId(parseInt(id))) { showTeach(parseInt(id)); }
  else { showList(); }
}

window.addEventListener('popstate', function (e) {
  fsSyncNavDepth(e.state);
  if (isEditing() && dirty) {
    confirmDiscard(function (yes) {
      if (yes) { dirty = false; route(); }
      else { fsPushState(editorUrl()); }
    });
  } else {
    route();
  }
});

// ─── WAKE LOCK — keep the screen on while teaching ───────────────────────────
// Lives in the teach view's ⋯ menu; wakeWanted survives the browser
// dropping the lock when the tab hides.

var wakeWanted = false;

function releaseWake() {
  if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
  wakeWanted = false;
}

async function toggleWake() {
  if (wakeLock) { releaseWake(); toast('Screen can sleep again.'); return; }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeWanted = true;
    toast('Screen will stay awake while you teach.');
    wakeLock.addEventListener('release', function () {
      wakeLock = null;
    });
  } catch (_) {
    toast('Couldn’t keep the screen awake on this device.');
  }
}

// the browser drops wake locks when the tab hides — take it back
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && wakeWanted && !wakeLock) {
    navigator.wakeLock.request('screen').then(function (wl) { wakeLock = wl; }).catch(function () {});
  }
});

// ─── EVENTS ──────────────────────────────────────────────────────────────────

var classSearchT; // the list changes at typing pauses, not per keystroke
document.getElementById('class-search').addEventListener('input', function (e) {
  clearTimeout(classSearchT);
  classSearchT = setTimeout(function () {
    renderList(e.target.value);
  }, 140);
});

var favOnly = false;
var typeFilter = 'all';

function renderTypeFilter() {
  var el = document.getElementById('class-type-filter');
  var types = knownClassTypes();
  if (!types.length) {
    el.hidden = true;
    typeFilter = 'all';
    return;
  }
  // a vanished type (last class of it deleted/retyped) resets the filter
  if (typeFilter !== 'all' && types.map(function (t) { return t.toLowerCase(); }).indexOf(typeFilter) === -1) {
    typeFilter = 'all';
  }
  el.hidden = false;
  el.innerHTML = '<button class="filter-chip' + (typeFilter === 'all' ? ' active' : '') + '" data-t="all">All</button>' +
    types.map(function (t) {
      var key = t.toLowerCase();
      return '<button class="filter-chip' + (typeFilter === key ? ' active' : '') + '" data-t="' + esc(key) + '">' + esc(t) + '</button>';
    }).join('');
}

document.getElementById('class-type-filter').addEventListener('click', function (e) {
  var chip = e.target.closest('.filter-chip');
  if (!chip) return;
  typeFilter = chip.dataset.t;
  renderList(document.getElementById('class-search').value);
});
document.getElementById('fav-filter-btn').addEventListener('click', function () {
  favOnly = !favOnly;
  this.classList.toggle('on', favOnly);
  // favorites live on your own classes — the two lenses don't stack
  if (favOnly && savedOnly) {
    savedOnly = false;
    document.getElementById('saved-filter-btn').classList.remove('on');
  }
  renderList(document.getElementById('class-search').value);
});

document.getElementById('sort-btn').addEventListener('click', function () {
  localStorage.setItem(SORT_KEY, sortMode() === 'edited' ? 'created' : 'edited');
  renderList(document.getElementById('classes-search') ? document.getElementById('classes-search').value : '');
});

document.getElementById('new-class-btn').addEventListener('click', function () {
  showEdit(null, true);
});

document.getElementById('class-index').addEventListener('click', function (e) {
  var row = e.target.closest('.class-row');
  if (!row) return;
  e.preventDefault();
  showTeach(parseInt(row.dataset.id), true);
});

document.getElementById('back-btn').addEventListener('click', function () {
  fsGoBack(function () { showList(true); });
});

document.getElementById('tv-meta').addEventListener('click', function (e) {
  if (!e.target.closest('.date-toggle')) return;
  toggleDateMode();
  var c = byId(currentId);
  if (c) renderTvMeta(c);
});

// ─── ACTIONS MENU — pin / duplicate / delete ─────────────────────────────────

var menu = fsWireItemMenu(document.getElementById('tv-menu'), {
  items: function () {
    var c = byId(currentId) || {};
    return [
      { act: 'pin', icon: 'favorite', iconClass: c.pinned ? 'filled' : '',
        label: c.pinned ? 'Remove from favorites' : 'Add to favorites' },
      { act: 'print', icon: 'print', label: 'Print class sheet' },
      { act: 'dup', icon: 'content_copy', label: 'Duplicate' },
      { act: c.shared ? 'unshare' : 'share',
        icon: c.shared ? 'visibility_off' : 'language',
        label: c.shared ? 'Make private' : 'Share to profile' },
    ].concat('wakeLock' in navigator
      ? [{ act: 'wake', icon: 'visibility_lock', iconClass: wakeWanted ? 'filled' : '',
           label: wakeWanted ? 'Let the screen sleep' : 'Keep screen awake' }]
      : []
    ).concat([
      { act: 'del', icon: 'delete', label: 'Delete class' },
    ]);
  },
  confirm: { del: 'Click again to delete' },
  on: function (act) {
    var c = byId(currentId);
    if (!c) return;
    if (act === 'print') {
      window.print();
    } else if (act === 'pin') {
      c.pinned = !c.pinned;
      persist();
      renderTitleFav(c);
      toast(c.pinned ? 'Added to your favorites.' : 'Removed from favorites.');
    } else if (act === 'dup') {
      duplicateCurrent();
    } else if (act === 'wake') {
      toggleWake();
    } else if (act === 'share') {
      document.getElementById('share-modal').hidden = false;
    } else if (act === 'unshare') {
      document.getElementById('unshare-modal').hidden = false;
    } else if (act === 'del') {
      // the projection (and everyone's saved references) go with it
      if (window.fsPublish) fsPublish.remove(currentId);
      classes = classes.filter(function (x) { return x.id !== currentId; });
      persist();
      toast('Class removed.');
      showList(true);
    }
  },
});

// ── share / make private — deliberate, explained, reversible ────────────────

document.getElementById('share-cancel').addEventListener('click', function () {
  document.getElementById('share-modal').hidden = true;
});
document.getElementById('share-modal').addEventListener('click', function (e) {
  if (e.target === e.currentTarget) e.currentTarget.hidden = true;
});
document.getElementById('share-confirm').addEventListener('click', function () {
  var c = byId(currentId);
  if (!c) return;
  var btn = this;
  btn.disabled = true;
  fsPublish.publish(c.id, fsPublish.buildProjection(c)).then(function (res) {
    btn.disabled = false;
    document.getElementById('share-modal').hidden = true;
    if (res && res.error) { toast('Sharing didn’t save. Try again in a moment.'); return; }
    c.shared = true;
    persist();
    renderTitleFav(c);
    toast('Shared to your profile.');
  });
});

document.getElementById('unshare-cancel').addEventListener('click', function () {
  document.getElementById('unshare-modal').hidden = true;
});
document.getElementById('unshare-modal').addEventListener('click', function (e) {
  if (e.target === e.currentTarget) e.currentTarget.hidden = true;
});
document.getElementById('unshare-confirm').addEventListener('click', function () {
  var c = byId(currentId);
  if (!c) return;
  var btn = this;
  btn.disabled = true;
  fsPublish.unpublish(c.id).then(function (res) {
    btn.disabled = false;
    document.getElementById('unshare-modal').hidden = true;
    if (res && res.error) { toast('That didn’t save. Try again in a moment.'); return; }
    c.shared = false;
    persist();
    renderTitleFav(c);
    toast('This class is private again.');
  });
});

document.getElementById('more-btn').addEventListener('click', function (e) {
  e.stopPropagation();
  menu.toggle();
});

document.getElementById('edit-btn').addEventListener('click', function () {
  showEdit(currentId, true);
});

function duplicateCurrent() {
  var c = byId(currentId);
  if (!c) return;
  showEdit(null, true, function () {
    document.getElementById('cw-title').value = (c.title || 'Untitled Class') + ' — copy';
    document.getElementById('cw-playlist').value = c.playlist || '';
    document.getElementById('cw-playlist-url').value = c.playlistUrl || '';
    document.getElementById('cw-video-url').value = c.videoUrl || '';
    document.getElementById('cw-class-type').value = c.classType || '';
    editProps = c.props ? c.props.slice() : [];
    editBlockCount = c.blockCount || 2;
    renderPropChips();
    setPropsCollapsed(true);
    attachedIds = (c.storyIds || []).slice();
    renderStoryChips();
    setLength(c.length || 60);
    editExtras = extrasOf(c).map(function (x) { return { key: x.key, type: x.type }; });
    buildEditor();
    document.querySelectorAll('.cw-area').forEach(function (el) {
      el.value = (c.sections && c.sections[el.dataset.key]) || '';
      autoGrow(el);
    });
    editMeta = c.sectionMeta ? JSON.parse(JSON.stringify(c.sectionMeta)) : {};
    updateSectionLinks();
    markDirty();
    toast('Copy ready \u2014 make it yours.');
  });
}

// both exits guard unsaved changes; back honors its label (the list),
// cancel returns to where the edit began
function leaveEditor(dest) {
  function leave() {
    dirty = false;
    if (dest === 'list' || editingId == null) { showList(true); }
    else { showTeach(editingId, true); }
  }
  if (dirty) { confirmDiscard(function (yes) { if (yes) leave(); }); }
  else { leave(); }
}

document.getElementById('cancel-btn').addEventListener('click', function () { leaveEditor('auto'); });
document.getElementById('editor-back-btn').addEventListener('click', function () {
  // back rides history (guarded); Cancel keeps its explicit destination
  function leave() {
    dirty = false;
    fsGoBack(function () {
      if (editingId == null) showList(true); else showTeach(editingId, true);
    });
  }
  if (dirty) { confirmDiscard(function (yes) { if (yes) leave(); }); }
  else { leave(); }
});

document.getElementById('save-btn').addEventListener('click', function () {
  var sections = collectSections();
  var hasContent = orderedSections({ extras: editExtras }).some(function (s) { return sections[s.key]; });
  var title = document.getElementById('cw-title').value.trim();
  if (!title && !hasContent) { toast('Give it a name or a flow first.'); return; }

  if (editingId != null) {
    var c = byId(editingId);
    if (!c) return;
    c.title = title || 'Untitled Class';
    c.sections = sections;
    c.extras = editExtras.map(function (x) { return { key: x.key, type: x.type }; });
    c.sectionMeta = editMeta;
    c.storyIds = attachedIds.slice();
    c.playlist = document.getElementById('cw-playlist').value.trim();
    c.classType = document.getElementById('cw-class-type').value.trim();
    c.props = sortProps(editProps);
    c.blockCount = editBlockCount;
    c.playlistUrl = playlistUrlValue();
    c.videoUrl = document.getElementById('cw-video-url').value.trim();
    c.length = editLength;
    c.editedAt = Date.now();
    persist();
    // a shared class keeps its public copy current — every save
    // republishes the projection, so savers always read this version
    if (c.shared && window.fsPublish) {
      fsPublish.publish(c.id, fsPublish.buildProjection(c)).then(function (res) {
        if (res && res.error) toast('Your shared copy didn’t update — it will on the next save.');
      });
    }
    refreshEditor();
  } else {
    var entry = {
      id: Date.now(),
      title: title || 'Untitled Class',
      sections: sections,
      extras: editExtras.map(function (x) { return { key: x.key, type: x.type }; }),
      sectionMeta: editMeta,
      storyIds: attachedIds.slice(),
      playlist: document.getElementById('cw-playlist').value.trim(),
      classType: document.getElementById('cw-class-type').value.trim(),
      props: sortProps(editProps),
      blockCount: editBlockCount,
      playlistUrl: playlistUrlValue(),
      videoUrl: document.getElementById('cw-video-url').value.trim(),
      length: editLength,
      notesLog: [],
    };
    classes.push(entry);
    persist();
    // the editor now edits the class it just created
    editingId = entry.id;
    fsReplaceState('your-classes?edit=' + entry.id);
    refreshEditor();
  }
});

// after a save, the editor re-renders from the saved class — every
// panel control settles back into its decided state
function refreshEditor() {
  var sy = window.scrollY;
  showEdit(editingId, false);
  window.scrollTo(0, sy);
}

// teaching notes — deliberate entries, appended to the log
document.getElementById('tv-notes-area').addEventListener('input', function (e) {
  autoGrow(e.target);
});

document.getElementById('add-note-btn').addEventListener('click', function () {
  this.hidden = true;
  document.getElementById('tv-note-composer').hidden = false;
  var area = document.getElementById('tv-notes-area');
  autoGrow(area);
  area.focus();
});

document.getElementById('note-cancel-btn').addEventListener('click', function () {
  document.getElementById('tv-note-composer').hidden = true;
  document.getElementById('add-note-btn').hidden = false;
  document.getElementById('tv-notes-area').value = '';
});

document.getElementById('note-save-btn').addEventListener('click', function () {
  var area = document.getElementById('tv-notes-area');
  var text = area.value.trim();
  if (!text) { area.focus(); return; }
  var c = byId(currentId);
  if (!c) return;
  normalizeNotes(c);
  c.notesLog.push({ ts: Date.now(), day: dayStr(new Date()), text: text });
  persist();
  renderTeach(currentId);
  toast('Note added to the log.');
});

// ─── STORY PICKER ────────────────────────────────────────────────────────────

function renderStoryPicker() {
  var stories = loadStories().slice().sort(function (a, b) { return b.id - a.id; });
  var el = document.getElementById('story-pick-list');
  if (!stories.length) {
    el.innerHTML = '<p class="story-pick-empty">No saved stories yet.<br>' +
      '<a href="story-starters">Draw a starter</a> and write one first.</p>';
    return;
  }
  el.innerHTML = stories.map(function (s) {
    var on = attachedIds.indexOf(s.id) !== -1;
    return '<div class="story-pick-item' + (on ? ' on' : '') + '" data-id="' + s.id + '">' +
      '<div class="story-pick-info">' +
        '<div class="story-pick-title">' + esc(s.title || s.text.split('\n')[0]) + '</div>' +
        (s.starter ? '<div class="story-pick-starter">' + esc(s.starter) + '</div>' : '') +
      '</div>' +
      '<span class="material-symbols-sharp story-pick-check">check</span>' +
    '</div>';
  }).join('');
}

function openStoryPicker() {
  renderStoryPicker();
  document.getElementById('story-modal').hidden = false;
}

document.getElementById('story-add-row').addEventListener('click', openStoryPicker);
document.getElementById('story-change-btn').addEventListener('click', openStoryPicker);

document.getElementById('story-pick-list').addEventListener('click', function (e) {
  var item = e.target.closest('.story-pick-item');
  if (!item) return;
  var sid = parseInt(item.dataset.id);
  var idx = attachedIds.indexOf(sid);
  if (idx === -1) attachedIds.push(sid); else attachedIds.splice(idx, 1);
  item.classList.toggle('on', idx === -1);
});

document.getElementById('story-modal-done').addEventListener('click', function () {
  document.getElementById('story-modal').hidden = true;
  renderStoryChips();
  markDirty();
});

document.getElementById('story-modal').addEventListener('click', function (e) {
  if (e.target === e.currentTarget) {
    e.currentTarget.hidden = true;
    renderStoryChips();
    markDirty();
  }
});

document.getElementById('cw-story-list').addEventListener('click', function (e) {
  if (fsToggleDrawerHead(e)) return;
  var rm = e.target.closest('.cw-remove-btn');
  if (!rm) return;
  var sid = parseInt(rm.dataset.rmstory);
  attachedIds = attachedIds.filter(function (x) { return x !== sid; });
  renderStoryChips();
  markDirty();
});

// ─── INIT ────────────────────────────────────────────────────────────────────

buildEditor();
// the printed sheet carries a byline under the title (print CSS reads
// --print-byline off the document root). Falls back to auth metadata if
// the profile cache is cold; quotes stripped — they'd break the CSS string.
// ── grid ⇄ list — remembered per library ──
(function () {
  var KEY = 'fs-view-classes';
  var idx = document.getElementById('class-index');
  function apply(v) {
    idx.classList.toggle('list-view', v === 'list');
    document.getElementById('vt-grid').classList.toggle('active', v !== 'list');
    document.getElementById('vt-list').classList.toggle('active', v === 'list');
  }
  document.getElementById('vt-grid').addEventListener('click', function () {
    localStorage.setItem(KEY, 'grid'); apply('grid');
  });
  document.getElementById('vt-list').addEventListener('click', function () {
    localStorage.setItem(KEY, 'list'); apply('list');
  });
  apply(localStorage.getItem(KEY) || 'grid');
})();

(function () {
  // the byline signs with the person's real name (first + last),
  // falling back to auth metadata, then the display name
  var name = localStorage.getItem('fs-full-name') || '';
  if (!name) {
    try {
      var tok = JSON.parse(localStorage.getItem('sb-zizuopmcpzicbwngjagp-auth-token'));
      var meta = (tok && tok.user && tok.user.user_metadata) || {};
      name = meta.full_name || meta.name || '';
    } catch (_) {}
  }
  if (!name) name = localStorage.getItem('fs-display-name') || '';
  name = name.replace(/["\\]/g, '').trim();
  if (name) document.documentElement.style.setProperty('--print-byline', '"by: ' + name + '"');
})();

route();

// any projection gone stale in another room heals on arrival
if (window.fsPublish) fsPublish.refreshShared();
