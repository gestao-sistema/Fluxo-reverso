import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  montarContratoComunicacao,
  type DadosComunicacaoEtiqueta,
  type EventoComunicacao,
} from '../../supabase/functions/comunicacao-etiqueta/logic';

// Guarda de alinhamento das duas integrações de e-mail, que são independentes:
//   • notificações dos pedidos: Power Automate (Outlook e Teams), worker comunicacao-etiqueta;
//   • convites e definição de senha: SMTP direto, Edge Function admin-usuarios.
// O contrato do Power Automate (docs/power-automate/CONTRATO_INTEGRACAO.md) não pode inventar nomes de
// campos, eventos nem variáveis que o código não usa (e vice-versa).
const ler = (caminho: string) => readFileSync(caminho, 'utf8').replace(/\r\n/g, '\n');
const documento = ler('docs/power-automate/CONTRATO_INTEGRACAO.md');
const template = JSON.parse(ler('docs/power-automate/fluxo-etiqueta-reversa-template.json'));
const workerIndex = ler('supabase/functions/comunicacao-etiqueta/index.ts');

const dados: DadosComunicacaoEtiqueta = {
  comunicacao_id: '11111111-1111-4111-8111-111111111111',
  tentativa_id: 't1',
  lock_token: 'l1',
  emissao_id: null,
  solicitacao_id: '12345678-1234-4234-8234-123456789abc',
  evento: 'pedido_aprovado',
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

function caminhos(valor: unknown, prefixo = ''): string[] {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return [prefixo];
  return Object.entries(valor).flatMap(([chave, sub]) => caminhos(sub, prefixo ? `${prefixo}.${chave}` : chave));
}

const exemplos = [...documento.matchAll(/```json\n([\s\S]*?)```/g)]
  .map((m) => JSON.parse(m[1]))
  .filter((json) => json.versao === 1);

describe('CONTRATO_INTEGRACAO.md x código (notificações pelo Power Automate)', () => {
  it('traz um exemplo de e-mail e um de Teams com exatamente os campos que o worker envia', () => {
    expect(exemplos.map((e) => e.canal).sort()).toEqual(['email', 'teams']);
    const reais = caminhos(montarContratoComunicacao(dados, 'https://reverso.example.test')).sort();
    for (const exemplo of exemplos) expect(caminhos(exemplo).sort()).toEqual(reais);
  });

  it('os exemplos respeitam os campos obrigatórios do gatilho do template', () => {
    const esquema = template.triggers.Quando_uma_requisicao_HTTP_chegar.inputs.schema;
    for (const exemplo of exemplos) {
      for (const campo of esquema.required) expect(exemplo).toHaveProperty(campo);
      expect(exemplo.mensagem).toHaveProperty('assunto');
      expect(exemplo.mensagem).toHaveProperty('corpo_html');
      expect(exemplo.acao).toHaveProperty('url');
    }
  });

  it('cita os oito eventos e as variáveis lidas pela função, e nenhuma variável VITE_', () => {
    const eventos: EventoComunicacao[] = ['pedido_criado', 'aprovacao_pendente', 'pedido_aprovado', 'pedido_rejeitado',
      'emissao_pendente', 'etiqueta_disponivel', 'postagem_confirmada', 'recebimento_confirmado'];
    for (const evento of eventos) expect(documento).toContain(`\`${evento}\``);
    const nomes = [...(/ENV_NAMES = \[([\s\S]*?)\] as const/.exec(workerIndex)?.[1] ?? '').matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(nomes.length).toBe(9);
    for (const nome of nomes) expect(documento).toContain(`\`${nome}\``);
    expect(documento).not.toMatch(/VITE_[A-Z_]+=/);
  });

  it('todo link do HTML (inclusive o botão com VML do e-mail) é acao.url, em todos os eventos e canais, mesmo com dados hostis', () => {
    const eventos: EventoComunicacao[] = ['pedido_criado', 'aprovacao_pendente', 'pedido_aprovado', 'pedido_rejeitado',
      'emissao_pendente', 'etiqueta_disponivel', 'postagem_confirmada', 'recebimento_confirmado'];
    const hostil = '"><a href="https://invasor.example.test">x</a><script>1</script>';
    for (const evento of eventos) {
      for (const canal of ['email', 'teams'] as const) {
        const contrato = montarContratoComunicacao({
          ...dados, evento, canal, cliente_nome: hostil, motivo: hostil, setor: hostil, justificativa: hostil, codigo_rastreio: hostil,
        }, 'http://localhost:5173');
        const html = contrato.mensagem.corpo_html;
        const esperado = contrato.acao.url.replace(/&/g, '&amp;');
        const hrefs = [...html.matchAll(/<[^>]*\shref="([^"]*)"/gi)].map((m) => m[1]);
        expect(hrefs.length, `${evento}/${canal}`).toBeGreaterThan(0);
        for (const href of hrefs) expect(href, `${evento}/${canal}`).toBe(esperado);
        expect(html, `${evento}/${canal}`).not.toMatch(/<script/i);
        expect(contrato.acao.url.startsWith('http://localhost:5173/admin/')).toBe(true);
      }
    }
  });

  it('não contém segredo, chave nem URL de fluxo real', () => {
    expect(documento).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(documento).not.toMatch(/[?&]sig=[A-Za-z0-9%_-]{8,}/);
    expect(documento).not.toMatch(/prod\.[a-z0-9.]*logic\.azure\.com/);
  });
});

describe('separação: notificações pelo Power Automate, convites por SMTP', () => {
  const notificacoes = ['worker.ts', 'logic.ts', 'index.ts', 'email-visual.ts']
    .map((arquivo) => ler(`supabase/functions/comunicacao-etiqueta/${arquivo}`)).join('\n');
  const convites = ler('supabase/functions/admin-usuarios/index.ts') + '\n' + ler('supabase/functions/admin-usuarios/convite.ts');
  const guiaSmtp = ler('docs/envio-email-smtp.md');

  it('o worker de notificações não importa nem lê nada de SMTP, de convites ou da antiga chave de e-mail', () => {
    expect(notificacoes).not.toMatch(/_shared\/smtp|nodemailer|enviarEmailSmtp|SMTP_|CONVITE_|NOTIFICACAO_/);
    expect(notificacoes).toContain('reversa_claim_comunicacao_etiqueta');
    expect(notificacoes).toContain('reversa_finalizar_comunicacao_etiqueta_v2');
    expect(notificacoes).not.toContain('reversa_claim_comunicacao_email');
    expect(notificacoes).not.toContain('reversa_finalizar_comunicacao_email');
    expect(notificacoes).toContain("'ETIQUETA_TRANSPORTE'");
  });

  it('o convite continua exclusivamente por SMTP, com controle próprio e sem Power Automate', () => {
    expect(convites).toContain("from '../_shared/smtp.ts'");
    expect(convites).toContain('enviarEmailSmtp');
    expect(convites).toContain("'CONVITE_TRANSPORTE'");
    expect(convites).not.toMatch(/POWER_AUTOMATE|ETIQUETA_TRANSPORTE/);
    // O SMTP direto é biblioteca compartilhada do convite: o código de notificações não a referencia.
    expect(ler('supabase/functions/_shared/smtp.ts')).toContain('npm:nodemailer@10.2.1');
  });

  it('o guia de SMTP descreve só os convites e diz que as notificações usam o Power Automate', () => {
    for (const nome of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_FROM', 'SMTP_PASS', 'APP_BASE_URL', 'CONVITE_TRANSPORTE']) {
      expect(guiaSmtp).toContain(nome);
    }
    expect(guiaSmtp).not.toContain('NOTIFICACAO_EMAIL_TRANSPORTE');
    expect(guiaSmtp).toContain('Power Automate');
    expect(guiaSmtp).toMatch(/notifica[çc][õo]es dos pedidos/i);
    expect(guiaSmtp).not.toMatch(/^VITE_[A-Z0-9_]+=/m);
  });
});
