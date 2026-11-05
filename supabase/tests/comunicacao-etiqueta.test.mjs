import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { como, criarUsuario, iniciarBanco, migrationsNovas, SERVICE_ROLE } from './lib/banco.mjs';

let banco;
let db;
let c1;
const usuarios = {};
const falha = (promessa) => promessa.then(() => null, (erro) => erro);

async function inserirPedido(solicitante, empresa, cliente) {
  return (await como(c1, solicitante, `
    insert into public.solicitacoes_reverso
      (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo)
    values ($1, current_date, 'Nome digitado ignorado', 'Comercial', 9901, $2, 'Rua de teste, 1', 'Outros')
    returning *`, [empresa, cliente])).rows[0];
}

async function aprovar(pedido) {
  return como(c1, usuarios.aprovador, 'select * from public.aprovar_reversa($1, $2, null)', [pedido.id, pedido.aprovacao_versao]);
}

async function registrarEmissao(pedido, { pdf = null, rastreio = null, sequencia = 1 } = {}) {
  return (await db.query(`
    insert into public.reversa_emissoes
      (solicitacao_id, sequencia, origem, codigo_autorizacao, codigo_rastreio, pdf_path, pdf_nome, emitida_em, valida_ate)
    values ($1, $2, 'sistema', 'AUT-12345', $3, $4, 'etiqueta.pdf', date '2026-10-20', date '2026-11-20')
    returning *`, [pedido.id, sequencia, rastreio, pdf ? `${pedido.id}/${sequencia}.pdf` : null])).rows[0];
}

async function limparPendencias() {
  await db.query(`update public.reversa_comunicacoes_etiqueta
    set status = 'acao_conector_concluida', aceito_pelo_fluxo_em = now(), lock_token = null, lock_expira_em = null
    where status in ('pendente', 'falhou')`);
}

async function concluirEventosSemEtiqueta(solicitacaoId) {
  await db.query(`update public.reversa_comunicacoes_etiqueta
    set status = 'acao_conector_concluida', aceito_pelo_fluxo_em = now()
    where solicitacao_id = $1 and evento <> 'etiqueta_disponivel'
      and status in ('pendente', 'falhou')`, [solicitacaoId]);
}

async function reservar() {
  return (await como(c1, SERVICE_ROLE, 'select public.reversa_claim_comunicacao_etiqueta() as reserva')).rows[0].reserva;
}

async function reservarEmail() {
  return (await como(c1, SERVICE_ROLE, 'select public.reversa_claim_comunicacao_email() as reserva')).rows[0].reserva;
}

async function iniciar(reserva) {
  return (await como(c1, SERVICE_ROLE, 'select public.reversa_iniciar_comunicacao_etiqueta($1, $2) as dados', [
    reserva.comunicacao_id, reserva.lock_token,
  ])).rows[0].dados;
}

async function finalizar(reserva, resultado, statusHttp = null) {
  return (await como(c1, SERVICE_ROLE,
    'select public.reversa_finalizar_comunicacao_etiqueta_v2($1, $2, $3, $4, $5) as finalizada', [
      reserva.comunicacao_id, reserva.lock_token, resultado, statusHttp,
      resultado === 'acao_conector_concluida' ? null : 'Falha simulada no canal.',
    ])).rows[0].finalizada;
}

