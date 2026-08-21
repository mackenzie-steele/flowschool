// ─── ADMIN VIDEO ANALYTICS — Mux Data + engagement, read-only ────────────────
//
// One response carries the whole "do they watch?" story for the admin tab:
//   · Mux Data     views, watch time, avg view length per video (the player
//                  has beaconed these since day one), plus unique viewers
//   · Engagement   started/finished (video_watch_progress), saves, comments
//   · Worksheets   resource_opened events per PDF
//   · Search       settled library searches, with their result counts
//
// AUTH: needs a Mux token WITH the "Mux Data" read permission — reads
// MUX_DATA_TOKEN_ID / MUX_DATA_TOKEN_SECRET first, falls back to MUX_TOKEN_*.
//
// PRIVACY: aggregates only. video_watch_progress and library_saves are
// owner-only tables; only COUNTS computed here on the server ever leave.
// No per-member watching data is exposed, matching the project's stance.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { requireAdmin, fail, warn } = require('./_lib');

function dataAuth() {
  const id = process.env.MUX_DATA_TOKEN_ID || process.env.MUX_TOKEN_ID;
  const secret = process.env.MUX_DATA_TOKEN_SECRET || process.env.MUX_TOKEN_SECRET;
  if (!id || !secret) return null;
  return 'Basic ' + Buffer.from(id + ':' + secret).toString('base64');
}

async function muxData(auth, path) {
  const r = await fetch('https://api.mux.com/data/v1' + path, { headers: { Authorization: auth } });
  const body = await r.json().catch(function () { return {}; });
  if (!r.ok) {
    const err = new Error((body.error && (body.error.messages || []).join('; ')) || ('Mux Data ' + r.status));
    err.status = r.status;
    throw err;
  }
  return body;
}

