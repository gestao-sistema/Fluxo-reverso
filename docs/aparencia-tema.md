# Aparência por empresa e tema

Estado em 10/11/2026. A paleta oficial de Alinare e Novitá está aplicada pelos tokens de `src/styles/tokens.css`. O que não é cor oficial está marcado como **proposta** e aguarda aprovação. Este documento substitui o levantamento anterior, que afirmava que alguns componentes apareciam na tela (ver seção 7).

Legenda das tabelas: **O** = cor oficial exata; **P** = proposta (derivada, alfa, tema escuro ou estado).

## 1. Procedência

Paleta oficial: materiais originais do Marketing, transcritos pelo usuário em 10/11/2026 (valores RGB). A conversão para HEX foi conferida (10 de 10).

| Marca | Cor | RGB | HEX |
|---|---|---|---|
| Alinare | Deep | 36, 39, 65 | `#242741` |
| Alinare | Off Light | 240, 235, 228 | `#F0EBE4` |
| Alinare | Travertine | 212, 200, 183 | `#D4C8B7` |
| Alinare | New-Ruby | 122, 53, 60 | `#7A353C` |
| Alinare | Ônix | 18, 18, 18 | `#121212` |
| Novitá | Rosa nude | 214, 192, 184 | `#D6C0B8` |
| Novitá | Terracota rosado | 164, 111, 105 | `#A46F69` |
| Novitá | Bege areia | 215, 183, 155 | `#D7B79B` |
| Novitá | Cinza claro | 198, 196, 199 | `#C6C4C7` |
| Novitá | Branco | 255, 255, 255 | `#FFFFFF` |

Regras de procedência:

- Logos, JPEGs e dashboards não são fonte de cor. Nenhum valor foi amostrado de pixels.
- Os HEX aproximados das primeiras propostas e os valores medidos em imagens foram descartados.
- A marcação verde sobre a imagem da Novitá não pertence à paleta.
- O material não define papéis, hover, tema escuro, transparências nem cores de estado. Esses itens são propostas (seção 4).
- Ônix (Alinare) e Branco (Novitá) aparecem cada um em uma marca. O material não diz se são neutros de uso geral; isso depende de definição do Marketing. O tema conjunto usa esses neutros, o que é escolha de aplicação para aprovação.
- Contagem em `tokens.css`: 43 valores hex distintos em `tokens.css`: 10 oficiais (toda a lista) e 33 não oficiais (tons derivados, estados e variantes).

## 2. Papéis aplicados

Cada papel tem um valor por tema e modo. Tabela resolvida a partir de `tokens.css` (inclui as referências entre tokens).

| Papel | Alinare claro | Alinare escuro | Novitá claro | Novitá escuro | Conjunto claro | Conjunto escuro |
|---|---|---|---|---|---|---|
| Fundo da página | `#D4C8B7` **O** | `#121212` **O** | `#D6C0B8` **O** | `#392725` **P** | `#C6C4C7` **O** | `#121212` **O** |
| Superfície | `#F0EBE4` **O** | `#242741` **O** | `#FFFFFF` **O** | `#4A322F` **P** | `#FFFFFF` **O** | `#1F1F1F` **P** |
| Superfície elevada | `#F0EBE4` **O** | `#353751` **P** | `#FFFFFF` **O** | `#5A3D3A` **P** | `#FFFFFF` **O** | `#242424` **P** |
| Campo (fundo) | `#F0EBE4` **O** | `#121212` **O** | `#FFFFFF` **O** | `#291C1A` **P** | `#FFFFFF` **O** | `#121212` **O** |
| Texto principal | `#121212` **O** | `#F0EBE4` **O** | `#392725` **P** | `#FFFFFF` **O** | `#121212` **O** | `#FFFFFF` **O** |
| Texto secundário | `#242741` **O** | `#D4C8B7` **O** | `#4F3431` **P** | `#D6C0B8` **O** | `#2A2A2A` **P** | `#C6C4C7` **O** |
| Texto terciário | `#434459` **P** | `#A8A09A` **P** | `#5A3D3A` **P** | `#BAA49D` **P** | `#444444` **P** | `#939395` **P** |
| Título | `#242741` **O** | `#F0EBE4` **O** | `#392725` **P** | `#FFFFFF` **O** | `#121212` **O** | `#FFFFFF` **O** |
| Destaque (texto e acento) | `#7A353C` **O** | `#BD9A9E` **P** | `#5A3D3A` **P** | `#D7B79B` **O** | `#121212` **O** | `#C6C4C7` **O** |
| Ação principal (fundo) | `#242741` **O** | `#D4C8B7` **O** | `#8B5E59` **P** | `#D7B79B` **O** | `#121212` **O** | `#C6C4C7` **O** |
| Texto sobre a ação principal | `#F0EBE4` **O** | `#242741` **O** | `#FFFFFF` **O** | `#392725` **P** | `#FFFFFF` **O** | `#121212` **O** |
| Contorno de controle | `rgba(36, 39, 65, .6)` **P** | `rgba(240, 235, 228, .4)` **P** | `rgba(57, 39, 37, .6)` **P** | `rgba(214, 192, 184, .6)` **P** | `rgba(18, 18, 18, .5)` **P** | `rgba(198, 196, 199, .5)` **P** |
| Série Alinare (gráficos) | `#242741` **O** | `#D4C8B7` **O** | `#242741` **O** | `#D4C8B7` **O** | `#242741` **O** | `#D4C8B7` **O** |
| Série Novitá (gráficos) | `#A46F69` **O** | `#A46F69` **O** | `#A46F69` **O** | `#D7B79B` **O** | `#A46F69` **O** | `#A46F69` **O** |
| Texto da etiqueta da Novitá (nas colunas da Alinare não é usado) | `#8B5E59` **P** | `#D6C0B8` **O** | `#6B4844` **P** | `#D6C0B8` **O** | `#8B5E59` **P** | `#D6C0B8` **O** |
| Menu (fundo) | `rgba(36, 39, 65, .96)` **P** | `rgba(36, 39, 65, .84)` **P** | `rgba(57, 39, 37, .96)` **P** | `rgba(74, 50, 47, .86)` **P** | `rgba(18, 18, 18, .96)` **P** | `rgba(31, 31, 31, .86)` **P** |
| Menu (texto) | `#F0EBE4` **O** | `#D4C8B7` **O** | `#D6C0B8` **O** | `#D6C0B8` **O** | `#C6C4C7` **O** | `#C6C4C7` **O** |
| Item ativo (fundo) | `#242741` **O** | `#D4C8B7` **O** | `#8B5E59` **P** | `#D7B79B` **O** | `#121212` **O** | `#C6C4C7` **O** |
| Item ativo (texto) | `#F0EBE4` **O** | `#242741` **O** | `#FFFFFF` **O** | `#392725` **P** | `#FFFFFF` **O** | `#121212` **O** |
| Sucesso (texto) | `#125341` **P** | `#86D3B7` **P** | `#125341` **P** | `#86D3B7` **P** | `#125341` **P** | `#86D3B7` **P** |
| Atenção (texto) | `#7A4208` **P** | `#F0B872` **P** | `#7A4208` **P** | `#F0B872` **P** | `#7A4208` **P** | `#F0B872` **P** |
| Erro (texto) | `#9E1C13` **P** | `#FF9F96` **P** | `#9E1C13` **P** | `#FF9F96` **P** | `#9E1C13` **P** | `#FF9F96` **P** |
| Informação (texto) | `#1F4B80` **P** | `#A6C6EE` **P** | `#1F4B80` **P** | `#A6C6EE` **P** | `#1F4B80` **P** | `#A6C6EE` **P** |

Os valores completos, com a linha de cada um, estão no apêndice A.

## 3. Alterações de componentes

Somente cor: fontes, ícones, logos, layout, espaçamentos e comportamento não mudaram. Linhas conferidas no código desta etapa.

