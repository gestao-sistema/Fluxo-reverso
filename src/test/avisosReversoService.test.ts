import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, from } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ supabase: { rpc, from } }));

import avisosReversoService from '../services/avisosReversoService';

const linha = (extra: Record<string, unknown> = {}) => ({
  id: 'aviso-1',
  solicitacao_id: '11111111-1111-4111-8111-111111111111',
  empresa: 'Alinare',
  evento: 'pedido_aprovado',
  versao: 1,
  justificativa: 'Conferido',
  nome_cliente: 'Casa Amora',
  criado_em: '2026-11-09T12:00:00.000Z',
  lido_em: null,
  superado_em: null,
  ...extra,
});

describe('avisosReversoService (banco)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('lista pela RPC segura, sem leitura direta da tabela, e devolve o aviso já tratado', async () => {
    rpc.mockResolvedValueOnce({ data: [linha(), linha({ id: 'aviso-2', evento: 'evento_desconhecido' })], error: null });
    const avisos = await avisosReversoService.listarAvisos();
    expect(rpc).toHaveBeenCalledWith('listar_avisos_reverso', { p_limite: 50 });
    expect(from).not.toHaveBeenCalled();
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ id: 'aviso-1', evento: 'pedido_aprovado', versao: 1, justificativa: 'Conferido', superado_em: null });
  });

  it('contagem de não lidos vem da RPC; valor inválido vira zero', async () => {
    rpc.mockResolvedValueOnce({ data: 3, error: null });
    await expect(avisosReversoService.contarAvisosNaoLidos()).resolves.toBe(3);
    expect(rpc).toHaveBeenCalledWith('contar_avisos_reverso_nao_lidos');
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(avisosReversoService.contarAvisosNaoLidos()).resolves.toBe(0);
  });

  it('marcar leitura chama a RPC com o id do aviso e devolve o resultado', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(avisosReversoService.marcarAvisoLido('aviso-1')).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('marcar_aviso_reverso_lido', { p_aviso_id: 'aviso-1' });
    rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(avisosReversoService.marcarAvisoLido('aviso-de-outra-pessoa')).resolves.toBe(false);
  });

  it('função ausente é falha da consulta, nunca lista vazia, e não há consulta direta', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'function missing' } });
    await expect(avisosReversoService.listarAvisos()).rejects.toThrow('Não foi possível carregar as notificações agora');
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42883', message: 'function does not exist' } });
    await expect(avisosReversoService.contarAvisosNaoLidos()).rejects.toThrow('Não foi possível carregar as notificações agora');
    expect(from).not.toHaveBeenCalled();
  });

  it('falha ao registrar leitura é avisada, sem parecer sucesso', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });
    await expect(avisosReversoService.marcarAvisoLido('aviso-1')).rejects.toThrow('Não foi possível registrar a leitura');
  });
});
