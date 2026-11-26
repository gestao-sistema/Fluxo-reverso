import { useNavigate } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { homeDoUsuario } from '../lib/perfil';
import { demoDisponivel, usuariosDemo } from './demoMode';

/** Troca de perfil da demonstração. Reiniciar e sair ficam no menu da conta (PerfilButton). */
export default function DemoSwitcher() {
  const { user, isDemo, iniciarDemonstracao, trocarUsuarioDemo } = useAuth();
  const navigate = useNavigate();
  if (!isDemo) {
    if (!demoDisponivel()) return null;
    return <button type="button" className="demo-pill" onClick={() => { iniciarDemonstracao(); navigate('/admin/dashboard', { replace: true }); }}>Abrir demonstração</button>;
  }
  if (!user) return null;

  const trocar = (id: string) => {
    const escolhido = usuariosDemo().find((item) => item.id === id);
    trocarUsuarioDemo(id);
    if (escolhido) navigate(homeDoUsuario(escolhido), { replace: true });
  };

  return (
    <div className="demo-switcher demo-pill" title="Demonstração: alterações salvas apenas neste navegador">
      <FlaskConical size={14} aria-hidden="true" />
      <label className="sr-only" htmlFor="demo-perfil">Trocar perfil de demonstração</label>
      <select id="demo-perfil" value={user.id} onChange={(event) => trocar(event.target.value)}>
        {/* Só o papel, para caber na cápsula; o nome aparece no menu da conta */}
        {usuariosDemo().map((item) => <option key={item.id} value={item.id}>{item.demoPerfil}</option>)}
      </select>
    </div>
  );
}
