/**
 * sync.js — Netlify Function (PostgreSQL / Supabase)
 *
 * POST /.netlify/functions/sync
 *
 * Body: { vessels: [ {principal, vessel, pic, lastApproved, issue, issueType,
 *                      biofuel, biofuelOnboard, issueMonth, resolvedMonth, yearEnd}, ... ] }
 *
 * Merge strategy:
 *   • NEW vessel  (vessel name not in DB)  → INSERT full row
 *   • EXISTING vessel                      → only update fields that have NOT
 *                                            been manually edited
 *     "manually edited" = has at least one audit_log entry for that vessel+field
 *
 * Returns: { inserted, updated, skipped, total }
 */

const { getPool } = require('./db');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/* Fields that can be overwritten by Excel ONLY if not manually edited */
const SYNCABLE_FIELDS = [
  'pic', 'last_approved', 'issue', 'issue_type',
  'biofuel', 'biofuel_onboard', 'issue_month', 'resolved_month', 'year_end',
];

/* camelCase → snake_case map */
const TO_DB = {
  principal:      'principal',
  vessel:         'vessel',
  pic:            'pic',
  lastApproved:   'last_approved',
  issue:          'issue',
  issueType:      'issue_type',
  biofuel:        'biofuel',
  biofuelOnboard: 'biofuel_onboard',
  issueMonth:     'issue_month',
  resolvedMonth:  'resolved_month',
  yearEnd:        'year_end',
};

exports.handler = async function(event) {

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'POST only' }) };
  }

  let incoming;
  try {
    const body = JSON.parse(event.body || '{}');
    incoming = body.vessels;
    if (!Array.isArray(incoming) || !incoming.length) throw new Error('empty');
  } catch {
    return {
      statusCode: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Body must be { vessels: [...] }' }),
    };
  }

  const pool = getPool();
  const client = await pool.connect();
  let inserted = 0, updated = 0, skipped = 0;

  try {
    await client.query('BEGIN');

    /* 1. Fetch all existing vessel names */
    const { rows: existingRows } = await client.query('SELECT vessel FROM vessels');
    const existingSet = new Set(existingRows.map(r => r.vessel));

    /* 2. Fetch all manually-edited vessel+field combinations from audit_log */
    const { rows: auditRows } = await client.query(
      'SELECT DISTINCT vessel, field_changed FROM audit_log'
    );
    /* Build map: vessel → Set of manually-edited field names (snake_case) */
    const manualEdits = {};
    for (const a of auditRows) {
      if (!manualEdits[a.vessel]) manualEdits[a.vessel] = new Set();
      const snakeField = TO_DB[a.field_changed] || a.field_changed;
      manualEdits[a.vessel].add(snakeField);
    }

    for (const row of incoming) {
      const vesselName = (row.vessel || '').trim();
      if (!vesselName) continue;

      if (!existingSet.has(vesselName)) {
        /* ── NEW vessel: INSERT everything ── */
        await client.query(
          `INSERT INTO vessels
             (principal, vessel, pic, last_approved, issue, issue_type,
              biofuel, biofuel_onboard, issue_month, resolved_month, year_end,
              updated_by, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Excel Sync', NOW())`,
          [
            row.principal      || null,
            vesselName,
            row.pic            || null,
            row.lastApproved   || null,
            row.issue          || null,
            row.issueType      || null,
            row.biofuel        || null,
            row.biofuelOnboard || null,
            row.issueMonth     || null,
            row.resolvedMonth  || null,
            row.yearEnd        || null,
          ]
        );
        inserted++;

      } else {
        /* ── EXISTING vessel: only update non-manually-edited fields ── */
        const touched = manualEdits[vesselName] || new Set();
        const setClauses = [];
        const values = [];
        let paramIdx = 1;

        for (const snakeCol of SYNCABLE_FIELDS) {
          if (touched.has(snakeCol)) continue;  // skip — manually edited

          const camelKey = Object.keys(TO_DB).find(k => TO_DB[k] === snakeCol);
          if (!camelKey) continue;

          setClauses.push(`${snakeCol} = $${paramIdx++}`);
          values.push(row[camelKey] ?? null);
        }

        /* always keep principal in sync (not manually editable in UI) */
        if (row.principal) {
          setClauses.push(`principal = $${paramIdx++}`);
          values.push(row.principal);
        }

        if (setClauses.length === 0) {
          skipped++;
          continue;  // everything was manually edited — nothing to update
        }

        setClauses.push(`updated_by = 'Excel Sync'`, `updated_at = NOW()`);
        values.push(vesselName);

        await client.query(
          `UPDATE vessels SET ${setClauses.join(', ')} WHERE vessel = $${paramIdx}`,
          values
        );
        updated++;
      }
    }

    await client.query('COMMIT');
    client.release();

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, inserted, updated, skipped, total: incoming.length }),
    };

  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    console.error('[sync POST]', err);
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Sync failed', detail: err.message }),
    };
  }
};
