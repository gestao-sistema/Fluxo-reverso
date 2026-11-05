// A Edge Function comunicacao-etiqueta (index.ts, sem alterações) executada no runtime Deno real,
// falando com um PostgREST e um Power Automate simulados. Valida a fiação de runtime
// (Deno.serve, Deno.env, supabase-js, fetch, AbortSignal) e o modo simulado. Não substitui o
// teste no Supabase Edge Runtime nem no Power Automate reais. É ignorado se o Deno não existir:
// defina DENO_BIN com o caminho do executável. Precisa de acesso a esm.sh na primeira execução.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const INDEX = join(AQUI, '..', 'functions', 'comunicacao-etiqueta', 'index.ts');
const PRELOAD = join(AQUI, 'lib', 'deno-preload.ts');
const DENO = process.env.DENO_BIN || 'deno';
const temDeno = spawnSync(DENO, ['--version'], { shell: false }).status === 0;

const base64url = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');
const jwt = (role) => `${base64url({ alg: 'HS256' })}.${base64url({ role })}.assinatura`;
const CHAVE_SERVICO = jwt('service_role');
const SEGREDO = 'segredo-oauth-NAO-LOGAR';

const portaLivre = () => new Promise((resolve, reject) => {
  const servidor = createServer();
  servidor.on('error', reject);
  servidor.listen(0, '127.0.0.1', () => { const { port } = servidor.address(); servidor.close(() => resolve(port)); });
});

function servidor(tratar) {
  return new Promise((resolve) => {
    const s = http.createServer(async (req, res) => {
      const partes = [];
      for await (const parte of req) partes.push(parte);
      const corpo = Buffer.concat(partes).toString('utf8');
      const resposta = tratar(req, corpo);
      res.writeHead(resposta.status ?? 200, { 'Content-Type': 'application/json' });
      res.end(resposta.corpo === undefined ? '' : JSON.stringify(resposta.corpo));
    }).listen(0, '127.0.0.1', () => resolve({ s, port: s.address().port }));
  });
}

