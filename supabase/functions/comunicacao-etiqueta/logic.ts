import {
  montarEmailEtiquetaDisponivel,
  montarMensagemTeamsEtiquetaDisponivel,
  ROTULO_ABRIR_MEU_PEDIDO,
  TITULO_ETIQUETA_DISPONIVEL,
  type DadosMensagemEtiqueta,
} from './email-visual.ts';

// Notificações dos pedidos: Power Automate (Outlook e Teams), um destinatário e um canal por chamada.
// Convites e definição de senha seguem exclusivamente por SMTP (supabase/functions/admin-usuarios);
// nada neste módulo envia por SMTP.

export type CanalComunicacao = 'email' | 'teams';

export type EventoComunicacao =
  | 'pedido_criado'
  | 'aprovacao_pendente'
  | 'pedido_aprovado'
  | 'pedido_rejeitado'
  | 'emissao_pendente'
  | 'etiqueta_disponivel'
  | 'postagem_confirmada'
  | 'recebimento_confirmado';

export interface DadosComunicacaoEtiqueta {
  comunicacao_id: string;
  tentativa_id: string;
  lock_token: string;
  emissao_id: string | null;
  solicitacao_id: string;
  evento: EventoComunicacao;
  canal: CanalComunicacao;
  destinatario_id: string;
  destinatario_email: string;
  empresa: string;
  setor: string | null;
  cliente_codigo: string;
  cliente_nome: string;
  motivo?: string | null;
  data_solicitacao?: string | null;
  codigo_rastreio: string | null;
  valida_ate: string | null;
  emitida_em: string | null;
  justificativa: string | null;
  versao: number | null;
  transicao_em: string | null;
  postagem_em?: string | null;
}

/**
 * Dados preparados para a mensagem: uma chamada = um destinatário e um canal.
 * Os campos estruturados são dados puros (sem escape). Somente `mensagem.corpo_html`
 * carrega HTML e é montado aqui, com todo texto de origem externa escapado.
 */
export interface ContratoComunicacaoEtiqueta {
  versao: 1;
  evento: EventoComunicacao;
  idempotency_key: string;
  canal: CanalComunicacao;
  destinatario: { id: string; email: string };
  pedido: {
    id: string;
    identificacao: string;
    empresa: string;
    setor: string | null;
    motivo: string | null;
    data_solicitacao: string | null;
  };
  cliente: { codigo: string; nome: string };
  codigo_rastreio: string | null;
  validade: string | null;
  emitida_em: string | null;
  postagem_em: string | null;
  evento_em: string | null;
  justificativa: string | null;
  mensagem: { assunto: string; corpo_html: string };
  acao: { rotulo: string; url: string };
}

export type ResultadoComunicacao = 'acao_conector_concluida' | 'falhou' | 'resultado_indeterminado' | 'erro_permanente';

const EVENTOS_DE_TAREFA: ReadonlySet<EventoComunicacao> = new Set(['aprovacao_pendente', 'emissao_pendente']);

export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (caractere) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[caractere] ?? caractere);
}

/** Remove caracteres de controle (inclui quebras de linha) de texto que vai para cabeçalhos ou assunto. */
export function textoLinha(texto: string): string {
  let saida = '';
  let anteriorEraControle = false;
  for (const caractere of texto) {
    const codigo = caractere.charCodeAt(0);
    const controle = codigo <= 0x1f || codigo === 0x7f;
    if (controle) {
      if (!anteriorEraControle) saida += ' ';
    } else {
      saida += caractere;
    }
    anteriorEraControle = controle;
  }
  return saida.trim();
}

function dataCalendarioBr(data: string | null): string | null {
  if (!data) return null;
  const correspondencia = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  if (!correspondencia) return null;
  return `${correspondencia[3]}/${correspondencia[2]}/${correspondencia[1]}`;
}

function dataHoraBr(instante: string | null): string | null {
  if (!instante) return null;
  const data = new Date(instante);
  if (Number.isNaN(data.getTime())) return null;
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(data);
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? '';
  return `${valor('day')}/${valor('month')}/${valor('year')} ${valor('hour')}:${valor('minute')}`;
}

