import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));

import { supabase } from '../lib/supabase';
import apiService from '../services/apiService';

function chainBuilder(final: { data: unknown; error: unknown }) {
  const obj: Record<string, ReturnType<typeof vi.fn>> = {};
  const self: any = new Proxy(obj, {
    get(_t, prop: string | symbol) {
      const key = String(prop);
      if (key === 'then') {
        return (resolve: any, reject: any) => Promise.resolve(final).then(resolve, reject);
      }
      if (key === 'single' || key === 'maybeSingle') {
        if (!(key in obj)) {
          obj[key] = vi.fn(() => Promise.resolve(final));
        }
        return obj[key];
      }
      if (!(key in obj)) {
        obj[key] = vi.fn(() => self);
      }
      return obj[key];
    },
  });
  return self;
}

// Bucket de etiquetas: list/remove
let bucket: { list: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.resetAllMocks();
  bucket = {
    list: vi.fn(() => Promise.resolve({ data: [], error: null })),
    remove: vi.fn(() => Promise.resolve({ data: [], error: null })),
  };
  (supabase.storage.from as ReturnType<typeof vi.fn>).mockImplementation(() => bucket);
});

describe('apiService.deleteSolicitacao', () => {
  it('sucesso: resolve sem erro e chama .delete() com .eq(id)', async () => {
    const mock = chainBuilder({ data: null, error: null });
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => mock);

    await expect(apiService.deleteSolicitacao('uuid-1')).resolves.toBeUndefined();
    expect(mock.delete).toHaveBeenCalled();
    expect(mock.eq).toHaveBeenCalledWith('id', 'uuid-1');
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it('apaga os PDFs de etiqueta antes da reversa', async () => {
    const mock = chainBuilder({ data: null, error: null });
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => mock);
    bucket.list.mockResolvedValue({ data: [{ name: '1-etiqueta.pdf' }, { name: '2-orfa.pdf' }], error: null });

    await apiService.deleteSolicitacao('uuid-1');
    expect(supabase.storage.from).toHaveBeenCalledWith('etiquetas');
    expect(bucket.list).toHaveBeenCalledWith('uuid-1');
    expect(bucket.remove).toHaveBeenCalledWith(['uuid-1/1-etiqueta.pdf', 'uuid-1/2-orfa.pdf']);
    expect(bucket.remove.mock.invocationCallOrder[0]).toBeLessThan(mock.delete.mock.invocationCallOrder[0]);
  });

  it('falha ao apagar a etiqueta: não apaga a reversa', async () => {
    const mock = chainBuilder({ data: null, error: null });
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => mock);
    bucket.list.mockResolvedValue({ data: [{ name: '1-etiqueta.pdf' }], error: null });
    bucket.remove.mockResolvedValue({ data: null, error: { message: 'new row violates row-level security policy' } });

    await expect(apiService.deleteSolicitacao('uuid-1')).rejects.toThrow('row-level security');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('erro do supabase: lança Error com a mensagem', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() =>
      chainBuilder({ data: null, error: { message: 'foreign key violation' } })
    );

    await expect(apiService.deleteSolicitacao('uuid-1')).rejects.toThrow(
      'foreign key violation'
    );
  });

  it('erro sem mensagem: usa fallback', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() =>
      chainBuilder({ data: null, error: { message: '' } })
    );

    await expect(apiService.deleteSolicitacao('uuid-1')).rejects.toThrow(
      'Erro ao apagar solicitação.'
    );
  });
});
