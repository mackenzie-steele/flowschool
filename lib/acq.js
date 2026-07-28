// ─── First-touch acquisition capture ────────────────────────────────────────
// Records where a visitor arrived from, ONCE per device (first touch wins), as
// early as possible so it survives the auth redirect and the signup round-trip.
// analytics.js reads it to attribute the eventual user_signed_up event.
//
// Loaded on the auth pages (login/signup), which don't run sync.js. Every
// gated page captures the same thing at the top of sync.js — so whichever page
// a visitor lands on first, the source is recorded before anything redirects.
//
// This is the ONE signal you can never backfill: the referrer and landing URL
// exist only on the first page of a visit. Miss it there and it's gone.
(function () {
  try {
    if (localStorage.getItem('fs-acq')) return;      // first touch wins — never overwrite
    var loc = window.location || {};
    var path = loc.pathname || '';
    var qs = new URLSearchParams(loc.search || '');
    var ref = document.referrer || '';
    var host = loc.hostname || '';

    // derive a coarse channel — the field you actually aggregate on
    var channel;
    if (qs.get('utm_source')) {
      channel = 'campaign';
    } else if (/\/class\/?$/.test(path) && qs.get('p')) {
      channel = 'shared_class';                       // arrived via a shared class link
    } else if (/^\/@/.test(path) || /\/teacher\/?$/.test(path) || qs.get('t')) {
      channel = 'profile';                            // arrived via a teacher profile link
    } else if (ref) {
      var rhost = '';
      try { rhost = new URL(ref).hostname.replace(/^www\./, ''); } catch (_) {}
      channel = (rhost && rhost.indexOf(host) === -1) ? ('ref:' + rhost) : 'internal';
    } else {
      channel = 'direct';                             // typed URL / bookmark / no referrer
    }

    localStorage.setItem('fs-acq', JSON.stringify({
      channel: channel,
      landing: (path + (loc.search || '')).slice(0, 80),
      referrer: ref.slice(0, 80),
      utm_source: (qs.get('utm_source') || '').slice(0, 60),
      utm_medium: (qs.get('utm_medium') || '').slice(0, 60),
      utm_campaign: (qs.get('utm_campaign') || '').slice(0, 60)
    }));
  } catch (_) {}
})();
