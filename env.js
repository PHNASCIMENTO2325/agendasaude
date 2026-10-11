const { DATABASE_URL } = require('./config');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = DATABASE_URL;
process.env.JWT_SECRET = 'segredo-somente-para-testes';
process.env.MIN_ANTECEDENCIA_HORAS = '2';
