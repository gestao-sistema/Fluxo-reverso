import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANON, como, criarUsuario, esperarBloqueio, iniciarBanco, iniciarSessao, migrationsNovas, SERVICE_ROLE,
} from './lib/banco.mjs';

// Migrations desta entrega: a base é preparada com a cadeia anterior, populada
// como um banco legado e só então atualizada.
const PRIMEIRA_NOVA = '20261027100000_comunicacao_ciclo_pedido.sql';
const FILA_ORIGINAL = '20261026200000_comunicacao_etiqueta_solicitante.sql';

let banco;
let db;
let c1;
const u = {};
const falha = (promessa) => promessa.then(() => null, (erro) => erro);
const q = async (sql, params) => (await db.query(sql, params)).rows;
const um = async (sql, params) => (await q(sql, params))[0];

const novoPedido = async (solicitante, empresa, cliente, { setor = 'Comercial', data = null, motivo = 'Outros' } = {}) =>
  (await como(c1, solicitante, `
    insert into public.solicitacoes_reverso
      (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo)
    values ($1, coalesce($5::date, current_date), 'Nome digitado ignorado', $2, 9901, $3, 'Rua de teste, 1', $4)
    returning *`, [empresa, setor, cliente, motivo, data])).rows[0];

const aprovar = (pedido, aprovador = u.aprovador) =>
  como(c1, aprovador, 'select * from public.aprovar_reversa($1, $2, null)', [pedido.id, pedido.aprovacao_versao]);

const emissaoComPdf = async (pedido, { sequencia = 1, rastreio = null, emitida = '2031-03-12', valida = '2031-04-12' } = {}) =>
  (await db.query(`
    insert into public.reversa_emissoes
      (solicitacao_id, sequencia, origem, codigo_autorizacao, codigo_rastreio, pdf_path, pdf_nome, emitida_em, valida_ate)
    values ($1, $2, 'sistema', 'AUT-1', $3, $4, 'etiqueta.pdf', $5, $6) returning *`,
  [pedido.id, sequencia, rastreio, `${pedido.id}/${sequencia}.pdf`, emitida, valida])).rows[0];

const filasDoPedido = (id, evento = null) => q(`
  select evento, canal, destinatario_id, status, ocorrencia_id, contexto, emissao_id, id
    from public.reversa_comunicacoes_etiqueta
   where solicitacao_id = $1 and ($2::text is null or evento = $2) order by criado_em, id`, [id, evento]);

const reservar = async () =>
  (await como(c1, SERVICE_ROLE, 'select public.reversa_claim_comunicacao_etiqueta() as r')).rows[0].r;
const iniciar = async (reserva) => (await como(c1, SERVICE_ROLE,
  'select public.reversa_iniciar_comunicacao_etiqueta($1, $2) as d', [reserva.comunicacao_id, reserva.lock_token])).rows[0].d;
const finalizar = async (reserva, resultado, http = null, detalhe = 'Detalhe de teste.') =>
  (await como(c1, SERVICE_ROLE, 'select public.reversa_finalizar_comunicacao_etiqueta_v2($1, $2, $3, $4, $5) as f',
    [reserva.comunicacao_id, reserva.lock_token, resultado, http, detalhe])).rows[0].f;
const statusDe = async (id) => (await um('select status from public.reversa_comunicacoes_etiqueta where id = $1', [id])).status;

/** Conclui tudo que está pendente para isolar o próximo cenário. */
async function esvaziarFila() {
  await db.query(`update public.reversa_comunicacoes_etiqueta
    set status = 'acao_conector_concluida', aceito_pelo_fluxo_em = now()
    where status in ('pendente', 'falhou')`);
}

/** Gera um canal em resultado_indeterminado de verdade (reserva, início da chamada e retorno ambíguo). */
async function gerarIndeterminada() {
  await esvaziarFila();
  const pedido = await novoPedido(u.solicitante, 'Alinare', 'Reconciliação ' + Math.random().toString(36).slice(2, 8));
  await db.query(`update public.reversa_comunicacoes_etiqueta set status = 'acao_conector_concluida'
    where solicitacao_id = $1 and evento <> 'pedido_criado'`, [pedido.id]);
  const reserva = await reservar();
  assert.ok(reserva, 'deveria haver um item reservável');
  const dados = await iniciar(reserva);
  assert.equal(dados.evento, 'pedido_criado');
  assert.equal(await finalizar(reserva, 'resultado_indeterminado', 502), true);
  return { reserva, id: reserva.comunicacao_id, pedido };
}

const reconciliar = (persona, id, acao = 'confirmar_conclusao_conector',
  justificativa = 'Execução localizada no histórico do fluxo.', referencia = 'run-0001', conexao = c1) =>
  como(conexao, persona, 'select public.reconciliar_comunicacao_reversa($1, $2, $3, $4) as r',
    [id, acao, justificativa, referencia]);

let estadoAntesDoUpgrade;

