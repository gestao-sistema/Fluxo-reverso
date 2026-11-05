// Worker real de notificações (supabase/functions/comunicacao-etiqueta/worker.ts) contra o PostgreSQL local
// e um Power Automate SIMULADO. Roda em Node: valida o contrato RPC/JSON, a reserva concorrente, a recuperação,
// o tratamento de resultados e o aviso "Sua etiqueta está disponível" (Outlook e Teams, um canal por chamada).
// Nenhuma mensagem sai do processo de testes. NÃO substitui um teste no runtime Deno do Supabase nem no
// Power Automate real. Convites e senha (SMTP direto) não passam por aqui.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { como, criarUsuario, iniciarBanco, migrationsNovas, SERVICE_ROLE } from './lib/banco.mjs';
import { criarWorker } from '../functions/comunicacao-etiqueta/worker.ts';

const APP = 'https://reverso.example.test';
const SEGREDO_CLIENTE = 'segredo-cliente-oauth-NAO-LOGAR';
const TOKEN_OAUTH = 'token-oauth-NAO-LOGAR';
const FLUXO = 'https://flow.example.test/workflows/abc/triggers/manual/paths/invoke';

const envConfigurado = {
  SUPABASE_URL: 'http://supabase.local',
  SUPABASE_SERVICE_ROLE_KEY: 'chave-de-servico-NAO-LOGAR',
  ETIQUETA_TRANSPORTE: 'power_automate',
  POWER_AUTOMATE_FLOW_URL: FLUXO,
  POWER_AUTOMATE_TENANT_ID: 'tenant-teste',
  POWER_AUTOMATE_CLIENT_ID: 'client-teste',
  POWER_AUTOMATE_CLIENT_SECRET: SEGREDO_CLIENTE,
  POWER_AUTOMATE_SCOPE: 'https://service.flow.microsoft.com//.default',
  APP_BASE_URL: APP,
};

const base64url = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');
const jwt = (role) => `${base64url({ alg: 'HS256' })}.${base64url({ role })}.assinatura`;
const requisicao = (role = 'service_role', metodo = 'POST') =>
  new Request('http://worker.local/functions/v1/comunicacao-etiqueta', {
    method: metodo,
    headers: { Authorization: `Bearer ${jwt(role)}` },
    body: metodo === 'POST' ? JSON.stringify({ destinatario: 'invasor@example.test' }) : undefined,
  });

let banco;
let db;
let conexoes;
const u = {};
const q = async (sql, params) => (await db.query(sql, params)).rows;
const um = async (sql, params) => (await q(sql, params))[0];

function clienteRpc(conexao) {
  return {
    async rpc(nome, parametros = {}) {
      const chaves = Object.keys(parametros);
      const argumentos = chaves.map((chave, i) => `${chave} => $${i + 1}`).join(', ');
      try {
        const r = await como(conexao, SERVICE_ROLE, `select public.${nome}(${argumentos}) as r`, Object.values(parametros));
        return { data: r.rows[0].r, error: null };
      } catch (erro) {
        return { data: null, error: { code: erro.code ?? 'erro' } };
      }
    },
  };
}

/** Power Automate simulado: roteiro de respostas por chamada (ou função). */
function criarFetch(roteiro = () => ({ status: 200, corpo: undefined }), { oauthFalha = false, oauthExcecao = false, atrasoMs = 0 } = {}) {
  const chamadas = [];
  const fetchSimulado = async (url, init = {}) => {
    const alvo = String(url);
    if (alvo.includes('login.microsoftonline.com')) {
      chamadas.push({ tipo: 'oauth', url: alvo, sinal: init.signal });
      if (oauthExcecao) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      if (oauthFalha) return new Response('{}', { status: 500 });
      return new Response(JSON.stringify({ access_token: TOKEN_OAUTH, expires_in: 3600 }), { status: 200 });
    }
    assert.equal(alvo, FLUXO);
    const contrato = JSON.parse(init.body);
    chamadas.push({ tipo: 'fluxo', contrato, autorizacao: init.headers.Authorization, sinal: init.signal, metodo: init.method });
    if (atrasoMs) await new Promise((resolve) => setTimeout(resolve, atrasoMs));
    const resposta = roteiro(contrato, chamadas.filter((c) => c.tipo === 'fluxo').length);
    if (resposta instanceof Error) throw resposta;
    const corpo = typeof resposta.corpo === 'function' ? resposta.corpo(contrato) : resposta.corpo;
    return new Response(corpo === undefined ? 'sem json' : JSON.stringify(corpo), { status: resposta.status });
  };
  fetchSimulado.chamadas = chamadas;
  fetchSimulado.fluxo = () => chamadas.filter((c) => c.tipo === 'fluxo');
  return fetchSimulado;
}

const sucesso = (contrato) => ({
  status: 200,
  corpo: { status: 'connector_action_succeeded', communication_id: contrato.idempotency_key, canal: contrato.canal },
});

