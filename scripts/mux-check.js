#!/usr/bin/env node
/**
 * FLOW SCHOOL — check the Mux credentials actually work
 *
 *   node scripts/mux-check.js
 *
 * WHY THIS EXISTS
 * Two of the four Mux values are marked sensitive in Vercel, which means
 * `vercel env pull` returns them empty — by design. So they cannot be tested
 * from a script that only reads the environment. This prompts for them,
 * hidden, uses them once, and never writes them anywhere.
 *
 * It answers three questions the dashboard cannot:
 *   1. does the API token work at all
 *   2. does it have the permissions secure playback needs
 *   3. can the signing key actually mint a playback token
 *
 * A valid-looking key from the wrong Mux environment fails identically to a
 * correct one, which is why "the names are set" is not the same as "it works".
 */

'use strict';

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const readline = require('readline');

const ok   = (m, x) => console.log('  ✓ ' + m.padEnd(46) + (x || ''));
const bad  = (m, x) => console.log('  ✗ ' + m.padEnd(46) + (x || ''));
const note = (m)    => console.log('    ' + m);

// hidden prompt — nothing echoes, nothing lands in shell history
function secret(label) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = char => {
      if (['\n', '\r', ''].includes(char.toString())) return;
      readline.moveCursor(process.stdout, -1000, 0);
      readline.clearLine(process.stdout, 1);
      process.stdout.write(label);
    };
    process.stdin.on('data', onData);
    rl.question(label, answer => {
      process.stdin.removeListener('data', onData);
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

// the two non-sensitive values come down with `vercel env pull`
function readable() {
  const tmp = '/tmp/.mux-check-' + process.pid;
  try {
    execSync('vercel env pull ' + tmp + ' --environment=production --yes', { stdio: 'ignore' });
    const txt = fs.readFileSync(tmp, 'utf8');
    const get = k => {
      const m = txt.match(new RegExp('^' + k + '="?([^"\\n]*)', 'm'));
      return m ? m[1] : '';
    };
    return { id: get('MUX_TOKEN_ID'), kid: get('MUX_SIGNING_KEY_ID') };
  } catch (e) {
    return { id: '', kid: '' };
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

(async () => {
  console.log('\n── Mux credential check ──\n');

  const { id, kid } = readable();
  if (!id)  { bad('MUX_TOKEN_ID not readable', 'is the project linked?'); process.exit(1); }
  ok('MUX_TOKEN_ID', id.slice(0, 8) + '…');
  if (kid) ok('MUX_SIGNING_KEY_ID', kid.slice(0, 8) + '…');
  else     bad('MUX_SIGNING_KEY_ID not set', '');

  console.log('\n  The two secrets are sensitive, so Vercel will not hand them');
  console.log('  back. Paste them here — nothing is echoed or saved.\n');

  const tokenSecret = await secret('  Mux token secret: ');
  if (!tokenSecret) { bad('no secret given', ''); process.exit(1); }

  // ── 1. does the token work ──
  console.log('\n── API access ──\n');
  const auth = 'Basic ' + Buffer.from(id + ':' + tokenSecret).toString('base64');
  let res;
  try {
    res = await fetch('https://api.mux.com/video/v1/assets?limit=1', { headers: { Authorization: auth } });
  } catch (e) {
    bad('could not reach api.mux.com', e.message); process.exit(1);
  }
  if (res.status === 200) {
    const body = await res.json().catch(() => ({}));
    ok('token works', (body.data ? body.data.length : 0) + ' assets in this environment');
  } else if (res.status === 401) {
    bad('401 unauthorized', 'wrong id/secret pair, or a different Mux environment');
    process.exit(1);
  } else if (res.status === 403) {
    bad('403 forbidden', 'the token lacks permissions');
    note('Most likely Read/Write was not ticked when it was created.');
    process.exit(1);
  } else {
    bad('HTTP ' + res.status, (await res.text()).slice(0, 120));
    process.exit(1);
  }

  // ── 2. can it see signing keys — the System Write scope ──
  const keys = await fetch('https://api.mux.com/system/v1/signing-keys?limit=100', { headers: { Authorization: auth } });
  if (keys.status === 200) {
    const body = await keys.json().catch(() => ({}));
    const list = body.data || [];
    ok('System Write scope present', list.length + ' signing key(s) on the account');
    if (kid) {
      const found = list.some(k => k.id === kid);
      if (found) ok('MUX_SIGNING_KEY_ID matches a real key', '');
      else {
        bad('MUX_SIGNING_KEY_ID is not on this account', '');
        note('It may be from a different Mux environment.');
      }
    }
  } else if (keys.status === 403) {
    bad('cannot read signing keys (403)', 'System Write was not ticked');
    note('Secure playback needs it. Make a new token with System Write.');
  } else {
    bad('signing keys → HTTP ' + keys.status, '');
  }

  // ── 3. can the private key actually sign ──
  console.log('\n── Playback signing ──\n');
  const pk = await secret('  Mux signing private key (base64, one line): ');
  if (!pk) { note('skipped'); process.exit(0); }

  let pem;
  try {
    pem = Buffer.from(pk, 'base64').toString('utf8');
  } catch (e) {
    bad('not valid base64', ''); process.exit(1);
  }
  if (!/BEGIN[A-Z ]*PRIVATE KEY/.test(pem)) {
    bad('does not decode to a PEM private key', '');
    note('Paste the base64 string exactly as Mux gave it — do not decode it first.');
    process.exit(1);
  }
  ok('decodes to a PEM private key', '');

  try {
    const header  = { alg: 'RS256', typ: 'JWT', kid: kid };
    const claims  = { sub: 'test-playback-id', aud: 'v', exp: Math.floor(Date.now() / 1000) + 60 };
    const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const signingInput = b64(header) + '.' + b64(claims);
    const sig = crypto.sign('RSA-SHA256', Buffer.from(signingInput), pem).toString('base64url');
    ok('signs a playback token', sig.length + '-char signature');
    console.log('\n  Everything Mux needs is in place.\n');
  } catch (e) {
    bad('could not sign', e.message);
    note('The key decoded but is not usable for RS256.');
    process.exit(1);
  }
})();
