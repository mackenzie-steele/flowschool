// ─── DIRECT UPLOAD — hand the browser a URL to push the file straight to Mux ─
//
// The video file never touches this server. The browser PUTs it to a
// one-time Google Storage URL that Mux issues, which is the only way a 4GB
// class recording gets uploaded without a serverless function timing out.
//
// WHAT THIS ENDPOINT ACTUALLY GUARDS
// The upload URL is a capability: anyone holding it can put bytes into the
// Flow School Mux account. So it is admin-only, and it is bound to a specific
// video row before it is issued.
//
// passthrough IS THE CORRELATION
// The row's uuid goes into new_asset_settings.passthrough, so every webhook
// carries it home. Matching on asset id instead would be impossible — the
// asset does not exist yet when the upload is created.
//
// DOUBLE-CLICK SAFE
// An unconsumed upload for the same video is returned rather than a second
// one being minted. Two uploads against one row would race, and whichever
// webhook landed last would win — silently replacing a video the admin
// thought was uploaded.
//
// Env: MUX_TOKEN_ID, MUX_TOKEN_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const Mux = require('@mux/mux-node').default || require('@mux/mux-node');
const { env, requireAdmin, fail, log, warn } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'POST only');
  }
  if (!env().ok) return fail(res, 500, 'Server is not configured');
  if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
    warn('upload', 'MUX_TOKEN_ID/SECRET missing');
    return fail(res, 500, 'Video uploads are not configured yet');
  }

  const who = await requireAdmin(req);
  if (who.error) return fail(res, who.status, who.error);
  const db = who.db;

  const body = req.body || {};
  const videoId = typeof body.videoId === 'string' ? body.videoId.trim() : '';
  if (!videoId) return fail(res, 400, 'Which video is this for?');

  // The row must exist and be ours to write to. Never trust the client's
  // claim about which video it is uploading into.
  const { data: video, error: readErr } = await db
    .from('videos').select('id, status, mux_upload_id, mux_asset_id, title')
    .eq('id', videoId).single();
  if (readErr || !video) return fail(res, 404, 'That video record does not exist');

  // Replacing a finished video is a deliberate act; the admin UI asks first.
  // Here we only refuse the accidental case: an upload already in flight.
  if (video.mux_upload_id && !video.mux_asset_id && body.replace !== true) {
    const mux = new Mux({ tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET });
    try {
      const existing = await mux.video.uploads.retrieve(video.mux_upload_id);
      if (existing && existing.status === 'waiting' && existing.url) {
        log('upload', 'reusing pending upload for video=' + videoId);
        return res.status(200).json({
          uploadUrl: existing.url, uploadId: existing.id, videoId, reused: true,
        });
      }
    } catch (e) {
      // it expired or was consumed — fall through and make a new one
      log('upload', 'previous upload unusable, creating a fresh one');
    }
  }

  const origin = req.headers.origin || 'https://flowschool.io';

  let upload;
  try {
    const mux = new Mux({ tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET });
    upload = await mux.video.uploads.create({
      // the browser PUTs from this origin; Mux rejects others
      cors_origin: origin,
      new_asset_settings: {
        // SIGNED, always. A public policy would make every video playable by
        // anyone holding the id, which is the whole thing we are preventing.
        playback_policy: ['signed'],
        passthrough: videoId,
        video_quality: 'basic',
        // Every upload gets English captions generated automatically.
        // Generation runs AFTER the asset is ready, so the track arrives as
        // 'preparing' and the webhook's track events flip it to 'ready' —
        // the editor's Captions section follows along on its own.
        inputs: [{
          generated_subtitles: [{ language_code: 'en', name: 'English (auto)' }],
        }],
      },
    });
  } catch (err) {
    warn('upload', 'Mux refused: ' + (err && err.message));
    return fail(res, 502, 'Mux would not start the upload. Try again in a moment.');
  }

  const { error: writeErr } = await db.from('videos')
    .update({ mux_upload_id: upload.id, status: 'uploading',
              mux_error: null, updated_by: who.user.id })
    .eq('id', videoId);
  if (writeErr) {
    // The upload exists at Mux but we could not record it. Say so rather than
    // returning a URL whose result we would never be able to attach.
    warn('upload', 'created upload ' + upload.id + ' but could not save it: ' + writeErr.message);
    return fail(res, 500, 'Could not attach the upload to this video. Nothing was uploaded.');
  }

  log('upload', 'created ' + upload.id + ' for video=' + videoId);
  return res.status(200).json({ uploadUrl: upload.url, uploadId: upload.id, videoId });
};
