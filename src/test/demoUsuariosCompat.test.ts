import { beforeEach, describe, expect, it } from 'vitest';
import { demoApi } from '../demo/demoApi';
import demoAuthService from '../demo/demoAuthService';
import { demoDados } from '../demo/demoDatabase';
import { iniciarDemo, selecionarUsuarioDemo, USUARIOS_DEMO, usuariosDemo } from '../demo/demoMode';
import type { CreateSolicitacaoPayload } from '../types';

// Usuários, aprovadores e avisos da demonstração vêm do mesmo cadastro, também a partir de dados salvos
// por versões antigas (sem limpar o localStorage e sem perder pedidos ou configurações).
const CHAVE = (nome: string) => `flowdesk:demo:dados:${nome}`;
const gravarAntigo = (nome: string, valor: unknown) => localStorage.setItem(CHAVE(nome), JSON.stringify(valor));
const ids = (itens: Array<{ id: string }>) => itens.map((i) => i.id);

beforeEach(() => {
  demoDados.resetar();
  localStorage.clear();
  iniciarDemo('demo-solicitante-alinare');
});

describe('armazenamento novo', () => {
  it('usuários, aprovadores e avisos partem dos perfis de teste atuais', () => {
    expect(ids(demoDados.usuarios())).toEqual(USUARIOS_DEMO.map((u) => u.id));
    expect(demoDados.configAprovadores().map((c) => `${c.empresa}:${c.usuario_id}`)).toEqual(expect.arrayContaining([
      'Alinare:demo-aprovador-alinare', 'Novitah:demo-aprovador-novitah', 'Alinare:demo-gerente-aprovadora',
    ]));
    const destinatarios = new Set(demoDados.notificacoesEmissao().map((a) => a.destinatario_id));
    expect(destinatarios).toEqual(new Set(['demo-etiquetas', 'demo-expedicao-alinare', 'demo-expedicao-novitah', 'demo-mestre']));
  });
});

describe('dados salvos por versões antigas', () => {
  const pedidoAprovado = {
    id: 'ped-antigo-1', created_at: '2026-10-20T10:00:00.000Z', empresa: 'Alinare', data_solicitacao: '2026-10-20', solicitante: 'Camila',
    setor: 'Comercial Alinare', codigo_cliente: 1, nome_cliente: 'Pedido antigo', endereco_postagem: 'Rua A', motivo: 'Peça com defeito',
    autorizacao: 'Paula Mendes', status: 'pendente', aprovacao_status: 'aprovada', aprovacao_legada: false, tempo_preenchimento_segundos: 5,
  };
  const antigoUsuarios = [
    { id: 'demo-etiquetas', nome: 'Bianca Rocha', usuario: 'bianca.etiquetas', telas: ['emitir-etiqueta'], perfilAcesso: 'emissor_etiqueta', empresasAcesso: ['Alinare', 'Novitah'] },
    { id: 'demo-solicitante-alinare', nome: 'Camila Oliveira', usuario: 'camila.alinare', telas: ['dashboard-alinare', 'lista-alinare', 'formulario-alinare'], perfilAcesso: 'solicitante', empresasAcesso: ['Alinare'] },
    { id: 'demo-checkin', nome: 'André Lima', usuario: 'andre.checkin', telas: ['confirmar-checkin'], perfilAcesso: 'checkin_correios', empresasAcesso: ['Alinare'] },
    { id: 'demo-usuario-criado-na-tela', nome: 'Pessoa Criada', usuario: 'pessoa.criada', telas: ['formulario-alinare'], empresasAcesso: ['Alinare'] },
  ];

  function snapshotAntigo() {
    gravarAntigo('usuarios', antigoUsuarios);
    gravarAntigo('config-aprovadores', [{ empresa: 'Alinare', usuario_id: 'demo-aprovador', todos_setores: false, setores: ['Comercial Alinare'] }]);
    gravarAntigo('solicitacoes', [pedidoAprovado]);
    gravarAntigo('notificacoes-emissao', [
      { id: 'aviso-lido', solicitacao_id: 'ped-antigo-1', empresa: 'Alinare', created_at: '2026-10-20T10:00:00.000Z', lida_em: '2026-10-21T10:00:00.000Z', destinatario_id: 'demo-etiquetas', aprovacao_versao: 1 },
    ]);
  }

  it('perfis de teste voltam ao padrão atual uma vez; o que foi criado na tela e os pedidos ficam', () => {
    snapshotAntigo();
    const usuarios = demoDados.usuarios();
    expect(usuarios.find((u) => u.id === 'demo-etiquetas')!.telas).toEqual(expect.arrayContaining(['emitir-etiqueta', 'lista-geral']));
    expect(usuarios.find((u) => u.id === 'demo-solicitante-alinare')!.telas).toEqual(['formulario-alinare']);
    expect(ids(usuarios)).toEqual(expect.arrayContaining(['demo-usuario-criado-na-tela', 'demo-expedicao-alinare', 'demo-expedicao-novitah', 'demo-aprovador-novitah']));
    expect(demoDados.solicitacoes()).toHaveLength(1);
    // a reconciliação não se repete: uma edição feita depois permanece
    const editado = demoDados.usuarios().map((u) => u.id === 'demo-etiquetas' ? { ...u, telas: ['emitir-etiqueta'] } : u);
    demoDados.salvarUsuarios(editado as never);
    expect(demoDados.usuarios().find((u) => u.id === 'demo-etiquetas')!.telas).toEqual(['emitir-etiqueta']);
  });

  it('aprovadores novos entram uma única vez, sem reabrir o que foi removido de propósito', () => {
    snapshotAntigo();
    const config = demoDados.configAprovadores();
    expect(config.filter((c) => c.usuario_id === 'demo-aprovador-novitah')).toHaveLength(1);
    expect(config.some((c) => c.usuario_id === 'demo-aprovador' && c.empresa === 'Alinare')).toBe(true);
    // remoção explícita do aprovador novo, depois nova leitura: não volta
    demoDados.salvarConfigAprovadores(config.filter((c) => c.usuario_id !== 'demo-aprovador-novitah'));
    expect(demoDados.configAprovadores().some((c) => c.usuario_id === 'demo-aprovador-novitah')).toBe(false);
  });

  it('avisos: emissores habilitados na empresa recebem o que faltava; o aviso lido continua lido; sem duplicar', () => {
    snapshotAntigo();
    const avisos = demoDados.notificacoesEmissao();
    const doPedido = avisos.filter((a) => a.solicitacao_id === 'ped-antigo-1');
    expect(new Set(doPedido.map((a) => a.destinatario_id))).toEqual(new Set(['demo-etiquetas', 'demo-expedicao-alinare', 'demo-mestre']));
    expect(doPedido.find((a) => a.id === 'aviso-lido')!.lida_em).toBeTruthy();
    expect(doPedido.filter((a) => a.destinatario_id === 'demo-etiquetas')).toHaveLength(1);
    expect(demoDados.notificacoesEmissao()).toHaveLength(avisos.length); // idempotente
  });

  it('perfil removido de propósito não é restaurado', async () => {
    snapshotAntigo();
    await demoAuthService.removerUsuario('demo-qualidade');
    expect(ids(demoDados.usuarios())).not.toContain('demo-qualidade');
    expect(usuariosDemo().some((u) => u.id === 'demo-qualidade')).toBe(false);
  });
});

