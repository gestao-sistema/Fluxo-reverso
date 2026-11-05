import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ANON, como, criarUsuario, iniciarBanco, migrationsNovas, SERVICE_ROLE } from './lib/banco.mjs';

// A integração dos Correios (service_role) grava a postagem na emissão com fonte "rastreio" e o aviso
// "postagem confirmada" sai sozinho, sem ninguém confirmar nada. Nenhuma chamada real aos Correios.
let banco;
let db;
let c1;
let contador = 0;
const u = {};
const q = async (sql, params) => (await db.query(sql, params)).rows;
const um = async (sql, params) => (await q(sql, params))[0];
const falha = (promessa) => promessa.then(() => null, (erro) => erro);

const novoPedido = async (cliente) =>
  (await como(c1, u.solicitante, `
    insert into public.solicitacoes_reverso
      (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo)
    values ('Alinare', current_date, 'x', 'Comercial', 9902, $1, 'Rua de teste, 1', 'Outros')
    returning *`, [cliente])).rows[0];

const pedidoComEtiqueta = async (cliente, { rastreio = true } = {}) => {
  const pedido = await novoPedido(cliente);
  await como(c1, u.aprovador, 'select * from public.aprovar_reversa($1, $2, null)', [pedido.id, pedido.aprovacao_versao]);
  const codigo = rastreio ? `PR${String(++contador).padStart(9, '0')}BR` : null;
  const emissao = (await db.query(`
    insert into public.reversa_emissoes
      (solicitacao_id, sequencia, origem, codigo_autorizacao, codigo_rastreio, pdf_path, pdf_nome, emitida_em, valida_ate)
    values ($1, 1, 'sistema', 'AUT-1', $3, $2, 'etiqueta.pdf', current_date - 2, current_date + 30) returning *`,
  [pedido.id, `${pedido.id}/1.pdf`, codigo])).rows[0];
  await db.query("update public.solicitacoes_reverso set status = 'etiqueta_gerada' where id = $1", [pedido.id]);
  return { pedido, emissao, codigo };
};

const registrar = (conexaoPersona, id, codigo, data = null) =>
  como(c1, conexaoPersona, 'select * from public.registrar_postagem_rastreio($1, $2, $3)', [id, codigo, data]);
const avisosPostagem = (id) => q(`
  select canal, destinatario_id, status, contexto from public.reversa_comunicacoes_etiqueta
   where solicitacao_id = $1 and evento = 'postagem_confirmada'`, [id]);

before(async () => {
  banco = await iniciarBanco();
  db = banco.dono;
  for (const arquivo of migrationsNovas()) await banco.aplicar(arquivo);
  c1 = await banco.conectar();
  Object.assign(u, {
    admin: await criarUsuario(db, 'Admin postagem', ['usuarios']),
    solicitante: await criarUsuario(db, 'Solicitante postagem', ['formulario-alinare']),
    aprovador: await criarUsuario(db, 'Aprovador postagem', ['aprovar-alinare']),
    emissor: await criarUsuario(db, 'Emissor postagem', ['emitir-alinare']),
    confirmador: await criarUsuario(db, 'Confirmador postagem', ['confirmar-alinare']),
  });
  await como(c1, u.admin, 'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)', ['Alinare', JSON.stringify([
    { usuario_id: u.aprovador.id, todos_setores: true, setores: [] },
  ])]);
});

after(async () => { await banco?.encerrar(); });

