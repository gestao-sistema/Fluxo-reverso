// Regra oficial de cadastro: selecionar uma tela concede as operações dela, no escopo de empresa
// e setor informado. Módulo puro (sem Deno nem imports remotos): roda igual na Edge Function e nos
// testes. O front-end tem o espelho em src/lib/acesso.ts; src/test/acessoParidade.test.ts os compara.

// >>> regras compartilhadas (idênticas em src/lib/acesso.ts; src/test/acessoParidade.test.ts compara o texto)
export const EMPRESAS_VALIDAS = ['Alinare', 'Novitah'] as const;

/** Telas oferecidas no cadastro (uma por tela do produto). */
export const TELAS_OFICIAIS = [
  'dashboard-geral',
  'dashboard-alinare',
  'dashboard-novitah',
  'formulario-alinare',
  'formulario-novitah',
  'lista-geral',
  'lista-alinare',
  'lista-novitah',
  'aprovar-reversa',
  'emitir-etiqueta',
  'nc-edit',
  'usuarios',
] as const;

/**
 * Identificadores antigos: continuam valendo para quem já os tem (o banco os reconhece) e são
 * preservados na edição, mas não são oferecidos a novos acessos. Telas removidas do produto.
 */
export const TELAS_LEGADAS = [
  'nc',
  'kanban',
  'kanban-edit',
  'confirmar-checkin',
  'status-geral',
  'status-alinare',
  'status-novitah',
] as const;

/** Telas cujas operações dependem de empresas_acesso (as legadas de recebimento físico também). */
export const TELAS_COM_EMPRESAS = ['aprovar-reversa', 'emitir-etiqueta', 'kanban-edit', 'confirmar-checkin'] as const;

export const PERFIS_ACESSO_VALIDOS = [
  'solicitante', 'aprovador', 'emissor_etiqueta', 'checkin_correios', 'mestre', 'personalizado',
] as const;

export interface EscopoAprovacao {
  empresa: string;
  todos_setores: boolean;
  setores: string[];
}

export interface EntradaAcesso {
  perfilAcesso?: string;
  empresasAcesso?: string[];
  telas?: string[];
  aprovacao?: EscopoAprovacao[];
  /** Telas que o usuário já tem (edição): só estas podem manter identificadores antigos. */
  telasAtuais?: string[];
  /** Escopo de aprovação já gravado (edição): vale quando o payload não o reenvia. */
  aprovacaoAtual?: EscopoAprovacao[];
}

export interface AcessoNormalizado {
  perfilAcesso: string;
  empresasAcesso: string[];
  telas: string[];
  aprovacao: EscopoAprovacao[];
}

const ehEmpresa = (valor: unknown): valor is string => EMPRESAS_VALIDAS.includes(valor as never);
const unicos = <T,>(itens: T[]): T[] => [...new Set(itens)];

