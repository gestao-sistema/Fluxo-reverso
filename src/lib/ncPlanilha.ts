// ── Planilha REGISTRO_NC: importação do histórico e exportação ───────────────
// Lê a aba REGISTRO_NC da planilha "Análise de não conformidades — Expedição"
// (cabeçalho na linha 4, uma ocorrência por linha) e exporta no mesmo layout.
// A leitura acontece no navegador: os dados de clientes não passam pelo repositório.
// ─────────────────────────────────────────────────────────────────────────────

import * as XLSX from 'xlsx';
import { STATUS_NC } from '../types';
import type { ListaNc, ListasNc, NaoConformidade, NcCampos, StatusNc } from '../types';
import { codigoNc, diasEmAberto, formatarDataBr, hojeIso } from './ncCalculos';

type ChaveCalculada = 'codigo' | 'area_responsavel' | 'evitavel' | 'custo_total' | 'custo_liquido' | 'dias_em_aberto';
type ChaveRegistro = keyof NcCampos | ChaveCalculada | 'linha_do_tempo';

/** As 36 colunas da REGISTRO_NC, na ordem e com o texto do cabeçalho da planilha. */
export const COLUNAS_REGISTRO_NC: { cabecalho: string; chave: ChaveRegistro }[] = [
  // Identificação
  { cabecalho: 'ID', chave: 'codigo' },
  { cabecalho: 'Data da ocorrência', chave: 'data_ocorrencia' },
  { cabecalho: 'Data de identificação', chave: 'data_identificacao' },
  { cabecalho: 'Empresa / contrato', chave: 'empresa' },
  { cabecalho: 'Cliente', chave: 'cliente' },
  { cabecalho: 'Vendedora', chave: 'vendedora' },
  { cabecalho: 'Romaneio', chave: 'romaneio' },
  { cabecalho: 'Valor do romaneio', chave: 'valor_romaneio' },
  { cabecalho: 'NF', chave: 'nf' },
  { cabecalho: 'Rastreio', chave: 'rastreio' },
  { cabecalho: 'Data de postagem', chave: 'data_postagem' },
  // Classificação
  { cabecalho: 'Tipo de saída', chave: 'tipo_saida' },
  { cabecalho: 'Origem da não conformidade', chave: 'origem' },
  { cabecalho: 'Área responsável', chave: 'area_responsavel' },
  { cabecalho: 'Evitável internamente?', chave: 'evitavel' },
  { cabecalho: 'Como foi identificada', chave: 'como_identificada' },
  // Ocorrência e resolução
  { cabecalho: 'Status no Correios', chave: 'status_correios' },
  { cabecalho: 'Descrição / observação', chave: 'descricao' },
  { cabecalho: 'Resolução', chave: 'resolucao' },
  { cabecalho: 'Novo rastreio', chave: 'novo_rastreio' },
  // Valor real
  { cabecalho: 'Valor declarado do produto', chave: 'valor_declarado' },
  { cabecalho: 'Valor da venda', chave: 'valor_venda' },
  { cabecalho: 'Frete original', chave: 'frete_original' },
  // Custo da não conformidade
  { cabecalho: 'Custo — produto', chave: 'custo_produto' },
  { cabecalho: 'Custo — frete adicional (reenvio / reverso)', chave: 'custo_frete_adicional' },
  { cabecalho: 'Custo — multa / outros', chave: 'custo_multa_outros' },
  { cabecalho: 'Custo total', chave: 'custo_total' },
  { cabecalho: 'Reembolso Correios?', chave: 'reembolso_correios' },
  { cabecalho: 'Nº do pedido de indenização (PI)', chave: 'numero_pi' },
  { cabecalho: 'Valor reembolsado', chave: 'valor_reembolsado' },
  { cabecalho: 'Custo líquido', chave: 'custo_liquido' },
  // Esforço e status
  { cabecalho: 'Tempo de tratativa (min)', chave: 'tempo_tratativa_min' },
  { cabecalho: 'Status da NC', chave: 'status' },
  { cabecalho: 'Data de encerramento', chave: 'data_encerramento' },
  { cabecalho: 'Dias em aberto', chave: 'dias_em_aberto' },
  { cabecalho: 'Linha do tempo', chave: 'linha_do_tempo' },
];

