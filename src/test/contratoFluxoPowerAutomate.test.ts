import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  classificarRespostaFluxo,
  montarContratoComunicacao,
  type DadosComunicacaoEtiqueta,
  type EventoComunicacao,
} from '../../supabase/functions/comunicacao-etiqueta/logic';

// Contrato banco -> worker -> Power Automate: o que o worker envia, para cada evento e canal, tem
// de ser aceito pelo esquema do gatilho do template, inclusive sem rastreamento nem validade.
const template = JSON.parse(readFileSync('docs/power-automate/fluxo-etiqueta-reversa-template.json', 'utf8'));
const esquema = template.triggers.Quando_uma_requisicao_HTTP_chegar.inputs.schema;

const EVENTOS: EventoComunicacao[] = ['pedido_criado', 'aprovacao_pendente', 'pedido_aprovado', 'pedido_rejeitado',
  'emissao_pendente', 'etiqueta_disponivel', 'postagem_confirmada', 'recebimento_confirmado'];

/** Validador do subconjunto de JSON Schema usado no gatilho: type, required, properties. */
function validar(valor: unknown, regra: any, caminho = '$'): string[] {
  const erros: string[] = [];
  const tipos: string[] = ([] as string[]).concat(regra.type ?? []);
  const tipoDe = (v: unknown) => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
  if (tipos.length && !tipos.includes(tipoDe(valor)) && !(tipoDe(valor) === 'integer' && tipos.includes('number'))) {
    erros.push(`${caminho}: esperado ${tipos.join('|')}, recebido ${tipoDe(valor)}`);
    return erros;
  }
  if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
    for (const campo of regra.required ?? []) if (!(campo in (valor as object))) erros.push(`${caminho}.${campo}: ausente`);
    for (const [campo, sub] of Object.entries<any>(regra.properties ?? {})) {
      if (campo in (valor as object)) erros.push(...validar((valor as Record<string, unknown>)[campo], sub, `${caminho}.${campo}`));
    }
  }
  return erros;
}

const base: DadosComunicacaoEtiqueta = {
  comunicacao_id: '11111111-1111-4111-8111-111111111111',
  tentativa_id: 'tentativa-1',
  lock_token: 'trava-1',
  emissao_id: null,
  solicitacao_id: '12345678-1234-4234-8234-123456789abc',
  evento: 'pedido_criado',
  canal: 'email',
  destinatario_id: '22222222-2222-4222-8222-222222222222',
  destinatario_email: 'pessoa@example.test',
  empresa: 'Alinare',
  setor: 'Comercial',
  cliente_codigo: '8080',
  cliente_nome: 'Cliente fictício',
  motivo: 'Peça com defeito',
  data_solicitacao: '2026-10-20',
  codigo_rastreio: null,
  valida_ate: null,
  emitida_em: null,
  justificativa: null,
  versao: 1,
  transicao_em: '2026-10-26T15:00:00.000Z',
  postagem_em: null,
};