before(async () => {
  banco = await iniciarBanco();
  db = banco.dono;
  const todas = migrationsNovas();
  // Fase A: banco anterior a qualquer fila de comunicação.
  for (const arquivo of todas.filter((f) => f < FILA_ORIGINAL)) await banco.aplicar(arquivo);
  c1 = await banco.conectar();

  Object.assign(u, {
    admin: await criarUsuario(db, 'Admin ciclo', ['usuarios']),
    admin2: await criarUsuario(db, 'Segundo admin ciclo', ['usuarios']),
    solicitante: await criarUsuario(db, 'Solicitante ciclo', ['formulario-alinare']),
    solicitanteNovitah: await criarUsuario(db, 'Solicitante Novitah ciclo', ['formulario-novitah']),
    aprovador: await criarUsuario(db, 'Aprovador ciclo', ['aprovar-alinare']),
    aprovador2: await criarUsuario(db, 'Aprovador dois ciclo', ['aprovar-alinare']),
    aprovadorFin: await criarUsuario(db, 'Aprovador financeiro ciclo', ['aprovar-alinare']),
    aprovadorNovo: await criarUsuario(db, 'Aprovador novo ciclo', ['aprovar-alinare']),
    aprovadorNovitah: await criarUsuario(db, 'Aprovador Novitah ciclo', ['aprovar-novitah']),
    solicitanteAprovador: await criarUsuario(db, 'Solicita e aprova ciclo', ['formulario-alinare', 'aprovar-alinare']),
    operador: await criarUsuario(db, 'Operador ciclo', ['emitir-alinare']),
    confirmador: await criarUsuario(db, 'Confirmador ciclo', ['confirmar-alinare']),
    gestorGeral: await criarUsuario(db, 'Gestor geral ciclo', ['dashboard-geral', 'lista-geral', 'kanban-edit']),
    gestorAlinare: await criarUsuario(db, 'Gestor Alinare ciclo', ['dashboard-alinare', 'lista-alinare']),
  });
  await como(c1, u.admin, 'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)', ['Alinare', JSON.stringify([
    { usuario_id: u.aprovador.id, todos_setores: false, setores: ['Comercial'] },
    { usuario_id: u.aprovador2.id, todos_setores: false, setores: ['Comercial'] },
    { usuario_id: u.aprovadorFin.id, todos_setores: false, setores: ['Financeiro'] },
    { usuario_id: u.solicitanteAprovador.id, todos_setores: false, setores: ['Comercial'] },
  ])]);
  await como(c1, u.admin, 'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)', ['Novitah', JSON.stringify([
    { usuario_id: u.aprovadorNovitah.id, todos_setores: true, setores: [] },
  ])]);
  // Pedido pendente que já existia antes de existir fila de comunicação.
  u.anteriorAFila = await novoPedido(u.solicitante, 'Alinare', 'Pendente anterior à fila');

  // Fase B: a fila original (migrations 20261026*), com pedidos em várias situações.
  for (const arquivo of todas.filter((f) => f >= FILA_ORIGINAL && f < PRIMEIRA_NOVA)) await banco.aplicar(arquivo);
  u.legadoPendente = await novoPedido(u.solicitante, 'Alinare', 'Pendente com a fila original');
  const legadoAprovado = await novoPedido(u.solicitante, 'Alinare', 'Legado aprovado com etiqueta');
  await aprovar(legadoAprovado);
  u.legadoEmissao = await emissaoComPdf(legadoAprovado);
  await db.query("select public.emissao_avancar_etapa($1, 'postado')", [legadoAprovado.id]); // semântica antiga: gerava aviso
  estadoAntesDoUpgrade = new Map((await q('select id, status from public.reversa_comunicacoes_etiqueta')).map((l) => [l.id, l.status]));
  u.postagemAntiga = await um(`select id from public.reversa_comunicacoes_etiqueta
    where solicitacao_id = $1 and evento = 'postagem_confirmada'`, [legadoAprovado.id]);

  // Fase C: as migrations desta entrega.
  for (const arquivo of todas.filter((f) => f >= PRIMEIRA_NOVA)) await banco.aplicar(arquivo);
}, { timeout: 300_000 });

after(async () => { await banco?.encerrar(); });

describe('atualização de uma base com a fila anterior', () => {
  it('não cria avisos retroativos e invalida os de postagem que vinham do rastreio', async () => {
    const depois = new Map((await q('select id, status from public.reversa_comunicacoes_etiqueta')).map((l) => [l.id, l.status]));
    assert.equal(depois.size, estadoAntesDoUpgrade.size, 'a migration não enfileira nada');
    assert.ok(u.postagemAntiga, 'o cenário precisa conter um aviso de postagem da versão anterior');
    for (const [id, status] of estadoAntesDoUpgrade) {
      if (id === u.postagemAntiga.id) assert.equal(depois.get(id), 'evento_obsoleto');
      else assert.equal(depois.get(id), status, 'linhas existentes são preservadas');
    }
  });

  it('regravar a configuração de aprovadores não avisa pedidos anteriores à fila, só os posteriores', async () => {
    assert.equal((await filasDoPedido(u.anteriorAFila.id)).length, 0, 'o pedido anterior à fila não tem nenhum aviso');
    assert.equal((await filasDoPedido(u.legadoPendente.id, 'aprovacao_pendente')).length, 3);
    await como(c1, u.admin, 'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)', ['Alinare', JSON.stringify([
      { usuario_id: u.aprovador.id, todos_setores: false, setores: ['Comercial'] },
      { usuario_id: u.aprovador2.id, todos_setores: false, setores: ['Comercial'] },
      { usuario_id: u.aprovadorFin.id, todos_setores: false, setores: ['Financeiro'] },
      { usuario_id: u.solicitanteAprovador.id, todos_setores: false, setores: ['Comercial'] },
      { usuario_id: u.aprovadorNovo.id, todos_setores: true, setores: [] },
    ])]);
    assert.equal((await filasDoPedido(u.anteriorAFila.id)).length, 0, 'sem aviso retroativo em lote');
    const destinos = (await filasDoPedido(u.legadoPendente.id, 'aprovacao_pendente')).map((l) => l.destinatario_id);
    assert.equal(destinos.length, 4);
    assert.ok(destinos.includes(u.aprovadorNovo.id), 'o novo aprovador é avisado dos pedidos já na fila de comunicação');
    // Restaura a configuração original para os demais cenários.
    await como(c1, u.admin, 'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)', ['Alinare', JSON.stringify([
      { usuario_id: u.aprovador.id, todos_setores: false, setores: ['Comercial'] },
      { usuario_id: u.aprovador2.id, todos_setores: false, setores: ['Comercial'] },
      { usuario_id: u.aprovadorFin.id, todos_setores: false, setores: ['Financeiro'] },
      { usuario_id: u.solicitanteAprovador.id, todos_setores: false, setores: ['Comercial'] },
    ])]);
  });

  it('a unique antiga por emissão/destinatário/canal não descarta mais eventos novos', async () => {
    const restricoes = await q(`select conname from pg_constraint
      where conrelid = 'public.reversa_comunicacoes_etiqueta'::regclass and contype = 'u'`);
    assert.deepEqual(restricoes, []);
    const pedido = await novoPedido(u.solicitante, 'Alinare', 'Evento após etiqueta');
    await aprovar(pedido);
    const emissao = await emissaoComPdf(pedido);
    await como(c1, u.confirmador, 'select * from public.confirmar_postagem_emissao($1, null, null)', [emissao.id]);
    const eventos = (await filasDoPedido(pedido.id)).map((l) => `${l.evento}:${l.canal}`);
    assert.ok(eventos.includes('etiqueta_disponivel:email'));
    assert.ok(eventos.includes('postagem_confirmada:email'), 'a postagem da mesma emissão/destinatário/canal é registrada');
  });
});

