// Casos de teste CT01 a CT07 (Quadro 5 do relatorio) + regras RN02 e rotas auxiliares.
const {
  request, app, pool, limparBanco, criarCenario, criarPaciente, criarAdmin, auth,
} = require('./helpers');

beforeEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await pool.end();
});

describe('Autenticacao e cadastro', () => {
  test('CT07 - cadastro sem consentimento LGPD e bloqueado', async () => {
    const res = await request(app).post('/auth/register').send({
      nome: 'Sem Consentimento',
      email: 'sem@teste.com',
      senha: 'Senha@1234',
      cpf: '12345678901',
      consentimentoLGPD: false,
    });
    expect(res.status).toBe(400);
    const r = await pool.query("SELECT count(*)::int AS n FROM usuarios WHERE email = 'sem@teste.com'");
    expect(r.rows[0].n).toBe(0);
  });

  test('cadastro com consentimento registra data e versao da politica', async () => {
    const p = await criarPaciente('01');
    expect(p.id).toBeDefined();
    const r = await pool.query(
      'SELECT consentimento_lgpd, consentimento_em, politica_versao FROM pacientes WHERE usuario_id = $1',
      [p.id]
    );
    expect(r.rows[0].consentimento_lgpd).toBe(true);
    expect(r.rows[0].consentimento_em).not.toBeNull();
    expect(r.rows[0].politica_versao).toBe('1.0');
  });

  test('login com senha incorreta retorna 401', async () => {
    const p = await criarPaciente('02');
    const res = await request(app).post('/auth/login').send({ email: p.email, senha: 'errada123' });
    expect(res.status).toBe(401);
  });

  test('login valido retorna token JWT', async () => {
    const p = await criarPaciente('03');
    const res = await request(app).post('/auth/login').send({ email: p.email, senha: 'Senha@1234' });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.perfil).toBe('PACIENTE');
  });
});

