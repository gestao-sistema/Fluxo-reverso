import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NcFormPage from '../pages/NcFormPage';
import demoNcService from '../demo/demoNcService';
import { demoDados } from '../demo/demoDatabase';
import { iniciarDemo } from '../demo/demoMode';
import { ID_NC_DEMO } from '../demo/fixtures';
import { hojeIso } from '../lib/ncCalculos';
import { MENSAGEM_CUSTO_NAO_COM_VALOR } from '../lib/ncClassificacao';
import { MENSAGEM_CONFLITO_NAO, MENSAGEM_NAO_COM_CAMPO_EM_BRANCO } from '../lib/ncFormulario';

// Usuário de qualidade da demonstração (abre e edita NCs). A sessão vem do mock abaixo.
const sessao = vi.hoisted(() => ({
  user: {
    id: 'demo-qualidade', nome: 'Júlia Nascimento', usuario: 'julia.qualidade', telas: ['nc', 'nc-edit'],
    perfilAcesso: 'personalizado', empresasAcesso: ['Alinare', 'Novitah'],
  } as Record<string, unknown>,
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: sessao.user }) }));
vi.mock('../context/TemaContext', () => ({ useEmpresaDaTela: () => undefined }));
// Reversa e linha do tempo têm dados próprios; o formulário é o assunto destes testes
vi.mock('../components/nc/NcReversas', () => ({ default: () => null }));
vi.mock('../components/nc/NcLinhaDoTempo', () => ({ default: () => null }));

