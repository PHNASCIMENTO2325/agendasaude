-- AgendaSaude - esquema do banco de dados (PostgreSQL 13+)
-- Modelo derivado do diagrama de classes (Figura 2 do relatorio).

CREATE TABLE IF NOT EXISTS usuarios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        VARCHAR(120) NOT NULL,
  email       VARCHAR(160) NOT NULL UNIQUE,
  senha_hash  VARCHAR(100) NOT NULL,
  perfil      VARCHAR(15)  NOT NULL CHECK (perfil IN ('PACIENTE', 'PROFISSIONAL', 'ADMINISTRADOR')),
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pacientes (
  usuario_id          UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  cpf                 VARCHAR(11) NOT NULL UNIQUE,
  data_nascimento     DATE,
  telefone            VARCHAR(20),
  consentimento_lgpd  BOOLEAN NOT NULL DEFAULT FALSE,   -- RF01 / RNF04
  consentimento_em    TIMESTAMPTZ,
  politica_versao     VARCHAR(10)
);

CREATE TABLE IF NOT EXISTS profissionais (
  usuario_id        UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  registro_conselho VARCHAR(30) NOT NULL,
  especialidade     VARCHAR(60) NOT NULL
);

CREATE TABLE IF NOT EXISTS administradores (
  usuario_id UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  matricula  VARCHAR(30) NOT NULL
);

CREATE TABLE IF NOT EXISTS unidades_saude (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome     VARCHAR(120) NOT NULL,
  endereco VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS profissional_unidade (
  profissional_id UUID NOT NULL REFERENCES profissionais(usuario_id) ON DELETE CASCADE,
  unidade_id      UUID NOT NULL REFERENCES unidades_saude(id) ON DELETE CASCADE,
  PRIMARY KEY (profissional_id, unidade_id)
);

CREATE TABLE IF NOT EXISTS agendas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_id UUID NOT NULL REFERENCES profissionais(usuario_id) ON DELETE CASCADE,
  unidade_id      UUID NOT NULL REFERENCES unidades_saude(id) ON DELETE CASCADE,
  data            DATE NOT NULL,
  hora_inicio     TIME NOT NULL,
  hora_fim        TIME NOT NULL
);

CREATE TABLE IF NOT EXISTS slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id       UUID NOT NULL REFERENCES agendas(id) ON DELETE CASCADE,
  profissional_id UUID NOT NULL REFERENCES profissionais(usuario_id) ON DELETE CASCADE,
  inicio          TIMESTAMPTZ NOT NULL,
  status          VARCHAR(10) NOT NULL DEFAULT 'LIVRE' CHECK (status IN ('LIVRE', 'OCUPADO', 'BLOQUEADO'))
);
CREATE INDEX IF NOT EXISTS idx_slots_status_inicio ON slots (status, inicio);

CREATE TABLE IF NOT EXISTS consultas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id     UUID NOT NULL REFERENCES pacientes(usuario_id),
  profissional_id UUID NOT NULL REFERENCES profissionais(usuario_id),
  slot_id         UUID NOT NULL REFERENCES slots(id),
  status          VARCHAR(12) NOT NULL DEFAULT 'CONFIRMADA'
                  CHECK (status IN ('PENDENTE', 'CONFIRMADA', 'CANCELADA', 'REALIZADA', 'FALTOU')),
  observacoes     TEXT,
  criada_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Garantia extra para a RN01: um slot so pode ter uma consulta ativa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consulta_ativa_por_slot
  ON consultas (slot_id) WHERE status IN ('PENDENTE', 'CONFIRMADA');
CREATE INDEX IF NOT EXISTS idx_consultas_paciente ON consultas (paciente_id);

CREATE TABLE IF NOT EXISTS notificacoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id UUID NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
  canal       VARCHAR(10) NOT NULL DEFAULT 'EMAIL' CHECK (canal IN ('EMAIL', 'SMS')),
  status      VARCHAR(12) NOT NULL DEFAULT 'ENFILEIRADA',
  enviada_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trilha de auditoria de acessos a dados pessoais (RNF04 / LGPD).
CREATE TABLE IF NOT EXISTS auditoria (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID,
  acao       VARCHAR(40) NOT NULL,
  recurso    VARCHAR(200),
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
