import type {
  ListasNc,
  NaoConformidade,
  NcHistorico,
  Solicitacao,
  SolicitacaoHistorico,
} from '../types';

const dia = 24 * 60 * 60 * 1000;
const dataRelativa = (diasAtras: number) => new Date(Date.now() - diasAtras * dia).toISOString();
const diaRelativo = (diasAtras: number) => dataRelativa(diasAtras).slice(0, 10);

const base = {
  setor: 'Comercial Alinare',
  codigo_cliente: 51001,
  nome_cliente: 'Ateliê Aurora',
  endereco_postagem: 'Rua das Flores, 120 · Campinas/SP · 13010-100',
  motivo: 'Peça com defeito',
  justificativa_outros: null,
  tempo_preenchimento_segundos: 68,
};

/** Identificadores UUID das NCs de exemplo (a validação real do formulário exige UUID). */
export const ID_NC_DEMO: Record<number, string> = {
  2401: '0b2f9a61-2401-4a01-8a01-000000002401',
  2402: '0b2f9a61-2402-4a02-8a02-000000002402',
  2403: '0b2f9a61-2403-4a03-8a03-000000002403',
};

function solicitacao(
  id: string,
  empresa: Solicitacao['empresa'],
  status: Solicitacao['status'],
  diasAtras: number,
  extras: Partial<Solicitacao> = {},
): Solicitacao {
  const codigo = 51000 + Number(id.slice(-2));
  const data = dataRelativa(diasAtras);
  return {
    id: `demo-0000-0000-0000-${id.padStart(12, '0')}`,
    created_at: data,
    empresa,
    ...base,
    codigo_cliente: codigo,
    nome_cliente: empresa === 'Alinare' ? `Cliente Alinare ${id.slice(-2)}` : `Cliente Novitah ${id.slice(-2)}`,
    setor: empresa === 'Alinare' ? 'Comercial Alinare' : 'Comercial Novitah',
    solicitante: empresa === 'Alinare' ? 'Camila Oliveira' : 'Rafael Mendes',
    data_solicitacao: diaRelativo(diasAtras),
    autorizacao: extras.aprovacao_status === 'aguardando_aprovacao' ? null : 'Paula Mendes',
    status,
    tempo_preenchimento_segundos: 68,
    ...extras,
  };
}

export const SOLICITACOES_DEMO: Solicitacao[] = [
  solicitacao('01', 'Alinare', 'pendente', 0, { nome_cliente: 'Ateliê Aurora', nc_id: ID_NC_DEMO[2401], nc_numero: 2401, solicitado_por: 'demo-solicitante-alinare', solicitado_por_nome: 'Camila Oliveira', aprovacao_status: 'aguardando_aprovacao', aprovacao_legada: false }),
  solicitacao('02', 'Novitah', 'pendente', 1, { nome_cliente: 'Boutique Horizonte', nc_id: ID_NC_DEMO[2402], nc_numero: 2402, motivo: 'Mercadoria Errada', solicitado_por: 'demo-solicitante-novitah', solicitado_por_nome: 'Rafael Mendes', aprovacao_status: 'aguardando_aprovacao', aprovacao_legada: false }),
  solicitacao('03', 'Alinare', 'pendente', 2, { nome_cliente: 'Casa Amora', nc_id: ID_NC_DEMO[2403], nc_numero: 2403, motivo: 'Erro expedição – endereço incorreto', aprovacao_status: 'aguardando_aprovacao', aprovacao_legada: false }),
  solicitacao('04', 'Novitah', 'pendente', 3, { nome_cliente: 'Loja Violeta', autorizacao: 'Paula Mendes', anotacoes: 'Endereço informado não corresponde ao cadastro.', solicitado_por: 'demo-solicitante-novitah', solicitado_por_nome: 'Rafael Mendes', aprovacao_status: 'rejeitada', aprovacao_legada: false, aprovacao_justificativa: 'Endereço informado não corresponde ao cadastro.' }),
  solicitacao('05', 'Alinare', 'pendente', 2, { nome_cliente: 'Estilo Urbano', solicitado_por: 'demo-solicitante-alinare', solicitado_por_nome: 'Camila Oliveira', aprovacao_status: 'aprovada', aprovacao_legada: false }),
  solicitacao('06', 'Novitah', 'pendente', 4, { nome_cliente: 'Mundo da Moda', solicitado_por: 'demo-solicitante-novitah', solicitado_por_nome: 'Rafael Mendes', aprovacao_status: 'aprovada', aprovacao_legada: false }),
  solicitacao('07', 'Alinare', 'etiqueta_gerada', 5, { nome_cliente: 'Flora Boutique', etiqueta_path: 'demo/demo-0000-0000-0000-000000000007/etiqueta.pdf', etiqueta_nome: 'etiqueta-demo.pdf', etiqueta_gerada_em: dataRelativa(4), etiqueta_enviada_em: dataRelativa(4), codigo_rastreio: 'AB123456789BR', solicitado_por: 'demo-solicitante-alinare', solicitado_por_nome: 'Camila Oliveira', aprovacao_status: 'aprovada', aprovacao_legada: false }),
  solicitacao('08', 'Novitah', 'postado', 6, { nome_cliente: 'Atacado Central', codigo_rastreio: 'AA123456789BR', postado_em: dataRelativa(5), aprovacao_legada: true }),
  solicitacao('09', 'Alinare', 'em_transito', 8, { nome_cliente: 'Vitrine Bela', codigo_rastreio: 'NX987654321BR', postado_em: dataRelativa(7), em_transito_em: dataRelativa(6), ultima_cidade_rastreio: 'São Paulo/SP', aprovacao_legada: true }),
  solicitacao('10', 'Novitah', 'em_transito', 9, { nome_cliente: 'Luz & Linha', codigo_rastreio: 'QW456789123BR', postado_em: dataRelativa(8), em_transito_em: dataRelativa(7), ultima_cidade_rastreio: 'Jundiaí/SP', aprovacao_legada: true }),
  solicitacao('11', 'Alinare', 'concluido', 16, { nome_cliente: 'Flor de Lis', codigo_rastreio: 'AB987123456BR', postado_em: dataRelativa(14), em_transito_em: dataRelativa(13), concluido_em: dataRelativa(11), ultima_cidade_rastreio: 'Campinas/SP', solicitado_por: 'demo-solicitante-alinare', solicitado_por_nome: 'Camila Oliveira', aprovacao_status: 'aprovada', aprovacao_legada: false }),
  solicitacao('12', 'Novitah', 'concluido', 20, { nome_cliente: 'Ponto Chic', motivo: 'Embalagem inadequada / avaria por embalagem', codigo_rastreio: 'CD765432109BR', postado_em: dataRelativa(18), em_transito_em: dataRelativa(17), concluido_em: dataRelativa(15), ultima_cidade_rastreio: 'Sorocaba/SP', solicitado_por: 'demo-solicitante-novitah', solicitado_por_nome: 'Rafael Mendes', aprovacao_status: 'aprovada', aprovacao_legada: false }),
];

