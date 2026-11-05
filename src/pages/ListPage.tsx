import { useMemo, useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Download, ClipboardList, FileSpreadsheet } from 'lucide-react';
import PageHeading from '../components/ui/PageHeading';
import { useSolicitacoes } from '../hooks/useSolicitacoes';
import { isAdmin, type FiltrosSolicitacoes, type Solicitacao, type StatusSolicitacao, STATUS_LABEL } from '../types';
import { useAuth } from '../context/AuthContext';
import { useEmpresaDaTela } from '../context/TemaContext';
import apiService from '../services/apiService';

import DashboardFilters, { type FiltrosState } from '../components/admin/DashboardFilters';
import RecordsList from '../components/admin/RecordsList';
import RecordDetailModal from '../components/admin/RecordDetailModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { linhaSegura } from '../lib/planilhaSegura';
import { statusDoBancoPara, statusEfetivo } from '../lib/situacaoPedido';

// Intervalo de polling (15s)
const POLLING_MS = 15_000;

type FiltroListaUI = 'pendentes' | 'concluidos' | 'todos';

export default function ListPage() {
  const { user } = useAuth();
  const location = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const queryEmpresa = searchParams.get('empresa') as 'Alinare' | 'Novitah' | null;
  const queryStatuses = useMemo(() => (searchParams.get('status') ?? '').split(',').filter(Boolean)
    .filter((value): value is StatusSolicitacao =>
      ['aguardando_aprovacao', 'reprovado', 'pendente', 'etiqueta_gerada', 'postado', 'em_transito', 'concluido'].includes(value),
    ), [searchParams]);
  const modoHistorico = searchParams.get('visao') === 'historico';
  const solicitacaoId = searchParams.get('solicitacaoId');

  const temGeral = user?.telas.includes('lista-geral');
  const temAlinare = user?.telas.includes('lista-alinare');
  const temNovitah = user?.telas.includes('lista-novitah');

  let empresaFixa: 'Alinare' | 'Novitah' | null = null;
  if (!temGeral) {
    if (queryEmpresa === 'Alinare' && temAlinare) empresaFixa = 'Alinare';
    else if (queryEmpresa === 'Novitah' && temNovitah) empresaFixa = 'Novitah';
    else if (temAlinare && !temNovitah) empresaFixa = 'Alinare';
    else if (temNovitah && !temAlinare) empresaFixa = 'Novitah';
  } else if (queryEmpresa && (queryEmpresa === 'Alinare' || queryEmpresa === 'Novitah')) {
    empresaFixa = queryEmpresa;
  }

  // ── Filtros globais (topo) ──
  const [filtros, setFiltros] = useState<FiltrosState>({
    empresa: empresaFixa ?? 'Ambas',
    dataInicio: searchParams.get('dataInicio') ?? '',
    dataFim: searchParams.get('dataFim') ?? '',
    buscaCliente: '',
  });
  // Só o tema visual acompanha a empresa exibida no filtro
  useEmpresaDaTela(empresaFixa ?? filtros.empresa);

  // ── Filtro local de status ──
  const [verFiltro, setVerFiltro] = useState<FiltroListaUI>(() => queryStatuses.length || modoHistorico ? 'todos' : 'pendentes');
  const [statusDoDashboard, setStatusDoDashboard] = useState<StatusSolicitacao[]>(queryStatuses);
  const filtroListaInicial = useRef(verFiltro);

  // ── Modal de detalhe ──
  const [selectedRecord, setSelectedRecord] = useState<Solicitacao | null>(null);
  const [autoOpenedId, setAutoOpenedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const filtroInicial: FiltroListaUI = queryStatuses.length || modoHistorico ? 'todos' : 'pendentes';
    filtroListaInicial.current = filtroInicial;
    setVerFiltro(filtroInicial);
    setStatusDoDashboard(queryStatuses);
  }, [queryStatuses, modoHistorico]);

  useEffect(() => {
    if (filtroListaInicial.current === verFiltro) return;
    filtroListaInicial.current = verFiltro;
    setStatusDoDashboard([]);
  }, [verFiltro]);

  // Junta filtros da barra + toggle local
  const filtrosServico: FiltrosSolicitacoes = useMemo(() => {
    let statusFilter: StatusSolicitacao | StatusSolicitacao[] | undefined;
    if (statusDoDashboard.length > 0 && verFiltro === 'todos') {
      // Aguardando aprovação e rejeitado ficam gravados como "pendente": a seleção exata é feita abaixo
      statusFilter = statusDoBancoPara(statusDoDashboard);
    } else if (verFiltro === 'pendentes') {
      statusFilter = ['aguardando_aprovacao', 'pendente', 'etiqueta_gerada', 'postado', 'em_transito'];
    } else if (verFiltro === 'concluidos') {
      statusFilter = 'concluido';
    }

    return {
      empresa: empresaFixa ?? filtros.empresa,
      dataInicio: filtros.dataInicio || undefined,
      dataFim: filtros.dataFim || undefined,
      status: statusFilter,
      buscaCliente: filtros.buscaCliente || undefined,
    };
  }, [filtros, verFiltro, empresaFixa, statusDoDashboard]);

  const { dados: dadosDoServidor, loading, refreshing, ultimoFetch, error, refetch } = useSolicitacoes({
    pollingMs: POLLING_MS,
    filtros: filtrosServico,
  });

  // A situação que a pessoa vê vem da aprovação e da logística juntas (ver statusEfetivo)
  const dados = useMemo(() => {
    if (statusDoDashboard.length > 0 && verFiltro === 'todos') {
      return dadosDoServidor.filter((item) => statusDoDashboard.includes(statusEfetivo(item)));
    }
    if (verFiltro === 'pendentes') return dadosDoServidor.filter((item) => statusEfetivo(item) !== 'reprovado');
    return dadosDoServidor;
  }, [dadosDoServidor, statusDoDashboard, verFiltro]);

  useEffect(() => {
    if (!solicitacaoId || solicitacaoId === autoOpenedId || loading || error) return;
    const record = dados.find((item) => item.id === solicitacaoId);
    if (record) {
      setSelectedRecord(record);
      setAutoOpenedId(solicitacaoId);
    }
  }, [solicitacaoId, autoOpenedId, dados, loading, error]);

  // ── Ações ──

  const handleArchive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // impede abrir modal da linha
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await apiService.inutilizarSolicitacao(deleteId);
      toast.success('Chamado movido para a Lixeira.');
      setDeleteId(null);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível apagar a solicitação.');
    } finally {
      setDeleting(false);
    }
  };

  // ── Exportar XLSX ──
  const handleExportXlsx = async () => {
    try {
      // Busca base completa do grupo (sem filtros de status/data)
      const empresa = empresaFixa ?? filtros.empresa;
      const dadosExport = await apiService.getSolicitacoes({ empresa: empresa === 'Ambas' ? 'Ambas' : empresa });

      if (!dadosExport.length) {
        toast.error('Nenhum registro para exportar.');
        return;
      }

      const colunas: [keyof Solicitacao, string][] = [
        ['created_at', 'Criado em'],
        ['empresa', 'Empresa'],
        ['solicitante', 'Solicitante'],
        ['setor', 'Setor'],
        ['data_solicitacao', 'Data Solicitação'],
        ['codigo_cliente', 'Código Cliente'],
        ['nome_cliente', 'Nome Cliente'],
        ['endereco_destino_troca', 'Endereço da outra cliente'],
        ['motivo', 'Motivo'],
        ['justificativa_outros', 'Justificativa (Outros)'],
        ['autorizacao', 'Autorização'],
        ['status', 'Status'],
        ['etiqueta_gerada_em', 'Etiqueta Gerada'],
        ['postado_em', 'Postado'],
        ['em_transito_em', 'Em Trânsito'],
        ['concluido_em', 'Concluído'],
        ['codigo_rastreio', 'Código Rastreio'],
        ['ultima_cidade_rastreio', 'Última Cidade'],
        ['anotacoes', 'Anotações'],
      ];

      // Texto digitado por usuários pode começar com =, +, - ou @: a planilha não pode tratá-lo como fórmula.
      const rows = dadosExport.map((r) =>
        linhaSegura(Object.fromEntries(
          colunas.map(([key, header]) => {
            let val = r[key] ?? '';
            if (key === 'status') val = STATUS_LABEL[r.status] ?? r.status;
            else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
              val = new Date(val).toLocaleString('pt-BR', { timeZone: 'UTC' });
            }
            return [header, val];
          })
        ))
      );

      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Solicitações');
      XLSX.writeFile(wb, `reverso_${empresa}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Arquivo exportado com sucesso.');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao exportar. Tente novamente.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading icon={ClipboardList} title={modoHistorico ? "Histórico de pedidos" : "Pedidos"} />

      {/* Filtros */}
      <DashboardFilters
        filtros={filtros}
        onChange={setFiltros}
        onRefresh={refetch}
        ultimoFetch={ultimoFetch}
        isRefreshing={refreshing}
        empresaFixa={empresaFixa ?? undefined}
      />

      <div className="list-toolbar">
        <div className="list-summary">{loading ? 'Carregando' : `${dados.length} ${dados.length === 1 ? 'pedido' : 'pedidos'}`}</div>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={handleExportXlsx} className="btn-secondary"><FileSpreadsheet size={15}/> <span>Exportar XLSX</span> <Download size={13}/></button>
          <div className="segmented" role="group" aria-label="Filtrar por situação">
            {([['pendentes','Em aberto'],['concluidos','Concluídos'],['todos','Todos']] as const).map(([key,label])=><button type="button" key={key} className={verFiltro===key?'active':''} onClick={()=>{setVerFiltro(key);setStatusDoDashboard([])}} aria-pressed={verFiltro===key}>{label}</button>)}
          </div>
        </div>
      </div>

      {error && (
        <div className="dashboard-query-alert" role="alert">
          <span>{ultimoFetch ? 'A consulta falhou. Os registros exibidos são da última atualização bem-sucedida.' : 'Não foi possível consultar as solicitações.'}</span>
          <button type="button" onClick={refetch} disabled={refreshing}>Tentar novamente</button>
        </div>
      )}

      {/* Área da Tabela */}
      <div>
        {/* Lista */}
        {error && !ultimoFetch ? (
          <div className="surface-panel" style={{ padding: 32, textAlign: 'center', color: 'var(--flow-warning)' }} role="status">
            Não foi possível carregar os registros. Tente novamente.
          </div>
        ) : (
          <RecordsList
            dados={dados}
            loading={loading}
            onClickRow={setSelectedRecord}
            showArchive={user ? isAdmin(user) : false}
            onArchive={handleArchive}
            podeAgir={() => false}
          />
        )}
      </div>

      {/* Modal */}
      <RecordDetailModal
        isOpen={!!selectedRecord}
        solicitacao={selectedRecord}
        onClose={() => {
          setSelectedRecord(null);
          if (solicitacaoId) setAutoOpenedId(solicitacaoId);
        }}
      />
      <ConfirmDialog
        open={!!deleteId}
        title="Mover chamado para a Lixeira?"
        message="O chamado sai das filas ativas. Histórico, decisões, emissões e PDFs são preservados. Você poderá restaurá-lo pela Lixeira."
        confirmLabel="Mover para a Lixeira"
        busy={deleting}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
