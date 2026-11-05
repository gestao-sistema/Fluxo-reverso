import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convitesHabilitados, montarLinkConvite, normalizarEmailCorporativo } from '../../supabase/functions/admin-usuarios/convite';
import { classificarErroSmtp, smtpConfigurado } from '../../supabase/functions/_shared/smtp-contract';

type Definicao = Record<string, any>;
const template = JSON.parse(readFileSync('docs/power-automate/fluxo-convite-acesso-template.json', 'utf8')) as Definicao;
const contrato = readFileSync('docs/power-automate/CONTRATO_CONVITE_ACESSO.md', 'utf8');
const smtpDoc = readFileSync('docs/envio-email-smtp.md', 'utf8');
const indexFuncao = readFileSync('supabase/functions/admin-usuarios/index.ts', 'utf8');
const conviteFuncao = readFileSync('supabase/functions/admin-usuarios/convite.ts', 'utf8');

function acoes(mapa: Definicao | undefined, destino: Array<[string, Definicao]> = []): Array<[string, Definicao]> {
  for (const [nome, acao] of Object.entries(mapa ?? {})) {
    destino.push([nome, acao]);
    acoes(acao.actions, destino);
    acoes(acao.else?.actions, destino);
  }
  return destino;
}
const todas = acoes(template.actions);
const porTipo = (tipo: string) => todas.filter(([, acao]) => acao.type === tipo);

describe('template do fluxo "Reverso — Convite de acesso"', () => {
  it('valida versão, evento, canal, destinatário e link antes de qualquer conector, com rejeição explícita', () => {
    const texto = JSON.stringify(template);
    expect(texto).toContain('"convite_acesso"');
    expect(texto).toContain('@azime.com.br');
    expect(texto).toContain("/definir-senha?token_hash=");
    expect(texto).toContain('&type=invite');
    expect(texto).toContain('&type=recovery');
    for (const status of ['invalid_event', 'invalid_channel', 'invalid_recipient', 'invalid_link']) {
      const resposta = todas.find(([, acao]) => acao.type === 'Response' && acao.inputs.body?.status === status);
      expect(resposta, status).toBeDefined();
      expect(resposta![1].inputs.statusCode).toBe(400);
      expect(resposta![1].inputs.body.communication_id).toBe("@triggerBody()?['idempotency_key']");
      expect(resposta![1].inputs.body.retryable).toBe(false);
    }
    expect(Object.keys(template.actions)).toEqual(['Inicializar_origem_do_app', 'Verificar_evento']);
    expect(template.actions.Inicializar_origem_do_app.inputs.variables[0].value).toContain('SUBSTITUA');
  });

  it('só envia por Outlook, sem retry, e só o conector aninhado nas verificações', () => {
    const conectores = porTipo('OpenApiConnection');
    expect(conectores).toHaveLength(1);
    const [, email] = conectores[0];
    expect(email.inputs.host.operationId).toBe('SendEmailV2');
    expect(email.inputs.retryPolicy).toEqual({ type: 'none' });
    expect(email.retryPolicy).toBeUndefined();
    expect(email.inputs.parameters['emailMessage/To']).toBe("@triggerBody()?['destinatario']?['email']");
    // Mensagem fixa: assunto literal e nenhum dado do payload além do link no corpo.
    expect(email.inputs.parameters['emailMessage/Subject']).toBe('Convite de acesso ao Reverso');
    const corpo: string = email.inputs.parameters['emailMessage/Body'];
    expect(corpo.match(/triggerBody\(\)/g)).toHaveLength(1);
    expect(corpo).toContain("triggerBody()?['acao']?['url']");
    expect(corpo).toContain('senha do Reverso');
    expect(corpo).not.toMatch(/token|password|supabase/i);
  });

  it('protege entradas e saídas: gatilho e Outlook com secureData', () => {
    expect(template.triggers.Quando_uma_requisicao_HTTP_chegar.runtimeConfiguration.secureData.properties).toContain('outputs');
    const email = porTipo('OpenApiConnection')[0][1];
    expect(email.runtimeConfiguration.secureData.properties.sort()).toEqual(['inputs', 'outputs']);
    // Nenhuma ação extra carrega o link (Compose, variáveis alteradas, etc.).
    expect(porTipo('Compose')).toHaveLength(0);
    expect(porTipo('SetVariable')).toHaveLength(0);
    expect(porTipo('AppendToStringVariable')).toHaveLength(0);
  });

  it('só responde sucesso depois do Outlook e nunca declara retryable=true', () => {
    const respostas = porTipo('Response');
    const sucessos = respostas.filter(([, a]) => a.inputs.body?.status === 'connector_action_succeeded');
    expect(sucessos).toHaveLength(1);
    expect(sucessos[0][1].inputs.statusCode).toBe(200);
    expect(sucessos[0][1].runAfter).toEqual({ 'Enviar_email_(V2)': ['Succeeded'] });
    expect(sucessos[0][1].inputs.body.canal).toBe('email');
    const falhas = respostas.filter(([, a]) => a.inputs.body?.status === 'connector_action_failed');
    expect(falhas).toHaveLength(1);
    expect(falhas[0][1].inputs.statusCode).toBe(502);
    expect(falhas[0][1].inputs.body.retryable).toBe(false);
    expect(falhas[0][1].runAfter['Enviar_email_(V2)']).toEqual(['Failed', 'TimedOut']);
    for (const [, resposta] of respostas) expect(resposta.inputs.body.retryable).not.toBe(true);
  });

  it('o gatilho exige exatamente o payload mínimo do backend e não carrega segredos', () => {
    const gatilho = template.triggers.Quando_uma_requisicao_HTTP_chegar;
    expect(gatilho.kind).toBe('Http');
    expect(gatilho.inputs.schema.required.sort()).toEqual(['acao', 'canal', 'destinatario', 'evento', 'idempotency_key', 'versao']);
    expect(Object.keys(gatilho.inputs.schema.properties).sort()).toEqual(['acao', 'canal', 'destinatario', 'evento', 'idempotency_key', 'versao']);
    expect(gatilho.inputs.schema.properties.idempotency_key).toEqual({ type: 'string', minLength: 1 });
    expect(Object.keys(gatilho.inputs.schema.properties.destinatario.properties)).toEqual(['email']);
    expect(Object.keys(gatilho.inputs.schema.properties.acao.properties)).toEqual(['url']);
    const texto = JSON.stringify(template).toLowerCase();
    for (const proibido of ['client_secret', 'password', 'bearer ', 'sig=', 'sv=20', 'supabase.co', 'auth/v1/verify']) expect(texto).not.toContain(proibido);
  });
});

