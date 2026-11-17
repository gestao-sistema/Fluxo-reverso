// ── Supabase Edge Function: Correios Rastreio ──────────────────────────────
// Consulta API dos Correios (rastro) iterando sobre múltiplos contratos.
// Retorna a payload real para o frontend, e atualiza status/rastreamento_correios.
//
// Quem pode chamar (regras em acesso.ts):
//   • Automação (cron), com a chave service_role no Authorization: consulta o lote
//     inteiro ou um código.
//   • Usuário logado: consulta um código de uma solicitação que a RLS deixa ver para ele.
//     Lote e código sem solicitação visível são recusados antes de qualquer consulta externa.
// ─────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';
import { mapEventoParaStatus, extrairEventos, dataDaPostagem, funcaoAindaNaoExiste, type EventoRastro } from './logic.ts';
import { MENSAGEM, analisarCorpo, ehAutomacao, tokenDo } from './acesso.ts';
import { fetchSemBearerDaChave, obterChaveSupabase } from '../_shared/supabase-keys.ts';

const envSupabase = { get: (name: string) => Deno.env.get(name) ?? undefined };
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_PUBLISHABLE_KEY = obterChaveSupabase(envSupabase, 'publishable') ?? '';
const SUPABASE_SECRET_KEY = obterChaveSupabase(envSupabase, 'secret') ?? '';
const LEGACY_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Origens do app que podem chamar pelo navegador (ex.: https://app.exemplo.com.br), separadas
// por vírgula. Vazio: nenhuma origem recebe permissão de CORS (chamadas do navegador falham).
const ORIGENS_PERMITIDAS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origem) => origem.trim())
  .filter(Boolean);

function cabecalhosCors(req: Request): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
  const origem = req.headers.get('origin') ?? '';
  return ORIGENS_PERMITIDAS.includes(origem) ? { ...base, 'Access-Control-Allow-Origin': origem } : base;
}

function resposta(req: Request, corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhosCors(req), 'Content-Type': 'application/json' },
  });
}

/** Cliente com service_role: só depois que a chamada foi autorizada. */
function clienteAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    global: { fetch: fetchSemBearerDaChave(SUPABASE_SECRET_KEY) },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Confirma o token de usuário com o Auth do Supabase. */
async function usuarioDo(token: string): Promise<boolean> {
  const cliente = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await cliente.auth.getUser(token);
  return !error && !!data?.user;
}

/**
 * Pelo cliente do próprio usuário (RLS aplicada): a solicitação do código só aparece
 * se ele já enxerga a empresa dela. Falha de leitura conta como "não visível".
 */
async function solicitacaoVisivel(token: string, codigo: string): Promise<boolean> {
  const cliente = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await cliente
    .from('solicitacoes_reverso')
    .select('id')
    .eq('codigo_rastreio', codigo)
    .maybeSingle();
  if (error) {
    console.error('[correios-rastreio] leitura da solicitação falhou:', error.message);
    return false;
  }
  return !!data;
}

// Cache de tokens por conta (empresa/prefixo)
const tokensCache: Record<string, { token: string; expiraEmMs: number }> = {};

