import { describe, it, expect } from 'vitest';
import {
  NAO_INFORMADO,
  SEM_ORIGEM_ANTIGA,
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
  // Sem origem antiga e sem tipo nem causador: registro novo pendente de classificação
  const semOrigem = nc({ data_ocorrencia: '2026-10-02', empresa: 'Alinare', status: 'Aberta' });
  const semData = nc({ origem: 'Extravio Correios', empresa: 'Alinare', status: 'Aberta' });
  const ncs = [a, b, c, semOrigem, semData];

  const painel2026 = calcularPainelNc(ncs, { dataInicio: '2026-01-01', dataFim: '', ano: 2026 }, listas, HOJE);

  it('base: todas as NCs com data no período (pendentes entram); sem data ficam de fora', () => {
    expect(painel2026.indicadores.registradas).toBe(3);
    // a e b têm origem antiga mas não têm tipo nem causador: o banco as marca como pendentes
    expect(painel2026.indicadores.classificadas).toBe(0);
    expect(painel2026.indicadores.pendentes).toBe(3);
  });

  it('indicadores do período', () => {
    const i = painel2026.indicadores;
    expect(i.emAberto).toBe(2);
    expect(i.pctEvitaveis).toBe(0.5);
    // Custos: a (10 + 5,5) e b (100); a NC sem valor não entra como zero
    expect(i.custoTotal).toBe(115.5);
    expect(i.valorReembolsado).toBe(103);
    expect(i.custoLiquido).toBe(12.5);
    // Custo líquido ÷ total de NCs registradas: 12,50 ÷ 3
    expect(i.custoLiquidoPorNc).toBe(4.17);
    // Média só entre NCs com valor registrado: 12,50 ÷ 2
    expect(i.custoLiquidoMedioComValor).toBe(6.25);
    expect(i.comValor).toBe(2);
    expect(i.parciais).toBe(2);
    expect(i.horasTratativa).toBe(2);
    // (15 + 5 + 18) / 3 — só ocorrências com status preenchido
    expect(i.diasMediosEmAberto).toBeCloseTo(12.67, 2);
    expect(i.comReversa).toBe(1);
    expect(i.pctComReversa).toBeCloseTo(1 / 3, 5);
  });

  it('evitável: numerador, denominador e contagens; sem origem antiga é sem informação', () => {
    const i = painel2026.indicadores;
    expect([i.evitaveisSim, i.evitaveisNao, i.evitaveisAvaliar, i.evitaveisBase, i.evitaveisSemInformacao]).toEqual([1, 1, 0, 2, 1]);
  });

  it('cobertura do custo: categorias exclusivas que somam as registradas', () => {
    const cobertura = painel2026.indicadores.cobertura;
    expect(cobertura).toMatchObject({
      registradas: 3, semCusto: 0, comValor: 2, valorNaoInformado: 0, aApurar: 0, semSituacaoSemValor: 1,
      situacaoNaoInformada: 3, parciais: 2, reembolsoInformado: 2, comValorSemReembolso: 0,
    });
    expect(cobertura.semCusto + cobertura.comValor + cobertura.valorNaoInformado + cobertura.aApurar + cobertura.semSituacaoSemValor).toBe(3);
  });

  it('tabela por origem: origens ativas na ordem da lista, inclusive com zero; sem origem antiga no fim', () => {
    expect(painel2026.porOrigem.map((l) => [l.valor, l.qtd])).toEqual([
      ['Erro expedição – endereço incorreto', 1],
      ['Extravio Correios', 1],
      ['Mercadoria apreendida (fiscalização)', 0],
      [SEM_ORIGEM_ANTIGA, 1],
    ]);
    const endereco = painel2026.porOrigem[0];
    expect(endereco.pct).toBeCloseTo(1 / 3, 5);
    expect(endereco).toMatchObject({ custoLiquido: 12.5, horas: 0.5, emAberto: 1, rotuloCusto: 'R$ 12,50', detalheCusto: '1 parcial' });
  });

  it('demais tabelas: área, empresa, tipo de saída (com "não informado"), resolução e status', () => {
    expect(painel2026.porArea.map((l) => l.qtd)).toEqual([1, 1, 0, 1]);
    expect(painel2026.porEmpresa.map((l) => [l.valor, l.qtd])).toEqual([['Alinare', 2], ['Novitah', 1]]);
    expect(painel2026.porTipoSaida.map((l) => [l.valor, l.qtd])).toEqual([['Venda', 1], [NAO_INFORMADO, 2]]);
    expect(painel2026.porResolucao.map((l) => [l.valor, l.qtd])).toEqual([['Reverso', 1], ['Multa paga', 1], [NAO_INFORMADO, 1]]);
    expect(painel2026.porStatus.map((l) => [l.valor, l.qtd])).toEqual([
      ['Aberta', 2], ['Em tratativa', 0], ['Encerrada', 1], ['Cancelada', 0],
    ]);
  });

  it('visão mensal usa só o ano (ignora o período), como na planilha', () => {
    const outubro = calcularPainelNc(ncs, { dataInicio: '2026-10-01', dataFim: '', ano: 2026 }, listas, HOJE);
    expect(outubro.indicadores.registradas).toBe(2);
    expect(outubro.porMes[8]).toMatchObject({ rotulo: 'Set', qtd: 1, evitaveis: 0, custoLiquido: 0 });
    expect(outubro.porMes[9]).toMatchObject({ rotulo: 'Out', qtd: 2, evitaveis: 1, custoLiquido: 12.5, comValor: 1 });
    expect(outubro.porMes.reduce((s, m) => s + m.qtd, 0)).toBe(3);
  });

  it('sem período: inclui o histórico e mostra "sem status"', () => {
    const tudo = calcularPainelNc(ncs, { dataInicio: '', dataFim: '', ano: 2025 }, listas, HOJE);
    expect(tudo.indicadores.registradas).toBe(4);
    expect(tudo.porStatus.find((l) => l.valor === SEM_STATUS)?.qtd).toBe(1);
    // A NC sem status (histórico) não entra nos dias médios
    expect(tudo.indicadores.diasMediosEmAberto).toBeCloseTo(12.67, 2);
    expect(tudo.porMes[3]).toMatchObject({ rotulo: 'Abr', qtd: 1, custoLiquido: 50, rotuloCusto: 'R$ 50,00' });
  });

  it('filtro por empresa (dashboard)', () => {
    const alinare = calcularPainelNc(ncs, { dataInicio: '', dataFim: '', ano: 2026, empresa: 'Alinare' }, listas, HOJE);
    expect(alinare.indicadores.registradas).toBe(3);
  });

  it('anos com ocorrência, do mais recente ao mais antigo', () => {
    expect(anosComOcorrencia(ncs)).toEqual([2026, 2025]);
  });
});

