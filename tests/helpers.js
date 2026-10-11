const request = require('supertest');
const bcrypt = require('bcrypt');
const pool = require('../src/db');
const app = require('../src/app');

const HORA = 3600 * 1000;

async function limparBanco() {
  await pool.query(
    `TRUNCATE auditoria, notificacoes, consultas, slots, agendas, profissional_unidade,
              administradores, profissionais, pacientes, unidades_saude, usuarios CASCADE`
  );
}

// Cria unidade, profissional, agenda e slots que comecam daqui a N horas.
async function criarCenario({ especialidade = 'Clinica Geral', horasAFrente = [5, 6, 7] } = {}) {
  const un = await pool.query(
    "INSERT INTO unidades_saude (nome, endereco) VALUES ('UBS Teste', 'Rua Teste, 1') RETURNING id"
  );
  const email = `prof${Date.now()}${Math.floor(Math.random() * 1e6)}@teste.com`;
  const u = await pool.query(
    "INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ('Dr. Teste', $1, 'x', 'PROFISSIONAL') RETURNING id",
    [email]
  );
  const profissionalId = u.rows[0].id;
  await pool.query(
    'INSERT INTO profissionais (usuario_id, registro_conselho, especialidade) VALUES ($1, $2, $3)',
    [profissionalId, 'CRM-TESTE', especialidade]
  );
  await pool.query('INSERT INTO profissional_unidade VALUES ($1, $2)', [profissionalId, un.rows[0].id]);
  const ag = await pool.query(
    `INSERT INTO agendas (profissional_id, unidade_id, data, hora_inicio, hora_fim)
     VALUES ($1, $2, current_date, '00:00', '23:59') RETURNING id`,
    [profissionalId, un.rows[0].id]
  );
  const slotIds = [];
  for (const h of horasAFrente) {
    const s = await pool.query(
      'INSERT INTO slots (agenda_id, profissional_id, inicio) VALUES ($1, $2, $3) RETURNING id',
      [ag.rows[0].id, profissionalId, new Date(Date.now() + h * HORA).toISOString()]
    );
    slotIds.push(s.rows[0].id);
  }
  return { unidadeId: un.rows[0].id, profissionalId, agendaId: ag.rows[0].id, slotIds };
}

// Cadastra um paciente pela API e faz login.
async function criarPaciente(sufixo) {
  const email = `paciente${sufixo}@teste.com`;
  const cpf = String(10000000000 + Number(sufixo)).slice(0, 11);
  const reg = await request(app).post('/auth/register').send({
    nome: `Paciente ${sufixo}`,
    email,
    senha: 'Senha@1234',
    cpf,
    consentimentoLGPD: true,
  });
  const login = await request(app).post('/auth/login').send({ email, senha: 'Senha@1234' });
  return { id: reg.body.id, token: login.body.token, email };
}

async function criarAdmin() {
  const hash = await bcrypt.hash('Admin@1234', 10);
  const u = await pool.query(
    "INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ('Admin Teste', 'admin@teste.com', $1, 'ADMINISTRADOR') RETURNING id",
    [hash]
  );
  await pool.query("INSERT INTO administradores (usuario_id, matricula) VALUES ($1, 'ADM-T')", [u.rows[0].id]);
  const login = await request(app).post('/auth/login').send({ email: 'admin@teste.com', senha: 'Admin@1234' });
  return { id: u.rows[0].id, token: login.body.token };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = { request, app, pool, limparBanco, criarCenario, criarPaciente, criarAdmin, auth };
