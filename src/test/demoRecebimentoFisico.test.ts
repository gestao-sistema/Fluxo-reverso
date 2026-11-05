import { afterEach, describe, expect, it } from 'vitest';
import { demoApi } from '../demo/demoApi';
import { demoDados } from '../demo/demoDatabase';
import { USUARIOS_DEMO } from '../demo/demoMode';
import type { Solicitacao } from '../types';

// O adaptador demo só espelha o contrato de tela (modo de demonstração); a regra autoritativa
// está nos testes de banco (supabase/tests/recebimento-fisico.test.mjs).
const usuario = (id: string) => USUARIOS_DEMO.find((item) => item.id === id)!;

function pedido(id: string, extras: Partial<Solicitacao> = {}): Solicitacao {
  return {
    id,
    created_at: '2026-10-01T09:00:00.000Z',
    empresa: 'Alinare',
    data_solicitacao: '2026-10-01',
    solicitante: 'Camila Oliveira',
    setor: 'Comercial Alinare',
    codigo_cliente: 1001,
    nome_cliente: `Cliente ${id}`,
    endereco_postagem: 'Rua das Flores, 120',
    motivo: 'Peça com defeito',
    autorizacao: null,
    status: 'concluido',
    concluido_em: '2026-10-10T12:00:00.000Z',
    codigo_rastreio: 'AB123456789BR',
    tempo_preenchimento_segundos: 30,
    ...extras,
  };
}

afterEach(() => { demoDados.resetar(); localStorage.clear(); });

describe('demoApi: recebimento físico depois da entrega informada pelos Correios', () => {
  it('lista e confirma sem alterar a etapa, uma única vez', async () => {
    localStorage.setItem('flowdesk:demo:usuario', 'demo-etiquetas');
    const entregue = pedido('entregue');
    demoDados.salvarSolicitacoes([entregue]);
    await expect(demoApi.listarRecebimentosFisicosPendentes()).resolves.toEqual(['entregue']);

    const retorno = await demoApi.confirmarRecebimentoMercadoria('entregue', usuario('demo-etiquetas'));
    expect(retorno.status).toBe('concluido');
    expect(demoDados.solicitacoes()[0]).toEqual(entregue);
    expect(demoDados.historicoSolicitacoes()[0].acao).toMatch(/Recebimento físico confirmado pela empresa após a entrega/);
    await expect(demoApi.listarRecebimentosFisicosPendentes()).resolves.toEqual([]);
    await expect(demoApi.confirmarRecebimentoMercadoria('entregue', usuario('demo-etiquetas'))).rejects.toThrow(/já foi confirmado/);
  });

  it('exige permissão na empresa e rastro de entrega dos Correios', async () => {
    demoDados.salvarSolicitacoes([pedido('sem-rastreio', { codigo_rastreio: null }), pedido('outra', { empresa: 'Novitah' })]);
    localStorage.setItem('flowdesk:demo:usuario', 'demo-etiquetas');
    await expect(demoApi.confirmarRecebimentoMercadoria('sem-rastreio', usuario('demo-etiquetas'))).rejects.toThrow(/não tem registro de entrega/);
    await expect(demoApi.confirmarRecebimentoMercadoria('outra', usuario('demo-solicitante-alinare'))).rejects.toThrow(/não pode confirmar/);
    localStorage.setItem('flowdesk:demo:usuario', 'demo-solicitante-alinare');
    await expect(demoApi.listarRecebimentosFisicosPendentes()).resolves.toEqual([]);
  });
});
