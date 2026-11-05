// ── Gráfico de barras horizontais: ranking por autorizador ───────────────────
// Mostra carga de trabalho (pendentes + resolvidos) por responsável.
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { AutorizadorDatum } from '../../services/analytics';

interface ChartAutorizadorProps {
  data: AutorizadorDatum[];
}

export default function ChartAutorizador({ data }: ChartAutorizadorProps) {
  // Altura dinâmica: ~48px por linha, mínimo 280
  const height = Math.max(280, data.length * 52);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#EBF1F5" horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fontSize: 12, fill: '#8295A9' }}
          stroke="#DDE7EE"
        />
        <YAxis
          type="category"
          dataKey="autorizador"
          tick={{ fontSize: 12, fill: '#5B7188' }}
          width={110}
          stroke="#DDE7EE"
        />
        <Tooltip
          cursor={{ fill: 'rgba(20,184,196,0.06)' }}
          contentStyle={{
            borderRadius: 10,
            border: '1px solid #EBF1F5',
            boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
            fontSize: 13,
          }}
        />
        <Legend
          iconType="circle"
          formatter={(value) => (
            <span style={{ color: '#5B7188', fontSize: 13 }}>{value}</span>
          )}
        />
        <Bar
          dataKey="pendentes"
          name="Pendentes"
          stackId="a"
          fill="#F59E0B"
          radius={[0, 0, 0, 0]}
          isAnimationActive={true}
          animationDuration={500}
          animationEasing="ease-out"
        />
        <Bar
          dataKey="resolvidos"
          name="Resolvidos"
          stackId="a"
          fill="#16A34A"
          radius={[0, 6, 6, 0]}
          isAnimationActive={true}
          animationDuration={500}
          animationEasing="ease-out"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
