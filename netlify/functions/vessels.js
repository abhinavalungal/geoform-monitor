/**
 * vessels.js — Netlify Function (PostgreSQL / Supabase)
 *
 * GET   /.netlify/functions/vessels  → returns all vessel rows from DB
 * PATCH /.netlify/functions/vessels  → updates one field on one vessel
 * OPTIONS                            → CORS preflight
 */

const { getPool } = require('./db');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/* ─── field name map: JS camelCase → DB snake_case ─────── */
const FIELD_MAP = {
  lastApproved:   'last_approved',
  pic:            'pic',
  issue:          'issue',
  issueType:      'issue_type',
  biofuel:        'biofuel',
  biofuelOnboard: 'biofuel_onboard',
  issueMonth:     'issue_month',
  resolvedMonth:  'resolved_month',
  yearEnd:        'year_end',
};

/* ─── DB row → JS object (camelCase for the frontend) ───── */
function rowToJS(r) {
  return {
    id:             r.id,
    principal:      r.principal       || null,
    vessel:         r.vessel          || null,
    pic:            r.pic             || null,
    lastApproved:   r.last_approved   || null,
    issue:          r.issue           || null,
    issueType:      r.issue_type      || null,
    biofuel:        r.biofuel         || null,
    biofuelOnboard: r.biofuel_onboard || null,
    issueMonth:     r.issue_month     || null,
    resolvedMonth:  r.resolved_month  || null,
    yearEnd:        r.year_end        || null,
    updatedBy:      r.updated_by      || null,
    updatedAt:      r.updated_at      || null,
  };
}

exports.handler = async function(event) {

  /* ── CORS preflight ── */
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const pool = getPool();

  /* ════════════════════════════════════════════════════════
     GET — return every vessel row
  ════════════════════════════════════════════════════════ */
  if (event.httpMethod === 'GET') {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM vessels ORDER BY principal, vessel'
      );
      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify(rows.map(rowToJS)),
      };
    } catch (err) {
      console.error('[vessels GET]', err);
      return {
        statusCode: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'DB read failed', detail: err.message }),
      };
    }
  }

  /* ════════════════════════════════════════════════════════
     PATCH — update one field on one vessel + write audit log
     Body: { vessel, principal, field, oldVal, newVal, by }
  ════════════════════════════════════════════════════════ */
  if (event.httpMethod === 'PATCH') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid JSON body' }),
      };
    }

    const { vessel, principal, field, oldVal, newVal, by } = body;

    if (!vessel || !field) {
      return {
        statusCode: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'vessel and field are required' }),
      };
    }

    const dbCol = FIELD_MAP[field];
    if (!dbCol) {
      return {
        statusCode: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Unknown field: ${field}` }),
      };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      /* 1. Upsert vessel row — INSERT if new, UPDATE field if exists */
      await client.query(
        `INSERT INTO vessels (principal, vessel, ${dbCol}, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (vessel) DO UPDATE
           SET ${dbCol}     = EXCLUDED.${dbCol},
               updated_by   = EXCLUDED.updated_by,
               updated_at   = NOW()`,
        [principal || null, vessel, newVal ?? null, by || 'Unknown']
      );

      /* 2. Write audit log */
      await client.query(
        `INSERT INTO audit_log
           (vessel, principal, field_changed, old_value, new_value, updated_by, ts)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          vessel,
          principal || null,
          field,
          oldVal  ?? null,
          newVal  ?? null,
          by || 'Unknown',
        ]
      );

      await client.query('COMMIT');
      client.release();

      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      };

    } catch (err) {
      await client.query('ROLLBACK');
      client.release();
      console.error('[vessels PATCH]', err);
      return {
        statusCode: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'DB write failed', detail: err.message }),
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
