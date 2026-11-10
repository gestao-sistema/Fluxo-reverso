import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } },
}));

import { supabase } from '../lib/supabase';
import apiService from '../services/apiService';

// Regra vigente: apagar um pedido é movê-lo para a Lixeira (RPC inutilizar_chamado). Nada é
// removido da tabela nem do bucket de etiquetas, e o pedido pode ser restaurado depois.
// Bucket de etiquetas: list/remove (usados aqui só para provar que os PDFs não são tocados).
let bucket: { list: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.resetAllMocks();
  bucket = {
    list: vi.fn(() => Promise.resolve({ data: [], error: null })),
    remove: vi.fn(() => Promise.resolve({ data: [], error: null })),
  };
  (supabase.storage.from as ReturnType<typeof vi.fn>).mockImplementation(() => bucket);
});

describe('apiService.deleteSolicitacao (move para a Lixeira)', () => {
  it('sucesso: resolve sem erro, chama a RPC inutilizar_chamado com o id e não faz exclusão física', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });

    await expect(apiService.deleteSolicitacao('uuid-1')).resolves.toBeUndefined();
    expect(supabase.rpc).toHaveBeenCalledWith('inutilizar_chamado', { p_solicitacao_id: 'uuid-1' });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it('mantém os PDFs de etiqueta: a Lixeira não remove documentos, para a reversa poder ser restaurada', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
    bucket.list.mockResolvedValue({ data: [{ name: '1-etiqueta.pdf' }, { name: '2-orfa.pdf' }], error: null });

    await apiService.deleteSolicitacao('uuid-1');
    expect(supabase.storage.from).not.toHaveBeenCalled();
    expect(bucket.list).not.toHaveBeenCalled();
    expect(bucket.remove).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith('inutilizar_chamado', { p_solicitacao_id: 'uuid-1' });
  });

  it('sem permissão para a Lixeira: mostra a mensagem do banco e não altera o pedido nem os documentos', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Somente administradores podem mover chamados para a Lixeira.' },
    });

    await expect(apiService.deleteSolicitacao('uuid-1')).rejects.toThrow(
      'Somente administradores podem mover chamados para a Lixeira.'
    );
    expect(supabase.from).not.toHaveBeenCalled();
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it('erro do supabase: lança Error com a mensagem', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'foreign key violation' },
    });

    await expect(apiService.deleteSolicitacao('uuid-1')).rejects.toThrow(
      'foreign key violation'
    );
  });

  it('erro sem mensagem: usa fallback', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: '' },
    });

    await expect(apiService.deleteSolicitacao('uuid-1')).rejects.toThrow(
      'Erro ao mover o chamado para a Lixeira.'
    );
  });
});
