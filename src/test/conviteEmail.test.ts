import { describe, expect, it } from 'vitest';
import { escaparHtml, montarEmailAcesso, primeiroNome } from '../../supabase/functions/admin-usuarios/convite-email';

const URL_CONVITE = 'http://localhost:5173/definir-senha?token_hash=TOKENHASHSECRETO_abc-123&type=invite';
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe('e-mail de convite (template)', () => {
  it('convite novo: textos definidos, saudação com primeiro nome e botão único', () => {
    const { assunto, html, texto } = montarEmailAcesso({ tipo: 'invite', nome: 'Maria da Silva', url: URL_CONVITE });
    expect(assunto).toBe('Convite de acesso ao Reverso');
    for (const frase of [
      'Seu acesso ao Reverso está pronto. Defina sua senha para começar.',
      'REVERSO', 'Logística reversa · Azime', 'Seu acesso está pronto.', 'Olá, Maria.',
      'Você recebeu acesso ao Reverso. Crie sua senha para começar.', 'Criar minha senha',
      'Esta senha é exclusiva do Reverso e não altera sua senha Microsoft.',
      'Não esperava este convite? Ignore esta mensagem.', 'Mensagem automática · Azime',
    ]) {
      expect(html).toContain(frase);
      expect(texto).toContain(frase.replace('Seu acesso ao Reverso está pronto. Defina sua senha para começar.', 'Seu acesso está pronto.'));
    }
    expect(html).not.toContain('Maria da');
    expect(html).not.toMatch(/\b(expira|validade|prazo|telefone|suporte)\b/i);
  });

  it('recuperação do cadastro reutiliza o layout com título, texto e botão próprios', () => {
    const { assunto, html, texto } = montarEmailAcesso({ tipo: 'recovery', nome: 'Maria', url: URL_CONVITE.replace('invite', 'recovery') });
    expect(assunto).toBe('Conclua seu acesso ao Reverso');
    expect(html).toContain('Conclua seu acesso.');
    expect(html).toContain('Defina sua senha para concluir o cadastro no Reverso.');
    expect(html).toContain('Definir minha senha');
    expect(html).not.toContain('Criar minha senha');
    expect(html).not.toContain('Seu acesso está pronto.');
    expect(texto).toContain('Definir minha senha:');
    expect(texto).not.toMatch(/esqueceu|recuperar sua conta/i);
  });

  it('sem nome usa apenas "Olá."', () => {
    for (const nome of [undefined, null, '', '   ', 42, String.fromCharCode(0x200b, 0x202e)]) {
      const { html, texto } = montarEmailAcesso({ tipo: 'invite', nome, url: URL_CONVITE });
      expect(html).toContain('>Olá.<');
      expect(html).not.toContain('Olá,');
      expect(texto).toContain('\nOlá.\n');
    }
  });

  it('escapa o nome e o link no HTML e preserva o link literal no texto', () => {
    const nome = `<img src=x onerror=alert(1)>"'&`;
    const { html, texto } = montarEmailAcesso({ tipo: 'invite', nome, url: URL_CONVITE });
    expect(html).not.toContain('<img');
    expect(html).toContain('Olá, &lt;img.');
    expect(primeiroNome('  Ana\nMaria  ')).toBe('Ana');
    expect(primeiroNome('A'.repeat(100))).toHaveLength(40);

    const perigoso = 'https://x.test/a?b="><script>alert(1)</script>&c=1';
    const { html: h2 } = montarEmailAcesso({ tipo: 'invite', nome: 'Ana', url: perigoso });
    expect(h2).not.toContain('<script');
    expect(escaparHtml(perigoso)).toContain('&quot;&gt;&lt;script&gt;');

    // O botão decodifica exatamente para o link do backend; sem parâmetros extras nem encurtador.
    const lista = hrefs(html);
    expect(lista.length).toBeGreaterThan(0);
    for (const href of lista) expect(href.replace(/&amp;/g, '&')).toBe(URL_CONVITE);
    expect(texto).toContain(`\n${URL_CONVITE}\n`);
  });

  it('é HTML de e-mail: tabelas, estilos inline, VML do Outlook, sem JS, imagens, flex/grid nem recursos externos', () => {
    const { html } = montarEmailAcesso({ tipo: 'invite', nome: 'Maria', url: URL_CONVITE });
    expect(html).toContain('role="presentation"');
    expect(html).toContain('<v:roundrect');
    expect(html).toContain('max-width:600px');
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('max-width:620px');
    expect(html).not.toMatch(/<script|<img|<link|@import|url\(|display:\s*(flex|grid)|\bon[a-z]+\s*=/i);
    expect(html.match(/https?:\/\/[^"'\s<)]+/g)?.every((u) => /^http:\/\/localhost:5173\/definir-senha|www\.w3\.org|schemas-microsoft-com/.test(u) || u === 'http://www.w3.org/1999/xhtml')).toBe(true);
  });
});
