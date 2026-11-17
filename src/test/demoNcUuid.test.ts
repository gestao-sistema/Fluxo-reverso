import { beforeEach, describe, expect, it } from 'vitest';
import { formSchema } from '../schemas/formSchema';
import demoNcService from '../demo/demoNcService';
import { demoDados } from '../demo/demoDatabase';
import { ID_NC_DEMO } from '../demo/fixtures';
import { iniciarDemo } from '../demo/demoMode';

// Na demonstração a NC é opcional, o vínculo usa UUID (a mesma validação do sistema real) e só NCs
// abertas da mesma empresa podem ser escolhidas.
const base = {
  data_solicitacao: '2026-10-27', solicitante: 'Camila', setor: 'Comercial Alinare' as const, codigo_cliente: 1234,
  nome_cliente: 'Cliente Teste', endereco_postagem: 'Rua das Flores, Bairro, Cidade/SP', numero_endereco: '10',
  motivo: 'Peça com defeito' as const, justificativa_outros: '',
};

beforeEach(() => {
  demoDados.resetar();
  localStorage.clear();
  iniciarDemo('demo-solicitante-alinare');
});

describe('NC opcional na demonstração', () => {
  it('sem NC o pedido é válido', () => {
    expect(formSchema.safeParse({ ...base, nc_id: '' }).success).toBe(true);
    expect(formSchema.safeParse({ ...base }).success).toBe(true);
  });

  it('todas as NCs de exemplo têm UUID e passam na validação real, sem relaxá-la', () => {
    for (const nc of demoDados.ncs()) expect(formSchema.safeParse({ ...base, nc_id: nc.id }).success, nc.codigo).toBe(true);
    // vínculo inválido continua recusado
    for (const invalido of ['demo-nc-2403', 'nc-qualquer', '123']) {
      const r = formSchema.safeParse({ ...base, nc_id: invalido });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe('Selecione uma NC válida.');
    }
  });

  it('as opções oferecidas são só da empresa do pedido e abertas, e usam os UUIDs', async () => {
    const alinare = await demoNcService.opcoesParaReversa('Alinare');
    const novitah = await demoNcService.opcoesParaReversa('Novitah');
    // 2401 está encerrada; 2402 é da Novitah; 2404 e 2405 são registros novos abertos da Alinare
    expect(alinare.map((o) => o.id).sort()).toEqual([ID_NC_DEMO[2403], ID_NC_DEMO[2404], ID_NC_DEMO[2405]].sort());
    expect(novitah.map((o) => o.id)).toEqual([ID_NC_DEMO[2402]]);
    expect(formSchema.safeParse({ ...base, nc_id: alinare[0].id }).success).toBe(true);
  });

  it('os pedidos de exemplo apontam para as NCs pelos mesmos UUIDs', () => {
    const idsNc = new Set(demoDados.ncs().map((n) => n.id));
    const comNc = demoDados.solicitacoes().filter((p) => p.nc_id);
    expect(comNc.length).toBeGreaterThan(0);
    for (const pedido of comNc) expect(idsNc.has(pedido.nc_id as string), pedido.nc_id as string).toBe(true);
  });

  it('dados salvos com o identificador antigo são convertidos sem perder o vínculo', () => {
    const antigo = (ncs: unknown, pedidos: unknown, historico: unknown) => {
      localStorage.setItem('flowdesk:demo:dados:ncs', JSON.stringify(ncs));
      localStorage.setItem('flowdesk:demo:dados:solicitacoes', JSON.stringify(pedidos));
      localStorage.setItem('flowdesk:demo:dados:historico-ncs', JSON.stringify(historico));
    };
    const nc = { ...demoDados.ncs()[0], id: 'demo-nc-2403' };
    const criada = { ...nc, id: 'demo-nc-5f0f0f0f-aaaa-4bbb-8ccc-123456789abc', numero: 3000, codigo: 'NC-3000' };
    const pedido = { ...demoDados.solicitacoes()[0], nc_id: 'demo-nc-2403' };
    const pedidoCriado = { ...demoDados.solicitacoes()[1], id: 'ped-x', nc_id: criada.id };
    antigo([nc, criada], [pedido, pedidoCriado], [{ id: 'h1', nc_id: 'demo-nc-2403', user_nome: 'x', tipo: 'evento', acao: 'y', created_at: '2026-10-20T10:00:00.000Z' }]);
    expect(demoDados.ncs().map((n) => n.id)).toEqual([ID_NC_DEMO[2403], '5f0f0f0f-aaaa-4bbb-8ccc-123456789abc']);
    expect(demoDados.solicitacoes().map((p) => p.nc_id)).toEqual([ID_NC_DEMO[2403], '5f0f0f0f-aaaa-4bbb-8ccc-123456789abc']);
    expect(demoDados.historicoNcs()[0].nc_id).toBe(ID_NC_DEMO[2403]);
    for (const p of demoDados.solicitacoes()) expect(formSchema.safeParse({ ...base, nc_id: p.nc_id }).success).toBe(true);
  });
});
