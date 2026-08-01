#!/usr/bin/env node
/* ─── FLOW SCHOOL — APPLE MEDIA RESOLVER ──────────────────────────────────────
 *
 * Matches every song in data/songs.js against the iTunes Search API and writes
 * data/apple-media.js — artwork, a 30-second preview URL, Apple's own genre,
 * and the Apple track id.
 *
 *   node scripts/resolve-apple.js            resolve everything not yet done
 *   node scripts/resolve-apple.js --force    re-resolve from scratch
 *   node scripts/resolve-apple.js --limit 25 stop after 25 lookups (a dry run)
 *   node scripts/resolve-apple.js --emit-only  rewrite data/apple-media.js from
 *                                              the cache, making no network calls
 *
 * WHY A SEPARATE FILE, NOT MORE COLUMNS IN songs.js
 * songs.js is hand-edited — Bonnie corrects energy values in it. Artwork and
 * preview URLs are ~200 characters each and machine-generated; dropping 840 of
 * them into the same rows would triple the file and bury the one column a
 * human actually edits. apple-media.js is generated, never hand-edited, and
 * safe to delete and rebuild.
 *
 * THE DURATION GATE
 * A title+artist search happily returns a live version, a remix, or a
 * different song of the same name. Track length is the cheapest possible
 * check: if the API's duration disagrees with ours by more than DUR_TOL
 * seconds it is almost certainly the wrong recording, so it is NOT accepted
 * silently — it goes to output/apple-unmatched.txt for a human to look at.
 * On a 20-song trial this caught 3 wrong-version matches that title+artist
 * alone would have accepted.
 *
 * ON RATE LIMITS
 * The API needs no key and publishes no limit. It does 403 under load — the
 * first run of this script tripped it at 400ms between requests. The delay is
 * now adaptive: every 403 raises the base rate for the rest of the run, so it
 * settles at whatever the API will actually tolerate. Budget ~30 minutes for
 * 840 songs.
 *
 * A 403 is NOT cached. Caching it would record a permanent "not found" for a
 * song that exists, and the resume logic skips anything cached — so it would
 * never be retried. Rate-limited songs are left uncached and picked up next
 * run. Progress is written after every song; Ctrl-C loses nothing.
 * ─────────────────────────────────────────────────────────────────────────── */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SONGS_JS = path.join(ROOT, 'data', 'songs.js');
const OUT_JS = path.join(ROOT, 'data', 'apple-media.js');
const CACHE = path.join(ROOT, 'scripts', '.apple-cache.json');
const REPORT = path.join(ROOT, '..', 'output', 'apple-unmatched.txt');

let DELAY_MS = 2000;    // between requests; raised automatically on a 403
const DUR_TOL = 3;      // seconds; beyond this we don't trust the match
const BACKOFF = 30000;  // on a 403, wait this long before trying again
const DELAY_CEIL = 6000;// how far the adaptive delay may climb
const MAX_RETRY = 3;

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const LIMIT = args.includes('--limit') ? +args[args.indexOf('--limit') + 1] : Infinity;
const RETRY_MISSES = args.includes('--retry-misses');
const EMIT_ONLY = args.includes('--emit-only');   // rebuild the data file, no network

// ── load the catalogue ───────────────────────────────────────────────────────
function loadSongs() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(SONGS_JS, 'utf8') + ';this.OUT=SONGS;', ctx);
  return ctx.OUT;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// strip the things that make a search miss: featured artists, remix suffixes,
// bracketed live/bonus notes. Keep it conservative — over-stripping loses the
// track as surely as under-stripping.
function searchTerm(song) {
  const t = song.title
    .replace(/\s*\((feat|ft)\.[^)]*\)/gi, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s*-\s*(Bonus Track|Instrumental|Radio Edit)$/i, '')
    .trim();
  const a = song.artist.split(/\s*[&,]\s*|\s+x\s+/i)[0].trim();  // lead artist only
  return `${a} ${t}`;
}

