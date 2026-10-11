const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { asyncH } = require('../utils');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POLITICA_VERSAO = '1.0';

// POST /auth/register - cadastro de paciente com consentimento LGPD (RF01, CT07)
router.post('/register', asyncH(async (req, res) => {
  const { nome, email, senha, cpf, dataNascimento, telefone, consentimentoLGPD } = req.body || {};

  if (consentimentoLGPD !== true) {
    return res.status(400).json({ erro: 'E necessario aceitar a Politica de Privacidade (LGPD) para se cadastrar' });
  }
  if (!nome || !EMAIL.test(email || '') || typeof senha !== 'string' || senha.length < 8) {
    return res.status(400).json({ erro: 'Dados invalidos: informe nome, e-mail valido e senha com ao menos 8 caracteres' });
  }
  const cpfLimpo = String(cpf || '').replace(/\D/g, '');
  if (cpfLimpo.length !== 11) {
    return res.status(400).json({ erro: 'CPF invalido' });
  }

  const hash = await bcrypt.hash(senha, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query(
      "INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ($1, $2, $3, 'PACIENTE') RETURNING id",
      [nome, email.toLowerCase(), hash]
    );
    await client.query(
      `INSERT INTO pacientes (usuario_id, cpf, data_nascimento, telefone, consentimento_lgpd, consentimento_em, politica_versao)
       VALUES ($1, $2, $3, $4, TRUE, now(), $5)`,
      [u.rows[0].id, cpfLimpo, dataNascimento || null, telefone || null, POLITICA_VERSAO]
    );
    await client.query('COMMIT');
    return res.status(201).json({ id: u.rows[0].id });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') {
      return res.status(409).json({ erro: 'E-mail ou CPF ja cadastrado' });
    }
    throw e;
  } finally {
    client.release();
  }
}));

// POST /auth/login - autentica e retorna token JWT com expiracao de 30 minutos (RF02, RNF03)
router.post('/login', asyncH(async (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) {
    return res.status(400).json({ erro: 'Informe e-mail e senha' });
  }
  const r = await pool.query(
    'SELECT id, senha_hash, perfil FROM usuarios WHERE email = $1',
    [String(email).toLowerCase()]
  );
  const ok = r.rowCount > 0 && await bcrypt.compare(String(senha), r.rows[0].senha_hash);
  if (!ok) {
    return res.status(401).json({ erro: 'Credenciais invalidas' });
  }
  const { id, perfil } = r.rows[0];
  const token = jwt.sign({ perfil }, process.env.JWT_SECRET, { subject: id, expiresIn: '30m' });
  return res.json({ token, tipo: 'Bearer', expiraEmSegundos: 1800, perfil });
}));

module.exports = router;
