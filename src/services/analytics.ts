// ── Funções puras de análise/agregação de dados ──────────────────────────────
// Recebem um array de Solicitacao já filtrado e derivam KPIs e datasets
// para os gráficos. Mantidas puras (sem side-effects) para fácil teste.
// ─────────────────────────────────────────────────────────────────────────────

import type { Solicitacao, Empresa } from '../types';
import { MOTIVOS } from '../types';
import { statusEfetivo } from '../lib/situacaoPedido';

// ── Cores das marcas (reuso em gráficos) ──────────────────────────────────────
/** Cor de identificação da empresa (token do tema: ouro champagne e rosé). */
export const COR_EMPRESA: Record<Empresa, string> = {
  Alinare: 'var(--flow-serie-alinare)',
  Novitah: 'var(--flow-serie-novitah)',
};

// Paleta para as categorias de motivo do reverso
export const COR_MOTIVO: string[] = [
  '#8B7AD1',
  '#ECB05C',
  '#39BFFF',
  '#E57B83',
  '#7B95AD',
  '#12AAB7',
  '#C16CAB',
  '#82B36B',
  '#DC8164',
  '#D6B84E',
  '#6F9BC7',
  '#B7617C',
];

// ── Motivos ───────────────────────────────────────────────────────────────────

/**
 * "Mercadoria errada" (valor antigo, ainda aceito pelo banco em pedidos já registrados) e
 * "Mercadoria Errada" (valor atual) são o mesmo motivo; os relatórios do banco os contam
 * juntos (reversa_motivo_normalizado). Nenhum outro valor antigo é equiparado a um atual.
 */
export function motivoNormalizado(motivo: string): string {
  return motivo.toLowerCase() === 'mercadoria errada' ? 'Mercadoria Errada' : motivo;
}

/** Motivos atuais, mais qualquer outro valor presente nos dados (ex.: "Endereço incorreto" antigo). */
function motivosDoRecorte(dados: Solicitacao[]): string[] {
  const lista: string[] = [...MOTIVOS];
  dados.forEach((s) => {
    const motivo = motivoNormalizado(s.motivo);
    if (!lista.includes(motivo)) lista.push(motivo);
  });
  return lista;
}

// ── KPIs numéricos ────────────────────────────────────────────────────────────

export interface Kpis {
  total: number;
  aguardandoAprovacao: number;
  pendentes: number;
  etiquetaGerada: number;
  postados: number;
  emTransito: number;
  concluidos: number;
  /** Percentual de conclusão (0–100) */
  taxaConclusao: number;
  /** Tempo médio de preenchimento em segundos */
  tempoMedioSegundos: number;
  /** Motivo mais recorrente */
  motivoTop: string;
}

export function calcularKpis(dados: Solicitacao[]): Kpis {
  const total = dados.length;
  const contagemStatus = contarPorStatus(dados);
  const aguardandoAprovacao = contagemStatus.aguardando_aprovacao;
  const pendentes = contagemStatus.pendente;
  const etiquetaGerada = contagemStatus.etiqueta_gerada;
  const postados = contagemStatus.postado;
  const emTransito = contagemStatus.em_transito;
  const concluidos = contagemStatus.concluido;

  const taxaConclusao = total > 0 ? Math.round((concluidos / total) * 100) : 0;

  const somaTempo = dados.reduce(
    (acc, s) => acc + s.tempo_preenchimento_segundos,
    0
  );
  const tempoMedioSegundos = total > 0 ? Math.round(somaTempo / total) : 0;

  // Motivo mais frequente
  const contagem = new Map<string, number>();
  dados.forEach((s) => {
    const motivo = motivoNormalizado(s.motivo);
    contagem.set(motivo, (contagem.get(motivo) ?? 0) + 1);
  });
  let motivoTop = '—';
  let maxCount = 0;
  contagem.forEach((count, motivo) => {
    if (count > maxCount) {
      maxCount = count;
      motivoTop = motivo;
    }
  });

  return {
    total,
    aguardandoAprovacao,
    pendentes,
    etiquetaGerada,
    postados,
    emTransito,
    concluidos,
    taxaConclusao,
    tempoMedioSegundos,
    motivoTop,
  };
}

// ── Dataset: quantidade por motivo ────────────────────────────────────────────

export interface MotivoDatum {
  motivo: string;
  quantidade: number;
}

export function porMotivo(dados: Solicitacao[]): MotivoDatum[] {
  return motivosDoRecorte(dados).map((motivo) => ({
    motivo,
    quantidade: dados.filter((s) => motivoNormalizado(s.motivo) === motivo).length,
  }));
}

// ── Dataset: proporção por empresa (pizza) ────────────────────────────────────

export interface EmpresaDatum {
  empresa: Empresa;
  quantidade: number;
}

export function porEmpresa(dados: Solicitacao[]): EmpresaDatum[] {
  return (['Alinare', 'Novitah'] as Empresa[])
    .map((empresa) => ({
      empresa,
      quantidade: dados.filter((s) => s.empresa === empresa).length,
    }))
    .filter((d) => d.quantidade > 0); // não renderiza fatias vazias
}

