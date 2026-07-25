// ─── FLOW SCHOOL — shared classes client ─────────────────────────────────────
// The publish/save API for community classes. One rule above all others:
// the private library is NEVER sent — callers hand this module an already-
// whitelisted projection (built field by field, never spread), and saves
// are references to the published row, so they read live and hold no copy.
// RLS owns the permissions; these helpers keep the SQL shapes consistent.
// Include after lib/supabase.js.
// ─────────────────────────────────────────────────────────────────────────────

window.fsPublish = (function () {

  async function me() {
    const { data: { user } } = await db.auth.getUser();
    return user ? user.id : null;
  }

  // ── the projection builder ──────────────────────────────────────────────
  // THE WHITELIST, one place for every caller. Each field the public copy
  // may carry is named here and copied by hand — the teaching log,
  // stories, private notes, and internal ids are absent by construction.
  // Section order mirrors lib/class-editor.js (SECTIONS + SLOT_TYPES);
  // those tables change rarely — keep them in step.

  const PROJ_SECTIONS = [
    { key: 'begin',    label: 'Begin' },
    { key: 'warmup',   label: 'Warm Up Flow' },
    { key: 'nohands',  label: 'Bridge Flow' },
    { key: 'peak',     label: 'Peak Flow' },
    { key: 'cooldown', label: 'Cool Down' },
  ];
  const PROJ_SLOTS = { bridge: 'Bridge Flow', nohands: 'No Hands Flow', workshop: 'Workshop' };

  function readLS(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
  }

  // fs-cue-flows, normalized the way its own pages normalize it
  function cueStore() {
    const raw = readLS('fs-cue-flows');
    const list = Array.isArray(raw) ? raw : Object.keys(raw || {}).map(k => raw[k]);
    return list.filter(Boolean).map((e, i) => {
      if (e.id == null) e.id = (Date.parse(e.savedAt) || 0) + i;
      if (e.flowIds == null) e.flowIds = (e.flowId != null ? [e.flowId] : []);
      if (e.flowIds.length > 1) e.flowIds = e.flowIds.slice(0, 1);
      return e;
    });
  }

  function orderedFor(c) {
    const out = [];
    PROJ_SECTIONS.forEach(s => {
      out.push(s);
      if (s.key === 'nohands') {
        ((c && c.extras) || []).forEach(x => {
          out.push({ key: x.key, label: PROJ_SLOTS[x.type] || 'Workshop' });
        });
      }
    });
    return out;
  }

  function buildProjection(c) {
    const flows = readLS('flowschool_flows');
    const sheets = cueStore();
    const sections = orderedFor(c).map(s => {
      const m = c.sectionMeta && c.sectionMeta[s.key];
      const flow = m && m.flowId != null ? flows.find(f => f.id === m.flowId) : null;
      const text = (flow ? flow.text : ((c.sections || {})[s.key] || '')).trim();
      if (!text) return null;
      const out = { label: s.label, text: text, flow_name: flow ? (flow.name || null) : null };
      // a linked flow's cue sheets are teaching content — the words
      // spoken in class — and ride along, row fields copied by hand
      if (flow) {
        const cues = sheets
          .filter(e => (e.flowIds || []).indexOf(flow.id) !== -1)
          .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
          .map(e => ({
            name: e.name || 'Untitled',
            rows: (e.rows || []).map(r => ({
              verb: r.verb || '', body: r.body || '', dir: r.dir || '',
              inex: r.inex || '', pose: r.pose || '',
            })),
          }));
        if (cues.length) out.cues = cues;
      }
      return out;
    }).filter(Boolean);
    const payload = {
      v: 1,
      sections: sections,
      props: (c.props || []).slice(),
      block_count: c.blockCount || null,
    };
    if ((c.playlist || '').trim() || (c.playlistUrl || '').trim()) {
      payload.playlist = { name: (c.playlist || '').trim(), url: (c.playlistUrl || '').trim() };
    }
    if ((c.videoUrl || '').trim()) payload.video = (c.videoUrl || '').trim();
    return {
      title: c.title || 'Untitled Class',
      class_type: (c.classType || '').trim() || null,
      length_minutes: c.length || 60,
      payload: payload,
    };
  }

  // ── keep every shared class current ─────────────────────────────────────
  // A projection can go stale from any room: the class editor, a flow
  // edit, a cue sheet edit, an attach. Rather than trusting each surface
  // to remember, this rebuilds every shared class from the local library
  // and republishes. Debounced; quiet on failure (a background reconcile
  // never toasts).

  let refreshT = null;

  async function doRefresh() {
    refreshT = null;
    try {
      const uid = await me();
      if (!uid) return;
      const shared = readLS('flowschool_classes').filter(c => c && c.shared);
      for (const c of shared) {
        const res = await publish(c.id, buildProjection(c));
        if (res && res.error) console.warn('[publish] refresh failed for class ' + c.id, res.error.message);
      }
    } catch (e) {
      console.warn('[publish] refresh failed', e && e.message);
    }
  }

  // pass true to reconcile immediately (and get a promise back) —
  // pages that are about to show the public copy use this
  function refreshShared(now) {
    clearTimeout(refreshT);
    if (now === true) { refreshT = null; return doRefresh(); }
    refreshT = setTimeout(doRefresh, 800);
  }

  // a dying page fires its pending reconcile right away — the edit
  // must not evaporate with the debounce timer
  window.addEventListener('pagehide', function () {
    if (refreshT) { clearTimeout(refreshT); refreshT = null; doRefresh(); }
  });

  // ── publishing (author side) ────────────────────────────────────────────

  // Create or refresh the projection for one class. `fields` must already
  // be the whitelisted teaching content: { title, class_type,
  // length_minutes, payload }. Re-sharing a previously unshared class
  // flips it back on — savers get it back, references intact.
  async function publish(sourceId, fields) {
    const uid = await me();
    if (!uid) return { error: { message: 'not signed in' } };
    return db.from('public_classes').upsert({
      owner_id: uid,
      source_id: sourceId,
      title: fields.title || 'Untitled Class',
      class_type: fields.class_type || null,
      length_minutes: fields.length_minutes || null,
      payload: fields.payload || {},
      published: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_id,source_id' });
  }

  // Unshare without burning the references: the row stays, hidden, and
  // every saver's library quietly lets it go until it's shared again.
  async function unpublish(sourceId) {
    const uid = await me();
    if (!uid) return { error: { message: 'not signed in' } };
    return db.from('public_classes')
      .update({ published: false, updated_at: new Date().toISOString() })
      .eq('owner_id', uid).eq('source_id', sourceId);
  }

  // The class is gone from the library — the projection goes with it,
  // and the saves cascade away at the database.
  async function remove(sourceId) {
    const uid = await me();
    if (!uid) return { error: { message: 'not signed in' } };
    return db.from('public_classes')
      .delete().eq('owner_id', uid).eq('source_id', sourceId);
  }

  // source_id → { publicId, published } for the signed-in author
  async function myPublished() {
    const map = {};
    const { data } = await db.from('public_classes')
      .select('id, source_id, published');
    (data || []).forEach(function (r) {
      map[r.source_id] = { publicId: r.id, published: r.published };
    });
    return map;
  }

  // ── reading (everyone) ──────────────────────────────────────────────────

  async function get(publicId) {
    const { data, error } = await db.from('community_classes')
      .select('*').eq('id', publicId).maybeSingle();
    return { data: data || null, error };
  }

  async function byOwner(ownerId) {
    const { data, error } = await db.from('community_classes')
      .select('id, title, class_type, length_minutes, payload, updated_at, author_name, author_handle')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false });
    return { data: data || [], error };
  }

  // ── saving (reader side) ────────────────────────────────────────────────

  async function save(publicId) {
    const uid = await me();
    if (!uid) return { error: { message: 'not signed in' } };
    return db.from('class_saves').upsert(
      { user_id: uid, public_class_id: publicId },
      { onConflict: 'user_id,public_class_id' });
  }

  async function unsave(publicId) {
    const uid = await me();
    if (!uid) return { error: { message: 'not signed in' } };
    return db.from('class_saves')
      .delete().eq('user_id', uid).eq('public_class_id', publicId);
  }

  // ids I've saved → Set
  async function mySaves() {
    const { data } = await db.from('class_saves').select('public_class_id');
    return new Set((data || []).map(function (r) { return r.public_class_id; }));
  }

  // my saved classes, read live from the source rows (unshared ones are
  // simply absent — the reference survives, the room is dark)
  async function savedClasses() {
    const { data: refs, error: e1 } = await db.from('class_saves')
      .select('public_class_id, created_at')
      .order('created_at', { ascending: false });
    if (e1) return { data: [], error: e1 };
    const ids = (refs || []).map(function (r) { return r.public_class_id; });
    if (!ids.length) return { data: [], error: null };
    const { data, error } = await db.from('community_classes')
      .select('id, owner_id, title, class_type, length_minutes, payload, created_at, updated_at, author_name, author_handle')
      .in('id', ids);
    if (error) return { data: [], error };
    // keep the save order (newest save first), not the update order
    const byId = {};
    (data || []).forEach(function (r) { byId[r.id] = r; });
    return {
      data: ids.map(function (id) { return byId[id]; }).filter(Boolean),
      error: null,
    };
  }

  return {
    me: me,
    buildProjection: buildProjection, refreshShared: refreshShared,
    publish: publish, unpublish: unpublish, remove: remove, myPublished: myPublished,
    get: get, byOwner: byOwner,
    save: save, unsave: unsave, mySaves: mySaves, savedClasses: savedClasses,
  };
})();