const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// score a candidate: duration first (it is the honest signal), then whether
// the title and artist actually resemble what we asked for
function scoreMatch(song, r) {
  const secs = Math.round((r.trackTimeMillis || 0) / 1000);
  const dGap = Math.abs(secs - song.dur);
  const tHit = norm(r.trackName).includes(norm(song.title).slice(0, 12))
    || norm(song.title).includes(norm(r.trackName).slice(0, 12));
  const aHit = norm(r.artistName).includes(norm(song.artist).slice(0, 8))
    || norm(song.artist).includes(norm(r.artistName).slice(0, 8));
  return { secs, dGap, tHit, aHit, ok: dGap <= DUR_TOL && tHit && aHit };
}

async function lookup(song) {
  const url = 'https://itunes.apple.com/search?term='
    + encodeURIComponent(searchTerm(song)) + '&media=music&entity=song&limit=8';
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 403 || res.status === 429) {
        // we are going too fast for the whole run, not just this request —
        // slow the base rate permanently, then wait it out
        DELAY_MS = Math.min(DELAY_CEIL, Math.round(DELAY_MS * 1.5));
        process.stdout.write(` [${res.status} → pacing ${DELAY_MS}ms] `);
        await sleep(BACKOFF);
        continue;
      }
      if (!res.ok) return { error: 'HTTP ' + res.status };
      const json = await res.json();
      const results = json.results || [];
      if (!results.length) return { error: 'no results' };
      const scored = results.map(r => ({ r, s: scoreMatch(song, r) }))
        .sort((a, b) => a.s.dGap - b.s.dGap);
      const best = scored.find(x => x.s.ok) || scored[0];
      return { hit: best.r, score: best.s };
    } catch (e) {
      if (attempt === MAX_RETRY - 1) return { error: e.message };
      await sleep(2000);
    }
  }
  // Rate-limited, not absent. Returning a miss here would cache a permanent
  // "not found" for a song that exists — and the resume logic skips anything
  // cached, so it would never be retried. Say so explicitly instead.
  return { error: 'rate-limited', transient: true };
}

