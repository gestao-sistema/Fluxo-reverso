// Template do e-mail de convite do Reverso (convite novo e conclusão de cadastro). Módulo puro: sem APIs
// do Deno, sem imports e sem acesso a rede, para rodar igual na Edge Function, nos testes e na prévia local.
//
// HTML próprio para e-mail: tabelas de apresentação, estilos inline, botão com VML para o Outlook,
// <style> só para celular e modo escuro (clientes que ignoram o bloco continuam legíveis), sem imagens,
// fontes externas, JavaScript, flex ou grid. O link recebido é usado como está: sem encurtar, sem
// parâmetros extras e sem redirecionamento de rastreio. A única alteração é a codificação de atributo
// HTML (& vira &amp;), que o cliente de e-mail decodifica de volta ao endereço original.

export type TipoEmailAcesso = 'invite' | 'recovery';

export interface EmailAcesso {
  assunto: string;
  html: string;
  texto: string;
}

interface Conteudo {
  assunto: string;
  preheader: string;
  titulo: string;
  /** Texto principal, depois da saudação. */
  texto: string;
  botao: string;
}

const CONTEUDO: Record<TipoEmailAcesso, Conteudo> = {
  invite: {
    assunto: 'Convite de acesso ao Reverso',
    preheader: 'Seu acesso ao Reverso está pronto. Defina sua senha para começar.',
    titulo: 'Seu acesso está pronto.',
    texto: 'Você recebeu acesso ao Reverso. Crie sua senha para começar.',
    botao: 'Criar minha senha',
  },
  // Convite já aceito, senha ainda não definida. Não é recuperação genérica de conta ativa.
  recovery: {
    assunto: 'Conclua seu acesso ao Reverso',
    preheader: 'Defina sua senha para concluir o cadastro no Reverso.',
    titulo: 'Conclua seu acesso.',
    texto: 'Defina sua senha para concluir o cadastro no Reverso.',
    botao: 'Definir minha senha',
  },
};

const MARCA = 'REVERSO';
const SUBMARCA = 'Logística reversa · Azime';
const NOTA = 'Esta senha é exclusiva do Reverso e não altera sua senha Microsoft.';
const RODAPE_1 = 'Não esperava este convite? Ignore esta mensagem.';
const RODAPE_2 = 'Mensagem automática · Azime';

// Paleta do sistema (src/styles/tokens.css): grafite, champagne #B79B75 e texto sobre o preenchimento #151F33.
const COR = {
  pagina: '#ECEAE6',
  cartao: '#FFFFFF',
  cabecalho: '#1B1E24',
  marca: '#F7F6F3',
  submarca: '#B9B4AA',
  ouro: '#B79B75',
  sobreOuro: '#151F33',
  titulo: '#20252E',
  texto: '#343943',
  nota: '#5B616C',
  rodape: '#6B717C',
  borda: '#E4E0D9',
};

const FONTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";

export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Controles, separadores de linha e marcas de direção (usadas para disfarçar texto) viram espaço.
const FAIXAS_INVISIVEIS: Array<[number, number]> = [
  [0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2069], [0xfeff, 0xfeff],
];
const invisivel = (caractere: string) => {
  const ponto = caractere.codePointAt(0)!;
  return FAIXAS_INVISIVEIS.some(([de, ate]) => ponto >= de && ponto <= ate);
};

/** Primeiro nome para a saudação; vazio quando não há nome utilizável. */
export function primeiroNome(nome: unknown): string {
  if (typeof nome !== 'string') return '';
  const primeiro = Array.from(nome, (c) => (invisivel(c) ? ' ' : c)).join('').trim().split(/\s+/)[0] ?? '';
  return Array.from(primeiro).slice(0, 40).join('');
}

const FILL_PREHEADER = '&zwnj;&nbsp;'.repeat(60);

