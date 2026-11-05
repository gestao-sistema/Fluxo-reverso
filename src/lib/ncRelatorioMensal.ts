import * as XLSX from 'xlsx';
import { custoLiquido, custoTotal, formatarDataBr } from './ncCalculos';
import type { NaoConformidade } from '../types';

const VALORES_CUSTO = ['custo_produto', 'custo_frete_adicional', 'custo_multa_outros'] as const;
type CampoCusto = (typeof VALORES_CUSTO)[number];

function somaRegistrados(ncs: NaoConformidade[], campo: CampoCusto | 'valor_reembolsado'): number | null {
  const valores = ncs.map((nc) => nc[campo]).filter((valor): valor is number => typeof valor === 'number');
  if (!valores.length) return null;
  return Math.round(valores.reduce((soma, valor) => soma + valor, 0) * 100) / 100;
}

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
    const comCusto = grupo.filter((nc) => custoTotal(nc) !== null);
    const custosLiquidos = grupo.map((nc) => custoLiquido(nc)).filter((valor): valor is number => valor !== null);
    return {
      Empresa: nome,
      Mês: nomeMes(mes),
      'NCs registradas': grupo.length,
      'Reversas vinculadas': grupo.reduce((soma, nc) => soma + nc.qtd_reversas, 0),
      'NCs com custo informado': comCusto.length,
      'Custo total registrado (R$)': comCusto.length
        ? Math.round(comCusto.reduce((soma, nc) => soma + (custoTotal(nc) ?? 0), 0) * 100) / 100
        : '',
      'Reembolso registrado (R$)': somaRegistrados(grupo, 'valor_reembolsado') ?? '',
      'Custo líquido registrado (R$)': custosLiquidos.length
        ? Math.round(custosLiquidos.reduce((soma, valor) => soma + valor, 0) * 100) / 100
        : '',
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
  }));

  const wb = XLSX.utils.book_new();
  const wsResumo = XLSX.utils.json_to_sheet(resumo.length ? resumo : [{ Empresa: '', Mês: nomeMes(mes), 'NCs registradas': 0, 'NCs com custo informado': 0, 'Custo total registrado (R$)': '', 'Reembolso registrado (R$)': '', 'Custo líquido registrado (R$)': '' }]);
  wsResumo['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 19 }, { wch: 23 }, { wch: 27 }, { wch: 24 }, { wch: 29 }];
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo por empresa');

  const wsDetalhes = XLSX.utils.json_to_sheet(detalhes.length ? detalhes : [{ 'Código NC': 'Nenhuma NC neste mês' }]);
  wsDetalhes['!cols'] = [{ wch: 14 }, { wch: 19 }, { wch: 18 }, { wch: 28 }, { wch: 36 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 23 }, { wch: 22 }, { wch: 25 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsDetalhes, 'Registros do mês');
  return wb;
}

export function exportarRelatorioMensalNc(ncs: NaoConformidade[], mes: string, empresa?: string): void {
  const sufixoEmpresa = empresa?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '_') || 'empresas';
  XLSX.writeFile(montarRelatorioMensalNc(ncs, mes, empresa), `relatorio_mensal_nc_${mes}_${sufixoEmpresa}.xlsx`);
}
