// Mensagem "Sua etiqueta está disponível": e-mail (Outlook, pelo Power Automate) e mensagem curta do Teams.
// Módulo puro: sem APIs do Deno, sem imports e sem rede, para rodar igual na Edge Function, nos testes e
// em prévias locais.
//
// O e-mail segue o padrão visual aprovado dos e-mails do Reverso (supabase/functions/admin-usuarios/
// convite-email.ts): tabelas de apresentação, estilos inline, botão com VML para o Outlook, <style> só para
// celular e modo escuro, sem imagens, fontes externas, JavaScript, flex ou grid. A paleta é a mesma. Este
// arquivo NÃO importa nem altera o módulo dos convites (que seguem exclusivamente por SMTP).
//
// Todo texto de origem externa (empresa, cliente, códigos) é escapado aqui. O link é o da própria
// comunicação (rota estável de Meus Pedidos), sem encurtar e sem parâmetros extras.

export interface DadosMensagemEtiqueta {
  /** RV-XXXXXXXX */
  identificacao: string;
  empresa: string;
  clienteNome: string | null;
  /** DD/MM/AAAA, quando a emissão informa. */
  emitidaEm: string | null;
  codigoRastreio: string | null;
  /** DD/MM/AAAA, quando a etiqueta informa. */
  validade: string | null;
  rotulo: string;
  url: string;
}

export const TITULO_ETIQUETA_DISPONIVEL = 'Sua etiqueta está disponível';
export const ROTULO_ABRIR_MEU_PEDIDO = 'Abrir meu pedido';

const MARCA = 'REVERSO';
const SUBMARCA = 'Logística reversa · Azime';
const TEXTO = 'A etiqueta do seu pedido foi registrada e já pode ser consultada em Meus Pedidos.';
const RODAPE = 'Mensagem automática · Azime';

// Paleta do sistema (src/styles/tokens.css), a mesma do e-mail de convite.
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
  rotulo: '#5B616C',
  rodape: '#6B717C',
  borda: '#E4E0D9',
};

const FONTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";

