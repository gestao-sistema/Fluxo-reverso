import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Eye,
  FileText,
  History,
  MapPin,
  Paperclip,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEmpresaDaTela } from '../context/TemaContext';
import { podeAprovarReversa } from '../lib/perfil';
import apiService, { HistoricoSolicitacaoError, SolicitacaoAlteradaError } from '../services/apiService';
import type {
  Empresa,
  Solicitacao,
  SolicitacaoAprovacao,
  SolicitacaoAprovacaoHistorico,
  SolicitacaoHistorico,
} from '../types';
import VisualizadorPdf from '../components/ui/VisualizadorPdf';
import { codigoPedido } from '../lib/pedido';
import '../styles/approval.css';

type EmpresaFiltro = Empresa | 'Ambas';
type HistoricoItem = { id: string; createdAt: string; descricao: string; responsavel?: string | null };

const EMPRESAS: Empresa[] = ['Alinare', 'Novitah'];
const POLLING_MS = 15_000;

function snapshot(record: Solicitacao) {
  return {
    empresa: record.empresa,
    data_solicitacao: record.data_solicitacao,
    solicitante: record.solicitante,
    setor: record.setor,
    codigo_cliente: record.codigo_cliente,
    nome_cliente: record.nome_cliente,
    endereco_postagem: record.endereco_postagem,
    endereco_destino_troca: record.endereco_destino_troca ?? null,
    motivo: record.motivo,
    justificativa_outros: record.justificativa_outros ?? null,
    autorizacao: record.autorizacao,
    etiqueta_gerada_em: record.etiqueta_gerada_em ?? null,
    postado_em: record.postado_em ?? null,
    em_transito_em: record.em_transito_em ?? null,
    concluido_em: record.concluido_em ?? null,
    codigo_rastreio: record.codigo_rastreio ?? null,
    ultima_cidade_rastreio: record.ultima_cidade_rastreio ?? null,
    anotacoes: record.anotacoes ?? null,
    tempo_preenchimento_segundos: record.tempo_preenchimento_segundos ?? null,
    nc_id: record.nc_id ?? null,
    nc_numero: record.nc_numero ?? null,
    legado: record.legado ?? false,
    etiqueta_path: record.etiqueta_path ?? null,
    etiqueta_nome: record.etiqueta_nome ?? null,
    etiqueta_enviada_em: record.etiqueta_enviada_em ?? null,
  };
}

function sameReview(a: SolicitacaoAprovacao, b: SolicitacaoAprovacao): boolean {
  if (a.aprovacao_versao !== undefined && b.aprovacao_versao !== undefined) {
    return a.aprovacao_versao === b.aprovacao_versao;
  }
  return JSON.stringify(snapshot(a)) === JSON.stringify(snapshot(b)) && a.status === b.status;
}

function aguardaDecisao(record: SolicitacaoAprovacao): boolean {
  if (record.aprovacao_status) return record.aprovacao_status === 'aguardando_aprovacao';
  return record.status === 'aguardando_aprovacao';
}

function normalizarParaAprovacao(record: Solicitacao | SolicitacaoAprovacao): SolicitacaoAprovacao {
  const approvalRecord = record as SolicitacaoAprovacao;
  const status = approvalRecord.aprovacao_status === 'aguardando_aprovacao'
    ? 'aguardando_aprovacao'
    : approvalRecord.aprovacao_status === 'rejeitada'
      ? 'reprovado'
      : record.status;
  return {
    ...approvalRecord,
    status,
    aprovacao_status: approvalRecord.aprovacao_status ?? (record.status === 'aguardando_aprovacao' ? 'aguardando_aprovacao' : null),
    aprovacao_versao: approvalRecord.aprovacao_versao ?? 1,
    proprio_pedido: approvalRecord.proprio_pedido ?? false,
    pode_aprovar: approvalRecord.pode_aprovar ?? true,
  };
}

const ticketCode = codigoPedido;

function formatDate(value?: string | null, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', options ?? { day: '2-digit', month: 'short', year: 'numeric' }).format(date).replace('.', '');
}

function requestedAt(record: Solicitacao): string {
  const date = record.data_solicitacao
    ? new Date(`${record.data_solicitacao}T12:00:00`)
    : new Date(record.created_at);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date).replace('.', '')
    : 'Data não informada';
}

