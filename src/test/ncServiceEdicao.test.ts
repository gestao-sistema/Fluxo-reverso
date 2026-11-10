import { beforeEach, describe, expect, it, vi } from 'vitest';

// Cliente do Supabase substituído: o teste confere o que sai para a função de gravação
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
  },
}));

import ncService from '../services/ncService';
import { ConflitoEdicaoNc, ErroEdicaoNc } from '../lib/ncEdicao';

const VERSAO_ABERTA = '2026-11-09 09:00:00.654321+00';
const VERSAO_NOVA = '2026-11-09 10:00:00.123456+00';
const NC_VIEW = { id: 'nc-1', numero: 2404, codigo: 'NC-2404', nf: 'NF-2', updated_at: VERSAO_NOVA, qtd_reversas: 0 };

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.maybeSingle.mockReset();
  mocks.maybeSingle.mockResolvedValue({ data: NC_VIEW, error: null });
});

describe('gravação pelo serviço: só o alterado, com a versão que o formulário carregou', () => {
  it('envia a função só com os campos alterados, a versão exata (texto) e sem justificativa quando não há correção', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ updated_at: VERSAO_NOVA }], error: null });
    const resultado = await ncService.atualizar('nc-1', { nf: 'NF-2' }, { versao: VERSAO_ABERTA });
    expect(mocks.rpc).toHaveBeenCalledWith('nc_salvar_edicao', {
      p_id: 'nc-1', p_versao: VERSAO_ABERTA, p_campos: { nf: 'NF-2' }, p_motivo: null,
    });
    expect(resultado).toEqual({ nc: NC_VIEW, gravado: true });
  });

  it('a justificativa de uma correção vai junto', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ updated_at: VERSAO_NOVA }], error: null });
    await ncService.atualizar('nc-1', { custo_produto: 0 }, { versao: VERSAO_ABERTA, motivo: 'Cliente cancelou' });
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_motivo: 'Cliente cancelou' });
  });

  it('sem versão, a gravação é recusada antes de chamar o banco', async () => {
    await expect(ncService.atualizar('nc-1', { nf: 'x' }, { versao: '' })).rejects.toMatchObject({ codigo: 'NC004' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('sem campos alterados, não grava: devolve o registro com gravado false', async () => {
    const resultado = await ncService.atualizar('nc-1', {}, { versao: VERSAO_ABERTA });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(resultado).toEqual({ nc: NC_VIEW, gravado: false });
  });

  it('a função devolveu a mesma versão: nada foi regravado, e o resultado diz isso', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ updated_at: VERSAO_ABERTA }], error: null });
    const resultado = await ncService.atualizar('nc-1', { nf: 'NF-2' }, { versao: VERSAO_ABERTA });
    expect(resultado.gravado).toBe(false);
  });

  it('nenhuma linha devolvida nunca é sucesso', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await expect(ncService.atualizar('nc-1', { nf: 'NF-2' }, { versao: VERSAO_ABERTA })).rejects.toMatchObject({ codigo: 'NC005' });
  });
});

describe('erros do banco chegam com o significado certo', () => {
  it('versão mudou (NC001) vira ConflitoEdicaoNc, que o formulário reconhece', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'NC001', message: 'alterada por outra pessoa' } });
    const erro = await ncService.atualizar('nc-1', { nf: 'NF-2' }, { versao: VERSAO_ABERTA }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ConflitoEdicaoNc);
  });

  it('correção sem justificativa (NC002) chega com o código e a mensagem do banco', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'NC002', message: 'Para corrigir um valor já registrado, informe a justificativa.' } });
    const erro = await ncService.atualizar('nc-1', { custo_produto: 0 }, { versao: VERSAO_ABERTA }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroEdicaoNc);
    expect(erro).toMatchObject({ codigo: 'NC002' });
    expect((erro as Error).message).toMatch(/justificativa/);
  });

  it('sem permissão (42501) é recusado com mensagem clara', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });
    const erro = await ncService.atualizar('nc-1', { nf: 'NF-2' }, { versao: VERSAO_ABERTA }).catch((e: unknown) => e);
    expect(erro).toMatchObject({ codigo: '42501' });
    expect((erro as Error).message).toMatch(/permissão/);
  });

  it('erro sem código conhecido continua como erro comum, com a mensagem original', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'Situação do custo "Não" exige custos sem valor.' } });
    const erro = await ncService.atualizar('nc-1', { custo_situacao: 'Não' }, { versao: VERSAO_ABERTA, motivo: 'x' }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(Error);
    expect(erro).not.toBeInstanceOf(ErroEdicaoNc);
    expect((erro as Error).message).toMatch(/exige custos sem valor/);
  });
});