function countBy(rows, key) {
  const out = {};
  (rows || []).forEach(function (r) {
    const k = r[key];
    if (k) out[k] = (out[k] || 0) + 1;
  });
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');

  const who = await requireAdmin(req);
  if (who.error) return fail(res, who.status, who.error);

  const auth = dataAuth();
  if (!auth) return fail(res, 500, 'Mux Data token is not configured');

  const days = Math.max(1, Math.min(parseInt(req.query.days, 10) || 30, 365));
  const tf = 'timeframe[]=' + days + ':days';
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const db = who.db;

  try {
    // Mux and the database in parallel — none of these depend on another.
    // Per-video unique viewers is best-effort: its absence must never take
    // the whole answer down.
    const [breakdown, uvBreakdown, vids, progress, saves, comments, opens, searches] = await Promise.all([
      muxData(auth, '/metrics/playing_time/breakdown?group_by=video_id&order_by=views&order_direction=desc&limit=100&' + tf),
      muxData(auth, '/metrics/unique_viewers/breakdown?group_by=video_id&limit=100&' + tf)
        .catch(function (e) { warn('analytics', 'viewers breakdown unavailable: ' + e.message); return { data: [] }; }),
      db.from('videos')
        .select('id, title, status, slug, duration_seconds, thumbnail_mode, custom_thumbnail_url, thumbnail_time_seconds, mux_playback_id')
        .in('status', ['published', 'scheduled']),
      db.from('video_watch_progress').select('video_id, completed'),
      db.from('library_saves').select('video_id').not('video_id', 'is', null),
      db.from('video_comments').select('video_id'),
      db.from('analytics_events').select('resource_id')
        .eq('event_name', 'resource_opened').gte('created_at', since),
      db.from('analytics_events').select('resource_id, metadata')
        .eq('event_name', 'library_searched').gte('created_at', since),
    ]);

    const mux = {};
    (breakdown.data || []).forEach(function (r) { if (r.field) mux[r.field] = r; });
    const viewers = {};
    (uvBreakdown.data || []).forEach(function (r) { if (r.field) viewers[r.field] = Number(r.value) || 0; });

    const started = countBy(progress.data, 'video_id');
    const finished = countBy((progress.data || []).filter(function (p) { return p.completed; }), 'video_id');
    const saveCounts = countBy(saves.data, 'video_id');
    const commentCounts = countBy(comments.data, 'video_id');

    // every live video appears — the never-watched ones are a finding, not noise
    const videos = (vids.data || []).map(function (v) {
      const m = mux[v.id] || {};
      const avgSec = Math.round((Number(m.value) || 0) / 1000);
      const dur = Number(v.duration_seconds) || 0;
      return {
        video_id: v.id,
        title: v.title,
        status: v.status,
        slug: v.slug,
        duration_seconds: dur || null,
        thumbnail_mode: v.thumbnail_mode,
        custom_thumbnail_url: v.custom_thumbnail_url,
        thumbnail_time_seconds: v.thumbnail_time_seconds,
        mux_playback_id: v.mux_playback_id,
        views: Number(m.views) || 0,
        viewers: viewers[v.id] || 0,
        watch_time_seconds: Math.round((Number(m.total_watch_time) || 0) / 1000),
        avg_view_seconds: avgSec,
        // average view length against the video's own runtime — the Uscreen
        // "average completion rate". Null when either side is unknown.
        completion: (m.views && dur) ? Math.min(100, Math.round(avgSec / dur * 100)) : null,
        started: started[v.id] || 0,
        finished: finished[v.id] || 0,
        saves: saveCounts[v.id] || 0,
        comments: commentCounts[v.id] || 0,
      };
    }).sort(function (a, b) {
      return b.views - a.views || b.watch_time_seconds - a.watch_time_seconds ||
             a.title.localeCompare(b.title);
    });

    const totals = {
      views: videos.reduce(function (s, v) { return s + v.views; }, 0),
      watch_time_seconds: videos.reduce(function (s, v) { return s + v.watch_time_seconds; }, 0),
      video_count: videos.length,
      watched_count: videos.filter(function (v) { return v.views > 0; }).length,
    };

    // unique viewers is a separate metric; its absence must never take the
    // whole answer down
    try {
      const uv = await muxData(auth, '/metrics/unique_viewers/overall?' + tf);
      if (uv.data && uv.data.value != null) totals.unique_viewers = Number(uv.data.value);
    } catch (e) { warn('analytics', 'unique_viewers unavailable: ' + e.message); }

    // worksheets: opens per resource, titles joined
    const openCounts = countBy(opens.data, 'resource_id');
    let resources = [];
    const rids = Object.keys(openCounts);
    if (rids.length) {
      const rr = await db.from('resources').select('id, title').in('id', rids);
      const rt = {};
      (rr.data || []).forEach(function (r) { rt[r.id] = r.title; });
      resources = rids.map(function (id) {
        return { resource_id: id, title: rt[id] || 'Deleted file', opens: openCounts[id] };
      }).sort(function (a, b) { return b.opens - a.opens; });
    }

    // search phrases: the settled query rides in resource_id, its result
    // count in metadata — zero results is the signal worth surfacing
    const byPhrase = {};
    (searches.data || []).forEach(function (r) {
      const q = r.resource_id;
      if (!q) return;
      const n = r.metadata && typeof r.metadata.results === 'number' ? r.metadata.results : null;
      if (!byPhrase[q]) byPhrase[q] = { phrase: q, count: 0, results: n };
      byPhrase[q].count += 1;
      if (n != null) byPhrase[q].results = n;
    });
    const searchRows = Object.keys(byPhrase).map(function (k) { return byPhrase[k]; })
      .sort(function (a, b) { return b.count - a.count || a.phrase.localeCompare(b.phrase); });

    return res.status(200).json({
      days: days, totals: totals, videos: videos,
      resources: resources, searches: searchRows,
    });
  } catch (e) {
    if (e.status === 403) {
      return fail(res, 502,
        'Mux rejected the token for Data access — the token needs the "Mux Data" read permission');
    }
    warn('analytics', e.message);
    return fail(res, 502, 'Could not load video analytics');
  }
};
