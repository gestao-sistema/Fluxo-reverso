// ── Tema visual por empresa ─────────────────────────────────────────────────
// Só decide a aparência (cores, fundo e materiais). Não filtra dados nem altera
// permissões: a empresa vem do filtro que a própria tela exibe, da rota (query
// `empresa` ou formulário da empresa) ou, por último, do perfil que só acessa
// uma empresa. Sem empresa única, vale o tema conjunto.
// ─────────────────────────────────────────────────────────────────────────────

export type Tema = 'alinare' | 'novitah' | 'conjunto';

/** Marca do padrão visual (`data-brand`): a visão conjunta das duas empresas é a AZIME. */
export type Marca = 'azime' | 'alinare' | 'novitah';

export function marcaDoTema(tema: Tema): Marca {
  return tema === 'conjunto' ? 'azime' : tema;
}

/** Tema do padrão visual (`data-theme`) a partir do modo de cor escolhido pelo usuário. */
export function temaDoModo(modo: 'claro' | 'escuro'): 'light' | 'dark' {
  return modo === 'claro' ? 'light' : 'dark';
}

/** Converte a empresa selecionada (ou "Ambas"/vazio) no tema correspondente. */
export function temaDaEmpresa(empresa: string | null | undefined): Tema {
  if (empresa === 'Alinare') return 'alinare';
  if (empresa === 'Novitah') return 'novitah';
  return 'conjunto';
}

/** Empresa implícita na rota: formulário da empresa ou query `?empresa=`. */
export function empresaDaRota(pathname: string, search: string): string | null {
  if (pathname === '/login/alinare') return 'Alinare';
  if (pathname === '/login/novitah') return 'Novitah';
  if (pathname === '/admin/alinare') return 'Alinare';
  if (pathname === '/admin/novitah') return 'Novitah';
  return new URLSearchParams(search).get('empresa');
}

/** Empresa do perfil só quando ele acessa exatamente uma (lista vazia = todas). */
export function empresaDoPerfil(empresasAcesso: readonly string[] | null | undefined): string | null {
  return empresasAcesso?.length === 1 ? empresasAcesso[0] : null;
}

/**
 * Tema final, nesta ordem: seleção declarada pela tela (inclusive "Ambas"),
 * empresa da rota, perfil de empresa única, conjunto.
 */
export function resolverTema(pathname: string, search: string, empresaDaTela?: string | null, empresaPerfil?: string | null): Tema {
  if (empresaDaTela !== undefined) return temaDaEmpresa(empresaDaTela);
  return temaDaEmpresa(empresaDaRota(pathname, search) ?? empresaPerfil);
}
