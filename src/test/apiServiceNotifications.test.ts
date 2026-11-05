import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { rpc } }));

import apiService from '../services/apiService';

describe('apiService notifications', () => {
  beforeEach(() => {
    localStorage.removeItem('flowdesk:demo:ativo');
    vi.resetAllMocks();
  });

  it('uses the private listing RPC and marks a notification through its own RPC', async () => {
    const aviso = { id: 'notice-1', solicitacao_id: 'order-1', empresa: 'Alinare', created_at: '2026-10-26T13:00:00Z', lida_em: null, nao_lidas_total: 4 };
    rpc.mockResolvedValueOnce({ data: [aviso], error: null }).mockResolvedValueOnce({ data: true, error: null });

    await expect(apiService.getNotificacoesEmissao()).resolves.toEqual({ notificacoes: [aviso], naoLidas: 4 });
    await expect(apiService.marcarNotificacaoEmissaoLida('notice-1')).resolves.toBe(true);
    expect(rpc).toHaveBeenNthCalledWith(1, 'listar_notificacoes_emissao');
    expect(rpc).toHaveBeenNthCalledWith(2, 'marcar_notificacao_emissao_lida', { p_notificacao_id: 'notice-1' });
  });

  it('does not fall back to direct writes when the migration RPC is missing', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'function missing' } });
    await expect(apiService.getNotificacoesEmissao()).rejects.toThrow('Não foi possível carregar as notificações agora.');
    expect(rpc).toHaveBeenCalledOnce();
  });
});
