import { describe, expect, it } from 'vitest';
import {
  CAMPOS_EDITAVEIS,
  ConflitoEdicaoNc,
  ErroEdicaoNc,
  camposAlterados,
  descreverCorrecao,
  listarCorrecoes,
  mensagemDaRegra,
  reconciliarFormulario,
  validarAlteracoes,
  valorComparavel,
} from '../lib/ncEdicao';
import { MENSAGEM_NAO_COM_CAMPO_EM_BRANCO, VAZIO, paraFormulario } from '../lib/ncFormulario';
import { MENSAGEM_SITUACAO_NAO_APAGA } from '../lib/ncClassificacao';
import type { ListasNc, NaoConformidade } from '../types';

const LISTAS: ListasNc = {
  origens: [],
  itens: [
    { lista: 'tipo_problema', valor: 'Endereço incorreto', ordem: 1, ativo: true },
    { lista: 'causador', valor: 'Expedição', ordem: 1, ativo: true },
    { lista: 'empresa', valor: 'Alinare', ordem: 1, ativo: true },
    { lista: 'tipo_saida', valor: 'Venda', ordem: 1, ativo: true },
  ],
};

/** NC gravada como o serviço a devolve (campos calculados já preenchidos). */
function nc(extras: Partial<NaoConformidade>): NaoConformidade {
  return {
    id: 'nc-1', numero: 2404, codigo: 'NC-2404', created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z',
    importada: false, data_ocorrencia: '2026-10-03', data_identificacao: null, empresa: 'Alinare', cliente: 'Ateliê Aurora',
    vendedora: null, romaneio: null, valor_romaneio: null, nf: 'NF-1001', rastreio: null, data_postagem: null, tipo_saida: 'Venda',
    origem: null, como_identificada: null, status_correios: null, descricao: 'Cliente pediu <b>troca</b> urgente', resolucao: null,
    novo_rastreio: null, valor_declarado: null, valor_venda: null, frete_original: null, custo_produto: 95,
    custo_frete_adicional: null, custo_multa_outros: null, reembolso_correios: null, numero_pi: null, valor_reembolsado: null,
    tempo_tratativa_min: null, status: 'Aberta', data_encerramento: null, tipo_problema: 'Endereço incorreto', causador: 'Expedição',
    area_registro: null, area_tratativa: null, custo_situacao: 'Sim', custo_total: 95, custo_liquido: 95,
    area_responsavel: null, evitavel: null, dias_em_aberto: 0, qtd_reversas: 0, codigo_cliente: undefined,
    ...extras,
  } as unknown as NaoConformidade;
}

/** Formulário como a tela o monta a partir do registro. */
const formDe = (registro: NaoConformidade) => paraFormulario(registro);

describe('o que mudou: comparação normalizada com a base', () => {
  it('sem alteração, nenhum campo entra', () => {
    const base = formDe(nc({}));
    expect(camposAlterados(base, { ...base })).toEqual([]);
  });

  it('só a NF mudou: só a NF entra', () => {
    const base = formDe(nc({}));
    expect(camposAlterados(base, { ...base, nf: 'NF-2002' })).toEqual(['nf']);
  });

  it('espaços nas pontas e "100" × "100.00" não são alteração efetiva', () => {
    const base = formDe(nc({ cliente: 'Ateliê Aurora' }));
    expect(camposAlterados(base, { ...base, cliente: '  Ateliê Aurora ' })).toEqual([]);
    expect(camposAlterados(base, { ...base, custo_produto: '95.00' })).toEqual([]);
  });

  it('vazio contra vazio não conta; vazio contra zero conta', () => {
    const base = formDe(nc({ custo_frete_adicional: null }));
    expect(camposAlterados(base, { ...base, custo_frete_adicional: '' })).toEqual([]);
    expect(camposAlterados(base, { ...base, custo_frete_adicional: '0' })).toEqual(['custo_frete_adicional']);
  });

  it('valores comparáveis: texto sem pontas e número em centavos', () => {
    expect(valorComparavel('cliente', '  x  ')).toBe('x');
    expect(valorComparavel('custo_produto', '10,5')).toBe('10.5');
    expect(valorComparavel('custo_produto', '')).toBeNull();
  });
});

