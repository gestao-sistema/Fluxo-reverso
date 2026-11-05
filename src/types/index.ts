// ── Tipos principais da aplicação de Logística Reversa ───────────────────────
// Mantido em sincronia com a tabela `solicitacoes_reverso` no PostgreSQL.
// Ao conectar o Supabase real, apenas apiService.ts precisa ser alterado.

/** Empresas suportadas pelo sistema */
export type Empresa = 'Alinare' | 'Novitah';

/** Motivos disponíveis para solicitação de reverso */
export const MOTIVOS = [
  'Erro expedição – endereço incorreto',
  'Erro expedição – mercadoria trocada ou embalada junto',
  'Erro expedição – etiqueta ou pré-postagem',
  'Embalagem inadequada / avaria por embalagem',
  'Postagem duplicada',
  'Erro de faturamento / NF (destinatário ou endereço)',
  'Erro da expedição e do financeiro',
  'Erro vendedora – endereço incorreto',
  'Peça com defeito',
  'Mercadoria Errada',
  'Baixa qualidade no conserto',
  'Clientes trocados',
  'Outros',
] as const;

export const MOTIVO_CLIENTES_TROCADOS = 'Clientes trocados' as const;

export type Motivo = (typeof MOTIVOS)[number];

/** Fluxo de status de uma solicitação de reverso. */
export const STATUS_SOLICITACAO = [
  'aguardando_aprovacao',
  'reprovado',
  'pendente',
  'etiqueta_gerada',
  'postado',
  'em_transito',
  'concluido',
] as const;

export type StatusSolicitacao = (typeof STATUS_SOLICITACAO)[number];

/** Label de exibição de cada status. */
export const STATUS_LABEL: Record<StatusSolicitacao, string> = {
  aguardando_aprovacao: 'Aguardando aprovação',
  reprovado: 'Rejeitado',
  pendente: 'Aguardando etiqueta',
  etiqueta_gerada: 'Aguardando postagem',
  // Postagem confirmada no check-in. "Recebimento" é o da mercadoria pela empresa, evento distinto.
  postado: 'Postado nos Correios',
  em_transito: 'Em Trânsito',
  concluido: 'Concluído',
};

/** Próximo status no fluxo. null = status final. */
export function proximoStatus(s: StatusSolicitacao): StatusSolicitacao | null {
  switch (s) {
    case 'aguardando_aprovacao':
    case 'reprovado':
      return null;
    case 'pendente':
      return 'etiqueta_gerada';
    case 'etiqueta_gerada':
      return 'postado';
    case 'postado':
      return 'em_transito';
    case 'em_transito':
      return 'concluido';
    default:
      return null;
  }
}

/** Status anterior no fluxo. null = status inicial. */
export function statusAnterior(s: StatusSolicitacao): StatusSolicitacao | null {
  switch (s) {
    case 'etiqueta_gerada':
      return 'pendente';
    case 'postado':
      return 'etiqueta_gerada';
    case 'em_transito':
      return 'postado';
    case 'concluido':
      return 'em_transito';
    default:
      return null;
  }
}

/** Movimento válido no DnD: exatamente uma etapa à frente ou uma atrás. */
export function movimentoValido(
  origem: StatusSolicitacao,
  destino: StatusSolicitacao
): boolean {
  return destino === proximoStatus(origem) || destino === statusAnterior(origem);
}

/** Setores disponíveis por empresa */
export const SETORES = [
  'Comercial Alinare',
  'Comercial Novitah',
  'Financeiro',
  'Assistência Técnica',
  'Expedição',
] as const;

export type Setor = (typeof SETORES)[number];

/** Autorizações por empresa */
export const AUTORIZACOES: Record<Empresa, string[]> = {
  Alinare: ['Joice Mendes', 'Viviane Ulian', 'Sheila Cristina'],
  Novitah: ['Marcelo Gualtieri', 'Ludmila Amancio'],
};

/**
 * Representa uma solicitação de logística reversa.
 * Espelha exatamente as colunas da tabela `solicitacoes_reverso`.
 */