before(async () => {
  banco = await iniciarBanco();
  db = banco.dono;
  for (const migration of migrationsNovas()) await banco.aplicar(migration);
  c1 = await banco.conectar();

  Object.assign(usuarios, {
    admin: await criarUsuario(db, 'Admin comunicação', ['usuarios']),
    solicitanteA: await criarUsuario(db, 'Solicitante comunicação A', ['formulario-alinare']),
    aprovador: await criarUsuario(db, 'Aprovador comunicação', ['aprovar-alinare']),
    aprovador2: await criarUsuario(db, 'Segundo aprovador comunicação', ['aprovar-alinare']),
    aprovadorFinanceiro: await criarUsuario(db, 'Aprovador financeiro comunicação', ['aprovar-alinare']),
    aprovadorNovitah: await criarUsuario(db, 'Aprovador Novitah comunicação', ['aprovar-novitah']),
    operador: await criarUsuario(db, 'Operador comunicação', ['emitir-alinare']),
    operadorNovitah: await criarUsuario(db, 'Operador Novitah comunicação', ['emitir-novitah']),
    confirmador: await criarUsuario(db, 'Confirmador comunicação', ['confirmar-alinare']),
    solicitanteNovitah: await criarUsuario(db, 'Solicitante Novitah comunicação', ['formulario-novitah']),
  });
  await como(c1, usuarios.admin, 'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)', [
    'Alinare', JSON.stringify([
      { usuario_id: usuarios.aprovador.id, todos_setores: false, setores: ['Comercial'] },
      { usuario_id: usuarios.aprovador2.id, todos_setores: false, setores: ['Comercial'] },
      { usuario_id: usuarios.aprovadorFinanceiro.id, todos_setores: false, setores: ['Financeiro'] },
    ]),
  ]);
  await como(c1, usuarios.admin, 'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)', [
    'Novitah', JSON.stringify([{ usuario_id: usuarios.aprovadorNovitah.id, todos_setores: false, setores: ['Comercial'] }]),
  ]);
}, { timeout: 300_000 });

after(async () => {
  await banco?.encerrar();
});

