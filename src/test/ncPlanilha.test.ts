import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { COLUNAS_REGISTRO_NC, lerPlanilhaNc, montarPlanilhaNc, resumirImportacao, validarContraListas } from '../lib/ncPlanilha';
import type { ListasNc, NaoConformidade } from '../types';

const CABECALHO = COLUNAS_REGISTRO_NC.map((c) => c.cabecalho);

/** Monta uma REGISTRO_NC no layout da planilha: título nas linhas 1–3 e cabeçalho na linha 4. */
function planilha(linhas: Record<string, unknown>[], cabecalho = CABECALHO, aba = 'REGISTRO_NC'): ArrayBuffer {
  const aoa: unknown[][] = [
    ['Análise de não conformidades — Expedição'],
    ['Registrar toda não conformidade (com ou sem reverso), uma linha por ocorrência.'],
    ['IDENTIFICAÇÃO'],
    cabecalho,
    ...linhas.map((valores) => cabecalho.map((h) => valores[h] ?? '')),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, aba);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

const listas: ListasNc = {
  origens: [{ nome: 'Extravio Correios', area: 'Correios', evitavel: 'Não', ordem: 1, ativo: true }],
  itens: [
    { lista: 'empresa', valor: 'Alinare', ordem: 1, ativo: true },
    { lista: 'resolucao', valor: 'Reverso', ordem: 1, ativo: true },
  ],
};

describe('leitura da REGISTRO_NC', () => {
  it('a planilha tem 36 colunas', () => {
    expect(COLUNAS_REGISTRO_NC).toHaveLength(36);
  });

  it('lê datas seriais, valores em reais, status e linha do tempo; mantém o ID da planilha', () => {
    const { registros, problemas } = lerPlanilhaNc(planilha([
      {
        ID: 'NC-0001',
        'Data da ocorrência': 45757, // 10/04/2025 (número serial do Excel)
        'Empresa / contrato': 'Alinare',
        Cliente: '  Cliente Um  ',
        'Origem da não conformidade': 'Extravio Correios',
        'Custo — produto': 120.5,
        'Valor reembolsado': 'R$ 1.234,56',
        'Tempo de tratativa (min)': 45,
        'Status da NC': 'em tratativa',
        'Linha do tempo': '10/04 cliente avisada',
        // Calculadas na planilha: ignoradas na importação
        'Área responsável': 'Correios',
        'Custo total': 120.5,
      },
    ]));

    expect(problemas).toEqual([]);
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      numero: 1,
      linha: 5,
      data_ocorrencia: '2025-04-10',
      empresa: 'Alinare',
      cliente: 'Cliente Um',
      origem: 'Extravio Correios',
      custo_produto: 120.5,
      valor_reembolsado: 1234.56,
      tempo_tratativa_min: 45,
      status: 'Em tratativa',
      linha_do_tempo: '10/04 cliente avisada',
      data_identificacao: null,
      resolucao: null,
    });
    expect(registros[0]).not.toHaveProperty('custo_total');
  });

  it('ignora linhas vazias e numera pela linha quando o ID não vem preenchido', () => {
    const { registros } = lerPlanilhaNc(planilha([
      { 'Data da ocorrência': '10/04/2025', 'Origem da não conformidade': 'Extravio Correios' },
      {},
      { 'Data da ocorrência': '2025-04-12', 'Origem da não conformidade': 'Extravio Correios' },
    ]));
    expect(registros.map((r) => [r.numero, r.data_ocorrencia])).toEqual([[1, '2025-04-10'], [3, '2025-04-12']]);
  });

  it('aponta data, valor e status inválidos por linha', () => {
    const { registros, problemas } = lerPlanilhaNc(planilha([
      {
        ID: 'NC-0003',
        'Data da ocorrência': '31/02/2025',
        'Origem da não conformidade': 'Extravio Correios',
        'Valor da venda': 'abc',
        'Status da NC': 'Pendente',
      },
    ]));
    expect(registros).toHaveLength(1);
    expect(problemas.map((p) => [p.linha, p.campo])).toEqual([
      [5, 'Data da ocorrência'],
      [5, 'Valor da venda'],
      [5, 'Status da NC'],
    ]);
  });

  it('aceita cabeçalho com hífen no lugar do travessão', () => {
    const cabecalho = CABECALHO.map((h) => h.replace('—', '-'));
    const { registros } = lerPlanilhaNc(planilha([
      { 'Data da ocorrência': 45757, 'Origem da não conformidade': 'Extravio Correios', 'Custo - produto': 10 },
    ], cabecalho));
    expect(registros[0].custo_produto).toBe(10);
  });

  it('recusa arquivo sem a aba REGISTRO_NC', () => {
    expect(() => lerPlanilhaNc(planilha([], CABECALHO, 'Outra'))).toThrow('REGISTRO_NC');
  });

  it('confere empresa, listas e origem contra as listas do sistema', () => {
    const { registros } = lerPlanilhaNc(planilha([
      { 'Data da ocorrência': 45757, 'Empresa / contrato': 'Empresa X', 'Origem da não conformidade': 'Origem nova', Resolução: 'Reverso' },
    ]));
    expect(validarContraListas(registros, listas).map((p) => p.campo)).toEqual([
      'Empresa / contrato',
      'Origem da não conformidade',
    ]);
  });
});

