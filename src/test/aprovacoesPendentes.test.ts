import { describe, expect, it } from 'vitest';
import {
  chaveEscopoAprovacao,
  contarTarefasParaDecisao,
  descreverPendencias,
  empresasParaAprovacao,
  PENDENCIAS_CARREGANDO,
  PENDENCIAS_INATIVAS,
  PENDENCIAS_INDISPONIVEIS,
  pendenciasProntas,
  temContadorDeAprovacoes,
} from '../lib/aprovacoesPendentes';
import type { Empresa, SolicitacaoAprovacao, UsuarioAutenticado } from '../types';

function aprovador(empresas: Empresa[] = ['Alinare'], telas: string[] = ['aprovar-reversa']): UsuarioAutenticado {
  return { id: 'aprovador-1', nome: 'Aprovador', usuario: 'aprovador', telas, empresasAcesso: empresas } as UsuarioAutenticado;
}

function registro(id: string, empresa: Empresa, pode: boolean | undefined): SolicitacaoAprovacao {
  return { id, empresa, pode_aprovar: pode } as SolicitacaoAprovacao;
}

describe('contagem de tarefas do contador de aprovações', () => {
  it('conta só o que a pessoa pode decidir: pode_aprovar verdadeiro e empresa liberada', () => {
    const lista = [
      registro('a', 'Alinare', true),
      registro('b', 'Alinare', false), // pedido próprio sem autoaprovação: aparece na fila, não é tarefa
      registro('c', 'Alinare', undefined), // sem o campo, não é contado
      registro('d', 'Novitah', true), // empresa fora das liberadas
    ];

    expect(contarTarefasParaDecisao(lista, ['Alinare'])).toBe(1);
  });

  it('soma as duas empresas quando a pessoa aprova nas duas', () => {
    const lista = [registro('a', 'Alinare', true), registro('b', 'Novitah', true), registro('c', 'Novitah', false)];

    expect(contarTarefasParaDecisao(lista, ['Alinare', 'Novitah'])).toBe(2);
  });

  it('não conta nada quando a fila vem vazia', () => {
    expect(contarTarefasParaDecisao([], ['Alinare'])).toBe(0);
  });
});

describe('quem recebe o contador', () => {
  it('exige a tela aprovar-reversa e pelo menos uma empresa liberada', () => {
    expect(temContadorDeAprovacoes(null)).toBe(false);
    expect(temContadorDeAprovacoes(aprovador(['Alinare'], ['formulario-alinare']))).toBe(false);
    expect(temContadorDeAprovacoes(aprovador([]))).toBe(false);
    expect(temContadorDeAprovacoes(aprovador(['Alinare']))).toBe(true);
  });

  it('usa a mesma regra de empresa da página de Aprovações', () => {
    expect(empresasParaAprovacao(aprovador(['Novitah']))).toEqual(['Novitah']);
    expect(empresasParaAprovacao(aprovador(['Alinare', 'Novitah']))).toEqual(['Alinare', 'Novitah']);
    expect(empresasParaAprovacao(aprovador(['Alinare'], []))).toEqual([]);
  });
});

describe('descrição do indicador', () => {
  it('não mostra nada com zero pendências, enquanto carrega ou para quem não aprova', () => {
    const vazio = { marca: null, alerta: false, resumo: null };

    expect(descreverPendencias(pendenciasProntas(0))).toEqual(vazio);
    expect(descreverPendencias(PENDENCIAS_CARREGANDO)).toEqual(vazio);
    expect(descreverPendencias(PENDENCIAS_INATIVAS)).toEqual(vazio);
  });

  it('mostra o número e o texto "aguardando sua análise"', () => {
    expect(descreverPendencias(pendenciasProntas(3))).toEqual({
      marca: '3',
      alerta: false,
      resumo: '3 aguardando sua análise',
    });
  });

  it('limita o número visível a 99+ sem alterar o texto de contagem', () => {
    const descricao = descreverPendencias(pendenciasProntas(120));

    expect(descricao.marca).toBe('99+');
    expect(descricao.resumo).toBe('120 aguardando sua análise');
  });

  it('uma consulta que falhou vira alerta, nunca zero', () => {
    expect(descreverPendencias(PENDENCIAS_INDISPONIVEIS)).toEqual({
      marca: '!',
      alerta: true,
      resumo: 'não foi possível verificar as pendências',
    });
  });
});

describe('escopo da sessão de aprovação', () => {
  it('muda quando a pessoa muda ou quando as empresas liberadas mudam', () => {
    const base = aprovador(['Alinare', 'Novitah']);

    expect(chaveEscopoAprovacao({ ...base })).toBe(chaveEscopoAprovacao(base));
    expect(chaveEscopoAprovacao({ ...base, id: 'outra-pessoa' } as UsuarioAutenticado)).not.toBe(chaveEscopoAprovacao(base));
    expect(chaveEscopoAprovacao(aprovador(['Alinare']))).not.toBe(chaveEscopoAprovacao(base));
  });

  it('não existe para quem não aprova', () => {
    expect(chaveEscopoAprovacao(null)).toBeNull();
    expect(chaveEscopoAprovacao(aprovador([]))).toBeNull();
  });
});
