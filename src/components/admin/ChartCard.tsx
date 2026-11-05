import type { ReactNode } from 'react';
import { ChartNoAxesCombined, Ellipsis, Sparkles } from 'lucide-react';

interface Props { title: string; subtitle?:string;loading?:boolean;isEmpty?:boolean;children:ReactNode;className?:string; }
export default function ChartCard({title,subtitle,loading=false,isEmpty=false,children,className=''}:Props){
  return <section className={`chart-panel ${className}`} aria-label={title}>
    <header className="panel-heading">
      <div><span className="panel-kicker"><Sparkles size={12}/> INSIGHTS / ANALYTICS</span><h3 className="panel-title">{title}</h3>{subtitle && <p className="panel-desc">{subtitle}</p>}</div>
      <span className="panel-icon" aria-hidden="true"><ChartNoAxesCombined size={16}/></span>
    </header>
    <div className="chart-body">
      {loading ? <div className="chart-skeleton" role="status" aria-label="Carregando gráfico"/> : isEmpty ? <div className="chart-empty"><Ellipsis size={26}/><span>Sem dados para os filtros selecionados.</span></div> : children}
    </div>
    <div className="chart-bottom-note"><span>Fonte: solicitações registradas</span><span>Atualização automática</span></div>
  </section>;
}
