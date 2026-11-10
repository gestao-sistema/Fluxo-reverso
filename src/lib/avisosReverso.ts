// ── Avisos internos do ciclo da reversa (sino) ──────────────────────────────
// Tipos, textos e rotas dos avisos. Aviso não é tarefa: a aprovação pendente continua
// na fila e no contador; aqui ela só aparece como aviso até ser decidida ou substituída.
// Módulo próprio (fora de src/types/index.ts), para não disputar o arquivo de tipos.
// ─────────────────────────────────────────────────────────────────────────────

import { codigoPedido } from './pedido';

/** Acontecimentos do ciclo da reversa avisados no sino (os mesmos eventos da fila de comunicação). */
export type EventoAviso =
  | 'pedido_criado'
  | 'aprovacao_pendente'
  | 'pedido_aprovado'
  | 'pedido_rejeitado'
  | 'etiqueta_disponivel'
  | 'postagem_confirmada'
  | 'recebimento_confirmado';

export interface AvisoReverso {
  id: string;
  solicitacao_id: string;
  empresa: string;
  evento: EventoAviso;
  /** Versão da aprovação (pendente e decisão). Nulo nos avisos de andamento. */
  versao: number | null;
  /** Motivo da rejeição ou observação da aprovação, quando houver. */
  justificativa: string | null;
  nome_cliente: string | null;
  criado_em: string;
  lido_em: string | null;
  /** Preenchido quando a aprovação foi decidida ou substituída: deixa de ser pendência. */
  superado_em: string | null;
}

export const ROTULO_EVENTO_AVISO: Record<EventoAviso, string> = {
  pedido_criado: 'Pedido registrado',
  aprovacao_pendente: 'Aprovação pendente',
  pedido_aprovado: 'Pedido aprovado',
  pedido_rejeitado: 'Pedido rejeitado',
  etiqueta_disponivel: 'Etiqueta disponível',
  postagem_confirmada: 'Postagem confirmada',
  recebimento_confirmado: 'Recebimento confirmado',
};

/** Rota que abre o pedido: aprovação abre a fila de aprovação; os demais abrem Meus Pedidos. */
export function rotaDoAviso(aviso: Pick<AvisoReverso, 'evento' | 'solicitacao_id'>): string {
  const destino = aviso.evento === 'aprovacao_pendente' ? '/admin/aprovacoes' : '/admin/meus-pedidos';
  return `${destino}?solicitacaoId=${encodeURIComponent(aviso.solicitacao_id)}`;
}

/** Texto do acontecimento, em linguagem operacional. Só descreve o que o banco registrou. */
export function textoDoAviso(aviso: AvisoReverso): string {
  const justificativa = aviso.justificativa?.trim();
  switch (aviso.evento) {
    case 'pedido_criado':
      return 'Sua solicitação foi registrada e aguarda aprovação.';
    case 'aprovacao_pendente':
      return aviso.superado_em
        ? 'Esta aprovação já foi decidida ou substituída. Não exige ação.'
        : 'Há uma solicitação aguardando sua decisão.';
    case 'pedido_aprovado':
      return justificativa ? `Sua solicitação foi aprovada. Observação: ${justificativa}` : 'Sua solicitação foi aprovada.';
    case 'pedido_rejeitado':
      return justificativa ? `Sua solicitação foi rejeitada. Motivo: ${justificativa}` : 'Sua solicitação foi rejeitada.';
    case 'etiqueta_disponivel':
      return 'A etiqueta do seu pedido já está disponível.';
    case 'postagem_confirmada':
      return 'A postagem do seu pedido foi confirmada.';
    case 'recebimento_confirmado':
      return 'A empresa confirmou o recebimento do seu pedido.';
    default:
      return 'Há uma atualização neste pedido.';
  }
}

/** Identificação do pedido (RV-xxxx), a mesma das telas de reversa. */
export function identificacaoDoAviso(aviso: Pick<AvisoReverso, 'solicitacao_id'>): string {
  return codigoPedido(aviso.solicitacao_id);
}

/** Não lido que ainda pede atenção. Um aviso superado não conta, mesmo sem leitura. */
export function avisoNaoLidoAtivo(aviso: Pick<AvisoReverso, 'lido_em' | 'superado_em'>): boolean {
  return !aviso.lido_em && !aviso.superado_em;
}

export function contarAvisosNaoLidos(avisos: readonly AvisoReverso[]): number {
  return avisos.filter(avisoNaoLidoAtivo).length;
}