describe('rodadas de aprovação', () => {
  it('cria uma ocorrência por versão, sem repetir por regravação de configuração, consulta ou edição cosmética', async () => {
    const pedido = await novoPedido(u.solicitante, 'Alinare', 'Rodadas de aprovação');
    const tarefas = async () => (await filasDoPedido(pedido.id, 'aprovacao_pendente'));
    let linhas = await tarefas();
    assert.deepEqual(linhas.map((l) => l.destinatario_id).sort(),
      [u.aprovador.id, u.aprovador2.id, u.solicitanteAprovador.id].sort(),
      'aprovadores do setor Comercial que podem decidir; o financeiro fica fora');
    assert.ok(linhas.every((l) => l.canal === 'teams'));

    // Regravar a configuração não repete a ocorrência (inclusive nas rodadas posteriores).
    const regravar = async () => como(c1, u.admin, 'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)', ['Alinare', JSON.stringify([
      { usuario_id: u.aprovador.id, todos_setores: false, setores: ['Comercial'] },
      { usuario_id: u.aprovador2.id, todos_setores: false, setores: ['Comercial', 'Financeiro'] },
      { usuario_id: u.aprovadorFin.id, todos_setores: false, setores: ['Financeiro'] },
      { usuario_id: u.solicitanteAprovador.id, todos_setores: false, setores: ['Comercial'] },
    ])]);
    await regravar();
    assert.equal((await tarefas()).length, 3);

    // Alteração relevante pelo autor devolve à análise numa nova versão.
    await como(c1, u.solicitante, "update public.solicitacoes_reverso set endereco_postagem = 'Rua nova, 99' where id = $1", [pedido.id]);
    linhas = await tarefas();
    assert.equal(linhas.length, 6, 'nova rodada, nova ocorrência por aprovador');
    assert.equal(new Set(linhas.map((l) => l.ocorrencia_id)).size, 2);
    await regravar();
    assert.equal((await tarefas()).length, 6, 'regravar a configuração não duplica a rodada 2');

    // Edição cosmética (anotação) não altera a versão nem avisa.
    await como(c1, u.admin, "update public.solicitacoes_reverso set anotacoes = 'observação interna' where id = $1", [pedido.id]);
    assert.equal((await tarefas()).length, 6);
    assert.equal((await um('select aprovacao_versao from public.solicitacoes_reverso where id = $1', [pedido.id])).aprovacao_versao, 2);

    // Aprovada na versão 2 e alterada depois: a decisão é desfeita e a rodada 3 reabre a tarefa.
    const v2 = await um('select * from public.solicitacoes_reverso where id = $1', [pedido.id]);
    await aprovar(v2);
    await como(c1, u.solicitante, "update public.solicitacoes_reverso set motivo = 'Peça com defeito' where id = $1", [pedido.id]);
    linhas = await tarefas();
    assert.equal(linhas.length, 9);
    assert.equal((await um('select aprovacao_status from public.solicitacoes_reverso where id = $1', [pedido.id])).aprovacao_status, 'aguardando_aprovacao');
    await regravar();
    assert.equal((await tarefas()).length, 9);
  });

  it('não avisa aprovadores de outro setor ou empresa e respeita a autoaprovação configurada', async () => {
    const financeiro = await novoPedido(u.solicitante, 'Alinare', 'Setor financeiro', { setor: 'Financeiro' });
    const destinos = (await filasDoPedido(financeiro.id, 'aprovacao_pendente')).map((l) => l.destinatario_id);
    assert.ok(destinos.includes(u.aprovadorFin.id));
    assert.ok(!destinos.includes(u.aprovador.id), 'aprovador só do Comercial não recebe o Financeiro');
    assert.ok(!destinos.includes(u.aprovadorNovitah.id), 'outra empresa não recebe');

    const proprio = await novoPedido(u.solicitanteAprovador, 'Alinare', 'Autor é aprovador');
    assert.ok(!(await filasDoPedido(proprio.id, 'aprovacao_pendente')).some((l) => l.destinatario_id === u.solicitanteAprovador.id));

    await db.query('update public.aprovacao_config set permitir_autoaprovacao = true where id');
    try {
      const comPermissao = await novoPedido(u.solicitanteAprovador, 'Alinare', 'Autoaprovação permitida');
      assert.ok((await filasDoPedido(comPermissao.id, 'aprovacao_pendente')).some((l) => l.destinatario_id === u.solicitanteAprovador.id));
    } finally {
      await db.query('update public.aprovacao_config set permitir_autoaprovacao = false where id');
    }
  });
});

describe('atualização histórica versus tarefa pendente', () => {
  it('mantém a atualização ao solicitante após o pedido avançar e descarta a tarefa de emissão', async () => {
    await esvaziarFila();
    const pedido = await novoPedido(u.solicitante, 'Alinare', 'Avanço antes do envio');
    await aprovar(pedido);
    await emissaoComPdf(pedido, { rastreio: null });
    await db.query(`update public.reversa_comunicacoes_etiqueta set status = 'acao_conector_concluida'
      where solicitacao_id = $1 and evento not in ('pedido_aprovado', 'emissao_pendente') and status = 'pendente'`, [pedido.id]);

    const vistos = {};
    for (let i = 0; i < 2; i += 1) {
      const reserva = await reservar();
      assert.ok(reserva);
      const dados = await iniciar(reserva);
      const linha = await um('select evento from public.reversa_comunicacoes_etiqueta where id = $1', [reserva.comunicacao_id]);
      vistos[linha.evento] = dados;
      if (dados) await finalizar(reserva, 'acao_conector_concluida', 200, null);
    }
    assert.equal(vistos.emissao_pendente, null, 'a tarefa perde pertinência após o PDF vinculado');
    assert.ok(vistos.pedido_aprovado, 'a atualização histórica ainda vale');
    assert.equal(vistos.pedido_aprovado.evento, 'pedido_aprovado');
    assert.ok(vistos.pedido_aprovado.transicao_em, 'informa quando ocorreu o evento');
  });

  it('a rejeição histórica mantém a justificativa mesmo depois de nova versão do pedido', async () => {
    await esvaziarFila();
    const pedido = await novoPedido(u.solicitante, 'Alinare', 'Rejeitado e alterado');
    await como(c1, u.aprovador, 'select * from public.rejeitar_reversa($1, $2, $3)', [pedido.id, pedido.aprovacao_versao, 'Anexar o comprovante.']);
    await como(c1, u.solicitante, "update public.solicitacoes_reverso set nome_cliente = 'Cliente corrigido' where id = $1", [pedido.id]);
    await db.query(`update public.reversa_comunicacoes_etiqueta set status = 'acao_conector_concluida'
      where solicitacao_id = $1 and evento <> 'pedido_rejeitado' and status = 'pendente'`, [pedido.id]);
    const reserva = await reservar();
    const dados = await iniciar(reserva);
    assert.equal(dados.evento, 'pedido_rejeitado');
    assert.equal(dados.justificativa, 'Anexar o comprovante.');
  });
});