describe('Edge Function comunicacao-etiqueta no runtime Deno', { skip: !temDeno && 'Deno não encontrado (defina DENO_BIN)' }, () => {
  const chamadasRpc = [];
  const chamadasFluxo = [];
  let postgrest;
  let fluxo;
  let fila;
  const processos = [];

  before(async () => {
    postgrest = await servidor((req, corpo) => {
      const nome = req.url.replace(/^\/rest\/v1\/rpc\//, '').split('?')[0];
      const args = corpo ? JSON.parse(corpo) : {};
      chamadasRpc.push({ nome, args, autorizacao: req.headers.authorization });
      if (nome === 'reversa_contar_comunicacoes_pendentes') return { corpo: { email: 1, teams: 0, total: 1 } };
      if (nome === 'reversa_claim_comunicacao_etiqueta') return { corpo: fila.shift() ?? null };
      if (nome === 'reversa_iniciar_comunicacao_etiqueta') {
        return {
          corpo: {
            comunicacao_id: args.p_comunicacao_id, tentativa_id: 'tentativa-1', lock_token: args.p_lock_token,
            evento: 'pedido_aprovado', ocorrencia_id: 'ocorrencia-1', canal: 'email',
            destinatario_id: '00000000-0000-4000-8000-000000000456', destinatario_email: 'solicitante@example.test',
            emissao_id: null, solicitacao_id: '12345678-1234-4234-8234-123456789abc', empresa: 'Alinare', setor: 'Comercial',
            cliente_codigo: '8080', cliente_nome: 'Cliente & Filhos', motivo: 'Peça com defeito', data_solicitacao: '2026-10-20',
            codigo_rastreio: null, valida_ate: null, emitida_em: null, justificativa: null, versao: 1,
            transicao_em: '2026-10-26T21:32:00+00:00', postagem_em: null,
          },
        };
      }
      if (nome === 'reversa_finalizar_comunicacao_etiqueta_v2') return { corpo: true };
      return { status: 404, corpo: { code: 'PGRST202', message: `função inesperada ${nome}` } };
    });
    fluxo = await servidor((req, corpo) => {
      const contrato = JSON.parse(corpo);
      chamadasFluxo.push({ autorizacao: req.headers.authorization, contrato });
      return { corpo: { status: 'connector_action_succeeded', communication_id: contrato.idempotency_key, canal: contrato.canal } };
    });
  });

  after(async () => {
    for (const p of processos) p.kill();
    postgrest?.s.close();
    fluxo?.s.close();
  });

  async function iniciarFuncao(extras) {
    const porta = await portaLivre();
    const env = {
      ...process.env,
      DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${porta}`,
      FAKE_FLOW_PORT: String(fluxo.port),
      SUPABASE_URL: `http://127.0.0.1:${postgrest.port}`,
      SUPABASE_SERVICE_ROLE_KEY: CHAVE_SERVICO,
      ...extras,
    };
    const filho = spawn(DENO, ['run', '--no-prompt', '--no-lock', '--allow-net', '--allow-env', '--preload', PRELOAD, INDEX], { env });
    processos.push(filho);
    let saida = '';
    filho.stdout.on('data', (d) => { saida += d; });
    filho.stderr.on('data', (d) => { saida += d; });
    const inicio = Date.now();
    while (Date.now() - inicio < 120_000) {
      if (filho.exitCode !== null) throw new Error(`A função terminou antes de subir:\n${saida}`);
      try {
        await fetch(`http://127.0.0.1:${porta}/`, { method: 'GET' });
        return { porta, filho, log: () => saida };
      } catch { await new Promise((resolve) => setTimeout(resolve, 300)); }
    }
    throw new Error(`A função não subiu a tempo:\n${saida}`);
  }

  const chamar = (porta, role = 'service_role', metodo = 'POST') => fetch(`http://127.0.0.1:${porta}/functions/v1/comunicacao-etiqueta`, {
    method: metodo,
    headers: { Authorization: `Bearer ${jwt(role)}`, 'Content-Type': 'application/json' },
    body: metodo === 'POST' ? JSON.stringify({ destinatario: 'invasor@example.test' }) : undefined,
  });

  it('modo simulado: só conta pendências; não reserva, não inicia tentativa e não chama o fluxo', async () => {
    chamadasRpc.length = 0; chamadasFluxo.length = 0;
    fila = [{ comunicacao_id: 'c-1', lock_token: 'l-1' }];
    const funcao = await iniciarFuncao({ ETIQUETA_TRANSPORTE: 'simulado' });
    assert.equal((await chamar(funcao.porta, 'service_role', 'GET')).status, 405);
    assert.equal((await chamar(funcao.porta, 'anon')).status, 403);
    assert.equal((await chamar(funcao.porta, 'authenticated')).status, 403);
    const resposta = await chamar(funcao.porta);
    assert.equal(resposta.status, 200);
    assert.deepEqual(await resposta.json(), {
      modo: 'simulado', envio_real: false, pendentes: { email: 1, teams: 0, total: 1 }, alteracoes_na_fila: false,
    });
    assert.deepEqual(chamadasRpc.map((c) => c.nome), ['reversa_contar_comunicacoes_pendentes']);
    assert.equal(chamadasFluxo.length, 0);
    assert.equal(fila.length, 1, 'a fila simulada não foi consumida');
    funcao.filho.kill();
  });

  it('transporte configurado: reserva, revalida, chama o fluxo com OAuth e registra a ação do conector', async () => {
    chamadasRpc.length = 0; chamadasFluxo.length = 0;
    fila = [{ comunicacao_id: 'c-2', lock_token: 'l-2' }];
    const funcao = await iniciarFuncao({
      ETIQUETA_TRANSPORTE: 'power_automate',
      POWER_AUTOMATE_FLOW_URL: 'https://flow.example.test/workflows/abc/invoke',
      POWER_AUTOMATE_TENANT_ID: 'tenant-teste',
      POWER_AUTOMATE_CLIENT_ID: 'client-teste',
      POWER_AUTOMATE_CLIENT_SECRET: SEGREDO,
      POWER_AUTOMATE_SCOPE: 'https://service.flow.microsoft.com//.default',
      APP_BASE_URL: 'https://reverso.example.test',
    });
    const resposta = await chamar(funcao.porta);
    assert.equal(resposta.status, 200);
    const corpo = await resposta.json();
    assert.equal(corpo.modo, 'power_automate');
    assert.equal(corpo.entrega_ao_destinatario_confirmada, false);
    assert.equal(corpo.acoes_do_conector_concluidas, 1);
    assert.deepEqual(chamadasRpc.map((c) => c.nome), [
      'reversa_claim_comunicacao_etiqueta', 'reversa_iniciar_comunicacao_etiqueta',
      'reversa_finalizar_comunicacao_etiqueta_v2', 'reversa_claim_comunicacao_etiqueta',
    ]);
    assert.ok(chamadasRpc.every((c) => c.autorizacao === `Bearer ${CHAVE_SERVICO}`));
    assert.equal(chamadasFluxo.length, 1);
    assert.equal(chamadasFluxo[0].autorizacao, 'Bearer token-oauth-de-teste');
    const contrato = chamadasFluxo[0].contrato;
    assert.equal(contrato.evento, 'pedido_aprovado');
    assert.equal(contrato.destinatario.email, 'solicitante@example.test', 'o destinatário vem do banco, não do corpo da requisição');
    assert.equal(contrato.pedido.identificacao, 'RV-12345678');
    assert.equal(contrato.acao.url, 'https://reverso.example.test/admin/meus-pedidos?solicitacaoId=12345678-1234-4234-8234-123456789abc');
    assert.ok(contrato.mensagem.corpo_html.includes('Cliente &amp; Filhos'));
    assert.ok(contrato.mensagem.corpo_html.includes('aprovada</b> em 26/10/2026 18:32'));
    const finalizacao = chamadasRpc.find((c) => c.nome === 'reversa_finalizar_comunicacao_etiqueta_v2').args;
    assert.deepEqual(finalizacao, {
      p_comunicacao_id: 'c-2', p_lock_token: 'l-2', p_resultado: 'acao_conector_concluida', p_http_status: 200, p_detalhe: null,
    });
    funcao.filho.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
    for (const segredo of [SEGREDO, 'token-oauth-de-teste', CHAVE_SERVICO, 'solicitante@example.test']) {
      assert.ok(!funcao.log().includes(segredo), 'segredo ou e-mail apareceu na saída da função');
    }
  });
});