(async () => {
  const songs = loadSongs();
  let cache = {};
  if (!FORCE && fs.existsSync(CACHE)) {
    cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    console.log(`  resuming — ${Object.keys(cache).length} already resolved`);
  }

  if (RETRY_MISSES) {
    const n = Object.keys(cache).filter(k => cache[k].status === 'miss').length;
    Object.keys(cache).forEach(k => { if (cache[k].status === 'miss') delete cache[k]; });
    console.log(`  --retry-misses: cleared ${n} misses for another attempt`);
  }
  const todo = EMIT_ONLY ? [] : songs.filter(s => !cache[s.id]).slice(0, LIMIT);
  console.log(`  ${songs.length} songs · ${todo.length} to look up · ~${Math.ceil(todo.length * DELAY_MS / 60000)} min\n`);

  let done = 0;
  for (const song of todo) {
    const out = await lookup(song);
    if (out.error && out.transient) {
      // leave it UNCACHED so the next run picks it up
      process.stdout.write(`\r  ${done}/${todo.length}  … rate-limited, will retry: ${song.title.slice(0, 34)}\n`);
      await sleep(BACKOFF);
      continue;
    }
    if (out.error) {
      cache[song.id] = { status: 'miss', reason: out.error };
    } else {
      const { hit, score } = out;
      cache[song.id] = score.ok
        ? {
            status: 'ok',
            appleId: hit.trackId,
            art: (hit.artworkUrl100 || '').replace('100x100bb', '{px}x{px}bb'),
            preview: hit.previewUrl || null,
            genre: hit.primaryGenreName || null,
            album: hit.collectionName || null,
            released: (hit.releaseDate || '').slice(0, 4) || null,
          }
        : {
            status: 'review',
            reason: !score.tHit ? 'title mismatch'
              : !score.aHit ? 'artist mismatch'
              : `duration off by ${score.dGap}s`,
            sawTitle: hit.trackName, sawArtist: hit.artistName,
            sawDur: score.secs, appleId: hit.trackId,
          };
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));   // resumable
    done++;
    const st = cache[song.id].status;
    process.stdout.write(`\r  ${done}/${todo.length}  ${st === 'ok' ? '✓' : st === 'review' ? '?' : '✗'} ${song.title.slice(0, 40).padEnd(42)}`);
    await sleep(DELAY_MS);
  }
  console.log('\n');

  // ── emit the generated data file ───────────────────────────────────────────
  const ok = songs.filter(s => cache[s.id] && cache[s.id].status === 'ok');
  const rows = ok.map(s => {
    const c = cache[s.id];
    return `  ${s.id}: { id:${c.appleId}, art:'${c.art}', prev:'${c.preview}',`
      + ` genre:${c.genre ? `'${c.genre.replace(/'/g, "\\'")}'` : 'null'} },`;
  });
  fs.writeFileSync(OUT_JS,
`// ─── FLOW SCHOOL — APPLE MEDIA ───────────────────────────────────────────────
//
// GENERATED. Do not hand-edit — rebuild with:  node scripts/resolve-apple.js
//
// Keyed by the song id in data/songs.js. Only songs whose Apple duration
// agreed with ours (within ${DUR_TOL}s) are here; anything ambiguous was left out
// and listed in output/apple-unmatched.txt rather than guessed at.
//
//   id     Apple track id — the stable key; everything else re-derives from it
//   art    artwork URL with a {px} placeholder — swap for 100, 300, 600, 1000
//   prev   30-second preview (m4a). Apple serves these with
//          Access-Control-Allow-Origin: *, so the browser plays them directly —
//          no proxy, no serverless function.
//   genre  Apple's own primaryGenreName. Sourced, not guessed.
//
// Preview URLs are not guaranteed permanent. If one 404s, re-run the resolver;
// the Apple id is what actually persists.
//
// ${ok.length} of ${songs.length} songs resolved.
// ─────────────────────────────────────────────────────────────────────────────

const APPLE_MEDIA = {
${rows.join('\n')}
};
`);

  // ── the human worklist ─────────────────────────────────────────────────────
  const review = songs.filter(s => cache[s.id] && cache[s.id].status === 'review');
  const miss = songs.filter(s => cache[s.id] && cache[s.id].status === 'miss');
  const L = [];
  L.push('='.repeat(79));
  L.push('FLOW SCHOOL — SONGS APPLE COULD NOT CONFIDENTLY MATCH');
  L.push('='.repeat(79));
  L.push('');
  L.push(`Generated by scripts/resolve-apple.js. ${ok.length} of ${songs.length} matched cleanly.`);
  L.push('');
  L.push('Nothing here is broken — these are the ones the resolver refused to');
  L.push('guess on. A wrong match is worse than a missing one: it would put the');
  L.push('wrong artwork and the wrong 30 seconds against a song, and nobody');
  L.push('would notice until it played.');
  L.push('');
  L.push(`REVIEW — ${review.length} songs. Apple returned something, but it did not line up.`);
  L.push('Usually a live version, a remaster, or a different song of the same name.');
  L.push('');
  if (review.length) {
    L.push('    id   ours                                    Apple returned');
    L.push('  ' + '-'.repeat(75));
    review.forEach(s => {
      const c = cache[s.id];
      L.push(`  ${String(s.id).padStart(4)}  ${(s.title.slice(0, 30) + ' — ' + s.artist.slice(0, 18)).padEnd(52)}`);
      L.push(`        ${String(s.dur) + 's'.padEnd(3)}  →  ${c.sawTitle ? c.sawTitle.slice(0, 34) : '?'} — ${c.sawArtist ? c.sawArtist.slice(0, 20) : '?'} (${c.sawDur}s)`);
      L.push(`        ${c.reason}`);
      L.push('');
    });
  }
  L.push(`NOT FOUND — ${miss.length} songs. No usable result at all.`);
  L.push('');
  if (miss.length) {
    L.push('    id   title                                   artist');
    L.push('  ' + '-'.repeat(75));
    miss.forEach(s => L.push(`  ${String(s.id).padStart(4)}  ${s.title.slice(0, 38).padEnd(40)}${s.artist.slice(0, 28)}`));
  }
  L.push('');
  L.push('='.repeat(79));
  fs.writeFileSync(REPORT, L.join('\n') + '\n');

  console.log(`  matched  ${ok.length}`);
  console.log(`  review   ${review.length}`);
  console.log(`  missing  ${miss.length}`);
  console.log(`\n  wrote data/apple-media.js`);
  console.log(`  wrote output/apple-unmatched.txt`);
})();
