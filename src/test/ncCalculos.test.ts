import { describe, it, expect } from 'vitest';
import {
  NAO_INFORMADO,
  SEM_STATUS,
  anosComOcorrencia,
  calcularPainelNc,
  classificarOrigem,
  codigoNc,
  custoLiquido,
  custoTotal,
  diasEmAberto,
  opcoesComAtual,
} from '../lib/ncCalculos';
import type { Evitavel, ListasNc, NaoConformidade } from '../types';

const HOJE = '2026-10-20';

const listas: ListasNc = {
  origens: [
    { nome: 'Erro expedição – endereço incorreto', area: 'Expedição', evitavel: 'Sim', ordem: 1, ativo: true },
    { nome: 'Extravio Correios', area: 'Correios', evitavel: 'Não', ordem: 2, ativo: true },
    { nome: 'Mercadoria apreendida (fiscalização)', area: 'Fiscalização', evitavel: 'A avaliar', ordem: 3, ativo: true },
    { nome: 'Origem desativada', area: 'Expedição', evitavel: 'Sim', ordem: 4, ativo: false },
  ],
  itens: [
    { lista: 'area', valor: 'Expedição', ordem: 1, ativo: true },
    { lista: 'area', valor: 'Correios', ordem: 2, ativo: true },
    { lista: 'area', valor: 'Fiscalização', ordem: 3, ativo: true },
    { lista: 'empresa', valor: 'Alinare', ordem: 1, ativo: true },
    { lista: 'empresa', valor: 'Novitah', ordem: 2, ativo: true },
    { lista: 'tipo_saida', valor: 'Venda', ordem: 1, ativo: true },
    { lista: 'resolucao', valor: 'Reverso', ordem: 1, ativo: true },
    { lista: 'resolucao', valor: 'Multa paga', ordem: 2, ativo: true },
  ],
};

let seq = 0;

/** NC como vem de vw_nao_conformidades: campos calculados preenchidos como no banco. */
function nc(campos: Partial<NaoConformidade>): NaoConformidade {
  seq++;
  const base: NaoConformidade = {
    id: `id-${seq}`, numero: seq, codigo: codigoNc(seq), created_at: '', updated_at: '', importada: false,
    data_ocorrencia: null, data_identificacao: null, empresa: null, cliente: null, vendedora: null, romaneio: null,
    valor_romaneio: null, nf: null, rastreio: null, data_postagem: null, tipo_saida: null, origem: null,
    como_identificada: null, status_correios: null, descricao: null, resolucao: null, novo_rastreio: null,
    valor_declarado: null, valor_venda: null, frete_original: null, custo_produto: null, custo_frete_adicional: null,
    custo_multa_outros: null, reembolso_correios: null, numero_pi: null, valor_reembolsado: null,
    tempo_tratativa_min: null, status: null, data_encerramento: null,
    custo_total: null, custo_liquido: null, area_responsavel: null, evitavel: null, dias_em_aberto: null, qtd_reversas: 0,
    ...campos,
  };
  const { area, evitavel } = classificarOrigem(base.origem, listas.origens);
  return {
    ...base,
    custo_total: custoTotal(base),
    custo_liquido: custoLiquido(base),
    area_responsavel: area,
    evitavel: evitavel as Evitavel | null,
  };
}

