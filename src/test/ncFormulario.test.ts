import { describe, expect, it } from 'vitest';
import { ncAberturaSchema, ncSchema } from '../schemas/ncSchema';
import { MENSAGEM_CONFLITO_NAO, VAZIO, estadoCustos, novaAbertura, paraFormulario, rotuloCustoTotal } from '../lib/ncFormulario';
import { MENSAGEM_CUSTO_NAO_COM_VALOR } from '../lib/ncClassificacao';
import type { NaoConformidade } from '../types';

/** NC gravada (como vem do banco pela vw_nao_conformidades), com campos calculados. */
function ncGravada(extras: Partial<NaoConformidade> = {}): NaoConformidade {
  return {
    id: '0b2f9a61-2999-4a99-8a99-000000002999', numero: 2999, codigo: 'NC-2999', created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-02T10:00:00Z', importada: false,
    data_ocorrencia: '2026-10-01', data_identificacao: '2026-10-02', empresa: 'Alinare', cliente: 'Ateliê Teste',
    vendedora: 'Camila', romaneio: 'ROM-1', valor_romaneio: 1840.5, nf: 'NF-77', rastreio: 'AB123456789BR',
    data_postagem: '2026-10-01', tipo_saida: 'Venda', origem: 'Erro expedição – endereço incorreto',
    como_identificada: 'Conferência da embalagem', status_correios: 'Entregue', descricao: 'Descrição', resolucao: null,
    novo_rastreio: null, valor_declarado: 1800, valor_venda: 1840, frete_original: 32,
    custo_produto: 10.5, custo_frete_adicional: null, custo_multa_outros: null, reembolso_correios: 'Não',
    numero_pi: 'PI-9', valor_reembolsado: 0, tempo_tratativa_min: 35, status: 'Em tratativa', data_encerramento: null,
    tipo_problema: 'Endereço incorreto', causador: 'Expedição', area_registro: 'Comercial', area_tratativa: 'Expedição',
    custo_situacao: 'Sim', custo_total: 10.5, custo_liquido: 10.5, area_responsavel: 'Expedição', evitavel: 'Sim',
    dias_em_aberto: 3, qtd_reversas: 0,
    ...extras,
  };
}

describe('conversão registro gravado ↔ formulário (sem perder campo oculto)', () => {
  it('ida e volta: o que o formulário grava é o que estava no banco', () => {
    const nc = ncGravada();
    const dados = ncSchema.safeParse(paraFormulario(nc));
    expect(dados.success).toBe(true);
    if (!dados.success) return;
    expect(dados.data).toMatchObject({
      origem: 'Erro expedição – endereço incorreto', tipo_problema: 'Endereço incorreto', causador: 'Expedição',
      area_registro: 'Comercial', area_tratativa: 'Expedição', custo_situacao: 'Sim', custo_produto: 10.5,
      custo_frete_adicional: null, custo_multa_outros: null, valor_reembolsado: 0, nf: 'NF-77', rastreio: 'AB123456789BR',
      romaneio: 'ROM-1', valor_romaneio: 1840.5, numero_pi: 'PI-9', status: 'Em tratativa', tempo_tratativa_min: 35,
    });
  });

  it('campo vazio continua vazio (null) e zero continua zero', () => {
    const nc = ncGravada({ custo_frete_adicional: 0, custo_multa_outros: null, descricao: null, cliente: null });
    const dados = ncSchema.safeParse(paraFormulario(nc));
    expect(dados.success && dados.data.custo_frete_adicional).toBe(0);
    expect(dados.success && dados.data.custo_multa_outros).toBeNull();
    expect(dados.success && dados.data.descricao).toBeNull();
    expect(dados.success && dados.data.cliente).toBeNull();
  });

  it('registro novo (sem origem antiga) round-trip sem inventar origem', () => {
    const nc = ncGravada({ origem: null, area_responsavel: null, evitavel: null, custo_situacao: 'Em apuração', custo_produto: null, custo_total: null, custo_liquido: null });
    const dados = ncSchema.safeParse(paraFormulario(nc));
    expect(dados.success && dados.data.origem).toBeNull();
    expect(dados.success && dados.data.custo_situacao).toBe('Em apuração');
    expect(dados.success && dados.data.custo_produto).toBeNull();
  });

  it('registro antigo sem situação do custo continua sem situação (não vira "Não")', () => {
    const nc = ncGravada({ custo_situacao: null, custo_produto: null, tipo_problema: null, causador: null });
    const dados = ncSchema.safeParse(paraFormulario(nc));
    expect(dados.success && dados.data.custo_situacao).toBeNull();
    expect(dados.success && dados.data.tipo_problema).toBeNull();
  });

  it('todas as chaves do formulário existem no registro gravado (nenhuma gravada como vazia por engano)', () => {
    const chaves = Object.keys(VAZIO);
    for (const chave of chaves) {
      expect(paraFormulario(ncGravada())).toHaveProperty(chave);
    }
  });
});

