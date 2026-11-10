# Navegação sem prévia de URL e sem tooltip nativo

Documento de decisão. Registra o que muda na navegação principal (dock inferior e menu "Mais") antes de a substituição ser aplicada.

## Problemas

1. **Tooltip nativo.** O item `NavLink` do dock recebia `title="Aprovações, 2 aguardando sua análise"`. O navegador mostrava esse texto como balão branco ao passar o mouse, duplicando o nome acessível que já vem de `aria-label`.
2. **Prévia de URL.** Cada item é um `<a href>`. Ao passar o mouse, o navegador mostra o destino no canto inferior esquerdo.

## Solução adotada

- Remover o atributo `title` dos itens de navegação. O nome acessível continua em `aria-label`, com a contagem de pendências.
- Trocar os `NavLink` do dock e do menu "Mais" por `button` com `navigate(destino)` do React Router, que já é usado no projeto. Sem `href`, o navegador não mostra prévia de destino.
- Preservar a rota, o destaque da página atual (`is-active` e `aria-current="page"`), a ordem de tabulação e o foco visível.

## O que se perde (aceito)

Ao deixar de ser `<a href>`, os itens de navegação perdem os comportamentos nativos de link:

| Recurso nativo | Com `<a href>` | Com `button` + `navigate` |
|---|---|---|
| Abrir em nova aba (Ctrl+clique, clique do meio, "Abrir em nova guia") | Funciona | Não funciona |
| Copiar endereço do link / "Copiar endereço do link" | Funciona | Não funciona |
| Arrastar o link para a barra de endereço ou favoritos | Funciona | Não funciona |
| Prévia de URL no canto inferior esquerdo | Aparece | Não aparece (objetivo) |
| Anúncio por leitor de tela | "Link" | "Botão", com `aria-current="page"` |
| Ativação por teclado | Enter | Enter e Espaço (padrão de botão) |

Consequências práticas:

- Para abrir um destino da navegação em outra aba, a pessoa deve abrir a página atual e navegar pelo menu. O endereço completo continua disponível na barra do navegador depois do carregamento.
- Os destinos continuam acessíveis por URL digitada ou salva. As rotas não mudam.
- O histórico do navegador continua funcionando: `navigate` empilha uma entrada, como o clique em link. Se o destino já for a página atual, usa `replace`, igual ao `Link` do React Router.

## Escopo

- Substituído: itens do dock inferior e itens do menu "Mais" em `src/components/admin/FlowNav.tsx`, que é a barra de navegação do sistema.
- Fora do escopo, sem alteração: links de conteúdo dentro das páginas (por exemplo, "Voltar", cards e links de tabela), telas de login e as demais páginas. Eles não fazem parte da barra de navegação, e trocá-los mudaria fluxos de trabalho que dependem de nova aba.
- `title` de botões de ação fora da navegação (por exemplo, "Limpar filtros", "Ver detalhes") não foi removido nesta rodada. O `title` do botão de perfil (`src/components/auth/PerfilButton.tsx`) também permanece, porque não é item de navegação.

## Validação prevista

- Testes unitários (`src/test/contadorAprovacoes.test.tsx`): os itens passam a ser buscados por papel `button`; o nome acessível com a contagem é mantido.
- Playwright (Edge, modo demo, Vite na porta própria): hover (estilo igual ao anterior), foco por teclado, clique com navegação para a rota e destaque da página ativa, além de verificar que o item não tem `href` nem atributo `title`.
