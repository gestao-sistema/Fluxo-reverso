import type { FiltrosRelatorio, LinhaRelatorioReversa } from '../types';
import { CAMPO_DATA_RELATORIO_LABEL } from '../types';

/** Remove caracteres de controle, preservando tabulação, quebra de linha e retorno de carro. */
function removerControles(texto: string): string {
  let saida = '';
  for (const caractere of texto) {
    const codigo = caractere.charCodeAt(0);
    const remover = codigo <= 8 || codigo === 11 || codigo === 12 || (codigo >= 14 && codigo <= 31) || codigo === 127;
    if (!remover) saida += caractere;
  }
  return saida;
}

/**
 * Neutraliza células que uma planilha interpretaria como fórmula (=, +, -, @, tab, CR)
 * e remove caracteres de controle. O texto continua legível; só ganha um apóstrofo inicial.
 */
export function celulaSegura<T>(valor: T): T | string {
  if (typeof valor !== 'string') return valor;
  const limpo = removerControles(valor);
  return /^[=+\-@\t\r]/.test(limpo) ? `'${limpo}` : limpo;
}

/** Aplica celulaSegura a todos os valores de texto de uma linha. */
export function linhaSegura<T extends Record<string, unknown>>(linha: T): T {
  return Object.fromEntries(Object.entries(linha).map(([chave, valor]) => [chave, celulaSegura(valor)])) as T;
}

/** AAAA-MM-DD → DD/MM/AAAA, sem conversão de fuso (a data do banco é uma data de calendário). */
export function dataLegivel(valor: string | null | undefined): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor ?? '');
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : '';
}

const SIM_NAO = (valor: boolean) => (valor ? 'Sim' : 'Não');

/** Somente as colunas de gestão: nada de cliente, endereço, solicitante, rastreio ou anotações. */
export function linhasParaPlanilha(linhas: LinhaRelatorioReversa[]): Array<Record<string, string | number>> {
  return linhas.map((linha) => linhaSegura({
    'Pedido': linha.pedido,
    'Empresa': linha.empresa,
    'Setor': linha.setor,
    'Data da solicitação': dataLegivel(linha.data_solicitacao),
    'Motivo': linha.motivo,
    'Situação da aprovação': linha.situacao_aprovacao,
    'Data da decisão': dataLegivel(linha.decisao_em),
    'Situação logística': linha.situacao_logistica,
    'Emissões': linha.emissoes,
    'Reemissões': linha.reemissoes,
    'Última emissão': dataLegivel(linha.ultima_emissao_em),
    'Validade da etiqueta vigente': dataLegivel(linha.valida_ate),
    'Postagem confirmada em': dataLegivel(linha.postagem_confirmada_em),
    'Etiqueta vencida sem postagem confirmada': SIM_NAO(linha.etiqueta_vencida_sem_postagem_confirmada),
    'Recebimento confirmado manualmente em': dataLegivel(linha.recebimento_confirmado_manualmente_em),
  }));
}

/** Descrição do recorte, para a primeira aba e para a tela. */
export function descricaoDoFiltro(filtros: FiltrosRelatorio): string {
  const periodo = filtros.inicio || filtros.fim
    ? `${filtros.inicio ? `de ${dataLegivel(filtros.inicio)}` : 'desde o início'} ${filtros.fim ? `até ${dataLegivel(filtros.fim)}` : 'sem data final'}`
    : 'todo o período';
  const empresa = filtros.empresa === 'Ambas' ? 'Todas as empresas' : filtros.empresa;
  return `${empresa} · ${CAMPO_DATA_RELATORIO_LABEL[filtros.campoData]} · ${periodo}`;
}

export function nomeArquivoRelatorio(filtros: FiltrosRelatorio, hoje = new Date()): string {
  const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  return `relatorio_reversa_${filtros.empresa === 'Ambas' ? 'todas' : filtros.empresa.toLowerCase()}_${filtros.campoData}_${dia}.xlsx`;
}
