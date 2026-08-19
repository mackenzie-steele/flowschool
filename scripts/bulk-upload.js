#!/usr/bin/env node
/**
 * FLOW SCHOOL — bulk-upload a Drive folder of videos into Mux + Supabase
 *
 *   node scripts/bulk-upload.js "Warm Up Flows"            # one folder
 *   node scripts/bulk-upload.js "Warm Up Flows" --dry-run  # plan only
 *
 * RUN ONE FOLDER AT A TIME. Materialized Drive files stay cached on disk
 * (macOS offers no scriptable evict), so after a folder finishes: in Finder,
 * right-click it and choose "Remove Download" before starting the next.
 * The disk guard stops the run before free space gets dangerous.
 *
 * WHAT IT DOES, PER FOLDER
 *   1. ensures a DRAFT collection named after the folder exists
 *   2. for each video file, creates a draft `videos` row (title cleaned from
 *      the filename), asks Mux for a direct upload, and streams the file up
 *   3. links the video into the collection playlist, in filename order
 *   4. fully downloads each file before uploading, and prefetches the next
 *      file during the current upload — see "the speed lesson" below
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   - publish anything. Every row lands as a draft; categories, descriptions
 *     and thumbnails are curation, and curation happens in the admin UI.
 *   - talk to the site's API. It uses the same Mux settings upload.js uses
 *     (signed playback, passthrough = row id, auto captions) directly, so the
 *     PRODUCTION webhook picks each asset up exactly as if the admin UI had
 *     uploaded it.
 *
 * RE-RUN SAFE
 * Each row records its Drive source path in admin_notes. A file whose row
 * already has a Mux asset is skipped; a row stuck without one (a previous run
 * died mid-upload) gets a fresh upload into the SAME row — never a duplicate.
 *
 * Env (from ../.env): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *                     MUX_TOKEN_ID, MUX_TOKEN_SECRET
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const DRIVE_ROOT = path.join(
  process.env.HOME,
  'Library/CloudStorage/GoogleDrive-mackenziesteele13@gmail.com/My Drive/Video Library'
);
const VIDEO_EXT = new Set(['.mov', '.mp4', '.m4v']);
const SOURCE_PREFIX = 'source: Drive/Video Library/';

// Mackenzie's explicit exclusions (2026-08-19): she deleted IMG_5510 from the
// site on purpose, and she is uploading Bridge Flows by hand — the script
// must never bring either back as a duplicate.
const SKIP_FILES = new Set(['Sequence Starters/IMG_5510.mov']);
const SKIP_FOLDERS = new Set(['Bridge Flows']);

// ── env ──────────────────────────────────────────────────────────────────────
const envFile = path.join(__dirname, '..', '.env');
for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"\n]*)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
  console.error('missing env — need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MUX_TOKEN_ID, MUX_TOKEN_SECRET');
  process.exit(1);
}
const MUX_AUTH = 'Basic ' + Buffer.from(MUX_TOKEN_ID + ':' + MUX_TOKEN_SECRET).toString('base64');

// ── tiny clients ─────────────────────────────────────────────────────────────
async function db(pathAndQuery, opts = {}) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + pathAndQuery, {
    ...opts,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error('supabase ' + res.status + ' on ' + pathAndQuery + ': ' + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

async function mux(pathname, opts = {}) {
  const res = await fetch('https://api.mux.com' + pathname, {
    ...opts,
    headers: { Authorization: MUX_AUTH, 'Content-Type': 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('mux ' + res.status + ' on ' + pathname + ': ' + JSON.stringify(body).slice(0, 300));
  return body.data;
}

// ── naming ───────────────────────────────────────────────────────────────────
// "peak flow #2.mov" → title "Peak Flow #2", slug "peak-flow-2"
// "IMG_5927.mov"     → title "IMG 5927",     slug "img-5927"
function titleFrom(filename) {
  const base = filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  return base
    .split(/\s+/)
    .map(w => (/^[A-Z0-9#]+$/.test(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}
function slugFrom(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
// sort "x #2" before "x #10", and numbered files after each other naturally
function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

const fmtGB = bytes => (bytes / 1e9).toFixed(2) + ' GB';

// ── steps ────────────────────────────────────────────────────────────────────
async function ensureCollection(folderName, instructorId, dryRun) {
  const slug = slugFrom(folderName);
  const found = await db('collections?slug=eq.' + slug + '&select=id,title,status');
  if (found.length) {
    console.log('  collection exists: "' + found[0].title + '" (' + found[0].status + ')');
    return found[0].id;
  }
  if (dryRun) { console.log('  would create draft collection "' + folderName + '"'); return null; }
  const [row] = await db('collections', {
    method: 'POST',
    body: JSON.stringify({
      title: folderName, slug, status: 'draft',
      thumbnail_mode: 'first_video', instructor_id: instructorId,
      admin_notes: SOURCE_PREFIX + folderName,
    }),
  });
  console.log('  created draft collection "' + folderName + '"');
  return row.id;
}

async function ensureVideoRow(file, instructorId) {
  const marker = SOURCE_PREFIX + file.folder + '/' + file.name;
  const existing = await db(
    'videos?admin_notes=eq.' + encodeURIComponent(marker) + '&select=id,status,mux_asset_id,mux_upload_id'
  );
  if (existing.length) return { row: existing[0], marker };

  // A row with this slug that WASN'T created from this Drive file means the
  // same video already exists some other way (hand-uploaded, another folder).
  // Mackenzie's rule: duplicates are skipped, never suffixed into a second copy.
  const slug = slugFrom(titleFrom(file.name));
  const collision = await db('videos?slug=eq.' + slug + '&select=id,title,status');
  if (collision.length) return { duplicateOf: collision[0], marker };
  const [row] = await db('videos', {
    method: 'POST',
    body: JSON.stringify({
      title: titleFrom(file.name), slug, status: 'draft',
      instructor_id: instructorId, admin_notes: marker,
    }),
  });
  return { row, marker };
}

// mirrors api/mux/upload.js: signed playback, passthrough correlation,
// basic quality, auto English captions — so the production webhook treats
// these exactly like admin-UI uploads
async function createMuxUpload(videoId) {
  return mux('/video/v1/uploads', {
    method: 'POST',
    body: JSON.stringify({
      cors_origin: 'https://flowschool.io',
      new_asset_settings: {
        playback_policy: ['signed'],
        passthrough: videoId,
        video_quality: 'basic',
        inputs: [{ generated_subtitles: [{ language_code: 'en', name: 'English (auto)' }] }],
      },
    }),
  });
}

// ── the speed lesson from the pilot ──────────────────────────────────────────
// Letting curl stream a cloud-only placeholder ran at ~0.7 GB/h — 15× below
// the 23 Mbps uplink — because small interleaved reads through the File
// Provider stall the upload. Sequential big reads pull ~7 MB/s, so each file
// is fully materialized FIRST, and the NEXT file prefetches while the current
// one uploads at full uplink speed.

// a big-block sequential read is what makes Drive materialize at full speed;
// the bytes land in the provider cache, the pipe to /dev/null costs nothing
function materialize(localPath, background) {
  const args = ['if=' + localPath, 'of=/dev/null', 'bs=8m'];
  if (background) {
    const child = spawn('dd', args, { stdio: 'ignore', detached: true });
    child.unref();
    return child;
  }
  execFileSync('dd', args, { stdio: 'ignore' });
}

// materialization eats system-volume space and macOS gives us no way to evict
// Drive's cache from a script (this fileproviderctl has no evict command) —
// so refuse to start a file that would squeeze the disk, and tell Mackenzie
// the Finder gesture that frees it
function guardDiskSpace(nextBytes) {
  const s = fs.statfsSync('/');
  const free = s.bavail * s.bsize;
  const cushion = 5e9;
  if (free < nextBytes + cushion) {
    throw new Error(
      'only ' + fmtGB(free) + ' free on disk — in Finder, right-click the already-uploaded ' +
      'Video Library folders and choose "Remove Download", then re-run (finished files are skipped)'
    );
  }
}

function putFile(localPath, uploadUrl) {
  execFileSync('curl', [
    '--fail', '--silent', '--show-error',
    '--retry', '5', '--retry-all-errors', '--retry-delay', '10',
    '--upload-file', localPath, uploadUrl,
  ], { stdio: ['ignore', 'inherit', 'inherit'] });
}

// Mux marks the upload consumed within seconds of the PUT completing;
// processing continues on their side and the webhook updates the row
async function waitForAsset(uploadId) {
  for (let i = 0; i < 30; i++) {
    const u = await mux('/video/v1/uploads/' + uploadId);
    if (u.status === 'asset_created') return u.asset_id;
    if (u.status === 'errored') throw new Error('mux upload errored');
    await new Promise(r => setTimeout(r, 4000));
  }
  throw new Error('upload not confirmed after 2 minutes');
}

async function linkIntoCollection(collectionId, videoId, position) {
  const existing = await db(
    'collection_items?collection_id=eq.' + collectionId + '&video_id=eq.' + videoId + '&select=id'
  );
  if (existing.length) return;
  await db('collection_items', {
    method: 'POST',
    body: JSON.stringify({ collection_id: collectionId, kind: 'video', video_id: videoId, position }),
  });
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const folders = args.filter(a => !a.startsWith('--'));
  if (!folders.length) {
    console.error('usage: node scripts/bulk-upload.js "<Folder Name>" [--dry-run]');
    process.exit(1);
  }

  const [bonnie] = await db('instructors?slug=eq.bonnie-weeks&select=id');
  if (!bonnie) { console.error('instructor bonnie-weeks not found'); process.exit(1); }

  const summary = [];
  for (const folderName of folders) {
    if (SKIP_FOLDERS.has(folderName)) {
      console.log('\n══ ' + folderName + ' — SKIPPED (Mackenzie uploads this folder by hand) ══');
      continue;
    }
    const dir = path.join(DRIVE_ROOT, folderName);
    if (!fs.existsSync(dir)) { console.error('no such Drive folder: ' + dir); process.exit(1); }

    const files = fs.readdirSync(dir)
      .filter(n => VIDEO_EXT.has(path.extname(n).toLowerCase()))
      .sort(naturalCompare)
      .map(name => ({ name, folder: folderName, full: path.join(dir, name),
                      size: fs.statSync(path.join(dir, name)).size }));
    const total = files.reduce((s, f) => s + f.size, 0);
    console.log('\n══ ' + folderName + ' — ' + files.length + ' videos, ' + fmtGB(total) + ' ══');

    const collectionId = await ensureCollection(folderName, bonnie.id, dryRun);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const label = (i + 1) + '/' + files.length + '  ' + file.name + ' (' + fmtGB(file.size) + ')';

      if (SKIP_FILES.has(file.folder + '/' + file.name)) {
        console.log('  · skipping ' + label + ' (on the exclusion list)');
        summary.push({ file: file.name, title: titleFrom(file.name), result: 'excluded' });
        continue;
      }
      if (dryRun) {
        console.log('  would upload ' + label + '  →  "' + titleFrom(file.name) + '"');
        continue;
      }

      const { row, duplicateOf } = await ensureVideoRow(file, bonnie.id);
      if (duplicateOf) {
        console.log('  · skipping ' + label + ' — "' + duplicateOf.title + '" (' + duplicateOf.status + ') already has this slug');
        summary.push({ file: file.name, title: titleFrom(file.name), result: 'skipped (duplicate)' });
        continue;
      }
      if (row.mux_asset_id) {
        console.log('  ✓ already uploaded, skipping ' + label);
        await linkIntoCollection(collectionId, row.id, i + 1);
        summary.push({ file: file.name, title: titleFrom(file.name), result: 'skipped (already up)' });
        continue;
      }

      console.log('  ↑ ' + label);
      try {
        guardDiskSpace(file.size);
        let t = Date.now();
        materialize(file.full);
        console.log('    ↓ downloaded from Drive in ' + Math.round((Date.now() - t) / 1000) + 's');
        // pull the NEXT file down while this one uploads — the two links
        // (Drive down, Mux up) are independent, so overlapping them makes
        // the whole run bound by upload speed alone
        const next = files[i + 1];
        if (next && !SKIP_FILES.has(next.folder + '/' + next.name)) materialize(next.full, true);

        const upload = await createMuxUpload(row.id);
        await db('videos?id=eq.' + row.id, {
          method: 'PATCH',
          body: JSON.stringify({ mux_upload_id: upload.id, status: 'uploading', mux_error: null }),
        });
        t = Date.now();
        putFile(file.full, upload.url);
        console.log('    ↑ uploaded to Mux in ' + Math.round((Date.now() - t) / 1000) + 's');
        const assetId = await waitForAsset(upload.id);
        await linkIntoCollection(collectionId, row.id, i + 1);
        console.log('    ✓ asset ' + assetId + ' — Mux is processing; webhook will finish the row');
        summary.push({ file: file.name, title: titleFrom(file.name), result: 'uploaded' });
      } catch (err) {
        console.log('    ✗ ' + err.message);
        summary.push({ file: file.name, title: titleFrom(file.name), result: 'FAILED: ' + err.message });
      }
    }
  }

  if (!dryRun) {
    console.log('\n── summary ──');
    for (const s of summary) console.log('  ' + s.result.padEnd(24) + s.file + '  →  "' + s.title + '"');
    const failed = summary.filter(s => s.result.startsWith('FAILED'));
    console.log('\n' + (summary.length - failed.length) + ' ok, ' + failed.length + ' failed' +
      (failed.length ? ' — re-run the same command; finished files are skipped' : ''));
  }
})().catch(err => { console.error('\nfatal: ' + err.message); process.exit(1); });
