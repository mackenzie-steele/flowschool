// ─── GENERATE CAPTIONS — for videos uploaded before captions were automatic ──
//
// New uploads request generated subtitles at upload time (see upload.js).
// This endpoint covers everything older: it asks Mux to generate an English
// subtitle track for an EXISTING asset's audio. The result arrives through
// the same webhook track events as everything else, so the editor's
// Captions section updates without this endpoint writing anything itself.
//
// Admin-only: generation is a billable-ish operation against our Mux
// account, and there is no member-facing reason to trigger it.
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
    warn('captions', 'MUX_TOKEN_ID/SECRET missing');
    return fail(res, 500, 'Captions are not configured yet');
  }

  const who = await requireAdmin(req);
  if (who.error) return fail(res, who.status, who.error);
  const db = who.db;

  const body = req.body || {};
  const videoId = typeof body.videoId === 'string' ? body.videoId.trim() : '';
  if (!videoId) return fail(res, 400, 'Which video is this for?');

  const { data: video, error: readErr } = await db
    .from('videos').select('id, mux_asset_id, mux_asset_status, captions')
    .eq('id', videoId).single();
  if (readErr || !video) return fail(res, 404, 'That video record does not exist');
  if (!video.mux_asset_id || video.mux_asset_status !== 'ready') {
    return fail(res, 409, 'The video needs to finish processing first');
  }
  const existing = Array.isArray(video.captions) ? video.captions : [];
  if (existing.some(t => t.status !== 'errored')) {
    return fail(res, 409, 'This video already has captions');
  }

  const mux = new Mux({ tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET });

  // generation hangs off the AUDIO track, so find it first
  let audioTrack;
  try {
    const asset = await mux.video.assets.retrieve(video.mux_asset_id);
    audioTrack = (asset.tracks || []).find(t => t.type === 'audio');
  } catch (err) {
    warn('captions', 'could not read asset for video=' + videoId + ': ' + (err && err.message));
    return fail(res, 502, 'Mux could not find that video right now. Try again in a moment.');
  }
  if (!audioTrack) return fail(res, 409, 'This video has no audio track to caption');

  try {
    await mux.video.assets.generateSubtitles(video.mux_asset_id, audioTrack.id, {
      generated_subtitles: [{ language_code: 'en', name: 'English (auto)' }],
    });
  } catch (err) {
    warn('captions', 'generate refused for video=' + videoId + ': ' + (err && err.message));
    return fail(res, 502, 'Mux would not start caption generation. Try again in a moment.');
  }

  log('captions', 'generation started for video=' + videoId);
  // the webhook's track events take it from here
  return res.status(200).json({ started: true });
};
