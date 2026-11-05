// Núcleo do worker de notificações dos pedidos: sem APIs do Deno nem imports remotos, para rodar igual na
// Edge Function e nos testes (Node). A função index.ts apenas liga as variáveis de ambiente, o cliente
// Supabase e o fetch reais.
//
// Transporte: Power Automate (fluxo "Reverso — Notificações"). Uma chamada = um destinatário e um canal:
// canal=email executa somente o Outlook; canal=teams executa somente o Teams. Não há SMTP aqui: convites e
// definição de senha usam SMTP direto em outra Edge Function (admin-usuarios), com controle próprio.
import {
  classificarRespostaFluxo,
  montarContratoComunicacao,
  transportePowerAutomateConfigurado,
  type DadosComunicacaoEtiqueta,
  type ResultadoComunicacao,
} from './logic.ts';

export const LOTE_MAXIMO = 4;

type Reserva = { comunicacao_id: string; lock_token: string };
type ResultadoRpc = { data: unknown; error: { code?: string } | null };

export interface ClienteRpc {
  rpc(nome: string, parametros?: Record<string, unknown>): PromiseLike<ResultadoRpc>;
}

export interface DependenciasWorker {
  env: Record<string, string | undefined>;
  criarCliente: () => ClienteRpc;
  fetch: typeof fetch;
  /** Log sem dados pessoais nem segredos. */
  log?: (mensagem: string, detalhe?: string) => void;
}

