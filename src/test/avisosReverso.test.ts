import { describe, expect, it } from 'vitest';
import {
  avisoNaoLidoAtivo,
  contarAvisosNaoLidos,
  identificacaoDoAviso,
  rotaDoAviso,
  textoDoAviso,
  type AvisoReverso,
  type EventoAviso,
} from '../lib/avisosReverso';

const PEDIDO = '11111111-1111-4111-8111-111111111111';

function aviso(extra: Partial<AvisoReverso> & { evento: EventoAviso }): AvisoReverso {
  return {
    id: `${extra.evento}:${PEDIDO}`,
    solicitacao_id: PEDIDO,
    empresa: 'Alinare',
    versao: null,
    justificativa: null,
    nome_cliente: 'Casa Amora',
    criado_em: '2026-11-09T12:00:00.000Z',
    lido_em: null,
    superado_em: null,
    ...extra,
  };
}

describe('rota que abre o pedido certo', () => {
  it('aprovação pendente abre a fila de aprovação, com o pedido', () => {
    expect(rotaDoAviso(aviso({ evento: 'aprovacao_pendente' }))).toBe(`/admin/aprovacoes?solicitacaoId=${PEDIDO}`);
  });

  it('os demais avisos abrem Meus Pedidos, com o pedido', () => {
    for (const evento of ['pedido_criado', 'pedido_aprovado', 'pedido_rejeitado', 'etiqueta_disponivel', 'postagem_confirmada', 'recebimento_confirmado'] as EventoAviso[]) {
      expect(rotaDoAviso(aviso({ evento }))).toBe(`/admin/meus-pedidos?solicitacaoId=${PEDIDO}`);
    }
  });

  it('é um caminho interno com só query, aceito pelo retorno depois do login', () => {
    const rota = rotaDoAviso(aviso({ evento: 'pedido_aprovado' }));
    const [caminho, busca] = rota.split('?');
    expect(caminho.startsWith('/admin/')).toBe(true);
    expect(busca.startsWith('solicitacaoId=')).toBe(true);
  });
});

describe('texto do acontecimento', () => {
  it('rejeição mostra o motivo; aprovação mostra a observação quando existe', () => {
    expect(textoDoAviso(aviso({ evento: 'pedido_rejeitado', justificativa: 'Endereço incompleto' })))
      .toBe('Sua solicitação foi rejeitada. Motivo: Endereço incompleto');
    expect(textoDoAviso(aviso({ evento: 'pedido_aprovado', justificativa: 'Conferido com a NF' })))
      .toBe('Sua solicitação foi aprovada. Observação: Conferido com a NF');
    expect(textoDoAviso(aviso({ evento: 'pedido_aprovado', justificativa: '   ' })))
      .toBe('Sua solicitação foi aprovada.');
  });

  it('aprovação substituída ou decidida diz que não exige ação', () => {
    expect(textoDoAviso(aviso({ evento: 'aprovacao_pendente', superado_em: '2026-11-09T13:00:00.000Z' })))
      .toBe('Esta aprovação já foi decidida ou substituída. Não exige ação.');
    expect(textoDoAviso(aviso({ evento: 'aprovacao_pendente' })))
      .toBe('Há uma solicitação aguardando sua decisão.');
  });

  it('identifica o pedido com o código RV da tela de reversa', () => {
    expect(identificacaoDoAviso(aviso({ evento: 'pedido_criado' }))).toMatch(/^RV-/);
  });
});

describe('não lidos que ainda pedem atenção', () => {
  it('um aviso superado não conta, mesmo sem leitura', () => {
    const avisos = [
      aviso({ evento: 'aprovacao_pendente', id: 'a' }),
      aviso({ evento: 'aprovacao_pendente', id: 'b', superado_em: '2026-11-09T13:00:00.000Z' }),
      aviso({ evento: 'pedido_aprovado', id: 'c', lido_em: '2026-11-09T13:05:00.000Z' }),
    ];
    expect(avisoNaoLidoAtivo(avisos[1])).toBe(false);
    expect(contarAvisosNaoLidos(avisos)).toBe(1);
  });
});
