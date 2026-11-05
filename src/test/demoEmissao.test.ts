import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoApi } from '../demo/demoApi';
import { demoDados, type DemoEmissao } from '../demo/demoDatabase';
import { iniciarDemo, selecionarUsuarioDemo } from '../demo/demoMode';
import { statusEfetivo } from '../lib/situacaoPedido';

const file = () => new File(['pdf de demonstração'], 'etiqueta-correios.pdf', { type: 'application/pdf' });
const createObjectUrlOriginal = URL.createObjectURL;

beforeEach(() => {
  demoDados.resetar();
  localStorage.clear();
  iniciarDemo('demo-etiquetas');
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:etiqueta-demo') });
});

afterEach(() => {
  demoDados.resetar();
  localStorage.clear();
  vi.restoreAllMocks();
  if (createObjectUrlOriginal) {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrlOriginal });
  } else {
    delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
  }
});

describe('emissão de etiqueta em modo demo', () => {
  it('persiste aprovação e libera o mesmo pedido para emissão após nova consulta', async () => {
    iniciarDemo('demo-solicitante-alinare');
    const pedidoPendente = demoDados.solicitacoes().find((item) => item.id.endsWith('000000000001'))!;
    const aprovador = selecionarUsuarioDemo('demo-aprovador');
    const itemFila = (await demoApi.getFilaAprovacao()).find((item) => item.id === pedidoPendente.id)!;

    const aprovada = await demoApi.decidirAprovacao(itemFila, 'approve', aprovador, '');
    const salvo = demoDados.solicitacoes().find((item) => item.id === pedidoPendente.id)!;
    expect(salvo.aprovacao_status).toBe('aprovada');
    expect(salvo.status).toBe('pendente');
    expect((await demoApi.getFilaAprovacao()).some((item) => item.id === salvo.id)).toBe(false);

    selecionarUsuarioDemo('demo-etiquetas');
    const emitida = await demoApi.registrarEtiqueta(aprovada, file(), {
      emissaoId: '45000000-0000-0000-0000-000000000001',
      codigoAutorizacao: 'AUT-DEMO-APROVADA',
      codigoRastreio: null,
      emitidaEm: '2026-10-20',
      validaAte: '2026-10-30',
    });
    expect(emitida.status).toBe('etiqueta_gerada');
  });

  it('persiste a rejeição, justificativa e histórico consultados pela solicitante', async () => {
    iniciarDemo('demo-solicitante-alinare');
    const pedidoPendente = demoDados.solicitacoes().find((item) => item.id.endsWith('000000000001'))!;
    const aprovador = selecionarUsuarioDemo('demo-aprovador');
    const itemFila = (await demoApi.getFilaAprovacao()).find((item) => item.id === pedidoPendente.id)!;

    await demoApi.decidirAprovacao(itemFila, 'reject', aprovador, 'Endereço fictício incorreto');

    selecionarUsuarioDemo('demo-solicitante-alinare');
    const meuPedido = (await demoApi.getMeusSolicitacoes()).find((item) => item.id === pedidoPendente.id)!;
    // como no banco: a rejeição não muda a situação logística gravada; a situação exibida é a efetiva
    expect(meuPedido.status).toBe('pendente');
    expect(statusEfetivo(meuPedido)).toBe('reprovado');
    expect(meuPedido.aprovacao_status).toBe('rejeitada');
    expect(meuPedido.aprovacao_justificativa).toBe('Endereço fictício incorreto');
    const [evento] = await demoApi.getHistoricoAprovacao(pedidoPendente.id);
    expect(evento.user_nome).toBe('Paula Mendes');
    expect(evento.justificativa).toBe('Endereço fictício incorreto');
  });

  it('registra a emissão aprovada, separa códigos e avança apenas para acompanhamento', async () => {
    const pedido = demoDados.solicitacoes().find((item) => item.id.endsWith('000000000005'))!;
    const atualizado = await demoApi.registrarEtiqueta(pedido, file(), {
      emissaoId: '50000000-0000-0000-0000-000000000005',
      codigoAutorizacao: 'AUT-DEMO-5005',
      codigoRastreio: null,
      emitidaEm: '2026-10-20',
      validaAte: '2026-11-19',
    });

    expect(atualizado.status).toBe('etiqueta_gerada');
    expect(atualizado.codigo_rastreio).toBeNull();
    const atual = await demoApi.getEmissaoAtual(pedido.id);
    expect(atual?.codigo_autorizacao).toBe('AUT-DEMO-5005');
    expect(atual?.codigo_rastreio).toBeNull();
    expect(atual?.emitida_em).toBe('2026-10-20');
    expect(atual?.valida_ate).toBe('2026-11-19');
    expect(atual?.pdf_path).toContain(pedido.id);
    expect((await demoApi.getHistoricoEmissao(pedido.id)).map((item) => item.tipo)).toEqual(expect.arrayContaining(['registrada', 'pdf_anexado']));
  });

  it('mantém datas desconhecidas como null sem presumir prazo', async () => {
    const pedido = demoDados.solicitacoes().find((item) => item.id.endsWith('000000000005'))!;
    await demoApi.registrarEtiqueta(pedido, file(), {
      emissaoId: '55000000-0000-0000-0000-000000000005',
      codigoAutorizacao: 'AUT-DEMO-SEM-DATA',
      codigoRastreio: null,
    });
    const atual = await demoApi.getEmissaoAtual(pedido.id);
    expect(atual?.emitida_em).toBeNull();
    expect(atual?.valida_ate).toBeNull();
  });

  it('preserva documento e evento anterior ao registrar uma reemissão', async () => {
    const pedido = demoDados.solicitacoes().find((item) => item.id.endsWith('000000000007'))!;
    await demoApi.getEmissaoAtual(pedido.id);
    const emissoesAntigas = demoDados.emissoes();
    const emissaoAntiga = emissoesAntigas.find((item) => item.solicitacao_id === pedido.id)!;
    emissaoAntiga.emitida_em = '2026-10-01';
    emissaoAntiga.valida_ate = '2026-10-31';
    demoDados.salvarEmissoes(emissoesAntigas);
    const anterior = await demoApi.getEmissaoAtual(pedido.id);
    const pathAnterior = anterior?.pdf_path;
    expect(pathAnterior).toBeTruthy();

    await demoApi.registrarEtiqueta(pedido, file(), {
      emissaoId: '60000000-0000-0000-0000-000000000007',
      codigoAutorizacao: 'AUT-DEMO-REEMISSAO',
      codigoRastreio: null,
      motivoReemissao: 'pdf_incorreto',
    });

    const emissaoAtual = await demoApi.getEmissaoAtual(pedido.id);
    const emitidas = demoDados.emissoes().filter((item) => item.solicitacao_id === pedido.id);
    const eventos = await demoApi.getHistoricoEmissao(pedido.id);
    expect(emissaoAtual?.sequencia).toBe(2);
    expect(emitidas).toHaveLength(2);
    expect(emitidas.find((item) => item.id === anterior?.id)?.pdf_path).toBe(pathAnterior);
    expect(emitidas.find((item) => item.id === anterior?.id)?.substituida_em).toBeTruthy();
    expect(emitidas.find((item) => item.id === anterior?.id)?.emitida_em).toBe('2026-10-01');
    expect(emitidas.find((item) => item.id === anterior?.id)?.valida_ate).toBe('2026-10-31');
    expect(eventos.map((item) => item.tipo)).toEqual(expect.arrayContaining(['substituida', 'registrada', 'pdf_anexado']));
    expect(await demoApi.urlEtiqueta(pathAnterior!)).toMatch(/^data:application\/pdf;base64,/);
  });

  it('recupera emissão incompleta sem duplicar e preserva datas quando elas não são reenviadas', async () => {
    const pedido = demoDados.solicitacoes().find((item) => item.id.endsWith('000000000005'))!;
    const incompleta: DemoEmissao = {
      id: '70000000-0000-0000-0000-000000000005',
      solicitacao_id: pedido.id,
      sequencia: 1,
      codigo_autorizacao: 'AUT-DEMO-INCOMPLETA',
      codigo_rastreio: null,
      pdf_path: null,
      pdf_nome: null,
      emitida_em: '2026-10-20',
      valida_ate: '2026-11-19',
      substituida_em: null,
      origem: 'sistema',
      registrado_por: 'demo-emissor-alinare',
      registrado_por_nome: 'Emissor demo',
      emissao_anterior_id: null,
      motivo_reemissao: null,
      motivo_reemissao_detalhe: null,
      pdf_anexado_em: null,
    };
    demoDados.salvarEmissoes([incompleta]);

    await demoApi.registrarEtiqueta(pedido, file(), {
      emissaoId: incompleta.id,
      codigoAutorizacao: incompleta.codigo_autorizacao,
      codigoRastreio: null,
    });

    const emitidas = demoDados.emissoes().filter((item) => item.solicitacao_id === pedido.id);
    expect(emitidas).toHaveLength(1);
    expect(emitidas[0].id).toBe(incompleta.id);
    expect(emitidas[0].pdf_path).toContain(incompleta.id);
    expect(emitidas[0].emitida_em).toBe('2026-10-20');
    expect(emitidas[0].valida_ate).toBe('2026-11-19');
  });
});
