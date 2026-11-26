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

  /** Ver histórico e restaurar: os mesmos botões na tabela e nos cards. */
  const acoes = (chamado: (typeof filtrados)[number]) => (
    <div className="record-actions">
      <button type="button" className="btn btn-secondary btn-xs always" onClick={() => setSelecionado(chamado)} aria-label={`Ver histórico de ${chamado.nome_cliente}`} title="Ver histórico completo"><Eye size={15} aria-hidden="true" /></button>
      <button type="button" className="btn btn-primary btn-xs always" onClick={() => setIdParaRestaurar(chamado.id)} aria-label={`Restaurar ${chamado.nome_cliente}`} title="Restaurar chamado"><RotateCcw size={14} aria-hidden="true" /> Restaurar</button>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeading
        icon={Archive}
        title="Lixeira"
        description="Os chamados aqui ficam fora das filas de trabalho. Dados, decisões, movimentações, etiquetas e PDFs permanecem guardados. Você pode abrir o histórico completo ou restaurar um chamado."
      />

      <div className="list-toolbar">
        <div className="list-summary">{loading ? 'Carregando' : `${filtrados.length} ${filtrados.length === 1 ? 'chamado' : 'chamados'}`}</div>
        <div className="input-icon" style={{ flex: '1 1 280px', maxWidth: 420 }}>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar cliente ou número do chamado"
            aria-label="Buscar na Lixeira"
            className="input"
            style={{ height: 40, borderRadius: 11 }}
          />
        </div>
      </div>

      {erro && (
        <div className="dashboard-query-alert" role="alert">
          <span>{erro}</span>
          <button type="button" onClick={() => void carregar(true)} disabled={atualizando}>Tentar novamente</button>
        </div>
      )}

      {loading ? (
        <div className="card records-estado" role="status"><div className="skel records-estado-skeleton" /><span>Carregando chamados arquivados...</span></div>
      ) : filtrados.length === 0 ? (
        <div className="card records-estado">
          <div className="records-estado-icone"><Archive size={24} aria-hidden="true" /></div>
          <h3>{busca ? 'Nenhum chamado encontrado' : 'A Lixeira está vazia'}</h3>
          <p>{busca ? 'Tente buscar por outro nome ou número.' : 'Chamados movidos para cá ficam disponíveis para consulta e restauração.'}</p>
        </div>
      ) : (
        <section className="card records-container" aria-label="Chamados na Lixeira">
          <div className="table-wrap responsive">
            <table className="tbl records-table">
              <thead><tr><th>Chamado / Cliente</th><th>Empresa</th><th>Situação</th><th>Movido para a Lixeira</th><th className="r">Ações</th></tr></thead>
              <tbody>{filtrados.map((chamado) => (
                <tr key={chamado.id}>
                  <td>
                    <div className="strong">{codigoPedido(chamado.id)} · {chamado.nome_cliente}</div>
                    <div className="xs muted">#{chamado.codigo_cliente} · {chamado.solicitante} · {chamado.setor}</div>
                  </td>
                  <td>{chamado.empresa}</td>
                  <td>{STATUS_LABEL[statusEfetivo(chamado)]}</td>
                  <td>
                    <div>{dataHora(chamado.inutilizada_em)}</div>
                    {chamado.inutilizada_por_nome && <div className="xs muted">por {chamado.inutilizada_por_nome}</div>}
                  </td>
                  <td className="row-action">{acoes(chamado)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="mobile-cards">
            {filtrados.map((chamado) => (
              <article key={chamado.id} className="m-card">
                <strong className="strong" style={{ display: 'block', overflowWrap: 'anywhere' }}>{codigoPedido(chamado.id)} · {chamado.nome_cliente}</strong>
                <span className="xs muted" style={{ display: 'block' }}>#{chamado.codigo_cliente} · {chamado.solicitante} · {chamado.setor}</span>
                <span className="row-wrap small" style={{ marginTop: 8, gap: '4px 12px' }}>
                  <span className="badge badge-neutral">{STATUS_LABEL[statusEfetivo(chamado)]}</span>
                  <span className="muted">{chamado.empresa}</span>
                </span>
                <span className="xs muted" style={{ display: 'block', marginTop: 8 }}>
                  Movido em {dataHora(chamado.inutilizada_em)}{chamado.inutilizada_por_nome ? ` por ${chamado.inutilizada_por_nome}` : ''}
                </span>
                <div style={{ marginTop: 12 }}>{acoes(chamado)}</div>
              </article>
            ))}
          </div>
          <div className="records-bottom"><span>Exibindo {filtrados.length.toLocaleString('pt-BR')} chamado(s)</span><span className="hide-mobile">Decisões, movimentações e PDFs são preservados</span></div>
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
