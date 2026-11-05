// ── Rotas antigas ────────────────────────────────────────────────────────────
// Links e favoritos de páginas que deixaram de existir levam à tela que as substituiu, desde que a
// pessoa já tenha acesso a ela. O redirecionamento não concede nada: sem acesso a nenhum destino,
// a pessoa vai para a própria página inicial.
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { homeDoUsuario } from '../../lib/perfil';
import type { Tela } from '../../types';

export interface DestinoRotaAposentada {
  to: string;
  /** Telas que dão acesso ao destino (a mesma regra da rota). */
  telas: Tela[];
  /** Filtros da rota antiga que o destino entende: parâmetro antigo → parâmetro novo. */
  parametros?: Record<string, string>;
}

export default function RotaAposentada({ destinos }: { destinos: DestinoRotaAposentada[] }) {
  const { user } = useAuth();
  const { search } = useLocation();
  if (!user) return null;

  const destino = destinos.find((item) => item.telas.some((tela) => user.telas.includes(tela)));
  if (!destino) return <Navigate to={homeDoUsuario(user)} replace />;

  const antigos = new URLSearchParams(search);
  const novos = new URLSearchParams();
  for (const [antigo, novo] of Object.entries(destino.parametros ?? {})) {
    const valor = antigos.get(antigo);
    if (valor) novos.set(novo, valor);
  }
  const consulta = novos.toString();
  return <Navigate to={`${destino.to}${consulta ? `?${consulta}` : ''}`} replace />;
}
