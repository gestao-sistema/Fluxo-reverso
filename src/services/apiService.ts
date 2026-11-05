// ── Service Layer: Supabase ───────────────────────────────────────────────────
//
// Implementação real de IApiService sobre a tabela `solicitacoes_reverso`.
// Padrão:  componente → apiService → Supabase
//          Componentes NUNCA acessam o banco diretamente.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabase';
import type {
  Solicitacao,
  SolicitacaoAprovacao,
  SolicitacaoHistorico,
  CreateSolicitacaoPayload,
  UpdateSolicitacaoPayload,
  FiltrosSolicitacoes,
  RastreamentoCorreios,
  SolicitacaoAprovacaoHistorico,
  ReversaEmissaoResumo,
  ReversaEmissaoEvento,
  NotificacaoEmissao,
  ListaNotificacoesEmissao,
  ComunicacaoReversa,
  FiltrosComunicacao,
  HistoricoComunicacao,
  AcaoReconciliacao,
  FiltrosRelatorio,
  RelatorioReversa,
  LinhaRelatorioReversa,
} from '../types';
import { STATUS_LABEL, type Empresa, type UsuarioAutenticado } from '../types';
import { demoAtivo } from '../demo/demoMode';
import { demoApi } from '../demo/demoApi';
import { validarDatasEmissao } from '../lib/emissaoDatas';
import { arquivoPareceSerPdf } from '../lib/arquivoPdf';
import { pedidoCorrespondeABusca } from '../lib/pedido';

// ── Interface pública do serviço ──────────────────────────────────────────────
export interface IApiService {
  createSolicitacao(data: CreateSolicitacaoPayload): Promise<Solicitacao>;
  getSolicitacoes(filtros?: FiltrosSolicitacoes): Promise<Solicitacao[]>;
  getSolicitacoesLixeira(): Promise<Solicitacao[]>;
  inutilizarSolicitacao(id: string): Promise<void>;
  restaurarSolicitacao(id: string): Promise<void>;
  /** Consulta própria; no Supabase o id vem da sessão verificada e o RLS segue como proteção final. */
  getMeusSolicitacoes(): Promise<Solicitacao[]>;
  /** Histórico de reversas da cliente dentro de uma empresa. */
  getHistoricoCliente(empresa: Empresa, codigoCliente: number): Promise<Solicitacao[]>;
  getSolicitacoesPorCodigoRastreio(codigoRastreio: string, excluirId?: string): Promise<Solicitacao[]>;
  getFilaAprovacao(): Promise<SolicitacaoAprovacao[]>;
  getNotificacoesEmissao(): Promise<ListaNotificacoesEmissao>;
  marcarNotificacaoEmissaoLida(id: string): Promise<boolean>;
  listarConfigAprovadoresReversa(): Promise<ConfigAprovadoresReversa>;
  salvarConfigAprovadoresReversa(empresa: Empresa, configuracao: ConfigAprovadoresEmpresa): Promise<void>;
  /** Administração: comunicações automáticas (a autorização é conferida no banco). */
  listarComunicacoesReversa(filtros?: FiltrosComunicacao): Promise<ComunicacaoReversa[]>;
  resumoComunicacoesReversa(): Promise<Record<string, number>>;
  historicoComunicacaoReversa(comunicacaoId: string): Promise<HistoricoComunicacao>;
  reconciliarComunicacaoReversa(
    comunicacaoId: string,
    acao: AcaoReconciliacao,
    justificativa: string,
    referencia: string,
  ): Promise<{ id: string; status: string }>;
  /** Relatórios de gestão: o escopo de acesso é aplicado pelo banco. */
  relatorioReversa(filtros: FiltrosRelatorio): Promise<RelatorioReversa>;
  relatorioReversaLinhas(filtros: FiltrosRelatorio): Promise<LinhaRelatorioReversa[]>;
  decidirAprovacao(
    solicitacao: SolicitacaoAprovacao,
    decisao: 'approve' | 'reject',
    _user: UsuarioAutenticado,
    justificativa: string,
    _fallbackOptions?: UpdateSolicitacaoOptions,
  ): Promise<SolicitacaoAprovacao>;
  updateSolicitacao(
    id: string,
    data: UpdateSolicitacaoPayload,
    user?: UsuarioAutenticado | null,
    options?: UpdateSolicitacaoOptions
  ): Promise<Solicitacao>;
  /**
   * Confirma o recebimento físico da mercadoria. Em trânsito: conclui o pedido. Já concluído pela
   * entrega informada pelos Correios: só registra a confirmação (o pedido não muda de etapa).
   */
  confirmarRecebimentoMercadoria(id: string, user?: UsuarioAutenticado | null): Promise<Solicitacao>;
  /** Ids dos pedidos concluídos pelos Correios, ainda sem confirmação física, que o usuário pode confirmar. */
  listarRecebimentosFisicosPendentes(): Promise<string[]>;
  getSolicitacaoById(id: string): Promise<Solicitacao | null>;
  /** Compatibilidade com consumidores antigos: agora só move para a Lixeira. */
  deleteSolicitacao(id: string): Promise<void>;
  getHistorico(solicitacaoId: string): Promise<SolicitacaoHistorico[]>;
  getHistoricoAprovacao(solicitacaoId: string): Promise<SolicitacaoAprovacaoHistorico[]>;
  getHistoricoEmissao(solicitacaoId: string): Promise<ReversaEmissaoEvento[]>;
  getEmissaoAtual(solicitacaoId: string): Promise<ReversaEmissaoResumo | null>;
  atualizarDadosEmissao(emissao: ReversaEmissaoResumo, dados: {
    codigoAutorizacao: string | null;
    codigoRastreio: string | null;
    emitidaEm?: string | null;
    validaAte?: string | null;
  }): Promise<ReversaEmissaoResumo>;
  /** Retorna o rastreio completo de uma solicitação. */
  getRastreio(codigoRastreio: string): Promise<RastreamentoCorreios | null>;
  /** Salva o código de rastreio dos Correios em uma solicitação. */
  salvarCodigoRastreio(
    id: string,
    codigoRastreio: string,
    user?: UsuarioAutenticado | null
  ): Promise<Solicitacao>;
  /** Remove o código de rastreio vinculado (libera para reuso em outro card). */
  removerCodigoRastreio(
    id: string,
    user?: UsuarioAutenticado | null
  ): Promise<Solicitacao>;
  /** Dispara consulta manual de rastreio (chama a Edge Function) e retorna payload bruto. */
  atualizarRastreio(codigoRastreio: string): Promise<any>;
  /** Dispara consulta em lote de todos os rastreios pendentes (Edge Function, body vazio). */
  atualizarRastreioLote(): Promise<any>;
  /** Reversas geradas a partir de uma NC (mais recentes primeiro). */
  getReversasDaNc(ncId: string): Promise<Solicitacao[]>;
  /** Registra uma emissão e vincula seu PDF pelas RPCs de emissão do banco. */
  registrarEtiqueta(
    solicitacao: Solicitacao,
    arquivo: File,
    dados: DadosEmissaoEtiqueta,
  ): Promise<Solicitacao>;
  /** Link temporário (60 s) para abrir o PDF da etiqueta. */
  urlEtiqueta(path: string): Promise<string>;
}

export interface ConfigAprovadorReversa {
  empresa: Empresa;
  usuario_id: string;
  todos_setores: boolean;
  setores: string[];
}

