import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  Package,
  PackageCheck,
  Tag,
  Truck,
  XCircle,
} from 'lucide-react';
import { useSolicitacoes } from '../hooks/useSolicitacoes';
import { calcularKpis, contarPorStatus, formatarTempo, porDataComZeros, porEmpresa, porMotivo } from '../services/analytics';
import { useAuth } from '../context/AuthContext';
import { useEmpresaDaTela } from '../context/TemaContext';
import { type Empresa, type FiltrosSolicitacoes, type Solicitacao, type StatusSolicitacao } from '../types';
import { pendenciasOperacionais, TEXTO_PENDENCIA, tempoDesde, type Pendencia } from '../lib/dashboardOperacao';
import { statusEfetivo } from '../lib/situacaoPedido';
import DashboardToolbar from '../components/admin/DashboardToolbar';
import ChartTimeline from '../components/admin/ChartTimeline';
import ChartMotivo from '../components/admin/ChartMotivo';
import ChartEmpresa from '../components/admin/ChartEmpresa';
import type { FiltrosState } from '../components/admin/DashboardFilters';
import { codigoPedido } from '../lib/pedido';
import '../styles/dashboard.css';

const POLLING_MS = 15_000;
const LIMITE_ATENCAO = 5;

export type PeriodoDashboard = '7' | '30' | 'custom' | 'all';

const ETAPAS: {
  status: StatusSolicitacao;
  label: string;
  detalhe: string;
  Icone: typeof Clock3;
}[] = [
  { status: 'aguardando_aprovacao', label: 'Aguardando aprovação', detalhe: '', Icone: Clock3 },
  { status: 'pendente', label: 'Aguardando etiqueta', detalhe: '', Icone: Tag },
  { status: 'etiqueta_gerada', label: 'Aguardando postagem', detalhe: '', Icone: Package },
  { status: 'postado', label: 'Postados', detalhe: '', Icone: PackageCheck },
  { status: 'em_transito', label: 'Em trânsito', detalhe: '', Icone: Truck },
  { status: 'concluido', label: 'Concluídos', detalhe: '', Icone: CheckCircle2 },
];

/** Etapas que pedem ação da operação (a primeira com pedidos fica destacada). */
const ETAPAS_COM_ACAO: StatusSolicitacao[] = ['aguardando_aprovacao', 'pendente'];

function inicioDosUltimosDias(dias: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (dias - 1));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function rotaListaAutorizada(user: NonNullable<ReturnType<typeof useAuth>['user']>, empresa: Empresa | 'Ambas') {
  if (user.telas.includes('lista-geral')) return '/admin/lista';
  const empresasComLista: Empresa[] = [];
  if (user.telas.includes('lista-alinare')) empresasComLista.push('Alinare');
  if (user.telas.includes('lista-novitah')) empresasComLista.push('Novitah');

  if (empresa === 'Ambas') return empresasComLista.length === 2 ? '/admin/lista' : undefined;
  return empresasComLista.includes(empresa) ? '/admin/lista' : undefined;
}

function rotaComFiltros(
  user: NonNullable<ReturnType<typeof useAuth>['user']>,
  empresa: Empresa | 'Ambas',
  filtros: FiltrosState,
  status: StatusSolicitacao[],
  solicitacaoId?: string,
) {
  const path = rotaListaAutorizada(user, empresa);
  if (!path) return undefined;

  const params = new URLSearchParams();
  if (empresa !== 'Ambas') params.set('empresa', empresa);
  if (filtros.dataInicio) params.set('dataInicio', filtros.dataInicio);
  if (filtros.dataFim) params.set('dataFim', filtros.dataFim);
  params.set('status', status.join(','));
  if (solicitacaoId) params.set('solicitacaoId', solicitacaoId);
  return `${path}?${params.toString()}`;
}

const ticketCode = codigoPedido;

/** Data curta para as linhas de atenção ("13 out"). */
function dataCurta(valor: string) {
  const date = valor ? new Date(`${valor.slice(0, 10)}T12:00:00`) : null;
  if (!date || !Number.isFinite(date.getTime())) return 'sem data';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
}

function statusAtual(solicitacao: Solicitacao): StatusSolicitacao {
  return solicitacao.status
    ? statusEfetivo(solicitacao)
    : ((solicitacao as Solicitacao & { resolvido?: boolean }).resolvido ? 'concluido' : 'pendente');
}

function PainelVazio({ children }: { children: string }) {
  return <div className="dashboard-empty-state">{children}</div>;
}