// Avalia o subconjunto de expressões do Power Automate usado pelas condições do template, para provar que
// as validações do fluxo aceitam tudo o que o backend produz e recusam o que o backend nunca produz.
function avaliar(expressao: any, payload: any, origem: string): boolean {
  const consulta = (...caminho: string[]) => caminho.reduce((valor: any, chave) => valor?.[chave], payload);
  const funcoes = {
    concat: (...partes: unknown[]) => partes.join(''),
    split: (texto: string, separador: string) => texto.split(separador),
    length: (valor: { length: number }) => valor.length,
    toLower: (texto: string) => texto.toLowerCase(),
  };
  const valor = (item: any): any => {
    if (typeof item !== 'string') return item;
    // Na definição do fluxo, texto que começa com '@' é expressão; o literal '@...' se escreve '@@...'.
    if (item.startsWith('@@')) return item.slice(1);
    if (!item.startsWith('@')) return item;
    const js = item.slice(1)
      .replace(/triggerBody\(\)((?:\?\['[^']+'\])+)/g, (_t, trecho: string) => `tb(${[...trecho.matchAll(/\['([^']+)'\]/g)].map((m) => JSON.stringify(m[1])).join(',')})`)
      .replace(/variables\('AppBaseUrl'\)/g, 'origem');
    return new Function('tb', 'origem', 'concat', 'split', 'length', 'toLower', `return (${js});`)(
      consulta, origem, funcoes.concat, funcoes.split, funcoes.length, funcoes.toLower,
    );
  };
  const [operador] = Object.keys(expressao);
  const argumentos = expressao[operador];
  switch (operador) {
    case 'and': return argumentos.every((e: any) => avaliar(e, payload, origem));
    case 'or': return argumentos.some((e: any) => avaliar(e, payload, origem));
    case 'not': return !avaliar(argumentos, payload, origem);
    case 'equals': return valor(argumentos[0]) === valor(argumentos[1]);
    case 'startsWith': return String(valor(argumentos[0])).startsWith(String(valor(argumentos[1])));
    case 'endsWith': return String(valor(argumentos[0])).endsWith(String(valor(argumentos[1])));
    case 'contains': return String(valor(argumentos[0])).includes(String(valor(argumentos[1])));
    default: throw new Error(`operador não avaliado: ${operador}`);
  }
}

describe('validações do fluxo × payloads do backend', () => {
  const ORIGEM = 'http://localhost:5173';
  const verificacao = (nome: string) => todas.find(([chave]) => chave === nome)![1].expression;
  const passa = (nome: string, payload: unknown) => avaliar(verificacao(nome), payload, ORIGEM);
  const payload = (email: string, url: string) => ({ versao: 1, evento: 'convite_acesso', canal: 'email', destinatario: { email }, acao: { url } });
  const token = (tamanho: number) => 'aB3_-'.repeat(Math.ceil(tamanho / 5)).slice(0, tamanho);

  it('aceita todo e-mail que o backend aceita e recusa o que ele recusa', () => {
    const validos = ['maria.silva@azime.com.br', '  Maria.Silva@AZIME.com.br ', 'a+filtro@azime.com.br', 'x_y-z@azime.com.br', '0@azime.com.br', 'joao.p.souza@azime.com.br'];
    for (const bruto of validos) {
      const email = normalizarEmailCorporativo(bruto);
      expect(passa('Verificar_destinatario', payload(email, 'x')), email).toBe(true);
    }
    for (const invalido of ['a@sub.azime.com.br', 'a@azime.com.br.evil.com', 'a@@azime.com.br', 'a@evilazime.com.br', 'a@outro.com', 'sem-arroba']) {
      expect(() => normalizarEmailCorporativo(invalido), invalido).toThrow();
      expect(passa('Verificar_destinatario', payload(invalido, 'x')), invalido).toBe(false);
    }
  });

  it('aceita o link de convite e o de definição de senha com qualquer token válido (16 a 200 caracteres)', () => {
    for (const tipo of ['invite', 'recovery'] as const) {
      for (const tamanho of [16, 43, 64, 200]) {
        const url = montarLinkConvite(new URL(ORIGEM), token(tamanho), tipo);
        expect(passa('Verificar_link', payload('a@azime.com.br', url)), `${tipo}/${tamanho}`).toBe(true);
      }
    }
    // Origem publicada (HTTPS), sem barra final na variável do fluxo.
    const publicada = montarLinkConvite(new URL('https://reverso.exemplo.com.br'), token(43), 'invite');
    expect(avaliar(verificacao('Verificar_link'), payload('a@azime.com.br', publicada), 'https://reverso.exemplo.com.br')).toBe(true);
    expect(avaliar(verificacao('Verificar_link'), payload('a@azime.com.br', publicada), ORIGEM)).toBe(false);
  });

  it('recusa links que o backend nunca produz', () => {
    const base = `${ORIGEM}/definir-senha?token_hash=${token(43)}`;
    const recusados = [
      `${base}&type=magiclink`,
      `${base}&type=invite&redirect_to=https://evil.test`,
      `${base}&type=invite&type=recovery`,
      `${base}&type=invite?x=1`,
      `${base}&type=invite"`,
      `${ORIGEM}/outra-rota?token_hash=${token(43)}&type=invite`,
      `https://evil.test/definir-senha?token_hash=${token(43)}&type=invite`,
      `${ORIGEM}.evil.test/definir-senha?token_hash=${token(43)}&type=invite`,
      `javascript:alert(1)//${base}&type=invite`,
      `https://projeto.supabase.co/auth/v1/verify?token=${token(43)}&type=invite`,
    ];
    for (const url of recusados) expect(passa('Verificar_link', payload('a@azime.com.br', url)), url).toBe(false);
  });

  it('o gatilho exige exatamente o que o backend envia (versão, evento e canal)', () => {
    const corpo = { versao: 1, evento: 'convite_acesso', canal: 'email' };
    expect(avaliar(verificacao('Verificar_evento'), corpo, ORIGEM)).toBe(true);
    expect(avaliar(verificacao('Verificar_evento'), { ...corpo, versao: 2 }, ORIGEM)).toBe(false);
    expect(avaliar(verificacao('Verificar_evento'), { ...corpo, evento: 'etiqueta_disponivel' }, ORIGEM)).toBe(false);
    expect(avaliar(verificacao('Verificar_canal'), corpo, ORIGEM)).toBe(true);
    expect(avaliar(verificacao('Verificar_canal'), { ...corpo, canal: 'teams' }, ORIGEM)).toBe(false);
  });
});

