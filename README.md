# AgendaSaúde

AS EVIDÊNCIAS E PROVAS REAIS DO PROJETO SE ENCONTRAM NA PASTA "EVIDENCIAS"

API REST para **agendamento de consultas em unidades de saúde**.
Projeto da disciplina **Eletiva IV: Projeto Multidisciplinar de Análise e Desenvolvimento de Sistemas** (UNINTER - Escola Superior Politécnica).

- **Aluno:** Pedro Henrique Nascimento Vieira Monte
- **RU:** 5186780

Este repositório contém o back-end mínimo descrito no relatório do projeto (seção 5.2), a documentação Swagger/OpenAPI, os testes automatizados e a coleção de testes do Postman.

## Tecnologias

| Componente | Tecnologia |
|---|---|
| API | Node.js + Express |
| Banco de dados | PostgreSQL 16 (transações ACID) |
| Autenticação | JWT (expira em 30 min) + bcrypt |
| Segurança HTTP | helmet + limite de tentativas (express-rate-limit) |
| Documentação | Swagger UI (OpenAPI 3) em `/docs` |
| Testes | Jest + Supertest, coleção Postman |
| Contêiner | Docker (somente o banco de dados) |
| CI | GitHub Actions |

## Como executar

Pré-requisitos: **Node.js 18+** e **Docker** (ou um PostgreSQL local).

```bash
# 1. Instalar as dependências
npm install

# 2. Subir o PostgreSQL (cria também o banco de testes agendasaude_test)
docker compose up -d

# 3. Configurar as variáveis de ambiente
cp .env.example .env        # no Windows: copy .env.example .env

# 4. Criar as tabelas e os dados de demonstração
npm run db:init

# 5. Iniciar a API
npm start
```

- API: <http://localhost:3000>
- Documentação Swagger: <http://localhost:3000/docs>

### Usuários de demonstração

| Perfil | E-mail | Senha |
|---|---|---|
| Paciente | paciente@email.com | Paciente@123 |
| Profissional | dra.ana@agendasaude.com | Prof@1234 |
| Administrador | admin@agendasaude.com | Admin@123 |

> Senhas apenas para demonstração local. Em produção, troque o `JWT_SECRET` e as credenciais do banco.

## Testes

```bash
npm test
```

A suíte usa o banco `agendasaude_test` (recriado a cada execução) e cobre os casos de teste **CT01 a CT07** do relatório, além das regras RN02, remarcação, filtros de horários, histórico e relatório de ocupação.

Também é possível importar `postman/AgendaSaude.postman_collection.json` no Postman e executar a coleção (Collection Runner) com a API rodando e o banco populado por `npm run db:init`.

## Endpoints

| Método | Rota | Descrição | Perfil |
|---|---|---|---|
| POST | `/auth/register` | Cadastro de paciente (exige consentimento LGPD) | público |
| POST | `/auth/login` | Autentica e retorna o token JWT | público |
| GET | `/horarios?especialidade=&unidade=&data=` | Lista horários livres | autenticado |
| POST | `/consultas` | Cria um agendamento (reserva transacional) | paciente |
| PATCH | `/consultas/{id}` | Cancela ou remarca uma consulta | paciente |
| GET | `/pacientes/me/consultas` | Histórico do paciente autenticado | paciente |
| GET | `/relatorios/ocupacao` | Relatório de ocupação da agenda | administrador |

Detalhes de parâmetros e respostas em `docs/swagger.yaml` (ou em `/docs`).

## Relação com o relatório do projeto

| Item do relatório | Onde está no código |
|---|---|
| RF01 - cadastro com consentimento LGPD | `src/routes/auth.js` (`/auth/register`) |
| RF02 - autenticação com perfis | `src/routes/auth.js`, `src/middleware/auth.js` |
| RF03 - busca de horários | `src/routes/horarios.js` |
| RF04 - agendar consulta | `src/routes/consultas.js` (`POST /consultas`) |
| RF05 - cancelar/remarcar com antecedência | `src/routes/consultas.js` (`PATCH /consultas/:id`) |
| RF06 - histórico | `src/routes/pacientes.js` |
| RF09 - lembrete (enfileirado) | `src/notificacoes.js` |
| RF11 - relatório de ocupação | `src/routes/relatorios.js` |
| RN01 - um slot, uma consulta ativa | `FOR UPDATE` em `consultas.js` + índice único em `db/schema.sql` |
| RN02 - máx. 2 consultas ativas por especialidade | `src/routes/consultas.js` |
| RN03 - antecedência mínima para cancelar | `MIN_ANTECEDENCIA_HORAS` (padrão 2 h) |
| RNF03 - segurança | bcrypt, JWT 30 min, helmet, rate limit, consultas parametrizadas |
| RNF04 - LGPD | consentimento registrado, trilha de auditoria (`auditoria`) |
| Diagrama de classes | `db/schema.sql` |
| CT01 a CT07 | `tests/agendamento.test.js` |

### Escopo desta versão

Conforme o relatório, esta é uma versão de **código mínimo**. Ficam fora dela: gestão de agenda pelo profissional (RF07), registro de atendimento (RF08), gestão de usuários e unidades (RF10) e o front-end React. A fila de notificações é registrada na tabela `notificacoes`; na arquitetura completa seria uma fila Redis consumida por um worker de envio de e-mail/SMS.

## Estrutura

```
agendasaude/
├── db/                  schema.sql (tabelas) e script do banco de testes
├── docs/swagger.yaml    documentação OpenAPI
├── postman/             coleção de testes do Postman
├── scripts/init-db.js   cria tabelas e dados de demonstração
├── src/                 código da API (rotas, middleware, app, server)
├── tests/               testes automatizados (Jest + Supertest)
├── .github/workflows/   integração contínua (GitHub Actions)
└── docker-compose.yml   PostgreSQL para desenvolvimento
```

## Referências

- SOMMERVILLE, I. **Engenharia de software**. 10. ed. São Paulo: Pearson, 2018.
- PRESSMAN, R. S.; MAXIM, B. R. **Engenharia de software**: uma abordagem profissional. 9. ed. Porto Alegre: AMGH, 2021.
- BRASIL. **Lei nº 13.709, de 14 de agosto de 2018** (LGPD).
- W3C. **Web Content Accessibility Guidelines (WCAG) 2.1**. 2018.