export function identificacaoPedido(solicitacaoId: string): string {
  return `RV-${solicitacaoId.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}

const titulos: Record<EventoComunicacao, string> = {
  pedido_criado: 'Pedido de logística reversa registrado',
  aprovacao_pendente: 'Solicitação aguardando aprovação',
  pedido_aprovado: 'Pedido de logística reversa aprovado',
  pedido_rejeitado: 'Pedido de logística reversa rejeitado',
  emissao_pendente: 'Pedido aprovado: emissão da etiqueta pendente',
  etiqueta_disponivel: TITULO_ETIQUETA_DISPONIVEL,
  postagem_confirmada: 'Postagem do pedido confirmada',
  recebimento_confirmado: 'Recebimento da mercadoria confirmado',
};

/**
 * Origem do aplicativo aceita para montar links: HTTPS (ou localhost em desenvolvimento),
 * sem credenciais, caminho, consulta ou fragmento. Qualquer outro valor é recusado.
 */
export function origemAplicativoValida(valor: string | undefined): URL | null {
  if (!valor) return null;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return null;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  return url;
}

function montarDestino(dados: DadosComunicacaoEtiqueta, appBaseUrl: string): URL {
  const base = origemAplicativoValida(appBaseUrl);
  if (!base) throw new Error('APP_BASE_URL inválida.');
  const caminho = dados.evento === 'aprovacao_pendente'
    ? '/admin/aprovacoes'
    : dados.evento === 'emissao_pendente'
      ? '/admin/etiquetas'
      : '/admin/meus-pedidos';
  const destino = new URL(caminho, base);
  // O identificador vem do banco; mesmo assim só um UUID entra na URL.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dados.solicitacao_id)) {
    throw new Error('Identificador de pedido inválido.');
  }
  destino.searchParams.set(dados.evento === 'emissao_pendente' ? 'pedido' : 'solicitacaoId', dados.solicitacao_id);
  return destino;
}

function montarCorpoHtml(
  dados: DadosComunicacaoEtiqueta,
  identificacao: string,
  acao: { rotulo: string; url: string },
): string {
  const quando = dataHoraBr(dados.transicao_em);
  const resumo = [
    `Pedido: <b>${escaparHtml(identificacao)}</b>`,
    `Empresa: ${escaparHtml(dados.empresa)}${dados.setor ? ` · Setor: ${escaparHtml(dados.setor)}` : ''}`,
    `Cliente: ${escaparHtml(dados.cliente_nome)} (${escaparHtml(dados.cliente_codigo)})`,
  ];
  const dataPedido = dataCalendarioBr(dados.data_solicitacao ?? null);
  if (dataPedido) resumo.push(`Data da solicitação: ${dataPedido}`);
  if (dados.motivo) resumo.push(`Motivo: ${escaparHtml(dados.motivo)}`);
  const blocos = [`<p>${resumo.join('<br>')}</p>`];

  switch (dados.evento) {
    case 'pedido_criado':
      blocos.unshift('<p>Recebemos sua solicitação de logística reversa. Guarde o número do pedido para acompanhar.</p>');
      break;
    case 'aprovacao_pendente':
      blocos.unshift(`<p>Há uma solicitação da empresa ${escaparHtml(dados.empresa)} aguardando sua análise${dados.setor ? ` no setor ${escaparHtml(dados.setor)}` : ''}.</p>`);
      break;
    case 'pedido_aprovado':
      blocos.unshift(`<p>Sua solicitação foi <b>aprovada</b>${quando ? ` em ${quando}` : ''} e encaminhada para a expedição.</p>`);
      break;
    case 'pedido_rejeitado':
      blocos.unshift(`<p>Sua solicitação foi <b>rejeitada</b>${quando ? ` em ${quando}` : ''}.</p>${dados.justificativa ? `<p><b>Justificativa:</b> ${escaparHtml(dados.justificativa)}</p>` : ''}`);
      break;
    case 'emissao_pendente':
      blocos.unshift('<p>O pedido foi aprovado e aguarda a emissão manual da etiqueta.</p>');
      break;
    case 'postagem_confirmada': {
      const dataPostagem = dataCalendarioBr(dados.postagem_em ?? null);
      blocos.unshift(`<p>A <b>postagem</b> do pedido foi confirmada no sistema${quando ? ` em ${quando}` : ''}${dataPostagem ? ` (postada em ${dataPostagem})` : ''}.</p>`);
      break;
    }
    case 'recebimento_confirmado':
      blocos.unshift(`<p>O <b>recebimento da mercadoria</b> foi confirmado pela empresa${quando ? ` em ${quando}` : ''}.</p>`);
      break;
  }

  blocos.push(EVENTOS_DE_TAREFA.has(dados.evento)
    ? '<p><i>Tarefa pendente: se outra pessoa já tiver concluído esta etapa, o sistema mostra a situação atual.</i></p>'
    : '<p><i>Atualização do histórico do pedido. Veja a situação atual no sistema.</i></p>');
  blocos.push(`<p><a href="${escaparHtml(acao.url)}">${escaparHtml(acao.rotulo)}</a></p>`);
  return `<h2>${escaparHtml(titulos[dados.evento])}</h2>${blocos.join('')}`;
}

/** Aviso de etiqueta: e-mail no padrão visual aprovado (Outlook) e mensagem curta (Teams). */
function corpoEtiquetaDisponivel(
  dados: DadosComunicacaoEtiqueta,
  identificacao: string,
  acao: { rotulo: string; url: string },
): string {
  const mensagem: DadosMensagemEtiqueta = {
    identificacao,
    empresa: dados.empresa,
    clienteNome: dados.cliente_nome || null,
    emitidaEm: dataCalendarioBr(dados.emitida_em),
    codigoRastreio: dados.codigo_rastreio,
    validade: dataCalendarioBr(dados.valida_ate),
    rotulo: acao.rotulo,
    url: acao.url,
  };
  return dados.canal === 'teams' ? montarMensagemTeamsEtiquetaDisponivel(mensagem) : montarEmailEtiquetaDisponivel(mensagem);
}

export function montarContratoComunicacao(
  dados: DadosComunicacaoEtiqueta,
  appBaseUrl: string,
): ContratoComunicacaoEtiqueta {
  const destino = montarDestino(dados, appBaseUrl);
  const acao = {
    rotulo: dados.evento === 'etiqueta_disponivel' ? ROTULO_ABRIR_MEU_PEDIDO : 'Abrir pedido',
    url: destino.toString(),
  };
  const identificacao = identificacaoPedido(dados.solicitacao_id);
  const corpoHtml = dados.evento === 'etiqueta_disponivel'
    ? corpoEtiquetaDisponivel(dados, identificacao, acao)
    : montarCorpoHtml(dados, identificacao, acao);

  return {
    versao: 1,
    evento: dados.evento,
    idempotency_key: dados.comunicacao_id,
    canal: dados.canal,
    destinatario: { id: dados.destinatario_id, email: dados.destinatario_email },
    pedido: {
      id: dados.solicitacao_id,
      identificacao,
      empresa: dados.empresa,
      setor: dados.setor,
      motivo: dados.motivo ?? null,
      data_solicitacao: dados.data_solicitacao ?? null,
    },
    cliente: { codigo: dados.cliente_codigo, nome: dados.cliente_nome },
    codigo_rastreio: dados.codigo_rastreio,
    validade: dataCalendarioBr(dados.valida_ate),
    emitida_em: dataCalendarioBr(dados.emitida_em),
    postagem_em: dataCalendarioBr(dados.postagem_em ?? null),
    evento_em: dados.transicao_em,
    justificativa: dados.justificativa,
    mensagem: {
      assunto: textoLinha(`${titulos[dados.evento]} · ${identificacao}`),
      corpo_html: corpoHtml,
    },
    acao,
  };
}

const REJEICOES_EXPLICITAS = new Set(['invalid_channel', 'invalid_event', 'invalid_link', 'invalid_content']);

/**
 * Só "ação do conector concluída" (HTTP 2xx + corpo com a chave de correlação e o canal enviados) vale como
 * sucesso. Não prova entrega na caixa nem leitura. Na dúvida, resultado indeterminado: nunca reenvio cego.
 */
export function classificarRespostaFluxo(
  statusHttp: number,
  corpo: unknown,
  contrato: Pick<ContratoComunicacaoEtiqueta, 'idempotency_key' | 'canal'>,
): ResultadoComunicacao {
  if (!corpo || typeof corpo !== 'object') {
    // Sem corpo validado não sabemos se o fluxo executou o conector.
    return statusHttp === 401 || statusHttp === 403 ? 'falhou' : 'resultado_indeterminado';
  }
  const resposta = corpo as Record<string, unknown>;
  // Rejeição explícita do contrato antes de qualquer conector (canal, evento, link ou conteúdo inválido).
  if (statusHttp === 400 && typeof resposta.status === 'string' && REJEICOES_EXPLICITAS.has(resposta.status)
    && resposta.communication_id === contrato.idempotency_key) {
    return 'erro_permanente';
  }
  const corresponde = resposta.communication_id === contrato.idempotency_key
    && resposta.canal === contrato.canal;
  if (statusHttp >= 200 && statusHttp < 300
    && resposta.status === 'connector_action_succeeded' && corresponde) {
    return 'acao_conector_concluida';
  }
  if (statusHttp >= 400 && corresponde && resposta.status === 'connector_action_failed') {
    // O fluxo só deve declarar retryable=true quando houver certeza de que nenhum envio foi aceito pelo
    // conector. Timeout/resultado incerto encerra em estado indeterminado.
    return resposta.retryable === true ? 'falhou' : 'resultado_indeterminado';
  }
  if (statusHttp === 401 || statusHttp === 403) return 'falhou';
  return 'resultado_indeterminado';
}

/**
 * Notificações dos pedidos pelo Power Automate. Controle próprio (ETIQUETA_TRANSPORTE), independente de
 * controle dos convites. Sem tudo configurado, o worker só conta pendências (modo simulado).
 */
export function transportePowerAutomateConfigurado(env: Record<string, string | undefined>): boolean {
  let urlFluxo: URL | null = null;
  try {
    urlFluxo = env.POWER_AUTOMATE_FLOW_URL ? new URL(env.POWER_AUTOMATE_FLOW_URL) : null;
  } catch {
    urlFluxo = null;
  }
  return env.ETIQUETA_TRANSPORTE === 'power_automate'
    && urlFluxo?.protocol === 'https:'
    && Boolean(env.POWER_AUTOMATE_TENANT_ID)
    && Boolean(env.POWER_AUTOMATE_CLIENT_ID)
    && Boolean(env.POWER_AUTOMATE_CLIENT_SECRET)
    && Boolean(env.POWER_AUTOMATE_SCOPE)
    && origemAplicativoValida(env.APP_BASE_URL) !== null;
}
