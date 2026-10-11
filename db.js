require('dotenv').config();
const { Pool } = require('pg');

// Pool de conexoes com o PostgreSQL (consultas parametrizadas evitam injecao de SQL - RNF03).
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = pool;
