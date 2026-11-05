import { useEffect, useState } from 'react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { ptBR } from 'date-fns/locale/pt-BR';
import { CalendarDays, RefreshCw, RotateCcw, Search } from 'lucide-react';
import 'react-datepicker/dist/react-datepicker.css';
import type { Empresa } from '../../types';

registerLocale('pt-BR', ptBR);
export type FiltroEmpresa = Empresa | 'Ambas';
export interface FiltrosState { empresa:FiltroEmpresa; dataInicio:string; dataFim:string; buscaCliente:string; }
interface Props { filtros:FiltrosState;onChange:(filtros:FiltrosState)=>void;onRefresh:()=>void;ultimoFetch:number;isRefreshing:boolean;empresaFixa?:Empresa;showBuscaCliente?:boolean; }
const dateToString=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const stringToDate=(s:string)=>s ? new Date(Number(s.slice(0,4)),Number(s.slice(5,7))-1,Number(s.slice(8,10))) : null;
const presetStart=(days:number)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-(days-1));return dateToString(d)};

export default function DashboardFilters({filtros,onChange,onRefresh,ultimoFetch,isRefreshing,empresaFixa,showBuscaCliente=true}:Props){
  const [agora,setAgora]=useState(Date.now);
  useEffect(()=>{const id=window.setInterval(()=>setAgora(Date.now()),1000);return()=>window.clearInterval(id)},[]);
  const segundosAtras=ultimoFetch?Math.floor((agora-ultimoFetch)/1000):null;
  const ultimaAtualizacao=segundosAtras===null?'Aguardando dados':segundosAtras<5?'Atualizado agora':`Atualizado há ${segundosAtras}s`;
  const reset = ()=>onChange({empresa:empresaFixa??'Ambas',dataInicio:'',dataFim:'',buscaCliente:''});
  const hasFilter = Boolean((!empresaFixa && filtros.empresa!=='Ambas') || filtros.dataInicio || filtros.dataFim || filtros.buscaCliente);
  const setPreset = (days:number|null) => onChange({...filtros,dataInicio:days?presetStart(days):'',dataFim:days?dateToString(new Date()):''});
  const isPreset=(days:number|null)=>days===null ? !filtros.dataInicio&&!filtros.dataFim : filtros.dataInicio===presetStart(days)&&filtros.dataFim===dateToString(new Date());
  return (
    <section className="filter-panel" aria-label="Filtros de solicitações">
      <div className="filter-inner">
        <div className="filter-field"><label className="field-label" htmlFor="data-filtro-inicio">Data inicial</label><DatePicker id="data-filtro-inicio" locale="pt-BR" dateFormat="dd/MM/yyyy" placeholderText="dd/mm/aaaa" selected={stringToDate(filtros.dataInicio)} onChange={(d:Date|null)=>onChange({...filtros,dataInicio:d?dateToString(d):''})} maxDate={stringToDate(filtros.dataFim)??new Date()} className="field-control" isClearable/></div>
        <div className="filter-field"><label className="field-label" htmlFor="data-filtro-fim">Data final</label><DatePicker id="data-filtro-fim" locale="pt-BR" dateFormat="dd/MM/yyyy" placeholderText="dd/mm/aaaa" selected={stringToDate(filtros.dataFim)} onChange={(d:Date|null)=>onChange({...filtros,dataFim:d?dateToString(d):''})} minDate={stringToDate(filtros.dataInicio)??undefined} maxDate={new Date()} className="field-control" isClearable/></div>
        <div className="filter-field"><label className="field-label" htmlFor="filtro-empresa">Empresa</label>
          {empresaFixa?<div className="field-control" style={{display:'flex',alignItems:'center'}}>{empresaFixa}</div>:<select id="filtro-empresa" value={filtros.empresa} onChange={e=>onChange({...filtros,empresa:e.target.value as FiltroEmpresa})} className="field-control"><option value="Ambas">Todas as empresas</option><option value="Alinare">Alinare</option><option value="Novitah">Novitah</option></select>}
        </div>
        {showBuscaCliente&&<div className="filter-field is-search"><label className="field-label" htmlFor="filtro-cliente">Busca rápida</label><div style={{position:'relative'}}><Search size={15} style={{position:'absolute',left:11,top:12,color:'var(--flow-text-3)'}}/><input id="filtro-cliente" className="field-control" style={{paddingLeft:33}} placeholder="Nome, código da cliente ou nº do pedido" type="search" value={filtros.buscaCliente} onChange={e=>onChange({...filtros,buscaCliente:e.target.value})}/></div></div>}
        <div className="filter-actions"><span className="filter-updated">{ultimaAtualizacao}</span>{hasFilter&&<button type="button" className="btn-secondary" onClick={reset} title="Limpar filtros"><RotateCcw size={14}/> Limpar</button>}<button type="button" onClick={onRefresh} className="btn-primary" disabled={isRefreshing}><RefreshCw size={15} className={isRefreshing?'animate-spin':''}/> Atualizar</button></div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginTop:15,paddingTop:13,borderTop:'1px solid var(--flow-line)',flexWrap:'wrap'}}>
        <span className="field-label" style={{display:'flex',alignItems:'center',gap:6}}><CalendarDays size={13}/> PERÍODO RÁPIDO</span>
        <div className="filter-presets" role="group" aria-label="Seleção rápida de período">{([{d:7,t:'7 dias'},{d:30,t:'30 dias'},{d:90,t:'90 dias'},{d:null,t:'Todo período'}] as const).map(({d,t})=><button type="button" key={t} className={`filter-preset ${isPreset(d)?'is-active':''}`} onClick={()=>setPreset(d)} aria-pressed={isPreset(d)}>{t}</button>)}</div>
      </div>
    </section>
  );
}
