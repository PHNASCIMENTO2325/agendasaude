require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');

const app = express();

// Documentacao Swagger/OpenAPI em /docs (montada antes do helmet por causa do CSP do Swagger UI).
const spec = yaml.load(fs.readFileSync(path.join(__dirname, '..', 'docs', 'swagger.yaml'), 'utf8'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));

app.use(helmet()); // cabecalhos de seguranca HTTP (RNF03)
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Limite de tentativas nas rotas de autenticacao (protecao contra forca bruta).
const limiteAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 50,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/auth', limiteAuth, require('./routes/auth'));
app.use('/horarios', require('./routes/horarios'));
app.use('/consultas', require('./routes/consultas'));
app.use('/pacientes', require('./routes/pacientes'));
app.use('/relatorios', require('./routes/relatorios'));

app.use((req, res) => res.status(404).json({ erro: 'Rota nao encontrada' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON invalido' });
  }
  console.error(err);
  return res.status(500).json({ erro: 'Erro interno do servidor' });
});

module.exports = app;
