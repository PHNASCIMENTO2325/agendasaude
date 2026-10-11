require('dotenv').config();

if (!process.env.JWT_SECRET || !process.env.DATABASE_URL) {
  console.error('Defina DATABASE_URL e JWT_SECRET no arquivo .env (veja .env.example).');
  process.exit(1);
}

const app = require('./app');
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`AgendaSaude rodando em http://localhost:${port}`);
  console.log(`Documentacao Swagger em http://localhost:${port}/docs`);
});
