// ─── MUX WEBHOOKS — the only unauthenticated endpoint in this app ────────────
//
// Mux calls this when an upload or an asset changes state. It is how a video
// stops being "processing" and becomes watchable, so if this is broken the
// whole library silently stalls with no error anywhere.
//
// THE RAW BODY IS THE WHOLE TRICK
// Signature verification hashes the EXACT bytes Mux sent. Vercel's Node
// runtime parses JSON before a handler runs, and `JSON.stringify(req.body)`
// is NOT byte-identical to what arrived — key order, whitespace and unicode
// escaping all differ. Verifying against a re-serialised body fails 100% of
// the time, and the failure looks like "Mux is misconfigured" rather than
// "we read the wrong thing". So this reads the stream itself.
//
// `export const config = { api: { bodyParser: false } }` is the Next.js way
// and does nothing here. On Vercel's plain Node runtime the body is only
// parsed if something reads req.body — so we read the stream first and never
// touch req.body at all.
//
// NO AUTH, BY NECESSITY
// Mux cannot present a Supabase token. The signature IS the authentication:
// an unverified request is rejected before a single field is read from it.
//
// IDEMPOTENT BY CONSTRUCTION, NOT BY A DEDUPE TABLE
// Mux retries, and delivers out of order. Every write here is a conditional
// UPDATE keyed on the video id carried in `passthrough`, and none of them
// can move a row backwards:
//   · asset.ready never downgrades a row that is already published
//   · a late asset.created cannot overwrite the ids a later ready event set
// Replaying yesterday's events changes nothing. That is a property of the
// statements, so it holds even for deliveries we never anticipated.
//
// Env: MUX_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const Mux = require('@mux/mux-node').default || require('@mux/mux-node');
const { createClient } = require('@supabase/supabase-js');