function worker({ env = envConfigurado, fetchFn = criarFetch(), conexao = conexoes[0], logs = [] } = {}) {
  return {
    logs,
    executar: criarWorker({
      env,
      fetch: fetchFn,
      log: (mensagem, detalhe) => logs.push(`${mensagem} ${detalhe ?? ''}`),
      criarCliente: () => clienteRpc(conexao),
    }),
  };
}

const rodar = async (instancia, req = requisicao()) => {
  const resposta = await instancia.executar(req);
  return { status: resposta.status, corpo: resposta.status === 405 ? null : await resposta.json() };
};

async function esvaziarFila() {
  await db.query(`update public.reversa_comunicacoes_etiqueta set status = 'acao_conector_concluida', aceito_pelo_fluxo_em = now(), lock_token = null, lock_expira_em = null
    where status in ('pendente', 'falhou', 'processando', 'resultado_indeterminado')`);
}

async function novoPedido(solicitante = u.solicitante, cliente = 'Cliente do worker & Filhos') {
  return (await como(conexoes[0], solicitante, `insert into public.solicitacoes_reverso
    (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo)
    values ('Alinare', current_date, 'x', 'Comercial', 4321, $1, 'Rua de teste, 1', 'Outros') returning *`, [cliente])).rows[0];
}

const aprovar = (pedido) => como(conexoes[0], u.aprovador, 'select * from public.aprovar_reversa($1, $2, null)', [pedido.id, pedido.aprovacao_versao]);

/** Pedido aprovado, com a fila anterior encerrada (só no banco local descartável). */
async function pedidoAprovado(cliente) {
  const pedido = await novoPedido(u.solicitante, cliente);
  await aprovar(pedido);
  await esvaziarFila();
  return pedido;
}

async function emitirComPdf(pedido, { rastreio = null, sequencia = 1, pdf = true } = {}) {
  return (await db.query(`insert into public.reversa_emissoes
    (solicitacao_id, sequencia, origem, codigo_autorizacao, codigo_rastreio, pdf_path, pdf_nome, emitida_em, valida_ate)
    values ($1, $2, 'sistema', 'AUT-1', $3, $4, 'etiqueta.pdf', date '2026-10-20', $5) returning *`,
  [pedido.id, sequencia, rastreio, pdf ? `${pedido.id}/${sequencia}.pdf` : null, rastreio ? '2026-11-20' : null])).rows[0];
}

const estados = (pedidoId) => q(`select evento, canal, status, tentativas from public.reversa_comunicacoes_etiqueta
  where solicitacao_id = $1 order by evento, canal, id`, [pedidoId]);
const etiquetas = (pedidoId) => q(`select c.canal, c.status, c.tentativas, c.emissao_id from public.reversa_comunicacoes_etiqueta c
  where c.solicitacao_id = $1 and c.evento = 'etiqueta_disponivel' order by c.canal, c.criado_em`, [pedidoId]);
const concluirOutros = (pedidoId, evento) => db.query(`update public.reversa_comunicacoes_etiqueta set status = 'acao_conector_concluida'
  where solicitacao_id = $1 and evento <> $2`, [pedidoId, evento]);

before(async () => {
  banco = await iniciarBanco();
  db = banco.dono;
  for (const arquivo of migrationsNovas()) await banco.aplicar(arquivo);
  conexoes = [await banco.conectar(), await banco.conectar()];
  Object.assign(u, {
    admin: await criarUsuario(db, 'Admin worker', ['usuarios']),
    solicitante: await criarUsuario(db, 'Solicitante worker', ['formulario-alinare']),
    outroSolicitante: await criarUsuario(db, 'Outro solicitante worker', ['formulario-alinare']),
    aprovador: await criarUsuario(db, 'Aprovador worker', ['aprovar-alinare']),
    operador: await criarUsuario(db, 'Operador worker', ['emitir-alinare']),
  });
  await como(conexoes[0], u.admin, 'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)', ['Alinare', JSON.stringify([
    { usuario_id: u.aprovador.id, todos_setores: true, setores: [] },
  ])]);
}, { timeout: 300_000 });

after(async () => { await banco?.encerrar(); });

