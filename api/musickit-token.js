// ─── MUSICKIT DEVELOPER TOKEN — minted here, never shipped ───────────────────
//
// Returns a short-lived Apple Music developer token so the browser can talk to
// the Apple Music API and MusicKit JS.
//
// THE WHOLE POINT: the .p8 signing key never leaves the server. Anything
// holding that key can mint tokens as Flow School, so it lives in a Vercel
// environment variable and the browser only ever sees a token that expires.
//
// WHO CAN ASK FOR ONE
// Signed-in teachers only, checked the same way api/feedback.js checks —
// a Supabase bearer token verified server-side with the service role key.
// A developer token is necessarily semi-public (the browser needs it, so it
// can always be read out of a page) and it grants catalog reads only, never
// anyone's library. But every other page here is account-locked, and there is
// no reason this endpoint should be the one open door — an unauthenticated
// one hands strangers our API quota under Flow School's team id.
//
// ?verify=1 stays open on purpose: a health check that needs auth is useless
// on the day auth is what's broken.
//
// Env: MUSICKIT_TEAM_ID   — 10 chars, from the Membership tab
//      MUSICKIT_KEY_ID    — 10 chars, the tail of AuthKey_XXXXXXXXXX.p8
//      MUSICKIT_PRIVATE_KEY — the .p8 file's contents, BEGIN/END lines and all
//
// Set them with:  vercel env add MUSICKIT_PRIVATE_KEY production
// (paste the file contents at the prompt — never commit the file itself)
//
// Health check:  GET /api/musickit-token?verify=1
//
// WHAT EXPIRES AND WHAT DOESN'T
// The .p8 key does NOT expire — it is valid until someone revokes it in the
// developer account. What expires is the TOKEN, which Apple caps at 15777000
// seconds (~6 months). A token pasted into the client would therefore die
// twice a year, silently, looking like "Apple Music is broken" rather than
// "the token expired". Minting on demand at 12h removes that failure entirely
// and makes a leaked token worthless by tomorrow.
//
// The real risks are slower and quieter: the Apple Developer Program renews
// ANNUALLY, and a lapsed membership or a revoked key both stop the key working
// while everything here still looks healthy — this endpoint would happily mint
// tokens that Apple then refuses. That is why ?verify=1 exists: it asks Apple
// rather than assuming, so "is it still working" is one request and not an
// investigation.
//
// Signing is done with Node's own crypto — no dependency. The one trap is that
// crypto.sign() emits DER by default and JWS wants raw r‖s; `dsaEncoding:
// 'ieee-p1363'` asks for the right one. Getting this wrong yields a token
// Apple rejects with a bare 401 and no explanation.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const TTL = 12 * 60 * 60;          // 12 hours
const APPLE_MAX = 15777000;        // Apple's ceiling, ~6 months — never exceed

const b64url = buf =>
  Buffer.from(buf).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

// A .p8 arrives mangled in more ways than it arrives intact. Vercel turns real
// newlines into literal \n; some paste only the base64 body without the BEGIN
// and END lines; some paste the whole thing on one line. All three fail the PEM
// parse with the same unhelpful `DECODER routines::unsupported`. So rather than
// trust the input's shape, strip it back to the base64 and rebuild the PEM.
function toPem(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  const body = v
    .replace(/\\n/g, '\n')                     // literal \n → newline
    .replace(/-----[A-Z ]+-----/g, '')          // drop any header/footer
    .replace(/\s+/g, '');                       // and all whitespace
  if (!body) return '';
  const wrapped = body.match(/.{1,64}/g).join('\n');
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----\n`;
}

// cache across warm invocations so we're not re-signing on every page load
let cached = null;

function mint(teamId, keyId, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.min(TTL, APPLE_MAX);

  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: teamId, iat: now, exp }));
  const signingInput = `${header}.${payload}`;

  const signature = crypto.sign(
    'sha256',
    Buffer.from(signingInput),
    { key: privateKey, dsaEncoding: 'ieee-p1363' }   // JWS wants r‖s, not DER
  );

  return { token: `${signingInput}.${b64url(signature)}`, exp };
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const isVerify = !!(req.query && (req.query.verify === '1' || req.query.verify === 'true'));

  // ── who's asking ────────────────────────────────────────────────────────
  if (!isVerify) {
    const sbUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!sbUrl || !serviceKey) {
      return res.status(500).json({ error: 'Server is not configured' });
    }
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!bearer) return res.status(401).json({ error: 'Not signed in' });
    try {
      const admin = createClient(sbUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await admin.auth.getUser(bearer);
      if (error || !data || !data.user) {
        return res.status(401).json({ error: 'Invalid session' });
      }
    } catch (e) {
      console.error('[musickit-token] auth check failed:', e.message);
      return res.status(401).json({ error: 'Invalid session' });
    }
  }

  const teamId = process.env.MUSICKIT_TEAM_ID;
  const keyId = process.env.MUSICKIT_KEY_ID;
  const privateKey = toPem(process.env.MUSICKIT_PRIVATE_KEY);

  if (!teamId || !keyId || !privateKey) {
    // named explicitly — "not configured" costs an hour of guessing
    const missing = [
      !teamId && 'MUSICKIT_TEAM_ID',
      !keyId && 'MUSICKIT_KEY_ID',
      !privateKey && 'MUSICKIT_PRIVATE_KEY',
    ].filter(Boolean);
    return res.status(503).json({ error: 'Apple Music is not configured', missing });
  }

  // ── ?verify=1 — mint a token AND check Apple still honours it ──────────
  // Minting proves the key parses. It does not prove the key is still good:
  // a revoked key or a lapsed membership signs perfectly and is then refused.
  // Only Apple can answer that, so ask it.
  if (isVerify) {
    try {
      const t = mint(teamId, keyId, privateKey);
      const r = await fetch(
        'https://api.music.apple.com/v1/catalog/us/search?term=test&types=songs&limit=1',
        { headers: { Authorization: 'Bearer ' + t.token } }
      );
      res.setHeader('Cache-Control', 'no-store');
      if (r.ok) {
        return res.status(200).json({
          ok: true, teamId, keyId,
          message: 'Apple accepted the token',
          tokenExpiresAt: t.exp,
        });
      }
      return res.status(502).json({
        ok: false, teamId, keyId, appleStatus: r.status,
        message: r.status === 401
          ? 'Apple rejected the token — the key may be revoked, or the Developer Program membership may have lapsed'
          : 'Apple returned an unexpected status',
      });
    } catch (e) {
      console.error('[musickit-token] verify failed:', e.message);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(500).json({ ok: false, message: 'Could not sign a token with this key' });
    }
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    // re-mint a few minutes before expiry so nobody ever gets a token that
    // dies mid-session
    if (!cached || cached.exp - now < 300) {
      cached = mint(teamId, keyId, privateKey);
    }
    // private: the response is now behind a session, so a shared cache must
    // never hand one teacher's response to anybody else
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).json({
      token: cached.token,
      expiresAt: cached.exp,
    });
  } catch (e) {
    // never echo the exception — PEM errors can quote key material
    console.error('[musickit-token] signing failed:', e.message);
    return res.status(500).json({ error: 'Could not mint a token' });
  }
};
