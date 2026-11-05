// Demonstração das comunicações automáticas e dos relatórios. Dados fictícios e locais:
// nada é enviado e nenhuma regra do banco é consultada. A fidelidade é parcial e declarada.
import type {
  AcaoReconciliacao,
  ComunicacaoReversa,
  FiltrosComunicacao,
  FiltrosRelatorio,
  HistoricoComunicacao,
  LinhaRelatorioReversa,
  RelatorioReversa,
  ReversaEmissaoResumo,
  Solicitacao,
} from '../types';
import { codigoPedido } from '../lib/pedido';

export interface DemoComunicacao extends Omit<ComunicacaoReversa, 'total' | 'reconciliacoes'> {
  historico: HistoricoComunicacao;
}

const agora = () => new Date().toISOString();
const minutosAtras = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();

function comunicacao(
  indice: number,
  solicitacaoId: string,
  empresa: ComunicacaoReversa['empresa'],
  evento: string,
  canal: ComunicacaoReversa['canal'],
  status: string,
  tentativas: number,
  destinatarioNome: string,
  destinatarioEmail: string,
): DemoComunicacao {
  const indeterminado = status === 'resultado_indeterminado';
  return {
    id: `demo-comunicacao-${String(indice).padStart(4, '0')}`,
    solicitacao_id: solicitacaoId,
    pedido: codigoPedido(solicitacaoId),
    empresa,
    evento,
    canal,
    destinatario_nome: destinatarioNome,
    destinatario_email: destinatarioEmail,
    status,
    tentativas,
    max_tentativas: 5,
    criado_em: minutosAtras(90 - indice * 5),
    atualizado_em: minutosAtras(60 - indice * 5),
    proxima_tentativa_em: status === 'pendente' ? minutosAtras(1) : null,
    acao_conector_em: status === 'acao_conector_concluida' ? minutosAtras(58 - indice * 5) : null,
    ultimo_erro: indeterminado ? 'Resultado ambiguo do fluxo (HTTP 502); verificar o historico antes de qualquer reenvio.' : '',
    historico: {
      tentativas: tentativas > 0 ? [{
        iniciada_em: minutosAtras(70 - indice * 5),
        finalizada_em: minutosAtras(69 - indice * 5),
        resultado: indeterminado ? 'resultado_indeterminado' : 'acao_conector_concluida',
        transporte: null,
        http_status: indeterminado ? 502 : 200,
        codigo_smtp: null,
        detalhe: indeterminado ? 'Resultado ambiguo do fluxo (HTTP 502); verificar o historico antes de qualquer reenvio.' : '',
      }] : [],
      reconciliacoes: [],
    },
  };
}

export function comunicacoesDemoIniciais(solicitacoes: Solicitacao[]): DemoComunicacao[] {
  const [a, b, c] = solicitacoes;
  if (!a || !b || !c) return [];
  return [
    comunicacao(1, a.id, a.empresa, 'pedido_criado', 'email', 'acao_conector_concluida', 1, 'Camila Oliveira', 'camila.oliveira@example.test'),
    comunicacao(2, b.id, b.empresa, 'pedido_aprovado', 'email', 'resultado_indeterminado', 1, 'Camila Oliveira', 'camila.oliveira@example.test'),
    comunicacao(3, b.id, b.empresa, 'emissao_pendente', 'teams', 'resultado_indeterminado', 1, 'Bianca Rocha', 'bianca.rocha@example.test'),
    comunicacao(4, c.id, c.empresa, 'aprovacao_pendente', 'teams', 'pendente', 0, 'Paula Mendes', 'paula.mendes@example.test'),
    comunicacao(5, c.id, c.empresa, 'pedido_rejeitado', 'email', 'evento_obsoleto', 0, 'Rafael Mendes', 'rafael.mendes@example.test'),
  ];
}

export function filtrarComunicacoesDemo(itens: DemoComunicacao[], filtros: FiltrosComunicacao = {}): ComunicacaoReversa[] {
  const limite = Math.min(Math.max(filtros.limite ?? 50, 1), 200);
  const desde = Math.max(filtros.deslocamento ?? 0, 0);
  const filtrados = itens
    .filter((item) => (!filtros.status || item.status === filtros.status)
      && (!filtros.evento || item.evento === filtros.evento)
      && (!filtros.canal || item.canal === filtros.canal)
      && (!filtros.solicitacaoId || item.solicitacao_id === filtros.solicitacaoId))
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  return filtrados.slice(desde, desde + limite).map(({ historico, ...item }) => ({
    ...item,
    reconciliacoes: historico.reconciliacoes.length,
    total: filtrados.length,
  }));
}

