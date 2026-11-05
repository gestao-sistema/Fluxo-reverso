// ── Gráfico de barras empilhadas: motivo × empresa ───────────────────────────
// Revela se um motivo de devolução está concentrado numa marca específica.
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
import { type MotivoEmpresaDatum, COR_EMPRESA } from '../../services/analytics';

interface ChartMotivoEmpresaProps {
  data: MotivoEmpresaDatum[];
}

export default function ChartMotivoEmpresa({ data }: ChartMotivoEmpresaProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#EBF1F5" vertical={false} />
        <XAxis
          dataKey="motivo"
          tick={{ fontSize: 11, fill: '#8295A9' }}
          interval={0}
          angle={-15}
          textAnchor="end"
          height={60}
          stroke="#DDE7EE"
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#8295A9' }} stroke="#DDE7EE" />
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
          dataKey="Alinare"
          stackId="a"
          fill={COR_EMPRESA.Alinare}
          radius={[0, 0, 0, 0]}
          isAnimationActive={true}
          animationDuration={500}
          animationEasing="ease-out"
        />
        <Bar
          dataKey="Novitah"
          stackId="a"
          fill={COR_EMPRESA.Novitah}
          radius={[6, 6, 0, 0]}
          isAnimationActive={true}
          animationDuration={500}
          animationEasing="ease-out"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