describe('custos: ausência não é zero nem "Não"', () => {
  it('Sim: campos visíveis; total "Valor não informado" sem valor, nunca R$ 0,00', () => {
    const form = { ...VAZIO, custo_situacao: 'Sim' as const };
    expect(estadoCustos(form).mostrarValores).toBe(true);
    expect(rotuloCustoTotal('Sim', { custo_produto: null, custo_frete_adicional: null, custo_multa_outros: null })).toBe('Valor não informado');
  });

  it('Em apuração: campos visíveis; sem conflito', () => {
    const estado = estadoCustos({ ...VAZIO, custo_situacao: 'Em apuração' });
    expect(estado).toEqual({ mostrarValores: true, conflitoNao: null });
    expect(rotuloCustoTotal('Em apuração', { custo_produto: null, custo_frete_adicional: null, custo_multa_outros: null })).toBe('A apurar');
  });

  it('Não sem valor: os campos em reais ficam ocultos e nada é pedido; total é "Sem custo"', () => {
    expect(estadoCustos({ ...VAZIO, custo_situacao: 'Não' })).toEqual({ mostrarValores: false, conflitoNao: null });
    expect(rotuloCustoTotal('Não', { custo_produto: null, custo_frete_adicional: null, custo_multa_outros: null })).toBe('Sem custo');
  });

  it('Não com zero explícito: aceito, sem conflito, campos ocultos', () => {
    expect(estadoCustos({ ...VAZIO, custo_situacao: 'Não', custo_produto: '0' })).toEqual({ mostrarValores: false, conflitoNao: null });
  });

  it('Não com valor registrado: conflito explicado e campos visíveis (nada é ocultado nem apagado)', () => {
    const estado = estadoCustos({ ...VAZIO, custo_situacao: 'Não', custo_produto: '10.5' });
    expect(estado).toEqual({ mostrarValores: true, conflitoNao: MENSAGEM_CONFLITO_NAO });
  });

  it('sem resposta: só aparece se já houver algum valor (registro antigo)', () => {
    expect(estadoCustos({ ...VAZIO, custo_situacao: '' }).mostrarValores).toBe(false);
    expect(estadoCustos({ ...VAZIO, custo_situacao: '', valor_reembolsado: '5' }).mostrarValores).toBe(true);
  });
});

describe('abertura simplificada', () => {
  const valido = {
    ...novaAbertura('2026-11-09'), empresa: 'Alinare', tipo_problema: 'Endereço incorreto', causador: 'Expedição', custo_situacao: 'Em apuração' as const,
  };

  it('data sugerida é hoje, editável; status começa Aberta', () => {
    expect(novaAbertura('2026-11-09')).toMatchObject({ data_ocorrencia: '2026-11-09', status: 'Aberta', tipo_problema: '' });
  });

  it('um formulário completo passa; cliente é opcional', () => {
    const r = ncAberturaSchema.safeParse(valido);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.cliente).toBeNull();
  });

  it('tipo, causador e situação do custo são obrigatórios, com a mensagem de cada um', () => {
    const r = ncAberturaSchema.safeParse({ ...valido, tipo_problema: '', causador: '', custo_situacao: '' });
    expect(r.success).toBe(false);
    if (r.success) return;
    const mensagens = Object.fromEntries(r.error.issues.map((i) => [i.path[0], i.message]));
    expect(mensagens.tipo_problema).toBe('Selecione o tipo do problema.');
    expect(mensagens.causador).toBe('Informe a origem / causador. Use "A apurar" se não souber.');
    expect(mensagens.custo_situacao).toBe('Informe se houve custo.');
  });

  it('"Outro" sem descrição (ou só com espaços) é recusado; com descrição passa', () => {
    const semDescricao = ncAberturaSchema.safeParse({ ...valido, tipo_problema: 'Outro', descricao: '   ' });
    expect(semDescricao.success).toBe(false);
    if (!semDescricao.success) expect(semDescricao.error.issues.find((i) => i.path[0] === 'descricao')?.message).toBe('Descreva o problema quando o tipo for Outro.');
    expect(ncAberturaSchema.safeParse({ ...valido, tipo_problema: 'Outro', descricao: 'Peça trocada' }).success).toBe(true);
  });

  it('data da ocorrência não pode ser futura', () => {
    const r = ncAberturaSchema.safeParse({ ...valido, data_ocorrencia: '2999-01-01' });
    expect(r.success).toBe(false);
  });

  it('"Não" sem valor é aceito e não pede campos em reais', () => {
    expect(ncAberturaSchema.safeParse({ ...valido, custo_situacao: 'Não' }).success).toBe(true);
  });

  it('"Não" com valor é recusado no formulário, com a mesma mensagem do banco', () => {
    const r = ncAberturaSchema.safeParse({ ...valido, custo_situacao: 'Não', custo_produto: '10' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.find((i) => i.path[0] === 'custo_situacao')?.message).toBe(MENSAGEM_CUSTO_NAO_COM_VALOR);
  });
});
