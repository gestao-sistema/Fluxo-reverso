import type { Solicitacao } from '../types';

type LeituraEtiqueta = { sha256?: string; codigo?: string };
type ResolverUrlEtiqueta = (path: string) => Promise<string>;

const leiturasPorCaminho = new Map<string, Promise<LeituraEtiqueta>>();

function normalizarCodigo(codigo: string | null | undefined): string | undefined {
  const valor = codigo?.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return valor || undefined;
}

async function lerEtiqueta(pedido: Solicitacao, resolverUrl: ResolverUrlEtiqueta): Promise<LeituraEtiqueta> {
  if (!pedido.etiqueta_path) return {};
  const cache = leiturasPorCaminho.get(pedido.etiqueta_path);
  if (cache) return cache;

  const leitura = (async () => {
    const url = await resolverUrl(pedido.etiqueta_path as string);
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error('Não foi possível abrir a etiqueta para conferência.');
    const arquivo = new File([await resposta.blob()], pedido.etiqueta_nome ?? 'etiqueta.pdf', { type: 'application/pdf' });
    return lerArquivoEtiqueta(arquivo, pedido.codigo_rastreio);
  })().catch((erro) => {
    leiturasPorCaminho.delete(pedido.etiqueta_path as string);
    throw erro;
  });

  leiturasPorCaminho.set(pedido.etiqueta_path, leitura);
  return leitura;
}

async function lerArquivoEtiqueta(arquivo: File, codigoInformado?: string | null): Promise<LeituraEtiqueta> {
    const bytes = await arquivo.arrayBuffer();
    let sha256: string | undefined;
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    let codigo = normalizarCodigo(codigoInformado);
    if (!codigo) {
      try {
        const { lerEtiquetaPdf } = await import('./etiquetaPdf');
        codigo = normalizarCodigo((await lerEtiquetaPdf(arquivo, undefined, {
          camposNecessarios: ['codigo_rastreio'],
          ocrFallback: false,
        })).campos.codigo_rastreio);
      } catch {
        // O hash do PDF ainda detecta anexos idênticos mesmo sem texto legível.
      }
    }
    return { ...(sha256 ? { sha256 } : {}), ...(codigo ? { codigo } : {}) };
}

async function comConcorrencia<T, R>(itens: T[], limite: number, executar: (item: T) => Promise<R>): Promise<R[]> {
  const resultados = new Array<R>(itens.length);
  let proximo = 0;
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (proximo < itens.length) {
      const indice = proximo;
      proximo += 1;
      resultados[indice] = await executar(itens[indice]);
    }
  }));
  return resultados;
}

/** Retorna pedidos ativos com o mesmo PDF ou código de rastreio da etiqueta. */
export async function buscarPedidosComEtiquetaDuplicada(
  pedido: Solicitacao,
  pedidos: Solicitacao[],
  resolverUrl: ResolverUrlEtiqueta,
): Promise<Solicitacao[]> {
  const candidatos = pedidos.filter((item) => item.id !== pedido.id && (!!item.etiqueta_path || !!item.codigo_rastreio));
  if (!candidatos.length) return [];

  const codigoSalvo = normalizarCodigo(pedido.codigo_rastreio);
  const duplicadosDiretos = candidatos.filter((item) =>
    item.etiqueta_path === pedido.etiqueta_path
    || (!!codigoSalvo && normalizarCodigo(item.codigo_rastreio) === codigoSalvo));
  if (duplicadosDiretos.length) return duplicadosDiretos;
  if (!pedido.etiqueta_path) return [];

  const leituraAlvo = await lerEtiqueta(pedido, resolverUrl);
  const leiturasCandidatas = await comConcorrencia(candidatos, 3, (item) => lerEtiqueta(item, resolverUrl));
  return candidatos.filter((_, indice) => {
    const leitura = leiturasCandidatas[indice];
    return (!!leituraAlvo.sha256 && leitura.sha256 === leituraAlvo.sha256)
      || (!!leituraAlvo.codigo && leitura.codigo === leituraAlvo.codigo);
  });
}

/** Confere um PDF ainda não anexado contra etiquetas de pedidos ativos. */
export async function buscarPedidosComArquivoEtiquetaDuplicado(
  pedidoId: string,
  arquivo: File,
  codigoRastreio: string | null | undefined,
  pedidos: Solicitacao[],
  resolverUrl: ResolverUrlEtiqueta,
): Promise<Solicitacao[]> {
  const candidatos = pedidos.filter((item) => item.id !== pedidoId && (!!item.etiqueta_path || !!item.codigo_rastreio));
  const codigoAlvo = normalizarCodigo(codigoRastreio);
  const duplicadosDiretos = candidatos.filter((item) =>
    !!codigoAlvo && normalizarCodigo(item.codigo_rastreio) === codigoAlvo);
  if (duplicadosDiretos.length) return duplicadosDiretos;
  if (!candidatos.some((item) => !!item.etiqueta_path)) return [];

  const leituraAlvo = await lerArquivoEtiqueta(arquivo, codigoAlvo);
  const leiturasCandidatas = await comConcorrencia(candidatos, 3, (item) => lerEtiqueta(item, resolverUrl));
  return candidatos.filter((_, indice) => {
    const leitura = leiturasCandidatas[indice];
    return (!!leituraAlvo.sha256 && leitura.sha256 === leituraAlvo.sha256)
      || (!!leituraAlvo.codigo && leitura.codigo === leituraAlvo.codigo);
  });
}
