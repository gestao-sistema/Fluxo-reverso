// ── Resumo de não conformidades no dashboard ─────────────────────────────────
// Mesmo período e empresa dos filtros do dashboard; o detalhe fica no painel de NC.
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Hourglass, Package, ShieldAlert, Wallet } from 'lucide-react';
import { useNaoConformidades } from '../../hooks/useNaoConformidades';
import { calcularPainelNc, formatarMoeda, formatarPct } from '../../lib/ncCalculos';
import '../../styles/nc.css';

interface NcResumoDashboardProps {
  dataInicio: string;
  dataFim: string;
  /** null = todas as empresas */
  empresa: string | null;
}

export default function NcResumoDashboard({ dataInicio, dataFim, empresa }: NcResumoDashboardProps) {
  const { ncs, listas, loading, erro } = useNaoConformidades();
  const i = useMemo(
    () => calcularPainelNc(ncs, { dataInicio, dataFim, ano: new Date().getFullYear(), empresa }, listas).indicadores,
    [ncs, listas, dataInicio, dataFim, empresa]
  );

  const cards = [
    { rotulo: 'NCs no período', valor: String(i.registradas), dica: 'Com origem informada', cor: '#14a5b4', soft: '#e9f8f8', Icon: ShieldAlert },
    { rotulo: 'NCs em aberto', valor: String(i.emAberto), dica: 'Aberta ou em tratativa', cor: '#e0a044', soft: '#fff7ea', Icon: Hourglass },
    { rotulo: 'Custo líquido das NCs', valor: formatarMoeda(i.custoLiquido), dica: 'Custo total − reembolso dos Correios', cor: '#d75e6a', soft: '#fff0f1', Icon: Wallet },
    { rotulo: 'NCs que geraram reversa', valor: formatarPct(i.pctComReversa), dica: `${i.comReversa} de ${i.registradas} NCs`, cor: '#7a5fc0', soft: '#f3efff', Icon: Package },
  ];

  return (
    <section aria-label="Não conformidades" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '16px 1px 1px' }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: '#1a304b', margin: 0, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Não conformidades</h2>
          <p style={{ color: '#93a0b0', fontSize: 11, margin: '4px 0 0' }}>Acompanhe as não conformidades registradas. Mesmo período e empresa dos filtros acima.</p>
        </div>
        <Link to="/admin/nc/painel" className="btn btn-secondary">Painel de NC <ArrowRight size={13} /></Link>
      </div>
      {erro ? (
        <div className="chart-empty" style={{ height: 90 }}>{erro}</div>
      ) : (
        <div className="nc-kpis nc-kpis-4">
          {cards.map(({ rotulo, valor, dica, cor, soft, Icon }) => (
            <div key={rotulo} className="kpi-card" style={{ '--stat-color': cor, '--stat-soft': soft } as CSSProperties}>
              <div className="kpi-top">
                <span className="kpi-label">{rotulo}</span>
                <span className="kpi-icon"><Icon size={17} /></span>
              </div>
              {loading ? <div className="kpi-loading" /> : <div className="kpi-value">{valor}</div>}
              <div className="kpi-hint">{dica}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
