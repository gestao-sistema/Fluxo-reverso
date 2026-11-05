// ── Lógica pura do rastreio Correios (sem I/O) ──────────────────────────────
// Compartilhada entre a Edge Function e os testes (vitest).

export interface EventoRastro {
  codigo: string;
  descricao: string;
  dtHrCriado: string;
  unidade?: { endereco?: { cidade?: string; uf?: string }; tipo?: string; nome?: string };
  unidadeDestino?: { endereco?: { cidade?: string; uf?: string }; tipo?: string; nome?: string };
}

export type StatusRastreio = 'postado' | 'em_transito' | 'concluido';

/** Mapeia código de evento SRO para status interno do fluxo. */
export function mapEventoParaStatus(codigo: string): StatusRastreio | null {
  if (codigo === 'PO') return 'postado';
  if (codigo === 'RO' || codigo === 'OEC') return 'em_transito';
  if (codigo === 'BDE') return 'concluido';
  return null;
}

/** Extrai lista de eventos da resposta da API (formato objeto único ou lista). */
export function extrairEventos(respostaApi: unknown): EventoRastro[] {
  const data = respostaApi as
    | { eventos?: EventoRastro[]; objetos?: { eventos?: EventoRastro[] }[] }
    | null;
  return data?.eventos ?? data?.objetos?.[0]?.eventos ?? [];
}

/**
 * Data (AAAA-MM-DD, como os Correios informam, sem converter fuso) do evento de postagem mais antigo.
 * Null quando a consulta não traz o evento de postagem: a data não é inventada.
 */
export function dataDaPostagem(eventos: EventoRastro[]): string | null {
  const datas = eventos
    .filter((evento) => evento.codigo === 'PO' && /^\d{4}-\d{2}-\d{2}/.test(evento.dtHrCriado ?? ''))
    .map((evento) => evento.dtHrCriado.slice(0, 10))
    .sort();
  return datas[0] ?? null;
}

/** A migration que cria registrar_postagem_rastreio ainda não foi aplicada neste banco. */
export function funcaoAindaNaoExiste(erro: { code?: string; message?: string } | null | undefined): boolean {
  return !!erro && (erro.code === 'PGRST202' || erro.code === '42883'
    || /could not find the function|function .* does not exist/i.test(erro.message ?? ''));
}
