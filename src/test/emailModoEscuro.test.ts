import { describe, expect, it } from 'vitest';
import { montarEmailAcesso } from '../../supabase/functions/admin-usuarios/convite-email';
import { montarContratoComunicacao, type DadosComunicacaoEtiqueta } from '../../supabase/functions/comunicacao-etiqueta/logic';

// Modo escuro dos e-mails com a identidade aprovada (convite/senha via SMTP e "etiqueta disponível" via
// Power Automate). Prova só o HTML gerado: o resultado no Outlook real depende do cliente e precisa da
// matriz de validação em docs/email-modo-escuro-outlook.md.

const convite = montarEmailAcesso({ tipo: 'invite', nome: 'Maria', url: 'https://reverso.example.test/definir-senha?token_hash=abcdefghijklmnop&type=invite' }).html;
const dadosEtiqueta: DadosComunicacaoEtiqueta = {
  comunicacao_id: 'aviso-1',
  tentativa_id: 'tentativa-1',
  lock_token: 'lock-1',
  emissao_id: 'emissao-1',
  solicitacao_id: '22222222-2222-4222-8222-222222222222',
  evento: 'etiqueta_disponivel',
  canal: 'email',
  destinatario_id: 'pessoa-1',
  destinatario_email: 'pessoa@alinare.com.br',
  empresa: 'Alinare',
  setor: 'Comercial',
  cliente_codigo: '8080',
  cliente_nome: 'Cliente fictício',
  codigo_rastreio: 'AB123456785BR',
  valida_ate: '2026-11-22',
  emitida_em: '2026-11-12',
  justificativa: null,
  versao: 1,
  transicao_em: null,
};
const etiqueta = montarContratoComunicacao(dadosEtiqueta, 'https://reverso.example.test').mensagem.corpo_html;

const bloco = (html: string) => {
  const inicio = html.indexOf('/* >>> modo escuro');
  const fim = html.indexOf('/* <<< modo escuro */');
  expect(inicio).toBeGreaterThan(0);
  expect(fim).toBeGreaterThan(inicio);
  return html.slice(inicio, fim);
};

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contraste = (a: string, b: string) => {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
const cor = (html: string, seletor: string, propriedade: 'color' | 'background-color') =>
  new RegExp(`${seletor.replace(/[.[\]]/g, '\\$&')}[^{]*\\{ ${propriedade}:(#[0-9A-F]{6}) !important; \\}`, 'i').exec(bloco(html))?.[1];

describe('e-mails no modo escuro (Outlook e demais clientes)', () => {
  it('o bloco de modo escuro é idêntico nos dois e-mails', () => {
    expect(bloco(convite)).toBe(bloco(etiqueta));
  });

  it.each([['convite/senha', convite], ['etiqueta disponível', etiqueta]])('%s: toda classe de cor tem regra no esquema escuro e no Outlook (data-ogsc/data-ogsb)', (_, html) => {
    const classes = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/))
      .filter((c) => /^(texto-|fundo-|botao-celula|botao-link|barra-ouro|linha)/.test(c)));
    expect(classes.size).toBeGreaterThanOrEqual(10);
    const texto = bloco(html);
    for (const classe of classes) {
      const outlook = classe.startsWith('texto-') ? `[data-ogsc] .${classe}` : classe === 'linha' ? '[data-ogsc] .linha' : `[data-ogsb] .${classe}`;
      expect(texto, classe).toContain(outlook);
      expect(texto.slice(texto.indexOf('@media (prefers-color-scheme: dark)'), texto.indexOf('[data-ogsb]')), classe).toContain(`.${classe}`);
    }
    expect(html).toContain('color-scheme:light dark');
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
  });

  it('as cores escolhidas para o escuro têm contraste mínimo de 4,5:1 (texto, marca e botão)', () => {
    const cartao = cor(convite, '[data-ogsb] .fundo-cartao', 'background-color')!;
    const cabecalho = cor(convite, '[data-ogsb] .fundo-cabecalho', 'background-color')!;
    const ouro = cor(convite, '[data-ogsb] .barra-ouro', 'background-color') ?? '#B79B75';
    for (const classe of ['texto-titulo', 'texto-corpo', 'texto-nota', 'texto-rodape']) {
      expect(contraste(cor(convite, `[data-ogsc] .${classe}`, 'color')!, cartao), classe).toBeGreaterThanOrEqual(4.5);
    }
    for (const classe of ['texto-marca', 'texto-submarca']) {
      expect(contraste(cor(convite, `[data-ogsc] .${classe}`, 'color')!, cabecalho), classe).toBeGreaterThanOrEqual(4.5);
    }
    expect(contraste(cor(convite, '[data-ogsc] .botao-link', 'color')!, ouro)).toBeGreaterThanOrEqual(4.5);
  });

  it('a identidade aprovada continua: paleta clara inline, marca, filete e botão dourado com VML', () => {
    for (const html of [convite, etiqueta]) {
      for (const valor of ['#ECEAE6', '#1B1E24', '#F7F6F3', '#B79B75', '#151F33', 'REVERSO', 'Logística reversa · Azime', '<v:roundrect']) {
        expect(html).toContain(valor);
      }
      expect(html).toMatch(/class="texto-marca"/);
      expect(html).toMatch(/class="barra-ouro"/);
      expect(html).not.toMatch(/<script|<img|<link|@import|url\(/i);
    }
  });
});