describe('worker de notificações: acesso, configuração e modo simulado', () => {
  it('recusa método, chamador sem papel de serviço e ambiente sem Supabase', async () => {
    const instancia = worker();
    assert.equal((await rodar(instancia, requisicao('service_role', 'GET'))).status, 405);
    assert.equal((await rodar(instancia, requisicao('authenticated'))).status, 403);
    assert.equal((await rodar(instancia, requisicao('anon'))).status, 403);
    const semSupabase = worker({ env: { ...envConfigurado, SUPABASE_URL: undefined } });
    assert.equal((await rodar(semSupabase)).status, 503);
  });

  it('modo simulado só conta pendências: nada de reserva, tentativa, OAuth ou fluxo, e as chaves de SMTP/convite não ligam o envio', async () => {
    await esvaziarFila();
    const pedido = await novoPedido(u.solicitante, 'Simulado');
    const antes = await estados(pedido.id);
    assert.ok(antes.length >= 2);
    const fetchFn = criarFetch();
    for (const env of [
      { ...envConfigurado, ETIQUETA_TRANSPORTE: 'simulado' },
      { ...envConfigurado, ETIQUETA_TRANSPORTE: undefined },
      { ...envConfigurado, POWER_AUTOMATE_FLOW_URL: 'http://inseguro.example.test/fluxo' },
      { ...envConfigurado, APP_BASE_URL: 'https://usuario:senha@reverso.example.test' },
      // Controles dos convites e do antigo e-mail por SMTP não ligam as notificações.
      { ...envConfigurado, ETIQUETA_TRANSPORTE: undefined, CONVITE_TRANSPORTE: 'smtp', NOTIFICACAO_EMAIL_TRANSPORTE: 'smtp', SMTP_HOST: 'smtp.office365.com' },
      ...['POWER_AUTOMATE_FLOW_URL', 'POWER_AUTOMATE_TENANT_ID', 'POWER_AUTOMATE_CLIENT_ID', 'POWER_AUTOMATE_CLIENT_SECRET',
        'POWER_AUTOMATE_SCOPE', 'APP_BASE_URL'].map((chave) => ({ ...envConfigurado, [chave]: undefined })),
    ]) {
      const resposta = await rodar(worker({ env, fetchFn }));
      assert.equal(resposta.status, 200);
      assert.equal(resposta.corpo.modo, 'simulado');
      assert.equal(resposta.corpo.envio_real, false);
      assert.equal(resposta.corpo.alteracoes_na_fila, false);
      assert.ok(resposta.corpo.pendentes.total >= antes.length);
    }
    assert.deepEqual(await estados(pedido.id), antes, 'nenhuma linha mudou de estado');
    assert.equal(fetchFn.chamadas.length, 0, 'sem OAuth nem chamada ao fluxo');
  });
});

