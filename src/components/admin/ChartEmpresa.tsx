import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

// Cada empresa com a sua série (ouro champagne e rosé), iguais nos três temas
const CORES_DASHBOARD = { Alinare: 'var(--flow-serie-alinare)', Novitah: 'var(--flow-serie-novitah)' } as const;
import type { EmpresaDatum } from '../../services/analytics';

interface ChartEmpresaProps {
  data: EmpresaDatum[];
}

const EIXO = { fontSize: 12, fill: 'var(--flow-text-2)', fontFamily: 'var(--flow-font-sans)' };

export default function ChartEmpresa({ data }: ChartEmpresaProps) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} layout="vertical" margin={{ top: 18, right: 22, bottom: 2, left: 2 }}>
        <CartesianGrid stroke="var(--flow-grafico-grade)" horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={EIXO}
          axisLine={{ stroke: 'var(--flow-line-strong)' }}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis type="category" dataKey="empresa" width={80} tick={EIXO} axisLine={false} tickLine={false} />
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
          itemStyle={{ color: 'var(--flow-grafico-linha)' }}
          formatter={(value) => [`${Number(value ?? 0).toLocaleString('pt-BR')} solicitações`, 'Volume']}
        />
        <Bar dataKey="quantidade" name="Solicitações" radius={[0, 5, 5, 0]} maxBarSize={23} isAnimationActive animationDuration={180}>
          {data.map((item) => <Cell key={item.empresa} fill={CORES_DASHBOARD[item.empresa]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
