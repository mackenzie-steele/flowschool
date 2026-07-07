// ─── FLOW SCHOOL — ACCOUNT SYNC ──────────────────────────────────────────────
//
// The account is the source of truth. localStorage is only an invisible cache
// so tools stay instant and survive bad wifi — the device never OWNS the data.
//
// The whole site is locked: including this script on a page means "login
// required." If there's no valid session, the page redirects to login before it
// paints. login.html / signup.html must NOT include this file.
//
// Load AFTER the Supabase CDN + lib/supabase.js (so `db` exists), and before
// the page's own script:
//
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
//   <script src="lib/supabase.js"></script>
//   <script src="lib/sync.js"></script>
//
// Pages need NO other changes. Reads still hit localStorage; the cache is warmed
// at login (login.html) and refreshed in the background here on every load.
// Writes are mirrored up automatically — every localStorage.setItem to a synced
// key becomes an account upsert. (fsSync.ready resolves after the background
// pull, if a page ever wants to re-render on it.)
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  var TOKEN_KEY = 'sb-zizuopmcpzicbwngjagp-auth-token';

  // The libraries that live in the account. `collection` in user_data is just
  // the localStorage key — no mapping table to keep in sync.
  var SYNCED_KEYS = [
    'flowschool_classes',
    'flowschool_flows',
    'flowschool_stories',
    'flowschool_playlists',
    'flowschool_shorthand',
    'flowschool_arules',
    'flowschool_favs',
    'fs-pose-connector-saved',
    'fs-cue-flows',
  ];
  var SYNCED = {};
  SYNCED_KEYS.forEach(function (k) { SYNCED[k] = true; });

  var HAD_SYNC = 'fs-had-sync';   // this browser has synced at least once
  var PUSH_DEBOUNCE = 800;

  // Raw storage access — bypasses the write mirror so our own cache writes
  // never loop back as pushes and are never gated.
  var rawSet = window.localStorage.setItem.bind(window.localStorage);
  var rawRemove = window.localStorage.removeItem.bind(window.localStorage);
  var rawGet = window.localStorage.getItem.bind(window.localStorage);

  // ── session (synchronous, from the persisted token — no network) ────────────

  function session() {
    try {
      var raw = rawGet(TOKEN_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data.expires_at && data.expires_at < Date.now() / 1000) return null;
      if (!data.user || !data.user.id) return null;
      return data;
    } catch (e) { return null; }
  }

  function userId() {
    var s = session();
    return s ? s.user.id : null;
  }

  function isEmpty(str) {
    if (str == null) return true;
    try {
      var v = JSON.parse(str);
      if (Array.isArray(v)) return v.length === 0;
      if (v && typeof v === 'object') return Object.keys(v).length === 0;
      return v == null || v === '';
    } catch (e) { return true; }
  }

  // ── push (debounced upsert of a whole collection) ───────────────────────────

  var timers = {};
  var inflight = [];

  function queuePush(key) {
    if (timers[key]) clearTimeout(timers[key]);
    timers[key] = setTimeout(function () { pushNow(key); }, PUSH_DEBOUNCE);
  }

  function pushNow(key) {
    delete timers[key];
    var uid = userId();
    if (!uid) return;
    var value = rawGet(key);
    var payload;
    try { payload = value == null ? null : JSON.parse(value); } catch (e) { return; }
    var p = db.from('user_data')
      .upsert({
        user_id: uid,
        collection: key,
        payload: payload == null ? (SYNCED_KEYS.indexOf(key) >= 0 ? [] : null) : payload,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,collection' })
      .then(function (res) {
        if (res && res.error) console.warn('[sync] push failed for ' + key, res.error.message);
      });
    inflight.push(p);
    return p;
  }

  // Fire any pending debounced pushes right now, and hand back a promise that
  // settles when everything in flight is done (used on sign-out).
  function flush() {
    Object.keys(timers).forEach(function (key) {
      clearTimeout(timers[key]);
      pushNow(key);
    });
    return Promise.all(inflight.slice()).catch(function () {});
  }

  // ── the write mirror ────────────────────────────────────────────────────────
  // Every page write to a synced key is captured here. Logged in → cache + push.
  // Logged out → refuse to strand saved work on the device; nudge to sign in.

  window.localStorage.setItem = function (key, value) {
    if (!SYNCED[key]) return rawSet(key, value);
    if (userId()) {
      rawSet(key, value);
      queuePush(key);
      return;
    }
    // Logged out: don't save locally. Send them to sign in.
    if (window.toast) window.toast('Sign in to save your work');
    setTimeout(function () { window.location.href = 'login'; }, 700);
  };

  // ── pull / migrate the account into the cache ───────────────────────────────

  function clearCache() {
    SYNCED_KEYS.forEach(function (k) { rawRemove(k); });
  }

  function pullAll() {
    var uid = userId();
    if (!uid) return Promise.resolve();

    var firstEverSync = rawGet(HAD_SYNC) !== '1';

    // Never clear the cache BEFORE the fetch resolves — a page reads
    // localStorage the instant it runs, and an empty window would flash blank.
    // Everything below runs only once the account rows are in hand.
    return db.from('user_data').select('collection,payload').then(function (res) {
      var rows = (res && res.data) || [];
      var account = {};
      rows.forEach(function (r) { account[r.collection] = r.payload; });

      SYNCED_KEYS.forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(account, key)) {
          // Account is truth.
          var payload = account[key];
          rawSet(key, JSON.stringify(payload == null ? [] : payload));
        } else if (firstEverSync && !isEmpty(rawGet(key))) {
          // One-time migration: pre-sync local work walks itself up to the
          // account. Leave the cache as-is and push it.
          pushNow(key);
        } else {
          // Returning device, account has no such collection → make sure no
          // previous account's cached copy lingers. (Safe: for this user the
          // collection is genuinely empty.)
          rawRemove(key);
        }
      });

      rawSet(HAD_SYNC, '1');
    }).catch(function (err) {
      // Offline / query failed: keep whatever the cache already holds so the
      // teacher isn't locked out of their own work.
      console.warn('[sync] pull failed — using cached copy', err && err.message);
    });
  }

  // Flush pending writes, wait for them, then clear the cache. Call before a
  // sign-out so the last edit lands and nothing bleeds into the next account.
  function signOutCleanup() {
    return flush().then(clearCache);
  }

  // ── the site-wide lock ──────────────────────────────────────────────────────
  // Runs the moment this file loads. No session → leave for login before the
  // page paints. A session → start pulling the account into the cache; pages
  // wait on fsSync.ready before rendering.

  var ready;
  if (userId()) {
    ready = pullAll();
  } else if (/access_token=|error_description=|error=/.test(window.location.hash)
          || /[?&](code|error)=/.test(window.location.search)) {
    // an auth redirect (email confirmation, etc.) landed on a locked page —
    // carry the tokens to login intact so the client there can absorb them,
    // instead of bouncing and throwing them away
    window.location.replace('login' + window.location.search + window.location.hash);
    ready = new Promise(function () {});
  } else {
    window.location.replace('login');
    ready = new Promise(function () {}); // never resolves; the page is leaving
  }

  window.fsSync = {
    SYNCED_KEYS: SYNCED_KEYS,
    ready: ready,
    pullAll: pullAll,
    flush: flush,
    clearCache: clearCache,
    signOutCleanup: signOutCleanup,
    isLoggedIn: function () { return !!userId(); },
  };
})();
