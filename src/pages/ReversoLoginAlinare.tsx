import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { homeDoUsuario } from '../lib/perfil';
import './ReversoLoginAlinare.css';

function AlinareArt() {
  return (
    <div className="all-art" role="img" aria-label="Animação da marca Alinare">
      <span className="all-mark" aria-hidden="true" />
      <span className="all-word" aria-hidden="true" />
    </div>
  );
}

function caminhoInternoSolicitado(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;
  const from = (state as { from?: { pathname?: unknown; search?: unknown; hash?: unknown } }).from;
  if (!from || typeof from.pathname !== 'string' || !from.pathname.startsWith('/admin/') || /[?#]/.test(from.pathname)) return null;
  const search = typeof from.search === 'string' && from.search.startsWith('?') ? from.search : '';
  const hash = typeof from.hash === 'string' && from.hash.startsWith('#') ? from.hash : '';
  return `${from.pathname}${search}${hash}`;
}

export default function ReversoLoginAlinare() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const retornoSolicitado = caminhoInternoSolicitado(location.state);
  const [dark, setDark] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [enviando, setEnviando] = useState(false);

  function toggleTheme() {
    setDark((value) => !value);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dados = new FormData(event.currentTarget);
    const usuario = String(dados.get('username') ?? '');
    const senha = String(dados.get('password') ?? '');
    if (!usuario.trim() || !senha) {
      toast.error('Informe seu usuário e sua senha.');
      return;
    }

    setEnviando(true);
    try {
      const sessao = await login(usuario, senha);
      toast.success(`Bem-vindo, ${sessao.nome}.`);
      navigate(retornoSolicitado ?? homeDoUsuario(sessao), { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao entrar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={`alinare-login${dark ? ' dark' : ''}`}>
      <div className="all-shell">
        <main>
          <section className={`all-hero${paused ? ' all-paused' : ''}`} aria-label="Identidade da empresa">
            <AlinareArt />
            <button type="button" className="all-pause" onClick={() => setPaused((value) => !value)}
              aria-label={paused ? 'Retomar animação' : 'Pausar animação'}>
              {paused ? '▶' : 'Ⅱ'}
            </button>
          </section>
          <section className="all-panel">
            <button type="button" className="all-theme" onClick={toggleTheme}
              aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'}
              title={dark ? 'Modo claro' : 'Modo escuro'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                {dark ? <>
                  <circle cx={12} cy={12} r={4} />
                  <path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
                </> : <path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z" />}
              </svg>
            </button>
            <form className="all-form" onSubmit={handleSubmit}>
              <h1>Entrar</h1>
              <label className="all-field">Usuário
                <span className="all-input">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
                    <circle cx={12} cy={8} r={4} />
                    <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
                  </svg>
                  <input name="username" autoComplete="username" required />
                </span>
              </label>
              <label className="all-field">Senha
                <span className="all-input">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
                    <rect x={5} y={10} width={14} height={11} rx={3} />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  </svg>
                  <input name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required />
                  <button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    onClick={() => setShowPassword((value) => !value)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
                      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
                      <circle cx={12} cy={12} r={3} />
                    </svg>
                  </button>
                </span>
              </label>
              <button type="submit" className="all-cta" disabled={enviando}>
                Entrar
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
                  <path d="M4 12h15m-6-6 6 6-6 6" />
                </svg>
              </button>
              <div className="all-foot">Reverso</div>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