describe('Agendamento', () => {
  test('CT01 - agenda horario livre: consulta CONFIRMADA e slot OCUPADO (HTTP 201)', async () => {
    const { slotIds } = await criarCenario();
    const p = await criarPaciente('11');
    const res = await request(app).post('/consultas').set(auth(p.token)).send({ slotId: slotIds[0] });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('CONFIRMADA');
    const slot = await pool.query('SELECT status FROM slots WHERE id = $1', [slotIds[0]]);
    expect(slot.rows[0].status).toBe('OCUPADO');
    const notif = await pool.query('SELECT count(*)::int AS n FROM notificacoes WHERE consulta_id = $1', [res.body.consultaId]);
    expect(notif.rows[0].n).toBe(1);
  });

  test('CT02 - requisicoes simultaneas ao mesmo slot: uma retorna 201 e a outra 409', async () => {
    const { slotIds } = await criarCenario();
    const a = await criarPaciente('21');
    const b = await criarPaciente('22');
    const [r1, r2] = await Promise.all([
      request(app).post('/consultas').set(auth(a.token)).send({ slotId: slotIds[0] }),
      request(app).post('/consultas').set(auth(b.token)).send({ slotId: slotIds[0] }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const n = await pool.query(
      "SELECT count(*)::int AS n FROM consultas WHERE slot_id = $1 AND status = 'CONFIRMADA'",
      [slotIds[0]]
    );
    expect(n.rows[0].n).toBe(1);
  });

  test('CT03 - agendamento sem autenticacao retorna 401', async () => {
    const { slotIds } = await criarCenario();
    const res = await request(app).post('/consultas').send({ slotId: slotIds[0] });
    expect(res.status).toBe(401);
  });

  test('horario inexistente retorna 404', async () => {
    const p = await criarPaciente('31');
    const res = await request(app)
      .post('/consultas')
      .set(auth(p.token))
      .send({ slotId: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(404);
  });

  test('RN02 - limite de 2 consultas ativas na mesma especialidade', async () => {
    const { slotIds } = await criarCenario({ horasAFrente: [5, 6, 7] });
    const p = await criarPaciente('41');
    const r1 = await request(app).post('/consultas').set(auth(p.token)).send({ slotId: slotIds[0] });
    const r2 = await request(app).post('/consultas').set(auth(p.token)).send({ slotId: slotIds[1] });
    const r3 = await request(app).post('/consultas').set(auth(p.token)).send({ slotId: slotIds[2] });
    expect([r1.status, r2.status, r3.status]).toEqual([201, 201, 422]);
  });
});

describe('Cancelamento e remarcacao', () => {
  test('CT04 - cancelamento dentro do prazo: CANCELADA e slot volta a LIVRE', async () => {
    const { slotIds } = await criarCenario({ horasAFrente: [5] });
    const p = await criarPaciente('51');
    const ag = await request(app).post('/consultas').set(auth(p.token)).send({ slotId: slotIds[0] });
    const res = await request(app)
      .patch(`/consultas/${ag.body.consultaId}`)
      .set(auth(p.token))
      .send({ acao: 'CANCELAR', motivo: 'Imprevisto' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELADA');
    const slot = await pool.query('SELECT status FROM slots WHERE id = $1', [slotIds[0]]);
    expect(slot.rows[0].status).toBe('LIVRE');
  });

  test('CT05 - cancelamento fora do prazo (menos de 2h) e negado com mensagem', async () => {
    const { slotIds } = await criarCenario({ horasAFrente: [1] });
    const p = await criarPaciente('61');
    const ag = await request(app).post('/consultas').set(auth(p.token)).send({ slotId: slotIds[0] });
    expect(ag.status).toBe(201);
    const res = await request(app)
      .patch(`/consultas/${ag.body.consultaId}`)
      .set(auth(p.token))
      .send({ acao: 'CANCELAR' });
    expect(res.status).toBe(422);
    expect(res.body.erro).toMatch(/antecedencia/i);
    const c = await pool.query('SELECT status FROM consultas WHERE id = $1', [ag.body.consultaId]);
    expect(c.rows[0].status).toBe('CONFIRMADA');
  });

  test('CT06 - acesso a consulta de outro paciente retorna 403 e gera auditoria', async () => {
    const { slotIds } = await criarCenario({ horasAFrente: [5] });
    const dono = await criarPaciente('71');
    const intruso = await criarPaciente('72');
    const ag = await request(app).post('/consultas').set(auth(dono.token)).send({ slotId: slotIds[0] });
    const res = await request(app)
      .patch(`/consultas/${ag.body.consultaId}`)
      .set(auth(intruso.token))
      .send({ acao: 'CANCELAR' });
    expect(res.status).toBe(403);
    const aud = await pool.query("SELECT count(*)::int AS n FROM auditoria WHERE acao = 'ACESSO_NEGADO' AND usuario_id = $1", [intruso.id]);
    expect(aud.rows[0].n).toBe(1);
    const c = await pool.query('SELECT status FROM consultas WHERE id = $1', [ag.body.consultaId]);
    expect(c.rows[0].status).toBe('CONFIRMADA');
  });

  test('remarcacao libera o slot antigo e ocupa o novo', async () => {
    const { slotIds } = await criarCenario({ horasAFrente: [5, 8] });
    const p = await criarPaciente('81');
    const ag = await request(app).post('/consultas').set(auth(p.token)).send({ slotId: slotIds[0] });
    const res = await request(app)
      .patch(`/consultas/${ag.body.consultaId}`)
      .set(auth(p.token))
      .send({ acao: 'REMARCAR', novoSlotId: slotIds[1] });
    expect(res.status).toBe(200);
    const antigo = await pool.query('SELECT status FROM slots WHERE id = $1', [slotIds[0]]);
    const novo = await pool.query('SELECT status FROM slots WHERE id = $1', [slotIds[1]]);
    expect(antigo.rows[0].status).toBe('LIVRE');
    expect(novo.rows[0].status).toBe('OCUPADO');
  });
});

describe('Consultas, horarios e relatorios', () => {
  test('lista apenas horarios livres e filtra por especialidade', async () => {
    const { slotIds } = await criarCenario({ especialidade: 'Cardiologia', horasAFrente: [5, 6] });
    await criarCenario({ especialidade: 'Dermatologia', horasAFrente: [5] });
    const p = await criarPaciente('91');
    await request(app).post('/consultas').set(auth(p.token)).send({ slotId: slotIds[0] });

    const res = await request(app).get('/horarios').query({ especialidade: 'Cardiologia' }).set(auth(p.token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(slotIds[1]);
    expect(res.body[0].especialidade).toBe('Cardiologia');
  });

  test('historico retorna as consultas do paciente autenticado', async () => {
    const { slotIds } = await criarCenario({ horasAFrente: [5] });
    const p = await criarPaciente('92');
    await request(app).post('/consultas').set(auth(p.token)).send({ slotId: slotIds[0] });
    const res = await request(app).get('/pacientes/me/consultas').set(auth(p.token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('CONFIRMADA');
  });

  test('relatorio de ocupacao: administrador 200, paciente 403', async () => {
    const { slotIds } = await criarCenario({ horasAFrente: [5, 6] });
    const p = await criarPaciente('93');
    const adm = await criarAdmin();
    await request(app).post('/consultas').set(auth(p.token)).send({ slotId: slotIds[0] });

    const ok = await request(app).get('/relatorios/ocupacao').set(auth(adm.token));
    expect(ok.status).toBe(200);
    expect(ok.body.totalHorarios).toBe(2);
    expect(ok.body.horariosOcupados).toBe(1);
    expect(ok.body.taxaOcupacaoPercentual).toBe(50);

    const negado = await request(app).get('/relatorios/ocupacao').set(auth(p.token));
    expect(negado.status).toBe(403);
  });
});
