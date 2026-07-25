// ─── ADMIN USER ACTIONS — privileged, server-only ───────────────────────────
//
// Deactivate / reactivate / permanently delete a user, and add / remove admin
// role. All require the SERVICE ROLE (auth admin API) which must never reach
// the browser. Every call:
//   1. verifies the caller's own access token (server-side, no trusting client)
//   2. confirms the CALLER is an admin (public.admin_users)
//   3. enforces safeguards (no self-delete, no deleting/removing the last admin,
//      typed-email confirmation for permanent deletion)
//   4. writes an entry to public.admin_audit_log
//
// Env (Vercel↔Supabase integration): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Server is not configured' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) who is calling?
  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller || !caller.user) return res.status(401).json({ error: 'Invalid session' });
  const actorId = caller.user.id;
  const actorEmail = caller.user.email;

  // 2) is the caller an admin?
  const { data: isAdminRow } = await admin.from('admin_users').select('user_id').eq('user_id', actorId).maybeSingle();
  if (!isAdminRow) return res.status(403).json({ error: 'Admins only' });

  const body = req.body || {};
  const action = String(body.action || '');
  const target = String(body.target_user_id || '');
  const VALID = ['deactivate', 'reactivate', 'delete', 'add_admin', 'remove_admin'];
  if (VALID.indexOf(action) === -1) return res.status(400).json({ error: 'Unknown action' });
  if (!target) return res.status(400).json({ error: 'No target user' });

  // canonical target identity from auth (not from the client)
  const { data: targetUser, error: tErr } = await admin.auth.admin.getUserById(target);
  if (tErr || !targetUser || !targetUser.user) return res.status(404).json({ error: 'User not found' });
  const targetEmail = targetUser.user.email;

  async function adminCount() {
    const { count } = await admin.from('admin_users').select('user_id', { count: 'exact', head: true });
    return count || 0;
  }
  async function isTargetAdmin() {
    const { data } = await admin.from('admin_users').select('user_id').eq('user_id', target).maybeSingle();
    return !!data;
  }
  async function audit(meta) {
    try {
      await admin.from('admin_audit_log').insert({
        actor_id: actorId, actor_email: actorEmail, action,
        target_user_id: target, target_email: targetEmail, metadata: meta || {},
      });
    } catch (e) { console.error('audit write failed:', e); }
  }

  try {
    if (action === 'deactivate') {
      const { error } = await admin.auth.admin.updateUserById(target, { ban_duration: '876000h' }); // ~100y
      if (error) throw error;
      await audit({ result: 'deactivated' });
      return res.status(200).json({ ok: true, status: 'deactivated' });
    }

    if (action === 'reactivate') {
      const { error } = await admin.auth.admin.updateUserById(target, { ban_duration: 'none' });
      if (error) throw error;
      await audit({ result: 'reactivated' });
      return res.status(200).json({ ok: true, status: 'active' });
    }

    if (action === 'add_admin') {
      const { error } = await admin.from('admin_users').insert({
        user_id: target, email: targetEmail, note: 'granted in dashboard', added_by: actorId,
      });
      if (error && error.code !== '23505') throw error; // ignore "already admin"
      await audit({ result: 'admin_added' });
      return res.status(200).json({ ok: true, is_admin: true });
    }

    if (action === 'remove_admin') {
      if (target === actorId && (await adminCount()) <= 1)
        return res.status(400).json({ error: 'You are the last admin — add another before removing yourself.' });
      if ((await isTargetAdmin()) && (await adminCount()) <= 1)
        return res.status(400).json({ error: 'Cannot remove the last remaining admin.' });
      const { error } = await admin.from('admin_users').delete().eq('user_id', target);
      if (error) throw error;
      await audit({ result: 'admin_removed' });
      return res.status(200).json({ ok: true, is_admin: false });
    }

    if (action === 'delete') {
      // safeguard 1: never delete yourself here
      if (target === actorId)
        return res.status(400).json({ error: 'You cannot delete your own account from the admin dashboard.' });
      // safeguard 2: never delete the last admin
      if ((await isTargetAdmin()) && (await adminCount()) <= 1)
        return res.status(400).json({ error: 'Cannot delete the last remaining admin.' });
      // safeguard 3: typed-email confirmation, verified server-side
      const confirm = String(body.confirm_email || '').trim().toLowerCase();
      if (!targetEmail || confirm !== targetEmail.toLowerCase())
        return res.status(400).json({ error: 'Confirmation email does not match — deletion cancelled.' });

      // clear avatar storage first (does not cascade)
      try {
        const { data: files } = await admin.storage.from('avatars').list(target);
        if (files && files.length) await admin.storage.from('avatars').remove(files.map((f) => target + '/' + f.name));
      } catch (e) { console.error('avatar cleanup (continuing):', e); }

      // the deletion — cascades user_data, profiles, the user's public_classes
      // (and, per the live-reference model, other users' saves of those
      // classes). analytics_events.user_id is set NULL (anonymized, retained).
      const { error } = await admin.auth.admin.deleteUser(target);
      if (error) throw error;
      await audit({ result: 'permanently_deleted' });
      return res.status(200).json({ ok: true, status: 'deleted' });
    }

    return res.status(400).json({ error: 'Unhandled action' });
  } catch (e) {
    console.error('admin action failed:', action, e && e.message);
    return res.status(500).json({ error: 'The action could not be completed' });
  }
};
