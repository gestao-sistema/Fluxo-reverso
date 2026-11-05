import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import RotaAposentada from './components/auth/RotaAposentada';
import { homeDoUsuario } from './lib/perfil';
import AdminLayout from './components/admin/AdminLayout';
import FundoJoalheria from './components/ui/FundoJoalheria';
import { TemaProvider } from './context/TemaContext';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DefinirSenhaPage = lazy(() => import('./pages/DefinirSenhaPage'));
const SemAcessoPage = lazy(() => import('./pages/SemAcessoPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ListPage = lazy(() => import('./pages/ListPage'));
const UsuariosPage = lazy(() => import('./pages/UsuariosPage'));
const AlinareFormPage = lazy(() => import('./pages/AlinareFormPage'));
const NovitahFormPage = lazy(() => import('./pages/NovitahFormPage'));
const NcListPage = lazy(() => import('./pages/NcListPage'));
const NcFormPage = lazy(() => import('./pages/NcFormPage'));
const NcPainelPage = lazy(() => import('./pages/NcPainelPage'));
const NcListasPage = lazy(() => import('./pages/NcListasPage'));
const FilaOperacionalPage = lazy(() => import('./pages/FilaOperacionalPage'));
const ApprovalQueuePage = lazy(() => import('./pages/ApprovalQueuePage'));
const MeusPedidosPage = lazy(() => import('./pages/MeusPedidosPage'));
const ComunicacoesPage = lazy(() => import('./pages/ComunicacoesPage'));
const LixeiraPage = lazy(() => import('./pages/LixeiraPage'));

/** Mantém o redirecionamento original conforme as telas autorizadas do perfil. */
function HomeRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  return <Navigate to={user ? homeDoUsuario(user) : '/login'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      {/* Tema lê o perfil (AuthProvider) e a rota (BrowserRouter) */}
      <TemaProvider>
      {/* Fundo compartilhado: montado uma vez, fora de <Routes>, persiste entre as rotas */}
      <FundoJoalheria />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            fontFamily: 'var(--flow-font-sans)',
            fontSize: '13px',
            fontWeight: 600,
            borderRadius: '14px',
            background: 'var(--flow-surface-raised-solid)',
            border: '1px solid var(--flow-line-strong)',
            color: 'var(--flow-text)',
            boxShadow: 'var(--flow-shadow-modal)',
          },
          success: { iconTheme: { primary: 'var(--flow-success)', secondary: 'var(--flow-surface-raised-solid)' } },
          error: { iconTheme: { primary: 'var(--flow-danger)', secondary: 'var(--flow-surface-raised-solid)' } },
        }}
      />
        <Suspense fallback={<div className="estado-carregando" role="status" aria-label="Carregando tela" />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Pública de propósito: a pessoa convidada ainda não tem senha. O convite é verificado no servidor. */}
          <Route path="/definir-senha" element={<DefinirSenhaPage />} />
          <Route path="/sem-acesso" element={<ProtectedRoute><SemAcessoPage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<ProtectedRoute telas={['dashboard-geral', 'dashboard-alinare', 'dashboard-novitah']}><DashboardPage /></ProtectedRoute>} />
            <Route path="lista" element={<ProtectedRoute telas={['lista-geral', 'lista-alinare', 'lista-novitah']}><ListPage /></ProtectedRoute>} />
            <Route path="kanban" element={<RotaAposentada destinos={[
              { to: '/admin/lista', telas: ['lista-geral', 'lista-alinare', 'lista-novitah'], parametros: { empresa: 'empresa' } },
              { to: '/admin/etiquetas', telas: ['emitir-etiqueta'] },
            ]} />} />
            <Route path="usuarios" element={<ProtectedRoute telas={['usuarios']}><UsuariosPage /></ProtectedRoute>} />
            <Route path="lixeira" element={<ProtectedRoute telas={['usuarios']}><LixeiraPage /></ProtectedRoute>} />
            {/* Capacidade administrativa; a autorização real é conferida nas RPCs do banco */}
            <Route path="comunicacoes" element={<ProtectedRoute telas={['usuarios']}><ComunicacoesPage /></ProtectedRoute>} />
            <Route path="relatorios" element={<RotaAposentada destinos={[
              { to: '/admin/dashboard', telas: ['dashboard-geral', 'dashboard-alinare', 'dashboard-novitah'], parametros: { empresa: 'empresa', inicio: 'dataInicio', fim: 'dataFim' } },
              { to: '/admin/lista', telas: ['lista-geral', 'lista-alinare', 'lista-novitah'], parametros: { empresa: 'empresa', inicio: 'dataInicio', fim: 'dataFim' } },
            ]} />} />
            <Route path="aprovacoes" element={<ProtectedRoute telas={['aprovar-reversa']}><ApprovalQueuePage /></ProtectedRoute>} />
            <Route path="meus-pedidos" element={<ProtectedRoute telas={['formulario-alinare', 'formulario-novitah', 'nc-edit']}><MeusPedidosPage /></ProtectedRoute>} />
            <Route path="etiquetas" element={<ProtectedRoute telas={['emitir-etiqueta']}><FilaOperacionalPage /></ProtectedRoute>} />
            <Route path="checkin" element={<RotaAposentada destinos={[
              { to: '/admin/etiquetas', telas: ['emitir-etiqueta'] },
              { to: '/admin/lista', telas: ['lista-geral', 'lista-alinare', 'lista-novitah'] },
            ]} />} />
            {/* Formulário de reversa: aberto pelo formulário da empresa ou a partir de uma NC */}
            <Route path="alinare" element={<ProtectedRoute telas={['formulario-alinare', 'nc-edit']}><AlinareFormPage /></ProtectedRoute>} />
            <Route path="novitah" element={<ProtectedRoute telas={['formulario-novitah', 'nc-edit']}><NovitahFormPage /></ProtectedRoute>} />
            <Route path="nc" element={<ProtectedRoute telas={['nc', 'nc-edit']}><NcListPage /></ProtectedRoute>} />
            <Route path="nc/nova" element={<ProtectedRoute telas={['nc-edit']}><NcFormPage /></ProtectedRoute>} />
            <Route path="nc/painel" element={<ProtectedRoute telas={['nc', 'nc-edit']}><NcPainelPage /></ProtectedRoute>} />
            <Route path="nc/listas" element={<ProtectedRoute telas={['usuarios']}><NcListasPage /></ProtectedRoute>} />
            <Route path="nc/:id" element={<ProtectedRoute telas={['nc', 'nc-edit']}><NcFormPage /></ProtectedRoute>} />
          </Route>
          <Route path="/alinare" element={<Navigate to="/admin/alinare" replace />} />
          <Route path="/novitah" element={<Navigate to="/admin/novitah" replace />} />
          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
        </Suspense>
      </TemaProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
