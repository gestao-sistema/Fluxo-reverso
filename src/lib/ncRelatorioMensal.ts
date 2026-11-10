// ── Relatório mensal por empresa (exportação) ────────────────────────────────
// Não é a planilha REGISTRO_NC (36 colunas do layout de importação e exportação).
// Aba "Registros do mês": as colunas A a M mantêm o layout anterior, nas mesmas letras;
// as três colunas novas vêm só depois, de N a P. Aba "Resumo por empresa": as oito colunas
// anteriores, e ao final a classificação e a cobertura do custo. Aba "Definições", por último.
// ─────────────────────────────────────────────────────────────────────────────

import * as XLSX from 'xlsx';
import { custoLiquido, custoTotal, formatarDataBr } from './ncCalculos';
import { classificacaoPendente } from './ncClassificacao';
import { cobrirCusto, descreverCusto, somarCusto } from './ncCustos';
import type { NaoConformidade } from '../types';

/** Aba de registros: A–M são o layout anterior; N–P foram acrescentadas ao final. */
export const COLUNAS_DETALHE_RELATORIO = [
  'Código NC', 'Data da ocorrência', 'Empresa', 'Cliente', 'Origem', 'Status',
  'Custo do produto (R$)', 'Frete adicional (R$)', 'Multa / outros (R$)', 'Custo total registrado (R$)',
  'Reembolso Correios (R$)', 'Custo líquido registrado (R$)', 'Reversas vinculadas',
  'Tipo do problema', 'Origem / causador', 'Situação do custo',
] as const;

/** Aba de resumo: as oito colunas anteriores (A–H); depois as acrescentadas (I–P). */
export const COLUNAS_RESUMO_RELATORIO = [
  'Empresa', 'Mês', 'NCs registradas', 'Reversas vinculadas', 'NCs com custo informado',
  'Custo total registrado (R$)', 'Reembolso registrado (R$)', 'Custo líquido registrado (R$)',
  'NCs classificadas', 'NCs pendentes de classificação', 'NCs sem custo (Não)',
  'NCs valor não informado (Sim)', 'NCs a apurar (Em apuração sem valor)', 'NCs sem situação e sem valor',
  'NCs com total parcial', 'NCs com reembolso informado',
] as const;

const DEFINICOES: Array<{ Termo: string; Definição: string }> = [
  { Termo: 'NCs registradas', Definição: 'Todas as NCs com data da ocorrência no mês (e na empresa, se filtrada). Inclui as pendentes de classificação.' },
  { Termo: 'NCs classificadas', Definição: 'Têm tipo do problema e origem / causador informados.' },
  { Termo: 'NCs pendentes de classificação', Definição: 'Falta o tipo do problema ou a origem / causador. Continuam na contagem de registradas.' },
  { Termo: 'Sem custo (Não)', Definição: 'Situação "Não". Os valores gravados ficam como estão e não entram em custo informado.' },
  { Termo: 'NCs com custo informado', Definição: 'Situação "Sim" ou "Em apuração" com algum valor de custo, ou situação ausente com valor.' },
  { Termo: 'Valor não informado', Definição: 'Situação "Sim" sem nenhum valor. Na coluna "Situação do custo" aparece como "Sim (valor não informado)".' },
  { Termo: 'A apurar', Definição: 'Situação "Em apuração" sem nenhum valor. Na coluna "Situação do custo" aparece como "Em apuração (a apurar)".' },
  { Termo: 'Situação não informada', Definição: 'Sem situação do custo. Na coluna "Situação do custo" aparece como "Não informado".' },
  { Termo: 'Total parcial', Definição: 'Total com algum dos três campos de custo em branco. Na coluna "Situação do custo" aparece com "(parcial)".' },
  { Termo: 'Vazio e zero', Definição: 'Campo em branco não foi informado (não é zero). Zero digitado é zero informado.' },
  { Termo: 'Reembolso', Definição: 'Em branco = não informado. Custo líquido = custo total − reembolso; reembolso em branco conta como zero na conta, mas não comprova ausência de reembolso.' },
  { Termo: 'Mudança nesta versão', Definição: '"NCs com custo informado" deixou de contar "Não" com zero digitado. O total de custo não muda para as NCs com valor.' },
  { Termo: 'Colunas A a M', Definição: 'Mantêm o layout anterior, nas mesmas letras. As colunas N a P foram acrescentadas ao final.' },
  { Termo: 'Esta planilha', Definição: 'Não é a REGISTRO_NC (36 colunas do layout de importação e exportação).' },
];