function escapar(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FILL_PREHEADER = '&zwnj;&nbsp;'.repeat(40);

/** Linhas de detalhe, na ordem em que aparecem; só entram as que existem. */
export function linhasDaEtiqueta(dados: DadosMensagemEtiqueta): Array<[string, string]> {
  const linhas: Array<[string, string]> = [['Pedido', dados.identificacao], ['Empresa', dados.empresa]];
  if (dados.clienteNome) linhas.push(['Cliente', dados.clienteNome]);
  if (dados.emitidaEm) linhas.push(['Etiqueta registrada em', dados.emitidaEm]);
  if (dados.codigoRastreio) linhas.push(['Código de rastreamento', dados.codigoRastreio]);
  if (dados.validade) linhas.push(['Válida até', dados.validade]);
  return linhas;
}

export function montarEmailEtiquetaDisponivel(dados: DadosMensagemEtiqueta): string {
  const href = escapar(dados.url);
  const preheader = `Pedido ${dados.identificacao} · ${dados.empresa}`;
  const detalhes = linhasDaEtiqueta(dados).map(([rotulo, valor]) => `
          <tr>
            <td class="texto-nota" valign="top" style="padding:6px 16px 6px 0;font-family:${FONTE};font-size:14px;line-height:22px;color:${COR.rotulo};white-space:nowrap;">${escapar(rotulo)}</td>
            <td class="texto-corpo" valign="top" style="padding:6px 0;font-family:${FONTE};font-size:15px;line-height:22px;font-weight:600;color:${COR.texto};">${escapar(valor)}</td>
          </tr>`).join('');

  return `<!doctype html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<title>${escapar(`Reverso — ${TITULO_ETIQUETA_DISPONIVEL}`)}</title>
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
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapar(preheader)}${FILL_PREHEADER}</div>
<table role="presentation" class="fundo-pagina" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COR.pagina}" style="width:100%;background-color:${COR.pagina};">
<tr><td align="center" style="padding:32px 12px;">
  <table role="presentation" class="caixa" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
    <tr>
      <td class="fundo-cabecalho lateral" bgcolor="${COR.cabecalho}" style="background-color:${COR.cabecalho};padding:32px 40px 28px 40px;border-radius:12px 12px 0 0;">
        <div class="texto-marca" style="font-family:${FONTE};font-size:20px;line-height:24px;font-weight:700;letter-spacing:6px;color:${COR.marca};">${MARCA}</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td height="14" style="height:14px;line-height:14px;font-size:0;">&nbsp;</td></tr><tr><td class="barra-ouro" width="40" height="2" bgcolor="${COR.ouro}" style="width:40px;height:2px;line-height:2px;font-size:2px;background-color:${COR.ouro};padding:0;">&nbsp;</td></tr></table>
        <div class="texto-submarca" style="font-family:${FONTE};font-size:13px;line-height:20px;letter-spacing:0.4px;color:${COR.submarca};padding-top:10px;">${escapar(SUBMARCA)}</div>
      </td>
    </tr>
    <tr>
      <td class="fundo-cartao lateral" bgcolor="${COR.cartao}" style="background-color:${COR.cartao};padding:48px 40px 44px 40px;">
        <h1 class="titulo texto-titulo" style="margin:0 0 24px 0;font-family:${FONTE};font-size:30px;line-height:38px;font-weight:600;color:${COR.titulo};">${escapar(TITULO_ETIQUETA_DISPONIVEL)}</h1>
        <p class="texto-corpo" style="margin:0 0 28px 0;font-family:${FONTE};font-size:17px;line-height:27px;color:${COR.texto};">${escapar(TEXTO)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 36px 0;">${detalhes}
        </table>
        <table role="presentation" class="botao-tabela" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
          <tr>
            <td class="botao-celula" align="center" bgcolor="${COR.ouro}" style="background-color:${COR.ouro};border-radius:8px;">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:52px;width:248px;v-text-anchor:middle;" arcsize="15%" strokecolor="${COR.ouro}" fillcolor="${COR.ouro}"><w:anchorlock/><center style="color:${COR.sobreOuro};font-family:'Segoe UI',Arial,sans-serif;font-size:16px;font-weight:bold;">${escapar(dados.rotulo)}</center></v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
              <a class="botao-link" href="${href}" style="display:inline-block;padding:16px 40px;font-family:${FONTE};font-size:16px;line-height:20px;font-weight:700;color:${COR.sobreOuro};text-decoration:none;text-align:center;background-color:${COR.ouro};border-radius:8px;">${escapar(dados.rotulo)}</a>
<!--<![endif]-->
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="fundo-cartao linha lateral" bgcolor="${COR.cartao}" style="background-color:${COR.cartao};padding:0 40px 36px 40px;border-radius:0 0 12px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="linha" style="border-top:1px solid ${COR.borda};padding-top:20px;font-size:0;line-height:0;">&nbsp;</td></tr></table>
        <p class="texto-rodape" style="margin:0;font-family:${FONTE};font-size:12px;line-height:18px;color:${COR.rodape};">${escapar(RODAPE)}</p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

/** Teams: mensagem curta, só com o subconjunto de HTML que o chat aceita (negrito, quebra de linha, link). */
export function montarMensagemTeamsEtiquetaDisponivel(dados: DadosMensagemEtiqueta): string {
  const linhas = linhasDaEtiqueta(dados)
    .filter(([rotulo]) => rotulo !== 'Etiqueta registrada em')
    .map(([rotulo, valor]) => `${escapar(rotulo)}: <b>${escapar(valor)}</b>`);
  return `<p><b>${escapar(TITULO_ETIQUETA_DISPONIVEL)}</b></p><p>${linhas.join('<br>')}</p><p><a href="${escapar(dados.url)}">${escapar(dados.rotulo)}</a></p>`;
}
