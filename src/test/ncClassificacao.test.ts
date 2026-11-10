import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ncSchema, type NcFormInput } from '../schemas/ncSchema';
import {
  AREAS_PADRAO,
  CAUSADORES_PADRAO,
  MAPEAMENTO_ORIGEM_LEGADA,
  MENSAGEM_CAUSADOR_NAO_VOLTA,
  MENSAGEM_CAUSADOR_OBRIGATORIO,
  MENSAGEM_CUSTO_NAO_COM_VALOR,
  MENSAGEM_OUTRO_SEM_DESCRICAO,
  MENSAGEM_SITUACAO_NAO_APAGA,
  MENSAGEM_SITUACAO_SEM_INFORMACAO,
  MENSAGEM_TIPO_NAO_VOLTA,
  MENSAGEM_TIPO_OBRIGATORIO,
  TIPOS_PROBLEMA_PADRAO,
  classificacaoPendente,
  classificarOrigemLegada,
  derivarClassificacao,
  situacaoCustoInicial,
  temValorRegistrado,
  validarClassificacaoNc,
} from '../lib/ncClassificacao';
import type { ListasNc, NcGravacao } from '../types';

// Paridade: a migration é a autoridade. Estes testes falham se o front-end e o banco divergirem.
const ler = (caminho: string) => readFileSync(fileURLToPath(new URL(caminho, import.meta.url)), 'utf8');
const MIGRATION = ler('../../supabase/migrations/20261109100000_nc_classificacao_separada.sql');
const MIGRATION_ALINHAR = ler('../../supabase/migrations/20261021140000_alinhar_listas_nc.sql');

const sqlEntre = (inicio: string, fim: string) => {
  const a = MIGRATION.indexOf(inicio);
  const b = MIGRATION.indexOf(fim, a);
  return MIGRATION.slice(a, b);
};

const texto = (valor: string | null) => (valor === null ? null : valor.replace(/''/g, "'"));
const literal = '(?:[^\']|\'\')*';

function mapeamentoDaMigration(): Array<[string, string | null, string | null]> {
  const trecho = sqlEntre('create or replace function public.nc_classificacao_legada', '$$;');
  const linhas = [...trecho.matchAll(new RegExp(`\\('(${literal})',\\s*(null(?:::text)?|'${literal}'),\\s*'(${literal})'\\)`, 'g'))];
  return linhas.map(([, origem, tipo, causador]) => [
    texto(origem) as string,
    tipo.startsWith('null') ? null : texto(tipo.slice(1, -1)),
    texto(causador) as string,
  ]);
}

function seedsDaMigration(lista: string): string[] {
  const trecho = sqlEntre('-- 1. Listas novas', '-- 2. Colunas novas');
  return [...trecho.matchAll(new RegExp(`\\('${lista}', '(${literal})', \\d+\\)`, 'g'))].map(([, v]) => texto(v) as string);
}

const LISTAS: ListasNc = {
  origens: [],
  itens: [
    ...TIPOS_PROBLEMA_PADRAO.map((valor, i) => ({ lista: 'tipo_problema' as const, valor, ordem: i + 1, ativo: true })),
    ...CAUSADORES_PADRAO.map((valor, i) => ({ lista: 'causador' as const, valor, ordem: i + 1, ativo: true })),
    ...AREAS_PADRAO.map((valor, i) => ({ lista: 'area' as const, valor, ordem: i + 1, ativo: true })),
  ],
};

/** Campos que um registro novo precisa ter (tipo e causador): usados nos cenários de inserção. */
const REGISTRO_COMPLETO = { tipo_problema: 'Endereço incorreto', causador: 'Expedição' };

const base: NcGravacao = {
  data_ocorrencia: '2026-10-01', data_identificacao: null, empresa: 'Alinare', cliente: null, vendedora: null,
  romaneio: null, valor_romaneio: null, nf: null, rastreio: null, data_postagem: null, tipo_saida: null,
  origem: null, como_identificada: null, status_correios: null, descricao: null, resolucao: null,
  novo_rastreio: null, valor_declarado: null, valor_venda: null, frete_original: null,
  custo_produto: null, custo_frete_adicional: null, custo_multa_outros: null, reembolso_correios: null,
  numero_pi: null, valor_reembolsado: null, tempo_tratativa_min: null, status: 'Aberta', data_encerramento: null,
};

