// ─── AUTH GUARD ──────────────────────────────────────────────────────────────
//
// To gate any page, add these scripts before your page script:
//
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
//   <script src="lib/supabase.js"></script>
//   <script src="lib/auth.js"></script>
//
// Then at the top of your page script:
//
//   const user = await requireAuth();
//
// ─────────────────────────────────────────────────────────────────────────────

async function requireAuth() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    window.location.href = 'login.html';
    return null;
  }
  return user;
}

async function signOut() {
  await db.auth.signOut();
  window.location.href = 'login.html';
}
