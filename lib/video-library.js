// ─── FLOW SCHOOL — member Video Library: shared data layer ───────────────────
//
// Shared by library.html, library-category.html, collection.html, video.html.
// Load after lib/supabase.js (db) and lib/nav.js.
//
// Three jobs live here so four pages cannot drift apart about them:
//   1. the ACCESS GATE (admin-only for this phase — one flag to open it)
//   2. WHAT "LIVE" MEANS — the member-visible slice of the catalogue
//   3. SIGNED THUMBNAILS — batch-fetched, cached, never requested per card
//
// Security note: none of this is the boundary. RLS decides what rows exist
// and canWatch() on the server decides what plays. The explicit live
// filters below exist so an ADMIN browsing this library sees exactly what a
// member would see — without them, the admin RLS policies would quietly
// pour drafts into Bonnie's preview.
// ─────────────────────────────────────────────────────────────────────────────

window.fsVL = (function () {
  'use strict';

  // ── THE PHASE FLAG ─────────────────────────────────────────────────────────
  // true  → the whole library is admins-only (current phase)
  // false → any signed-in member may browse (the eventual state)
  // Nothing else changes when this flips: the queries below already read the
  // member slice, and playback/downloads are governed server-side.
  var ADMIN_ONLY = true;

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  function session() {
    try {
      var raw = localStorage.getItem('sb-zizuopmcpzicbwngjagp-auth-token');
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data.expires_at && data.expires_at < Date.now() / 1000) return null;
      return data;
    } catch (_) { return null; }
  }
  function accessToken() { var s = session(); return s ? s.access_token : null; }
  function userId() { var s = session(); return s && s.user ? s.user.id : null; }

  // ── the gate ───────────────────────────────────────────────────────────────
  // Signed out → login (with a way back). Signed in but not allowed → an
  // honest denied screen, same shape the Admin Center uses. The page's own
  // boot only runs once this resolves true.
  async function gate(main) {
    if (!session()) {
      window.location.href = 'login?next=' + encodeURIComponent(location.pathname + location.search);
      return false;
    }
    if (!ADMIN_ONLY) return true;
    var ok = false;
    try {
      var r = await db.rpc('is_admin');
      ok = !!(r && !r.error && r.data === true);
    } catch (_) {}
    if (!ok && main) {
      main.innerHTML =
        '<div class="lib-denied">' +
          '<span class="material-symbols-sharp">visibility_lock</span>' +
          '<h1>Not open yet</h1>' +
          '<p>The video library is being built and is only visible to admins for now. It will open to everyone soon.</p>' +
        '</div>';
    }
    return ok;
  }

  // ── what "live" means, in query form ──────────────────────────────────────
  // Mirrors the member read policies exactly: published, or scheduled with
  // its moment passed. Unlisted content never appears on browse surfaces.
  function liveOr() {
    return 'status.eq.published,and(status.eq.scheduled,published_at.lte.' +
      new Date().toISOString() + ')';
  }
  function isLiveRow(r) {
    return r && (r.status === 'published' ||
      (r.status === 'scheduled' && r.published_at && new Date(r.published_at) <= new Date()));
  }

  var VIDEO_CARD_COLS = 'id, title, slug, short_description, duration_seconds, ' +
    'thumbnail_mode, thumbnail_time_seconds, custom_thumbnail_url, mux_playback_id, ' +
    'category_id, instructor_id, published_at, status, visibility';
  var COL_CARD_COLS = 'id, title, slug, short_description, thumbnail_mode, ' +
    'custom_thumbnail_url, thumbnail_vertical_url, thumbnail_square_url, ' +
    'instructor_id, published_at, status, visibility';

  // ── one load for the whole browse world ────────────────────────────────────
  // Beta-scale on purpose: the catalogue is small, and the FTS/GIN indexes
  // already in the database are the growth path when it is not.
  async function loadCatalogue() {
    var now = new Date().toISOString();
    var got = await Promise.all([
      // '*' on purpose: a small table, and naming columns here would break
      // the whole library on any database that has not run the latest SQL
      // (the subtitle column arrived 2026-08-19)
      db.from('video_categories').select('*').eq('status', 'active').order('sort_order').order('name'),
      db.from('videos').select(VIDEO_CARD_COLS).or(liveOr()).neq('visibility', 'unlisted'),
      db.from('collections').select(COL_CARD_COLS).or(liveOr()).neq('visibility', 'unlisted'),
      db.from('collection_stats').select('*'),
      db.from('video_category_links').select('video_id, category_id, sort_order'),
      db.from('collection_categories').select('collection_id, category_id, sort_order'),
      db.from('filters').select('id, name, slug, sort_order').eq('status', 'active').order('sort_order'),
      db.from('filter_options').select('id, filter_id, name, slug, sort_order').eq('status', 'active').order('sort_order'),
      db.from('content_filter_values').select('option_id, video_id, collection_id'),
      db.from('collection_items').select('collection_id, kind, video_id, position').order('position'),
      db.from('instructors').select('id, name').eq('status', 'active'),
    ]);
    var err = got.filter(function (r) { return r.error; })[0];
    if (err) throw err.error;

    var L = {
      categories: got[0].data || [],
      videos: got[1].data || [],
      collections: got[2].data || [],
      stats: {}, vlinks: got[4].data || [], clinks: got[5].data || [],
      filters: got[6].data || [], options: got[7].data || [],
      values: got[8].data || [], items: got[9].data || [],
      instructors: {},
      byVideo: {}, byCollection: {},
    };
    (got[3].data || []).forEach(function (s) { L.stats[s.collection_id] = s; });
    (got[10].data || []).forEach(function (i) { L.instructors[i.id] = i.name; });
    L.videos.forEach(function (v) { L.byVideo[v.id] = v; });
    L.collections.forEach(function (c) { L.byCollection[c.id] = c; });
    // the curated hero — fetched apart from the Promise.all so a database
    // that has not run library-featured.sql yet costs a fallback, not the page
    L.featuredRows = [];
    try {
      var fr = await db.from('library_featured').select('*').order('sort_order').order('created_at');
      if (!fr.error) L.featuredRows = fr.data || [];
    } catch (_) {}
    return L;
  }

  // ── cards: one normalized shape for both kinds ─────────────────────────────
  function videoItem(L, v) {
    return {
      kind: 'video', id: v.id, slug: v.slug, title: v.title,
      short: v.short_description || '',
      metaSeconds: v.duration_seconds,
      instructor: L.instructors[v.instructor_id] || null,
      art: (v.thumbnail_mode === 'custom' && v.custom_thumbnail_url) ? v.custom_thumbnail_url : null,
      playbackId: v.mux_playback_id || null,
      publishedAt: v.published_at,
    };
  }
  function collectionFirstVideo(L, colId) {
    var first = L.items.filter(function (i) {
      return i.collection_id === colId && i.kind === 'video' && L.byVideo[i.video_id];
    }).sort(function (a, b) { return a.position - b.position; })[0];
    return first ? L.byVideo[first.video_id] : null;
  }
  function collectionItem(L, c) {
    var s = L.stats[c.id] || {};
    var art = (c.thumbnail_mode === 'custom' && c.custom_thumbnail_url) ? c.custom_thumbnail_url : null;
    var fv = null;
    if (!art) {
      fv = collectionFirstVideo(L, c.id);
      if (fv && fv.thumbnail_mode === 'custom' && fv.custom_thumbnail_url) art = fv.custom_thumbnail_url;
    }
    return {
      kind: 'collection', id: c.id, slug: c.slug, title: c.title,
      short: c.short_description || '',
      count: Number(s.video_count || 0), runtime: Number(s.total_seconds || 0),
      instructor: L.instructors[c.instructor_id] || null,
      art: art,
      // when its own art and the first video's uploaded poster are both
      // missing, the first video's SIGNED still can stand in
      playbackId: (!art && fv) ? fv.mux_playback_id : null,
      tokenVideoId: (!art && fv) ? fv.id : null,
      publishedAt: c.published_at,
    };
  }

  // the admin-curated featured order for one category: videos and
  // collections interleaved by the junction sort_order, exactly as dragged
  function categoryItems(L, catId) {
    var rows = [];
    L.vlinks.forEach(function (l) {
      if (l.category_id !== catId) return;
      var v = L.byVideo[l.video_id];
      if (v) rows.push({ sort: l.sort_order || 0, item: videoItem(L, v) });
    });
    L.clinks.forEach(function (l) {
      if (l.category_id !== catId) return;
      var c = L.byCollection[l.collection_id];
      if (c) rows.push({ sort: l.sort_order || 0, item: collectionItem(L, c) });
    });
    return rows.sort(function (a, b) {
      return (a.sort - b.sort) || a.item.title.localeCompare(b.item.title);
    }).map(function (r) { return r.item; });
  }

  // ── FEATURED ───────────────────────────────────────────────────────────────
  // Admin-curated in Content → Video → Featured (library_featured): a row is
  // a slide, sort_order is the carousel. Rows whose content is not in the
  // live catalogue (unpublished again, or an unlisted collection) are simply
  // skipped. CURATION IS THE WHOLE STORY — nothing lands in the hero on its
  // own, and an empty curation means no hero: the page opens on "What do
  // you want to explore?", which is a fine way to open.
  function featured(L, cap) {
    return (L.featuredRows || []).map(function (f) {
      var it = null;
      if (f.video_id && L.byVideo[f.video_id]) it = videoItem(L, L.byVideo[f.video_id]);
      if (f.collection_id && L.byCollection[f.collection_id]) it = collectionItem(L, L.byCollection[f.collection_id]);
      if (it) it.eyebrow = f.eyebrow || null;   // the slide's custom label
      return it;
    }).filter(Boolean).slice(0, cap || 8);
  }

  // ── signed thumbnails: batched, cached, shared ─────────────────────────────
  // Tokens live 6h; the cache keeps them 5 so nothing is ever handed an
  // expiring URL. sessionStorage, so navigating between library pages does
  // not re-mint the same tokens.
  var TOK_KEY = 'fs-vl-thumbtok';
  function tokCache() {
    try { return JSON.parse(sessionStorage.getItem(TOK_KEY)) || {}; } catch (_) { return {}; }
  }
  async function thumbTokens(videoIds) {
    var cache = tokCache();
    var now = Date.now();
    var need = videoIds.filter(function (id) {
      return id && !(cache[id] && cache[id].exp > now);
    });
    need = Array.from(new Set(need));
    if (need.length) {
      try {
        var r = await fetch('/api/mux/playback-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken() },
          body: JSON.stringify({ videoIds: need.slice(0, 100) }),
        });
        var out = await r.json();
        if (r.ok && out.thumbnails) {
          Object.keys(out.thumbnails).forEach(function (id) {
            cache[id] = { t: out.thumbnails[id], exp: now + 5 * 3600 * 1000 };
          });
          try { sessionStorage.setItem(TOK_KEY, JSON.stringify(cache)); } catch (_) {}
        }
      } catch (_) { /* cards keep their quiet fallback */ }
    }
    var map = {};
    videoIds.forEach(function (id) {
      if (id && cache[id] && cache[id].exp > now + 60000) map[id] = cache[id].t;
    });
    return map;
  }
  function muxStill(playbackId, token, width) {
    return 'https://image.mux.com/' + encodeURIComponent(playbackId) +
      '/thumbnail.webp?width=' + (width || 640) + '&token=' + encodeURIComponent(token);
  }

  // fill every [data-tok-video] image on the page in ONE request. Cards
  // render instantly with their quiet fallback; stills drop in as they sign.
  async function hydrateThumbs(root) {
    var els = Array.prototype.slice.call((root || document).querySelectorAll('[data-tok-video]'))
      // idempotent: pages call this per-section AND page-wide, and an element
      // hydrated (or mid-hydration) must not receive a SECOND stacked image
      .filter(function (el) {
        if (el.dataset.fsHydrated || el.querySelector('img')) return false;
        el.dataset.fsHydrated = '1';
        return true;
      });
    if (!els.length) return;
    var ids = els.map(function (el) { return el.dataset.tokVideo; });
    var map = await thumbTokens(ids);
    els.forEach(function (el) {
      var tok = map[el.dataset.tokVideo];
      var pid = el.dataset.playback;
      if (!tok || !pid) return;
      // NO loading="lazy" here: a detached image with it never loads (it has
      // no viewport to intersect), so onload would never fire. The batch
      // token fetch is already the laziness.
      var img = new Image();
      img.alt = '';
      img.onload = function () {
        var glyph = el.querySelector('.bare-glyph');
        if (glyph) glyph.remove();
        el.insertBefore(img, el.firstChild);
      };
      img.src = muxStill(pid, tok, parseInt(el.dataset.w || '640', 10));
    });
  }

  // ── card HTML ──────────────────────────────────────────────────────────────
  function fmtDur(sec) {
    if (sec == null) return '';
    var s = Math.round(Number(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s % 60).padStart(2, '0');
  }
  function fmtRuntime(sec) {
    var m = Math.round(Number(sec || 0) / 60);
    if (!m) return sec > 0 ? '<1 min' : '0 min';
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
  }

  function artHTML(item, w) {
    var inner = '';
    if (item.art) {
      inner = '<img alt="" loading="lazy" src="' + esc(item.art) + '">';
    } else if (item.playbackId) {
      inner = '<span class="bare-glyph"><span class="material-symbols-sharp">' +
        (item.kind === 'collection' ? 'stacks' : 'movie') + '</span></span>';
    } else {
      inner = '<span class="bare-glyph"><span class="material-symbols-sharp">' +
        (item.kind === 'collection' ? 'stacks' : 'movie') + '</span></span>';
    }
    var tok = (!item.art && item.playbackId)
      ? ' data-tok-video="' + esc(item.tokenVideoId || item.id) + '" data-playback="' + esc(item.playbackId) + '" data-w="' + (w || 640) + '"'
      : '';
    return tok ? [inner, tok] : [inner, ''];
  }

  function cardHTML(item) {
    var href = item.kind === 'collection' ? '/collection/' + item.slug : '/video/' + item.slug;
    var a = artHTML(item, 640);
    var artBody = item.kind === 'collection'
      ? '<span class="vcard-art-in"' + a[1] + '>' + a[0] + '</span>'
      : a[0] +
        (item.metaSeconds != null ? '<span class="vcard-dur">' + fmtDur(item.metaSeconds) + '</span>' : '');
    // a video card is its artwork and title — the duration already lives on
    // the thumbnail, and the byline belongs on the video page, not the shelf
    var meta = item.kind === 'collection'
      ? '<span class="material-symbols-sharp">stacks</span>' +
        esc(item.count + (item.count === 1 ? ' video' : ' videos') +
            (item.runtime ? ' · ' + fmtRuntime(item.runtime) : ''))
      : '';
    return '<a class="vcard' + (item.kind === 'collection' ? ' is-collection' : '') + '" href="' + esc(href) + '">' +
      '<span class="vcard-art"' + (item.kind === 'collection' ? '' : a[1]) + '>' + artBody + '</span>' +
      '<span class="vcard-title">' + esc(item.title) + '</span>' +
      (meta ? '<span class="vcard-meta">' + meta + '</span>' : '') +
    '</a>';
  }

  function skeletonCards(n) {
    var out = '';
    for (var i = 0; i < n; i++) {
      out += '<div class="vcard"><span class="vcard-art lib-skel"></span>' +
        '<span class="lib-skel" style="height:14px;width:80%"></span>' +
        '<span class="lib-skel" style="height:10px;width:40%"></span></div>';
    }
    return out;
  }

  // ── filters as data ────────────────────────────────────────────────────────
  // active = Set of option ids. An item matches when, for EVERY filter group
  // with a selection, it carries at least one selected option (AND across
  // groups, OR within one — the shape people expect facets to have).
  function buildValueMap(L) {
    var m = { video: {}, collection: {} };
    L.values.forEach(function (v) {
      var key = v.video_id ? 'video' : (v.collection_id ? 'collection' : null);
      if (!key) return;
      var id = v.video_id || v.collection_id;
      (m[key][id] = m[key][id] || new Set()).add(v.option_id);
    });
    return m;
  }
  function matchesFilters(L, valueMap, item, active) {
    if (!active.size) return true;
    var byGroup = {};
    active.forEach(function (optId) {
      var opt = L.options.filter(function (o) { return o.id === optId; })[0];
      if (!opt) return;
      (byGroup[opt.filter_id] = byGroup[opt.filter_id] || []).push(optId);
    });
    var have = (valueMap[item.kind] || {})[item.id] || new Set();
    return Object.keys(byGroup).every(function (fid) {
      return byGroup[fid].some(function (optId) { return have.has(optId); });
    });
  }

  // ── server calls ───────────────────────────────────────────────────────────
  async function playbackToken(payload) {
    var r = await fetch('/api/mux/playback-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken() },
      body: JSON.stringify(payload),
    });
    var out;
    try { out = await r.json(); }
    catch (_) { throw new Error('The video server is not reachable right now.'); }
    if (!r.ok) throw new Error(out.error || 'Could not start playback');
    return out;
  }
  async function resourceUrl(resourceId) {
    var r = await fetch('/api/mux/resource-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken() },
      body: JSON.stringify({ resourceId: resourceId }),
    });
    var out;
    try { out = await r.json(); }
    catch (_) { throw new Error('The download server is not reachable right now.'); }
    if (!r.ok) throw new Error(out.error || 'Could not fetch that file');
    return out;
  }
  async function search(q) {
    var r = await db.rpc('library_search', { p_query: q, p_limit: 60 });
    if (r.error) throw r.error;
    return r.data || [];
  }

  // ── saves ──────────────────────────────────────────────────────────────────
  async function mySaves() {
    var r = await db.from('library_saves').select('id, video_id, collection_id');
    if (r.error) return [];
    return r.data || [];
  }
  async function saveVideo(videoId) {
    var r = await db.from('library_saves')
      .insert({ member_id: userId(), video_id: videoId }).select().single();
    if (r.error && !/duplicate/i.test(r.error.message || '')) throw r.error;
    return r.data;
  }
  async function unsaveVideo(videoId) {
    var r = await db.from('library_saves').delete()
      .eq('member_id', userId()).eq('video_id', videoId);
    if (r.error) throw r.error;
  }

  return {
    ADMIN_ONLY: ADMIN_ONLY,
    esc: esc, session: session, accessToken: accessToken, userId: userId,
    gate: gate, liveOr: liveOr, isLiveRow: isLiveRow,
    loadCatalogue: loadCatalogue,
    videoItem: videoItem, collectionItem: collectionItem, categoryItems: categoryItems,
    featured: featured,
    thumbTokens: thumbTokens, muxStill: muxStill, hydrateThumbs: hydrateThumbs,
    fmtDur: fmtDur, fmtRuntime: fmtRuntime,
    cardHTML: cardHTML, skeletonCards: skeletonCards,
    buildValueMap: buildValueMap, matchesFilters: matchesFilters,
    playbackToken: playbackToken, resourceUrl: resourceUrl, search: search,
    mySaves: mySaves, saveVideo: saveVideo, unsaveVideo: unsaveVideo,
  };
})();
