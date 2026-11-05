import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Definicao = Record<string, any>;
const template = JSON.parse(readFileSync('docs/power-automate/fluxo-etiqueta-reversa-template.json', 'utf8')) as Definicao;

const EVENTOS = ['pedido_criado', 'aprovacao_pendente', 'pedido_aprovado', 'pedido_rejeitado',
  'emissao_pendente', 'etiqueta_disponivel', 'postagem_confirmada', 'recebimento_confirmado'];

/** Percorre todas as ações aninhadas (If/Switch). */
function acoes(mapa: Definicao | undefined, destino: Array<[string, Definicao]> = []): Array<[string, Definicao]> {
  for (const [nome, acao] of Object.entries(mapa ?? {})) {
    destino.push([nome, acao]);
    acoes(acao.actions, destino);
    acoes(acao.else?.actions, destino);
    for (const caso of Object.values<Definicao>(acao.cases ?? {})) acoes(caso.actions, destino);
    acoes(acao.default?.actions, destino);
  }
  return destino;
}

const todas = acoes(template.actions);
const porTipo = (tipo: string) => todas.filter(([, acao]) => acao.type === tipo);

describe('template do fluxo Power Automate da logística reversa', () => {
  it('valida versão, evento, link e conteúdo antes de qualquer conector e rejeita explicitamente', () => {
    const texto = JSON.stringify(template);
    for (const evento of EVENTOS) expect(texto).toContain(`'${evento}'`);
    for (const status of ['invalid_event', 'invalid_link', 'invalid_content', 'invalid_channel']) {
      const resposta = todas.find(([, acao]) => acao.type === 'Response' && acao.inputs.body?.status === status);
      expect(resposta, status).toBeDefined();
      expect(resposta![1].inputs.statusCode).toBe(400);
      expect(resposta![1].inputs.body.communication_id).toBe("@triggerBody()?['idempotency_key']");
    }
    // Conectores só existem depois das verificações (aninhados nos Ifs).
    expect(Object.keys(template.actions)).toEqual(['Inicializar_origem_do_app', 'Verificar_evento']);
    expect(template.actions.Inicializar_origem_do_app.inputs.variables[0].value).toContain('SUBSTITUA');
  });

  it('usa Outlook para e-mail e Teams para a tarefa, com retryPolicy dentro de inputs e sem retry', () => {
    const conectores = porTipo('OpenApiConnection');
    expect(conectores.map(([, acao]) => acao.inputs.host.operationId).sort()).toEqual(['PostMessageToConversation', 'SendEmailV2']);
    for (const [nome, acao] of conectores) {
      expect(acao.inputs.retryPolicy, nome).toEqual({ type: 'none' });
      expect(acao.retryPolicy, `${nome}: retryPolicy fora de inputs`).toBeUndefined();
    }
    const email = conectores.find(([, acao]) => acao.inputs.host.operationId === 'SendEmailV2')![1];
    expect(email.inputs.parameters['emailMessage/To']).toBe("@triggerBody()?['destinatario']?['email']");
    expect(email.inputs.parameters['emailMessage/Body']).toBe("@triggerBody()?['mensagem']?['corpo_html']");
    expect(email.inputs.parameters['emailMessage/Importance']).toContain("'aprovacao_pendente'");
  });

  it('só responde sucesso depois da ação do conector e devolve falha/incerteza sem sugerir retry cego', () => {
    const respostas = porTipo('Response');
    const sucessos = respostas.filter(([, acao]) => acao.inputs.body?.status === 'connector_action_succeeded');
    expect(sucessos).toHaveLength(2);
    for (const [nome, acao] of sucessos) {
      expect(acao.inputs.statusCode, nome).toBe(200);
      expect(Object.values(acao.runAfter), nome).toEqual([['Succeeded']]);
      expect(Object.keys(acao.runAfter)).toHaveLength(1);
      expect(acao.inputs.body.canal).toMatch(/^(email|teams)$/);
      expect(acao.inputs.body.communication_id).toBe("@triggerBody()?['idempotency_key']");
    }
    const falhas = respostas.filter(([, acao]) => acao.inputs.body?.status === 'connector_action_failed');
    expect(falhas).toHaveLength(2);
    for (const [nome, acao] of falhas) {
      expect(acao.inputs.statusCode, nome).toBe(502);
      expect(acao.inputs.body.retryable, nome).toBe(false);
      expect(Object.values(acao.runAfter)[0]).toEqual(['Failed', 'TimedOut']);
    }
  });

  it('o gatilho aceita HTTP, não impõe enum de evento/canal (a rejeição tem corpo próprio) e não carrega credenciais', () => {
    const gatilho = template.triggers.Quando_uma_requisicao_HTTP_chegar;
    expect(gatilho.kind).toBe('Http');
    const propriedades = gatilho.inputs.schema.properties;
    expect(propriedades.evento.enum).toBeUndefined();
    expect(propriedades.canal.enum).toBeUndefined();
    expect(gatilho.inputs.schema.required).toEqual(expect.arrayContaining(['idempotency_key', 'canal', 'evento', 'destinatario', 'mensagem', 'acao']));
    const texto = JSON.stringify(template).toLowerCase();
    for (const proibido of ['client_secret', 'password', 'bearer ', 'sig=', 'sv=20']) expect(texto).not.toContain(proibido);
  });
});
