import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoApi } from '../demo/demoApi';
import { demoDados } from '../demo/demoDatabase';
import { iniciarDemo, selecionarUsuarioDemo, USUARIOS_DEMO } from '../demo/demoMode';
import type { CreateSolicitacaoPayload, SolicitacaoAprovacao } from '../types';

const usuario = (id: string) => USUARIOS_DEMO.find((u) => u.id === id)!;
const payload = (empresa: 'Alinare' | 'Novitah', nome: string): CreateSolicitacaoPayload => ({
  empresa, data_solicitacao: '2026-10-27', solicitante: 'x', setor: empresa === 'Alinare' ? 'Comercial Alinare' : 'Comercial Novitah',
  codigo_cliente: 7001, nome_cliente: nome, endereco_postagem: 'Rua A, 1', motivo: 'Peça com defeito',
  justificativa_outros: null, autorizacao: null, status: 'aguardando_aprovacao', tempo_preenchimento_segundos: 10,
} as CreateSolicitacaoPayload);

async function criarComo(id: string, empresa: 'Alinare' | 'Novitah', nome: string) {
  selecionarUsuarioDemo(id);
  return demoApi.createSolicitacao(payload(empresa, nome));
}
const filaDe = async (id: string, pedidoId: string): Promise<SolicitacaoAprovacao | undefined> => {
  selecionarUsuarioDemo(id);
  return (await demoApi.getFilaAprovacao()).find((item) => item.id === pedidoId);
};

beforeEach(() => {
  demoDados.resetar();
  localStorage.clear();
  iniciarDemo('demo-solicitante-alinare');
});

describe('histórico de aprovação da demonstração: só o que foi decidido', () => {
  it('registra quem decidiu, quando, a versão e a justificativa reais, uma vez só', async () => {
    const pedido = await criarComo('demo-solicitante-alinare', 'Alinare', 'Cliente histórico');
    expect(await demoApi.getHistoricoAprovacao(pedido.id)).toEqual([]); // nada fabricado antes da decisão

    const item = (await filaDe('demo-aprovador-alinare', pedido.id))!;
    const antes = Date.now();
    await demoApi.decidirAprovacao(item, 'approve', usuario('demo-aprovador-alinare'), '');

    const eventos = await demoApi.getHistoricoAprovacao(pedido.id);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ evento: 'aprovada', user_nome: 'Marcelo Antunes', versao: 1, justificativa: null });
    expect(Date.parse(eventos[0].created_at)).toBeGreaterThanOrEqual(antes - 1000);
    expect(eventos[0].created_at).not.toBe(pedido.created_at);
    // a decisão não vira também uma linha do histórico operacional
    expect((await demoApi.getHistorico(pedido.id)).some((h) => /aprovada|reprovada/i.test(h.acao))).toBe(false);
  });

  it('rejeição guarda a justificativa digitada e o decisor real', async () => {
    const pedido = await criarComo('demo-solicitante-alinare', 'Alinare', 'Cliente rejeitado');
    const item = (await filaDe('demo-aprovador', pedido.id))!;
    await demoApi.decidirAprovacao(item, 'reject', usuario('demo-aprovador'), 'Endereço incompleto');
    const [evento] = await demoApi.getHistoricoAprovacao(pedido.id);
    expect(evento).toMatchObject({ evento: 'rejeitada', user_nome: 'Paula Mendes', justificativa: 'Endereço incompleto' });
  });

  it('pedido decidido sem registro (dados antigos) não ganha auditoria inventada', async () => {
    const pedido = await criarComo('demo-solicitante-alinare', 'Alinare', 'Cliente antigo');
    demoDados.salvarSolicitacoes(demoDados.solicitacoes().map((p) => p.id === pedido.id ? { ...p, aprovacao_status: 'aprovada' as const } : p));
    expect(await demoApi.getHistoricoAprovacao(pedido.id)).toEqual([]);
  });

  it('decisão repetida é recusada e não duplica o registro', async () => {
    const pedido = await criarComo('demo-solicitante-alinare', 'Alinare', 'Cliente rodadas');
    const item = (await filaDe('demo-aprovador', pedido.id))!;
    await demoApi.decidirAprovacao(item, 'approve', usuario('demo-aprovador'), '');
    expect(await demoApi.getHistoricoAprovacao(pedido.id)).toHaveLength(1);
    selecionarUsuarioDemo('demo-aprovador');
    await expect(demoApi.decidirAprovacao(item, 'reject', usuario('demo-aprovador'), 'tarde demais')).rejects.toThrow();
    expect(await demoApi.getHistoricoAprovacao(pedido.id)).toHaveLength(1);
  });
});