// Read the request as bytes. Never touches req.body, which would trigger
// Vercel's parser and lose the original encoding.
function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// A log line that is useful at 3am and gives away nothing. Ids are safe —
// they are not credentials — but payloads and signatures never appear.
function log(event, videoId, note) {
  console.log('[mux-webhook] ' + event +
    (videoId ? ' video=' + videoId : '') +
    (note ? ' — ' + note : ''));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const secret = process.env.MUX_WEBHOOK_SECRET;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !url || !serviceKey) {
    // Deliberately vague to the caller, specific in the log.
    console.error('[mux-webhook] missing env: ' +
      [!secret && 'MUX_WEBHOOK_SECRET', !url && 'SUPABASE_URL',
       !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean).join(', '));
    return res.status(500).json({ error: 'not configured' });
  }

  let event;
  try {
    const body = await rawBody(req);
    const mux = new Mux({ webhookSecret: secret });
    // AWAIT IS LOAD-BEARING. unwrap() is async: without it `event` is a
    // Promise with no .type, every event falls through to the default branch
    // and returns 200, and the rejection for a bad signature surfaces as an
    // unhandled rejection OUTSIDE this try/catch. The endpoint then accepts
    // unsigned and forged requests while looking like it works.
    event = await mux.webhooks.unwrap(body.toString('utf8'), req.headers, secret);
  } catch (err) {
    // 401, not 400: this is an authentication failure. Mux will retry, which
    // is right — a rotated secret should heal once the env var is updated.
    console.warn('[mux-webhook] signature rejected: ' + (err && err.message));
    return res.status(401).json({ error: 'bad signature' });
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const type = event.type;
  const data = event.data || {};

  // The correlation value. Set when the direct upload is created, so it
  // survives out-of-order and duplicate delivery. Without it we would be
  // matching on asset ids that do not exist yet at upload time.
  const videoId = data.passthrough ||
    (data.new_asset_settings && data.new_asset_settings.passthrough) || null;

  try {
    switch (type) {

      // The upload became an asset. First moment we learn the asset id.
      case 'video.upload.asset_created': {
        if (!videoId) break;
        await db.from('videos')
          .update({ mux_asset_id: data.asset_id, status: 'processing',
                    mux_asset_status: 'preparing' })
          .eq('id', videoId)
          // never drag a finished video backwards if this arrives late
          .in('status', ['draft', 'uploading', 'processing']);
        log(type, videoId, 'asset ' + data.asset_id);
        break;
      }

      case 'video.asset.created': {
        if (!videoId) break;
        await db.from('videos')
          .update({ mux_asset_id: data.id, mux_asset_status: data.status || 'preparing',
                    status: 'processing' })
          .eq('id', videoId)
          .in('status', ['draft', 'uploading', 'processing']);
        log(type, videoId);
        break;
      }

      // The one that matters: it is watchable now.
      case 'video.asset.ready': {
        if (!videoId) break;
        const playback = (data.playback_ids || [])
          .find(p => p.policy === 'signed') || (data.playback_ids || [])[0];
        const track = (data.tracks || []).find(t => t.type === 'video') || {};

        const patch = {
          mux_asset_id: data.id,
          mux_asset_status: 'ready',
          mux_playback_id: playback ? playback.id : null,
          duration_seconds: data.duration != null ? data.duration : null,
          aspect_ratio: data.aspect_ratio || null,
          max_resolution: data.max_stored_resolution ||
                          (track.max_height ? track.max_height + 'p' : null),
          mux_error: null,
        };
        // Only lift status for rows still in flight. A published video that
        // re-emits ready keeps its status and its published_at.
        await db.from('videos').update(Object.assign({ status: 'ready' }, patch))
          .eq('id', videoId)
          .in('status', ['draft', 'uploading', 'processing', 'errored']);
        // …but always refresh the Mux facts, whatever the status.
        await db.from('videos').update(patch).eq('id', videoId);
        log(type, videoId, 'playback ' + (playback ? playback.id : 'NONE'));
        break;
      }

      case 'video.asset.errored': {
        if (!videoId) break;
        const msg = (data.errors && (data.errors.messages || [])[0]) ||
                    (data.errors && data.errors.type) || 'Mux could not process this file';
        await db.from('videos')
          .update({ status: 'errored', mux_asset_status: 'errored',
                    mux_error: String(msg).slice(0, 500) })
          .eq('id', videoId);
        console.error('[mux-webhook] asset errored video=' + videoId + ' — ' + msg);
        break;
      }

      // Deleted in the Mux dashboard, out from under us. Keep the Flow School
      // record — losing the title, description and resources because someone
      // tidied up in Mux would be a far worse outcome — but make it plain
      // that there is nothing to play.
      case 'video.asset.deleted': {
        const byId = videoId
          ? db.from('videos').update({ status: 'errored', mux_asset_status: 'deleted',
              mux_playback_id: null, mux_error: 'The Mux asset was deleted.' }).eq('id', videoId)
          : db.from('videos').update({ status: 'errored', mux_asset_status: 'deleted',
              mux_playback_id: null, mux_error: 'The Mux asset was deleted.' })
              .eq('mux_asset_id', data.id);
        await byId;
        log(type, videoId || data.id, 'record kept, marked unplayable');
        break;
      }

      case 'video.upload.errored':
      case 'video.upload.cancelled': {
        if (!videoId) break;
        await db.from('videos')
          .update({ status: type.endsWith('cancelled') ? 'draft' : 'errored',
                    mux_error: type.endsWith('cancelled') ? null : 'The upload did not finish.' })
          .eq('id', videoId)
          .in('status', ['draft', 'uploading']);
        log(type, videoId);
        break;
      }

      default:
        // Mux adds events; an unknown one is not an error. 200 so it is not
        // retried forever.
        log(type, videoId, 'ignored');
    }
  } catch (err) {
    // 500 asks Mux to retry. Safe because every handler above is idempotent.
    console.error('[mux-webhook] handler failed ' + type + ' video=' + videoId +
                  ' — ' + (err && err.message));
    return res.status(500).json({ error: 'handler failed' });
  }

  return res.status(200).json({ received: true });
};