/** Busca token ativo para uma conta específica. */
async function getTokenParaConta(prefixo: string): Promise<string> {
  const agora = Date.now();
  if (tokensCache[prefixo] && agora < tokensCache[prefixo].expiraEmMs - 60_000) {
    return tokensCache[prefixo].token;
  }

  const usuario = Deno.env.get(`CORREIOS_USUARIO_${prefixo}`);
  const senha = Deno.env.get(`CORREIOS_SENHA_${prefixo}`);
  const cartao = Deno.env.get(`CORREIOS_CARTAO_POSTAGEM_${prefixo}`) ?? Deno.env.get(`CORREIOS_POSTAGEM_${prefixo}`);

  if (!usuario || !senha || !cartao) {
    throw new Error(`Credenciais Correios incompletas para ${prefixo}.`);
  }

  const basic = btoa(`${usuario}:${senha}`);
  const res = await fetch('https://api.correios.com.br/token/v1/autentica/cartaopostagem', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ numero: cartao }),
  });

  if (!res.ok) {
    throw new Error(`Falha autenticação Correios (${prefixo}): ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  tokensCache[prefixo] = { token: data.token, expiraEmMs: new Date(data.expiraEm).getTime() };
  return data.token;
}

/** Tenta consultar o objeto. Retorna o json bruto da API e status extraído se ok. */
async function consultarObjeto(codigoObjeto: string, token: string): Promise<{
  raw: any;
  pertenceAoContrato: boolean;
  ultimo: EventoRastro | null;
  todos: EventoRastro[];
} | null> {
  const res = await fetch(
    `https://api.correios.com.br/srorastro/v1/objetos/${codigoObjeto}?resultado=T`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Accept': 'application/json'
      }
    }
  );

  if (!res.ok) {
    console.error(`Erro rastreio HTTP ${res.status}`);
    return null;
  }

  const data = await res.json();
  const obj = data?.objetos?.[0] ?? {};

  // SRO-009: não pertence ao contrato. (SRO-020 é não localizado).
  const mensagem = obj.mensagem || '';
  if (mensagem.includes('SRO-009')) {
    return { raw: data, pertenceAoContrato: false, ultimo: null, todos: [] };
  }

  const eventos = extrairEventos(data) as EventoRastro[];
  return {
    raw: data,
    pertenceAoContrato: true,
    ultimo: eventos.length > 0 ? eventos[0] : null,
    todos: eventos,
  };
}

/** Fluxo principal: itera nas contas, busca, atualiza DB, retorna pro front. */
async function processarCodigo(supabaseAdmin: any, codigoRastreio: string) {
  // Lista de empresas baseadas nas chaves do ENV (ALINARE, AZIME, ARTIKLER, NOVITAH)
  const contas = ['ALINARE', 'AZIME', 'ARTIKLER', 'NOVITAH'];
  let ultimoRaw = null;
  let sucesso = false;
  let resultadoRastreio = null;

  for (const conta of contas) {
    try {
      const token = await getTokenParaConta(conta);
      const rastro = await consultarObjeto(codigoRastreio, token);

      if (rastro) {
        ultimoRaw = rastro.raw;
        // Se pertencer ao contrato ou já achou eventos reais (evita loop cego)
        if (rastro.pertenceAoContrato) {
          sucesso = true;
          resultadoRastreio = rastro;
          break; // Achou o contrato dono do pacote
        }
      }
    } catch (err) {
      console.warn(`[rastreio] ERRO conta ${conta}: ${(err as Error).message}`);
    }
  }

  // Se passou por todas as contas e nenhuma é dona, retorna o último raw (ex: SRO-009 ou SRO-020)
  if (!sucesso || !resultadoRastreio || !resultadoRastreio.ultimo) {
    return ultimoRaw || { erro: 'Falha de comunicação com os Correios.' };
  }

  // ── Atualização do BD (se achou eventos) ──
  const evento = resultadoRastreio.ultimo;
  const novoStatus = mapEventoParaStatus(evento.codigo);
  const cidade = evento.unidade?.endereco?.cidade ?? null;
  const uf = evento.unidade?.endereco?.uf ?? null;

  const { data: solicitacao } = await supabaseAdmin
    .from('solicitacoes_reverso')
    .select('id, status')
    .eq('codigo_rastreio', codigoRastreio)
    .maybeSingle();

  if (solicitacao) {
    // Se já concluído, não bate na API dos Correios — evita gasto de quota
    if (solicitacao.status === 'concluido') {
      return ultimoRaw || { erro: 'Solicitação já concluída.' };
    }
    await supabaseAdmin.from('rastreamento_correios').upsert({
      codigo_rastreio: codigoRastreio,
      solicitacao_id: solicitacao.id,
      ultimo_evento_codigo: evento.codigo,
      ultimo_evento_descricao: evento.descricao,
      unidade_cidade: cidade,
      unidade_uf: uf,
      eventos: resultadoRastreio.todos,
      ultimo_check_em: new Date().toISOString(),
    }, { onConflict: 'codigo_rastreio' });

    if (novoStatus && novoStatus !== solicitacao.status) {
      // Primeiro a postagem na emissão (fonte rastreio): se falhar, o pedido não muda de etapa e a
      // próxima consulta tenta de novo. Banco ainda sem a função: segue como antes, só com a etapa.
      const { error: erroPostagem } = await supabaseAdmin.rpc('registrar_postagem_rastreio', {
        p_solicitacao_id: solicitacao.id,
        p_codigo_rastreio: codigoRastreio,
        p_postagem_em: dataDaPostagem(resultadoRastreio.todos),
      });
      if (erroPostagem) {
        if (!funcaoAindaNaoExiste(erroPostagem)) throw new Error(`registrar_postagem_rastreio: ${erroPostagem.message}`);
        console.warn('[correios-rastreio] registrar_postagem_rastreio ainda não existe neste banco; aplique a migration 20261027140000.');
      }

      const timestampCol = novoStatus === 'postado' ? 'postado_em'
        : novoStatus === 'em_transito' ? 'em_transito_em'
        : 'concluido_em';

      await supabaseAdmin.from('solicitacoes_reverso').update({
        status: novoStatus,
        [timestampCol]: new Date().toISOString(),
        ultima_cidade_rastreio: cidade && uf ? `${cidade}/${uf}` : null,
      }).eq('id', solicitacao.id);

      await supabaseAdmin.from('solicitacoes_historico').insert({
        solicitacao_id: solicitacao.id,
        user_nome: 'Sistema (Correios)',
        acao: `Rastreio: ${evento.descricao}`,
      });
    }
  }

  // Retorna JSON bruto da API para o frontend
  return resultadoRastreio.raw;
}