export interface Solicitacao {
  /** UUID gerado pelo banco (ou crypto.randomUUID() no mock) */
  id: string;
  /** ISO 8601 timestamp de criação */
  created_at: string;
  /** Empresa responsável pela solicitação */
  empresa: Empresa;
  /** Data da solicitação no formato YYYY-MM-DD */
  data_solicitacao: string;
  /** Nome do solicitante interno */
  solicitante: string;
  /** Identidade registrada pelo servidor; null em dados históricos sem autoria verificável. */
  solicitado_por?: string | null;
  solicitado_por_nome?: string | null;
  /** Decisão de aprovação, separada da situação logística. */
  aprovacao_status?: 'aguardando_aprovacao' | 'aprovada' | 'rejeitada' | null;
  aprovacao_legada?: boolean;
  aprovacao_justificativa?: string | null;
  /** Setor interno responsável */
  setor: string;
  /** Código numérico da cliente no sistema */
  codigo_cliente: number;
  /** Nome completo da cliente */
  nome_cliente: string;
  /** Endereço completo para postagem da devolução */
  endereco_postagem: string;
  /** Endereço da outra cliente quando as mercadorias foram trocadas */
  endereco_destino_troca?: string | null;
  /** Motivo principal da devolução */
  motivo: string;
  /** Justificativa obrigatória quando motivo === 'Outros' */
  justificativa_outros?: string | null;
  /** Nome do usuário que aprovou a reversa; null enquanto aguarda aprovação. */
  autorizacao: string | null;
  /** Status atual no fluxo de reverso */
  status: StatusSolicitacao;
  /** Quando a etiqueta foi gerada (expedição) */
  etiqueta_gerada_em?: string | null;
  /** Quando a cliente postou a mercadoria (comercial) */
  postado_em?: string | null;
  /** Quando entrou em trânsito (rastreio Correios) */
  em_transito_em?: string | null;
  /** Quando a solicitação foi concluída (expedição) */
  concluido_em?: string | null;
  /** Código de rastreio dos Correios (ex: AA123456789BR) */
  codigo_rastreio?: string | null;
  /** Última cidade/UF conhecida via rastreio (denormalizado p/ exibição rápida no card) */
  ultima_cidade_rastreio?: string | null;
  /** Anotações livres de controle interno */
  anotacoes?: string | null;
  /** Segundos decorridos entre abertura e envio do formulário */
  tempo_preenchimento_segundos: number;
  /** NC de origem opcional */
  nc_id?: string | null;
  /** Número da NC de origem (exibido como NC-0000), gravado pelo banco */
  nc_numero?: number | null;
  /** Reversa anterior ao vínculo com NC (sem NC de origem registrada) */
  legado?: boolean;
  /** Caminho do PDF da etiqueta no bucket "etiquetas" */
  etiqueta_path?: string | null;
  /** Nome original do arquivo da etiqueta */
  etiqueta_nome?: string | null;
  /** Quando o PDF da etiqueta foi anexado */
  etiqueta_enviada_em?: string | null;
  /** Chamado arquivado na Lixeira; os dados e as trilhas continuam preservados. */
  inutilizada_em?: string | null;
  inutilizada_por?: string | null;
  inutilizada_por_nome?: string | null;
}

/** Evento de decisão ou revisão registrado na trilha de aprovação. */
export interface SolicitacaoAprovacaoHistorico {
  id: string;
  solicitacao_id: string;
  versao: number;
  evento: 'aprovada' | 'rejeitada' | 'invalidada' | 'alterada';
  justificativa?: string | null;
  situacao_anterior?: string | null;
  user_nome: string;
  created_at: string;
}

/** Emissão vigente exibida no acompanhamento do solicitante. */
export interface ReversaEmissaoResumo {
  id: string;
  solicitacao_id: string;
  sequencia: number;
  codigo_autorizacao: string | null;
  codigo_rastreio: string | null;
  pdf_path: string | null;
  pdf_nome: string | null;
  emitida_em: string | null;
  valida_ate: string | null;
  substituida_em: string | null;
  postagem_confirmada_em?: string | null;
}