describe('postagem e recebimento', () => {
  it('desfazer a confirmação antes do envio descarta o aviso; reconfirmar cria nova ocorrência', async () => {
    await esvaziarFila();
    const pedido = await novoPedido(u.solicitante, 'Alinare', 'Postagem desfeita');
    await aprovar(pedido);
    const emissao = await emissaoComPdf(pedido);
    await esvaziarFila();
    await como(c1, u.confirmador, 'select * from public.confirmar_postagem_emissao($1, null, null)', [emissao.id]);
    await como(c1, u.confirmador, 'select * from public.desfazer_postagem_emissao($1, $2)', [emissao.id, 'Confirmado por engano.']);
    const reserva = await reservar();
    assert.equal(await iniciar(reserva), null);
    assert.equal(await statusDe(reserva.comunicacao_id), 'evento_obsoleto');

    await como(c1, u.confirmador, 'select * from public.confirmar_postagem_emissao($1, null, null)', [emissao.id]);
    const avisos = await filasDoPedido(pedido.id, 'postagem_confirmada');
    assert.equal(avisos.length, 2);
    assert.equal(new Set(avisos.map((a) => a.ocorrencia_id)).size, 2);
    const segunda = await reservar();
    const dados = await iniciar(segunda);
    assert.equal(dados.evento, 'postagem_confirmada');
  });

  it('postagem de origem legado nunca avisa', async () => {
    await esvaziarFila();
    const pedido = await novoPedido(u.solicitante, 'Alinare', 'Postagem legado');
    await aprovar(pedido);
    const emissao = await emissaoComPdf(pedido);
    await db.query("update public.reversa_emissoes set postagem_confirmada_em = now(), postagem_fonte = 'legado' where id = $1", [emissao.id]);
    assert.equal((await filasDoPedido(pedido.id, 'postagem_confirmada')).length, 0);
  });

  it('recebimento manual registra quem confirmou e é visível só a quem lê o pedido', async () => {
    const pedido = await novoPedido(u.solicitante, 'Alinare', 'Recebimento auditado');
    await aprovar(pedido);
    await emissaoComPdf(pedido);
    await db.query("update public.solicitacoes_reverso set status = 'em_transito', postado_em = now(), em_transito_em = now() where id = $1", [pedido.id]);
    await como(c1, u.confirmador, 'select public.confirmar_recebimento_mercadoria($1)', [pedido.id]);
    const linha = await um('select * from public.reversa_recebimentos_confirmados where solicitacao_id = $1', [pedido.id]);
    assert.equal(linha.confirmado_por, u.confirmador.id);
    assert.equal(linha.confirmado_por_nome, 'Confirmador ciclo');
    assert.equal((await falha(como(c1, u.confirmador, 'select public.confirmar_recebimento_mercadoria($1)', [pedido.id])))?.code, '55000');
    assert.equal((await como(c1, u.solicitante, 'select * from public.reversa_recebimentos_confirmados where solicitacao_id = $1', [pedido.id])).rows.length, 1);
    assert.equal((await como(c1, u.solicitanteNovitah, 'select * from public.reversa_recebimentos_confirmados where solicitacao_id = $1', [pedido.id])).rows.length, 0);
    assert.equal((await falha(como(c1, u.confirmador,
      'insert into public.reversa_recebimentos_confirmados (solicitacao_id, confirmado_por_nome) values ($1, $2)', [pedido.id, 'x'])))?.code, '42501');
  });

  it('a leitura do destinatário usa a mesma regra do acesso ao pedido e não deixa o contexto trocado', async () => {
    await esvaziarFila();
    const pedido = await novoPedido(u.solicitante, 'Alinare', 'Contexto restaurado');
    const reserva = await reservar();
    const resultados = await como(c1, SERVICE_ROLE,
      `select public.reversa_iniciar_comunicacao_etiqueta('${reserva.comunicacao_id}', '${reserva.lock_token}') as d;
       select auth.role() as papel, auth.uid() as uid`);
    assert.equal(resultados[0].rows[0].d.solicitacao_id, pedido.id);
    assert.equal(resultados[1].rows[0].papel, 'service_role');
    assert.equal(resultados[1].rows[0].uid, null);
  });
});

