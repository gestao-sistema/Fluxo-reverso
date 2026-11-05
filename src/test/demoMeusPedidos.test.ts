import { afterEach, describe, expect, it } from 'vitest';
import { demoApi } from '../demo/demoApi';
import { demoDados } from '../demo/demoDatabase';
import type { Solicitacao } from '../types';

function pedido(id: string, solicitadoPor: string | null): Solicitacao {
  return {
    id,
    created_at: '2026-10-20T09:00:00.000Z',
    empresa: 'Alinare',
    data_solicitacao: '2026-10-20',
    solicitante: 'Camila Oliveira',
    solicitado_por: solicitadoPor,
    setor: 'Comercial Alinare',
    codigo_cliente: 1001,
    nome_cliente: `Cliente ${id}`,
    endereco_postagem: 'Rua das Flores, 120',
    motivo: 'Peça com defeito',
    autorizacao: null,
    status: 'pendente',
    tempo_preenchimento_segundos: 30,
  };
}

afterEach(() => demoDados.resetar());

describe('demoApi.getMeusSolicitacoes', () => {
  it('usa o id explícito do autor e não associa legado pelo nome coincidente', async () => {
    localStorage.setItem('flowdesk:demo:usuario', 'demo-solicitante-alinare');
    const meuPedido = pedido('pedido-proprio', 'demo-solicitante-alinare');
    const pedidoDeOutraPessoa = pedido('pedido-de-b', 'demo-solicitante-novitah');
    const legadoMesmoNome = pedido('pedido-legado', null);
    demoDados.salvarSolicitacoes([meuPedido, pedidoDeOutraPessoa, legadoMesmoNome]);

    await expect(demoApi.getMeusSolicitacoes()).resolves.toEqual([meuPedido]);
  });
});
