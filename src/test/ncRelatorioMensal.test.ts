import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { calcularPainelNc, codigoNc, custoLiquido, custoTotal } from '../lib/ncCalculos';
import { COLUNAS_REGISTRO_NC, montarPlanilhaNc } from '../lib/ncPlanilha';
import {
  COLUNAS_DETALHE_RELATORIO,
  COLUNAS_RESUMO_RELATORIO,
  montarRelatorioMensalNc,
} from '../lib/ncRelatorioMensal';
import type { ListasNc, NaoConformidade } from '../types';

/** Cabeçalho anterior do relatório (colunas A a M), como estava no layout de origem. */
const CABECALHO_A_M_ANTERIOR = [
  'Código NC', 'Data da ocorrência', 'Empresa', 'Cliente', 'Origem', 'Status',
  'Custo do produto (R$)', 'Frete adicional (R$)', 'Multa / outros (R$)', 'Custo total registrado (R$)',
  'Reembolso Correios (R$)', 'Custo líquido registrado (R$)', 'Reversas vinculadas',
];

const listas: ListasNc = {
  origens: [
    { nome: 'Erro expedição – endereço incorreto', area: 'Expedição', evitavel: 'Sim', ordem: 1, ativo: true },
    { nome: 'Outro', area: 'A definir', evitavel: 'A avaliar', ordem: 2, ativo: true },
  ],
  itens: [
    { lista: 'empresa', valor: 'Alinare', ordem: 1, ativo: true },
    { lista: 'empresa', valor: 'Novitah', ordem: 2, ativo: true },
    { lista: 'area', valor: 'Expedição', ordem: 1, ativo: true },
    { lista: 'area', valor: 'A definir', ordem: 2, ativo: true },
  ],
};

/** NC com os campos calculados como o banco calcula (custo total, líquido). */
function nc(numero: number, extras: Partial<NaoConformidade>): NaoConformidade {
  const base: NaoConformidade = {
    id: `00000000-0000-4000-8000-${String(numero).padStart(12, '0')}`, numero, codigo: codigoNc(numero),
    created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', importada: false,
    data_ocorrencia: '2026-10-03', data_identificacao: null, empresa: 'Alinare', cliente: null, vendedora: null,
    romaneio: null, valor_romaneio: null, nf: null, rastreio: null, data_postagem: null, tipo_saida: 'Venda',
    origem: null, como_identificada: null, status_correios: null, descricao: null, resolucao: null, novo_rastreio: null,
    valor_declarado: null, valor_venda: null, frete_original: null, custo_produto: null, custo_frete_adicional: null,
    custo_multa_outros: null, reembolso_correios: null, numero_pi: null, valor_reembolsado: null, tempo_tratativa_min: null,
    status: 'Aberta', data_encerramento: null, tipo_problema: null, causador: null, area_registro: null, area_tratativa: null,
    custo_situacao: null, custo_total: null, custo_liquido: null, area_responsavel: null, evitavel: null, dias_em_aberto: null,
    qtd_reversas: 0,
    ...extras,
  };
  return { ...base, custo_total: custoTotal(base), custo_liquido: custoLiquido(base) };
}

