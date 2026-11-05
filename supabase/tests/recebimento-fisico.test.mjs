import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ANON, como, criarUsuario, iniciarBanco, migrationsNovas, SERVICE_ROLE } from './lib/banco.mjs';

// Sequência: emitido -> postado -> entregue (informado pelos Correios) -> recebido fisicamente.
// Nenhuma chamada real aos Correios: a entrega é simulada do mesmo modo que a Edge Function
// correios-rastreio a grava (service_role: status + concluido_em, e o histórico "Rastreio: ...").
let banco;
let db;
let c1;
let c2;
let contador = 0;
const u = {};
const falha = (promessa) => promessa.then(() => null, (erro) => erro);
const q = async (sql, params) => (await db.query(sql, params)).rows;
const um = async (sql, params) => (await q(sql, params))[0];

const novoPedido = async (empresa, cliente) =>
  (await como(c1, u.solicitante, `
    insert into public.solicitacoes_reverso
      (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo)
    values ($1, current_date, 'Nome digitado ignorado', 'Comercial', 9901, $2, 'Rua de teste, 1', 'Outros')
    returning *`, [empresa, cliente])).rows[0];

const emitidoEPostado = async (empresa, cliente) => {
  const pedido = await novoPedido(empresa, cliente);
  await como(c1, empresa === 'Alinare' ? u.aprovador : u.aprovadorNovitah,
    'select * from public.aprovar_reversa($1, $2, null)', [pedido.id, pedido.aprovacao_versao]);
  const emissao = (await db.query(`
    insert into public.reversa_emissoes
      (solicitacao_id, sequencia, origem, codigo_autorizacao, codigo_rastreio, pdf_path, pdf_nome, emitida_em, valida_ate)
    values ($1, 1, 'sistema', 'AUT-1', $3, $2, 'etiqueta.pdf', current_date, current_date + 30) returning *`,
  [pedido.id, `${pedido.id}/1.pdf`, `BR${String(++contador).padStart(9, '0')}BR`])).rows[0];
  await como(c1, empresa === 'Alinare' ? u.confirmador : u.confirmadorNovitah,
    'select * from public.confirmar_postagem_emissao($1, null, null)', [emissao.id]);
  return { pedido, emissao };
};

/** Entrega informada pelos Correios: o rastreio conclui o pedido e registra o histórico. */
const entregaPeloCorreios = async (id) => {
  await db.query("update public.solicitacoes_reverso set status = 'em_transito', em_transito_em = now() where id = $1", [id]);
  await como(c1, SERVICE_ROLE, "update public.solicitacoes_reverso set status = 'concluido', concluido_em = now() where id = $1", [id]);
  await como(c1, SERVICE_ROLE,
    "insert into public.solicitacoes_historico (solicitacao_id, user_nome, acao) values ($1, 'Sistema (Correios)', 'Rastreio: Objeto entregue ao destinatário')", [id]);
};

const confirmar = (persona, id, conexao = c1) =>
  como(conexao, persona, 'select * from public.confirmar_recebimento_mercadoria($1)', [id]);
const pendentesDe = async (persona) =>
  (await como(c1, persona, 'select solicitacao_id from public.listar_recebimentos_fisicos_pendentes()')).rows.map((l) => l.solicitacao_id);
const avisosRecebimento = (id) => q(`
  select canal, destinatario_id, status, contexto from public.reversa_comunicacoes_etiqueta
   where solicitacao_id = $1 and evento = 'recebimento_confirmado'`, [id]);

before(async () => {
  banco = await iniciarBanco();
  db = banco.dono;
  for (const arquivo of migrationsNovas()) await banco.aplicar(arquivo);
  c1 = await banco.conectar();
  c2 = await banco.conectar();
  Object.assign(u, {
    admin: await criarUsuario(db, 'Admin recebimento', ['usuarios']),
    solicitante: await criarUsuario(db, 'Solicitante recebimento', ['formulario-alinare']),
    aprovador: await criarUsuario(db, 'Aprovador recebimento', ['aprovar-alinare']),
    aprovadorNovitah: await criarUsuario(db, 'Aprovador Novitah recebimento', ['aprovar-novitah']),
    confirmador: await criarUsuario(db, 'Confirmador recebimento', ['confirmar-alinare']),
    confirmador2: await criarUsuario(db, 'Segundo confirmador recebimento', ['confirmar-alinare']),
    confirmadorNovitah: await criarUsuario(db, 'Confirmador Novitah recebimento', ['confirmar-novitah']),
    kanbanAlinare: await criarUsuario(db, 'Kanban editor recebimento', ['kanban-edit', 'lista-alinare']),
    gestor: await criarUsuario(db, 'Gestor recebimento', ['dashboard-alinare', 'lista-alinare']),
    operadorEtiqueta: await criarUsuario(db, 'Emissor recebimento', ['emitir-alinare']),
  });
  // Kanban editável vale para as empresas do escopo do usuário (empresas_acesso).
  await db.query("update auth.users set raw_app_meta_data = raw_app_meta_data || '{\"empresas_acesso\": [\"Alinare\"]}'::jsonb where id = $1", [u.kanbanAlinare.id]);
  await como(c1, u.admin, 'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)', ['Alinare', JSON.stringify([
    { usuario_id: u.aprovador.id, todos_setores: true, setores: [] },
  ])]);
  await como(c1, u.admin, 'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)', ['Novitah', JSON.stringify([
    { usuario_id: u.aprovadorNovitah.id, todos_setores: true, setores: [] },
  ])]);
});