| Arquivo:linha | Alteração | Origem |
|---|---|---|
| `src/styles/design.css:823` | Remapeamento Tailwind de verde e azul-céu (sky) para tokens de sucesso e informação (classes usadas em Comunicações e Meus pedidos) | Tokens existentes |
| `src/styles/design.css:837` | Texto dos botões de exclusão e de recusa: `--flow-on-danger` (era `#fff`) | Token novo (Branco oficial) |
| `src/styles/design.css:840` | Tom de hover do vermelho sem literal branco | Token novo |
| `src/styles/design.css:841` | Regras de botão de sucesso sem uso no código: literais `#0c2a1f` e `#fff` trocados por tokens | Tokens existentes |
| `src/styles/design.css:546` | Realce interno dos botões de ação (era `rgba(255,255,255,.22)`) | Token novo (proposta: alfa de Branco) |
| `src/styles/design.css:715` | Realce interno do botão de acesso (era `.25`) | Token novo (proposta) |
| `src/styles/design.css:519` | Preenchimento automático do navegador segue o tema (campo e texto) | Tokens existentes |
| `src/styles/design.css:657` a `:659` | Etiqueta de empresa: borda e fundo pela cor da série; texto por `--flow-pill-texto` (Novitá usa `--flow-serie-novitah-texto`) | Tokens existentes e novo |
| `src/styles/approval.css:124` | Realce do botão primário de aprovação | Token novo |
| `src/styles/approval.css:129` | Texto do botão de recusa (era `#fff`) | Token novo |
| `src/styles/dashboard.css:209` | Destaque do estágio atual do painel: fundo em uma camada (a versão anterior tinha camada inválida) | Token existente |
| `src/styles/dashboard.css:225` | Indicadores do tema Novitá: destaque (era `#704653`) | Token novo (proposta) |
| `src/styles/dashboard.css:226` | Indicadores do tema Novitá: contorno (era `rgba(112,70,83,.26)`) | Token novo (proposta) |
| `src/styles/dashboard.css:227` | Indicadores do tema Novitá: superfície interna (era `rgba(174,125,131,.16)`) | Token novo (proposta) |
| `src/components/admin/SummaryCards.tsx:18` | Cartão "Total": `--flow-ice` indefinido trocado por destaque (**não renderizado**) | Token existente |
| `src/components/admin/SummaryCards.tsx:19` | Cartão "Aguardando aprovação": era `#ffad33` (**não renderizado**) | Token existente |
| `src/components/admin/SummaryCards.tsx:21` | Cartão "Aguardando check-in": era `#4599ff` (**não renderizado**) | Token existente |
| `src/components/admin/SummaryCards.tsx:22` | Cartão "Postados": `--flow-ice-hover` indefinido trocado por sucesso (**não renderizado**) | Token existente |
| `src/components/ui/FundoJoalheria.tsx:59` | Cor de reserva das partículas (só vale se `--flow-particula` faltar); era `232, 196, 132` | Oficial (Cinza claro) |
| `src/styles/tokens.css` (inteiro) | Paleta oficial, propostas marcadas por linha, cabeçalho com procedência; `--flow-fill` e `--flow-ativo-bg` passam de gradiente a cor sólida | Oficial e propostas |

## 4. Propostas para aprovação (não são cores oficiais)

- **Botão principal da Novitá (claro):** opções medidas na seção 5. A implementação atual usa a opção D, marcada como proposta.
- **Tons derivados da Terracota e do Rosa nude** para texto, superfícies e contornos da Novitá, inclusive o texto escuro (`#392725`) e a superfície do tema escuro (`#4A322F`, `#5A3D3A`, `#291C1A`).
- **Tema escuro** dos três temas. Alinare escuro: fundo Ônix, superfície Deep, destaque derivado do New-Ruby clareado. Novitá escuro: fundo derivado da Terracota, destaque Bege areia. Conjunto escuro: neutros Ônix e Cinza claro.
- **Transparências (alfa)** de cores oficiais em superfícies, contornos, realces, véus e sombras.
- **Estados** (sucesso, atenção, erro, informação): nenhuma cor oficial. No tema claro, os tons foram escurecidos para atingir 4,5:1 sobre o fundo da marca: sucesso `#125341`, atenção `#7A4208`, erro `#9E1C13`, informação `#1F4B80` (antes: `#17644f`, `#8f4e09`, `#b42318`, `#275b9a`). O tema escuro não mudou.
- **Neutros do tema conjunto** (Ônix, Cinza claro e Branco): depende de definição do Marketing (seção 1).
- **Textos secundários** do conjunto claro (`#2A2A2A`, `#444444`) e do Novitá claro (`#4F3431`, `#5A3D3A`, destaque `#5A3D3A`), escurecidos para 4,5:1 nos chips e botões sobre o fundo tingido.

## 5. Opções para o botão principal da Novitá (claro)

Medidas no navegador de teste: as variáveis foram injetadas só na página, sem alterar o repositório. Medição do botão real "Enviar Solicitação" (14,4 px, peso 650, texto comum: mínimo 4,5:1).

| Opção | Fundo medido | Texto medido | Contraste | Descrição (dependências na análise) |
|---|---|---|---|---|
| atual-D | `rgb(139, 94, 89)` | `rgb(255, 255, 255)` | 5,46:1 | Terracota escurecida (proposta) + Branco oficial |
| A | `rgb(164, 111, 105)` | `rgb(18, 18, 18)` | 4,51:1 | Terracota oficial + Ônix |
| B | `rgb(215, 183, 155)` | `rgb(18, 18, 18)` | 9,93:1 | Bege areia oficial + Ônix |
| C1 | `rgb(215, 183, 155)` | `rgb(57, 39, 37)` | 7,47:1 | Bege areia oficial + texto escuro novo (sem Ônix) |
| falha | `rgb(164, 111, 105)` | `rgb(255, 255, 255)` | 4,15:1 | Terracota oficial + Branco oficial |

Análise:

- **D (implementada):** mantém a Terracota como família da ação da Novitá, usa só o Branco oficial no texto e tem margem (5,46:1). Depende apenas da aprovação de um tom derivado. Não depende de o Marketing definir o Ônix como neutro.
- **A:** passa, mas com 0,01 de margem. Depende do Ônix como texto da Novitá, o que depende de definição do Marketing.
- **B:** maior contraste e só cores oficiais. Depende do Ônix como neutro e de decisão do usuário: a ação principal da Novitá deixa de ser a Terracota. A Terracota passaria a acento não textual (4,15:1 sobre o Branco, acima de 3:1).
- **C:** exige um texto escuro novo (`#392725`), que precisa de aprovação, mas não depende do Ônix.
- **Referência (Terracota + Branco oficiais):** 4,15:1, abaixo de 4,5:1. Não pode ser usada como texto.

**Recomendação: opção D.** Ela mantém a identidade da ação da Novitá, passa com margem e depende de uma única aprovação. A decisão é do usuário. Para trocar de opção, altere apenas `--flow-fill`, `--flow-fill-solid`, `--flow-on-fill` e `--flow-fill-hover` no bloco `:root[data-modo='claro'][data-tema='novitah']` de `tokens.css`.

## 6. Verificação desta etapa

- `npx tsc -b`: sem erros.
- `npx vitest run`: 87 arquivos e 931 testes, todos passando.
- `npm run build`: concluído.
- `npm run lint`: sem erros; 73 avisos das regras do React (iguais aos da etapa de consolidação).
- Auditoria no navegador (modo demonstração, Edge): 48 capturas em 1366 px e 390 px, nos modos claro e escuro, com Alinare, Novitá e conjunto. Foram medidos 3.418 textos: nenhum abaixo do mínimo (4,5:1 texto comum; 3:1 texto grande). Nenhuma tela com rolagem horizontal. 24 textos sobre imagens de fundo não são medidos pelo script e foram conferidos nas capturas.
- Telas cobertas: painel (Alinare, Novitá e conjunto), lista, meus pedidos, formulário de cada empresa, aprovações, etiquetas, NC (painel e lista), usuários e login.
- Painel de notificações: medido nas seis combinações. Claro: sem falhas. Escuro: falhas em três temas; ver a seção 9.
- As capturas ficaram fora do repositório, na pasta de trabalho da sessão.

## 7. Correções desta etapa

- O levantamento anterior afirmava que `SummaryCards.tsx`, `NcResumoDashboard.tsx`, `ChartAutorizador.tsx` e `ChartMotivoEmpresa.tsx` apareciam na tela. Não aparecem: nenhum deles é importado pelo caminho a partir de `src/main.tsx`. O painel renderiza só `ChartTimeline`, `ChartMotivo` e `ChartEmpresa`, que já liam tokens.
- O estágio atual do painel tinha fundo inválido depois da troca de gradiente por cor sólida (camada extra). Corrigido em `dashboard.css`.
- A etiqueta de empresa usava a cor da série como texto, com 4,0:1 nos dois temas. Passou a ter texto próprio por tema.
- Os tokens `--flow-ice` e `--flow-ice-hover` estavam indefinidos. Foram removidos do cartão não renderizado (apêndice B).

## 8. Pendências

