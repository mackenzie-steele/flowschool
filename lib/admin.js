// ─── FLOW SCHOOL — ADMIN CLIENT HELPERS ──────────────────────────────────────
//
// The data layer for admin.html. All reads go through is_admin()-guarded RPCs;
// all privileged writes go through /api/admin/* (service-role, server-verified).
// Nothing here is a security boundary — the server refuses non-admins regardless.
//
// Requires lib/supabase.js (db) loaded first.
// ─────────────────────────────────────────────────────────────────────────────

window.fsAdmin = (function () {
  var TOKEN_KEY = 'sb-zizuopmcpzicbwngjagp-auth-token';

  function accessToken() {
    try { return (JSON.parse(localStorage.getItem(TOKEN_KEY)) || {}).access_token || null; }
    catch (_) { return null; }
  }

  // ── is the current user an admin? (server-truth via RPC) ──
  async function isAdmin() {
    try {
      var r = await db.rpc('is_admin');
      return !!(r && !r.error && r.data === true);
    } catch (_) { return false; }
  }

  // ── read: an is_admin()-guarded RPC ──
  async function rpc(fn, args) {
    var r = await db.rpc(fn, args || {});
    if (r.error) throw r.error;
    return r.data;
  }

  // ── write: a privileged admin action via serverless ──
  async function action(payload) {
    var res = await fetch('/api/admin/user-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken() },
      body: JSON.stringify(payload),
    });
    var data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error(data.error || 'The action could not be completed');
    return data;
  }

  // ── CSV export (Excel + Google Sheets safe) ──
  function csvCell(v) {
    if (v == null) v = '';
    v = String(v);
    // formula-injection guard: neutralize a leading = + - @ tab or CR
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
    if (/[",\n\r]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }
  // columns: [{ label, key } | { label, value: fn(row) }]
  function toCSV(rows, columns, note) {
    var lines = [];
    if (note) lines.push(csvCell(note));
    lines.push(columns.map(function (c) { return csvCell(c.label); }).join(','));
    (rows || []).forEach(function (row) {
      lines.push(columns.map(function (c) {
        return csvCell(typeof c.value === 'function' ? c.value(row) : row[c.key]);
      }).join(','));
    });
    return lines.join('\r\n');
  }
  function download(filename, csv) {
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM → Excel reads UTF-8
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function filename(dataset) {
    var d = new Date();
    var iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return 'flow-school-' + dataset + '-' + iso + '.csv';
  }
  // one call: build + download, with an "Exported at" note row
  function exportCSV(dataset, rows, columns) {
    var note = 'Flow School ' + dataset + ' — exported ' + new Date().toISOString();
    download(filename(dataset), toCSV(rows, columns, note));
  }

  // ── formatters ──
  function fmtDate(v) {
    if (!v) return '—';
    try { return new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (_) { return '—'; }
  }
  function fmtDateTime(v) {
    if (!v) return '—';
    try { return new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
    catch (_) { return '—'; }
  }
  function fmtNum(n) { return (n == null ? 0 : Number(n)).toLocaleString(); }
  function ago(v) {
    if (!v) return 'never';
    var s = (Date.now() - new Date(v).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    var d = Math.floor(s / 86400);
    if (d < 30) return d + 'd ago';
    if (d < 365) return Math.floor(d / 30) + 'mo ago';
    return Math.floor(d / 365) + 'y ago';
  }

  // resend a signup-confirmation email to a stuck (unconfirmed) teacher — the
  // same public resend the login page uses, just triggered by an admin.
  function resendConfirmation(email) {
    return db.auth.resend({ type: 'signup', email: email });
  }

  return {
    isAdmin: isAdmin, rpc: rpc, action: action, resendConfirmation: resendConfirmation,
    toCSV: toCSV, download: download, filename: filename, exportCSV: exportCSV,
    fmtDate: fmtDate, fmtDateTime: fmtDateTime, fmtNum: fmtNum, ago: ago,
  };
})();
