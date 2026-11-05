import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ComunicacaoReversa, HistoricoComunicacao } from '../types';

const mocks = vi.hoisted(() => ({
  api: {
    listarComunicacoesReversa: vi.fn(),
    resumoComunicacoesReversa: vi.fn(),
    historicoComunicacaoReversa: vi.fn(),
    reconciliarComunicacaoReversa: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../services/apiService', () => ({ default: mocks.api }));
vi.mock('react-hot-toast', () => ({ default: mocks.toast }));

import ComunicacoesPage from '../pages/ComunicacoesPage';

const base = (id: string, extras: Partial<ComunicacaoReversa> = {}): ComunicacaoReversa => ({
  id,
  solicitacao_id: '11111111-1111-4111-8111-111111111111',
  pedido: 'RV-11111111',
  empresa: 'Alinare',
  evento: 'pedido_aprovado',
  canal: 'email',
  destinatario_nome: 'Camila Oliveira',
  destinatario_email: 'camila@example.test',
  status: 'acao_conector_concluida',
  tentativas: 1,
  max_tentativas: 5,
  criado_em: '2026-10-26T12:00:00Z',
  atualizado_em: '2026-10-26T12:01:00Z',
  proxima_tentativa_em: null,
  acao_conector_em: '2026-10-26T12:01:00Z',
  ultimo_erro: '',
  reconciliacoes: 0,
  total: 3,
  ...extras,
});

const concluida = base('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const indeterminada = base('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', {
  evento: 'pedido_criado', status: 'resultado_indeterminado', acao_conector_em: null,
  ultimo_erro: 'Resultado ambiguo do fluxo (HTTP 502); verificar o historico antes de qualquer reenvio.',
});
const obsoleta = base('cccccccc-cccc-4ccc-8ccc-cccccccccccc', {
  evento: 'aprovacao_pendente', canal: 'teams', status: 'evento_obsoleto', destinatario_nome: 'Paula Mendes', tentativas: 0, acao_conector_em: null,
});

const historico: HistoricoComunicacao = {
  tentativas: [{ iniciada_em: '2026-10-26T12:00:00Z', finalizada_em: '2026-10-26T12:00:05Z', resultado: 'resultado_indeterminado', http_status: 502, detalhe: 'Sem resposta conclusiva do fluxo.' }],
  reconciliacoes: [],
};

const renderPage = () => render(<MemoryRouter><ComunicacoesPage /></MemoryRouter>);

/** Linha da tabela que contém o texto (os filtros também listam rótulos de eventos e situações). */
const linhaCom = async (texto: string) => within(await screen.findByRole('table')).getByText(texto).closest('tr')!;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.listarComunicacoesReversa.mockResolvedValue([concluida, indeterminada, obsoleta]);
  mocks.api.resumoComunicacoesReversa.mockResolvedValue({ acao_conector_concluida: 1, resultado_indeterminado: 1, evento_obsoleto: 1 });
  mocks.api.historicoComunicacaoReversa.mockResolvedValue(historico);
  mocks.api.reconciliarComunicacaoReversa.mockResolvedValue({ id: indeterminada.id, status: 'acao_conector_concluida' });
});

describe('ComunicacoesPage', () => {
  it('lista pedido, evento, destinatário, canal, situação e tentativas sem prometer entrega', async () => {
    renderPage();
    const linhaIndeterminada = await linhaCom('Pedido registrado');
    expect(within(linhaIndeterminada).getByText('RV-11111111')).toBeInTheDocument();
    expect(within(linhaIndeterminada).getByText('camila@example.test')).toBeInTheDocument();
    expect(within(linhaIndeterminada).getByText('E-mail')).toBeInTheDocument();
    expect(within(linhaIndeterminada).getByText('Resultado indeterminado')).toBeInTheDocument();
    expect(within(linhaIndeterminada).getByText('1/5')).toBeInTheDocument();
    expect(screen.getByText(/não comprovam entrega nem leitura/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reenviar tudo|enviar todas|reenviar/i })).not.toBeInTheDocument();
  });

  it('oferece reconciliação somente nas comunicações com resultado indeterminado', async () => {
    renderPage();
    await screen.findByRole('table');
    expect(screen.getAllByRole('button', { name: 'Confirmar conclusão' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Autorizar nova tentativa' })).toHaveLength(1);
    const linhaConcluida = await linhaCom('Pedido aprovado');
    expect(within(linhaConcluida).queryByRole('button', { name: /Confirmar conclusão|Autorizar/ })).not.toBeInTheDocument();
  });

  it('consulta o banco pelos filtros de situação, evento e canal', async () => {
    renderPage();
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'resultado_indeterminado' } });
    await waitFor(() => expect(mocks.api.listarComunicacoesReversa).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'resultado_indeterminado' })));
    fireEvent.change(screen.getByLabelText('Evento'), { target: { value: 'pedido_criado' } });
    fireEvent.change(screen.getByLabelText('Canal'), { target: { value: 'email' } });
    await waitFor(() => expect(mocks.api.listarComunicacoesReversa).toHaveBeenLastCalledWith(
      { status: 'resultado_indeterminado', evento: 'pedido_criado', canal: 'email', limite: 50 }));
  });

  it('mostra correlação, datas, erro sanitizado e o histórico ao expandir', async () => {
    renderPage();
    const linha = await linhaCom('Pedido registrado');
    fireEvent.click(within(linha).getByRole('button', { name: /Detalhes de RV-11111111/ }));
    expect(await screen.findByText(indeterminada.id)).toBeInTheDocument();
    expect(screen.getByText('Identificador de correlação')).toBeInTheDocument();
    expect(screen.getByText(/Resultado ambiguo do fluxo \(HTTP 502\)/)).toBeInTheDocument();
    expect(await screen.findByText(/Sem resposta conclusiva do fluxo\./)).toBeInTheDocument();
    expect(mocks.api.historicoComunicacaoReversa).toHaveBeenCalledWith(indeterminada.id);
    expect(screen.getByText('Nenhuma reconciliação.')).toBeInTheDocument();
  });

  it('exige justificativa e referência antes de reconciliar e envia os valores aparados', async () => {
    renderPage();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar conclusão' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Confirmar aceitação externa' });
    const enviar = within(dialogo).getByRole('button', { name: 'Registrar conclusão' });
    expect(enviar).toBeDisabled();
    fireEvent.change(within(dialogo).getByLabelText(/Justificativa/), { target: { value: 'curta' } });
    fireEvent.change(within(dialogo).getByLabelText(/Referência/), { target: { value: 'run-1' } });
    expect(enviar).toBeDisabled();
    fireEvent.change(within(dialogo).getByLabelText(/Justificativa/), { target: { value: '  Mensagem localizada no histórico do Outlook.  ' } });
    expect(enviar).toBeEnabled();
    fireEvent.click(enviar);
    await waitFor(() => expect(mocks.api.reconciliarComunicacaoReversa).toHaveBeenCalledWith(
      indeterminada.id, 'confirmar_conclusao_conector', 'Mensagem localizada no histórico do Outlook.', 'run-1'));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Conclusão registrada.'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.api.listarComunicacoesReversa).toHaveBeenCalledTimes(2);
  });

  it('autorizar nova tentativa explica a revalidação e usa a ação correspondente', async () => {
    renderPage();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Autorizar nova tentativa' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Autorizar nova tentativa' });
    expect(dialogo).toHaveTextContent('evidência de que nada foi enviado');
    expect(dialogo).toHaveTextContent('revalida destinatário, acesso e pertinência');
    fireEvent.change(within(dialogo).getByLabelText(/Justificativa/), { target: { value: 'Sem mensagem nos registros SMTP.' } });
    fireEvent.change(within(dialogo).getByLabelText(/Referência/), { target: { value: 'evidencia-42' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Autorizar nova tentativa' }));
    await waitFor(() => expect(mocks.api.reconciliarComunicacaoReversa).toHaveBeenCalledWith(
      indeterminada.id, 'autorizar_nova_tentativa', 'Sem mensagem nos registros SMTP.', 'evidencia-42'));
  });

  it('mantém o diálogo aberto e mostra o erro do banco quando outra pessoa já reconciliou', async () => {
    mocks.api.reconciliarComunicacaoReversa.mockRejectedValueOnce(new Error('Só comunicações com resultado indeterminado podem ser reconciliadas (situação atual: acao_conector_concluida).'));
    renderPage();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar conclusão' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.change(within(dialogo).getByLabelText(/Justificativa/), { target: { value: 'Execução localizada no fluxo.' } });
    fireEvent.change(within(dialogo).getByLabelText(/Referência/), { target: { value: 'run-9' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar conclusão' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('situação atual: acao_conector_concluida');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.api.listarComunicacoesReversa).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('informa falha de carregamento (inclusive recusa por falta de permissão) com nova tentativa', async () => {
    mocks.api.listarComunicacoesReversa.mockRejectedValueOnce(new Error('Somente administradores consultam as comunicações.'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Somente administradores consultam as comunicações.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await linhaCom('Pedido registrado')).toBeInTheDocument();
  });

  it('pagina sem trocar a lista: carrega mais a partir do deslocamento atual', async () => {
    mocks.api.listarComunicacoesReversa.mockResolvedValueOnce([concluida, indeterminada].map((item) => ({ ...item, total: 3 })));
    mocks.api.listarComunicacoesReversa.mockResolvedValueOnce([{ ...obsoleta, total: 3 }]);
    renderPage();
    await screen.findByRole('table');
    expect(screen.getByText('2 de 3 comunicações')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(() => expect(mocks.api.listarComunicacoesReversa).toHaveBeenLastCalledWith(expect.objectContaining({ deslocamento: 2 })));
    expect(await linhaCom('Aprovação pendente')).toBeInTheDocument();
    expect(await linhaCom('Pedido registrado')).toBeInTheDocument();
  });
});
