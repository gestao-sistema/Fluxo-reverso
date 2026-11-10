import { describe, expect, it } from 'vitest';
import {
  A_APURAR,
  SEM_CUSTO,
  SEM_VALOR_REGISTRADO,
  SITUACAO_NAO_INFORMADA,
  VALOR_NAO_INFORMADO,
  atendeFiltroCusto,
  cobrirCusto,
  descreverCusto,
  resumirGrupoCusto,
  rotuloReembolso,
  somarCusto,
} from '../lib/ncCustos';
import type { RegistroCusto } from '../lib/ncCustos';

const VAZIOS = { custo_produto: null, custo_frete_adicional: null, custo_multa_outros: null, valor_reembolsado: null };

describe('situação e valor: vazio não é zero, zero é zero', () => {
  it('Não sem valor: "Sem custo" e situação "Não"; nada é pedido', () => {
    const d = descreverCusto('Não', VAZIOS);
    expect(d).toMatchObject({ categoria: 'sem_custo', conflito: false, total: null, liquido: null, rotuloTotal: SEM_CUSTO, rotuloLiquido: SEM_CUSTO, rotuloSituacao: 'Não' });
  });

  it('Não com zeros gravados: continua "Sem custo" e mantém os zeros (não são apagados)', () => {
    const d = descreverCusto('Não', { ...VAZIOS, custo_produto: 0, custo_frete_adicional: 0 });
    expect(d).toMatchObject({ categoria: 'sem_custo', total: 0, rotuloTotal: SEM_CUSTO, rotuloSituacao: 'Não' });
  });

  it('Não com valor positivo (só existe antes de gravar): conflito explicado, sem "Sem custo"', () => {
    const d = descreverCusto('Não', { ...VAZIOS, custo_produto: 100 });
    expect(d.conflito).toBe(true);
    expect(d.rotuloTotal).toBe('R$ 100,00 (conflito: situação “Não” com valor)');
  });

  it('Sim sem nenhum valor: "Valor não informado", nunca R$ 0,00', () => {
    const d = descreverCusto('Sim', VAZIOS);
    expect(d).toMatchObject({ categoria: 'valor_nao_informado', total: null, rotuloTotal: VALOR_NAO_INFORMADO, rotuloSituacao: 'Sim (valor não informado)' });
  });

  it('Em apuração sem nenhum valor: "A apurar"', () => {
    const d = descreverCusto('Em apuração', VAZIOS);
    expect(d).toMatchObject({ categoria: 'a_apurar', total: null, rotuloTotal: A_APURAR, rotuloSituacao: 'Em apuração (a apurar)' });
  });

  it('situação ausente sem valor: "Não informado"', () => {
    const d = descreverCusto(null, VAZIOS);
    expect(d).toMatchObject({ categoria: 'sem_situacao', rotuloTotal: SITUACAO_NAO_INFORMADA, rotuloSituacao: 'Não informado' });
  });

  it('Sim com zero explícito em todos os campos: total R$ 0,00 completo (zero digitado é zero)', () => {
    const d = descreverCusto('Sim', { ...VAZIOS, custo_produto: 0, custo_frete_adicional: 0, custo_multa_outros: 0 });
    expect(d).toMatchObject({ categoria: 'com_valor', total: 0, parcial: false, rotuloTotal: 'R$ 0,00', rotuloSituacao: 'Sim' });
  });

  it('Em apuração com zero explícito: "R$ 0,00 (em apuração)", não "Sem custo"', () => {
    const d = descreverCusto('Em apuração', { ...VAZIOS, custo_produto: 0, custo_frete_adicional: 0, custo_multa_outros: 0 });
    expect(d.rotuloTotal).toBe('R$ 0,00 (em apuração)');
    expect(d.rotuloSituacao).toBe('Em apuração');
  });
});

