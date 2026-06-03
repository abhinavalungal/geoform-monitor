/**
 * audit.js — Netlify Function (PostgreSQL / Supabase)
 *
 * GET    /.netlify/functions/audit  → returns last 200 audit log entries
 * DELETE /.netlify/functions/audit  → clears all audit log entries
 * OPTIONS                           → CORS preflight
 */

const { getPool } = require('./db');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async function(event) {

  /* ── CORS preflight ── */
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const pool = getPool();

  /* ════════════════════════════════════════════════════════
     GET — return last 200 audit entries, newest first
  ════════════════════════════════════════════════════════ */
  if (event.httpMethod === 'GET') {
    try {
      const { rows } = await pool.query(
        `SELECT vessel, principal, field_changed AS field,
                old_value AS "oldVal", new_value AS "newVal",
                updated_by AS by, ts
           FROM audit_log
          ORDER BY ts DESC
          LIMIT 200`
      );
      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify(rows),
      };
    } catch (err) {
      console.error('[audit GET]', err);
      return {
        statusCode: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'DB read failed', detail: err.message }),
      };
    }
  }

  /* ════════════════════════════════════════════════════════
     DELETE — clear all audit log entries
  ════════════════════════════════════════════════════════ */
  if (event.httpMethod === 'DELETE') {
    try {
      await pool.query('DELETE FROM audit_log');
      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      };
    } catch (err) {
      console.error('[audit DELETE]', err);
      return {
        statusCode: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'DB delete failed', detail: err.message }),
      };
    }
  }

  /* ── Method not allowed ── */
  return {
    statusCode: 405,
    headers: CORS,
    body: JSON.stringify({ error: 'Method not allowed' }),
  };
};
