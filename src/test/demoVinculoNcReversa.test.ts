import { beforeEach, describe, expect, it } from 'vitest';
import { demoApi } from '../demo/demoApi';
import { demoDados } from '../demo/demoDatabase';
import { iniciarDemo } from '../demo/demoMode';
import type { CreateSolicitacaoPayload, Empresa, NaoConformidade } from '../types';

// Mensagens iguais às do banco (trigger reversa_vincular_nc).
const NAO_ENCONTRADA = 'NC de origem não encontrada.';
const STATUS_NAO_PERMITE = 'A NC precisa estar Aberta ou Em tratativa para gerar reversa.';
const outraEmpresa = (empresa: Empresa, ncEmpresa: Empresa) =>
  `A reversa (${empresa}) precisa ser da mesma empresa da NC (${ncEmpresa}).`;
const NC_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

const ncDemo = (numero: number): NaoConformidade => demoDados.ncs().find((nc) => nc.numero === numero)!;
const reversaDaNc = (numero: number) => demoDados.solicitacoes().find((item) => item.nc_id === ncDemo(numero).id)!;

function mudarStatusNc(numero: number, status: NaoConformidade['status']): void {
  demoDados.salvarNcs(demoDados.ncs().map((nc) => (nc.numero === numero ? { ...nc, status } : nc)));
}

function pedido(empresa: Empresa, ncId: string | null): CreateSolicitacaoPayload {
  return {
    empresa,
    data_solicitacao: '2026-11-09',
    solicitante: 'Camila Oliveira',
    setor: empresa === 'Alinare' ? 'Comercial Alinare' : 'Comercial Novitah',
    codigo_cliente: 7001,
    nome_cliente: 'Cliente de teste',
    endereco_postagem: 'Rua A, 1',
    motivo: 'Peça com defeito',
    justificativa_outros: null,
    autorizacao: null,
    status: 'pendente',
    tempo_preenchimento_segundos: 10,
    nc_id: ncId,
  } as CreateSolicitacaoPayload;
}

// Foto do que está gravado: uma operação recusada não pode mudar nada disto.
const gravado = () => JSON.stringify({
  pedidos: demoDados.solicitacoes(),
  historico: demoDados.historicoSolicitacoes(),
  historicoNc: demoDados.historicoNcs(),
});

beforeEach(() => {
  demoDados.resetar();
  localStorage.clear();
  iniciarDemo('demo-solicitante-alinare');
});

describe('demonstração: criação do reverso valida o vínculo com a NC', () => {
  it('reverso sem NC continua permitido', async () => {
    const criado = await demoApi.createSolicitacao(pedido('Alinare', null));
    expect(criado.nc_id).toBeNull();
  });

  it('NC Aberta (2404) e NC Em tratativa (2402, da Novitah) são aceitas para a própria empresa', async () => {
    expect((await demoApi.createSolicitacao(pedido('Alinare', ncDemo(2404).id))).nc_id).toBe(ncDemo(2404).id);
    expect((await demoApi.createSolicitacao(pedido('Novitah', ncDemo(2402).id))).nc_id).toBe(ncDemo(2402).id);
  });

  it('NC inexistente é recusada', async () => {
    await expect(demoApi.createSolicitacao(pedido('Alinare', NC_INEXISTENTE))).rejects.toThrow(NAO_ENCONTRADA);
  });

  it('NC de outra empresa é recusada', async () => {
    await expect(demoApi.createSolicitacao(pedido('Alinare', ncDemo(2402).id))).rejects.toThrow(outraEmpresa('Alinare', 'Novitah'));
  });

  it('novo vínculo com NC Encerrada é recusado', async () => {
    await expect(demoApi.createSolicitacao(pedido('Alinare', ncDemo(2401).id))).rejects.toThrow(STATUS_NAO_PERMITE);
  });

  it('novo vínculo com NC Cancelada é recusado', async () => {
    mudarStatusNc(2404, 'Cancelada');
    await expect(demoApi.createSolicitacao(pedido('Alinare', ncDemo(2404).id))).rejects.toThrow(STATUS_NAO_PERMITE);
  });

  it('recusa não grava pedido nem histórico', async () => {
    const antes = gravado();
    await expect(demoApi.createSolicitacao(pedido('Alinare', NC_INEXISTENTE))).rejects.toThrow();
    await expect(demoApi.createSolicitacao(pedido('Alinare', ncDemo(2401).id))).rejects.toThrow();
    expect(gravado()).toBe(antes);
  });
});

describe('demonstração: atualização do reverso preserva vínculos históricos', () => {
  it('NC encerrada depois de vinculada não impede atualização logística nem apaga o vínculo', async () => {
    const reversa = reversaDaNc(2403);
    mudarStatusNc(2403, 'Encerrada');
    const atualizada = await demoApi.updateSolicitacao(reversa.id, { anotacoes: 'Cliente pediu nova etiqueta' });
    expect(atualizada).toMatchObject({ nc_id: ncDemo(2403).id, anotacoes: 'Cliente pediu nova etiqueta' });
  });

  it('trocar para NC encerrada é recusado e a reversa fica como estava', async () => {
    const reversa = reversaDaNc(2403);
    const antes = gravado();
    await expect(demoApi.updateSolicitacao(reversa.id, { nc_id: ncDemo(2401).id })).rejects.toThrow(STATUS_NAO_PERMITE);
    expect(gravado()).toBe(antes);
  });

  it('trocar para NC Cancelada é recusado', async () => {
    const reversa = reversaDaNc(2403);
    mudarStatusNc(2404, 'Cancelada');
    await expect(demoApi.updateSolicitacao(reversa.id, { nc_id: ncDemo(2404).id })).rejects.toThrow(STATUS_NAO_PERMITE);
  });

  it('trocar para NC aberta da mesma empresa é aceito', async () => {
    const reversa = reversaDaNc(2403);
    const atualizada = await demoApi.updateSolicitacao(reversa.id, { nc_id: ncDemo(2404).id });
    expect(atualizada.nc_id).toBe(ncDemo(2404).id);
  });

  it('trocar para NC de outra empresa é recusado', async () => {
    const reversa = reversaDaNc(2403);
    await expect(demoApi.updateSolicitacao(reversa.id, { nc_id: ncDemo(2402).id })).rejects.toThrow(outraEmpresa('Alinare', 'Novitah'));
  });
});
