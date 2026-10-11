// Banco exclusivo para testes (nao mistura com os dados de demonstracao).
module.exports = {
  DATABASE_URL:
    process.env.DATABASE_URL_TEST || 'postgres://agenda:agenda123@localhost:5432/agendasaude_test',
};
