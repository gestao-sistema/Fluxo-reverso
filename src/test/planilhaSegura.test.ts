import { describe, expect, it } from 'vitest';
import {
  celulaSegura,
  dataLegivel,
  descricaoDoFiltro,
  linhaSegura,
  linhasParaPlanilha,
  nomeArquivoRelatorio,
} from '../lib/planilhaSegura';
import type { LinhaRelatorioReversa } from '../types';

const linha: LinhaRelatorioReversa = {
  pedido: 'RV-1A2B3C4D',
  empresa: 'Alinare',
  setor: 'Comercial Alinare',
  data_solicitacao: '2026-10-20',
  motivo: 'Peça com defeito',
  situacao_aprovacao: 'Aprovada',
  decisao_em: '2026-10-21',
  situacao_logistica: 'Postado',
  emissoes: 2,
  reemissoes: 1,
  ultima_emissao_em: '2026-10-25',
  valida_ate: '2026-11-25',
  postagem_confirmada_em: '2026-10-26',
  etiqueta_vencida_sem_postagem_confirmada: false,
  recebimento_confirmado_manualmente_em: null,
};

describe('planilha segura', () => {
  it('neutraliza células que seriam lidas como fórmula e mantém o texto legível', () => {
    for (const perigoso of ['=1+1', '+55 11 99999-9999', '-2+3', '@SOMA(A1)', '\tTAB', '\rCR', '=HYPERLINK("http://x","a")']) {
      const resultado = celulaSegura(perigoso) as string;
      expect(resultado.startsWith("'")).toBe(true);
      expect(resultado.slice(1)).toBe(perigoso);
    }
    expect(celulaSegura('Peça com defeito')).toBe('Peça com defeito');
    expect(celulaSegura('RV-1A2B3C4D')).toBe('RV-1A2B3C4D');
    expect(celulaSegura('Linha\ncom quebra')).toBe('Linha\ncom quebra');
    expect(celulaSegura('a\u0000b\u0007c')).toBe('abc');
    expect(celulaSegura(42)).toBe(42);
    expect(celulaSegura(null)).toBeNull();
    expect(linhaSegura({ a: '=x', b: 'ok', c: 3 })).toEqual({ a: "'=x", b: 'ok', c: 3 });
  });

  it('mostra datas de calendário sem conversão de fuso', () => {
    expect(dataLegivel('2026-10-20')).toBe('20/10/2026');
    expect(dataLegivel('2026-10-20T23:30:00-03:00')).toBe('20/10/2026');
    expect(dataLegivel(null)).toBe('');
    expect(dataLegivel('texto')).toBe('');
  });

  it('exporta somente as colunas de gestão, sem dados pessoais da cliente nem rastreio', () => {
    const [saida] = linhasParaPlanilha([linha]);
    expect(Object.keys(saida)).toEqual([
      'Pedido', 'Empresa', 'Setor', 'Data da solicitação', 'Motivo', 'Situação da aprovação', 'Data da decisão',
      'Situação logística', 'Emissões', 'Reemissões', 'Última emissão', 'Validade da etiqueta vigente',
      'Postagem confirmada em', 'Etiqueta vencida sem postagem confirmada', 'Recebimento confirmado manualmente em',
    ]);
    expect(saida['Data da solicitação']).toBe('20/10/2026');
    expect(saida['Etiqueta vencida sem postagem confirmada']).toBe('Não');
    expect(saida['Recebimento confirmado manualmente em']).toBe('');
    expect(Object.keys(saida).join(' ')).not.toMatch(/cliente|endere|rastreio|solicitante|anota/i);
  });

  it('trata texto vindo do banco que comece com fórmula', () => {
    const [saida] = linhasParaPlanilha([{ ...linha, setor: '=cmd|"/c calc"!A1', motivo: '@alerta' }]);
    expect(saida['Setor']).toBe("'=cmd|\"/c calc\"!A1");
    expect(saida['Motivo']).toBe("'@alerta");
  });

  it('descreve o recorte indicando a data filtrada e nomeia o arquivo com empresa, data e dia', () => {
    expect(descricaoDoFiltro({ empresa: 'Alinare', campoData: 'emissao', inicio: '2026-10-01', fim: '2026-10-31' }))
      .toBe('Alinare · Data de emissão da etiqueta · de 01/10/2026 até 31/10/2026');
    expect(descricaoDoFiltro({ empresa: 'Ambas', campoData: 'solicitacao' })).toBe('Todas as empresas · Data da solicitação · todo o período');
    expect(nomeArquivoRelatorio({ empresa: 'Novitah', campoData: 'postagem' }, new Date(2026, 9, 26)))
      .toBe('relatorio_reversa_novitah_postagem_2026-10-26.xlsx');
  });
});
