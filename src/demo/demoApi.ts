import type {
  CreateSolicitacaoPayload,
  FiltrosSolicitacoes,
  RastreamentoCorreios,
  Solicitacao,
  SolicitacaoAprovacao,
  SolicitacaoHistorico,
  ReversaEmissaoResumo,
  UpdateSolicitacaoPayload,
  UsuarioAutenticado,
  NotificacaoEmissao,
  ListaNotificacoesEmissao,
  AcaoReconciliacao,
  ComunicacaoReversa,
  FiltrosComunicacao,
  FiltrosRelatorio,
  HistoricoComunicacao,
  LinhaRelatorioReversa,
  RelatorioReversa,
} from '../types';
import { STATUS_LABEL } from '../types';
import type {
  ConfigAprovadoresEmpresa,
  ConfigAprovadoresReversa,
  DadosEmissaoEtiqueta,
  UpdateSolicitacaoOptions,
} from '../services/apiService';
import { demoDados, demoRegistrarHistoricoSolicitacao } from './demoDatabase';
import type { DemoConfigAprovador, DemoEmissao } from './demoDatabase';
import { usuarioDemoAtual } from './demoMode';
import { validarDatasEmissao } from '../lib/emissaoDatas';
import { podeConfirmarRecebimentoMercadoria } from '../lib/perfil';
import { statusEfetivo } from '../lib/situacaoPedido';
import { pedidoCorrespondeABusca } from '../lib/pedido';
import { guardarArquivoDemo, lerArquivoDemo } from './demoArquivos';
import {
  filtrarComunicacoesDemo,
  linhasRelatorioDemo,
  reconciliarComunicacaoDemo,
  relatorioDemo,
} from './demoComunicacoesRelatorio';

const novoId = () => `demo-${crypto.randomUUID()}`;

function codigoRastreioDemo(id: string): string {
  let hash = 0;
  for (const caractere of id) hash = (hash * 31 + caractere.charCodeAt(0)) % 1_000_000_000;
  return `AA${String(hash).padStart(9, '0')}BR`;
}

function caminhoEtiquetaDemo(id: string): string {
  return `demo/${id}/etiqueta.pdf`;
}

/** Mesma regra do banco: quem registrou (ou alterou) o pedido é o "próprio" autor. */
type PedidoComVersao = Solicitacao & { aprovacao_versao?: number; aprovacao_versao_por?: string | null };
const versaoDoPedido = (pedido: Solicitacao): number => (pedido as PedidoComVersao).aprovacao_versao ?? 1;

function pedidoDoProprioUsuario(user: UsuarioAutenticado, pedido: Solicitacao): boolean {
  return pedido.solicitado_por === user.id || (pedido as PedidoComVersao).aprovacao_versao_por === user.id;
}

function podeAprovarDemo(user: UsuarioAutenticado, pedido: Solicitacao): boolean {
  if (!user.telas.includes('aprovar-reversa') || !(user.empresasAcesso ?? []).includes(pedido.empresa)) return false;
  return demoDados.configAprovadores().some((item) => item.empresa === pedido.empresa
    && item.usuario_id === user.id
    && (item.todos_setores || item.setores.includes(pedido.setor)));
}

function exigirAdminDemo(): void {
  const user = usuarioDemoAtual();
  if (user.perfilAcesso !== 'mestre' && !user.telas.includes('usuarios')) {
    throw new Error('Somente administradores podem alterar a configuração de aprovadores.');
  }
}

function exigirAdminComunicacoesDemo(): void {
  const user = usuarioDemoAtual();
  if (user.perfilAcesso !== 'mestre' && !user.telas.includes('usuarios')) {
    throw new Error('Somente administradores consultam as comunicações.');
  }
}

