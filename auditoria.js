const pool = require('./db');

// Registra acessos relevantes a dados pessoais (trilha de auditoria - RNF04 / LGPD).
async function registrarAuditoria(usuarioId, acao, recurso) {
  try {
    await pool.query(
      'INSERT INTO auditoria (usuario_id, acao, recurso) VALUES ($1, $2, $3)',
      [usuarioId || null, acao, recurso || null]
    );
  } catch (e) {
    console.error('Falha ao registrar auditoria:', e.message);
  }
}

module.exports = { registrarAuditoria };