/** Lote: consulta cada pacote pendente. Só a automação chega aqui. */
async function processarLote(supabaseAdmin: any) {
  const { data: pendentes, error } = await supabaseAdmin
    .from('solicitacoes_reverso')
    .select('codigo_rastreio')
    // Inclui etiqueta_gerada: pacote pode ter sido postado nos Correios sem o usuário registrar no sistema.
    .in('status', ['etiqueta_gerada', 'postado', 'em_transito'])
    .not('codigo_rastreio', 'is', null);
  if (error) throw error;

  let falhas = 0;
  for (const row of pendentes ?? []) {
    try {
      await processarCodigo(supabaseAdmin, row.codigo_rastreio as string);
    } catch (err) {
      // Um código com problema não interrompe os demais
      falhas++;
      console.error('[correios-rastreio] lote: código falhou:', (err as Error).message);
    }
  }
  return { success: true, count: pendentes?.length ?? 0, falhas };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabecalhosCors(req) });
  if (req.method !== 'POST') return resposta(req, { erro: MENSAGEM.metodo }, 405);

  try {
    const token = tokenDo(req.headers.get('authorization'));
    const chavesApresentadas = [token ?? '', req.headers.get('apikey') ?? ''];
    const automacao = chavesApresentadas.some((chave) =>
      ehAutomacao(chave, SUPABASE_SECRET_KEY) || ehAutomacao(chave, LEGACY_SERVICE_ROLE_KEY),
    );
    if (!automacao && !token) return resposta(req, { erro: MENSAGEM.naoAutorizado }, 401);

    const analise = analisarCorpo(await req.text());
    if (!analise.ok) return resposta(req, { erro: analise.mensagem }, 400);
    const { codigo } = analise;

    // Automação: aceita sb_secret em apikey e mantém a chave antiga em Authorization durante a migração.
    if (automacao) {
      const admin = clienteAdmin();
      if (codigo) return resposta(req, await processarCodigo(admin, codigo));
      return resposta(req, await processarLote(admin));
    }

    // Usuário logado: sessão válida, código obrigatório e solicitação visível para ele
    if (!token || !(await usuarioDo(token))) return resposta(req, { erro: MENSAGEM.naoAutorizado }, 401);
    if (!codigo) return resposta(req, { erro: MENSAGEM.loteRestrito }, 403);
    if (!(await solicitacaoVisivel(token, codigo))) return resposta(req, { erro: MENSAGEM.naoEncontrada }, 404);

    return resposta(req, await processarCodigo(clienteAdmin(), codigo));
  } catch (err) {
    console.error('[correios-rastreio] erro inesperado:', (err as Error).message);
    return resposta(req, { erro: MENSAGEM.interno }, 500);
  }
});