const CALCULADAS = new Set<ChaveRegistro>(['codigo', 'area_responsavel', 'evitavel', 'custo_total', 'custo_liquido', 'dias_em_aberto']);
const DATAS = new Set<ChaveRegistro>(['data_ocorrencia', 'data_identificacao', 'data_postagem', 'data_encerramento']);
const VALORES = new Set<ChaveRegistro>([
  'valor_romaneio', 'valor_declarado', 'valor_venda', 'frete_original',
  'custo_produto', 'custo_frete_adicional', 'custo_multa_outros', 'valor_reembolsado',
]);

/** NC lida da planilha, pronta para gravar (com o número original da planilha). */
export interface NcImportada extends NcCampos {
  numero: number;
  /** Linha da planilha, para as mensagens */
  linha: number;
  linha_do_tempo: string | null;
}

export interface ProblemaImportacao {
  linha: number;
  campo: string;
  mensagem: string;
}

export interface LeituraPlanilhaNc {
  registros: NcImportada[];
  problemas: ProblemaImportacao[];
}

const normalizar = (s: string) => s.normalize('NFC').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const pad = (n: number) => String(n).padStart(2, '0');
const rotuloDe = (chave: ChaveRegistro) => COLUNAS_REGISTRO_NC.find((c) => c.chave === chave)?.cabecalho ?? chave;

/** Ano/mês/dia → YYYY-MM-DD, só se a data existir no calendário (31/02 não passa). */
function dataValida(y: number, m: number, d: number): string | undefined {
  const data = new Date(Date.UTC(y, m - 1, d));
  const existe = data.getUTCFullYear() === y && data.getUTCMonth() === m - 1 && data.getUTCDate() === d;
  return existe ? `${y}-${pad(m)}-${pad(d)}` : undefined;
}

/** Data da planilha (número serial, Date ou texto dd/mm/aaaa) → YYYY-MM-DD. undefined = inválida. */
function lerData(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? dataValida(d.y, d.m, d.d) : undefined;
  }
  if (v instanceof Date) return dataValida(v.getFullYear(), v.getMonth() + 1, v.getDate());
  const texto = String(v).trim();
  const br = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return dataValida(Number(br[3]), Number(br[2]), Number(br[1]));
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? dataValida(Number(iso[1]), Number(iso[2]), Number(iso[3])) : undefined;
}

/** Valor em reais (número ou texto "R$ 1.234,56") → número. undefined = inválido. */
function lerValor(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  let texto = String(v).replace(/R\$/i, '').replace(/\s/g, '');
  if (texto.includes(',')) texto = texto.replace(/\./g, '').replace(',', '.');
  const n = Number(texto);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
}

function lerTexto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const texto = String(v).trim();
  return texto || null;
}

