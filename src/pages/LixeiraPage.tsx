import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Archive, Eye, RotateCcw, Search } from 'lucide-react';
import PageHeading from '../components/ui/PageHeading';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import RecordDetailModal from '../components/admin/RecordDetailModal';
import type { Solicitacao } from '../types';
import apiService from '../services/apiService';
import { codigoPedido, pedidoCorrespondeABusca } from '../lib/pedido';
import { statusEfetivo } from '../lib/situacaoPedido';
import { STATUS_LABEL } from '../types';

function dataHora(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export default function LixeiraPage() {
  const [chamados, setChamados] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState<Solicitacao | null>(null);
  const [idParaRestaurar, setIdParaRestaurar] = useState<string | null>(null);
  const [restaurando, setRestaurando] = useState(false);

  const carregar = useCallback(async (silencioso = false) => {
    if (silencioso) setAtualizando(true);
    else setLoading(true);
    try {
      setChamados(await apiService.getSolicitacoesLixeira());
      setErro(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível carregar a Lixeira.');
    } finally {
      setLoading(false);
      setAtualizando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const filtrados = useMemo(() => {
    if (!busca.trim()) return chamados;
    return chamados.filter((chamado) => pedidoCorrespondeABusca(chamado, busca));
  }, [busca, chamados]);

  const restaurar = async () => {
    if (!idParaRestaurar) return;
    setRestaurando(true);
    try {
      await apiService.restaurarSolicitacao(idParaRestaurar);
      toast.success('Chamado restaurado.');
      setIdParaRestaurar(null);
      await carregar(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível restaurar o chamado.');
    } finally {
      setRestaurando(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading icon={Archive} title="Lixeira" />
      <p className="max-w-3xl text-sm text-slate-600">
        Os chamados aqui ficam fora das filas de trabalho. Dados, decisões, movimentações, etiquetas e PDFs permanecem guardados. Você pode abrir o histórico completo ou restaurar um chamado.
      </p>

      <div className="list-toolbar">
        <div className="list-summary">{loading ? 'Carregando' : `${filtrados.length} ${filtrados.length === 1 ? 'chamado' : 'chamados'}`}</div>
        <label className="relative block w-full max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar cliente ou número do chamado"
            aria-label="Buscar na Lixeira"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </label>
      </div>

      {erro && (
        <div className="dashboard-query-alert" role="alert">
          <span>{erro}</span>
          <button type="button" onClick={() => void carregar(true)} disabled={atualizando}>Tentar novamente</button>
        </div>
      )}

      {loading ? (
        <div className="surface-panel records-estado" role="status"><div className="chart-skeleton records-estado-skeleton" /><span>Carregando chamados arquivados...</span></div>
      ) : filtrados.length === 0 ? (
        <div className="surface-panel records-estado">
          <div className="records-estado-icone"><Archive size={24} aria-hidden="true" /></div>
          <h3>{busca ? 'Nenhum chamado encontrado' : 'A Lixeira está vazia'}</h3>
          <p>{busca ? 'Tente buscar por outro nome ou número.' : 'Chamados movidos para cá ficam disponíveis para consulta e restauração.'}</p>
        </div>
      ) : (
        <section className="surface-panel records-container" aria-label="Chamados na Lixeira">
          <div className="records-table-scroll">
            <table className="data-table records-table">
              <thead><tr><th>Chamado / Cliente</th><th>Empresa</th><th>Situação</th><th>Movido para a Lixeira</th><th style={{ textAlign: 'right' }}>Ações</th></tr></thead>
              <tbody>{filtrados.map((chamado) => (
                <tr key={chamado.id}>
                  <td>
                    <div className="table-strong">{codigoPedido(chamado.id)} · {chamado.nome_cliente}</div>
                    <div className="record-secondary">#{chamado.codigo_cliente} · {chamado.solicitante} · {chamado.setor}</div>
                  </td>
                  <td>{chamado.empresa}</td>
                  <td>{STATUS_LABEL[statusEfetivo(chamado)]}</td>
                  <td>
                    <div>{dataHora(chamado.inutilizada_em)}</div>
                    {chamado.inutilizada_por_nome && <div className="record-secondary">por {chamado.inutilizada_por_nome}</div>}
                  </td>
                  <td>
                    <div className="record-actions">
                      <button type="button" className="record-action-view" onClick={() => setSelecionado(chamado)} aria-label={`Ver histórico de ${chamado.nome_cliente}`} title="Ver histórico completo"><Eye size={16} /></button>
                      <button type="button" className="record-action-progress" onClick={() => setIdParaRestaurar(chamado.id)} aria-label={`Restaurar ${chamado.nome_cliente}`} title="Restaurar chamado"><RotateCcw size={15} /> Restaurar</button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="records-bottom"><span>Exibindo {filtrados.length.toLocaleString('pt-BR')} chamado(s)</span><span>Decisões, movimentações e PDFs são preservados</span></div>
        </section>
      )}

      <RecordDetailModal isOpen={!!selecionado} solicitacao={selecionado} onClose={() => setSelecionado(null)} />
      <ConfirmDialog
        open={!!idParaRestaurar}
        title="Restaurar chamado?"
        message="O chamado voltará às listas ativas, mantendo o registro de que foi movido e restaurado."
        confirmLabel="Restaurar chamado"
        tone="primary"
        busy={restaurando}
        onCancel={() => setIdParaRestaurar(null)}
        onConfirm={() => void restaurar()}
      />
    </div>
  );
}
