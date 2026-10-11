const router = require('express').Router();
const pool = require('../db');
const { autenticar, exigirPerfil } = require('../middleware/auth');
const { registrarAuditoria } = require('../auditoria');
const { asyncH } = require('../utils');

// GET /pacientes/me/consultas - historico e proximas consultas do paciente autenticado (RF06)
router.get('/me/consultas', autenticar, exigirPerfil('PACIENTE'), asyncH(async (req, res) => {
  const r = await pool.query(
    `SELECT c.id, c.status, s.inicio, p.especialidade, u.nome AS profissional, un.nome AS unidade
       FROM consultas c
       JOIN slots s ON s.id = c.slot_id
       JOIN agendas a ON a.id = s.agenda_id
       JOIN unidades_saude un ON un.id = a.unidade_id
       JOIN profissionais p ON p.usuario_id = c.profissional_id
       JOIN usuarios u ON u.id = p.usuario_id
      WHERE c.paciente_id = $1
      ORDER BY s.inicio DESC`,
    [req.usuario.id]
  );
  await registrarAuditoria(req.usuario.id, 'CONSULTA_HISTORICO', `paciente:${req.usuario.id}`);
  return res.json(r.rows);
}));

module.exports = router;
