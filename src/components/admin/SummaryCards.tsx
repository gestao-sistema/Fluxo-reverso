import { BadgeCheck, CheckCircle2, Clock3, Package, PackageCheck, Tag, Truck } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Kpis } from '../../services/analytics';
import type { StatusSolicitacao } from '../../types';

interface Props {
  kpis: Kpis;
  loading: boolean;
  activeStatuses?: Set<StatusSolicitacao>;
  onToggle?: (status: StatusSolicitacao) => void;
}

type Card = { label: string; value: number; hint: string; icon: LucideIcon; color: string; soft: string; status: StatusSolicitacao | null };

export default function SummaryCards({ kpis, loading, activeStatuses, onToggle }: Props) {
  const cards: Card[] = [
    { label:'Total de solicitações', value:kpis.total, hint:'Registros no período', icon:Package, color:'var(--flow-accent)', soft:'color-mix(in srgb, var(--flow-accent) 14%, transparent)', status:null },
    { label:'Aguardando aprovação', value:kpis.aguardandoAprovacao, hint:'Na fila do setor aprovador', icon:BadgeCheck, color:'var(--flow-warning)', soft:'color-mix(in srgb, var(--flow-warning) 14%, transparent)', status:'aguardando_aprovacao' },
    { label:'Aguardando etiqueta', value:kpis.pendentes, hint:'Solicitações aprovadas', icon:Clock3, color:'var(--flow-warning)', soft:'color-mix(in srgb, var(--flow-warning) 18%, transparent)', status:'pendente' },
    { label:'Aguardando check-in', value:kpis.etiquetaGerada, hint:'Etiqueta dos Correios vinculada', icon:Tag, color:'var(--flow-info)', soft:'color-mix(in srgb, var(--flow-info) 14%, transparent)', status:'etiqueta_gerada' },
    { label:'Postados', value:kpis.postados, hint:'Enviados pelos clientes', icon:PackageCheck, color:'var(--flow-success)', soft:'color-mix(in srgb, var(--flow-success) 14%, transparent)', status:'postado' },
    { label:'Em trânsito', value:kpis.emTransito, hint:'No fluxo de transporte', icon:Truck, color:'var(--flow-orange)', soft:'color-mix(in srgb, var(--flow-orange) 14%, transparent)', status:'em_transito' },
    { label:'Concluídos', value:kpis.concluidos, hint:'Processos finalizados', icon:CheckCircle2, color:'var(--flow-success)', soft:'color-mix(in srgb, var(--flow-success) 14%, transparent)', status:'concluido' },
  ];
  return (
    <div className="kpi-grid" aria-label="Indicadores operacionais">
      {cards.map(({ label,value,hint,icon:Icon,color,soft,status }) => {
        const interactive = status !== null && !!onToggle;
        const selected = status !== null && !!activeStatuses?.has(status);
        const style = { '--stat-color':color, '--stat-soft':soft } as CSSProperties;
        const contents = <>
          <div className="kpi-top"><span className="kpi-label">{label}</span><span className="kpi-icon"><Icon size={18} strokeWidth={2}/></span></div>
          {loading ? <div className="kpi-loading"/> : <span className="kpi-value">{value.toLocaleString('pt-BR')}</span>}
          <span className="kpi-hint">{hint}</span>
          {selected && <span className="kpi-selected-label">✓ Filtro ativo</span>}
        </>;
        return interactive ? (
          <button type="button" key={label} style={style} className={`kpi-card is-clickable ${selected ? 'is-selected' : ''}`} onClick={() => onToggle?.(status!)} aria-pressed={selected} title={`Filtrar gráficos: ${label}`}>
            {contents}
          </button>
        ) : <div key={label} className="kpi-card" style={style}>{contents}</div>;
      })}
    </div>
  );
}