function limparSetores(setores: unknown): string[] {
  if (!Array.isArray(setores)) return [];
  return unicos(setores.map((setor) => String(setor ?? '').trim()).filter(Boolean)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Escopo de aprovação por empresa: todos os setores, ou setores específicos (nunca os dois, nunca vazio). */
function escopoValido(item: EscopoAprovacao): EscopoAprovacao {
  if (!item || !ehEmpresa(item.empresa)) throw new Error('Empresa inválida no escopo de aprovação.');
  const setores = limparSetores(item.setores);
  if (item.todos_setores === true && setores.length > 0) {
    throw new Error(`Em ${item.empresa}, escolha todos os setores ou setores específicos, não os dois.`);
  }
  if (item.todos_setores !== true && setores.length === 0) {
    throw new Error(`Informe os setores de aprovação de ${item.empresa} ou marque todos os setores.`);
  }
  return { empresa: item.empresa, todos_setores: item.todos_setores === true, setores };
}

function aprovacaoDasEmpresas(empresas: string[], informado: EscopoAprovacao[] | undefined): EscopoAprovacao[] {
  const itens = (informado ?? []).map(escopoValido);
  const repetidas = itens.map((item) => item.empresa).filter((empresa, i, todas) => todas.indexOf(empresa) !== i);
  if (repetidas.length) throw new Error('Cada empresa só pode aparecer uma vez no escopo de aprovação.');
  const fora = itens.find((item) => !empresas.includes(item.empresa));
  if (fora) throw new Error(`Remova ${fora.empresa} do escopo de aprovação ou marque a empresa no acesso.`);
  for (const empresa of empresas) {
    if (!itens.some((item) => item.empresa === empresa)) {
      throw new Error(`Informe os setores de aprovação de ${empresa} ou marque todos os setores.`);
    }
  }
  return empresas.map((empresa) => itens.find((item) => item.empresa === empresa)!);
}

const todosOsSetores = (empresas: string[]): EscopoAprovacao[] =>
  empresas.map((empresa) => ({ empresa, todos_setores: true, setores: [] }));

/**
 * Valida o cadastro e devolve exatamente o que será gravado: app_metadata (perfil, empresas, telas)
 * e escopo de aprovação. Lança Error com mensagem em português para o administrador.
 */
export function normalizarAcesso(entrada: EntradaAcesso): AcessoNormalizado {
  const perfil = PERFIS_ACESSO_VALIDOS.includes(entrada.perfilAcesso as never) ? entrada.perfilAcesso! : 'personalizado';
  const empresas = unicos((entrada.empresasAcesso ?? []).filter(ehEmpresa));

  if (perfil === 'mestre') {
    // Acesso total deliberado: todas as telas, as duas empresas e aprovação em todos os setores.
    const empresasMestre = [...EMPRESAS_VALIDAS] as string[];
    return {
      perfilAcesso: 'mestre',
      empresasAcesso: empresasMestre,
      telas: [...TELAS_OFICIAIS, ...TELAS_LEGADAS],
      aprovacao: todosOsSetores(empresasMestre),
    };
  }

  if (perfil !== 'personalizado') {
    if (!empresas.length) throw new Error('Selecione ao menos uma empresa para este perfil de acesso.');
    if (perfil === 'solicitante') {
      return {
        perfilAcesso: perfil, empresasAcesso: empresas, aprovacao: [],
        telas: empresas.map((empresa) => (empresa === 'Alinare' ? 'formulario-alinare' : 'formulario-novitah')),
      };
    }
    // Aprovador pronto: todos os setores das empresas escolhidas (é a definição do perfil).
    if (perfil === 'aprovador') {
      return { perfilAcesso: perfil, empresasAcesso: empresas, telas: ['aprovar-reversa'], aprovacao: todosOsSetores(empresas) };
    }
    const tela = perfil === 'emissor_etiqueta' ? 'emitir-etiqueta' : 'confirmar-checkin';
    return { perfilAcesso: perfil, empresasAcesso: empresas, telas: [tela], aprovacao: [] };
  }

  // Personalizado: cada tela marcada concede as operações dela e nada além disso.
  const pedidas = unicos((entrada.telas ?? []).map(String));
  const atuais = entrada.telasAtuais ?? [];
  for (const tela of pedidas) {
    const oficial = (TELAS_OFICIAIS as readonly string[]).includes(tela);
    const legada = (TELAS_LEGADAS as readonly string[]).includes(tela);
    if (!oficial && !legada) throw new Error(`Tela desconhecida: ${tela}.`);
    if (legada && !atuais.includes(tela)) {
      throw new Error(`A tela antiga "${tela}" não pode ser concedida a novos acessos; ela só é preservada em quem já a tem.`);
    }
  }
  if (!pedidas.length) throw new Error('Selecione ao menos uma tela de acesso.');

  const precisaEmpresas = pedidas.some((tela) => (TELAS_COM_EMPRESAS as readonly string[]).includes(tela));
  if (precisaEmpresas && !empresas.length) {
    throw new Error('Selecione ao menos uma empresa para Aprovações, Emissão de etiquetas ou os acessos antigos de recebimento.');
  }
  const empresasFinais = precisaEmpresas ? empresas : [];
  const aprovacao = pedidas.includes('aprovar-reversa')
    ? aprovacaoDasEmpresas(empresasFinais, entrada.aprovacao ?? entrada.aprovacaoAtual)
    : [];
  return { perfilAcesso: 'personalizado', empresasAcesso: empresasFinais, telas: pedidas, aprovacao };
}

// <<< regras compartilhadas

/** Administra usuários e as funções administrativas (a tela "usuarios" ou o perfil mestre). */
export function ehAdmin(md: Record<string, any> = {}): boolean {
  const telas = Array.isArray(md.telas) ? md.telas : [];
  return md.perfil_acesso === 'mestre' || md.perfil === 'ADMIN' || telas.includes('usuarios');
}
