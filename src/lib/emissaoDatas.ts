export type AvisoValidade = 'vence_hoje' | 'encerrado' | 'valida' | 'nao_informada';

/** Treats date-only values as calendar dates, without parsing them in local or UTC time. */
export function dataCalendarioValida(valor: string | null | undefined): boolean {
  if (!valor) return true;
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!partes) return false;
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  if (ano < 1) return false;
  const data = new Date(0);
  data.setUTCFullYear(ano, mes - 1, dia);
  data.setUTCHours(0, 0, 0, 0);
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

/**
 * Mesma regra do banco: emissão não pode ser futura (relógio de São Paulo). Validade sem emissão é
 * permitida; datas ausentes continuam null. `hoje` existe para teste.
 */
export function validarDatasEmissao(
  emitidaEm: string | null | undefined,
  validaAte: string | null | undefined,
  hoje: string = hojeEmSaoPaulo(),
): string | null {
  if (!dataCalendarioValida(emitidaEm)) return 'Informe uma data de emissão válida.';
  if (!dataCalendarioValida(validaAte)) return 'Informe uma data de validade válida.';
  if (emitidaEm && emitidaEm > hoje) return 'A data de emissão não pode ser futura.';
  if (emitidaEm && validaAte && validaAte < emitidaEm) {
    return 'A validade não pode ser anterior à data de emissão.';
  }
  return null;
}

export function formatarDataCalendario(valor: string | null | undefined): string | null {
  if (!valor || !dataCalendarioValida(valor)) return null;
  const [ano, mes, dia] = valor.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(agora);
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

export function avisoValidadeEmissao(
  validaAte: string | null | undefined,
  opcoes: { aguardandoPostagem: boolean; substituida?: boolean; postagemConfirmada?: boolean; hoje?: string },
): AvisoValidade | null {
  if (!opcoes.aguardandoPostagem || opcoes.substituida || opcoes.postagemConfirmada) return null;
  if (!validaAte) return 'nao_informada';
  if (!dataCalendarioValida(validaAte)) return 'nao_informada';
  const hoje = opcoes.hoje ?? hojeEmSaoPaulo();
  if (validaAte < hoje) return 'encerrado';
  if (validaAte === hoje) return 'vence_hoje';
  return 'valida';
}
