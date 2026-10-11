// Cria as tabelas e insere dados de demonstracao (usuarios, unidade e horarios dos proximos dias).
// Uso: npm run db:init
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const pool = require('../src/db');

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Tabelas criadas/verificadas.');

  const ja = await pool.query('SELECT count(*)::int AS n FROM usuarios');
  if (ja.rows[0].n > 0) {
    console.log('Banco ja possui dados; seed ignorado.');
    return;
  }

  const hash = (s) => bcrypt.hash(s, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const adm = await client.query(
      "INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ($1,$2,$3,'ADMINISTRADOR') RETURNING id",
      ['Administrador Demo', 'admin@agendasaude.com', await hash('Admin@123')]
    );
    await client.query('INSERT INTO administradores (usuario_id, matricula) VALUES ($1, $2)', [adm.rows[0].id, 'ADM-001']);

    const prof = await client.query(
      "INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ($1,$2,$3,'PROFISSIONAL') RETURNING id",
      ['Dra. Ana Souza', 'dra.ana@agendasaude.com', await hash('Prof@1234')]
    );
    await client.query(
      'INSERT INTO profissionais (usuario_id, registro_conselho, especialidade) VALUES ($1,$2,$3)',
      [prof.rows[0].id, 'CRM-SP 123456', 'Clinica Geral']
    );

    const pac = await client.query(
      "INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ($1,$2,$3,'PACIENTE') RETURNING id",
      ['Paciente Demo', 'paciente@email.com', await hash('Paciente@123')]
    );
    await client.query(
      `INSERT INTO pacientes (usuario_id, cpf, data_nascimento, telefone, consentimento_lgpd, consentimento_em, politica_versao)
       VALUES ($1,'12345678901','1995-05-20','11999990000',TRUE,now(),'1.0')`,
      [pac.rows[0].id]
    );

    const un = await client.query(
      'INSERT INTO unidades_saude (nome, endereco) VALUES ($1,$2) RETURNING id',
      ['UBS Centro', 'Rua Principal, 100']
    );
    await client.query('INSERT INTO profissional_unidade (profissional_id, unidade_id) VALUES ($1,$2)', [prof.rows[0].id, un.rows[0].id]);

    // Agenda de 08:00 a 12:00 (slots de 30 min) para os proximos 5 dias.
    for (let d = 1; d <= 5; d++) {
      const dia = new Date();
      dia.setDate(dia.getDate() + d);
      const dataISO = dia.toISOString().slice(0, 10);
      const ag = await client.query(
        `INSERT INTO agendas (profissional_id, unidade_id, data, hora_inicio, hora_fim)
         VALUES ($1,$2,$3,'08:00','12:00') RETURNING id`,
        [prof.rows[0].id, un.rows[0].id, dataISO]
      );
      for (let min = 8 * 60; min < 12 * 60; min += 30) {
        const inicio = new Date(dia);
        inicio.setHours(Math.floor(min / 60), min % 60, 0, 0);
        await client.query(
          'INSERT INTO slots (agenda_id, profissional_id, inicio) VALUES ($1,$2,$3)',
          [ag.rows[0].id, prof.rows[0].id, inicio.toISOString()]
        );
      }
    }

    await client.query('COMMIT');
    console.log('Dados de demonstracao inseridos:');
    console.log('  admin@agendasaude.com   / Admin@123');
    console.log('  dra.ana@agendasaude.com / Prof@1234');
    console.log('  paciente@email.com      / Paciente@123');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