function approvalLabel(record: SolicitacaoAprovacao): string {
  if (record.aprovacao_status === 'rejeitada' || record.status === 'reprovado') return 'Rejeitada';
  if (record.aprovacao_status === 'aprovada') return 'Aprovada';
  if (aguardaDecisao(record)) return 'Aguardando decisão';
  return 'Decisão registrada';
}

function approvalTone(record: SolicitacaoAprovacao): string {
  if (record.aprovacao_status === 'rejeitada' || record.status === 'reprovado') return 'is-rejected';
  if (record.aprovacao_status === 'aprovada') return 'is-approved';
  return 'is-waiting';
}

function filterText(record: Solicitacao): string {
  return [ticketCode(record.id), record.id, record.nome_cliente, record.codigo_cliente]
    .join(' ')
    .toLocaleLowerCase('pt-BR');
}

function montarHistorico(
  operacional: SolicitacaoHistorico[],
  aprovacao: SolicitacaoAprovacaoHistorico[],
): HistoricoItem[] {
  const eventos: HistoricoItem[] = [
    ...operacional.map((item) => ({
      id: `sol-${item.id}`,
      createdAt: item.created_at,
      descricao: item.acao,
      responsavel: item.user_nome,
    })),
    ...aprovacao.map((item) => ({
      id: `aprov-${item.id}`,
      createdAt: item.created_at,
      descricao: item.evento === 'aprovada'
        ? 'Solicitação aprovada'
        : item.evento === 'rejeitada'
          ? `Solicitação rejeitada${item.justificativa ? `: ${item.justificativa}` : ''}`
          : item.evento === 'invalidada' ? 'Aprovação invalidada' : 'Solicitação alterada para nova análise',
      responsavel: item.user_nome,
    })),
  ];
  return eventos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function DetailField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="approval-detail-field">
      <dt>{label}</dt>
      <dd>{value || 'Não informado'}</dd>
    </div>
  );
}

