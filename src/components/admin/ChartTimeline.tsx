import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TimelineDatum } from '../../services/analytics';

interface ChartTimelineProps {
  data: TimelineDatum[];
}

const EIXO = { fontSize: 12, fill: 'var(--flow-text-3)', fontFamily: 'var(--flow-font-sans)' };
/** Pontos visíveis só quando a série é curta o bastante para não poluir a linha. */
const LIMITE_PONTOS = 31;

function formatarDia(valor: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  const [ano, mes, dia] = valor.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(ano, mes - 1, dia)).replace('.', '');
}

function formatarRotuloEixo(valor: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  const [, mes, dia] = valor.split('-');
  return `${dia}/${mes}`;
}

export default function ChartTimeline({ data }: ChartTimelineProps) {
  const mostrarPontos = data.length <= LIMITE_PONTOS;
  return (
    <ResponsiveContainer width="100%" height={278}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id="dashboard-volume-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--flow-accent)" stopOpacity={0.34} />
            <stop offset="100%" stopColor="var(--flow-accent)" stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--flow-line)" vertical={false} />
        <XAxis
          dataKey="data"
          tickFormatter={(value: string) => formatarRotuloEixo(value)}
          tick={EIXO}
          axisLine={{ stroke: 'var(--flow-line-strong)' }}
          tickLine={false}
          minTickGap={28}
          interval="preserveStartEnd"
          tickMargin={8}
        />
        <YAxis
          allowDecimals={false}
          width={34}
          tick={EIXO}
          axisLine={false}
          tickLine={false}
          tickMargin={8}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: '1px solid var(--flow-line-strong)',
            background: 'var(--flow-surface-raised-solid)',
            color: 'var(--flow-text)',
            boxShadow: 'var(--flow-shadow-float)',
            fontSize: 12,
          }}
          labelStyle={{ color: 'var(--flow-text-2)', fontWeight: 700, marginBottom: 5 }}
          itemStyle={{ color: 'var(--flow-accent)' }}
          labelFormatter={(value) => formatarDia(String(value))}
          formatter={(value) => [`${Number(value ?? 0).toLocaleString('pt-BR')} solicitações`, 'Volume']}
          cursor={{ stroke: 'var(--flow-accent-strong)', strokeDasharray: '3 3' }}
        />
        <Area
          type="monotone"
          dataKey="quantidade"
          name="Solicitações"
          stroke="var(--flow-accent)"
          strokeWidth={2}
          fill="url(#dashboard-volume-area)"
          dot={mostrarPontos ? { r: 2.5, fill: 'var(--flow-accent)', stroke: 'var(--flow-accent-strong)', strokeWidth: 4 } : false}
          activeDot={{ r: 5, fill: 'var(--flow-accent-hover)', stroke: 'var(--flow-glow)', strokeWidth: 8 }}
          isAnimationActive
          animationDuration={180}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
