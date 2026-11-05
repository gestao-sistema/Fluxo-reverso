import type { ReactNode } from 'react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { ptBR } from 'date-fns/locale/pt-BR';
import { AlertTriangle, CalendarDays, RefreshCw } from 'lucide-react';
import type { FiltrosState } from './DashboardFilters';
import type { PeriodoDashboard } from '../../pages/DashboardPage';
import 'react-datepicker/dist/react-datepicker.css';

registerLocale('pt-BR', ptBR);

interface Props {
  filtros: FiltrosState;
  onChange: (filtros: FiltrosState) => void;
  periodo: PeriodoDashboard;
  onPeriodoChange: (periodo: PeriodoDashboard) => void;
  ultimoFetch: number;
  error: Error | null;
  refreshing: boolean;
  onRefresh: () => void;
  /** Seletor (ou nome fixo) da empresa, no início da barra. */
  controleEmpresa?: ReactNode;
}

const paraData = (valor: string) => valor
  ? new Date(Number(valor.slice(0, 4)), Number(valor.slice(5, 7)) - 1, Number(valor.slice(8, 10)))
  : null;

function textoPeriodo(periodo: PeriodoDashboard, inicio: string, fim: string) {
  if (periodo === '7') return 'Últimos 7 dias';
  if (periodo === '30') return 'Últimos 30 dias';
  if (periodo === 'all') return 'Todo o período';
  const formatar = (value: string) => value ? new Intl.DateTimeFormat('pt-BR').format(paraData(value)!) : '';
  if (inicio && fim) return `${formatar(inicio)} — ${formatar(fim)}`;
  if (inicio) return `A partir de ${formatar(inicio)}`;
  if (fim) return `Até ${formatar(fim)}`;
  return 'Escolha as datas';
}

function textoAtualizacao(ultimoFetch: number, error: Error | null) {
  if (error) {
    if (!ultimoFetch) return 'Consulta indisponível';
    return `Falha na última consulta · dados de ${new Date(ultimoFetch).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (!ultimoFetch) return 'Aguardando consulta';
  return `Atualizado às ${new Date(ultimoFetch).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

const PERIODOS = [
  ['7', '7 dias'],
  ['30', '30 dias'],
  ['custom', 'Personalizado'],
  ['all', 'Todo período'],
] as const;

export default function DashboardToolbar({
  filtros,
  onChange,
  periodo,
  onPeriodoChange,
  ultimoFetch,
  error,
  refreshing,
  onRefresh,
  controleEmpresa,
}: Props) {
  const atualizado = textoAtualizacao(ultimoFetch, error);

  return (
    <div className="dashboard-toolbar">
      <div className="dashboard-toolbar-row">
        <div className="dashboard-toolbar-lead">
          {controleEmpresa}
          {/* Nos períodos prontos o botão ativo já informa o período; o texto fica para leitores de tela */}
          <p className={`dashboard-context ${periodo === 'custom' ? '' : 'sr-only'}`} aria-live="polite">
            <span>{textoPeriodo(periodo, filtros.dataInicio, filtros.dataFim)}</span>
          </p>
        </div>

        <div className="dashboard-toolbar-controls">
          <div className="dashboard-period-options" role="group" aria-label="Período da operação">
            {PERIODOS.map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={`dashboard-period-button ${periodo === value ? 'is-active' : ''}`}
                onClick={() => onPeriodoChange(value)}
                aria-pressed={periodo === value}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="dashboard-update-row">
            <span className={`dashboard-update-label ${error ? 'has-error' : ''}`} aria-live="polite">
              {error && <AlertTriangle size={14} aria-hidden="true" />}
              {atualizado}
            </span>
            <button type="button" className="dashboard-refresh-button" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw size={14} className={refreshing ? 'is-refreshing' : ''} aria-hidden="true" />
              {refreshing ? 'Atualizando' : 'Atualizar'}
            </button>
          </div>
        </div>
      </div>

      {periodo === 'custom' && (
        <div className="dashboard-custom-range" aria-label="Intervalo personalizado">
          <CalendarDays size={16} aria-hidden="true" />
          <label>
            <span>De</span>
            <DatePicker
              id="dashboard-data-inicio"
              locale="pt-BR"
              dateFormat="dd/MM/yyyy"
              placeholderText="Data inicial"
              selected={paraData(filtros.dataInicio)}
              onChange={(date: Date | null) => onChange({ ...filtros, dataInicio: date ? toIsoDate(date) : '' })}
              maxDate={paraData(filtros.dataFim) ?? new Date()}
              className="dashboard-date-input"
              isClearable
            />
          </label>
          <label>
            <span>Até</span>
            <DatePicker
              id="dashboard-data-fim"
              locale="pt-BR"
              dateFormat="dd/MM/yyyy"
              placeholderText="Data final"
              selected={paraData(filtros.dataFim)}
              onChange={(date: Date | null) => onChange({ ...filtros, dataFim: date ? toIsoDate(date) : '' })}
              minDate={paraData(filtros.dataInicio) ?? undefined}
              maxDate={new Date()}
              className="dashboard-date-input"
              isClearable
            />
          </label>
        </div>
      )}

      {error && (
        <div className="dashboard-query-alert" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>Não foi possível consultar os pedidos com esses filtros. {ultimoFetch ? 'Os números anteriores estão desatualizados.' : 'Os dados desta seleção não estão disponíveis.'}</span>
          <button type="button" onClick={onRefresh} disabled={refreshing}>Tentar novamente</button>
        </div>
      )}
    </div>
  );
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
