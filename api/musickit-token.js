// ─── MUSICKIT DEVELOPER TOKEN — minted here, never shipped ───────────────────
//
// Returns a short-lived Apple Music developer token so the browser can talk to
// the Apple Music API and MusicKit JS.
//
// THE WHOLE POINT: the .p8 signing key never leaves the server. Anything
// holding that key can mint tokens as Flow School, so it lives in a Vercel
// environment variable and the browser only ever sees a token that expires.
//
// Env: MUSICKIT_TEAM_ID   — 10 chars, from the Membership tab
//      MUSICKIT_KEY_ID    — 10 chars, the tail of AuthKey_XXXXXXXXXX.p8
//      MUSICKIT_PRIVATE_KEY — the .p8 file's contents, BEGIN/END lines and all
//
// Set them with:  vercel env add MUSICKIT_PRIVATE_KEY production
// (paste the file contents at the prompt — never commit the file itself)
//
// ON THE SIX-MONTH CEILING
// Apple caps developer tokens at 15777000 seconds — roughly six months. A
// token pasted into the client would therefore die twice a year, silently, and
// the failure would look like "Apple Music is broken" rather than "the token
// expired". So we mint on demand and keep them SHORT (12h), which also means a
// leaked token is worthless by tomorrow.
//
// Signing is done with Node's own crypto — no dependency. The one trap is that
// crypto.sign() emits DER by default and JWS wants raw r‖s; `dsaEncoding:
// 'ieee-p1363'` asks for the right one. Getting this wrong yields a token
// Apple rejects with a bare 401 and no explanation.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');

const TTL = 12 * 60 * 60;          // 12 hours
const APPLE_MAX = 15777000;        // Apple's ceiling, ~6 months — never exceed

const b64url = buf =>
  Buffer.from(buf).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

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

  const teamId = process.env.MUSICKIT_TEAM_ID;
  const keyId = process.env.MUSICKIT_KEY_ID;
  // Vercel's UI turns real newlines into \n when a multi-line value is pasted;
  // restore them or the PEM parse fails with a very unhelpful error
  const privateKey = (process.env.MUSICKIT_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!teamId || !keyId || !privateKey) {
    // named explicitly — "not configured" costs an hour of guessing
    const missing = [
      !teamId && 'MUSICKIT_TEAM_ID',
      !keyId && 'MUSICKIT_KEY_ID',
      !privateKey && 'MUSICKIT_PRIVATE_KEY',
    ].filter(Boolean);
    return res.status(503).json({ error: 'Apple Music is not configured', missing });
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    // re-mint a few minutes before expiry so nobody ever gets a token that
    // dies mid-session
    if (!cached || cached.exp - now < 300) {
      cached = mint(teamId, keyId, privateKey);
    }
    // cache at the edge too, but always well inside the token's own lifetime
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
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
