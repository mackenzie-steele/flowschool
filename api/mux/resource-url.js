// ─── PDF DOWNLOADS — a 60-second door, not a permanent one ───────────────────
//
// Worksheets are paid content. The video-resources bucket is PRIVATE, and
// nothing in the database stores a URL — only a bucket-relative path. A URL
// stored in a row would bake an expiry into the data and, worse, would be a
// permanent unauthenticated link the moment it leaked.
//
// So this endpoint checks access and mints a signed URL that dies in a
// minute. Long enough to click, short enough that a copied link is useless.
//
// THE ACCESS RULE IS THE PARENT'S, NOT THE FILE'S
// Resources live in a shared library (video-collections.sql) and are linked
// to videos and/or collections. A file is exactly as private as the MOST
// public thing it is attached to: if any linked video is watchable, or any
// linked collection is live, the download is allowed. The rules themselves
// are canWatch()/canBrowseCollection() — the same ones the player and the
// collection page use, so they cannot drift.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { env, whoami, isAdmin, canWatch, canBrowseCollection, fail, log, warn } = require('./_lib');

const BUCKET = 'video-resources';
const TTL_SECONDS = 60;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'POST only');
  }
  if (!env().ok) return fail(res, 500, 'Server is not configured');

  const who = await whoami(req);
  if (who.error) return fail(res, who.status, who.error);
  const db = who.db;

  const body = req.body || {};
  const resourceId = typeof body.resourceId === 'string' ? body.resourceId.trim() : '';
  if (!resourceId) return fail(res, 400, 'Which resource?');

  // The client sends a resource id and nothing else. The path, the filename
  // and every parent come from the database — a client-supplied path would
  // let anyone read any object in the bucket.
  const { data: resource, error } = await db
    .from('resources')
    .select('id, title, storage_path, file_name, status,' +
            ' resource_links(video_id, collection_id,' +
            '  videos(id, status, visibility, published_at),' +
            '  collections(id, status, visibility, published_at))')
    .eq('id', resourceId)
    .single();

  if (error || !resource) return fail(res, 404, 'No such resource');

  const admin = await isAdmin(db, who.user.id);

  // an archived file stays for the admin; members lose the door
  if (resource.status !== 'active' && !admin) return fail(res, 404, 'No such resource');

  const links = resource.resource_links || [];
  const allowed = admin || links.some((l) => {
    if (l.videos) return canWatch(l.videos, { isAdmin: false }).allowed;
    if (l.collections) return canBrowseCollection(l.collections, { isAdmin: false }).allowed;
    return false;
  });
  if (!allowed) {
    // unattached or attached only to drafts — indistinguishable from absent
    return fail(res, 404, 'No such resource');
  }

  const { data: signed, error: signErr } = await db.storage
    .from(BUCKET)
    .createSignedUrl(resource.storage_path, TTL_SECONDS, {
      // download, not inline — a worksheet should land in Downloads with a
      // readable name rather than opening in a tab called "a3f9c1.pdf"
      download: resource.file_name || (resource.title + '.pdf'),
    });

  if (signErr || !signed) {
    warn('resource', 'could not sign ' + resourceId + ': ' + (signErr && signErr.message));
    return fail(res, 500, 'Could not prepare that download');
  }

  // the id is safe to log; the signed URL never is
  log('resource', 'signed ' + resourceId);

  return res.status(200).json({
    url: signed.signedUrl,
    fileName: resource.file_name || (resource.title + '.pdf'),
    expiresInSeconds: TTL_SECONDS,
  });
};
