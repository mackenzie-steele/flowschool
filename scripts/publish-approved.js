#!/usr/bin/env node
/* ─── FLOW SCHOOL — PUBLISH APPROVED SONGS ────────────────────────────────────
 *
 * Folds songs approved in the admin into data/songs.js, and manual Apple
 * matches into data/apple-media.js, so the files stay the source of truth and
 * the Supabase tables stay a staging buffer rather than a second catalogue.
 *
 *   node scripts/publish-approved.js            show what would change
 *   node scripts/publish-approved.js --write    do it
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 *
 * `vercel env pull` will NOT give you the service role key — Vercel stores it
 * as a sensitive value and returns an empty string. Take it from the Supabase
 * dashboard instead (Project Settings → API → service_role), and give it to
 * this one command rather than leaving it in your shell:
 *
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/publish-approved.js
 *
 * That key bypasses every row-level policy in the database. It has no business
 * in a file, a shell profile, or this repo.
 *
 * WHY IT IS NOT AUTOMATIC
 * This rewrites a file that 800+ songs live in, and the diff is the record of
 * what changed. A cron job doing it silently would put edits in the repo that
 * nobody reviewed and nobody remembers approving.
 *
 * WHAT IT WILL NOT DO
 * Publish a song with a null energy — approve_song already refuses those, but
 * a direct table edit could sneak one past, and a song with no energy would
 * sit at whatever level JavaScript coerces null to and quietly wrong every
 * playlist it lands in.
 * ─────────────────────────────────────────────────────────────────────────── */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SONGS_JS = path.join(ROOT, 'data', 'songs.js');
const WRITE = process.argv.includes('--write');

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function load(file, name) {
  const c = {};
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(file, 'utf8') + `;this.OUT=${name};`, c);
  return c.OUT;
}

// the same row format as the 839 already in the file, byte for byte
function quote(s) {
  // the file escapes apostrophes inside single quotes rather than switching
  // to double — both parse the same, but a generated row should be
  // indistinguishable from a hand-written one
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}
function formatRow(s) {
  const bool = (v, name) => `${name}:${v ? 'true' : 'false'},` + (v ? '  ' : ' ');
  return `  { id:${s.id}, title:${quote(s.title)}, artist:${quote(s.artist)},`
    + ` bpm:${s.bpm == null ? 'null' : s.bpm}, dur:${s.dur}, energy:${s.energy},  `
    + bool(s.vocal, 'vocal') + bool(s.electronic, 'electronic')
    + `bright:${s.bright ? 'true ' : 'false'} },`;
}

