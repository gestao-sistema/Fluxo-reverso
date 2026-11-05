import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  classificarRespostaFluxo,
  montarContratoComunicacao,
  origemAplicativoValida,
  textoLinha,
  transportePowerAutomateConfigurado,
  type DadosComunicacaoEtiqueta,
} from '../../supabase/functions/comunicacao-etiqueta/logic';

const dados: DadosComunicacaoEtiqueta = {
  comunicacao_id: 'notice-email-1',
  tentativa_id: 'attempt-1',
  lock_token: 'lock-1',
  emissao_id: 'emission-1',
  solicitacao_id: '12345678-1234-4234-8234-123456789abc',
  evento: 'etiqueta_disponivel',
  canal: 'email',
  destinatario_id: 'requester-1',
  destinatario_email: 'solicitante@example.test',
  empresa: 'Alinare',
  setor: 'Comercial',
  cliente_codigo: '8080',
  cliente_nome: 'Cliente fictício',
  codigo_rastreio: 'AA123456789BR',
  valida_ate: '2026-11-23',
  emitida_em: '2026-10-26',
  justificativa: null,
  versao: 1,
  transicao_em: null,
};

describe('contrato da fila de comunicação do reverso', () => {
  it('monta etiqueta disponível sem exigir rastreamento e usa link estável para Meus Pedidos', () => {
    const contrato = montarContratoComunicacao(dados, 'https://reverso.example.test');
    expect(contrato).toEqual(expect.objectContaining({
      versao: 1,
      evento: 'etiqueta_disponivel',
      idempotency_key: dados.comunicacao_id,
      canal: 'email',
      destinatario: { id: 'requester-1', email: 'solicitante@example.test' },
      pedido: { id: dados.solicitacao_id, identificacao: 'RV-12345678', empresa: 'Alinare', setor: 'Comercial', motivo: null, data_solicitacao: null },
      cliente: { codigo: '8080', nome: 'Cliente fictício' },
      codigo_rastreio: 'AA123456789BR',
      validade: '23/11/2026',
      acao: {
        rotulo: 'Abrir meu pedido',
        url: `https://reverso.example.test/admin/meus-pedidos?solicitacaoId=${dados.solicitacao_id}`,
      },
    }));
    expect(contrato.acao.url).not.toContain('token=');
    expect(contrato.acao.url).not.toContain('signature=');
    expect(montarContratoComunicacao({ ...dados, codigo_rastreio: null, valida_ate: null }, 'https://reverso.example.test'))
      .toMatchObject({ codigo_rastreio: null, validade: null });
    const corpoSemExtras = montarContratoComunicacao({ ...dados, codigo_rastreio: null, valida_ate: null }, 'https://reverso.example.test').mensagem.corpo_html;
    expect(corpoSemExtras).not.toContain('Código de rastreamento');
    expect(corpoSemExtras).not.toContain('Válida até');
  });

  it('monta links e conteúdo específicos para aprovação, rejeição e logística', () => {
    const aprovacao = montarContratoComunicacao({ ...dados, evento: 'aprovacao_pendente', canal: 'teams' }, 'https://reverso.example.test');
    expect(aprovacao.acao.url).toBe(`https://reverso.example.test/admin/aprovacoes?solicitacaoId=${dados.solicitacao_id}`);
    expect(aprovacao.mensagem.corpo_html).toContain('aguardando sua análise');

    const emissao = montarContratoComunicacao({ ...dados, evento: 'emissao_pendente', canal: 'teams' }, 'https://reverso.example.test');
    expect(emissao.acao.url).toBe(`https://reverso.example.test/admin/etiquetas?pedido=${dados.solicitacao_id}`);

    const rejeicao = montarContratoComunicacao({
      ...dados, evento: 'pedido_rejeitado', justificativa: '<script>Rever</script>',
    }, 'https://reverso.example.test');
    expect(rejeicao.mensagem.corpo_html).toContain('&lt;script&gt;Rever&lt;/script&gt;');
    expect(rejeicao.mensagem.corpo_html).toContain('Justificativa:');

    const recebimento = montarContratoComunicacao({ ...dados, evento: 'recebimento_confirmado' }, 'https://reverso.example.test');
    expect(recebimento.mensagem.corpo_html).toContain('O <b>recebimento da mercadoria</b> foi confirmado pela empresa');
  });

  it('só reconhece sucesso quando o conector concluiu e a resposta corresponde ao canal enviado', () => {
    const contrato = { idempotency_key: dados.comunicacao_id, canal: 'email' as const };
    const sucesso = { status: 'connector_action_succeeded', communication_id: dados.comunicacao_id, canal: 'email' };
    expect(classificarRespostaFluxo(200, sucesso, contrato)).toBe('acao_conector_concluida');
    expect(classificarRespostaFluxo(200, { ...sucesso, canal: 'teams' }, contrato)).toBe('resultado_indeterminado');
    expect(classificarRespostaFluxo(200, { ...sucesso, communication_id: 'outra' }, contrato)).toBe('resultado_indeterminado');
    expect(classificarRespostaFluxo(202, { status: 'accepted' }, contrato)).toBe('resultado_indeterminado');
    expect(classificarRespostaFluxo(200, null, contrato)).toBe('resultado_indeterminado');
  });

  it('401/403 do gatilho é falha segura; erro do conector só repete quando o fluxo garante que nada foi aceito', () => {
    const contrato = { idempotency_key: dados.comunicacao_id, canal: 'teams' as const };
    const falha = (retryable: boolean) => ({ status: 'connector_action_failed', communication_id: dados.comunicacao_id, canal: 'teams', retryable });
    expect(classificarRespostaFluxo(401, { error: { code: 'x' } }, contrato)).toBe('falhou');
    expect(classificarRespostaFluxo(403, null, contrato)).toBe('falhou');
    expect(classificarRespostaFluxo(503, falha(true), contrato)).toBe('falhou');
    expect(classificarRespostaFluxo(502, falha(false), contrato)).toBe('resultado_indeterminado');
    expect(classificarRespostaFluxo(500, null, contrato)).toBe('resultado_indeterminado');
  });

  it('rejeição explícita do contrato pelo fluxo é erro permanente', () => {
    const contrato = { idempotency_key: dados.comunicacao_id, canal: 'email' as const };
    for (const status of ['invalid_channel', 'invalid_event', 'invalid_link', 'invalid_content']) {
      expect(classificarRespostaFluxo(400, { status, communication_id: dados.comunicacao_id, canal: 'email' }, contrato)).toBe('erro_permanente');
    }
    expect(classificarRespostaFluxo(400, { status: 'invalid_event', communication_id: 'outra' }, contrato)).toBe('resultado_indeterminado');
  });

  it('exige URL do fluxo em HTTPS, OAuth completo e origem válida do aplicativo para sair do modo simulado', () => {
    const env = {
      ETIQUETA_TRANSPORTE: 'power_automate', POWER_AUTOMATE_FLOW_URL: 'https://fluxo.example.test/invocar',
      POWER_AUTOMATE_TENANT_ID: 'tenant', POWER_AUTOMATE_CLIENT_ID: 'cliente', POWER_AUTOMATE_CLIENT_SECRET: 'segredo',
      POWER_AUTOMATE_SCOPE: 'https://service.flow.microsoft.com//.default', APP_BASE_URL: 'https://reverso.example.test',
    };
    expect(transportePowerAutomateConfigurado({})).toBe(false);
    expect(transportePowerAutomateConfigurado(env)).toBe(true);
    for (const chave of Object.keys(env)) expect(transportePowerAutomateConfigurado({ ...env, [chave]: undefined }), chave).toBe(false);
    expect(transportePowerAutomateConfigurado({ ...env, ETIQUETA_TRANSPORTE: 'simulado' })).toBe(false);
    expect(transportePowerAutomateConfigurado({ ...env, POWER_AUTOMATE_FLOW_URL: 'http://fluxo.example.test' })).toBe(false);
    expect(transportePowerAutomateConfigurado({ ...env, APP_BASE_URL: 'http://reverso.example.test' })).toBe(false);
    // O controle dos convites não liga as notificações (e vice-versa).
    expect(transportePowerAutomateConfigurado({ ...env, ETIQUETA_TRANSPORTE: undefined, CONVITE_TRANSPORTE: 'smtp', NOTIFICACAO_EMAIL_TRANSPORTE: 'smtp' })).toBe(false);
  });

  it('etiqueta disponível, e-mail: título, pedido, empresa, dados da emissão e "Abrir meu pedido", no padrão visual aprovado', () => {
    const contrato = montarContratoComunicacao(dados, 'https://reverso.example.test');
    const html = contrato.mensagem.corpo_html;
    expect(contrato.mensagem.assunto).toBe('Sua etiqueta está disponível · RV-12345678');
    expect(html).toContain('<h1');
    expect(html).toContain('Sua etiqueta está disponível');
    for (const texto of ['RV-12345678', 'Alinare', 'Cliente fictício', '26/10/2026', 'AA123456789BR', '23/11/2026', 'Abrir meu pedido']) {
      expect(html, texto).toContain(texto);
    }
    // Mesmo padrão do e-mail aprovado (convite): marca, paleta e estrutura de tabelas com botão VML.
    expect(html).toContain('REVERSO');
    expect(html).toContain('Logística reversa · Azime');
    expect(html).toContain('#B79B75');
    expect(html).toContain('<v:roundrect');
    expect(html).toContain(`href="${contrato.acao.url}"`);
    // Sem explicações técnicas nem rótulos de histórico.
    expect(html).not.toMatch(/Atualização do histórico|connector|conector|smtp|power automate|token|idempot/i);
    // Fluxo: o HTML não pode carregar o que o fluxo recusa.
    expect(html.toLowerCase()).not.toMatch(/<script|<iframe|javascript:/);
  });

  it('etiqueta disponível sem rastreamento e sem validade não mostra linhas vazias', () => {
    const html = montarContratoComunicacao({ ...dados, codigo_rastreio: null, valida_ate: null, emitida_em: null }, 'https://reverso.example.test').mensagem.corpo_html;
    expect(html).toContain('RV-12345678');
    expect(html).not.toContain('Código de rastreamento');
    expect(html).not.toContain('Válida até');
    expect(html).not.toContain('Etiqueta registrada em');
  });

  it('etiqueta disponível, Teams: mensagem curta e legível, sem o documento de e-mail', () => {
    const contrato = montarContratoComunicacao({ ...dados, canal: 'teams' }, 'https://reverso.example.test');
    const html = contrato.mensagem.corpo_html;
    expect(contrato.canal).toBe('teams');
    expect(html).toContain('<b>Sua etiqueta está disponível</b>');
    expect(html).toContain('RV-12345678');
    expect(html).toContain('Alinare');
    expect(html).toContain('AA123456789BR');
    expect(html).toContain(`<a href="${contrato.acao.url}">Abrir meu pedido</a>`);
    expect(html).not.toMatch(/<table|<style|<html|<h1|<v:/i);
    expect(html.length).toBeLessThan(700);
    const semRastreio = montarContratoComunicacao({ ...dados, canal: 'teams', codigo_rastreio: null, valida_ate: null }, 'https://reverso.example.test').mensagem.corpo_html;
    expect(semRastreio).not.toContain('rastreamento');
    expect(semRastreio).not.toContain('Válida até');
  });

  it('etiqueta disponível: todo texto de origem externa é escapado nos dois canais', () => {
    const hostil = '<img src=x onerror=alert(1)> & "aspas"';
    for (const canal of ['email', 'teams'] as const) {
      const html = montarContratoComunicacao({ ...dados, canal, cliente_nome: hostil, empresa: hostil, codigo_rastreio: hostil }, 'https://reverso.example.test').mensagem.corpo_html;
      expect(html, canal).not.toMatch(/<img/i);
      expect(html, canal).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;aspas&quot;');
    }
  });

  it('o e-mail de etiqueta usa a mesma paleta e a mesma marca do e-mail de convite, sem depender do módulo dos convites', () => {
    const convite = readFileSync('supabase/functions/admin-usuarios/convite-email.ts', 'utf8');
    const etiqueta = readFileSync('supabase/functions/comunicacao-etiqueta/email-visual.ts', 'utf8');
    for (const marca of ['#ECEAE6', '#1B1E24', '#F7F6F3', '#B79B75', '#151F33', '#20252E', '#343943', "const MARCA = 'REVERSO'", "const SUBMARCA = 'Logística reversa · Azime'"]) {
      expect(convite, marca).toContain(marca);
      expect(etiqueta, marca).toContain(marca);
    }
    expect(etiqueta).not.toMatch(/import .*convite/);
  });

  it('mantém dados puros nos campos estruturados e escapa tudo que é HTML na mensagem', () => {
    const perigoso = montarContratoComunicacao({
      ...dados,
      evento: 'pedido_rejeitado',
      cliente_nome: 'Silva & Filhos <img src=x onerror=alert(1)>',
      motivo: 'Peça "com defeito" <b>',
      justificativa: "Ver 'anexo' <script>alert(1)</script>",
      setor: 'Comercial <i>',
    }, 'https://reverso.example.test');
    expect(perigoso.cliente.nome).toBe('Silva & Filhos <img src=x onerror=alert(1)>');
    expect(perigoso.justificativa).toBe("Ver 'anexo' <script>alert(1)</script>");
    const html = perigoso.mensagem.corpo_html;
    expect(html).not.toMatch(/<script|<img/);
    expect(html).not.toContain('Comercial <i>');
    expect(html).not.toContain('defeito" <b>');
    expect(html).toContain('Silva &amp; Filhos &lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('Ver &#39;anexo&#39; &lt;script&gt;');
    expect(html).toContain('Peça &quot;com defeito&quot; &lt;b&gt;');
    expect([...perigoso.mensagem.assunto].every((c) => c.charCodeAt(0) > 31)).toBe(true);
    expect(textoLinha('a\r\nb\tc')).toBe('a b c');
  });

  it('informa claramente o evento ocorrido: atualização histórica, tarefa pendente e horário de Brasília', () => {
    const aprovado = montarContratoComunicacao({
      ...dados, evento: 'pedido_aprovado', transicao_em: '2026-10-26T21:32:00.000Z',
      motivo: 'Peça com defeito', data_solicitacao: '2026-10-20',
    }, 'https://reverso.example.test');
    expect(aprovado.mensagem.corpo_html).toContain('<b>aprovada</b> em 26/10/2026 18:32');
    expect(aprovado.mensagem.corpo_html).toContain('Atualização do histórico do pedido');
    expect(aprovado.mensagem.corpo_html).toContain('Data da solicitação: 20/10/2026');
    expect(aprovado.mensagem.corpo_html).toContain('Motivo: Peça com defeito');
    expect(aprovado.evento_em).toBe('2026-10-26T21:32:00.000Z');

    const tarefa = montarContratoComunicacao({ ...dados, evento: 'aprovacao_pendente', canal: 'teams' }, 'https://reverso.example.test');
    expect(tarefa.mensagem.corpo_html).toContain('Tarefa pendente');
    expect(tarefa.mensagem.corpo_html).not.toContain('Atualização do histórico');

    const postagem = montarContratoComunicacao({
      ...dados, evento: 'postagem_confirmada', transicao_em: '2026-10-26T21:32:00.000Z', postagem_em: '2026-10-25',
    }, 'https://reverso.example.test');
    expect(postagem.mensagem.corpo_html).toContain('<b>postagem</b>');
    expect(postagem.mensagem.corpo_html).toContain('postada em 25/10/2026');
    expect(postagem.mensagem.corpo_html).not.toContain('recebimento');

    const recebimento = montarContratoComunicacao({ ...dados, evento: 'recebimento_confirmado', transicao_em: '2026-10-26T21:32:00.000Z' }, 'https://reverso.example.test');
    expect(recebimento.mensagem.corpo_html).toContain('confirmado pela empresa em 26/10/2026 18:32');
  });

  it('todo evento usa um link autenticado estável do aplicativo, sem token nem URL assinada', () => {
    const eventos = ['pedido_criado', 'aprovacao_pendente', 'pedido_aprovado', 'pedido_rejeitado',
      'emissao_pendente', 'etiqueta_disponivel', 'postagem_confirmada', 'recebimento_confirmado'] as const;
    for (const evento of eventos) {
      const contrato = montarContratoComunicacao({ ...dados, evento }, 'https://reverso.example.test');
      const url = new URL(contrato.acao.url);
      expect(url.origin).toBe('https://reverso.example.test');
      expect(url.pathname).toMatch(/^\/admin\/(aprovacoes|etiquetas|meus-pedidos)$/);
      expect([...url.searchParams.values()]).toEqual([dados.solicitacao_id]);
      expect(contrato.mensagem.corpo_html).toContain(`href="${contrato.acao.url}"`);
    }
    expect(() => montarContratoComunicacao({ ...dados, solicitacao_id: '../../x?y=1' }, 'https://reverso.example.test')).toThrow();
    expect(() => montarContratoComunicacao(dados, 'https://usuario:senha@reverso.example.test')).toThrow();
    expect(() => montarContratoComunicacao(dados, 'javascript:alert(1)')).toThrow();
  });

  it('só aceita origem do aplicativo em HTTPS (ou localhost), sem credenciais, caminho, consulta ou fragmento', () => {
    expect(origemAplicativoValida('https://reverso.example.test')?.origin).toBe('https://reverso.example.test');
    expect(origemAplicativoValida('http://localhost:5173')?.origin).toBe('http://localhost:5173');
    for (const invalida of ['http://reverso.example.test', 'https://u:p@reverso.example.test', 'https://reverso.example.test/app',
      'https://reverso.example.test?x=1', 'https://reverso.example.test#a', 'ftp://reverso.example.test', 'reverso', '', undefined]) {
      expect(origemAplicativoValida(invalida)).toBeNull();
    }
  });

});