/** Lê a aba REGISTRO_NC. Linhas sem nenhum campo digitado são ignoradas. */
export function lerPlanilhaNc(dados: ArrayBuffer): LeituraPlanilhaNc {
  const wb = XLSX.read(dados, { type: 'array', cellFormula: true });
  const ws = wb.Sheets['REGISTRO_NC'];
  if (!ws || !ws['!ref']) throw new Error('A planilha não tem a aba REGISTRO_NC.');
  const range = XLSX.utils.decode_range(ws['!ref']);
  const celula = (r: number, c: number) => ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;

  // Cabeçalho: na planilha original fica na linha 4
  const porCabecalho = new Map(COLUNAS_REGISTRO_NC.map((c) => [normalizar(c.cabecalho), c.chave]));
  let linhaCabecalho = -1;
  const colunas = new Map<number, ChaveRegistro>();
  for (let r = range.s.r; r <= Math.min(range.e.r, 20) && linhaCabecalho < 0; r++) {
    const encontradas = new Map<number, ChaveRegistro>();
    for (let c = range.s.c; c <= range.e.c; c++) {
      const v = celula(r, c)?.v;
      const chave = typeof v === 'string' ? porCabecalho.get(normalizar(v)) : undefined;
      if (chave) encontradas.set(c, chave);
    }
    const chaves = [...encontradas.values()];
    if (chaves.includes('data_ocorrencia') && chaves.includes('origem')) {
      linhaCabecalho = r;
      encontradas.forEach((chave, c) => colunas.set(c, chave));
    }
  }
  if (linhaCabecalho < 0) {
    throw new Error('Não encontrei o cabeçalho da REGISTRO_NC (colunas "Data da ocorrência" e "Origem da não conformidade").');
  }

  const registros: NcImportada[] = [];
  const problemas: ProblemaImportacao[] = [];

  for (let r = linhaCabecalho + 1; r <= range.e.r; r++) {
    const linha = r + 1;
    const valores = new Map<ChaveRegistro, unknown>();
    let temDigitado = false;
    for (const [c, chave] of colunas) {
      const cell = celula(r, c);
      if (!cell || cell.v === undefined || cell.v === null || cell.v === '') continue;
      valores.set(chave, cell.v);
      if (!CALCULADAS.has(chave) && !cell.f) temDigitado = true;
    }
    if (!temDigitado) continue;

    const nc: Partial<NcImportada> = { linha };
    // Mantém o ID da planilha (=ROW()-4): NC-0001 é a primeira linha de dados
    const id = String(valores.get('codigo') ?? '').match(/^NC-(\d+)$/i);
    nc.numero = id ? Number(id[1]) : r - linhaCabecalho;

    for (const { chave } of COLUNAS_REGISTRO_NC) {
      if (CALCULADAS.has(chave)) continue;
      const bruto = valores.get(chave);
      if (DATAS.has(chave)) {
        const data = lerData(bruto);
        if (data === undefined) problemas.push({ linha, campo: rotuloDe(chave), mensagem: `data inválida: "${String(bruto)}"` });
        (nc as Record<string, unknown>)[chave] = data ?? null;
      } else if (VALORES.has(chave)) {
        const valor = lerValor(bruto);
        if (valor === undefined) problemas.push({ linha, campo: rotuloDe(chave), mensagem: `valor inválido: "${String(bruto)}"` });
        (nc as Record<string, unknown>)[chave] = valor ?? null;
      } else if (chave === 'tempo_tratativa_min') {
        const valor = lerValor(bruto);
        if (valor === undefined) problemas.push({ linha, campo: rotuloDe(chave), mensagem: `tempo inválido: "${String(bruto)}"` });
        nc.tempo_tratativa_min = valor === null || valor === undefined ? null : Math.round(valor);
      } else if (chave === 'status') {
        const texto = lerTexto(bruto);
        const status = STATUS_NC.find((s) => texto && normalizar(s) === normalizar(texto));
        if (texto && !status) problemas.push({ linha, campo: rotuloDe(chave), mensagem: `status fora da lista: "${texto}"` });
        nc.status = (status ?? null) as StatusNc | null;
      } else {
        (nc as Record<string, unknown>)[chave] = lerTexto(bruto);
      }
    }
    registros.push(nc as NcImportada);
  }

  return { registros, problemas };
}

/** Confere os valores importados contra as listas do sistema (os mesmos que o banco exige). */
export function validarContraListas(registros: NcImportada[], listas: ListasNc): ProblemaImportacao[] {
  const naLista = (lista: ListaNc, v: string | null) =>
    v === null || listas.itens.some((i) => i.lista === lista && i.valor === v);
  const verificacoes: [keyof NcCampos, ListaNc][] = [
    ['empresa', 'empresa'],
    ['tipo_saida', 'tipo_saida'],
    ['resolucao', 'resolucao'],
    ['como_identificada', 'como_identificada'],
    ['reembolso_correios', 'reembolso'],
  ];
  const problemas: ProblemaImportacao[] = [];
  for (const r of registros) {
    for (const [campo, lista] of verificacoes) {
      const v = r[campo] as string | null;
      if (!naLista(lista, v)) problemas.push({ linha: r.linha, campo: rotuloDe(campo), mensagem: `"${v}" não está na lista` });
    }
    if (r.origem && !listas.origens.some((o) => o.nome === r.origem)) {
      problemas.push({ linha: r.linha, campo: rotuloDe('origem'), mensagem: `"${r.origem}" não está na lista de origens` });
    }
  }
  return problemas;
}

