#!/usr/bin/env node
/* ─── FLOW SCHOOL — ADD SONGS ─────────────────────────────────────────────────
 *
 * Two passes, with you in the middle.
 *
 *   1. echo "ODESZA — Bloom" >> scripts/new-songs.txt
 *      node scripts/add-songs.js
 *        → looks each one up on Apple, catches duplicates, assigns ids, and
 *          writes scripts/new-songs-draft.txt with one line per song to fill in
 *
 *   2. open scripts/new-songs-draft.txt, fill in the → lines, save
 *      node scripts/add-songs.js --commit
 *        → validates, inserts each row into its energy block in data/songs.js
 *          (alphabetical by artist), and caches the Apple media
 *
 * WHY TWO PASSES AND NOT A PROMPT
 * Energy is a judgement made by listening, and forty songs is not one sitting.
 * A terminal prompt forces the whole batch into a single session and loses
 * everything if you walk away. A file waits.
 *
 * WHAT THIS DELIBERATELY WILL NOT DO
 * Guess an energy. Apple's genre and a tempo could produce a plausible number
 * and it would be wrong in the way the existing catalogue is already wrong —
 * confidently, invisibly, and forever. A blank you have to fill is the point.
 * Everything a machine can know for certain, it fills in for you; the one
 * thing only an ear can decide is left empty.
 * ─────────────────────────────────────────────────────────────────────────── */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SONGS_JS = path.join(ROOT, 'data', 'songs.js');
const CACHE = path.join(__dirname, '.apple-cache.json');
const INPUT = path.join(__dirname, 'new-songs.txt');
const DRAFT = path.join(__dirname, 'new-songs-draft.txt');

const DELAY_MS = 2500;
const DUR_TOL = 3;
const COMMIT = process.argv.includes('--commit');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

function loadSongs() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(SONGS_JS, 'utf8') + ';this.OUT=SONGS;', ctx);
  return ctx.OUT;
}

// ── a row, formatted exactly like the 840 already in the file ────────────────
function quote(s) {
  return s.includes("'") ? `"${s.replace(/"/g, '\\"')}"` : `'${s}'`;
}
function formatRow(s) {
  const bool = (v, name, pad) => `${name}:${v ? 'true' : 'false'},` + ' '.repeat(v ? pad + 1 : pad);
  return `  { id:${s.id}, title:${quote(s.title)}, artist:${quote(s.artist)},`
    + ` bpm:${s.bpm === null ? 'null' : s.bpm}, dur:${s.dur}, energy:${s.energy},  `
    + bool(s.vocal, 'vocal', 1) + bool(s.electronic, 'electronic', 1)
    + `bright:${s.bright ? 'true ' : 'false'} },`;
}

