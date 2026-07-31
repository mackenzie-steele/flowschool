// ─── FLOW SCHOOL — Shared Motion: the change gesture ─────────────────────────
//
// fsSwapCard(card, mutate) — a generator card changes its face in place:
// the outgoing content releases (fast fade, content only — the frame stays
// put), the card's height glides to the new size, and the incoming content
// settles in. The card itself never re-enters — entrances are for arriving.
// CSS side: .card-swap-out / .card-swap-in in global.css §15.
//
// Falls back to an instant swap under reduced motion, during initial page
// load (deep links must not wait), or when a swap is already in flight.

function fsSwapCard(card, mutate) {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || card._fsSwapping || document.readyState === 'loading') { mutate(); return; }
  card._fsSwapping = true;

  var h0 = card.getBoundingClientRect().height;
  card.classList.add('card-swap-out');

  setTimeout(function () {
    mutate();
    card.classList.remove('card-swap-out');
    card.classList.add('card-swap-in');

    card.style.overflow = 'hidden';
    card.style.height = 'auto';
    var h1 = card.getBoundingClientRect().height;
    card.style.height = h0 + 'px';
    void card.offsetHeight; // commit the start height
    card.style.transition = 'height .22s cubic-bezier(.2, .6, 0, 1)';
    card.style.height = h1 + 'px';

    setTimeout(function () {
      card.classList.remove('card-swap-in');
      card.style.cssText = '';
      card._fsSwapping = false;
    }, 240);
  }, 100);
}

// fsSetLabel(btn, next) — a button changes its label like a state machine,
// not a patch: the old label fades, the width eases to fit, the new label
// fades in. `next` is an HTML string, or a function that applies the change
// itself (for buttons whose label lives in a child span). Width easing
// skips itself on stretched buttons (width didn't change — nothing to ease).
// CSS side: .btn-label-swap / .btn-label-out in global.css §15.

function fsSetLabel(btn, next) {
  var apply = typeof next === 'function' ? next : function () { btn.innerHTML = next; };
  if (typeof next === 'string' && btn.innerHTML === next) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || document.readyState === 'loading') { apply(); return; }

  // a swap already in flight yields — the newest label wins, instantly
  if (btn._fsLabelT) {
    clearTimeout(btn._fsLabelT);
    btn._fsLabelT = null;
    btn.classList.remove('btn-label-swap', 'btn-label-out');
    btn.style.width = '';
    apply();
    return;
  }

  var w0 = btn.getBoundingClientRect().width;
  btn.classList.add('btn-label-swap', 'btn-label-out');

  btn._fsLabelT = setTimeout(function () {
    apply();
    btn.classList.remove('btn-label-out'); // the new label fades in
    var w1 = btn.getBoundingClientRect().width;
    if (Math.abs(w1 - w0) > 1) {
      btn.style.width = w0 + 'px';
      void btn.offsetWidth; // commit the start width
      btn.style.width = w1 + 'px'; // .btn-label-swap eases it
    }
    btn._fsLabelT = setTimeout(function () {
      btn.classList.remove('btn-label-swap');
      btn.style.width = '';
      btn._fsLabelT = null;
    }, 200);
  }, 90);
}

// fsWorking(btn, on, label) — a button awaiting a network breathes: the
// autosave dot's pulse, seated where the icon would sit, until the work
// lands. Handles the disable and (optionally) the label in one motion.

function fsWorking(btn, on, label) {
  btn.classList.toggle('btn-working', !!on);
  btn.disabled = !!on;
  if (label != null) fsSetLabel(btn, label);
}

// ── unfold — a disclosure opens like an object, not a toggle ─────────────────
// Height eases between 0 and the content's natural size with a fade riding
// along; inline styles are cleared once the move finishes so layout stays
// natural. Interruptible (rapid toggles pick up from the current height).
// Reduced motion falls back to the plain hidden flip.

function fsUnfold(el, show) {
  var isOpen = el._fsUnfoldOpen != null ? el._fsUnfoldOpen : !el.hidden;
  if (show === isOpen) return;
  el._fsUnfoldOpen = show;
  clearTimeout(el._fsUnfoldT);

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { el.hidden = !show; el.style.cssText = ''; return; }

  var startH = el.hidden ? 0 : el.getBoundingClientRect().height;
  el.hidden = false;
  var endH = show ? el.scrollHeight : 0;
  el.style.transition = 'none';
  el.style.overflow = 'hidden';
  el.style.height = startH + 'px';
  if (show && startH === 0) el.style.opacity = '0';
  void el.offsetHeight; // commit the start state
  el.style.transition = show
    ? 'height .22s cubic-bezier(.2, .6, 0, 1), opacity .22s ease'
    : 'height .16s ease, opacity .16s ease'; /* exits are quicker */
  el.style.height = endH + 'px';
  el.style.opacity = show ? '1' : '0';
  el._fsUnfoldT = setTimeout(function () {
    if (!show) el.hidden = true;
    el.style.cssText = '';
  }, show ? 240 : 180);
}

// fsFavPop(scope) — the heart arrives. Call it AFTER the re-render that adds
// the mark, and only when the thing was just favorited: the heart is rendered
// on every open of an already-favorited item, and a pop on arrival would make
// a permanent state feel like it kept re-happening.
//
// Two beats, both from parts the system already owns: the glyph springs in on
// the toast's curve (the house's one sanctioned overshoot, for exactly this
// class of small transient confirmation), and a single accent ring blooms out
// behind it and is gone. Emission, not elevation. ~380ms, then nothing.
// CSS side: .fav-pop in global.css §12b.

function fsFavPop(scope) {
  var el = (scope || document).querySelector('.fav-mark');
  if (!el) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;                      // the heart still appears — it just doesn't perform
  el.classList.remove('fav-pop');
  void el.offsetWidth;                     // restart if it's fired twice in a row
  el.classList.add('fav-pop');
  setTimeout(function () { el.classList.remove('fav-pop'); }, 600);
}

// fsCopied(icon) — the house confirmation: the glyph dissolves into a
// check (the feedback modal's settle at icon scale), holds a moment,
// then returns. Pass the glyph span, not the button.

function fsCopied(icon, glyph) {
  // the span holds an svg since the icon migration, so textContent is
  // empty — the glyph's name lives in data-fs-glyph (stamped by
  // icons.js), cached on the element so rapid re-clicks can't capture
  // the check as the "original"
  glyph = glyph || icon._fsCopyGlyph || icon.dataset.fsGlyph || icon.textContent;
  icon._fsCopyGlyph = glyph;
  clearTimeout(icon._fsCopyT);
  icon.classList.remove('fs-check-in');
  void icon.offsetWidth;
  icon.textContent = 'check';
  icon.classList.add('fs-check-in');
  icon._fsCopyT = setTimeout(function () {
    icon.classList.remove('fs-check-in');
    icon.textContent = glyph;
    // the original settles back in instead of cutting
    icon.classList.add('fs-glyph-back');
    icon._fsCopyT = setTimeout(function () {
      icon.classList.remove('fs-glyph-back');
    }, 220);
  }, 1500);
}