describe('autoaprovação da demonstração (espelha aprovacao_config, desligada por padrão)', () => {
  it('pedido próprio: aparece na fila sem poder aprovar, e a decisão é recusada ao tentar', async () => {
    const pedido = await criarComo('demo-gerente-aprovadora', 'Alinare', 'Pedido da Joyce');
    const item = (await filaDe('demo-gerente-aprovadora', pedido.id))!;
    expect(item).toMatchObject({ proprio_pedido: true, pode_aprovar: false });
    await expect(demoApi.decidirAprovacao(item, 'approve', usuario('demo-gerente-aprovadora'), ''))
      .rejects.toThrow('Você não pode aprovar uma solicitação registrada ou alterada por você.');
    expect(demoDados.solicitacoes().find((p) => p.id === pedido.id)!.aprovacao_status).toBe('aguardando_aprovacao');
    expect(await demoApi.getHistoricoAprovacao(pedido.id)).toEqual([]);
  });

  it('terceiro autorizado aprova o pedido de outra pessoa; o próprio autor ainda pode rejeitar', async () => {
    const pedido = await criarComo('demo-gerente-aprovadora', 'Alinare', 'Pedido da Joyce 2');
    const comoTerceiro = (await filaDe('demo-aprovador-alinare', pedido.id))!;
    expect(comoTerceiro).toMatchObject({ proprio_pedido: false, pode_aprovar: true });
    await demoApi.decidirAprovacao(comoTerceiro, 'approve', usuario('demo-aprovador-alinare'), '');
    expect(demoDados.solicitacoes().find((p) => p.id === pedido.id)!.aprovacao_status).toBe('aprovada');

    const outro = await criarComo('demo-gerente-aprovadora', 'Alinare', 'Pedido da Joyce 3');
    const proprio = (await filaDe('demo-gerente-aprovadora', outro.id))!;
    await demoApi.decidirAprovacao(proprio, 'reject', usuario('demo-gerente-aprovadora'), 'Desisti do pedido');
    expect(demoDados.solicitacoes().find((p) => p.id === outro.id)!.aprovacao_status).toBe('rejeitada');
  });

  it('configuração habilitada explicitamente libera a autoaprovação; TI não ganha aprovação sem ser aprovadora', async () => {
    const pedido = await criarComo('demo-gerente-aprovadora', 'Alinare', 'Pedido da Joyce 4');
    demoDados.salvarPermitirAutoaprovacao(true);
    const item = (await filaDe('demo-gerente-aprovadora', pedido.id))!;
    expect(item.pode_aprovar).toBe(true);
    await demoApi.decidirAprovacao(item, 'approve', usuario('demo-gerente-aprovadora'), '');
    expect(demoDados.solicitacoes().find((p) => p.id === pedido.id)!.aprovacao_status).toBe('aprovada');

    const outro = await criarComo('demo-solicitante-alinare', 'Alinare', 'Pedido para TI');
    demoDados.salvarPermitirAutoaprovacao(false);
    expect(await filaDe('demo-mestre', outro.id)).toBeUndefined();
  });

  it('empresa ou setor indevido: o aprovador de uma empresa não decide a outra', async () => {
    const pedido = await criarComo('demo-solicitante-novitah', 'Novitah', 'Pedido Novitah');
    expect(await filaDe('demo-aprovador-alinare', pedido.id)).toBeUndefined();
    const item = (await filaDe('demo-aprovador-novitah', pedido.id))!;
    selecionarUsuarioDemo('demo-aprovador-alinare');
    await expect(demoApi.decidirAprovacao(item, 'approve', usuario('demo-aprovador-alinare'), '')).rejects.toThrow(/não está habilitado/);
  });
});