export interface ConfigAprovadoresReversa {
  setores: Array<{ empresa: Empresa; setor: string }>;
  configuracoes: ConfigAprovadorReversa[];
}

export type ConfigAprovadoresEmpresa = Array<{
  usuario_id: string;
  todos_setores: boolean;
  setores: string[];
}>;

export type MotivoReemissao = 'vencida_sem_uso' | 'cliente_nao_recebeu' | 'dados_incorretos' | 'pdf_incorreto' | 'outro';

export interface DadosEmissaoEtiqueta {
  /** Chave estável entre tentativas da mesma confirmação. */
  emissaoId: string;
  codigoAutorizacao: string | null;
  codigoRastreio: string | null;
  emitidaEm?: string | null;
  validaAte?: string | null;
  motivoReemissao?: MotivoReemissao | null;
  motivoDetalhe?: string | null;
}

/** Guardas opcionais para decisões tomadas depois de uma revisão da fila. */
export interface UpdateSolicitacaoOptions {
  expectedStatus?: Solicitacao['status'];
  expectedApprovalSnapshot?: Partial<Omit<Solicitacao, 'id' | 'created_at' | 'status'>>;
  historyAction?: string;
}

export class SolicitacaoAlteradaError extends Error {
  constructor() {
    super('Este pedido mudou ou já foi decidido. Atualize a fila e revise os dados novamente.');
    this.name = 'SolicitacaoAlteradaError';
  }
}

export class HistoricoSolicitacaoError extends Error {
  readonly solicitacao: Solicitacao;

  constructor(solicitacao: Solicitacao, cause: string) {
    super(`A decisão foi salva, mas não foi possível registrar o histórico: ${cause}`);
    this.name = 'HistoricoSolicitacaoError';
    this.solicitacao = solicitacao;
  }
}

/** Bucket privado do Supabase Storage com os PDFs das etiquetas. */
const BUCKET_ETIQUETAS = 'etiquetas';

/** Tamanho máximo do PDF da etiqueta (igual ao limite do bucket). */
export const ETIQUETA_TAMANHO_MAX = 5 * 1024 * 1024;

/** Converte erro Supabase em mensagem legível */
function checarErro(erro: { message: string } | null, fallback: string): void {
  if (erro) throw new Error(erro.message || fallback);
}

function funcaoRpcNaoDisponivel(erro: { code?: string; message: string }): boolean {
  return erro.code === 'PGRST202'
    || erro.code === '42883'
    || /could not find the function|function .* does not exist/i.test(erro.message);
}

/** Onde o registro da etiqueta falhou; a tela usa para orientar sem expor detalhe técnico. */
export type CausaFalhaEtiqueta = 'arquivo' | 'permissao' | 'nao_aprovado' | 'indisponivel' | 'upload' | 'vinculo';

export class FalhaEtiquetaError extends Error {
  readonly causa: CausaFalhaEtiqueta;

  constructor(causa: CausaFalhaEtiqueta, mensagem: string) {
    super(mensagem);
    this.name = 'FalhaEtiquetaError';
    this.causa = causa;
  }
}

const MENSAGEM_INDISPONIVEL = 'O sistema ainda não está pronto para anexar etiquetas. Avise o suporte técnico e tente depois.';

/**
 * Falha ao carregar a fila de aprovação. O erro original (código, mensagem e dica, sem dados) vai
 * para o console para quem diagnostica; a pessoa recebe uma orientação que não manda executar SQL
 * nem culpa uma migration sem prova. "PGRST202" só diz que o PostgREST não enxerga a função
 * (ausente, cache de schema desatualizado ou sem permissão de execução): a causa exata é
 * conferida no banco, não pela mensagem.
 */
function falhaFilaAprovacao(
  erro: { code?: string; message?: string; hint?: string; details?: string },
  status: number,
): Error {
  const codigo = erro.code ?? '';
  let causa: 'sessao' | 'permissao' | 'rede' | 'rpc_nao_encontrada' | 'erro_na_funcao';
  let mensagem = 'Não foi possível carregar os pedidos. Tente novamente.';
  if (status === 401 || codigo === 'PGRST301' || codigo === 'PGRST303' || /jwt/i.test(erro.message ?? '')) {
    causa = 'sessao';
    mensagem = 'Sua sessão expirou. Entre novamente.';
  } else if (status === 403 || codigo === '42501') {
    causa = 'permissao';
    mensagem = 'Você não tem permissão para ver esta fila.';
  } else if (status === 0 || /failed to fetch|networkerror|load failed/i.test(erro.message ?? '')) {
    causa = 'rede';
    mensagem = 'Sem conexão com o servidor. Verifique a internet e tente novamente.';
  } else if (codigo === 'PGRST202') {
    causa = 'rpc_nao_encontrada';
  } else {
    causa = 'erro_na_funcao';
  }
  console.error('[fila de aprovação] falha ao consultar', { causa, status, codigo, mensagem: erro.message, dica: erro.hint, detalhes: erro.details });
  return new Error(mensagem);
}

function erroRpcEmissao(nome: string, erro: { code?: string; message: string }): Error {
  if (funcaoRpcNaoDisponivel(erro)) {
    // O detalhe técnico fica no console para quem precisa verificar o banco; o usuário recebe a orientação.
    console.error(`RPC ${nome} indisponível: aplique as migrations de emissões e permissões do Supabase.`, erro);
    return new FalhaEtiquetaError('indisponivel', MENSAGEM_INDISPONIVEL);
  }
  return new Error(erro.message || `Erro ao executar ${nome}.`);
}

function erroTabelaEmissao(erro: { code?: string; message: string }): Error {
  if (erro.code === '42P01' || erro.code === 'PGRST205') {
    console.error('Tabela de emissões indisponível: aplique as migrations de emissões do Supabase.', erro);
    return new FalhaEtiquetaError('indisponivel', MENSAGEM_INDISPONIVEL);
  }
  return new Error(erro.message || 'Erro ao consultar as emissões.');
}

function erroUploadEtiqueta(erro: { message?: string; statusCode?: string | number }): FalhaEtiquetaError {
  const texto = erro.message ?? '';
  const status = String(erro.statusCode ?? '');
  if (status === '403' || status === '401' || /row-level security|not authorized|unauthorized|policy/i.test(texto)) {
    return new FalhaEtiquetaError('permissao', 'Você não tem permissão para enviar etiquetas deste pedido. Confirme se ele já foi aprovado e se sua conta emite etiquetas desta empresa.');
  }
  if (/bucket not found/i.test(texto)) {
    console.error('Bucket de etiquetas inexistente no Storage.', erro);
    return new FalhaEtiquetaError('indisponivel', MENSAGEM_INDISPONIVEL);
  }
  if (status === '413' || /exceeded|too large|payload/i.test(texto)) {
    return new FalhaEtiquetaError('arquivo', 'O PDF é maior que o limite de 5 MB.');
  }
  if (/mime|invalid file type|not allowed/i.test(texto)) {
    return new FalhaEtiquetaError('arquivo', 'O arquivo não foi aceito. Envie a etiqueta em PDF.');
  }
  if (/already exists|duplicate/i.test(texto)) {
    return new FalhaEtiquetaError('upload', 'Este envio já foi feito. Atualize a página e confira se o PDF já está no pedido.');
  }
  return new FalhaEtiquetaError('upload', 'Não foi possível enviar o PDF. Verifique a conexão e tente de novo; o pedido não foi alterado.');
}