describe('worker de notificações: etiqueta disponível pelo Power Automate', () => {
  it('PDF vinculado gera um aviso por canal para o autor autenticado, cada um executando só o Outlook ou só o Teams', async () => {
    const pedido = await pedidoAprovado('Etiqueta & Filhos');
    await emitirComPdf(pedido, { rastreio: 'AA123456789BR' });
    const fetchFn = criarFetch(sucesso);
    const resposta = await rodar(worker({ fetchFn }));
    assert.equal(resposta.corpo.modo, 'power_automate');
    assert.equal(resposta.corpo.acoes_do_conector_concluidas, 2);
    assert.equal(resposta.corpo.entrega_ao_destinatario_confirmada, false);

    const chamadas = fetchFn.fluxo().map((c) => c.contrato);
    assert.deepEqual(chamadas.map((c) => c.canal).sort(), ['email', 'teams'], 'uma chamada por canal');
    assert.ok(fetchFn.fluxo().every((c) => c.autorizacao === `Bearer ${TOKEN_OAUTH}` && c.metodo === 'POST'));
    for (const contrato of chamadas) {
      assert.equal(contrato.evento, 'etiqueta_disponivel');
      assert.equal(contrato.destinatario.email, u.solicitante.email, 'o destinatário é o autor autenticado, vindo do banco');
      assert.equal(contrato.destinatario.id, u.solicitante.id);
      assert.equal(contrato.pedido.identificacao, `RV-${pedido.id.slice(0, 8).toUpperCase()}`);
      assert.equal(contrato.acao.rotulo, 'Abrir meu pedido');
      assert.equal(contrato.acao.url, `${APP}/admin/meus-pedidos?solicitacaoId=${pedido.id}`);
      assert.match(contrato.mensagem.assunto, /^Sua etiqueta está disponível · RV-[0-9A-F]{8}$/);
      assert.ok(contrato.mensagem.corpo_html.includes('Sua etiqueta está disponível'));
      assert.ok(contrato.mensagem.corpo_html.includes('Etiqueta &amp; Filhos'), 'texto externo escapado');
      assert.ok(contrato.mensagem.corpo_html.includes('AA123456789BR'));
      assert.ok(contrato.mensagem.corpo_html.includes('20/11/2026'));
      assert.doesNotMatch(contrato.acao.url, /token|signature|sig=|X-Amz/i);
    }
    const email = chamadas.find((c) => c.canal === 'email').mensagem.corpo_html;
    const teams = chamadas.find((c) => c.canal === 'teams').mensagem.corpo_html;
    assert.match(email, /<!doctype html>/i);
    assert.match(email, /REVERSO/);
    assert.doesNotMatch(teams, /<table|<style|<html/i, 'Teams recebe a mensagem curta');
    assert.ok(teams.length < email.length / 3);

    assert.deepEqual((await etiquetas(pedido.id)).map((e) => `${e.canal}:${e.status}:${e.tentativas}`), [
      'email:acao_conector_concluida:1', 'teams:acao_conector_concluida:1',
    ]);
    const tentativas = await q(`select t.resultado, t.http_status, t.transporte from public.reversa_comunicacoes_etiqueta_tentativas t
      join public.reversa_comunicacoes_etiqueta c on c.id = t.comunicacao_id where c.solicitacao_id = $1 and c.evento = 'etiqueta_disponivel'`, [pedido.id]);
    assert.equal(tentativas.length, 2);
    assert.ok(tentativas.every((t) => t.resultado === 'acao_conector_concluida' && t.http_status === 200));
    assert.ok(tentativas.every((t) => t.transporte !== 'smtp'), 'nenhuma cópia pelo SMTP');
  });

  it('rastreamento é opcional: sem ele a etiqueta é avisada, sem linhas vazias', async () => {
    const pedido = await pedidoAprovado('Sem rastreio');
    await emitirComPdf(pedido);
    const fetchFn = criarFetch(sucesso);
    await rodar(worker({ fetchFn }));
    const chamadas = fetchFn.fluxo().map((c) => c.contrato);
    assert.equal(chamadas.length, 2);
    for (const contrato of chamadas) {
      assert.equal(contrato.codigo_rastreio, null);
      assert.equal(contrato.validade, null);
      assert.doesNotMatch(contrato.mensagem.corpo_html, /Código de rastreamento|Válida até/);
      assert.ok(contrato.mensagem.corpo_html.includes('RV-'));
    }
  });

  it('falha de upload ou de vínculo (sem PDF vinculado) não gera aviso; ao vincular, o aviso sai uma vez por canal', async () => {
    const pedido = await pedidoAprovado('Vínculo');
    const emissao = await emitirComPdf(pedido, { rastreio: 'BB123456789BR', pdf: false });
    const semPdf = criarFetch(sucesso);
    await rodar(worker({ fetchFn: semPdf }));
    assert.equal(semPdf.fluxo().length, 0);
    assert.equal((await etiquetas(pedido.id)).length, 0);

    await db.query('update public.reversa_emissoes set pdf_path = $2, pdf_nome = $3 where id = $1', [emissao.id, `${pedido.id}/1.pdf`, 'e.pdf']);
    const comPdf = criarFetch(sucesso);
    await rodar(worker({ fetchFn: comPdf }));
    assert.deepEqual(comPdf.fluxo().map((c) => c.contrato.canal).sort(), ['email', 'teams']);
  });

  it('o destinatário é o autor do pedido: outro usuário da mesma empresa não recebe, e pedido sem autor não inventa destinatário', async () => {
    const pedido = await pedidoAprovado('Autoria');
    await emitirComPdf(pedido);
    const fetchFn = criarFetch(sucesso);
    await rodar(worker({ fetchFn }));
    const emails = fetchFn.fluxo().map((c) => c.contrato.destinatario.email);
    assert.deepEqual([...new Set(emails)], [u.solicitante.email]);
    assert.ok(!emails.includes(u.outroSolicitante.email) && !emails.includes(u.operador.email));

    // Registro legado (sem autoria verificável): o impedimento fica registrado e nada é enviado.
    const legado = (await db.query(`insert into public.solicitacoes_reverso
      (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo)
      values ('Alinare', current_date, 'Vendedora digitada', 'Comercial', 77, 'Legado', 'Rua A, 1', 'Outros') returning *`)).rows[0];
    await esvaziarFila(); // a tarefa de aprovação do próprio pedido legado não é objeto deste teste
    await emitirComPdf(legado);
    const aposLegado = criarFetch(sucesso);
    await rodar(worker({ fetchFn: aposLegado }));
    assert.equal(aposLegado.fluxo().length, 0);
    assert.deepEqual((await etiquetas(legado.id)).map((e) => e.status), ['aguardando_identidade', 'aguardando_identidade']);
  });

  it('reemissão gera nova ocorrência e preserva a anterior; repetir a operação não duplica avisos', async () => {
    const pedido = await pedidoAprovado('Reemissão');
    const anterior = await emitirComPdf(pedido, { rastreio: 'CC123456789BR' });
    const primeira = criarFetch(sucesso);
    const instancia = worker({ fetchFn: primeira });
    await rodar(instancia);
    assert.equal(primeira.fluxo().length, 2);

    // Repetir: reexecutar o worker e regravar os mesmos dados da emissão não cria nem reenvia nada.
    const repetida = criarFetch(sucesso);
    assert.equal((await rodar(worker({ fetchFn: repetida }))).corpo.processadas, 0);
    await db.query("update public.reversa_emissoes set pdf_nome = 'etiqueta.pdf', codigo_rastreio = 'CC123456789BR' where id = $1", [anterior.id]);
    assert.equal((await etiquetas(pedido.id)).length, 2, 'repetição não duplica');

    // Reemissão: novo PDF, nova ocorrência (4 linhas no total, 2 concluídas preservadas e 2 novas).
    const novoId = (await db.query('select gen_random_uuid() as id')).rows[0].id;
    await db.query('begin');
    await db.query('update public.reversa_emissoes set substituida_em = now(), substituida_por_id = $2 where id = $1', [anterior.id, novoId]);
    await db.query(`insert into public.reversa_emissoes (id, solicitacao_id, sequencia, origem, emissao_anterior_id, motivo_reemissao, codigo_rastreio, pdf_path, pdf_nome)
      values ($1, $2, 2, 'sistema', $3, 'pdf_incorreto', 'DD123456789BR', $4, 'nova.pdf')`, [novoId, pedido.id, anterior.id, `${pedido.id}/2.pdf`]);
    await db.query('commit');
    const segunda = criarFetch(sucesso);
    await rodar(worker({ fetchFn: segunda }));
    assert.deepEqual(segunda.fluxo().map((c) => c.contrato.canal).sort(), ['email', 'teams']);
    assert.ok(segunda.fluxo().every((c) => c.contrato.codigo_rastreio === 'DD123456789BR'), 'o aviso é da nova emissão');
    const linhas = await etiquetas(pedido.id);
    assert.equal(linhas.length, 4);
    assert.equal(linhas.filter((l) => l.emissao_id === anterior.id && l.status === 'acao_conector_concluida').length, 2, 'histórico preservado');
    assert.equal(linhas.filter((l) => l.emissao_id === novoId && l.status === 'acao_conector_concluida').length, 2);
  });

  it('cada canal mantém resultado e tentativas próprios: o e-mail concluído não é reenviado porque o Teams falhou', async () => {
    const pedido = await pedidoAprovado('Canal parcial');
    await emitirComPdf(pedido, { rastreio: 'EE123456789BR' });
    const primeiro = criarFetch((contrato) => contrato.canal === 'email'
      ? sucesso(contrato)
      : { status: 503, corpo: { status: 'connector_action_failed', communication_id: contrato.idempotency_key, canal: 'teams', retryable: true } });
    const instancia = worker({ fetchFn: primeiro });
    const resposta = await rodar(instancia);
    assert.equal(resposta.corpo.acoes_do_conector_concluidas, 1);
    assert.equal(resposta.corpo.falhas, 1);
    assert.deepEqual((await etiquetas(pedido.id)).map((e) => `${e.canal}:${e.status}:${e.tentativas}`), ['email:acao_conector_concluida:1', 'teams:falhou:1']);
    assert.equal((await rodar(instancia)).corpo.processadas, 0, 'a espera vale só para o canal que falhou');

    await db.query(`update public.reversa_comunicacoes_etiqueta set proxima_tentativa_em = now() - interval '1 minute'
      where solicitacao_id = $1 and evento = 'etiqueta_disponivel' and canal = 'teams'`, [pedido.id]);
    const segundo = criarFetch(sucesso);
    await rodar(worker({ fetchFn: segundo }));
    assert.deepEqual(segundo.fluxo().map((c) => c.contrato.canal), ['teams']);
    assert.deepEqual((await etiquetas(pedido.id)).map((e) => `${e.canal}:${e.status}:${e.tentativas}`), ['email:acao_conector_concluida:1', 'teams:acao_conector_concluida:2']);

    // O inverso: Outlook com falha segura não reenvia o Teams já concluído.
    const outro = await pedidoAprovado('Canal parcial invertido');
    await emitirComPdf(outro);
    await rodar(worker({ fetchFn: criarFetch((contrato) => contrato.canal === 'teams'
      ? sucesso(contrato)
      : { status: 503, corpo: { status: 'connector_action_failed', communication_id: contrato.idempotency_key, canal: 'email', retryable: true } }) }));
    await db.query(`update public.reversa_comunicacoes_etiqueta set proxima_tentativa_em = now() - interval '1 minute' where solicitacao_id = $1`, [outro.id]);
    const reenvio = criarFetch(sucesso);
    await rodar(worker({ fetchFn: reenvio }));
    assert.deepEqual(reenvio.fluxo().map((c) => c.contrato.canal), ['email']);
  });

  it('resultado indeterminado (timeout ou resposta incerta) nunca é reenviado automaticamente, e não afeta o outro canal', async () => {
    const pedido = await pedidoAprovado('Indeterminado');
    await emitirComPdf(pedido);
    const fetchFn = criarFetch((contrato) => contrato.canal === 'email'
      ? new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      : sucesso(contrato));
    const instancia = worker({ fetchFn });
    const primeira = await rodar(instancia);
    assert.equal(primeira.corpo.resultados_indeterminados, 1);
    assert.equal(primeira.corpo.acoes_do_conector_concluidas, 1);
    assert.equal((await rodar(instancia)).corpo.processadas, 0);
    assert.equal(fetchFn.fluxo().length, 2, 'cada canal foi chamado uma única vez');
    assert.deepEqual((await etiquetas(pedido.id)).map((e) => `${e.canal}:${e.status}`), ['email:resultado_indeterminado', 'teams:acao_conector_concluida']);
  });

  it('revalida o acesso do destinatário antes do envio: autor que perdeu o acesso não recebe nada e o e-mail dele não vai ao log', async () => {
    const semAcesso = await criarUsuario(db, 'Autor sem acesso worker', ['formulario-alinare']);
    const pedido = await novoPedido(semAcesso, 'Autor revogado');
    await aprovar(pedido);
    await esvaziarFila();
    await emitirComPdf(pedido);
    await db.query(`update auth.users set raw_app_meta_data = jsonb_set(raw_app_meta_data, '{telas}', '[]'::jsonb) where id = $1`, [semAcesso.id]);
    const fetchFn = criarFetch(sucesso);
    const logs = [];
    const resposta = await rodar(worker({ fetchFn, logs }));
    assert.equal(fetchFn.fluxo().length, 0);
    assert.equal(resposta.corpo.processadas, 0);
    assert.equal(resposta.corpo.ignoradas_por_revalidacao, 2);
    assert.deepEqual((await etiquetas(pedido.id)).map((e) => e.status), ['acesso_revogado', 'acesso_revogado']);
    assert.ok(!JSON.stringify([logs, resposta.corpo]).includes(semAcesso.email));
  });

  it('registros históricos de SMTP são preservados: o e-mail já aceito não é reenviado, e o Teams pendente sai pelo Power Automate', async () => {
    const pedido = await pedidoAprovado('Histórico SMTP');
    await emitirComPdf(pedido);
    await db.query(`update public.reversa_comunicacoes_etiqueta set status = 'smtp_aceito', smtp_aceito_em = now(), tentativas = 1
      where solicitacao_id = $1 and evento = 'etiqueta_disponivel' and canal = 'email'`, [pedido.id]);
    const fetchFn = criarFetch(sucesso);
    await rodar(worker({ fetchFn }));
    assert.deepEqual(fetchFn.fluxo().map((c) => c.contrato.canal), ['teams'], 'nenhuma segunda cópia do e-mail');
    assert.deepEqual((await etiquetas(pedido.id)).map((e) => `${e.canal}:${e.status}`), ['email:smtp_aceito', 'teams:acao_conector_concluida']);
    assert.ok((await um("select smtp_aceito_em from public.reversa_comunicacoes_etiqueta where solicitacao_id = $1 and canal = 'email' and evento = 'etiqueta_disponivel'", [pedido.id])).smtp_aceito_em);
  });
});

