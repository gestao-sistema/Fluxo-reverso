import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { MotivoDatum } from '../../services/analytics';

interface ChartMotivoProps {
  data: MotivoDatum[];
}

const EIXO = { fontSize: 12, fill: 'var(--flow-text-2)', fontFamily: 'var(--flow-font-sans)' };

export default function ChartMotivo({ data }: ChartMotivoProps) {
  return (
    <ResponsiveContainer width="100%" height={268}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 14, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--flow-line)" horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={EIXO}
          axisLine={{ stroke: 'var(--flow-line-strong)' }}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis
          type="category"
          dataKey="motivo"
          width={178}
          tick={EIXO}
          axisLine={false}
          tickLine={false}
          tickMargin={10}
          interval={0}
        />
        <Tooltip
          cursor={{ fill: 'var(--flow-surface-hover)' }}
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
          formatter={(value) => [`${Number(value ?? 0).toLocaleString('pt-BR')} solicitações`, 'Volume']}
        />
        <Bar dataKey="quantidade" name="Solicitações" fill="var(--flow-accent)" radius={[0, 5, 5, 0]} maxBarSize={19} isAnimationActive animationDuration={180} />
      </BarChart>
    </ResponsiveContainer>
  );
}
