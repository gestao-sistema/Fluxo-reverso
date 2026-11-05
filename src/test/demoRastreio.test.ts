import { beforeEach, describe, expect, it } from 'vitest';
import { demoApi } from '../demo/demoApi';
import { demoDados } from '../demo/demoDatabase';
import { iniciarDemo, selecionarUsuarioDemo } from '../demo/demoMode';

// Código de rastreamento na demonstração: mesmo contrato do banco (emissão vigente, permissão, bloqueio após postagem).
const pdf = () => new File(['%PDF-1.4 x'], 'e.pdf', { type: 'application/pdf' });
const pedido = (sufixo: string) => demoDados.solicitacoes().find((p) => p.id.endsWith(sufixo))!;

beforeEach(() => {
  demoDados.resetar();
  localStorage.clear();
  iniciarDemo('demo-etiquetas');
});

describe('rastreamento na demonstração', () => {
  it('sem emissão não há onde guardar o código (nada é gravado direto no pedido)', async () => {
    const p = pedido('000000000005');
    await expect(demoApi.salvarCodigoRastreio(p.id, 'BB111111111BR')).rejects.toThrow(/ainda não tem etiqueta emitida/);
    expect(pedido('000000000005').codigo_rastreio ?? null).toBeNull();
  });

  it('salva e remove pela emissão vigente, preservando autorização e datas, com evento no histórico da emissão', async () => {
    const p = pedido('000000000005');
    await demoApi.registrarEtiqueta(p, pdf(), { emissaoId: '70000000-0000-0000-0000-000000000005', codigoAutorizacao: 'AUT-7', codigoRastreio: null, emitidaEm: '2026-10-20', validaAte: '2026-11-19' });
    const salvo = await demoApi.salvarCodigoRastreio(p.id, 'bb111111111br');
    expect(salvo.codigo_rastreio).toBe('BB111111111BR');
    const removido = await demoApi.removerCodigoRastreio(p.id);
    expect(removido.codigo_rastreio).toBeNull();
    const emissao = await demoApi.getEmissaoAtual(p.id);
    expect(emissao).toMatchObject({ codigo_autorizacao: 'AUT-7', codigo_rastreio: null, emitida_em: '2026-10-20', valida_ate: '2026-11-19' });
    expect((await demoApi.getHistoricoEmissao(p.id)).filter((e) => e.tipo === 'dados_atualizados')).toHaveLength(2);
  });

  it('depois que o rastreio mostra postagem o código não muda nem é removido', async () => {
    const postado = pedido('000000000008'); // exemplo já postado, com código
    await demoApi.getEmissaoAtual(postado.id); // garante a emissão migrada do exemplo
    await expect(demoApi.removerCodigoRastreio(postado.id)).rejects.toThrow(/já mostra postagem/);
    await expect(demoApi.salvarCodigoRastreio(postado.id, 'ZZ000000000BR')).rejects.toThrow(/já mostra postagem/);
    expect(pedido('000000000008').codigo_rastreio).toBe('AA123456789BR');
  });

  it('sem a capacidade de emissão não altera o código', async () => {
    const p = pedido('000000000005');
    await demoApi.registrarEtiqueta(p, pdf(), { emissaoId: '71000000-0000-0000-0000-000000000005', codigoAutorizacao: 'AUT-8', codigoRastreio: 'BB111111111BR' });
    selecionarUsuarioDemo('demo-expedicao'); // Gerência: consulta, não emite
    await expect(demoApi.removerCodigoRastreio(p.id)).rejects.toThrow(/permissão/);
    expect(pedido('000000000005').codigo_rastreio).toBe('BB111111111BR');
  });

  it('código repetido em outro pedido é recusado', async () => {
    const p = pedido('000000000005');
    await demoApi.registrarEtiqueta(p, pdf(), { emissaoId: '72000000-0000-0000-0000-000000000005', codigoAutorizacao: 'AUT-9', codigoRastreio: null });
    await expect(demoApi.salvarCodigoRastreio(p.id, 'AA123456789BR')).rejects.toThrow(/outra solicitação/);
  });
});
