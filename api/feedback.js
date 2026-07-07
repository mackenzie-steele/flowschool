// ─── FEEDBACK — one quiet door, always open ──────────────────────────────────
//
// Stores the report in the `feedback` table FIRST (never lost), then emails
// support@flowschool.io via Resend as a best-effort notification. Only
// signed-in users can send (the site is locked anyway); a friendly rate
// guard keeps a stuck finger from flooding the inbox.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (required)
//      RESEND_API_KEY (optional — without it, reports still land in the table)
// ─────────────────────────────────────────────────────────────────────────────

const { createClient } = require('@supabase/supabase-js');

const KINDS = { bug: 'Bug', idea: 'Idea', love: 'Love' };

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ error: 'Server is not configured' });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData || !userData.user) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  const user = userData.user;

  // ── validate the payload ──
  const body = req.body || {};
  const kind = KINDS[body.kind] ? body.kind : null;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const context = body.context && typeof body.context === 'object' ? body.context : {};
  if (!kind || !message) return res.status(400).json({ error: 'Nothing to send' });
  if (message.length > 5000) return res.status(400).json({ error: 'That’s a lot — trim it under 5000 characters' });

  // ── friendly rate guard: 5 per hour per person ──
  const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count } = await admin
    .from('feedback')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', hourAgo);
  if ((count || 0) >= 5) {
    return res.status(429).json({ error: 'You’ve sent a few already — give us an hour to catch up' });
  }

  // ── store FIRST — the table is the record, email is just a notification ──
  const { error: insErr } = await admin.from('feedback').insert({
    user_id: user.id,
    email: user.email,
    kind: kind,
    message: message,
    context: context,
  });
  if (insErr) {
    console.error('feedback insert failed:', insErr);
    return res.status(500).json({ error: 'Couldn’t save that — try again in a moment' });
  }

  // ── email support@ — best effort, never blocks the thank-you ──
  if (process.env.RESEND_API_KEY) {
    try {
      const page = context.page || 'unknown page';
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Flow School <feedback@flowschool.io>',
          to: ['support@flowschool.io'],
          reply_to: user.email,
          subject: '[' + KINDS[kind] + '] ' + page + ' — ' + user.email,
          text: message
            + '\n\n— context —\n'
            + Object.keys(context).map(function (k) { return k + ': ' + context[k]; }).join('\n')
            + '\nuser: ' + user.email + ' (' + user.id + ')',
        }),
      });
    } catch (e) {
      console.error('feedback email failed (report is stored):', e);
    }
  }

  return res.status(200).json({ ok: true });
};