- **E-mails** (`supabase/functions/admin-usuarios/convite-email.ts` e `supabase/functions/comunicacao-etiqueta/email-visual.ts`): mantêm a paleta anterior até nova publicação da função. `src/test/comunicacaoEtiquetaLogic.test.ts` exige a mesma paleta nos dois e não foi alterado.
- **Logos:** sem alteração (imagens).
- **Fundos** (`public/fundos/*`, cópias de `assets/fundos/`): sem alteração. Os wallpapers `assets/fundos/wallpaper-light-mode-*.png` têm metadados C2PA de geração por IA (OpenAI, 27/10/2026). A origem dos fundos precisa ser confirmada com o Marketing.
- **Preenchimento automático do navegador:** regra CSS adicionada. O navegador de teste não dispara o preenchimento automático; conferir à mão com credenciais salvas.
- **Componentes não renderizados** (`NcResumoDashboard`, `ChartAutorizador`, `ChartMotivoEmpresa`, `COR_MOTIVO` em `analytics.ts`, `KanbanPage`): mantêm cores fixas e não foram alterados. Não são usados por nenhuma tela hoje.
- **Botão da Novitá:** decisão entre as opções da seção 5.
- **Aprovação das propostas** da seção 4.
- **Grafia:** o código e os dados usam "Novitah"; o pedido e o material usam "Novitá". O valor do dado não muda; a apresentação depende de confirmação.
- **Dashboards:** as duas imagens citadas no pedido não chegaram à sessão. Não foram usadas como fonte de cor.
- **Sem CMYK e sem manual completo** no material recebido.

## 9. Painel de notificações (tema escuro): contraste em aberto

Achado do agente 2, por medição de pixel na versão final: carimbos de data do painel de notificações no conjunto escuro, cor #939395 sobre #3E3E3E, com 3,49:1. Esta etapa confirmou 3,51:1 pelo estilo calculado no navegador e encontrou o mesmo problema nos temas Alinare e Novitá escuros, que o relato não citava. Nos temas claros não há falha. Conferido pela outra sessão por pixel, no desktop: conjunto 3,49:1 sobre #3E3E3E; Alinare 4,35:1 sobre #44364B; Novitá 3,31:1 sobre #684B45. Novitá, rótulo Aprovação pendente: 4,15:1 por pixel no item não lido (sobre #684B45); nos itens já decididos, 5,15:1 e 5,18:1. O mobile não foi conferido.

Causa: os itens não lidos do painel recebem a cor de destaque como fundo tingido, sobre a superfície elevada. O fundo clareia e o texto terciário e o destaque perdem contraste. A auditoria anterior não abria o sino, por isso não cobria o painel.

Opções medidas por injeção de estilo, sem alterar o projeto. Mínimo de 4,5:1 para texto. Menor razão entre os textos do painel: 62 no conjunto e 32 em cada um dos outros temas.