describe('texto legado intocado não é regravado', () => {
  it('a descrição com tags não entra quando só a NF muda', () => {
    const base = formDe(nc({}));
    const alterados = camposAlterados(base, { ...base, nf: 'NF-2002' });
    const resultado = validarAlteracoes(nc({}), alterados, { ...base, nf: 'NF-2002' }, LISTAS);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.campos).toEqual({ nf: 'NF-2002' });
      expect(resultado.campos).not.toHaveProperty('descricao');
    }
  });

  it('quando a descrição é editada, o campo editado passa pela limpeza de tags (regra existente)', () => {
    const base = formDe(nc({}));
    const form = { ...base, descricao: 'Cliente pediu <b>troca</b> urgente hoje' };
    const resultado = validarAlteracoes(nc({}), ['descricao'], form, LISTAS);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.campos.descricao).toBe('Cliente pediu troca urgente hoje');
  });
});

describe('validação só dos campos alterados', () => {
  it('um campo editado inválido é recusado com a mensagem da regra; campos intocados não são revalidados', () => {
    // Registro legado com cliente acima do limite atual: não bloqueia a edição de outro campo
    const legado = nc({ cliente: 'C'.repeat(200) });
    const base = formDe(legado);
    const resultado = validarAlteracoes(legado, ['nf'], { ...base, nf: 'NF-7777' }, LISTAS);
    expect(resultado.ok).toBe(true);
    const comErro = validarAlteracoes(legado, ['cliente'], { ...base, cliente: 'C'.repeat(200) }, LISTAS);
    expect(comErro.ok).toBe(false);
    if (!comErro.ok) expect(comErro.erros.cliente).toMatch(/Máximo de 150 caracteres/);
  });

  it('"Não" com valor registrado é recusado pelas regras que envolvem o campo alterado', () => {
    const registro = nc({});
    const base = formDe(registro);
    const resultado = validarAlteracoes(registro, ['custo_situacao'], { ...base, custo_situacao: 'Não' }, LISTAS);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.erros.custo_situacao).toMatch(/exige custos sem valor/);
  });

  it('apagar o valor e marcar "Não" na mesma alteração é recusado pela regra existente', () => {
    const registro = nc({});
    const base = formDe(registro);
    const resultado = validarAlteracoes(registro, ['custo_situacao', 'custo_produto'], {
      ...base, custo_situacao: 'Não', custo_produto: '',
    }, LISTAS);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.regra).toBe(MENSAGEM_SITUACAO_NAO_APAGA);
    expect(mensagemDaRegra(MENSAGEM_SITUACAO_NAO_APAGA)).toBe(MENSAGEM_NAO_COM_CAMPO_EM_BRANCO);
  });

  it('encerramento antes da identificação só é recusado quando uma das datas muda', () => {
    const registro = nc({ data_ocorrencia: '2026-10-10', data_encerramento: null });
    const base = formDe(registro);
    const semMudancaDeData = validarAlteracoes(registro, ['nf'], { ...base, nf: 'NF-9', data_encerramento: '2026-10-01' }, LISTAS);
    expect(semMudancaDeData.ok).toBe(true);
    const comMudancaDeData = validarAlteracoes(registro, ['data_encerramento'], { ...base, data_encerramento: '2026-10-01' }, LISTAS);
    expect(comMudancaDeData.ok).toBe(false);
    if (!comMudancaDeData.ok) expect(comMudancaDeData.erros.data_encerramento).toMatch(/não pode ser antes/);
  });
});