describe('totais parciais: um total com campo vazio não parece completo', () => {
  it('Sim com produto informado e frete e multa vazios: parcial', () => {
    const d = descreverCusto('Sim', { ...VAZIOS, custo_produto: 100 });
    expect(d).toMatchObject({ categoria: 'com_valor', total: 100, parcial: true, rotuloTotal: 'R$ 100,00 (parcial)', rotuloSituacao: 'Sim (parcial)' });
  });

  it('Em apuração parcial: diz que é parcial e que está em apuração', () => {
    const d = descreverCusto('Em apuração', { ...VAZIOS, custo_produto: 50 });
    expect(d.rotuloTotal).toBe('R$ 50,00 (parcial, em apuração)');
    expect(d.rotuloSituacao).toBe('Em apuração (parcial)');
  });

  it('situação ausente com valor: o valor aparece com a observação de situação não informada', () => {
    const d = descreverCusto(null, { ...VAZIOS, custo_produto: 30, custo_frete_adicional: 0, custo_multa_outros: 0 });
    expect(d).toMatchObject({ categoria: 'com_valor', parcial: false, rotuloTotal: 'R$ 30,00 (situação não informada)', rotuloSituacao: 'Não informado' });
  });

  it('Sim só com reembolso e sem custo: o total continua desconhecido', () => {
    const d = descreverCusto('Sim', { ...VAZIOS, valor_reembolsado: 50 });
    expect(d).toMatchObject({ categoria: 'valor_nao_informado', total: null, liquido: null, rotuloTotal: VALOR_NAO_INFORMADO });
  });
});

describe('reembolso: vazio não comprova ausência; zero informado é informado', () => {
  it('reembolso vazio com total: líquido = total, com aviso de reembolso não informado', () => {
    const d = descreverCusto('Sim', { ...VAZIOS, custo_produto: 100, custo_frete_adicional: 40, custo_multa_outros: 0 });
    expect(d).toMatchObject({ total: 140, liquido: 140, reembolsoInformado: false, notaReembolso: 'reembolso não informado' });
  });

  it('reembolso zero informado: líquido = total e sem aviso', () => {
    const d = descreverCusto('Sim', { ...VAZIOS, custo_produto: 100, custo_frete_adicional: 40, custo_multa_outros: 0, valor_reembolsado: 0 });
    expect(d).toMatchObject({ total: 140, liquido: 140, reembolsoInformado: true, notaReembolso: null });
  });

  it('reembolso informado: líquido = total − reembolso', () => {
    const d = descreverCusto('Sim', { ...VAZIOS, custo_produto: 100, custo_frete_adicional: 40, custo_multa_outros: 0, valor_reembolsado: 20 });
    expect(d).toMatchObject({ total: 140, liquido: 120, notaReembolso: null });
  });

  it('texto do campo: vazio não é zero; zero é informado', () => {
    expect(rotuloReembolso('')).toMatch(/^Não informado\. Vazio não é zero/);
    expect(rotuloReembolso(null)).toMatch(/^Não informado\. Vazio não é zero/);
    expect(rotuloReembolso('0')).toBe('Zero informado (R$ 0,00).');
    expect(rotuloReembolso(20)).toBe('Informado: R$ 20,00.');
  });
});

describe('filtro de custo da lista', () => {
  const registros: Record<string, RegistroCusto> = {
    naoZero: { custo_situacao: 'Não', custo_produto: 0 },
    simSemValor: { custo_situacao: 'Sim', ...VAZIOS },
    emApuracaoSemValor: { custo_situacao: 'Em apuração', ...VAZIOS },
    simComValor: { custo_situacao: 'Sim', custo_produto: 100 },
    emApuracaoComValor: { custo_situacao: 'Em apuração', custo_produto: 50 },
    semSituacaoComValor: { custo_situacao: null, custo_produto: 30 },
    semSituacaoSemValor: { custo_situacao: null, ...VAZIOS },
  };
  const casa = (filtro: Parameters<typeof atendeFiltroCusto>[1]) =>
    Object.keys(registros).filter((k) => atendeFiltroCusto(registros[k], filtro));

  it('cada filtro separa a categoria correspondente', () => {
    expect(casa('todos')).toHaveLength(7);
    expect(casa('sem_custo')).toEqual(['naoZero']);
    expect(casa('valor_nao_informado')).toEqual(['simSemValor']);
    expect(casa('a_apurar')).toEqual(['emApuracaoSemValor']);
    expect(casa('com_valor')).toEqual(['simComValor', 'emApuracaoComValor', 'semSituacaoComValor']);
    expect(casa('sem_situacao')).toEqual(['semSituacaoComValor', 'semSituacaoSemValor']);
  });
});

