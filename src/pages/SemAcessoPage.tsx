// ── Página de acesso negado (usuário logado sem nenhuma tela autorizada) ─────
import { useNavigate } from 'react-router-dom';
import { LockKeyhole, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import BotaoEfeitosFundo from '../components/ui/BotaoEfeitosFundo';
import BotaoModoCor from '../components/ui/BotaoModoCor';

export default function SemAcessoPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="estado-pagina">
      <section className="estado-cartao" aria-labelledby="sem-acesso-titulo">
        <div className="estado-icone" aria-hidden="true">
          <LockKeyhole size={22} />
        </div>
        <h1 id="sem-acesso-titulo" className="estado-titulo">Sem acesso</h1>
        <p className="estado-texto">
          Sua conta ainda não tem telas liberadas. Peça a um administrador para liberar o acesso.
        </p>
        <button type="button" onClick={handleLogout} className="btn-secondary estado-acao">
          <LogOut size={16} aria-hidden="true" /> Sair
        </button>
        <div className="estado-preferencias">
          <BotaoModoCor />
          <BotaoEfeitosFundo className="estado-efeitos" />
        </div>
      </section>
    </div>
  );
}