describe('contrato do convite × código', () => {
  const nomesNoCodigo = (texto: string) => [...texto.matchAll(/'((?:CONVITE|SMTP|APP_BASE)_[A-Z_]+)'/g)].map((m) => m[1]);

  it('lista exatamente as variáveis que o código lê', () => {
    const doCodigo = [...new Set([...nomesNoCodigo(indexFuncao), ...[...conviteFuncao.matchAll(/env\.([A-Z_]+)/g)].map((m) => m[1])])]
      .filter((n) => /^(CONVITE|SMTP|APP_BASE)_/.test(n)).sort();
    expect(doCodigo.length).toBeGreaterThanOrEqual(7);
    for (const nome of doCodigo) expect(smtpDoc, nome).toContain(nome);
    // O código dos convites não lê as variáveis das notificações.
    const semComentarios = conviteFuncao.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(semComentarios).not.toMatch(/ETIQUETA_TRANSPORTE|POWER_AUTOMATE_FLOW_URL|NOTIFICACAO_EMAIL_TRANSPORTE/);
  });

  it('o exemplo do contrato é o payload exato, sem token real, e passa pela mesma validação de domínio', () => {
    const bloco = /```json\n([\s\S]*?)```/.exec(contrato)![1];
    const exemplo = JSON.parse(bloco);
    expect(Object.keys(exemplo).sort()).toEqual(['acao', 'canal', 'destinatario', 'evento', 'idempotency_key', 'versao']);
    expect(exemplo).toMatchObject({ versao: 1, evento: 'convite_acesso', canal: 'email' });
    expect(exemplo.destinatario.email.endsWith('@azime.com.br')).toBe(true);
    const url = new URL(exemplo.acao.url);
    expect(url.pathname).toBe('/definir-senha');
    expect(url.searchParams.get('type')).toBe('invite');
    expect(url.searchParams.get('token_hash')).toMatch(/EXEMPLO|FICTICIO/);
    expect(exemplo.acao.url).not.toMatch(/supabase\.co/);
  });

  it('classifica autenticação recusada e preserva resultado indeterminado depois de DATA', () => {
    expect(classificarErroSmtp({ code: 'EAUTH', command: 'AUTH LOGIN', responseCode: 535 }).estado).toBe('rejeitado');
    expect(classificarErroSmtp({ code: 'ECONNECTION', command: 'CONN' }).estado).toBe('falhou');
    expect(classificarErroSmtp({ code: 'ETIMEDOUT', command: 'DATA' }).estado).toBe('resultado_indeterminado');
  });

  it('habilita convites independentemente do canal de notificações', () => {
    const env = {
      CONVITE_TRANSPORTE: 'smtp', SMTP_HOST: 'smtp.office365.com', SMTP_PORT: '587', SMTP_SECURE: 'false',
      SMTP_USER: 'nao-responda@azime.com.br', SMTP_PASS: 'senha-teste',
      SMTP_FROM: 'Chamados Azime <chamados@azime.com.br>', APP_BASE_URL: 'https://reverso.example.test',
      NOTIFICACAO_EMAIL_TRANSPORTE: 'simulado',
    };
    expect(smtpConfigurado(env)).toBe(true);
    expect(convitesHabilitados(env)).toBe(true);
    expect(convitesHabilitados({ ...env, CONVITE_TRANSPORTE: 'simulado', NOTIFICACAO_EMAIL_TRANSPORTE: 'smtp' })).toBe(false);
    expect(smtpDoc).toContain('controles independentes');
  });
});