| Tema | Opção | Menor razão | Textos abaixo de 4,5:1 | Depende de |
|---|---|---|---|---|
| Conjunto escuro | Atual: texto terciário #939395 | 3,51:1 | 6 | ser corrigido |
| Conjunto escuro | D1: texto terciário #B2B0B3 (derivado do Cinza claro) | 5,00:1 | 0 | aprovação do tom derivado |
| Conjunto escuro | D2: texto terciário #C4BFB6 (valor anterior do projeto) | 5,89:1 | 0 | aprovação de tom que não é oficial |
| Conjunto escuro | O1: texto terciário #C6C4C7 (Cinza claro oficial) | 6,22:1 | 0 | texto secundário e terciário passam a ter a mesma cor |
| Conjunto escuro | D3: destaque de não lidas com 4% (mantém #939395) | 4,67:1 | 0 | aprovação da redução do destaque |
| Alinare escuro | Atual | 4,35:1 | 7 | ser corrigido |
| Alinare escuro | D4: texto terciário #AEA6A0 e acento #C2A2A6 (derivados) | 4,67:1 | 0 | aprovação de dois tons derivados |
| Alinare escuro | D5: D4 com destaque de não lidas New-Ruby a 10% | 4,78:1 | 0 | o mesmo de D4, mais a redução do destaque |
| Alinare escuro | O2: texto terciário Travertine, acento Off Light, destaque 10% | 6,96:1 | 0 | só oficial, mas texto secundário, terciário e acento viram a mesma cor |
| Alinare escuro | O3: texto terciário Travertine e destaque 10%, acento atual | 4,52:1 | 0 | passa por 0,02 e mantém o acento derivado #BD9A9E |
| Novitá escuro | Atual | 3,30:1 | 16 | ser corrigido |
| Novitá escuro | D6: texto terciário #CDBFB8 (derivado) | 4,13:1 (o menor valor é o rótulo Aprovação pendente, com destaque Bege; o texto terciário dá 4,38:1 sobre o mesmo fundo) | 9 | não passa sozinho |
| Novitá escuro | D7: texto terciário #CDBFB8 e destaque de não lidas Bege a 5% | 4,72:1 | 0 | aprovação do tom derivado e da redução do destaque |
| Novitá escuro | O4: texto terciário Rosa nude e destaque Bege a 5% | 4,72:1 | 0 | só oficial, mas texto secundário e terciário viram a mesma cor |

Recomendação técnica, não aplicada: a versão derivada, com D1 no conjunto, D4 no Alinare e D7 no Novitá. Ela mantém os três níveis de texto que o restante do sistema usa e exige a aprovação de poucos tons, cada um com margem medida. A alternativa só com cores oficiais é O1, O2 e O4: não cria tons novos, mas achata o texto secundário e o terciário nos temas escuros. A decisão é do usuário.

Efeitos: cada opção muda o texto terciário (e, no Alinare, o acento) em todo o tema escuro, não só no painel. A redução do destaque de não lidas pode ser restrita ao painel com um token próprio, para não alterar outros usos do acento. Depois de qualquer escolha, é preciso repetir a auditoria de todas as telas. O menu da conta e os diálogos de detalhe, arquivamento e importação foram conferidos pela outra sessão, de forma aproximada e sem falha. As notificações tipo toast não foram medidas.

## Apêndice A: tokens de cor

| Token | Bloco | Valor | Origem | Arquivo:linha |
|---|---|---|---|---|
| `--flow-login-border` | Base (sem cor de tema) | `rgba(198, 196, 199, .3)` | Proposta (alfa de Cinza claro) | `src/styles/tokens.css:54` |
| `--flow-login-trace-edge` | Base (sem cor de tema) | `#C6C4C7` | Oficial (Cinza claro) | `src/styles/tokens.css:55` |
| `--flow-login-trace-highlight` | Base (sem cor de tema) | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:56` |
| `--flow-login-trace-return` | Base (sem cor de tema) | `#C6C4C7` | Oficial (Cinza claro) | `src/styles/tokens.css:57` |
| `--flow-login-trace-filter` | Base (sem cor de tema) | `drop-shadow(0 0 6px rgba(198, 196, 199, .72))` | Efeito (sombra, cor neutra) | `src/styles/tokens.css:58` |
| `--flow-login-trace-filter-hover` | Base (sem cor de tema) | `drop-shadow(0 0 10px rgba(255, 255, 255, .88))` | Efeito (sombra, cor neutra) | `src/styles/tokens.css:59` |
| `--flow-surface-light` | Base (sem cor de tema) | `rgba(255, 255, 255, .93)` | Proposta (alfa de Branco) | `src/styles/tokens.css:93` |
| `--flow-text-on-light` | Base (sem cor de tema) | `#392725` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:94` |
| `--flow-text-on-light-2` | Base (sem cor de tema) | `#5A3D3A` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:95` |
| `--flow-line-on-light` | Base (sem cor de tema) | `rgba(255, 255, 255, .6)` | Proposta (alfa de Branco) | `src/styles/tokens.css:96` |
| `--flow-on-light-accent` | Base (sem cor de tema) | `#6B4844` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:97` |
| `--flow-on-light-line` | Base (sem cor de tema) | `rgba(57, 39, 37, .26)` | Proposta (alfa) | `src/styles/tokens.css:98` |
| `--flow-on-light-inset` | Base (sem cor de tema) | `rgba(164, 111, 105, .16)` | Proposta (alfa de Terracota rosado) | `src/styles/tokens.css:99` |
| `--flow-realce` | Base (sem cor de tema) | `rgba(255, 255, 255, .22)` | Proposta (alfa de Branco) | `src/styles/tokens.css:102` |
| `--flow-realce-forte` | Base (sem cor de tema) | `rgba(255, 255, 255, .25)` | Proposta (alfa de Branco) | `src/styles/tokens.css:103` |
| `--flow-on-danger` | Base (sem cor de tema) | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:105` |
| `--flow-chrome` | Base (sem cor de tema) | `var(--flow-surface)` | Referência a outro token | `src/styles/tokens.css:109` |
| `--flow-chrome-text` | Base (sem cor de tema) | `var(--flow-text-2)` | Referência a outro token | `src/styles/tokens.css:110` |
| `--flow-chrome-text-forte` | Base (sem cor de tema) | `var(--flow-text)` | Referência a outro token | `src/styles/tokens.css:111` |
| `--flow-chrome-hover` | Base (sem cor de tema) | `var(--flow-surface-hover)` | Referência a outro token | `src/styles/tokens.css:112` |
| `--flow-chrome-inset` | Base (sem cor de tema) | `var(--flow-surface-inset)` | Referência a outro token | `src/styles/tokens.css:113` |
| `--flow-chrome-line` | Base (sem cor de tema) | `var(--flow-line-strong)` | Referência a outro token | `src/styles/tokens.css:114` |
| `--flow-chrome-ativo-bg` | Base (sem cor de tema) | `var(--flow-ativo-bg)` | Referência a outro token | `src/styles/tokens.css:115` |
| `--flow-chrome-ativo-text` | Base (sem cor de tema) | `var(--flow-ativo-text)` | Referência a outro token | `src/styles/tokens.css:116` |
| `--flow-chrome-ativo-borda` | Base (sem cor de tema) | `var(--flow-ativo-borda)` | Referência a outro token | `src/styles/tokens.css:117` |
| `--flow-titulo` | Base (sem cor de tema) | `var(--flow-text)` | Referência a outro token | `src/styles/tokens.css:119` |
| `--flow-bg` | Escuro · conjunto (base) | `#121212` | Oficial (Ônix) | `src/styles/tokens.css:127` |
| `--flow-particula` | Escuro · conjunto (base) | `198, 196, 199` | Proposta | `src/styles/tokens.css:128` |
| `--flow-serie-alinare` | Escuro · conjunto (base) | `#D4C8B7` | Oficial (Travertine) | `src/styles/tokens.css:129` |
| `--flow-serie-novitah` | Escuro · conjunto (base) | `#A46F69` | Oficial (Terracota rosado) | `src/styles/tokens.css:130` |
| `--flow-serie-novitah-texto` | Escuro · conjunto (base) | `#D6C0B8` | Oficial (Rosa nude) | `src/styles/tokens.css:131` |
| `--flow-surface` | Escuro · conjunto (base) | `rgba(31, 31, 31, .86)` | Proposta (alfa) | `src/styles/tokens.css:133` |
| `--flow-surface-solid` | Escuro · conjunto (base) | `#1F1F1F` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:134` |
| `--flow-surface-raised` | Escuro · conjunto (base) | `rgba(36, 36, 36, .97)` | Proposta (alfa) | `src/styles/tokens.css:135` |
| `--flow-surface-raised-solid` | Escuro · conjunto (base) | `#242424` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:136` |
| `--flow-surface-inset` | Escuro · conjunto (base) | `rgba(18, 18, 18, .42)` | Proposta (alfa de Ônix) | `src/styles/tokens.css:137` |
| `--flow-surface-nested` | Escuro · conjunto (base) | `rgba(198, 196, 199, .05)` | Proposta (alfa de Cinza claro) | `src/styles/tokens.css:138` |
| `--flow-surface-hover` | Escuro · conjunto (base) | `rgba(198, 196, 199, .08)` | Proposta (alfa de Cinza claro) | `src/styles/tokens.css:139` |
| `--flow-field` | Escuro · conjunto (base) | `rgba(18, 18, 18, .72)` | Proposta (alfa de Ônix) | `src/styles/tokens.css:140` |
| `--flow-field-solid` | Escuro · conjunto (base) | `#121212` | Oficial (Ônix) | `src/styles/tokens.css:141` |
| `--flow-overlay` | Escuro · conjunto (base) | `rgba(18, 18, 18, .72)` | Proposta (alfa de Ônix) | `src/styles/tokens.css:142` |
| `--flow-text` | Escuro · conjunto (base) | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:144` |
| `--flow-text-2` | Escuro · conjunto (base) | `#C6C4C7` | Oficial (Cinza claro) | `src/styles/tokens.css:145` |
| `--flow-text-3` | Escuro · conjunto (base) | `#939395` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:146` |
| `--flow-accent` | Escuro · conjunto (base) | `#C6C4C7` | Oficial (Cinza claro) | `src/styles/tokens.css:148` |
| `--flow-accent-hover` | Escuro · conjunto (base) | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:149` |
| `--flow-accent-soft` | Escuro · conjunto (base) | `rgba(198, 196, 199, .16)` | Proposta (alfa de Cinza claro) | `src/styles/tokens.css:150` |
| `--flow-accent-strong` | Escuro · conjunto (base) | `rgba(198, 196, 199, .38)` | Proposta (alfa de Cinza claro) | `src/styles/tokens.css:151` |
| `--flow-fill` | Escuro · conjunto (base) | `#C6C4C7` | Oficial (Cinza claro) | `src/styles/tokens.css:152` |
| `--flow-fill-hover` | Escuro · conjunto (base) | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:153` |
| `--flow-fill-solid` | Escuro · conjunto (base) | `#C6C4C7` | Oficial (Cinza claro) | `src/styles/tokens.css:154` |
| `--flow-on-fill` | Escuro · conjunto (base) | `#121212` | Oficial (Ônix) | `src/styles/tokens.css:155` |
| `--flow-line` | Escuro · conjunto (base) | `rgba(198, 196, 199, .18)` | Proposta (alfa de Cinza claro) | `src/styles/tokens.css:157` |
| `--flow-line-strong` | Escuro · conjunto (base) | `rgba(198, 196, 199, .5)` | Proposta (alfa de Cinza claro) | `src/styles/tokens.css:158` |
| `--flow-edge` | Escuro · conjunto (base) | `rgba(255, 255, 255, .12)` | Proposta (alfa de Branco) | `src/styles/tokens.css:159` |
| `--flow-glow` | Escuro · conjunto (base) | `rgba(198, 196, 199, .22)` | Proposta (alfa de Cinza claro) | `src/styles/tokens.css:160` |
| `--flow-success` | Escuro · conjunto (base) | `#86d3b7` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:162` |
| `--flow-success-soft` | Escuro · conjunto (base) | `rgba(23, 100, 79, .3)` | Proposta (alfa) | `src/styles/tokens.css:163` |
| `--flow-warning` | Escuro · conjunto (base) | `#f0b872` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:164` |
| `--flow-warning-soft` | Escuro · conjunto (base) | `rgba(164, 90, 10, .28)` | Proposta (alfa) | `src/styles/tokens.css:165` |
| `--flow-danger` | Escuro · conjunto (base) | `#ff9f96` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:166` |
| `--flow-danger-deep` | Escuro · conjunto (base) | `#b42318` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:167` |
| `--flow-danger-soft` | Escuro · conjunto (base) | `rgba(180, 35, 24, .28)` | Proposta (alfa) | `src/styles/tokens.css:168` |
| `--flow-info` | Escuro · conjunto (base) | `#a6c6ee` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:169` |
| `--flow-info-soft` | Escuro · conjunto (base) | `rgba(39, 91, 154, .3)` | Proposta (alfa) | `src/styles/tokens.css:170` |
| `--flow-violet` | Escuro · conjunto (base) | `#c9b6f0` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:171` |
| `--flow-orange` | Escuro · conjunto (base) | `#f2ae7e` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:172` |
| `--flow-ativo-bg` | Escuro · conjunto (base) | `#C6C4C7` | Oficial (Cinza claro) | `src/styles/tokens.css:174` |
| `--flow-ativo-text` | Escuro · conjunto (base) | `#121212` | Oficial (Ônix) | `src/styles/tokens.css:175` |
| `--flow-ativo-borda` | Escuro · conjunto (base) | `rgba(198, 196, 199, .6)` | Proposta (alfa de Cinza claro) | `src/styles/tokens.css:176` |
| `--flow-shadow-panel` | Escuro · conjunto (base) | `0 22px 50px rgba(0, 0, 0, .34), 0 2px 6px rgba(0, 0, 0, .18)` | Efeito (sombra, cor neutra) | `src/styles/tokens.css:178` |
| `--flow-shadow-float` | Escuro · conjunto (base) | `0 18px 44px rgba(0, 0, 0, .42)` | Efeito (sombra, cor neutra) | `src/styles/tokens.css:179` |
| `--flow-shadow-modal` | Escuro · conjunto (base) | `0 30px 80px rgba(0, 0, 0, .55)` | Efeito (sombra, cor neutra) | `src/styles/tokens.css:180` |
| `--flow-highlight` | Escuro · conjunto (base) | `inset 0 1px 0 var(--flow-edge)` | Efeito (sombra, cor neutra) | `src/styles/tokens.css:181` |
| `--flow-sombra-texto` | Escuro · conjunto (base) | `0 1px 2px rgba(0, 0, 0, .7), 0 0 20px rgba(0, 0, 0, .6)` | Efeito (sombra, cor neutra) | `src/styles/tokens.css:183` |
| `--flow-veu` | Escuro · conjunto (base) | `radial-gradient(ellipse 70% 55% at 50% 42%, rgba(18, 18, 18, .25), rgba(18, 18, 18, .66) 100%), linear-grad…` | Proposta (alfa de Ônix) | `src/styles/tokens.css:185` |
| `--flow-brilho` | Escuro · conjunto (base) | `radial-gradient(ellipse 40% 34% at 50% 30%, rgba(255, 255, 255, .14), transparent 70%)` | Proposta (alfa de Branco) | `src/styles/tokens.css:188` |
| `--flow-bg` | Escuro · Alinare | `#121212` | Oficial (Ônix) | `src/styles/tokens.css:193` |
| `--flow-particula` | Escuro · Alinare | `212, 200, 183` | Proposta | `src/styles/tokens.css:194` |
| `--flow-surface` | Escuro · Alinare | `rgba(36, 39, 65, .84)` | Proposta (alfa de Deep) | `src/styles/tokens.css:196` |
| `--flow-surface-solid` | Escuro · Alinare | `#242741` | Oficial (Deep) | `src/styles/tokens.css:197` |
| `--flow-surface-raised` | Escuro · Alinare | `rgba(53, 55, 81, .97)` | Proposta (alfa) | `src/styles/tokens.css:198` |
| `--flow-surface-raised-solid` | Escuro · Alinare | `#353751` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:199` |
| `--flow-surface-inset` | Escuro · Alinare | `rgba(18, 18, 18, .42)` | Proposta (alfa de Ônix) | `src/styles/tokens.css:200` |
| `--flow-surface-nested` | Escuro · Alinare | `rgba(240, 235, 228, .05)` | Proposta (alfa de Off Light) | `src/styles/tokens.css:201` |
| `--flow-surface-hover` | Escuro · Alinare | `rgba(212, 200, 183, .1)` | Proposta (alfa de Travertine) | `src/styles/tokens.css:202` |
| `--flow-field` | Escuro · Alinare | `rgba(18, 18, 18, .72)` | Proposta (alfa de Ônix) | `src/styles/tokens.css:203` |
| `--flow-field-solid` | Escuro · Alinare | `#121212` | Oficial (Ônix) | `src/styles/tokens.css:204` |
| `--flow-overlay` | Escuro · Alinare | `rgba(18, 18, 18, .72)` | Proposta (alfa de Ônix) | `src/styles/tokens.css:205` |
| `--flow-text` | Escuro · Alinare | `#F0EBE4` | Oficial (Off Light) | `src/styles/tokens.css:207` |
| `--flow-text-2` | Escuro · Alinare | `#D4C8B7` | Oficial (Travertine) | `src/styles/tokens.css:208` |
| `--flow-text-3` | Escuro · Alinare | `#A8A09A` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:209` |
| `--flow-accent` | Escuro · Alinare | `#BD9A9E` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:211` |
| `--flow-accent-hover` | Escuro · Alinare | `#D7C2C4` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:212` |
| `--flow-accent-soft` | Escuro · Alinare | `rgba(122, 53, 60, .22)` | Proposta (alfa de New-Ruby) | `src/styles/tokens.css:213` |
| `--flow-accent-strong` | Escuro · Alinare | `rgba(122, 53, 60, .5)` | Proposta (alfa de New-Ruby) | `src/styles/tokens.css:214` |
| `--flow-fill` | Escuro · Alinare | `#D4C8B7` | Oficial (Travertine) | `src/styles/tokens.css:215` |
| `--flow-fill-hover` | Escuro · Alinare | `#F0EBE4` | Oficial (Off Light) | `src/styles/tokens.css:216` |
| `--flow-fill-solid` | Escuro · Alinare | `#D4C8B7` | Oficial (Travertine) | `src/styles/tokens.css:217` |
| `--flow-on-fill` | Escuro · Alinare | `#242741` | Oficial (Deep) | `src/styles/tokens.css:218` |
| `--flow-line` | Escuro · Alinare | `rgba(240, 235, 228, .18)` | Proposta (alfa de Off Light) | `src/styles/tokens.css:220` |
| `--flow-line-strong` | Escuro · Alinare | `rgba(240, 235, 228, .4)` | Proposta (alfa de Off Light) | `src/styles/tokens.css:221` |
| `--flow-edge` | Escuro · Alinare | `rgba(255, 255, 255, .12)` | Proposta (alfa de Branco) | `src/styles/tokens.css:222` |
| `--flow-glow` | Escuro · Alinare | `rgba(212, 200, 183, .24)` | Proposta (alfa de Travertine) | `src/styles/tokens.css:223` |
| `--flow-ativo-bg` | Escuro · Alinare | `#D4C8B7` | Oficial (Travertine) | `src/styles/tokens.css:225` |
| `--flow-ativo-text` | Escuro · Alinare | `#242741` | Oficial (Deep) | `src/styles/tokens.css:226` |
| `--flow-ativo-borda` | Escuro · Alinare | `rgba(212, 200, 183, .6)` | Proposta (alfa de Travertine) | `src/styles/tokens.css:227` |
| `--flow-veu` | Escuro · Alinare | `radial-gradient(ellipse 75% 60% at 55% 45%, rgba(18, 18, 18, .12), rgba(18, 18, 18, .6) 100%), linear-gradi…` | Proposta (alfa de Ônix) | `src/styles/tokens.css:229` |
| `--flow-brilho` | Escuro · Alinare | `radial-gradient(ellipse 34% 30% at 68% 8%, rgba(212, 200, 183, .18), transparent 70%)` | Proposta (alfa de Travertine) | `src/styles/tokens.css:232` |
| `--flow-bg` | Escuro · Novitá | `#392725` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:237` |
| `--flow-particula` | Escuro · Novitá | `214, 192, 184` | Proposta | `src/styles/tokens.css:238` |
| `--flow-surface` | Escuro · Novitá | `rgba(74, 50, 47, .86)` | Proposta (alfa) | `src/styles/tokens.css:240` |
| `--flow-surface-solid` | Escuro · Novitá | `#4A322F` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:241` |
| `--flow-surface-raised` | Escuro · Novitá | `rgba(90, 61, 58, .97)` | Proposta (alfa) | `src/styles/tokens.css:242` |
| `--flow-surface-raised-solid` | Escuro · Novitá | `#5A3D3A` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:243` |
| `--flow-surface-inset` | Escuro · Novitá | `rgba(41, 28, 26, .42)` | Proposta (alfa) | `src/styles/tokens.css:244` |
| `--flow-surface-nested` | Escuro · Novitá | `rgba(214, 192, 184, .05)` | Proposta (alfa de Rosa nude) | `src/styles/tokens.css:245` |
| `--flow-surface-hover` | Escuro · Novitá | `rgba(164, 111, 105, .16)` | Proposta (alfa de Terracota rosado) | `src/styles/tokens.css:246` |
| `--flow-field` | Escuro · Novitá | `rgba(41, 28, 26, .72)` | Proposta (alfa) | `src/styles/tokens.css:247` |
| `--flow-field-solid` | Escuro · Novitá | `#291C1A` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:248` |
| `--flow-overlay` | Escuro · Novitá | `rgba(57, 39, 37, .72)` | Proposta (alfa) | `src/styles/tokens.css:249` |
| `--flow-text` | Escuro · Novitá | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:251` |
| `--flow-text-2` | Escuro · Novitá | `#D6C0B8` | Oficial (Rosa nude) | `src/styles/tokens.css:252` |
| `--flow-text-3` | Escuro · Novitá | `#BAA49D` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:253` |
| `--flow-accent` | Escuro · Novitá | `#D7B79B` | Oficial (Bege areia) | `src/styles/tokens.css:255` |
| `--flow-accent-hover` | Escuro · Novitá | `#D6C0B8` | Oficial (Rosa nude) | `src/styles/tokens.css:256` |
| `--flow-accent-soft` | Escuro · Novitá | `rgba(215, 183, 155, .12)` | Proposta (alfa de Bege areia) | `src/styles/tokens.css:257` |
| `--flow-accent-strong` | Escuro · Novitá | `rgba(215, 183, 155, .42)` | Proposta (alfa de Bege areia) | `src/styles/tokens.css:258` |
| `--flow-fill` | Escuro · Novitá | `#D7B79B` | Oficial (Bege areia) | `src/styles/tokens.css:259` |
| `--flow-fill-hover` | Escuro · Novitá | `#D6C0B8` | Oficial (Rosa nude) | `src/styles/tokens.css:260` |
| `--flow-fill-solid` | Escuro · Novitá | `#D7B79B` | Oficial (Bege areia) | `src/styles/tokens.css:261` |
| `--flow-on-fill` | Escuro · Novitá | `#392725` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:262` |
| `--flow-line` | Escuro · Novitá | `rgba(214, 192, 184, .2)` | Proposta (alfa de Rosa nude) | `src/styles/tokens.css:264` |
| `--flow-line-strong` | Escuro · Novitá | `rgba(214, 192, 184, .6)` | Proposta (alfa de Rosa nude) | `src/styles/tokens.css:265` |
| `--flow-edge` | Escuro · Novitá | `rgba(255, 255, 255, .12)` | Proposta (alfa de Branco) | `src/styles/tokens.css:266` |
| `--flow-glow` | Escuro · Novitá | `rgba(215, 183, 155, .26)` | Proposta (alfa de Bege areia) | `src/styles/tokens.css:267` |
| `--flow-serie-novitah` | Escuro · Novitá | `#D7B79B` | Oficial (Bege areia) | `src/styles/tokens.css:269` |
| `--flow-ativo-bg` | Escuro · Novitá | `#D7B79B` | Oficial (Bege areia) | `src/styles/tokens.css:271` |
| `--flow-ativo-text` | Escuro · Novitá | `#392725` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:272` |
| `--flow-ativo-borda` | Escuro · Novitá | `rgba(215, 183, 155, .6)` | Proposta (alfa de Bege areia) | `src/styles/tokens.css:273` |
| `--flow-veu` | Escuro · Novitá | `radial-gradient(ellipse 75% 60% at 55% 48%, rgba(57, 39, 37, .18), rgba(57, 39, 37, .62) 100%), linear-grad…` | Proposta (gradiente de véu ou brilho) | `src/styles/tokens.css:275` |
| `--flow-brilho` | Escuro · Novitá | `radial-gradient(ellipse 30% 40% at 30% 20%, rgba(214, 192, 184, .18), transparent 70%)` | Proposta (alfa de Rosa nude) | `src/styles/tokens.css:278` |
| `--flow-veu` | Escuro · conjunto (véu do app) | `linear-gradient(180deg, rgba(18, 18, 18, .34) 0%, rgba(18, 18, 18, .84) 28%, rgba(18, 18, 18, .86) 50%, rgb…` | Proposta (alfa de Ônix) | `src/styles/tokens.css:284` |
| `--flow-brilho` | Escuro · conjunto (véu do app) | `radial-gradient(ellipse 34% 22% at 52% 6%, rgba(255, 255, 255, .12), transparent 70%)` | Proposta (alfa de Branco) | `src/styles/tokens.css:287` |
| `--flow-bg` | Claro · conjunto (base) | `#C6C4C7` | Oficial (Cinza claro) | `src/styles/tokens.css:301` |
| `--flow-particula` | Claro · conjunto (base) | `198, 196, 199` | Proposta | `src/styles/tokens.css:302` |
| `--flow-serie-alinare` | Claro · conjunto (base) | `#242741` | Oficial (Deep) | `src/styles/tokens.css:303` |
| `--flow-serie-novitah` | Claro · conjunto (base) | `#A46F69` | Oficial (Terracota rosado) | `src/styles/tokens.css:304` |
| `--flow-serie-novitah-texto` | Claro · conjunto (base) | `#8B5E59` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:305` |
| `--flow-surface` | Claro · conjunto (base) | `rgba(255, 255, 255, .94)` | Proposta (alfa de Branco) | `src/styles/tokens.css:307` |
| `--flow-surface-solid` | Claro · conjunto (base) | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:308` |
| `--flow-surface-raised` | Claro · conjunto (base) | `rgba(255, 255, 255, .99)` | Proposta (alfa de Branco) | `src/styles/tokens.css:309` |
| `--flow-surface-raised-solid` | Claro · conjunto (base) | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:310` |
| `--flow-surface-inset` | Claro · conjunto (base) | `rgba(18, 18, 18, .06)` | Proposta (alfa de Ônix) | `src/styles/tokens.css:311` |
| `--flow-surface-nested` | Claro · conjunto (base) | `rgba(18, 18, 18, .045)` | Proposta (alfa de Ônix) | `src/styles/tokens.css:312` |
| `--flow-surface-hover` | Claro · conjunto (base) | `rgba(18, 18, 18, .07)` | Proposta (alfa de Ônix) | `src/styles/tokens.css:313` |
| `--flow-field` | Claro · conjunto (base) | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:314` |
| `--flow-field-solid` | Claro · conjunto (base) | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:315` |
| `--flow-overlay` | Claro · conjunto (base) | `rgba(18, 18, 18, .45)` | Proposta (alfa de Ônix) | `src/styles/tokens.css:316` |
| `--flow-text` | Claro · conjunto (base) | `#121212` | Oficial (Ônix) | `src/styles/tokens.css:318` |
| `--flow-text-2` | Claro · conjunto (base) | `#2A2A2A` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:319` |
| `--flow-text-3` | Claro · conjunto (base) | `#444444` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:320` |
| `--flow-titulo` | Claro · conjunto (base) | `#121212` | Oficial (Ônix) | `src/styles/tokens.css:321` |
| `--flow-accent` | Claro · conjunto (base) | `#121212` | Oficial (Ônix) | `src/styles/tokens.css:323` |
| `--flow-accent-hover` | Claro · conjunto (base) | `#3F3F3F` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:324` |
| `--flow-accent-soft` | Claro · conjunto (base) | `rgba(18, 18, 18, .14)` | Proposta (alfa de Ônix) | `src/styles/tokens.css:325` |
| `--flow-accent-strong` | Claro · conjunto (base) | `rgba(18, 18, 18, .38)` | Proposta (alfa de Ônix) | `src/styles/tokens.css:326` |
| `--flow-fill` | Claro · conjunto (base) | `#121212` | Oficial (Ônix) | `src/styles/tokens.css:327` |
| `--flow-fill-hover` | Claro · conjunto (base) | `#3F3F3F` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:328` |
| `--flow-fill-solid` | Claro · conjunto (base) | `#121212` | Oficial (Ônix) | `src/styles/tokens.css:329` |
| `--flow-on-fill` | Claro · conjunto (base) | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:330` |
| `--flow-line` | Claro · conjunto (base) | `rgba(18, 18, 18, .16)` | Proposta (alfa de Ônix) | `src/styles/tokens.css:332` |
| `--flow-line-strong` | Claro · conjunto (base) | `rgba(18, 18, 18, .5)` | Proposta (alfa de Ônix) | `src/styles/tokens.css:333` |
| `--flow-edge` | Claro · conjunto (base) | `rgba(255, 255, 255, .9)` | Proposta (alfa de Branco) | `src/styles/tokens.css:334` |
| `--flow-glow` | Claro · conjunto (base) | `rgba(18, 18, 18, .16)` | Proposta (alfa de Ônix) | `src/styles/tokens.css:335` |
| `--flow-success` | Claro · conjunto (base) | `#125341` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:337` |
| `--flow-success-soft` | Claro · conjunto (base) | `rgba(18, 83, 65, .11)` | Proposta (alfa) | `src/styles/tokens.css:338` |
| `--flow-warning` | Claro · conjunto (base) | `#7A4208` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:339` |
| `--flow-warning-soft` | Claro · conjunto (base) | `rgba(122, 66, 8, .12)` | Proposta (alfa) | `src/styles/tokens.css:340` |
| `--flow-danger` | Claro · conjunto (base) | `#9E1C13` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:341` |
| `--flow-danger-deep` | Claro · conjunto (base) | `#b42318` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:342` |
| `--flow-danger-soft` | Claro · conjunto (base) | `rgba(158, 28, 19, .09)` | Proposta (alfa) | `src/styles/tokens.css:343` |
| `--flow-info` | Claro · conjunto (base) | `#1F4B80` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:344` |
| `--flow-info-soft` | Claro · conjunto (base) | `rgba(31, 75, 128, .1)` | Proposta (alfa) | `src/styles/tokens.css:345` |
| `--flow-violet` | Claro · conjunto (base) | `#573d94` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:346` |
| `--flow-orange` | Claro · conjunto (base) | `#8a4612` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:347` |
| `--flow-ativo-bg` | Claro · conjunto (base) | `#121212` | Oficial (Ônix) | `src/styles/tokens.css:349` |
| `--flow-ativo-text` | Claro · conjunto (base) | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:350` |
| `--flow-ativo-borda` | Claro · conjunto (base) | `rgba(18, 18, 18, .6)` | Proposta (alfa de Ônix) | `src/styles/tokens.css:351` |
| `--flow-chrome` | Claro · conjunto (base) | `rgba(18, 18, 18, .96)` | Proposta (alfa de Ônix) | `src/styles/tokens.css:353` |
| `--flow-chrome-text` | Claro · conjunto (base) | `#C6C4C7` | Oficial (Cinza claro) | `src/styles/tokens.css:354` |
| `--flow-chrome-text-forte` | Claro · conjunto (base) | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:355` |
| `--flow-chrome-hover` | Claro · conjunto (base) | `rgba(255, 255, 255, .1)` | Proposta (alfa de Branco) | `src/styles/tokens.css:356` |
| `--flow-chrome-inset` | Claro · conjunto (base) | `rgba(255, 255, 255, .09)` | Proposta (alfa de Branco) | `src/styles/tokens.css:357` |
| `--flow-chrome-line` | Claro · conjunto (base) | `rgba(255, 255, 255, .16)` | Proposta (alfa de Branco) | `src/styles/tokens.css:358` |
| `--flow-chrome-ativo-bg` | Claro · conjunto (base) | `#C6C4C7` | Oficial (Cinza claro) | `src/styles/tokens.css:359` |
| `--flow-chrome-ativo-text` | Claro · conjunto (base) | `#121212` | Oficial (Ônix) | `src/styles/tokens.css:360` |
| `--flow-chrome-ativo-borda` | Claro · conjunto (base) | `rgba(255, 255, 255, .35)` | Proposta (alfa de Branco) | `src/styles/tokens.css:361` |
| `--flow-shadow-panel` | Claro · conjunto (base) | `0 16px 36px rgba(18, 18, 18, .1), 0 2px 6px rgba(18, 18, 18, .06)` | Efeito (sombra, cor neutra) | `src/styles/tokens.css:363` |
| `--flow-shadow-float` | Claro · conjunto (base) | `0 16px 36px rgba(18, 18, 18, .2)` | Efeito (sombra, cor neutra) | `src/styles/tokens.css:364` |
| `--flow-shadow-modal` | Claro · conjunto (base) | `0 28px 70px rgba(18, 18, 18, .26)` | Efeito (sombra, cor neutra) | `src/styles/tokens.css:365` |
| `--flow-sombra-texto` | Claro · conjunto (base) | `0 0 2px rgba(255, 255, 255, .9), 0 0 18px rgba(255, 255, 255, .9)` | Efeito (sombra, cor neutra) | `src/styles/tokens.css:366` |
| `--flow-veu` | Claro · conjunto (base) | `linear-gradient(180deg, rgba(198, 196, 199, .12) 0%, rgba(198, 196, 199, .26) 100%)` | Proposta (alfa de Cinza claro) | `src/styles/tokens.css:368` |
| `--flow-brilho` | Claro · conjunto (base) | `radial-gradient(ellipse 40% 34% at 50% 30%, rgba(255, 255, 255, .45), transparent 70%)` | Proposta (alfa de Branco) | `src/styles/tokens.css:370` |
| `--flow-bg` | Claro · Alinare | `#D4C8B7` | Oficial (Travertine) | `src/styles/tokens.css:375` |
| `--flow-particula` | Claro · Alinare | `212, 200, 183` | Proposta | `src/styles/tokens.css:376` |
| `--flow-surface` | Claro · Alinare | `rgba(240, 235, 228, .94)` | Proposta (alfa de Off Light) | `src/styles/tokens.css:378` |
| `--flow-surface-solid` | Claro · Alinare | `#F0EBE4` | Oficial (Off Light) | `src/styles/tokens.css:379` |
| `--flow-surface-raised` | Claro · Alinare | `rgba(240, 235, 228, .99)` | Proposta (alfa de Off Light) | `src/styles/tokens.css:380` |
| `--flow-surface-raised-solid` | Claro · Alinare | `#F0EBE4` | Oficial (Off Light) | `src/styles/tokens.css:381` |
| `--flow-surface-inset` | Claro · Alinare | `rgba(212, 200, 183, .5)` | Proposta (alfa de Travertine) | `src/styles/tokens.css:382` |
| `--flow-surface-nested` | Claro · Alinare | `rgba(36, 39, 65, .045)` | Proposta (alfa de Deep) | `src/styles/tokens.css:383` |
| `--flow-surface-hover` | Claro · Alinare | `rgba(36, 39, 65, .07)` | Proposta (alfa de Deep) | `src/styles/tokens.css:384` |
| `--flow-field` | Claro · Alinare | `rgba(240, 235, 228, .98)` | Proposta (alfa de Off Light) | `src/styles/tokens.css:385` |
| `--flow-field-solid` | Claro · Alinare | `#F0EBE4` | Oficial (Off Light) | `src/styles/tokens.css:386` |
| `--flow-overlay` | Claro · Alinare | `rgba(36, 39, 65, .45)` | Proposta (alfa de Deep) | `src/styles/tokens.css:387` |
| `--flow-text` | Claro · Alinare | `#121212` | Oficial (Ônix) | `src/styles/tokens.css:389` |
| `--flow-text-2` | Claro · Alinare | `#242741` | Oficial (Deep) | `src/styles/tokens.css:390` |
| `--flow-text-3` | Claro · Alinare | `#434459` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:391` |
| `--flow-titulo` | Claro · Alinare | `#242741` | Oficial (Deep) | `src/styles/tokens.css:392` |
| `--flow-accent` | Claro · Alinare | `#7A353C` | Oficial (New-Ruby) | `src/styles/tokens.css:394` |
| `--flow-accent-hover` | Claro · Alinare | `#622A30` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:395` |
| `--flow-accent-soft` | Claro · Alinare | `rgba(122, 53, 60, .14)` | Proposta (alfa de New-Ruby) | `src/styles/tokens.css:396` |
| `--flow-accent-strong` | Claro · Alinare | `rgba(122, 53, 60, .36)` | Proposta (alfa de New-Ruby) | `src/styles/tokens.css:397` |
| `--flow-fill` | Claro · Alinare | `#242741` | Oficial (Deep) | `src/styles/tokens.css:398` |
| `--flow-fill-hover` | Claro · Alinare | `#7A353C` | Oficial (New-Ruby) | `src/styles/tokens.css:399` |
| `--flow-fill-solid` | Claro · Alinare | `#242741` | Oficial (Deep) | `src/styles/tokens.css:400` |
| `--flow-on-fill` | Claro · Alinare | `#F0EBE4` | Oficial (Off Light) | `src/styles/tokens.css:401` |
| `--flow-line` | Claro · Alinare | `rgba(36, 39, 65, .18)` | Proposta (alfa de Deep) | `src/styles/tokens.css:403` |
| `--flow-line-strong` | Claro · Alinare | `rgba(36, 39, 65, .6)` | Proposta (alfa de Deep) | `src/styles/tokens.css:404` |
| `--flow-edge` | Claro · Alinare | `rgba(255, 255, 255, .9)` | Proposta (alfa de Branco) | `src/styles/tokens.css:405` |
| `--flow-glow` | Claro · Alinare | `rgba(36, 39, 65, .18)` | Proposta (alfa de Deep) | `src/styles/tokens.css:406` |
| `--flow-ativo-bg` | Claro · Alinare | `#242741` | Oficial (Deep) | `src/styles/tokens.css:408` |
| `--flow-ativo-text` | Claro · Alinare | `#F0EBE4` | Oficial (Off Light) | `src/styles/tokens.css:409` |
| `--flow-ativo-borda` | Claro · Alinare | `rgba(18, 18, 18, .6)` | Proposta (alfa de Ônix) | `src/styles/tokens.css:410` |
| `--flow-chrome` | Claro · Alinare | `rgba(36, 39, 65, .96)` | Proposta (alfa de Deep) | `src/styles/tokens.css:412` |
| `--flow-chrome-text` | Claro · Alinare | `#F0EBE4` | Oficial (Off Light) | `src/styles/tokens.css:413` |
| `--flow-chrome-text-forte` | Claro · Alinare | `#F0EBE4` | Oficial (Off Light) | `src/styles/tokens.css:414` |
| `--flow-chrome-hover` | Claro · Alinare | `rgba(240, 235, 228, .12)` | Proposta (alfa de Off Light) | `src/styles/tokens.css:415` |
| `--flow-chrome-inset` | Claro · Alinare | `rgba(240, 235, 228, .1)` | Proposta (alfa de Off Light) | `src/styles/tokens.css:416` |
| `--flow-chrome-line` | Claro · Alinare | `rgba(240, 235, 228, .2)` | Proposta (alfa de Off Light) | `src/styles/tokens.css:417` |
| `--flow-chrome-ativo-bg` | Claro · Alinare | `#D4C8B7` | Oficial (Travertine) | `src/styles/tokens.css:418` |
| `--flow-chrome-ativo-text` | Claro · Alinare | `#242741` | Oficial (Deep) | `src/styles/tokens.css:419` |
| `--flow-chrome-ativo-borda` | Claro · Alinare | `rgba(240, 235, 228, .4)` | Proposta (alfa de Off Light) | `src/styles/tokens.css:420` |
| `--flow-shadow-panel` | Claro · Alinare | `0 16px 36px rgba(36, 39, 65, .1), 0 2px 6px rgba(36, 39, 65, .06)` | Efeito (sombra, cor neutra) | `src/styles/tokens.css:422` |
| `--flow-shadow-float` | Claro · Alinare | `0 16px 36px rgba(36, 39, 65, .22)` | Efeito (sombra, cor neutra) | `src/styles/tokens.css:423` |
| `--flow-shadow-modal` | Claro · Alinare | `0 28px 70px rgba(36, 39, 65, .28)` | Efeito (sombra, cor neutra) | `src/styles/tokens.css:424` |
| `--flow-veu` | Claro · Alinare | `linear-gradient(180deg, rgba(212, 200, 183, .12) 0%, rgba(212, 200, 183, .26) 100%)` | Proposta (alfa de Travertine) | `src/styles/tokens.css:426` |
| `--flow-brilho` | Claro · Alinare | `radial-gradient(ellipse 34% 30% at 68% 8%, rgba(255, 255, 255, .5), transparent 70%)` | Proposta (alfa de Branco) | `src/styles/tokens.css:428` |
| `--flow-bg` | Claro · Novitá | `#D6C0B8` | Oficial (Rosa nude) | `src/styles/tokens.css:433` |
| `--flow-particula` | Claro · Novitá | `214, 192, 184` | Proposta | `src/styles/tokens.css:434` |
| `--flow-surface` | Claro · Novitá | `rgba(255, 255, 255, .94)` | Proposta (alfa de Branco) | `src/styles/tokens.css:436` |
| `--flow-surface-solid` | Claro · Novitá | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:437` |
| `--flow-surface-raised` | Claro · Novitá | `rgba(255, 255, 255, .99)` | Proposta (alfa de Branco) | `src/styles/tokens.css:438` |
| `--flow-surface-raised-solid` | Claro · Novitá | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:439` |
| `--flow-surface-inset` | Claro · Novitá | `rgba(164, 111, 105, .16)` | Proposta (alfa de Terracota rosado) | `src/styles/tokens.css:440` |
| `--flow-surface-nested` | Claro · Novitá | `rgba(57, 39, 37, .045)` | Proposta (alfa) | `src/styles/tokens.css:441` |
| `--flow-surface-hover` | Claro · Novitá | `rgba(57, 39, 37, .07)` | Proposta (alfa) | `src/styles/tokens.css:442` |
| `--flow-field` | Claro · Novitá | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:443` |
| `--flow-field-solid` | Claro · Novitá | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:444` |
| `--flow-overlay` | Claro · Novitá | `rgba(57, 39, 37, .45)` | Proposta (alfa) | `src/styles/tokens.css:445` |
| `--flow-text` | Claro · Novitá | `#392725` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:447` |
| `--flow-text-2` | Claro · Novitá | `#4F3431` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:448` |
| `--flow-text-3` | Claro · Novitá | `#5A3D3A` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:449` |
| `--flow-titulo` | Claro · Novitá | `#392725` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:450` |
| `--flow-serie-novitah-texto` | Claro · Novitá | `#6B4844` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:451` |
| `--flow-accent` | Claro · Novitá | `#5A3D3A` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:453` |
| `--flow-accent-hover` | Claro · Novitá | `#4A322F` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:454` |
| `--flow-accent-soft` | Claro · Novitá | `rgba(164, 111, 105, .2)` | Proposta (alfa de Terracota rosado) | `src/styles/tokens.css:455` |
| `--flow-accent-strong` | Claro · Novitá | `rgba(164, 111, 105, .5)` | Proposta (alfa de Terracota rosado) | `src/styles/tokens.css:456` |
| `--flow-fill` | Claro · Novitá | `#8B5E59` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:457` |
| `--flow-fill-hover` | Claro · Novitá | `#6B4844` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:458` |
| `--flow-fill-solid` | Claro · Novitá | `#8B5E59` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:459` |
| `--flow-on-fill` | Claro · Novitá | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:460` |
| `--flow-line` | Claro · Novitá | `rgba(57, 39, 37, .18)` | Proposta (alfa) | `src/styles/tokens.css:462` |
| `--flow-line-strong` | Claro · Novitá | `rgba(57, 39, 37, .6)` | Proposta (alfa) | `src/styles/tokens.css:463` |
| `--flow-edge` | Claro · Novitá | `rgba(255, 255, 255, .9)` | Proposta (alfa de Branco) | `src/styles/tokens.css:464` |
| `--flow-glow` | Claro · Novitá | `rgba(164, 111, 105, .22)` | Proposta (alfa de Terracota rosado) | `src/styles/tokens.css:465` |
| `--flow-success` | Claro · Novitá | `#125341` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:467` |
| `--flow-warning` | Claro · Novitá | `#7A4208` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:468` |
| `--flow-danger` | Claro · Novitá | `#9E1C13` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:469` |
| `--flow-info` | Claro · Novitá | `#1F4B80` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:470` |
| `--flow-ativo-bg` | Claro · Novitá | `#8B5E59` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:472` |
| `--flow-ativo-text` | Claro · Novitá | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:473` |
| `--flow-ativo-borda` | Claro · Novitá | `rgba(57, 39, 37, .6)` | Proposta (alfa) | `src/styles/tokens.css:474` |
| `--flow-chrome` | Claro · Novitá | `rgba(57, 39, 37, .96)` | Proposta (alfa) | `src/styles/tokens.css:476` |
| `--flow-chrome-text` | Claro · Novitá | `#D6C0B8` | Oficial (Rosa nude) | `src/styles/tokens.css:477` |
| `--flow-chrome-text-forte` | Claro · Novitá | `#FFFFFF` | Oficial (Branco) | `src/styles/tokens.css:478` |
| `--flow-chrome-hover` | Claro · Novitá | `rgba(255, 255, 255, .1)` | Proposta (alfa de Branco) | `src/styles/tokens.css:479` |
| `--flow-chrome-inset` | Claro · Novitá | `rgba(255, 255, 255, .09)` | Proposta (alfa de Branco) | `src/styles/tokens.css:480` |
| `--flow-chrome-line` | Claro · Novitá | `rgba(255, 255, 255, .16)` | Proposta (alfa de Branco) | `src/styles/tokens.css:481` |
| `--flow-chrome-ativo-bg` | Claro · Novitá | `#D7B79B` | Oficial (Bege areia) | `src/styles/tokens.css:482` |
| `--flow-chrome-ativo-text` | Claro · Novitá | `#392725` | Proposta (tom derivado ou estado) | `src/styles/tokens.css:483` |
| `--flow-chrome-ativo-borda` | Claro · Novitá | `rgba(255, 255, 255, .35)` | Proposta (alfa de Branco) | `src/styles/tokens.css:484` |
| `--flow-shadow-panel` | Claro · Novitá | `0 16px 36px rgba(57, 39, 37, .1), 0 2px 6px rgba(57, 39, 37, .06)` | Efeito (sombra, cor neutra) | `src/styles/tokens.css:486` |
| `--flow-shadow-float` | Claro · Novitá | `0 16px 36px rgba(57, 39, 37, .22)` | Efeito (sombra, cor neutra) | `src/styles/tokens.css:487` |
| `--flow-shadow-modal` | Claro · Novitá | `0 28px 70px rgba(57, 39, 37, .28)` | Efeito (sombra, cor neutra) | `src/styles/tokens.css:488` |
| `--flow-veu` | Claro · Novitá | `linear-gradient(180deg, rgba(214, 192, 184, .12) 0%, rgba(214, 192, 184, .26) 100%)` | Proposta (alfa de Rosa nude) | `src/styles/tokens.css:490` |
| `--flow-brilho` | Claro · Novitá | `radial-gradient(ellipse 30% 40% at 30% 20%, rgba(255, 255, 255, .45), transparent 70%)` | Proposta (alfa de Branco) | `src/styles/tokens.css:492` |
| `--flow-veu` | Claro · conjunto (véu do app) | `linear-gradient(180deg, rgba(198, 196, 199, .24) 0%, rgba(198, 196, 199, .42) 40%, rgba(198, 196, 199, .36)…` | Proposta (alfa de Cinza claro) | `src/styles/tokens.css:496` |
| `--flow-brilho` | Claro · conjunto (véu do app) | `radial-gradient(ellipse 34% 22% at 52% 6%, rgba(255, 255, 255, .4), transparent 70%)` | Proposta (alfa de Branco) | `src/styles/tokens.css:498` |
