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
  var CHUNK = 100;                 // tracks per request

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

  // Called when the naming modal opens. Everything slow — the token round
  // trip and 600KB of SDK — happens while she types, so the press that
  // follows is a clean user gesture and authorize() opens its window.
  // Failures are swallowed here on purpose: there is nowhere to show them
  // yet, and pressing Send will surface the same error properly.
  function prewarm() {
    if (!sessionToken()) return;
    ready().catch(function () {});
  }

  // ── the export itself ───────────────────────────────────────────────────
  // `tracks` is [{ id, title, artist, appleId }] in playlist order. Anything
  // without an appleId is reported back, never silently dropped — a playlist
  // that quietly arrives two songs short is worse than one that says so.
  function exportPlaylist(name, description, tracks) {
    var have = tracks.filter(function (t) { return t.appleId; });
    var missing = tracks.filter(function (t) { return !t.appleId; });
    if (!have.length) return Promise.reject(new Error('NOTHING_TO_SEND'));

    // prewarm() normally has this configured long before Send is pressed, so
    // authorize() runs inside the gesture and opens its window. If the warm-up
    // hadn't finished, asking for a second press still beats a popup the
    // browser swallows in silence.
    var wasReady = configured;
    return ready().then(function (music) {
      if (music.isAuthorized) return music;
      if (!wasReady) throw new Error('PRESS_AGAIN');
      return music.authorize().then(function () { return music; });
    }).then(function (music) {
      var ref = function (t) { return { id: String(t.appleId), type: 'songs' }; };
      var body = {
        attributes: {
          name: name,
          description: description || '',
          // the only other attribute Apple accepts; artwork is not settable
          // through the API at all — it builds a mosaic from the tracks
          authorDisplayName: 'Flow School',
        },
        relationships: {
          tracks: { data: [] },   // filled below, in chunks
        },
      };
      // A class playlist is ~15 tracks; the whole catalogue is 800+. Apple
      // does not document a ceiling on the creation call, and a payload that
      // large is exactly the kind of thing that fails with a bare 400. So the
      // playlist is created with the first chunk and the rest are appended.
      var first = have.slice(0, CHUNK);
      var rest = have.slice(CHUNK);
      body.relationships.tracks.data = first.map(ref);

      return music.api.music('/v1/me/library/playlists', {}, {
        fetchOptions: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      }).then(function (res) {
        var made = res && res.data && res.data.data && res.data.data[0];
        var id = made ? made.id : null;
        if (!rest.length || !id) return { id: id, added: first.length };

        // sequential, not parallel — Apple keeps playlist order, and firing
        // these at once would shuffle the arc we spent the whole tool shaping
        var addedSoFar = first.length;
        return rest.reduce(function (chain, _, i) {
          if (i % CHUNK) return chain;
          var batch = rest.slice(i, i + CHUNK);
          return chain.then(function () {
            return music.api.music('/v1/me/library/playlists/' + id + '/tracks', {}, {
              fetchOptions: {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: batch.map(ref) }),
              },
            }).then(function () { addedSoFar += batch.length; });
          });
        }, Promise.resolve()).then(function () { return { id: id, added: addedSoFar }; });
      });
    }).then(function (out) {
      return { added: out.added, missing: missing, playlistId: out.id };
    });
  }

  // Search the catalogue. Developer token only — no Apple sign-in, because
  // reading the catalogue is not the same as touching anyone's library. Used
  // by the admin to find the right recording for a song the resolver refused
  // to guess at.
  function search(term, limit) {
    return developerToken().then(function (token) {
      var url = 'https://api.music.apple.com/v1/catalog/us/search?types=songs&limit='
        + (limit || 6) + '&term=' + encodeURIComponent(term);
      return fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    }).then(function (r) {
      if (!r.ok) throw new Error('SEARCH_FAILED');
      return r.json();
    }).then(function (j) {
      var data = (j.results && j.results.songs && j.results.songs.data) || [];
      return data.map(function (d) {
        var a = d.attributes || {};
        return {
          appleId: d.id,
          title: a.name,
          artist: a.artistName,
          album: a.albumName,
          dur: Math.round((a.durationInMillis || 0) / 1000),
          genre: (a.genreNames || [])[0] || null,
          isrc: a.isrc || null,
          art: a.artwork ? a.artwork.url.replace(/\{w\}x\{h\}/, '{px}x{px}') : null,
          preview: (a.previews && a.previews[0] && a.previews[0].url) || null,
        };
      });
    });
  }

  // Read a playlist the developer token alone can see — i.e. one that has been
  // SHARED. A private library playlist would need the owner's Music User
  // Token, which expires and cannot run unattended; a shared one is just a
  // catalogue resource, so this works from a script or an admin page with no
  // Apple sign-in at all.
  //
  // Accepts a full music.apple.com URL or a bare pl.… id, because the thing a
  // person actually has to hand is the share link.
  function playlistId(input) {
    var v = String(input || '').trim();
    var m = v.match(/\/(pl\.[A-Za-z0-9-]+)/) || v.match(/^(pl\.[A-Za-z0-9-]+)$/);
    return m ? m[1] : null;
  }

  function readPlaylist(input) {
    var id = playlistId(input);
    if (!id) return Promise.reject(new Error('BAD_PLAYLIST_URL'));
    return developerToken().then(function (token) {
      var H = { Authorization: 'Bearer ' + token };
      var out = [];

      function page(url) {
        return fetch(url, { headers: H }).then(function (r) {
          if (r.status === 404) throw new Error('PLAYLIST_NOT_FOUND');
          if (!r.ok) throw new Error('PLAYLIST_FAILED');
          return r.json();
        }).then(function (j) {
          // the first call returns the playlist; later ones return a track page
          var rel = j.data && j.data[0] && j.data[0].relationships;
          var t = rel ? rel.tracks : j;
          out = out.concat(t.data || []);
          // 100 tracks a page and no way to raise it, so a full catalogue is
          // eight round trips — sequential, because Apple rate-limits bursts
          if (t.next) return page('https://api.music.apple.com' + t.next);
          return null;
        });
      }

      return page('https://api.music.apple.com/v1/catalog/us/playlists/' + id)
        .then(function () {
          return out.map(function (d) {
            var a = d.attributes || {};
            return {
              appleId: d.id,
              title: a.name,
              artist: a.artistName,
              album: a.albumName,
              dur: Math.round((a.durationInMillis || 0) / 1000),
              genre: (a.genreNames || [])[0] || null,
              isrc: a.isrc || null,
              art: a.artwork ? a.artwork.url.replace(/\{w\}x\{h\}/, '{px}x{px}') : null,
              preview: (a.previews && a.previews[0] && a.previews[0].url) || null,
            };
          });
        });
    });
  }

  // Sign in, and nothing else. Exists so a caller can spend the click's user
  // gesture on authorize() BEFORE doing any of its own async work — Apple's
  // sign-in opens a window, and a browser only permits that inside a live
  // gesture. Awaiting a network call first silently forfeits it.
  function connect() {
    return ready().then(function (music) {
      if (music.isAuthorized) return music;
      return music.authorize().then(function () { return music; });
    });
  }

  // Adding to a playlist that already exists is a LIBRARY write, so unlike
  // reading it needs the owner signed into Apple. And it needs the library id
  // (p.…), which the catalogue response does not carry — the share link only
  // ever yields the catalogue id (pl.u-…). So: sign in, list the library, match
  // by name. Fragile if the playlist is renamed, which is why the name is
  // passed in rather than hard-coded.
  function findLibraryPlaylist(name) {
    return connect().then(function (music) {
      var want = String(name).trim().toLowerCase();
      var matches = [], all = [];

      function page(offset) {
        return music.api.music('/v1/me/library/playlists', { limit: 100, offset: offset })
          .then(function (res) {
            var d = (res && res.data) || {};
            (d.data || []).forEach(function (pl) {
              var a = pl.attributes || {};
              var entry = { id: pl.id, name: a.name, canEdit: a.canEdit, hasCatalog: a.hasCatalog };
              all.push(entry);
              if (String(a.name || '').trim().toLowerCase() === want) matches.push(entry);
            });
            if (d.next) return page(offset + 100);
            return null;
          });
      }

      return page(0).then(function () {
        // The library can hold more than one playlist with the same name —
        // notably a catalogue copy alongside the one you created — and only
        // the one you own is writable. Prefer an editable match rather than
        // taking the first and reporting it as un-writable.
        var editable = matches.filter(function (m) { return m.canEdit !== false; });
        var pick = editable[0] || matches[0];

        // logged, not thrown away: when the wrong playlist is matched the
        // fastest way to see it is the list the search actually walked
        console.info('[music] library playlists: ' + all.length
          + ', name matches: ' + matches.length
          + ', editable matches: ' + editable.length);
        if (matches.length) console.info('[music] matches:', matches);
        else console.info('[music] first few in the library:', all.slice(0, 10));

        if (!pick) {
          var e = new Error('PLAYLIST_MISSING');
          e.libraryCount = all.length;
          throw e;
        }
        if (pick.canEdit === false) {
          var e2 = new Error('NOT_EDITABLE');
          e2.matchCount = matches.length;
          e2.libraryCount = all.length;
          throw e2;
        }
        return { music: music, id: pick.id, canEdit: pick.canEdit !== false,
                 name: pick.name, matchCount: matches.length, libraryCount: all.length };
      });
    });
  }

  // `tracks` is [{ appleId }] — anything without one is the caller's problem.
  //
  // Built with plain fetch rather than music.api.music(). The wrapper merges
  // its own fetchOptions and headers, and a POST through it returned a bare
  // 500 with no detail — so this sends exactly what Apple documents and reads
  // the response body back, which is the difference between "it failed" and
  // knowing why.
  function addToPlaylistById(libraryId, tracks, onProgress) {
    var have = tracks.filter(function (t) { return t.appleId; });
    if (!have.length) return Promise.resolve({ added: 0 });

    return connect().then(function (music) {
      var userToken = music.musicUserToken;
      if (!userToken) throw new Error('NO_USER_TOKEN');
      return developerToken().then(function (devToken) {
        var url = 'https://api.music.apple.com/v1/me/library/playlists/' + libraryId + '/tracks';
        var chunks = [];
        for (var i = 0; i < have.length; i += CHUNK) chunks.push(have.slice(i, i + CHUNK));
        var added = 0;

        // sequential — Apple keeps playlist order, and concurrent appends
        // interleave the arc we spent the whole tool shaping
        return chunks.reduce(function (chain, batch) {
          return chain.then(function () {
            return fetch(url, {
              method: 'POST',
              headers: {
                Authorization: 'Bearer ' + devToken,
                'Music-User-Token': userToken,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                data: batch.map(function (t) { return { id: String(t.appleId), type: 'songs' }; }),
              }),
            }).then(function (r) {
              if (r.ok || r.status === 204) {
                added += batch.length;
                if (onProgress) onProgress(added, have.length);
                return;
              }
              return r.text().then(function (body) {
                var detail = body;
                try {
                  var j = JSON.parse(body);
                  var e0 = (j.errors || [])[0];
                  if (e0) detail = (e0.title || '') + (e0.detail ? ' — ' + e0.detail : '');
                } catch (_) {}
                var err = new Error(detail || ('HTTP ' + r.status));
                err.status = r.status;
                throw err;
              });
            });
          });
        }, Promise.resolve()).then(function () { return { added: added, playlistId: libraryId }; });
      });
    });
  }

  function addToPlaylist(name, tracks) {
    return findLibraryPlaylist(name).then(function (out) {
      return addToPlaylistById(out.id, tracks);
    });
  }

  // Plain-English for every way this fails. "Something went wrong" costs the
  // teacher a support email; naming the cause usually costs her one tap.
  function explain(err) {
    var m = (err && err.message) || '';
    if (m === 'SIGNED_OUT') return 'You’re signed out of Flow School — sign in and try again.';
    if (m === 'NOT_CONFIGURED') return 'Apple Music isn’t set up on this site yet.';
    if (m === 'NOTHING_TO_SEND') return 'None of these songs are on Apple Music.';
    if (m === 'NO_USER_TOKEN') return 'Apple Music didn’t hand back a user token — try signing in again.';
    if (m === 'NOT_EDITABLE') return 'Apple says that playlist isn’t editable — usually the Apple ID signed in here isn’t the one that created it.';
    if (m === 'AUTH_DECLINED') return 'Apple Music sign-in didn’t complete.';
    if (m === 'PLAYLIST_MISSING') return 'That playlist isn’t in the library of the Apple ID signed in here.';
    if (m === 'BAD_PLAYLIST_URL') return 'That doesn’t look like an Apple Music playlist link.';
    if (m === 'PLAYLIST_NOT_FOUND') return 'Apple can’t see that playlist — is it shared?';
    if (m === 'PLAYLIST_FAILED') return 'Couldn’t read that playlist just now.';
    if (m === 'SEARCH_FAILED') return 'Apple Music search didn’t answer. Try again.';
    if (m === 'TOKEN_FAILED') return 'Couldn’t reach Apple Music just now. Try again in a moment.';
    if (m === 'PRESS_AGAIN') return 'Ready — press again to send it to Apple Music.';
    if (m === 'SDK_UNREACHABLE') return 'Couldn’t load Apple Music. Check your connection.';
    if (m === 'SDK_TIMEOUT') return 'Apple Music took too long to load. Try again.';
    if (/AUTHORIZATION|cancel|denied|popup/i.test(m)) return 'Apple Music sign-in was cancelled.';
    if (/subscription|403/i.test(m)) return 'This needs an active Apple Music subscription.';
    return 'Couldn’t send the playlist to Apple Music.';
  }

  // MusicKit remembers the Apple ID across sessions, so a wrong sign-in is
  // sticky and there is no other way to correct it from inside the page.
  function disconnect() {
    try {
      if (window.MusicKit && configured) {
        var m = window.MusicKit.getInstance();
        if (m && m.unauthorize) return Promise.resolve(m.unauthorize());
      }
    } catch (e) {}
    return Promise.resolve();
  }

  // Who is actually signed in, and what can they write to. There is no API
  // for "which Apple ID is this" — the library itself is the answer.
  function whoami() {
    return connect().then(function (music) {
      return music.api.music('/v1/me/library/playlists', { limit: 100 }).then(function (res) {
        var d = (res && res.data && res.data.data) || [];
        return {
          hasUserToken: !!music.musicUserToken,
          playlists: d.map(function (pl) {
            var a = pl.attributes || {};
            return { id: pl.id, name: a.name, canEdit: a.canEdit };
          }),
        };
      });
    });
  }

  window.fsMusicKit = {
    exportPlaylist: exportPlaylist,
    prewarm: prewarm,
    search: search,
    readPlaylist: readPlaylist,
    addToPlaylist: addToPlaylist,
    addToPlaylistById: addToPlaylistById,
    findLibraryPlaylist: findLibraryPlaylist,
    connect: connect,
    disconnect: disconnect,
    whoami: whoami,
    playlistId: playlistId,
    explain: explain,
    isAvailable: function () { return !!sessionToken(); },
    isConnected: function () {
      try { return !!(window.MusicKit && window.MusicKit.getInstance().isAuthorized); }
      catch (e) { return false; }
    },
  };
})();
