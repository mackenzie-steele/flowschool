// ─── MUSICKIT — the bridge to a teacher's own Apple Music library ────────────
//
// Turns a built playlist into a real playlist in her Apple Music. Until now a
// Flow School playlist was a shopping list: she'd shape a sixty-minute arc and
// then retype fourteen titles into her music app.
//
// LOADED ON DEMAND, NEVER ON PAGE LOAD
// Apple's musickit.js has to come from their CDN — it can't be self-hosted,
// and it would be the only third-party script on a site that vendors even
// Supabase. So it isn't loaded until someone actually presses Export. A
// teacher who never exports never fetches a byte of it.
//
// THREE TOKENS, AND ONLY ONE OF THEM IS OURS
//   Supabase session  — proves she's a Flow School member; gets us…
//   developer token   — from /api/musickit-token, signed with our .p8; proves
//                       the app is us. Read-only against the catalogue.
//   music user token  — from MusicKit.authorize(); hers, not ours. The ONLY
//                       thing that can write to her library, and it exists
//                       because she signed into Apple and agreed.
//
// The developer token can never touch anyone's library. That separation is
// the point, not an implementation detail.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  var SDK = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
  var sdkPromise = null;
  var configured = false;

  // ── the Supabase session, the same way nav.js reads it ──────────────────
  function sessionToken() {
    try {
      var keys = Object.keys(localStorage);
      for (var i = 0; i < keys.length; i++) {
        if (!/^sb-.*-auth-token$/.test(keys[i])) continue;
        var d = JSON.parse(localStorage.getItem(keys[i]));
        if (d && d.expires_at && d.expires_at < Date.now() / 1000) return null;
        if (d && d.access_token) return d.access_token;
      }
    } catch (e) {}
    return null;
  }

  // Three ways to learn the SDK is ready, because relying on the event alone
  // hangs forever when it doesn't fire — and a promise that never settles
  // leaves the button spinning with no error and nothing to click.
  function loadSdk() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      if (window.MusicKit) return resolve(window.MusicKit);

      var done = false;
      function finish(err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearInterval(poll);
        if (err) { sdkPromise = null; reject(err); }      // let a retry re-attempt
        else resolve(window.MusicKit);
      }

      var s = document.createElement('script');
      s.src = SDK;
      s.async = true;
      document.addEventListener('musickitloaded', function () { finish(); }, { once: true });
      s.onload = function () { if (window.MusicKit) finish(); };
      s.onerror = function () { finish(new Error('SDK_UNREACHABLE')); };
      // the event has been known not to fire; the global appearing is the
      // thing we actually care about
      var poll = setInterval(function () { if (window.MusicKit) finish(); }, 120);
      var timer = setTimeout(function () { finish(new Error('SDK_TIMEOUT')); }, 15000);

      document.head.appendChild(s);
    });
    return sdkPromise;
  }

  function developerToken() {
    var tok = sessionToken();
    if (!tok) return Promise.reject(new Error('SIGNED_OUT'));
    return fetch('/api/musickit-token', { headers: { Authorization: 'Bearer ' + tok } })
      .then(function (r) {
        if (r.status === 401) throw new Error('SIGNED_OUT');
        if (r.status === 503) throw new Error('NOT_CONFIGURED');
        if (!r.ok) throw new Error('TOKEN_FAILED');
        return r.json();
      })
      .then(function (j) { return j.token; });
  }

  function ready() {
    if (configured) return Promise.resolve(window.MusicKit.getInstance());
    // Token FIRST, then the SDK — deliberately sequential. Fetching both at
    // once shaves a moment off the happy path and pulls a third-party script
    // onto the page for someone who is signed out and was never going to get
    // a token. The cheap local check gates the network call.
    return developerToken()
      .then(function (token) {
        return loadSdk().then(function (MK) {
          return MK.configure({
            developerToken: token,
            app: { name: 'Flow School', build: window.fsVersion || '1' },
          });
        });
      })
      .then(function () {
        configured = true;
        return window.MusicKit.getInstance();
      });
  }

  // ── the export itself ───────────────────────────────────────────────────
  // `tracks` is [{ id, title, artist, appleId }] in playlist order. Anything
  // without an appleId is reported back, never silently dropped — a playlist
  // that quietly arrives two songs short is worse than one that says so.
  function exportPlaylist(name, description, tracks) {
    var have = tracks.filter(function (t) { return t.appleId; });
    var missing = tracks.filter(function (t) { return !t.appleId; });
    if (!have.length) return Promise.reject(new Error('NOTHING_TO_SEND'));

    // authorize() opens Apple's sign-in window, and browsers only allow that
    // inside a real user gesture. Fetching a token and 600KB of SDK first
    // spends the gesture, so the popup is silently swallowed. When setup has
    // to happen we do it, then stop and ask for a second press — by which
    // point ready() resolves instantly and authorize() runs inside the click.
    var wasReady = configured;
    return ready().then(function (music) {
      if (music.isAuthorized) return music;
      if (!wasReady) throw new Error('PRESS_AGAIN');
      return music.authorize().then(function () { return music; });
    }).then(function (music) {
      var body = {
        attributes: { name: name, description: description || '' },
        relationships: {
          tracks: {
            data: have.map(function (t) {
              return { id: String(t.appleId), type: 'songs' };
            }),
          },
        },
      };
      return music.api.music('/v1/me/library/playlists', {}, {
        fetchOptions: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      });
    }).then(function (res) {
      var made = res && res.data && res.data.data && res.data.data[0];
      return {
        added: have.length,
        missing: missing,
        playlistId: made ? made.id : null,
      };
    });
  }

  // Plain-English for every way this fails. "Something went wrong" costs the
  // teacher a support email; naming the cause usually costs her one tap.
  function explain(err) {
    var m = (err && err.message) || '';
    if (m === 'SIGNED_OUT') return 'You’re signed out of Flow School — sign in and try again.';
    if (m === 'NOT_CONFIGURED') return 'Apple Music isn’t set up on this site yet.';
    if (m === 'NOTHING_TO_SEND') return 'None of these songs are on Apple Music.';
    if (m === 'TOKEN_FAILED') return 'Couldn’t reach Apple Music just now. Try again in a moment.';
    if (m === 'PRESS_AGAIN') return 'Ready — press again to send it to Apple Music.';
    if (m === 'SDK_UNREACHABLE') return 'Couldn’t load Apple Music. Check your connection.';
    if (m === 'SDK_TIMEOUT') return 'Apple Music took too long to load. Try again.';
    if (/AUTHORIZATION|cancel|denied|popup/i.test(m)) return 'Apple Music sign-in was cancelled.';
    if (/subscription|403/i.test(m)) return 'This needs an active Apple Music subscription.';
    return 'Couldn’t send the playlist to Apple Music.';
  }

  window.fsMusicKit = {
    exportPlaylist: exportPlaylist,
    explain: explain,
    isAvailable: function () { return !!sessionToken(); },
    isConnected: function () {
      try { return !!(window.MusicKit && window.MusicKit.getInstance().isAuthorized); }
      catch (e) { return false; }
    },
  };
})();