describe('postagem informada pelo rastreio dos Correios', () => {
  it('grava a postagem na emissão com fonte rastreio e avisa o solicitante uma única vez, sem ação manual', async () => {
    const { pedido, emissao, codigo } = await pedidoComEtiqueta('Postagem automática');
    assert.equal((await avisosPostagem(pedido.id)).length, 0, 'nada antes da postagem');

    const hoje = (await um("select (now() at time zone 'America/Sao_Paulo')::date as d")).d;
    const dataPostagem = new Date(hoje.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    const retorno = (await registrar(SERVICE_ROLE, pedido.id, codigo, dataPostagem)).rows[0];
    assert.equal(retorno.postagem_fonte, 'rastreio');
    assert.equal(retorno.postagem_confirmada_por, null, 'nenhuma pessoa é indicada como autora');
    assert.equal(retorno.postagem_confirmada_por_nome, 'Sistema (Correios)');
    assert.equal(retorno.postagem_em.toISOString().slice(0, 10), dataPostagem);

    const avisos = await avisosPostagem(pedido.id);
    assert.ok(avisos.length >= 1);
    assert.ok(avisos.every((a) => a.destinatario_id === pedido.solicitado_por), 'só o solicitante é avisado');
    assert.equal(new Set(avisos.map((a) => a.canal)).size, avisos.length, 'um aviso por canal');

    const evento = await um("select user_nome, tipo from public.reversa_emissao_eventos where emissao_id = $1 and tipo = 'postagem_confirmada'", [emissao.id]);
    assert.equal(evento.user_nome, 'Sistema (Correios)');
    const historico = await um("select user_nome, acao from public.solicitacoes_historico where solicitacao_id = $1 and acao like 'Postagem informada pelos Correios%'", [pedido.id]);
    assert.equal(historico.user_nome, 'Sistema (Correios)');
  });

  it('é idempotente: repetir a consulta não grava de novo nem duplica o aviso', async () => {
    const { pedido, codigo } = await pedidoComEtiqueta('Postagem repetida');
    await registrar(SERVICE_ROLE, pedido.id, codigo);
    const antes = await avisosPostagem(pedido.id);
    const primeira = await um('select postagem_confirmada_em from public.reversa_emissoes where solicitacao_id = $1', [pedido.id]);
    await registrar(SERVICE_ROLE, pedido.id, codigo);
    await registrar(SERVICE_ROLE, pedido.id, codigo.toLowerCase());
    const depois = await avisosPostagem(pedido.id);
    assert.equal(depois.length, antes.length);
    const segunda = await um('select postagem_confirmada_em from public.reversa_emissoes where solicitacao_id = $1', [pedido.id]);
    assert.equal(segunda.postagem_confirmada_em.getTime(), primeira.postagem_confirmada_em.getTime());
    assert.equal((await q("select 1 from public.reversa_emissao_eventos where solicitacao_id = $1 and tipo = 'postagem_confirmada'", [pedido.id])).length, 1);
  });

  it('postagem já confirmada manualmente não é sobrescrita pelo rastreio', async () => {
    const { pedido, emissao, codigo } = await pedidoComEtiqueta('Postagem manual antes');
    await como(c1, u.confirmador, 'select * from public.confirmar_postagem_emissao($1, null, null)', [emissao.id]);
    const antes = await avisosPostagem(pedido.id);
    const retorno = (await registrar(SERVICE_ROLE, pedido.id, codigo)).rows[0];
    assert.equal(retorno.postagem_fonte, 'manual');
    assert.equal((await avisosPostagem(pedido.id)).length, antes.length);
  });

  it('sem emissão com aquele código não há o que confirmar (nada é inventado)', async () => {
    const semCodigo = await pedidoComEtiqueta('Sem rastreamento', { rastreio: false });
    assert.equal((await registrar(SERVICE_ROLE, semCodigo.pedido.id, 'ZZ000000000BR')).rows[0].id, null);
    const emissao = await um('select postagem_confirmada_em, postagem_fonte from public.reversa_emissoes where solicitacao_id = $1', [semCodigo.pedido.id]);
    assert.equal(emissao.postagem_confirmada_em, null);
    assert.equal((await avisosPostagem(semCodigo.pedido.id)).length, 0);
    // pedido inexistente
    assert.equal((await registrar(SERVICE_ROLE, '00000000-0000-4000-8000-000000000000', 'ZZ000000000BR')).rows[0].id, null);
  });

  it('data de postagem futura ou anterior à emissão não é gravada', async () => {
    const futura = await pedidoComEtiqueta('Data futura');
    const retornoFutura = (await registrar(SERVICE_ROLE, futura.pedido.id, futura.codigo, '2099-01-01')).rows[0];
    assert.equal(retornoFutura.postagem_em, null);
    const antiga = await pedidoComEtiqueta('Data anterior à emissão');
    const retornoAntiga = (await registrar(SERVICE_ROLE, antiga.pedido.id, antiga.codigo, '2000-01-01')).rows[0];
    assert.equal(retornoAntiga.postagem_em, null);
    assert.equal(retornoAntiga.postagem_fonte, 'rastreio', 'a postagem é registrada mesmo sem a data');
  });

  it('só service_role executa: usuários, anônimo e administradores são recusados', async () => {
    const { pedido, codigo } = await pedidoComEtiqueta('Privilégios');
    for (const persona of [u.admin, u.emissor, u.confirmador, u.solicitante, u.aprovador, ANON]) {
      const erro = await falha(registrar(persona, pedido.id, codigo));
      assert.ok(erro, 'a chamada deveria ser recusada');
      assert.equal(erro.code, '42501');
    }
    const emissao = await um('select postagem_confirmada_em from public.reversa_emissoes where solicitacao_id = $1', [pedido.id]);
    assert.equal(emissao.postagem_confirmada_em, null);
  });

  it('a conclusão pelos Correios continua sem aviso de recebimento físico', async () => {
    const { pedido, codigo } = await pedidoComEtiqueta('Entrega sem recebimento');
    await registrar(SERVICE_ROLE, pedido.id, codigo);
    await como(c1, SERVICE_ROLE, "update public.solicitacoes_reverso set status = 'postado', postado_em = now() where id = $1", [pedido.id]);
    await como(c1, SERVICE_ROLE, "update public.solicitacoes_reverso set status = 'concluido', concluido_em = now() where id = $1", [pedido.id]);
    const recebimento = await q("select 1 from public.reversa_comunicacoes_etiqueta where solicitacao_id = $1 and evento = 'recebimento_confirmado'", [pedido.id]);
    assert.equal(recebimento.length, 0);
    assert.equal((await q('select 1 from public.reversa_recebimentos_confirmados where solicitacao_id = $1', [pedido.id])).length, 0);
    assert.ok((await avisosPostagem(pedido.id)).length >= 1, 'o aviso de postagem confirmada permanece');
  });

  it('não é retroativo: pedido já postado antes da função fica sem aviso novo', async () => {
    const { pedido } = await pedidoComEtiqueta('Já postado antes');
    await db.query("update public.solicitacoes_reverso set status = 'postado', postado_em = now() where id = $1", [pedido.id]);
    assert.equal((await avisosPostagem(pedido.id)).length, 0, 'nenhum aviso é criado só porque o pedido está postado');
  });
});