describe('campos calculados (fórmulas da REGISTRO_NC)', () => {
  it('ID = "NC-" & TEXT(n, "0000")', () => {
    expect(codigoNc(1)).toBe('NC-0001');
    expect(codigoNc(25)).toBe('NC-0025');
    expect(codigoNc(12345)).toBe('NC-12345');
  });

  it('custo total: vazio sem custos; zero conta como informado', () => {
    expect(custoTotal({ custo_produto: null, custo_frete_adicional: null, custo_multa_outros: null })).toBeNull();
    expect(custoTotal({ custo_produto: 10, custo_frete_adicional: 5.5, custo_multa_outros: null })).toBe(15.5);
    expect(custoTotal({ custo_produto: 0, custo_frete_adicional: null, custo_multa_outros: null })).toBe(0);
  });

  it('custo líquido = custo total − valor reembolsado', () => {
    const custos = { custo_produto: 10, custo_frete_adicional: 5.5, custo_multa_outros: null };
    expect(custoLiquido({ ...custos, valor_reembolsado: 3 })).toBe(12.5);
    expect(custoLiquido({ ...custos, valor_reembolsado: null })).toBe(15.5);
    expect(custoLiquido({ custo_produto: null, custo_frete_adicional: null, custo_multa_outros: null, valor_reembolsado: 50 })).toBeNull();
  });

  it('dias em aberto: (encerramento ou hoje) − (identificação ou ocorrência)', () => {
    expect(diasEmAberto({ data_ocorrencia: '2026-10-01', data_identificacao: '2026-10-05', data_encerramento: null }, HOJE)).toBe(15);
    expect(diasEmAberto({ data_ocorrencia: '2026-10-01', data_identificacao: '2026-10-05', data_encerramento: '2026-10-10' }, HOJE)).toBe(5);
    expect(diasEmAberto({ data_ocorrencia: '2026-10-01', data_identificacao: null, data_encerramento: null }, HOJE)).toBe(19);
    expect(diasEmAberto({ data_ocorrencia: null, data_identificacao: null, data_encerramento: null }, HOJE)).toBeNull();
    // Atravessa o horário de verão sem perder um dia
    expect(diasEmAberto({ data_ocorrencia: '2026-02-10', data_identificacao: null, data_encerramento: '2026-03-10' }, HOJE)).toBe(28);
  });

  it('área e evitável vêm da origem (VLOOKUP com "A definir" / "A avaliar")', () => {
    expect(classificarOrigem('Extravio Correios', listas.origens)).toEqual({ area: 'Correios', evitavel: 'Não' });
    expect(classificarOrigem('Não cadastrada', listas.origens)).toEqual({ area: 'A definir', evitavel: 'A avaliar' });
    expect(classificarOrigem(null, listas.origens)).toEqual({ area: null, evitavel: null });
  });

  it('opções mantêm o valor atual mesmo desativado', () => {
    expect(opcoesComAtual(['A', 'B'], 'C')).toEqual(['A', 'B', 'C']);
    expect(opcoesComAtual(['A', 'B'], 'A')).toEqual(['A', 'B']);
    expect(opcoesComAtual(['A', 'B'], null)).toEqual(['A', 'B']);
  });
});

