// Acesso por tela: regras do cadastro (idênticas às da Edge Function admin-usuarios) e o
// mapeamento tela → operações usado pela interface. O banco é a autoridade; aqui só se descreve e
// se valida o que o administrador está concedendo. Não editar o bloco compartilhado isoladamente:
// ele é copiado de supabase/functions/admin-usuarios/acesso.ts e o teste acessoParidade o confere.
import type { Empresa, Tela } from '../types';

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

// ── Mapeamento oficial: tela → operações ─────────────────────────────────────────────────────────
// Selecionar uma tela no cadastro concede as operações próprias dela, no escopo informado, e nada
// além disso. Uma ação especializada (aprovar, emitir, confirmar postagem) só vem da tela dela:
// existir um atalho dentro de outra tela (Pedidos, por exemplo) não a libera. O banco é a
// autoridade (RLS e RPCs); este mapa descreve o que o cadastro promete e alimenta a interface.

export type EscopoDaTela =
  /** O escopo já está na própria tela (por exemplo, Formulário Alinare). */
  | 'tela'
  /** Depende das empresas marcadas no cadastro (empresas_acesso). */
  | 'empresas'
  /** Empresas marcadas e, para cada uma, todos os setores ou setores específicos. */
  | 'aprovacao';

export interface DefinicaoTela {
  tela: Tela;
  grupo: string;
  rotulo: string;
  /** Operações concedidas ao selecionar a tela. */
  operacoes: string[];
  /** O que a tela não concede, para não ser confundida com outra. */
  naoConcede: string[];
  escopo: EscopoDaTela;
}

const NAO_DECIDE = ['Aprovar ou rejeitar pedidos', 'Emitir etiqueta'];

export const DEFINICOES_TELAS: DefinicaoTela[] = [
  { tela: 'dashboard-geral', grupo: 'Dashboards', rotulo: 'Dashboard Geral', escopo: 'tela',
    operacoes: ['Consultar os indicadores das duas empresas'], naoConcede: NAO_DECIDE },
  { tela: 'dashboard-alinare', grupo: 'Dashboards', rotulo: 'Dashboard Alinare', escopo: 'tela',
    operacoes: ['Consultar os indicadores da Alinare'], naoConcede: NAO_DECIDE },
  { tela: 'dashboard-novitah', grupo: 'Dashboards', rotulo: 'Dashboard Novitah', escopo: 'tela',
    operacoes: ['Consultar os indicadores da Novitah'], naoConcede: NAO_DECIDE },
  { tela: 'formulario-alinare', grupo: 'Formulários', rotulo: 'Formulário Alinare', escopo: 'tela',
    operacoes: ['Solicitar reversa da Alinare', 'Acompanhar os próprios pedidos'], naoConcede: NAO_DECIDE },
  { tela: 'formulario-novitah', grupo: 'Formulários', rotulo: 'Formulário Novitah', escopo: 'tela',
    operacoes: ['Solicitar reversa da Novitah', 'Acompanhar os próprios pedidos'], naoConcede: NAO_DECIDE },
  { tela: 'lista-geral', grupo: 'Pedidos', rotulo: 'Pedidos das duas empresas', escopo: 'tela',
    operacoes: ['Consultar os pedidos das duas empresas'], naoConcede: [...NAO_DECIDE, 'Confirmar recebimento'] },
  { tela: 'lista-alinare', grupo: 'Pedidos', rotulo: 'Pedidos da Alinare', escopo: 'tela',
    operacoes: ['Consultar os pedidos da Alinare'], naoConcede: [...NAO_DECIDE, 'Confirmar recebimento'] },
  { tela: 'lista-novitah', grupo: 'Pedidos', rotulo: 'Pedidos da Novitah', escopo: 'tela',
    operacoes: ['Consultar os pedidos da Novitah'], naoConcede: [...NAO_DECIDE, 'Confirmar recebimento'] },
  { tela: 'aprovar-reversa', grupo: 'Aprovações', rotulo: 'Aprovações', escopo: 'aprovacao',
    operacoes: ['Consultar a fila de aprovação', 'Aprovar ou rejeitar (rejeição com justificativa) no escopo de empresa e setor'],
    naoConcede: ['Aprovar o próprio pedido (regra de autoaprovação)', 'Emitir etiqueta'] },
  { tela: 'emitir-etiqueta', grupo: 'Emissão de etiquetas', rotulo: 'Emissão de etiquetas', escopo: 'empresas',
    operacoes: ['Consultar os pedidos aprovados das empresas marcadas', 'Registrar PDF, códigos e datas da etiqueta', 'Reemitir conforme as regras existentes'],
    naoConcede: ['Aprovar ou rejeitar pedidos'] },
  { tela: 'nc-edit', grupo: 'Não conformidades', rotulo: 'Não conformidades', escopo: 'tela',
    operacoes: ['Consultar a lista e o painel de NC', 'Registrar e editar NC', 'Abrir reversa a partir de uma NC'], naoConcede: NAO_DECIDE },
  { tela: 'usuarios', grupo: 'Administração', rotulo: 'Gestão de usuários', escopo: 'tela',
    operacoes: ['Cadastrar e editar usuários e permissões', 'Configurar aprovadores', 'Consultar e reconciliar comunicações', 'Editar as listas de NC'],
    naoConcede: ['Consultar pedidos e NC', 'Aprovar, emitir ou confirmar recebimento'] },
];