describe('resumo da importação', () => {
  const leitura = lerPlanilhaNc(planilha([
    { ID: 'NC-0001', 'Data da ocorrência': 45757, 'Origem da não conformidade': 'Extravio Correios' },
    { ID: 'NC-0002', 'Data da ocorrência': 45757, 'Origem da não conformidade': 'Extravio Correios' },
    { ID: 'NC-0026', 'Data da ocorrência': 45757, 'Origem da não conformidade': 'Extravio Correios' },
    { ID: 'NC-0027', 'Data da ocorrência': '31/02/2025', 'Origem da não conformidade': 'Extravio Correios' },
    { ID: 'NC-0028', 'Data da ocorrência': 45757 },
    { ID: 'NC-0028', 'Data da ocorrência': 45757, 'Origem da não conformidade': 'Extravio Correios' },
  ]));

  it('separa novas, já importadas, conflitos e linhas com problema', () => {
    // NC-0001 veio de importação anterior; NC-0026 foi registrada no sistema (outra ocorrência)
    const resumo = resumirImportacao(leitura, [
      { numero: 1, importada: true },
      { numero: 26, importada: false },
    ]);
    expect(resumo.novas.map((r) => r.numero)).toEqual([2, 28]);
    expect(resumo.jaImportadas).toBe(1);
    expect(resumo.comProblema).toBe(1);
    expect(resumo.semOrigem).toBe(1);
    expect(resumo.conflitos.map((c) => [c.linha, c.mensagem])).toEqual([
      [7, 'NC-0026 já foi usado por uma NC registrada no sistema'],
      [10, 'NC-0028 repetido (já aparece na linha 9)'],
    ]);
  });

  it('sem NCs gravadas, tudo que não tem problema entra', () => {
    const resumo = resumirImportacao(leitura, []);
    expect(resumo.novas.map((r) => r.numero)).toEqual([1, 2, 26, 28]);
    expect(resumo.conflitos).toHaveLength(1);
  });
});

describe('exportação no layout da REGISTRO_NC', () => {
  it('36 colunas da planilha + reversas geradas; datas em dd/mm/aaaa', () => {
    const nc = {
      id: '1', numero: 7, codigo: 'NC-0007', created_at: '', updated_at: '', importada: false,
      data_ocorrencia: '2026-10-01', data_identificacao: '2026-10-05', empresa: 'Alinare', cliente: 'Cliente',
      vendedora: null, romaneio: null, valor_romaneio: null, nf: null, rastreio: null, data_postagem: null,
      tipo_saida: 'Venda', origem: 'Extravio Correios', como_identificada: null, status_correios: null, descricao: null,
      resolucao: 'Reverso', novo_rastreio: null, valor_declarado: null, valor_venda: null, frete_original: null,
      custo_produto: 10, custo_frete_adicional: 5.5, custo_multa_outros: null, reembolso_correios: 'Não', numero_pi: null,
      valor_reembolsado: 3, tempo_tratativa_min: 30, status: 'Encerrada', data_encerramento: '2026-10-10',
      custo_total: 15.5, custo_liquido: 12.5, area_responsavel: 'Correios', evitavel: 'Não', dias_em_aberto: 5, qtd_reversas: 2,
    } as NaoConformidade;

    const wb = montarPlanilhaNc([nc], '2026-10-20');
    const [cabecalho, linha] = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['REGISTRO_NC'], { header: 1 });
    expect(cabecalho).toEqual([...CABECALHO, 'Reversas geradas']);

    const valor = (coluna: string) => linha[(cabecalho as string[]).indexOf(coluna)];
    expect(valor('ID')).toBe('NC-0007');
    expect(valor('Data da ocorrência')).toBe('01/10/2026');
    expect(valor('Área responsável')).toBe('Correios');
    expect(valor('Custo total')).toBe(15.5);
    expect(valor('Custo líquido')).toBe(12.5);
    expect(valor('Dias em aberto')).toBe(5);
    expect(valor('Reversas geradas')).toBe(2);
  });
});
