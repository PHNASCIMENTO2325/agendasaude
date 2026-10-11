const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { DATABASE_URL } = require('./config');

// Recria o esquema do banco de testes antes de toda a suite.
module.exports = async () => {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    await client.query(schema);
  } finally {
    await client.end();
  }
};
