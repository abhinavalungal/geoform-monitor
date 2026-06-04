/**
 * trends.js — Netlify Function (PostgreSQL / Neon)
 *
 * GET /.netlify/functions/trends
 *
 * Returns issue trend data from vessels table:
 * - Monthly counts of issues raised vs resolved
 * - Weekly breakdown (approximated from month data)
 * - By principal breakdown
 * - Average resolution time
 */

const { getPool } = require('./db');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/* Parse "Mon-YYYY" format → sortable date */
function parseMonthLabel(label) {
  if (!label) return null;
  const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  const parts = label.trim().split('-');
  if (parts.length !== 2) return null;
  const m = months[parts[0].toLowerCase().substring(0,3)];
  const y = parseInt(parts[1]);
  if (m === undefined || isNaN(y)) return null;
  return new Date(y, m, 1);
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'GET only' }) };
  }

  const pool = getPool();

  try {
    /* Fetch all vessels with issue/resolved data */
    const { rows } = await pool.query(`
      SELECT principal, vessel, pic,
             issue, issue_type, issue_month, resolved_month
      FROM vessels
      WHERE issue IS NOT NULL AND issue != ''
      ORDER BY principal, vessel
    `);

    /* ── Monthly raised vs resolved ── */
    const raisedMap  = {};
    const resolvedMap = {};
    const principalMap = {};
    const resolutionTimes = [];

    for (const r of rows) {
      /* Issues raised */
      if (r.issue_month) {
        const key = r.issue_month.trim();
        raisedMap[key] = (raisedMap[key] || 0) + 1;
      }

      /* Issues resolved */
      if (r.resolved_month) {
        const key = r.resolved_month.trim();
        resolvedMap[key] = (resolvedMap[key] || 0) + 1;
      }

      /* Resolution time */
      if (r.issue_month && r.resolved_month) {
        const start = parseMonthLabel(r.issue_month);
        const end   = parseMonthLabel(r.resolved_month);
        if (start && end && end >= start) {
          const months = (end.getFullYear() - start.getFullYear()) * 12
                       + (end.getMonth() - start.getMonth());
          resolutionTimes.push(months);
        }
      }

      /* By principal */
      const p = r.principal || 'Unknown';
      if (!principalMap[p]) principalMap[p] = { raised: 0, resolved: 0, open: 0 };
      principalMap[p].raised++;
      if (r.resolved_month) principalMap[p].resolved++;
      else principalMap[p].open++;
    }

    /* ── Sort months chronologically ── */
    const allMonths = [...new Set([...Object.keys(raisedMap), ...Object.keys(resolvedMap)])]
      .filter(m => parseMonthLabel(m))
      .sort((a, b) => parseMonthLabel(a) - parseMonthLabel(b));

    const monthly = allMonths.map(month => ({
      month,
      raised:   raisedMap[month]   || 0,
      resolved: resolvedMap[month] || 0,
    }));

    /* ── By principal sorted by most raised ── */
    const byPrincipal = Object.entries(principalMap)
      .map(([principal, counts]) => ({ principal, ...counts }))
      .sort((a, b) => b.raised - a.raised);

    /* ── Average resolution time ── */
    const avgResolutionMonths = resolutionTimes.length
      ? (resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length).toFixed(1)
      : null;

    /* ── Summary totals ── */
    const totalRaised   = rows.length;
    const totalResolved = rows.filter(r => r.resolved_month).length;
    const totalOpen     = totalRaised - totalResolved;

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monthly,
        byPrincipal,
        summary: { totalRaised, totalResolved, totalOpen, avgResolutionMonths },
      }),
    };

  } catch (err) {
    console.error('[trends GET]', err);
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'DB read failed', detail: err.message }),
    };
  }
};