function PainelErro({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="dashboard-panel-error" role="status">
      <span>Não foi possível consultar os dados desta seleção.</span>
      <button type="button" onClick={onRetry}>Tentar novamente</button>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const location = useLocation();
  const queryEmpresa = new URLSearchParams(location.search).get('empresa');
  const temGeral = user?.telas.includes('dashboard-geral');
  const temAlinare = user?.telas.includes('dashboard-alinare');
  const temNovitah = user?.telas.includes('dashboard-novitah');

  let empresaFixa: Empresa | undefined;
  if (!temGeral) {
    if (temAlinare && !temNovitah) empresaFixa = 'Alinare';
    if (temNovitah && !temAlinare) empresaFixa = 'Novitah';
  } else if (queryEmpresa === 'Alinare' || queryEmpresa === 'Novitah') {
    empresaFixa = queryEmpresa;
  }

  // Período vindo de um link (por exemplo, o antigo endereço de relatórios): só datas válidas
  const dataDoLink = (nome: string) => {
    const valor = new URLSearchParams(location.search).get(nome) ?? '';
    return /^d{4}-d{2}-d{2}$/.test(valor) ? valor : '';
  };
  const [filtros, setFiltros] = useState<FiltrosState>(() => ({
    empresa: empresaFixa ?? 'Ambas', dataInicio: dataDoLink('dataInicio'), dataFim: dataDoLink('dataFim'), buscaCliente: '',
  }));
  const [periodo, setPeriodo] = useState<PeriodoDashboard>(() => (dataDoLink('dataInicio') || dataDoLink('dataFim') ? 'custom' : 'all'));
  useEffect(() => {
    setFiltros((atual) => ({ ...atual, empresa: empresaFixa ?? 'Ambas' }));
  }, [empresaFixa]);

  const onPeriodoChange = useCallback((proximo: PeriodoDashboard) => {
    setPeriodo(proximo);
    if (proximo === 'all') {
      setFiltros((atual) => ({ ...atual, dataInicio: '', dataFim: '' }));
      return;
    }
    if (proximo === '7' || proximo === '30') {
      const hoje = new Date();
      const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
      const dias = Number(proximo);
      setFiltros((atual) => ({ ...atual, dataInicio: inicioDosUltimosDias(dias), dataFim: hojeIso }));
    }
  }, []);

  const filtrosServico: FiltrosSolicitacoes = useMemo(() => ({
    empresa: empresaFixa ?? filtros.empresa,
    dataInicio: filtros.dataInicio || undefined,
    dataFim: filtros.dataFim || undefined,
  }), [empresaFixa, filtros.empresa, filtros.dataInicio, filtros.dataFim]);

  // O tema acompanha a empresa exibida; não altera a consulta
  useEmpresaDaTela(empresaFixa ?? filtros.empresa);

  const { dados, loading, refreshing, ultimoFetch, error, refetch } = useSolicitacoes({
    pollingMs: POLLING_MS,
    filtros: filtrosServico,
  });

  const statusCounts = useMemo(() => contarPorStatus(dados), [dados]);
  const timeline = useMemo(
    () => porDataComZeros(dados, filtros.dataInicio || undefined, filtros.dataFim || undefined),
    [dados, filtros.dataInicio, filtros.dataFim],
  );
  const motivos = useMemo(() => porMotivo(dados).filter((item) => item.quantidade > 0), [dados]);
  const empresas = useMemo(() => porEmpresa(dados), [dados]);
  const kpis = useMemo(() => calcularKpis(dados), [dados]);
  const dadosDisponiveis = ultimoFetch > 0;

  // Idades são recalculadas a cada minuto; isso não reinicia nada na tela
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const pendencias = useMemo(() => pendenciasOperacionais(dados, statusAtual), [dados]);
  const pendenciasVisiveis = pendencias.slice(0, LIMITE_ATENCAO);
  const etapaComAcao = ETAPAS_COM_ACAO.find((status) => statusCounts[status] > 0);

  const rotaAtenDes = user ? rotaComFiltros(user, empresaFixa ?? filtros.empresa, filtros, ETAPAS_COM_ACAO) : undefined;
  const etapaHref = (status: StatusSolicitacao) => user
    ? rotaComFiltros(user, empresaFixa ?? filtros.empresa, filtros, [status])
    : undefined;
  const pendenciaHref = (solicitacao: Solicitacao) => user
    ? rotaComFiltros(user, solicitacao.empresa, filtros, [statusAtual(solicitacao)], solicitacao.id)
    : undefined;


  const controleEmpresa: ReactNode = empresaFixa ? (
    <span className="dashboard-company-fixed" aria-label={`Empresa: ${empresaFixa}`}>{empresaFixa}</span>
  ) : (
    <select
      className="dashboard-company-select"
      value={filtros.empresa}
      onChange={(event) => setFiltros({ ...filtros, empresa: event.target.value as FiltrosState['empresa'] })}
      aria-label="Filtrar empresa"
    >
      <option value="Ambas">Todas as empresas</option>
      <option value="Alinare">Alinare</option>
      <option value="Novitah">Novitah</option>
    </select>
  );

  return (
    <>
      <div className="dashboard-page">
        <header className="dashboard-header">
          <div className="dashboard-heading-copy">
            <h1>Dashboard</h1>
          </div>
        </header>

        <DashboardToolbar
          filtros={filtros}
          onChange={setFiltros}
          periodo={periodo}
          onPeriodoChange={onPeriodoChange}
          ultimoFetch={ultimoFetch}
          error={error}
          refreshing={refreshing}
          onRefresh={refetch}
          controleEmpresa={controleEmpresa}
        />

        <section className="dashboard-flow-section" aria-labelledby="dashboard-flow-title">
          <h2 id="dashboard-flow-title" className="sr-only">Fluxo da operação</h2>

          {loading ? (
            <div className="dashboard-flow-track is-loading" aria-label="Carregando fluxo da operação">
              {ETAPAS.map(({ status }) => <div className="dashboard-stage-skeleton" key={status} />)}
            </div>
          ) : (
            <div className={`dashboard-flow-track ${!dadosDisponiveis ? 'is-unavailable' : ''}`}>
              {ETAPAS.map(({ status, label, detalhe, Icone }) => {
                const href = etapaHref(status);
                const count = dadosDisponiveis ? statusCounts[status] : undefined;
                const destaque = status === etapaComAcao;
                const content = <>
                  <span className={`dashboard-stage-icon stage-${status}`}><Icone size={20} strokeWidth={1.7} aria-hidden="true" /></span>
                  <span className="dashboard-stage-count">{count?.toLocaleString('pt-BR') ?? '—'}</span>
                  <span className="dashboard-stage-label">{label}</span>
                  {detalhe && <span className="dashboard-stage-detail">{detalhe}</span>}
                  {href && <span className="dashboard-stage-arrow" aria-hidden="true"><ChevronRight size={15} /></span>}
                </>;

                return href ? (
                  <Link key={status} to={href} className={`dashboard-stage ${destaque ? 'is-current' : ''}`} title={`Abrir solicitações: ${label}`}>
                    {content}
                  </Link>
                ) : (
                  <div key={status} className={`dashboard-stage is-readonly ${destaque ? 'is-current' : ''}`} title="A lista de solicitações não está disponível para este perfil">
                    {content}
                  </div>
                );
              })}
            </div>
          )}

          <div className="dashboard-flow-other">
            {user && etapaHref('reprovado') ? (
              <Link to={etapaHref('reprovado')!} className="dashboard-other-status">
                <XCircle size={15} aria-hidden="true" /> <span>Reprovados</span> <strong>{dadosDisponiveis ? statusCounts.reprovado.toLocaleString('pt-BR') : '—'}</strong>
              </Link>
            ) : (
              <span className="dashboard-other-status is-readonly">
                <XCircle size={15} aria-hidden="true" /> <span>Reprovados</span> <strong>{dadosDisponiveis ? statusCounts.reprovado.toLocaleString('pt-BR') : '—'}</strong>
              </span>
            )}
            {Object.entries(statusCounts).some(([status, quantidade]) => quantidade > 0 && !ETAPAS.some((etapa) => etapa.status === status) && status !== 'reprovado') && (
              <span className="dashboard-other-note">Outros estados permanecem na lista de solicitações.</span>
            )}
          </div>
        </section>

        <div className="dashboard-primary-grid">
          <section className="dashboard-panel dashboard-attention-panel" aria-labelledby="dashboard-attention-title">
            <div className="dashboard-section-heading">
              <div className="dashboard-section-title-row">
                <h2 id="dashboard-attention-title">Em atenção</h2>
                {dadosDisponiveis && pendencias.length > 0 && <span className="dashboard-count-badge" aria-label={`${pendencias.length} pendências`}>{pendencias.length}</span>}
              </div>
              {rotaAtenDes && pendencias.length > LIMITE_ATENCAO && (
                <Link to={rotaAtenDes} className="dashboard-text-link">Ver tudo <ChevronRight size={15} aria-hidden="true" /></Link>
              )}
            </div>
            {loading ? (
              <div className="dashboard-attention-skeleton" aria-label="Carregando pendências"><span /><span /><span /></div>
            ) : !dadosDisponiveis ? (
              <PainelErro onRetry={refetch} />
            ) : error && pendencias.length === 0 ? (
              <PainelErro onRetry={refetch} />
            ) : pendencias.length === 0 ? (
              <PainelVazio>Nenhuma pendência nesta seleção.</PainelVazio>
            ) : (
              <PendenciasLista items={pendenciasVisiveis} hrefFor={pendenciaHref} agora={agora} />
            )}
          </section>

          <section className="dashboard-panel dashboard-movement-panel" aria-labelledby="dashboard-movement-title">
            <div className="dashboard-section-heading">
              <div>
                <h2 id="dashboard-movement-title">Solicitações no período</h2>
              </div>
            </div>
            <div className="dashboard-volume-total">
              <strong>{dadosDisponiveis ? dados.length.toLocaleString('pt-BR') : '—'}</strong>
              <span>reversos solicitados</span>
            </div>
            <div className="dashboard-chart-area">
              {loading ? <div className="dashboard-chart-skeleton" aria-label="Carregando gráfico" />
                : !dadosDisponiveis ? <PainelErro onRetry={refetch} />
                  : timeline.length === 0 ? <PainelVazio>Sem solicitações no período selecionado.</PainelVazio>
                    : <ChartTimeline data={timeline} />}
            </div>
          </section>
        </div>

        <section className="dashboard-secondary-section" aria-labelledby="dashboard-secondary-title">
          <div className="dashboard-section-heading dashboard-secondary-heading">
            <div>
              <h2 id="dashboard-secondary-title">Análise complementar</h2>
            </div>
            {dadosDisponiveis && !error && dados.length > 0 && (
              <span className="dashboard-secondary-metric">
                <Clock3 size={15} aria-hidden="true" />
                <span>Tempo médio para preencher o formulário</span>
                <strong>{formatarTempo(kpis.tempoMedioSegundos)}</strong>
              </span>
            )}
          </div>

          <div className={`dashboard-secondary-grid ${empresas.length < 2 ? 'has-one-chart' : ''}`}>
            <section className="dashboard-panel dashboard-reason-panel" aria-labelledby="dashboard-reason-title">
              <div className="dashboard-mini-heading">
                <div>
                  <h3 id="dashboard-reason-title">Principais motivos</h3>
                </div>
              </div>
              <div className="dashboard-secondary-chart">
                {loading ? <div className="dashboard-chart-skeleton" aria-label="Carregando motivos" />
                  : !dadosDisponiveis ? <PainelErro onRetry={refetch} />
                    : motivos.length === 0 ? <PainelVazio>Sem registros para agrupar.</PainelVazio>
                      : <ChartMotivo data={motivos} />}
              </div>
            </section>

            {empresas.length > 1 && (
              <section className="dashboard-panel dashboard-company-panel" aria-labelledby="dashboard-company-title">
                <div className="dashboard-mini-heading">
                  <div>
                    <h3 id="dashboard-company-title">Distribuição por empresa</h3>
                  </div>
                </div>
                <div className="dashboard-secondary-chart">
                  {loading ? <div className="dashboard-chart-skeleton" aria-label="Carregando empresas" />
                    : !dadosDisponiveis ? <PainelErro onRetry={refetch} />
                      : <ChartEmpresa data={empresas} />}
                </div>
              </section>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function PendenciasLista({
  items,
  hrefFor,
  agora,
}: {
  items: Pendencia[];
  hrefFor: (solicitacao: Solicitacao) => string | undefined;
  agora: number;
}) {
  return (
    <ul className="dashboard-attention-list">
      {items.map(({ solicitacao, tipo, desde }) => {
        const href = hrefFor(solicitacao);
        const texto = TEXTO_PENDENCIA[tipo];
        const tempo = tempoDesde(desde, agora);
        const contents = <>
          <span className="dashboard-attention-record-code">{ticketCode(solicitacao.id)}</span>
          <span className="dashboard-attention-record-main">
            <span className="dashboard-attention-record-name">{solicitacao.nome_cliente}</span>
            <span className="dashboard-attention-record-meta">{solicitacao.empresa} · {dataCurta(solicitacao.data_solicitacao)}</span>
          </span>
          <span className="dashboard-attention-record-status">
            <span className={`dashboard-attention-record-situation tipo-${tipo}`}>{texto.situacao}</span>
            {tempo && <span className="dashboard-attention-record-age">{`${texto.espera} ${tempo}`}</span>}
          </span>
          {href && <ChevronRight className="dashboard-attention-record-arrow" size={18} aria-hidden="true" />}
        </>;

        return (
          <li key={solicitacao.id} className={`dashboard-attention-item tipo-${tipo}`}>
            {href ? <Link className="dashboard-attention-record" to={href}>{contents}</Link>
              : <div className="dashboard-attention-record is-readonly" title="A lista de solicitações não está disponível para este perfil">{contents}</div>}
          </li>
        );
      })}
    </ul>
  );
}
