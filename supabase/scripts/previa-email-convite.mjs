// Prévia local do e-mail de convite. Dados fictícios, nenhum token/conta/envio: o botão sai SEM link.
// Uso: node supabase/scripts/previa-email-convite.mjs   (Node 22.6+ importa o .ts diretamente)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { montarEmailAcesso } from '../functions/admin-usuarios/convite-email.ts';

const saida = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'previa-email-convite');
mkdirSync(saida, { recursive: true });

const AVISO = 'Prévia de demonstração — botão sem ação.';
const BARRA = `<div style="margin:0;padding:10px 12px;background:#FFF8E6;color:#5B4A1F;border-bottom:1px solid #E6D3A3;font:13px/18px -apple-system,'Segoe UI',Roboto,Arial,sans-serif;text-align:center;">${AVISO}</div>`;

function previa(tipo, nome) {
  // URL fictícia só para montar a estrutura; é removida do HTML antes de gravar.
  const { html } = montarEmailAcesso({ tipo, nome, url: 'https://previa.invalid/botao-sem-acao' });
  const semAcao = html
    .replace(/ href="https:\/\/previa\.invalid\/botao-sem-acao"/g, '')
    .replace('class="botao-link"', 'class="botao-link" aria-disabled="true"')
    .replace(/(<a class="botao-link"[^>]*style=")/, '$1cursor:default;');
  if (semAcao.includes('previa.invalid')) throw new Error('o link fictício não foi removido');
  return semAcao.replace(/(<body[^>]*>)/, `$1\n${BARRA}`);
}

const arquivos = {
  'convite.html': previa('invite', 'Maria da Silva'),
  'conclusao-de-cadastro.html': previa('recovery', 'Maria da Silva'),
};
for (const [nome, conteudo] of Object.entries(arquivos)) {
  writeFileSync(join(saida, nome), conteudo, 'utf8');
  console.log(join(saida, nome));
}