/** Mesmas regras do banco: só resultado_indeterminado, justificativa e referência obrigatórias. */
export function reconciliarComunicacaoDemo(
  itens: DemoComunicacao[],
  id: string,
  acao: AcaoReconciliacao,
  justificativa: string,
  referencia: string,
  administrador: string,
): DemoComunicacao {
  const item = itens.find((candidato) => candidato.id === id);
  if (!item) throw new Error('Comunicação não encontrada.');
  const textoJustificativa = justificativa.trim();
  const textoReferencia = referencia.trim();
  if (textoJustificativa.length < 10 || textoJustificativa.length > 1000) throw new Error('Informe a justificativa (10 a 1000 caracteres).');
  if (textoReferencia.length < 3 || textoReferencia.length > 200) throw new Error('Informe a referência da execução ou evidência (3 a 200 caracteres).');
  if (item.status !== 'resultado_indeterminado') {
    throw new Error(`Só comunicações com resultado indeterminado podem ser reconciliadas (situação atual: ${item.status}).`);
  }
  const anterior = { status: item.status, tentativas: item.tentativas, max_tentativas: item.max_tentativas };
  if (acao === 'confirmar_conclusao_conector') {
    item.status = 'acao_conector_concluida';
    item.acao_conector_em = agora();
    item.ultimo_erro = '';
  } else {
    item.status = 'pendente';
    item.max_tentativas = Math.max(item.max_tentativas, item.tentativas + 1);
    item.proxima_tentativa_em = agora();
  }
  item.atualizado_em = agora();
  item.historico.reconciliacoes.push({
    acao,
    administrador_nome: administrador,
    realizado_em: agora(),
    justificativa: textoJustificativa,
    referencia: textoReferencia,
    status_anterior: anterior.status,
    status_novo: item.status,
    valores_anteriores: anterior,
    valores_novos: { status: item.status, tentativas: item.tentativas, max_tentativas: item.max_tentativas },
  });
  return item;
}

// ── Relatórios ───────────────────────────────────────────────────────────────

type Aprovacao = 'aguardando' | 'aprovada' | 'rejeitada' | 'legado';

function aprovacaoDe(pedido: Solicitacao): Aprovacao {
  if (pedido.aprovacao_legada) return 'legado';
  if (pedido.aprovacao_status === 'aprovada') return 'aprovada';
  if (pedido.aprovacao_status === 'rejeitada' || pedido.status === 'reprovado') return 'rejeitada';
  if (pedido.aprovacao_status === 'aguardando_aprovacao' || pedido.status === 'aguardando_aprovacao') return 'aguardando';
  return 'aprovada';
}

const liberado = (pedido: Solicitacao) => ['aprovada', 'legado'].includes(aprovacaoDe(pedido));

function recorteDemo(solicitacoes: Solicitacao[], emissoes: Array<ReversaEmissaoResumo & { emissao_anterior_id?: string | null }>, filtros: FiltrosRelatorio) {
  if (filtros.campoData === 'decisao' || filtros.campoData === 'postagem') {
    throw new Error('A demonstração não registra essa data. Use a data da solicitação ou da emissão.');
  }
  const noPeriodo = (data: string | null | undefined) => !!data
    && (!filtros.inicio || data >= filtros.inicio) && (!filtros.fim || data <= filtros.fim);
  const base = solicitacoes.filter((pedido) => (filtros.empresa === 'Ambas' || pedido.empresa === filtros.empresa)
    && (filtros.campoData === 'solicitacao'
      ? (!filtros.inicio || pedido.data_solicitacao >= filtros.inicio) && (!filtros.fim || pedido.data_solicitacao <= filtros.fim)
      : emissoes.some((emissao) => emissao.solicitacao_id === pedido.id && noPeriodo(emissao.emitida_em))));
  const ids = new Set(base.map((pedido) => pedido.id));
  const dasEmissoes = emissoes.filter((emissao) => ids.has(emissao.solicitacao_id)
    && (filtros.campoData !== 'emissao' || noPeriodo(emissao.emitida_em)));
  return { base, emissoes: dasEmissoes };
}

