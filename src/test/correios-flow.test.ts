import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock do singleton supabase ──────────────────────────────────────────────
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

import { supabase } from '../lib/supabase';
import apiService from '../services/apiService';
import type { RastreamentoCorreios } from '../types';

const rastreamentoMock: RastreamentoCorreios = {
  codigo_rastreio: 'DG049186226BR',
  solicitacao_id: 'uuid-1',
  ultimo_evento_codigo: 'BDE',
  ultimo_evento_descricao: 'Objeto entregue ao destinatário',
  unidade_cidade: 'XAPURI',
  unidade_uf: 'AC',
  eventos: [
    {
      codigo: 'BDE',
      descricao: 'Objeto entregue ao destinatário',
      dtHrCriado: '2022-03-11T17:03:00',
      unidade: { endereco: { uf: 'AC', cidade: 'XAPURI' } },
    },
    {
      codigo: 'OEC',
      descricao: 'Objeto em rota de entrega',
      dtHrCriado: '2022-03-11T17:02:45',
      unidade: { endereco: { uf: 'SP', cidade: 'SAO PAULO' } },
    },
    {
      codigo: 'PO',
      descricao: 'Objeto postado',
      dtHrCriado: '2022-03-10T19:10:36',
      unidade: { endereco: { uf: 'SP', cidade: 'SAO PAULO' } },
    },
  ],
  ultimo_check_em: '2026-08-28T17:00:00Z',
  created_at: '2026-08-28T16:00:00Z',
};

/** Query fluente (mesmo helper do apiService.test.ts). */
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

const functionsInvoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
});

describe('apiService.getRastreio', () => {
  it('retorna rastreamento salvo da tabela 1:1', async () => {
    const mock = chainBuilder({ data: rastreamentoMock, error: null });
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => mock);

    const r = await apiService.getRastreio('DG049186226BR');

    expect(r?.codigo_rastreio).toBe('DG049186226BR');
    expect(mock.eq).toHaveBeenCalledWith('codigo_rastreio', 'DG049186226BR');
  });

  it('sem rastreamento salvo: retorna null', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() =>
      chainBuilder({ data: null, error: null })
    );

    expect(await apiService.getRastreio('INEXISTENTE')).toBeNull();
  });
});

describe('apiService.atualizarRastreio (Edge Function correios-rastreio)', () => {
  it('invoca a edge function com o código no body', async () => {
    functionsInvoke.mockResolvedValueOnce({ data: { success: true }, error: null });

    await apiService.atualizarRastreio('DG049186226BR');

    expect(functionsInvoke).toHaveBeenCalledWith('correios-rastreio', {
      body: { codigo: 'DG049186226BR' },
    });
  });

  it('erro da edge function: lança com mensagem', async () => {
    functionsInvoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'Falha autenticação Correios: 401' },
    });

    await expect(apiService.atualizarRastreio('DG049186226BR')).rejects.toThrow(
      'Falha autenticação Correios: 401'
    );
  });
});

describe('apiService.salvarCodigoRastreio', () => {
  it('salva o código na emissão pela RPC e recarrega o espelho da solicitação', async () => {
    const mockEmissao = chainBuilder({
      data: { id: 'emissao-1', codigo_autorizacao: null, emitida_em: null, valida_ate: null },
      error: null,
    });
    const mockSolicitacao = chainBuilder({
      data: { id: 'uuid-1', codigo_rastreio: 'DG049186226BR' },
      error: null,
    });
    let callCount = 0;
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      return callCount === 1 ? mockEmissao : mockSolicitacao;
    });
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {}, error: null });

    const user = { id: 'u1', nome: 'Maria', usuario: 'maria', telas: [] as never[] };
    const res = await apiService.salvarCodigoRastreio('uuid-1', 'dg049186226br  ', user);

    expect(res.codigo_rastreio).toBe('DG049186226BR');
    expect(supabase.rpc).toHaveBeenCalledWith('atualizar_dados_emissao', expect.objectContaining({
      p_emissao_id: 'emissao-1',
      p_codigo_rastreio: 'DG049186226BR',
    }));
    expect(mockEmissao.update).not.toHaveBeenCalled();
    expect(mockSolicitacao.update).not.toHaveBeenCalled();
  });
});

