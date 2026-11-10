import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { NcOpcaoReversa } from '../types';

const { ncService, auth } = vi.hoisted(() => ({
  ncService: { opcoesParaReversa: vi.fn() },
  auth: { user: null as null | Record<string, unknown> },
}));

vi.mock('../services/ncService', () => ({ default: ncService }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../services/apiService', () => ({
  default: {
    createSolicitacao: vi.fn(),
    getSolicitacoes: vi.fn(() => Promise.resolve([])),
    getHistoricoCliente: vi.fn(() => Promise.resolve([])),
    updateSolicitacao: vi.fn(),
    getSolicitacaoById: vi.fn(),
    deleteSolicitacao: vi.fn(),
  },
}));
// O seletor de data real não funciona no jsdom; ele não faz parte deste teste.
vi.mock('react-datepicker', () => ({ default: () => null, registerLocale: vi.fn() }));

import ReverseLogisticsForm from '../components/forms/ReverseLogisticsForm';

const NC_NOVA: NcOpcaoReversa = {
  id: 'nc-nova-2404',
  numero: 2404,
  codigo: 'NC-2404',
  data_ocorrencia: '2026-11-02',
  cliente: 'Loja Nova Demonstração',
  origem: null,
  status: 'Aberta',
  tipo_problema: 'Endereço incorreto',
  causador: 'Comercial',
};

const NC_ANTIGA: NcOpcaoReversa = {
  id: 'nc-antiga-2403',
  numero: 2403,
  codigo: 'NC-2403',
  data_ocorrencia: '2026-10-25',
  cliente: 'Casa Amora',
  origem: 'Erro de separação',
  status: 'Aberta',
  tipo_problema: null,
  causador: null,
};

function renderFormulario(caminho = '/formulario-alinare') {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <ReverseLogisticsForm empresa="Alinare" />
    </MemoryRouter>
  );
}

const selecaoDeNc = () => document.getElementById('nc_id') as HTMLSelectElement;

describe('seletor de NC do formulário de reversa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = {
      id: 'user-camila',
      nome: 'Camila Oliveira',
      usuario: 'camila',
      telas: ['formulario-alinare'],
      empresasAcesso: ['Alinare'],
    };
    ncService.opcoesParaReversa.mockResolvedValue([NC_NOVA, NC_ANTIGA]);
  });

  it('NC nova sem origem antiga fica identificável: tipo do problema e origem / causador separados', async () => {
    renderFormulario();
    const opcao = (await screen.findByRole('option', { name: /NC-2404/ })) as HTMLOptionElement;
    expect(opcao).toHaveTextContent('Tipo do problema: Endereço incorreto · Origem / causador: Comercial');
    expect(opcao).not.toHaveTextContent('Origem antiga');
    expect(opcao.value).toBe(NC_NOVA.id);
  });

  it('NC antiga mantém a identificação pela origem histórica', async () => {
    renderFormulario();
    const opcao = (await screen.findByRole('option', { name: /NC-2403/ })) as HTMLOptionElement;
    expect(opcao).toHaveTextContent('Origem antiga: Erro de separação');
    expect(opcao).not.toHaveTextContent('Tipo do problema');
    expect(opcao.value).toBe(NC_ANTIGA.id);
  });

  it('reversa sem NC continua funcionando: "Sem NC vinculada" disponível e nada pré-selecionado', async () => {
    renderFormulario();
    await screen.findByRole('option', { name: /NC-2404/ });
    expect((screen.getByRole('option', { name: 'Sem NC vinculada' }) as HTMLOptionElement).value).toBe('');
    expect(selecaoDeNc().value).toBe('');
  });

  it('NC da URL que não está entre as opções da empresa não fica pré-selecionada', async () => {
    renderFormulario('/formulario-alinare?nc=nc-de-outra-empresa');
    await screen.findByRole('option', { name: /NC-2404/ });
    expect(selecaoDeNc().value).toBe('');
  });
});
