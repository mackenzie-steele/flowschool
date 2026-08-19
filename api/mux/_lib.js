// ─── Shared server helpers for the video endpoints ───────────────────────────
//
// The leading underscore keeps Vercel from turning this into a route — it is
// a module, not an endpoint.
//
// It does NOT live in lib/, because lib/ is served to browsers: lib/nav.js is
// fetchable at flowschool.io/lib/nav.js. Nothing under api/ is.
//
// WHY canWatch() IS ITS OWN FUNCTION
// There is no membership system yet — signup is open during beta and every
// authenticated account can reach everything. So "may watch" currently means
// "is signed in". That will change when Uscreen entitlement arrives, and when
// it does this is the ONE function that changes. Spreading the rule across
// four endpoints is how it ends up meaning four different things.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { createClient } = require('@supabase/supabase-js');

function env() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, serviceKey, ok: !!(url && serviceKey) };
}

function service() {
  const { url, serviceKey } = env();
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Resolve the caller from their Supabase bearer token — the same shape
// api/feedback.js uses. A client-supplied user id is never trusted; the id
// comes from verifying the token server-side.
async function whoami(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return { error: 'Not signed in', status: 401 };
  const db = service();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data || !data.user) return { error: 'Invalid session', status: 401 };
  return { user: data.user, db };
}

// Admin is the existing single source of truth: the admin_users table, read
// through the is_admin() definer function. No second concept introduced.
async function isAdmin(db, userId) {
  const { data, error } = await db.rpc('is_admin', { uid: userId });
  if (error) return false;
  return data === true;
}

async function requireAdmin(req) {
  const who = await whoami(req);
  if (who.error) return who;
  const admin = await isAdmin(who.db, who.user.id);
  if (!admin) return { error: 'Admins only', status: 403 };
  return who;
}

// ── the access rule, in one place ────────────────────────────────────────────
// TODAY: signed in, and the video is live. Admins may preview anything.
// LATER: this grows a membership/entitlement check and nothing else moves.
//
// "Live" includes a scheduled video whose moment has passed — the RLS read
// policy (video-scheduling.sql) says exactly that, and this function must
// not disagree with it or a member could see a card they cannot play.
function isLive(row) {
  if (!row) return false;
  if (row.status === 'published') return true;
  return row.status === 'scheduled' && row.published_at &&
         new Date(row.published_at).getTime() <= Date.now();
}

function canWatch(video, { isAdmin: admin }) {
  if (!video) return { allowed: false, reason: 'not-found' };
  if (admin) return { allowed: true, reason: 'admin-preview' };
  if (!isLive(video)) return { allowed: false, reason: 'not-published' };
  if (video.visibility === 'members' || video.visibility === 'unlisted' ||
      video.visibility === 'public') return { allowed: true, reason: 'member' };
  return { allowed: false, reason: 'visibility' };
}

// The same shape for a collection. A collection has no Mux asset — access
// means "may see the page and download its resources".
function canBrowseCollection(collection, { isAdmin: admin }) {
  if (!collection) return { allowed: false, reason: 'not-found' };
  if (admin) return { allowed: true, reason: 'admin-preview' };
  if (!isLive(collection)) return { allowed: false, reason: 'not-published' };
  return { allowed: true, reason: 'member' };
}

// One shape for every failure, so the client never has to guess.
function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

// Ids are safe to log; tokens, signatures and signed URLs never are.
function log(where, msg) { console.log('[mux:' + where + '] ' + msg); }
function warn(where, msg) { console.warn('[mux:' + where + '] ' + msg); }

module.exports = { env, service, whoami, isAdmin, requireAdmin, canWatch,
  canBrowseCollection, fail, log, warn };