function nomeMes(mes: string): string {
  const [ano, numero] = mes.split('-').map(Number);
  if (!ano || !numero) return mes;
  return new Date(ano, numero - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export function montarRelatorioMensalNc(ncs: NaoConformidade[], mes: string, empresa?: string): XLSX.WorkBook {
  const registros = ncs
    .filter((nc) => (nc.data_ocorrencia ?? '').startsWith(mes) && (!empresa || nc.empresa === empresa))
    .sort((a, b) => (a.empresa ?? '').localeCompare(b.empresa ?? '') || (a.data_ocorrencia ?? '').localeCompare(b.data_ocorrencia ?? '') || a.numero - b.numero);
  const empresas = [...new Set(registros.map((nc) => nc.empresa ?? 'Não informado'))].sort((a, b) => a.localeCompare(b));

  const resumo = empresas.map((nome) => {
    const grupo = registros.filter((nc) => (nc.empresa ?? 'Não informado') === nome);
    const cobertura = cobrirCusto(grupo);
    const soma = somarCusto(grupo);
    return {
      Empresa: nome,
      Mês: nomeMes(mes),
      'NCs registradas': grupo.length,
      'Reversas vinculadas': grupo.reduce((soma2, nc) => soma2 + nc.qtd_reversas, 0),
      'NCs com custo informado': soma.comValor,
      'Custo total registrado (R$)': soma.total ?? '',
      'Reembolso registrado (R$)': soma.reembolso ?? '',
      'Custo líquido registrado (R$)': soma.liquido ?? '',
      'NCs classificadas': grupo.filter((nc) => !classificacaoPendente(nc)).length,
      'NCs pendentes de classificação': grupo.filter((nc) => classificacaoPendente(nc)).length,
      'NCs sem custo (Não)': cobertura.semCusto,
      'NCs valor não informado (Sim)': cobertura.valorNaoInformado,
      'NCs a apurar (Em apuração sem valor)': cobertura.aApurar,
      'NCs sem situação e sem valor': cobertura.semSituacaoSemValor,
      'NCs com total parcial': cobertura.parciais,
      'NCs com reembolso informado': cobertura.reembolsoInformado,
    };
  });

  const detalhes = registros.map((nc) => ({
    'Código NC': nc.codigo,
    'Data da ocorrência': formatarDataBr(nc.data_ocorrencia),
    Empresa: nc.empresa ?? '',
    Cliente: nc.cliente ?? '',
    Origem: nc.origem ?? '',
    Status: nc.status ?? '',
    'Custo do produto (R$)': nc.custo_produto ?? '',
    'Frete adicional (R$)': nc.custo_frete_adicional ?? '',
    'Multa / outros (R$)': nc.custo_multa_outros ?? '',
    'Custo total registrado (R$)': custoTotal(nc) ?? '',
    'Reembolso Correios (R$)': nc.valor_reembolsado ?? '',
    'Custo líquido registrado (R$)': custoLiquido(nc) ?? '',
    'Reversas vinculadas': nc.qtd_reversas,
    'Tipo do problema': nc.tipo_problema ?? 'Não informado',
    'Origem / causador': nc.causador ?? 'Não informado',
    'Situação do custo': descreverCusto(nc.custo_situacao, nc).rotuloSituacao,
  }));

  const wb = XLSX.utils.book_new();

  const wsResumo = XLSX.utils.json_to_sheet(
    resumo.length ? resumo : [{ Empresa: '', Mês: nomeMes(mes), 'NCs registradas': 0, 'NCs com custo informado': 0 }],
    { header: [...COLUNAS_RESUMO_RELATORIO] }
  );
  wsResumo['!cols'] = COLUNAS_RESUMO_RELATORIO.map((coluna) => ({ wch: Math.min(34, Math.max(14, coluna.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo por empresa');

  const wsDetalhes = XLSX.utils.json_to_sheet(
    detalhes.length ? detalhes : [{ 'Código NC': 'Nenhuma NC neste mês' }],
    { header: [...COLUNAS_DETALHE_RELATORIO] }
  );
  wsDetalhes['!cols'] = COLUNAS_DETALHE_RELATORIO.map((coluna) => ({ wch: Math.min(30, Math.max(12, coluna.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, wsDetalhes, 'Registros do mês');

  const wsDefinicoes = XLSX.utils.json_to_sheet(DEFINICOES, { header: ['Termo', 'Definição'] });
  wsDefinicoes['!cols'] = [{ wch: 34 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wsDefinicoes, 'Definições');
  return wb;
}

export function exportarRelatorioMensalNc(ncs: NaoConformidade[], mes: string, empresa?: string): void {
  const sufixoEmpresa = empresa?.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_') || 'empresas';
  XLSX.writeFile(montarRelatorioMensalNc(ncs, mes, empresa), `relatorio_mensal_nc_${mes}_${sufixoEmpresa}.xlsx`);
}