async function uploadEtiqueta(arquivo: File, solicitacaoId: string, emissaoId: string): Promise<{ path: string; sha256: string | null }> {
  const nomeSeguro = arquivo.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '_');
  const path = `${solicitacaoId}/${emissaoId}-${crypto.randomUUID()}-${nomeSeguro || 'etiqueta.pdf'}`;
  const { error } = await supabase.storage
    .from(BUCKET_ETIQUETAS)
    .upload(path, arquivo, { contentType: 'application/pdf' });
  if (error) {
    await removerPdfSeOrfao(path);
    console.error('Falha no upload da etiqueta.', error);
    throw erroUploadEtiqueta(error as { message?: string; statusCode?: string | number });
  }

  let sha256: string | null = null;
  if (globalThis.crypto?.subtle) {
    try {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', await arquivo.arrayBuffer());
      sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    } catch {
      // O banco valida o arquivo e registra o PDF mesmo quando o navegador não calcula o hash.
    }
  }
  return { path, sha256 };
}

/** Remove apenas um objeto que uma leitura do banco confirmou não estar vinculado. */
async function removerPdfSeOrfao(path: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('reversa_emissoes')
    .select('id')
    .eq('pdf_path', path)
    .limit(1)
    .maybeSingle();
  if (error || data) return false;
  const { error: erroRemocao } = await supabase.storage.from(BUCKET_ETIQUETAS).remove([path]);
  return !erroRemocao;
}

function normalizarCodigoAutorizacao(valor: string | null | undefined): string | null {
  return valor?.trim().replace(/\s+/g, '').toUpperCase() || null;
}

function normalizarCodigoRastreio(valor: string | null | undefined): string | null {
  return valor?.toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
}

function refletirEmissao(solicitacao: Solicitacao, emissao: ReversaEmissaoResumo): Solicitacao {
  const anexadaEm = (emissao as ReversaEmissaoResumo & { pdf_anexado_em?: string | null }).pdf_anexado_em ?? new Date().toISOString();
  return {
    ...solicitacao,
    status: solicitacao.status === 'pendente' && emissao.pdf_path ? 'etiqueta_gerada' : solicitacao.status,
    etiqueta_path: emissao.pdf_path,
    etiqueta_nome: emissao.pdf_nome,
    etiqueta_enviada_em: emissao.pdf_path ? anexadaEm : null,
    etiqueta_gerada_em: solicitacao.status === 'pendente' && emissao.pdf_path ? anexadaEm : solicitacao.etiqueta_gerada_em,
    codigo_rastreio: emissao.codigo_rastreio,
  };
}

/**
 * "Função não encontrada" não prova que falta migration (pode ser cache de schema, permissão de execução ou
 * outro projeto): o usuário recebe uma mensagem operacional e o erro original (código e mensagem, sem dados)
 * vai para o console, para quem diagnostica.
 */
function indisponivel(operacao: string, erro: { code?: string; message?: string; hint?: string }, mensagem: string): Error {
  console.error(`[${operacao}] função não encontrada pelo servidor`, { codigo: erro.code, mensagem: erro.message, dica: erro.hint });
  return new Error(mensagem);
}

function normalizarErroDecisao(erro: { code?: string; message: string }): Error {
  if (funcaoRpcNaoDisponivel(erro)) {
    return indisponivel('decisão de aprovação', erro, 'Não foi possível registrar a decisão agora. Nada foi alterado. Tente novamente; se continuar, avise o administrador.');
  }
  if (/Seu setor não pode executar esta alteração nesta etapa/i.test(erro.message)) {
    return new Error('O banco recusou esta aprovação. Confirme se o perfil tem “Aprovar reversa” para esta empresa e se as permissões de aprovação do Supabase estão atualizadas.');
  }
  if (/foi alterada depois que voc[eê] a abriu|j[aá] foi (?:aprovada|rejeitada)|j[aá] foi decidid/i.test(erro.message)) {
    return new SolicitacaoAlteradaError();
  }
  return new Error(erro.message || 'Não foi possível registrar a decisão.');
}

/** Busca todas as páginas retornadas pelo PostgREST, sem tratar o limite da API como total. */
const TAMANHO_PAGINA_SOLICITACOES = 1_000;

async function buscarTodasPaginas<T>(
  criarConsulta: (inicio: number, fim: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  mensagemErro: string,
): Promise<T[]> {
  const resultados: T[] = [];
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA_SOLICITACOES) {
    const { data, error } = await criarConsulta(inicio, inicio + TAMANHO_PAGINA_SOLICITACOES - 1);
    checarErro(error, mensagemErro);
    const pagina = data ?? [];
    resultados.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA_SOLICITACOES) return resultados;
  }
}

// ── Implementação Supabase ────────────────────────────────────────────────────