function etiquetaPdfDemo(codigoRastreio = 'AA000000007BR'): string {
  const conteudo = [
    '0.8 w 42 42 511 758 re S',
    'BT /F1 18 Tf 68 750 Td (ETIQUETA DE DEMONSTRACAO) Tj ET',
    'BT /F1 12 Tf 68 710 Td (Fluxo Reverso - ambiente local) Tj ET',
    'BT /F1 12 Tf 68 670 Td (Destinatario: Cliente de demonstracao) Tj ET',
    'BT /F1 12 Tf 68 645 Td (Origem: Campinas - SP) Tj ET',
    'BT /F1 12 Tf 68 620 Td (Servico: Logistica reversa) Tj ET',
    '0.6 w 68 560 m 520 560 l S',
    `BT /F2 22 Tf 92 515 Td (${codigoRastreio}) Tj ET`,
    'BT /F1 10 Tf 68 470 Td (Este documento e ficticio e existe apenas para a apresentacao.) Tj ET',
    '0.7 w 68 425 m 68 450 l S 74 425 m 74 450 l S 80 425 m 80 450 l S 91 425 m 91 450 l S 94 425 m 94 450 l S 103 425 m 103 450 l S 111 425 m 111 450 l S 116 425 m 116 450 l S 128 425 m 128 450 l S 132 425 m 132 450 l S 139 425 m 139 450 l S 147 425 m 147 450 l S 155 425 m 155 450 l S 158 425 m 158 450 l S 171 425 m 171 450 l S 178 425 m 178 450 l S 181 425 m 181 450 l S 194 425 m 194 450 l S 202 425 m 202 450 l S 209 425 m 209 450 l S 214 425 m 214 450 l S 227 425 m 227 450 l S 231 425 m 231 450 l S 240 425 m 240 450 l S 249 425 m 249 450 l S 255 425 m 255 450 l S 268 425 m 268 450 l S 273 425 m 273 450 l S 284 425 m 284 450 l S 296 425 m 296 450 l S 300 425 m 300 450 l S 313 425 m 313 450 l S 321 425 m 321 450 l S 327 425 m 327 450 l S 338 425 m 338 450 l S 346 425 m 346 450 l S 354 425 m 354 450 l S 359 425 m 359 450 l S 372 425 m 372 450 l S 379 425 m 379 450 l S 385 425 m 385 450 l S 398 425 m 398 450 l S 405 425 m 405 450 l S 416 425 m 416 450 l S 422 425 m 422 450 l S 435 425 m 435 450 l S 442 425 m 442 450 l S 451 425 m 451 450 l S 459 425 m 459 450 l S 468 425 m 468 450 l S 480 425 m 480 450 l S 489 425 m 489 450 l S 497 425 m 497 450 l S 512 425 m 512 450 l S',
  ].join('\n');
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>',
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objetos.forEach((objeto, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objeto}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return `data:application/pdf;base64,${btoa(pdf)}`;
}

function registrarAcao(id: string, user: UsuarioAutenticado | null | undefined, acao: string) {
  if (user) demoRegistrarHistoricoSolicitacao({ solicitacao_id: id, user_nome: user.nome, acao });
}

function emissoesDemo(): DemoEmissao[] {
  const emissoes = demoDados.emissoes();
  const eventos = demoDados.eventosEmissao();
  let alterou = false;
  for (const pedido of demoDados.solicitacoes()) {
    if ((!pedido.etiqueta_path && !pedido.codigo_rastreio) || emissoes.some((item) => item.solicitacao_id === pedido.id && !item.substituida_em)) continue;
    const id = `demo-emissao-legada-${pedido.id}`;
    emissoes.push({
      id,
      solicitacao_id: pedido.id,
      sequencia: 1,
      codigo_autorizacao: pedido.id.endsWith('000000000007') ? 'AUT-DEMO-AL-7001' : null,
      codigo_rastreio: pedido.codigo_rastreio ?? null,
      pdf_path: pedido.etiqueta_path ?? null,
      pdf_nome: pedido.etiqueta_nome ?? null,
      // etiqueta_gerada_em é registro no sistema, não a data informada pelos Correios.
      emitida_em: null,
      valida_ate: null,
      substituida_em: null,
      origem: 'migracao',
      registrado_por: null,
      registrado_por_nome: 'Dados anteriores',
      emissao_anterior_id: null,
      motivo_reemissao: null,
      motivo_reemissao_detalhe: null,
      pdf_anexado_em: pedido.etiqueta_enviada_em ?? null,
    });
    eventos.push({
      id: `demo-emissao-evento-legado-${id}-registro`,
      solicitacao_id: pedido.id,
      created_at: pedido.created_at,
      user_nome: 'Dados anteriores',
      tipo: 'registrada',
      descricao: 'Emissão anterior preservada na demonstração.',
    });
    if (pedido.etiqueta_path) {
      eventos.push({
        id: `demo-emissao-evento-legado-${id}-pdf`,
        solicitacao_id: pedido.id,
        created_at: pedido.etiqueta_enviada_em ?? pedido.created_at,
        user_nome: 'Dados anteriores',
        tipo: 'pdf_anexado',
        descricao: `PDF anterior preservado: ${pedido.etiqueta_nome ?? 'etiqueta.pdf'}`,
      });
    }
    alterou = true;
  }
  if (alterou) {
    demoDados.salvarEmissoes(emissoes);
    demoDados.salvarEventosEmissao(eventos);
  }
  return emissoes;
}

function eventoEmissaoDemo(emissao: DemoEmissao, tipo: string, descricao: string, user: UsuarioAutenticado): void {
  const eventos = demoDados.eventosEmissao();
  eventos.unshift({
    id: `demo-emissao-evento-${crypto.randomUUID()}`,
    solicitacao_id: emissao.solicitacao_id,
    created_at: new Date().toISOString(),
    user_nome: user.nome,
    tipo,
    descricao,
  });
  demoDados.salvarEventosEmissao(eventos);
}

function atualizar(id: string, campos: UpdateSolicitacaoPayload, user?: UsuarioAutenticado | null, options?: UpdateSolicitacaoOptions): Solicitacao {
  const dados = demoDados.solicitacoes();
  const indice = dados.findIndex((item) => item.id === id);
  if (indice < 0) throw new Error('Solicitação de demonstração não encontrada.');
  const atual = dados[indice];
  if (atual.inutilizada_em) throw new Error('Chamado na Lixeira não pode ser alterado. Restaure-o antes de operar.');
  if (options?.expectedStatus && atual.status !== options.expectedStatus) {
    throw new Error('Este pedido mudou ou já foi decidido. Atualize a fila e revise os dados novamente.');
  }
  if (options?.expectedApprovalSnapshot && Object.entries(options.expectedApprovalSnapshot).some(([campo, valor]) => (atual as any)[campo] !== valor)) {
    throw new Error('Este pedido mudou ou já foi decidido. Atualize a fila e revise os dados novamente.');
  }

  const atualizada = { ...atual, ...campos };
  dados[indice] = atualizada;
  demoDados.salvarSolicitacoes(dados);
  if (campos.status) registrarAcao(id, user, options?.historyAction ?? `Moveu para ${STATUS_LABEL[campos.status] ?? campos.status}`);
  // Só uma edição real: a propriedade presente no payload não basta, o conteúdo precisa ter mudado
  else if ('anotacoes' in campos && (campos.anotacoes ?? '') !== (atual.anotacoes ?? '')) registrarAcao(id, user, 'Anotação atualizada');
  return atualizada;
}

export const demoApi = {
  async createSolicitacao(data: CreateSolicitacaoPayload): Promise<Solicitacao> {
    const autor = usuarioDemoAtual();
    const nova: Solicitacao = {
      ...data,
      solicitante: autor.nome,
      solicitado_por: autor.id,
      solicitado_por_nome: autor.nome,
      aprovacao_status: 'aguardando_aprovacao',
      aprovacao_legada: false,
      aprovacao_justificativa: null,
      id: novoId(),
      created_at: new Date().toISOString(),
      nc_numero: null,
      legado: false,
      // Como no banco: o pedido novo fica na etapa inicial e a aprovação é uma dimensão própria
      status: 'pendente',
    };
    demoDados.salvarSolicitacoes([nova, ...demoDados.solicitacoes()]);
    return nova;
  },

  async getSolicitacoes(filtros?: FiltrosSolicitacoes): Promise<Solicitacao[]> {
    let itens = demoDados.solicitacoes().filter((item) => !item.inutilizada_em);
    const legadas = itens.map((item) => item.etiqueta_path === 'demo/etiqueta.pdf'
      ? { ...item, etiqueta_path: caminhoEtiquetaDemo(item.id) }
      : item);
    if (legadas.some((item, indice) => item !== itens[indice])) {
      demoDados.salvarSolicitacoes(legadas);
      itens = legadas;
    }
    if (filtros?.empresa && filtros.empresa !== 'Ambas') itens = itens.filter((item) => item.empresa === filtros.empresa);
    if (filtros?.dataInicio) itens = itens.filter((item) => item.data_solicitacao >= filtros.dataInicio!);
    if (filtros?.dataFim) itens = itens.filter((item) => item.data_solicitacao <= filtros.dataFim!);
    if (filtros?.status !== undefined) {
      const status = Array.isArray(filtros.status) ? filtros.status : [filtros.status];
      itens = itens.filter((item) => status.includes(item.status));
    }
    if (filtros?.buscaCliente) {
      itens = itens.filter((item) => pedidoCorrespondeABusca(item, filtros.buscaCliente as string));
    }
    itens.sort((a, b) => b.data_solicitacao.localeCompare(a.data_solicitacao) || b.created_at.localeCompare(a.created_at));
    if (filtros?.limiteConcluidos) {
      const ativos = itens.filter((item) => item.status !== 'concluido');
      const concluidos = itens.filter((item) => item.status === 'concluido').slice(0, filtros.limiteConcluidos);
      return [...ativos, ...concluidos];
    }
    return itens;
  },

  async getMeusSolicitacoes(): Promise<Solicitacao[]> {
    const user = usuarioDemoAtual();
    return demoDados.solicitacoes()
      .filter((item) => !item.inutilizada_em && item.solicitado_por === user.id)
      .sort((a, b) => b.data_solicitacao.localeCompare(a.data_solicitacao) || b.created_at.localeCompare(a.created_at));
  },

  async getSolicitacoesLixeira(): Promise<Solicitacao[]> {
    exigirAdminDemo();
    return demoDados.solicitacoes()
      .filter((item) => !!item.inutilizada_em)
      .sort((a, b) => (b.inutilizada_em ?? '').localeCompare(a.inutilizada_em ?? ''));
  },

  async inutilizarSolicitacao(id: string): Promise<void> {
    exigirAdminDemo();
    const usuario = usuarioDemoAtual();
    const agora = new Date().toISOString();
    const itens = demoDados.solicitacoes();
    const indice = itens.findIndex((item) => item.id === id);
    if (indice < 0) throw new Error('Chamado não encontrado.');
    if (itens[indice].inutilizada_em) return;
    itens[indice] = { ...itens[indice], inutilizada_em: agora, inutilizada_por: usuario.id, inutilizada_por_nome: usuario.nome };
    demoDados.salvarSolicitacoes(itens);
    demoRegistrarHistoricoSolicitacao({ solicitacao_id: id, user_nome: usuario.nome, acao: 'Chamado movido para a Lixeira' });
  },

  async restaurarSolicitacao(id: string): Promise<void> {
    exigirAdminDemo();
    const usuario = usuarioDemoAtual();
    const itens = demoDados.solicitacoes();
    const indice = itens.findIndex((item) => item.id === id && !!item.inutilizada_em);
    if (indice < 0) throw new Error('Chamado não encontrado na Lixeira.');
    itens[indice] = { ...itens[indice], inutilizada_em: null, inutilizada_por: null, inutilizada_por_nome: null };
    demoDados.salvarSolicitacoes(itens);
    demoRegistrarHistoricoSolicitacao({ solicitacao_id: id, user_nome: usuario.nome, acao: 'Chamado restaurado da Lixeira' });
  },

  async getHistoricoCliente(empresa: Solicitacao['empresa'], codigoCliente: number): Promise<Solicitacao[]> {
    return demoDados.solicitacoes()
      .filter((item) => !item.inutilizada_em && item.empresa === empresa && item.codigo_cliente === codigoCliente)
      .sort((a, b) => b.data_solicitacao.localeCompare(a.data_solicitacao) || b.created_at.localeCompare(a.created_at));
  },

  async getSolicitacoesPorCodigoRastreio(codigoRastreio: string, excluirId?: string): Promise<Solicitacao[]> {
    const codigo = codigoRastreio.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return demoDados.solicitacoes()
      .filter((item) => item.id !== excluirId && item.codigo_rastreio?.toUpperCase().replace(/[^A-Z0-9]/g, '') === codigo)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async getFilaAprovacao(): Promise<SolicitacaoAprovacao[]> {
    const user = usuarioDemoAtual();
    return demoDados.solicitacoes()
      .filter((item) => !item.inutilizada_em && statusEfetivo(item) === 'aguardando_aprovacao' && podeAprovarDemo(user, item))
      .map((item) => ({
        ...item,
        aprovacao_status: 'aguardando_aprovacao',
        aprovacao_versao: versaoDoPedido(item),
        proprio_pedido: pedidoDoProprioUsuario(user, item),
        pode_aprovar: !pedidoDoProprioUsuario(user, item) || demoDados.permitirAutoaprovacao(),
        solicitado_por_nome: item.solicitante,
        nc_codigo: item.nc_numero ? `NC-${String(item.nc_numero).padStart(4, '0')}` : null,
        nc_origem: item.nc_id ? 'Erro de separação' : null,
        nc_descricao: item.nc_id ? 'Divergência identificada na conferência do pedido.' : null,
      }));
  },

  async decidirAprovacao(solicitacao: SolicitacaoAprovacao, decisao: 'approve' | 'reject', user: UsuarioAutenticado, justificativa: string, _fallbackOptions?: UpdateSolicitacaoOptions): Promise<SolicitacaoAprovacao> {
    const atualAntesDaDecisao = demoDados.solicitacoes().find((item) => item.id === solicitacao.id);
    if (!atualAntesDaDecisao || !podeAprovarDemo(usuarioDemoAtual(), atualAntesDaDecisao) || !podeAprovarDemo(user, atualAntesDaDecisao)) {
      throw new Error('Você não está habilitado para aprovar esta combinação de empresa e setor. Atualize a fila.');
    }
    if (decisao === 'reject' && !justificativa.trim()) throw new Error('Informe a justificativa da rejeição.');
    if (statusEfetivo(atualAntesDaDecisao) !== 'aguardando_aprovacao') {
      throw new Error('Este pedido mudou ou já foi decidido. Atualize a fila e revise os dados novamente.');
    }
    // Como no banco: autoaprovação só com a configuração habilitada (desligada por padrão); a rejeição não é bloqueada
    if (decisao === 'approve' && pedidoDoProprioUsuario(user, atualAntesDaDecisao) && !demoDados.permitirAutoaprovacao()) {
      throw new Error('Você não pode aprovar uma solicitação registrada ou alterada por você.');
    }
    const aprovacaoStatus = decisao === 'approve' ? 'aprovada' : 'rejeitada';
    const justificativaDecisao = decisao === 'reject' ? justificativa.trim() : null;
    // A decisão fica no registro de aprovações (como solicitacoes_aprovacoes no banco), não no histórico operacional
    const atualizada = atualizar(solicitacao.id, {
      autorizacao: user.nome,
    }, user);
    demoDados.salvarAprovacoes([{
      id: `demo-aprovacao-${crypto.randomUUID()}`,
      solicitacao_id: solicitacao.id,
      versao: versaoDoPedido(atualAntesDaDecisao),
      evento: decisao === 'approve' ? 'aprovada' : 'rejeitada',
      justificativa: justificativaDecisao,
      situacao_anterior: null,
      user_nome: user.nome,
      created_at: new Date().toISOString(),
    }, ...demoDados.aprovacoes()]);
    const decidida: Solicitacao = {
      ...atualizada,
      status: 'pendente', // como no banco; também normaliza pedidos de versões antigas da demonstração
      aprovacao_status: aprovacaoStatus,
      aprovacao_legada: false,
      aprovacao_justificativa: justificativaDecisao,
    };
    demoDados.salvarSolicitacoes(demoDados.solicitacoes().map((item) => item.id === decidida.id ? decidida : item));
    if (decisao === 'approve') {
      const versao = solicitacao.aprovacao_versao ?? 1;
      const atuais = demoDados.notificacoesEmissao();
      const novas: NotificacaoEmissao[] = demoDados.usuarios()
        .filter((destinatario) => destinatario.telas.includes('emitir-etiqueta') && destinatario.empresasAcesso?.includes(decidida.empresa))
        .filter((destinatario) => !atuais.some((aviso) => aviso.solicitacao_id === decidida.id && aviso.destinatario_id === destinatario.id && aviso.aprovacao_versao === versao))
        .map((destinatario) => ({
          id: `demo-notificacao-${decidida.id}-${versao}-${destinatario.id}`,
          solicitacao_id: decidida.id,
          empresa: decidida.empresa,
          created_at: new Date().toISOString(),
          lida_em: null,
          destinatario_id: destinatario.id,
          aprovacao_versao: versao,
        }));
      demoDados.salvarNotificacoesEmissao([...novas, ...atuais]);
    }
    return { ...decidida, aprovacao_versao: versaoDoPedido(atualAntesDaDecisao), pode_aprovar: false };
  },

  async listarComunicacoesReversa(filtros: FiltrosComunicacao = {}): Promise<ComunicacaoReversa[]> {
    exigirAdminComunicacoesDemo();
    return filtrarComunicacoesDemo(demoDados.comunicacoes(), filtros);
  },

  async resumoComunicacoesReversa(): Promise<Record<string, number>> {
    exigirAdminComunicacoesDemo();
    const resumo: Record<string, number> = {};
    demoDados.comunicacoes().forEach((item) => { resumo[item.status] = (resumo[item.status] ?? 0) + 1; });
    return resumo;
  },

  async historicoComunicacaoReversa(comunicacaoId: string): Promise<HistoricoComunicacao> {
    exigirAdminComunicacoesDemo();
    const item = demoDados.comunicacoes().find((candidato) => candidato.id === comunicacaoId);
    if (!item) throw new Error('Comunicação não encontrada.');
    return item.historico;
  },

  async reconciliarComunicacaoReversa(comunicacaoId: string, acao: AcaoReconciliacao, justificativa: string, referencia: string) {
    exigirAdminComunicacoesDemo();
    const itens = demoDados.comunicacoes();
    const atualizada = reconciliarComunicacaoDemo(itens, comunicacaoId, acao, justificativa, referencia, usuarioDemoAtual().nome);
    demoDados.salvarComunicacoes(itens);
    return { id: atualizada.id, status: atualizada.status };
  },

  async relatorioReversa(filtros: FiltrosRelatorio): Promise<RelatorioReversa> {
    return relatorioDemo(demoDados.solicitacoes(), demoDados.emissoes(), filtros);
  },

  async relatorioReversaLinhas(filtros: FiltrosRelatorio): Promise<LinhaRelatorioReversa[]> {
    return linhasRelatorioDemo(demoDados.solicitacoes(), demoDados.emissoes(), filtros);
  },

  async getNotificacoesEmissao(): Promise<ListaNotificacoesEmissao> {
    const user = usuarioDemoAtual();
    if (!user.telas.includes('emitir-etiqueta')) return { notificacoes: [], naoLidas: 0 };
    const todas = demoDados.notificacoesEmissao()
      .filter((aviso) => aviso.destinatario_id === user.id
        && !!user.empresasAcesso?.includes(aviso.empresa))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { notificacoes: todas.slice(0, 50), naoLidas: todas.filter((aviso) => !aviso.lida_em).length };
  },

  async marcarNotificacaoEmissaoLida(id: string): Promise<boolean> {
    const user = usuarioDemoAtual();
    if (!user.telas.includes('emitir-etiqueta')) return false;
    const avisos = demoDados.notificacoesEmissao();
    const aviso = avisos.find((item) => item.id === id && item.destinatario_id === user.id
      && !!user.empresasAcesso?.includes(item.empresa));
    if (!aviso) return false;
    aviso.lida_em ??= new Date().toISOString();
    demoDados.salvarNotificacoesEmissao(avisos);
    return true;
  },

  async updateSolicitacao(id: string, data: UpdateSolicitacaoPayload, user?: UsuarioAutenticado | null, options?: UpdateSolicitacaoOptions): Promise<Solicitacao> {
    return atualizar(id, data, user, options);
  },

  async confirmarRecebimentoMercadoria(id: string, user?: UsuarioAutenticado | null): Promise<Solicitacao> {
    const atual = demoDados.solicitacoes().find((item) => item.id === id);
    if (atual?.status === 'concluido') {
      // Concluído pela entrega informada pelos Correios (no demo: concluído com código de rastreio).
      if (!user || !podeConfirmarRecebimentoMercadoria(user, atual.empresa)) {
        throw new Error('Seu perfil não pode confirmar recebimento para esta empresa.');
      }
      const confirmados = demoDados.recebimentosFisicos();
      if (confirmados.includes(id)) throw new Error('O recebimento físico deste pedido já foi confirmado.');
      if (!atual.codigo_rastreio) {
        throw new Error('Este pedido concluído não tem registro de entrega informada pelos Correios; a confirmação física não está disponível.');
      }
      demoDados.salvarRecebimentosFisicos([...confirmados, id]);
      registrarAcao(id, user, 'Recebimento físico confirmado pela empresa após a entrega informada pelos Correios');
      return atual;
    }
    return atualizar(id, {
      status: 'concluido',
      concluido_em: new Date().toISOString(),
    }, user, {
      expectedStatus: 'em_transito',
      historyAction: 'Recebimento da mercadoria confirmado manualmente',
    });
  },

  async listarRecebimentosFisicosPendentes(): Promise<string[]> {
    const user = usuarioDemoAtual();
    const confirmados = demoDados.recebimentosFisicos();
    return demoDados.solicitacoes()
      .filter((item) => item.status === 'concluido' && !!item.codigo_rastreio && !confirmados.includes(item.id)
        && podeConfirmarRecebimentoMercadoria(user, item.empresa))
      .map((item) => item.id);
  },

  async getSolicitacaoById(id: string): Promise<Solicitacao | null> {
    return demoDados.solicitacoes().find((item) => item.id === id && !item.inutilizada_em) ?? null;
  },

  async listarConfigAprovadoresReversa(): Promise<ConfigAprovadoresReversa> {
    exigirAdminDemo();
    const configuracoes = demoDados.configAprovadores();
    const setores = new Map<string, { empresa: Solicitacao['empresa']; setor: string }>();
    for (const pedido of demoDados.solicitacoes()) {
      setores.set(`${pedido.empresa}\u0000${pedido.setor}`, { empresa: pedido.empresa, setor: pedido.setor });
    }
    for (const item of configuracoes) {
      for (const setor of item.setores) setores.set(`${item.empresa}\u0000${setor}`, { empresa: item.empresa, setor });
    }
    return { setores: [...setores.values()], configuracoes };
  },

  async salvarConfigAprovadoresReversa(empresa: Solicitacao['empresa'], configuracao: ConfigAprovadoresEmpresa): Promise<void> {
    exigirAdminDemo();
    const usuarios = new Map(demoDados.usuarios().map((item) => [item.id, item]));
    const ids = new Set<string>();
    for (const aprovador of configuracao) {
      const usuario = usuarios.get(aprovador.usuario_id);
      if (ids.has(aprovador.usuario_id)) throw new Error('Um usuário só pode aparecer uma vez por empresa.');
      ids.add(aprovador.usuario_id);
      if (!usuario?.telas.includes('aprovar-reversa') || !(usuario.empresasAcesso ?? []).includes(empresa)) {
        throw new Error('O usuário selecionado não possui capacidade de aprovação para esta empresa.');
      }
      if ((aprovador.todos_setores && aprovador.setores.length) || (!aprovador.todos_setores && !aprovador.setores.length)) {
        throw new Error('Selecione todos os setores ou um ou mais setores específicos.');
      }
    }
    const atuais = demoDados.configAprovadores().filter((item) => item.empresa !== empresa);
    const novas: DemoConfigAprovador[] = configuracao.map((item) => ({ ...item, empresa, setores: [...item.setores] }));
    demoDados.salvarConfigAprovadores([...atuais, ...novas]);
  },

  async deleteSolicitacao(id: string): Promise<void> {
    await demoApi.inutilizarSolicitacao(id);
  },

  async getHistorico(solicitacaoId: string): Promise<SolicitacaoHistorico[]> {
    return demoDados.historicoSolicitacoes().filter((item) => item.solicitacao_id === solicitacaoId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async getHistoricoAprovacao(solicitacaoId: string) {
    // Só decisões realmente registradas; para dados antigos sem registro não se inventa auditoria
    return demoDados.aprovacoes()
      .filter((item) => item.solicitacao_id === solicitacaoId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async getHistoricoEmissao(solicitacaoId: string) {
    const eventos = demoDados.eventosEmissao().filter((item) => item.solicitacao_id === solicitacaoId);
    if (eventos.length) return eventos.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const emissao = emissoesDemo().find((item) => item.solicitacao_id === solicitacaoId && !item.substituida_em);
    if (!emissao) return [];
    return [{
      id: `demo-emissao-evento-legado-${emissao.id}`,
      solicitacao_id: solicitacaoId,
      created_at: emissao.pdf_anexado_em ?? demoDados.solicitacoes().find((item) => item.id === solicitacaoId)?.created_at ?? new Date().toISOString(),
      user_nome: 'Dados anteriores',
      tipo: emissao.pdf_path ? 'pdf_anexado' : 'registrada',
      descricao: emissao.pdf_path ? `Etiqueta de demonstração anexada: ${emissao.pdf_nome ?? 'etiqueta.pdf'}` : 'Emissão de demonstração registrada.',
    }];
  },

  async getEmissaoAtual(solicitacaoId: string) {
    return emissoesDemo().find((item) => item.solicitacao_id === solicitacaoId && !item.substituida_em) ?? null;
  },

  async atualizarDadosEmissao(
    emissao: ReversaEmissaoResumo,
    dados: { codigoAutorizacao: string | null; codigoRastreio: string | null; emitidaEm?: string | null; validaAte?: string | null },
  ) {
    const user = usuarioDemoAtual();
    const pedido = demoDados.solicitacoes().find((item) => item.id === emissao.solicitacao_id);
    if (!pedido || (pedido.aprovacao_status !== 'aprovada' && !pedido.aprovacao_legada)) {
      throw new Error('Emissões só podem ser atualizadas após a aprovação da reversa.');
    }
    if (!user.telas.includes('emitir-etiqueta') || !user.empresasAcesso?.includes(pedido.empresa)) {
      throw new Error('Sem permissão para atualizar os códigos desta emissão.');
    }
    const emissoes = emissoesDemo();
    const atual = emissoes.find((item) => item.id === emissao.id && item.solicitacao_id === emissao.solicitacao_id);
    if (!atual) throw new Error('Emissão de demonstração não encontrada.');
    const autorizacao = dados.codigoAutorizacao?.trim().replace(/\s+/g, '').toUpperCase() || null;
    const rastreio = dados.codigoRastreio?.toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
    if (rastreio && !/^[A-Z]{2}\d{9}BR$/.test(rastreio)) throw new Error('Confira o código de rastreamento. O formato esperado é AA123456789BR.');
    const emitidaEm = dados.emitidaEm === undefined ? atual.emitida_em : dados.emitidaEm;
    const validaAte = dados.validaAte === undefined ? atual.valida_ate : dados.validaAte;
    const erroDatas = validarDatasEmissao(emitidaEm, validaAte);
    if (erroDatas) throw new Error(erroDatas);
    if (autorizacao === atual.codigo_autorizacao && rastreio === atual.codigo_rastreio
      && emitidaEm === atual.emitida_em && validaAte === atual.valida_ate) return atual;
    // Como no banco: depois que o rastreio mostra postagem, o código da emissão não muda nem é removido
    if (atual.codigo_rastreio && rastreio !== atual.codigo_rastreio && ['postado', 'em_transito', 'concluido'].includes(pedido.status)) {
      throw new Error(`O rastreio do objeto ${atual.codigo_rastreio} já mostra postagem: o código da emissão #${atual.sequencia} não pode ser alterado nem removido.`);
    }
    atual.codigo_autorizacao = autorizacao;
    atual.codigo_rastreio = rastreio;
    atual.emitida_em = emitidaEm ?? null;
    atual.valida_ate = validaAte ?? null;
    demoDados.salvarEmissoes(emissoes);
    eventoEmissaoDemo(atual, 'dados_atualizados', 'Códigos e datas da emissão de demonstração atualizados.', user);
    atualizar(pedido.id, { codigo_rastreio: rastreio }, user);
    return atual;
  },

  async getRastreio(codigoRastreio: string): Promise<RastreamentoCorreios | null> {
    const pedido = demoDados.solicitacoes().find((item) => item.codigo_rastreio === codigoRastreio);
    if (!pedido) return null;
    return {
      codigo_rastreio: codigoRastreio,
      solicitacao_id: pedido.id,
      ultimo_evento_codigo: 'BDE',
      ultimo_evento_descricao: 'Objeto em trânsito para unidade de distribuição',
      unidade_cidade: (pedido.ultima_cidade_rastreio ?? 'São Paulo/SP').split('/')[0],
      unidade_uf: (pedido.ultima_cidade_rastreio ?? 'São Paulo/SP').split('/')[1] ?? 'SP',
      eventos: [{ descricao: 'Objeto postado', data: pedido.postado_em }, { descricao: 'Objeto em trânsito', data: pedido.em_transito_em }],
      ultimo_check_em: new Date().toISOString(),
      created_at: pedido.created_at,
    };
  },

  async salvarCodigoRastreio(id: string, codigoRastreio: string, _user?: UsuarioAutenticado | null): Promise<Solicitacao> {
    const codigo = codigoRastreio.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (codigo && demoDados.solicitacoes().some((item) => item.id !== id && item.codigo_rastreio === codigo)) throw new Error('Este código de rastreio já está vinculado a outra solicitação.');
    const emissao = emissoesDemo().find((item) => item.solicitacao_id === id && !item.substituida_em);
    if (!emissao) throw new Error('Este pedido ainda não tem etiqueta emitida. Registre a etiqueta antes de informar o código de rastreamento.');
    // mesma validação, permissão e bloqueio da emissão (como atualizar_dados_emissao no banco)
    await demoApi.atualizarDadosEmissao(emissao, { codigoAutorizacao: emissao.codigo_autorizacao, codigoRastreio: codigo || null, emitidaEm: emissao.emitida_em, validaAte: emissao.valida_ate });
    return demoDados.solicitacoes().find((item) => item.id === id)!;
  },

  async removerCodigoRastreio(id: string, _user?: UsuarioAutenticado | null): Promise<Solicitacao> {
    const emissao = emissoesDemo().find((item) => item.solicitacao_id === id && !item.substituida_em);
    if (!emissao) throw new Error('Este pedido não tem emissão com código de rastreamento para remover.');
    if (emissao.codigo_rastreio) {
      await demoApi.atualizarDadosEmissao(emissao, { codigoAutorizacao: emissao.codigo_autorizacao, codigoRastreio: null, emitidaEm: emissao.emitida_em, validaAte: emissao.valida_ate });
    }
    return demoDados.solicitacoes().find((item) => item.id === id)!;
  },

  async atualizarRastreio(codigoRastreio: string): Promise<{ sucesso: true; modo: string }> {
    return { sucesso: true, modo: `Demonstração local · ${codigoRastreio}` };
  },

  async atualizarRastreioLote(): Promise<{ sucesso: true; modo: string }> {
    return { sucesso: true, modo: 'Demonstração local' };
  },

  async getReversasDaNc(ncId: string): Promise<Solicitacao[]> {
    return demoDados.solicitacoes().filter((item) => !item.inutilizada_em && item.nc_id === ncId);
  },

  async registrarEtiqueta(solicitacao: Solicitacao, arquivo: File, dados: DadosEmissaoEtiqueta): Promise<Solicitacao> {
    if (arquivo.type !== 'application/pdf') throw new Error('A etiqueta precisa ser um arquivo PDF.');
    if (arquivo.size > 5 * 1024 * 1024) throw new Error('O PDF da etiqueta deve ter no máximo 5 MB.');
    const user = usuarioDemoAtual();
    if (!user.telas.includes('emitir-etiqueta') || !user.empresasAcesso?.includes(solicitacao.empresa)) {
      throw new Error('Sem permissão para emitir etiquetas nesta empresa.');
    }
    const pedidoAtual = demoDados.solicitacoes().find((item) => item.id === solicitacao.id);
    if (!pedidoAtual) throw new Error('Solicitação de demonstração não encontrada.');
    if (pedidoAtual.aprovacao_status !== 'aprovada' && !pedidoAtual.aprovacao_legada) {
      throw new Error('Emissões só podem ser registradas após a aprovação da reversa.');
    }
    const codigoAutorizacao = dados.codigoAutorizacao?.trim().replace(/\s+/g, '').toUpperCase() || null;
    const codigoRastreio = dados.codigoRastreio?.toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
    if (codigoRastreio && !/^[A-Z]{2}\d{9}BR$/.test(codigoRastreio)) throw new Error('Confira o código de rastreamento. O formato esperado é AA123456789BR.');
    let emitidaEm = dados.emitidaEm ?? null;
    let validaAte = dados.validaAte ?? null;

    const emissaoExistente = emissoesDemo().find((item) => item.id === dados.emissaoId);
    if (emissaoExistente) {
      if (emissaoExistente.solicitacao_id !== solicitacao.id) throw new Error('Identificador de emissão já usado por outro pedido.');
      if (emissaoExistente.pdf_path) return pedidoAtual;
    }

    const emissoes = emissoesDemo();
    let atual = emissoes.find((item) => item.solicitacao_id === solicitacao.id && !item.substituida_em);
    if (emissaoExistente && (!atual || atual.id !== emissaoExistente.id || atual.pdf_path)) {
      throw new Error('Esta emissão incompleta não é mais a emissão vigente. Atualize o pedido antes de tentar novamente.');
    }
    if (atual && !atual.pdf_path) {
      if (dados.emitidaEm === undefined) emitidaEm = atual.emitida_em;
      if (dados.validaAte === undefined) validaAte = atual.valida_ate;
    }
    const erroDatas = validarDatasEmissao(emitidaEm, validaAte);
    if (erroDatas) throw new Error(erroDatas);
    if (atual?.pdf_path && (!dados.motivoReemissao || (dados.motivoReemissao === 'outro' && !dados.motivoDetalhe?.trim()))) {
      throw new Error(dados.motivoReemissao === 'outro' ? 'Descreva o motivo da reemissão.' : 'Selecione o motivo antes de registrar uma reemissão.');
    }

    const agora = new Date().toISOString();
    const prefixo = `demo/${solicitacao.id}/`;
    const caminho = `${prefixo}${dados.emissaoId}-${crypto.randomUUID()}.pdf`;
    // Primeiro os bytes: se não couberem, nada é registrado e o operador vê o erro
    await guardarArquivoDemo(caminho, arquivo);

    if (atual?.pdf_path) {
      atual.substituida_em = agora;
      (atual as DemoEmissao & { substituida_por_id?: string | null }).substituida_por_id = dados.emissaoId;
      eventoEmissaoDemo(atual, 'substituida', `Emissão #${atual.sequencia} substituída no sistema pela próxima emissão (não cancelada nos Correios).`, user);
    }

    let emissaoNova: DemoEmissao;
    if (atual && !atual.pdf_path) {
      const mudancas = codigoAutorizacao !== atual.codigo_autorizacao || codigoRastreio !== atual.codigo_rastreio
        || emitidaEm !== atual.emitida_em || validaAte !== atual.valida_ate;
      atual.codigo_autorizacao = codigoAutorizacao;
      atual.codigo_rastreio = codigoRastreio;
      atual.emitida_em = emitidaEm;
      atual.valida_ate = validaAte;
      atual.pdf_path = caminho;
      atual.pdf_nome = arquivo.name;
      atual.pdf_anexado_em = agora;
      emissaoNova = atual;
      if (mudancas) eventoEmissaoDemo(atual, 'dados_atualizados', 'Códigos e datas da emissão de demonstração conferidos.', user);
    } else {
      emissaoNova = {
        id: dados.emissaoId,
        solicitacao_id: solicitacao.id,
        sequencia: (atual?.sequencia ?? 0) + 1,
        codigo_autorizacao: codigoAutorizacao,
        codigo_rastreio: codigoRastreio,
        pdf_path: caminho,
        pdf_nome: arquivo.name,
        emitida_em: emitidaEm,
        valida_ate: validaAte,
        substituida_em: null,
        origem: 'sistema',
        registrado_por: user.id,
        registrado_por_nome: user.nome,
        emissao_anterior_id: atual?.id ?? null,
        motivo_reemissao: atual ? dados.motivoReemissao ?? null : null,
        motivo_reemissao_detalhe: atual ? dados.motivoDetalhe?.trim() ?? null : null,
        pdf_anexado_em: agora,
      };
      emissoes.push(emissaoNova);
      eventoEmissaoDemo(emissaoNova, 'registrada', `Emissão #${emissaoNova.sequencia} registrada${atual ? ' como reemissão' : ''}.`, user);
    }
    demoDados.salvarEmissoes(emissoes);
    eventoEmissaoDemo(emissaoNova, 'pdf_anexado', `PDF anexado à emissão #${emissaoNova.sequencia}: ${arquivo.name}`, user);

    const atualizada = atualizar(solicitacao.id, {
      etiqueta_path: caminho,
      etiqueta_nome: arquivo.name,
      etiqueta_enviada_em: agora,
      codigo_rastreio: codigoRastreio,
      ...(solicitacao.status === 'pendente' ? { status: 'etiqueta_gerada' as const, etiqueta_gerada_em: agora } : {}),
    }, user, solicitacao.status === 'pendente' ? { historyAction: `Moveu para ${STATUS_LABEL.etiqueta_gerada}` } : undefined);
    return atualizada;
  },

  async urlEtiqueta(path: string): Promise<string> {
    // Só o exemplo fictício dos dados de demonstração (…/etiqueta.pdf) é gerado; PDF anexado vem dos bytes guardados
    if (/^demo\/(?:[^/]+\/)?etiqueta\.pdf$/.test(path)) {
      const id = path.split('/')[1];
      return etiquetaPdfDemo(id && id !== 'etiqueta.pdf' ? codigoRastreioDemo(id) : 'AA000000007BR');
    }
    const arquivo = await lerArquivoDemo(path);
    if (!arquivo) throw new Error('Este PDF não está mais disponível neste navegador (a demonstração foi reiniciada ou os dados do navegador foram limpos).');
    return URL.createObjectURL(arquivo);
  },

};

