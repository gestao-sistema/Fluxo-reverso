// ── Hook de dados: não conformidades + listas ────────────────────────────────
// Reusado na lista, no painel de NC e no resumo do dashboard.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import ncService from '../services/ncService';
import type { ListasNc, NaoConformidade } from '../types';

interface UseNaoConformidadesReturn {
  ncs: NaoConformidade[];
  listas: ListasNc;
  loading: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

export function useNaoConformidades(): UseNaoConformidadesReturn {
  const [ncs, setNcs] = useState<NaoConformidade[]>([]);
  const [listas, setListas] = useState<ListasNc>({ origens: [], itens: [] });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const [dados, listasNc] = await Promise.all([ncService.listar(), ncService.carregarListas()]);
      setNcs(dados);
      setListas(listasNc);
      setErro(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao carregar as não conformidades.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { ncs, listas, loading, erro, recarregar };
}