async function api(pathname, opts) {
  const r = await fetch(URL + '/rest/v1/' + pathname, Object.assign({
    headers: {
      apikey: KEY, Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
  }, opts || {}));
  if (!r.ok) throw new Error(`${pathname} → HTTP ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

// Tables added by later migrations. A database that hasn't had one applied
// yet should mean "nothing of that kind to publish", not a crash — the whole
// point of this script is that it can be run at any time.
async function apiOptional(pathname) {
  try { return await api(pathname); }
  catch (e) {
    if (/PGRST205|Could not find the table/.test(e.message)) {
      console.log(`  (skipping ${pathname.split('?')[0]} — that migration hasn't been run)`);
      return [];
    }
    throw e;
  }
}

(async () => {
  if (!URL || !KEY) {
    console.error('  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    console.error('  The service role key is in Supabase → Settings → API.');
    console.error('  vercel env pull will NOT return it — Vercel treats it as sensitive.');
    process.exit(1);
  }

  const songs = load(SONGS_JS, 'SONGS');
  const known = new Set(songs.map(s => s.id));

  const approved = await api('music_staging?status=eq.approved&select=*');
  const links = await apiOptional('music_links?select=*');
  const removed = await apiOptional('music_removed?select=*');
  const edits = await apiOptional('music_edits?select=*');

  // a song already in the file was published on an earlier run; the row just
  // never got marked. Flag it rather than adding a duplicate id.
  const fresh = approved.filter(r => !known.has(r.song_id));
  const already = approved.filter(r => known.has(r.song_id));
  const unjudged = fresh.filter(r => r.energy == null);
  const usable = fresh.filter(r => r.energy != null);

  console.log(`\n  approved rows       ${approved.length}`);
  console.log(`  already in the file ${already.length}${already.length ? '  (will just be marked published)' : ''}`);
  if (unjudged.length) console.log(`  REFUSED, no energy  ${unjudged.length}  ${unjudged.map(r => r.title).join(', ')}`);
  console.log(`  to add              ${usable.length}`);

  const media = load(path.join(ROOT, 'data', 'apple-media.js'), 'APPLE_MEDIA');
  const newLinks = links.filter(l => !media[l.song_id]);
  console.log(`  manual links to add ${newLinks.length}`);
  const toDrop = removed.filter(r => known.has(r.song_id));
  console.log(`  songs to remove     ${toDrop.length}`);
  // only corrections that actually differ from the file — re-saving a row
  // without changing it should not show up as work
  const byId = new Map(songs.map(s2 => [s2.id, s2]));
  const toEdit = edits.filter(e => {
    const cur = byId.get(e.song_id);
    if (!cur) return false;
    return cur.energy !== e.energy || !!cur.vocal !== !!e.vocal
      || !!cur.electronic !== !!e.electronic || !!cur.bright !== !!e.bright;
  });
  console.log(`  corrections to apply ${toEdit.length}\n`);

  if (!usable.length && !newLinks.length && !already.length && !toDrop.length && !toEdit.length) {
    console.log('  Nothing to do.\n');
    return;
  }

  usable.forEach(r => console.log(`    + ${String(r.energy).padStart(2)}  ${r.title.slice(0, 38).padEnd(40)}${r.artist.slice(0, 26)}`));
  toDrop.forEach(r => console.log(`    - ${'  '}  ${String(r.title || r.song_id).slice(0, 38).padEnd(40)}${String(r.artist || '').slice(0, 26)}`));
  toEdit.forEach(e => {
    const cur = byId.get(e.song_id);
    console.log(`    ~ ${String(cur.energy)}→${String(e.energy).padEnd(2)} ${cur.title.slice(0, 38).padEnd(40)}${cur.artist.slice(0, 26)}`);
  });

  if (!WRITE) {
    console.log('\n  Dry run. Re-run with --write to apply.\n');
    return;
  }

  // ── splice each row into its energy block, alphabetical by artist ────────
  fs.copyFileSync(SONGS_JS, SONGS_JS + '.bak');
  let lines = fs.readFileSync(SONGS_JS, 'utf8').split('\n');

  // corrections first. An energy change moves a song to a different block, so
  // it is a delete-and-reinsert, not an edit in place — doing it before the
  // removals and additions keeps every block count adjusted exactly once.
  for (const e of toEdit) {
    const cur = byId.get(e.song_id);
    const idx = lines.findIndex(l => l.startsWith(`  { id:${e.song_id},`));
    if (idx === -1) { console.log(`  ? id ${e.song_id} not found in the file`); continue; }
    let hdr = idx;
    while (hdr >= 0 && !/^  \/\/ ── \d+ /.test(lines[hdr])) hdr--;
    lines.splice(idx, 1);
    if (hdr >= 0) {
      lines[hdr] = lines[hdr].replace(/(\d+) songs?$/, (_, n) => `${+n - 1} song${+n - 1 === 1 ? '' : 's'}`);
    }
    usable.push({
      song_id: e.song_id, title: cur.title, artist: cur.artist, dur: cur.dur,
      energy: e.energy, vocal: e.vocal, electronic: e.electronic, bright: e.bright,
      apple_id: null, _isEdit: true,
    });
  }

  // removals next: taking a line out changes the block counts that the
  // insert below then adjusts again, and doing it the other way round would
  // have the second pass correcting a number the first pass had already moved
  // count what actually came out, not what we meant to take out: a removal
  // recorded for a song that already left the file (removed, then published,
  // then removed again from a stale view) is a no-op, and expecting it to
  // change the count made the verify below revert a perfectly good write.
  let dropped = 0;
  for (const r of toDrop) {
    const idx = lines.findIndex(l => l.startsWith(`  { id:${r.song_id},`));
    if (idx === -1) { console.log(`  ? id ${r.song_id} already gone from the file`); continue; }
    dropped++;
    let hdr = idx;
    while (hdr >= 0 && !/^  \/\/ ── \d+ /.test(lines[hdr])) hdr--;
    lines.splice(idx, 1);
    if (hdr >= 0) {
      lines[hdr] = lines[hdr].replace(/(\d+) songs?$/, (_, n) =>
        `${+n - 1} song${+n - 1 === 1 ? '' : 's'}`);
    }
  }

  for (const r of usable) {
    const row = {
      id: r.song_id, title: r.title, artist: r.artist, bpm: null, dur: r.dur,
      energy: r.energy, vocal: r.vocal, electronic: r.electronic, bright: r.bright,
    };
    const hdr = lines.findIndex(l => new RegExp(`^  // ── ${r.energy} [─ ]`).test(l));
    if (hdr === -1) { console.log(`  ✗ no block for energy ${r.energy}`); continue; }
    let end = hdr + 1;
    while (end < lines.length && !/^  \/\/ ── \d+ /.test(lines[end]) && !/^\];/.test(lines[end])) end++;
    let at = end;
    for (let i = hdr + 1; i < end; i++) {
      const m = lines[i].match(/artist:'((?:[^'\\]|\\.)*)'|artist:"([^"]*)"/);
      if (!m) continue;
      if ((m[1] || m[2]).toLowerCase() > r.artist.toLowerCase()) { at = i; break; }
    }
    lines.splice(at, 0, formatRow(row));
    lines[hdr] = lines[hdr].replace(/(\d+) songs?$/, (_, n) => `${+n + 1} song${+n + 1 === 1 ? '' : 's'}`);
    const ph = lines.findIndex((l, i) => i > hdr && i < end + 2 && /\(empty — nothing/.test(l));
    if (ph !== -1) lines.splice(ph, 1);
  }
  fs.writeFileSync(SONGS_JS, lines.join('\n'));

  // ── does it still parse, and did it gain exactly what we added? ──────────
  let after;
  try { after = load(SONGS_JS, 'SONGS'); }
  catch (e) { fs.copyFileSync(SONGS_JS + '.bak', SONGS_JS); console.error('  ✗ broke the file — reverted. ' + e.message); process.exit(1); }
  const netAdds = usable.filter(u => !u._isEdit).length;
  if (after.length !== songs.length + netAdds - dropped) {
    fs.copyFileSync(SONGS_JS + '.bak', SONGS_JS);
    console.error(`  ✗ expected ${songs.length + netAdds - dropped} songs, got ${after.length} — reverted`);
    process.exit(1);
  }
  const ids = after.map(s => s.id);
  if (new Set(ids).size !== ids.length) {
    fs.copyFileSync(SONGS_JS + '.bak', SONGS_JS);
    console.error('  ✗ duplicate ids — reverted');
    process.exit(1);
  }

  // ── fold the media in via the resolver's own cache, then re-emit ─────────
  const CACHE = path.join(__dirname, '.apple-cache.json');
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  usable.forEach(r => {
    if (!r.apple_id) return;      // edits carry none; their media is unchanged
    cache[r.song_id] = { status: 'ok', appleId: r.apple_id, art: r.art, preview: r.preview, genre: r.genre };
  });
  newLinks.forEach(l => {
    cache[l.song_id] = { status: 'ok', appleId: l.apple_id, art: l.art, preview: l.preview, genre: l.genre };
  });
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
  require('child_process').execFileSync('node', [path.join(__dirname, 'resolve-apple.js'), '--emit-only'], { stdio: 'ignore' });

  // ── only now mark them published, so a crash above leaves work to redo ───
  const done = usable.filter(u => !u._isEdit).concat(already).map(r => r.song_id);
  if (done.length) {
    await api('music_staging?song_id=in.(' + done.join(',') + ')', {
      method: 'PATCH', body: JSON.stringify({ status: 'published' }),
    });
  }

  console.log(`\n  ${netAdds} added, ${toDrop.length} removed, ${toEdit.length} corrected · ${after.length} in the catalogue`);
  console.log(`  ${newLinks.length} manual links folded into apple-media.js`);
  console.log(`  ${done.length} rows marked published`);
  console.log(`  backup at data/songs.js.bak\n`);
  console.log('  Commit and push to put them live for everyone.\n');
})().catch(e => { console.error('\n  ' + e.message + '\n'); process.exit(1); });
