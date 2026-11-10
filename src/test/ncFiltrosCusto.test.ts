import { describe, expect, it } from 'vitest';
import { codigoNc } from '../lib/ncCalculos';
import { SEM_FILTROS_NC, filtrarNcs, temFiltroNc } from '../lib/ncFiltros';
import type { NaoConformidade } from '../types';

function nc(numero: number, extras: Partial<NaoConformidade>): NaoConformidade {
  return {
    id: `00000000-0000-4000-8000-${String(numero).padStart(12, '0')}`, numero, codigo: codigoNc(numero),
    created_at: '', updated_at: '', importada: false, data_ocorrencia: '2026-10-03', data_identificacao: null,
    empresa: 'Alinare', cliente: null, vendedora: null, romaneio: null, valor_romaneio: null, nf: null, rastreio: null,
    data_postagem: null, tipo_saida: null, origem: null, como_identificada: null, status_correios: null, descricao: null,
    resolucao: null, novo_rastreio: null, valor_declarado: null, valor_venda: null, frete_original: null,
    custo_produto: null, custo_frete_adicional: null, custo_multa_outros: null, reembolso_correios: null, numero_pi: null,
    valor_reembolsado: null, tempo_tratativa_min: null, status: 'Aberta', data_encerramento: null,
    custo_total: null, custo_liquido: null, area_responsavel: null, evitavel: null, dias_em_aberto: null, qtd_reversas: 0,
    tipo_problema: 'Extravio', causador: 'Correios', custo_situacao: null,
    ...extras,
  };
}

const ncs = [
  nc(1, { custo_situacao: 'Não', custo_produto: 0 }),
  nc(2, { custo_situacao: 'Sim' }),
  nc(3, { custo_situacao: 'Em apuração' }),
  nc(4, { custo_situacao: 'Sim', custo_produto: 100 }),
  nc(5, { custo_situacao: null, custo_produto: 30 }),
  nc(6, { custo_situacao: null }),
];

const codigos = (filtros: Partial<typeof SEM_FILTROS_NC>) =>
  filtrarNcs(ncs, { ...SEM_FILTROS_NC, ...filtros }).map((n) => n.codigo);

describe('lista: filtro de custo', () => {
  it('"Todos os custos" não restringe e não conta como filtro ativo', () => {
    expect(codigos({ custo: 'todos' })).toHaveLength(6);
    expect(temFiltroNc({ ...SEM_FILTROS_NC, custo: 'todos' })).toBe(false);
  });

  it('cada opção separa a situação e o valor certos', () => {
    expect(codigos({ custo: 'sem_custo' })).toEqual([codigoNc(1)]);
    expect(codigos({ custo: 'valor_nao_informado' })).toEqual([codigoNc(2)]);
    expect(codigos({ custo: 'a_apurar' })).toEqual([codigoNc(3)]);
    expect(codigos({ custo: 'com_valor' })).toEqual([codigoNc(4), codigoNc(5)]);
    expect(codigos({ custo: 'sem_situacao' })).toEqual([codigoNc(5), codigoNc(6)]);
  });

  it('com outro filtro ativo, "Limpar" aparece', () => {
    expect(temFiltroNc({ ...SEM_FILTROS_NC, custo: 'com_valor' })).toBe(true);
  });
});
