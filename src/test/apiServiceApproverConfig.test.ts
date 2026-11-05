import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock('../lib/supabase', () => ({ supabase: { rpc, from } }));

import apiService from '../services/apiService';
import type { SolicitacaoAprovacao, UsuarioAutenticado } from '../types';

const aprovador: UsuarioAutenticado = {
  id: 'user-approver', nome: 'Aprovadora', usuario: 'aprovadora',
  telas: ['aprovar-reversa'], empresasAcesso: ['Alinare'],
};

const pedido: SolicitacaoAprovacao = {
  id: 'solicitacao-1', created_at: '2026-10-26T12:00:00.000Z', empresa: 'Alinare',
  data_solicitacao: '2026-10-26', solicitante: 'Solicitante', setor: 'Comercial Alinare',
  codigo_cliente: 100, nome_cliente: 'Cliente', endereco_postagem: 'Rua 1', motivo: 'Outros',
  justificativa_outros: 'Conferir', autorizacao: null, status: 'aguardando_aprovacao',
  tempo_preenchimento_segundos: 10, aprovacao_status: 'aguardando_aprovacao', aprovacao_versao: 1,
};

beforeEach(() => {
  vi.resetAllMocks();
  from.mockReturnValue({ update: vi.fn() });
});

describe('apiService de configuração de aprovadores', () => {
  it('consulta a fila somente pela RPC segura, sem parâmetros, e não esconde a falha como lista vazia', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'fila_aprovacao_reversas missing' }, status: 404 });
    await expect(apiService.getFilaAprovacao()).rejects.toThrow('Não foi possível carregar os pedidos. Tente novamente.');
    expect(rpc).toHaveBeenCalledWith('fila_aprovacao_reversas');
    expect(from).not.toHaveBeenCalled();
  });
});

describe('apiService.getFilaAprovacao: cada falha com a sua causa (sem culpar migration)', () => {
  let console_: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { console_ = vi.spyOn(console, 'error').mockImplementation(() => {}); });

  const falha = (erro: object, status: number, mensagem: RegExp | string) => async () => {
    rpc.mockResolvedValueOnce({ data: null, error: erro, status });
    await expect(apiService.getFilaAprovacao()).rejects.toThrow(mensagem);
  };

  it('função não encontrada pelo PostgREST: mensagem operacional e o erro original no console', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fila_aprovacao_reversas without parameters in the schema cache', hint: 'x' }, status: 404 });
    const erro = await apiService.getFilaAprovacao().catch((e) => e);
    expect(erro.message).toBe('Não foi possível carregar os pedidos. Tente novamente.');
    expect(erro.message).not.toMatch(/migration|RPC|SQL/i);
    expect(console_).toHaveBeenCalledWith(expect.stringContaining('fila de aprovação'), expect.objectContaining({ causa: 'rpc_nao_encontrada', codigo: 'PGRST202', status: 404 }));
  });

  it('erro DENTRO da função ("function ... does not exist", 42883) não vira "função ausente"', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42883', message: 'function public.usuario_pode_aprovar_reversa(text, text) does not exist' }, status: 404 });
    await expect(apiService.getFilaAprovacao()).rejects.toThrow('Não foi possível carregar os pedidos. Tente novamente.');
    expect(console_).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ causa: 'erro_na_funcao', codigo: '42883' }));
  });

  it('permissão negada (42501 / 403) é falta de permissão', falha({ code: '42501', message: 'permission denied for function' }, 403, 'Você não tem permissão para ver esta fila.'));
  it('sessão expirada (401 / JWT) pede novo login', falha({ code: 'PGRST301', message: 'JWT expired' }, 401, 'Sua sessão expirou. Entre novamente.'));
  it('falha de rede (a requisição nem chegou) é falha de conexão', async () => {
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(apiService.getFilaAprovacao()).rejects.toThrow('Sem conexão com o servidor. Verifique a internet e tente novamente.');
  });
});

describe('apiService de configuração de aprovadores (continuação)', () => {

  it('não tenta gravar aprovação diretamente se a RPC não está disponível', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'aprovar_reversa missing' } });
    await expect(apiService.decidirAprovacao(pedido, 'approve', aprovador, '')).rejects.toThrow('Não foi possível registrar a decisão agora. Nada foi alterado.');
    expect(rpc).toHaveBeenCalledWith('aprovar_reversa', expect.objectContaining({
      p_solicitacao_id: pedido.id,
      p_versao: 1,
    }));
    expect(from).not.toHaveBeenCalled();
  });

  it('consulta e salva a configuração somente pelas RPCs administrativas', async () => {
    const resposta = { setores: [{ empresa: 'Alinare', setor: 'Financeiro' }], configuracoes: [] };
    rpc.mockResolvedValueOnce({ data: resposta, error: null });
    await expect(apiService.listarConfigAprovadoresReversa()).resolves.toEqual(resposta);

    rpc.mockResolvedValueOnce({ data: null, error: null });
    await apiService.salvarConfigAprovadoresReversa('Alinare', [{
      usuario_id: aprovador.id, todos_setores: false, setores: ['Financeiro'],
    }]);
    expect(rpc).toHaveBeenNthCalledWith(2, 'salvar_config_aprovadores_reversa', {
      p_empresa: 'Alinare',
      p_configuracao: [{ usuario_id: aprovador.id, todos_setores: false, setores: ['Financeiro'] }],
    });
    expect(from).not.toHaveBeenCalled();
  });
});
