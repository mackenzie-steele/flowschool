// ─── FLOW SCHOOL — community graph client ────────────────────────────────────
// Follows (My Circle), blocks, and reports — one place for the calls that
// circle.html and teacher.html share. RLS owns the rules (own rows only,
// no public graph, no counts anywhere); these helpers just keep the SQL
// shapes consistent. Include after lib/supabase.js.
// ─────────────────────────────────────────────────────────────────────────────

window.fsCommunity = (function () {

  async function me() {
    const { data: { user } } = await db.auth.getUser();
    return user ? user.id : null;
  }

  // ids I follow → Set
  async function myFollows() {
    const { data } = await db.from('follows').select('followed_id');
    return new Set((data || []).map(r => r.followed_id));
  }

  // ids I've blocked → Set
  async function myBlocks() {
    const { data } = await db.from('blocks').select('blocked_id');
    return new Set((data || []).map(r => r.blocked_id));
  }

  async function follow(id) {
    const uid = await me();
    if (!uid || uid === id) return { error: { message: 'not allowed' } };
    // upsert on the composite key: a double-tap can't create duplicates
    return db.from('follows').upsert(
      { follower_id: uid, followed_id: id },
      { onConflict: 'follower_id,followed_id' });
  }

  async function unfollow(id) {
    const uid = await me();
    if (!uid) return { error: { message: 'not signed in' } };
    return db.from('follows').delete().eq('follower_id', uid).eq('followed_id', id);
  }

  async function block(id) {
    const uid = await me();
    if (!uid || uid === id) return { error: { message: 'not allowed' } };
    const res = await db.from('blocks').upsert(
      { blocker_id: uid, blocked_id: id },
      { onConflict: 'blocker_id,blocked_id' });
    if (!res.error) await unfollow(id); // blocking ends the relationship
    return res;
  }

  async function unblock(id) {
    const uid = await me();
    if (!uid) return { error: { message: 'not signed in' } };
    return db.from('blocks').delete().eq('blocker_id', uid).eq('blocked_id', id);
  }

  async function report(subjectId, reason, note) {
    const uid = await me();
    if (!uid) return { error: { message: 'not signed in' } };
    return db.from('reports').insert({
      reporter_id: uid,
      subject_kind: 'profile',
      subject_id: subjectId,
      reason: reason,
      note: note || null,
    });
  }

  return { me, myFollows, myBlocks, follow, unfollow, block, unblock, report };
})();
