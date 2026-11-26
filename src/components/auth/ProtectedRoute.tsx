// ── Guarda de rota por perfil ────────────────────────────────────────────────
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { homeDoUsuario } from '../../lib/perfil';
import authService from '../../services/authService';
import type { Tela } from '../../types';

interface ProtectedRouteProps {
  /** Telas autorizadas para a rota. Ausente = qualquer usuário logado. */
  telas?: Tela[];
  children?: ReactNode;
}

export default function ProtectedRoute({ telas, children }: ProtectedRouteProps) {
  const { user, isLoading, isDemo, logout } = useAuth();
  const location = useLocation();
  const [estadoConvite, setEstadoConvite] = useState<{ usuarioId: string | null; estado: 'verificando' | 'livre' | 'pendente' | 'erro' }>({ usuarioId: null, estado: 'verificando' });

  useEffect(() => {
    if (!user || isDemo) {
      setEstadoConvite({ usuarioId: user?.id ?? null, estado: 'livre' });
      return;
    }
    let ativo = true;
    setEstadoConvite({ usuarioId: user.id, estado: 'verificando' });
    authService.sessaoDeConvitePendente()
      .then((pendente) => {
        if (ativo) setEstadoConvite({ usuarioId: user.id, estado: pendente?.usuarioId === user.id ? 'pendente' : 'livre' });
      })
      .catch(() => {
        if (ativo) setEstadoConvite({ usuarioId: user.id, estado: 'erro' });
      });
    return () => { ativo = false; };
  }, [user, isDemo]);

  // Evita flicker enquanto restaura sessão
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    const loginPath = location.pathname.startsWith('/admin/alinare')
      ? '/login/alinare'
      : location.pathname.startsWith('/admin/novitah')
        ? '/login/novitah'
        : '/login/azime';
    return <Navigate to={loginPath} replace state={{ from: location }} />;
  }

  // A conta de convite sem senha pode apenas concluir o convite ou sair.
  // O banco também aplica esta regra nas permissões usadas por RLS e RPCs.
  if (!isDemo && estadoConvite.usuarioId !== user.id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100" role="status">
        <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-blue-500 animate-spin" />
      </div>
    );
  }
  if (!isDemo && estadoConvite.estado === 'pendente') {
    return <Navigate to="/definir-senha" replace state={{ from: location }} />;
  }
  if (!isDemo && estadoConvite.estado === 'erro') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-100 p-6">
        <p role="alert">Não foi possível confirmar o estado do convite. Tente novamente ou saia da sessão.</p>
        <button type="button" className="login-submit" onClick={() => void logout()}>Sair</button>
      </main>
    );
  }

  if (telas && telas.length > 0) {
    // Cada rota exige a tela correspondente. Gestão de usuários não abre as demais áreas; o mestre
    // tem todas as telas marcadas no próprio cadastro.
    const temAcesso = telas.some((t) => user.telas.includes(t));
    if (!temAcesso) {
      return <Navigate to={homeDoUsuario(user)} replace />;
    }
  }

  return children ? <>{children}</> : <Outlet />;
}
