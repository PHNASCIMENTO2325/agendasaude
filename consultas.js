const router = require('express').Router();
const pool = require('../db');
const { autenticar, exigirPerfil } = require('../middleware/auth');
const { registrarAuditoria } = require('../auditoria');
const filaNotificacoes = require('../notificacoes');
const { asyncH, UUID } = require('../utils');

const MAX_CONSULTAS_ATIVAS_POR_ESPECIALIDADE = 2; // RN02
const antecedenciaMinimaHoras = () => Number(process.env.MIN_ANTECEDENCIA_HORAS || 2); // RN03 / RF05

// POST /consultas - cria um agendamento com reserva transacional (RF04, RN01, RN02)
router.post('/', autenticar, exigirPerfil('PACIENTE'), asyncH(async (req, res) => {
  const { slotId } = req.body || {};
  if (!UUID.test(slotId || '')) {
    return res.status(400).json({ erro: 'slotId invalido' });
  }
  const pacienteId = req.usuario.id; // vem do token JWT
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // FOR UPDATE: apenas uma requisicao concorrente consegue reservar o mesmo horario (RN01).
    const slot = await client.query(
      `SELECT s.id, s.status, s.profissional_id, s.inicio, p.especialidade
         FROM slots s
         JOIN profissionais p ON p.usuario_id = s.profissional_id
        WHERE s.id = $1
          FOR UPDATE OF s`,
      [slotId]
    );
    if (slot.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Horario inexistente' });
    }
    const s = slot.rows[0];
    if (s.status !== 'LIVRE' || new Date(s.inicio) <= new Date()) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Horario indisponivel' });
    }

    // RN02: no maximo 2 consultas ativas na mesma especialidade.
    const ativas = await client.query(
      `SELECT count(*)::int AS n
         FROM consultas c
         JOIN profissionais p ON p.usuario_id = c.profissional_id
        WHERE c.paciente_id = $1
          AND p.especialidade = $2
          AND c.status IN ('PENDENTE', 'CONFIRMADA')`,
      [pacienteId, s.especialidade]
    );
    if (ativas.rows[0].n >= MAX_CONSULTAS_ATIVAS_POR_ESPECIALIDADE) {
      await client.query('ROLLBACK');
      return res.status(422).json({ erro: 'Limite de consultas ativas nesta especialidade atingido' });
    }

    await client.query("UPDATE slots SET status = 'OCUPADO' WHERE id = $1", [slotId]);
    const c = await client.query(
      `INSERT INTO consultas (paciente_id, profissional_id, slot_id, status)
       VALUES ($1, $2, $3, 'CONFIRMADA') RETURNING id`,
      [pacienteId, s.profissional_id, slotId]
    );
    await client.query('COMMIT');
    await filaNotificacoes.add({ consultaId: c.rows[0].id }); // lembrete (RF09)
    return res.status(201).json({ consultaId: c.rows[0].id, status: 'CONFIRMADA', inicio: s.inicio });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') {
      return res.status(409).json({ erro: 'Horario indisponivel' });
    }
    console.error(e);
    return res.status(500).json({ erro: 'Falha ao agendar' });
  } finally {
    client.release();
  }
}));

// PATCH /consultas/:id - cancela ou remarca uma consulta (RF05, RN03)
router.patch('/:id', autenticar, exigirPerfil('PACIENTE'), asyncH(async (req, res) => {
  const { id } = req.params;
  const { acao, novoSlotId, motivo } = req.body || {};

  if (!UUID.test(id)) {
    return res.status(400).json({ erro: 'ID de consulta invalido' });
  }
  if (!['CANCELAR', 'REMARCAR'].includes(acao)) {
    return res.status(400).json({ erro: 'Campo "acao" deve ser CANCELAR ou REMARCAR' });
  }
  if (acao === 'REMARCAR' && !UUID.test(novoSlotId || '')) {
    return res.status(400).json({ erro: 'Informe um novoSlotId valido para remarcar' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `SELECT c.id, c.paciente_id, c.status, c.slot_id, s.inicio
         FROM consultas c
         JOIN slots s ON s.id = c.slot_id
        WHERE c.id = $1
          FOR UPDATE OF c`,
      [id]
    );
    if (r.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Consulta nao encontrada' });
    }
    const c = r.rows[0];

    // CT06: um paciente nao pode alterar a consulta de outro; a tentativa e auditada.
    if (c.paciente_id !== req.usuario.id) {
      await client.query('ROLLBACK');
      await registrarAuditoria(req.usuario.id, 'ACESSO_NEGADO', `consulta:${id}`);
      return res.status(403).json({ erro: 'Voce nao tem permissao para alterar esta consulta' });
    }
    if (c.status !== 'CONFIRMADA' && c.status !== 'PENDENTE') {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Esta consulta nao pode mais ser alterada' });
    }

    // CT05: antecedencia minima para cancelar/remarcar.
    const horasRestantes = (new Date(c.inicio) - Date.now()) / 3600000;
    if (horasRestantes < antecedenciaMinimaHoras()) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        erro: `Cancelamento/remarcacao exige antecedencia minima de ${antecedenciaMinimaHoras()} hora(s)`,
      });
    }

    if (acao === 'CANCELAR') {
      await client.query(
        "UPDATE consultas SET status = 'CANCELADA', observacoes = $2 WHERE id = $1",
        [id, motivo || null]
      );
      await client.query("UPDATE slots SET status = 'LIVRE' WHERE id = $1", [c.slot_id]); // libera o horario
      await client.query('COMMIT');
      return res.json({ id, status: 'CANCELADA' });
    }

    // REMARCAR
    const novo = await client.query(
      'SELECT id, status, profissional_id, inicio FROM slots WHERE id = $1 FOR UPDATE',
      [novoSlotId]
    );
    if (novo.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Novo horario inexistente' });
    }
    const n = novo.rows[0];
    if (n.status !== 'LIVRE' || new Date(n.inicio) <= new Date()) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Novo horario indisponivel' });
    }
    await client.query("UPDATE slots SET status = 'LIVRE' WHERE id = $1", [c.slot_id]);
    await client.query("UPDATE slots SET status = 'OCUPADO' WHERE id = $1", [novoSlotId]);
    await client.query(
      "UPDATE consultas SET slot_id = $2, profissional_id = $3, status = 'CONFIRMADA' WHERE id = $1",
      [id, novoSlotId, n.profissional_id]
    );
    await client.query('COMMIT');
    await filaNotificacoes.add({ consultaId: id });
    return res.json({ id, status: 'CONFIRMADA', inicio: n.inicio });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    return res.status(500).json({ erro: 'Falha ao atualizar a consulta' });
  } finally {
    client.release();
  }
}));

module.exports = router;
