// ── Classificação da NC vinculada à reversa ─────────────────────────────────
// Usada pelo seletor do formulário e pela aprovação, para que as duas telas mostrem o
// mesmo texto. Só apresenta o que o banco devolveu: não infere nem grava nada.
// A origem antiga (registro anterior à classificação separada) aparece como histórico
// e nunca vira tipo do problema nem causador.
// ─────────────────────────────────────────────────────────────────────────────

import { LISTA_NC_LABEL } from '../types';

export const ROTULO_ORIGEM_ANTIGA = 'Origem antiga';

/** Campos de classificação de uma NC, com os nomes do banco (tipo_problema, causador, origem). */
export interface ClassificacaoVinculada {
  tipo_problema?: string | null;
  causador?: string | null;
  origem?: string | null;
}

export interface ItemClassificacaoVinculada {
  rotulo: string;
  valor: string;
}

/**
 * Itens da classificação, na ordem de exibição: tipo do problema e origem / causador
 * (registro novo) e, quando existir, a origem antiga. Sem nenhum deles, diz que não foi informada.
 */
export function itensClassificacaoVinculada(nc: ClassificacaoVinculada): ItemClassificacaoVinculada[] {
  const itens: ItemClassificacaoVinculada[] = [];
  if (nc.tipo_problema) itens.push({ rotulo: LISTA_NC_LABEL.tipo_problema, valor: nc.tipo_problema });
  if (nc.causador) itens.push({ rotulo: LISTA_NC_LABEL.causador, valor: nc.causador });
  if (nc.origem) itens.push({ rotulo: ROTULO_ORIGEM_ANTIGA, valor: nc.origem });
  return itens.length > 0 ? itens : [{ rotulo: 'Classificação', valor: 'não informada' }];
}

/** Os mesmos itens em uma linha, para o texto de uma opção de seleção. */
export function textoClassificacaoVinculada(nc: ClassificacaoVinculada): string {
  return itensClassificacaoVinculada(nc).map((item) => `${item.rotulo}: ${item.valor}`).join(' · ');
}
