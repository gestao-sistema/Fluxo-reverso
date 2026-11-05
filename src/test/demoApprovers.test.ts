import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoApi } from '../demo/demoApi';
import { demoDados } from '../demo/demoDatabase';
import { iniciarDemo, selecionarUsuarioDemo } from '../demo/demoMode';

beforeEach(() => {
  demoDados.resetar();
  localStorage.clear();
  iniciarDemo('demo-aprovador');
});

afterEach(() => {
  demoDados.resetar();
  localStorage.clear();
});

describe('aprovação por setor no modo demo', () => {
  it('mostra somente combinações configuradas e revalida o escopo ao decidir', async () => {
    const base = demoDados.solicitacoes().find((item) => item.id.endsWith('000000000001'))!;
    const financeiro = {
      ...base,
      id: 'demo-pedido-financeiro',
      setor: 'Financeiro',
      nome_cliente: 'Cliente Financeiro Demo',
      status: 'aguardando_aprovacao' as const,
      aprovacao_status: 'aguardando_aprovacao' as const,
    };
    demoDados.salvarSolicitacoes([...demoDados.solicitacoes(), financeiro]);

    const fila = await demoApi.getFilaAprovacao();
    expect(fila.some((item) => item.setor === 'Comercial Alinare')).toBe(true);
    expect(fila.some((item) => item.id === financeiro.id)).toBe(false);
    await expect(demoApi.decidirAprovacao({ ...financeiro, aprovacao_versao: 1 }, 'approve', selecionarUsuarioDemo('demo-aprovador'), ''))
      .rejects.toThrow(/empresa e setor/);
  });

  it('retirar a configuração bloqueia decisão pendente já aberta; usuário comum não a altera', async () => {
    const pedido = demoDados.solicitacoes().find((item) => item.id.endsWith('000000000001'))!;
    const stale = { ...pedido, aprovacao_status: 'aguardando_aprovacao' as const, aprovacao_versao: 1 };

    selecionarUsuarioDemo('demo-mestre');
    await expect(demoApi.salvarConfigAprovadoresReversa('Alinare', [])).resolves.toBeUndefined();
    selecionarUsuarioDemo('demo-aprovador');
    await expect(demoApi.decidirAprovacao(stale, 'approve', selecionarUsuarioDemo('demo-aprovador'), ''))
      .rejects.toThrow(/empresa e setor/);

    selecionarUsuarioDemo('demo-solicitante-alinare');
    await expect(demoApi.salvarConfigAprovadoresReversa('Alinare', []))
      .rejects.toThrow(/Somente administradores/);
  });
});
