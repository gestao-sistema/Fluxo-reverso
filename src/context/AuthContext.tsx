// ── Contexto de autenticação ─────────────────────────────────────────────────
// Fonte única da sessão (Supabase Auth). Telas consomem via useAuth().
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import authService from '../services/authService';
import type { UsuarioAutenticado } from '../types';
import { demoAtivo, encerrarDemo, iniciarDemo, selecionarUsuarioDemo, usuarioDemoAtual } from '../demo/demoMode';

interface AuthContextValue {
  user: UsuarioAutenticado | null;
  isLoading: boolean;
  isDemo: boolean;
  iniciarDemonstracao: () => void;
  trocarUsuarioDemo: (id: string) => void;
  sairDemonstracao: () => void;
  login: (usuario: string, senha: string) => Promise<UsuarioAutenticado>;
  logout: () => Promise<void>;
  alterarSenha: (senhaAtual: string, novaSenha: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TEMPO_MAXIMO_INATIVIDADE_MS = 10 * 60 * 1000;
const CHAVE_ULTIMA_ATIVIDADE = 'flowdesk:ultima-atividade';

function lerUltimaAtividade(): number | null {
  try {
    const valor = Number(window.localStorage.getItem(CHAVE_ULTIMA_ATIVIDADE));
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  } catch {
    return null;
  }
}

function salvarUltimaAtividade(timestamp: number) {
  try {
    window.localStorage.setItem(CHAVE_ULTIMA_ATIVIDADE, String(timestamp));
  } catch {
    // O timer local continua funcionando se o navegador bloquear o armazenamento.
  }
}

function limparUltimaAtividade() {
  try {
    window.localStorage.removeItem(CHAVE_ULTIMA_ATIVIDADE);
  } catch {
    // O logout não deve depender do armazenamento local.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isDemo, setIsDemo] = useState(demoAtivo);
  const [user, setUser] = useState<UsuarioAutenticado | null>(() => demoAtivo() ? usuarioDemoAtual() : null);
  const [isLoading, setIsLoading] = useState(() => !demoAtivo());
  const sessaoExpiradaRef = useRef<string | null>(null);

  // Restaura sessão (async via Supabase) e observa mudanças
  useEffect(() => {
    if (isDemo) {
      setUser(usuarioDemoAtual());
      setIsLoading(false);
      return;
    }

    let active = true;

    authService.getSessao().then((sessao) => {
      if (active) {
        if (!sessao || sessaoExpiradaRef.current !== sessao.id) setUser(sessao);
        setIsLoading(false);
      }
    });

    const unsub = authService.onMudancaSessao((u) => {
      if (active && (!u || sessaoExpiradaRef.current !== u.id)) setUser(u);
    });

    return () => {
      active = false;
      unsub();
    };
  }, [isDemo]);

  // O horário é compartilhado entre abas para que atividade em qualquer uma delas
  // mantenha a sessão ativa; ao voltar para uma aba suspensa, o prazo é reavaliado.
  useEffect(() => {
    if (!user || isDemo) return;

    let ultimaAtividade = lerUltimaAtividade() ?? Date.now();
    if (ultimaAtividade > Date.now()) ultimaAtividade = Date.now();
    let ultimaGravacao = ultimaAtividade;
    let timeoutId = 0;
    let expirando = false;

    salvarUltimaAtividade(ultimaAtividade);

    const expirarSessao = () => {
      if (expirando) return;
      expirando = true;
      sessaoExpiradaRef.current = user.id;
      setUser(null);
      void authService.logout().catch(() => undefined);
    };

    const programarExpiracao = () => {
      window.clearTimeout(timeoutId);
      const restante = TEMPO_MAXIMO_INATIVIDADE_MS - (Date.now() - ultimaAtividade);
      if (restante <= 0) {
        expirarSessao();
        return;
      }
      timeoutId = window.setTimeout(expirarSessao, restante);
    };

    const registrarAtividade = () => {
      ultimaAtividade = Date.now();
      programarExpiracao();

      // Evita gravações síncronas excessivas durante eventos contínuos como pointermove.
      if (ultimaAtividade - ultimaGravacao >= 1000) {
        ultimaGravacao = ultimaAtividade;
        salvarUltimaAtividade(ultimaAtividade);
      }
    };

    const aoReceberAtividadeDeOutraAba = (event: StorageEvent) => {
      if (event.key !== CHAVE_ULTIMA_ATIVIDADE || !event.newValue) return;
      const timestamp = Number(event.newValue);
      if (!Number.isFinite(timestamp) || timestamp <= ultimaAtividade) return;

      ultimaAtividade = Math.min(timestamp, Date.now());
      ultimaGravacao = ultimaAtividade;
      programarExpiracao();
    };

    const aoVoltarParaAba = () => {
      if (document.visibilityState === 'visible') programarExpiracao();
    };

    const eventosDeAtividade: Array<keyof WindowEventMap> = [
      'pointerdown',
      'pointermove',
      'keydown',
      'wheel',
      'scroll',
      'touchstart',
    ];
    eventosDeAtividade.forEach((evento) => window.addEventListener(evento, registrarAtividade, { passive: true }));
    window.addEventListener('storage', aoReceberAtividadeDeOutraAba);
    document.addEventListener('visibilitychange', aoVoltarParaAba);
    programarExpiracao();

    return () => {
      window.clearTimeout(timeoutId);
      eventosDeAtividade.forEach((evento) => window.removeEventListener(evento, registrarAtividade));
      window.removeEventListener('storage', aoReceberAtividadeDeOutraAba);
      document.removeEventListener('visibilitychange', aoVoltarParaAba);
    };
  }, [user, isDemo]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isDemo,
      iniciarDemonstracao() {
        const demoUser = iniciarDemo();
        setUser(demoUser);
        setIsLoading(false);
        setIsDemo(true);
      },
      trocarUsuarioDemo(id) {
        if (!isDemo) return;
        setUser(selecionarUsuarioDemo(id));
      },
      sairDemonstracao() {
        encerrarDemo();
        setUser(null);
        setIsLoading(true);
        setIsDemo(false);
      },
      async login(usuario, senha) {
        encerrarDemo();
        setIsDemo(false);
        sessaoExpiradaRef.current = null;
        limparUltimaAtividade();
        const sessao = await authService.login(usuario, senha);
        salvarUltimaAtividade(Date.now());
        setUser(sessao);
        return sessao;
      },
      async logout() {
        encerrarDemo();
        setIsDemo(false);
        await authService.logout();
        limparUltimaAtividade();
        setUser(null);
      },
      async alterarSenha(senhaAtual, novaSenha) {
        await authService.alterarSenha(senhaAtual, novaSenha);
      },
    }),
    [user, isLoading, isDemo]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>.');
  return ctx;
}
