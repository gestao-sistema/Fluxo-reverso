// ── Conta do usuário no cabeçalho (padrão visual, seção 10.4) ────────────────
// Botão com avatar (iniciais) e primeiro nome; menu de vidro com nome, usuário e papel,
// "Alterar senha", aparência (modo, reduzir movimento e transparência), "Reiniciar demonstração"
// (só na demo) e "Sair". O diálogo de senha vai para o body: assim nenhum ancestral com filtro
// ou transformação prende o overlay `position: fixed` à própria caixa.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronDown, KeyRound, LogOut, Moon, ZapOff, RotateCcw, Sun, Layers } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isAdmin } from '../../types';
import { useModoCor } from '../../hooks/useModoCor';
import { usePreferenciasVisuais } from '../../hooks/usePreferenciasVisuais';
import { demoDados } from '../../demo/demoDatabase';

export default function PerfilButton() {
  const { user, logout, alterarSenha, isDemo, sairDemonstracao } = useAuth();
  const [modo, definirModo] = useModoCor();
  const [preferencias, definirPreferencia] = usePreferenciasVisuais();
  const navigate = useNavigate();

  const [aberto, setAberto] = useState(false);
  const [mostrarModalSenha, setMostrarModalSenha] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [salvando, setSalvando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fecha o menu ao clicar fora ou apertar Esc
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
    navigate('/login/azime', { replace: true });
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
  const primeiroNome = user.nome.trim().split(/\s+/)[0];
  const papel = isAdmin(user) ? 'Administração' : 'Colaboração';
  const claro = modo === 'claro';

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
          className="user-btn"
        >
          <span className="avatar" aria-hidden="true">{iniciais}</span>
          <span className="u-name hide-mobile">
            <span className="small strong" style={{ display: 'block', lineHeight: 1.2 }}>{primeiroNome}</span>
            <span className="xs muted" style={{ display: 'block', lineHeight: 1.2 }}>{papel}</span>
          </span>
          <ChevronDown size={16} aria-hidden="true" className="hide-mobile" style={{ transition: 'transform var(--dur) var(--ease)', transform: aberto ? 'rotate(180deg)' : undefined }} />
        </button>

        {aberto && (
          <div className="popover glass-strong" role="menu" style={{ minWidth: 280 }}>
            <div className="row" style={{ padding: '14px 16px 10px', gap: 12 }}>
              <span className="avatar lg" aria-hidden="true">{iniciais}</span>
              <div style={{ minWidth: 0 }}>
                <p className="strong" style={{ overflowWrap: 'anywhere' }}>{user.nome}</p>
                <p className="xs muted">@{user.usuario}</p>
                {isAdmin(user) && <span className="badge badge-accent plain" style={{ marginTop: 6 }}>Admin</span>}
              </div>
            </div>
            <div className="menu-sep" />
            {!isDemo && (
              <button type="button" role="menuitem" onClick={abrirModal} className="menu-item">
                <KeyRound size={16} aria-hidden="true" />
                Alterar senha
              </button>
            )}
            <div className="menu-head">Aparência</div>
            {/* Em telas pequenas o botão do cabeçalho some: a alternância fica aqui */}
            <button type="button" role="menuitemcheckbox" aria-checked={!claro} onClick={() => definirModo(claro ? 'escuro' : 'claro')} className="menu-item">
              {claro ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
              {claro ? 'Usar modo escuro' : 'Usar modo claro'}
            </button>
            <button type="button" role="menuitemcheckbox" aria-checked={preferencias.reduzirMovimento} onClick={() => definirPreferencia('reduzirMovimento', !preferencias.reduzirMovimento)} className="menu-item">
              <ZapOff size={16} aria-hidden="true" />
              Reduzir movimento
            </button>
            <button type="button" role="menuitemcheckbox" aria-checked={preferencias.reduzirTransparencia} onClick={() => definirPreferencia('reduzirTransparencia', !preferencias.reduzirTransparencia)} className="menu-item">
              <Layers size={16} aria-hidden="true" />
              Reduzir transparência
            </button>
            <div className="menu-sep" />
            {import.meta.env.DEV && isDemo && (
              <button type="button" role="menuitem" onClick={() => { demoDados.resetar(); window.location.reload(); }} className="menu-item" title="Restaurar os dados fictícios">
                <RotateCcw size={16} aria-hidden="true" />
                Reiniciar demonstração
              </button>
            )}
            <button type="button" role="menuitem" onClick={handleLogout} className="menu-item" style={{ color: 'var(--danger)', marginBottom: 6 }}>
              <LogOut size={16} aria-hidden="true" />
              Sair
            </button>
          </div>
        )}
      </div>

      {mostrarModalSenha && createPortal(
        <div className="overlay">
          <div className="dialog glass-strong" role="dialog" aria-modal="true" aria-labelledby="titulo-alterar-senha">
            <div className="dialog-head">
              <h2 id="titulo-alterar-senha">Alterar senha</h2>
            </div>
            <form onSubmit={onSubmitSenha} noValidate>
              <div className="dialog-body stack">
                <div className="field">
                  <label htmlFor="senha-atual">Senha atual</label>
                  <input id="senha-atual" type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} className="input" required autoFocus />
                </div>
                <div className="field">
                  <label htmlFor="nova-senha">Nova senha</label>
                  <input id="nova-senha" type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} className="input" required minLength={6} />
                </div>
                <div className="field">
                  <label htmlFor="confirmar-senha">Confirmar nova senha</label>
                  <input id="confirmar-senha" type="password" value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} className="input" required minLength={6} />
                </div>
              </div>
              <div className="dialog-foot">
                <button type="button" onClick={fecharModal} className="btn btn-secondary">Cancelar</button>
                <button type="submit" disabled={salvando} className="btn btn-primary">{salvando ? 'Salvando…' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
