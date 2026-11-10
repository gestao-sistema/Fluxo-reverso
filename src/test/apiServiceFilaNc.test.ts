import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../lib/supabase', () => ({ supabase: { rpc, from: vi.fn() } }));

import apiService from '../services/apiService';

// Linha como a RPC fila_aprovacao_reversas devolve, com os campos que o mapeamento usa.
const linha = (extra: Record<string, unknown>) => ({
  id: 'solicitacao-1',
  created_at: '2026-11-09T12:00:00.000Z',
  empresa: 'Alinare',
  data_solicitacao: '2026-11-09',
  solicitante: 'Solicitante',
  setor: 'Comercial Alinare',
  codigo_cliente: 100,
  nome_cliente: 'Cliente',
  endereco_postagem: 'Rua 1',
  endereco_destino_troca: null,
  motivo: 'Outros',
  justificativa_outros: null,
  solicitado_por_nome: 'Solicitante',
  aprovacao_versao: 1,
  nc_id: 'nc-1',
  nc_codigo: 'NC-2404',
  nc_origem: null,
  nc_descricao: 'Descrição da NC',
  proprio_pedido: false,
  pode_aprovar: true,
  ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('apiService.getFilaAprovacao: classificação da NC vinculada', () => {
  it('repassa tipo do problema e causador da NC, sem alterar a origem', async () => {
    rpc.mockResolvedValueOnce({
      data: [linha({ nc_tipo_problema: 'Endereço incorreto', nc_causador: 'Comercial' })],
      error: null,
      status: 200,
    });
    const [pedido] = await apiService.getFilaAprovacao();
    expect(pedido).toMatchObject({
      nc_codigo: 'NC-2404',
      nc_origem: null,
      nc_tipo_problema: 'Endereço incorreto',
      nc_causador: 'Comercial',
      nc_descricao: 'Descrição da NC',
    });
  });

  it('linha sem os campos novos (banco ainda sem a migration) fica sem classificação, sem erro e sem inventar', async () => {
    rpc.mockResolvedValueOnce({ data: [linha({ nc_origem: 'Erro de separação' })], error: null, status: 200 });
    const [pedido] = await apiService.getFilaAprovacao();
    expect(pedido).toMatchObject({ nc_origem: 'Erro de separação', nc_tipo_problema: null, nc_causador: null });
  });
});
