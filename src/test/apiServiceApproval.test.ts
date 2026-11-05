import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('../lib/supabase', () => ({ supabase: { from } }));

import { HistoricoSolicitacaoError, SolicitacaoAlteradaError } from '../services/apiService';
import apiService from '../services/apiService';
import type { Solicitacao, UsuarioAutenticado } from '../types';

const request: Solicitacao = {
  id: '11111111-1111-4111-8111-111111111111',
  created_at: '2026-10-21T12:42:00.000Z',
  empresa: 'Alinare',
  data_solicitacao: '2026-10-21',
  solicitante: 'Paula Mendes',
  setor: 'Comercial',
  codigo_cliente: 10842,
  nome_cliente: 'Marina Costa',
  endereco_postagem: 'Rua das Flores, 120 · São Paulo, SP',
  motivo: 'Mercadoria errada',
  justificativa_outros: null,
  autorizacao: 'Joice Mendes',
  status: 'aguardando_aprovacao',
  tempo_preenchimento_segundos: 48,
  etiqueta_path: null,
  etiqueta_nome: null,
  etiqueta_enviada_em: null,
  legado: false,
};

const user: UsuarioAutenticado = {
  id: 'user-1', nome: 'Paula Mendes', usuario: 'paula', telas: ['aprovar-reversa'], empresasAcesso: ['Alinare'],
};

function chain(result: { data: unknown; error: unknown }) {
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const self: any = new Proxy({}, {
    get(_target, property: string | symbol) {
      const name = String(property);
      if (name === 'then') return (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
      if (name === 'maybeSingle' || name === 'single') {
        if (!methods[name]) methods[name] = vi.fn(() => Promise.resolve(result));
        return methods[name];
      }
      if (!methods[name]) methods[name] = vi.fn(() => self);
      return methods[name];
    },
  });
  return self;
}

beforeEach(() => vi.resetAllMocks());

describe('apiService.updateSolicitacao with approval guards', () => {
  it('checks status and reviewed fields, then records the explicit decision event', async () => {
    const update = chain({ data: { ...request, status: 'pendente' }, error: null });
    const audit = chain({ data: null, error: null });
    from.mockImplementation((table: string) => table === 'solicitacoes_reverso' ? update : audit);

    const result = await apiService.updateSolicitacao(
      request.id,
      { status: 'pendente' },
      user,
      {
        expectedStatus: 'aguardando_aprovacao',
        expectedApprovalSnapshot: {
          empresa: request.empresa,
          nome_cliente: request.nome_cliente,
          motivo: request.motivo,
          justificativa_outros: null,
        },
        historyAction: 'Aprovou reversa',
      },
    );

    expect(result.status).toBe('pendente');
    expect(update.eq).toHaveBeenCalledWith('status', 'aguardando_aprovacao');
    expect(update.eq).toHaveBeenCalledWith('nome_cliente', request.nome_cliente);
    expect(update.is).toHaveBeenCalledWith('justificativa_outros', null);
    expect(update.maybeSingle).toHaveBeenCalledOnce();
    expect(audit.insert).toHaveBeenCalledWith({
      solicitacao_id: request.id, user_nome: user.nome, acao: 'Aprovou reversa',
    });
  });

  it('reports a concurrent change when the guarded update no longer matches', async () => {
    const update = chain({ data: null, error: null });
    const latest = chain({ data: { ...request, status: 'pendente' }, error: null });
    from.mockImplementationOnce(() => update).mockImplementationOnce(() => latest);

    await expect(apiService.updateSolicitacao(
      request.id,
      { status: 'pendente' },
      user,
      { expectedStatus: 'aguardando_aprovacao', expectedApprovalSnapshot: { nome_cliente: request.nome_cliente } },
    )).rejects.toBeInstanceOf(SolicitacaoAlteradaError);
    expect(latest.maybeSingle).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('distinguishes a backend denial from a ticket that changed', async () => {
    const update = chain({ data: null, error: null });
    const latest = chain({ data: request, error: null });
    from.mockImplementationOnce(() => update).mockImplementationOnce(() => latest);

    await expect(apiService.updateSolicitacao(
      request.id,
      { status: 'pendente' },
      user,
      { expectedStatus: 'aguardando_aprovacao', expectedApprovalSnapshot: { nome_cliente: request.nome_cliente } },
    )).rejects.toThrow('O backend não autorizou a alteração deste pedido.');
  });

  it('makes a failed audit insert explicit after the status was already saved', async () => {
    const saved = { ...request, status: 'reprovado' as const };
    const update = chain({ data: saved, error: null });
    const audit = chain({ data: null, error: { message: 'insert denied' } });
    from.mockImplementation((table: string) => table === 'solicitacoes_reverso' ? update : audit);

    await expect(apiService.updateSolicitacao(
      request.id,
      { status: 'reprovado' },
      user,
      { expectedStatus: 'aguardando_aprovacao', historyAction: 'Rejeitou reversa: Endereço incompleto' },
    )).rejects.toMatchObject({
      name: HistoricoSolicitacaoError.name,
      solicitacao: saved,
      message: expect.stringContaining('A decisão foi salva'),
    });
  });
});