export const HISTORICO_SOLICITACOES_DEMO: SolicitacaoHistorico[] = SOLICITACOES_DEMO.slice(0, 4).map((item, index) => ({
  id: `demo-hist-${index + 1}`,
  solicitacao_id: item.id,
  user_nome: index === 0 ? 'Camila Oliveira' : 'Paula Mendes',
  acao: index === 0 ? 'Solicitação enviada para aprovação' : 'Solicitação atualizada para demonstração',
  created_at: item.created_at,
}));

function nc(numero: number, status: NaoConformidade['status'], extras: Partial<NaoConformidade> = {}): NaoConformidade {
  const id = ID_NC_DEMO[numero] ?? crypto.randomUUID();
  const data = dataRelativa(numero === 2403 ? 14 : numero === 2402 ? 8 : 3);
  return {
    id, numero, codigo: `NC-${String(numero).padStart(4, '0')}`,
    created_at: data, updated_at: data, importada: false,
    data_ocorrencia: diaRelativo(numero === 2403 ? 14 : numero === 2402 ? 8 : 3),
    data_identificacao: diaRelativo(numero === 2403 ? 13 : numero === 2402 ? 7 : 2),
    empresa: numero === 2402 ? 'Novitah' : 'Alinare',
    cliente: ['Ateliê Aurora', 'Boutique Horizonte', 'Casa Amora'][numero - 2401] ?? 'Cliente de demonstração',
    vendedora: numero === 2402 ? 'Rafael Mendes' : 'Camila Oliveira',
    romaneio: `ROM-${numero}`, valor_romaneio: 1840 + numero,
    nf: `NF-${numero}`, rastreio: null, data_postagem: null,
    tipo_saida: 'Venda', origem: 'Erro de separação', como_identificada: 'Contato do cliente',
    status_correios: null, descricao: 'Conferência identificou divergência no pedido enviado.',
    resolucao: status === 'Encerrada' ? 'Reversa concluída e cliente atendido.' : null,
    novo_rastreio: null, valor_declarado: 1800, valor_venda: 1840,
    frete_original: 32, custo_produto: 410, custo_frete_adicional: 28,
    custo_multa_outros: 0, reembolso_correios: 'Não', numero_pi: null,
    valor_reembolsado: 0, tempo_tratativa_min: status === 'Encerrada' ? 90 : 35,
    status, data_encerramento: status === 'Encerrada' ? diaRelativo(1) : null,
    custo_total: 470, custo_liquido: 470, area_responsavel: 'Expedição',
    evitavel: 'Sim', dias_em_aberto: status === 'Encerrada' ? 0 : (numero === 2402 ? 8 : 3),
    qtd_reversas: numero === 2401 || numero === 2402 ? 1 : 0,
    ...extras,
  };
}

export const NCS_DEMO: NaoConformidade[] = [nc(2403, 'Aberta'), nc(2402, 'Em tratativa'), nc(2401, 'Encerrada')];

export const HISTORICO_NCS_DEMO: NcHistorico[] = NCS_DEMO.flatMap((item) => ([
  { id: `${item.id}-evento`, nc_id: item.id, created_at: item.created_at, user_nome: 'Júlia Nascimento', tipo: 'evento' as const, acao: 'Não conformidade registrada.' },
]));

export const LISTAS_NC_DEMO: ListasNc = {
  origens: [
    { nome: 'Erro de separação', area: 'Expedição', evitavel: 'Sim', ordem: 1, ativo: true },
    { nome: 'Avaria no transporte', area: 'Logística', evitavel: 'A avaliar', ordem: 2, ativo: true },
    { nome: 'Falha de cadastro', area: 'Comercial', evitavel: 'Sim', ordem: 3, ativo: true },
  ],
  itens: [
    { lista: 'tipo_saida', valor: 'Venda', ordem: 1, ativo: true },
    { lista: 'tipo_saida', valor: 'Transferência', ordem: 2, ativo: true },
    { lista: 'resolucao', valor: 'Reversa concluída', ordem: 1, ativo: true },
    { lista: 'empresa', valor: 'Alinare', ordem: 1, ativo: true },
    { lista: 'empresa', valor: 'Novitah', ordem: 2, ativo: true },
    { lista: 'como_identificada', valor: 'Contato do cliente', ordem: 1, ativo: true },
    { lista: 'reembolso', valor: 'Sim', ordem: 1, ativo: true },
    { lista: 'reembolso', valor: 'Não', ordem: 2, ativo: true },
  ],
};

