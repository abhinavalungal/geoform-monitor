
const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host:     process.env.DB_HOST,
      user:     process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      port:     parseInt(process.env.DB_PORT || '5432'),
      max:      5,
      ssl:      { rejectUnauthorized: false },
    });
  }
  return pool;
}

module.exports = { getPool };