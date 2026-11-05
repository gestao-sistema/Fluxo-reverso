import { Archive, ArrowUpRight, CheckCircle2, Clock3, Eye, Inbox, PackageCheck, Tag, Truck } from 'lucide-react';
import type { Solicitacao, StatusSolicitacao } from '../../types';
import { COR_EMPRESA } from '../../services/analytics';
import { statusEfetivo } from '../../lib/situacaoPedido';

const STATUS: Record<StatusSolicitacao, { label: string; color: string; bg: string; icon: typeof Clock3; acao?: string }> = {
  aguardando_aprovacao: { label: 'Aguardando aprovação', color: 'var(--flow-warning)', bg: 'color-mix(in srgb, var(--flow-warning) 14%, transparent)', icon: Clock3 },
  reprovado: { label: 'Rejeitado', color: 'var(--flow-danger)', bg: 'color-mix(in srgb, var(--flow-danger) 14%, transparent)', icon: Clock3 },
  pendente: { label: 'Aguardando etiqueta', color: 'var(--flow-warning)', bg: 'color-mix(in srgb, var(--flow-warning) 14%, transparent)', icon: Clock3, acao: 'Gerar etiqueta' },
  etiqueta_gerada: { label: 'Aguardando postagem', color: 'var(--flow-info)', bg: 'var(--flow-info-soft)', icon: Tag },
  postado: { label: 'Postado', color: 'var(--flow-accent)', bg: 'var(--flow-accent-soft)', icon: PackageCheck },
  em_transito: { label: 'Em trânsito', color: 'var(--flow-orange)', bg: 'color-mix(in srgb, var(--flow-orange) 14%, transparent)', icon: Truck },
  concluido: { label: 'Concluído', color: 'var(--flow-success)', bg: 'color-mix(in srgb, var(--flow-success) 14%, transparent)', icon: CheckCircle2 },
};

interface Props {
  dados: Solicitacao[];
  onToggleStatus?: (id: string, currentStatus: StatusSolicitacao, e: React.MouseEvent) => void;
  onArchive?: (id: string, e: React.MouseEvent) => void;
  onClickRow: (solicitacao: Solicitacao) => void;
  loading: boolean;
  readOnly?: boolean;
  showArchive?: boolean;
  podeAgir?: (status: StatusSolicitacao) => boolean;
}

const formatDate = (value: string) => {
  const [year, month, day] = (value || '').split('-');
  return year && month && day ? `${day}/${month}/${year}` : '—';
};

export default function RecordsList({ dados, onToggleStatus, onArchive, onClickRow, loading, readOnly, showArchive, podeAgir }: Props) {
  if (loading) {
    return <div className="surface-panel records-estado" role="status"><div className="chart-skeleton records-estado-skeleton" /><span>Carregando solicitações...</span></div>;
  }
  if (!dados.length) {
    return <div className="surface-panel records-estado"><div className="records-estado-icone"><Inbox size={24} aria-hidden="true" /></div><h3>Nenhuma solicitação encontrada</h3><p>Experimente alterar os filtros para visualizar outros registros.</p></div>;
  }

  const statusDaSolicitacao = (solicitacao: Solicitacao) => statusEfetivo(solicitacao);
  const renderStatus = (solicitacao: Solicitacao) => {
    const status = statusDaSolicitacao(solicitacao);
    const meta = STATUS[status] ?? STATUS.pendente;
    const Icon = meta.icon;
    return <span className="record-status" style={{ background: meta.bg, color: meta.color }}><Icon size={13} />{meta.label}</span>;
  };
  const actions = (solicitacao: Solicitacao) => {
    const status = statusDaSolicitacao(solicitacao);
    const meta = STATUS[status] ?? STATUS.pendente;
    return (
      <div className="record-actions">
        {!readOnly && meta.acao && onToggleStatus && podeAgir?.(status) !== false && (
          <button className="record-action-progress" type="button" onClick={(e) => { e.stopPropagation(); onToggleStatus(solicitacao.id, status, e); }} title={meta.acao}>
            {meta.acao}<ArrowUpRight size={13} />
          </button>
        )}
        <button className="record-action-view" type="button" onClick={(e) => { e.stopPropagation(); onClickRow(solicitacao); }} aria-label={`Abrir detalhes de ${solicitacao.nome_cliente}`} title="Ver detalhes">
          <Eye size={16} />
        </button>
        {showArchive && (
          <button className="record-action-delete" type="button" onClick={(e) => { e.stopPropagation(); onArchive?.(solicitacao.id, e); }} aria-label={`Mover solicitação de ${solicitacao.nome_cliente} para a Lixeira`} title="Mover para a Lixeira">
            <Archive size={16} />
          </button>
        )}
      </div>
    );
  };

  return (
    <section className="surface-panel records-container" aria-label="Tabela de solicitações">
      <div className="records-table-scroll">
        <table className="data-table records-table">
          <thead><tr>{!readOnly && <th>Etapa atual</th>}<th>Cliente / Código</th><th>Empresa</th><th>Solicitante / Setor</th><th>Motivo</th><th>Data</th><th style={{ textAlign: 'right' }}>Ações</th></tr></thead>
          <tbody>{dados.map((solicitacao) => (
            <tr key={solicitacao.id} onClick={() => onClickRow(solicitacao)} style={{ cursor: 'pointer' }}>
              {!readOnly && <td>{renderStatus(solicitacao)}</td>}
              <td><div className="table-strong record-client">{solicitacao.nome_cliente}</div><div className="record-secondary">#{solicitacao.codigo_cliente}</div></td>
              <td><span className="record-company"><span style={{ background: COR_EMPRESA[solicitacao.empresa] }} />{solicitacao.empresa}</span></td>
              <td><div className="table-strong">{solicitacao.solicitante}</div><div className="record-secondary">{solicitacao.setor}</div></td>
              <td style={{ maxWidth: 240 }}><span className="record-truncate" title={solicitacao.motivo}>{solicitacao.motivo}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>{formatDate(solicitacao.data_solicitacao)}</td>
              <td>{actions(solicitacao)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="records-mobile">{dados.map((solicitacao) => (
        <article key={solicitacao.id} className="record-mobile-card">
          <div className="record-mobile-top"><div><strong>{solicitacao.nome_cliente}</strong><span>#{solicitacao.codigo_cliente} · {solicitacao.empresa}</span></div>{renderStatus(solicitacao)}</div>
          <p>{solicitacao.motivo}</p>
          <div className="record-mobile-bottom"><span>{formatDate(solicitacao.data_solicitacao)}</span>{actions(solicitacao)}</div>
        </article>
      ))}</div>
      <div className="records-bottom"><span>Exibindo {dados.length.toLocaleString('pt-BR')} registro(s)</span><span>Selecione um registro para acessar os detalhes</span></div>
    </section>
  );
}