describe('reconciliação administrativa', () => {
  it('exige a capacidade administrativa no banco: gestores, solicitantes e demais perfis são recusados', async () => {
    const { id } = await gerarIndeterminada();
    for (const persona of [u.gestorGeral, u.gestorAlinare, u.solicitante, u.aprovador, u.operador, u.confirmador]) {
      for (const sql of [
        ['select * from public.listar_comunicacoes_reversa()', []],
        ['select public.resumo_comunicacoes_reversa()', []],
        ['select public.listar_historico_comunicacao_reversa($1)', [id]],
      ]) {
        assert.equal((await falha(como(c1, persona, sql[0], sql[1])))?.code, '42501', persona.nome);
      }
      assert.equal((await falha(reconciliar(persona, id)))?.code, '42501', persona.nome);
    }
    assert.equal((await falha(como(c1, ANON, 'select * from public.listar_comunicacoes_reversa()')))?.code, '42501');
    assert.equal(await statusDe(id), 'resultado_indeterminado');
    assert.equal((await falha(como(c1, u.solicitante, 'select * from public.reversa_comunicacoes_reconciliacoes')))?.code, '42501');
  });

  it('lista pedido, evento, destinatário, canal, status, tentativas, datas, correlação e erro sanitizado', async () => {
    const { id, pedido } = await gerarIndeterminada();
    await db.query(`update public.reversa_comunicacoes_etiqueta set ultimo_erro = $2 where id = $1`,
      [id, 'Linha 1\nlinha 2\u0007 com controle.']);
    const lista = (await como(c1, u.admin, 'select * from public.listar_comunicacoes_reversa($1, $2, null, $3)',
      ['resultado_indeterminado', 'pedido_criado', pedido.id])).rows;
    const linha = lista.find((l) => l.id === id);
    assert.ok(linha);
    assert.equal(linha.solicitacao_id, pedido.id);
    assert.equal(linha.pedido, 'RV-' + pedido.id.slice(0, 8).toUpperCase());
    assert.equal(linha.evento, 'pedido_criado');
    assert.equal(linha.canal, 'email');
    assert.equal(linha.status, 'resultado_indeterminado');
    assert.equal(linha.destinatario_nome, 'Solicitante ciclo');
    assert.equal(linha.destinatario_email, u.solicitante.email);
    assert.equal(linha.tentativas, 1);
    assert.ok(linha.criado_em && linha.atualizado_em);
    assert.ok([...linha.ultimo_erro].every((c) => c.charCodeAt(0) > 31), 'sem caracteres de controle');
    assert.ok(Number(linha.total) >= 1);
    const historico = (await como(c1, u.admin, 'select public.listar_historico_comunicacao_reversa($1) as h', [id])).rows[0].h;
    assert.equal(historico.tentativas.length, 1);
    assert.equal(historico.tentativas[0].resultado, 'resultado_indeterminado');
    assert.equal(historico.tentativas[0].http_status, 502);
    assert.equal((await falha(como(c1, u.admin, 'select * from public.listar_comunicacoes_reversa(null, null, null, null, 0)')))?.code, '22023');
  });

  it('confirma a conclusão com justificativa e referência, registra o administrador e impede novo envio', async () => {
    const { id } = await gerarIndeterminada();
    assert.equal((await falha(reconciliar(u.admin, id, 'confirmar_conclusao_conector', '   ', 'run-1')))?.code, '23514');
    assert.equal((await falha(reconciliar(u.admin, id, 'confirmar_conclusao_conector', 'Justificativa válida e longa.', ' ')))?.code, '23514');
    assert.equal((await falha(reconciliar(u.admin, id, 'reenviar_tudo')))?.code, '22023');
    assert.equal(await statusDe(id), 'resultado_indeterminado', 'pedidos inválidos não alteram nada');

    const retorno = (await reconciliar(u.admin, id, 'confirmar_conclusao_conector', 'Mensagem localizada no histórico do Outlook.', 'run-98765')).rows[0].r;
    assert.equal(retorno.status, 'acao_conector_concluida');
    const auditoria = await um('select * from public.reversa_comunicacoes_reconciliacoes where comunicacao_id = $1', [id]);
    assert.equal(auditoria.administrador_id, u.admin.id);
    assert.equal(auditoria.administrador_nome, 'Admin ciclo');
    assert.equal(auditoria.referencia, 'run-98765');
    assert.equal(auditoria.status_anterior, 'resultado_indeterminado');
    assert.equal(auditoria.status_novo, 'acao_conector_concluida');
    assert.equal(auditoria.valores_anteriores.status, 'resultado_indeterminado');
    assert.equal(auditoria.valores_novos.status, 'acao_conector_concluida');
    assert.ok(auditoria.realizado_em);

    assert.equal((await falha(reconciliar(u.admin2, id, 'autorizar_nova_tentativa')))?.code, '55000', 'comunicação concluída não pode ser reenviada');
    assert.equal(await reservar(), null);
    const imutavel = await falha(db.query("update public.reversa_comunicacoes_reconciliacoes set justificativa = 'alterada alterada' where comunicacao_id = $1", [id]));
    assert.equal(imutavel?.code, '42501');
    const historico = (await como(c1, u.admin, 'select public.listar_historico_comunicacao_reversa($1) as h', [id])).rows[0].h;
    assert.equal(historico.tentativas.length, 1, 'o histórico de tentativas é preservado');
    assert.equal(historico.reconciliacoes.length, 1);
  });

  it('só autoriza nova tentativa em resultado_indeterminado, revalida antes de enviar e preserva o histórico', async () => {
    const { id } = await gerarIndeterminada();
    const antes = await um('select tentativas, max_tentativas from public.reversa_comunicacoes_etiqueta where id = $1', [id]);
    await reconciliar(u.admin, id, 'autorizar_nova_tentativa', 'Sem registro de envio no histórico do fluxo.', 'run-sem-envio-1');
    const depois = await um('select status, tentativas, max_tentativas from public.reversa_comunicacoes_etiqueta where id = $1', [id]);
    assert.equal(depois.status, 'pendente');
    assert.equal(depois.tentativas, antes.tentativas);
    assert.ok(depois.max_tentativas > depois.tentativas);

    // O solicitante perde o acesso antes da nova tentativa: nada é enviado.
    await db.query(`update auth.users set raw_app_meta_data = raw_app_meta_data || '{"telas": []}'::jsonb where id = $1`, [u.solicitante.id]);
    try {
      await db.query('update public.reversa_comunicacoes_etiqueta set proxima_tentativa_em = now() where id = $1', [id]);
      const reserva = await reservar();
      assert.equal(reserva.comunicacao_id, id);
      assert.equal(await iniciar(reserva), null);
      assert.equal(await statusDe(id), 'acesso_revogado');
    } finally {
      await db.query(`update auth.users set raw_app_meta_data = raw_app_meta_data || '{"telas": ["formulario-alinare"]}'::jsonb where id = $1`, [u.solicitante.id]);
    }
    const tentativas = await q('select resultado from public.reversa_comunicacoes_etiqueta_tentativas where comunicacao_id = $1', [id]);
    assert.equal(tentativas.length, 1, 'a tentativa indeterminada anterior continua no histórico');
  });

  it('com o acesso preservado a nova tentativa é uma tentativa a mais, não um novo pedido', async () => {
    const { id } = await gerarIndeterminada();
    await reconciliar(u.admin, id, 'autorizar_nova_tentativa', 'Sem registro de envio no histórico do fluxo.', 'run-sem-envio-2');
    const reserva = await reservar();
    const dados = await iniciar(reserva);
    assert.equal(dados.comunicacao_id, id);
    assert.equal((await um('select tentativas from public.reversa_comunicacoes_etiqueta where id = $1', [id])).tentativas, 2);
    await finalizar(reserva, 'acao_conector_concluida', 200, null);
    assert.equal((await falha(reconciliar(u.admin, id, 'autorizar_nova_tentativa')))?.code, '55000');
    assert.equal((await q('select 1 from public.reversa_comunicacoes_reconciliacoes where comunicacao_id = $1', [id])).length, 1);
  });

  it('administradores concorrentes: uma ação vale, a outra é recusada e a auditoria tem uma linha', async () => {
    const { id } = await gerarIndeterminada();
    const outra = await banco.conectar();
    const pid = (await outra.query('select pg_backend_pid() as pid')).rows[0].pid;
    await c1.query('begin');
    let segunda;
    try {
      await iniciarSessao(c1, u.admin);
      await c1.query('select public.reconciliar_comunicacao_reversa($1, $2, $3, $4)',
        [id, 'confirmar_conclusao_conector', 'Primeiro administrador conferiu.', 'run-a']);
      segunda = falha(reconciliar(u.admin2, id, 'autorizar_nova_tentativa', 'Segundo administrador conferiu.', 'run-b', outra));
      assert.equal(await esperarBloqueio(db, pid), true, 'a segunda ação aguarda a trava da linha');
      await c1.query('commit');
    } catch (erro) {
      await c1.query('rollback').catch(() => {});
      throw erro;
    }
    assert.equal((await segunda)?.code, '55000');
    assert.equal(await statusDe(id), 'acao_conector_concluida');
    assert.equal((await q('select 1 from public.reversa_comunicacoes_reconciliacoes where comunicacao_id = $1', [id])).length, 1);
  });

  it('não existe operação em lote e nenhuma função executável recebe e-mail ou destinatário', async () => {
    const funcoes = await q(`select p.proname, pg_get_function_identity_arguments(p.oid) as args,
        has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('service_role', p.oid, 'execute') as executavel
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname ~ '(comunicac)'`);
    assert.ok(funcoes.length > 5);
    for (const f of funcoes) {
      assert.doesNotMatch(f.proname, /(reenviar|retentar|todas|lote|tudo)/);
      if (f.executavel) assert.doesNotMatch(f.args, /(email|destinat)/i, `${f.proname}(${f.args})`);
    }
  });

  it('privilégios: nada executável por anon; internas só pelo banco; RPCs administrativas só autenticadas', async () => {
    const executa = async (papel, assinatura) =>
      (await um(`select has_function_privilege($1, $2::regprocedure, 'execute') as ok`, [papel, assinatura])).ok;
    const internas = [
      'public.reversa_enfileirar_comunicacao(uuid, text, uuid, uuid, text, uuid, jsonb)',
      'public.reversa_enfileirar_aprovadores(uuid, uuid, integer)',
      'public.reversa_enfileirar_operadores(uuid, uuid, integer)',
      'public.reversa_aprovador_pode_decidir(uuid, uuid)',
      'public.reversa_usuario_pode_ler_para_comunicacao(uuid, uuid)',
      'public.reversa_comunicacao_apos_postagem()',
      'public.reversa_comunicacao_apos_recebimento()',
      'public.reversa_comunicacao_apos_evento_aprovacao()',
    ];
    for (const assinatura of internas) {
      for (const papel of ['anon', 'authenticated', 'service_role']) {
        assert.equal(await executa(papel, assinatura), false, `${papel} não executa ${assinatura}`);
      }
    }
    const administrativas = [
      'public.listar_comunicacoes_reversa(text, text, text, uuid, integer, integer)',
      'public.listar_historico_comunicacao_reversa(uuid)',
      'public.resumo_comunicacoes_reversa()',
      'public.reconciliar_comunicacao_reversa(uuid, text, text, text)',
    ];
    for (const assinatura of administrativas) {
      assert.equal(await executa('anon', assinatura), false);
      assert.equal(await executa('authenticated', assinatura), true);
    }
    for (const assinatura of ['public.reversa_claim_comunicacao_etiqueta()', 'public.reversa_iniciar_comunicacao_etiqueta(uuid, uuid)',
      'public.reversa_finalizar_comunicacao_etiqueta_v2(uuid, uuid, text, integer, text)']) {
      assert.equal(await executa('authenticated', assinatura), false);
      assert.equal(await executa('service_role', assinatura), true);
    }
  });
});

