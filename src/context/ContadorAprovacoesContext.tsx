import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import apiService from '../services/apiService';
import { useAuth } from './AuthContext';
import {
  chaveEscopoAprovacao,
  contarTarefasParaDecisao,
  empresasParaAprovacao,
  PENDENCIAS_CARREGANDO,
  PENDENCIAS_INATIVAS,
  PENDENCIAS_INDISPONIVEIS,
  pendenciasProntas,
  type PendenciasAprovacao,
} from '../lib/aprovacoesPendentes';
import type { SolicitacaoAprovacao, UsuarioAutenticado } from '../types';

/** Consultas automáticas do contador: a cada 60 s com a aba visível, e ao voltar o foco. */
export const INTERVALO_CONTADOR_MS = 60_000;

export interface ContadorAprovacoesValor {
  pendencias: PendenciasAprovacao;
  /**
   * A página de Aprovações informa a fila que carregou, junto do escopo (pessoa e empresas) em que foi carregada.
   * Dados de outro escopo são ignorados.
   */
  publicarFila: (escopo: string, registros: readonly SolicitacaoAprovacao[]) => void;
  publicarFalha: (escopo: string) => void;
  /** Com a página de Aprovações aberta, ela é a fonte do contador. A função devolvida encerra o registro. */
  registrarPaginaAtiva: () => () => void;
}

const SEM_PROVEDOR: ContadorAprovacoesValor = {
  pendencias: PENDENCIAS_INATIVAS,
  publicarFila: () => {},
  publicarFalha: () => {},
  registrarPaginaAtiva: () => () => {},
};

const ContadorAprovacoesContext = createContext<ContadorAprovacoesValor>(SEM_PROVEDOR);

export function ContadorAprovacoesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Escopo = pessoa + empresas liberadas. Mudou qualquer um dos dois, o que estava guardado deixa de valer.
  const escopo = chaveEscopoAprovacao(user);

  // Guardado com o escopo que o gerou: uma leitura só vale enquanto o escopo atual for o mesmo
  const [guardado, setGuardado] = useState<{ escopo: string; pendencias: PendenciasAprovacao } | null>(null);
  const usuarioRef = useRef<UsuarioAutenticado | null>(user);
  usuarioRef.current = user;
  // Número da consulta ou publicação mais recente: resposta com número antigo não é aplicada
  const sequencia = useRef(0);
  // Consulta automática em andamento: evita repeti-la (foco e intervalo no mesmo instante, por exemplo)
  const consultaEmAndamento = useRef<number | null>(null);
  const paginasAtivas = useRef(0);

  const invalidar = useCallback(() => {
    sequencia.current += 1;
    consultaEmAndamento.current = null;
  }, []);

  const aplicar = useCallback((escopoDoDado: string, pendencias: PendenciasAprovacao) => {
    setGuardado({ escopo: escopoDoDado, pendencias });
  }, []);

  // A resposta vale só se nada foi iniciado depois dela e se o escopo atual ainda é o da consulta
  const ehAtual = useCallback(
    (numero: number, escopoDaConsulta: string) =>
      numero === sequencia.current && chaveEscopoAprovacao(usuarioRef.current) === escopoDaConsulta,
    [],
  );

  const consultar = useCallback(async () => {
    const usuario = usuarioRef.current;
    const escopoDaConsulta = chaveEscopoAprovacao(usuario);
    if (!usuario || !escopoDaConsulta) return;
    // Com a página de Aprovações aberta, a fila dela já alimenta o contador
    if (paginasAtivas.current > 0 || consultaEmAndamento.current !== null) return;

    const empresas = empresasParaAprovacao(usuario);
    const numero = ++sequencia.current;
    consultaEmAndamento.current = numero;
    try {
      const registros = await apiService.getFilaAprovacao();
      if (ehAtual(numero, escopoDaConsulta)) {
        aplicar(escopoDaConsulta, pendenciasProntas(contarTarefasParaDecisao(registros, empresas)));
      }
    } catch {
      if (ehAtual(numero, escopoDaConsulta)) aplicar(escopoDaConsulta, PENDENCIAS_INDISPONIVEIS);
    } finally {
      if (consultaEmAndamento.current === numero) consultaEmAndamento.current = null;
    }
  }, [aplicar, ehAtual]);

  const publicarFila = useCallback((escopoDosRegistros: string, registros: readonly SolicitacaoAprovacao[]) => {
    const usuario = usuarioRef.current;
    // Registros de outro escopo (outra pessoa ou outras empresas) não valem para o escopo atual
    if (!usuario || chaveEscopoAprovacao(usuario) !== escopoDosRegistros) return;
    invalidar();
    aplicar(escopoDosRegistros, pendenciasProntas(contarTarefasParaDecisao(registros, empresasParaAprovacao(usuario))));
  }, [aplicar, invalidar]);

  const publicarFalha = useCallback((escopoDaFalha: string) => {
    if (chaveEscopoAprovacao(usuarioRef.current) !== escopoDaFalha) return;
    invalidar();
    aplicar(escopoDaFalha, PENDENCIAS_INDISPONIVEIS);
  }, [aplicar, invalidar]);

  const registrarPaginaAtiva = useCallback(() => {
    paginasAtivas.current += 1;
    invalidar();
    return () => {
      paginasAtivas.current = Math.max(0, paginasAtivas.current - 1);
    };
  }, [invalidar]);

  // Consultas automáticas: ao entrar, a cada 60 s com a aba visível, e ao voltar o foco.
  // Qualquer mudança de escopo (pessoa ou empresas) reinicia o ciclo.
  useEffect(() => {
    invalidar();
    if (!escopo) return undefined;
    void consultar();
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === 'visible') void consultar();
    }, INTERVALO_CONTADOR_MS);
    const aoRetomar = () => {
      if (document.visibilityState === 'visible') void consultar();
    };
    window.addEventListener('focus', aoRetomar);
    document.addEventListener('visibilitychange', aoRetomar);
    return () => {
      invalidar();
      window.clearInterval(intervalo);
      window.removeEventListener('focus', aoRetomar);
      document.removeEventListener('visibilitychange', aoRetomar);
    };
  }, [escopo, consultar, invalidar]);

  const pendencias = useMemo<PendenciasAprovacao>(() => {
    if (!escopo) return PENDENCIAS_INATIVAS;
    return guardado && guardado.escopo === escopo ? guardado.pendencias : PENDENCIAS_CARREGANDO;
  }, [escopo, guardado]);

  const valor = useMemo<ContadorAprovacoesValor>(
    () => ({ pendencias, publicarFila, publicarFalha, registrarPaginaAtiva }),
    [pendencias, publicarFila, publicarFalha, registrarPaginaAtiva],
  );

  return <ContadorAprovacoesContext.Provider value={valor}>{children}</ContadorAprovacoesContext.Provider>;
}

export function useContadorAprovacoes(): ContadorAprovacoesValor {
  return useContext(ContadorAprovacoesContext);
}
