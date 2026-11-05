import { beforeEach, describe, expect, it } from 'vitest';
import { codigoPedido, pedidoCorrespondeABusca } from '../lib/pedido';
import { demoApi } from '../demo/demoApi';
import { demoDados } from '../demo/demoDatabase';
import { iniciarDemo } from '../demo/demoMode';

describe('número exibido do pedido', () => {
  it('ids reais continuam com as oito primeiras posições do UUID', () => {
    expect(codigoPedido('1a2b3c4d-1111-4111-8111-111111111111')).toBe('RV-1A2B3C4D');
  });

  it('pedidos de exemplo da demonstração têm números diferentes entre si (sem RV-DEMO0000 repetido)', () => {
    const numeros = demoDados.solicitacoes().filter((p) => p.id.startsWith('demo-0000-')).map((p) => codigoPedido(p.id));
    expect(numeros.length).toBeGreaterThan(5);
    expect(new Set(numeros).size).toBe(numeros.length);
    expect(codigoPedido('demo-0000-0000-0000-000000000005')).toBe('RV-DEMO0005');
  });
});

describe('busca em Pedidos: nome, código da cliente ou número exibido', () => {
  const pedido = { id: '1a2b3c4d-1111-4111-8111-111111111111', nome_cliente: 'Ateliê Aurora', codigo_cliente: 10842 };
  it('encontra pelo nome (sem diferenciar maiúsculas), pelo código interno e pelo número, com ou sem "RV-"', () => {
    for (const busca of ['aurora', 'ATELIÊ', '10842', '1084', 'RV-1A2B3C4D', 'rv-1a2b', '1a2b3c4d', '1A2B']) {
      expect(pedidoCorrespondeABusca(pedido, busca), busca).toBe(true);
    }
  });
  it('não encontra o que não corresponde e busca vazia aceita tudo', () => {
    for (const busca of ['outra', '99999', 'RV-FFFFFFFF']) expect(pedidoCorrespondeABusca(pedido, busca), busca).toBe(false);
    expect(pedidoCorrespondeABusca(pedido, '   ')).toBe(true);
  });
});

describe('busca no serviço (demonstração): respeita os demais filtros', () => {
  beforeEach(() => { demoDados.resetar(); localStorage.clear(); iniciarDemo('demo-mestre'); });

  it('pelo número exibido, pelo código da cliente e pelo nome', async () => {
    const alvo = demoDados.solicitacoes().find((p) => p.id.endsWith('000000000005'))!;
    expect((await demoApi.getSolicitacoes({ buscaCliente: codigoPedido(alvo.id) })).map((p) => p.id)).toEqual([alvo.id]);
    expect((await demoApi.getSolicitacoes({ buscaCliente: String(alvo.codigo_cliente) })).some((p) => p.id === alvo.id)).toBe(true);
    expect((await demoApi.getSolicitacoes({ buscaCliente: alvo.nome_cliente.slice(0, 6) })).some((p) => p.id === alvo.id)).toBe(true);
  });

  it('filtro de empresa não é ampliado pela busca', async () => {
    const alvo = demoDados.solicitacoes().find((p) => p.empresa === 'Alinare')!;
    expect(await demoApi.getSolicitacoes({ empresa: 'Novitah', buscaCliente: codigoPedido(alvo.id) })).toEqual([]);
  });
});
