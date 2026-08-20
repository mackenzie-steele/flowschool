// ─── ASSET TITLE SYNC — the Mux dashboard knows videos by name ───────────────
//
// The editor calls this (fire-and-forget) after a save so the Mux asset's
// meta.title follows the video's title. Uploads get theirs at asset.ready
// in the webhook; this covers every rename after that.
//
// Admin-only: the title is public-ish, but writing to Mux is not a member
// capability. Reads the row itself — the client never supplies the asset id.
//
// Env: MUX_TOKEN_ID, MUX_TOKEN_SECRET, SUPABASE_*
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { env, requireAdmin, fail, log, muxSetAssetMeta } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'POST only');
  }
  if (!env().ok) return fail(res, 500, 'Server is not configured');

  const who = await requireAdmin(req);
  if (who.error) return fail(res, who.status, who.error);

  const videoId = typeof (req.body || {}).videoId === 'string' ? req.body.videoId.trim() : '';
  if (!videoId) return fail(res, 400, 'Which video?');

  const { data: video, error } = await who.db.from('videos')
    .select('id, title, mux_asset_id').eq('id', videoId).single();
  if (error || !video) return fail(res, 404, 'No such video');
  if (!video.mux_asset_id) return res.status(200).json({ synced: false, reason: 'no asset yet' });

  try {
    await muxSetAssetMeta(video.mux_asset_id, video.title, video.id);
  } catch (e) {
    return fail(res, 502, 'Mux did not take the title. It will land on the next save.');
  }
  log('asset-title', 'synced video=' + video.id);
  return res.status(200).json({ synced: true });
};
