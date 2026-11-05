/** Aceita PDF mesmo quando o navegador não informa o tipo do arquivo (acontece no Windows sem leitor de PDF). */
export function arquivoPareceSerPdf(arquivo: { type: string; name: string }): boolean {
  return arquivo.type === 'application/pdf' || (!arquivo.type && /\.pdf$/i.test(arquivo.name));
}
