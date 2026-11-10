import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { calcularPainelNc, SEM_ORIGEM_ANTIGA } from '../lib/ncCalculos';
import { COLUNAS_REGISTRO_NC, montarPlanilhaNc } from '../lib/ncPlanilha';
import { montarRelatorioMensalNc } from '../lib/ncRelatorioMensal';
import { SEM_FILTROS_NC, filtrarNcs } from '../lib/ncFiltros';
import type { ListasNc, NaoConformidade } from '../types';

const listas: ListasNc = {
  origens: [
    { nome: 'Erro expedição – endereço incorreto', area: 'Expedição', evitavel: 'Sim', ordem: 1, ativo: true },
    { nome: 'Extravio Correios', area: 'Correios', evitavel: 'Não', ordem: 2, ativo: true },
    { nome: 'Outro', area: 'A definir', evitavel: 'A avaliar', ordem: 3, ativo: true },
  ],
  itens: [
    { lista: 'tipo_problema', valor: 'Endereço incorreto', ordem: 1, ativo: true },
    { lista: 'tipo_problema', valor: 'Extravio', ordem: 2, ativo: true },
    { lista: 'tipo_problema', valor: 'Outro', ordem: 3, ativo: true },
    { lista: 'causador', valor: 'Expedição', ordem: 1, ativo: true },
    { lista: 'causador', valor: 'Comercial', ordem: 2, ativo: true },
    { lista: 'causador', valor: 'A apurar', ordem: 3, ativo: true },
    { lista: 'area', valor: 'Comercial', ordem: 1, ativo: true },
    { lista: 'area', valor: 'Expedição', ordem: 2, ativo: true },
    { lista: 'empresa', valor: 'Alinare', ordem: 1, ativo: true },
    { lista: 'tipo_saida', valor: 'Venda', ordem: 1, ativo: true },
  ],
};

/** NC completa, no formato que o serviço devolve (campos calculados já preenchidos). */
function nc(numero: number, extras: Partial<NaoConformidade>): NaoConformidade {
  return {
    id: `00000000-0000-4000-8000-${String(numero).padStart(12, '0')}`,
    numero, codigo: `NC-${String(numero).padStart(4, '0')}`, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z',
    importada: false, data_ocorrencia: '2026-10-03', data_identificacao: null, empresa: 'Alinare', cliente: 'Cliente base',
    vendedora: null, romaneio: null, valor_romaneio: null, nf: null, rastreio: null, data_postagem: null, tipo_saida: 'Venda',
    origem: null, como_identificada: null, status_correios: null, descricao: null, resolucao: null, novo_rastreio: null,
    valor_declarado: null, valor_venda: null, frete_original: null, custo_produto: null, custo_frete_adicional: null,
    custo_multa_outros: null, reembolso_correios: null, numero_pi: null, valor_reembolsado: null, tempo_tratativa_min: null,
    status: 'Aberta', data_encerramento: null, tipo_problema: null, causador: null, area_registro: null, area_tratativa: null,
    custo_situacao: null, custo_total: null, custo_liquido: null, area_responsavel: null, evitavel: null, dias_em_aberto: 3,
    qtd_reversas: 0,
    ...extras,
  };
}

// A e D: registros antigos (com origem). B: registro novo (sem origem). C: sem nenhuma classificação.
const A = nc(2001, {
  origem: 'Erro expedição – endereço incorreto', tipo_problema: 'Endereço incorreto', causador: 'Expedição', area_responsavel: 'Expedição',
  evitavel: 'Sim', custo_situacao: 'Sim', custo_produto: 10, custo_total: 10, custo_liquido: 10, cliente: 'Ateliê Antigo',
  data_ocorrencia: '2026-10-03',
});
const B = nc(2002, {
  origem: null, tipo_problema: 'Endereço incorreto', causador: 'Comercial', area_tratativa: 'Comercial', area_registro: 'Expedição',
  custo_situacao: 'Sim', custo_produto: 100, custo_total: 100, custo_liquido: 100, cliente: 'Loja Nova', status: 'Em tratativa',
  qtd_reversas: 1, data_ocorrencia: '2026-10-05', descricao: 'Registro novo, sem origem antiga.',
});
const C = nc(2003, { origem: null, tipo_problema: null, causador: null, cliente: 'Sem classificação', data_ocorrencia: '2026-10-06' });
const D = nc(2004, {
  origem: 'Outro', tipo_problema: 'Outro', causador: 'A apurar', area_responsavel: 'A definir', evitavel: 'A avaliar',
  custo_situacao: null, status: 'Encerrada', cliente: 'Cliente Antigo', data_ocorrencia: '2026-09-20',
});
const TODAS = [A, B, C, D];

const FILTRO_2026 = { dataInicio: '', dataFim: '', ano: 2026, empresa: null };