function corpoToken(token: string): Record<string, unknown> | null {
  try {
    const parte = token.split('.')[1];
    if (!parte) return null;
    const base64 = parte.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** O gateway valida a assinatura (verify_jwt=true); aqui só se exige o papel de serviço. */
function chamadaDeServico(req: Request): boolean {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  return corpoToken(token)?.role === 'service_role';
}

function dadosRpc<T>(valor: T | T[] | null): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor;
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

export function criarWorker(deps: DependenciasWorker) {
  const log = deps.log ?? (() => {});
  let tokenPowerAutomate: { valor: string; expiraEm: number } | null = null;

  async function obterTokenPowerAutomate(): Promise<string> {
    if (tokenPowerAutomate && tokenPowerAutomate.expiraEm > Date.now() + 60_000) return tokenPowerAutomate.valor;
    const { POWER_AUTOMATE_TENANT_ID: tenant, POWER_AUTOMATE_CLIENT_ID: clientId,
      POWER_AUTOMATE_CLIENT_SECRET: clientSecret, POWER_AUTOMATE_SCOPE: scope } = deps.env;
    const resposta = await deps.fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant!)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(15_000),
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId!,
        client_secret: clientSecret!,
        scope: scope!,
      }),
    });
    if (!resposta.ok) throw new Error(`oauth_http_${resposta.status}`);
    const dados = await resposta.json() as { access_token?: string; expires_in?: number };
    if (!dados.access_token) throw new Error('oauth_token_ausente');
    tokenPowerAutomate = {
      valor: dados.access_token,
      expiraEm: Date.now() + Math.max(60, dados.expires_in ?? 300) * 1000,
    };
    return dados.access_token;
  }

  return async function tratarRequisicao(req: Request): Promise<Response> {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    // Somente service_role aciona o worker. O corpo é ignorado: nenhum destinatário
    // nem mensagem vindos do navegador.
    if (!chamadaDeServico(req)) return json({ erro: 'Acesso restrito ao worker.' }, 403);
    if (!deps.env.SUPABASE_URL || !deps.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ erro: 'Worker sem configuracao do Supabase.' }, 503);
    }
    const cliente = deps.criarCliente();

    if (!transportePowerAutomateConfigurado(deps.env)) {
      // Simulação: apenas conta. Não reserva, não inicia tentativa, não chama a rede e não marca nada como enviado.
      const { data, error } = await cliente.rpc('reversa_contar_comunicacoes_pendentes');
      if (error) {
        log('[comunicacao-etiqueta] contagem da fila falhou:', error.code ?? 'erro');
        return json({ erro: 'Nao foi possivel consultar a fila de comunicacao.' }, 500);
      }
      return json({ modo: 'simulado', envio_real: false, pendentes: data, alteracoes_na_fila: false });
    }

    let processadas = 0;
    let acoesConcluidas = 0;
    let falhas = 0;
    let errosPermanentes = 0;
    let resultadosIndeterminados = 0;
    let ignoradas = 0;

    for (let i = 0; i < LOTE_MAXIMO; i += 1) {
      const { data: reservaBruta, error: erroReserva } = await cliente.rpc('reversa_claim_comunicacao_etiqueta');
      if (erroReserva) {
        log('[comunicacao-etiqueta] reserva da fila falhou:', erroReserva.code ?? 'erro');
        return json({ erro: 'Nao foi possivel reservar um aviso pendente.' }, 500);
      }
      const reserva = dadosRpc(reservaBruta as Reserva | Reserva[] | null);
      if (!reserva) break;

      const { data: inicioBruto, error: erroInicio } = await cliente.rpc('reversa_iniciar_comunicacao_etiqueta', {
        p_comunicacao_id: reserva.comunicacao_id,
        p_lock_token: reserva.lock_token,
      });
      if (erroInicio) {
        log('[comunicacao-etiqueta] revalidacao da fila falhou:', erroInicio.code ?? 'erro');
        return json({ erro: 'Nao foi possivel revalidar o aviso antes do envio.' }, 500);
      }
      const dados = dadosRpc(inicioBruto as DadosComunicacaoEtiqueta | DadosComunicacaoEtiqueta[] | null);
      if (!dados) {
        ignoradas += 1;
        continue;
      }

      let statusHttp: number | null = null;
      let resultado: ResultadoComunicacao = 'resultado_indeterminado';
      let detalhe: string | null = null;
      let contrato: ReturnType<typeof montarContratoComunicacao> | null = null;
      try {
        contrato = montarContratoComunicacao(dados, deps.env.APP_BASE_URL!);
      } catch {
        // Falha local, antes de qualquer chamada externa: não adianta repetir.
        resultado = 'erro_permanente';
        detalhe = 'Nao foi possivel montar o contrato da mensagem (configuracao do aplicativo ou dados do pedido).';
      }

      if (contrato) {
        let bearer = '';
        try {
          // Esta etapa antecede qualquer chamada ao fluxo: falha OAuth pode ser retentada.
          bearer = await obterTokenPowerAutomate();
        } catch {
          resultado = 'falhou';
          detalhe = 'Falha ao obter token OAuth antes da chamada ao fluxo.';
        }

        if (bearer) {
          try {
            const resposta = await deps.fetch(deps.env.POWER_AUTOMATE_FLOW_URL!, {
              method: 'POST',
              headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(contrato),
              signal: AbortSignal.timeout(25_000),
            });
            statusHttp = resposta.status;
            let corpo: unknown = null;
            try { corpo = await resposta.json(); } catch { /* sem JSON confiável: estado ambíguo */ }
            resultado = classificarRespostaFluxo(resposta.status, corpo, contrato);
            if (resultado === 'falhou') detalhe = `O canal foi rejeitado antes da execucao (HTTP ${resposta.status}).`;
            if (resultado === 'erro_permanente') detalhe = 'O fluxo rejeitou explicitamente o contrato (canal, evento ou link); corrija o fluxo antes de reenviar.';
            if (resultado === 'resultado_indeterminado') detalhe = `Resultado ambiguo do fluxo (HTTP ${resposta.status}); verificar o historico antes de qualquer reenvio.`;
          } catch {
            // O request pode ter chegado ao Power Automate antes de um timeout ou
            // reset. Não reenviamos automaticamente este canal.
            resultado = 'resultado_indeterminado';
            detalhe = 'Sem resposta conclusiva do fluxo; verificar o historico antes de qualquer reenvio.';
          }
        }
      }

      processadas += 1;
      const { data: finalizada, error: erroFinalizacao } = await cliente.rpc('reversa_finalizar_comunicacao_etiqueta_v2', {
        p_comunicacao_id: dados.comunicacao_id,
        p_lock_token: dados.lock_token,
        p_resultado: resultado,
        p_http_status: statusHttp,
        p_detalhe: detalhe,
      });
      if (erroFinalizacao || finalizada !== true) {
        log('[comunicacao-etiqueta] resultado nao foi vinculado ao historico:', dados.comunicacao_id);
        falhas += 1;
        continue;
      }
      if (resultado === 'acao_conector_concluida') acoesConcluidas += 1;
      else if (resultado === 'falhou') falhas += 1;
      else if (resultado === 'erro_permanente') errosPermanentes += 1;
      else resultadosIndeterminados += 1;
    }

    return json({
      modo: 'power_automate',
      entrega_ao_destinatario_confirmada: false,
      processadas,
      acoes_do_conector_concluidas: acoesConcluidas,
      falhas,
      erros_permanentes: errosPermanentes,
      resultados_indeterminados: resultadosIndeterminados,
      ignoradas_por_revalidacao: ignoradas,
    });
  };
}
