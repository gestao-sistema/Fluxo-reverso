// Contador "Aguardando sua análise" do item Aprovações. Conta as tarefas que a pessoa pode decidir agora
// (pode_aprovar verdadeiro e empresa liberada). Não é contagem de notificações: não existe "lida".
// Setor, escopo e autoaprovação continuam sendo decididos pela própria fila (fila_aprovacao_reversas).
import type { Empresa, SolicitacaoAprovacao, UsuarioAutenticado } from '../types';
import { podeAprovarReversa } from './perfil';

const EMPRESAS: Empresa[] = ['Alinare', 'Novitah'];

/**
 * Estado do contador. "inativo" para quem não aprova; "indisponivel" quando a consulta falhou
 * (uma falha nunca vira zero pendências).
 */
export type PendenciasAprovacao =
  | { estado: 'inativo' }
  | { estado: 'carregando' }
  | { estado: 'pronto'; quantidade: number }
  | { estado: 'indisponivel' };

export const PENDENCIAS_INATIVAS: PendenciasAprovacao = { estado: 'inativo' };
export const PENDENCIAS_CARREGANDO: PendenciasAprovacao = { estado: 'carregando' };
export const PENDENCIAS_INDISPONIVEIS: PendenciasAprovacao = { estado: 'indisponivel' };

export function pendenciasProntas(quantidade: number): PendenciasAprovacao {
  return { estado: 'pronto', quantidade };
}

/** Empresas em que a pessoa pode aprovar: a mesma regra da página de Aprovações. */
export function empresasParaAprovacao(user: UsuarioAutenticado): Empresa[] {
  return EMPRESAS.filter((empresa) => podeAprovarReversa(user, empresa));
}

/** Só quem pode aprovar em alguma empresa tem o contador; os demais não geram consulta. */
export function temContadorDeAprovacoes(user: UsuarioAutenticado | null | undefined): user is UsuarioAutenticado {
  return !!user && empresasParaAprovacao(user).length > 0;
}

/**
 * Escopo de uma sessão de aprovação: a pessoa e as empresas em que ela aprova. Se qualquer um dos dois muda,
 * o que estava guardado (contagem ou fila) pertence a outro escopo e não pode ser lido como atual.
 */
export function chaveEscopoAprovacao(user: UsuarioAutenticado | null | undefined): string | null {
  return temContadorDeAprovacoes(user) ? `${user.id}|${empresasParaAprovacao(user).join(',')}` : null;
}

/** Conta os registros que a pessoa pode decidir agora: `pode_aprovar` verdadeiro e empresa liberada. */
export function contarTarefasParaDecisao(registros: readonly SolicitacaoAprovacao[], empresas: readonly Empresa[]): number {
  return registros.filter((registro) => registro.pode_aprovar === true && empresas.includes(registro.empresa)).length;
}

export interface DescricaoPendencias {
  /** Texto do indicador visual; null quando não há nada a mostrar. */
  marca: string | null;
  /** A consulta falhou: o indicador mostra alerta, não número. */
  alerta: boolean;
  /** Complemento do nome acessível do item; null quando não há nada a anunciar. */
  resumo: string | null;
}

export function descreverPendencias(pendencias: PendenciasAprovacao): DescricaoPendencias {
  if (pendencias.estado === 'pronto' && pendencias.quantidade > 0) {
    return {
      marca: pendencias.quantidade > 99 ? '99+' : String(pendencias.quantidade),
      alerta: false,
      resumo: `${pendencias.quantidade} aguardando sua análise`,
    };
  }
  if (pendencias.estado === 'indisponivel') {
    return { marca: '!', alerta: true, resumo: 'não foi possível verificar as pendências' };
  }
  return { marca: null, alerta: false, resumo: null };
}
