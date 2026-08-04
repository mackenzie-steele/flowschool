// ─── PLAYBACK TOKENS — the paywall ───────────────────────────────────────────
//
// Every asset is created with a SIGNED playback policy, which means a
// playback id alone plays nothing. Mux will only serve the stream when the
// URL carries a JWT signed by our key. This endpoint is the only place that
// key is used, and it never leaves the server.
//
// If this endpoint is wrong, the library is either broken or free.
//
// TWO TOKENS, TWO AUDIENCES
//   aud 'v' — the video stream
//   aud 't' — the thumbnail/poster image
// A single token does not cover both; Mux checks the audience claim. Missing
// the thumbnail token is the classic symptom: video plays, poster is a
// broken image.
//
// SHORT-LIVED ON PURPOSE
// Six hours: long enough that a token cannot expire mid-class, short enough
// that one copied out of devtools is worthless by tomorrow. Playback
// continues on an expired token for the segments already authorised — the
// player re-requests when it needs more.
//
// Env: MUX_SIGNING_KEY_ID, MUX_SIGNING_PRIVATE_KEY, SUPABASE_*
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const Mux = require('@mux/mux-node').default || require('@mux/mux-node');
const { env, whoami, isAdmin, canWatch, fail, warn, log } = require('./_lib');

const TOKEN_LIFETIME = '6h';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'POST only');
  }
  if (!env().ok) return fail(res, 500, 'Server is not configured');

  const keyId = process.env.MUX_SIGNING_KEY_ID;
  const keySecret = process.env.MUX_SIGNING_PRIVATE_KEY;
  if (!keyId || !keySecret) {
    warn('playback', 'signing key not configured');
    return fail(res, 500, 'Secure playback is not configured yet');
  }

  // 1. authenticated?
  const who = await whoami(req);
  if (who.error) return fail(res, who.status, who.error);
  const db = who.db;

  const body = req.body || {};
  const videoId = typeof body.videoId === 'string' ? body.videoId.trim() : '';
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  if (!videoId && !slug) return fail(res, 400, 'Which video?');

  // 2. the video, read with the SERVICE role so the check below is ours to
  //    make rather than something RLS silently decided. The client never
  //    supplies the playback id — it comes from the row.
  const query = db.from('videos')
    .select('id, slug, title, status, visibility, mux_playback_id, thumbnail_mode, thumbnail_time_seconds, duration_seconds');
  const { data: video, error } = videoId
    ? await query.eq('id', videoId).single()
    : await query.eq('slug', slug).single();

  if (error || !video) return fail(res, 404, 'No such video');

  // 3. may this person watch it?
  const admin = await isAdmin(db, who.user.id);
  const verdict = canWatch(video, { isAdmin: admin });
  if (!verdict.allowed) {
    // 404 rather than 403 for an unpublished video: confirming that a draft
    // exists at this slug tells a stranger something they should not have.
    if (verdict.reason === 'not-published') return fail(res, 404, 'No such video');
    return fail(res, 403, 'You do not have access to this video');
  }

  // 4. is there anything to play?
  if (!video.mux_playback_id) {
    return fail(res, 409, 'This video is still processing');
  }

  // 5. mint. Both audiences in one call.
  let tokens;
  try {
    const mux = new Mux({ jwtSigningKey: keyId, jwtPrivateKey: keySecret });
    tokens = await mux.jwt.signPlaybackId(video.mux_playback_id, {
      type: ['video', 'thumbnail'],
      expiration: TOKEN_LIFETIME,
      params: video.thumbnail_mode === 'timestamp' && video.thumbnail_time_seconds != null
        ? { time: String(video.thumbnail_time_seconds) }
        : undefined,
    });
  } catch (err) {
    // Never echo the signing error to the client — it can describe the key.
    warn('playback', 'could not sign for video=' + video.id + ': ' + (err && err.message));
    return fail(res, 500, 'Could not start playback. Try again in a moment.');
  }

  // The SDK returns 'playback-token' and 'thumbnail-token' — NOT .video and
  // .thumbnail, despite the type being called Tokens. Reading the wrong keys
  // yields two undefineds and a player that fails with nothing to debug.
  // Happily these are the exact attribute names <mux-player> takes.
  const playbackToken = tokens['playback-token'];
  const thumbnailToken = tokens['thumbnail-token'];
  if (!playbackToken) {
    warn('playback', 'signed but no playback-token in the result for video=' + video.id);
    return fail(res, 500, 'Could not start playback. Try again in a moment.');
  }

  log('playback', 'token issued video=' + video.id + (admin && video.status !== 'published' ? ' (admin preview)' : ''));

  // Only what the player needs. No asset id, no upload id, no internal state.
  return res.status(200).json({
    playbackId: video.mux_playback_id,
    playbackToken: playbackToken,
    thumbnailToken: thumbnailToken,
    title: video.title,
    durationSeconds: video.duration_seconds,
    preview: verdict.reason === 'admin-preview',
    expiresIn: TOKEN_LIFETIME,
  });
};
