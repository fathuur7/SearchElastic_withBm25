const { Pool } = require('pg');

const pgPool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'journal_db2',
  password: 'fathur',
  port: 5432,
});

module.exports = pgPool;
