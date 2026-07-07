// ─── DELETE ACCOUNT — the one thing the browser can't do ────────────────────
//
// Deleting an auth user requires the service-role key, which must never ship
// to the browser. This function:
//   1. verifies the caller's own access token (you can only delete yourself)
//   2. clears their avatar files (storage doesn't cascade)
//   3. deletes the auth user — profiles and user_data rows cascade via their
//      `on delete cascade` foreign keys
//
// Env (injected by the Vercel↔Supabase integration):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ error: 'Server is not configured' });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Not signed in' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // whose token is this? — server-side verification, no trusting the client
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData || !userData.user) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  const uid = userData.user.id;

  // storage doesn't cascade — clear the avatar folder first (non-fatal)
  try {
    const { data: files } = await admin.storage.from('avatars').list(uid);
    if (files && files.length) {
      await admin.storage.from('avatars').remove(files.map((f) => uid + '/' + f.name));
    }
  } catch (e) {
    console.error('avatar cleanup failed (continuing):', e);
  }

  // the real deletion — cascades profiles + user_data
  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) {
    console.error('deleteUser failed:', delErr);
    return res.status(500).json({ error: 'Could not delete the account' });
  }

  return res.status(200).json({ ok: true });
};