describe('cobertura e somas: as contas do painel e do relatório', () => {
  const conjunto: RegistroCusto[] = [
    { custo_situacao: 'Sim', custo_produto: 100, custo_frete_adicional: 40, custo_multa_outros: 0, valor_reembolsado: 20 },
    { custo_situacao: 'Sim', ...VAZIOS },
    { custo_situacao: 'Não', custo_produto: 0, custo_frete_adicional: 0 },
    { custo_situacao: 'Em apuração', ...VAZIOS },
    { custo_situacao: null, ...VAZIOS },
    { custo_situacao: 'Em apuração', custo_produto: 50 },
  ];

  it('cinco categorias exclusivas somam o total de registros', () => {
    const c = cobrirCusto(conjunto);
    expect([c.semCusto, c.comValor, c.valorNaoInformado, c.aApurar, c.semSituacaoSemValor]).toEqual([1, 2, 1, 1, 1]);
    expect(c.semCusto + c.comValor + c.valorNaoInformado + c.aApurar + c.semSituacaoSemValor).toBe(conjunto.length);
  });

  it('cobertura detalhada: em apuração, parciais e reembolso informado', () => {
    expect(cobrirCusto(conjunto)).toMatchObject({
      comValorSim: 1, comValorEmApuracao: 1, comValorSemSituacao: 0, parciais: 1, emApuracao: 2,
      situacaoNaoInformada: 1, reembolsoInformado: 1, comValorSemReembolso: 1,
    });
  });

  it('somas: só registros com valor entram; sem valor a soma é null, não zero', () => {
    const soma = somarCusto(conjunto);
    expect(soma).toMatchObject({ total: 190, liquido: 170, reembolso: 20, comValor: 2, parciais: 1, emApuracao: 2 });
    expect(somarCusto([{ custo_situacao: 'Sim', ...VAZIOS }, { custo_situacao: 'Não', ...VAZIOS }])).toMatchObject({
      total: null, liquido: null, reembolso: null, comValor: 0,
    });
  });
});

describe('resumo de grupo (linha de tabela)', () => {
  it('grupo vazio: traço', () => {
    expect(resumirGrupoCusto([])).toMatchObject({ rotulo: '—', detalhe: null });
  });

  it('grupo só com "Sim sem valor": "Valor não informado"', () => {
    expect(resumirGrupoCusto([{ custo_situacao: 'Sim', ...VAZIOS }])).toMatchObject({ rotulo: VALOR_NAO_INFORMADO, detalhe: null });
  });

  it('grupo sem valor com estados diferentes: "Sem valor registrado", sem zero', () => {
    expect(resumirGrupoCusto([{ custo_situacao: 'Sim', ...VAZIOS }, { custo_situacao: 'Em apuração', ...VAZIOS }])).toMatchObject({
      rotulo: SEM_VALOR_REGISTRADO, liquido: null,
    });
  });

  it('grupo com cobertura: valor do que foi informado, com contagens de cobertura', () => {
    const r = resumirGrupoCusto([
      { custo_situacao: 'Sim', custo_produto: 100 },
      { custo_situacao: 'Sim', ...VAZIOS },
      { custo_situacao: 'Em apuração', ...VAZIOS },
    ]);
    expect(r).toMatchObject({ rotulo: 'R$ 100,00', comValor: 1, parciais: 1 });
    expect(r.detalhe).toBe('1 de 3 com valor · 1 parcial · 1 em apuração');
  });
});
