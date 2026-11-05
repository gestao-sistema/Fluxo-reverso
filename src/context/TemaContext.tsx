// ── Tema visual da tela atual ───────────────────────────────────────────────
// Aplica `data-tema` e `data-modo` (claro/escuro) em <html>: fundo, tokens e
// materiais seguem a empresa já selecionada e o modo escolhido pelo usuário.
// Telas que guardam o filtro de empresa no próprio estado declaram
// a seleção com useEmpresaDaTela; as demais seguem a rota e, sem empresa na
// rota, o perfil de empresa única. Nada aqui filtra dados.
// Fica dentro de AuthProvider (lê o perfil) e de BrowserRouter (lê a rota).
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { empresaDoPerfil, resolverTema, type Tema } from '../lib/tema';
import { useAuth } from './AuthContext';
import { useModoCor } from '../hooks/useModoCor';

interface Declaracao {
  dono: symbol;
  empresa: string | null;
}

interface TemaContextValue {
  tema: Tema;
  declarar: (declaracao: Declaracao | null, dono: symbol) => void;
}

const TemaContext = createContext<TemaContextValue>({ tema: 'conjunto', declarar: () => {} });

export function TemaProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user } = useAuth();
  const [modo] = useModoCor();
  const [declaracao, setDeclaracao] = useState<Declaracao | null>(null);

  const tema = resolverTema(
    location.pathname,
    location.search,
    declaracao ? declaracao.empresa : undefined,
    empresaDoPerfil(user?.empresasAcesso),
  );

  // Telas de acesso (login, sem acesso) mostram o cenário conjunto inteiro; nas
  // demais o véu é mais denso para o conteúdo prevalecer sobre a imagem.
  const contexto = location.pathname.startsWith('/admin') ? 'app' : 'acesso';

  useLayoutEffect(() => {
    document.documentElement.dataset.tema = tema;
    document.documentElement.dataset.contexto = contexto;
    document.documentElement.dataset.modo = modo;
  }, [tema, contexto, modo]);

  // Estável: as telas limpam a declaração só ao desmontar, não a cada troca de tema
  const declarar = useCallback((proxima: Declaracao | null, dono: symbol) => setDeclaracao((atual) => {
    if (proxima) return atual?.dono === dono && atual.empresa === proxima.empresa ? atual : proxima;
    // Só o dono atual pode limpar a declaração (evita corrida entre telas na troca de rota)
    return atual?.dono === dono ? null : atual;
  }), []);

  const value = useMemo<TemaContextValue>(() => ({ tema, declarar }), [tema, declarar]);

  return <TemaContext.Provider value={value}>{children}</TemaContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTema(): Tema {
  return useContext(TemaContext).tema;
}

/** A tela informa a empresa exibida no seu filtro ("Ambas"/null = visão conjunta). */
// eslint-disable-next-line react-refresh/only-export-components
export function useEmpresaDaTela(empresa: string | null): void {
  const { declarar } = useContext(TemaContext);
  const dono = useRef(Symbol('tela')).current;

  useLayoutEffect(() => {
    declarar({ dono, empresa }, dono);
  }, [declarar, dono, empresa]);

  useLayoutEffect(() => () => declarar(null, dono), [declarar, dono]);
}
