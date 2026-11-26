import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, FileText, History, MapPin, RefreshCw, Search, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import '../styles/approval.css';
import PageHeading from '../components/ui/PageHeading';
import EtiquetaReversa from '../components/admin/EtiquetaReversa';
import { useSolicitacoes } from '../hooks/useSolicitacoes';
import apiService from '../services/apiService';
import { useAuth } from '../context/AuthContext';
import { useEmpresaDaTela } from '../context/TemaContext';
import { navItemsDoUsuario, podeEmitirEtiqueta } from '../lib/perfil';
import { codigoPedido } from '../lib/pedido';
import { STATUS_LABEL } from '../types';
import { statusEfetivo } from '../lib/situacaoPedido';
import type { Empresa, ReversaEmissaoEvento, ReversaEmissaoResumo, Solicitacao, SolicitacaoAprovacaoHistorico, SolicitacaoHistorico, UsuarioAutenticado } from '../types';

type HistoricoEmissao = { id: string; createdAt: string; descricao: string; responsavel?: string | null };
type EstadoConsultaEmissao =
  | { estado: 'carregando' }
  | { estado: 'erro'; mensagem: string }
  | { estado: 'consultada'; emissao: ReversaEmissaoResumo | null };

const EMPRESAS: Empresa[] = ['Alinare', 'Novitah'];

const identificacaoPedido = codigoPedido;

function dataPedido(solicitacao: Solicitacao): Date {
  const data = solicitacao.data_solicitacao
    ? new Date(`${solicitacao.data_solicitacao}T12:00:00`)
    : new Date(solicitacao.created_at);
  return Number.isFinite(data.getTime()) ? data : new Date(0);
}

function formatarData(valor: string | Date): string {
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isFinite(data.getTime())
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(data).replace('.', '')
    : 'Data não informada';
}

function aprovadaParaEmissao(item: Solicitacao): boolean {
  return item.aprovacao_status === 'aprovada' || item.aprovacao_legada === true;
}

function textoBusca(item: Solicitacao): string {
  return [identificacaoPedido(item.id), item.id, item.nome_cliente, item.codigo_cliente]
    .join(' ')
    .toLocaleLowerCase('pt-BR');
}

