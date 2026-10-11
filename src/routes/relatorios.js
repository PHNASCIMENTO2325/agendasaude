const router = require('express').Router();
const pool = require('../db');
const { autenticar, exigirPerfil } = require('../middleware/auth');
const { asyncH, DATA_ISO } = require('../utils');

// GET /relatorios/ocupacao?inicio=&fim= - ocupacao da agenda e consultas por status (RF11)
router.get('/ocupacao', autenticar, exigirPerfil('ADMINISTRADOR'), asyncH(async (req, res) => {
  const hoje = new Date();
  const em30 = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const inicio = req.query.inicio || hoje.toISOString().slice(0, 10);
  const fim = req.query.fim || em30.toISOString().slice(0, 10);

  if (!DATA_ISO.test(inicio) || !DATA_ISO.test(fim)) {
    return res.status(400).json({ erro: 'Use datas no formato AAAA-MM-DD' });
  }

  const slots = await pool.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'OCUPADO')::int AS ocupados
       FROM slots
      WHERE inicio::date BETWEEN $1::date AND $2::date`,
    [inicio, fim]
  );
  const consultas = await pool.query(
    `SELECT c.status, count(*)::int AS quantidade
       FROM consultas c
       JOIN slots s ON s.id = c.slot_id
      WHERE s.inicio::date BETWEEN $1::date AND $2::date
      GROUP BY c.status
      ORDER BY c.status`,
    [inicio, fim]
  );

  const { total, ocupados } = slots.rows[0];
  return res.json({
    periodo: { inicio, fim },
    totalHorarios: total,
    horariosOcupados: ocupados,
    taxaOcupacaoPercentual: total > 0 ? Math.round((ocupados / total) * 1000) / 10 : 0,
    consultasPorStatus: consultas.rows,
  });
}));

module.exports = router;
