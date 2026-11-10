// ── Serviço dos avisos internos do ciclo da reversa ─────────────────────────
// Consulta, contagem e leitura individual por RPCs que conferem a autorização no banco.
// Sem leitura direta da tabela: se a função não existir, a consulta falha e a tela diz isso,
// em vez de parecer que não há avisos. Na demonstração, usa o armazenamento demo.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabase';
import { demoAtivo } from '../demo/demoMode';
import { demoAvisosReverso } from '../demo/demoAvisosReverso';
import { ROTULO_EVENTO_AVISO, type AvisoReverso, type EventoAviso } from '../lib/avisosReverso';

const MENSAGEM_CONSULTA = 'Não foi possível carregar as notificações agora. Tente novamente.';
const MENSAGEM_LEITURA = 'Não foi possível registrar a leitura. Tente novamente.';

interface LinhaAviso {
  id: string;
  solicitacao_id: string;
  empresa: string;
  evento: string;
  versao: number | null;
  justificativa: string | null;
  nome_cliente: string | null;
  criado_em: string;
  lido_em: string | null;
  superado_em: string | null;
}

function paraAviso(linha: LinhaAviso): AvisoReverso {
  return {
    id: linha.id,
    solicitacao_id: linha.solicitacao_id,
    empresa: linha.empresa,
    evento: linha.evento as EventoAviso,
    versao: linha.versao ?? null,
    justificativa: linha.justificativa ?? null,
    nome_cliente: linha.nome_cliente ?? null,
    criado_em: linha.criado_em,
    lido_em: linha.lido_em ?? null,
    superado_em: linha.superado_em ?? null,
  };
}

const servicoDoBanco = {
  async listarAvisos(limite = 50): Promise<AvisoReverso[]> {
    const { data, error } = await supabase.rpc('listar_avisos_reverso', { p_limite: limite });
    if (error) throw new Error(MENSAGEM_CONSULTA);
    return ((data ?? []) as LinhaAviso[])
      // Evento que a tela não conhece não vira aviso sem texto: fica de fora
      .filter((linha) => linha.evento in ROTULO_EVENTO_AVISO)
      .map(paraAviso);
  },

  async contarAvisosNaoLidos(): Promise<number> {
    const { data, error } = await supabase.rpc('contar_avisos_reverso_nao_lidos');
    if (error) throw new Error(MENSAGEM_CONSULTA);
    const total = Number(data);
    return Number.isFinite(total) && total > 0 ? total : 0;
  },

  async marcarAvisoLido(id: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('marcar_aviso_reverso_lido', { p_aviso_id: id });
    if (error) throw new Error(MENSAGEM_LEITURA);
    return data === true;
  },
};

const servicoDemo = {
  listarAvisos: () => demoAvisosReverso.listar(),
  contarAvisosNaoLidos: () => demoAvisosReverso.contarNaoLidos(),
  marcarAvisoLido: (id: string) => demoAvisosReverso.marcarLido(id),
};

const avisosReversoService = new Proxy(servicoDoBanco, {
  get(alvo, propriedade, receptor) {
    if (demoAtivo() && typeof propriedade === 'string' && propriedade in servicoDemo) {
      return (servicoDemo as unknown as Record<string, unknown>)[propriedade];
    }
    return Reflect.get(alvo, propriedade, receptor);
  },
}) as typeof servicoDoBanco;

export default avisosReversoService;