export const GRUPOS_TELAS: Array<{ titulo: string; telas: DefinicaoTela[] }> = DEFINICOES_TELAS.reduce(
  (grupos, definicao) => {
    const grupo = grupos.find((item) => item.titulo === definicao.grupo);
    if (grupo) grupo.telas.push(definicao);
    else grupos.push({ titulo: definicao.grupo, telas: [definicao] });
    return grupos;
  },
  [] as Array<{ titulo: string; telas: DefinicaoTela[] }>,
);

/** Identificadores antigos: preservados em quem já os tem, não oferecidos a novos acessos. */
export const DEFINICOES_LEGADAS: Record<string, { rotulo: string; nota: string }> = {
  nc: { rotulo: 'Não conformidades (somente consulta)', nota: 'Só consulta. A tela atual de Não conformidades inclui consulta, registro e edição.' },
  kanban: { rotulo: 'Kanban', nota: 'Tela removida do produto; concede consulta de pedidos.' },
  'kanban-edit': { rotulo: 'Editar Kanban', nota: 'Tela removida; ainda permite confirmar o recebimento físico nas empresas marcadas.' },
  'confirmar-checkin': { rotulo: 'Check-in dos Correios', nota: 'Tela removida; ainda permite confirmar o recebimento físico nas empresas marcadas.' },
  'status-geral': { rotulo: 'Status Geral', nota: 'Tela removida; concede consulta de pedidos das duas empresas.' },
  'status-alinare': { rotulo: 'Status Alinare', nota: 'Tela removida; concede consulta de pedidos da Alinare.' },
  'status-novitah': { rotulo: 'Status Novitah', nota: 'Tela removida; concede consulta de pedidos da Novitah.' },
};

export function rotuloDaTela(tela: string): string {
  return DEFINICOES_TELAS.find((item) => item.tela === tela)?.rotulo ?? DEFINICOES_LEGADAS[tela]?.rotulo ?? tela;
}

export const ehTelaOficial = (tela: string): boolean => (TELAS_OFICIAIS as readonly string[]).includes(tela);
export const telasLegadasDe = (telas: readonly string[]): string[] => telas.filter((tela) => tela in DEFINICOES_LEGADAS);
export const telasOficiaisDe = (telas: readonly string[]): Tela[] => telas.filter(ehTelaOficial) as Tela[];
export const telaTemEscopoDeEmpresa = (tela: string): boolean => (TELAS_COM_EMPRESAS as readonly string[]).includes(tela);

/**
 * Consulta de pedidos não opera: o escopo de empresa vem da tela marcada. Para as telas que dependem
 * de empresa, a lista de empresas do cadastro vale e nunca é presumida.
 */
export function empresaLiberada(empresasAcesso: readonly string[] | undefined, empresa: Empresa): boolean {
  return !!empresasAcesso?.includes(empresa);
}

/** Setores oferecidos para o escopo de aprovação de uma empresa (padrão + os já usados em pedidos/configuração). */
export function setoresDaEmpresa(empresa: Empresa, setoresPadrao: readonly string[], conhecidos: Array<{ empresa: string; setor: string }> = []): string[] {
  const padrao = setoresPadrao.filter((setor) => !setor.startsWith('Comercial ') || setor === `Comercial ${empresa}`);
  const existentes = conhecidos.filter((item) => item.empresa === empresa).map((item) => item.setor);
  return [...new Set([...padrao, ...existentes])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Pontos que o cadastro ainda não define e que o formulário de edição deve sinalizar e exigir ao salvar.
 * Nada é inferido: sem empresa ou sem setor gravado, o administrador escolhe.
 */
export function pendenciasDoAcesso(
  usuario: { telas: readonly string[]; empresasAcesso?: readonly string[]; perfilAcesso?: string },
  escopoAprovacao: EscopoAprovacao[] | null,
): string[] {
  const pendencias: string[] = [];
  const empresas = usuario.empresasAcesso ?? [];
  if (usuario.telas.some(telaTemEscopoDeEmpresa) && !empresas.length) {
    pendencias.push('Há telas que dependem de empresa (Aprovações, Emissão de etiquetas ou acessos antigos de recebimento) e nenhuma empresa está marcada.');
  }
  if (usuario.telas.includes('aprovar-reversa') && escopoAprovacao) {
    for (const empresa of empresas) {
      if (!escopoAprovacao.some((item) => item.empresa === empresa)) {
        pendencias.push(`Falta o escopo de aprovação de ${empresa} (todos os setores ou setores específicos).`);
      }
    }
  }
  return pendencias;
}
