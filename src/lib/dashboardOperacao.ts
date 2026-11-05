// ── Pendências operacionais do dashboard ─────────────────────────────────────
// Funções puras: recebem as solicitações já filtradas e devolvem o que pede ação.
// O único dado de tempo disponível é a data em que cada etapa começou; não há
// prazo de validade de etiqueta no sistema, então nenhuma etapa é marcada como
// "atrasada" aqui.
// ─────────────────────────────────────────────────────────────────────────────

import type { Solicitacao, StatusSolicitacao } from '../types';

export type TipoPendencia = 'aprovacao' | 'etiqueta';

const TIPO_POR_STATUS: Partial<Record<StatusSolicitacao, TipoPendencia>> = {
  aguardando_aprovacao: 'aprovacao',
  pendente: 'etiqueta',
};

/** Texto da situação e do tempo de espera de cada tipo de pendência. */
export const TEXTO_PENDENCIA: Record<TipoPendencia, { situacao: string; espera: string }> = {
  aprovacao: { situacao: 'Decisão pendente', espera: 'Aguardando há' },
  etiqueta: { situacao: 'Emissão da etiqueta pendente', espera: 'Sem etiqueta há' },
};

export interface Pendencia {
  solicitacao: Solicitacao;
  tipo: TipoPendencia;
  /** Data (ISO ou AAAA-MM-DD) em que a etapa atual começou. */
  desde: string;
}

/** Data em que a solicitação entrou na etapa atual. */
function inicioDaEtapa(solicitacao: Solicitacao): string {
  return solicitacao.created_at || solicitacao.data_solicitacao;
}

/** Pendências que pedem ação, do início mais antigo para o mais recente. */
export function pendenciasOperacionais(
  dados: Solicitacao[],
  statusDe: (solicitacao: Solicitacao) => StatusSolicitacao,
): Pendencia[] {
  return dados
    .map((solicitacao) => {
      const tipo = TIPO_POR_STATUS[statusDe(solicitacao)];
      return tipo ? { solicitacao, tipo, desde: inicioDaEtapa(solicitacao) } : null;
    })
    .filter((item): item is Pendencia => item !== null)
    .sort((a, b) => a.desde.localeCompare(b.desde));
}

/** Tempo decorrido em formato curto ("15 min", "3 h", "2 dias"). Null se a data não for válida. */
export function tempoDesde(desde: string, agora: number): string | null {
  const inicio = new Date(desde.length <= 10 ? `${desde}T12:00:00` : desde).getTime();
  if (!Number.isFinite(inicio)) return null;
  const minutos = Math.max(1, Math.floor((agora - inicio) / 60_000));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h`;
  const dias = Math.floor(horas / 24);
  return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}
