// ─── SUPABASE CLIENT ─────────────────────────────────────────────────────────
//
// Requires the Supabase CDN script to be loaded before this file:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
//
// Usage on any page: import this file after the CDN script, then use `db`
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://zizuopmcpzicbwngjagp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9WOvDeVbncbedXggZ1-XFg_hFrWgihn';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