const supabaseApiService: IApiService = {
  /**
   * Insere uma nova solicitação e retorna o registro criado.
   */
  async createSolicitacao(data: CreateSolicitacaoPayload): Promise<Solicitacao> {
    const { data: nova, error } = await supabase
      .from('solicitacoes_reverso')
      .insert(data)
      .select()
      .single();

    checarErro(error, 'Erro ao criar solicitação.');
    return nova as Solicitacao;
  },

  /**
   * Retorna solicitações aplicando os filtros informados.
   * Ordenadas por data de criação (mais recentes primeiro).
   * Se `limiteConcluidos` for informado, faz 2 queries:
   *  - ativos (pendente, etiqueta_gerada, postado): sem limite
   *  - concluido: limitada a `limiteConcluidos` (mais recentes primeiro)
   */
  async getSolicitacoes(filtros?: FiltrosSolicitacoes): Promise<Solicitacao[]> {
    const baseFilters = (f?: FiltrosSolicitacoes) => {
      let q = supabase.from('solicitacoes_reverso').select('*');
      if (f?.empresa && f.empresa !== 'Ambas') q = q.eq('empresa', f.empresa);
      if (f?.dataInicio) q = q.gte('data_solicitacao', f.dataInicio);
      if (f?.dataFim) q = q.lte('data_solicitacao', f.dataFim);
      if (f?.status !== undefined) {
        const statuses = Array.isArray(f.status) ? f.status : [f.status];
        q = q.in('status', statuses);
      }
      return q;
    };

    const limite = filtros?.limiteConcluidos ?? 0;

    if (limite > 0) {
      // Query 1: ativos (sem concluidos)
      const ativos = await buscarTodasPaginas(
        (inicio, fim) => baseFilters(filtros)
          .in('status', ['aguardando_aprovacao', 'reprovado', 'pendente', 'etiqueta_gerada', 'postado', 'em_transito'])
          .order('data_solicitacao', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(inicio, fim),
        'Erro ao buscar solicitações ativas.',
      );

      // Query 2: concluidos limitados (mais recentes primeiro)
      const concluidosQuery = baseFilters(filtros)
        .eq('status', 'concluido')
        .order('data_solicitacao', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limite);
      const { data: concluidos, error: e2 } = await concluidosQuery;
      checarErro(e2, 'Erro ao buscar solicitações concluídas.');

      const resultados = [...ativos, ...(concluidos ?? [])];

      if (filtros?.buscaCliente) {
        return resultados.filter((s) => pedidoCorrespondeABusca(s, filtros.buscaCliente as string));
      }
      return resultados;
    }

    // Sem limite: query única (comportamento original)
    let resultados = await buscarTodasPaginas<Solicitacao>((inicio, fim) => {
      let query = supabase
        .from('solicitacoes_reverso')
        .select('*')
        .order('data_solicitacao', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });

      if (filtros?.empresa && filtros.empresa !== 'Ambas') {
        query = query.eq('empresa', filtros.empresa);
      }
      if (filtros?.dataInicio) {
        query = query.gte('data_solicitacao', filtros.dataInicio);
      }
      if (filtros?.dataFim) {
        query = query.lte('data_solicitacao', filtros.dataFim);
      }
      if (filtros?.status !== undefined) {
        const statuses = Array.isArray(filtros.status) ? filtros.status : [filtros.status];
        query = query.in('status', statuses);
      }
      return query.range(inicio, fim);
    }, 'Erro ao buscar solicitações.');

    if (filtros?.buscaCliente) {
      resultados = resultados.filter((s) => pedidoCorrespondeABusca(s, filtros.buscaCliente as string));
    }

    return resultados;
  },

  async getSolicitacoesLixeira(): Promise<Solicitacao[]> {
    const { data, error } = await supabase.rpc('listar_chamados_lixeira');
    checarErro(error, 'Erro ao buscar os chamados da Lixeira.');
    return (data ?? []) as Solicitacao[];
  },

  async inutilizarSolicitacao(id: string): Promise<void> {
    const { error } = await supabase.rpc('inutilizar_chamado', { p_solicitacao_id: id });
    checarErro(error, 'Erro ao mover o chamado para a Lixeira.');
  },

  async restaurarSolicitacao(id: string): Promise<void> {
    const { error } = await supabase.rpc('restaurar_chamado', { p_solicitacao_id: id });
    checarErro(error, 'Erro ao restaurar o chamado.');
  },

  async getMeusSolicitacoes(): Promise<Solicitacao[]> {
    const { data: sessao, error: erroSessao } = await supabase.auth.getUser();
    checarErro(erroSessao, 'Erro ao confirmar o usuário autenticado.');
    if (!sessao.user) throw new Error('Entre no sistema para consultar seus pedidos.');

    return buscarTodasPaginas<Solicitacao>((inicio, fim) => supabase
      .from('solicitacoes_reverso')
      .select('*')
      .eq('solicitado_por', sessao.user.id)
      .order('data_solicitacao', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(inicio, fim), 'Erro ao buscar seus pedidos.');
  },

  async getHistoricoCliente(empresa: Empresa, codigoCliente: number): Promise<Solicitacao[]> {
    const { data, error } = await supabase
      .from('solicitacoes_reverso')
      .select('*')
      .eq('empresa', empresa)
      .eq('codigo_cliente', codigoCliente)
      .order('data_solicitacao', { ascending: false })
      .order('created_at', { ascending: false });

    checarErro(error, 'Erro ao buscar o histórico da cliente.');
    return (data ?? []) as Solicitacao[];
  },

  async getSolicitacoesPorCodigoRastreio(codigoRastreio: string, excluirId?: string): Promise<Solicitacao[]> {
    const codigo = codigoRastreio.toUpperCase().replace(/[^A-Z0-9]/g, '');
    let query = supabase
      .from('solicitacoes_reverso')
      .select('*')
      .eq('codigo_rastreio', codigo)
      .order('created_at', { ascending: false });
    if (excluirId) query = query.neq('id', excluirId);

    let { data, error } = await query;
    if (!error) {
      const { data: emissoes, error: erroEmissoes } = await supabase
        .from('reversa_emissoes')
        .select('solicitacao_id')
        .eq('codigo_rastreio', codigo);
      const tabelaEmissoesAusente = erroEmissoes?.code === '42P01' || erroEmissoes?.code === 'PGRST205';
      if (erroEmissoes && !tabelaEmissoesAusente) {
        checarErro(erroEmissoes, 'Erro ao verificar o histÃ³rico de emissÃµes.');
      } else if (!tabelaEmissoesAusente) {
        const ids = [...new Set([
          ...(data ?? []).map((item) => item.id),
          ...(emissoes ?? []).map((item) => item.solicitacao_id),
        ])].filter((id) => id !== excluirId);
        if (ids.length) {
          const { data: pedidos, error: erroPedidos } = await supabase
            .from('solicitacoes_reverso')
            .select('*')
            .in('id', ids)
            .order('created_at', { ascending: false });
          if (erroPedidos) {
            checarErro(erroPedidos, 'Erro ao buscar os pedidos com o mesmo cÃ³digo.');
          } else {
            data = pedidos;
          }
        } else {
          data = [];
        }
      }
    }
    checarErro(error, 'Erro ao verificar códigos de rastreio repetidos.');
    return (data ?? []) as Solicitacao[];
  },

  /** Busca a fila usando a função segura do banco; versões antigas usam a consulta legada. */
  async getFilaAprovacao(): Promise<SolicitacaoAprovacao[]> {
    let resposta;
    try {
      resposta = await supabase.rpc('fila_aprovacao_reversas');
    } catch (erroRede) {
      throw falhaFilaAprovacao({ message: erroRede instanceof Error ? erroRede.message : String(erroRede) }, 0);
    }
    const { data, error } = resposta;
    if (error) throw falhaFilaAprovacao(error, resposta.status);

    return ((data ?? []) as Array<{
      id: string;
      empresa: string;
      created_at: string;
      data_solicitacao: string;
      solicitante: string;
      setor: string;
      codigo_cliente: number;
      nome_cliente: string;
      endereco_postagem: string;
      endereco_destino_troca: string | null;
      motivo: string;
      justificativa_outros: string | null;
      solicitado_por_nome: string | null;
      aprovacao_versao: number;
      nc_id: string | null;
      nc_codigo: string | null;
      nc_origem: string | null;
      nc_descricao: string | null;
      proprio_pedido: boolean;
      pode_aprovar: boolean;
    }>).map((linha) => ({
      id: linha.id,
      created_at: linha.created_at,
      empresa: linha.empresa as Empresa,
      data_solicitacao: linha.data_solicitacao,
      solicitante: linha.solicitante,
      setor: linha.setor,
      codigo_cliente: linha.codigo_cliente,
      nome_cliente: linha.nome_cliente,
      endereco_postagem: linha.endereco_postagem,
      endereco_destino_troca: linha.endereco_destino_troca,
      motivo: linha.motivo,
      justificativa_outros: linha.justificativa_outros,
      autorizacao: null,
      status: 'aguardando_aprovacao',
      tempo_preenchimento_segundos: 0,
      nc_id: linha.nc_id,
      nc_numero: linha.nc_codigo ? Number(linha.nc_codigo.replace(/^NC-/, '')) || null : null,
      legado: false,
      etiqueta_path: null,
      etiqueta_nome: null,
      etiqueta_enviada_em: null,
      solicitado_por_nome: linha.solicitado_por_nome,
      aprovacao_status: 'aguardando_aprovacao',
      aprovacao_versao: linha.aprovacao_versao,
      proprio_pedido: linha.proprio_pedido,
      pode_aprovar: linha.pode_aprovar,
      nc_codigo: linha.nc_codigo,
      nc_origem: linha.nc_origem,
      nc_descricao: linha.nc_descricao,
    }));
  },

  async getNotificacoesEmissao(): Promise<ListaNotificacoesEmissao> {
    const { data, error } = await supabase.rpc('listar_notificacoes_emissao');
    if (error && funcaoRpcNaoDisponivel(error)) {
      throw indisponivel('notificações de emissão', error, 'Não foi possível carregar as notificações agora.');
    }
    checarErro(error, 'Não foi possível carregar as notificações de emissão.');
    const notificacoes = (data ?? []) as NotificacaoEmissao[];
    return { notificacoes, naoLidas: notificacoes[0]?.nao_lidas_total ?? 0 };
  },

  async marcarNotificacaoEmissaoLida(id: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('marcar_notificacao_emissao_lida', {
      p_notificacao_id: id,
    });
    if (error && funcaoRpcNaoDisponivel(error)) {
      throw indisponivel('leitura de notificação', error, 'Não foi possível marcar a notificação como lida agora.');
    }
    checarErro(error, 'Não foi possível marcar a notificação como lida.');
    return data === true;
  },

  async listarConfigAprovadoresReversa(): Promise<ConfigAprovadoresReversa> {
    const { data, error } = await supabase.rpc('listar_config_aprovadores_reversa');
    if (error && funcaoRpcNaoDisponivel(error)) {
      throw indisponivel('configuração de aprovadores', error, 'Não foi possível carregar a configuração de aprovadores agora.');
    }
    checarErro(error, 'Erro ao carregar a configuração de aprovadores.');
    return (data ?? { setores: [], configuracoes: [] }) as ConfigAprovadoresReversa;
  },

  async salvarConfigAprovadoresReversa(empresa: Empresa, configuracao: ConfigAprovadoresEmpresa): Promise<void> {
    const { error } = await supabase.rpc('salvar_config_aprovadores_reversa', {
      p_empresa: empresa,
      p_configuracao: configuracao,
    });
    if (error && funcaoRpcNaoDisponivel(error)) {
      throw indisponivel('configuração de aprovadores', error, 'Não foi possível salvar a configuração de aprovadores agora.');
    }
    checarErro(error, 'Erro ao salvar a configuração de aprovadores.');
  },

  async listarComunicacoesReversa(filtros: FiltrosComunicacao = {}): Promise<ComunicacaoReversa[]> {
    const { data, error } = await supabase.rpc('listar_comunicacoes_reversa', {
      p_status: filtros.status || null,
      p_evento: filtros.evento || null,
      p_canal: filtros.canal || null,
      p_solicitacao_id: filtros.solicitacaoId || null,
      p_limite: filtros.limite ?? 50,
      p_deslocamento: filtros.deslocamento ?? 0,
    });
    if (error && funcaoRpcNaoDisponivel(error)) {
      throw indisponivel('comunicações', error, 'Não foi possível consultar as comunicações agora.');
    }
    checarErro(error, 'Não foi possível carregar as comunicações.');
    return ((data ?? []) as Array<ComunicacaoReversa & { total: number | string }>)
      .map((item) => ({ ...item, total: Number(item.total) }));
  },

  async resumoComunicacoesReversa(): Promise<Record<string, number>> {
    const { data, error } = await supabase.rpc('resumo_comunicacoes_reversa');
    checarErro(error, 'Não foi possível carregar o resumo das comunicações.');
    return (data ?? {}) as Record<string, number>;
  },

  async historicoComunicacaoReversa(comunicacaoId: string): Promise<HistoricoComunicacao> {
    const { data, error } = await supabase.rpc('listar_historico_comunicacao_reversa', { p_comunicacao_id: comunicacaoId });
    checarErro(error, 'Não foi possível carregar o histórico da comunicação.');
    return (data ?? { tentativas: [], reconciliacoes: [] }) as HistoricoComunicacao;
  },

  async reconciliarComunicacaoReversa(comunicacaoId: string, acao: AcaoReconciliacao, justificativa: string, referencia: string) {
    const { data, error } = await supabase.rpc('reconciliar_comunicacao_reversa', {
      p_comunicacao_id: comunicacaoId,
      p_acao: acao,
      p_justificativa: justificativa,
      p_referencia: referencia,
    });
    checarErro(error, 'Não foi possível registrar a reconciliação.');
    return data as { id: string; status: string };
  },

  async relatorioReversa(filtros: FiltrosRelatorio): Promise<RelatorioReversa> {
    const { data, error } = await supabase.rpc('relatorio_reversa', {
      p_empresa: filtros.empresa === 'Ambas' ? null : filtros.empresa,
      p_campo_data: filtros.campoData,
      p_inicio: filtros.inicio || null,
      p_fim: filtros.fim || null,
    });
    if (error && funcaoRpcNaoDisponivel(error)) {
      throw indisponivel('relatório', error, 'Não foi possível gerar o relatório agora.');
    }
    checarErro(error, 'Não foi possível gerar o relatório.');
    return data as RelatorioReversa;
  },

  async relatorioReversaLinhas(filtros: FiltrosRelatorio): Promise<LinhaRelatorioReversa[]> {
    const { data, error } = await supabase.rpc('relatorio_reversa_linhas', {
      p_empresa: filtros.empresa === 'Ambas' ? null : filtros.empresa,
      p_campo_data: filtros.campoData,
      p_inicio: filtros.inicio || null,
      p_fim: filtros.fim || null,
      p_limite: 20000,
    });
    checarErro(error, 'Não foi possível preparar a exportação.');
    return (data ?? []) as LinhaRelatorioReversa[];
  },

  /** Decide pela RPC atômica. Em bancos antigos, usa a validação compatível do trigger. */
  async decidirAprovacao(
    solicitacao: SolicitacaoAprovacao,
    decisao: 'approve' | 'reject',
    _user: UsuarioAutenticado,
    justificativa: string,
    _fallbackOptions?: UpdateSolicitacaoOptions,
  ): Promise<SolicitacaoAprovacao> {
    const aprovada = decisao === 'approve';
    const situacao = aprovada ? 'aprovada' : 'rejeitada';
    const { data, error } = await supabase.rpc(
      aprovada ? 'aprovar_reversa' : 'rejeitar_reversa',
      aprovada
        ? {
            p_solicitacao_id: solicitacao.id,
            p_versao: solicitacao.aprovacao_versao ?? 1,
            p_observacao: null,
          }
        : {
            p_solicitacao_id: solicitacao.id,
            p_versao: solicitacao.aprovacao_versao ?? 1,
            p_justificativa: justificativa,
          },
    );

    if (!error) {
      return {
        ...(data as unknown as Solicitacao),
        aprovacao_status: situacao,
        aprovacao_versao: solicitacao.aprovacao_versao ?? 1,
        pode_aprovar: false,
      };
    }

    throw normalizarErroDecisao(error);
  },

  /**
   * Atualiza parcialmente uma solicitação pelo ID.
   * Quando o status muda e um usuário é informado, registra no histórico.
   */
  async updateSolicitacao(
    id: string,
    data: UpdateSolicitacaoPayload,
    user?: UsuarioAutenticado | null,
    options?: UpdateSolicitacaoOptions
  ): Promise<Solicitacao> {
    let query: any = supabase
      .from('solicitacoes_reverso')
      .update(data)
      .eq('id', id);

    if (options?.expectedStatus) query = query.eq('status', options.expectedStatus);
    if (options?.expectedApprovalSnapshot) {
      for (const [field, value] of Object.entries(options.expectedApprovalSnapshot)) {
        query = value == null ? query.is(field, null) : query.eq(field, value);
      }
    }

    const resultado = options?.expectedStatus
      ? await query.select().maybeSingle()
      : await query.select().single();
    const { data: atualizada, error } = resultado;

    checarErro(error, 'Erro ao atualizar solicitação.');
    if (!atualizada && options?.expectedStatus) {
      const { data: observada, error: erroLeitura } = await supabase
        .from('solicitacoes_reverso')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      checarErro(erroLeitura, 'Erro ao confirmar a decisão.');
      const snapshotDivergiu = !observada
        || observada.status !== options.expectedStatus
        || Object.entries(options.expectedApprovalSnapshot ?? {}).some(([field, value]) => {
          const atual = (observada as Record<string, unknown>)[field];
          return (atual ?? null) !== (value ?? null);
        });
      if (snapshotDivergiu) throw new SolicitacaoAlteradaError();
      throw new Error('O backend não autorizou a alteração deste pedido. Atualize a fila ou confira as permissões do perfil.');
    }

    // Registra auditoria quando o status muda ou anotação é salva
    if (user) {
      if (data.status) {
        const { error: erroHistorico } = await supabase.from('solicitacoes_historico').insert({
          solicitacao_id: id,
          user_nome: user.nome,
          acao: options?.historyAction ?? `Moveu para ${STATUS_LABEL[data.status] ?? data.status}`,
        });
        if (erroHistorico && options?.historyAction) {
          throw new HistoricoSolicitacaoError(atualizada as Solicitacao, erroHistorico.message);
        }
      } else if ('anotacoes' in data) {
        await supabase.from('solicitacoes_historico').insert({
          solicitacao_id: id,
          user_nome: user.nome,
          acao: 'Anotação atualizada',
        });
      }
    }

    return atualizada as Solicitacao;
  },

  async confirmarRecebimentoMercadoria(id: string, _user?: UsuarioAutenticado | null): Promise<Solicitacao> {
    const { data, error } = await supabase.rpc('confirmar_recebimento_mercadoria', {
      p_solicitacao_id: id,
    });
    checarErro(error, 'Não foi possível confirmar o recebimento da mercadoria.');
    if (!data) throw new Error('O pedido não retornou após a confirmação. Atualize o Kanban.');
    return data as Solicitacao;
  },

  async listarRecebimentosFisicosPendentes(): Promise<string[]> {
    const { data, error } = await supabase.rpc('listar_recebimentos_fisicos_pendentes');
    checarErro(error, 'Não foi possível consultar os recebimentos pendentes de confirmação.');
    return ((data ?? []) as Array<{ solicitacao_id: string }>).map((linha) => linha.solicitacao_id);
  },

  /**
   * Retorna o histórico de auditoria de uma solicitação (mais recente primeiro).
   */
  async getHistorico(solicitacaoId: string): Promise<SolicitacaoHistorico[]> {
    const { data, error } = await supabase
      .from('solicitacoes_historico')
      .select('*')
      .eq('solicitacao_id', solicitacaoId)
      .order('created_at', { ascending: false });

    checarErro(error, 'Erro ao buscar histórico.');
    return (data ?? []) as SolicitacaoHistorico[];
  },

  async getHistoricoAprovacao(solicitacaoId: string): Promise<SolicitacaoAprovacaoHistorico[]> {
    const { data, error } = await supabase
      .from('solicitacoes_aprovacoes')
      .select('id, solicitacao_id, versao, evento, justificativa, situacao_anterior, user_nome, created_at')
      .eq('solicitacao_id', solicitacaoId)
      .order('created_at', { ascending: false });

    checarErro(error, 'Erro ao buscar o histórico de aprovação.');
    return (data ?? []) as SolicitacaoAprovacaoHistorico[];
  },

  async getHistoricoEmissao(solicitacaoId: string): Promise<ReversaEmissaoEvento[]> {
    const { data, error } = await supabase
      .from('reversa_emissao_eventos')
      .select('id, solicitacao_id, created_at, user_nome, tipo, descricao')
      .eq('solicitacao_id', solicitacaoId)
      .order('created_at', { ascending: false });

    checarErro(error, 'Erro ao buscar o histórico de emissão.');
    return (data ?? []) as ReversaEmissaoEvento[];
  },

  async getEmissaoAtual(solicitacaoId: string): Promise<ReversaEmissaoResumo | null> {
    const { data, error } = await supabase
      .from('reversa_emissoes')
      .select('id, solicitacao_id, sequencia, codigo_autorizacao, codigo_rastreio, pdf_path, pdf_nome, emitida_em, valida_ate, substituida_em, postagem_confirmada_em')
      .eq('solicitacao_id', solicitacaoId)
      .is('substituida_em', null)
      .order('sequencia', { ascending: false })
      .limit(1)
      .maybeSingle();

    checarErro(error, 'Erro ao buscar a emissão vigente.');
    return (data as ReversaEmissaoResumo | null) ?? null;
  },

  async atualizarDadosEmissao(
    emissao: ReversaEmissaoResumo,
    dados: { codigoAutorizacao: string | null; codigoRastreio: string | null; emitidaEm?: string | null; validaAte?: string | null },
  ): Promise<ReversaEmissaoResumo> {
    const emitidaEm = dados.emitidaEm === undefined ? emissao.emitida_em : dados.emitidaEm;
    const validaAte = dados.validaAte === undefined ? emissao.valida_ate : dados.validaAte;
    const erroDatas = validarDatasEmissao(emitidaEm, validaAte);
    if (erroDatas) throw new Error(erroDatas);
    const { data: permitido, error: erroPermissao } = await supabase.rpc('pode_operar_emissao', {
      p_solicitacao_id: emissao.solicitacao_id,
      p_operacao: 'dados',
    });
    if (erroPermissao) throw erroRpcEmissao('pode_operar_emissao', erroPermissao);
    if (permitido !== true) throw new Error('Sem permissão para atualizar os códigos desta emissão ou pedido ainda não aprovado.');

    const { data: atualizada, error } = await supabase.rpc('atualizar_dados_emissao', {
      p_emissao_id: emissao.id,
      p_codigo_autorizacao: normalizarCodigoAutorizacao(dados.codigoAutorizacao),
      p_codigo_rastreio: normalizarCodigoRastreio(dados.codigoRastreio),
      p_emitida_em: emitidaEm,
      p_valida_ate: validaAte,
    });
    if (error) throw erroRpcEmissao('atualizar_dados_emissao', error);
    return atualizada as ReversaEmissaoResumo;
  },

  /**
   * Retorna os dados completos do rastreio.
   */
  async getRastreio(codigoRastreio: string): Promise<RastreamentoCorreios | null> {
    const { data, error } = await supabase
      .from('rastreamento_correios')
      .select('*')
      .eq('codigo_rastreio', codigoRastreio)
      .maybeSingle();

    checarErro(error, 'Erro ao buscar rastreio.');
    return (data as RastreamentoCorreios) ?? null;
  },

  /**
   * Busca uma solicitação específica pelo ID.
   * Retorna null se não encontrada.
   */
  async getSolicitacaoById(id: string): Promise<Solicitacao | null> {
    const { data, error } = await supabase
      .from('solicitacoes_reverso')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    checarErro(error, 'Erro ao buscar solicitação.');
    return (data as Solicitacao) ?? null;
  },

  /** Legacy compatibility: this now moves the request to Trash and can be restored. */
  async deleteSolicitacao(id: string): Promise<void> {
    await supabaseApiService.inutilizarSolicitacao(id);
  },

  /**
   * Salva o código de rastreio na emissão vigente, pela mesma RPC que valida permissão, aprovação e
   * bloqueios (código repetido, rastreio que já mostra postagem). Sem emissão não há onde guardá-lo:
   * não há gravação direta nem outro caminho quando a RPC falha.
   */
  async salvarCodigoRastreio(
    id: string,
    codigoRastreio: string,
    _user?: UsuarioAutenticado | null
  ): Promise<Solicitacao> {
    const codigo = normalizarCodigoRastreio(codigoRastreio);
    if (codigo && !/^[A-Z]{2}\d{9}BR$/.test(codigo)) {
      throw new Error('Confira o código de rastreamento. O formato esperado é AA123456789BR.');
    }
    const { data: emissao, error: erroEmissao } = await supabase
      .from('reversa_emissoes')
      .select('id, codigo_autorizacao, emitida_em, valida_ate')
      .eq('solicitacao_id', id)
      .is('substituida_em', null)
      .maybeSingle();
    if (erroEmissao) throw erroTabelaEmissao(erroEmissao);
    if (!emissao) {
      throw new Error('Este pedido ainda não tem etiqueta emitida. Registre a etiqueta antes de informar o código de rastreamento.');
    }

    const { error: erroRpc } = await supabase.rpc('atualizar_dados_emissao', {
      p_emissao_id: emissao.id,
      p_codigo_autorizacao: emissao.codigo_autorizacao,
      p_codigo_rastreio: codigo || null,
      p_emitida_em: emissao.emitida_em,
      p_valida_ate: emissao.valida_ate,
    });
    if (erroRpc?.code === '23505') {
      throw new Error('Este código de rastreio já está vinculado a outra solicitação.');
    }
    if (erroRpc) throw erroRpcEmissao('atualizar_dados_emissao', erroRpc);

    const { data, error } = await supabase.from('solicitacoes_reverso').select('*').eq('id', id).single();
    checarErro(error, 'O código foi salvo, mas não foi possível recarregar o pedido.');
    return data as Solicitacao;
  },

  /**
   * Remove o código de rastreio da emissão vigente, mantendo autorização, datas e histórico. Quem barra
   * a remoção quando o rastreio já mostra postagem é o banco. Nada é apagado de rastreamento_correios
   * (é o histórico dos Correios) e não há atualização direta da solicitação.
   */
  async removerCodigoRastreio(
    id: string,
    _user?: UsuarioAutenticado | null
  ): Promise<Solicitacao> {
    const emissao = await supabaseApiService.getEmissaoAtual(id);
    if (!emissao) throw new Error('Este pedido não tem emissão com código de rastreamento para remover.');
    if (emissao.codigo_rastreio) {
      await supabaseApiService.atualizarDadosEmissao(emissao, {
        codigoAutorizacao: emissao.codigo_autorizacao,
        codigoRastreio: null,
        emitidaEm: emissao.emitida_em,
        validaAte: emissao.valida_ate,
      });
    }
    const { data, error } = await supabase.from('solicitacoes_reverso').select('*').eq('id', id).single();
    checarErro(error, 'O código foi removido, mas não foi possível recarregar o pedido.');
    return data as Solicitacao;
  },

  /**
   * Dispara consulta manual de rastreio (chama Edge Function correios-rastreio).
   */
  async atualizarRastreio(codigoRastreio: string): Promise<any> {
    const { data, error } = await supabase.functions.invoke('correios-rastreio', {
      body: { codigo: codigoRastreio },
    });
    if (error) throw new Error(error.message || 'Erro ao atualizar rastreio.');
    return data;
  },

  /**
   * Dispara consulta em lote (chama Edge Function correios-rastreio sem código).
   */
  async atualizarRastreioLote(): Promise<any> {
    const { data, error } = await supabase.functions.invoke('correios-rastreio', {
      body: {},
    });
    if (error) throw new Error(error.message || 'Erro ao atualizar rastreios em lote.');
    return data;
  },

  async getReversasDaNc(ncId: string): Promise<Solicitacao[]> {
    const { data, error } = await supabase
      .from('solicitacoes_reverso')
      .select('*')
      .eq('nc_id', ncId)
      .order('created_at', { ascending: false });

    checarErro(error, 'Erro ao buscar as reversas da NC.');
    return (data ?? []) as Solicitacao[];
  },

  async registrarEtiqueta(
    solicitacao: Solicitacao,
    arquivo: File,
    dados: DadosEmissaoEtiqueta,
  ): Promise<Solicitacao> {
    if (!arquivoPareceSerPdf(arquivo)) throw new FalhaEtiquetaError('arquivo', 'A etiqueta precisa ser um arquivo PDF.');
    if (arquivo.size > ETIQUETA_TAMANHO_MAX) throw new FalhaEtiquetaError('arquivo', 'O PDF da etiqueta deve ter no máximo 5 MB.');
    const codigoAutorizacao = normalizarCodigoAutorizacao(dados.codigoAutorizacao);
    const codigoRastreio = normalizarCodigoRastreio(dados.codigoRastreio);
    let emitidaEm = dados.emitidaEm ?? null;
    let validaAte = dados.validaAte ?? null;
    if (codigoRastreio && !/^[A-Z]{2}\d{9}BR$/.test(codigoRastreio)) {
      throw new Error('Confira o código de rastreamento. O formato esperado é AA123456789BR.');
    }

    const { data: permitido, error: erroPermissao } = await supabase.rpc('pode_operar_emissao', {
      p_solicitacao_id: solicitacao.id,
      p_operacao: 'registrar',
    });
    if (erroPermissao) throw erroRpcEmissao('pode_operar_emissao', erroPermissao);
    if (permitido !== true) {
      // Separa "ainda sem aprovação" de "sem permissão" com a situação atual do pedido, não a da tela.
      let atual: Solicitacao | null = solicitacao;
      try { atual = (await supabaseApiService.getSolicitacaoById(solicitacao.id)) ?? solicitacao; } catch { /* usa a situação da tela */ }
      if (atual.aprovacao_status === 'rejeitada') {
        throw new FalhaEtiquetaError('nao_aprovado', 'Este pedido foi rejeitado e não recebe etiqueta.');
      }
      if (atual.aprovacao_status === 'aguardando_aprovacao') {
        throw new FalhaEtiquetaError('nao_aprovado', 'O pedido precisa estar aprovado para receber a etiqueta. Ele ainda aguarda aprovação.');
      }
      throw new FalhaEtiquetaError('permissao', 'Você não tem permissão para anexar etiquetas de ' + solicitacao.empresa + '. Peça ao administrador para liberar “Emitir etiqueta” nesta empresa.');
    }

    const { data: emissaoComEsteId, error: erroId } = await supabase
      .from('reversa_emissoes')
      .select('*')
      .eq('id', dados.emissaoId)
      .maybeSingle();
    if (erroId) throw erroTabelaEmissao(erroId);
    if (emissaoComEsteId) {
      const existente = emissaoComEsteId as ReversaEmissaoResumo;
      if (existente.solicitacao_id !== solicitacao.id) throw new Error('Identificador de emissão já usado por outro pedido.');
      if (existente.pdf_path) return refletirEmissao(solicitacao, existente);
    }

    const { data: emissaoAtual, error: erroAtual } = await supabase
      .from('reversa_emissoes')
      .select('*')
      .eq('solicitacao_id', solicitacao.id)
      .is('substituida_em', null)
      .maybeSingle();
    if (erroAtual) throw erroTabelaEmissao(erroAtual);
    const atual = emissaoAtual as ReversaEmissaoResumo | null;
    if (emissaoComEsteId && (!atual || atual.id !== emissaoComEsteId.id || atual.pdf_path)) {
      throw new Error('Esta emissão incompleta não é mais a emissão vigente. Atualize o pedido antes de tentar novamente.');
    }
    const anexarNaEmissaoAtual = !!atual && !atual.pdf_path;
    if (anexarNaEmissaoAtual && atual) {
      if (dados.emitidaEm === undefined) emitidaEm = atual.emitida_em ?? null;
      if (dados.validaAte === undefined) validaAte = atual.valida_ate ?? null;
    }
    const erroDatas = validarDatasEmissao(emitidaEm, validaAte);
    if (erroDatas) throw new Error(erroDatas);
    const idEmissaoUpload = anexarNaEmissaoAtual && atual ? atual.id : dados.emissaoId;
    const prefixoDestaTentativa = `${solicitacao.id}/${idEmissaoUpload}-`;
    if (atual?.pdf_path?.startsWith(prefixoDestaTentativa)) {
      return refletirEmissao(solicitacao, atual);
    }
    let dadosAtualizadosParcialmente = false;

    if (atual?.pdf_path) {
      if (!dados.motivoReemissao) throw new Error('Selecione o motivo antes de registrar uma reemissão.');
      if (dados.motivoReemissao === 'outro' && !dados.motivoDetalhe?.trim()) {
        throw new Error('Descreva o motivo da reemissão.');
      }
    }

    if (anexarNaEmissaoAtual && atual) {
      const autorizacaoAtual = normalizarCodigoAutorizacao(atual.codigo_autorizacao);
      const rastreioAtual = normalizarCodigoRastreio(atual.codigo_rastreio);
      const emitidaAtual = atual.emitida_em ?? null;
      const validadeAtual = atual.valida_ate ?? null;
      if (codigoAutorizacao !== autorizacaoAtual || codigoRastreio !== rastreioAtual
        || emitidaEm !== emitidaAtual || validaAte !== validadeAtual) {
        await supabaseApiService.atualizarDadosEmissao(atual, { codigoAutorizacao, codigoRastreio, emitidaEm: emitidaEm ?? null, validaAte: validaAte ?? null });
        dadosAtualizadosParcialmente = true;
      }
    }

    let arquivoEnviado: { path: string; sha256: string | null };
    try {
      arquivoEnviado = await uploadEtiqueta(arquivo, solicitacao.id, idEmissaoUpload);
    } catch (erro) {
      if (dadosAtualizadosParcialmente) {
        const causa = erro instanceof FalhaEtiquetaError ? erro.causa : 'upload';
        throw new FalhaEtiquetaError(causa, `Os códigos foram salvos, mas o PDF não foi enviado. ${erro instanceof Error ? erro.message : 'Tente anexar o PDF de novo.'}`);
      }
      throw erro;
    }
    let emissaoSalva: ReversaEmissaoResumo | null = null;
    let erroGravacao: { code?: string; message: string } | null = null;

    if (anexarNaEmissaoAtual && atual) {
      const { data, error } = await supabase.rpc('anexar_pdf_emissao', {
        p_emissao_id: atual.id,
        p_pdf_path: arquivoEnviado.path,
        p_pdf_nome: arquivo.name,
        p_pdf_sha256: arquivoEnviado.sha256,
      });
      erroGravacao = error;
      if (!error && data) emissaoSalva = data as ReversaEmissaoResumo;
    } else {
      const { data, error } = await supabase.rpc('registrar_emissao_reversa', {
        p_solicitacao_id: solicitacao.id,
        p_emissao_id: dados.emissaoId,
        p_codigo_autorizacao: codigoAutorizacao,
        p_codigo_rastreio: codigoRastreio,
        p_emitida_em: emitidaEm,
        p_valida_ate: validaAte,
        p_pdf_path: arquivoEnviado.path,
        p_pdf_nome: arquivo.name,
        p_pdf_sha256: arquivoEnviado.sha256,
        p_motivo_reemissao: dados.motivoReemissao ?? null,
        p_motivo_detalhe: dados.motivoDetalhe?.trim() || null,
        p_observacao: null,
      });
      erroGravacao = error;
      if (!error && data) emissaoSalva = data as ReversaEmissaoResumo;
    }

    if (erroGravacao || !emissaoSalva) {
      const { data: confirmada, error: erroConfirmacao } = await supabase
        .from('reversa_emissoes')
        .select('*')
        .eq('id', anexarNaEmissaoAtual && atual ? atual.id : dados.emissaoId)
        .maybeSingle();
      const rowConfirmada = confirmada as ReversaEmissaoResumo | null;
      if (!erroConfirmacao
        && rowConfirmada?.solicitacao_id === solicitacao.id
        && rowConfirmada.pdf_path
        && (!anexarNaEmissaoAtual || rowConfirmada.pdf_path === arquivoEnviado.path)) {
        emissaoSalva = rowConfirmada;
      } else {
        const removido = await removerPdfSeOrfao(arquivoEnviado.path);
        if (erroConfirmacao) {
          throw new FalhaEtiquetaError('vinculo', 'O PDF foi enviado, mas não foi possível confirmar se ele ficou ligado ao pedido. Atualize a página e confira antes de tentar de novo.');
        }
        const erroOriginal = erroGravacao
          ? erroRpcEmissao(anexarNaEmissaoAtual ? 'anexar_pdf_emissao' : 'registrar_emissao_reversa', erroGravacao).message
          : 'A RPC não retornou a emissão salva.';
        throw new FalhaEtiquetaError('vinculo', `O PDF foi enviado, mas não foi ligado ao pedido: ${erroOriginal}${removido ? '' : ' O arquivo foi mantido por segurança; atualize a página antes de tentar de novo.'}`);
      }
    }

    if (emissaoSalva.solicitacao_id !== solicitacao.id) {
      await removerPdfSeOrfao(arquivoEnviado.path);
      throw new FalhaEtiquetaError('vinculo', 'O sistema devolveu a emissão de outro pedido. O PDF não foi ligado a este pedido; avise o suporte.');
    }
    if (!emissaoSalva.pdf_path) {
      await removerPdfSeOrfao(arquivoEnviado.path);
      throw new FalhaEtiquetaError('vinculo', 'A emissão foi registrada, mas o PDF não ficou ligado ao pedido. Confira o pedido antes de enviar de novo.');
    }
    if (emissaoSalva.pdf_path !== arquivoEnviado.path) await removerPdfSeOrfao(arquivoEnviado.path);

    try {
      const atualizada = await supabaseApiService.getSolicitacaoById(solicitacao.id);
      if (atualizada) return atualizada;
    } catch {
      // A RPC confirmou emissão, PDF e histórico. Refletimos os campos vigentes localmente se a releitura falhar.
    }
    return refletirEmissao(solicitacao, emissaoSalva);
  },

  async urlEtiqueta(path: string): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET_ETIQUETAS).createSignedUrl(path, 60);
    checarErro(error, 'Erro ao abrir a etiqueta.');
    return (data as { signedUrl: string }).signedUrl;
  },

};

// O proxy mantém a implementação real intacta e encaminha todas as operações
// para o armazenamento local enquanto a demonstração de desenvolvimento está ativa.
const apiService: IApiService = new Proxy(supabaseApiService, {
  get(target, property, receiver) {
    if (demoAtivo() && typeof property === 'string' && property in demoApi) {
      return (demoApi as unknown as Record<string, unknown>)[property];
    }
    return Reflect.get(target, property, receiver);
  },
});

export default apiService;