describe('painel sem nenhum valor de custo: ausência não vira zero', () => {
  const semValor = [
    nc({ empresa: 'Alinare', data_ocorrencia: '2026-10-03', origem: 'Extravio Correios', custo_situacao: 'Em apuração' }),
    nc({ empresa: 'Alinare', data_ocorrencia: '2026-10-04', origem: 'Extravio Correios', custo_situacao: 'Sim' }),
  ];
  const painel = calcularPainelNc(semValor, { dataInicio: '', dataFim: '', ano: 2026 }, listas, HOJE);

  it('totais e médias ficam sem valor, não R$ 0,00', () => {
    const i = painel.indicadores;
    expect(i.custoTotal).toBeNull();
    expect(i.valorReembolsado).toBeNull();
    expect(i.custoLiquido).toBeNull();
    expect(i.custoLiquidoPorNc).toBeNull();
    expect(i.custoLiquidoMedioComValor).toBeNull();
    expect(i.comValor).toBe(0);
  });

  it('linhas: o estado do custo aparece no lugar do valor', () => {
    expect(painel.porSituacaoCusto.find((l) => l.valor === 'Em apuração')).toMatchObject({ qtd: 1, rotuloCusto: 'A apurar', custoLiquido: null });
    expect(painel.porSituacaoCusto.find((l) => l.valor === 'Sim')).toMatchObject({ qtd: 1, rotuloCusto: 'Valor não informado', custoLiquido: null });
    expect(painel.porSituacaoCusto.find((l) => l.valor === 'Não')).toMatchObject({ qtd: 0, rotuloCusto: '—' });
  });

  it('cobertura: as duas NCs somam nas categorias de valor não informado e a apurar', () => {
    const c = painel.indicadores.cobertura;
    expect([c.semCusto, c.comValor, c.valorNaoInformado, c.aApurar, c.semSituacaoSemValor]).toEqual([0, 0, 1, 1, 0]);
  });
});
