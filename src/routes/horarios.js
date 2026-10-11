const router = require('express').Router();
const pool = require('../db');
const { autenticar } = require('../middleware/auth');
const { asyncH, UUID, DATA_ISO } = require('../utils');

// GET /horarios?especialidade=&unidade=&data= - lista horarios livres (RF03)
router.get('/', autenticar, asyncH(async (req, res) => {
  const { especialidade, unidade, data } = req.query;

  if (unidade && !UUID.test(unidade)) {
    return res.status(400).json({ erro: 'Parametro "unidade" invalido' });
  }
  if (data && !DATA_ISO.test(data)) {
    return res.status(400).json({ erro: 'Parametro "data" deve estar no formato AAAA-MM-DD' });
  }

  const r = await pool.query(
    `SELECT s.id, s.inicio, p.especialidade, u.nome AS profissional, un.id AS unidade_id, un.nome AS unidade
       FROM slots s
       JOIN agendas a ON a.id = s.agenda_id
       JOIN profissionais p ON p.usuario_id = s.profissional_id
       JOIN usuarios u ON u.id = p.usuario_id
       JOIN unidades_saude un ON un.id = a.unidade_id
      WHERE s.status = 'LIVRE'
        AND s.inicio > now()
        AND ($1::text IS NULL OR p.especialidade ILIKE $1::text)
        AND ($2::uuid IS NULL OR a.unidade_id = $2::uuid)
        AND ($3::date IS NULL OR s.inicio::date = $3::date)
      ORDER BY s.inicio
      LIMIT 100`,
    [especialidade || null, unidade || null, data || null]
  );
  return res.json(r.rows);
}));

module.exports = router;