/** Evento de auditoria da emissão. */
export interface ReversaEmissaoEvento {
  id: string;
  solicitacao_id: string;
  created_at: string;
  user_nome: string;
  tipo: string;
  descricao: string;
}

/** Aviso privado ao usuário de expedição sobre uma aprovação confirmada. */
export interface NotificacaoEmissao {
  id: string;
  solicitacao_id: string;
  empresa: Empresa;
  created_at: string;
  lida_em: string | null;
  /** Campos usados apenas pelo armazenamento fictício; a API real não os retorna. */
  destinatario_id?: string;
  aprovacao_versao?: number;
  /** Total não lido calculado antes do limite da lista recente. */
  nao_lidas_total?: number;
}

export interface ListaNotificacoesEmissao {
  notificacoes: NotificacaoEmissao[];
  naoLidas: number;
}

/** Campos de autorização retornados pela fila segura de aprovação. */
export interface SolicitacaoAprovacao extends Solicitacao {
  aprovacao_status?: 'aguardando_aprovacao' | 'aprovada' | 'rejeitada' | null;
  aprovacao_versao?: number;
  solicitado_por_nome?: string | null;
  proprio_pedido?: boolean;
  pode_aprovar?: boolean;
  nc_codigo?: string | null;
  nc_origem?: string | null;
  nc_descricao?: string | null;
}

/**
 * Payload para criação de nova solicitação.
 * Omite campos gerados automaticamente (id, created_at, nc_numero, legado).
 * A NC de origem é opcional.
 */
export type CreateSolicitacaoPayload = Omit<
  Solicitacao,
  | 'id' | 'created_at' | 'nc_numero' | 'legado'
  | 'solicitado_por' | 'solicitado_por_nome'
  | 'aprovacao_status' | 'aprovacao_legada' | 'aprovacao_justificativa'
  | 'inutilizada_em' | 'inutilizada_por' | 'inutilizada_por_nome'
>;

/**
 * Payload para atualização parcial de uma solicitação.
 */
export type UpdateSolicitacaoPayload = Partial<
  Omit<
    Solicitacao,
    | 'id' | 'created_at'
    | 'solicitado_por' | 'solicitado_por_nome'
    | 'aprovacao_status' | 'aprovacao_legada' | 'aprovacao_justificativa'
    | 'inutilizada_em' | 'inutilizada_por' | 'inutilizada_por_nome'
  >
>;

/** Filtros para consulta de solicitações */
export interface FiltrosSolicitacoes {
  empresa?: Empresa | 'Ambas';
  dataInicio?: string; // YYYY-MM-DD
  dataFim?: string;    // YYYY-MM-DD
  resolvido?: boolean;       // legado — deprecated, usar status
  status?: StatusSolicitacao | StatusSolicitacao[];
  buscaCliente?: string;
  /** Limita registros 'concluido' retornados (proteção contra acúmulo). */
  limiteConcluidos?: number;
}

// ── Autenticação e perfis de acesso ──────────────────────────────────────────

/** Telas do sistema que podem ser autorizadas individualmente. */
export type Tela =
  | 'dashboard-geral'
  | 'dashboard-alinare'
  | 'dashboard-novitah'
  | 'formulario-alinare'
  | 'formulario-novitah'
  | 'lista-geral'
  | 'lista-alinare'
  | 'lista-novitah'
  | 'kanban'
  | 'kanban-edit'
  | 'nc'
  | 'nc-edit'
  | 'aprovar-reversa'
  | 'emitir-etiqueta'
  | 'confirmar-checkin'
  | 'usuarios';

/** Perfil de acesso escolhido na gestão de usuários (pronto ou personalizado). */
export type PerfilAcesso =
  | 'solicitante'
  | 'aprovador'
  | 'emissor_etiqueta'
  | 'checkin_correios'
  | 'mestre'
  | 'personalizado';

export const PERFIS_ACESSO: PerfilAcesso[] = [
  'solicitante', 'aprovador', 'emissor_etiqueta', 'checkin_correios', 'mestre', 'personalizado',
];