const hojeIso = (hoje: Date) => `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

export function relatorioDemo(
  solicitacoes: Solicitacao[],
  emissoes: Array<ReversaEmissaoResumo & { emissao_anterior_id?: string | null }>,
  filtros: FiltrosRelatorio,
  hoje = new Date(),
): RelatorioReversa {
  const { base, emissoes: dasEmissoes } = recorteDemo(solicitacoes, emissoes, filtros);
  const liberados = base.filter(liberado);
  const motivos = new Map<string, number>();
  base.forEach((pedido) => motivos.set(pedido.motivo, (motivos.get(pedido.motivo) ?? 0) + 1));
  const hojeData = hojeIso(hoje);
  const vencidasSemPostagem = base.filter((pedido) => {
    const doPedido = emissoes.filter((emissao) => emissao.solicitacao_id === pedido.id);
    const vigente = doPedido.find((emissao) => !emissao.substituida_em);
    return !!vigente?.valida_ate && vigente.valida_ate < hojeData && !doPedido.some((emissao) => !!emissao.postagem_confirmada_em);
  }).length;
  const contagem = (aprovacao: Aprovacao) => base.filter((pedido) => aprovacaoDe(pedido) === aprovacao).length;
  const etapa = (status: Solicitacao['status']) => liberados.filter((pedido) => pedido.status === status).length;

  return {
    filtro: {
      empresa: filtros.empresa === 'Ambas' ? null : filtros.empresa,
      campo_data: filtros.campoData,
      inicio: filtros.inicio ?? null,
      fim: filtros.fim ?? null,
    },
    solicitacoes: base.length,
    por_empresa: {
      ...(base.some((pedido) => pedido.empresa === 'Alinare') ? { Alinare: base.filter((pedido) => pedido.empresa === 'Alinare').length } : {}),
      ...(base.some((pedido) => pedido.empresa === 'Novitah') ? { Novitah: base.filter((pedido) => pedido.empresa === 'Novitah').length } : {}),
    },
    por_motivo: [...motivos.entries()].map(([motivo, quantidade]) => ({ motivo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade || a.motivo.localeCompare(b.motivo)),
    aprovacao: {
      aguardando: contagem('aguardando'),
      aprovada: contagem('aprovada'),
      rejeitada: contagem('rejeitada'),
      legado_sem_decisao_registrada: contagem('legado'),
    },
    logistica: {
      aguardando_emissao: etapa('pendente'),
      aguardando_checkin: etapa('etiqueta_gerada'),
      postado: etapa('postado'),
      em_transito: etapa('em_transito'),
      concluido: etapa('concluido'),
      sem_liberacao_logistica: base.length - liberados.length,
    },
    emissoes: {
      total: dasEmissoes.length,
      primeiras_emissoes: dasEmissoes.filter((emissao) => !emissao.emissao_anterior_id).length,
      reemissoes: dasEmissoes.filter((emissao) => !!emissao.emissao_anterior_id).length,
      pedidos_com_emissao: new Set(dasEmissoes.map((emissao) => emissao.solicitacao_id)).size,
      pedidos_com_reemissao: new Set(dasEmissoes.filter((emissao) => !!emissao.emissao_anterior_id).map((emissao) => emissao.solicitacao_id)).size,
      com_pdf_vinculado: dasEmissoes.filter((emissao) => !!emissao.pdf_path).length,
    },
    postagem: {
      pedidos_com_postagem_confirmada: base.filter((pedido) => emissoes.some((emissao) => emissao.solicitacao_id === pedido.id && !!emissao.postagem_confirmada_em)).length,
      pedidos_com_etiqueta_vencida_sem_postagem_confirmada: vencidasSemPostagem,
    },
    // A demonstração não guarda quem confirmou o recebimento: o número manual fica zerado.
    recebimento: { concluidos: base.filter((pedido) => pedido.status === 'concluido').length, recebimento_confirmado_manualmente: 0 },
    custo_disponivel: false,
    gerado_em: agora(),
  };
}

export function linhasRelatorioDemo(
  solicitacoes: Solicitacao[],
  emissoes: Array<ReversaEmissaoResumo & { emissao_anterior_id?: string | null }>,
  filtros: FiltrosRelatorio,
  hoje = new Date(),
): LinhaRelatorioReversa[] {
  const { base } = recorteDemo(solicitacoes, emissoes, filtros);
  const hojeData = hojeIso(hoje);
  const situacaoAprovacao: Record<Aprovacao, string> = {
    legado: 'Legado (sem decisão registrada)', aprovada: 'Aprovada', rejeitada: 'Rejeitada', aguardando: 'Aguardando aprovação',
  };
  const situacaoLogistica: Partial<Record<Solicitacao['status'], string>> = {
    pendente: 'Aguardando emissão da etiqueta', etiqueta_gerada: 'Aguardando check-in', postado: 'Postado',
    em_transito: 'Em trânsito', concluido: 'Concluído',
  };
  return [...base].sort((a, b) => a.data_solicitacao.localeCompare(b.data_solicitacao) || a.id.localeCompare(b.id)).map((pedido) => {
    const doPedido = emissoes.filter((emissao) => emissao.solicitacao_id === pedido.id);
    const vigente = doPedido.find((emissao) => !emissao.substituida_em);
    const postagem = doPedido.map((emissao) => emissao.postagem_confirmada_em).filter(Boolean).sort()[0] ?? null;
    return {
      pedido: codigoPedido(pedido.id),
      empresa: pedido.empresa,
      setor: pedido.setor,
      data_solicitacao: pedido.data_solicitacao,
      motivo: pedido.motivo,
      situacao_aprovacao: situacaoAprovacao[aprovacaoDe(pedido)],
      decisao_em: null,
      situacao_logistica: liberado(pedido) ? situacaoLogistica[pedido.status] ?? pedido.status : 'Sem liberação logística',
      emissoes: doPedido.length,
      reemissoes: doPedido.filter((emissao) => !!emissao.emissao_anterior_id).length,
      ultima_emissao_em: doPedido.map((emissao) => emissao.emitida_em).filter(Boolean).sort().at(-1) ?? null,
      valida_ate: vigente?.valida_ate ?? null,
      postagem_confirmada_em: postagem ? postagem.slice(0, 10) : null,
      etiqueta_vencida_sem_postagem_confirmada: !!vigente?.valida_ate && vigente.valida_ate < hojeData && !postagem,
      recebimento_confirmado_manualmente_em: null,
    };
  });
}