describe('painel (PAINEL_NC)', () => {
  const a = nc({
    origem: 'Erro expedição – endereço incorreto', empresa: 'Alinare', tipo_saida: 'Venda', resolucao: 'Reverso',
    data_ocorrencia: '2026-10-01', data_identificacao: '2026-10-05', status: 'Aberta',
    custo_produto: 10, custo_frete_adicional: 5.5, valor_reembolsado: 3, tempo_tratativa_min: 30, qtd_reversas: 1,
  });
  const b = nc({
    origem: 'Extravio Correios', empresa: 'Novitah', resolucao: 'Multa paga',
    data_ocorrencia: '2026-09-15', status: 'Encerrada', data_encerramento: '2026-09-20',
    custo_produto: 100, valor_reembolsado: 100, tempo_tratativa_min: 90,
  });
  const c = nc({ origem: 'Mercadoria apreendida (fiscalização)', empresa: 'Alinare', data_ocorrencia: '2025-04-10', custo_multa_outros: 50 });
  const semOrigem = nc({ data_ocorrencia: '2026-10-02', empresa: 'Alinare', status: 'Aberta' });
  const semData = nc({ origem: 'Extravio Correios', empresa: 'Alinare', status: 'Aberta' });
  const ncs = [a, b, c, semOrigem, semData];

  const painel2026 = calcularPainelNc(ncs, { dataInicio: '2026-01-01', dataFim: '', ano: 2026 }, listas, HOJE);

  it('conta só linhas com origem e data dentro do período', () => {
    expect(painel2026.indicadores.registradas).toBe(2);
  });

  it('indicadores do período', () => {
    const i = painel2026.indicadores;
    expect(i.emAberto).toBe(1);
    expect(i.pctEvitaveis).toBe(0.5);
    expect(i.custoTotal).toBe(115.5);
    expect(i.valorReembolsado).toBe(103);
    expect(i.custoLiquido).toBe(12.5);
    expect(i.custoLiquidoMedio).toBe(6.25);
    expect(i.horasTratativa).toBe(2);
    // (15 + 5) / 2 — só ocorrências com status preenchido
    expect(i.diasMediosEmAberto).toBe(10);
    expect(i.comReversa).toBe(1);
    expect(i.pctComReversa).toBe(0.5);
  });

  it('tabela por origem: origens ativas na ordem da lista, inclusive com zero', () => {
    expect(painel2026.porOrigem.map((l) => [l.valor, l.qtd])).toEqual([
      ['Erro expedição – endereço incorreto', 1],
      ['Extravio Correios', 1],
      ['Mercadoria apreendida (fiscalização)', 0],
    ]);
    const endereco = painel2026.porOrigem[0];
    expect(endereco).toMatchObject({ pct: 0.5, custoLiquido: 12.5, horas: 0.5, emAberto: 1 });
  });

  it('demais tabelas: área, empresa, tipo de saída (com "não informado"), resolução e status', () => {
    expect(painel2026.porArea.map((l) => l.qtd)).toEqual([1, 1, 0]);
    expect(painel2026.porEmpresa.map((l) => [l.valor, l.qtd])).toEqual([['Alinare', 1], ['Novitah', 1]]);
    expect(painel2026.porTipoSaida.map((l) => [l.valor, l.qtd])).toEqual([['Venda', 1], [NAO_INFORMADO, 1]]);
    expect(painel2026.porResolucao.map((l) => [l.valor, l.qtd])).toEqual([['Reverso', 1], ['Multa paga', 1]]);
    expect(painel2026.porStatus.map((l) => [l.valor, l.qtd])).toEqual([
      ['Aberta', 1], ['Em tratativa', 0], ['Encerrada', 1], ['Cancelada', 0],
    ]);
  });

  it('visão mensal usa só o ano (ignora o período), como na planilha', () => {
    const outubro = calcularPainelNc(ncs, { dataInicio: '2026-10-01', dataFim: '', ano: 2026 }, listas, HOJE);
    expect(outubro.indicadores.registradas).toBe(1);
    expect(outubro.porMes[8]).toMatchObject({ rotulo: 'Set', qtd: 1, evitaveis: 0, custoLiquido: 0 });
    expect(outubro.porMes[9]).toMatchObject({ rotulo: 'Out', qtd: 1, evitaveis: 1, custoLiquido: 12.5 });
    expect(outubro.porMes.reduce((s, m) => s + m.qtd, 0)).toBe(2);
  });

  it('sem período: inclui o histórico e mostra "sem status"', () => {
    const tudo = calcularPainelNc(ncs, { dataInicio: '', dataFim: '', ano: 2025 }, listas, HOJE);
    expect(tudo.indicadores.registradas).toBe(3);
    expect(tudo.porStatus.find((l) => l.valor === SEM_STATUS)?.qtd).toBe(1);
    // A NC sem status (histórico) não entra nos dias médios
    expect(tudo.indicadores.diasMediosEmAberto).toBe(10);
    expect(tudo.porMes[3]).toMatchObject({ rotulo: 'Abr', qtd: 1, custoLiquido: 50 });
  });

  it('filtro por empresa (dashboard)', () => {
    const alinare = calcularPainelNc(ncs, { dataInicio: '', dataFim: '', ano: 2026, empresa: 'Alinare' }, listas, HOJE);
    expect(alinare.indicadores.registradas).toBe(2);
  });

  it('anos com ocorrência, do mais recente ao mais antigo', () => {
    expect(anosComOcorrencia(ncs)).toEqual([2026, 2025]);
  });
});
