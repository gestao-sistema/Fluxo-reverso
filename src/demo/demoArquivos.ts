// PDFs anexados na demonstração. Os bytes ficam no IndexedDB do navegador (o localStorage não comporta
// 5 MB) e sobrevivem a F5 e à troca de perfil. Nunca vão ao Supabase. Sem armazenamento disponível ou
// com falha na gravação, o anexo falha: não há sucesso de mentira.

export interface ArmazenamentoArquivosDemo {
  gravar(caminho: string, arquivo: Blob): Promise<void>;
  ler(caminho: string): Promise<Blob | null>;
  limpar(): Promise<void>;
}

const BANCO = 'flowdesk-demo-arquivos';
const TABELA = 'etiquetas';

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador não permite guardar arquivos da demonstração.'));
      return;
    }
    const pedido = indexedDB.open(BANCO, 1);
    pedido.onupgradeneeded = () => { pedido.result.createObjectStore(TABELA); };
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error ?? new Error('Falha ao abrir o armazenamento da demonstração.'));
  });
}

async function transacao<T>(modo: IDBTransactionMode, executar: (tabela: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const banco = await abrir();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = banco.transaction(TABELA, modo);
      const pedido = executar(tx.objectStore(TABELA));
      tx.oncomplete = () => resolve(pedido.result);
      tx.onerror = () => reject(tx.error ?? new Error('Falha no armazenamento da demonstração.'));
      tx.onabort = () => reject(tx.error ?? new Error('Armazenamento da demonstração cheio ou bloqueado.'));
    });
  } finally {
    banco.close();
  }
}

const indexedDbDoNavegador: ArmazenamentoArquivosDemo = {
  async gravar(caminho, arquivo) { await transacao('readwrite', (t) => t.put(arquivo, caminho)); },
  async ler(caminho) { return (await transacao<Blob | undefined>('readonly', (t) => t.get(caminho))) ?? null; },
  async limpar() { await transacao('readwrite', (t) => t.clear()); },
};

let armazenamento: ArmazenamentoArquivosDemo = indexedDbDoNavegador;

/** Só para testes: troca o armazenamento por um controlado. */
export function usarArmazenamentoDemo(novo: ArmazenamentoArquivosDemo | null): void {
  armazenamento = novo ?? indexedDbDoNavegador;
}

export async function guardarArquivoDemo(caminho: string, arquivo: Blob): Promise<void> {
  try {
    await armazenamento.gravar(caminho, arquivo);
  } catch (erro) {
    throw new Error(`Não foi possível guardar o PDF neste navegador. ${erro instanceof Error ? erro.message : ''}`.trim());
  }
}

export const lerArquivoDemo = (caminho: string): Promise<Blob | null> => armazenamento.ler(caminho);
export const limparArquivosDemo = (): Promise<void> => armazenamento.limpar();