describe('contrato enviado ao fluxo x esquema do gatilho', () => {
  for (const evento of EVENTOS) {
    for (const canal of ['email', 'teams'] as const) {
      it(`${evento} / ${canal}: aceito pelo gatilho sem rastreamento e sem validade`, () => {
        const contrato = montarContratoComunicacao({ ...base, evento, canal }, 'https://reverso.example.test');
        expect(validar(contrato, esquema)).toEqual([]);
        expect(contrato.evento).toBe(evento);
        expect(contrato.codigo_rastreio).toBeNull();
        expect(contrato.validade).toBeNull();
        // o link aponta para uma rota interna autorizada da própria origem
        const url = new URL(contrato.acao.url);
        expect(url.origin).toBe('https://reverso.example.test');
        expect(url.pathname.startsWith('/admin/')).toBe(true);
        expect(contrato.mensagem.assunto.length).toBeGreaterThan(0);
      });
    }
  }

  it('etiqueta disponível com PDF e sem rastreamento é válida; com rastreamento e validade também', () => {
    const semRastreio = montarContratoComunicacao({ ...base, evento: 'etiqueta_disponivel', emissao_id: 'e1', emitida_em: '2026-10-26' }, 'https://reverso.example.test');
    expect(validar(semRastreio, esquema)).toEqual([]);
    expect(semRastreio.codigo_rastreio).toBeNull();
    const completo = montarContratoComunicacao({ ...base, evento: 'etiqueta_disponivel', emissao_id: 'e1', codigo_rastreio: 'AA123456789BR', valida_ate: '2026-11-23' }, 'https://reverso.example.test');
    expect(validar(completo, esquema)).toEqual([]);
    expect(completo.codigo_rastreio).toBe('AA123456789BR');
  });

  it('o gatilho recusa o que o worker nunca deve enviar (campo obrigatório ausente, tipo errado)', () => {
    const contrato: any = montarContratoComunicacao({ ...base }, 'https://reverso.example.test');
    const semMensagem = { ...contrato }; delete semMensagem.mensagem;
    expect(validar(semMensagem, esquema)).toContain('$.mensagem: ausente');
    expect(validar({ ...contrato, versao: '1' }, esquema).join()).toMatch(/versao/);
  });

  it('o template trata exatamente os oito eventos que o worker produz', () => {
    const lista = JSON.stringify(template.actions.Verificar_evento.expression).match(/createArray(([^)]*))/)?.[1] ?? '';
    const tratados = [...lista.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect([...tratados].sort()).toEqual([...EVENTOS].sort());
  });

  it('o pacote antigo de "etiqueta disponível" (evento etiqueta_reversa_disponivel) não é o contrato atual', () => {
    // O ZIP Reverso-Etiqueta-PowerAutomate.zip só aceita evento "etiqueta_reversa_disponivel", exige
    // codigo_rastreio como texto e rótulo fixo "Abrir pedido e baixar etiqueta". O worker atual não
    // emite esse nome de evento nem exige rastreamento: não use aquele pacote com este worker.
    expect(EVENTOS as string[]).not.toContain('etiqueta_reversa_disponivel');
    expect(esquema.properties.codigo_rastreio.type).toEqual(['string', 'null']);
  });
});

describe('respostas do fluxo tratadas pelo worker', () => {
  const contrato = { idempotency_key: 'chave-1', canal: 'email' as const };
  const sucesso = { status: 'connector_action_succeeded', communication_id: 'chave-1', canal: 'email' };

  it('sucesso do conector é só "ação do conector concluída", nunca entrega ou leitura', () => {
    expect(classificarRespostaFluxo(200, sucesso, contrato)).toBe('acao_conector_concluida');
    expect(classificarRespostaFluxo(200, { ...sucesso, canal: 'teams' }, contrato)).toBe('resultado_indeterminado');
    expect(classificarRespostaFluxo(200, { ...sucesso, communication_id: 'outra' }, contrato)).toBe('resultado_indeterminado');
    expect(classificarRespostaFluxo(202, { status: 'accepted' }, contrato)).toBe('resultado_indeterminado');
  });

  it('invalid_* só vale com a chave enviada e HTTP 400; fora disso vira indeterminado', () => {
    for (const status of ['invalid_channel', 'invalid_event', 'invalid_link', 'invalid_content']) {
      expect(classificarRespostaFluxo(400, { status, communication_id: 'chave-1', canal: 'email' }, contrato)).toBe('erro_permanente');
    }
    expect(classificarRespostaFluxo(400, { status: 'invalid_event', communication_id: 'outra' }, contrato)).toBe('resultado_indeterminado');
    expect(classificarRespostaFluxo(200, { status: 'invalid_event', communication_id: 'chave-1' }, contrato)).toBe('resultado_indeterminado');
  });

  it('falha do conector só pede nova tentativa quando o fluxo garante que nada foi aceito', () => {
    const falha = (retryable: boolean) => ({ status: 'connector_action_failed', communication_id: 'chave-1', canal: 'email', retryable });
    expect(classificarRespostaFluxo(503, falha(true), contrato)).toBe('falhou');
    expect(classificarRespostaFluxo(502, falha(false), contrato)).toBe('resultado_indeterminado');
  });

  it('sem corpo, com corpo inesperado ou erro de rede: indeterminado, sem reenvio automático; 401/403 é falha de acesso', () => {
    expect(classificarRespostaFluxo(200, null, contrato)).toBe('resultado_indeterminado');
    expect(classificarRespostaFluxo(500, { erro: 'x' }, contrato)).toBe('resultado_indeterminado');
    expect(classificarRespostaFluxo(429, null, contrato)).toBe('resultado_indeterminado');
    expect(classificarRespostaFluxo(401, { error: { code: 'x' } }, contrato)).toBe('falhou');
    expect(classificarRespostaFluxo(403, null, contrato)).toBe('falhou');
  });
});
