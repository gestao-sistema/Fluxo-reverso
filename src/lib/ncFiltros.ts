// ── Filtros da lista de não conformidades ───────────────────────────────────
// Puro, para testar: NC sem origem antiga (registro novo) passa pelos filtros de
// tipo e causador, e a busca e o período valem para todas.
// ─────────────────────────────────────────────────────────────────────────────

import type { NaoConformidade } from '../types';
import { classificacaoPendente } from './ncClassificacao';
import { SEM_STATUS } from './ncCalculos';
import { atendeFiltroCusto } from './ncCustos';
import type { FiltroCusto } from './ncCustos';

export interface FiltrosNc {
  dataInicio: string;
  dataFim: string;
  empresa: string;
  status: string;
  /** Origem antiga (registros anteriores) */
  origem: string;
  tipo: string;
  causador: string;
  /** Situação e valor do custo (regra de ncCustos) */
  custo: FiltroCusto;
  /** Só NCs sem tipo ou causador */
  pendente: boolean;
  busca: string;
}

export const SEM_FILTROS_NC: FiltrosNc = {
  dataInicio: '', dataFim: '', empresa: '', status: '', origem: '', tipo: '', causador: '', custo: 'todos', pendente: false, busca: '',
};

export function filtrarNcs(ncs: NaoConformidade[], filtros: FiltrosNc): NaoConformidade[] {
  const termo = filtros.busca.trim().toLowerCase();
  return ncs.filter(
    (nc) =>
      (!filtros.dataInicio || (nc.data_ocorrencia ?? '') >= filtros.dataInicio) &&
      (!filtros.dataFim || (nc.data_ocorrencia !== null && nc.data_ocorrencia <= filtros.dataFim)) &&
      (!filtros.empresa || nc.empresa === filtros.empresa) &&
      (!filtros.status || (filtros.status === SEM_STATUS ? nc.status === null : nc.status === filtros.status)) &&
      (!filtros.origem || nc.origem === filtros.origem) &&
      (!filtros.tipo || nc.tipo_problema === filtros.tipo) &&
      (!filtros.causador || nc.causador === filtros.causador) &&
      atendeFiltroCusto(nc, filtros.custo) &&
      (!filtros.pendente || classificacaoPendente(nc)) &&
      (!termo ||
        [nc.codigo, nc.cliente, nc.nf, nc.rastreio, nc.novo_rastreio, nc.romaneio, nc.vendedora].some((v) =>
          v?.toLowerCase().includes(termo)
        ))
  );
}

/** Há algum filtro ativo (para mostrar "Limpar"). "Todos os custos" não é filtro. */
export function temFiltroNc(filtros: FiltrosNc): boolean {
  return Object.entries(filtros).some(([chave, valor]) => (chave === 'custo' ? valor !== 'todos' : Boolean(valor)));
}
