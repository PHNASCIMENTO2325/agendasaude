const pool = require('./db');

// Fila de notificacoes (RF09).
// Na arquitetura do relatorio a fila e um Redis consumido por um worker que envia e-mail/SMS.
// Nesta versao minima, o evento e apenas registrado na tabela "notificacoes" (status ENFILEIRADA).
const filaNotificacoes = {
  async add({ consultaId, canal = 'EMAIL' }) {
    try {
      await pool.query(
        'INSERT INTO notificacoes (consulta_id, canal) VALUES ($1, $2)',
        [consultaId, canal]
      );
    } catch (e) {
      // Falha na notificacao nao deve desfazer o agendamento ja confirmado.
      console.error('Falha ao enfileirar notificacao:', e.message);
    }
  },
};

module.exports = filaNotificacoes;