export default function ApprovalQueuePage() {
  const { user } = useAuth();
  const permittedCompanies = useMemo(
    () => EMPRESAS.filter((empresa) => !!user && podeAprovarReversa(user, empresa)),
    [user],
  );

  const [company, setCompany] = useState<EmpresaFiltro>('Ambas');
  // Só o tema visual acompanha a empresa exibida no filtro
  useEmpresaDaTela(company);
  const [sector, setSector] = useState('Todos');
  const [records, setRecords] = useState<SolicitacaoAprovacao[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [queueError, setQueueError] = useState('');
  const [queueNotice, setQueueNotice] = useState('');
  const [reviewRequiredId, setReviewRequiredId] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoricoItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyRetry, setHistoryRetry] = useState(0);
  const [labelPreview, setLabelPreview] = useState<SolicitacaoAprovacao | null>(null);
  const requestSequence = useRef(0);
  const recordsRef = useRef(records);
  const expandedRef = useRef(expandedId);
  const savingRef = useRef(false);
  recordsRef.current = records;
  expandedRef.current = expandedId;

  // Link das comunicações (?solicitacaoId=): abre o pedido na fila. Se ele já foi decidido ou não é
  // mais seu, o aviso informa isso em vez de mostrar uma tarefa que perdeu pertinência.
  const [searchParams] = useSearchParams();
  const linkedId = searchParams.get('solicitacaoId');
  const handledLink = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !linkedId || handledLink.current === linkedId) return;
    handledLink.current = linkedId;
    if (records.some((record) => record.id === linkedId)) setExpandedId(linkedId);
    else setQueueNotice(`${codigoPedido(linkedId)} não está mais aguardando a sua decisão.`);
  }, [loading, linkedId, records]);

  useEffect(() => {
    if (permittedCompanies.length === 1) setCompany(permittedCompanies[0]);
    else if (company !== 'Ambas' && !permittedCompanies.includes(company)) setCompany('Ambas');
  }, [company, permittedCompanies]);

  const fetchQueue = useCallback(async () => {
    if (!user || permittedCompanies.length === 0) return [] as SolicitacaoAprovacao[];
    const result = apiService.getFilaAprovacao
      ? await apiService.getFilaAprovacao()
      : (await apiService.getSolicitacoes({ status: 'aguardando_aprovacao', empresa: 'Ambas' }))
        .map((record) => normalizarParaAprovacao(record));
    return result.filter((record) => permittedCompanies.includes(record.empresa));
  }, [permittedCompanies, user]);

  const reloadQueue = useCallback(async (quiet = false) => {
    if (!user || permittedCompanies.length === 0) {
      setRecords([]);
      setExpandedId(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const sequence = ++requestSequence.current;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const allowed = await fetchQueue();
      if (sequence !== requestSequence.current) return;
      const currentId = expandedRef.current;
      const current = recordsRef.current.find((record) => record.id === currentId);
      const fresh = allowed.find((record) => record.id === currentId);
      setRecords(allowed);
      setQueueError('');
      setQueueNotice('');

      if (current && !savingRef.current && (fresh ? !sameReview(current, fresh) : true)) {
        if (fresh) {
          setReviewRequiredId(current.id);
          setReviewMessage('Os dados deste pedido mudaram. Confira a versão atual antes de decidir.');
        } else {
          const latest = await apiService.getSolicitacaoById(current.id);
          if (sequence !== requestSequence.current) return;
          if (!latest) {
            setExpandedId(null);
            setQueueNotice(`${ticketCode(current.id)} não está mais disponível para este perfil. A fila foi atualizada.`);
          } else {
            const updated = normalizarParaAprovacao(latest);
            if (aguardaDecisao(updated)) {
              if (!permittedCompanies.includes(updated.empresa)) {
                setExpandedId(null);
                setQueueNotice(`${ticketCode(current.id)} não está mais disponível para este perfil. A fila foi atualizada.`);
                return;
              }
              setRecords((items) => items.some((item) => item.id === updated.id)
                ? items.map((item) => item.id === updated.id ? { ...updated, proprio_pedido: current.proprio_pedido, pode_aprovar: current.pode_aprovar } : item)
                : [...items, { ...updated, proprio_pedido: current.proprio_pedido, pode_aprovar: current.pode_aprovar }]);
              setReviewRequiredId(current.id);
              setReviewMessage('Os dados deste pedido mudaram. Confira a versão atual antes de decidir.');
            } else {
              setExpandedId(null);
              setQueueNotice(`${ticketCode(current.id)} já foi decidido por outro aprovador (${approvalLabel(updated).toLocaleLowerCase('pt-BR')}). A fila foi atualizada.`);
            }
          }
        }
      }
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      setQueueError(error instanceof Error ? error.message : 'Não foi possível carregar a fila.');
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [fetchQueue, permittedCompanies, user]);

  useEffect(() => {
    void reloadQueue();
    const interval = window.setInterval(() => void reloadQueue(true), POLLING_MS);
    return () => {
      requestSequence.current += 1;
      window.clearInterval(interval);
    };
  }, [reloadQueue]);

  const companyRecords = useMemo(
    () => records.filter((record) => company === 'Ambas' || record.empresa === company),
    [company, records],
  );
  const sectors = useMemo(
    () => [...new Set(companyRecords.map((record) => record.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [companyRecords],
  );
  const filteredRecords = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return companyRecords.filter((record) =>
      (sector === 'Todos' || record.setor === sector)
      && (!term || filterText(record).includes(term)),
    );
  }, [companyRecords, search, sector]);
  const expanded = records.find((record) => record.id === expandedId) ?? null;
  const expandedCanApprove = !!(expanded && user && podeAprovarReversa(user, expanded.empresa));
  const needsReview = expanded?.id === reviewRequiredId;
  const canApprove = !!expanded && aguardaDecisao(expanded) && expandedCanApprove
    && expanded.pode_aprovar !== false && !needsReview && !saving;
  const canReject = !!expanded && aguardaDecisao(expanded) && expandedCanApprove && !needsReview && !saving;

  useEffect(() => {
    if (!expandedId) {
      setHistory([]);
      setHistoryError('');
      return;
    }
    let active = true;
    setHistoryLoading(true);
    setHistoryError('');
    Promise.allSettled([
      apiService.getHistorico(expandedId),
      apiService.getHistoricoAprovacao(expandedId),
    ]).then(([operacional, aprovacao]) => {
      if (!active) return;
      const erros = [operacional, aprovacao].filter((item) => item.status === 'rejected');
      const op = operacional.status === 'fulfilled' ? operacional.value : [];
      const ap = aprovacao.status === 'fulfilled' ? aprovacao.value : [];
      setHistory(montarHistorico(op, ap));
      setHistoryError(erros.length ? 'Parte do histórico não pôde ser carregada.' : '');
    }).finally(() => {
      if (active) setHistoryLoading(false);
    });
    return () => { active = false; };
  }, [expandedId, historyRetry]);

  const toggleRow = (record: SolicitacaoAprovacao) => {
    if (savingRef.current) return;
    if (expandedId === record.id) {
      setExpandedId(null);
      setRejectOpen(false);
      setRejectReason('');
      setActionError('');
      return;
    }
    setExpandedId(record.id);
    setRejectOpen(false);
    setRejectReason('');
    setActionError('');
  };

  const refreshChangedTicket = async (original: SolicitacaoAprovacao) => {
    setReviewRequiredId(original.id);
    setReviewMessage('O pedido mudou ou já foi decidido. Atualizando os dados antes de permitir outra ação.');
    setActionError('');
    try {
      const [latest, queue] = await Promise.all([
        apiService.getSolicitacaoById(original.id),
        fetchQueue(),
      ]);
      setRecords(queue);
      if (!latest) {
        setExpandedId(null);
        setQueueNotice(`${ticketCode(original.id)} não está mais disponível para este perfil. A fila foi atualizada.`);
        return;
      }
      const queueRecord = queue.find((record) => record.id === original.id);
      const updated = queueRecord ?? {
        ...normalizarParaAprovacao(latest),
        proprio_pedido: original.proprio_pedido,
        pode_aprovar: original.pode_aprovar,
      };
      if (!aguardaDecisao(updated)) {
        setExpandedId(null);
        setQueueNotice(`${ticketCode(original.id)} já foi ${approvalLabel(updated).toLocaleLowerCase('pt-BR')} por outro aprovador. A fila foi atualizada.`);
        return;
      }
      if (!permittedCompanies.includes(updated.empresa)) {
        setExpandedId(null);
        setQueueNotice(`${ticketCode(original.id)} não está mais disponível para este perfil.`);
        return;
      }
      setRecords((items) => items.some((item) => item.id === updated.id)
        ? items.map((item) => item.id === updated.id ? updated : item)
        : [...items, updated]);
      setExpandedId(updated.id);
      setReviewRequiredId(updated.id);
      setReviewMessage('Os dados foram atualizados. Revise esta versão; nenhuma decisão foi aplicada.');
    } catch (error) {
      setActionError(error instanceof Error
        ? `O pedido mudou, mas não foi possível atualizar os dados: ${error.message}`
        : 'O pedido mudou, mas não foi possível atualizar os dados. Tente atualizar a fila.');
    }
  };

  const decide = async (decision: 'approve' | 'reject') => {
    const current = expanded;
    if (!current || !user || savingRef.current || (decision === 'approve' ? !canApprove : !canReject)) return;
    const reason = rejectReason.trim();
    if (decision === 'reject' && !reason) {
      setActionError('Informe a justificativa da rejeição.');
      return;
    }
    if (!apiService.decidirAprovacao) {
      setActionError('O serviço seguro de aprovação não está disponível. Atualize a aplicação antes de tentar novamente.');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setActionError('');
    try {
      const fallbackOptions = {
        expectedStatus: 'aguardando_aprovacao' as const,
        expectedApprovalSnapshot: snapshot(current),
        historyAction: decision === 'approve' ? 'Aprovou reversa' : `Rejeitou reversa: ${reason}`,
      };
      await apiService.decidirAprovacao(current, decision, user, reason, fallbackOptions);
      setRecords((items) => items.filter((record) => record.id !== current.id));
      setExpandedId(null);
      setReviewRequiredId(null);
      setReviewMessage('');
      setRejectOpen(false);
      setRejectReason('');
      setActionError('');
      toast.success(decision === 'approve' ? 'Reversa aprovada.' : 'Reversa rejeitada.');
    } catch (error) {
      if (error instanceof SolicitacaoAlteradaError) {
        await refreshChangedTicket(current);
      } else if (error instanceof HistoricoSolicitacaoError) {
        setRecords((items) => items.filter((record) => record.id !== error.solicitacao.id));
        setExpandedId(null);
        setQueueNotice(`${ticketCode(error.solicitacao.id)}: a decisão foi confirmada, mas houve uma falha ao registrar o histórico. Atualize a fila.`);
      } else {
        setActionError(error instanceof Error ? error.message : 'Não foi possível registrar a decisão. Tente novamente.');
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // A etiqueta abre no visualizador em popup (sem nova aba), com a mesma regra de permissão
  const openLabel = (record: SolicitacaoAprovacao) => {
    if (!record.etiqueta_path || !user || !podeAprovarReversa(user, record.empresa)) return;
    setLabelPreview(record);
  };

  const resetFilters = () => {
    setSearch('');
    setSector('Todos');
    setCompany(permittedCompanies.length === 1 ? permittedCompanies[0] : 'Ambas');
  };

  return (
    <div className="approval-page">
      {labelPreview?.etiqueta_path && (
        <VisualizadorPdf
          titulo="Etiqueta"
          nomeArquivo={labelPreview.etiqueta_nome || 'etiqueta.pdf'}
          carregarUrl={() => apiService.urlEtiqueta(labelPreview.etiqueta_path!)}
          onFechar={() => setLabelPreview(null)}
        />
      )}
      <header className="approval-heading">
        <div>
          <h1>Aprovações</h1>
        </div>
      </header>

      <section className="approval-toolbar" aria-label="Filtros da fila">
        <p className="approval-queue-count" aria-live="polite">
          {records.length === 0 && (loading || queueError)
            ? (loading ? 'Carregando pedidos…' : 'Contagem indisponível')
            : <><strong>{String(filteredRecords.length).padStart(2, '0')}</strong> {filteredRecords.length === 1 ? 'pedido para revisar' : 'pedidos para revisar'}</>}
        </p>
        <div className="approval-filters">
          <label>
            <span>Empresa</span>
            <select
              className="approval-filter-select"
              value={company}
              onChange={(event) => { setCompany(event.target.value as EmpresaFiltro); setSector('Todos'); }}
              disabled={permittedCompanies.length === 0}
              aria-label="Filtrar por empresa"
            >
              {permittedCompanies.length > 1 && <option value="Ambas">Todas as empresas</option>}
              {permittedCompanies.map((empresa) => <option key={empresa} value={empresa}>{empresa}</option>)}
            </select>
          </label>
          <label>
            <span>Setor</span>
            <select className="approval-filter-select" value={sector} onChange={(event) => setSector(event.target.value)} aria-label="Filtrar por setor">
              <option value="Todos">Todos os setores</option>
              {sectors.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="approval-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pedido ou cliente"
              aria-label="Buscar por identificação ou cliente"
            />
          </label>
          <button className="approval-refresh" type="button" onClick={() => void reloadQueue()} disabled={loading || refreshing} aria-label="Atualizar fila" title="Atualizar fila">
            <RefreshCw size={17} className={refreshing ? 'approval-refreshing' : ''} aria-hidden="true" />
          </button>
        </div>
      </section>

      {queueNotice && <div className="approval-alert is-warning" role="status"><AlertTriangle size={18} aria-hidden="true" /><span>{queueNotice}</span></div>}
      {queueError && records.length > 0 && (
        <div className="approval-alert is-error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" /><span>{queueError} Os pedidos abaixo podem estar desatualizados.</span>
          <button type="button" onClick={() => void reloadQueue()} disabled={refreshing}>Tentar novamente</button>
        </div>
      )}

      {loading && records.length === 0 ? (
        <div className="approval-empty" role="status"><RefreshCw className="approval-refreshing" size={22} aria-hidden="true" />Carregando pedidos…</div>
      ) : queueError && records.length === 0 ? (
        <div className="approval-empty is-error" role="alert">
          <AlertTriangle size={28} aria-hidden="true" />
          <h2>Não foi possível carregar os pedidos</h2>
          <p>{queueError}</p>
          <p>Se o problema continuar, avise o administrador.</p>
          <button type="button" onClick={() => void reloadQueue()} disabled={refreshing}>Tentar novamente</button>
        </div>
      ) : permittedCompanies.length === 0 ? (
        <div className="approval-empty">
          <AlertTriangle size={28} aria-hidden="true" />
          <h2>Sem acesso a empresas para aprovação</h2>
          <p>Seu perfil não possui permissão para revisar solicitações.</p>
        </div>
      ) : records.length === 0 ? (
        <div className="approval-empty">
          <CheckCircle2 size={28} aria-hidden="true" />
          <h2>A fila está vazia</h2>
          <p>Não há pedidos aguardando aprovação para as empresas autorizadas.</p>
          <button type="button" onClick={() => void reloadQueue()} disabled={refreshing}>Atualizar fila</button>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="approval-empty is-filtered">
          <Search size={26} aria-hidden="true" />
          <h2>Nenhum pedido corresponde aos filtros</h2>
          <p>Ajuste a busca, empresa ou setor para ver outras pendências.</p>
          <button type="button" onClick={resetFilters}>Limpar filtros</button>
        </div>
      ) : (
        <section className="approval-list" aria-label="Pedidos aguardando aprovação">
          <div className="approval-list-head" aria-hidden="true">
            <span>Identificação</span><span>Cliente</span><span>Solicitante e setor</span><span>Solicitado em</span><span>Situação</span><span />
          </div>
          {filteredRecords.map((record) => {
            const isExpanded = expandedId === record.id;
            const blockedForReview = reviewRequiredId === record.id;
            const panelId = `approval-details-${record.id}`;
            return (
              <article className={`approval-row ${isExpanded ? 'is-expanded' : ''}`} key={record.id}>
                <button
                  type="button"
                  className="approval-row-summary"
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                  onClick={() => toggleRow(record)}
                  disabled={saving}
                >
                  <span className="approval-row-ident">
                    <span className="approval-row-label">Identificação</span>
                    <strong>{ticketCode(record.id)}</strong>
                    <small>{record.empresa}</small>
                  </span>
                  <span className="approval-row-client">
                    <span className="approval-row-label">Cliente</span>
                    <strong>{record.nome_cliente || 'Nome não informado'}</strong>
                    <small>Código {record.codigo_cliente || 'não informado'}</small>
                  </span>
                  <span className="approval-row-owner">
                    <span className="approval-row-label">Solicitante e setor</span>
                    <strong>{record.solicitado_por_nome || record.solicitante || 'Não informado'}</strong>
                    <small>{record.setor || 'Setor não informado'}</small>
                  </span>
                  <span className="approval-row-date">
                    <span className="approval-row-label">Solicitado em</span>
                    <time dateTime={record.data_solicitacao || record.created_at}>{requestedAt(record)}</time>
                  </span>
                  <span className={`approval-status ${approvalTone(record)}`}>
                    <Clock3 size={15} aria-hidden="true" />{approvalLabel(record)}
                  </span>
                  <ChevronDown className="approval-row-chevron" size={18} aria-hidden="true" />
                </button>

                {isExpanded && (
                  <div id={panelId} className="approval-row-details">
                    {blockedForReview && (
                      <div className="approval-alert is-warning" role="alert">
                        <AlertTriangle size={18} aria-hidden="true" />
                        <span>{reviewMessage || 'Revise a versão atualizada antes de decidir.'}</span>
                        {aguardaDecisao(record) && <button type="button" onClick={() => { setReviewRequiredId(null); setReviewMessage(''); setActionError(''); }}>Revisei os dados</button>}
                      </div>
                    )}
                    {record.proprio_pedido && record.pode_aprovar === false && (
                      <div className="approval-alert is-warning" role="status">
                        <AlertTriangle size={18} aria-hidden="true" />
                        <span>Você registrou este pedido. Outro aprovador precisa aprová-lo; a rejeição continua disponível.</span>
                      </div>
                    )}

                    <div className="approval-detail-grid">
                      <section className="approval-detail-section" aria-labelledby={`${panelId}-request`}>
                        <h2 id={`${panelId}-request`}>Dados da solicitação</h2>
                        <dl className="approval-detail-facts">
                          <DetailField label="Código da cliente" value={record.codigo_cliente} />
                          <DetailField label="Nome da cliente" value={record.nome_cliente} />
                          <DetailField label="Empresa" value={record.empresa} />
                          <DetailField label="Solicitante" value={record.solicitado_por_nome || record.solicitante} />
                          <DetailField label="Setor" value={record.setor} />
                          <DetailField label="Data da solicitação" value={requestedAt(record)} />
                        </dl>
                        <div className="approval-detail-block">
                          <div className="approval-detail-label"><MapPin size={15} aria-hidden="true" />Endereço solicitado completo</div>
                          <p>{record.endereco_postagem || 'Endereço não informado'}</p>
                        </div>
                        <div className="approval-detail-block">
                          <div className="approval-detail-label">Motivo e justificativa</div>
                          <p><strong>{record.motivo || 'Motivo não informado'}</strong></p>
                          {record.justificativa_outros?.trim() && <p>{record.justificativa_outros}</p>}
                        </div>
                        {record.endereco_destino_troca && (
                          <div className="approval-detail-block">
                            <div className="approval-detail-label"><MapPin size={15} aria-hidden="true" />Endereço da outra cliente</div>
                            <p>{record.endereco_destino_troca}</p>
                          </div>
                        )}
                        {record.nc_codigo && (
                          <div className="approval-detail-block approval-nc-context">
                            <div className="approval-detail-label">Referência vinculada: {record.nc_codigo}{record.nc_origem ? ` · ${record.nc_origem}` : ''}</div>
                            {record.nc_descricao && <p>{record.nc_descricao}</p>}
                          </div>
                        )}
                      </section>

                      <div className="approval-detail-side">
                        <section className="approval-detail-section" aria-labelledby={`${panelId}-documents`}>
                          <h2 id={`${panelId}-documents`}><Paperclip size={17} aria-hidden="true" />Documentos de apoio</h2>
                          <p className="approval-muted">Nenhum documento de apoio está vinculado a esta solicitação.</p>
                        </section>

                        <section className="approval-detail-section" aria-labelledby={`${panelId}-label`}>
                          <h2 id={`${panelId}-label`}><FileText size={17} aria-hidden="true" />Etiqueta</h2>
                          {record.etiqueta_path ? (
                            <div className="approval-file-card">
                              <FileText size={21} aria-hidden="true" />
                              <div><strong>{record.etiqueta_nome || 'Etiqueta dos Correios'}</strong><span>Documento da emissão</span></div>
                              <button type="button" onClick={() => openLabel(record)} disabled={!expandedCanApprove}>
                                <Eye size={15} aria-hidden="true" />Abrir
                              </button>
                            </div>
                          ) : <p className="approval-muted">Nenhuma etiqueta vinculada.</p>}
                        </section>

                        <section className="approval-detail-section" aria-labelledby={`${panelId}-history`}>
                          <h2 id={`${panelId}-history`}><History size={17} aria-hidden="true" />Histórico disponível</h2>
                          {historyLoading ? <p className="approval-muted" role="status">Carregando histórico…</p>
                            : historyError ? (
                              <div className="approval-history-error" role="alert">
                                <p>{historyError}</p><button type="button" onClick={() => setHistoryRetry((value) => value + 1)}>Tentar novamente</button>
                              </div>
                            ) : history.length === 0 ? <p className="approval-muted">Nenhum evento registrado.</p> : (
                              <ol className="approval-history-list">
                                {history.map((event) => (
                                  <li key={event.id}>
                                    <time dateTime={event.createdAt}>{formatDate(event.createdAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) || '—'}</time>
                                    <div><strong>{event.descricao}</strong>{event.responsavel && <span>Responsável: {event.responsavel}</span>}</div>
                                  </li>
                                ))}
                              </ol>
                            )}
                        </section>
                      </div>
                    </div>

                    {actionError && <div className="approval-alert is-error" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>{actionError}</span></div>}
                    {aguardaDecisao(record) ? (
                      <div className="approval-decision-area">
                        {rejectOpen && (
                          <div className="approval-reject-form">
                            <label htmlFor={`reject-reason-${record.id}`}>Justificativa obrigatória para rejeitar</label>
                            <textarea
                              id={`reject-reason-${record.id}`}
                              value={rejectReason}
                              onChange={(event) => { setRejectReason(event.target.value); setActionError(''); }}
                              rows={3}
                              maxLength={1000}
                              disabled={saving}
                              aria-required="true"
                            />
                            <div className="approval-reject-actions">
                              <span>{rejectReason.length}/1000</span>
                              <button type="button" className="approval-button is-secondary" onClick={() => { setRejectOpen(false); setActionError(''); }} disabled={saving}>Cancelar</button>
                              <button type="button" className="approval-button is-danger" onClick={() => void decide('reject')} disabled={!canReject || !rejectReason.trim()}>
                                {saving ? 'Salvando…' : 'Confirmar rejeição'}
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="approval-ticket-actions">
                          <button type="button" className="approval-button is-reject" onClick={() => { setRejectOpen(true); setActionError(''); }} disabled={!canReject || rejectOpen}>
                            <XCircle size={17} aria-hidden="true" />Rejeitar
                          </button>
                          <button type="button" className="approval-button is-primary" onClick={() => void decide('approve')} disabled={!canApprove || rejectOpen}>
                            {saving ? 'Salvando…' : <><CheckCircle2 size={17} aria-hidden="true" />Aprovar</>}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="approval-muted">Esta solicitação não está aguardando uma decisão.</p>
                    )}
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