export const PERFIL_ACESSO_LABEL: Record<PerfilAcesso, string> = {
  solicitante: 'Abre chamados',
  aprovador: 'Aprova chamados',
  emissor_etiqueta: 'Emite etiqueta do reverso',
  checkin_correios: 'Check-in dos Correios',
  mestre: 'Mestre — acesso total',
  personalizado: 'Personalizado',
};

/** Todas as telas disponíveis para seleção no cadastro. */
export const TELAS: Tela[] = [
  'dashboard-geral',
  'dashboard-alinare',
  'dashboard-novitah',
  'formulario-alinare',
  'formulario-novitah',
  'lista-geral',
  'lista-alinare',
  'lista-novitah',
  'kanban',
  'kanban-edit',
  'nc',
  'nc-edit',
  'aprovar-reversa',
  'emitir-etiqueta',
  'confirmar-checkin',
  'usuarios',
];

/** Label de exibição de cada tela. */
export const TELA_LABEL: Record<Tela, string> = {
  'dashboard-geral': 'Dashboard Geral',
  'dashboard-alinare': 'Dashboard Alinare',
  'dashboard-novitah': 'Dashboard Novitah',
  'formulario-alinare': 'Formulário Alinare',
  'formulario-novitah': 'Formulário Novitah',
  'lista-geral': 'Lista Geral',
  'lista-alinare': 'Lista Alinare',
  'lista-novitah': 'Lista Novitah',
  kanban: 'Kanban',
  'kanban-edit': 'Editar Kanban',
  nc: 'Não conformidades',
  'nc-edit': 'Registrar/editar NC',
  'aprovar-reversa': 'Aprovar reversas',
  'emitir-etiqueta': 'Emitir etiqueta do reverso',
  'confirmar-checkin': 'Confirmar check-in dos Correios',
  usuarios: 'Usuários (admin)',
};

/** Usuário do sistema (Supabase Auth). Senha NÃO armazenada no client. */
export interface Usuario {
  id: string;
  nome: string;
  /** Login único (username) */
  usuario: string;
  /** Telas que o usuário pode acessar. */
  telas: Tela[];
  /** Administrador padrão: login e telas fixos, não pode ser removido (vem da listagem). */
  protegido?: boolean;
  /** Perfil de acesso atribuído na gestão de usuários. */
  perfilAcesso?: PerfilAcesso;
  /** Empresas liberadas no cadastro para Aprovações e Emissão de etiquetas. Nunca presumidas: vazio = nenhuma. O mestre tem as duas. */
  empresasAcesso?: Empresa[];
  /** Situação da conta (vem da listagem): ativa, aguardando a pessoa aceitar o convite ou convite aceito sem senha. */
  situacao?: SituacaoUsuario;
  /** Acompanhamento do convite (sem link nem token). */
  convite?: ConviteUsuario | null;
}

export type SituacaoUsuario = 'ativo' | 'convite_pendente' | 'senha_nao_definida';

export type EstadoConvite =
  | 'preparado' | 'envio_em_andamento' | 'enviado' | 'smtp_aceito' | 'falhou' | 'resultado_indeterminado' | 'rejeitado';

export interface ConviteUsuario {
  estado: EstadoConvite;
  tentativas: number;
  concluidoEm: string | null;
}

/** Cadastro por convite: o administrador não define senha; a pessoa define a própria pelo link. */
export interface ConvidarUsuarioPayload {
  nome: string;
  email: string;
  perfilAcesso: PerfilAcesso;
  empresasAcesso: Empresa[];
  telas: Tela[];
  aprovacao?: EscopoAprovacaoUsuario[];
  /** Só depois de conferir os registros SMTP (resultado anterior incerto). */
  confirmarResultadoIncerto?: boolean;
}

export interface ResultadoConvite {
  usuario_id: string;
  email: string;
  /** 'preparado': cadastro salvo, nada enviado (envio de convites desabilitado). */
  estado: 'preparado' | 'enviado' | 'smtp_aceito' | 'falhou' | 'rejeitado' | 'resultado_indeterminado';
  conta_criada: boolean;
  envio_habilitado: boolean;
  /** 'definicao_senha': o convite já foi aberto e faltava a senha; o link enviado é de definição de senha. */
  link?: 'convite' | 'definicao_senha';
}