describe('apiService.removerCodigoRastreio e salvarCodigoRastreio: só pela emissão vigente, sem atalhos', () => {
  const emissaoVigente = {
    id: 'emissao-1', solicitacao_id: 'uuid-1', sequencia: 1, codigo_autorizacao: 'AUT-1', codigo_rastreio: 'DG049186226BR',
    pdf_path: 'uuid-1/a.pdf', pdf_nome: 'a.pdf', emitida_em: '2026-10-20', valida_ate: '2026-11-19', substituida_em: null,
  };
  const user = { id: 'u1', nome: 'João', usuario: 'joao', telas: [] as never[] };
  /** from(): emissões e solicitação por tabela; registra tudo o que foi chamado. */
  function configurar(emissao: unknown, opcoes: { erroEmissao?: unknown } = {}) {
    const chamadas: Array<{ tabela: string; metodo: string }> = [];
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((tabela: string) => {
      const resultado = tabela === 'reversa_emissoes'
        ? { data: emissao, error: opcoes.erroEmissao ?? null }
        : { data: { id: 'uuid-1', codigo_rastreio: null }, error: null };
      return new Proxy({}, {
        get(_t, metodo: string) {
          if (metodo === 'then') return (ok: (v: unknown) => void) => Promise.resolve(resultado).then(ok);
          if (metodo === 'maybeSingle' || metodo === 'single') return () => { chamadas.push({ tabela, metodo }); return Promise.resolve(resultado); };
          return (..._a: unknown[]) => { chamadas.push({ tabela, metodo }); return new Proxy({}, this as ProxyHandler<object>); };
        },
      });
    });
    return chamadas;
  }

  it('remove o código pela RPC da emissão, preservando autorização e datas, sem apagar histórico dos Correios nem atualizar direto', async () => {
    const chamadas = configurar(emissaoVigente);
    (supabase.rpc as ReturnType<typeof vi.fn>).mockImplementation(async (nome: string) => nome === 'pode_operar_emissao' ? { data: true, error: null } : { data: {}, error: null });
    const res = await apiService.removerCodigoRastreio('uuid-1', user);
    expect(res.id).toBe('uuid-1');
    expect(supabase.rpc).toHaveBeenCalledWith('atualizar_dados_emissao', {
      p_emissao_id: 'emissao-1', p_codigo_autorizacao: 'AUT-1', p_codigo_rastreio: null, p_emitida_em: '2026-10-20', p_valida_ate: '2026-11-19',
    });
    expect(chamadas.some((x) => x.metodo === 'delete' || x.metodo === 'update' || x.metodo === 'insert')).toBe(false);
    expect(chamadas.some((x) => x.tabela === 'rastreamento_correios')).toBe(false);
  });

  it('rastreio que já mostra postagem: o erro do banco aparece, nada é dado como removido e não há gravação direta', async () => {
    const chamadas = configurar(emissaoVigente);
    (supabase.rpc as ReturnType<typeof vi.fn>).mockImplementation(async (nome: string) => nome === 'pode_operar_emissao'
      ? { data: true, error: null }
      : { data: null, error: { code: '23514', message: 'O rastreio do objeto DG049186226BR já mostra postagem: o código da emissão #1 não pode ser alterado nem removido.' } });
    await expect(apiService.removerCodigoRastreio('uuid-1', user)).rejects.toThrow(/já mostra postagem/);
    expect(chamadas.some((x) => x.metodo === 'delete' || x.metodo === 'update' || x.metodo === 'insert')).toBe(false);
  });

  it('sem permissão ou pedido não aprovado (pode_operar_emissao falso): bloqueia antes de qualquer RPC de gravação', async () => {
    configurar(emissaoVigente);
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: false, error: null });
    await expect(apiService.removerCodigoRastreio('uuid-1', user)).rejects.toThrow(/permissão|aprovado/);
    expect(supabase.rpc).not.toHaveBeenCalledWith('atualizar_dados_emissao', expect.anything());
  });

  it('RPC indisponível ou emissão ausente: erro claro, sem update direto como alternativa', async () => {
    const chamadas = configurar(null);
    await expect(apiService.salvarCodigoRastreio('uuid-1', 'DG049186226BR', user)).rejects.toThrow(/ainda não tem etiqueta emitida/);
    await expect(apiService.removerCodigoRastreio('uuid-1', user)).rejects.toThrow(/não tem emissão/);
    expect(chamadas.some((x) => x.metodo === 'update' || x.metodo === 'insert')).toBe(false);

    configurar({ id: 'emissao-1', codigo_autorizacao: null, emitida_em: null, valida_ate: null });
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    const erro = await apiService.salvarCodigoRastreio('uuid-1', 'DG049186226BR', user).catch((e) => e);
    expect(erro.message).not.toMatch(/sucesso/i);
    expect(erro.message).toMatch(/ainda não está pronto|suporte/);
    const chamadasDepois = configurar({ id: 'emissao-1', codigo_autorizacao: null, emitida_em: null, valida_ate: null });
    await apiService.salvarCodigoRastreio('uuid-1', 'DG049186226BR', user).catch(() => {});
    expect(chamadasDepois.some((x) => x.metodo === 'update')).toBe(false);
  });

  it('formato inválido é recusado antes de consultar ou gravar', async () => {
    const chamadas = configurar(emissaoVigente);
    await expect(apiService.salvarCodigoRastreio('uuid-1', 'ABC', user)).rejects.toThrow(/formato esperado/);
    expect(chamadas).toHaveLength(0);
  });
});
