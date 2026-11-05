import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoDados } from '../demo/demoDatabase';
import { iniciarDemo, selecionarUsuarioDemo } from '../demo/demoMode';
import { usarArmazenamentoDemo } from '../demo/demoArquivos';
import { criarArmazenamentoEmMemoria } from './setup';

// O PDF anexado na demonstração é o mesmo depois de F5, da troca de perfil e da reemissão.
// Aqui o "navegador" é um armazenamento em memória que sobrevive ao recarregamento dos módulos.
const pdf = (conteudo: string, nome: string) => new File([`%PDF-1.4 ${conteudo}`], nome, { type: 'application/pdf' });
const lerBlob = async (url: string) => {
  const blob = blobsPorUrl.get(url);
  return blob ? await blob.text() : null;
};
const blobsPorUrl = new Map<string, Blob>();
let armazenamento: ReturnType<typeof criarArmazenamentoEmMemoria>;

async function carregarDemo() {
  vi.resetModules();
  const arquivos = await import('../demo/demoArquivos');
  arquivos.usarArmazenamentoDemo(armazenamento);
  return (await import('../demo/demoApi')).demoApi;
}

beforeEach(() => {
  demoDados.resetar();
  localStorage.clear();
  armazenamento = criarArmazenamentoEmMemoria();
  usarArmazenamentoDemo(armazenamento);
  blobsPorUrl.clear();
  let n = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn((blob: Blob) => { const url = `blob:demo-${++n}`; blobsPorUrl.set(url, blob); return url; }),
  });
  iniciarDemo('demo-etiquetas');
});

afterEach(() => {
  delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
});

const pedido = (sufixo: string) => demoDados.solicitacoes().find((item) => item.id.endsWith(sufixo))!;
const emissao = (id: string, idEmissao: string, nome: string, extra: object = {}) => ({
  emissaoId: idEmissao, codigoAutorizacao: `AUT-${nome}`, codigoRastreio: null, emitidaEm: '2026-10-20', validaAte: '2026-11-19', ...extra,
});

describe('PDF anexado na demonstração', () => {
  it('dois pedidos com PDFs distintos: cada um abre o seu, também depois de F5 e da troca de perfil', async () => {
    let api = await carregarDemo();
    const a = pedido('000000000005');
    const b = pedido('000000000006');
    const atualizadoA = await api.registrarEtiqueta(a, pdf('conteudo-A', 'a.pdf'), emissao(a.id, '10000000-0000-0000-0000-00000000000a', 'A'));
    const atualizadoB = await api.registrarEtiqueta(b, pdf('conteudo-B', 'b.pdf'), emissao(b.id, '10000000-0000-0000-0000-00000000000b', 'B'));
    expect(atualizadoA.etiqueta_path).not.toBe(atualizadoB.etiqueta_path);
    expect(armazenamento.arquivos.size).toBe(2);

    // F5: os módulos são recarregados, só o armazenamento e o localStorage permanecem
    api = await carregarDemo();
    selecionarUsuarioDemo('demo-solicitante-alinare');
    expect(await lerBlob(await api.urlEtiqueta(atualizadoA.etiqueta_path!))).toContain('conteudo-A');
    expect(await lerBlob(await api.urlEtiqueta(atualizadoB.etiqueta_path!))).toContain('conteudo-B');
    expect(await lerBlob(await api.urlEtiqueta(atualizadoB.etiqueta_path!))).not.toContain('conteudo-A');
  });

  it('reemissão preserva o PDF anterior e o novo é o vigente', async () => {
    const api = await carregarDemo();
    const a = pedido('000000000005');
    const primeira = await api.registrarEtiqueta(a, pdf('primeira', 'um.pdf'), emissao(a.id, '20000000-0000-0000-0000-000000000001', 'P'));
    const segunda = await api.registrarEtiqueta(primeira, pdf('segunda', 'dois.pdf'), emissao(a.id, '20000000-0000-0000-0000-000000000002', 'S', { motivoReemissao: 'pdf_incorreto' }));
    expect(segunda.etiqueta_path).not.toBe(primeira.etiqueta_path);
    expect(await lerBlob(await api.urlEtiqueta(primeira.etiqueta_path!))).toContain('primeira');
    expect(await lerBlob(await api.urlEtiqueta(segunda.etiqueta_path!))).toContain('segunda');
    expect((await api.getEmissaoAtual(a.id))?.pdf_path).toBe(segunda.etiqueta_path);
  });

  it('só o exemplo fictício dos dados da demonstração é gerado; o anexado nunca é trocado por ele', async () => {
    const api = await carregarDemo();
    const exemplo = pedido('000000000007');
    const url = await api.urlEtiqueta(exemplo.etiqueta_path!);
    expect(url.startsWith('data:application/pdf')).toBe(true);

    const a = pedido('000000000005');
    const anexado = await api.registrarEtiqueta(a, pdf('real', 'real.pdf'), emissao(a.id, '30000000-0000-0000-0000-000000000001', 'R'));
    armazenamento.arquivos.clear(); // dados do navegador limpos
    await expect(api.urlEtiqueta(anexado.etiqueta_path!)).rejects.toThrow(/não está mais disponível/);
  });

  it('falha ao guardar o PDF: nada é registrado e o pedido não avança', async () => {
    const api = await carregarDemo();
    armazenamento.gravar = async () => { throw new Error('quota excedida'); };
    const a = pedido('000000000005');
    await expect(api.registrarEtiqueta(a, pdf('x', 'x.pdf'), emissao(a.id, '40000000-0000-0000-0000-000000000001', 'X')))
      .rejects.toThrow(/Não foi possível guardar o PDF.*quota excedida/);
    expect(await api.getEmissaoAtual(a.id)).toBeNull();
    const depois = demoDados.solicitacoes().find((item) => item.id === a.id)!;
    expect(depois.status).toBe('pendente');
    expect(depois.etiqueta_path ?? null).toBeNull();
  });

  it('reiniciar a demonstração descarta também os PDFs anexados', async () => {
    const api = await carregarDemo();
    const a = pedido('000000000005');
    await api.registrarEtiqueta(a, pdf('y', 'y.pdf'), emissao(a.id, '50000000-0000-0000-0000-000000000001', 'Y'));
    expect(armazenamento.arquivos.size).toBe(1);
    demoDados.resetar();
    await Promise.resolve();
    expect(armazenamento.arquivos.size).toBe(0);
  });
});