/** Usuário autenticado exposto pela sessão — nunca carrega senha. */
export type UsuarioAutenticado = Usuario;

/** Escopo de aprovação de uma empresa: todos os setores ou setores específicos (nunca os dois, nunca vazio). */
export interface EscopoAprovacaoUsuario {
  empresa: Empresa;
  todos_setores: boolean;
  setores: string[];
}

/** Payload para criação de usuário */
export type CreateUsuarioPayload = Omit<Usuario, 'id'> & { senha?: string; aprovacao?: EscopoAprovacaoUsuario[] };

/** Payload para atualização de usuário */
export type UpdateUsuarioPayload = Partial<Usuario> & { senha?: string; aprovacao?: EscopoAprovacaoUsuario[] };

/**
 * true se o usuário administra (tela de usuários ou perfil mestre): cadastro de usuários, aprovadores,
 * comunicações e listas de NC. Não concede consulta nem operação de pedidos e NC: isso vem das telas.
 */
export function isAdmin(u: Pick<Usuario, 'telas'> & Partial<Pick<Usuario, 'perfilAcesso'>>): boolean {
  return u.perfilAcesso === 'mestre' || u.telas.includes('usuarios');
}

/** Perfil mestre: acesso total deliberado (todas as telas e as duas empresas), explícito no cadastro. */
export function isMestre(u: Partial<Pick<Usuario, 'perfilAcesso'>>): boolean {
  return u.perfilAcesso === 'mestre';
}

/** Item do histórico de auditoria de uma solicitação. */
export interface SolicitacaoHistorico {
  id: string;
  solicitacao_id: string;
  user_nome: string;
  acao: string;
  created_at: string; // ISO 8601
}

/** Último evento de rastreio Correios vinculado a uma solicitação (1:1). */
export interface RastreamentoCorreios {
  codigo_rastreio: string;
  solicitacao_id: string;
  ultimo_evento_codigo: string | null;
  ultimo_evento_descricao: string | null;
  unidade_cidade: string | null;
  unidade_uf: string | null;
  eventos: any[] | null;
  ultimo_check_em: string | null;
  created_at: string;
}

/** Mapeamento legado: perfil antigo → telas equivalentes (migração). */
export const LEGADO_PERFIL_TELAS: Record<string, Tela[]> = {
  ADMIN: [...TELAS],
  Alinare: ['dashboard-alinare', 'formulario-alinare', 'lista-alinare'],
  Novitah: ['dashboard-novitah', 'formulario-novitah', 'lista-novitah'],
  Expedicao: ['dashboard-geral', 'lista-geral', 'kanban', 'kanban-edit'],
};

// ── Não conformidades (NC) ───────────────────────────────────────────────────
// Espelham a planilha "Análise de não conformidades — Expedição"
// (REGISTRO_NC, LISTAS_NC e PAINEL_NC).

/** Status da NC (LISTAS_NC). "Aberta" e "Em tratativa" contam como em aberto. */
export const STATUS_NC = ['Aberta', 'Em tratativa', 'Encerrada', 'Cancelada'] as const;

export type StatusNc = (typeof STATUS_NC)[number];

/** Classificação "Evitável internamente?" de cada origem. */
export const EVITAVEL_OPCOES = ['Sim', 'Não', 'A avaliar'] as const;

export type Evitavel = (typeof EVITAVEL_OPCOES)[number];

/** Listas editáveis da NC (tabela nc_listas). */
export type ListaNc = 'area' | 'tipo_saida' | 'resolucao' | 'empresa' | 'como_identificada' | 'reembolso';

export const LISTA_NC_LABEL: Record<ListaNc, string> = {
  area: 'Áreas',
  tipo_saida: 'Tipo de saída',
  resolucao: 'Resolução',
  empresa: 'Empresa / contrato',
  como_identificada: 'Como foi identificada',
  reembolso: 'Reembolso Correios?',
};

/** Origem da NC com a área responsável e se era evitável (LISTAS_NC, colunas A–C). */
export interface NcOrigem {
  nome: string;
  area: string;
  evitavel: Evitavel;
  ordem: number;
  ativo: boolean;
}