describe('consistência transacional', () => {
  it('se o registro do evento falha, a decisão de aprovação não persiste', async () => {
    const pedido = await novoPedido(u.solicitante, 'Alinare', 'Falha ao registrar aviso');
    await db.query(`create function public.zz_falha_teste() returns trigger language plpgsql as
      $$ begin raise exception 'falha injetada no registro do aviso' using errcode = 'P0001'; end $$`);
    await db.query(`create trigger zz_falha_teste before insert on public.reversa_comunicacoes_etiqueta
      for each row when (new.evento = 'pedido_aprovado') execute function public.zz_falha_teste()`);
    try {
      const erro = await falha(aprovar(pedido));
      assert.equal(erro?.code, 'P0001');
      const atual = await um('select aprovacao_status from public.solicitacoes_reverso where id = $1', [pedido.id]);
      assert.equal(atual.aprovacao_status, 'aguardando_aprovacao', 'sem aviso registrado não há mudança de estado');
      assert.equal((await q("select 1 from public.solicitacoes_aprovacoes where solicitacao_id = $1 and evento = 'aprovada'", [pedido.id])).length, 0);
      assert.equal((await filasDoPedido(pedido.id, 'pedido_aprovado')).length, 0);
    } finally {
      await db.query('drop trigger zz_falha_teste on public.reversa_comunicacoes_etiqueta');
      await db.query('drop function public.zz_falha_teste()');
    }
    await aprovar(pedido);
    assert.equal((await filasDoPedido(pedido.id, 'pedido_aprovado')).length, 1);
  });

  it('se o pedido não é gravado, nenhum aviso órfão permanece; a falha do aviso impede o pedido', async () => {
    await db.query(`create function public.zz_falha_teste2() returns trigger language plpgsql as
      $$ begin raise exception 'falha injetada no pedido' using errcode = 'P0001'; end $$`);
    await db.query(`create trigger zz_falha_teste2 before insert on public.reversa_comunicacoes_etiqueta
      for each row when (new.evento = 'pedido_criado') execute function public.zz_falha_teste2()`);
    try {
      const erro = await falha(novoPedido(u.solicitante, 'Alinare', 'Pedido que não pode nascer'));
      assert.equal(erro?.code, 'P0001');
      assert.equal((await q("select 1 from public.solicitacoes_reverso where nome_cliente = 'Pedido que não pode nascer'")).length, 0);
    } finally {
      await db.query('drop trigger zz_falha_teste2 on public.reversa_comunicacoes_etiqueta');
      await db.query('drop function public.zz_falha_teste2()');
    }
    assert.equal((await q(`select 1 from public.reversa_comunicacoes_etiqueta c
      where not exists (select 1 from public.solicitacoes_reverso r where r.id = c.solicitacao_id)`)).length, 0, 'nenhum aviso sem pedido');
  });
});

describe('consistência transacional dos demais eventos', () => {
  async function comFalhaNoEvento(evento, acao) {
    await db.query(`create function public.zz_falha_evento() returns trigger language plpgsql as
      $$ begin raise exception 'falha injetada no registro do aviso' using errcode = 'P0001'; end $$`);
    await db.query(`create trigger zz_falha_evento before insert on public.reversa_comunicacoes_etiqueta
      for each row when (new.evento = '${evento}') execute function public.zz_falha_evento()`);
    try {
      const erro = await falha(acao());
      assert.equal(erro?.code, 'P0001', `${evento}: a falha do aviso deve abortar a operação`);
    } finally {
      await db.query('drop trigger zz_falha_evento on public.reversa_comunicacoes_etiqueta');
      await db.query('drop function public.zz_falha_evento()');
    }
  }

  it('rejeição, PDF vinculado, postagem e recebimento não persistem sem o aviso correspondente', async () => {
    const rejeitado = await novoPedido(u.solicitante, 'Alinare', 'Falha na rejeição');
    await comFalhaNoEvento('pedido_rejeitado', () => como(c1, u.aprovador,
      'select * from public.rejeitar_reversa($1, $2, $3)', [rejeitado.id, rejeitado.aprovacao_versao, 'Motivo da rejeição registrado.']));
    assert.equal((await um('select aprovacao_status from public.solicitacoes_reverso where id = $1', [rejeitado.id])).aprovacao_status, 'aguardando_aprovacao');
    assert.equal((await q("select 1 from public.solicitacoes_aprovacoes where solicitacao_id = $1 and evento = 'rejeitada'", [rejeitado.id])).length, 0);

    const pedido = await novoPedido(u.solicitante, 'Alinare', 'Falha em etiqueta, postagem e recebimento');
    await aprovar(pedido);
    await comFalhaNoEvento('etiqueta_disponivel', () => emissaoComPdf(pedido));
    assert.equal((await q('select 1 from public.reversa_emissoes where solicitacao_id = $1', [pedido.id])).length, 0, 'sem aviso, a emissão com PDF não é gravada');

    const emissao = await emissaoComPdf(pedido);
    await comFalhaNoEvento('postagem_confirmada', () => como(c1, u.confirmador, 'select * from public.confirmar_postagem_emissao($1, null, null)', [emissao.id]));
    const aposFalha = await um('select postagem_confirmada_em, postagem_fonte from public.reversa_emissoes where id = $1', [emissao.id]);
    assert.deepEqual([aposFalha.postagem_confirmada_em, aposFalha.postagem_fonte], [null, null]);
    assert.equal((await um('select status from public.solicitacoes_reverso where id = $1', [pedido.id])).status, 'pendente', 'a etapa não avançou');

    await db.query("update public.solicitacoes_reverso set status = 'em_transito', postado_em = now(), em_transito_em = now() where id = $1", [pedido.id]);
    await comFalhaNoEvento('recebimento_confirmado', () => como(c1, u.confirmador, 'select public.confirmar_recebimento_mercadoria($1)', [pedido.id]));
    assert.equal((await um('select status from public.solicitacoes_reverso where id = $1', [pedido.id])).status, 'em_transito');
    assert.equal((await q('select 1 from public.reversa_recebimentos_confirmados where solicitacao_id = $1', [pedido.id])).length, 0);
    assert.equal((await q('select 1 from public.solicitacoes_historico where solicitacao_id = $1 and acao like $2', [pedido.id, '%Recebimento%'])).length, 0);
  });
});