export function montarEmailAcesso(entrada: { tipo: TipoEmailAcesso; nome?: unknown; url: string }): EmailAcesso {
  const c = CONTEUDO[entrada.tipo];
  const nome = primeiroNome(entrada.nome);
  const saudacao = nome ? `Olá, ${nome}.` : 'Olá.';
  const href = escaparHtml(entrada.url);

  const html = `<!doctype html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<title>${escaparHtml(`Reverso — ${c.titulo}`)}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
  @media only screen and (max-width:620px) {
    .caixa { width:100% !important; }
    .lateral { padding-left:24px !important; padding-right:24px !important; }
    .titulo { font-size:26px !important; line-height:34px !important; }
    .botao-tabela, .botao-celula { width:100% !important; }
    .botao-link { display:block !important; }
  }
  :root { color-scheme:light dark; supported-color-schemes:light dark; }
  /* >>> modo escuro (idêntico nos dois e-mails; src/test/emailModoEscuro.test.ts confere) */
  /* Apple Mail, iOS e webmails que respeitam o esquema declarado. */
  @media (prefers-color-scheme: dark) {
    .fundo-pagina { background-color:#0E0F13 !important; }
    .fundo-cartao { background-color:#1A1B22 !important; }
    .fundo-cabecalho { background-color:#111217 !important; }
    .texto-marca { color:#F7F6F3 !important; }
    .texto-submarca { color:#B9B4AA !important; }
    .texto-titulo { color:#F7F6F3 !important; }
    .texto-corpo { color:#E2DED7 !important; }
    .texto-nota { color:#C4BFB6 !important; }
    .texto-rodape { color:#A9A49B !important; }
    .linha { border-color:#34363F !important; }
    .barra-ouro, .botao-celula, .botao-link { background-color:#B79B75 !important; }
    .botao-link { color:#151F33 !important; }
  }
  /* Outlook.com, novo Outlook e apps do Outlook ignoram a media query e recolorem sozinhos;
     marcam o que recoloriram com data-ogsc (texto) e data-ogsb (fundo). Estas regras devolvem
     as cores escolhidas: fundo escuro da marca, texto claro legível e botão dourado com texto escuro. */
  [data-ogsb] .fundo-pagina { background-color:#0E0F13 !important; }
  [data-ogsb] .fundo-cartao { background-color:#1A1B22 !important; }
  [data-ogsb] .fundo-cabecalho { background-color:#111217 !important; }
  [data-ogsb] .barra-ouro, [data-ogsb] .botao-celula, [data-ogsb] .botao-link { background-color:#B79B75 !important; }
  [data-ogsc] .texto-marca { color:#F7F6F3 !important; }
  [data-ogsc] .texto-submarca { color:#B9B4AA !important; }
  [data-ogsc] .texto-titulo { color:#F7F6F3 !important; }
  [data-ogsc] .texto-corpo { color:#E2DED7 !important; }
  [data-ogsc] .texto-nota { color:#C4BFB6 !important; }
  [data-ogsc] .texto-rodape { color:#A9A49B !important; }
  [data-ogsc] .botao-link { color:#151F33 !important; }
  [data-ogsc] .linha, [data-ogsb] .linha { border-color:#34363F !important; }
  /* <<< modo escuro */
</style>
</head>
<body class="fundo-pagina" style="margin:0;padding:0;background-color:${COR.pagina};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escaparHtml(c.preheader)}${FILL_PREHEADER}</div>
<table role="presentation" class="fundo-pagina" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COR.pagina}" style="width:100%;background-color:${COR.pagina};">
<tr><td align="center" style="padding:32px 12px;">
  <table role="presentation" class="caixa" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
    <tr>
      <td class="fundo-cabecalho lateral" bgcolor="${COR.cabecalho}" style="background-color:${COR.cabecalho};padding:32px 40px 28px 40px;border-radius:12px 12px 0 0;">
        <div class="texto-marca" style="font-family:${FONTE};font-size:20px;line-height:24px;font-weight:700;letter-spacing:6px;color:${COR.marca};">${MARCA}</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td height="14" style="height:14px;line-height:14px;font-size:0;">&nbsp;</td></tr><tr><td class="barra-ouro" width="40" height="2" bgcolor="${COR.ouro}" style="width:40px;height:2px;line-height:2px;font-size:2px;background-color:${COR.ouro};padding:0;">&nbsp;</td></tr></table>
        <div class="texto-submarca" style="font-family:${FONTE};font-size:13px;line-height:20px;letter-spacing:0.4px;color:${COR.submarca};padding-top:10px;">${escaparHtml(SUBMARCA)}</div>
      </td>
    </tr>
    <tr>
      <td class="fundo-cartao lateral" bgcolor="${COR.cartao}" style="background-color:${COR.cartao};padding:48px 40px 44px 40px;">
        <h1 class="titulo texto-titulo" style="margin:0 0 28px 0;font-family:${FONTE};font-size:30px;line-height:38px;font-weight:600;color:${COR.titulo};">${escaparHtml(c.titulo)}</h1>
        <p class="texto-corpo" style="margin:0 0 8px 0;font-family:${FONTE};font-size:17px;line-height:27px;color:${COR.texto};">${escaparHtml(saudacao)}</p>
        <p class="texto-corpo" style="margin:0 0 36px 0;font-family:${FONTE};font-size:17px;line-height:27px;color:${COR.texto};">${escaparHtml(c.texto)}</p>
        <table role="presentation" class="botao-tabela" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
          <tr>
            <td class="botao-celula" align="center" bgcolor="${COR.ouro}" style="background-color:${COR.ouro};border-radius:8px;">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:52px;width:248px;v-text-anchor:middle;" arcsize="15%" strokecolor="${COR.ouro}" fillcolor="${COR.ouro}"><w:anchorlock/><center style="color:${COR.sobreOuro};font-family:'Segoe UI',Arial,sans-serif;font-size:16px;font-weight:bold;">${escaparHtml(c.botao)}</center></v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
              <a class="botao-link" href="${href}" style="display:inline-block;padding:16px 40px;font-family:${FONTE};font-size:16px;line-height:20px;font-weight:700;color:${COR.sobreOuro};text-decoration:none;text-align:center;background-color:${COR.ouro};border-radius:8px;">${escaparHtml(c.botao)}</a>
<!--<![endif]-->
            </td>
          </tr>
        </table>
        <p class="texto-nota" style="margin:28px 0 0 0;font-family:${FONTE};font-size:14px;line-height:22px;color:${COR.nota};">${escaparHtml(NOTA)}</p>
      </td>
    </tr>
    <tr>
      <td class="fundo-cartao linha lateral" bgcolor="${COR.cartao}" style="background-color:${COR.cartao};padding:0 40px 36px 40px;border-radius:0 0 12px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="linha" style="border-top:1px solid ${COR.borda};padding-top:20px;font-size:0;line-height:0;">&nbsp;</td></tr></table>
        <p class="texto-rodape" style="margin:0 0 4px 0;font-family:${FONTE};font-size:12px;line-height:18px;color:${COR.rodape};">${escaparHtml(RODAPE_1)}</p>
        <p class="texto-rodape" style="margin:0;font-family:${FONTE};font-size:12px;line-height:18px;color:${COR.rodape};">${escaparHtml(RODAPE_2)}</p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  const texto = [
    MARCA,
    SUBMARCA,
    '',
    c.titulo,
    '',
    saudacao,
    c.texto,
    '',
    `${c.botao}:`,
    entrada.url,
    '',
    NOTA,
    '',
    '--',
    RODAPE_1,
    RODAPE_2,
    '',
  ].join('\n');

  return { assunto: c.assunto, html, texto };
}
