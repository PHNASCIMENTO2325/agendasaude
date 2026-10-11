const jwt = require('jsonwebtoken');

// Autenticacao por token JWT (RF02 / RNF03).
function autenticar(req, res, next) {
  const cabecalho = req.headers.authorization || '';
  const [tipo, token] = cabecalho.split(' ');
  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ erro: 'Token de autenticacao ausente' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = { id: payload.sub, perfil: payload.perfil };
    return next();
  } catch (e) {
    return res.status(401).json({ erro: 'Token invalido ou expirado' });
  }
}

// Controle de acesso por perfil (principio do menor privilegio).
const exigirPerfil = (...perfis) => (req, res, next) => {
  if (!req.usuario || !perfis.includes(req.usuario.perfil)) {
    return res.status(403).json({ erro: 'Acesso negado para este perfil' });
  }
  return next();
};

module.exports = { autenticar, exigirPerfil };
