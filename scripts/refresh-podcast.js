#!/usr/bin/env node
/**
 * FLOW SCHOOL — pull new Yoga Strong episodes into data/yoga-strong-episodes.js
 *
 *   node scripts/refresh-podcast.js           dry run — says what it would add
 *   node scripts/refresh-podcast.js --write   actually writes the file
 *
 * IT ONLY EVER APPENDS.
 * An episode already in the file is never touched. That is not a
 * simplification, it is the whole design: 2 of the 103 blurbs in there have
 * been rewritten by hand, and a script that regenerated the file from the
 * feed would silently undo that editing every week. Nobody would notice.
 * Once an episode is in the file it belongs to whoever edited it last.
 *
 * WHERE THE PIECES COME FROM
 *   Buzzsprout RSS  — number, title, description, duration, publish date
 *   iTunes lookup   — the Apple Podcasts URL, because the audience is
 *                     Apple-Podcasts-primary and the RSS <link> is absent
 * Both are public. No credentials, unlike the music publish.
 *
 * THE BLURB
 * Bonnie's descriptions end with standing boilerplate — "Weekly stories by
 * email…", "Connect with Bonnie…". The file cuts at the first of those. Older
 * rows (198–200) still carry it because they predate the convention; they are
 * left exactly as they are, because fixing them is editing, not appending.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'yoga-strong-episodes.js');
const FEED = 'https://rss.buzzsprout.com/619780.rss';
const SHOW_ID = '1481932845';
const KEEP = 100;                 // the file is "last 100 episodes"
const WRITE = process.argv.includes('--write');

// Where Bonnie's standing sign-off begins. First match wins; anything from
// there on is boilerplate, not description.
const BOILERPLATE = [
  'Weekly stories by email',
  'Connect with Bonnie',
  'Buy Bonnie a cup of tea',
  'Sign up for Bonnie',
  'Listen to the Sexy Sunday',
  'Get on the Waitlist',
];

const ENT = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&apos;': "'", '&#39;': "'", '&#8217;': '’', '&rsquo;': '’',
  '&#8216;': '‘', '&lsquo;': '‘', '&#8230;': '…',
  '&hellip;': '…', '&nbsp;': ' ', '&#8211;': '–', '&#8212;': '—',
};

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#?\w+;/g, m => (ENT[m] !== undefined ? ENT[m] : m))
    .replace(/\s+/g, ' ')
    .trim();
}

function trimBoilerplate(text) {
  let cut = text.length;
  for (const marker of BOILERPLATE) {
    const i = text.indexOf(marker);
    if (i > 0 && i < cut) cut = i;
  }
  return text.slice(0, cut).trim().replace(/[\s–—-]+$/, '').trim();
}

// '45 min' / '1 hr 18 min' — the shape already in the file
function humanDuration(seconds) {
  const total = Math.round(Number(seconds) / 60);
  if (!total || !isFinite(total)) return '';
  const h = Math.floor(total / 60), m = total % 60;
  if (!h) return m + ' min';
  return h + ' hr' + (m ? ' ' + m + ' min' : '');
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function humanDate(pubDate) {
  const d = new Date(pubDate);
  if (isNaN(d)) return '';
  return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
}

// single-quoted JS strings: only these two can break out of one
function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

async function get(url, asJson) {
  const r = await fetch(url, { headers: { 'user-agent': 'flow-school-podcast-refresh' } });
  if (!r.ok) throw new Error(url.split('?')[0] + ' → ' + r.status);
  return asJson ? r.json() : r.text();
}

function parseFeed(xml) {
  return xml.split('<item>').slice(1).map(chunk => {
    const block = chunk.slice(0, chunk.indexOf('</item>'));
    const pick = tag => {
      const m = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
      return m ? m[1] : '';
    };
    const rawTitle = decode(pick('title'));
    const numMatch = rawTitle.match(/^(\d+)\s*[-–—]\s*(.*)$/);
    if (!numMatch) return null;          // trailers and specials have no number
    return {
      num: Number(numMatch[1]),
      title: numMatch[2].trim(),
      blurb: trimBoilerplate(decode(pick('description'))),
      dur: humanDuration(decode(pick('itunes:duration'))),
      date: humanDate(decode(pick('pubDate'))),
    };
  }).filter(Boolean);
}

// The iTunes lookup returns the most recent episodes; that is all we need,
// because anything old enough to fall off it is already in the file.
async function appleUrls() {
  const data = await get(
    'https://itunes.apple.com/lookup?id=' + SHOW_ID +
    '&media=podcast&entity=podcastEpisode&limit=200', true);
  const byNum = {};
  (data.results || []).forEach(r => {
    if (r.wrapperType !== 'podcastEpisode' || !r.trackViewUrl) return;
    const m = String(r.trackName || '').match(/^(\d+)/);
    // iTunes appends &uo=4, an affiliate/tracking parameter. The existing
    // rows do not carry it and it does nothing for us — strip it so a
    // generated row is byte-identical to a hand-made one.
    if (m) byNum[Number(m[1])] = String(r.trackViewUrl).replace(/[&?]uo=\d+/g, '');
  });
  return byNum;
}

// two spaces — matching the rows already in the file, not four
function row(e) {
  return "  { num: " + e.num +
    ", title: '" + esc(e.title) + "'" +
    ", blurb: '" + esc(e.blurb) + "'" +
    ", dur: '" + esc(e.dur) + "'" +
    ", date: '" + esc(e.date) + "'" +
    ", url: '" + esc(e.url) + "' },";
}

(async () => {
  const file = fs.readFileSync(DATA, 'utf8');
  const have = new Set([...file.matchAll(/\{ num: (\d+),/g)].map(m => Number(m[1])));
  console.log('  in the file      ' + have.size + ' episodes, newest #' + Math.max(...have));

  const feed = parseFeed(await get(FEED));
  console.log('  in the feed      ' + feed.length + ' episodes, newest #' +
              Math.max(...feed.map(e => e.num)));

  // NEWER THAN THE FILE, not merely absent from it. The file keeps the last
  // 100 episodes, so the whole back catalogue is absent by design — matching
  // on absence made the first dry run offer to add 197 old episodes and then
  // trim them straight back off, churning the file every week.
  const newest = Math.max(...have);
  const fresh = feed.filter(e => e.num > newest).sort((a, b) => b.num - a.num);
  console.log('  new              ' + fresh.length);
  if (!fresh.length) { console.log('\n  Nothing to add.'); return; }

  const urls = await appleUrls();
  const ready = [], skipped = [];
  for (const e of fresh) {
    // An episode with no Apple link is skipped rather than linked to nothing —
    // it will be picked up next week once Apple has indexed it.
    if (!urls[e.num]) { skipped.push(e); continue; }
    ready.push(Object.assign({}, e, { url: urls[e.num] }));
  }
  ready.forEach(e => console.log('    + ' + e.num + '  ' + e.title.slice(0, 52) +
                                 '  (' + e.dur + ', ' + e.date + ')'));
  skipped.forEach(e => console.log('    ? ' + e.num + '  ' + e.title.slice(0, 52) +
                                   '  — not on Apple yet, will retry'));

  if (!ready.length) { console.log('\n  Nothing addable yet.'); return; }
  if (!WRITE) { console.log('\n  Dry run. Re-run with --write to apply.'); return; }

  const lines = file.split('\n');
  const open = lines.findIndex(l => l.indexOf('var YOGA_STRONG_EPISODES = [') !== -1);
  if (open === -1) throw new Error('could not find the array opening');
  lines.splice(open + 1, 0, ...ready.map(row));

  // trim the tail back to KEEP, oldest first — the dashboard shows three
  let rows = lines.filter(l => /^\s*\{ num: \d+,/.test(l));
  if (rows.length > KEEP) {
    const drop = new Set(rows.slice(KEEP));
    for (let i = lines.length - 1; i >= 0; i--) if (drop.has(lines[i])) lines.splice(i, 1);
    console.log('  trimmed          ' + (rows.length - KEEP) + ' oldest');
  }

  fs.writeFileSync(DATA, lines.join('\n'));

  // it has to still parse, and still be an array of the size we expect
  const vm = require('vm');
  const ctx = {};
  vm.createContext(ctx);
  try {
    vm.runInContext(fs.readFileSync(DATA, 'utf8') + ';__N = YOGA_STRONG_EPISODES;', ctx);
  } catch (err) {
    fs.writeFileSync(DATA, file);
    console.error('  ✗ broke the file — reverted. ' + err.message);
    process.exit(1);
  }
  const after = ctx.__N;
  const nums = after.map(e => e.num);
  if (new Set(nums).size !== nums.length) {
    fs.writeFileSync(DATA, file);
    console.error('  ✗ duplicate episode numbers — reverted');
    process.exit(1);
  }
  if (after.length !== Math.min(have.size + ready.length, KEEP)) {
    fs.writeFileSync(DATA, file);
    console.error('  ✗ unexpected episode count — reverted');
    process.exit(1);
  }

  console.log('\n  ' + ready.length + ' added · ' + after.length + ' in the file');
})().catch(err => { console.error('  ✗ ' + err.message); process.exit(1); });