after(async () => { await banco?.encerrar(); });

describe('recebimento físico depois da entrega informada pelos Correios', () => {
  it('emitido -> postado -> entregue pelos Correios -> recebido fisicamente, sem reabrir nem alterar o pedido', async () => {
    const { pedido, emissao } = await emitidoEPostado('Alinare', 'Entrega antes do recebimento');
    await entregaPeloCorreios(pedido.id);
    const antes = await um('select * from public.solicitacoes_reverso where id = $1', [pedido.id]);
    assert.equal(antes.status, 'concluido');
    assert.equal((await avisosRecebimento(pedido.id)).length, 0, 'a entrega da transportadora não avisa recebimento');
    assert.ok((await pendentesDe(u.confirmador)).includes(pedido.id), 'a pendência de confirmação física é listada ao operador');

    const retorno = (await confirmar(u.confirmador, pedido.id)).rows[0];
    assert.equal(retorno.status, 'concluido');

    // o pedido não foi tocado: mesma linha, mesmo concluido_em, mesma emissão
    const depois = await um('select * from public.solicitacoes_reverso where id = $1', [pedido.id]);
    assert.deepEqual(depois, antes);
    assert.equal(depois.concluido_em.getTime(), antes.concluido_em.getTime());
    const emissoes = await q('select id from public.reversa_emissoes where solicitacao_id = $1', [pedido.id]);
    assert.deepEqual(emissoes.map((e) => e.id), [emissao.id], 'nenhuma emissão nova');

    // autor e horário vêm do servidor e a informação dos Correios continua no histórico
    const linha = await um('select * from public.reversa_recebimentos_confirmados where solicitacao_id = $1', [pedido.id]);
    assert.equal(linha.confirmado_por, u.confirmador.id);
    assert.equal(linha.confirmado_por_nome, 'Confirmador recebimento');
    assert.ok(linha.confirmado_em.getTime() >= antes.concluido_em.getTime(), 'o horário é o da confirmação, não o da entrega');
    const historico = (await q('select user_nome, acao from public.solicitacoes_historico where solicitacao_id = $1 order by created_at, id', [pedido.id]))
      .map((h) => `${h.user_nome}|${h.acao}`);
    assert.ok(historico.includes('Sistema (Correios)|Rastreio: Objeto entregue ao destinatário'));
    assert.ok(historico.includes('Confirmador recebimento|Recebimento físico confirmado pela empresa após a entrega informada pelos Correios'));

    // um único aviso, somente agora, ao solicitante
    const avisos = await avisosRecebimento(pedido.id);
    assert.equal(avisos.length, 1);
    assert.deepEqual([avisos[0].canal, avisos[0].destinatario_id], ['email', u.solicitante.id]);
    assert.equal(new Date(avisos[0].contexto.transicao_em).getTime(), linha.confirmado_em.getTime());
    assert.ok(!(await pendentesDe(u.confirmador)).includes(pedido.id));
  });

  it('segunda confirmação é recusada e não duplica registro nem aviso', async () => {
    const { pedido } = await emitidoEPostado('Alinare', 'Confirmação duplicada');
    await entregaPeloCorreios(pedido.id);
    await confirmar(u.confirmador, pedido.id);
    const erro = await falha(confirmar(u.confirmador2, pedido.id));
    assert.equal(erro?.code, '55000');
    assert.match(erro.message, /já foi confirmado/);
    assert.equal((await q('select 1 from public.reversa_recebimentos_confirmados where solicitacao_id = $1', [pedido.id])).length, 1);
    assert.equal((await avisosRecebimento(pedido.id)).length, 1);
  });

  it('confirmações simultâneas: uma vale, a outra é recusada, um único aviso', async () => {
    const { pedido } = await emitidoEPostado('Alinare', 'Confirmação concorrente');
    await entregaPeloCorreios(pedido.id);
    const [a, b] = await Promise.allSettled([confirmar(u.confirmador, pedido.id, c1), confirmar(u.confirmador2, pedido.id, c2)]);
    const resultados = [a, b];
    assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
    const recusada = resultados.find((r) => r.status === 'rejected');
    assert.equal(recusada.reason.code, '55000');
    assert.equal((await q('select 1 from public.reversa_recebimentos_confirmados where solicitacao_id = $1', [pedido.id])).length, 1);
    assert.equal((await avisosRecebimento(pedido.id)).length, 1);
  });

  it('exige permissão de confirmação na empresa do pedido, no banco', async () => {
    const { pedido } = await emitidoEPostado('Alinare', 'Permissão por empresa');
    await entregaPeloCorreios(pedido.id);
    for (const [nome, persona] of [
      ['confirmador de outra empresa', u.confirmadorNovitah],
      ['solicitante', u.solicitante],
      ['gestor só de leitura', u.gestor],
      ['emissor de etiqueta', u.operadorEtiqueta],
    ]) {
      assert.equal((await falha(confirmar(persona, pedido.id)))?.code, '42501', nome);
      assert.deepEqual(await pendentesDe(persona), [], `${nome} não vê pendências`);
    }
    assert.equal((await falha(confirmar(ANON, pedido.id)))?.code, '42501', 'anônimo');
    assert.equal((await q('select 1 from public.reversa_recebimentos_confirmados where solicitacao_id = $1', [pedido.id])).length, 0);
    // quem tem o Kanban editável (capacidade herdada de antes) e o administrador continuam podendo
    assert.ok((await pendentesDe(u.kanbanAlinare)).includes(pedido.id));
    await confirmar(u.admin, pedido.id);
    assert.equal((await um('select confirmado_por_nome from public.reversa_recebimentos_confirmados where solicitacao_id = $1', [pedido.id])).confirmado_por_nome, 'Admin recebimento');
  });

  it('não registra sem ação de um operador: o serviço automático não confirma recebimento físico', async () => {
    const { pedido } = await emitidoEPostado('Alinare', 'Sem operador');
    await entregaPeloCorreios(pedido.id);
    assert.equal((await falha(como(c1, SERVICE_ROLE, 'select * from public.confirmar_recebimento_mercadoria($1)', [pedido.id])))?.code, '42501');
    assert.equal((await q('select 1 from public.reversa_recebimentos_confirmados where solicitacao_id = $1', [pedido.id])).length, 0);
    assert.equal((await avisosRecebimento(pedido.id)).length, 0);
    assert.deepEqual(await como(c1, SERVICE_ROLE, 'select * from public.listar_recebimentos_fisicos_pendentes()').then((r) => r.rows), []);
  });

  it('não libera todo pedido concluído: sem o registro de entrega dos Correios a confirmação é recusada', async () => {
    const { pedido } = await emitidoEPostado('Alinare', 'Concluído sem origem identificada');
    await db.query("update public.solicitacoes_reverso set status = 'em_transito', em_transito_em = now() where id = $1", [pedido.id]);
    await como(c1, SERVICE_ROLE, "update public.solicitacoes_reverso set status = 'concluido', concluido_em = now() where id = $1", [pedido.id]);
    assert.ok(!(await pendentesDe(u.confirmador)).includes(pedido.id));
    const erro = await falha(confirmar(u.confirmador, pedido.id));
    assert.equal(erro?.code, '55000');
    assert.equal((await q('select 1 from public.reversa_recebimentos_confirmados where solicitacao_id = $1', [pedido.id])).length, 0);

    // um usuário não consegue fabricar o rastro dos Correios: o nome do autor é sempre o dele
    await como(c1, u.confirmador,
      "insert into public.solicitacoes_historico (solicitacao_id, user_nome, acao) values ($1, 'Sistema (Correios)', 'Rastreio: forjado')", [pedido.id]);
    const forjado = await um("select user_nome from public.solicitacoes_historico where solicitacao_id = $1 and acao = 'Rastreio: forjado'", [pedido.id]);
    assert.equal(forjado.user_nome, 'Confirmador recebimento');
    assert.equal((await falha(confirmar(u.confirmador, pedido.id)))?.code, '55000');
  });

  it('pedido concluído por confirmação manual anterior (histórico sem a tabela) não é confirmado de novo', async () => {
    const { pedido } = await emitidoEPostado('Alinare', 'Conclusão manual anterior');
    await db.query("update public.solicitacoes_reverso set status = 'em_transito', em_transito_em = now() where id = $1", [pedido.id]);
    await confirmar(u.confirmador, pedido.id);
    await db.query('delete from public.reversa_recebimentos_confirmados where solicitacao_id = $1', [pedido.id]);
    await como(c1, SERVICE_ROLE,
      "insert into public.solicitacoes_historico (solicitacao_id, user_nome, acao) values ($1, 'Sistema (Correios)', 'Rastreio: Objeto entregue')", [pedido.id]);
    assert.ok(!(await pendentesDe(u.confirmador)).includes(pedido.id));
    assert.equal((await falha(confirmar(u.confirmador, pedido.id)))?.code, '55000');
  });

  it('o fluxo em trânsito segue igual: conclui, registra autor e avisa uma vez', async () => {
    const { pedido } = await emitidoEPostado('Alinare', 'Em trânsito');
    await db.query("update public.solicitacoes_reverso set status = 'em_transito', em_transito_em = now() where id = $1", [pedido.id]);
    const retorno = (await confirmar(u.confirmador, pedido.id)).rows[0];
    assert.equal(retorno.status, 'concluido');
    assert.ok(retorno.concluido_em);
    const linha = await um('select * from public.reversa_recebimentos_confirmados where solicitacao_id = $1', [pedido.id]);
    assert.equal(linha.confirmado_em.getTime(), retorno.concluido_em.getTime());
    assert.equal((await avisosRecebimento(pedido.id)).length, 1);
  });

  it('outros estados continuam recusados', async () => {
    const { pedido } = await emitidoEPostado('Alinare', 'Ainda postado');
    const erro = await falha(confirmar(u.confirmador, pedido.id));
    assert.equal(erro?.code, '55000');
  });

  it('a confirmação não libera edição: o operador não reabre nem altera campos protegidos', async () => {
    const { pedido } = await emitidoEPostado('Alinare', 'Campos protegidos');
    await entregaPeloCorreios(pedido.id);
    await confirmar(u.confirmador, pedido.id);
    for (const sql of [
      "update public.solicitacoes_reverso set status = 'em_transito' where id = $1",
      "update public.solicitacoes_reverso set concluido_em = now() where id = $1",
      "update public.solicitacoes_reverso set nome_cliente = 'Outra pessoa' where id = $1",
    ]) {
      const erro = await falha(como(c1, u.confirmador, sql, [pedido.id]));
      assert.ok(erro, `deveria recusar: ${sql}`);
    }
    assert.equal((await um('select status from public.solicitacoes_reverso where id = $1', [pedido.id])).status, 'concluido');
    assert.equal((await falha(como(c1, u.confirmador,
      'delete from public.reversa_recebimentos_confirmados where solicitacao_id = $1', [pedido.id])))?.code, '42501');
  });

  it('se o aviso não puder ser registrado, a confirmação não persiste', async () => {
    const { pedido } = await emitidoEPostado('Alinare', 'Falha no aviso');
    await entregaPeloCorreios(pedido.id);
    await db.query(`create function public.zz_falha_evento() returns trigger language plpgsql as
      $$ begin raise exception 'falha injetada' using errcode = 'P0001'; end $$`);
    await db.query(`create trigger zz_falha_evento before insert on public.reversa_comunicacoes_etiqueta
      for each row when (new.evento = 'recebimento_confirmado') execute function public.zz_falha_evento()`);
    try {
      assert.equal((await falha(confirmar(u.confirmador, pedido.id)))?.code, 'P0001');
    } finally {
      await db.query('drop trigger zz_falha_evento on public.reversa_comunicacoes_etiqueta');
      await db.query('drop function public.zz_falha_evento()');
    }
    assert.equal((await q('select 1 from public.reversa_recebimentos_confirmados where solicitacao_id = $1', [pedido.id])).length, 0);
    assert.equal((await q("select 1 from public.solicitacoes_historico where solicitacao_id = $1 and acao like 'Recebimento físico%'", [pedido.id])).length, 0);
    await confirmar(u.confirmador, pedido.id);
    assert.equal((await avisosRecebimento(pedido.id)).length, 1);
  });

  it('privilégios: funções internas não são chamáveis e a listagem exige usuário autenticado', async () => {
    assert.ok(await falha(como(c1, u.admin, 'select public.reversa_conclusao_por_correios($1)', [u.solicitante.id])));
    assert.ok(await falha(como(c1, ANON, 'select * from public.listar_recebimentos_fisicos_pendentes()')));
  });

  it('relatórios passam a contar a confirmação física feita depois da entrega', async () => {
    const { pedido } = await emitidoEPostado('Alinare', 'Relatório pós-entrega');
    await entregaPeloCorreios(pedido.id);
    const lido = async () => (await como(c1, u.confirmador, "select public.relatorio_reversa('Alinare', 'solicitacao', current_date - 1, current_date + 1) as r")).rows[0].r;
    const antes = (await lido()).recebimento;
    await confirmar(u.confirmador, pedido.id);
    const depois = (await lido()).recebimento;
    assert.equal(depois.concluidos, antes.concluidos);
    assert.equal(depois.recebimento_confirmado_manualmente, antes.recebimento_confirmado_manualmente + 1);
  });
});
