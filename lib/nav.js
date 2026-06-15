// ─── FLOW SCHOOL — Contextual Nav ────────────────────────────────────────────
//
// Reads the Supabase session from localStorage (no network call) and renders
// either "Sign in + Sign up" buttons or a profile avatar in #hdr-auth.
//
// Include on every page that has <div id="hdr-auth"></div> in the header.
// No Supabase CDN required — reads directly from localStorage.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  const STORAGE_KEY = 'sb-zizuopmcpzicbwngjagp-auth-token';

  function getSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.expires_at && data.expires_at < Date.now() / 1000) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function render() {
    const el = document.getElementById('hdr-auth');
    const session = getSession();

    // Update auth slot
    if (el) {
      if (session?.user) {
        const email   = session.user.email || '';
        const initial = email.charAt(0).toUpperCase();
        el.innerHTML = `
          <a href="profile.html" class="nav-avatar-btn" title="Your profile">
            <span class="nav-initial">${initial}</span>
          </a>`;
      } else {
        el.innerHTML = `
          <div class="nav-auth-btns">
            <a href="login.html"  class="btn-ghost nav-signin">Sign in</a>
            <a href="signup.html" class="btn-nav-signup">Sign up</a>
          </div>`;
      }
    }

    // Point "← Tools" back link to dashboard when signed in
    if (session?.user) {
      document.querySelectorAll('a.btn-ghost[href="index.html"]').forEach(link => {
        if (link.textContent.includes('Tools')) {
          link.href = 'dashboard.html';
          link.textContent = '← Dashboard';
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
