/** Iniciais para avatar (até duas letras, maiúsculas). Nome vazio devolve "?" para o avatar nunca ficar sem conteúdo. */
export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  return partes.slice(0, 2).map((parte) => parte[0]).join('').toUpperCase();
}
