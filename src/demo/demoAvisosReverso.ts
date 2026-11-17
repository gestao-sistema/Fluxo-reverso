// ── Avisos internos na demonstração ─────────────────────────────────────────
// Deriva os avisos do estado demo com as mesmas regras do banco: o solicitante recebe o
// andamento do próprio pedido; o aprovador elegível (empresa, setor e autoaprovação) recebe a
// pendência; decisão ou nova versão supera a pendência. A leitura fica neste navegador.
// ─────────────────────────────────────────────────────────────────────────────

import { demoDados } from './demoDatabase';
import { usuarioDemoAtual } from './demoMode';
import type { Solicitacao, UsuarioAutenticado } from '../types';
import { contarAvisosNaoLidos, type AvisoReverso, type EventoAviso } from '../lib/avisosReverso';

const CHAVE_LIDOS = 'flowdesk:demo:dados:avisos-lidos';

type PedidoDemo = Solicitacao & {
  aprovacao_versao?: number;
  aprovacao_versao_por?: string | null;
  aprovacao_justificativa?: string | null;
};

function lerLidos(): Record<string, string> {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_LIDOS) ?? '{}');
    return bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto as Record<string, string> : {};
  } catch {
    return {};
  }
}

function gravarLidos(lidos: Record<string, string>): void {
  try {
    localStorage.setItem(CHAVE_LIDOS, JSON.stringify(lidos));
  } catch {
    // Sem armazenamento, a leitura vale só nesta sessão
  }
}

/** Mesma regra de autoridade do banco (reversa_aprovador_pode_decidir), no estado demo. */
function podeDecidirDemo(user: UsuarioAutenticado, pedido: PedidoDemo): boolean {
  if (!user.telas.includes('aprovar-reversa') || !(user.empresasAcesso ?? []).includes(pedido.empresa)) return false;
  // Sem autoaprovação: o autor (ou quem produziu a versão) e o pedido sem autor não geram tarefa
  if (!pedido.solicitado_por || pedido.solicitado_por === user.id || pedido.aprovacao_versao_por === user.id) return false;
  return demoDados.configAprovadores().some((item) => item.empresa === pedido.empresa
    && item.usuario_id === user.id
    && (item.todos_setores || item.setores.includes(pedido.setor)));
}

export function listarAvisosDemo(user: UsuarioAutenticado): AvisoReverso[] {
  const lidos = lerLidos();
  const recebidos = new Set(demoDados.recebimentosFisicos());
  const avisos: AvisoReverso[] = [];

  const adicionar = (
    pedido: PedidoDemo,
    evento: EventoAviso,
    ocorrencia: string,
    criadoEm: string,
    extra: { versao?: number | null; justificativa?: string | null; superado_em?: string | null } = {}
  ): void => {
    const id = `${evento}:${pedido.id}:${ocorrencia}`;
    avisos.push({
      id,
      solicitacao_id: pedido.id,
      empresa: pedido.empresa,
      evento,
      versao: extra.versao ?? null,
      justificativa: extra.justificativa ?? null,
      nome_cliente: pedido.nome_cliente ?? null,
      criado_em: criadoEm,
      lido_em: lidos[id] ?? null,
      superado_em: extra.superado_em ?? null,
    });
  };

  for (const pedido of demoDados.solicitacoes() as PedidoDemo[]) {
    if (pedido.inutilizada_em) continue;
    const versao = pedido.aprovacao_versao ?? 1;
    const decidido = pedido.aprovacao_status === 'aprovada' || pedido.aprovacao_status === 'rejeitada';

    if (pedido.solicitado_por === user.id) {
      adicionar(pedido, 'pedido_criado', 'criacao', pedido.created_at);
      if (pedido.aprovacao_status === 'aprovada') {
        adicionar(pedido, 'pedido_aprovado', `versao-${versao}`, pedido.created_at, {
          versao, justificativa: pedido.aprovacao_justificativa ?? null,
        });
      }
      if (pedido.aprovacao_status === 'rejeitada') {
        adicionar(pedido, 'pedido_rejeitado', `versao-${versao}`, pedido.created_at, {
          versao, justificativa: pedido.aprovacao_justificativa ?? null,
        });
      }
      if (pedido.etiqueta_path) {
        adicionar(pedido, 'etiqueta_disponivel', `emissao-${pedido.id}`, pedido.etiqueta_gerada_em ?? pedido.created_at);
      }
      if (pedido.postado_em) {
        adicionar(pedido, 'postagem_confirmada', `postagem-${pedido.id}`, pedido.postado_em);
      }
      if (recebidos.has(pedido.id)) {
        adicionar(pedido, 'recebimento_confirmado', `recebimento-${pedido.id}`, pedido.concluido_em ?? pedido.created_at);
      }
    }

    if (podeDecidirDemo(user, pedido)) {
      adicionar(pedido, 'aprovacao_pendente', `versao-${versao}`, pedido.created_at, {
        versao,
        superado_em: decidido ? pedido.created_at : null,
      });
    }
  }

  return avisos.sort((a, b) => b.criado_em.localeCompare(a.criado_em) || b.id.localeCompare(a.id));
}

export const demoAvisosReverso = {
  async listar(): Promise<AvisoReverso[]> {
    return listarAvisosDemo(usuarioDemoAtual());
  },

  async contarNaoLidos(): Promise<number> {
    return contarAvisosNaoLidos(listarAvisosDemo(usuarioDemoAtual()));
  },

  async marcarLido(id: string): Promise<boolean> {
    const user = usuarioDemoAtual();
    if (!listarAvisosDemo(user).some((aviso) => aviso.id === id)) return false;
    const lidos = lerLidos();
    if (!lidos[id]) {
      lidos[id] = new Date().toISOString();
      gravarLidos(lidos);
    }
    return true;
  },
};