export interface NcListaItem {
  lista: ListaNc;
  valor: string;
  ordem: number;
  ativo: boolean;
}

export interface ListasNc {
  origens: NcOrigem[];
  itens: NcListaItem[];
}

/** Empresas com formulário de reversa. As demais registram NC, mas não geram reversa. */
export const EMPRESAS_REVERSA: Empresa[] = ['Alinare', 'Novitah'];

/** Campos digitados da NC (REGISTRO_NC, colunas em azul). */
export interface NcCampos {
  data_ocorrencia: string | null;
  data_identificacao: string | null;
  empresa: string | null;
  cliente: string | null;
  vendedora: string | null;
  romaneio: string | null;
  valor_romaneio: number | null;
  nf: string | null;
  rastreio: string | null;
  data_postagem: string | null;
  tipo_saida: string | null;
  origem: string | null;
  como_identificada: string | null;
  status_correios: string | null;
  descricao: string | null;
  resolucao: string | null;
  novo_rastreio: string | null;
  valor_declarado: number | null;
  valor_venda: number | null;
  frete_original: number | null;
  custo_produto: number | null;
  custo_frete_adicional: number | null;
  custo_multa_outros: number | null;
  reembolso_correios: string | null;
  numero_pi: string | null;
  valor_reembolsado: number | null;
  tempo_tratativa_min: number | null;
  status: StatusNc | null;
  data_encerramento: string | null;
}

/** NC lida de vw_nao_conformidades: campos digitados + calculados. */
export interface NaoConformidade extends NcCampos {
  id: string;
  numero: number;
  /** ID da planilha: NC-0001 */
  codigo: string;
  created_at: string;
  updated_at: string;
  /** Veio da planilha (histórico anterior ao sistema) */
  importada: boolean;
  custo_total: number | null;
  custo_liquido: number | null;
  area_responsavel: string | null;
  evitavel: Evitavel | null;
  dias_em_aberto: number | null;
  qtd_reversas: number;
}

/** Item da linha do tempo da NC: evento automático ou anotação. */
export interface NcHistorico {
  id: string;
  nc_id: string;
  created_at: string;
  user_nome: string;
  tipo: 'evento' | 'nota';
  acao: string;
}

/** NC aberta oferecida no formulário de reversa (função ncs_para_reversa). */
export interface NcOpcaoReversa {
  id: string;
  numero: number;
  codigo: string;
  data_ocorrencia: string | null;
  cliente: string | null;
  origem: string | null;
  status: StatusNc;
}

// ── Comunicações automáticas: reconciliação administrativa ───────────────────
export const EVENTO_COMUNICACAO_LABEL: Record<string, string> = {
  pedido_criado: 'Pedido registrado',
  aprovacao_pendente: 'Aprovação pendente',
  pedido_aprovado: 'Pedido aprovado',
  pedido_rejeitado: 'Pedido rejeitado',
  emissao_pendente: 'Emissão pendente',
  etiqueta_disponivel: 'Etiqueta disponível',
  postagem_confirmada: 'Postagem confirmada',
  recebimento_confirmado: 'Recebimento confirmado',
};

/** Situações da fila. Aceite SMTP e êxito dos conectores legados não comprovam entrega nem leitura. */
export const STATUS_COMUNICACAO_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  processando: 'Em envio',
  falhou: 'Falhou (nova tentativa agendada)',
  acao_conector_concluida: 'Ação do conector concluída',
  smtp_aceito: 'Aceito pelo SMTP (não confirma entrega)',
  resultado_indeterminado: 'Resultado indeterminado',
  erro_permanente: 'Erro permanente de envio',
  limite_tentativas: 'Limite de tentativas',
  evento_obsoleto: 'Não enviada: perdeu pertinência',
  acesso_revogado: 'Não enviada: acesso revogado',
  aprovacao_indisponivel: 'Não enviada: aprovação indisponível',
  emissao_substituida: 'Não enviada: emissão substituída',
  aguardando_email: 'Aguardando e-mail do usuário',
  aguardando_identidade: 'Aguardando identificação do solicitante',
  aguardando_pdf: 'Aguardando PDF',
  aguardando_rastreio: 'Aguardando rastreio',
};

