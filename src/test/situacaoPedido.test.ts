import { describe, expect, it } from 'vitest';
import { PROXIMO_PASSO, statusDoBancoPara, statusEfetivo } from '../lib/situacaoPedido';
import { contarPorStatus } from '../services/analytics';
import { STATUS_LABEL, type Solicitacao } from '../types';

const p = (status: Solicitacao['status'], aprovacao_status?: Solicitacao['aprovacao_status'], aprovacao_legada = false) =>
  ({ status, aprovacao_status, aprovacao_legada }) as Pick<Solicitacao, 'status' | 'aprovacao_status' | 'aprovacao_legada'>;

describe('situação do pedido (aprovação + logística)', () => {
  it('pedido novo do banco (status pendente, aprovação aguardando) é "aguardando aprovação", não "aguardando etiqueta"', () => {
    expect(statusEfetivo(p('pendente', 'aguardando_aprovacao'))).toBe('aguardando_aprovacao');
    expect(STATUS_LABEL[statusEfetivo(p('pendente', 'aguardando_aprovacao'))]).toBe('Aguardando aprovação');
  });

  it('rejeitado fica "rejeitado" mesmo com status pendente; aprovado e legado seguem a logística', () => {
    expect(statusEfetivo(p('pendente', 'rejeitada'))).toBe('reprovado');
    expect(statusEfetivo(p('pendente', 'aprovada'))).toBe('pendente');
    expect(statusEfetivo(p('pendente', null, true))).toBe('pendente');
  });

  it('valores antigos (demo e legado) continuam entendidos', () => {
    expect(statusEfetivo(p('aguardando_aprovacao'))).toBe('aguardando_aprovacao');
    expect(statusEfetivo(p('reprovado'))).toBe('reprovado');
  });

  it('depois da etapa inicial vale a logística, nunca a aprovação', () => {
    for (const status of ['etiqueta_gerada', 'postado', 'em_transito', 'concluido'] as const) {
      expect(statusEfetivo(p(status, 'aguardando_aprovacao'))).toBe(status);
    }
  });

  it('todo estado tem rótulo e, quando não terminou, um próximo passo curto', () => {
    expect(PROXIMO_PASSO.aguardando_aprovacao).toMatch(/decisão/);
    expect(PROXIMO_PASSO.pendente).toMatch(/expedição/i);
    expect(PROXIMO_PASSO.reprovado).toBeNull();
    expect(PROXIMO_PASSO.concluido).toBeNull();
  });

  it('a consulta ao servidor de "aguardando aprovação" e "rejeitado" inclui o status gravado (pendente)', () => {
    expect(statusDoBancoPara(['aguardando_aprovacao'])).toEqual(['aguardando_aprovacao', 'pendente']);
    expect(statusDoBancoPara(['reprovado', 'pendente'])).toEqual(['reprovado', 'pendente']);
    expect(statusDoBancoPara(['em_transito'])).toEqual(['em_transito']);
  });

  it('o dashboard não conta pedido sem aprovação como "aguardando etiqueta"', () => {
    const dados = [p('pendente', 'aguardando_aprovacao'), p('pendente', 'rejeitada'), p('pendente', 'aprovada'), p('concluido', 'aprovada')] as Solicitacao[];
    expect(contarPorStatus(dados)).toMatchObject({ aguardando_aprovacao: 1, reprovado: 1, pendente: 1, concluido: 1 });
  });
});
