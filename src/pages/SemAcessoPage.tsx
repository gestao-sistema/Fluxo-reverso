// ── Página de acesso negado (usuário logado sem nenhuma tela autorizada) ─────
import { useNavigate } from 'react-router-dom';
import { LockKeyhole, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import EntradaLayout from '../components/shell/EntradaLayout';

export default function SemAcessoPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login/azime', { replace: true });
  };

  return (
    <EntradaLayout rotulo="Acesso negado">
      <section className="state" style={{ padding: '8px 0' }} aria-labelledby="sem-acesso-titulo">
        <div className="state-icon" aria-hidden="true">
          <LockKeyhole size={22} />
        </div>
        <h1 id="sem-acesso-titulo" className="entry-titulo" style={{ marginBottom: 0 }}>Sem acesso</h1>
        <p>Sua conta ainda não tem telas liberadas. Peça a um administrador para liberar o acesso.</p>
        <button type="button" onClick={handleLogout} className="btn btn-secondary">
          <LogOut size={16} aria-hidden="true" /> Sair
        </button>
      </section>
    </EntradaLayout>
  );
}
