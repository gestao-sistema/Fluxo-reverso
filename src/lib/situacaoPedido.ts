import type { Solicitacao, StatusSolicitacao } from '../types';

type DadosDaSituacao = Pick<Solicitacao, 'status'> & Partial<Pick<Solicitacao, 'aprovacao_status' | 'aprovacao_legada'>>;

/**
 * Situação do pedido como a pessoa a entende. No banco a aprovação é uma dimensão própria e o pedido
 * aguardando aprovação (ou rejeitado) continua com status "pendente". Ler só `status` mostraria
 * "Aguardando etiqueta" para um pedido que ainda nem foi aprovado.
 * A aprovação só prevalece enquanto o pedido não saiu da etapa inicial; depois disso vale a logística.
 */
export function statusEfetivo(pedido: DadosDaSituacao): StatusSolicitacao {
  const status = pedido.status ?? 'pendente';
  if (status !== 'pendente' && status !== 'aguardando_aprovacao' && status !== 'reprovado') return status;
  if (status === 'reprovado' || pedido.aprovacao_status === 'rejeitada') return 'reprovado';
  if (status === 'aguardando_aprovacao' || pedido.aprovacao_status === 'aguardando_aprovacao') return 'aguardando_aprovacao';
  return 'pendente';
}

/** O que a pessoa espera que aconteça a seguir; null quando o pedido terminou. */
export const PROXIMO_PASSO: Record<StatusSolicitacao, string | null> = {
  aguardando_aprovacao: 'Aguarda a decisão do responsável.',
  reprovado: null,
  pendente: 'A expedição vai anexar a etiqueta.',
  etiqueta_gerada: 'Aguarda a postagem nos Correios.',
  postado: 'Os Correios vão entregar.',
  em_transito: 'Os Correios vão entregar.',
  concluido: null,
};

/** Status gravados no banco que podem corresponder às situações pedidas (para consultar o servidor). */
export function statusDoBancoPara(situacoes: StatusSolicitacao[]): StatusSolicitacao[] {
  const resultado = new Set<StatusSolicitacao>();
  for (const situacao of situacoes) {
    resultado.add(situacao);
    if (situacao === 'aguardando_aprovacao' || situacao === 'reprovado') resultado.add('pendente');
  }
  return [...resultado];
}