describe('paridade com a migration 20261109100000', () => {
  it('o mapeamento das 28 origens é o mesmo que a função do banco', () => {
    expect(mapeamentoDaMigration()).toHaveLength(28);
    expect(mapeamentoDaMigration()).toEqual(MAPEAMENTO_ORIGEM_LEGADA.map((linha) => [...linha]));
  });

  it('as listas iniciais de tipo do problema e de causador são as da migration', () => {
    expect(seedsDaMigration('tipo_problema')).toEqual([...TIPOS_PROBLEMA_PADRAO]);
    expect(seedsDaMigration('causador')).toEqual([...CAUSADORES_PADRAO]);
  });

  it('as áreas são as da carga inicial de LISTAS_NC (20261021140000)', () => {
    const areas = [...MIGRATION_ALINHAR.matchAll(/\('area', '([^']+)', \d+\)/g)].map(([, v]) => v);
    expect(areas).toEqual([...AREAS_PADRAO]);
  });

  it('todo tipo e causador do mapeamento existe na lista inicial', () => {
    for (const [, tipo, causador] of MAPEAMENTO_ORIGEM_LEGADA) {
      if (tipo !== null) expect(TIPOS_PROBLEMA_PADRAO).toContain(tipo);
      if (causador !== null) expect(CAUSADORES_PADRAO).toContain(causador);
    }
  });
});

describe('origem antiga → classificação nova (só o inequívoco)', () => {
  it('origem inequívoca recebe tipo e causador', () => {
    expect(classificarOrigemLegada('Erro expedição – endereço incorreto')).toEqual({ tipo_problema: 'Endereço incorreto', causador: 'Expedição' });
    expect(classificarOrigemLegada('Erro vendedora – endereço incorreto')).toEqual({ tipo_problema: 'Endereço incorreto', causador: 'Comercial' });
    expect(classificarOrigemLegada('Extravio Correios')).toEqual({ tipo_problema: 'Extravio', causador: 'Correios' });
  });

  it('"Outro" continua sendo o tipo Outro, e "A definir" vira "A apurar"', () => {
    expect(classificarOrigemLegada('Outro')).toEqual({ tipo_problema: 'Outro', causador: 'A apurar' });
  });

  it('origens ambíguas recebem só o causador e pedem revisão do tipo', () => {
    expect(classificarOrigemLegada('Erro de faturamento / NF (destinatário ou endereço)')).toEqual({ tipo_problema: null, causador: 'Financeiro' });
    expect(classificarOrigemLegada('Erro da expedição e do financeiro')).toEqual({ tipo_problema: null, causador: 'Expedição e Financeiro' });
    expect(MAPEAMENTO_ORIGEM_LEGADA.filter(([, tipo]) => tipo === null)).toHaveLength(2);
  });

  it('origem desconhecida ou ausente não recebe classificação', () => {
    expect(classificarOrigemLegada('Erro de separação')).toEqual({ tipo_problema: null, causador: null });
    expect(classificarOrigemLegada(null)).toEqual({ tipo_problema: null, causador: null });
    expect(classificarOrigemLegada(undefined)).toEqual({ tipo_problema: null, causador: null });
  });
});

describe('situação do custo', () => {
  it('ausência de valor não vira "Não" nem custo zero', () => {
    expect(situacaoCustoInicial({})).toBe('Em apuração');
    expect(situacaoCustoInicial({ custo_produto: 0, custo_frete_adicional: 0 })).toBe('Em apuração');
    expect(situacaoCustoInicial({ valor_reembolsado: 5 })).toBe('Em apuração');
  });

  it('custo positivo dá "Sim" no registro novo', () => {
    expect(situacaoCustoInicial({ custo_multa_outros: 12.5 })).toBe('Sim');
  });

  it('reembolso positivo conta como valor registrado (impede "Não")', () => {
    expect(temValorRegistrado({ valor_reembolsado: 5 })).toBe(true);
    expect(temValorRegistrado({ custo_produto: 0, valor_reembolsado: 0 })).toBe(false);
  });
});

describe('regras de persistência', () => {
  it('valor fora da lista é recusado com o mesmo texto do banco', () => {
    expect(validarClassificacaoNc(null, { tipo_problema: 'Inventado', causador: 'Expedição' }, LISTAS)).toBe('Tipo do problema fora da lista: Inventado');
    expect(validarClassificacaoNc(null, { tipo_problema: 'Endereço incorreto', causador: 'Ninguém' }, LISTAS)).toBe('Origem / causador fora da lista: Ninguém');
  });

  it('área de tratativa precisa estar na lista de áreas', () => {
    expect(validarClassificacaoNc(null, { ...REGISTRO_COMPLETO, area_tratativa: 'Pessoa Fulana' }, LISTAS)).toBe(
      'Área responsável pela tratativa fora da lista: Pessoa Fulana'
    );
    expect(validarClassificacaoNc(null, { ...REGISTRO_COMPLETO, area_tratativa: 'A definir' }, LISTAS)).toBeNull();
  });

  it('valor antigo sem mudança não é reconferido (valor desativado depois continua válido)', () => {
    expect(validarClassificacaoNc({ tipo_problema: 'Desativado' }, { tipo_problema: 'Desativado' }, LISTAS)).toBeNull();
  });

  it('"Não" com custo ou reembolso positivo é recusado; zero é aceito', () => {
    expect(validarClassificacaoNc(null, { ...REGISTRO_COMPLETO, custo_situacao: 'Não', custo_produto: 10 }, LISTAS)).toBe(MENSAGEM_CUSTO_NAO_COM_VALOR);
    expect(validarClassificacaoNc(null, { ...REGISTRO_COMPLETO, custo_situacao: 'Não', valor_reembolsado: 3 }, LISTAS)).toBe(MENSAGEM_CUSTO_NAO_COM_VALOR);
    expect(validarClassificacaoNc(null, { ...REGISTRO_COMPLETO, custo_situacao: 'Não', custo_produto: 0 }, LISTAS)).toBeNull();
  });

  it('mudar a situação não pode apagar valor já registrado', () => {
    const anterior = { custo_situacao: 'Sim' as const, custo_produto: 10 };
    expect(validarClassificacaoNc(anterior, { custo_situacao: 'Em apuração', custo_produto: null }, LISTAS)).toBe(MENSAGEM_SITUACAO_NAO_APAGA);
  });

  it('mudar a situação mantendo os valores é aceito; editar valor sem mudar a situação também', () => {
    const anterior = { custo_situacao: 'Sim' as const, custo_produto: 10 };
    expect(validarClassificacaoNc(anterior, { custo_situacao: 'Em apuração', custo_produto: 10 }, LISTAS)).toBeNull();
    expect(validarClassificacaoNc(anterior, { custo_situacao: 'Sim', custo_produto: 12 }, LISTAS)).toBeNull();
  });

  it('a situação não volta a ficar sem informação e aceita só os três valores', () => {
    expect(validarClassificacaoNc({ custo_situacao: 'Sim' }, { custo_situacao: null }, LISTAS)).toBe(MENSAGEM_SITUACAO_SEM_INFORMACAO);
    expect(validarClassificacaoNc(null, { ...REGISTRO_COMPLETO, custo_situacao: 'Talvez' as 'Sim' }, LISTAS)).toBe('Situação do custo inválida.');
  });
});

describe('derivação ao gravar', () => {
  it('INSERT com origem antiga preenche tipo e causador e define a situação inicial', () => {
    const r = derivarClassificacao(null, { ...base, origem: 'Extravio Correios' });
    expect(r).toMatchObject({ tipo_problema: 'Extravio', causador: 'Correios', custo_situacao: 'Em apuração' });
  });

  it('INSERT não sobrescreve a classificação informada', () => {
    const r = derivarClassificacao(null, { ...base, origem: 'Extravio Correios', tipo_problema: 'Endereço não localizado' });
    expect(r.tipo_problema).toBe('Endereço não localizado');
    expect(r.causador).toBe('Correios');
  });

  it('UPDATE reclassifica só o que está vazio, e só se a origem mudou', () => {
    const anterior = { ...base, origem: 'Outro', tipo_problema: 'Outro', causador: 'A apurar', custo_situacao: null };
    const mudou = derivarClassificacao(anterior, { ...anterior, origem: 'Extravio Correios', causador: null });
    expect(mudou.tipo_problema).toBe('Outro');
    expect(mudou.causador).toBe('Correios');
    expect(mudou.custo_situacao).toBeNull();

    const igual = derivarClassificacao(anterior, { ...anterior, origem: 'Outro', causador: null });
    expect(igual.causador).toBeNull();
  });
});

describe('registro novo: classificação explícita', () => {
  it('sem tipo ou sem causador o registro novo é recusado, mesmo com origem antiga', () => {
    expect(validarClassificacaoNc(null, { ...base, origem: 'Extravio Correios', causador: 'Correios' }, LISTAS)).toBe(MENSAGEM_TIPO_OBRIGATORIO);
    expect(validarClassificacaoNc(null, { ...base, tipo_problema: 'Extravio' }, LISTAS)).toBe(MENSAGEM_CAUSADOR_OBRIGATORIO);
  });

  it('"Outro" exige descrição no registro novo; com descrição, aceita', () => {
    expect(validarClassificacaoNc(null, { ...base, tipo_problema: 'Outro', causador: 'A apurar', descricao: '  ' }, LISTAS)).toBe(
      MENSAGEM_OUTRO_SEM_DESCRICAO
    );
    expect(validarClassificacaoNc(null, { ...base, tipo_problema: 'Outro', causador: 'A apurar', descricao: 'Peça trocada' }, LISTAS)).toBeNull();
  });

  it('tipo e causador não voltam a ficar vazios depois de informados', () => {
    const anterior = { ...base, tipo_problema: 'Extravio', causador: 'Correios' };
    expect(validarClassificacaoNc(anterior, { ...anterior, tipo_problema: null }, LISTAS)).toBe(MENSAGEM_TIPO_NAO_VOLTA);
    expect(validarClassificacaoNc(anterior, { ...anterior, causador: null }, LISTAS)).toBe(MENSAGEM_CAUSADOR_NAO_VOLTA);
  });

  it('registro antigo sem classificação nova continua editável, sem obrigar a classificar agora', () => {
    const antigo = { ...base, origem: 'Erro da expedição e do financeiro', tipo_problema: null, causador: 'Expedição e Financeiro' };
    expect(validarClassificacaoNc(antigo, { ...antigo, cliente: 'Outra cliente' }, LISTAS)).toBeNull();
  });

  it('em registro antigo, "Outro" só passa a exigir descrição se o tipo ou a descrição mudarem', () => {
    const antigo = { ...base, tipo_problema: 'Outro', causador: 'A apurar', descricao: null };
    expect(validarClassificacaoNc(antigo, { ...antigo, cliente: 'X' }, LISTAS)).toBeNull();
    expect(validarClassificacaoNc(antigo, { ...antigo, descricao: '' }, LISTAS)).toBe(MENSAGEM_OUTRO_SEM_DESCRICAO);
  });
});

describe('pendência de classificação', () => {
  it('pendente enquanto faltar tipo ou causador', () => {
    expect(classificacaoPendente({ tipo_problema: null, causador: 'Correios' })).toBe(true);
    expect(classificacaoPendente({ tipo_problema: 'Extravio', causador: null })).toBe(true);
    expect(classificacaoPendente({ tipo_problema: 'Extravio', causador: 'Correios' })).toBe(false);
  });
});

describe('schema do formulário', () => {
  const vazio: NcFormInput = {
    data_ocorrencia: '', data_identificacao: '', empresa: '', cliente: '', vendedora: '', romaneio: '',
    valor_romaneio: '', nf: '', rastreio: '', data_postagem: '',
    tipo_saida: '', origem: '', como_identificada: '',
    status_correios: '', descricao: '', resolucao: '', novo_rastreio: '',
    valor_declarado: '', valor_venda: '', frete_original: '',
    custo_produto: '', custo_frete_adicional: '', custo_multa_outros: '', reembolso_correios: '', numero_pi: '',
    valor_reembolsado: '',
    tempo_tratativa_min: '', status: 'Aberta', data_encerramento: '',
  };
  const minimo: NcFormInput = { ...vazio, data_ocorrencia: '2026-10-01', empresa: 'Azime', origem: 'Outro' };

  it('o formulário atual continua válido sem os campos novos', () => {
    const r = ncSchema.safeParse(minimo);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.custo_situacao).toBeUndefined();
  });

  it('aceita os três valores de situação do custo e vazio; recusa outro valor', () => {
    for (const situacao of ['Sim', 'Não', 'Em apuração', '']) {
      expect(ncSchema.safeParse({ ...minimo, custo_situacao: situacao }).success, situacao).toBe(true);
    }
    expect(ncSchema.safeParse({ ...minimo, custo_situacao: 'Talvez' }).success).toBe(false);
  });

  it('"Não" com custo no formulário gera erro no campo da situação', () => {
    const r = ncSchema.safeParse({ ...minimo, custo_situacao: 'Não', custo_produto: '10' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.find((i) => i.path[0] === 'custo_situacao')?.message).toBe(MENSAGEM_CUSTO_NAO_COM_VALOR);
  });
});
