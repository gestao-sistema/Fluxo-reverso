import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { NcOpcaoReversa } from '../types';

// Vínculo da NC no formulário de reversa: automático pela URL (?nc=<id>), sem seletor na tela.
// O texto que identifica a NC (tipo do problema, causador, origem antiga) é coberto por
// ncVinculoReverso.test.ts, onde vive o auxiliar usado pela fila de aprovação.

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

const NC_ABERTA: NcOpcaoReversa = {
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

function renderFormulario(caminho = '/formulario-alinare') {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <ReverseLogisticsForm empresa="Alinare" />
    </MemoryRouter>
  );
}

const nomeDaCliente = () => screen.getByLabelText(/nome da cliente/i) as HTMLInputElement;

describe('vínculo da NC no formulário de reversa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = {
      id: 'user-camila',
      nome: 'Camila Oliveira',
      usuario: 'camila',
      telas: ['formulario-alinare'],
      empresasAcesso: ['Alinare'],
    };
    ncService.opcoesParaReversa.mockResolvedValue([NC_ABERTA]);
  });

  it('aberto a partir de uma NC da empresa: preenche a cliente da NC', async () => {
    renderFormulario(`/formulario-alinare?nc=${NC_ABERTA.id}`);
    await waitFor(() => expect(nomeDaCliente().value).toBe('Loja Nova Demonstração'));
    expect(ncService.opcoesParaReversa).toHaveBeenCalledWith('Alinare');
  });

  it('não mostra seletor de NC: o vínculo vem só da URL', async () => {
    renderFormulario();
    await waitFor(() => expect(ncService.opcoesParaReversa).toHaveBeenCalled());
    expect(document.getElementById('nc_id')).toBeNull();
    expect(screen.queryByLabelText(/nc de origem/i)).not.toBeInTheDocument();
  });

  it('NC da URL fora das opções da empresa (encerrada ou de outra empresa): não preenche a cliente', async () => {
    renderFormulario('/formulario-alinare?nc=nc-de-outra-empresa');
    await waitFor(() => expect(ncService.opcoesParaReversa).toHaveBeenCalled());
    // dá tempo de o efeito de preenchimento rodar, se fosse rodar
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(nomeDaCliente().value).toBe('');
  });
});