describe('um só cadastro para seletor, sessão, aprovação e avisos', () => {
  const payload = (empresa: 'Alinare' | 'Novitah', nome: string) => ({
    empresa, data_solicitacao: '2026-10-27', solicitante: 'x', setor: empresa === 'Alinare' ? 'Comercial Alinare' : 'Comercial Novitah',
    codigo_cliente: 1, nome_cliente: nome, endereco_postagem: 'Rua A', motivo: 'Peça com defeito', justificativa_outros: null,
    autorizacao: null, status: 'aguardando_aprovacao', tempo_preenchimento_segundos: 5,
  }) as CreateSolicitacaoPayload;

  it('edição de permissão no cadastro vale para a sessão do perfil', async () => {
    const [primeiro] = demoDados.usuarios();
    await demoAuthService.atualizarUsuario(primeiro.id, { perfilAcesso: 'personalizado', telas: [...primeiro.telas, 'dashboard-alinare'] } as never);
    expect(selecionarUsuarioDemo(primeiro.id).telas).toContain('dashboard-alinare');
  });

  it('aprovação avisa só os emissores da empresa do pedido: Alinare, Novitah e as duas', async () => {
    for (const [empresa, esperados] of [
      ['Alinare', ['demo-etiquetas', 'demo-expedicao-alinare', 'demo-mestre']],
      ['Novitah', ['demo-etiquetas', 'demo-expedicao-novitah', 'demo-mestre']],
    ] as const) {
      selecionarUsuarioDemo(empresa === 'Alinare' ? 'demo-solicitante-alinare' : 'demo-solicitante-novitah');
      const pedido = await demoApi.createSolicitacao(payload(empresa, `Aviso ${empresa}`));
      selecionarUsuarioDemo(empresa === 'Alinare' ? 'demo-aprovador-alinare' : 'demo-aprovador-novitah');
      const item = (await demoApi.getFilaAprovacao()).find((i) => i.id === pedido.id)!;
      await demoApi.decidirAprovacao(item, 'approve', usuariosDemo().find((u) => u.id === (empresa === 'Alinare' ? 'demo-aprovador-alinare' : 'demo-aprovador-novitah'))!, '');
      const destinatarios = demoDados.notificacoesEmissao().filter((a) => a.solicitacao_id === pedido.id).map((a) => a.destinatario_id);
      expect(new Set(destinatarios)).toEqual(new Set(esperados));
      expect(destinatarios).toHaveLength(esperados.length); // sem duplicar
    }
  });

  it('cada emissor lê só os próprios avisos, e a leitura é individual', async () => {
    selecionarUsuarioDemo('demo-solicitante-alinare');
    const pedido = await demoApi.createSolicitacao(payload('Alinare', 'Leitura individual'));
    selecionarUsuarioDemo('demo-aprovador-alinare');
    const item = (await demoApi.getFilaAprovacao()).find((i) => i.id === pedido.id)!;
    await demoApi.decidirAprovacao(item, 'approve', usuariosDemo().find((u) => u.id === 'demo-aprovador-alinare')!, '');

    selecionarUsuarioDemo('demo-expedicao-alinare');
    const dela = (await demoApi.getNotificacoesEmissao()).notificacoes.find((a) => a.solicitacao_id === pedido.id)!;
    expect(await demoApi.marcarNotificacaoEmissaoLida(dela.id)).toBe(true);
    selecionarUsuarioDemo('demo-etiquetas');
    const deleAmbas = (await demoApi.getNotificacoesEmissao()).notificacoes.find((a) => a.solicitacao_id === pedido.id)!;
    expect(deleAmbas.lida_em).toBeNull();
    selecionarUsuarioDemo('demo-expedicao-novitah');
    expect((await demoApi.getNotificacoesEmissao()).notificacoes.some((a) => a.solicitacao_id === pedido.id)).toBe(false);
  });
});