// Fixtures conhecidas (fictícias). Esperado na tabela de testes abaixo.
const R1 = nc(1, {
  origem: 'Erro expedição – endereço incorreto', cliente: 'Ateliê Aurora', status: 'Em tratativa', data_ocorrencia: '2026-10-03',
  custo_produto: 100, custo_frete_adicional: 40, custo_multa_outros: 0, valor_reembolsado: 20, custo_situacao: 'Sim',
  tipo_problema: 'Endereço incorreto', causador: 'Expedição', qtd_reversas: 1, evitavel: 'Sim', area_responsavel: 'Expedição',
});
const R2 = nc(2, {
  cliente: 'Casa Azul', status: 'Encerrada', data_ocorrencia: '2026-10-05', custo_produto: 0, custo_frete_adicional: 0,
  custo_situacao: 'Não', tipo_problema: 'Extravio', causador: 'Correios',
});
const R3 = nc(3, {
  cliente: 'Loja Verde', status: 'Aberta', data_ocorrencia: '2026-10-07', custo_situacao: 'Em apuração',
  tipo_problema: null, causador: 'Comercial',
});
const R4 = nc(4, {
  empresa: 'Novitah', origem: 'Outro', cliente: 'Boutique Lia', status: null, data_ocorrencia: '2026-10-09',
  tipo_problema: 'Outro', causador: 'A apurar', evitavel: 'A avaliar', area_responsavel: 'A definir',
});
const R5 = nc(5, {
  empresa: 'Novitah', cliente: 'Moda Sul', status: 'Aberta', data_ocorrencia: '2026-10-12', custo_produto: 0, custo_frete_adicional: 40,
  custo_situacao: 'Sim', tipo_problema: 'Atraso de postagem', causador: 'Expedição',
});
const FORA_DO_MES = nc(6, { cliente: 'Fora', data_ocorrencia: '2026-09-30', custo_produto: 999, custo_situacao: 'Sim' });
const TODAS = [R1, R2, R3, R4, R5, FORA_DO_MES];

/** Valor de uma célula como texto ('' para vazio), para comparar sem depender do tipo guardado. */
const texto = (v: unknown) => (v === undefined || v === null ? '' : String(v));

function linhasDoDetalhe(wb: XLSX.WorkBook): string[][] {
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Registros do mês'], { header: 1 }) as unknown[][];
  return linhas.slice(1).map((linha) => Array.from({ length: COLUNAS_DETALHE_RELATORIO.length }, (_, i) => texto(linha[i])));
}