export const CANAL_COMUNICACAO_LABEL: Record<string, string> = { email: 'E-mail', teams: 'Teams' };

export interface ComunicacaoReversa {
  /** Identificador estável usado para correlacionar a fila e suas tentativas. */
  id: string;
  solicitacao_id: string;
  pedido: string;
  empresa: Empresa;
  evento: string;
  canal: 'email' | 'teams';
  destinatario_nome: string;
  destinatario_email: string | null;
  status: string;
  tentativas: number;
  max_tentativas: number;
  criado_em: string;
  atualizado_em: string;
  proxima_tentativa_em: string | null;
  acao_conector_em: string | null;
  ultimo_erro: string;
  reconciliacoes: number;
  total: number;
}

export interface FiltrosComunicacao {
  status?: string;
  evento?: string;
  canal?: string;
  solicitacaoId?: string;
  limite?: number;
  deslocamento?: number;
}

export type AcaoReconciliacao = 'confirmar_conclusao_conector' | 'autorizar_nova_tentativa';

export interface HistoricoComunicacao {
  tentativas: Array<{
    iniciada_em: string;
    finalizada_em: string | null;
    resultado: string;
    transporte: string | null;
    http_status: number | null;
    codigo_smtp: number | null;
    detalhe: string;
  }>;
  reconciliacoes: Array<{
    acao: AcaoReconciliacao;
    administrador_nome: string;
    realizado_em: string;
    justificativa: string;
    referencia: string;
    status_anterior: string;
    status_novo: string;
    valores_anteriores: Record<string, unknown>;
    valores_novos: Record<string, unknown>;
  }>;
}

// ── Relatórios por empresa e período ─────────────────────────────────────────
export type CampoDataRelatorio = 'solicitacao' | 'decisao' | 'emissao' | 'postagem';

export const CAMPO_DATA_RELATORIO_LABEL: Record<CampoDataRelatorio, string> = {
  solicitacao: 'Data da solicitação',
  decisao: 'Data da decisão de aprovação',
  emissao: 'Data de emissão da etiqueta',
  postagem: 'Data da postagem confirmada',
};

export interface FiltrosRelatorio {
  empresa: Empresa | 'Ambas';
  campoData: CampoDataRelatorio;
  inicio?: string;
  fim?: string;
}

export interface RelatorioReversa {
  filtro: { empresa: Empresa | null; campo_data: CampoDataRelatorio; inicio: string | null; fim: string | null };
  solicitacoes: number;
  por_empresa: Partial<Record<Empresa, number>>;
  por_motivo: Array<{ motivo: string; quantidade: number }>;
  aprovacao: { aguardando: number; aprovada: number; rejeitada: number; legado_sem_decisao_registrada: number };
  logistica: {
    aguardando_emissao: number; aguardando_checkin: number; postado: number; em_transito: number;
    concluido: number; sem_liberacao_logistica: number;
  };
  emissoes: {
    total: number; primeiras_emissoes: number; reemissoes: number; pedidos_com_emissao: number;
    pedidos_com_reemissao: number; com_pdf_vinculado: number;
  };
  postagem: { pedidos_com_postagem_confirmada: number; pedidos_com_etiqueta_vencida_sem_postagem_confirmada: number };
  recebimento: { concluidos: number; recebimento_confirmado_manualmente: number };
  custo_disponivel: boolean;
  gerado_em: string;
}

export interface LinhaRelatorioReversa {
  pedido: string;
  empresa: Empresa;
  setor: string;
  data_solicitacao: string;
  motivo: string;
  situacao_aprovacao: string;
  decisao_em: string | null;
  situacao_logistica: string;
  emissoes: number;
  reemissoes: number;
  ultima_emissao_em: string | null;
  valida_ate: string | null;
  postagem_confirmada_em: string | null;
  etiqueta_vencida_sem_postagem_confirmada: boolean;
  recebimento_confirmado_manualmente_em: string | null;
}
