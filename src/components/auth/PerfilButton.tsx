// ── Conta do usuário na barra superior ──────────────────────────────────────
// Gatilho só com as iniciais. Menu: nome, badge Admin, "Alterar senha", efeitos
// de fundo, "Reiniciar demonstração" (só na demo) e "Sair"
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { KeyRound, LogOut, Pause, Play, RotateCcw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isAdmin } from '../../types';
import { useEfeitosFundoPausados } from '../../hooks/useEfeitosFundo';
import { demoDados } from '../../demo/demoDatabase';

export default function PerfilButton() {
  const { user, logout, alterarSenha, isDemo, sairDemonstracao } = useAuth();
  const [efeitosPausados, definirEfeitos] = useEfeitosFundoPausados();
  const navigate = useNavigate();

  const [aberto, setAberto] = useState(false);
  const [mostrarModalSenha, setMostrarModalSenha] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [salvando, setSalvando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fecha dropdown ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!aberto) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    const teclas = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', teclas);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', teclas);
    };
  }, [aberto]);

  const handleLogout = async () => {
    setAberto(false);
    if (isDemo) {
      sairDemonstracao();
      navigate('/', { replace: true });
      return;
    }
    await logout();
    navigate('/login', { replace: true });
  };

  const abrirModal = () => {
    setAberto(false);
    setSenhaAtual('');
    setNovaSenha('');
    setConfirmarSenha('');
    setMostrarModalSenha(true);
  };

  const fecharModal = () => {
    setMostrarModalSenha(false);
    setSenhaAtual('');
    setNovaSenha('');
    setConfirmarSenha('');
  };

  const onSubmitSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senhaAtual) {
      toast.error('Informe a senha atual.');
      return;
    }
    if (novaSenha.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (novaSenha !== confirmarSenha) {
      toast.error('As senhas não conferem.');
      return;
    }
    setSalvando(true);
    try {
      await alterarSenha(senhaAtual, novaSenha);
      toast.success('Senha atualizada com sucesso.');
      fecharModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao alterar senha.');
    } finally {
      setSalvando(false);
    }
  };

  if (!user) return null;

  const iniciais = user.nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  return (
    <>
      <div ref={ref} className="profile-root">
        <button
          type="button"
          onClick={() => setAberto(!aberto)}
          aria-haspopup="menu"
          aria-expanded={aberto}
          aria-label={`Conta de ${user.nome}`}
          title={user.nome}
          className="profile-trigger"
        >
          <span className="profile-avatar" aria-hidden="true">{iniciais}</span>
        </button>

        {aberto && (
          <div className="profile-menu" role="menu">
            <div className="profile-menu-head">
              <p className="profile-menu-nome">{user.nome}{isAdmin(user) && <span className="profile-badge">Admin</span>}</p>
              <p className="profile-menu-usuario">@{user.usuario}</p>
            </div>
            {!isDemo && <button type="button" role="menuitem" onClick={abrirModal} className="profile-menu-item">
              <KeyRound size={15} aria-hidden="true" />
              Alterar senha
            </button>}
            <button type="button" role="menuitem" onClick={() => definirEfeitos(!efeitosPausados)} className="profile-menu-item">
              {efeitosPausados ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
              {efeitosPausados ? 'Retomar efeitos de fundo' : 'Pausar efeitos de fundo'}
            </button>
            {isDemo && <button type="button" role="menuitem" onClick={() => { demoDados.resetar(); window.location.reload(); }} className="profile-menu-item" title="Restaurar os dados fictícios">
              <RotateCcw size={15} aria-hidden="true" />
              Reiniciar demonstração
            </button>}
            <button type="button" role="menuitem" onClick={handleLogout} className="profile-menu-item is-danger">
              <LogOut size={15} aria-hidden="true" />
              Sair
            </button>
          </div>
        )}
      </div>

      {/* Modal de alteração de senha. Vai para o body: a cápsula do topo tem backdrop-filter, que prende
          descendentes position:fixed à própria caixa e cortava o diálogo pela metade. */}
      {mostrarModalSenha && createPortal(
        <div className="modal-overlay">
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="titulo-alterar-senha">
            <div className="modal-head">
              <h2 id="titulo-alterar-senha" className="modal-title">Alterar senha</h2>
            </div>
            <form onSubmit={onSubmitSenha} noValidate className="modal-body">
              <div className="modal-field">
                <label htmlFor="senha-atual" className="field-label">Senha atual</label>
                <input id="senha-atual" type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} className="field-control" required autoFocus />
              </div>
              <div className="modal-field">
                <label htmlFor="nova-senha" className="field-label">Nova senha</label>
                <input id="nova-senha" type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} className="field-control" required minLength={6} />
              </div>
              <div className="modal-field">
                <label htmlFor="confirmar-senha" className="field-label">Confirmar nova senha</label>
                <input id="confirmar-senha" type="password" value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} className="field-control" required minLength={6} />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={fecharModal} className="btn-secondary">Cancelar</button>
                <button type="submit" disabled={salvando} className="btn-primary">{salvando ? 'Salvando…' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