/* ═══ PASS 1 — resolve and draft ═══════════════════════════════════════════ */
async function draft() {
  if (!fs.existsSync(INPUT)) {
    fs.writeFileSync(INPUT,
`# One song per line:  Artist — Title    (an em dash, a hyphen, or " - " all work)
# Lines starting with # are ignored. Delete these when you're done reading.
#
# The catalogue is thin at the top — 17 songs at level 7, six at 8, none above.
# High-energy music in Flow School's register is the batch worth gathering.

`);
    console.log(`  created ${path.relative(ROOT, INPUT)} — add songs to it, then run this again`);
    return;
  }

  const lines = fs.readFileSync(INPUT, 'utf8').split('\n')
    .map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (!lines.length) { console.log('  nothing in new-songs.txt yet'); return; }

  const songs = loadSongs();
  const existing = new Set(songs.map(s => norm(s.title) + '|' + norm(s.artist)));
  const usedIds = new Set(songs.map(s => s.id));
  // 1014 was Downtown, removed Aug 2026. Saved playlists store ids, so a
  // reused id silently repoints someone's saved playlist at a different song.
  const REMOVED = new Set([1014, 1492]);
  let nextId = Math.max(...songs.map(s => s.id)) + 1;
  const freshId = () => {
    while (usedIds.has(nextId) || REMOVED.has(nextId)) nextId++;
    usedIds.add(nextId);
    return nextId++;
  };

  console.log(`  ${lines.length} to look up · ~${Math.ceil(lines.length * DELAY_MS / 60000)} min\n`);
  const out = [], skipped = [], failed = [];

  for (const line of lines) {
    const parts = line.split(/\s+[—–-]\s+/);
    if (parts.length < 2) { failed.push([line, 'cannot split artist from title']); continue; }
    const artist = parts[0].trim(), title = parts.slice(1).join(' - ').trim();

    if (existing.has(norm(title) + '|' + norm(artist))) {
      skipped.push(`${artist} — ${title}`);
      process.stdout.write(`  ≡ already in the catalogue: ${title.slice(0, 40)}\n`);
      continue;
    }

    let hit = null;
    try {
      const url = 'https://itunes.apple.com/search?term='
        + encodeURIComponent(`${artist} ${title}`) + '&media=music&entity=song&limit=8';
      const res = await fetch(url);
      if (res.status === 403 || res.status === 429) {
        failed.push([line, 'rate-limited — run again in a few minutes']);
        process.stdout.write(`  … rate-limited: ${title.slice(0, 40)}\n`);
        await sleep(20000);
        continue;
      }
      const j = await res.json();
      const cands = (j.results || []).filter(r =>
        norm(r.artistName).includes(norm(artist).slice(0, 8))
        || norm(artist).includes(norm(r.artistName).slice(0, 8)));
      hit = cands[0] || (j.results || [])[0] || null;
    } catch (e) { failed.push([line, e.message]); continue; }

    if (!hit) { failed.push([line, 'no Apple result']); process.stdout.write(`  ✗ ${title.slice(0, 40)}\n`); continue; }

    out.push({
      id: freshId(),
      title: hit.trackName || title,
      artist: hit.artistName || artist,
      dur: Math.round((hit.trackTimeMillis || 0) / 1000),
      apple: {
        status: 'ok', appleId: hit.trackId,
        art: (hit.artworkUrl100 || '').replace('100x100bb', '{px}x{px}bb'),
        preview: hit.previewUrl || null, genre: hit.primaryGenreName || null,
        album: hit.collectionName || null, released: (hit.releaseDate || '').slice(0, 4) || null,
      },
    });
    process.stdout.write(`  ✓ ${(hit.trackName || title).slice(0, 40)}\n`);
    await sleep(DELAY_MS);
  }

  const L = [];
  L.push('# ── FLOW SCHOOL · NEW SONGS, AWAITING YOUR EAR ─────────────────────────');
  L.push('#');
  L.push('# Everything a machine could know is filled in. Fill the → line for each');
  L.push('# song, save, then run:   node scripts/add-songs.js --commit');
  L.push('#');
  L.push('#   energy      0-10. The line on the curve. 0 is the bottom rule, 10 the top.');
  L.push('#               Nothing in the catalogue reaches 9 or 10 yet.');
  L.push('#   vocal       y if a voice carries it, n if instrumental');
  L.push('#   electronic  y if electronic, n if acoustic');
  L.push('#   bright      y if bright, n if moody');
  L.push('#');
  L.push('# The ♫ line is a 30-second preview — paste it in a browser to hear it.');
  L.push('# Delete a whole block to drop that song from the batch.');
  L.push('#');
  L.push('');
  out.forEach(s => {
    L.push(`[${s.id}] ${s.title} — ${s.artist}`);
    L.push(`      ${mmss(s.dur)} · ${s.apple.genre || 'genre?'}`
      + (s.apple.album ? ` · ${s.apple.album}${s.apple.released ? ' (' + s.apple.released + ')' : ''}` : ''));
    if (s.apple.preview) L.push(`      ♫ ${s.apple.preview}`);
    L.push(`      → energy=?  vocal=?  electronic=?  bright=?`);
    L.push('');
  });
  if (skipped.length) {
    L.push('# ── already in the catalogue, skipped ──');
    skipped.forEach(x => L.push('#   ' + x));
    L.push('');
  }
  if (failed.length) {
    L.push('# ── could not resolve — add by hand or fix the spelling and rerun ──');
    failed.forEach(([l, why]) => L.push(`#   ${l}   (${why})`));
    L.push('');
  }
  fs.writeFileSync(DRAFT, L.join('\n'));
  // stash the Apple media so --commit doesn't have to look it up again
  fs.writeFileSync(DRAFT + '.media.json', JSON.stringify(
    Object.fromEntries(out.map(s => [s.id, s.apple])), null, 1));

  console.log(`\n  ${out.length} ready · ${skipped.length} already had · ${failed.length} failed`);
  console.log(`\n  → fill in ${path.relative(ROOT, DRAFT)}, then: node scripts/add-songs.js --commit`);
}

