// ─── THE site version — bump here and nowhere else ──────────────────────────
// nav.js reads window.fsVersion for the sidebar plate + injected footer;
// telemetry stamps it onto error logs; the block below stamps it onto the
// static footers of pages that don't run nav.js (login/signup/reset/privacy).

window.fsVersion = 'v3.2.6';

document.addEventListener('DOMContentLoaded', function () {
  var f = document.querySelector('.site-footer');
  // only static, version-less footers need stamping — nav.js's injected
  // footer already carries the version (and doesn't exist yet when this runs)
  if (f && f.textContent.indexOf(window.fsVersion) === -1) {
    f.textContent += ' · ' + window.fsVersion;
  }
});