function abrir(rota: string) {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route path="/admin/nc" element={<p>Lista de NC</p>} />
        <Route path="/admin/nc/nova" element={<NcFormPage />} />
        <Route path="/admin/nc/:id" element={<NcFormPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const ncDaDemo = (numero: number) => demoDados.ncs().find((nc) => nc.numero === numero)!;
const botao = (nome: RegExp | string) => screen.getByRole('button', { name: nome });

beforeEach(() => {
  demoDados.resetar();
  localStorage.clear();
  iniciarDemo('demo-qualidade');
});

// Restaura só os espiões criados aqui (sem mexer nos mocks de módulo da sessão e do contexto)
const espioes: Array<{ mockRestore: () => void }> = [];
afterEach(() => {
  espioes.splice(0).forEach((espiao) => espiao.mockRestore());
});

describe('abertura simplificada: Registrar ocorrência', () => {
  it('mostra as perguntas essenciais, com a data de hoje sugerida e os detalhes fechados', async () => {
    abrir('/admin/nc/nova');
    expect(await screen.findByRole('heading', { name: 'Registrar ocorrência' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Empresa \/ contrato/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Data da ocorrência/)).toHaveValue(hojeIso());
    expect(screen.getByLabelText(/Cliente \/ pedido/)).toBeInTheDocument();
    expect(screen.getByLabelText(/O que aconteceu\?/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Onde se originou\?/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Houve custo/ })).toBeInTheDocument();
    expect(botao(/Registrar ocorrência/)).toBeEnabled();
    // Área de registro e de tratativa não são perguntas obrigatórias da abertura
    expect(screen.getByText('Detalhes opcionais').closest('details')?.open).toBe(false);
  });

  it('ocorrência sem cliente: registra e navega para o registro criado', async () => {
    const user = userEvent.setup();
    abrir('/admin/nc/nova');
    await user.selectOptions(await screen.findByLabelText(/Empresa \/ contrato/), 'Alinare');
    await user.selectOptions(screen.getByLabelText(/O que aconteceu\?/), 'Endereço incorreto');
    await user.selectOptions(screen.getByLabelText(/Onde se originou\?/), 'Expedição');
    await user.click(screen.getByRole('radio', { name: 'Em apuração' }));
    await user.click(botao(/Registrar ocorrência/));

    await waitFor(() => expect(screen.getByRole('heading', { name: /NC-\d{4}/ })).toBeInTheDocument());
    const criada = demoDados.ncs().find((nc) => nc.numero > 2405)!;
    expect(criada).toMatchObject({ cliente: null, tipo_problema: 'Endereço incorreto', causador: 'Expedição', custo_situacao: 'Em apuração', origem: null, status: 'Aberta' });
  });

  it('Outro sem descrição: não grava e pede a descrição', async () => {
    const user = userEvent.setup();
    const criar = vi.spyOn(demoNcService, 'criar');
    espioes.push(criar);
    abrir('/admin/nc/nova');
    await user.selectOptions(await screen.findByLabelText(/Empresa \/ contrato/), 'Alinare');
    await user.selectOptions(screen.getByLabelText(/O que aconteceu\?/), 'Outro');
    await user.selectOptions(screen.getByLabelText(/Onde se originou\?/), 'A apurar');
    await user.click(screen.getByRole('radio', { name: 'Não' }));
    await user.click(botao(/Registrar ocorrência/));

    expect(await screen.findByText('Descreva o problema quando o tipo for Outro.')).toBeInTheDocument();
    expect(criar).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Descrição \(obrigatória para Outro\)/)).toBeInTheDocument();
  });

  it('cenário "Não": não pede valores financeiros e não encerra a NC', async () => {
    const user = userEvent.setup();
    abrir('/admin/nc/nova');
    await user.selectOptions(await screen.findByLabelText(/Empresa \/ contrato/), 'Novitah');
    await user.selectOptions(screen.getByLabelText(/O que aconteceu\?/), 'Atraso de postagem');
    await user.selectOptions(screen.getByLabelText(/Onde se originou\?/), 'Expedição');
    await user.click(screen.getByRole('radio', { name: 'Não' }));

    expect(screen.queryByLabelText(/Custo — produto/)).not.toBeInTheDocument();
    expect(screen.getByText(/Sem custo registrado\. Os campos de valor não são pedidos\./)).toBeInTheDocument();
    await user.click(botao(/Registrar ocorrência/));

    await waitFor(() => expect(screen.getByRole('heading', { name: /NC-\d{4}/ })).toBeInTheDocument());
    const criada = demoDados.ncs().find((nc) => nc.empresa === 'Novitah' && nc.tipo_problema === 'Atraso de postagem')!;
    expect(criada).toMatchObject({ custo_situacao: 'Não', custo_produto: null, status: 'Aberta', data_encerramento: null });
  });

  it('cenário "Sim": mostra os custos e deixa vazio o que não se sabe (não vira zero)', async () => {
    const user = userEvent.setup();
    abrir('/admin/nc/nova');
    await user.selectOptions(await screen.findByLabelText(/Empresa \/ contrato/), 'Alinare');
    await user.selectOptions(screen.getByLabelText(/O que aconteceu\?/), 'Extravio');
    await user.selectOptions(screen.getByLabelText(/Onde se originou\?/), 'Correios');
    await user.click(screen.getByRole('radio', { name: 'Sim' }));
    expect(screen.getByLabelText(/Custo — produto/)).toHaveValue(null);
    expect(screen.getByText('Valor não informado', { selector: '.nc-calc' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Custo — produto/), '50');
    await user.click(botao(/Registrar ocorrência/));
    await waitFor(() => expect(screen.getByRole('heading', { name: /NC-\d{4}/ })).toBeInTheDocument());
    const criada = demoDados.ncs().find((nc) => nc.tipo_problema === 'Extravio')!;
    expect(criada).toMatchObject({ custo_situacao: 'Sim', custo_produto: 50, custo_frete_adicional: null, custo_multa_outros: null });
  });

  it('cenário "Em apuração": nunca mostra R$ 0,00 como custo confirmado', async () => {
    const user = userEvent.setup();
    abrir('/admin/nc/nova');
    await user.selectOptions(await screen.findByLabelText(/Empresa \/ contrato/), 'Alinare');
    await user.selectOptions(screen.getByLabelText(/O que aconteceu\?/), 'Extravio');
    await user.selectOptions(screen.getByLabelText(/Onde se originou\?/), 'Correios');
    await user.click(screen.getByRole('radio', { name: 'Em apuração' }));
    expect(screen.getByText('A apurar', { selector: '.nc-calc' })).toBeInTheDocument();
    expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument();

    await user.click(botao(/Registrar ocorrência/));
    await waitFor(() => expect(screen.getByRole('heading', { name: /NC-\d{4}/ })).toBeInTheDocument());
    const criada = demoDados.ncs().find((nc) => nc.tipo_problema === 'Extravio')!;
    expect(criada).toMatchObject({ custo_situacao: 'Em apuração', custo_produto: null, custo_total: null });
  });

  it('erro ao salvar: mantém o que foi digitado e explica', async () => {
    const user = userEvent.setup();
    espioes.push(vi.spyOn(demoNcService, 'criar').mockRejectedValueOnce(new Error('Falha simulada ao gravar.')));
    abrir('/admin/nc/nova');
    await user.selectOptions(await screen.findByLabelText(/Empresa \/ contrato/), 'Alinare');
    await user.selectOptions(screen.getByLabelText(/O que aconteceu\?/), 'Extravio');
    await user.selectOptions(screen.getByLabelText(/Onde se originou\?/), 'Correios');
    await user.click(screen.getByRole('radio', { name: 'Em apuração' }));
    await user.type(screen.getByLabelText(/Cliente \/ pedido/), 'Cliente que não pode se perder');
    await user.click(botao(/Registrar ocorrência/));

    const aviso = await screen.findByText(/Não foi possível registrar a ocorrência: Falha simulada ao gravar\./);
    expect(aviso).toHaveTextContent('Os dados digitados foram mantidos.');
    expect(screen.getByLabelText(/Cliente \/ pedido/)).toHaveValue('Cliente que não pode se perder');
    expect(screen.getByLabelText(/O que aconteceu\?/)).toHaveValue('Extravio');
    expect(screen.getByRole('heading', { name: 'Registrar ocorrência' })).toBeInTheDocument();
  });

  it('recarga: depois de registrar, abrir o registro mostra o que foi gravado', async () => {
    const user = userEvent.setup();
    const { unmount } = abrir('/admin/nc/nova');
    await user.selectOptions(await screen.findByLabelText(/Empresa \/ contrato/), 'Alinare');
    await user.selectOptions(screen.getByLabelText(/O que aconteceu\?/), 'Mercadoria devolvida pelo destinatário');
    await user.selectOptions(screen.getByLabelText(/Onde se originou\?/), 'Cliente \/ destinatário');
    await user.click(screen.getByRole('radio', { name: 'Em apuração' }));
    await user.click(botao(/Registrar ocorrência/));
    await waitFor(() => expect(screen.getByRole('heading', { name: /NC-\d{4}/ })).toBeInTheDocument());
    const id = demoDados.ncs().find((nc) => nc.tipo_problema === 'Mercadoria devolvida pelo destinatário')!.id;
    unmount();

    abrir(`/admin/nc/${id}`);
    expect(await screen.findByLabelText(/Tipo do problema/)).toHaveValue('Mercadoria devolvida pelo destinatário');
    expect(screen.getByLabelText(/Origem \/ causador/)).toHaveValue('Cliente / destinatário');
    expect(screen.getByLabelText(/Houve custo\?/)).toHaveValue('Em apuração');
  });
});

describe('registro completo: edição, legado e campos ocultos', () => {
  it('salvar sem mudanças não regrava o registro; origem, classificação, NF e custos seguem como estavam', async () => {
    const user = userEvent.setup();
    const antes = { ...ncDaDemo(2401) };
    const gravacao = vi.spyOn(demoNcService, 'atualizar');
    espioes.push(gravacao);
    abrir(`/admin/nc/${ID_NC_DEMO[2401]}`);
    expect(await screen.findByRole('heading', { name: 'NC-2401' })).toBeInTheDocument();
    expect(screen.getByText(/Origem antiga \(registro anterior\)/)).toBeInTheDocument();

    await user.click(botao(/Salvar alterações/));
    await waitFor(() => expect(gravacao).not.toHaveBeenCalled());
    // Nada foi gravado: o registro inteiro é igual ao de antes (inclusive campos ausentes no legado)
    expect(ncDaDemo(2401)).toEqual(antes);
  });

  it('"Não" com valores registrados: explica o conflito, não grava e não apaga nada', async () => {
    const user = userEvent.setup();
    const antes = { ...ncDaDemo(2403) };
    abrir(`/admin/nc/${ID_NC_DEMO[2403]}`);
    await screen.findByRole('heading', { name: 'NC-2403' });
    await user.selectOptions(screen.getByLabelText(/Houve custo\?/), 'Não');

    expect(screen.getByText(MENSAGEM_CONFLITO_NAO)).toBeInTheDocument();
    expect(screen.getByLabelText(/Custo — produto/)).toHaveValue(antes.custo_produto);
    await user.click(botao(/Salvar alterações/));
    expect(await screen.findByText(MENSAGEM_CUSTO_NAO_COM_VALOR)).toBeInTheDocument();
    expect(ncDaDemo(2403)).toMatchObject({ custo_produto: antes.custo_produto, custo_frete_adicional: antes.custo_frete_adicional });
    expect(ncDaDemo(2403).custo_situacao ?? null).toBe(antes.custo_situacao ?? null);
  });

  it('mudar a situação apagando valores é recusado numa gravação, e nada é apagado', async () => {
    const user = userEvent.setup();
    const antes = { ...ncDaDemo(2403) };
    abrir(`/admin/nc/${ID_NC_DEMO[2403]}`);
    await screen.findByRole('heading', { name: 'NC-2403' });
    await user.selectOptions(screen.getByLabelText(/Houve custo\?/), 'Em apuração');
    await user.clear(screen.getByLabelText(/Custo — produto/));
    await user.click(botao(/Salvar alterações/));

    expect(await screen.findByText(MENSAGEM_NAO_COM_CAMPO_EM_BRANCO)).toBeInTheDocument();
    expect(ncDaDemo(2403).custo_produto).toBe(antes.custo_produto);
  });

  it('a classificação nova é editável no registro completo e fica gravada', async () => {
    const user = userEvent.setup();
    abrir(`/admin/nc/${ID_NC_DEMO[2402]}`);
    await screen.findByRole('heading', { name: 'NC-2402' });
    const tipo = screen.getByLabelText(/Tipo do problema/);
    await user.selectOptions(tipo, 'Frete não cobrado na venda');
    await user.click(botao(/Salvar alterações/));
    await waitFor(() => expect(ncDaDemo(2402).tipo_problema).toBe('Frete não cobrado na venda'));
    expect(screen.getByLabelText(/Tipo do problema/)).toHaveValue('Frete não cobrado na venda');
  });
});

describe('edição: só o alterado, conflito de versão, correção de valor e opções', () => {
  it('editar só a NF envia só a NF, com a versão que a tela carregou', async () => {
    const user = userEvent.setup();
    const gravacao = vi.spyOn(demoNcService, 'atualizar');
    espioes.push(gravacao);
    abrir(`/admin/nc/${ID_NC_DEMO[2404]}`);
    await screen.findByRole('heading', { name: 'NC-2404' });
    const antes = ncDaDemo(2404);
    const nf = document.getElementById('nf') as HTMLInputElement;
    await user.clear(nf);
    await user.type(nf, 'NF-9999');
    await user.click(botao(/Salvar alterações/));
    await waitFor(() => expect(gravacao).toHaveBeenCalledTimes(1));
    expect(gravacao.mock.calls[0][1]).toEqual({ nf: 'NF-9999' });
    expect(gravacao.mock.calls[0][2]).toEqual({ versao: antes.updated_at, motivo: null });
    expect(ncDaDemo(2404)).toMatchObject({ nf: 'NF-9999', descricao: antes.descricao, custo_produto: antes.custo_produto });
  });

  it('conflito: outra sessão gravou; a digitação fica, a versão atual é consultada e reaplicada, e só então grava', async () => {
    const user = userEvent.setup();
    abrir(`/admin/nc/${ID_NC_DEMO[2404]}`);
    await screen.findByRole('heading', { name: 'NC-2404' });
    const nf = document.getElementById('nf') as HTMLInputElement;
    await user.clear(nf);
    await user.type(nf, 'NF-8888');
    // Outra sessão grava a mesma NC (resolução) depois que a tela foi aberta
    const versaoOutra = new Date(Date.parse(ncDaDemo(2404).updated_at) + 60000).toISOString();
    demoDados.salvarNcs(demoDados.ncs().map((item) => (
      item.id === ID_NC_DEMO[2404] ? { ...item, resolucao: 'Reverso', updated_at: versaoOutra } : item
    )));
    await user.click(botao(/Salvar alterações/));
    expect(await screen.findByText(/Esta não conformidade foi alterada por outra pessoa/)).toBeInTheDocument();
    expect(ncDaDemo(2404).nf).not.toBe('NF-8888');
    expect((document.getElementById('nf') as HTMLInputElement).value).toBe('NF-8888');

    await user.click(botao(/Consultar versão atual/));
    const tabela = await screen.findByRole('table', { name: 'Diferenças para a versão atual' });
    expect(within(tabela).getByText('Resolução')).toBeInTheDocument();

    await user.click(botao(/Reaplicar minhas alterações/));
    expect((document.getElementById('nf') as HTMLInputElement).value).toBe('NF-8888');
    expect((document.getElementById('resolucao') as HTMLSelectElement).value).toBe('Reverso');
    await user.click(botao(/Salvar alterações/));
    await waitFor(() => expect(ncDaDemo(2404)).toMatchObject({ nf: 'NF-8888', resolucao: 'Reverso' }));
  });

  it('correção de valor já registrado: mostra o que muda, exige justificativa e só então grava, com trilha', async () => {
    const user = userEvent.setup();
    abrir(`/admin/nc/${ID_NC_DEMO[2404]}`);
    await screen.findByRole('heading', { name: 'NC-2404' });
    const produto = screen.getByLabelText(/Custo — produto/) as HTMLInputElement;
    await user.clear(produto);
    await user.type(produto, '0');
    await user.click(botao(/Salvar alterações/));

    const painel = await screen.findByRole('region', { name: 'Confirmar correção de valor registrado' });
    expect(within(painel).getByText(/Custo — produto: R\$\s?95,00 → R\$\s?0,00 \(zero informado\)/)).toBeInTheDocument();
    const confirmar = within(painel).getByRole('button', { name: /Confirmar correção/ });
    expect(confirmar).toBeDisabled();
    await user.type(within(painel).getByLabelText(/Justificativa da correção/), 'Cliente cancelou');
    expect(confirmar).toBeEnabled();
    await user.click(confirmar);

    await waitFor(() => expect(ncDaDemo(2404).custo_produto).toBe(0));
    const trilha = demoDados.auditoriaFinanceiraNcs().filter((item) => item.campo === 'custo_produto');
    expect(trilha).toMatchObject([{ valor_anterior: 95, valor_posterior: 0, motivo: 'Cliente cancelou' }]);
  });

  it('campos já preenchidos não oferecem a opção vazia; registro sem classificação ainda oferece', async () => {
    abrir(`/admin/nc/${ID_NC_DEMO[2404]}`);
    await screen.findByRole('heading', { name: 'NC-2404' });
    const tipo = document.getElementById('tipo_problema') as HTMLSelectElement;
    const situacao = document.getElementById('custo_situacao') as HTMLSelectElement;
    expect(within(tipo).queryByRole('option', { name: 'Não informado' })).toBeNull();
    expect(within(situacao).queryByRole('option', { name: 'Não informado' })).toBeNull();
  });

  it('registro antigo sem tipo continua com a opção vazia, para classificar', async () => {
    abrir(`/admin/nc/${ID_NC_DEMO[2402]}`);
    await screen.findByRole('heading', { name: 'NC-2402' });
    const tipo = document.getElementById('tipo_problema') as HTMLSelectElement;
    expect(within(tipo).getByRole('option', { name: 'Não informado' })).toBeInTheDocument();
  });
});