describe('relatórios por empresa e período', () => {
  const dataset = {};
  before(async () => {
    const mk = async (solicitante, empresa, cliente, data, motivo, aprovador) => {
      const pedido = await novoPedido(solicitante, empresa, cliente, { data, motivo });
      if (aprovador) await aprovar(pedido, aprovador);
      return pedido;
    };
    // Alinare, março/2031
    dataset.a1 = await mk(u.solicitante, 'Alinare', 'Relatório A1', '2031-03-10', 'Peça com defeito', u.aprovador);
    dataset.a2 = await mk(u.solicitante, 'Alinare', 'Relatório A2', '2031-03-11', 'Peça com defeito', u.aprovador);
    dataset.a3 = await mk(u.solicitante, 'Alinare', 'Relatório A3', '2031-03-12', 'Outros', null);
    dataset.a4 = await mk(u.solicitante, 'Alinare', 'Relatório A4', '2031-04-01', 'Outros', u.aprovador);
    dataset.n1 = await mk(u.solicitanteNovitah, 'Novitah', 'Relatório N1', '2031-03-10', 'Peça com defeito', u.aprovadorNovitah);
    await como(c1, u.aprovador, 'select * from public.rejeitar_reversa($1, $2, $3)', [dataset.a3.id, dataset.a3.aprovacao_versao, 'Sem comprovação suficiente.']);

    // a1: emissão + reemissão; postagem confirmada na primeira (a emissão original foi usada).
    const e1 = await emissaoComPdf(dataset.a1, { sequencia: 1, emitida: '2031-03-12', valida: '2031-04-12' });
    await como(c1, u.confirmador, 'select * from public.confirmar_postagem_emissao($1, null, null)', [e1.id]);
    const novoId = (await um('select gen_random_uuid() as id')).id;
    await db.query('begin');
    await db.query('update public.reversa_emissoes set substituida_em = now(), substituida_por_id = $2 where id = $1', [e1.id, novoId]);
    await db.query(`insert into public.reversa_emissoes
      (id, solicitacao_id, sequencia, origem, emissao_anterior_id, motivo_reemissao, pdf_path, pdf_nome, emitida_em, valida_ate)
      values ($1, $2, 2, 'sistema', $3, 'pdf_incorreto', $4, 'nova.pdf', '2031-03-20', '2031-04-20')`,
    [novoId, dataset.a1.id, e1.id, `${dataset.a1.id}/2.pdf`]);
    await db.query('commit');
    // a2: etiqueta vencida (validade no passado) e sem postagem confirmada
    await emissaoComPdf(dataset.a2, { sequencia: 1, emitida: '2019-12-01', valida: '2020-01-01' });
    // a4: com emissão vigente ainda válida
    await emissaoComPdf(dataset.a4, { sequencia: 1, emitida: '2031-04-02', valida: '2099-01-01' });
    // n1: emitida e recebida manualmente
    const en = await emissaoComPdf(dataset.n1, { sequencia: 1, emitida: '2031-03-14', valida: '2099-01-01' });
    await db.query("update public.solicitacoes_reverso set status = 'em_transito', postado_em = now(), em_transito_em = now() where id = $1", [dataset.n1.id]);
    const confirmadorNovitah = await criarUsuario(db, 'Confirmador Novitah ciclo', ['confirmar-novitah']);
    await como(c1, confirmadorNovitah, 'select public.confirmar_recebimento_mercadoria($1)', [dataset.n1.id]);
    assert.ok(en);
  });

  const rel = async (persona, empresa, campo, inicio, fim) =>
    (await como(c1, persona, 'select public.relatorio_reversa($1, $2, $3, $4) as r', [empresa, campo, inicio, fim])).rows[0].r;

  it('conta solicitações, motivo, aprovação e situação logística por empresa e pela data escolhida', async () => {
    const todas = await rel(u.gestorGeral, null, 'solicitacao', '2031-03-01', '2031-04-30');
    assert.equal(todas.solicitacoes, 5);
    assert.deepEqual(todas.por_empresa, { Alinare: 4, Novitah: 1 });
    assert.deepEqual(Object.fromEntries(todas.por_motivo.map((m) => [m.motivo, m.quantidade])), { 'Peça com defeito': 3, Outros: 2 });
    assert.equal(todas.aprovacao.aprovada, 4);
    assert.equal(todas.aprovacao.rejeitada, 1);
    assert.equal(todas.aprovacao.aguardando, 0);
    assert.equal(todas.logistica.sem_liberacao_logistica, 1, 'o rejeitado não entra na situação logística');
    assert.equal(todas.logistica.postado, 1);
    assert.equal(todas.logistica.em_transito, 0);
    assert.equal(todas.logistica.concluido, 1);
    assert.deepEqual(todas.filtro, { empresa: null, campo_data: 'solicitacao', inicio: '2031-03-01', fim: '2031-04-30' });

    const alinareMarco = await rel(u.gestorGeral, 'Alinare', 'solicitacao', '2031-03-01', '2031-03-31');
    assert.equal(alinareMarco.solicitacoes, 3);
    assert.deepEqual(alinareMarco.por_empresa, { Alinare: 3 });
    assert.equal((await rel(u.gestorGeral, 'Novitah', 'solicitacao', '2031-04-01', '2031-04-30')).solicitacoes, 0);
  });

  it('diferencia solicitação, emissão, reemissão, postagem confirmada e etiqueta vencida sem postagem confirmada', async () => {
    const r = await rel(u.gestorGeral, 'Alinare', 'solicitacao', '2031-03-01', '2031-04-30');
    assert.equal(r.emissoes.total, 4, 'a1 tem 2, a2 tem 1 e a4 tem 1');
    assert.equal(r.emissoes.primeiras_emissoes, 3);
    assert.equal(r.emissoes.reemissoes, 1);
    assert.equal(r.emissoes.pedidos_com_emissao, 3);
    assert.equal(r.emissoes.pedidos_com_reemissao, 1);
    assert.equal(r.postagem.pedidos_com_postagem_confirmada, 1);
    assert.equal(r.postagem.pedidos_com_etiqueta_vencida_sem_postagem_confirmada, 1, 'a2: vencida e sem confirmação');
    assert.equal(r.recebimento.recebimento_confirmado_manualmente, 0);
    const novitah = await rel(u.gestorGeral, 'Novitah', 'solicitacao', '2031-03-01', '2031-04-30');
    assert.equal(novitah.recebimento.recebimento_confirmado_manualmente, 1);
    assert.equal(novitah.recebimento.concluidos, 1);
    assert.equal(r.custo_disponivel, false, 'o modelo não tem custo de frete nem tarifa');
    assert.ok(!JSON.stringify(r).toLowerCase().includes('nao_utilizada'));
    assert.ok(!('economia' in r) && !('taxa_utilizacao' in r));
  });

  it('o filtro por emissão ou postagem usa essas datas, e não a da solicitação', async () => {
    const porEmissao = await rel(u.gestorGeral, 'Alinare', 'emissao', '2031-03-20', '2031-03-20');
    assert.equal(porEmissao.solicitacoes, 1, 'só a reemissão de a1 ocorreu em 20/03');
    assert.equal(porEmissao.emissoes.total, 1);
    assert.equal(porEmissao.emissoes.reemissoes, 1);
    const hoje = (await um("select (now() at time zone 'America/Sao_Paulo')::date::text as d")).d;
    assert.equal((await rel(u.gestorGeral, 'Alinare', 'postagem', hoje, hoje)).postagem.pedidos_com_postagem_confirmada >= 1, true);
    assert.equal((await rel(u.gestorGeral, 'Alinare', 'postagem', '2031-03-01', '2031-03-31')).solicitacoes, 0);
    assert.equal((await rel(u.gestorGeral, 'Alinare', 'decisao', '2031-03-01', '2031-03-31')).solicitacoes, 0);
    assert.ok((await rel(u.gestorGeral, 'Alinare', 'decisao', hoje, hoje)).solicitacoes >= 4);
  });

  it('respeita o escopo de acesso no banco e valida parâmetros', async () => {
    const alinareApenas = await rel(u.gestorAlinare, null, 'solicitacao', '2031-03-01', '2031-04-30');
    assert.deepEqual(alinareApenas.por_empresa, { Alinare: 4 }, 'sem acesso à Novitah, mesmo sem filtrar empresa');
    assert.equal((await rel(u.gestorAlinare, 'Novitah', 'solicitacao', '2031-03-01', '2031-04-30')).solicitacoes, 0);
    const propria = await rel(u.solicitanteNovitah, null, 'solicitacao', '2031-03-01', '2031-04-30');
    assert.equal(propria.solicitacoes, 1, 'o solicitante só enxerga o que é seu');
    assert.equal((await falha(rel(u.gestorGeral, null, 'situacao', null, null)))?.code, '22023');
    assert.equal((await falha(rel(u.gestorGeral, 'Outra', 'solicitacao', null, null)))?.code, '22023');
    assert.equal((await falha(rel(u.gestorGeral, null, 'solicitacao', '2031-05-01', '2031-04-01')))?.code, '22023');
    assert.equal((await falha(como(c1, ANON, 'select public.relatorio_reversa()')))?.code, '42501');
  });

  it('as linhas exportáveis seguem os mesmos filtros e não carregam dados pessoais da cliente', async () => {
    const linhas = (await como(c1, u.gestorGeral, 'select * from public.relatorio_reversa_linhas($1, $2, $3, $4)',
      ['Alinare', 'solicitacao', '2031-03-01', '2031-04-30'])).rows;
    assert.equal(linhas.length, 4);
    assert.deepEqual(Object.keys(linhas[0]).sort(), [
      'data_solicitacao', 'decisao_em', 'emissoes', 'empresa', 'etiqueta_vencida_sem_postagem_confirmada', 'motivo', 'pedido',
      'postagem_confirmada_em', 'recebimento_confirmado_manualmente_em', 'reemissoes', 'setor', 'situacao_aprovacao',
      'situacao_logistica', 'ultima_emissao_em', 'valida_ate',
    ].sort());
    const a2 = linhas.find((l) => l.pedido === 'RV-' + dataset.a2.id.slice(0, 8).toUpperCase());
    assert.equal(a2.etiqueta_vencida_sem_postagem_confirmada, true);
    const a1 = linhas.find((l) => l.pedido === 'RV-' + dataset.a1.id.slice(0, 8).toUpperCase());
    assert.equal(a1.reemissoes, 1);
    assert.equal(a1.etiqueta_vencida_sem_postagem_confirmada, false);
    const escopo = (await como(c1, u.gestorAlinare, 'select * from public.relatorio_reversa_linhas($1, $2, $3, $4)',
      [null, 'solicitacao', '2031-03-01', '2031-04-30'])).rows;
    assert.ok(escopo.every((l) => l.empresa === 'Alinare'));
    assert.equal((await falha(como(c1, u.gestorGeral, 'select * from public.relatorio_reversa_linhas(null, $1, null, null, 0)', ['solicitacao'])))?.code, '22023');
  });

  it('conta juntos o motivo antigo "Mercadoria errada" e o atual "Mercadoria Errada"', async () => {
    await novoPedido(u.solicitante, 'Alinare', 'Motivo antigo', { data: '2032-05-10', motivo: 'Mercadoria errada' });
    await novoPedido(u.solicitante, 'Alinare', 'Motivo atual', { data: '2032-05-11', motivo: 'Mercadoria Errada' });
    await novoPedido(u.solicitante, 'Alinare', 'Outro motivo', { data: '2032-05-12', motivo: 'Peça com defeito' });
    const r = await rel(u.gestorGeral, 'Alinare', 'solicitacao', '2032-05-01', '2032-05-31');
    assert.deepEqual(r.por_motivo, [
      { motivo: 'Mercadoria Errada', quantidade: 2 },
      { motivo: 'Peça com defeito', quantidade: 1 },
    ]);
    const linhas = (await como(c1, u.gestorGeral, 'select motivo from public.relatorio_reversa_linhas($1, $2, $3, $4)',
      ['Alinare', 'solicitacao', '2032-05-01', '2032-05-31'])).rows.map((l) => l.motivo).sort();
    assert.deepEqual(linhas, ['Mercadoria Errada', 'Mercadoria Errada', 'Peça com defeito']);
  });
});
