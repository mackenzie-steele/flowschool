// ─── TELEMETRY — eyes on production ──────────────────────────────────────────
//
// Two jobs, both invisible to teachers:
//   1. Loads Vercel Web Analytics (page/visit counts). The script only exists
//      once Analytics is switched on in the Vercel dashboard; until then the
//      request 404s harmlessly.
//   2. Logs uncaught errors + unhandled promise rejections to the
//      `client_errors` table — so "it broke" reports come with receipts.
//
// The logger is deliberately paranoid: capped at 5 per page load, deduped,
// wrapped so a failure inside it can never loop or break the page.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  // ── Vercel Web Analytics ──
  try {
    var va = document.createElement('script');
    va.defer = true;
    va.src = '/_vercel/insights/script.js';
    document.head.appendChild(va);
  } catch (_) {}

  // ── error logger ──
  var TOKEN_KEY = 'sb-zizuopmcpzicbwngjagp-auth-token';
  var sent = 0;
  var seen = {};

  function log(message, source, line, stack) {
    try {
      if (sent >= 5) return;                      // never flood on a crash loop
      var key = String(message).slice(0, 120) + '|' + source + '|' + line;
      if (seen[key]) return;                      // same error once per load
      seen[key] = 1;
      sent++;
      if (!window.db) return;                     // client not up yet — skip

      var userId = null;
      try {
        var raw = localStorage.getItem(TOKEN_KEY);
        if (raw) userId = (JSON.parse(raw).user || {}).id || null;
      } catch (_) {}

      db.from('client_errors').insert({
        user_id: userId,
        message: String(message || '').slice(0, 500),
        source: String(source || '').slice(0, 300),
        line: typeof line === 'number' ? line : null,
        stack: String(stack || '').slice(0, 2000),
        context: {
          page: window.location.pathname,
          version: window.fsVersion || '',
          viewport: window.innerWidth + 'x' + window.innerHeight,
          ua: navigator.userAgent,
        },
      }).then(function () {}, function () {});
    } catch (_) {}
  }

  window.addEventListener('error', function (e) {
    log(e.message, e.filename || '', e.lineno || 0, e.error && e.error.stack);
  });

  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason || {};
    log('unhandledrejection: ' + (r.message || String(r)), '', 0, r.stack);
  });
})();
