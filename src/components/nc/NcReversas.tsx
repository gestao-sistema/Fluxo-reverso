// ── Reversas geradas a partir da NC ──────────────────────────────────────────
// A tela da NC permite gerar reversas já vinculadas a ela; uma NC pode gerar mais de uma reversa.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Package, Plus } from 'lucide-react';
import apiService from '../../services/apiService';
import { useAuth } from '../../context/AuthContext';
import { podeAbrirFormulario } from '../../lib/perfil';
import { formatarDataBr, ncEmAberto } from '../../lib/ncCalculos';
import RecordDetailModal from '../admin/RecordDetailModal';
import { EMPRESAS_REVERSA, STATUS_LABEL } from '../../types';
import { statusEfetivo } from '../../lib/situacaoPedido';
import type { NaoConformidade, Solicitacao } from '../../types';

interface Props {
  nc: NaoConformidade;
  /** Avisa a página quando uma reversa muda (atualiza contagem e linha do tempo) */
  onAlterada: () => void;
}

export default function NcReversas({ nc, onAlterada }: Props) {
  const { user } = useAuth();
  const [reversas, setReversas] = useState<Solicitacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [selecionada, setSelecionada] = useState<Solicitacao | null>(null);

  const carregar = useCallback(async () => {
    try {
      setReversas(await apiService.getReversasDaNc(nc.id));
    } catch {
      setReversas([]);
    } finally {
      setCarregando(false);
    }
  }, [nc.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const empresaReversa = EMPRESAS_REVERSA.find((e) => e === nc.empresa);
  let bloqueio: string | null = null;
  if (!empresaReversa) {
    bloqueio = `A reversa está disponível para ${EMPRESAS_REVERSA.join(' e ')}. Esta NC é de ${nc.empresa ?? 'empresa não informada'}.`;
  } else if (!ncEmAberto(nc.status)) {
    bloqueio = 'Para gerar uma reversa, a NC precisa estar Aberta ou Em tratativa.';
  } else if (user && !podeAbrirFormulario(user, empresaReversa)) {
    bloqueio = `Você não tem acesso ao formulário de reversa da ${empresaReversa}.`;
  }

  const fecharDetalhe = () => {
    setSelecionada(null);
    carregar();
    onAlterada();
  };

  return (
    <section className="surface-panel" style={{ overflow: 'hidden' }} aria-label="Reversas da NC">
      <div className="panel-heading" style={{ alignItems: 'center' }}>
        <div>
          <span className="panel-kicker"><Package size={12} /> LOGÍSTICA REVERSA</span>
          <h2 className="panel-title">Reversas desta NC</h2>
          <p className="panel-desc">Cada reversa tem a própria etapa, o código de rastreio e a etiqueta dos Correios.</p>
        </div>
        {!bloqueio && empresaReversa && (
          <Link to={`/admin/${empresaReversa.toLowerCase()}?nc=${nc.id}`} className="btn-primary">
            <Plus size={14} /> Gerar reversa
          </Link>
        )}
      </div>

      {bloqueio && <p className="nc-aviso">{bloqueio}</p>}

      {carregando ? (
        <div className="chart-skeleton" style={{ height: 80, margin: '0 23px 20px' }} />
      ) : reversas.length === 0 ? (
        <div className="chart-empty" style={{ height: 100 }}>Nenhuma reversa gerada a partir desta NC.</div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table" style={{ minWidth: 680 }}>
            <thead>
              <tr>
                <th>Solicitada em</th>
                <th>Empresa</th>
                <th>Cliente</th>
                <th>Etapa</th>
                <th>Rastreio</th>
                <th>Etiqueta</th>
              </tr>
            </thead>
            <tbody>
              {reversas.map((r) => (
                <tr key={r.id} className="nc-row-link" onClick={() => setSelecionada(r)}>
                  <td className="table-strong">
                    <button type="button" className="text-left" onClick={(e) => { e.stopPropagation(); setSelecionada(r); }}>
                      {formatarDataBr(r.data_solicitacao)}
                    </button>
                  </td>
                  <td>{r.empresa}</td>
                  <td>{r.nome_cliente}</td>
                  <td>{STATUS_LABEL[statusEfetivo(r)] ?? r.status}</td>
                  <td>{r.codigo_rastreio ?? '—'}</td>
                  <td>{r.etiqueta_path ? <span className="inline-flex items-center gap-1"><FileText size={13} /> PDF</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RecordDetailModal isOpen={!!selecionada} solicitacao={selecionada} onClose={fecharDetalhe} />
    </section>
  );
}