export interface ResumoImportacao {
  /** Linhas sem problema e com ID livre */
  novas: NcImportada[];
  /** IDs importados antes: ignorados, então a importação pode ser repetida */
  jaImportadas: number;
  /** ID ocupado por NC registrada no sistema, ou repetido no arquivo: a linha não entra */
  conflitos: ProblemaImportacao[];
  /** Linhas com problema de leitura ou valor fora das listas */
  comProblema: number;
  /** Novas sem origem: entram no registro, mas não no painel (como na planilha) */
  semOrigem: number;
}

/** Separa o que será importado do que já existe ou conflita com NCs gravadas. */
export function resumirImportacao(
  leitura: LeituraPlanilhaNc,
  gravadas: Pick<NaoConformidade, 'numero' | 'importada'>[]
): ResumoImportacao {
  const porNumero = new Map(gravadas.map((nc) => [nc.numero, nc]));
  const linhasComProblema = new Set(leitura.problemas.map((p) => p.linha));
  const linhaDoNumero = new Map<number, number>();
  const resumo: ResumoImportacao = { novas: [], jaImportadas: 0, conflitos: [], comProblema: 0, semOrigem: 0 };

  for (const r of leitura.registros) {
    const gravada = porNumero.get(r.numero);
    const repetida = linhaDoNumero.get(r.numero);
    linhaDoNumero.set(r.numero, repetida ?? r.linha);
    if (repetida !== undefined) {
      resumo.conflitos.push({ linha: r.linha, campo: 'ID', mensagem: `${codigoNc(r.numero)} repetido (já aparece na linha ${repetida})` });
    } else if (gravada?.importada) {
      resumo.jaImportadas++;
    } else if (gravada) {
      resumo.conflitos.push({ linha: r.linha, campo: 'ID', mensagem: `${codigoNc(r.numero)} já foi usado por uma NC registrada no sistema` });
    } else if (linhasComProblema.has(r.linha)) {
      resumo.comProblema++;
    } else {
      resumo.novas.push(r);
    }
  }
  resumo.semOrigem = resumo.novas.filter((r) => !r.origem).length;
  return resumo;
}

/** Valor de uma coluna para a exportação (datas em dd/mm/aaaa, como na planilha). */
function valorExportado(nc: NaoConformidade, chave: ChaveRegistro, hoje: string): string | number {
  if (chave === 'dias_em_aberto') return diasEmAberto(nc, hoje) ?? '';
  if (chave === 'linha_do_tempo') return '';
  const v = nc[chave as keyof NaoConformidade];
  if (v === null || v === undefined) return '';
  if (DATAS.has(chave)) return formatarDataBr(String(v));
  return v as string | number;
}

/** Monta a planilha REGISTRO_NC (36 colunas + reversas geradas) a partir das NCs. */
export function montarPlanilhaNc(ncs: NaoConformidade[], hoje: string = hojeIso()): XLSX.WorkBook {
  const cabecalho = [...COLUNAS_REGISTRO_NC.map((c) => c.cabecalho), 'Reversas geradas'];
  const linhas = ncs.map((nc) => [
    ...COLUNAS_REGISTRO_NC.map((c) => valorExportado(nc, c.chave, hoje)),
    nc.qtd_reversas,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cabecalho, ...linhas]), 'REGISTRO_NC');
  return wb;
}

export function exportarPlanilhaNc(ncs: NaoConformidade[]): void {
  XLSX.writeFile(montarPlanilhaNc(ncs), `nao_conformidades_${hojeIso()}.xlsx`);
}