describe('correção de valor registrado: justificativa e confirmação', () => {
  it('mudar um valor já registrado é correção; preencher um vazio não é', () => {
    const registro = nc({ custo_produto: 95, custo_frete_adicional: null });
    const base = formDe(registro);
    const correcao = validarAlteracoes(registro, ['custo_produto'], { ...base, custo_produto: '90' }, LISTAS);
    expect(correcao.ok && correcao.correcoes).toEqual([{ campo: 'custo_produto', anterior: 95, posterior: 90 }]);
    const preenchimento = validarAlteracoes(registro, ['custo_frete_adicional'], { ...base, custo_frete_adicional: '40' }, LISTAS);
    expect(preenchimento.ok && preenchimento.correcoes.length).toBe(0);
  });

  it('zero registrado conta como valor: sair de zero é correção', () => {
    const registro = nc({ custo_produto: 0, custo_situacao: 'Sim' });
    const correcoes = listarCorrecoes(registro, { custo_produto: 15 });
    expect(correcoes).toHaveLength(1);
    expect(correcoes[0]).toMatchObject({ campo: 'custo_produto', anterior: 0, posterior: 15 });
  });

  it('a situação do custo é uma correção quando já estava registrada', () => {
    const correcoes = listarCorrecoes(nc({ custo_situacao: 'Sim' }), { custo_situacao: 'Em apuração' });
    expect(correcoes).toEqual([{ campo: 'custo_situacao', anterior: 'Sim', posterior: 'Em apuração' }]);
  });

  it('descrição da correção para a confirmação: zero aparece como zero informado', () => {
    const descricao = descreverCorrecao({ campo: 'custo_produto', anterior: 95, posterior: 0 });
    expect(descricao).toEqual({ rotulo: 'Custo — produto', antes: 'R$ 95,00', depois: 'R$ 0,00 (zero informado)' });
    expect(descreverCorrecao({ campo: 'valor_reembolsado', anterior: 20, posterior: null }).depois).toBe('(vazio)');
  });
});

describe('reconciliação: a digitação fica, o restante recebe a versão atual', () => {
  it('o que o usuário alterou continua; o que não alterou recebe o valor atual', () => {
    const aberta = nc({ nf: 'NF-1001', resolucao: null });
    const base = formDe(aberta);
    const digitado = { ...base, nf: 'NF-9999' };
    const atual = nc({ nf: 'NF-1001', resolucao: 'Reverso', updated_at: '2026-10-02T10:00:00.000Z' });
    const reconciliado = reconciliarFormulario(base, digitado, atual);
    expect(reconciliado.nf).toBe('NF-9999');
    expect(reconciliado.resolucao).toBe('Reverso');
    expect(CAMPOS_EDITAVEIS).toContain('nf');
  });

  it('a digitação preservada gera gravação só com o que o usuário mudou', () => {
    const aberta = nc({ nf: 'NF-1001' });
    const base = formDe(aberta);
    const atual = nc({ nf: 'NF-1001', resolucao: 'Reverso' });
    const reconciliado = reconciliarFormulario(base, { ...base, nf: 'NF-9999' }, atual);
    expect(camposAlterados(paraFormulario(atual), reconciliado)).toEqual(['nf']);
  });
});

describe('erros de gravação', () => {
  it('conflito tem o código NC001 e a mensagem que explica o que aconteceu', () => {
    const erro = new ConflitoEdicaoNc();
    expect(erro.codigo).toBe('NC001');
    expect(erro.message).toMatch(/Outra pessoa alterou esta não conformidade/);
    expect(erro.message).toMatch(/Nada foi gravado/);
    expect(erro).toBeInstanceOf(Error);
  });

  it('outros erros carregam o código devolvido pelo banco', () => {
    const erro = new ErroEdicaoNc('NC002', 'Para corrigir um valor já registrado, informe a justificativa.');
    expect(erro.codigo).toBe('NC002');
    expect(erro.message).toMatch(/justificativa/);
  });

  it('o formulário vazio tem as mesmas chaves que a edição grava', () => {
    expect(CAMPOS_EDITAVEIS).toEqual(Object.keys(VAZIO));
  });
});