describe('painel e totais com registro novo (sem origem antiga)', () => {
  const painel = calcularPainelNc(TODAS, FILTRO_2026, listas, '2026-11-09');

  it('base: todas as NCs com data, inclusive a sem classificação, que aparece como pendente', () => {
    expect(painel.indicadores.registradas).toBe(4);
    expect(painel.indicadores.classificadas).toBe(3);
    expect(painel.indicadores.pendentes).toBe(1);
  });

  it('o custo do registro novo entra nos totais', () => {
    expect(painel.indicadores.custoLiquido).toBe(110);
    expect(painel.indicadores.custoTotal).toBe(110);
  });

  it('cada tabela reconcilia com o total de registradas', () => {
    const soma = (linhas: { qtd: number }[]) => linhas.reduce((t, l) => t + l.qtd, 0);
    expect(soma(painel.porTipoProblema)).toBe(4);
    expect(soma(painel.porCausador)).toBe(4);
    expect(soma(painel.porAreaTratativa)).toBe(4);
    expect(soma(painel.porSituacaoCusto)).toBe(4);
    expect(soma(painel.porOrigem)).toBe(4);
    expect(soma(painel.porStatus)).toBe(4);
    expect(soma(painel.porMes)).toBe(4);
  });

  it('registro novo aparece na tabela por tipo, por causador e por situação do custo', () => {
    expect(painel.porTipoProblema.find((l) => l.valor === 'Endereço incorreto')?.qtd).toBe(2);
    expect(painel.porCausador.find((l) => l.valor === 'Comercial')?.qtd).toBe(1);
    expect(painel.porSituacaoCusto.find((l) => l.valor === 'Sim')?.qtd).toBe(2);
    expect(painel.porAreaTratativa.find((l) => l.valor === 'Comercial')?.qtd).toBe(1);
  });

  it('a origem antiga mostra o registro novo como "Sem origem antiga", sem inventar origem', () => {
    expect(painel.porOrigem.find((l) => l.valor === SEM_ORIGEM_ANTIGA)?.qtd).toBe(2);
    expect(painel.porOrigem.find((l) => l.valor === 'Erro expedição – endereço incorreto')?.qtd).toBe(1);
  });

  it('a visão mensal inclui o registro novo no mês da ocorrência', () => {
    expect(painel.porMes.find((m) => m.mes === 10)?.qtd).toBe(3);
    expect(painel.porMes.find((m) => m.mes === 9)?.qtd).toBe(1);
  });

  it('% evitáveis usa só os registros que têm evitável (origem antiga): 1 de 2', () => {
    expect(painel.indicadores.pctEvitaveis).toBe(0.5);
  });

  it('o filtro por empresa e período continua valendo; a pendente entra na base e aparece à parte', () => {
    const doMes = calcularPainelNc(TODAS, { dataInicio: '2026-10-04', dataFim: '2026-10-31', ano: 2026, empresa: 'Alinare' }, listas, '2026-11-09');
    expect(doMes.indicadores.registradas).toBe(2);
    expect(doMes.indicadores.pendentes).toBe(1);
  });
});

describe('painel de registros antigos continua como antes', () => {
  it('só registros antigos: mesmos totais, sem linha de registro novo', () => {
    const antigo = calcularPainelNc([A, D], FILTRO_2026, listas, '2026-11-09');
    expect(antigo.indicadores.registradas).toBe(2);
    expect(antigo.porOrigem.find((l) => l.valor === SEM_ORIGEM_ANTIGA)).toBeUndefined();
    expect(antigo.porOrigem.find((l) => l.valor === 'Erro expedição – endereço incorreto')?.qtd).toBe(1);
    expect(antigo.indicadores.pctEvitaveis).toBe(0.5);
  });
});

describe('lista: filtros pelos campos novos e pelos antigos', () => {
  it('filtra por tipo do problema, inclusive registro sem origem antiga', () => {
    expect(filtrarNcs(TODAS, { ...SEM_FILTROS_NC, tipo: 'Endereço incorreto' }).map((n) => n.codigo)).toEqual(['NC-2001', 'NC-2002']);
  });

  it('filtra por causador', () => {
    expect(filtrarNcs(TODAS, { ...SEM_FILTROS_NC, causador: 'Comercial' }).map((n) => n.codigo)).toEqual(['NC-2002']);
  });

  it('filtra pela origem antiga e não mistura com o registro novo', () => {
    expect(filtrarNcs(TODAS, { ...SEM_FILTROS_NC, origem: 'Outro' }).map((n) => n.codigo)).toEqual(['NC-2004']);
  });

  it('"só sem tipo ou causador" mostra as pendentes de classificação', () => {
    expect(filtrarNcs(TODAS, { ...SEM_FILTROS_NC, pendente: true }).map((n) => n.codigo)).toEqual(['NC-2003']);
  });

  it('busca encontra o registro novo pelo cliente', () => {
    expect(filtrarNcs(TODAS, { ...SEM_FILTROS_NC, busca: 'loja nova' }).map((n) => n.codigo)).toEqual(['NC-2002']);
  });
});

describe('planilha e relatório mensal', () => {
  it('a planilha antiga mantém as 36 colunas e a ordem; registro novo não ganha origem inventada', () => {
    expect(COLUNAS_REGISTRO_NC).toHaveLength(36);
    const ws = montarPlanilhaNc([B]).Sheets['REGISTRO_NC'];
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    const cabecalho = linhas[0] as string[];
    expect(cabecalho).toEqual([...COLUNAS_REGISTRO_NC.map((c) => c.cabecalho), 'Reversas geradas']);
    const linha = linhas[1] as unknown[];
    expect(String(linha[cabecalho.indexOf('Origem da não conformidade')] ?? '')).toBe('');
    expect(String(linha[cabecalho.indexOf('Área responsável')] ?? '')).toBe('');
  });

  it('o relatório mensal traz o tipo, o causador e a situação do custo do registro novo', () => {
    const wb = montarRelatorioMensalNc([A, B], '2026-10');
    const detalhes = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Registros do mês']);
    const novo = detalhes.find((linha) => linha['Código NC'] === 'NC-2002');
    // Frete e multa estão em branco: o total é parcial, e isso aparece na situação do custo
    expect(novo).toMatchObject({ 'Tipo do problema': 'Endereço incorreto', 'Origem / causador': 'Comercial', 'Situação do custo': 'Sim (parcial)' });
    expect(String(novo?.['Origem'] ?? '')).toBe('');
    const resumo = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Resumo por empresa']);
    expect(resumo[0]['NCs registradas']).toBe(2);
  });
});