describe('fila privada de comunicação da etiqueta', () => {
  it('o claim SMTP reserva e finaliza email sem tocar nas pendências Teams', async () => {
    await limparPendencias();
    const pedido = await inserirPedido(usuarios.solicitanteA, 'Alinare', 'Reserva SMTP isolada');
    const teamsAntes = (await db.query(`select id, status from public.reversa_comunicacoes_etiqueta
      where solicitacao_id = $1 and canal = 'teams' order by id`, [pedido.id])).rows;
    assert.ok(teamsAntes.length > 0);

    const reserva = await reservarEmail();
    const email = (await db.query('select canal, status from public.reversa_comunicacoes_etiqueta where id = $1', [reserva.comunicacao_id])).rows[0];
    assert.deepEqual(email, { canal: 'email', status: 'processando' });
    assert.deepEqual((await db.query(`select id, status from public.reversa_comunicacoes_etiqueta
      where solicitacao_id = $1 and canal = 'teams' order by id`, [pedido.id])).rows, teamsAntes);

    const dados = await iniciar(reserva);
    assert.equal(dados.canal, 'email');
    assert.equal((await como(c1, SERVICE_ROLE,
      'select public.reversa_marcar_tentativa_comunicacao_smtp($1, $2) as ok',
      [dados.comunicacao_id, dados.lock_token])).rows[0].ok, true);
    assert.equal((await como(c1, SERVICE_ROLE,
      'select public.reversa_finalizar_comunicacao_email($1, $2, $3, $4, $5) as ok',
      [dados.comunicacao_id, dados.lock_token, 'smtp_aceito', 250, 'smtp_aceitou_mensagem_nao_confirma_entrega'])).rows[0].ok, true);

    const finalizada = (await db.query('select status, smtp_aceito_em, aceito_pelo_fluxo_em from public.reversa_comunicacoes_etiqueta where id = $1', [dados.comunicacao_id])).rows[0];
    assert.equal(finalizada.status, 'smtp_aceito');
    assert.ok(finalizada.smtp_aceito_em);
    assert.equal(finalizada.aceito_pelo_fluxo_em, null);
    const tentativa = (await db.query(`select transporte, resultado, http_status, codigo_smtp
      from public.reversa_comunicacoes_etiqueta_tentativas where lock_token = $1`, [dados.lock_token])).rows[0];
    assert.deepEqual(tentativa, { transporte: 'smtp', resultado: 'smtp_aceito', http_status: null, codigo_smtp: 250 });
    assert.deepEqual((await db.query(`select id, status from public.reversa_comunicacoes_etiqueta
      where solicitacao_id = $1 and canal = 'teams' order by id`, [pedido.id])).rows, teamsAntes);
    // Limpeza da fixture após verificar que o claim SMTP deixou Teams intacto.
    await db.query(`update public.reversa_comunicacoes_etiqueta set status = 'evento_obsoleto'
      where solicitacao_id = $1 and canal = 'teams'`, [pedido.id]);
  });

  it('deriva destinatários de empresa/setor e deduplica a mesma ocorrência', async () => {
    const pedido = await inserirPedido(usuarios.solicitanteA, 'Alinare', 'Destinatários por setor');
    const filas = (await db.query(`select evento, canal, destinatario_id, ocorrencia_id
      from public.reversa_comunicacoes_etiqueta where solicitacao_id = $1 order by evento, destinatario_id`, [pedido.id])).rows;
    assert.deepEqual(filas.filter((item) => item.evento === 'pedido_criado').map((item) => [item.canal, item.destinatario_id]), [
      ['email', usuarios.solicitanteA.id],
    ]);
    assert.deepEqual(filas.filter((item) => item.evento === 'aprovacao_pendente').map((item) => item.destinatario_id).sort(),
      [usuarios.aprovador.id, usuarios.aprovador2.id].sort());
    assert.ok(!filas.some((item) => item.destinatario_id === usuarios.aprovadorFinanceiro.id || item.destinatario_id === usuarios.aprovadorNovitah.id));

    const aprovacaoInicial = filas.find((item) => item.evento === 'aprovacao_pendente');
    await db.query(`select public.reversa_enfileirar_comunicacao($1, $2, $3, $4, $5, null, '{}'::jsonb)`, [
      pedido.id, 'aprovacao_pendente', aprovacaoInicial.ocorrencia_id, aprovacaoInicial.destinatario_id, 'teams',
    ]);
    assert.equal((await db.query(`select count(*)::int as n from public.reversa_comunicacoes_etiqueta
      where solicitacao_id = $1 and evento = 'aprovacao_pendente'`, [pedido.id])).rows[0].n, 2,
    'repetir o enfileiramento para o mesmo evento/destinatário/canal não duplica');

    await aprovar(pedido);
    const depois = (await db.query(`select evento, canal, destinatario_id, contexto
      from public.reversa_comunicacoes_etiqueta where solicitacao_id = $1`, [pedido.id])).rows;
    assert.ok(depois.some((item) => item.evento === 'pedido_aprovado' && item.canal === 'email' && item.destinatario_id === usuarios.solicitanteA.id));
    assert.ok(depois.some((item) => item.evento === 'emissao_pendente' && item.canal === 'teams' && item.destinatario_id === usuarios.operador.id));
    assert.ok(!depois.some((item) => item.evento === 'emissao_pendente' && item.destinatario_id === usuarios.operadorNovitah.id));

    await db.query(`update public.reversa_comunicacoes_etiqueta set status = 'acao_conector_concluida'
      where solicitacao_id = $1 and evento <> 'aprovacao_pendente' and status = 'pendente'`, [pedido.id]);
    for (let i = 0; i < 2; i += 1) {
      const reserva = await reservar();
      assert.ok(reserva);
      assert.equal(await iniciar(reserva), null, 'uma tarefa de aprovação não é enviada depois da decisão');
    }
    assert.equal((await db.query(`select count(*)::int as n from public.reversa_comunicacoes_etiqueta
      where solicitacao_id = $1 and evento = 'aprovacao_pendente' and status = 'evento_obsoleto'`, [pedido.id])).rows[0].n, 2);
  });

  it('separa os destinatários também por empresa e não envia tarefa de emissão obsoleta', async () => {
    const pedidoNovitah = await inserirPedido(usuarios.solicitanteNovitah, 'Novitah', 'Empresa Novitah');
    const aprovadores = (await db.query(`select destinatario_id from public.reversa_comunicacoes_etiqueta
      where solicitacao_id = $1 and evento = 'aprovacao_pendente'`, [pedidoNovitah.id])).rows.map((item) => item.destinatario_id);
    assert.deepEqual(aprovadores, [usuarios.aprovadorNovitah.id]);
    await como(c1, usuarios.aprovadorNovitah,
      'select * from public.aprovar_reversa($1, $2, null)', [pedidoNovitah.id, pedidoNovitah.aprovacao_versao]);
    const emissor = (await db.query(`select destinatario_id from public.reversa_comunicacoes_etiqueta
      where solicitacao_id = $1 and evento = 'emissao_pendente'`, [pedidoNovitah.id])).rows;
    assert.deepEqual(emissor.map((item) => item.destinatario_id), [usuarios.operadorNovitah.id]);

    await limparPendencias();
    const pedidoJaEmitido = await inserirPedido(usuarios.solicitanteA, 'Alinare', 'Emissão pronta antes do worker');
    await aprovar(pedidoJaEmitido);
    await registrarEmissao(pedidoJaEmitido, { pdf: true });
    await db.query(`update public.reversa_comunicacoes_etiqueta set status = 'acao_conector_concluida'
      where solicitacao_id = $1 and evento <> 'emissao_pendente' and status = 'pendente'`, [pedidoJaEmitido.id]);
    const tarefa = await reservar();
    assert.ok(tarefa);
    assert.equal(await iniciar(tarefa), null, 'PDF já vinculado torna obsoleta a tarefa de emissão');
    assert.equal((await db.query(`select status from public.reversa_comunicacoes_etiqueta
      where id = $1`, [tarefa.comunicacao_id])).rows[0].status, 'evento_obsoleto');
  });

  it('cria email de rejeição com justificativa e apenas para o autor', async () => {
    const pedido = await inserirPedido(usuarios.solicitanteA, 'Alinare', 'Pedido rejeitado');
    await como(c1, usuarios.aprovador, 'select * from public.rejeitar_reversa($1, $2, $3)', [
      pedido.id, pedido.aprovacao_versao, 'Faltou comprovar o defeito.',
    ]);
    const avisos = (await db.query(`select canal, destinatario_id, contexto from public.reversa_comunicacoes_etiqueta
      where solicitacao_id = $1 and evento = 'pedido_rejeitado'`, [pedido.id])).rows;
    assert.deepEqual(avisos.map((item) => [item.canal, item.destinatario_id, item.contexto.justificativa]), [
      ['email', usuarios.solicitanteA.id, 'Faltou comprovar o defeito.'],
    ]);
  });

  it('registra canal inválido como erro terminal sem retentativa', async () => {
    await limparPendencias();
    const pedido = await inserirPedido(usuarios.solicitanteA, 'Alinare', 'Canal rejeitado');
    await aprovar(pedido);
    const emissao = await registrarEmissao(pedido, { pdf: true });
    await concluirEventosSemEtiqueta(pedido.id);
    const reserva = await reservar();
    const dados = await iniciar(reserva);
    assert.equal(dados.evento, 'etiqueta_disponivel');
    assert.equal(await finalizar(reserva, 'erro_permanente', 400), true);
    assert.equal((await db.query('select status from public.reversa_comunicacoes_etiqueta where id = $1', [reserva.comunicacao_id])).rows[0].status,
      'erro_permanente');
    assert.equal((await db.query(`select resultado from public.reversa_comunicacoes_etiqueta_tentativas
      where comunicacao_id = $1`, [reserva.comunicacao_id])).rows[0].resultado, 'erro_permanente');
    await db.query(`update public.reversa_comunicacoes_etiqueta set status = 'acao_conector_concluida'
      where emissao_id = $1 and status = 'pendente'`, [emissao.id]);
    assert.equal(await reservar(), null, 'o erro de contrato não volta à fila automaticamente');
  });

  it('avisa postagem e recebimento somente nas confirmações registradas, não por rastreio nem entrega', async () => {
    const pedido = await inserirPedido(usuarios.solicitanteA, 'Alinare', 'Ciclo completo');
    await aprovar(pedido);
    assert.equal((await db.query(`select count(*)::int as n from public.reversa_comunicacoes_etiqueta
      where solicitacao_id = $1 and evento in ('postagem_confirmada', 'recebimento_confirmado')`, [pedido.id])).rows[0].n, 0,
    'aprovação ou emissão não simula postagem/recebimento');

    const emissao = await registrarEmissao(pedido, { pdf: true });
    const etiqueta = (await db.query(`select evento, canal, status, ocorrencia_id from public.reversa_comunicacoes_etiqueta
      where emissao_id = $1 and evento = 'etiqueta_disponivel' order by canal`, [emissao.id])).rows;
    assert.equal(etiqueta.length, 2);
    assert.ok(etiqueta.every((item) => item.status === 'pendente'));
    assert.equal(new Set(etiqueta.map((item) => item.ocorrencia_id)).size, 1);
    assert.equal((await db.query(`select count(*)::int as n from public.reversa_comunicacoes_etiqueta
      where solicitacao_id = $1 and evento in ('postagem_confirmada', 'recebimento_confirmado')`, [pedido.id])).rows[0].n, 0);

    // Mudança de etapa feita pelo rastreio automático (service_role) não é postagem confirmada.
    await db.query("update public.solicitacoes_reverso set status = 'postado', postado_em = now() where id = $1", [pedido.id]);
    assert.equal((await db.query(`select count(*)::int as n from public.reversa_comunicacoes_etiqueta
      where solicitacao_id = $1 and evento in ('postagem_confirmada', 'recebimento_confirmado')`, [pedido.id])).rows[0].n, 0,
    'etapa alterada pelo rastreio não gera aviso de postagem');
    await db.query("update public.solicitacoes_reverso set status = 'postado', postado_em = null where id = $1", [pedido.id]).catch(() => {});

    await como(c1, usuarios.confirmador, 'select * from public.confirmar_postagem_emissao($1, null, null)', [emissao.id]);
    const postagem = (await db.query(`select evento, canal, destinatario_id, contexto, emissao_id from public.reversa_comunicacoes_etiqueta
      where solicitacao_id = $1 and evento = 'postagem_confirmada'`, [pedido.id])).rows;
    assert.equal(postagem.length, 1);
    assert.deepEqual([postagem[0].canal, postagem[0].destinatario_id, postagem[0].emissao_id], ['email', usuarios.solicitanteA.id, emissao.id]);
    assert.ok(postagem[0].contexto.transicao_em);

    // A entrega informada pelos Correios também conclui o pedido, mas não é recebimento físico.
    await db.query("update public.solicitacoes_reverso set status = 'em_transito', em_transito_em = now() where id = $1", [pedido.id]);
    await como(c1, SERVICE_ROLE, "update public.solicitacoes_reverso set status = 'concluido', concluido_em = now() where id = $1", [pedido.id]);
    assert.equal((await db.query(`select count(*)::int as n from public.reversa_comunicacoes_etiqueta
      where solicitacao_id = $1 and evento = 'recebimento_confirmado'`, [pedido.id])).rows[0].n, 0,
    'entrega da transportadora não infere recebimento físico');
    const pedidoManual = await inserirPedido(usuarios.solicitanteA, 'Alinare', 'Recebimento manual');
    await aprovar(pedidoManual);
    await registrarEmissao(pedidoManual, { pdf: true });
    await db.query("update public.solicitacoes_reverso set status = 'em_transito', postado_em = now(), em_transito_em = now() where id = $1", [pedidoManual.id]);
    await como(c1, usuarios.confirmador, 'select public.confirmar_recebimento_mercadoria($1)', [pedidoManual.id]);
    const recebimento = (await db.query(`select evento, canal, destinatario_id, ocorrencia_id from public.reversa_comunicacoes_etiqueta
      where solicitacao_id = $1 and evento = 'recebimento_confirmado'`, [pedidoManual.id])).rows;
    assert.equal(recebimento.length, 1);
    assert.deepEqual([recebimento[0].canal, recebimento[0].destinatario_id], ['email', usuarios.solicitanteA.id]);
    assert.notEqual(recebimento[0].ocorrencia_id, postagem[0].ocorrencia_id);
  });

  it('libera com o PDF sem exigir rastreamento nem confundir o código de autorização', async () => {
    const pedido = await inserirPedido(usuarios.solicitanteA, 'Alinare', 'Etiqueta em preparação');
    await aprovar(pedido);
    const emissao = await registrarEmissao(pedido);
    assert.equal((await db.query('select count(*)::int as n from public.reversa_comunicacoes_etiqueta where emissao_id = $1', [emissao.id])).rows[0].n, 0,
      'sem PDF, não existe etiqueta disponível');

    await db.query('update public.reversa_emissoes set pdf_path = $2, pdf_nome = $3 where id = $1', [emissao.id, `${pedido.id}/1.pdf`, 'etiqueta.pdf']);
    let canais = (await db.query('select * from public.reversa_comunicacoes_etiqueta where emissao_id = $1 order by canal', [emissao.id])).rows;
    assert.deepEqual(canais.map((item) => item.status), ['pendente', 'pendente']);
    assert.ok(canais.every((item) => item.destinatario_id === usuarios.solicitanteA.id));
    const ids = canais.map((item) => item.id);

    await db.query('update public.reversa_emissoes set codigo_autorizacao = $2 where id = $1', [emissao.id, 'AUT-ISOLADO']);
    assert.equal((await db.query("select count(*)::int as n from public.reversa_comunicacoes_etiqueta where emissao_id = $1 and status = 'pendente'", [emissao.id])).rows[0].n, 2,
      'a disponibilidade nÃ£o depende nem do cÃ³digo de autorizaÃ§Ã£o nem do rastreamento');
    await db.query('update public.reversa_emissoes set codigo_rastreio = $2 where id = $1', [emissao.id, 'AA123456789BR']);

    canais = (await db.query('select * from public.reversa_comunicacoes_etiqueta where emissao_id = $1 order by canal', [emissao.id])).rows;
    assert.deepEqual(canais.map((item) => item.status), ['pendente', 'pendente']);
    assert.deepEqual(canais.map((item) => item.id), ids, 'não gera uma segunda comunicação ao receber o rastreio');
    const acessoDireto = await falha(como(c1, usuarios.solicitanteA,
      'select * from public.reversa_comunicacoes_etiqueta where solicitacao_id = $1', [pedido.id]));
    assert.equal(acessoDireto?.code, '42501');
  });

  it('isola a falha de um canal, registra tentativas e retenta somente esse canal', async () => {
    await limparPendencias();
    const pedido = await inserirPedido(usuarios.solicitanteA, 'Alinare', 'Canais independentes');
    await aprovar(pedido);
    const emissao = await registrarEmissao(pedido, { pdf: true, rastreio: 'BB123456789BR' });
    await concluirEventosSemEtiqueta(pedido.id);

    const primeira = await reservar();
    const dadosPrimeiro = await iniciar(primeira);
    assert.equal(dadosPrimeiro.destinatario_id, usuarios.solicitanteA.id);
    assert.equal(dadosPrimeiro.destinatario_email, usuarios.solicitanteA.email);
    assert.equal(dadosPrimeiro.codigo_rastreio, 'BB123456789BR');
    assert.equal(dadosPrimeiro.valida_ate, '2026-11-20');
    assert.equal(await finalizar(primeira, 'falhou', 503), true);

    const segunda = await reservar();
    const dadosSegundo = await iniciar(segunda);
    assert.notEqual(dadosSegundo.canal, dadosPrimeiro.canal);
    assert.equal(await finalizar(segunda, 'acao_conector_concluida', 202), true);

    let rows = (await db.query('select canal, status, tentativas from public.reversa_comunicacoes_etiqueta where emissao_id = $1', [emissao.id])).rows;
    assert.equal(rows.find((item) => item.canal === dadosPrimeiro.canal).status, 'falhou');
    assert.equal(rows.find((item) => item.canal === dadosSegundo.canal).status, 'acao_conector_concluida');
    assert.equal((await db.query('select count(*)::int as n from public.reversa_comunicacoes_etiqueta_tentativas where comunicacao_id = $1', [primeira.comunicacao_id])).rows[0].n, 1);

    await db.query(`update public.reversa_comunicacoes_etiqueta set proxima_tentativa_em = now() - interval '1 minute' where id = $1`, [primeira.comunicacao_id]);
    const retry = await reservar();
    assert.equal(retry.comunicacao_id, primeira.comunicacao_id);
    await iniciar(retry);
    await finalizar(retry, 'acao_conector_concluida', 202);
    rows = (await db.query('select canal, status, tentativas from public.reversa_comunicacoes_etiqueta where emissao_id = $1', [emissao.id])).rows;
    assert.ok(rows.every((item) => item.status === 'acao_conector_concluida'));
    assert.equal(rows.find((item) => item.canal === dadosPrimeiro.canal).tentativas, 2);
    assert.equal((await db.query('select count(*)::int as n from public.reversa_comunicacoes_etiqueta where emissao_id = $1', [emissao.id])).rows[0].n, 2);
  });

  it('nao repete um canal de resultado indeterminado, inclusive apos interrupcao do worker', async () => {
    await limparPendencias();
    const pedido = await inserirPedido(usuarios.solicitanteA, 'Alinare', 'Timeout e recuperacao segura');
    await aprovar(pedido);
    await registrarEmissao(pedido, { pdf: true, rastreio: 'BX123456789BR' });
    await concluirEventosSemEtiqueta(pedido.id);
    const reserva = await reservar();
    const dados = await iniciar(reserva);
    await db.query(`update public.reversa_comunicacoes_etiqueta
      set lock_expira_em = now() - interval '1 second' where id = $1`, [reserva.comunicacao_id]);

    const outroCanal = await reservar();
    assert.ok(outroCanal, 'o outro canal permanece processável');
    assert.notEqual(outroCanal.comunicacao_id, reserva.comunicacao_id, 'a tentativa ambígua não é reenviada');
    const dadosOutroCanal = await iniciar(outroCanal);
    await finalizar(outroCanal, 'acao_conector_concluida', 200);
    const canal = (await db.query('select status from public.reversa_comunicacoes_etiqueta where id = $1', [reserva.comunicacao_id])).rows[0];
    const tentativa = (await db.query(`select resultado from public.reversa_comunicacoes_etiqueta_tentativas
      where comunicacao_id = $1`, [reserva.comunicacao_id])).rows[0];
    assert.deepEqual(canal, { status: 'resultado_indeterminado' });
    assert.deepEqual(tentativa, { resultado: 'resultado_indeterminado' });
    assert.equal(dados.canal, (await db.query('select canal from public.reversa_comunicacoes_etiqueta where id = $1', [reserva.comunicacao_id])).rows[0].canal);
    assert.notEqual(dadosOutroCanal.canal, dados.canal);
    assert.equal(await reservar(), null);
  });

  it('para automaticamente no limite configurado de cinco tentativas do canal', async () => {
    await limparPendencias();
    const pedido = await inserirPedido(usuarios.solicitanteA, 'Alinare', 'Limite de retry');
    await aprovar(pedido);
    const emissao = await registrarEmissao(pedido, { pdf: true, rastreio: 'BC123456789BR' });
    await concluirEventosSemEtiqueta(pedido.id);
    let canalComFalha = null;

    for (let numero = 1; numero <= 5; numero += 1) {
      if (numero > 1) {
        await db.query(`update public.reversa_comunicacoes_etiqueta set proxima_tentativa_em = now() - interval '1 minute'
          where emissao_id = $1 and canal = $2`, [emissao.id, canalComFalha]);
      }
      const reserva = await reservar();
      const dados = await iniciar(reserva);
      if (numero === 1) canalComFalha = dados.canal;
      assert.equal(dados.canal, canalComFalha);
      await finalizar(reserva, 'falhou', 503);
      if (numero === 1) {
        const outraReserva = await reservar();
        const outroCanal = await iniciar(outraReserva);
        assert.notEqual(outroCanal.canal, canalComFalha);
        await finalizar(outraReserva, 'acao_conector_concluida', 202);
      }
    }

    const esgotada = (await db.query('select status, tentativas from public.reversa_comunicacoes_etiqueta where emissao_id = $1 and canal = $2', [emissao.id, canalComFalha])).rows[0];
    assert.deepEqual(esgotada, { status: 'limite_tentativas', tentativas: 5 });
    assert.equal((await reservar()), null, 'não reserva novamente o canal esgotado');
    assert.equal((await db.query(`select count(*)::int as n from public.reversa_comunicacoes_etiqueta_tentativas t
      join public.reversa_comunicacoes_etiqueta c on c.id = t.comunicacao_id where c.emissao_id = $1 and c.canal = $2`, [emissao.id, canalComFalha])).rows[0].n, 5);
  });

  it('preserva a comunicação anterior e cria dois novos registros por reemissão', async () => {
    await limparPendencias();
    const pedido = await inserirPedido(usuarios.solicitanteA, 'Alinare', 'Nova etiqueta');
    await aprovar(pedido);
    const anterior = await registrarEmissao(pedido, { pdf: true, rastreio: 'CC123456789BR' });
    const novoId = (await db.query('select gen_random_uuid() as id')).rows[0].id;

    await db.query('begin');
    try {
      await db.query('update public.reversa_emissoes set substituida_em = now(), substituida_por_id = $2 where id = $1', [anterior.id, novoId]);
      await db.query(`insert into public.reversa_emissoes
        (id, solicitacao_id, sequencia, origem, emissao_anterior_id, motivo_reemissao, codigo_rastreio, pdf_path, pdf_nome)
        values ($1, $2, 2, 'sistema', $3, 'pdf_incorreto', 'DD123456789BR', $4, 'nova.pdf')`,
      [novoId, pedido.id, anterior.id, `${pedido.id}/2.pdf`]);
      await db.query('commit');
    } catch (erro) {
      await db.query('rollback');
      throw erro;
    }

    const filas = (await db.query("select emissao_id, status, ocorrencia_id from public.reversa_comunicacoes_etiqueta where solicitacao_id = $1 and evento = 'etiqueta_disponivel'", [pedido.id])).rows;
    assert.equal(filas.length, 4);
    assert.ok(filas.filter((item) => item.emissao_id === anterior.id).every((item) => item.status === 'emissao_substituida'));
    assert.ok(filas.filter((item) => item.emissao_id === novoId).every((item) => item.status === 'pendente'));
    assert.equal(new Set(filas.filter((item) => item.emissao_id === anterior.id).map((item) => item.ocorrencia_id)).size, 1);
    assert.equal(new Set(filas.filter((item) => item.emissao_id === novoId).map((item) => item.ocorrencia_id)).size, 1);
    assert.notEqual(filas.find((item) => item.emissao_id === anterior.id).ocorrencia_id,
      filas.find((item) => item.emissao_id === novoId).ocorrencia_id, 'reemissão é nova ocorrência');
  });

  it('mantém email ou identidade ausente pendentes e cancela envio se o autor perde acesso', async () => {
    await limparPendencias();
    const semEmail = await criarUsuario(db, 'Sem email reversa', ['formulario-alinare']);
    await db.query('update auth.users set email = null where id = $1', [semEmail.id]);
    const pedidoSemEmail = await inserirPedido(semEmail, 'Alinare', 'Email ausente');
    await aprovar(pedidoSemEmail);
    const emissaoSemEmail = await registrarEmissao(pedidoSemEmail, { pdf: true, rastreio: 'EE123456789BR' });
    assert.ok((await db.query("select status from public.reversa_comunicacoes_etiqueta where emissao_id = $1 and evento = 'etiqueta_disponivel'", [emissaoSemEmail.id])).rows.every((item) => item.status === 'aguardando_email'));
    await db.query('update auth.users set email = $2 where id = $1', [semEmail.id, semEmail.email]);
    assert.ok((await db.query("select status from public.reversa_comunicacoes_etiqueta where emissao_id = $1 and evento = 'etiqueta_disponivel'", [emissaoSemEmail.id])).rows.every((item) => item.status === 'pendente'));
    await limparPendencias();

    const pedidoRevogado = await inserirPedido(usuarios.solicitanteA, 'Alinare', 'Sem acesso atual');
    await aprovar(pedidoRevogado);
    const emissaoRevogada = await registrarEmissao(pedidoRevogado, { pdf: true, rastreio: 'FF123456789BR' });
    await concluirEventosSemEtiqueta(pedidoRevogado.id);
    const { rows: [metadata] } = await db.query('select raw_app_meta_data from auth.users where id = $1', [usuarios.solicitanteA.id]);
    await db.query(`update auth.users set raw_app_meta_data = jsonb_set(raw_app_meta_data, '{telas}', '[]'::jsonb) where id = $1`, [usuarios.solicitanteA.id]);
    const reserva = await reservar();
    assert.ok(reserva);
    const dados = await iniciar(reserva);
    assert.equal(dados, null, 'a revalidação não revela email nem pedido após retirar o acesso');
    assert.equal((await db.query('select status from public.reversa_comunicacoes_etiqueta where id = $1', [reserva.comunicacao_id])).rows[0].status, 'acesso_revogado');
    await db.query('update auth.users set raw_app_meta_data = $2 where id = $1', [usuarios.solicitanteA.id, metadata.raw_app_meta_data]);

    const legado = (await db.query(`insert into public.solicitacoes_reverso
      (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo)
      values ('Alinare', current_date, 'Nome histórico sem conta', 'Comercial', 999, 'Registro legado', 'Rua A, 1', 'Outros') returning *`)).rows[0];
    const emissaoLegada = await registrarEmissao(legado, { pdf: true, rastreio: 'GG123456789BR' });
    assert.ok((await db.query("select status, destinatario_id from public.reversa_comunicacoes_etiqueta where emissao_id = $1 and evento = 'etiqueta_disponivel'", [emissaoLegada.id])).rows.every((item) => item.status === 'aguardando_identidade' && item.destinatario_id === null));
    assert.ok(emissaoRevogada.id);
  });
});
