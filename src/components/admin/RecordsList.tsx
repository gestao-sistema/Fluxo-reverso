// ── Lista de pedidos (padrão visual, seções 13 e 15) ─────────────────────────
// Desktop: tabela .tbl (etapa em badge, cliente, empresa, solicitante com avatar, motivo, data, ações).
// Até 760 px a tabela some e os mesmos registros viram cards (.mobile-cards), com a mesma informação
// e as mesmas ações. O registro inteiro abre o detalhe; as ações têm botão próprio.
import { Archive, ArrowUpRight, Eye, Inbox } from 'lucide-react';
import type { Solicitacao, StatusSolicitacao } from '../../types';
import { COR_EMPRESA } from '../../services/analytics';
import { statusEfetivo } from '../../lib/situacaoPedido';
import { iniciais } from '../../lib/iniciais';

type Tom = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'accent';

// Estados do padrão (seção 23.5): aguardando aprovação em warn, rejeitado em danger, aguardando expedição em accent,
// em trânsito em info, concluído em ok.
const STATUS: Record<StatusSolicitacao, { label: string; tom: Tom; acao?: string }> = {
  aguardando_aprovacao: { label: 'Aguardando aprovação', tom: 'warn' },
  reprovado: { label: 'Rejeitado', tom: 'danger' },
  pendente: { label: 'Aguardando etiqueta', tom: 'accent', acao: 'Gerar etiqueta' },
  etiqueta_gerada: { label: 'Aguardando postagem', tom: 'accent' },
  postado: { label: 'Postado', tom: 'info' },
  em_transito: { label: 'Em trânsito', tom: 'info' },
  concluido: { label: 'Concluído', tom: 'ok' },
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
    return (
      <div className="card records-estado" role="status">
        <div className="skel records-estado-skeleton" />
        <span>Carregando solicitações...</span>
      </div>
    );
  }
  if (!dados.length) {
    return (
      <div className="card records-estado">
        <div className="records-estado-icone"><Inbox size={24} aria-hidden="true" /></div>
        <h3>Nenhuma solicitação encontrada</h3>
        <p>Experimente alterar os filtros para visualizar outros registros.</p>
      </div>
    );
  }

  const renderStatus = (solicitacao: Solicitacao) => {
    const meta = STATUS[statusEfetivo(solicitacao)] ?? STATUS.pendente;
    return <span className={`badge badge-${meta.tom}`}>{meta.label}</span>;
  };

  const actions = (solicitacao: Solicitacao) => {
    const status = statusEfetivo(solicitacao);
    const meta = STATUS[status] ?? STATUS.pendente;
    return (
      <div className="record-actions">
        {!readOnly && meta.acao && onToggleStatus && podeAgir?.(status) !== false && (
          <button className="btn btn-primary btn-xs always" type="button" onClick={(e) => { e.stopPropagation(); onToggleStatus(solicitacao.id, status, e); }} title={meta.acao}>
            {meta.acao}<ArrowUpRight size={13} aria-hidden="true" />
          </button>
        )}
        <button className="btn btn-secondary btn-xs always" type="button" onClick={(e) => { e.stopPropagation(); onClickRow(solicitacao); }} aria-label={`Abrir detalhes de ${solicitacao.nome_cliente}`} title="Ver detalhes">
          <Eye size={15} aria-hidden="true" />
        </button>
        {showArchive && (
          <button className="btn btn-ghost btn-xs always record-archive" type="button" onClick={(e) => { e.stopPropagation(); onArchive?.(solicitacao.id, e); }} aria-label={`Mover solicitação de ${solicitacao.nome_cliente} para a Lixeira`} title="Mover para a Lixeira">
            <Archive size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  };

  return (
    <section className="card records-container" aria-label="Tabela de solicitações">
      <div className="table-wrap responsive">
        <table className="tbl records-table">
          <thead>
            <tr>
              {!readOnly && <th>Etapa atual</th>}
              <th>Cliente / Código</th>
              <th>Empresa</th>
              <th>Solicitante / Setor</th>
              <th className="col-motivo">Motivo</th>
              <th className="r">Data</th>
              <th className="r">Ações</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((solicitacao) => (
              <tr key={solicitacao.id} onClick={() => onClickRow(solicitacao)}>
                {!readOnly && <td>{renderStatus(solicitacao)}</td>}
                <td>
                  <div className="strong truncate" title={solicitacao.nome_cliente}>{solicitacao.nome_cliente}</div>
                  <div className="xs muted tnum">#{solicitacao.codigo_cliente}</div>
                </td>
                <td><span className="record-company"><span style={{ background: COR_EMPRESA[solicitacao.empresa] }} />{solicitacao.empresa}</span></td>
                <td>
                  <div className="person">
                    <span className="avatar sm" aria-hidden="true">{iniciais(solicitacao.solicitante)}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="strong">{solicitacao.solicitante}</div>
                      <div className="xs muted">{solicitacao.setor}</div>
                    </div>
                  </div>
                </td>
                <td className="col-motivo" style={{ maxWidth: 240 }}><span className="record-truncate" title={solicitacao.motivo}>{solicitacao.motivo}</span></td>
                <td className="r num" style={{ whiteSpace: 'nowrap' }}>{formatDate(solicitacao.data_solicitacao)}</td>
                <td className="row-action">{actions(solicitacao)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-cards">
        {dados.map((solicitacao) => (
          <article key={solicitacao.id} className="m-card">
            <button type="button" className="m-card-main" onClick={() => onClickRow(solicitacao)} aria-label={`Abrir pedido de ${solicitacao.nome_cliente}`}>
              <span className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ minWidth: 0 }}>
                  <strong className="strong" style={{ display: 'block', overflowWrap: 'anywhere' }}>{solicitacao.nome_cliente}</strong>
                  <span className="xs muted tnum" style={{ display: 'block' }}>#{solicitacao.codigo_cliente} · {solicitacao.empresa}</span>
                </span>
                {!readOnly && renderStatus(solicitacao)}
              </span>
              <span className="small" style={{ display: 'block', margin: '10px 0 0' }}>{solicitacao.motivo}</span>
            </button>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
              <span className="xs muted tnum">{formatDate(solicitacao.data_solicitacao)}</span>
              {actions(solicitacao)}
            </div>
          </article>
        ))}
      </div>

      <div className="records-bottom"><span>Exibindo {dados.length.toLocaleString('pt-BR')} registro(s)</span><span className="hide-mobile">Selecione um registro para acessar os detalhes</span></div>
    </section>
  );
}
