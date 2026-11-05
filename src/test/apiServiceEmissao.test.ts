import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  storageFrom: vi.fn(),
  tables: [] as Array<{ table: string; filters: Record<string, unknown>; methods: string[] }>,
  emissions: [] as Array<Record<string, any>>,
  request: null as Record<string, any> | null,
  allowed: true,
  failRegister: false,
  uploaded: [] as string[],
  removed: [] as string[],
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
    storage: { from: mocks.storageFrom },
  },
}));

import apiService from '../services/apiService';
import type { ReversaEmissaoResumo, Solicitacao } from '../types';

const SOLICITACAO: Solicitacao = {
  id: '00000000-0000-0000-0000-000000000041',
  created_at: '2026-10-20T10:00:00Z',
  empresa: 'Alinare',
  data_solicitacao: '2026-10-20',
  solicitante: 'Camila Oliveira',
  setor: 'Comercial Alinare',
  codigo_cliente: 12345,
  nome_cliente: 'Cliente de teste',
  endereco_postagem: 'Rua de teste, 100',
  motivo: 'Peça com defeito',
  justificativa_outros: null,
  autorizacao: null,
  status: 'pendente',
  aprovacao_status: 'aprovada',
  aprovacao_legada: false,
  tempo_preenchimento_segundos: 10,
};

const EMISSAO_ID = '10000000-0000-0000-0000-000000000041';
const arquivo = {
  name: 'etiqueta-manual.pdf',
  type: 'application/pdf',
  size: 4,
  arrayBuffer: async () => new ArrayBuffer(4),
} as File;

function emissao(overrides: Record<string, unknown> = {}) {
  return {
    id: EMISSAO_ID,
    solicitacao_id: SOLICITACAO.id,
    sequencia: 1,
    codigo_autorizacao: null,
    codigo_rastreio: null,
    pdf_path: null,
    pdf_nome: null,
    emitida_em: null,
    valida_ate: null,
    substituida_em: null,
    pdf_anexado_em: null,
    ...overrides,
  };
}

function makeQuery(table: string) {
  const query = { table, filters: {} as Record<string, unknown>, methods: [] as string[] };
  mocks.tables.push(query);
  let self: any;
  self = new Proxy({}, {
    get(_target, prop: string | symbol) {
      const key = String(prop);
      if (key === 'then') {
        return (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
          Promise.resolve({ data: null, error: null }).then(resolve, reject);
      }
      if (key === 'maybeSingle' || key === 'single') {
        return vi.fn(async () => {
          let data: Record<string, any> | null = null;
          if (table === 'reversa_emissoes') {
            if (query.filters.id) data = mocks.emissions.find((item) => item.id === query.filters.id) ?? null;
            else if (query.filters.pdf_path) data = mocks.emissions.find((item) => item.pdf_path === query.filters.pdf_path) ?? null;
            else if (query.filters.solicitacao_id) data = mocks.emissions.find((item) => item.solicitacao_id === query.filters.solicitacao_id && !item.substituida_em) ?? null;
          } else if (table === 'solicitacoes_reverso') data = mocks.request;
          return { data, error: null };
        });
      }
      return vi.fn((...args: unknown[]) => {
        query.methods.push(key);
        if ((key === 'eq' || key === 'is') && typeof args[0] === 'string') query.filters[args[0]] = args[1];
        return self;
      });
    },
  });
  return self;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.tables = [];
  mocks.emissions = [];
  mocks.request = { ...SOLICITACAO };
  mocks.allowed = true;
  mocks.failRegister = false;
  mocks.uploaded = [];
  mocks.removed = [];
  mocks.rpcCalls = [];
  mocks.from.mockImplementation((table: string) => makeQuery(table));
  mocks.storageFrom.mockReturnValue({
    upload: vi.fn(async (path: string) => { mocks.uploaded.push(path); return { error: null }; }),
    remove: vi.fn(async (paths: string[]) => { mocks.removed.push(...paths); return { error: null }; }),
  });
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, any>) => {
    mocks.rpcCalls.push({ name, args });
    if (name === 'pode_operar_emissao') return { data: mocks.allowed, error: null };
    if (name === 'registrar_emissao_reversa') {
      if (mocks.failRegister) return { data: null, error: { code: 'P0001', message: 'Registro recusado pelo banco.' } };
      const atual = mocks.emissions.find((item) => item.solicitacao_id === args.p_solicitacao_id && !item.substituida_em);
      if (atual) atual.substituida_em = '2026-10-23T10:00:00Z';
      const row = emissao({
        id: args.p_emissao_id,
        sequencia: (atual?.sequencia ?? 0) + 1,
        codigo_autorizacao: args.p_codigo_autorizacao,
        codigo_rastreio: args.p_codigo_rastreio,
        emitida_em: args.p_emitida_em ?? null,
        valida_ate: args.p_valida_ate ?? null,
        pdf_path: args.p_pdf_path,
        pdf_nome: args.p_pdf_nome,
        pdf_anexado_em: '2026-10-23T10:00:00Z',
        emissao_anterior_id: atual?.id ?? null,
      });
      mocks.emissions.push(row);
      mocks.request = { ...mocks.request, status: 'etiqueta_gerada', etiqueta_path: row.pdf_path, etiqueta_nome: row.pdf_nome, codigo_rastreio: row.codigo_rastreio };
      return { data: row, error: null };
    }
    if (name === 'atualizar_dados_emissao') {
      const row = mocks.emissions.find((item) => item.id === args.p_emissao_id)!;
      row.codigo_autorizacao = args.p_codigo_autorizacao;
      row.codigo_rastreio = args.p_codigo_rastreio;
      row.emitida_em = args.p_emitida_em;
      row.valida_ate = args.p_valida_ate;
      return { data: row, error: null };
    }
    if (name === 'anexar_pdf_emissao') {
      const row = mocks.emissions.find((item) => item.id === args.p_emissao_id)!;
      row.pdf_path = args.p_pdf_path;
      row.pdf_nome = args.p_pdf_nome;
      row.pdf_anexado_em = '2026-10-23T10:00:00Z';
      mocks.request = { ...mocks.request, status: 'etiqueta_gerada', etiqueta_path: row.pdf_path, etiqueta_nome: row.pdf_nome };
      return { data: row, error: null };
    }
    return { data: null, error: { message: `RPC inesperada: ${name}` } };
  });
});