/* ═══ PASS 2 — validate and insert ═════════════════════════════════════════ */
function commit() {
  if (!fs.existsSync(DRAFT)) { console.log('  no draft — run without --commit first'); return; }
  const text = fs.readFileSync(DRAFT, 'utf8');
  const media = fs.existsSync(DRAFT + '.media.json')
    ? JSON.parse(fs.readFileSync(DRAFT + '.media.json', 'utf8')) : {};

  const blocks = [...text.matchAll(/^\[(\d+)\] (.+?) — (.+)$/gm)];
  const rows = [], problems = [];
  for (const b of blocks) {
    const [id, title, artist] = [+b[1], b[2].trim(), b[3].trim()];
    const after = text.slice(b.index);
    const dm = after.match(/^ +(\d+):(\d\d) ·/m);
    const am = after.match(/^ +→ (.+)$/m);
    if (!am) { problems.push(`${title}: no → line`); continue; }
    const kv = Object.fromEntries([...am[1].matchAll(/(\w+)=(\S+)/g)].map(m => [m[1], m[2].toLowerCase()]));
    const e = kv.energy;
    if (e === '?' || e === undefined) { problems.push(`${title}: energy not filled in`); continue; }
    if (!/^\d+$/.test(e) || +e < 0 || +e > 10) { problems.push(`${title}: energy "${e}" is not 0-10`); continue; }
    const yn = k => {
      const v = kv[k];
      if (v === 'y' || v === 'yes' || v === 'true') return true;
      if (v === 'n' || v === 'no' || v === 'false') return false;
      problems.push(`${title}: ${k}="${v === undefined ? '' : v}" — want y or n`);
      return null;
    };
    const vocal = yn('vocal'), electronic = yn('electronic'), bright = yn('bright');
    if (vocal === null || electronic === null || bright === null) continue;
    rows.push({ id, title, artist, bpm: null,
      dur: dm ? (+dm[1]) * 60 + (+dm[2]) : 0,
      energy: +e, vocal, electronic, bright });
  }

  if (problems.length) {
    console.log('  not committing — fix these first:\n');
    problems.forEach(p => console.log('   ✗ ' + p));
    return;
  }
  if (!rows.length) { console.log('  nothing to commit'); return; }

  // ── back up, then splice each row into its energy block ───────────────────
  const bak = SONGS_JS + '.bak';
  fs.copyFileSync(SONGS_JS, bak);
  let lines = fs.readFileSync(SONGS_JS, 'utf8').split('\n');

  for (const r of rows) {
    const hdr = lines.findIndex(l => new RegExp(`^  // ── ${r.energy} [─ ]`).test(l));
    if (hdr === -1) { console.log(`  ✗ no block for energy ${r.energy}`); continue; }
    let end = hdr + 1;
    while (end < lines.length && !/^  \/\/ ── \d+ /.test(lines[end]) && !/^\];/.test(lines[end])) end++;
    // alphabetical by artist inside the block, matching how the file is ordered
    let at = end;
    for (let i = hdr + 1; i < end; i++) {
      const m = lines[i].match(/artist:'((?:[^'\\]|\\.)*)'|artist:"([^"]*)"/);
      if (!m) continue;
      if ((m[1] || m[2]).toLowerCase() > r.artist.toLowerCase()) { at = i; break; }
    }
    lines.splice(at, 0, formatRow(r));
    // the header carries a count — keep it honest
    lines[hdr] = lines[hdr].replace(/(\d+) songs?$/, (_, n) =>
      `${+n + 1} song${+n + 1 === 1 ? '' : 's'}`);
    // a block that was empty has a placeholder comment; drop it now
    const ph = lines.findIndex((l, i) => i > hdr && i < end + 2 && /\(empty — nothing/.test(l));
    if (ph !== -1) lines.splice(ph, 1);
  }
  fs.writeFileSync(SONGS_JS, lines.join('\n'));

  // ── verify it still parses and gained exactly what we added ───────────────
  let after;
  try { after = loadSongs(); }
  catch (e) { fs.copyFileSync(bak, SONGS_JS); console.log('  ✗ broke the file — reverted. ' + e.message); return; }
  const before = (() => { const c = {}; vm.createContext(c);
    vm.runInContext(fs.readFileSync(bak, 'utf8') + ';this.OUT=SONGS;', c); return c.OUT; })();
  if (after.length !== before.length + rows.length) {
    fs.copyFileSync(bak, SONGS_JS);
    console.log(`  ✗ expected ${before.length + rows.length} songs, got ${after.length} — reverted`);
    return;
  }

  // ── hand the Apple media to the resolver's cache and let it re-emit ───────
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  let added = 0;
  rows.forEach(r => { if (media[r.id]) { cache[r.id] = media[r.id]; added++; } });
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
  // --emit-only: rewrite apple-media.js from the cache and make no network
  // calls. Without it this would try to resolve the whole catalogue and hang
  // behind the rate limit — which is exactly what happened the first time.
  try {
    execFileSync('node', [path.join(__dirname, 'resolve-apple.js'), '--emit-only'], { stdio: 'ignore' });
  } catch (_) { console.log('  (apple-media.js not regenerated — run resolve-apple.js --emit-only)'); }

  console.log(`  added ${rows.length} songs · ${after.length} total`);
  rows.forEach(r => console.log(`    ${r.energy}  ${r.title.slice(0, 38).padEnd(40)}${r.artist.slice(0, 26)}`));
  console.log(`\n  ${added} carried Apple media across`);
  console.log(`  backup at ${path.relative(ROOT, bak)}`);
  fs.unlinkSync(DRAFT);
  if (fs.existsSync(DRAFT + '.media.json')) fs.unlinkSync(DRAFT + '.media.json');
  fs.writeFileSync(INPUT, '# committed — add the next batch below\n\n');
}

(COMMIT ? Promise.resolve(commit()) : draft()).catch(e => { console.error(e); process.exit(1); });