// ── Dataset: volume ao longo do tempo (área) ──────────────────────────────────

export interface TimelineDatum {
  data: string;        // YYYY-MM-DD (para ordenação)
  dataLabel: string;   // DD/MM (para exibição)
  quantidade: number;
}

/** Contagem por todos os status atuais, inclusive reprovados. */
export function contarPorStatus(dados: Solicitacao[]): Record<Solicitacao['status'], number> {
  const contagem: Record<Solicitacao['status'], number> = {
    aguardando_aprovacao: 0,
    reprovado: 0,
    pendente: 0,
    etiqueta_gerada: 0,
    postado: 0,
    em_transito: 0,
    concluido: 0,
  };

  dados.forEach((solicitacao) => {
    const status = solicitacao.status
      ? statusEfetivo(solicitacao)
      : ((solicitacao as Solicitacao & { resolvido?: boolean }).resolvido ? 'concluido' : 'pendente');
    contagem[status] += 1;
  });

  return contagem;
}

export function porData(dados: Solicitacao[]): TimelineDatum[] {
  const contagem = new Map<string, number>();
  dados.forEach((s) => {
    contagem.set(s.data_solicitacao, (contagem.get(s.data_solicitacao) ?? 0) + 1);
  });

  return Array.from(contagem.entries())
    .map(([data, quantidade]) => {
      const [, m, d] = data.split('-');
      return { data, dataLabel: `${d}/${m}`, quantidade };
    })
    .sort((a, b) => a.data.localeCompare(b.data));
}

/** Série diária com dias sem solicitações preenchidos com zero. */
export function porDataComZeros(
  dados: Solicitacao[],
  dataInicio?: string,
  dataFim?: string,
): TimelineDatum[] {
  if (dados.length === 0) return [];

  const datas = dados.map((solicitacao) => solicitacao.data_solicitacao).filter(Boolean).sort();
  const inicio = dataInicio || datas[0];
  const fim = dataFim || datas[datas.length - 1];
  if (!inicio || !fim || inicio > fim) return [];

  const contagem = new Map<string, number>();
  dados.forEach((solicitacao) => {
    const data = solicitacao.data_solicitacao;
    if (data >= inicio && data <= fim) contagem.set(data, (contagem.get(data) ?? 0) + 1);
  });

  const resultado: TimelineDatum[] = [];
  const cursor = new Date(`${inicio}T00:00:00Z`);
  const ultimoDia = new Date(`${fim}T00:00:00Z`);
  while (cursor <= ultimoDia) {
    const data = cursor.toISOString().slice(0, 10);
    const [, mes, dia] = data.split('-');
    resultado.push({ data, dataLabel: `${dia}/${mes}`, quantidade: contagem.get(data) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return resultado;
}

// ── Dataset: motivo × empresa (barras empilhadas) ─────────────────────────────

export interface MotivoEmpresaDatum {
  motivo: string;
  Alinare: number;
  Novitah: number;
  total: number;
}

export function porMotivoEmpresa(dados: Solicitacao[]): MotivoEmpresaDatum[] {
  return motivosDoRecorte(dados).map((motivo) => {
    const doMotivo = dados.filter((s) => motivoNormalizado(s.motivo) === motivo);
    const alinare = doMotivo.filter((s) => s.empresa === 'Alinare').length;
    const novitah = doMotivo.filter((s) => s.empresa === 'Novitah').length;
    return {
      motivo,
      Alinare: alinare,
      Novitah: novitah,
      total: alinare + novitah,
    };
  });
}

// ── Dataset: ranking por autorizador ──────────────────────────────────────────

export interface AutorizadorDatum {
  autorizador: string;
  pendentes: number;
  resolvidos: number;
  total: number;
}

export function porAutorizador(dados: Solicitacao[]): AutorizadorDatum[] {
  const mapa = new Map<string, { pendentes: number; resolvidos: number }>();

  dados.forEach((s) => {
    const autorizador = s.autorizacao || (statusEfetivo(s) === 'reprovado' ? 'Não aprovada' : 'Aguardando aprovação');
    const atual = mapa.get(autorizador) ?? { pendentes: 0, resolvidos: 0 };
    if (s.status === 'concluido') atual.resolvidos += 1;
    else atual.pendentes += 1;
    mapa.set(autorizador, atual);
  });

  return Array.from(mapa.entries())
    .map(([autorizador, v]) => ({
      autorizador,
      pendentes: v.pendentes,
      resolvidos: v.resolvidos,
      total: v.pendentes + v.resolvidos,
    }))
    .sort((a, b) => b.total - a.total); // maior carga primeiro
}

// ── Formatação de tempo (segundos → "Xmin Ys") ────────────────────────────────

export function formatarTempo(segundos: number): string {
  if (segundos < 60) return `${segundos}s`;
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return seg > 0 ? `${min}min ${seg}s` : `${min}min`;
}
