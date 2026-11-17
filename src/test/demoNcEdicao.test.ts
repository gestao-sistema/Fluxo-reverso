import { beforeEach, describe, expect, it } from 'vitest';
import demoNcService from '../demo/demoNcService';
import { demoDados } from '../demo/demoDatabase';
import { iniciarDemo } from '../demo/demoMode';
import { ID_NC_DEMO } from '../demo/fixtures';
import { ConflitoEdicaoNc, ErroEdicaoNc } from '../lib/ncEdicao';

const ID = ID_NC_DEMO[2404];
const registro = () => demoDados.ncs().find((item) => item.id === ID)!;

beforeEach(() => {
  demoDados.resetar();
  localStorage.clear();
  iniciarDemo('demo-qualidade');
});

describe('demonstração: mesma regra de gravação do banco', () => {
  it('sem versão, a gravação é recusada e nada muda', async () => {
    const antes = registro();
    await expect(demoNcService.atualizar(ID, { nf: 'NF-9' }, { versao: '' })).rejects.toMatchObject({ codigo: 'NC004' });
    expect(registro()).toEqual(antes);
  });

  it('versão antiga é conflito: nada é gravado', async () => {
    const antes = registro();
    const erro = await demoNcService.atualizar(ID, { nf: 'NF-9' }, { versao: '2020-01-01T00:00:00.000Z' }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ConflitoEdicaoNc);
    expect(registro()).toEqual(antes);
  });

  it('sem alteração efetiva: gravado false e a versão não muda', async () => {
    const antes = registro();
    const resultado = await demoNcService.atualizar(ID, { nf: antes.nf }, { versao: antes.updated_at });
    expect(resultado.gravado).toBe(false);
    expect(registro().updated_at).toBe(antes.updated_at);
  });

  it('editar só a NF: descrição, custos e classificação ficam como estavam; a versão avança', async () => {
    const antes = registro();
    const resultado = await demoNcService.atualizar(ID, { nf: 'NF-7788' }, { versao: antes.updated_at });
    expect(resultado).toMatchObject({ gravado: true, nc: { nf: 'NF-7788' } });
    const depois = registro();
    expect(depois).toMatchObject({
      descricao: antes.descricao, cliente: antes.cliente, custo_produto: antes.custo_produto,
      custo_situacao: antes.custo_situacao, tipo_problema: antes.tipo_problema, causador: antes.causador,
    });
    expect(Date.parse(depois.updated_at)).toBeGreaterThan(Date.parse(antes.updated_at));
  });

  it('correção de valor registrado sem justificativa é recusada (NC002)', async () => {
    const antes = registro();
    const erro = await demoNcService.atualizar(ID, { custo_produto: 0 }, { versao: antes.updated_at }).catch((e: unknown) => e);
    expect(erro).toMatchObject({ codigo: 'NC002' });
    expect(registro().custo_produto).toBe(antes.custo_produto);
  });

  it('correção com justificativa grava a trilha com valor anterior, posterior, autor e data', async () => {
    const antes = registro();
    await demoNcService.atualizar(ID, { custo_produto: 0 }, { versao: antes.updated_at, motivo: 'Cliente cancelou' });
    expect(registro().custo_produto).toBe(0);
    const [linha] = demoDados.auditoriaFinanceiraNcs();
    expect(linha).toMatchObject({
      nc_id: ID, campo: 'custo_produto', tipo_alteracao: 'correcao', valor_anterior: 95, valor_posterior: 0,
      motivo: 'Cliente cancelou', origem: 'edicao', autor_nome: 'Júlia Nascimento',
    });
    expect(linha.criado_em).toBeTruthy();
  });

  it('preencher um valor vazio não pede justificativa e é registrado como preenchimento', async () => {
    const antes = registro();
    await demoNcService.atualizar(ID, { custo_frete_adicional: 40 }, { versao: antes.updated_at });
    const linha = demoDados.auditoriaFinanceiraNcs().find((item) => item.campo === 'custo_frete_adicional');
    expect(linha).toMatchObject({ tipo_alteracao: 'preenchimento', valor_anterior: null, valor_posterior: 40, motivo: null });
  });

  it('campo fora da lista de edição é recusado (NC003)', async () => {
    const antes = registro();
    const erro = await demoNcService.atualizar(ID, { numero: 1 } as never, { versao: antes.updated_at }).catch((e: unknown) => e);
    expect(erro).toMatchObject({ codigo: 'NC003' });
  });

  it('quem não edita NC é recusado (42501) e nada muda', async () => {
    const antes = registro();
    iniciarDemo('demo-solicitante-alinare');
    const erro = await demoNcService.atualizar(ID, { nf: 'NF-0' }, { versao: antes.updated_at }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroEdicaoNc);
    expect(erro).toMatchObject({ codigo: '42501' });
    expect(registro()).toEqual(antes);
  });
});