describe('relatório mensal: posições das colunas A a M e acréscimo ao final', () => {
  const wb = montarRelatorioMensalNc(TODAS, '2026-10');
  const cabecalho = (XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Registros do mês'], { header: 1 })[0]) as string[];

  it('A a M têm o cabeçalho anterior, na mesma ordem e nas mesmas letras', () => {
    expect(cabecalho.slice(0, 13)).toEqual(CABECALHO_A_M_ANTERIOR);
    expect(XLSX.utils.encode_col(cabecalho.indexOf('Status'))).toBe('F');
    expect(XLSX.utils.encode_col(cabecalho.indexOf('Custo total registrado (R$)'))).toBe('J');
    expect(XLSX.utils.encode_col(cabecalho.indexOf('Reversas vinculadas'))).toBe('M');
  });

  it('as três colunas novas vêm somente depois de M: N, O e P', () => {
    expect(cabecalho.slice(13)).toEqual(['Tipo do problema', 'Origem / causador', 'Situação do custo']);
    expect(cabecalho).toEqual([...COLUNAS_DETALHE_RELATORIO]);
  });

  it('a aba de resumo mantém as oito colunas anteriores em A–H e acrescenta as demais ao final', () => {
    const resumoCabecalho = (XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Resumo por empresa'], { header: 1 })[0]) as string[];
    expect(resumoCabecalho.slice(0, 8)).toEqual([
      'Empresa', 'Mês', 'NCs registradas', 'Reversas vinculadas', 'NCs com custo informado',
      'Custo total registrado (R$)', 'Reembolso registrado (R$)', 'Custo líquido registrado (R$)',
    ]);
    expect(resumoCabecalho).toEqual([...COLUNAS_RESUMO_RELATORIO]);
  });

  it('a terceira aba é "Definições", por último', () => {
    expect(wb.SheetNames).toEqual(['Resumo por empresa', 'Registros do mês', 'Definições']);
  });
});

describe('relatório mensal: valores conhecidos por linha', () => {
  const linhas = linhasDoDetalhe(montarRelatorioMensalNc(TODAS, '2026-10'));

  it('ordena por empresa e data e deixa de fora o mês errado', () => {
    expect(linhas.map((l) => l[0])).toEqual(['NC-0001', 'NC-0002', 'NC-0003', 'NC-0004', 'NC-0005']);
  });

  it('NC com valor e reembolso: total, reembolso, líquido e situação completa', () => {
    expect(linhas[0]).toEqual([
      'NC-0001', '03/10/2026', 'Alinare', 'Ateliê Aurora', 'Erro expedição – endereço incorreto', 'Em tratativa',
      '100', '40', '0', '140', '20', '120', '1', 'Endereço incorreto', 'Expedição', 'Sim',
    ]);
  });

  it('"Não" com zeros gravados: zero continua zero nas colunas de valor; situação "Não"', () => {
    expect(linhas[1]).toEqual([
      'NC-0002', '05/10/2026', 'Alinare', 'Casa Azul', '', 'Encerrada',
      '0', '0', '', '0', '', '0', '0', 'Extravio', 'Correios', 'Não',
    ]);
  });

  it('"Em apuração" sem valor: colunas de valor em branco (não zero); situação diz "a apurar"', () => {
    expect(linhas[2]).toEqual([
      'NC-0003', '07/10/2026', 'Alinare', 'Loja Verde', '', 'Aberta',
      '', '', '', '', '', '', '0', 'Não informado', 'Comercial', 'Em apuração (a apurar)',
    ]);
  });

  it('registro antigo sem situação: "Não informado" e classificação herdada da origem', () => {
    expect(linhas[3]).toEqual([
      'NC-0004', '09/10/2026', 'Novitah', 'Boutique Lia', 'Outro', '',
      '', '', '', '', '', '', '0', 'Outro', 'A apurar', 'Não informado',
    ]);
  });

  it('total com campo em branco aparece como parcial na situação; zero digitado conta como zero', () => {
    expect(linhas[4]).toEqual([
      'NC-0005', '12/10/2026', 'Novitah', 'Moda Sul', '', 'Aberta',
      '0', '40', '', '40', '', '40', '0', 'Atraso de postagem', 'Expedição', 'Sim (parcial)',
    ]);
  });
});

describe('relatório mensal: resumo por empresa e definições', () => {
  const wb = montarRelatorioMensalNc(TODAS, '2026-10');
  const resumo = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Resumo por empresa']);
  const alinare = resumo.find((r) => r['Empresa'] === 'Alinare')!;
  const novitah = resumo.find((r) => r['Empresa'] === 'Novitah')!;

  it('Alinare: registradas, classificadas, pendentes e cobertura do custo', () => {
    expect(alinare).toMatchObject({
      'NCs registradas': 3, 'Reversas vinculadas': 1, 'NCs com custo informado': 1,
      'Custo total registrado (R$)': 140, 'Reembolso registrado (R$)': 20, 'Custo líquido registrado (R$)': 120,
      'NCs classificadas': 2, 'NCs pendentes de classificação': 1,
      'NCs sem custo (Não)': 1, 'NCs valor não informado (Sim)': 0, 'NCs a apurar (Em apuração sem valor)': 1,
      'NCs sem situação e sem valor': 0, 'NCs com total parcial': 0, 'NCs com reembolso informado': 1,
    });
  });

  it('Novitah: reembolso sem informação fica em branco, não zero; parcial e sem situação contados', () => {
    expect(novitah).toMatchObject({
      'NCs registradas': 2, 'NCs com custo informado': 1, 'Custo total registrado (R$)': 40,
      'Reembolso registrado (R$)': '', 'Custo líquido registrado (R$)': 40,
      'NCs classificadas': 2, 'NCs pendentes de classificação': 0,
      'NCs sem custo (Não)': 0, 'NCs sem situação e sem valor': 1, 'NCs com total parcial': 1, 'NCs com reembolso informado': 0,
    });
  });

  it('cobertura do relatório soma o total de registradas em cada empresa', () => {
    for (const linha of [alinare, novitah]) {
      const soma = Number(linha['NCs sem custo (Não)']) + Number(linha['NCs valor não informado (Sim)'])
        + Number(linha['NCs a apurar (Em apuração sem valor)']) + Number(linha['NCs sem situação e sem valor'])
        + Number(linha['NCs com custo informado']);
      expect(soma).toBe(linha['NCs registradas']);
    }
  });

  it('definições explicam a mudança de "NCs com custo informado" e as três colunas novas', () => {
    const definicoes = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Definições']);
    expect(definicoes.find((d) => d['Termo'] === 'Mudança nesta versão')?.['Definição']).toMatch(/Não" com zero digitado/);
    expect(definicoes.find((d) => d['Termo'] === 'Colunas A a M')?.['Definição']).toMatch(/N a P/);
  });

  it('mês sem NC: resumo e detalhe com o cabeçalho completo', () => {
    const vazio = montarRelatorioMensalNc(TODAS, '2026-11');
    const cabecalhoResumo = (XLSX.utils.sheet_to_json<unknown[]>(vazio.Sheets['Resumo por empresa'], { header: 1 })[0]) as string[];
    const cabecalhoDetalhe = (XLSX.utils.sheet_to_json<unknown[]>(vazio.Sheets['Registros do mês'], { header: 1 })[0]) as string[];
    expect(cabecalhoResumo).toEqual([...COLUNAS_RESUMO_RELATORIO]);
    expect(cabecalhoDetalhe).toEqual([...COLUNAS_DETALHE_RELATORIO]);
  });
});

describe('relatório e painel: mesma base, números que batem', () => {
  const wb = montarRelatorioMensalNc(TODAS, '2026-10');
  const resumo = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Resumo por empresa']);
  const soma = (coluna: string) => resumo.reduce((t, r) => t + (typeof r[coluna] === 'number' ? (r[coluna] as number) : 0), 0);
  const painel = calcularPainelNc(TODAS, { dataInicio: '2026-10-01', dataFim: '2026-10-31', ano: 2026, empresa: null }, listas, '2026-11-09');
  const i = painel.indicadores;

  it('registradas, classificadas e pendentes batem com o painel', () => {
    expect(soma('NCs registradas')).toBe(i.registradas);
    expect(soma('NCs classificadas')).toBe(i.classificadas);
    expect(soma('NCs pendentes de classificação')).toBe(i.pendentes);
    expect([i.registradas, i.classificadas, i.pendentes]).toEqual([5, 4, 1]);
  });

  it('custo total, reembolso e líquido batem com o painel', () => {
    expect(soma('Custo total registrado (R$)')).toBe(i.custoTotal);
    expect(soma('Reembolso registrado (R$)')).toBe(i.valorReembolsado);
    expect(soma('Custo líquido registrado (R$)')).toBe(i.custoLiquido);
  });

  it('cobertura do custo bate categoria por categoria', () => {
    expect(soma('NCs sem custo (Não)')).toBe(i.cobertura.semCusto);
    expect(soma('NCs com custo informado')).toBe(i.cobertura.comValor);
    expect(soma('NCs valor não informado (Sim)')).toBe(i.cobertura.valorNaoInformado);
    expect(soma('NCs a apurar (Em apuração sem valor)')).toBe(i.cobertura.aApurar);
    expect(soma('NCs sem situação e sem valor')).toBe(i.cobertura.semSituacaoSemValor);
    expect(soma('NCs com total parcial')).toBe(i.cobertura.parciais);
    expect(soma('NCs com reembolso informado')).toBe(i.cobertura.reembolsoInformado);
  });
});

describe('exportação REGISTRO_NC: 36 colunas do layout e uma coluna adicional', () => {
  it('a planilha continua com as 36 colunas do layout e "Reversas geradas" no fim', () => {
    expect(COLUNAS_REGISTRO_NC).toHaveLength(36);
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(montarPlanilhaNc([R1]).Sheets['REGISTRO_NC'], { header: 1 }) as unknown[][];
    const cabecalho = linhas[0] as string[];
    expect(cabecalho).toHaveLength(37);
    expect(cabecalho.slice(0, 36)).toEqual(COLUNAS_REGISTRO_NC.map((c) => c.cabecalho));
    expect(cabecalho[36]).toBe('Reversas geradas');
  });
});
