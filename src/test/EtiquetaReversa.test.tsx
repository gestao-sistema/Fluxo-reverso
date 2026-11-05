import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EtiquetaReversa from '../components/admin/EtiquetaReversa';
import type { Solicitacao } from '../types';

const mocks = vi.hoisted(() => ({
  getEmissaoAtual: vi.fn(),
  registrarEtiqueta: vi.fn(),
  atualizarDadosEmissao: vi.fn(),
  urlEtiqueta: vi.fn(),
  atualizarRastreio: vi.fn(),
  lerEtiquetaPdf: vi.fn(),
}));

vi.mock('../services/apiService', () => ({
  default: {
    getEmissaoAtual: mocks.getEmissaoAtual,
    registrarEtiqueta: mocks.registrarEtiqueta,
    atualizarDadosEmissao: mocks.atualizarDadosEmissao,
    urlEtiqueta: mocks.urlEtiqueta,
    atualizarRastreio: mocks.atualizarRastreio,
  },
}));

vi.mock('../lib/etiquetaPdf', () => ({ lerEtiquetaPdf: mocks.lerEtiquetaPdf }));

const pedido: Solicitacao = {
  id: '00000000-0000-0000-0000-000000000051',
  created_at: '2026-10-23T10:00:00Z',
  empresa: 'Alinare',
  data_solicitacao: '2026-10-23',
  solicitante: 'Camila Oliveira',
  setor: 'Comercial Alinare',
  codigo_cliente: 7001,
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

describe('EtiquetaReversa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEmissaoAtual.mockResolvedValue(null);
    mocks.registrarEtiqueta.mockResolvedValue({ ...pedido, status: 'etiqueta_gerada' });
    mocks.atualizarDadosEmissao.mockResolvedValue(null);
    mocks.lerEtiquetaPdf.mockResolvedValue({
      metodo: 'texto',
      campos: { codigo_autorizacao: 'AUT-889900', codigo_rastreio: 'AA123456789BR' },
    });
  });

  it('sugere os códigos separados, mas só registra após confirmação explícita', async () => {
    const onAlterada = vi.fn();
    const file = new File(['%PDF-1.4 teste'], 'etiqueta.pdf', { type: 'application/pdf' });
    render(<EtiquetaReversa solicitacao={pedido} podeEmitir onAlterada={onAlterada} />);

    await screen.findByRole('button', { name: 'Anexar etiqueta' });
    fireEvent.change(screen.getByLabelText('Selecionar PDF da etiqueta'), { target: { files: [file] } });
    const form = await screen.findByLabelText('Conferir dados da emissão');
    const autorizacao = screen.getByLabelText('Código de autorização de postagem');
    const rastreio = screen.getByLabelText(/Código de rastreamento/);
    await waitFor(() => {
      expect(autorizacao).toHaveValue('AUT-889900');
      expect(rastreio).toHaveValue('AA123456789BR');
    });
    expect(mocks.registrarEtiqueta).not.toHaveBeenCalled();
    expect(form).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mocks.registrarEtiqueta).toHaveBeenCalledTimes(1));
    expect(mocks.registrarEtiqueta).toHaveBeenCalledWith(pedido, file, expect.objectContaining({
      codigoAutorizacao: 'AUT-889900',
      codigoRastreio: 'AA123456789BR',
      emitidaEm: null,
      validaAte: null,
      emissaoId: expect.any(String),
    }));
    expect(mocks.atualizarRastreio).not.toHaveBeenCalled();
    expect(onAlterada).toHaveBeenCalledWith(expect.objectContaining({ status: 'etiqueta_gerada' }), true);
  });

  it('não oferece emissão para pedido sem aprovação ou operador sem capacidade', async () => {
    const semAprovacao = { ...pedido, aprovacao_status: 'aguardando_aprovacao' as const };
    const { rerender } = render(<EtiquetaReversa solicitacao={semAprovacao} podeEmitir onAlterada={vi.fn()} />);
    expect(await screen.findByText('Este pedido ainda não foi aprovado.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anexar etiqueta' })).not.toBeInTheDocument();

    rerender(<EtiquetaReversa solicitacao={pedido} podeEmitir={false} onAlterada={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Anexar etiqueta' })).not.toBeInTheDocument();
  });

  it('permite confirmar a autorização sem rastreamento quando ele ainda não está disponível', async () => {
    mocks.lerEtiquetaPdf.mockResolvedValue({ metodo: 'texto', campos: { codigo_autorizacao: 'AUT-123456' } });
    const file = new File(['%PDF-1.4 teste'], 'etiqueta-sem-rastreio.pdf', { type: 'application/pdf' });
    render(<EtiquetaReversa solicitacao={pedido} podeEmitir onAlterada={vi.fn()} />);

    await screen.findByRole('button', { name: 'Anexar etiqueta' });
    fireEvent.change(screen.getByLabelText('Selecionar PDF da etiqueta'), { target: { files: [file] } });
    await screen.findByLabelText('Conferir dados da emissão');
    await waitFor(() => expect(screen.getByLabelText('Código de autorização de postagem')).toHaveValue('AUT-123456'));
    expect(screen.getByLabelText(/Código de rastreamento/)).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(mocks.registrarEtiqueta).toHaveBeenCalledWith(pedido, file, expect.objectContaining({
      codigoAutorizacao: 'AUT-123456',
      codigoRastreio: null,
    })));
    expect(mocks.atualizarRastreio).not.toHaveBeenCalled();
  });

  it('envia datas de calendário revisadas antes de confirmar a emissão', async () => {
    const file = new File(['%PDF-1.4 teste'], 'etiqueta-com-validade.pdf', { type: 'application/pdf' });
    render(<EtiquetaReversa solicitacao={pedido} podeEmitir onAlterada={vi.fn()} />);

    await screen.findByRole('button', { name: 'Anexar etiqueta' });
    fireEvent.change(screen.getByLabelText('Selecionar PDF da etiqueta'), { target: { files: [file] } });
    await screen.findByLabelText('Conferir dados da emissão');
    fireEvent.change(screen.getByLabelText('Data de emissão'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('Válida até'), { target: { value: '2026-11-20' } });

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(mocks.registrarEtiqueta).toHaveBeenCalledWith(pedido, file, expect.objectContaining({
      emitidaEm: '2026-10-20',
      validaAte: '2026-11-20',
    })));
  });

  it('recusa validade anterior à emissão antes do envio', async () => {
    const file = new File(['%PDF-1.4 teste'], 'etiqueta-invalidada.pdf', { type: 'application/pdf' });
    render(<EtiquetaReversa solicitacao={pedido} podeEmitir onAlterada={vi.fn()} />);

    await screen.findByRole('button', { name: 'Anexar etiqueta' });
    fireEvent.change(screen.getByLabelText('Selecionar PDF da etiqueta'), { target: { files: [file] } });
    await screen.findByLabelText('Conferir dados da emissão');
    fireEvent.change(screen.getByLabelText('Data de emissão'), { target: { value: '2026-10-24' } });
    fireEvent.change(screen.getByLabelText('Válida até'), { target: { value: '2026-10-23' } });

    expect(await screen.findByText('A validade não pode ser anterior à data de emissão.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    expect(mocks.registrarEtiqueta).not.toHaveBeenCalled();
  });

  it('mostra validade na emissão vigente e omite alerta após a postagem', async () => {
    mocks.getEmissaoAtual.mockResolvedValue({
      id: 'emissao-1', solicitacao_id: pedido.id, sequencia: 1,
      codigo_autorizacao: 'AUT-1', codigo_rastreio: null, pdf_path: 'etiqueta.pdf', pdf_nome: 'etiqueta.pdf',
      emitida_em: '2026-10-20', valida_ate: '2099-01-02', substituida_em: null, postagem_confirmada_em: '2026-10-21T12:00:00Z',
    });
    render(<EtiquetaReversa solicitacao={{ ...pedido, status: 'postado' }} podeEmitir onAlterada={vi.fn()} />);

    expect(await screen.findByText('20/10/2026')).toBeInTheDocument();
    expect(screen.getByText('02/01/2099')).toBeInTheDocument();
    expect(screen.queryByText('Prazo informado encerrado — verificar postagem')).not.toBeInTheDocument();
  });

  it('mantém o PDF selecionado para nova tentativa quando o vínculo falha', async () => {
    mocks.registrarEtiqueta
      .mockRejectedValueOnce(new Error('Falha ao vincular PDF'))
      .mockResolvedValueOnce({ ...pedido, status: 'etiqueta_gerada', etiqueta_path: `${pedido.id}/etiqueta.pdf` });
    const file = new File(['%PDF-1.4 teste'], 'etiqueta.pdf', { type: 'application/pdf' });
    render(<EtiquetaReversa solicitacao={pedido} podeEmitir onAlterada={vi.fn()} />);

    await screen.findByRole('button', { name: 'Anexar etiqueta' });
    fireEvent.change(screen.getByLabelText('Selecionar PDF da etiqueta'), { target: { files: [file] } });
    await screen.findByLabelText('Conferir dados da emissão');
    const confirmar = screen.getByRole('button', { name: 'Confirmar' });
    fireEvent.click(confirmar);
    await waitFor(() => expect(mocks.registrarEtiqueta).toHaveBeenCalledTimes(1));
    expect(screen.getByText('etiqueta.pdf')).toBeInTheDocument();
    expect(screen.getByLabelText('Conferir dados da emissão')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(mocks.registrarEtiqueta).toHaveBeenCalledTimes(2));
  });

  it('bloqueia confirmação repetida enquanto a emissão está sendo salva', async () => {
    let concluir!: (valor: Solicitacao) => void;
    mocks.registrarEtiqueta.mockReturnValue(new Promise<Solicitacao>((resolve) => { concluir = resolve; }));
    const file = new File(['%PDF-1.4 teste'], 'etiqueta.pdf', { type: 'application/pdf' });
    render(<EtiquetaReversa solicitacao={pedido} podeEmitir onAlterada={vi.fn()} />);

    await screen.findByRole('button', { name: 'Anexar etiqueta' });
    fireEvent.change(screen.getByLabelText('Selecionar PDF da etiqueta'), { target: { files: [file] } });
    await screen.findByLabelText('Conferir dados da emissão');
    const confirmar = screen.getByRole('button', { name: 'Confirmar' });
    fireEvent.click(confirmar);
    await waitFor(() => expect(mocks.registrarEtiqueta).toHaveBeenCalledTimes(1));
    expect(confirmar).toBeDisabled();
    fireEvent.click(confirmar);
    expect(mocks.registrarEtiqueta).toHaveBeenCalledTimes(1);
    concluir({ ...pedido, status: 'etiqueta_gerada', etiqueta_path: `${pedido.id}/etiqueta.pdf` });
  });

  it('não interpreta falha de consulta da emissão como ausência e libera retry explícito', async () => {
    mocks.getEmissaoAtual.mockRejectedValueOnce(new Error('RLS indisponível'));
    render(<EtiquetaReversa solicitacao={pedido} podeEmitir onAlterada={vi.fn()} />);

    expect(await screen.findByText(/Não foi possível conferir a etiqueta deste pedido: RLS indisponível/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anexar etiqueta' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('button', { name: 'Anexar etiqueta' })).toBeInTheDocument();
    expect(mocks.getEmissaoAtual).toHaveBeenCalledTimes(2);
  });
});

describe('EtiquetaReversa: arquivo e erros ao lado da ação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEmissaoAtual.mockResolvedValue(null);
    mocks.registrarEtiqueta.mockResolvedValue({ ...pedido, status: 'etiqueta_gerada' });
    mocks.lerEtiquetaPdf.mockResolvedValue({ metodo: 'texto', campos: {} });
  });

  const escolher = async (arquivo: File) => {
    await screen.findByRole('button', { name: 'Anexar etiqueta' });
    fireEvent.change(screen.getByLabelText('Selecionar PDF da etiqueta'), { target: { files: [arquivo] } });
  };

  it('aceita PDF sem tipo informado pelo navegador (extensão .pdf)', async () => {
    render(<EtiquetaReversa solicitacao={pedido} podeEmitir onAlterada={vi.fn()} />);
    await escolher(new File(['%PDF-1.7 x'], 'etiqueta.PDF', { type: '' }));
    expect(await screen.findByLabelText('Conferir dados da emissão')).toBeInTheDocument();
  });

  it.each([
    ['imagem', new File(['x'], 'foto.png', { type: 'image/png' }), /Escolha um arquivo PDF/],
    ['sem extensão nem tipo', new File(['%PDF-1.4'], 'etiqueta', { type: '' }), /Escolha um arquivo PDF/],
    ['vazio', new File([], 'vazio.pdf', { type: 'application/pdf' }), /arquivo está vazio/],
    ['renomeado, sem cabeçalho de PDF', new File(['texto qualquer'], 'falso.pdf', { type: 'application/pdf' }), /não parece ser um PDF válido/],
  ])('recusa arquivo %s com aviso junto ao botão e sem abrir a conferência', async (_nome, arquivo, aviso) => {
    render(<EtiquetaReversa solicitacao={pedido} podeEmitir onAlterada={vi.fn()} />);
    await escolher(arquivo);
    expect(await screen.findByRole('alert')).toHaveTextContent(aviso);
    expect(screen.queryByLabelText('Conferir dados da emissão')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anexar etiqueta' })).toBeEnabled();
    expect(mocks.registrarEtiqueta).not.toHaveBeenCalled();
  });

  it('recusa PDF acima de 5 MB', async () => {
    render(<EtiquetaReversa solicitacao={pedido} podeEmitir onAlterada={vi.fn()} />);
    const grande = new File(['%PDF-1.4'], 'grande.pdf', { type: 'application/pdf' });
    Object.defineProperty(grande, 'size', { value: 5 * 1024 * 1024 + 1 });
    await escolher(grande);
    expect(await screen.findByRole('alert')).toHaveTextContent(/maior que 5 MB/);
  });

  it('falha no envio aparece ao lado do botão, mantém o PDF e permite nova tentativa', async () => {
    mocks.registrarEtiqueta
      .mockRejectedValueOnce(new Error('Não foi possível enviar o PDF. Verifique a conexão e tente de novo; o pedido não foi alterado.'))
      .mockResolvedValueOnce({ ...pedido, status: 'etiqueta_gerada', etiqueta_path: `${pedido.id}/etiqueta.pdf` });
    const onAlterada = vi.fn();
    render(<EtiquetaReversa solicitacao={pedido} podeEmitir onAlterada={onAlterada} />);
    await escolher(new File(['%PDF-1.4 teste'], 'etiqueta.pdf', { type: 'application/pdf' }));
    await screen.findByLabelText('Conferir dados da emissão');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível enviar o PDF/);
    expect(onAlterada).not.toHaveBeenCalled();
    expect(screen.getByText('etiqueta.pdf')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(onAlterada).toHaveBeenCalledWith(expect.objectContaining({ etiqueta_path: expect.any(String) }), true));
    // a segunda tentativa reaproveita o identificador da primeira (sem emissão duplicada)
    const [, , primeira] = mocks.registrarEtiqueta.mock.calls[0];
    const [, , segunda] = mocks.registrarEtiqueta.mock.calls[1];
    expect(segunda.emissaoId).toBe(primeira.emissaoId);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('upload concluído mas PDF não vinculado: avisa que não houve sucesso e mantém a conferência', async () => {
    mocks.registrarEtiqueta.mockRejectedValueOnce(new Error('O PDF foi enviado, mas não foi ligado ao pedido: Registro recusado pelo banco.'));
    const onAlterada = vi.fn();
    render(<EtiquetaReversa solicitacao={pedido} podeEmitir onAlterada={onAlterada} />);
    await escolher(new File(['%PDF-1.4 teste'], 'etiqueta.pdf', { type: 'application/pdf' }));
    await screen.findByLabelText('Conferir dados da emissão');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi ligado ao pedido/);
    expect(onAlterada).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Conferir dados da emissão')).toBeInTheDocument();
  });
});