function juntarHistoricos(
  operacional: SolicitacaoHistorico[],
  aprovacao: SolicitacaoAprovacaoHistorico[],
  emissao: ReversaEmissaoEvento[],
): HistoricoEmissao[] {
  return [
    ...operacional.map((evento) => ({ id: `operacional-${evento.id}`, createdAt: evento.created_at, descricao: evento.acao, responsavel: evento.user_nome })),
    ...aprovacao.map((evento) => ({
      id: `aprovacao-${evento.id}`,
      createdAt: evento.created_at,
      descricao: evento.evento === 'aprovada' ? 'Solicitação aprovada' : evento.evento === 'rejeitada' ? `Solicitação rejeitada${evento.justificativa ? `: ${evento.justificativa}` : ''}` : evento.evento === 'invalidada' ? 'Aprovação invalidada' : 'Solicitação alterada para nova análise',
      responsavel: evento.user_nome,
    })),
    ...emissao.map((evento) => ({ id: `emissao-${evento.id}`, createdAt: evento.created_at, descricao: evento.descricao || evento.tipo, responsavel: evento.user_nome })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function CampoEmissao({ label, value, children }: { label: string; value?: string | number | null; children?: ReactNode }) {
  return <div className="approval-detail-field"><dt>{label}</dt><dd>{value || 'Não informado'}{children}</dd></div>;
}

function FilaEmissao({
  dados,
  loading,
  refreshing,
  error,
  refetch,
  user,
  ultimoFetch,
}: {
  dados: Solicitacao[];
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  user: UsuarioAutenticado | null;
  ultimoFetch: number;
}) {
  const empresasAutorizadas = useMemo(() => EMPRESAS.filter((empresa) => !!user && podeEmitirEtiqueta(user, empresa)), [user]);
  const [empresa, setEmpresa] = useState<Empresa | 'Ambas'>(() => empresasAutorizadas.length === 1 ? empresasAutorizadas[0] : 'Ambas');
  // Só o tema visual acompanha a empresa exibida no filtro
  useEmpresaDaTela(empresa);
  const [busca, setBusca] = useState('');
  const [expandida, setExpandida] = useState<string | null>(null);
  const [historico, setHistorico] = useState<HistoricoEmissao[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [erroHistorico, setErroHistorico] = useState('');
  const [tentativaHistorico, setTentativaHistorico] = useState(0);
  const [ocultosAposSucesso, setOcultosAposSucesso] = useState<Set<string>>(() => new Set());
  const [emissaoConfirmada, setEmissaoConfirmada] = useState<Solicitacao | null>(null);
  const [abrindoAcompanhamento, setAbrindoAcompanhamento] = useState(false);
  const [consultasEmissao, setConsultasEmissao] = useState<Record<string, EstadoConsultaEmissao>>({});
  const [pedidoForaFila, setPedidoForaFila] = useState<Solicitacao | null>(null);
  const [pedidoForaFilaId, setPedidoForaFilaId] = useState<string | null>(null);
  const [consultandoPedidoForaFila, setConsultandoPedidoForaFila] = useState(false);
  const [searchParams] = useSearchParams();
  const pedidoNotificadoId = searchParams.get('pedido');
  const pedidoConsultadoRef = useRef<string | null>(null);

  const candidatasConsulta = useMemo(() => dados.filter((item) =>
    (item.status === 'pendente' || item.status === 'etiqueta_gerada')
    && aprovadaParaEmissao(item)
    && !!user
    && podeEmitirEtiqueta(user, item.empresa)), [dados, user]);

  const consultarEmissao = useCallback(async (solicitacaoId: string) => {
    setConsultasEmissao((atuais) => ({ ...atuais, [solicitacaoId]: { estado: 'carregando' } }));
    try {
      const emissao = await apiService.getEmissaoAtual(solicitacaoId);
      setConsultasEmissao((atuais) => ({ ...atuais, [solicitacaoId]: { estado: 'consultada', emissao } }));
    } catch (erro) {
      setConsultasEmissao((atuais) => ({
        ...atuais,
        [solicitacaoId]: {
          estado: 'erro',
          mensagem: erro instanceof Error ? erro.message : 'Não foi possível consultar a emissão vigente.',
        },
      }));
    }
  }, []);

  useEffect(() => {
    if (!ultimoFetch || candidatasConsulta.length === 0) return;
    let ativa = true;
    const ids = candidatasConsulta.map((item) => item.id);
    // Só marca "carregando" o que nunca foi consultado. Reconsultar a cada atualização da fila
    // trocaria o formulário de anexo por um aviso e apagaria o PDF que a pessoa está escolhendo.
    setConsultasEmissao((atuais) => ({
      ...Object.fromEntries(ids.filter((id) => !atuais[id]).map((id) => [id, { estado: 'carregando' as const }])),
      ...atuais,
    }));
    void Promise.all(ids.map(async (id) => {
      try {
        return [id, { estado: 'consultada', emissao: await apiService.getEmissaoAtual(id) } as EstadoConsultaEmissao] as const;
      } catch (erro) {
        return [id, {
          estado: 'erro',
          mensagem: erro instanceof Error ? erro.message : 'Não foi possível consultar a emissão vigente.',
        } as EstadoConsultaEmissao] as const;
      }
    })).then((resultados) => {
      if (!ativa) return;
      setConsultasEmissao((atuais) => ({
        ...atuais,
        // uma falha passageira da atualização não derruba uma consulta que já deu certo
        ...Object.fromEntries(resultados.filter(([id, novo]) => !(novo.estado === 'erro' && atuais[id]?.estado === 'consultada'))),
      }));
    });
    return () => { ativa = false; };
  }, [candidatasConsulta, ultimoFetch]);

  const elegiveis = useMemo(() => candidatasConsulta
    .filter((item) => {
      if (ocultosAposSucesso.has(item.id)) return false;
      const consulta = consultasEmissao[item.id];
      if (!consulta || consulta.estado === 'carregando' || consulta.estado === 'erro') return true;
      if (consulta.emissao?.pdf_path) return false;
      return item.status === 'pendente' || !!consulta.emissao;
    })
    .sort((a, b) => dataPedido(a).getTime() - dataPedido(b).getTime() || a.created_at.localeCompare(b.created_at)),
  [candidatasConsulta, consultasEmissao, ocultosAposSucesso]);

  const filtradas = useMemo(() => elegiveis.filter((item) =>
    (empresa === 'Ambas' || item.empresa === empresa)
    && textoBusca(item).includes(busca.trim().toLocaleLowerCase('pt-BR'))), [busca, elegiveis, empresa]);

  const elegiveisRef = useRef(elegiveis);
  elegiveisRef.current = elegiveis;
  useEffect(() => {
    if (!pedidoNotificadoId || !ultimoFetch) return;
    if (elegiveisRef.current.some((item) => item.id === pedidoNotificadoId)) {
      pedidoConsultadoRef.current = pedidoNotificadoId;
      setExpandida(pedidoNotificadoId);
      setPedidoForaFila(null);
      setPedidoForaFilaId(null);
      setConsultandoPedidoForaFila(false);
      return;
    }
    if (pedidoConsultadoRef.current === pedidoNotificadoId) return;
    pedidoConsultadoRef.current = pedidoNotificadoId;
    setPedidoForaFila(null);
    setPedidoForaFilaId(pedidoNotificadoId);
    setConsultandoPedidoForaFila(true);
    void apiService.getSolicitacaoById(pedidoNotificadoId)
      .then((pedido) => setPedidoForaFila(pedido))
      .catch(() => setPedidoForaFila(null))
      .finally(() => setConsultandoPedidoForaFila(false));
  }, [pedidoNotificadoId, ultimoFetch]);

  useEffect(() => {
    if (!expandida) {
      setHistorico([]);
      setErroHistorico('');
      setCarregandoHistorico(false);
      return;
    }
    let ativa = true;
    setCarregandoHistorico(true);
    setHistorico([]);
    setErroHistorico('');
    void Promise.all([
      apiService.getHistorico(expandida),
      apiService.getHistoricoAprovacao(expandida),
      apiService.getHistoricoEmissao(expandida),
    ]).then(([operacional, aprovacao, emissao]) => {
      if (ativa) setHistorico(juntarHistoricos(operacional, aprovacao, emissao));
    }).catch((erro) => {
      if (ativa) setErroHistorico(erro instanceof Error ? erro.message : 'Não foi possível carregar o histórico.');
    }).finally(() => { if (ativa) setCarregandoHistorico(false); });
    return () => { ativa = false; };
  }, [expandida, tentativaHistorico]);

  const copiar = async (rotulo: string, valor: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      toast.success(`${rotulo} copiado.`);
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto manualmente.');
    }
  };

  const confirmarRegistro = (atualizada: Solicitacao, emissaoRegistrada?: boolean) => {
    if (!emissaoRegistrada || !atualizada.etiqueta_path) return;
    setOcultosAposSucesso((atuais) => new Set(atuais).add(atualizada.id));
    setEmissaoConfirmada(atualizada);
    setExpandida(null);
    setAbrindoAcompanhamento(false);
    // o aviso "Etiqueta anexada." já é dado pelo formulário de anexo
    void refetch();
  };

  const companySelect = (
    <label>
      Empresa
      <select className="approval-filter-select" value={empresa} onChange={(event) => setEmpresa(event.target.value as Empresa | 'Ambas')} aria-label="Filtrar por empresa">
        {empresasAutorizadas.length > 1 && <option value="Ambas">Todas</option>}
        {empresasAutorizadas.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  );

  return (
    <div className="approval-page">
      <PageHeading
        icon={Tag}
        title="Aguardando etiqueta"
        action={<button type="button" onClick={() => void refetch()} disabled={refreshing} className="btn btn-secondary"><RefreshCw size={15} className={refreshing ? 'approval-refreshing' : ''} /> Atualizar</button>}
      />

      {emissaoConfirmada && (
        <section className="approval-alert is-warning" role="status" aria-label="Etiqueta anexada">
          <CheckCircle2 size={19} aria-hidden="true" />
          <span><strong>{identificacaoPedido(emissaoConfirmada.id)}:</strong> etiqueta anexada.</span>
          <button type="button" onClick={() => setAbrindoAcompanhamento((atual) => !atual)} aria-expanded={abrindoAcompanhamento}>
            {abrindoAcompanhamento ? 'Fechar' : 'Ver pedido'}
          </button>
        </section>
      )}
      {pedidoForaFilaId && (
        <section className="approval-alert is-warning" role="status" aria-live="polite">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>
            <strong>{identificacaoPedido(pedidoForaFilaId)} não está mais aqui.</strong>{' '}
            {consultandoPedidoForaFila ? 'Consultando…' : pedidoForaFila
              ? <>Situação: {STATUS_LABEL[statusEfetivo(pedidoForaFila)]}.</>
              : 'Você não tem acesso aos detalhes deste pedido.'}
          </span>
          {user && navItemsDoUsuario(user).some((item) => item.to.startsWith('/admin/lista')) && (
            <Link className="approval-button is-secondary" to={navItemsDoUsuario(user).find((item) => item.to.startsWith('/admin/lista'))?.to ?? '/admin/lista'}>Ver em Pedidos</Link>
          )}
          <button type="button" onClick={() => { setPedidoForaFilaId(null); setPedidoForaFila(null); }}>Fechar</button>
        </section>
      )}
      {emissaoConfirmada && abrindoAcompanhamento && user && (
        <section className="approval-detail-section" aria-label="Pedido com etiqueta anexada">
          <h2><FileText size={17} aria-hidden="true" />{identificacaoPedido(emissaoConfirmada.id)}</h2>
          <dl className="approval-detail-facts">
            <CampoEmissao label="Cliente" value={emissaoConfirmada.nome_cliente} />
            <CampoEmissao label="Empresa" value={emissaoConfirmada.empresa} />
            <CampoEmissao label="Situação" value={STATUS_LABEL[statusEfetivo(emissaoConfirmada)]} />
          </dl>
          <EtiquetaReversa solicitacao={emissaoConfirmada} podeEmitir={podeEmitirEtiqueta(user, emissaoConfirmada.empresa)} onAlterada={(atualizada) => setEmissaoConfirmada(atualizada)} />
        </section>
      )}

      <section className="approval-toolbar" aria-label="Filtros da fila de emissão">
        <p className="approval-queue-count" aria-live="polite"><strong>{filtradas.length}</strong> {filtradas.length === 1 ? 'pedido' : 'pedidos'}</p>
        <div className="approval-filters">
          {empresasAutorizadas.length > 1 && companySelect}
          <label className="approval-search"><Search size={18} aria-hidden="true" /><input type="search" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Pedido, cliente ou código" aria-label="Buscar pedido, cliente ou código interno" /></label>
          <button className="approval-refresh" type="button" onClick={() => void refetch()} disabled={loading || refreshing} aria-label="Atualizar" title="Atualizar"><RefreshCw size={17} className={refreshing ? 'approval-refreshing' : ''} aria-hidden="true" /></button>
        </div>
      </section>

      {error && dados.length > 0 && <div className="approval-alert is-error" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>Não foi possível atualizar: {error.message}</span><button type="button" onClick={() => void refetch()} disabled={refreshing}>Tentar de novo</button></div>}

      {loading && dados.length === 0 ? (
        <div className="approval-empty" role="status"><RefreshCw className="approval-refreshing" size={22} aria-hidden="true" />Carregando…</div>
      ) : error && dados.length === 0 ? (
        <div className="approval-empty is-error" role="alert"><AlertTriangle size={28} aria-hidden="true" /><h2>Não foi possível carregar os pedidos</h2><p>{error.message}</p><button type="button" onClick={() => void refetch()} disabled={refreshing}>Tentar de novo</button></div>
      ) : empresasAutorizadas.length === 0 ? (
        <div className="approval-empty is-error"><AlertTriangle size={28} aria-hidden="true" /><h2>Sem empresa liberada</h2><p>Peça ao administrador para liberar a emissão de etiquetas para uma empresa.</p></div>
      ) : elegiveis.length === 0 ? (
        <div className="approval-empty"><CheckCircle2 size={28} aria-hidden="true" /><h2>Nenhum pedido aguardando etiqueta</h2><p>Pedidos ainda sem aprovação não aparecem aqui.</p><button type="button" onClick={() => void refetch()} disabled={refreshing}>Atualizar</button></div>
      ) : filtradas.length === 0 ? (
        <div className="approval-empty is-filtered"><Search size={26} aria-hidden="true" /><h2>Nenhum pedido encontrado</h2><p>Confira o número do pedido, o nome ou o código da cliente.</p><button type="button" onClick={() => { setBusca(''); setEmpresa(empresasAutorizadas.length === 1 ? empresasAutorizadas[0] : 'Ambas'); }}>Limpar filtros</button></div>
      ) : (
        <section className="approval-list" aria-label="Pedidos aprovados aguardando etiqueta">
          <div className="approval-list-head approval-issue-head" aria-hidden="true"><span>Pedido</span><span>Cliente</span><span>Solicitante</span><span>Data</span><span>Situação</span><span /></div>
          {filtradas.map((item) => {
            const aberta = expandida === item.id;
            const panelId = `emissao-details-${item.id}`;
                        return (
              <article className={`approval-row ${aberta ? 'is-expanded' : ''}`} key={item.id}>
                <button type="button" className="approval-row-summary approval-issue-summary" aria-expanded={aberta} aria-controls={panelId} onClick={() => setExpandida(aberta ? null : item.id)}>
                  <span className="approval-row-ident"><span className="approval-row-label">Pedido</span><strong>{identificacaoPedido(item.id)}</strong><small>{item.empresa}</small></span>
                  <span className="approval-row-client"><span className="approval-row-label">Cliente</span><strong>{item.nome_cliente || 'Nome não informado'}</strong><small>Código {item.codigo_cliente || 'não informado'}</small></span>
                  <span className="approval-row-owner"><span className="approval-row-label">Solicitante</span><strong>{item.solicitado_por_nome || item.solicitante || 'Não informado'}</strong><small>{item.setor || 'Setor não informado'}</small></span>
                  <span className="approval-row-date"><span className="approval-row-label">Data</span><time dateTime={dataPedido(item).toISOString()}>{formatarData(dataPedido(item))}</time></span>
                  <span className="approval-status is-waiting">Aguardando etiqueta</span>
                  <ChevronDown className="approval-row-chevron" size={18} aria-hidden="true" />
                </button>
                {aberta && (
                  <div id={panelId} className="approval-row-details">
                    <div className="approval-detail-grid">
                      <section className="approval-detail-section" aria-labelledby={`${panelId}-dados`}>
                        <h2 id={`${panelId}-dados`}>Dados do pedido</h2>
                        <dl className="approval-detail-facts">
                          <CampoEmissao label="Código da cliente" value={item.codigo_cliente} />
                          <CampoEmissao label="Cliente" value={item.nome_cliente} />
                          <CampoEmissao label="Empresa" value={item.empresa} />
                          <CampoEmissao label="Solicitante" value={item.solicitado_por_nome || item.solicitante} />
                          <CampoEmissao label="Setor" value={item.setor} />
                          <CampoEmissao label="Data" value={formatarData(dataPedido(item))} />
                          <CampoEmissao label="Aprovado por" value={item.autorizacao} />
                        </dl>
                        <button type="button" className="approval-button is-secondary" onClick={() => void copiar('Código da cliente', String(item.codigo_cliente))}><Copy size={14} />Copiar código</button>
                        <div className="approval-detail-block"><div className="approval-detail-label"><MapPin size={15} aria-hidden="true" />Endereço</div><p>{item.endereco_postagem || 'Endereço não informado'}</p><button type="button" className="approval-button is-secondary" onClick={() => void copiar('Endereço', item.endereco_postagem)} disabled={!item.endereco_postagem}><Copy size={14} />Copiar endereço</button></div>
                        {item.endereco_destino_troca && <div className="approval-detail-block"><div className="approval-detail-label"><MapPin size={15} aria-hidden="true" />Endereço da outra cliente</div><p>{item.endereco_destino_troca}</p></div>}
                        <div className="approval-detail-block"><div className="approval-detail-label">Motivo</div><p><strong>{item.motivo || 'Motivo não informado'}</strong></p>{item.justificativa_outros && <p>{item.justificativa_outros}</p>}</div>
                      </section>
                      <div className="approval-detail-side">
                        <section className="approval-detail-section" aria-labelledby={`${panelId}-historico`}><h2 id={`${panelId}-historico`}><History size={17} aria-hidden="true" />Histórico</h2>
                          {carregandoHistorico ? <p className="approval-muted" role="status">Carregando histórico…</p> : erroHistorico ? <div className="approval-history-error" role="alert"><p>{erroHistorico}</p><button type="button" onClick={() => setTentativaHistorico((n) => n + 1)}>Tentar novamente</button></div> : historico.length === 0 ? <p className="approval-muted">Sem eventos.</p> : <ol className="approval-history-list">{historico.map((evento) => <li key={evento.id}><time dateTime={evento.createdAt}>{formatarData(evento.createdAt)}</time><div><strong>{evento.descricao}</strong>{evento.responsavel && <span>Responsável: {evento.responsavel}</span>}</div></li>)}</ol>}
                        </section>
                      </div>
                    </div>
                    {(() => {
                      const consulta = consultasEmissao[item.id];
                      if (!consulta || consulta.estado === 'carregando') {
                        return <p className="approval-muted" role="status">Conferindo o pedido…</p>;
                      }
                      if (consulta.estado === 'erro') {
                        return <div className="approval-alert is-error" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>Não foi possível conferir a etiqueta deste pedido: {consulta.mensagem}</span><button type="button" onClick={() => void consultarEmissao(item.id)}>Tentar de novo</button></div>;
                      }
                      if (item.status === 'etiqueta_gerada' && !consulta.emissao) {
                        return <div className="approval-alert is-warning" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>Este pedido deveria ter uma etiqueta, mas não encontrei o registro dela.</span><button type="button" onClick={() => void consultarEmissao(item.id)}>Conferir de novo</button></div>;
                      }
                      return <EtiquetaReversa solicitacao={item} podeEmitir={!!user && podeEmitirEtiqueta(user, item.empresa)} onAlterada={confirmarRegistro} />;
                    })()}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

/** Expedição: uma só área, a fila de pedidos aprovados que esperam a etiqueta. */
export default function FilaOperacionalPage() {
  const { dados, loading, refreshing, error, ultimoFetch, refetch } = useSolicitacoes({
    pollingMs: 15_000,
    filtros: { status: ['pendente', 'etiqueta_gerada'] },
  });
  const { user } = useAuth();
  return <FilaEmissao dados={dados} loading={loading} refreshing={refreshing} error={error} refetch={refetch} user={user} ultimoFetch={ultimoFetch} />;
}