describe('evento de anotação só nasce de uma edição real', () => {
  const acoes = async (id: string) => (await demoApi.getHistorico(id)).map((h) => h.acao);
  const anotacoes = async (id: string) => (await acoes(id)).filter((a) => /Anotação/.test(a));

  it('aprovar: uma decisão e nenhuma anotação fictícia', async () => {
    const pedido = await criarComo('demo-solicitante-alinare', 'Alinare', 'Sem anotação 1');
    await demoApi.decidirAprovacao((await filaDe('demo-aprovador', pedido.id))!, 'approve', usuario('demo-aprovador'), '');
    expect(await anotacoes(pedido.id)).toEqual([]);
    expect(await demoApi.getHistoricoAprovacao(pedido.id)).toHaveLength(1);
  });

  it('rejeitar: uma decisão, justificativa preservada e nenhuma anotação fictícia', async () => {
    const pedido = await criarComo('demo-solicitante-alinare', 'Alinare', 'Sem anotação 2');
    await demoApi.decidirAprovacao((await filaDe('demo-aprovador', pedido.id))!, 'reject', usuario('demo-aprovador'), 'Endereço incompleto');
    expect(await anotacoes(pedido.id)).toEqual([]);
    const [evento] = await demoApi.getHistoricoAprovacao(pedido.id);
    expect(evento.justificativa).toBe('Endereço incompleto');
    expect(demoDados.solicitacoes().find((p) => p.id === pedido.id)!.aprovacao_justificativa).toBe('Endereço incompleto');
    expect(await demoApi.getHistoricoAprovacao(pedido.id)).toHaveLength(1);
  });

  it('editar a anotação de verdade registra o evento; salvar o mesmo conteúdo não registra nada', async () => {
    const pedido = await criarComo('demo-solicitante-alinare', 'Alinare', 'Com anotação');
    const gerente = usuario('demo-mestre');
    await demoApi.updateSolicitacao(pedido.id, { anotacoes: 'Ligar para a cliente' }, gerente);
    expect(await anotacoes(pedido.id)).toEqual(['Anotação atualizada']);
    await demoApi.updateSolicitacao(pedido.id, { anotacoes: 'Ligar para a cliente' }, gerente);
    await demoApi.updateSolicitacao(pedido.id, { anotacoes: null }, usuario('demo-mestre')).catch(() => {});
    // o segundo salvamento igual não duplicou; limpar a anotação é uma edição real
    expect((await anotacoes(pedido.id)).length).toBe(2);
    const vazio = await criarComo('demo-solicitante-alinare', 'Alinare', 'Anotação vazia');
    await demoApi.updateSolicitacao(vazio.id, { anotacoes: null }, gerente);
    await demoApi.updateSolicitacao(vazio.id, { anotacoes: '' as unknown as null }, gerente);
    expect(await anotacoes(vazio.id)).toEqual([]);
  });

  it('F5: o histórico guardado não muda nem duplica ao recarregar os módulos', async () => {
    const pedido = await criarComo('demo-solicitante-alinare', 'Alinare', 'Depois do F5');
    await demoApi.decidirAprovacao((await filaDe('demo-aprovador', pedido.id))!, 'reject', usuario('demo-aprovador'), 'Motivo X');
    const antes = JSON.stringify([await demoApi.getHistorico(pedido.id), await demoApi.getHistoricoAprovacao(pedido.id)]);
    vi.resetModules();
    const recarregado = (await import('../demo/demoApi')).demoApi;
    expect(JSON.stringify([await recarregado.getHistorico(pedido.id), await recarregado.getHistoricoAprovacao(pedido.id)])).toBe(antes);
    expect(await anotacoes(pedido.id)).toEqual([]);
  });
});