const entrada = (overrides: Record<string, unknown> = {}) => ({
  emissaoId: EMISSAO_ID,
  codigoAutorizacao: 'AUT 12345',
  codigoRastreio: null,
  ...overrides,
});

describe('apiService.registrarEtiqueta', () => {
  it('pedido aguardando aprovação: diz que falta aprovar, sem upload', async () => {
    mocks.allowed = false;
    mocks.request = { ...SOLICITACAO, aprovacao_status: 'aguardando_aprovacao' };
    const erro = await apiService.registrarEtiqueta(SOLICITACAO, arquivo, entrada()).catch((e) => e);
    expect(erro).toMatchObject({ causa: 'nao_aprovado' });
    expect(erro.message).toMatch(/precisa estar aprovado/);
    expect(mocks.uploaded).toEqual([]);
    expect(mocks.rpcCalls.map(({ name }) => name)).toEqual(['pode_operar_emissao']);
  });

  it('pedido rejeitado: não recebe etiqueta', async () => {
    mocks.allowed = false;
    mocks.request = { ...SOLICITACAO, aprovacao_status: 'rejeitada' };
    await expect(apiService.registrarEtiqueta(SOLICITACAO, arquivo, entrada())).rejects.toMatchObject({ causa: 'nao_aprovado', message: expect.stringMatching(/rejeitado/) });
    expect(mocks.uploaded).toEqual([]);
  });

  it('pedido aprovado sem permissão do operador na empresa: aponta a permissão, não a aprovação', async () => {
    mocks.allowed = false;
    const erro = await apiService.registrarEtiqueta(SOLICITACAO, arquivo, entrada()).catch((e) => e);
    expect(erro).toMatchObject({ causa: 'permissao' });
    expect(erro.message).toMatch(/permissão para anexar etiquetas de Alinare/);
    expect(erro.message).not.toMatch(/aprovad/);
    expect(mocks.uploaded).toEqual([]);
  });

  it('aceita PDF sem tipo informado pelo navegador, mas recusa outros arquivos', async () => {
    const semTipo = { ...arquivo, type: '', name: 'ETIQUETA.PDF' } as File;
    await expect(apiService.registrarEtiqueta(SOLICITACAO, semTipo, entrada())).resolves.toBeDefined();
    const imagem = { ...arquivo, type: 'image/png', name: 'etiqueta.png' } as File;
    await expect(apiService.registrarEtiqueta(SOLICITACAO, imagem, entrada())).rejects.toMatchObject({ causa: 'arquivo' });
    const semTipoNemExtensao = { ...arquivo, type: '', name: 'etiqueta' } as File;
    await expect(apiService.registrarEtiqueta(SOLICITACAO, semTipoNemExtensao, entrada())).rejects.toMatchObject({ causa: 'arquivo' });
  });

  it('falha no upload: mensagem de envio, nenhuma gravação no pedido e nova tentativa possível', async () => {
    const upload = vi.fn()
      .mockResolvedValueOnce({ error: { message: 'Failed to fetch' } })
      .mockImplementation(async (path: string) => { mocks.uploaded.push(path); return { error: null }; });
    mocks.storageFrom.mockReturnValue({ upload, remove: vi.fn(async () => ({ error: null })) });
    const erro = await apiService.registrarEtiqueta(SOLICITACAO, arquivo, entrada()).catch((e) => e);
    expect(erro).toMatchObject({ causa: 'upload' });
    expect(erro.message).toMatch(/Não foi possível enviar o PDF/);
    expect(mocks.rpcCalls.map(({ name }) => name)).toEqual(['pode_operar_emissao']);
    expect(mocks.emissions).toHaveLength(0);

    await expect(apiService.registrarEtiqueta(SOLICITACAO, arquivo, entrada())).resolves.toMatchObject({ etiqueta_path: expect.any(String) });
    expect(mocks.emissions).toHaveLength(1);
  });

  it('upload recusado por política do storage é falta de permissão', async () => {
    mocks.storageFrom.mockReturnValue({
      upload: vi.fn(async () => ({ error: { message: 'new row violates row-level security policy', statusCode: '403' } })),
      remove: vi.fn(async () => ({ error: null })),
    });
    await expect(apiService.registrarEtiqueta(SOLICITACAO, arquivo, entrada())).rejects.toMatchObject({ causa: 'permissao' });
  });

  it('informa quando a RPC/migration não existe e não tenta gravar diretamente', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'could not find the function pode_operar_emissao' } });

    await expect(apiService.registrarEtiqueta(SOLICITACAO, arquivo, entrada())).rejects.toMatchObject({ causa: 'indisponivel', message: expect.not.stringMatching(/RPC|migration|PGRST/i) });

    expect(mocks.uploaded).toEqual([]);
    expect(mocks.tables).toEqual([]);
  });

  it('usa registro idempotente e mantém o PDF anterior na reemissão', async () => {
    const anterior = emissao({
      id: '20000000-0000-0000-0000-000000000041',
      codigo_autorizacao: 'AUT-ANTERIOR',
      pdf_path: `${SOLICITACAO.id}/anterior.pdf`,
      pdf_nome: 'anterior.pdf',
      emitida_em: '2026-10-01',
      valida_ate: '2026-10-31',
    });
    mocks.emissions.push(anterior);

    await apiService.registrarEtiqueta(SOLICITACAO, arquivo, entrada({
      motivoReemissao: 'pdf_incorreto', emitidaEm: '2026-10-24', validaAte: '2026-11-23',
    }));

    expect(mocks.rpcCalls.find(({ name }) => name === 'registrar_emissao_reversa')?.args).toEqual(expect.objectContaining({
      p_emissao_id: EMISSAO_ID,
      p_pdf_path: mocks.uploaded[0],
      p_codigo_autorizacao: 'AUT12345',
      p_codigo_rastreio: null,
      p_emitida_em: '2026-10-24',
      p_valida_ate: '2026-11-23',
      p_motivo_reemissao: 'pdf_incorreto',
    }));
    expect(mocks.emissions).toHaveLength(2);
    expect(anterior.substituida_em).toBeTruthy();
    expect(anterior.pdf_path).toBe(`${SOLICITACAO.id}/anterior.pdf`);
    expect(anterior.emitida_em).toBe('2026-10-01');
    expect(anterior.valida_ate).toBe('2026-10-31');
    expect(mocks.emissions.find((item) => item.id === EMISSAO_ID)).toEqual(expect.objectContaining({
      emitida_em: '2026-10-24', valida_ate: '2026-11-23',
    }));
    expect(mocks.removed).not.toContain(anterior.pdf_path);
    expect(mocks.tables.some((query) => query.table === 'solicitacoes_reverso' && query.methods.includes('update'))).toBe(false);
  });

  it('repete a mesma confirmação sem criar outra emissão nem reenviar PDF', async () => {
    const dados = entrada();
    await apiService.registrarEtiqueta(SOLICITACAO, arquivo, dados);
    const uploads = mocks.uploaded.length;

    await apiService.registrarEtiqueta(SOLICITACAO, arquivo, dados);

    expect(mocks.rpcCalls.filter(({ name }) => name === 'registrar_emissao_reversa')).toHaveLength(1);
    expect(mocks.uploaded).toHaveLength(uploads);
    expect(mocks.emissions).toHaveLength(1);
  });

  it('atualiza códigos e anexa PDF a uma emissão incompleta pelas RPCs existentes', async () => {
    const atual = emissao({
      id: '30000000-0000-0000-0000-000000000041',
      codigo_autorizacao: 'AUT-ANTERIOR',
      emitida_em: '2026-10-20',
      valida_ate: '2026-10-30',
    });
    mocks.emissions.push(atual);

    await apiService.registrarEtiqueta(SOLICITACAO, arquivo, entrada({
      emissaoId: '40000000-0000-0000-0000-000000000041', emitidaEm: '2026-10-21', validaAte: '2026-11-01',
    }));

    expect(mocks.rpcCalls.map(({ name }) => name)).toEqual([
      'pode_operar_emissao', 'pode_operar_emissao', 'atualizar_dados_emissao', 'anexar_pdf_emissao',
    ]);
    expect(mocks.rpcCalls.find(({ name }) => name === 'atualizar_dados_emissao')?.args).toEqual(expect.objectContaining({
      p_codigo_autorizacao: 'AUT12345',
      p_codigo_rastreio: null,
      p_emitida_em: '2026-10-21',
      p_valida_ate: '2026-11-01',
    }));
    expect(mocks.rpcCalls.some(({ name }) => name === 'registrar_emissao_reversa')).toBe(false);
    expect(atual.pdf_path).toBe(mocks.uploaded[0]);
  });

  it('completa a emissão incompleta com o mesmo emissaoId sem criar outra emissão', async () => {
    const atual = emissao({
      id: EMISSAO_ID, codigo_autorizacao: 'AUT-ANTERIOR', emitida_em: '2026-10-20', valida_ate: '2026-10-31',
    });
    mocks.emissions.push(atual);

    await apiService.registrarEtiqueta(SOLICITACAO, arquivo, entrada());

    expect(mocks.rpcCalls.filter(({ name }) => name === 'registrar_emissao_reversa')).toHaveLength(0);
    expect(mocks.rpcCalls.find(({ name }) => name === 'anexar_pdf_emissao')?.args.p_emissao_id).toBe(EMISSAO_ID);
    expect(mocks.rpcCalls.find(({ name }) => name === 'anexar_pdf_emissao')?.args.p_pdf_path).toMatch(new RegExp(`^${SOLICITACAO.id}/${EMISSAO_ID}-`));
    expect(mocks.emissions).toHaveLength(1);
    expect(atual.pdf_path).toBe(mocks.uploaded[0]);
    expect(atual.emitida_em).toBe('2026-10-20');
    expect(atual.valida_ate).toBe('2026-10-31');
  });

  it('envia datas ausentes como null', async () => {
    await apiService.registrarEtiqueta(SOLICITACAO, arquivo, entrada());
    expect(mocks.rpcCalls.find(({ name }) => name === 'registrar_emissao_reversa')?.args).toEqual(expect.objectContaining({
      p_emitida_em: null,
      p_valida_ate: null,
    }));
  });

  it('recusa datas impossíveis ou validade anterior antes do upload', async () => {
    await expect(apiService.registrarEtiqueta(SOLICITACAO, arquivo, entrada({
      emitidaEm: '2026-02-30', validaAte: '2026-03-01',
    }))).rejects.toThrow(/data de emissão válida/);
    await expect(apiService.registrarEtiqueta(SOLICITACAO, arquivo, entrada({
      emitidaEm: '2026-10-24', validaAte: '2026-10-23',
    }))).rejects.toThrow(/validade não pode ser anterior/);
    expect(mocks.uploaded).toEqual([]);
  });

  it('envia correções de datas pela RPC autorizada de atualização', async () => {
    const atual = emissao({ emitida_em: '2026-10-20', valida_ate: '2026-10-31' });
    mocks.emissions.push(atual);

    await apiService.atualizarDadosEmissao(atual as unknown as ReversaEmissaoResumo, {
      codigoAutorizacao: atual.codigo_autorizacao,
      codigoRastreio: atual.codigo_rastreio,
      emitidaEm: '2026-10-21',
      validaAte: '2026-11-01',
    });

    expect(mocks.rpcCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'atualizar_dados_emissao',
        args: expect.objectContaining({ p_emitida_em: '2026-10-21', p_valida_ate: '2026-11-01' }),
      }),
    ]));
  });

  it('falha no vínculo não informa sucesso e remove somente upload confirmado como órfão', async () => {
    mocks.failRegister = true;

    await expect(apiService.registrarEtiqueta(SOLICITACAO, arquivo, entrada())).rejects.toMatchObject({ causa: 'vinculo', message: expect.stringMatching(/PDF foi enviado, mas não foi ligado ao pedido: Registro recusado pelo banco./) });

    expect(mocks.uploaded).toHaveLength(1);
    expect(mocks.removed).toEqual([mocks.uploaded[0]]);
    expect(mocks.emissions).toHaveLength(0);
    expect(mocks.tables.some((query) => query.table === 'solicitacoes_reverso' && query.methods.includes('update'))).toBe(false);
  });
});
