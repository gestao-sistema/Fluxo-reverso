import { beforeEach, describe, expect, it } from 'vitest';
import { demoApi } from '../demo/demoApi';
import { demoDados } from '../demo/demoDatabase';
import { iniciarDemo, selecionarUsuarioDemo, USUARIOS_DEMO } from '../demo/demoMode';
import { listarAvisosDemo, demoAvisosReverso } from '../demo/demoAvisosReverso';
import type { UsuarioAutenticado } from '../types';

const usuario = (id: string) => USUARIOS_DEMO.find((item) => item.id === id) as unknown as UsuarioAutenticado;
const pedidoDoAviso = (avisos: { solicitacao_id: string }[], id: string) => avisos.filter((aviso) => aviso.solicitacao_id === id);

beforeEach(() => {
  demoDados.resetar();
  localStorage.clear();
  iniciarDemo('demo-solicitante-alinare');
});

describe('demonstração: avisos derivados das mesmas regras do banco', () => {
  it('o solicitante recebe o pedido registrado de cada pedido próprio, e nenhum de outra empresa', () => {
    const avisos = listarAvisosDemo(usuario('demo-solicitante-alinare'));
    const registrados = avisos.filter((aviso) => aviso.evento === 'pedido_criado');
    expect(registrados.length).toBeGreaterThan(0);
    expect(registrados.every((aviso) => aviso.empresa === 'Alinare')).toBe(true);
    expect(avisos.some((aviso) => aviso.empresa === 'Novitah')).toBe(false);
  });

  it('o aprovador elegível recebe a pendência; outra empresa não recebe a da Alinare', () => {
    const marcelo = listarAvisosDemo(usuario('demo-aprovador-alinare'));
    const pendentes = marcelo.filter((aviso) => aviso.evento === 'aprovacao_pendente' && !aviso.superado_em);
    expect(pendentes.length).toBeGreaterThan(0);
    expect(pendentes.every((aviso) => aviso.empresa === 'Alinare')).toBe(true);

    const lucia = listarAvisosDemo(usuario('demo-aprovador-novitah'));
    expect(lucia.some((aviso) => aviso.empresa === 'Alinare')).toBe(false);
  });

  it('usuário sem autoridade de aprovação não tem pendências', () => {
    const avisos = listarAvisosDemo(usuario('demo-solicitante-alinare'));
    expect(avisos.some((aviso) => aviso.evento === 'aprovacao_pendente')).toBe(false);
  });

  it('decisão supera a pendência e o solicitante recebe o resultado com a observação', async () => {
    const marcelo = usuario('demo-aprovador-alinare');
    selecionarUsuarioDemo('demo-aprovador-alinare');
    const fila = await demoApi.getFilaAprovacao();
    const pedido = fila.find((item) => item.empresa === 'Alinare' && item.solicitado_por === 'demo-solicitante-alinare');
    expect(pedido).toBeDefined();

    const antes = listarAvisosDemo(marcelo);
    expect(pedidoDoAviso(antes, pedido!.id).find((aviso) => aviso.evento === 'aprovacao_pendente')?.superado_em).toBeFalsy();

    await demoApi.decidirAprovacao(pedido!, 'approve', marcelo, 'Conferido com a NF');

    const depois = listarAvisosDemo(marcelo);
    expect(pedidoDoAviso(depois, pedido!.id).find((aviso) => aviso.evento === 'aprovacao_pendente')?.superado_em).toBeTruthy();
    const resultado = listarAvisosDemo(usuario('demo-solicitante-alinare'))
      .find((aviso) => aviso.solicitacao_id === pedido!.id && aviso.evento === 'pedido_aprovado');
    expect(resultado?.justificativa).toBe('Conferido com a NF');
  });
});

describe('demonstração: leitura individual e persistência', () => {
  it('marcar leitura é individual, persiste ao reler e não altera o pedido', async () => {
    const marcelo = usuario('demo-aprovador-alinare');
    selecionarUsuarioDemo('demo-aprovador-alinare');
    const pendente = listarAvisosDemo(marcelo).find((aviso) => aviso.evento === 'aprovacao_pendente' && !aviso.superado_em);
    expect(pendente).toBeDefined();
    const pedidosAntes = JSON.stringify(demoDados.solicitacoes());
    const naoLidosAntes = await demoAvisosReverso.contarNaoLidos();

    expect(await demoAvisosReverso.marcarLido(pendente!.id)).toBe(true);
    expect(JSON.stringify(demoDados.solicitacoes())).toBe(pedidosAntes);
    expect(await demoAvisosReverso.contarNaoLidos()).toBe(naoLidosAntes - 1);

    // Reler (recarga) mantém a leitura
    const relido = listarAvisosDemo(marcelo).find((aviso) => aviso.id === pendente!.id);
    expect(relido?.lido_em).toBeTruthy();
  });

  it('outra pessoa não consegue marcar o aviso alheio', async () => {
    const marcelo = usuario('demo-aprovador-alinare');
    const pendente = listarAvisosDemo(marcelo).find((aviso) => aviso.evento === 'aprovacao_pendente' && !aviso.superado_em);
    expect(pendente).toBeDefined();
    expect(listarAvisosDemo(usuario('demo-aprovador-novitah')).some((aviso) => aviso.id === pendente!.id)).toBe(false);
    selecionarUsuarioDemo('demo-aprovador-novitah');
    expect(await demoAvisosReverso.marcarLido(pendente!.id)).toBe(false);
  });
});