describe('worker de notificações: contrato, resultados e autenticação', () => {
  it('envia um destinatário e um canal por chamada, com o contrato do evento e dados vindos do banco', async () => {
    await esvaziarFila();
    const pedido = await novoPedido();
    await aprovar(pedido);
    const fetchFn = criarFetch(sucesso);
    const instancia = worker({ fetchFn });
    let total = 0;
    for (let rodada = 0; rodada < 3; rodada += 1) {
      const resposta = await rodar(instancia);
      assert.equal(resposta.status, 200);
      assert.equal(resposta.corpo.entrega_ao_destinatario_confirmada, false);
      total += resposta.corpo.processadas;
    }
    const chamadas = fetchFn.fluxo();
    assert.equal(chamadas.length, total);
    assert.deepEqual(chamadas.map((c) => `${c.contrato.evento}:${c.contrato.canal}`).sort(),
      ['emissao_pendente:teams', 'pedido_aprovado:email', 'pedido_criado:email'],
      'a tarefa de aprovação já decidida não é enviada; o operador recebe no Teams; o autor, por e-mail');
    assert.equal(chamadas.find((c) => c.contrato.evento === 'emissao_pendente').contrato.destinatario.email, u.operador.email);
    const criado = chamadas.find((c) => c.contrato.evento === 'pedido_criado').contrato;
    assert.equal(criado.destinatario.email, u.solicitante.email, 'o destinatário vem do banco, não do corpo da requisição');
    assert.ok(!chamadas.some((c) => c.contrato.destinatario.email === 'invasor@example.test'));
    for (const { contrato } of chamadas) {
      assert.match(contrato.acao.url, /^https:\/\/reverso\.example\.test\/admin\/(aprovacoes|etiquetas|meus-pedidos)\?/);
      assert.equal(contrato.cliente.nome, 'Cliente do worker & Filhos');
      assert.ok(contrato.mensagem.corpo_html.includes('Cliente do worker &amp; Filhos'));
    }
  });

  it('resposta sem contrato válido, 200 vazio ou exceção de rede viram resultado indeterminado e não são reenviados', async () => {
    for (const cenario of [
      () => ({ status: 200, corpo: undefined }),
      () => ({ status: 202, corpo: { status: 'accepted' } }),
      () => new Error('conexão reiniciada'),
      (c) => ({ status: 200, corpo: { status: 'connector_action_succeeded', communication_id: c.idempotency_key, canal: 'outro' } }),
      (c) => ({ status: 502, corpo: { status: 'connector_action_failed', communication_id: c.idempotency_key, canal: c.canal, retryable: false } }),
    ]) {
      await esvaziarFila();
      const pedido = await novoPedido();
      await db.query(`update public.reversa_comunicacoes_etiqueta set status = 'acao_conector_concluida' where solicitacao_id = $1 and evento <> 'pedido_criado'`, [pedido.id]);
      const fetchFn = criarFetch(cenario);
      const instancia = worker({ fetchFn });
      assert.equal((await rodar(instancia)).corpo.resultados_indeterminados, 1);
      assert.equal((await rodar(instancia)).corpo.processadas, 0, 'sem retry automático');
      assert.equal(fetchFn.fluxo().length, 1);
      assert.equal((await um("select status from public.reversa_comunicacoes_etiqueta where solicitacao_id = $1 and evento = 'pedido_criado'", [pedido.id])).status, 'resultado_indeterminado');
    }
  });

  it('rejeição explícita do contrato é erro permanente; falha segura agenda retentativa só daquele canal', async () => {
    await esvaziarFila();
    const pedido = await novoPedido();
    await aprovar(pedido);
    await db.query(`update public.reversa_comunicacoes_etiqueta set status = 'acao_conector_concluida' where solicitacao_id = $1 and evento not in ('pedido_criado', 'pedido_aprovado')`, [pedido.id]);
    const fetchFn = criarFetch((contrato) => contrato.evento === 'pedido_criado'
      ? { status: 400, corpo: { status: 'invalid_event', communication_id: contrato.idempotency_key, canal: contrato.canal } }
      : { status: 503, corpo: { status: 'connector_action_failed', communication_id: contrato.idempotency_key, canal: contrato.canal, retryable: true } });
    const instancia = worker({ fetchFn });
    const resposta = await rodar(instancia);
    assert.equal(resposta.corpo.erros_permanentes, 1);
    assert.equal(resposta.corpo.falhas, 1);
    const linhas = await estados(pedido.id);
    assert.equal(linhas.find((e) => e.evento === 'pedido_criado').status, 'erro_permanente');
    assert.equal(linhas.find((e) => e.evento === 'pedido_aprovado').status, 'falhou');
    assert.equal((await rodar(instancia)).corpo.processadas, 0);
  });

  it('falha OAuth (resposta ou exceção) antecede a chamada ao fluxo e é retentável; segredos, e-mail e URL do fluxo nunca vão ao log', async () => {
    for (const opcao of [{ oauthFalha: true }, { oauthExcecao: true }]) {
      await esvaziarFila();
      const pedido = await novoPedido();
      await db.query(`update public.reversa_comunicacoes_etiqueta set status = 'acao_conector_concluida' where solicitacao_id = $1 and evento <> 'pedido_criado'`, [pedido.id]);
      const fetchFn = criarFetch(sucesso, opcao);
      const logs = [];
      const resposta = await rodar(worker({ fetchFn, logs }));
      assert.equal(resposta.corpo.falhas, 1);
      assert.equal(fetchFn.fluxo().length, 0, 'o fluxo não foi chamado sem token');
      assert.ok(fetchFn.chamadas[0].sinal instanceof AbortSignal, 'o OAuth tem limite de tempo');
      assert.equal((await um("select status from public.reversa_comunicacoes_etiqueta where solicitacao_id = $1 and evento = 'pedido_criado'", [pedido.id])).status, 'falhou');
      const tudo = JSON.stringify([logs, resposta.corpo]);
      for (const segredo of [SEGREDO_CLIENTE, TOKEN_OAUTH, envConfigurado.SUPABASE_SERVICE_ROLE_KEY, FLUXO, u.solicitante.email]) {
        assert.ok(!tudo.includes(segredo), 'segredo, URL ou e-mail encontrado no log/resposta');
      }
    }
  });

  it('401 e 403 do gatilho (token recusado) são falha segura; estouro do tempo na chamada ao fluxo é indeterminado', async () => {
    for (const status of [401, 403]) {
      await esvaziarFila();
      const pedido = await novoPedido(u.solicitante, `Token recusado ${status}`);
      await db.query(`update public.reversa_comunicacoes_etiqueta set status = 'acao_conector_concluida' where solicitacao_id = $1 and evento <> 'pedido_criado'`, [pedido.id]);
      const resposta = await rodar(worker({ fetchFn: criarFetch(() => ({ status, corpo: { error: { code: 'InvalidAuthenticationToken' } } })) }));
      assert.equal(resposta.corpo.falhas, 1, `HTTP ${status}`);
      assert.equal(resposta.corpo.resultados_indeterminados, 0);
    }
    await esvaziarFila();
    const pedido = await novoPedido(u.solicitante, 'Fluxo lento');
    await db.query(`update public.reversa_comunicacoes_etiqueta set status = 'acao_conector_concluida' where solicitacao_id = $1 and evento <> 'pedido_criado'`, [pedido.id]);
    const fetchFn = criarFetch(() => new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    const instancia = worker({ fetchFn });
    assert.equal((await rodar(instancia)).corpo.resultados_indeterminados, 1);
    assert.equal((await rodar(instancia)).corpo.processadas, 0);
    assert.ok(fetchFn.fluxo()[0].sinal instanceof AbortSignal && !fetchFn.fluxo()[0].sinal.aborted, 'a chamada ao fluxo tem limite de tempo');
  });

  it('descarta no momento do envio a tarefa que perdeu pertinência, sem chamar o fluxo', async () => {
    await esvaziarFila();
    const pedido = await novoPedido();
    await db.query(`update public.reversa_comunicacoes_etiqueta set status = 'acao_conector_concluida' where solicitacao_id = $1 and evento <> 'aprovacao_pendente'`, [pedido.id]);
    await aprovar(pedido);
    await db.query(`update public.reversa_comunicacoes_etiqueta set status = 'acao_conector_concluida' where solicitacao_id = $1 and evento <> 'aprovacao_pendente'`, [pedido.id]);
    const fetchFn = criarFetch(sucesso);
    const resposta = await rodar(worker({ fetchFn }));
    assert.equal(fetchFn.fluxo().length, 0);
    assert.equal(resposta.corpo.processadas, 0);
    assert.ok(resposta.corpo.ignoradas_por_revalidacao >= 1);
    assert.equal((await um("select status from public.reversa_comunicacoes_etiqueta where solicitacao_id = $1 and evento = 'aprovacao_pendente'", [pedido.id])).status, 'evento_obsoleto');
  });
});

describe('worker de notificações: concorrência e recuperação', () => {
  it('dois workers simultâneos nunca enviam o mesmo canal duas vezes', async () => {
    await esvaziarFila();
    for (let i = 0; i < 3; i += 1) await novoPedido(u.solicitante, `Concorrência ${i}`);
    const esperados = Number((await um("select count(*) as n from public.reversa_comunicacoes_etiqueta where status = 'pendente'")).n);
    assert.ok(esperados >= 6);
    const fetchFn = criarFetch(sucesso, { atrasoMs: 40 });
    const a = worker({ fetchFn, conexao: conexoes[0] });
    const b = worker({ fetchFn, conexao: conexoes[1] });
    for (let rodada = 0; rodada < 4; rodada += 1) await Promise.all([rodar(a), rodar(b)]);
    const chaves = fetchFn.fluxo().map((c) => c.contrato.idempotency_key);
    assert.equal(new Set(chaves).size, chaves.length, 'cada comunicação foi enviada uma única vez');
    assert.equal(chaves.length, esperados);
    assert.equal((await um("select count(*)::int as n from public.reversa_comunicacoes_etiqueta where status in ('pendente', 'processando', 'falhou')")).n, 0);
  });

  it('interrupção após iniciar a chamada vira indeterminado; antes de iniciar volta à fila e é enviada', async () => {
    await esvaziarFila();
    const pedido = await novoPedido(u.solicitante, 'Interrupção');
    await concluirOutros(pedido.id, 'pedido_criado');
    // Worker caiu depois de iniciar a tentativa: pode ter havido efeito externo.
    const reservaA = (await como(conexoes[0], SERVICE_ROLE, 'select public.reversa_claim_comunicacao_etiqueta() as r')).rows[0].r;
    await como(conexoes[0], SERVICE_ROLE, 'select public.reversa_iniciar_comunicacao_etiqueta($1, $2)', [reservaA.comunicacao_id, reservaA.lock_token]);
    await db.query(`update public.reversa_comunicacoes_etiqueta set lock_expira_em = now() - interval '1 second' where id = $1`, [reservaA.comunicacao_id]);
    const fetchFn = criarFetch(sucesso);
    await rodar(worker({ fetchFn }));
    assert.equal(fetchFn.fluxo().length, 0, 'não reenvia depois de uma chamada já iniciada');
    assert.equal((await um('select status from public.reversa_comunicacoes_etiqueta where id = $1', [reservaA.comunicacao_id])).status, 'resultado_indeterminado');

    // Worker caiu logo depois de reservar, antes de iniciar a chamada: seguro repetir.
    const pedido2 = await novoPedido(u.solicitante, 'Interrupção antes');
    await concluirOutros(pedido2.id, 'pedido_criado');
    const reservaB = (await como(conexoes[0], SERVICE_ROLE, 'select public.reversa_claim_comunicacao_etiqueta() as r')).rows[0].r;
    await db.query(`update public.reversa_comunicacoes_etiqueta set lock_expira_em = now() - interval '1 second' where id = $1`, [reservaB.comunicacao_id]);
    const fetchB = criarFetch(sucesso);
    const resposta = await rodar(worker({ fetchFn: fetchB }));
    assert.equal(resposta.corpo.acoes_do_conector_concluidas, 1);
    assert.equal(fetchB.fluxo()[0].contrato.idempotency_key, reservaB.comunicacao_id);
  });
});
