# Manual definitivo do frontend Alinare Novitah e AZIME

Referência visual extraída do protótipo aprovado v0.2 em 17 de novembro de 2026. Revisão cromática de 24/11/2026 e revisão Novitah Dark V2 de 26/11/2026: o novo tema escuro da Novitah substitui integralmente sua versão cromática anterior. Os demais cinco temas, a estrutura, as famílias tipográficas, as medidas, os componentes e o comportamento permanecem inalterados.

Este manual congela a aparência implementada para que os próximos sistemas reutilizem a mesma linguagem visual. Descreve as três marcas, os seis temas, os materiais, a geometria da aplicação, os componentes, seus estados, a navegação, as telas e a adaptação ao celular. Os valores estruturais vêm dos arquivos do protótipo; os valores cromáticos institucionais desta revisão prevalecem sobre as cores anteriores da v0.2. As instruções de reprodução e comparação são normas para as próximas entregas.

**Regra principal:** preservar o frontend aprovado por reutilização dos estilos e componentes de referência. Uma descrição, por mais detalhada que seja, não garante sozinha identidade de pixels entre implementações. A reprodução deve combinar este manual, os arquivos originais e a comparação das telas no mesmo navegador, tamanho de janela, fontes, dados e estado.

## 1 Referência e alcance

A fonte é `azime-plataforma-prototipo-v0.2.zip`. Os três ambientes vivem no mesmo projeto e compartilham estrutura, CSS e componentes React. A marca muda por `data-brand` e a aparência por `data-theme`. Não são três interfaces desenhadas separadamente.

O nome do ZIP identifica a versão aprovada. O `package.json` interno ainda informa `0.1.0`; esse número não deve ser usado para selecionar uma versão visual diferente. O pacote de referência inclui o ZIP original e seu SHA256.

A extração foi feita dos arquivos do projeto, incluindo estilos, componentes e estilos locais nas telas. Não houve inspeção visual de uma instância executando nesta revisão. Capturas anteriores aprovadas continuam sendo referências de comparação, mas não foram reconstituídas nem usadas para inventar medidas.

O estado congelado é a v0.2. A expansão do painel com SharePoint, Teams, intranet, feedback e plugin de Chamados foi solicitada para a evolução seguinte. Essas experiências devem herdar o padrão descrito; não aparecem como telas já implementadas neste inventário.

Há assinaturas tipográficas provisórias para as marcas. O ZIP não contém os SVG oficiais esperados pelo carregador. Esses elementos são descritos exatamente como existem e identificados como provisórios, para não serem confundidos com os logotipos oficiais de marketing.

O manual descreve aparência e comportamento de interface. A demonstração de autenticação, permissões, envio, auditoria, documento e instalação de plugins não comprova implementação de segurança ou integrações de produção.

### 1.1 Ordem de autoridade para reprodução

1. Arquivos originais desta versão, incluindo ordem do CSS e estilos locais, com prioridade dos valores cromáticos revisados neste manual em caso de divergência de cor.
2. Tokens completos por marca e tema, exportados no pacote.
3. Estruturas e componentes React originais.
4. Descrição deste manual.
5. Comparação visual com a referência executada em condições equivalentes.

Uma escolha nova deve ser identificada como extensão. Não deve substituir silenciosamente uma regra congelada. O novo conteúdo pode variar; o acabamento dos componentes existentes deve permanecer.

**Precedência da revisão de 26/11/2026:** exclusivamente em `data-brand="novitah"` com `data-theme="dark"`, a seção 7.6, os tokens B7/C e as regras finais específicas do Anexo D prevalecem sobre valores históricos e estilos locais conflitantes. O ZIP v0.2 permanece referência estrutural histórica; não contém necessariamente esta revisão. Os valores novos de opacidade, sombra e desfoque são parâmetros propostos para implementação, não medições de um CSS executado.

## 2 Aparência geral do produto

A aplicação tem fundo atmosférico de luz e cor, navegação em vidro flutuante e conteúdo operacional em superfícies mais estáveis. A composição usa bastante respiro, cantos arredondados, linhas de separação finas, títulos moderados e informação organizada por prioridade.

O efeito de profundidade vem da combinação de ambiente desfocado, transparência, saturação do fundo, brilho superior, borda clara, sombra inferior e sobreposição. O efeito não é produzido apenas colocando opacidade em um card.

O painel lateral e a barra superior são peças separadas das bordas da janela. O conteúdo se distribui abaixo do cabeçalho e à direita do menu. Listas e formulários usam superfícies quase opacas; menus e diálogos usam vidro mais denso.

Os componentes operacionais continuam com a mesma geometria nas três marcas. Trocar para Novitah não aumenta arredondamentos; trocar para AZIME não muda a fonte dos formulários; trocar para Alinare não troca a biblioteca de ícones.

### 2.1 Três camadas obrigatórias

| Camada | Implementação | Papel visual |
| --- | --- | --- |
| Ambiente | `.ambient`, quatro manchas e textura | Luz e identidade por trás da aplicação |
| Navegação e controles elevados | `.glass`, `.glass-strong`, busca e menus | Vidro com borda, brilho e separação do fundo |
| Trabalho | `.card`, `.tbl`, `.input`, `.form-section` | Leitura estável para dados e operações |

## 3 Tipografia

### 3.1 Famílias e carregamento

A família de interface é **Instrument Sans**, com pesos 400, 500, 600 e 700 solicitados ao Google Fonts no `index.html`. A sequência de fallback é `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`.

A família de expressão de marca é **Instrument Serif**, com fallback `Georgia, serif`. Ela aparece nas assinaturas provisórias de Alinare e Novitah e nos textos grandes do painel de entrada dessas marcas. Não se estende a tabelas, campos, botões ou parágrafos operacionais.

Para números de patrimônio, contagens, datas e valores que precisam alinhar, usar `font-variant-numeric: tabular-nums`, pelas classes `.tnum` ou `.num`. Para séries, identificadores e códigos técnicos usar `.mono`: `ui-monospace, 'SF Mono', Menlo, monospace`, tamanho `0.92em` e tracking `0.01em`.

A base do corpo é 15 px, line-height 1.5, sem margem no body, com antialiasing de fonte. Botões e controles herdam a família e a cor. `h1` a `h4` começam sem margem e com tracking de `-0.012em`, salvo as regras específicas abaixo.

| Uso | Tamanho | Peso | Acabamento |
| --- | --- | --- | --- |
| Corpo | 15 px | 400 herdado | Entrelinha 1.5 |
| Texto pequeno `.small` | 13 px | Herdado | Não substituir por 12 px |
| Texto auxiliar `.xs` | 12 px | Herdado | Metadados compactos |
| Ênfase `.strong` | Herdado | 600 | Ênfase recorrente |
| Título de página | 30 px | 600 | Entrelinha 1.15; tracking -0.022em |
| Título de página até 760 px | 26 px | 600 | Mesma hierarquia |
| Saudação inicial | 30 px | 600 | Tracking -0.022em; 26 px no celular |
| Título do hero de detalhe | 28 px | 600 | Entrelinha 1.15; tracking -0.02em |
| Hero de detalhe no celular | 22 px | 600 | Não confundir com título de página |
| Título de seção | 17 px | 600 | `.section-title` |
| Título de card | 16 px | 600 | Cabeçalho `.card-head` |
| Título de diálogo | 20 px | 600 | Cabeçalho do modal |
| Label de campo | 13 px | 600 | Cor principal |
| Ajuda e erro | 12.5 px | 400 ou 500 | Erro usa peso 500 |
| Cabeçalho de tabela | 11.5 px | 600 | Caixa alta; tracking 0.06em |
| Dados de tabela | 14 px | Herdado | Identificador usa 700 |
| Item de menu principal | 14 px | 500; ativo 600 | Mantém texto em uma linha |
| Submenu | 13.5 px | Herdado; ativo 600 | Não usar caixa alta |
| Grupo do menu | 11 px | 600 | Caixa alta; tracking 0.08em |
| Indicador numérico grande | 28 px | 600 | Números tabulares |
| Origem e destino de voo | 24 px | 600 | Tracking 0.02em; 20 px no celular |

Os nomes não devem ser todos em negrito. Metadados usam `--text-muted` e `--text-subtle`, com diferenças efetivas de cor por tema. A hierarquia é obtida por tamanho, peso, cor e espaço em conjunto.

### 3.2 Fidelidade das fontes

Se Instrument Sans não carregar, as quebras de linha, larguras, alturas aparentes e alinhamentos poderão mudar. Para uma comparação de fidelidade, confirmar o carregamento da fonte e dos pesos antes de capturar a tela. A v0.2 depende de carregamento remoto; hospedar fontes localmente seria uma decisão futura de distribuição, mantendo os mesmos arquivos e métricas.

## 4 Medidas globais

| Token | Valor congelado | Uso |
| --- | --- | --- |
| `--s1` | 4 px | Microespaços |
| `--s2` | 8 px | Intervalos curtos |
| `--s3` | 12 px | Intervalos intermediários |
| `--s4` | 16 px | Distância base de grupos |
| `--s5` | 20 px | Distância de composição |
| `--s6` | 24 px | Padding principal |
| `--s8` | 32 px | Respiro maior |
| `--s10` | 40 px | Respiro amplo |
| `--s12` | 48 px | Estados e apresentação |
| `--r-field` | 12 px | Campos e botões comuns |
| `--r-card` | 18 px | Cards operacionais |
| `--r-dialog` | 26 px | Diálogos |
| `--r-nav` | 26 px | Sidebar e drawers |
| `--r-pill` | 999 px | Pílulas |
| `--control-h` | 44 px | Campo e botão padrão |
| `--gap-frame` | 12 px; 8 px até 760 px | Respiro da janela |
| `--sidebar-w` | 264 px | Painel expandido |
| `--sidebar-w-collapsed` | 80 px | Painel recolhido |
| `--header-h` | 64 px | Cabeçalho desktop |

A escala global não significa que toda medida é múltipla de quatro. Existem exceções deliberadas: raios de 9, 10, 11, 13, 14, 15, 16, 20, 22 e 30 px; gaps de 6, 10, 14, 18 e 22 px; fontes fracionárias. Não normalizar esses valores ao portar o design.

## 5 Ambiente de fundo

`.ambient` ocupa a janela inteira com `position: fixed`, `inset: 0`, `z-index: 0`, `overflow: hidden` e `pointer-events: none`. O fundo usa `--amb-base`; a mudança de cor dura 420 ms com a curva padrão.

As quatro manchas são elementos `i`, posicionados de forma absoluta, redondos e desfocados em **90 px**. As cores são `--amb-1` a `--amb-4`. A configuração é a mesma nas três marcas; só as cores mudam.

| Mancha | Tamanho | Posição inicial | Movimento |
| --- | --- | --- | --- |
| `.a1` | 62 vw × 62 vw | Left -14 vw; top -22 vw | 38 s, alternado; chega a translate 6 vw e 5 vh, scale 1.08 |
| `.a2` | 48 vw × 48 vw | Right -10 vw; top 6 vh | 44 s, alternado; chega a translate -7 vw e 8 vh, scale 0.94 |
| `.a3` | 56 vw × 56 vw | Left 22 vw; bottom -30 vw | 50 s, alternado; chega a translate 5 vw e -6 vh, scale 1.05 |
| `.a4` | 30 vw × 30 vw | Right 18 vw; bottom 8 vh | 60 s, alternate-reverse, movimento drift1 |

Os movimentos são `ease-in-out`, infinitos. Há transição de cor de fundo de 700 ms nas manchas. O pseudo-elemento de textura tem opacidade 0.035 e `mix-blend-mode: overlay`, com ruído SVG de 120 × 120 px, `feTurbulence`, frequência 0.9 e duas oitavas. O SVG exato permanece em `app.css`.

Na troca de marca, `.ctx-flash` ocupa a janela com um gradiente radial centrado em 80% e 0%, indo de `--amb-1` até transparente em 60%. Fica em z-index 1 e desaparece em 900 ms, de opacidade 0.9 para zero.

O ambiente não contém fotografia, ilustração de avião, montanhas ou wallpaper de cidade nesta versão. Referências antigas de Viagens não substituem esse fundo do protótipo corporativo aprovado.

**Novitah Dark V2:** `--amb-base` e `--bg` devem ser exatamente `#A46F69`. As manchas usam somente branco, nude, areia e terracota oficiais com opacidade controlada; não escurecer extremidades com preto, vinho ou marrom. Preservar a geometria e animações existentes. A iluminação orgânica superior direita é uma referência estética; não exige criar nova camada decorativa.

## 6 Materiais Liquid Glass

### 6.1 Vidro normal

`.glass` combina, nesta ordem visual, um brilho vertical `linear-gradient(180deg, var(--glass-sheen), transparent 42%)` e a cor translúcida `--glass-bg`.

Aplica `backdrop-filter: blur(22px) saturate(170%)`, com a versão `-webkit-` equivalente, borda de 1 px em `--glass-border` e três contribuições de sombra: brilho interno superior, contorno interno inferior e sombra externa da marca e tema.

A sombra completa é `inset 0 1px 0 var(--glass-edge), inset 0 -1px 0 var(--glass-edge-low), var(--glass-shadow)`. Não reduzir essa composição a uma sombra genérica.

### 6.2 Vidro denso

`.glass-strong` conserva brilho, borda e sombras, troca a base para `--glass-bg-strong` e usa blur calculado de **32 px**, isto é, `--glass-blur + 10px`, com saturação de 170%. É o material de menus, resultados de busca, notificações, drawers, diálogos e avisos flutuantes.

### 6.3 Vidro em campos e botões

A busca global usa `--glass-field`, borda `--glass-border`, sombra interna discreta e, quando focada, fundo `--glass-bg-strong`. O botão `.btn-glass` usa o mesmo fundo de campo, brilho interno superior e blur próprio de 12 px.

### 6.4 Particularidade do cabeçalho

O cabeçalho possui uma regra final essencial: `.header.glass` fica sem background e sem backdrop-filter diretamente no elemento, com `isolation: isolate`. Seu material é desenhado no pseudo-elemento `::before`, com `inset: 0`, raio herdado e z-index -1. Isso mantém a composição do vidro do cabeçalho sem colocar o filtro diretamente no elemento pai dos menus.

Essa regra aparece depois das regras gerais e depende da ordem do CSS. Recriá-la sem o pseudo-elemento pode mudar o resultado de desfoque dos popovers. Conservar também a borda e as sombras que o cabeçalho ainda herda de `.glass`.

### 6.5 Superfície de conteúdo

`.card` usa `--surface`, borda de 1 px `--border`, raio 18 px e a sombra exata `0 1px 2px rgb(0 0 0 / .03), 0 8px 24px -16px rgb(0 0 0 / .18)`. Não tem backdrop-filter próprio. Seu fundo tem a transparência definida por marca, mas não recebe o mesmo tratamento de vidro da navegação.

**Exceção Novitah Dark V2:** cards usam branco a 5% sobre a base terracota, com bordas claras e sombra terracota suave; as superfícies elevadas e de hover usam 8% e 12% como referências. O vidro normal usa blur sugerido de 16 px e o denso 26 px (regra existente de +10 px), sem alterar geometria. O Anexo D sobrescreve as sombras pretas decorativas do CSS compartilhado apenas nesse tema. Não aplicar blur indiscriminadamente ao conteúdo operacional.

## 7 As seis identidades

### 7.1 AZIME claro

Ambiente cinza frio `#e4e5e8`, conteúdo branco, texto quase preto `#0b0b0c`, sombras neutras e navegação clara translúcida. O primário é preto, com texto branco. O item ativo da sidebar também é preto, com sombra curta mais presente. O vidro normal tem branco a 55%; o denso tem branco a 78%. A leitura deve parecer limpa, precisa e predominantemente neutra.

O hover primário é `#26272b`. O texto secundário é `#55575e` e o sutil é `#75777e`. A superfície secundária é `rgb(247 247 249 / .9)`. AZIME não recebe uma cor de destaque laranja ou azul nos botões deste padrão. Cores operacionais de status continuam disponíveis.

### 7.2 AZIME escuro

Ambiente quase preto `#08080a`, cards em grafite `rgb(22 23 26 / .88)`, texto `#fafafa` e vidro grafite a 50%. O primário se inverte para `#fafafa`, com texto `#0b0b0c`. O item selecionado do menu é claro, sem perder a mesma geometria do tema claro.

O texto secundário é `#a6a8b0`; o sutil, `#8a8c94`. O vidro denso é `rgb(30 31 36 / .78)`. O monograma provisório AZ é invertido por uma regra CSS final com `!important`: fundo `#fafafa` e texto `#0b0b0c`.

### 7.3 Alinare claro

A base quente utiliza o off-white oficial `#f0ebe4`, com luz azulada e apoio de Travertine. O conteúdo é branco a 88%; o texto é navy `#242741`; o primário é o azul profundo oficial `#242741`, com texto `#f0ebe4`. O item ativo usa exatamente essa dupla. A paleta oficial Alinare inclui também Travertine `#d4c8b7`, New-Ruby `#7a353c` e Ônix `#121212`. Deep e Off Light são predominantes; New-Ruby e Travertine são apoio, e Ônix é indicado para textos. Não se cria um uso novo para preencher a paleta.

O vidro normal tem um branco levemente azulado `rgb(246 246 252 / .55)`, e o denso usa `rgb(248 248 253 / .8)`. As sombras carregam navy, não preto puro. O hover primário é `color-mix(in srgb, #242741 90%, #f0ebe4)`. O texto secundário é `#555870`, e o sutil é `#72748a`.

### 7.4 Alinare escuro

Ambiente navy muito profundo `#0c0e1f`, manchas discretas em Deep e Travertine, superfície `rgb(26 29 54 / .86)` e texto creme `#f0ebe4`. O primário fica creme, com texto navy `#242741`, e o item ativo repete essa inversão.

O destaque suave utiliza Travertine `#d4c8b7`; seu texto associado é `#f0ebe4`. O vidro normal é `rgb(36 39 65 / .48)`, o denso é `rgb(36 39 65 / .8)` e a borda de vidro é `rgb(240 235 228 / .14)`. O monograma provisório A também é invertido por regra final: fundo creme e letra navy.

### 7.5 Novitah claro

Ambiente quente `#f2e8e2`, com manchas nude, terracota e areia. Superfície `rgb(255 253 251 / .9)` e sólida `#ffffff`. Texto marrom profundo `#2b1d1a`, secundário `#6a5a56` e sutil `#83716c`.

O primário, o accent e a seleção do menu utilizam a terracota oficial `#a46f69`. O hover mantém o escurecimento por `color-mix(in srgb, #a46f69 72%, #130b0c)`. O texto branco original é preservado; a combinação tem contraste de aproximadamente 4,15:1, abaixo de 4,5:1 para texto normal, e deve ser validada antes de produção.

O vidro normal é `rgb(255 248 244 / .55)`, o denso `rgb(255 249 246 / .8)`, e as sombras são marrons quentes. A paleta oficial Novitah é `#a46f69`, `#d6c0b8`, `#d7b79b`, `#c6c4c7` e `#ffffff`. O cinza integra a paleta institucional; não se cria um novo componente ou uso apenas para inseri-lo. Os tons técnicos de fundo escuro, texto, contraste e transparências não são cores institucionais adicionais.

### 7.6 Novitah escuro — V2 (26/11/2026)

**Diretriz vigente:** o dark da Novitah é uma inversão cromática da identidade da própria marca, não uma interface quase preta adaptada à marca. A base predominante é o terracota rosado oficial `#A46F69`. Substitui o marrom `#5B3B39` da referência anterior e o vinho `#130b0c` registrado na versão histórica do manual. Não reutilizar esses tons como base deste tema. A regra vale para todos os sistemas Novitah, não apenas Logística Reversa.

| Cor oficial | Hexadecimal exato | Função no Dark V2 |
| --- | --- | --- |
| Terracota rosado | `#A46F69` | Fundo principal, base das superfícies e sombras suaves |
| Rosa nude | `#D6C0B8` | Seleção, categorias, superfícies secundárias e destaques |
| Bege areia | `#D7B79B` | Atenção, indicadores prioritários e destaques de cards |
| Cinza claro | `#C6C4C7` | Divisórias, contornos e apoio visual |
| Branco | `#FFFFFF` | Tipografia, ícones, linhas de gráficos e reflexos |

**Exclusividade cromática:** usar somente essas cinco cores-base em elementos de interface do Novitah Dark V2. São permitidos canais de opacidade e gradientes entre cores oficiais; a composição de pixels pode produzir variações, mas não se cadastram novos hexadecimais. Proibido preto como escurecimento, marrons adicionais e sombras pesadas. Documentos que simulam papel, conteúdo de terceiros e logotipos oficiais permanecem conteúdo, não tokens do tema.

| Componente | Padrão obrigatório V2 |
| --- | --- |
| Background | Terracota exato; iluminação suave, sem vinheta escura |
| Sidebar | Vidro rosado translúcido, ícones brancos, categorias nude, contornos claros |
| Item ativo | Nude translúcido, texto e ícone brancos, borda clara e seleção inequívoca |
| Topbar | Vidro leve, busca translúcida, ícones brancos, avatar nude; manter formato flutuante |
| Cards convencionais | Branco translúcido sobre terracota; contorno fino e sombra leve; ícones em caixas translúcidas |
| Card prioritário | Bege areia como referência cromática, aplicado por transparência; texto branco na referência visual |
| Campos e tabelas | Superfícies estáveis, base terracota e contornos claros; preservar densidade, medidas e estados |
| Modais, drawers e menus | Vidro denso terracota com reflexo claro; overlay terracota, sem película preta |
| Gráficos | Linha branca, preenchimento branco translúcido e grade nude translúcida; preservar dados, rótulos e séries |
| Botões, chips e badges | Destaques nude/areia e estados identificados por texto, ícone e contorno; sem cor externa de marca |
| Tipografia | Branco predominante; nude para categorias e ícones secundários; hierarquia por tamanho, peso e opacidade |
| Liquid Glass | Profundidade por sobreposição, transparência, brilho, bordas e sombras discretas |

**Tipografia:** preservar Instrument Sans, Instrument Serif e as medidas globais. A referência V2 sugere peso 700 para títulos principais e números de indicadores, 600 para títulos de cards, 400–500 para texto comum e 500–600 para categorias; são sugestões de ênfase, não autorização para modificar globalmente a tipografia congelada. Os textos auxiliares usam branco com opacidade controlada. A seleção deve permanecer identificável também por peso, contorno e estado acessível.

**Aplicação técnica:** o bloco B7/C reutiliza os nomes reais de tokens do protótipo e incorpora as referências de 5%, 8%, 12% e 15% para superfícies, borda nude a 45%, borda branca a 60%, texto branco, 85% e 70% para níveis de leitura, gráfico branco e blur de 16 px. Os demais valores e as regras finais do Anexo D são decisões técnicas propostas nesta revisão para completar a integração, não valores extraídos do CSS da imagem. Para cards prioritários novos, usar o token de atenção em um seletor semântico do módulo; não alterar menus nem criar telas ou indicadores inexistentes.

**Acessibilidade e liberação:** branco sobre nude ou areia, mesmo quando translúcidos, pode não oferecer contraste adequado; branco sobre terracota também fica abaixo de 4,5:1 para texto normal. Não declarar conformidade nem aprovar produção apenas por fidelidade cromática. Medir o contraste sobre o fundo composto em cada estado, incluindo textos auxiliares, seleção, campos, badges e gráficos. Caso a combinação de cinco cores não atinja os requisitos, registrar a exceção e solicitar decisão do Marketing antes de liberar; não introduzir cores não autorizadas nem reduzir a legibilidade silenciosamente.

**Preservação funcional:** manter as rotas, nomes, menus, permissões, dados, ações, layout, responsividade e componentes existentes. A imagem de referência V2 é estética, não funcional: não reproduzir substituições de rótulos (por exemplo, Lixeira por Licenças), mudanças de proporções ou valores de gráfico. O monograma provisório continua provisório.

### 7.7 Paleta de estado independente da marca

| Estado | Claro | Fundo claro | Escuro | Fundo escuro |
| --- | --- | --- | --- | --- |
| Sucesso | `#15703f` | `rgb(22 121 74 / .1)` | `#6fdba5` | `rgb(95 211 154 / .13)` |
| Atenção | `#7d5100` | `rgb(196 140 20 / .14)` | `#f2c25c` | `rgb(242 194 92 / .13)` |
| Erro ou risco | `#b42318` | `rgb(180 35 24 / .09)` | `#ff8f83` | `rgb(255 138 125 / .13)` |
| Informação | `#1f5aa0` | `rgb(31 95 168 / .09)` | `#95c3f7` | `rgb(141 189 245 / .13)` |
| Neutro | `#55575e` | `rgb(85 87 94 / .1)` | `#b4b6bd` | `rgb(180 182 189 / .12)` |
| Overlay | `rgb(15 15 20 / .28)` | Não se aplica | `rgb(0 0 0 / .5)` | Não se aplica |

Um estado não é comunicado apenas pela cor: há texto e, conforme o componente, ponto, ícone ou checklist. A tabela de tokens ao final traz todos os valores por tema, inclusive ambiente, bordas, sombras, navegação, foco e arte da entrada.

**Exceção Novitah Dark V2:** os estados compartilhados acima continuam vigentes nos outros cinco temas. Para este tema, o bloco específico B7/C propõe estados dentro das cinco cores oficiais: atenção em areia, informação em nude, neutro em cinza, e sucesso/erro identificados também por texto e ícones distintos. Nunca comunicar erro, sucesso ou risco somente pela cor. A equivalência semântica e o contraste exigem validação antes da produção.

## 8 Estrutura da aplicação

### 8.1 Grid principal

`.shell` é um grid com duas colunas: `calc(264px + 12px)` e `minmax(0, 1fr)`. A primeira faixa mede 276 px; a sidebar propriamente dita fica com os 264 px previstos, com 12 px de margem à esquerda. A altura mínima é 100 vh. A estrutura fica no z-index 2.

Recolhida, a primeira coluna vira `calc(80px + 12px)`, isto é, 92 px. A transição de colunas dura 420 ms. A área `.main` tem `min-width: 0`, flex vertical e padding horizontal de 12 px.

O conteúdo usa `padding: 28px 12px 64px`, largura de 100%, máximo de 1400 px e margens horizontais automáticas. Isso é a largura máxima da área de conteúdo, não uma largura fixa da tela toda. A variante `.content.narrow` limita a 980 px.

### 8.2 Rolagem

A sidebar é sticky e tem rolagem própria na navegação. O cabeçalho é sticky. O corpo da página pode rolar; o conteúdo não fica preso a um card de altura fixa. Popovers, drawers e documentos têm limites de altura e rolagem próprios.

Nas trocas de rota, a aplicação leva a janela ao topo. Na troca de marca, remonta a área de conteúdo para executar a transição de contexto. A mudança de rota também executa uma transição de página.

### 8.3 Camadas de empilhamento

| Elemento | Z-index implementado |
| --- | --- |
| Fundo atmosférico | 0 |
| Luz de troca de ambiente | 1 |
| Shell | 2 |
| Cabeçalho | 20 |
| Ações fixas no celular | 25 |
| Sidebar | 30 |
| Popover e busca | 50 dentro de seu contexto |
| Botão do apresentador | 55 |
| Overlay de modal ou drawer | 60 |
| Drawer | 61 |
| Toasts | 100 |

Não basta copiar os números: contextos de empilhamento dos elementos pais também importam. Preserve a árvore de componentes e as regras de `position`, `isolation`, transform e backdrop-filter.

## 9 Sidebar flutuante

### 9.1 Contêiner

É uma superfície `.glass`, com `position: sticky`, top de 12 px, margem `12px 0 12px 12px`, altura `calc(100vh - 24px)`, raio 26 px e overflow oculto. Fica organizada em cabeçalho, navegação que cresce e rodapé.

O cabeçalho tem padding `20px 20px 14px`, gap vertical de 10 px e não encolhe. Exibe o conjunto de marca e uma identificação do ambiente.

A identificação `.env-tag` é inline-flex, gap 6 px, tamanho 11 px, peso 600, caixa alta e tracking 0.06em. Seu ponto inicial mede 6 × 6 px, usa a cor de seleção da navegação e halo de 3 px do focus-ring.

### 9.2 Organização e itens

A área de navegação tem padding `6px 12px 12px`, gap de 2 px, flex vertical, overflow-y auto e scrollbar fina. A ordem é Início, Meu trabalho, Favoritos quando existirem, Módulos e Administração para quem tem acesso.

Os grupos têm labels de 11 px, peso 600, tracking 0.08em, caixa alta e padding `16px 12px 6px`. Favoritos inclui ícone Star de 11 px com ajuste vertical de -1 px.

O item `.nav-item` mede 42 px de altura, padding horizontal 12 px, gap 12 px, raio 14 px, fonte 14 px e peso 500. A borda de 1 px começa transparente. Ícones principais são Lucide de 19 px e não encolhem. O texto não quebra linha.

No hover, entra `--nav-hover` e a borda `--glass-border`. Ao pressionar, o item escala para 0.985. Selecionado, usa `--nav-selected-bg`, texto `--nav-selected-text`, peso 600, sombra própria do tema e um brilho interno branco a 14% no topo. A seleção entra a partir de scale 0.96 e opacidade 0.6, em 420 ms com a curva spring.

### 9.3 Contadores

`.nav-badge` fica à direita com `margin-left: auto`, fonte 11 px, peso 700, largura mínima 22 px, altura 20 px, padding horizontal 7 px e raio de pílula. Usa accent suave. No item ativo, o fundo é a cor do texto ativo a 20% de mistura com transparente.

No menu recolhido, o contador textual some e dá lugar a um ponto de 7 px, posicionado top 8 px e right 14 px. Há diferenças entre a regra de recolhimento manual e a regra responsiva; conservar a cascata original para o resultado exato.

### 9.4 Submenus

O submenu aparece para o módulo ativo quando houver mais de uma página autorizada. É uma coluna com gap 1 px, margem `4px 0 8px 23px` e padding-left 16 px. A guia vertical tem 1.5 px, left 0, top 2 px e bottom 10 px.

Cada link usa fonte 13.5 px, padding `7px 10px`, raio 10 px e cor `--nav-muted`. O ponto conectado à guia mede 8 px, tem borda de 1.5 px e posição left -19.5 px. Ativo, recebe cor `--nav-sub-active` e halo de 3 px, além de peso 600 e fundo de hover. A abertura começa com translateY de -4 px e opacidade zero, em 420 ms.

### 9.5 Recolhimento

O rodapé tem padding `10px 12px 12px` e borda superior. O botão alterna PanelLeftClose e PanelLeftOpen de 19 px.

Recolher oculta texto, contadores, submenus, títulos de grupos, wordmark e tag de ambiente. Centraliza os itens, remove seu padding horizontal e altera o cabeçalho para `18px 0 10px`. Separadores horizontais passam a aparecer entre grupos. Os links mantêm títulos e rótulos acessíveis.

## 10 Cabeçalho global

É sticky a 12 px do topo, com margem superior de 12 px, altura 64 px, raio 22 px, gap 8 px e padding `0 10px 0 12px`. Usa o material de vidro com a exceção de pseudo-elemento já descrita.

Da esquerda para a direita aparecem busca global, espaço flexível, acesso à demonstração, seletor de ambiente, notificações, alternância claro e escuro e usuário. O ícone de menu é acrescentado no celular. A regra final `.header .spacer { flex: .15; }` substitui o flex 1 genérico nesse contexto.

### 10.1 Busca global

O contêiner tem flex 1 e max-width de 520 px. O campo mede 42 px de altura, raio 14 px, padding-right 64 px, fundo de vidro de campo e borda de vidro. Há sombra interna `0 1px 2px rgb(0 0 0 / .04)`.

O ícone Search mede 17 px e fica a 14 px da esquerda. O padding-left do campo com ícone é 42 px. A dica Ctrl K fica à direita, tamanho 11 px, borda forte, raio 6 px e padding `1px 6px`.

O resultado abre 10 px abaixo, ocupando a largura do campo, com vidro denso, raio 20 px, max-height 70 vh e padding vertical 6 px. Os grupos são separados por borda; labels usam 11 px, peso 700, caixa alta, tracking 0.08em e padding `8px 16px 4px`.

Busca só produz resultados com dois ou mais caracteres. Os grupos correspondem aos módulos e às permissões. Setas para cima e para baixo mudam a seleção; Enter navega; Ctrl ou Command K foca; Escape e clique externo fecham o resultado. O item ativo usa o mesmo estado visual de hover dos menus.

### 10.2 Ambiente

O botão mede 44 px de altura, raio 15 px, padding `0 12px 0 5px`, gap 10 px, borda de vidro e brilho interno superior. O monograma mede 32 px. A linha Ambiente usa 10.5 px, peso 600, caixa alta e tracking 0.07em; o nome usa 14 px, peso 600 e line-height 1.2.

A seta ChevronDown mede 16 px e gira 180 graus quando aberto. O menu tem largura mínima local de 300 px, título Ambientes autorizados e itens com monograma de 34 px, nome, descrição, amostras de cor e check no ambiente atual. As amostras são círculos de 12 px com gap 3 px e borda preta a 10%.

Trocar de ambiente mantém listas equivalentes e filtros quando possível. Se estiver em uma ficha, retorna à lista do módulo no novo ambiente. Se o módulo não estiver liberado, vai ao Início com aviso. Alterações não salvas abrem um diálogo com Continuar editando e Descartar e trocar.

### 10.3 Notificações

O sino Bell mede 19 px e ocupa um icon-button de 42 px. O contador fica top 5 px e right 5 px, mínimo 17 × 17 px, fonte 10 px, peso 700, fundo danger e contorno de 2 px em vidro denso.

O popover usa largura `min(400px, calc(100vw - 24px))` e deslocamento right -50 px. O cabeçalho tem padding `14px 16px 8px`, com título e Marcar todas como lidas. A lista tem max-height 440 px, rolagem e padding inferior 6 px.

As notificações são separadas em Recentes e Anteriores. O ícone de origem ocupa caixa de 34 px, raio 11 px e ícone de 16 px. Título não lido usa peso 700; lido usa 500. Um ponto de 8 px em accent marca o não lido. Assunto, módulo, ambiente e tempo aparecem em 12 px.

A implementação v0.2 filtra as notificações pelo usuário e pode incluir itens de outros ambientes autorizados. Abrir um desses itens pode trocar o ambiente antes de navegar. Isso é um comportamento existente; a regra de conteúdo restrito ao ambiente solicitada para a evolução seguinte exige alinhamento separado.

### 10.4 Usuário e aparência

O botão de usuário tem 44 px de altura, raio 15 px, padding `0 10px 0 5px` e gap 10 px. Avatar de 32 px, primeiro nome em 13 px e peso 600 e papel em 12 px. Ao abrir, usa fundo de campo de vidro e borda de vidro.

O menu apresenta avatar, nome completo, e-mail e identificação Microsoft; separadores; Perfil e preferências; alternância de aparência; Encerrar sessão. Os ícones internos são de 16 px. O botão direto de alternância usa Moon ou Sun de 19 px no cabeçalho e é ocultado no celular.

## 11 Cabeçalho de página e composição

Os breadcrumbs são uma linha flexível com wrap, gap 6 px, fonte 13 px, cor muted e margem inferior 8 px. A divisão padrão usa ChevronRight de 14 px. Links não têm sublinhado em repouso; ganham cor principal e sublinhado no hover.

`.page-head` alinha os blocos pela base, tem gap 16 px, margem inferior 24 px e permite quebra. As ações ficam à direita por `margin-left: auto`, com gap 8 px. A descrição fica 6 px abaixo do título.

Uma listagem usa cabeçalho de página, card de ferramentas, dados e paginação. Um detalhe usa hero, fatos essenciais, conteúdo principal e coluna de apoio. Um formulário pode usar largura reduzida de 980 px ou duas colunas com resumo de 340 px. A aplicação não transforma todas as telas em dashboards com indicadores.

### 11.1 Cards e seções

`.card-pad` tem padding 24 px. O cabeçalho `.card-head` tem padding `16px 22px`, gap 12 px, borda inferior e altura mínima 58 px. O corpo tem padding 22 px. Cabeçalhos podem acomodar ação pequena à direita.

`.section-head` alinha pela baseline, gap 12 px e margem inferior 12 px. Seu link secundário fica à direita, fonte 13 px, peso 600 e muted, passando para texto principal no hover.

Os grids utilitários `.grid-2` e `.grid-3` usam colunas fracionárias com `minmax(0, 1fr)` e gap 16 px. `.stack` usa gap 16 px; `.stack-sm`, 8 px; `.row` e `.row-wrap`, 8 px, salvo substituições locais.

### 11.2 Interação em cards

A classe `.interactive` faz transição de transform, sombra e borda. No hover, sobe 2 px, usa borda forte e sombra `0 2px 4px rgb(0 0 0 / .04), 0 16px 32px -18px rgb(0 0 0 / .3)`. Ao pressionar, volta a translateY zero e escala 0.99. Essa interação só existe onde a classe é aplicada; não adicionar elevação a todos os cards indiscriminadamente.

## 12 Botões e ícones

### 12.1 Botões de texto

O botão padrão mede 44 px de altura, padding horizontal 18 px, raio 12 px, fonte 14 px, peso 600 e gap 8 px. Conteúdo centralizado em inline-flex, texto em uma linha, borda inicial de 1 px transparente e cursor pointer. Pressionado e habilitado, escala 0.975.

| Variante | Fundo e texto | Borda e sombra | Hover |
| --- | --- | --- | --- |
| Primary | primary e on-primary | Brilho interno branco 12%; sombra `0 6px 14px -8px var(--primary)` | primary-hover |
| Secondary | surface-solid e text | Borda border-strong | Borda text-subtle |
| Glass | glass-field e text | Borda glass-border; brilho superior; blur 12 px | glass-bg-strong |
| Ghost | Transparente e text | Sem destaque de borda | surface-sunken |
| Danger | danger e branco | Regra base | Sem hover próprio adicional definido |

Em tema escuro, `.btn-danger` usa texto `#1a0a08`. O disabled usa opacidade 0.45 e cursor not-allowed. Não há uma regra específica universal que estilize campo desabilitado como botão desabilitado; são componentes diferentes.

Botão pequeno: altura 34 px, padding horizontal 12 px, fonte 13 px e raio 10 px. Botão extra pequeno: altura 30 px, padding horizontal 10 px, fonte 12.5 px e raio 9 px. `.btn-block` ocupa 100% da largura.

### 12.2 Icon buttons

42 × 42 px, raio 14 px, grid centralizado, borda de 1 px transparente e cor muted. Hover aplica nav-hover, borda de vidro e texto principal. Pressionado escala 0.94. Com `aria-expanded=true`, usa vidro denso, borda de vidro e texto principal.

### 12.3 Biblioteca e dimensão dos ícones

O projeto usa `lucide-react`; o `package-lock.json` congelado é a fonte da versão efetiva instalada. O range de dependência no manifesto é `^1.74.0`. Não misturar emojis, ícones de outra família ou estilos sólidos para substituir os controles atuais. O desenho do ícone é parte da referência.

Não há um tamanho único de ícone. O menu usa 19 px; busca 17 px; breadcrumb 14 px; botões operacionais geralmente 15 a 18 px; ícone do hero pode ser 30 px dentro de uma caixa de 64 px. Não há um `stroke-width` global customizado para todos os Lucide neste CSS; conservar os componentes originais e as exceções explícitas.

O catálogo técnico do pacote lista cada ocorrência de ícone Lucide com arquivo e linha. Para reprodução, usar o mesmo nome e o mesmo tamanho local, inclusive ícones pequenos dentro de badges, anexos e timeline.

## 13 Badges chips e avatares

Badge padrão: altura 24 px, padding horizontal 10 px, gap 6 px, raio 999 px, fonte 12 px e peso 600. Antes do texto existe ponto circular de 6 px em currentColor. A variante `plain` remove o ponto. Os tons disponíveis são ok, warn, danger, info, neutral e accent.

Chip de filtro: altura 30 px, padding `0 6px 0 12px`, gap 6 px, fonte 13 px, peso 500 e raio 999 px. O botão de remoção mede 22 × 22 px, é circular, sem borda e usa a mesma cor do texto. Seu hover mistura currentColor a 14% com transparente.

| Avatar | Medidas | Fonte | Forma e cor |
| --- | --- | --- | --- |
| Padrão | 32 × 32 px | 12 px; 700 | Circular; accent-soft e on-accent-soft |
| Pequeno | 26 × 26 px | 10.5 px; 700 | Mesma forma e cores |
| Grande | 56 × 56 px | 18 px; 700 | Mesma forma e cores |

A v0.2 mostra iniciais, não fotos. O componente marca o avatar como decorativo para tecnologias assistivas e conserva o nome em texto próximo. Trocar por foto é uma extensão que pode alterar a leitura visual.

## 14 Campos e formulários

### 14.1 Campo base

`.field` é uma coluna com gap 6 px. O label é de 13 px e peso 600, usando texto principal. O asterisco de obrigatório usa danger e margem esquerda 2 px; há também indicação acessível de obrigatório.

Input e select têm altura 44 px, borda de 1 px border-strong, raio 12 px, fundo surface-solid, padding horizontal 14 px e largura 100%. O outline nativo é removido nesses controles. O texto herda 15 px do corpo.

Hover altera borda para text-subtle. Foco aplica borda focus e halo de **4 px** em focus-ring. Campo inválido aplica borda danger e halo de **3 px** em danger-soft. Essas medidas são diferentes e devem ser mantidas.

Textarea tem altura automática, mínimo 96 px, padding `12px 14px` e resize vertical. O select usa appearance none, padding-right 38 px e seta SVG de 16 px com stroke `#888`, posicionada a 12 px da direita. Essa seta fixa é uma particularidade do código atual.

Ajuda é 12.5 px em muted. Erro é 12.5 px em danger, peso 500, gap 6 px e ícone AlertCircle de 14 px quando fornecido pelo componente Field. O erro substitui a ajuda, recebe role alert e animação de entrada.

### 14.2 Ícone dentro do campo

O wrapper é relativo. O SVG fica left 14 px, top 50% com translateY -50%, cor sutil e sem eventos de ponteiro. O campo ganha padding-left 42 px. Um elemento `.trail` fica right 6 px, centralizado na altura. Na busca global, existem ajustes locais adicionais para a dica de teclado.

### 14.3 Organização de formulário

Cada `.form-section` tem padding `22px 24px` e borda inferior de 1 px, ausente na última seção correspondente. O título usa 16 px, peso 600, gap 10 px e margem inferior 2 px. A descrição usa 13.5 px em muted e margem inferior 18 px.

O grid de campos tem duas colunas `minmax(0, 1fr)` e gap de **18 px vertical por 16 px horizontal**. `.full` ocupa todas as colunas. Alguns formulários substituem a proporção localmente, por exemplo 1.6fr e 1fr na busca de colaborador; essas exceções estão no inventário de estilos locais.

O marcador de etapa mede 24 × 24 px, é circular, fonte 12 px, peso 700 e accent suave. Concluído, usa ok e ok-soft e pode trocar o número por check de 13 px.

### 14.4 Checkbox rádio e escolha por card

Checkbox usa 18 × 18 px, margem superior 2 px, accent-color primary. O label é flex, gap 10 px, alinhamento pelo topo e fonte 14 px.

Radio-cards usam três colunas e gap 8 px. Cada card tem borda forte de 1 px, raio 12 px, padding `10px 12px`, gap 8 px, fonte 13.5 px e fundo sólido. No hover, borda sutil; marcado, borda primary, fundo accent-soft e halo de 3 px focus-ring. O input usa accent-color primary e margem superior 3 px.

### 14.5 Rodapé de ações

`.form-actions` usa flex à direita, gap 8 px, padding `14px 22px`, borda superior, fundo surface-2 e raios inferiores de 18 px. Em formulários com resumo, pode estar dentro do card lateral no desktop.

No celular, a variante sticky fica fixed a 8 px da esquerda, direita e base, z-index 25, raio 20 px, borda de vidro, fundo glass-bg-strong, blur 24 px e sombra de vidro. Os botões dividem o espaço. O conteúdo ganha margem de segurança por padding inferior; não cobrir o último campo.

### 14.6 Salvando e concluído

Ações de gravação trocam o rótulo por uma forma em andamento, mostram Loader2 girando e desabilitam nova submissão. Na entrega, a simulação de gravação dura 800 ms; a conclusão é exibida por 1100 ms antes do retorno. Esses tempos demonstrativos não são prazos de resposta de uma API real.

A confirmação de entrega usa marca de sucesso 64 × 64 px, raio 22 px, fundo ok-soft, desenho de check animado, título Entrega registrada e texto explicando a atualização. A lista, a ficha e o histórico recebem destaque de confirmação coordenado.

## 15 Listas filtros e tabelas

### 15.1 Ferramentas

`.list-tools` é uma coluna com gap 12 px, padding 16 px e borda inferior. Cada tools-row tem gap 10 px, wrap e alinhamento central. A busca cresce a partir de flex-basis 300 px e limita a 460 px. Campo e select nessa barra medem **40 px** de altura e raio **11 px**. Select tem largura automática e mínimo 170 px.

A variante `.toolbar` usa gap 12 px e padding 16 px; busca com base 280 px e máximo 420 px; select mínimo 160 px e 40 px de altura. Não confundir as duas variantes.

O filtro segmentado `.seg-filter` tem padding 4 px, gap 4 px, raio 14 px e fundo surface-sunken, com rolagem horizontal sem scrollbar visível. Botões têm padding `7px 12px`, raio 10 px, fonte 13 px e peso 600. Selecionado, fica sólido com duas sombras: `0 1px 2px rgb(0 0 0 / .06), 0 4px 10px -6px rgb(0 0 0 / .2)`.

O contador interno usa 11 px, padding `1px 7px`, números tabulares e fundo surface-sunken. Selecionado, troca para accent-soft. Chips ativos ficam em flex com wrap e gap 8 px. A ação Limpar filtros é ghost pequena.

### 15.2 Tabela

O wrapper permite overflow horizontal. A tabela tem width 100%, border-collapse separate, border-spacing zero e fonte 14 px. Não usa zebra por padrão.

Cabeçalhos têm padding `11px 16px`, fundo surface-2, borda inferior, fonte 11.5 px, peso 600, caixa alta e tracking 0.06em. Mantêm texto em uma linha. Cabeçalhos ordenáveis usam botão sem estilo nativo, gap 4 px e destaque de cor no hover.

Células têm padding `13px 16px`, borda inferior e alinhamento vertical central. A última linha remove a borda inferior. Hover de linha aplica accent-soft. Colunas `.r` alinham à direita. Identificadores usam peso 700, números tabulares, nowrap e tracking 0.01em.

Textos truncados gerais têm limite 300 px; há limites locais de 260 ou 200 px na listagem de equipamentos. Conservar ellipsis e os atributos title associados. Não esconder identificação e situação em favor de um texto secundário longo.

A coluna de ações tem width 1%, nowrap e alinhamento à direita. A ação pode estar invisível em repouso e aparecer no hover ou focus-within. A classe `always` mantém a ação visível, como o botão Entregar de equipamento disponível.

### 15.3 Células compostas

O bloco `.asset` tem gap 12 px. O ícone ocupa 36 × 36 px, raio 11 px, accent suave, sem encolher. O patrimônio fica como título curto; tipo, modelo e série ficam em níveis abaixo.

O bloco `.person` tem gap 10 px e pode trazer avatar pequeno, nome e localização em duas linhas. Sem responsável, aparece Em estoque e um avatar neutro com traço. Situação pode trazer badge e a mensagem Entrega a confirmar em info, fonte 12 px e peso 600.

### 15.4 Paginação

`.pager` tem padding `12px 16px`, gap 8 px, borda superior, fonte 13 px e cor muted. Mostra total, espaço flexível, Página x de y e botões pequenos Anterior e Próxima. Botões ficam desabilitados nos limites. Números usam tabular-nums.

### 15.5 Lista no celular

Até 760 px, apenas tabelas com wrapper `.table-wrap.responsive` são ocultadas e trocadas por `.mobile-cards`. Cada `.m-card` tem padding `14px 16px`, borda inferior, link sem decoração e composição com identificação, metadados e status. A última remove a borda. Outras tabelas sem a classe responsive conservam overflow horizontal; não afirmar que toda tabela do protótipo vira card automaticamente.

## 16 Telas de detalhe

### 16.1 Hero

O hero é grid com colunas `auto minmax(0, 1fr) auto`, gap 20 px, padding 24 px e alinhamento central. O ícone fica em caixa 64 × 64 px, raio 18 px e accent suave. O identificador usa 13 px, peso 700, tracking 0.08em e muted.

O título usa 28 px, peso 600 e margem `2px 0 8px`. Abaixo, status e metadados se agrupam com wrap. As ações ficam na terceira coluna. O conjunto costuma ocupar um card com overflow oculto e margem inferior 20 px.

### 16.2 Faixa de fatos

São quatro colunas iguais, com borda superior. Cada fato tem padding `14px 24px` e borda à direita, exceto o último. Labels são 11.5 px, peso 600, caixa alta, tracking 0.06em e margem inferior 4 px. Valores usam peso 600 e truncamento em uma linha.

Até 1180 px, os fatos viram duas colunas. O segundo item perde a borda direita e os dois primeiros recebem borda inferior. No celular, padding vira `12px 16px`.

### 16.3 Conteúdo e apoio

`.layout-detail` e `.layout-form` usam `minmax(0, 1fr) 340px`, gap 20 px e alinhamento no topo. O resumo de formulário fica sticky em top `64px + 12px + 20px`, isto é, 96 px no desktop. Até 1180 px, viram coluna única e o resumo deixa de ser sticky.

### 16.4 Abas

A barra tem padding 6 px, gap 4 px, borda inferior e overflow-x auto. Abas têm padding `8px 14px`, raio 11 px, fonte 14 px, peso 600, cor muted e gap 8 px. Hover usa surface-sunken; ativa usa accent-soft e texto principal. O contador tem 11 px, padding `1px 7px`, fundo sunken e raio de pílula; ativo, fundo sólido.

### 16.5 Dados em pares

`.kv` é grid `repeat(auto-fill, minmax(200px, 1fr))`, com gap `20px 24px`. Labels seguem a tipografia da faixa de fatos. Valores usam peso 500 e `overflow-wrap: anywhere`. Grupos seguintes ganham margin-top 22 px, padding-top 22 px e borda tracejada forte. O subtítulo do grupo usa 13 px, peso 600, muted e margem inferior 14 px.

## 17 Histórico e anexos

### 17.1 Timeline

A lista não tem marcador ou padding nativo. Cada evento usa grid de 32 px e coluna flexível, gap 14 px e padding-bottom 18 px. A guia tem 2 px, left 15 px, top 34 px e bottom 4 px. O último evento não prolonga a guia.

O marcador é caixa de 32 px, raio 11 px, accent suave e ícone History de 14 px. O texto de ação usa peso 500; autor e data ficam em 12.5 px e muted. O conteúdo tem ajuste local de padding `2px 6px` e margem `-2px -6px` para o destaque.

Novo evento recebe fundo de sucesso que desaparece em 2.2 s; o marcador fica verde e entra de scale 0.5. A ordenação é da mais recente para a mais antiga.

### 17.2 Linha de anexo

`.att` é flex com gap 12 px, padding `12px 14px`, borda de 1 px, raio 14 px e fundo sólido. Hover reforça a borda. Entre anexos existe margin-top 8 px.

O ícone de arquivo mede 40 × 40 px, raio 11 px, texto de tipo em 10 px, peso 700 e tracking 0.04em. PDF usa danger e danger-soft; PNG usa info e info-soft. Algumas telas reutilizam a linha com ícones de viagem, hotel, equipamento ou manutenção, substituindo localmente as cores.

O nome fica em peso 600, com ellipsis; tipo, tamanho e data ficam em 12 px. Ações Visualizar e Download usam ghost pequeno e ícones de 15 px. No celular, o texto Visualizar some, mas o ícone continua.

### 17.3 Documento aberto

O visualizador é um diálogo wide, com título igual ao arquivo, ícone FileText de 22 px e descrição de documento de exemplo. O contêiner do papel tem padding 24 px, raio 14 px, fundo sunken, max-height 64 vh e rolagem.

O papel permanece branco mesmo no tema escuro, com texto `#1b1b1f`, raio 6 px, sombra `0 1px 3px rgb(0 0 0 / .2)`, padding `48px 56px`, fonte 13 px, line-height 1.6 e máximo 640 px. No celular, padding 24 px. Título do documento usa 18 px. Tabelas internas usam borda `#ddd` e padding `6px 8px`.

Os documentos são representações HTML demonstrativas, não um leitor PDF real. O rótulo de download é simulado. A etiqueta demonstrativa usa preto e branco, monoespaçada, borda de 2 px, padding 20 px e barras feitas por repeating-linear-gradient; não é uma etiqueta de produção validada.

## 18 Diálogos drawers e menus

### 18.1 Overlay

O overlay de modal ocupa a janela, usa a cor de overlay do tema, blur de 6 px, z-index 60, grid centralizado e padding 16 px. Entra por fade de 200 ms.

### 18.2 Diálogo

O diálogo usa vidro denso, raio 26 px, largura `min(540px, 100%)`, altura máxima `calc(100vh - 32px)` e overflow auto. Wide usa 780 px; xwide, 1000 px. Entra a partir de translateY 10 px, scale 0.97 e opacidade zero, em 420 ms com spring.

Cabeçalho: padding `24px 24px 8px`, gap 12 px e alinhamento pelo topo. Título 20 px e peso 600. Descrição pequena, muted e margem superior 4 px. Corpo: padding `8px 24px 24px`. Rodapé: padding `14px 24px 20px`, gap 8 px e ações à direita.

Escape fecha; clique no fundo fecha quando o alvo é o próprio overlay. O componente tenta focar um primeiro controle 30 ms após abrir e restaurar o foco anterior ao encerrar. O código não implementa um ciclo completo de foco preso ao modal; isso deve ser tratado como necessidade funcional caso exigido, sem afirmar que já está pronto.

### 18.3 Drawer

Overlay com blur 4 px, z-index 60. Painel fixed a 12 px do topo, direita e base, largura `min(400px, calc(100vw - 24px))`, vidro denso, raio 26 px, z-index 61 e overflow oculto. A variante esquerda muda left para 12 px e right para auto.

Animação de 420 ms: parte de translateX 28 px à direita, ou -28 px à esquerda, com opacidade zero. Cabeçalho usa padding `14px 16px 14px 20px`, gap 8 px, mínimo 64 px e borda inferior. Corpo flexível tem padding 20 px e rolagem vertical. Rodapé opcional tem padding 16 px e borda superior.

### 18.4 Popover e menu

Popover fica absoluto, top `100% + 10px`, right 0, z-index 50, raio 20 px, min-width 260 px e overflow oculto. Entra em 200 ms, de translateY -6 px, scale 0.96, blur 4 px e opacidade zero, com origem no canto superior direito.

Label de menu tem padding `12px 16px 6px`, fonte 11 px, peso 700, caixa alta e tracking 0.07em. Item tem gap 12 px, padding `10px 14px`, fonte 14 px, raio 12 px e alinhamento à esquerda. Dentro de popover, largura `100% - 12px` e margens laterais 6 px. Hover e data-active usam nav-hover; aria-checked usa accent-soft. Separador tem 1 px e margem vertical 6 px.

## 19 Avisos estados e retorno de ação

### 19.1 Toast

O conjunto fica fixed no centro inferior, bottom 24 px, left 50%, translateX -50%, z-index 100, coluna e gap 8 px. O contêiner não captura eventos; cada toast captura.

O aviso usa vidro denso, padding `12px 14px`, gap 12 px, raio 18 px, fonte 14 px, peso 500 e largura máxima `min(600px, calc(100vw - 32px))`. Ícone em caixa 30 px e raio 10 px; sucesso verde ou informação azul. O ícone interno mede 17 px. Ação textual usa peso 700 e sublinhado; fechar usa X de 16 px e opacidade local 0.7.

São mantidos no máximo três avisos simultâneos. Cada um fecha automaticamente em **5200 ms**, salvo remoção anterior por ação ou fechar. No celular, o conjunto sobe para bottom 96 px e o toast ocupa `calc(100vw - 24px)`.

### 19.2 Loading

Skeleton usa gradiente horizontal de surface-sunken, surface-2 e surface-sunken nas posições 25%, 50% e 75%, tamanho de background 200% e shimmer de 1.2 s até posição -200%. Raio 6 px. As linhas de skeleton têm padding vertical 12 px, gap 16 px e barras de 14 px com larguras variáveis de 60% a 90%.

A simulação de carregamento padrão espera 420 ms. O apresentador pode forçar carregando, erro ou vazio. Isso é mecanismo de demonstração, não um requisito de atraso artificial nos sistemas futuros.

### 19.3 Vazio e sem resultados

O bloco de estado tem padding `48px 24px`, coluna centralizada, texto central e gap 12 px. Ícone em caixa 56 px, raio 18 px e fundo sunken. Título de 17 px e peso 600. Explicação muted com máximo 440 px. Pode ter ação principal ou secundária conforme a situação.

Sem resultados usa SearchX, texto de revisão de filtros e botão Limpar filtros. Vazio sem cadastro explica o primeiro passo. Sem pendência usa check e mensagem de trabalho em dia. Esses estados não devem ser apresentados com a mesma frase genérica.

### 19.4 Erro e indisponibilidade

Erro de carregamento usa ícone em danger-soft, título Não foi possível carregar os registros, explicação de indisponibilidade do módulo e Tentar novamente com RotateCw de 15 px. O aviso preserva a navegação dos demais módulos.

Estados de acesso negado, registro não encontrado, módulo não instalado e manutenção usam a estrutura de estado comum e orientam a navegação de retorno. Não substituir o shell inteiro por uma página de erro sem identidade.

### 19.5 Banners

Banner tem padding `12px 16px`, gap 12 px, raio 14 px, fonte 14 px e alinhamento pelo topo. Variantes info, warn, ok e danger usam pares semânticos. `.b-text` retorna o texto ao tom principal, preservando o ícone na cor do estado. Os banners acompanham o card ou a região operacional, com margens locais normalmente de 20 px.

### 19.6 Conclusão visual

A marca de sucesso mede 64 × 64 px, raio 22 px e fundo ok-soft. O check usa SVG 30 px e stroke-width 2.6 no formulário de entrega. A linha é desenhada com stroke-dasharray e offset 30, animação de 500 ms com atraso de 150 ms. O símbolo também entra por pop de 420 ms com spring.

## 20 Página inicial Meu trabalho

A saudação mostra data por extenso em 13 px e muted, depois Bom dia, Boa tarde ou Boa noite e o primeiro nome. A data e o horário da saudação usam America/Sao_Paulo. O chip do ambiente fica à direita por margem automática, altura 32 px, raio de pílula, gap 8 px, padding `0 12px 0 6px`, fonte 13 px e peso 600; seu monograma mede 22 px.

### 20.1 Pendência em destaque

O focus-card ocupa a largura, com grid `auto minmax(0, 1fr) auto`, gap 18 px, padding `22px 24px`, raio 22 px e margem inferior 28 px. Usa as cores do item selecionado do menu, inclusive a inversão clara no dark. Não usa as mesmas cores de um card de conteúdo comum.

O brilho radial decorativo mede 260 px, fica right -60 px e top -80 px, com a cor do texto ativo misturada a 18%. O ícone ocupa 52 px, raio 16 px e fundo misturado a 14%. A linha Mais relevante agora tem 12 px, peso 700, caixa alta, tracking 0.08em e opacidade 0.75. O assunto usa 20 px, peso 600 e margem vertical 2 px. A descrição usa 13.5 px e opacidade 0.8.

O botão inverte as duas cores do próprio foco e traz seta de 17 px. Sem tarefas, a região continua existindo com check e a mensagem de ausência de pendências.

### 20.2 Colunas

O grid inicial tem conteúdo flexível e coluna lateral de 360 px, gap 20 px. Até 1180 px, vira coluna única. A coluna lateral é diferente dos 340 px usados nos formulários e detalhes.

Meu trabalho fica no card principal, com cabeçalho, contador plain, Ver tudo e filtros por módulo quando há mais de uma origem. A lista mostra até sete itens na página inicial. O rodapé lista filas de trabalho e suas contagens.

Cada tarefa usa grid `40px minmax(0, 1fr) auto auto`, gap 14 px e padding `14px 20px`. Ícone em caixa 40 px, raio 12 px, ícone interno de 18 px. Título com peso 600 e ellipsis. Metadados 12.5 px, gap 8 px e wrap; assunto com máximo local de 320 px. Prazo em 12.5 px, peso 600, alinhado à direita. Atrasada usa danger; próxima usa warn. A ação é secondary pequena.

O rodapé de filas tem padding `12px 20px`, gap `6px 16px`, fundo surface-2 e raios inferiores 18 px. Links usam 13 px e peso 600, com número em cor principal e tabular.

### 20.3 Ações e recentes

Ações frequentes usam grid de duas colunas, gap 8 px. Tiles sólidos com padding 14 px, raio 16 px, fonte 13.5 px, peso 600 e line-height 1.3. Ícone de 20 px e gap vertical 10 px. São até quatro ações filtradas pela disponibilidade e pelo acesso.

Atividades recentes são até cinco registros, em linhas de grid `34px 1fr auto`, gap 12 px e padding `11px 20px`. Ícone de 34 px e raio 10 px, nome em 13 px e peso 600, descrição e tempo em 12 px. Hover accent-soft.

Os módulos compactos são links de 40 px, raio 14 px e padding `0 14px 0 8px`, gap 8 px, fonte 13.5 px e peso 600. Ícone em caixa de 26 px e raio 8 px. Contador de pendências usa warn-soft e warn. Uma linha de atualização aparece abaixo em 12 px.

### 20.4 O que ainda será extensão

Intranet, feedback, mensagens Teams e comentários de tarefas pelo painel pertencem ao escopo de evolução. Ao implementá-los, reutilizar os mesmos cabeçalhos, cards, menus, fontes, campos, linhas de atividade, estados e materiais. O manual não define dimensões inventadas para telas dessa evolução ainda não existentes no ZIP.

## 21 Entrada e seleção de ambiente

### 21.1 Composição desktop

A entrada ocupa no mínimo 100 vh, com grid `minmax(0, 1fr) minmax(420px, 520px)`, gap 12 px e padding 12 px. À esquerda, painel de marca sólido; à direita, painel de vidro denso. Ambos têm raio 30 px.

O painel de marca tem padding 48 px, flex vertical, distribuição space-between e overflow oculto. O painel de entrada usa padding vertical 40 px e horizontal `clamp(24px, 4vw, 48px)`. Seu conteúdo interno tem máximo 400 px, width 100% e margem automática para centralização vertical.

No topo do painel de entrada, logo e botão de aparência. Na base, texto pequeno centralizado de demonstração. O título inicial Acesse a plataforma usa 30 px, peso 600, tracking -0.02em e margem inferior 8 px. O parágrafo tem margem inferior 28 px.

### 21.2 Arte de marca

O nome no painel esquerdo tem 18 px e tracking 0.26em. AZIME usa Sans, peso 700; Alinare e Novitah usam Serif, peso 400.

O texto grande ocupa no máximo 480 px. AZIME usa 44 px e peso 600; Alinare e Novitah usam 52 px e peso 400. Todos usam line-height 1.06 e tracking -0.025em. O parágrafo abaixo fica a 18 px de distância e máximo 420 px.

Há quatro formas circulares: anel 640 px em right -200 e top -180 com borda art-text a 22%; anel 440 px em right -100 e top -80 com borda a 14%; mancha radial 300 px em right 10 e top 20 com art-accent a 34%; círculo 900 px em left -440 e bottom -640 com art-accent a 8%. Os números são valores CSS em pixels, não dimensões aproximadas.

### 21.3 Botão Microsoft

Altura 50 px, largura total, raio 14 px, borda forte, fundo sólido, fonte 15 px e peso 600, gap 12 px. Hover reforça borda e sombra `0 6px 16px -10px rgb(0 0 0 / .4)`; pressionado escala 0.985.

O símbolo Microsoft é SVG de 20 px, viewBox 21 × 21, com quatro quadrados de 9 px e cores `#f25022`, `#7fba00`, `#00a4ef`, `#ffb900`. É uma exceção de marca externa à paleta do ambiente.

### 21.4 Contas e ambientes

A seleção de conta usa linha de padding `12px 14px`, gap 12 px, raio 14 px, borda comum e fundo sólido. Espaço de 8 px entre contas. Hover usa surface-2 e borda forte.

A seleção de ambiente usa grid `auto 1fr auto`, padding 16 px, gap 14 px, raio 18 px e espaço de 10 px entre cards. Hover sobe 1 px e usa sombra `0 10px 24px -16px rgb(0 0 0 / .4)`. Selecionado, borda primary e halo de 4 px focus-ring. Inclui nome, descrição, quantidade de tarefas e amostras da paleta.

O botão final de entrada mede 50 px. Existe checkbox para memorizar ambiente e ação Trocar de conta. A conexão é simulada com espera de 900 ms. Conta não liberada usa estado de bloqueio; recuperação explica que a senha é gerenciada pela Microsoft.

### 21.5 Celular

Até 760 px, grid de uma coluna, painel de marca oculto e painel de entrada com padding `28px 20px` e altura mínima `calc(100vh - 16px)`. Não reduzir os dois painéis lado a lado até ficarem estreitos.

## 22 Marcas e assinaturas provisórias

O conjunto Logo é linha com gap 12 px. O símbolo padrão mede 36 px e o wordmark aparece ao lado. Símbolos oficiais, se fornecidos no caminho esperado, são carregados como SVG; o wordmark oficial tem altura de contêiner 22 px.

| Marca | Símbolo provisório | Texto provisório |
| --- | --- | --- |
| AZIME | AZ, fundo `#0b0b0c`, branco, peso 700; fonte 38% do tamanho do símbolo | Instrument Sans 15 px, peso 700, caixa alta, tracking 0.24em |
| Alinare | A, fundo `#242741`, creme; Instrument Serif 58% do tamanho, peso 400 | Instrument Serif 20 px, peso 400, caixa alta, tracking 0.2em |
| Novitah | N, gradiente 140 graus de `#d6c0b8` a `#a46f69`, branco; Serif 58%, peso 400 | Instrument Serif 20 px, peso 400, caixa alta, tracking 0.2em |

O raio do monograma gerado é 30% do tamanho. Em 36 px, isso dá 10.8 px e substitui o raio CSS base de 11 px. A sombra é `inset 0 1px 0 rgb(255 255 255 / .18), 0 4px 10px -4px rgb(0 0 0 / .35)`.

O carregador procura `/src/brands/<marca>/logo.svg` e `symbol.svg`. A pasta desta referência só contém instruções; os SVG não estão no ZIP. Substituir as assinaturas por logos oficiais precisa ser uma alteração identificada e validada, conservando proporção, contraste e área ocupada. A reprodução estrita da v0.2 mantém os provisórios até essa validação.

Os nomes legais da demonstração incluem a palavra exemplo. Não tratá-los como razão social oficial. Tampouco transportar nomes, pessoas e dados fictícios para sistemas reais apenas por fazerem parte da tela de referência.

As amostras circulares exibidas na seleção de ambientes vêm de uma lista fixa no componente de marca, e não de um cálculo automático dos tokens do tema. AZIME usa `#0b0b0c`, `#ffffff` e `#3a3c42`; Alinare usa `#242741`, `#f0ebe4` e `#d4c8b7`; Novitah usa `#d6c0b8`, `#a46f69` e `#d7b79b`. Essas amostras permanecem as mesmas ao mudar de claro para escuro.

## 23 Modelos de tela por módulo

### 23.1 Inventário lista

O cabeçalho apresenta Equipamentos ou o recorte pessoal, descrição e ações por permissão. A área de filtros reúne pesquisa por patrimônio, descrição, série ou responsável, tipo e responsável. A segunda linha traz filtros de situação, contagens e chips.

As colunas são Patrimônio, Equipamento, Responsável e local, Situação, Movimentação e Ações. Patrimônio com ícone e tipo abaixo; equipamento com série monoespaçada; pessoa com avatar e localização; status com badge; data alinhada à direita. Entregar fica sempre visível quando autorizado e disponível. As outras ações podem aparecer no hover.

No celular, os mesmos registros têm apresentação por cards na implementação específica desse módulo. O conteúdo exibido e as ações devem continuar derivados do mesmo registro.

### 23.2 Inventário ficha

Hero com patrimônio, descrição, ícone do tipo e status. Faixa de fatos essenciais. Corpo principal com abas Visão geral, Movimentações, Manutenções e Documentos, com contadores onde aplicável. Na visão geral, grupos Uso atual, Dados técnicos e Patrimônio.

A coluna lateral contém Próximo passo, Histórico recente com os três últimos eventos, documentos quando houver e linha de atualização. Recebimento pendente e manutenção têm banners específicos acima do corpo. A ação principal muda conforme a situação e a autorização.

Estados visuais atuais: Disponível em ok; Em uso em info; Em manutenção em warn; Aguardando conferência em accent. São mapeamentos do demo, não uma decisão de mudar regras de patrimônio de outros sistemas.

### 23.3 Registrar entrega

É a referência de formulário com resumo lateral. Três seções: Equipamento, Colaborador e Entrega. Marcadores numéricos passam para check conforme preenchimento. O equipamento aparece em linha composta, com ícone de 44 px, patrimônio, descrição, série e badge Disponível.

A seleção de colaborador tem pesquisa por nome, filtro de ambiente e lista com altura máxima 264 px, scroll, padding 4 px, raio 14 px e fundo sólido. Cada pessoa usa linha de menu com avatar, nome, setor e ambientes. O marcador de seleção mede 22 px, borda 1.5 px e check de 13 px. A grade local de busca usa proporção 1.6 para 1.

Data e Local ficam lado a lado; Observações ocupa largura completa. O resumo repete equipamento e responsável, transição Disponível para Em uso, data, local e três efeitos da confirmação. O rodapé desktop fica no resumo; o mobile fica fixo na base. A conclusão atualiza visualmente histórico e listagem, sem redesenhar a tela após cada etapa.

### 23.4 Outros fluxos de Inventário

O cadastro usa contêiner narrow e duas seções. Identificação traz Patrimônio e Tipo lado a lado e Descrição na largura completa. Dados técnicos traz Marca e modelo e Número de série lado a lado e Localização inicial na largura completa. Série usa fonte mono; patrimônio usa números tabulares. O rodapé tem Cancelar e Cadastrar equipamento com Save de 17 px; durante envio, Loader2 de 17 px e Salvando. A gravação demonstrativa espera 700 ms antes de abrir a ficha.

Entregas e devoluções usa tabela com Data, Patrimônio, Movimentação, Registrado por e chevron. A descrição da movimentação pode truncar em 420 px. Manutenções usa linhas de anexo com Wrench de 18 px em warn, patrimônio e descrição, motivo, fornecedor, previsão e badge à direita. Os estados de loading, vazio e erro são os compartilhados.

Relatórios tem indicadores de situação em grid `repeat(auto-fit, minmax(180px, 1fr))` e margem inferior 16 px. A seção Equipamentos por tipo usa linhas de grid `120px 1fr 40px`, gap 12 px, padding vertical 6 px, nome em 13 px e peso 600, barra central e total à direita. A barra tem altura 8 px, raio 999 px, fundo sunken e preenchimento accent com raio herdado. A largura preenchida representa a fração da quantidade do tipo sobre o total. Cada indicador e cada tipo levam à lista filtrada correspondente.

As particularidades escritas diretamente em TSX são preservadas no inventário de estilos locais e no projeto original. Usar essas fontes ao reproduzir uma tela exata, além dos padrões descritos acima.

### 23.5 Reverso

A listagem mantém o padrão de cabeçalho, card, ferramentas, situação, contagem e linhas de registros. O detalhe organiza a solicitação, cliente, motivo, itens, documentos, histórico e próximas ações. Aprovação permanece dentro do módulo.

A abertura usa contêiner narrow de 980 px e card de formulário. Os grupos incluem Solicitante e cliente, motivo e justificativa conforme o caso, e itens da solicitação. Código de cliente tem input e botão de consulta; durante consulta aparece carregamento. Os campos encontrados são refletidos no formulário.

Na expedição, anexos, etiqueta e rastreio seguem o tratamento de documentos e estados. Os badges atuais são Aguardando aprovação em warn, Devolvida para ajuste em danger, Aguardando expedição em accent, Em trânsito em info e Concluída em ok.

Os motivos e as regras de negócio presentes no demo não passam a ser padrões universais de produto. Este manual congela a apresentação dos componentes; as decisões de escopo aprovadas continuam prevalecendo sobre os exemplos de dados e as regras simuladas.

### 23.6 Viagens lista

O cabeçalho pode indicar Minhas viagens, Viagens da equipe ou Viagens do ambiente. Compras vê ação Registrar compra externa e três indicadores quando permitido: Aguardando emissão, Emitidas e Compras por exceção. Indicadores usam card stat, padding `18px 20px`, número 28 px e label 13 px.

Há seletor de visão pessoal ou ampla, busca por código, destino ou viajante, filtros de situação e chip de exceção. A lista é feita por linhas `.att` com wrap, não por tabela tradicional nessa tela. À esquerda, ícone de avião; no centro, destino, código, período e viajante quando aplicável; à direita, badges, documentação e ChevronRight.

Documentos completos usa CheckCircle2 e ok; pendentes usa CircleAlert e warn. O texto é explícito e em peso 600. A compra fora do fluxo tem badge plain Compra por exceção.

### 23.7 Viagens detalhe

Hero com destino, código, situação, motivo e ação Abrir passagem. Fatos: viajante, ida, volta e documentação. Compra externa ganha banner informativo com responsável e data.

Abas Trechos e hospedagem, Documentos e Histórico. Cada trecho `.leg` usa grid `1fr auto 1fr`, gap 16 px, padding `16px 20px`, raio 14 px, borda e fundo sólido. Origem à esquerda, avião e companhia no centro, destino e localizador à direita. Cidades usam 24 px, peso 600 e números tabulares; no celular, 20 px.

Hotel aparece em linha de anexo com ícone BedDouble e badge Confirmada ou Pendente. A coluna lateral traz checklist documental, viajante e total das passagens quando positivo. Documentos completos dependem dos dados do demonstrativo; o acabamento visual do checklist é a referência reutilizável.

### 23.8 Compra externa

O registro de passagem já comprada segue o mesmo modelo de formulário, campos de viajante, trechos e informações de compra, mantendo o resumo e os estados compartilhados quando utilizados na tela original. Não acrescentar um segundo login, um menu paralelo ou um tema visual próprio ao plugin.

### 23.9 Administração

Colaboradores usam listagem com avatar, informações do vínculo, status e ações. A ficha combina dados e concessões com as mesmas superfícies e cabeçalhos. As telas de perfis e permissões do demo têm controles, seleções e matrizes próprias; a futura correção para concessões individuais não deve redesenhar a aparência dos controles.

Solicitações de acesso têm filtros segmentados e tabela com Número, Colaborador, Acesso solicitado, Solicitante, Situação e Data. O formulário usa três seções: Para quem, O quê e Por quê; módulo em seletor segmentado; ações em checkboxes; escopo em radio-cards; justificativa em textarea; resumo lateral.

O detalhe de acesso mostra dois blocos lado a lado, HOJE e APÓS APLICAR. O segundo usa borda primary. Justificativa e observação da TI vêm abaixo. Histórico usa timeline; colaborador fica no apoio. Aplicar ou recusar usa diálogo, sendo a recusa com motivo obrigatório e ação danger.

Exportações tem abas por módulo, checkboxes para habilitar, formatos, permissões e campos, rodapé de salvar ou descartar e apoio com preservação e histórico. Fieldset desabilitado fica a 50% de opacidade. A regra funcional futura de aprovação por solicitação não está completa nessa versão.

### 23.10 Catálogo de plugins

Abas Todos, Disponíveis, Instalados e Desativados com contadores. O grid é `repeat(auto-fill, minmax(240px, 1fr))` com gap 12 px. Cada tile tem padding 20 px, raio 18 px, borda, fundo surface e mínimo 150 px de altura. Ícone em caixa 44 px e raio 13 px; ícone interno 22 px. Badge fica na mesma linha; título 16 px e descrição 13.5 px; versão e ambientes em 12 px na base.

Detalhe do plugin usa conteúdo mais coluna de 340 px. Mostra Menus, Permissões e Funcionalidades em três blocos, separados por sinais de adição, além de permissões e requisitos. `.flow` usa `1fr auto 1fr auto 1fr`, gap 10 px; cada node tem padding 14 px, raio 14 px e fonte 13 px. Um node novo recebe borda primary e halo 3 px. No celular, vira coluna única.

Ambientes habilitados ficam em card lateral, com labels e checkboxes que recebem role switch. O visual efetivo continua sendo o checkbox estilizado pela família `.check`; não há um switch desenhado de trilho e bolinha nesta versão.

Instalação simulada mostra três passos, com ícones circulares de 28 px, e depois a configuração de ambientes. A sequência usa marcos de 1100, 2200 e 3000 ms. As mensagens de assinatura e compatibilidade são demonstração, sem prova de verificação real do pacote.

### 23.11 Reservas de salas

É o plugin de demonstração instalado pelo catálogo. Cabeçalho comum, card, toolbar com CalendarDays e seletor de cinco dias. A agenda é grid com primeira coluna de 56 px e uma coluna de no mínimo 150 px por sala, gap 4 px e rolagem horizontal quando necessário. Horários de 8h a 17h aparecem em 12 px e números tabulares.

Slot livre: altura 44 px, raio 10 px, borda tracejada forte, fundo transparente, fonte 12 px, padding horizontal 8 px e ellipsis. Hover torna a borda sólida e accent, fundo sólido e texto principal. Ocupado usa accent-soft; reserva própria usa primary e on-primary. A regra `.slot.cancel` tem texto riscado e opacidade 0.6, mas o grid principal filtra reservas canceladas; existência da classe não significa presença visual de canceladas na agenda atual.

Reservar e cancelar usam diálogos compartilhados. Não criar um calendário de outra biblioteca com visual diferente apenas por ser um novo módulo.

### 23.12 Preferências e apresentação

Preferências usa contêiner narrow. Primeiro card tem avatar de 56 px, nome de 18 px, e-mail pequeno e pares de dados. O segundo card tem Ambiente padrão, select de máximo 320 px, Aparência com dois radio-cards em máximo 420 px e opções de reduzir transparência e movimento.

O painel do apresentador usa drawer e controles segmentados para dados de demonstração, identidades e estados. O botão desktop Demonstração mede 30 px, padding horizontal 12 px, fonte 12 px e borda tracejada forte que se torna sólida no hover. No celular, aparece um botão flutuante com ícone Presentation de 17 px; o texto some. Ele mede 42 px e fica right 12 px, bottom 16 px, subindo para 92 px quando há ações fixas.

Os controles de apresentação são ferramentas do protótipo. Sua presença em novos sistemas de produção depende do escopo; não são uma obrigação visual para o colaborador.

## 24 Responsividade exata

O CSS usa três breakpoints por largura máxima, inclusivos: **1180 px, 1024 px e 760 px**. Portanto, uma janela exatamente em 760 px já recebe as regras de celular.

| Faixa | Estrutura | Mudanças principais |
| --- | --- | --- |
| Acima de 1180 px | Sidebar expandida ou recolhida; conteúdo com apoio lateral | Detalhe e formulário com coluna 340 px; início com 360 px; fatos em quatro colunas |
| Até 1180 px | Apoios abaixo do conteúdo | Detalhe, formulário e início em coluna única; resumo deixa sticky; fatos em duas colunas |
| Até 1024 px | Sidebar compacta de 80 px | Textos, submenus, labels, wordmark, tag e botão de recolher escondidos; nomes do usuário somem |
| Até 760 px | Sem sidebar desktop | Drawer de navegação; cabeçalho compacto; ações adaptadas; tabelas responsive viram cards |

### 24.1 Regras de celular

O gap externo vira 8 px. `.shell` fica com uma coluna. O cabeçalho mede 58 px, raio 18 px, gap 4 px e padding horizontal 6 px. O token `--header-h` continua 64 px; a regra da classe é que muda a altura efetiva no celular.

A busca remove o espaço reservado ao atalho à direita e usa padding-right 12 px. O seletor de ambiente reduz gap para 6 px e padding para `0 8px 0 4px`, escondendo o texto Ambiente e nome no botão; o monograma permanece. Componentes hide-mobile somem.

O conteúdo usa padding `20px 4px 100px`. Título de página e saudação ficam com 26 px. Ações do cabeçalho de página passam a ter largura 100%, margem esquerda zero e botões flex 1.

Grids de dois e três itens, grid de campos e radio-cards viram uma coluna por regra geral; quick actions volta explicitamente a duas colunas numa regra posterior. Estilos inline podem impor uma proporção própria, como na busca do formulário de entrega, e precisam ser considerados na reprodução exata.

Corpo de card, seção de formulário e card-pad usam 16 px. Cabeçalho de card usa `12px 16px`. Selects da listagem passam a flex `1 1 140px` e min-width zero; busca perde o max-width.

Hero usa duas colunas, padding 18 px e ícone de 52 px. Ações vão para a linha inteira, com wrap e base de 140 px por botão. O focus-card também passa a duas colunas, padding 18 px e botão na largura da linha seguinte.

Tarefas usam colunas `36px minmax(0, 1fr) auto` e padding `12px 14px`. A ação ocupa da segunda coluna até o fim e fica alinhada ao início. A caixa do ícone ainda conserva sua regra de 40 px se não houver override; essa combinação é parte da implementação existente, não uma medida corrigida neste documento.

Rodapés de diálogo permitem wrap e botões flex 1. O papel de documento usa padding 24 px. `.flow` vira uma coluna e seu elemento de separação gira 90 graus. Toasts sobem para 96 px e ganham largura `100vw - 24px`.

### 24.2 Limites responsivos existentes

O CSS não contém um quarto breakpoint específico para celulares muito estreitos, safe-area-inset de iOS ou adaptação dedicada para teclado virtual. Não se pode afirmar que esses casos foram resolvidos só com base nos arquivos. Para os próximos sistemas, verificar esses cenários e registrar qualquer extensão necessária sem mudar a referência desktop.

## 25 Movimento e transições

| Regra | Valor congelado |
| --- | --- |
| Duração rápida | 140 ms |
| Duração padrão | 200 ms |
| Duração lenta | 420 ms |
| Curva padrão | `cubic-bezier(.2, .8, .2, 1)` |
| Curva spring | `cubic-bezier(.34, 1.36, .64, 1)` |
| Entrada de página | 320 ms; começa opacity 0 e translateY 4 px |
| Entrada de ambiente | 520 ms; opacity 0, blur 6 px e translateY 6 px |
| Luz de contexto | 900 ms; opacity 0.9 até zero |
| Cor das manchas | 700 ms |
| Realce de linha atualizada | 2.4 s; mantém ok-soft até 30% |
| Realce de evento novo | 2.2 s; mantém ok-soft até 35% |
| Shimmer | 1.2 s infinito |
| Spinner | 0.8 s linear infinito |
| Desenho do check | 500 ms após 150 ms |
| Permanência do toast | 5200 ms |

A animação de entrada do contexto e a de página podem ser aplicadas em elementos aninhados. Não colapsar duas animações em uma sem comparação visual. Alguns componentes usam transições com easing padrão do CSS porque sua declaração só especifica duração; não substituir todas automaticamente pela mesma curva.

Movimento deve indicar seleção, abertura, navegação ou resultado. O padrão não contém partículas, brilho contínuo em todos os cards, rotação decorativa de ícones ou hover com inclinação tridimensional.

## 26 Acessibilidade visual e preferências

O foco geral `:focus-visible` usa outline de 2 px em focus, offset 2 px e raio 8 px. Inputs possuem sua própria regra de halo e outline none. Não remover o indicador de foco para ganhar uma aparência supostamente mais limpa.

No Novitah Dark V2, testar contraste de texto normal (4,5:1), texto grande (3:1) e elementos não textuais relevantes (3:1), inclusive sobre camadas de vidro. As opacidades sugeridas não certificam esses requisitos; a aprovação cromática não substitui a validação de acessibilidade.

O projeto tem `.sr-only`, labels, atributos aria em vários controles, avisos role alert, toasts role status com aria-live polite e resumo da entrega com aria-live polite. Tabs usam tablist, tab e aria-selected. Isso descreve marcação existente, não uma certificação de acessibilidade completa.

Marca, tema e preferências são aplicados ao elemento `html`. Além dos atributos data, a aplicação define `style.colorScheme` como light ou dark, afetando controles nativos do navegador. Atualiza também `meta[name=theme-color]` com a cor efetiva de `--amb-base`. Não esquecer esses dois efeitos ao reproduzir a aparência em dispositivos móveis e campos nativos de data.

O estado demonstrativo é persistido em localStorage. A abertura inicial sem preferências usa AZIME claro e sidebar expandida. Tema, ambiente, recolhimento e preferências podem reaparecer de uma sessão anterior; a simulação de estado de carregamento volta para normal ao inicializar. Para comparar telas, partir de estados equivalentes, sem apagar automaticamente dados do usuário fora de um ambiente de teste.

Reduzir movimento pelo sistema define transições e animações para 1 ms e iteração de animação em 1. A preferência própria `data-motion=reduced` também reduz duração a 1 ms. O ambiente continua com os elementos estruturais, mas o movimento fica praticamente instantâneo.

Reduzir transparência usa `--glass-blur: 0px`, saturação 100%, fundos glass, glass-strong, glass-field e surface iguais à superfície sólida, e sheen transparente. A media query `prefers-reduced-transparency: reduce` contém lógica equivalente.

Há uma particularidade importante: `.glass-strong` calcula blur como `--glass-blur + 10px`, e alguns componentes têm blur literal de 12 ou 24 px. Assim, o modo reduzido torna os fundos opacos, mas não zera literalmente todas as declarações de filtro do CSS. Preservar isso ao documentar o estado atual; uma eliminação completa de filtros seria uma correção futura explicitamente identificada.

Não existe regra geral `@supports` para browsers sem backdrop-filter. Não existe uma skin de alto contraste completa no ZIP. Não atribuir esses recursos ao protótipo sem implementação e verificação.

## 27 Particularidades que não podem se perder

1. A ordem é tokens.css e depois app.css. As regras finais do cabeçalho, dos monogramas e do mobile participam do resultado.
2. O visual por marca muda com atributos no documento, não com uma coleção de componentes totalmente diferente por marca.
3. Botões primários claros no dark são parte do padrão, inclusive na Alinare.
4. Novitah conserva os tokens separados para primary, accent e seleção da navegação no modo claro; nesta revisão, os três usam a terracota oficial.
5. O conteúdo usa branco ou sólidos quase opacos sem filtro próprio; o vidro mais evidente está na navegação.
6. A sidebar mede 264 px; a faixa de grid mede 276 px. Não usar 276 px para o painel.
7. A sidebar recolhida mede 80 px; a faixa de grid mede 92 px no desktop.
8. Cabeçalho tem raio 22 px; sidebar 26 px; card 18 px; campo 12 px. Uniformizar tudo altera a identidade.
9. Listagem tem controles de 40 px e raio 11 px; formulário tem 44 px e raio 12 px.
10. O apoio de início mede 360 px; apoio de formulário e detalhe mede 340 px.
11. O blur normal é 22 px; denso 32 px; o ambiente usa 90 px; o overlay usa 6 px.
12. Texto de tabela é 14 px; corpo geral 15 px; metadado frequentemente 12 ou 12.5 px.
13. O submenu tem guia de 1.5 px, ponto de 8 px e halo de 3 px.
14. Badges têm ponto, exceto plain. Chips têm botão de remoção próprio.
15. As ações de tabela podem aparecer apenas no hover ou foco; Entregar usa always.
16. Documentos permanecem brancos no dark, com aparência de papel.
17. As assinaturas atuais são provisórias. O código tem carregador para SVG oficiais, mas os arquivos não estão presentes.
18. Não existe revisão visual concluída desta extração em navegador. A validação comparativa é uma etapa obrigatória das futuras implementações.

**Exceção exclusiva V2 aos itens 3, 5 e 11:** os botões e seleções Novitah Dark passam a usar nude translúcido e texto branco; os cards ficam translúcidos e o vidro usa 16/26 px como parâmetros sugeridos. As demais cinco identidades conservam os valores originais. O Novitah claro não é alterado.

## 28 Contrato de reprodução para todos os próximos fronts

O próximo projeto deve tratar este pacote como uma base de design congelada. Reutilizar os mesmos tokens e componentes; adaptar o domínio de negócio ao redor deles. O trabalho de implementação deve conservar medidas, materiais, fontes, estados e pontos de quebra.

### 28.1 Instrução pronta para o desenvolvedor

> Este projeto deve seguir o Manual definitivo do frontend Alinare Novitah e AZIME e o código visual de referência da v0.2. Antes de construir, leia o manual completo, tokens.css, app.css e os componentes originais relevantes. Use a marca e o tema por data-brand e data-theme. Reutilize fontes Instrument Sans e Instrument Serif nas funções documentadas, Lucide nos mesmos estilos e componentes de navegação, cabeçalho, cards, campos, tabelas, detalhes, diálogos, histórico e anexos. Preserve os valores e a ordem das regras, aplicando os valores cromáticos revisados deste manual. Quando uma tela nova não existir, componha com os componentes oficiais e identifique a extensão. Mostre a tela nova dentro do mesmo shell. Valide os seis temas, os estados de interação e as larguras de referência. Entregue evidência de comparação no mesmo navegador e viewport. Não considere a reprodução concluída apenas porque as cores se parecem com as da marca.

### 28.2 Itens invariáveis

| Dimensão | Critério |
| --- | --- |
| Estrutura | Sidebar flutuante, header flutuante, conteúdo e rolagem equivalentes |
| Marca | Um conjunto completo de tokens por marca e tema |
| Tipografia | Mesmas famílias, pesos, tamanhos, entrelinhas e tracking |
| Geometria | Mesmas larguras, raios, espaçamentos, alinhamentos e alturas |
| Materiais | Mesma composição de fundo, borda, blur, saturação, brilho e sombra |
| Ícones | Mesmo componente, tamanho e posição para funções existentes |
| Interação | Mesmos hover, foco, seleção, pressionado, disabled e retorno |
| Responsividade | Mesmos breakpoints e transformações, observando exceções locais |
| Conteúdo | Hierarquia e densidade equivalentes com dados comparáveis |
| Novas telas | Uso dos componentes existentes antes de propor novos desenhos |

### 28.3 Quando cabe extensão

Um componente realmente novo deve herdar tokens existentes e manter relação visual com os componentes equivalentes. A implementação deve documentar o uso, os seis temas, estados e comportamento mobile. A aprovação de uma extensão não autoriza redesenhar as telas que já são referência.

Correções funcionais ou de acessibilidade podem ser necessárias. Quando alterarem a aparência, registrar a diferença e atualizar a referência aprovada. O objetivo é consistência verificável, sem transformar limitações acidentais do demo em requisitos eternos.

**Contrato Novitah Dark V2:** aplicar a seção 7.6 e os anexos B7/C/D no lugar de qualquer regra cromática histórica conflitante; auditar estilos locais e bibliotecas de gráfico. Não aplicar esses overrides a outra combinação de marca e tema. Manter o padrão funcional e estrutural da versão existente.

## 29 Validação objetiva de fidelidade

### 29.1 Condições equivalentes

Abrir referência e implementação no mesmo navegador e versão, sistema operacional, zoom 100%, escala de tela, viewport e estado de carregamento das fontes. Usar o mesmo usuário, permissões, marca, tema, conteúdo, filtros, scroll e estado de componente.

Fontes com pesos diferentes ou dados com comprimento diferente podem mudar a tela mesmo quando o CSS é igual. Para avaliar layout, usar dados de comparação equivalentes. Para avaliar movimento, comparar a sequência e não uma captura em instante aleatório.

Congelar ou reduzir as animações ambientais durante a captura estática, usando a mesma configuração nas duas versões. Não considerar manchas em posições diferentes como mudança de layout. Para o teste de movimento, reativar as preferências normais.

### 29.2 Larguras de comparação

| Viewport em CSS px | Finalidade |
| --- | --- |
| 1440 × 900 | Referência desktop com apoios laterais |
| 1920 × 1080 | Verificar max-width e respiro em tela larga |
| 1181 × 900 e 1180 × 900 | Conferir mudança dos apoios e fatos |
| 1025 × 900 e 1024 × 900 | Conferir compactação automática da sidebar |
| 761 × 900 e 760 × 900 | Conferir passagem para shell de celular |
| 390 × 844 | Conferir uso típico em celular |
| 360 × 800 | Conferir largura estreita e ações |

Essas resoluções são uma matriz de validação proposta para as próximas entregas, não tamanhos de captura existentes no ZIP.

### 29.3 Telas e estados mínimos

Comparar entrada inicial, seleção de conta, seleção de ambiente, início com trabalho, início sem pendência, menu expandido e recolhido, submenu ativo, busca com resultados e sem resultados, notificações lidas e não lidas, menu de usuário e preferências.

Comparar listagem com filtros, listagem vazia, nenhum resultado, carregamento, erro e paginação; detalhe com abas, histórico e anexos; formulário vazio, preenchido, inválido, salvando, concluído e com alterações não salvas; diálogo normal, wide e drawer.

Repetir os componentes representativos nas seis combinações de marca e tema. As telas de ficha Alinare e entrega AZIME que já foram aprovadas são âncoras de comparação; a mesma verificação deve incluir Novitah.

### 29.4 Critérios de aprovação

Medidas CSS de componentes existentes devem coincidir com a referência. Verificar também quebra dos títulos, posição das ações, alinhamento de ícones, número de colunas, espaço antes e depois das seções, altura dos controles e comportamento no limite dos breakpoints.

Fazer comparação sobreposta ou diferença de imagens nas áreas estáticas. Diferenças de antialiasing entre ambientes de renderização não devem ser confundidas com uma alteração de design; por isso a comparação deve usar condições iguais. O manual não afirma um percentual universal de semelhança que substitua a revisão.

Nenhum botão, modal ou tela deve ser considerado fiel só por usar a paleta. Desvios de fonte, raio, padding, sombra, densidade ou comportamento precisam ser corrigidos ou aprovados como mudança de referência.

**Checklist adicional Novitah Dark V2:** verificar `--amb-base` e `--bg` iguais a `#A46F69`; ausência de fundos pretos/marrons e de cores-base externas na interface; sidebar e topbar translúcidas; seleção nude, prioridade areia, texto/ícones brancos; gráficos claros; sombras leves; foco, estados e contraste; redução de transparência; preservação de todas as funcionalidades e comparação dos outros cinco temas sem regressão. A referência de comparação para este tema é a V2, não o dark histórico. A implementação e a aprovação final do Marketing ainda precisam ser verificadas.

## 30 Arquivos que tornam a reprodução verificável

O pacote contém este manual em Markdown e HTML, os CSS originais, todos os tokens em JSON, o catálogo de regras por seletor e contexto, inventário de componentes e ícones, inventário de estilos locais e o ZIP original aprovado. Os hashes identificam as referências históricas de origem; não atestam que os valores cromáticos revisados já estejam aplicados no ZIP original.

O HTML serve para leitura organizada, busca e impressão. O Markdown serve para anexar à conversa com o desenvolvedor ou ao repositório de regras. Nesta entrega de 26/11/2026 foram revisados apenas os dois documentos; arquivos CSS, JSON, ZIP e sistemas originais não foram alterados. Os blocos B7/C/D documentam a implementação proposta. Os arquivos CSS e componentes originais resolvem ambiguidades que uma descrição de linguagem natural não consegue eliminar.

A seguir estão os anexos técnicos integrais. Eles preservam valores e regras, inclusive exceções, seletores de estado, media queries e ordem de declaração. O corpo descritivo explica o significado; os anexos mantêm os números exatos.

## Anexo A Identificação verificável da referência

Arquivo original: `azime-plataforma-prototipo-v0.2.zip`. SHA256: `806f18f901d0c1d454a622106cc06bd050b322ee0f3f529e0e117f65626aa33f`. Foram preservados 60 arquivos do projeto. O catálogo contém 495 blocos CSS, 91 funções TSX identificadas, 196 ocorrências literais de ícones Lucide e 313 linhas com estilos locais.

O catálogo de ícones identifica componentes escritos literalmente. Ícones escolhidos dinamicamente por mapa ou manifesto devem ser conferidos também em `meta.ts`, nos manifestos de módulos e nos componentes originais. O inventário de estilos locais preserva linhas de origem; expressões dinâmicas continuam dependentes dos dados e do estado da aplicação.

## Anexo B Tokens completos por marca e tema

As tabelas preservam a notação CSS original, com valores de marca corrigidos nesta revisão. `rgb(255 255 255 / .55)` significa branco a 55% de opacidade; não deve ser convertido em uma cor sólida sem considerar o fundo. Sombras com várias parcelas precisam conservar todas elas.

### B1 Tokens comuns

| Token | Valor exato |
| --- | --- |
| `--font` | `'Instrument Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif` |
| `--font-display` | `'Instrument Serif', Georgia, serif` |
| `--s1` | `4px` |
| `--s2` | `8px` |
| `--s3` | `12px` |
| `--s4` | `16px` |
| `--s5` | `20px` |
| `--s6` | `24px` |
| `--s8` | `32px` |
| `--s10` | `40px` |
| `--s12` | `48px` |
| `--r-field` | `12px` |
| `--r-card` | `18px` |
| `--r-dialog` | `26px` |
| `--r-nav` | `26px` |
| `--r-pill` | `999px` |
| `--control-h` | `44px` |
| `--gap-frame` | `12px` |
| `--sidebar-w` | `264px` |
| `--sidebar-w-collapsed` | `80px` |
| `--header-h` | `64px` |
| `--dur-fast` | `140ms` |
| `--dur` | `200ms` |
| `--dur-slow` | `420ms` |
| `--ease` | `cubic-bezier(.2, .8, .2, 1)` |
| `--ease-spring` | `cubic-bezier(.34, 1.36, .64, 1)` |
| `--glass-blur` | `22px` |
| `--glass-sat` | `170%` |

### B2 AZIME claro

| Token | Valor exato |
| --- | --- |
| `--amb-base` | `#e4e5e8` |
| `--amb-1` | `rgb(255 255 255 / .95)` |
| `--amb-2` | `rgb(120 124 136 / .5)` |
| `--amb-3` | `rgb(214 216 222 / .95)` |
| `--amb-4` | `rgb(40 42 50 / .22)` |
| `--bg` | `#e9eaed` |
| `--surface` | `rgb(255 255 255 / .9)` |
| `--surface-solid` | `#ffffff` |
| `--surface-2` | `rgb(247 247 249 / .9)` |
| `--surface-sunken` | `rgb(20 20 24 / .05)` |
| `--border` | `rgb(20 20 24 / .09)` |
| `--border-strong` | `rgb(20 20 24 / .18)` |
| `--text` | `#0b0b0c` |
| `--text-muted` | `#55575e` |
| `--text-subtle` | `#75777e` |
| `--primary` | `#0b0b0c` |
| `--primary-hover` | `#26272b` |
| `--on-primary` | `#ffffff` |
| `--accent` | `#0b0b0c` |
| `--accent-soft` | `rgb(11 11 12 / .07)` |
| `--on-accent-soft` | `#0b0b0c` |
| `--glass-bg` | `rgb(255 255 255 / .55)` |
| `--glass-bg-strong` | `rgb(255 255 255 / .78)` |
| `--glass-field` | `rgb(255 255 255 / .6)` |
| `--glass-border` | `rgb(255 255 255 / .75)` |
| `--glass-edge` | `rgb(255 255 255 / .95)` |
| `--glass-edge-low` | `rgb(0 0 0 / .04)` |
| `--glass-sheen` | `rgb(255 255 255 / .55)` |
| `--glass-shadow` | `0 1px 2px rgb(16 16 20 / .06), 0 12px 32px -10px rgb(16 16 20 / .18)` |
| `--nav-text` | `#3c3e45` |
| `--nav-muted` | `#7a7c84` |
| `--nav-hover` | `rgb(255 255 255 / .55)` |
| `--nav-selected-bg` | `#0b0b0c` |
| `--nav-selected-text` | `#ffffff` |
| `--nav-selected-shadow` | `0 6px 16px -6px rgb(0 0 0 / .45)` |
| `--nav-guide` | `rgb(11 11 12 / .14)` |
| `--nav-sub-active` | `#0b0b0c` |
| `--focus` | `#0b0b0c` |
| `--focus-ring` | `rgb(11 11 12 / .22)` |
| `--art-bg` | `#0b0b0c` |
| `--art-text` | `#fafafa` |
| `--art-muted` | `#9a9ca3` |
| `--art-accent` | `#ffffff` |

### B3 AZIME escuro

| Token | Valor exato |
| --- | --- |
| `--amb-base` | `#08080a` |
| `--amb-1` | `rgb(70 72 80 / .55)` |
| `--amb-2` | `rgb(38 40 46 / .9)` |
| `--amb-3` | `rgb(120 122 132 / .22)` |
| `--amb-4` | `rgb(255 255 255 / .05)` |
| `--bg` | `#08080a` |
| `--surface` | `rgb(22 23 26 / .88)` |
| `--surface-solid` | `#16171a` |
| `--surface-2` | `rgb(30 31 35 / .88)` |
| `--surface-sunken` | `rgb(255 255 255 / .05)` |
| `--border` | `rgb(255 255 255 / .08)` |
| `--border-strong` | `rgb(255 255 255 / .16)` |
| `--text` | `#fafafa` |
| `--text-muted` | `#a6a8b0` |
| `--text-subtle` | `#8a8c94` |
| `--primary` | `#fafafa` |
| `--primary-hover` | `#e4e4e7` |
| `--on-primary` | `#0b0b0c` |
| `--accent` | `#fafafa` |
| `--accent-soft` | `rgb(255 255 255 / .08)` |
| `--on-accent-soft` | `#fafafa` |
| `--glass-bg` | `rgb(30 31 36 / .5)` |
| `--glass-bg-strong` | `rgb(30 31 36 / .78)` |
| `--glass-field` | `rgb(255 255 255 / .06)` |
| `--glass-border` | `rgb(255 255 255 / .12)` |
| `--glass-edge` | `rgb(255 255 255 / .16)` |
| `--glass-edge-low` | `rgb(0 0 0 / .3)` |
| `--glass-sheen` | `rgb(255 255 255 / .06)` |
| `--glass-shadow` | `0 1px 2px rgb(0 0 0 / .4), 0 16px 40px -12px rgb(0 0 0 / .7)` |
| `--nav-text` | `#c9cad0` |
| `--nav-muted` | `#80828a` |
| `--nav-hover` | `rgb(255 255 255 / .06)` |
| `--nav-selected-bg` | `#fafafa` |
| `--nav-selected-text` | `#0b0b0c` |
| `--nav-selected-shadow` | `0 6px 18px -6px rgb(255 255 255 / .25)` |
| `--nav-guide` | `rgb(255 255 255 / .14)` |
| `--nav-sub-active` | `#fafafa` |
| `--focus` | `#fafafa` |
| `--focus-ring` | `rgb(255 255 255 / .25)` |
| `--art-bg` | `#111214` |
| `--art-text` | `#fafafa` |
| `--art-muted` | `#9a9ca3` |
| `--art-accent` | `#ffffff` |

### B4 ALINARE claro

| Token | Valor exato |
| --- | --- |
| `--amb-base` | `#f0ebe4` |
| `--amb-1` | `rgb(240 235 228 / .95)` |
| `--amb-2` | `rgb(36 39 65 / .28)` |
| `--amb-3` | `rgb(212 200 183 / .45)` |
| `--amb-4` | `rgb(255 255 255 / .8)` |
| `--bg` | `#f0ebe4` |
| `--surface` | `rgb(255 255 255 / .88)` |
| `--surface-solid` | `#ffffff` |
| `--surface-2` | `rgb(250 247 243 / .9)` |
| `--surface-sunken` | `rgb(36 39 65 / .05)` |
| `--border` | `rgb(36 39 65 / .1)` |
| `--border-strong` | `rgb(36 39 65 / .2)` |
| `--text` | `#242741` |
| `--text-muted` | `#555870` |
| `--text-subtle` | `#72748a` |
| `--primary` | `#242741` |
| `--primary-hover` | `color-mix(in srgb, #242741 90%, #f0ebe4)` |
| `--on-primary` | `#f0ebe4` |
| `--accent` | `#242741` |
| `--accent-soft` | `rgb(36 39 65 / .08)` |
| `--on-accent-soft` | `#242741` |
| `--glass-bg` | `rgb(246 246 252 / .55)` |
| `--glass-bg-strong` | `rgb(248 248 253 / .8)` |
| `--glass-field` | `rgb(255 255 255 / .6)` |
| `--glass-border` | `rgb(255 255 255 / .7)` |
| `--glass-edge` | `rgb(255 255 255 / .95)` |
| `--glass-edge-low` | `rgb(36 39 65 / .06)` |
| `--glass-sheen` | `rgb(255 255 255 / .5)` |
| `--glass-shadow` | `0 1px 2px rgb(36 39 65 / .08), 0 14px 34px -12px rgb(36 39 65 / .28)` |
| `--nav-text` | `#33364f` |
| `--nav-muted` | `#7a7c92` |
| `--nav-hover` | `rgb(255 255 255 / .6)` |
| `--nav-selected-bg` | `#242741` |
| `--nav-selected-text` | `#f0ebe4` |
| `--nav-selected-shadow` | `0 8px 18px -8px rgb(36 39 65 / .7)` |
| `--nav-guide` | `rgb(36 39 65 / .16)` |
| `--nav-sub-active` | `#242741` |
| `--focus` | `#242741` |
| `--focus-ring` | `rgb(36 39 65 / .22)` |
| `--art-bg` | `#242741` |
| `--art-text` | `#f0ebe4` |
| `--art-muted` | `#d4c8b7` |
| `--art-accent` | `#d4c8b7` |

### B5 ALINARE escuro

| Token | Valor exato |
| --- | --- |
| `--amb-base` | `#0c0e1f` |
| `--amb-1` | `rgb(36 39 65 / .5)` |
| `--amb-2` | `rgb(36 39 65 / .95)` |
| `--amb-3` | `rgb(212 200 183 / .22)` |
| `--amb-4` | `rgb(240 235 228 / .06)` |
| `--bg` | `#0c0e1f` |
| `--surface` | `rgb(26 29 54 / .86)` |
| `--surface-solid` | `#1a1d36` |
| `--surface-2` | `rgb(33 37 66 / .86)` |
| `--surface-sunken` | `rgb(240 235 228 / .05)` |
| `--border` | `rgb(240 235 228 / .08)` |
| `--border-strong` | `rgb(240 235 228 / .16)` |
| `--text` | `#f0ebe4` |
| `--text-muted` | `#d4c8b7` |
| `--text-subtle` | `#8f8ea6` |
| `--primary` | `#f0ebe4` |
| `--primary-hover` | `#ffffff` |
| `--on-primary` | `#242741` |
| `--accent` | `#d4c8b7` |
| `--accent-soft` | `rgb(212 200 183 / .1)` |
| `--on-accent-soft` | `#f0ebe4` |
| `--glass-bg` | `rgb(36 39 65 / .48)` |
| `--glass-bg-strong` | `rgb(36 39 65 / .8)` |
| `--glass-field` | `rgb(240 235 228 / .06)` |
| `--glass-border` | `rgb(240 235 228 / .14)` |
| `--glass-edge` | `rgb(240 235 228 / .18)` |
| `--glass-edge-low` | `rgb(0 0 0 / .3)` |
| `--glass-sheen` | `rgb(240 235 228 / .06)` |
| `--glass-shadow` | `0 1px 2px rgb(0 0 0 / .4), 0 18px 44px -14px rgb(0 0 10 / .8)` |
| `--nav-text` | `#f0ebe4` |
| `--nav-muted` | `#8886a3` |
| `--nav-hover` | `rgb(240 235 228 / .06)` |
| `--nav-selected-bg` | `#f0ebe4` |
| `--nav-selected-text` | `#242741` |
| `--nav-selected-shadow` | `0 8px 20px -8px rgb(240 235 228 / .3)` |
| `--nav-guide` | `rgb(240 235 228 / .14)` |
| `--nav-sub-active` | `#f0ebe4` |
| `--focus` | `#d4c8b7` |
| `--focus-ring` | `rgb(212 200 183 / .3)` |
| `--art-bg` | `#1a1d36` |
| `--art-text` | `#f0ebe4` |
| `--art-muted` | `#d4c8b7` |
| `--art-accent` | `#d4c8b7` |

### B6 NOVITAH claro

| Token | Valor exato |
| --- | --- |
| `--amb-base` | `#f2e8e2` |
| `--amb-1` | `rgb(214 192 184 / .9)` |
| `--amb-2` | `rgb(164 111 105 / .32)` |
| `--amb-3` | `rgb(215 183 155 / .7)` |
| `--amb-4` | `rgb(255 250 246 / .9)` |
| `--bg` | `#f2e8e2` |
| `--surface` | `rgb(255 253 251 / .9)` |
| `--surface-solid` | `#ffffff` |
| `--surface-2` | `rgb(252 247 244 / .9)` |
| `--surface-sunken` | `rgb(164 111 105 / .05)` |
| `--border` | `rgb(164 111 105 / .1)` |
| `--border-strong` | `rgb(164 111 105 / .2)` |
| `--text` | `#2b1d1a` |
| `--text-muted` | `#6a5a56` |
| `--text-subtle` | `#83716c` |
| `--primary` | `#a46f69` |
| `--primary-hover` | `color-mix(in srgb, #a46f69 72%, #130b0c)` |
| `--on-primary` | `#ffffff` |
| `--accent` | `#a46f69` |
| `--accent-soft` | `rgb(164 111 105 / .1)` |
| `--on-accent-soft` | `#7a4842` |
| `--glass-bg` | `rgb(255 248 244 / .55)` |
| `--glass-bg-strong` | `rgb(255 249 246 / .8)` |
| `--glass-field` | `rgb(255 255 255 / .6)` |
| `--glass-border` | `rgb(255 255 255 / .7)` |
| `--glass-edge` | `rgb(255 255 255 / .95)` |
| `--glass-edge-low` | `rgb(164 111 105 / .06)` |
| `--glass-sheen` | `rgb(255 255 255 / .5)` |
| `--glass-shadow` | `0 1px 2px rgb(164 111 105 / .08), 0 14px 34px -12px rgb(164 111 105 / .26)` |
| `--nav-text` | `#4e3e3a` |
| `--nav-muted` | `#8d7a75` |
| `--nav-hover` | `rgb(255 255 255 / .6)` |
| `--nav-selected-bg` | `#a46f69` |
| `--nav-selected-text` | `#ffffff` |
| `--nav-selected-shadow` | `0 8px 18px -8px rgb(164 111 105 / .7)` |
| `--nav-guide` | `rgb(164 111 105 / .16)` |
| `--nav-sub-active` | `#a46f69` |
| `--focus` | `#a46f69` |
| `--focus-ring` | `rgb(164 111 105 / .28)` |
| `--art-bg` | `#a46f69` |
| `--art-text` | `#fbf3ef` |
| `--art-muted` | `#d6c0b8` |
| `--art-accent` | `#d6c0b8` |

### B7 NOVITAH escuro — V2

Valores de implementação propostos em 26/11/2026. Os cinco hexadecimais são institucionais; opacidades e demais parâmetros precisam de validação visual e de contraste.

| Token | Valor exato da proposta |
| --- | --- |
| `--amb-base` | `#A46F69` |
| `--amb-1` | `rgb(214 192 184 / .10)` |
| `--amb-2` | `rgb(255 255 255 / .08)` |
| `--amb-3` | `rgb(215 183 155 / .06)` |
| `--amb-4` | `rgb(164 111 105 / .22)` |
| `--bg` | `#A46F69` |
| `--surface` | `rgb(255 255 255 / .05)` |
| `--surface-solid` | `#A46F69` |
| `--surface-2` | `rgb(255 255 255 / .08)` |
| `--surface-sunken` | `rgb(255 255 255 / .05)` |
| `--border` | `rgb(214 192 184 / .45)` |
| `--border-strong` | `rgb(255 255 255 / .60)` |
| `--text` | `#FFFFFF` |
| `--text-muted` | `rgb(255 255 255 / .85)` |
| `--text-subtle` | `rgb(255 255 255 / .70)` |
| `--primary` | `rgb(214 192 184 / .22)` |
| `--primary-hover` | `rgb(214 192 184 / .30)` |
| `--on-primary` | `#FFFFFF` |
| `--accent` | `#D6C0B8` |
| `--accent-soft` | `rgb(214 192 184 / .15)` |
| `--on-accent-soft` | `#FFFFFF` |
| `--glass-bg` | `rgb(255 255 255 / .05)` |
| `--glass-bg-strong` | `rgb(164 111 105 / .95)` |
| `--glass-field` | `rgb(255 255 255 / .08)` |
| `--glass-border` | `rgb(214 192 184 / .45)` |
| `--glass-edge` | `rgb(255 255 255 / .60)` |
| `--glass-edge-low` | `rgb(198 196 199 / .20)` |
| `--glass-sheen` | `rgb(255 255 255 / .08)` |
| `--glass-shadow` | `0 8px 24px rgb(164 111 105 / .15)` |
| `--nav-text` | `#FFFFFF` |
| `--nav-muted` | `#D6C0B8` |
| `--nav-hover` | `rgb(255 255 255 / .12)` |
| `--nav-selected-bg` | `rgb(214 192 184 / .22)` |
| `--nav-selected-text` | `#FFFFFF` |
| `--nav-selected-shadow` | `0 8px 20px -8px rgb(164 111 105 / .15)` |
| `--nav-guide` | `rgb(198 196 199 / .45)` |
| `--nav-sub-active` | `#FFFFFF` |
| `--focus` | `#FFFFFF` |
| `--focus-ring` | `rgb(255 255 255 / .28)` |
| `--art-bg` | `#A46F69` |
| `--art-text` | `#FFFFFF` |
| `--art-muted` | `rgb(255 255 255 / .85)` |
| `--art-accent` | `#D7B79B` |
| `--glass-blur` | `16px` |
| `--glass-sat` | `100%` |
| `--surface-hover` | `rgb(255 255 255 / .12)` |
| `--surface-icon` | `rgb(255 255 255 / .15)` |
| `--accent-attention` | `#D7B79B` |
| `--attention-surface` | `rgb(215 183 155 / .22)` |
| `--chart-line` | `#FFFFFF` |
| `--chart-fill` | `rgb(255 255 255 / .15)` |
| `--chart-grid` | `rgb(214 192 184 / .40)` |
| `--divider` | `rgb(198 196 199 / .45)` |
| `--ok` | `#FFFFFF` |
| `--ok-soft` | `rgb(255 255 255 / .08)` |
| `--warn` | `#D7B79B` |
| `--warn-soft` | `rgb(215 183 155 / .13)` |
| `--danger` | `#FFFFFF` |
| `--danger-soft` | `rgb(214 192 184 / .18)` |
| `--info` | `#D6C0B8` |
| `--info-soft` | `rgb(214 192 184 / .13)` |
| `--neutral` | `#C6C4C7` |
| `--neutral-soft` | `rgb(198 196 199 / .12)` |
| `--overlay` | `rgb(164 111 105 / .55)` |

## Anexo C Arquivo integral de tokens

A transcrição abaixo mantém seletores, estrutura e ordem da origem, com os valores cromáticos institucionais revisados. O bloco Novitah escuro foi substituído pelos tokens B7 V2; sua especificidade prevalece sobre os estados compartilhados. Tons técnicos e estados dos demais temas não são apresentados como cores oficiais de marketing. A redução de transparência usa `--surface-solid` e deve prevalecer sobre o vidro V2.

```css
/* =====================================================================
   TOKENS — Plataforma AZIME
   Três camadas:  1) ambiente (fundo de luz e cor da marca)
                  2) materiais de vidro (navegação, menus, diálogos, busca)
                  3) superfícies de conteúdo (cards, tabelas, formulários)
   A marca ativa (data-brand) troca os tokens; o usuário escolhe claro/escuro (data-theme).
   Cores institucionais revisadas conforme Marketing em 24/11/2026; tons técnicos e estados mantêm sua função.
   ===================================================================== */

:root {
  --font: 'Instrument Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-display: 'Instrument Serif', Georgia, serif;

  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 20px; --s6: 24px; --s8: 32px; --s10: 40px; --s12: 48px;
  --r-field: 12px; --r-card: 18px; --r-dialog: 26px; --r-nav: 26px; --r-pill: 999px;
  --control-h: 44px;
  --gap-frame: 12px;            /* respiro externo entre vidro e borda da janela */
  --sidebar-w: 264px; --sidebar-w-collapsed: 80px; --header-h: 64px;

  --dur-fast: 140ms; --dur: 200ms; --dur-slow: 420ms;
  --ease: cubic-bezier(.2, .8, .2, 1);
  --ease-spring: cubic-bezier(.34, 1.36, .64, 1);

  /* materiais (sobrescritos por marca/tema) */
  --glass-blur: 22px; --glass-sat: 170%;
}

/* ---------------------------------------------------------------------
   AZIME · preto, branco vibrante, grafite e vidro neutro
   --------------------------------------------------------------------- */
[data-brand='azime'][data-theme='light'] {
  --amb-base: #e4e5e8; --amb-1: rgb(255 255 255 / .95); --amb-2: rgb(120 124 136 / .5); --amb-3: rgb(214 216 222 / .95); --amb-4: rgb(40 42 50 / .22);
  --bg: #e9eaed;
  --surface: rgb(255 255 255 / .9); --surface-solid: #ffffff; --surface-2: rgb(247 247 249 / .9); --surface-sunken: rgb(20 20 24 / .05);
  --border: rgb(20 20 24 / .09); --border-strong: rgb(20 20 24 / .18);
  --text: #0b0b0c; --text-muted: #55575e; --text-subtle: #75777e;
  --primary: #0b0b0c; --primary-hover: #26272b; --on-primary: #ffffff;
  --accent: #0b0b0c; --accent-soft: rgb(11 11 12 / .07); --on-accent-soft: #0b0b0c;
  --glass-bg: rgb(255 255 255 / .55); --glass-bg-strong: rgb(255 255 255 / .78); --glass-field: rgb(255 255 255 / .6);
  --glass-border: rgb(255 255 255 / .75); --glass-edge: rgb(255 255 255 / .95); --glass-edge-low: rgb(0 0 0 / .04);
  --glass-sheen: rgb(255 255 255 / .55);
  --glass-shadow: 0 1px 2px rgb(16 16 20 / .06), 0 12px 32px -10px rgb(16 16 20 / .18);
  --nav-text: #3c3e45; --nav-muted: #7a7c84; --nav-hover: rgb(255 255 255 / .55);
  --nav-selected-bg: #0b0b0c; --nav-selected-text: #ffffff; --nav-selected-shadow: 0 6px 16px -6px rgb(0 0 0 / .45);
  --nav-guide: rgb(11 11 12 / .14); --nav-sub-active: #0b0b0c;
  --focus: #0b0b0c; --focus-ring: rgb(11 11 12 / .22);
  --art-bg: #0b0b0c; --art-text: #fafafa; --art-muted: #9a9ca3; --art-accent: #ffffff;
}
[data-brand='azime'][data-theme='dark'] {
  --amb-base: #08080a; --amb-1: rgb(70 72 80 / .55); --amb-2: rgb(38 40 46 / .9); --amb-3: rgb(120 122 132 / .22); --amb-4: rgb(255 255 255 / .05);
  --bg: #08080a;
  --surface: rgb(22 23 26 / .88); --surface-solid: #16171a; --surface-2: rgb(30 31 35 / .88); --surface-sunken: rgb(255 255 255 / .05);
  --border: rgb(255 255 255 / .08); --border-strong: rgb(255 255 255 / .16);
  --text: #fafafa; --text-muted: #a6a8b0; --text-subtle: #8a8c94;
  --primary: #fafafa; --primary-hover: #e4e4e7; --on-primary: #0b0b0c;
  --accent: #fafafa; --accent-soft: rgb(255 255 255 / .08); --on-accent-soft: #fafafa;
  --glass-bg: rgb(30 31 36 / .5); --glass-bg-strong: rgb(30 31 36 / .78); --glass-field: rgb(255 255 255 / .06);
  --glass-border: rgb(255 255 255 / .12); --glass-edge: rgb(255 255 255 / .16); --glass-edge-low: rgb(0 0 0 / .3);
  --glass-sheen: rgb(255 255 255 / .06);
  --glass-shadow: 0 1px 2px rgb(0 0 0 / .4), 0 16px 40px -12px rgb(0 0 0 / .7);
  --nav-text: #c9cad0; --nav-muted: #80828a; --nav-hover: rgb(255 255 255 / .06);
  --nav-selected-bg: #fafafa; --nav-selected-text: #0b0b0c; --nav-selected-shadow: 0 6px 18px -6px rgb(255 255 255 / .25);
  --nav-guide: rgb(255 255 255 / .14); --nav-sub-active: #fafafa;
  --focus: #fafafa; --focus-ring: rgb(255 255 255 / .25);
  --art-bg: #111214; --art-text: #fafafa; --art-muted: #9a9ca3; --art-accent: #ffffff;
}

/* ---------------------------------------------------------------------
   Alinare · Deep #242741, Off Light #F0EBE4, Travertine #D4C8B7, New-Ruby #7A353C, Ônix #121212 — vidro levemente azulado
   --------------------------------------------------------------------- */
[data-brand='alinare'][data-theme='light'] {
  --amb-base: #f0ebe4; --amb-1: rgb(240 235 228 / .95); --amb-2: rgb(36 39 65 / .28); --amb-3: rgb(212 200 183 / .45); --amb-4: rgb(255 255 255 / .8);
  --bg: #f0ebe4;
  --surface: rgb(255 255 255 / .88); --surface-solid: #ffffff; --surface-2: rgb(250 247 243 / .9); --surface-sunken: rgb(36 39 65 / .05);
  --border: rgb(36 39 65 / .1); --border-strong: rgb(36 39 65 / .2);
  --text: #242741; --text-muted: #555870; --text-subtle: #72748a;
  --primary: #242741; --primary-hover: color-mix(in srgb, #242741 90%, #f0ebe4); --on-primary: #f0ebe4;
  --accent: #242741; --accent-soft: rgb(36 39 65 / .08); --on-accent-soft: #242741;
  --glass-bg: rgb(246 246 252 / .55); --glass-bg-strong: rgb(248 248 253 / .8); --glass-field: rgb(255 255 255 / .6);
  --glass-border: rgb(255 255 255 / .7); --glass-edge: rgb(255 255 255 / .95); --glass-edge-low: rgb(36 39 65 / .06);
  --glass-sheen: rgb(255 255 255 / .5);
  --glass-shadow: 0 1px 2px rgb(36 39 65 / .08), 0 14px 34px -12px rgb(36 39 65 / .28);
  --nav-text: #33364f; --nav-muted: #7a7c92; --nav-hover: rgb(255 255 255 / .6);
  --nav-selected-bg: #242741; --nav-selected-text: #f0ebe4; --nav-selected-shadow: 0 8px 18px -8px rgb(36 39 65 / .7);
  --nav-guide: rgb(36 39 65 / .16); --nav-sub-active: #242741;
  --focus: #242741; --focus-ring: rgb(36 39 65 / .22);
  --art-bg: #242741; --art-text: #f0ebe4; --art-muted: #d4c8b7; --art-accent: #d4c8b7;
}
[data-brand='alinare'][data-theme='dark'] {
  --amb-base: #0c0e1f; --amb-1: rgb(36 39 65 / .5); --amb-2: rgb(36 39 65 / .95); --amb-3: rgb(212 200 183 / .22); --amb-4: rgb(240 235 228 / .06);
  --bg: #0c0e1f;
  --surface: rgb(26 29 54 / .86); --surface-solid: #1a1d36; --surface-2: rgb(33 37 66 / .86); --surface-sunken: rgb(240 235 228 / .05);
  --border: rgb(240 235 228 / .08); --border-strong: rgb(240 235 228 / .16);
  --text: #f0ebe4; --text-muted: #d4c8b7; --text-subtle: #8f8ea6;
  --primary: #f0ebe4; --primary-hover: #ffffff; --on-primary: #242741;
  --accent: #d4c8b7; --accent-soft: rgb(212 200 183 / .1); --on-accent-soft: #f0ebe4;
  --glass-bg: rgb(36 39 65 / .48); --glass-bg-strong: rgb(36 39 65 / .8); --glass-field: rgb(240 235 228 / .06);
  --glass-border: rgb(240 235 228 / .14); --glass-edge: rgb(240 235 228 / .18); --glass-edge-low: rgb(0 0 0 / .3);
  --glass-sheen: rgb(240 235 228 / .06);
  --glass-shadow: 0 1px 2px rgb(0 0 0 / .4), 0 18px 44px -14px rgb(0 0 10 / .8);
  --nav-text: #f0ebe4; --nav-muted: #8886a3; --nav-hover: rgb(240 235 228 / .06);
  --nav-selected-bg: #f0ebe4; --nav-selected-text: #242741; --nav-selected-shadow: 0 8px 20px -8px rgb(240 235 228 / .3);
  --nav-guide: rgb(240 235 228 / .14); --nav-sub-active: #f0ebe4;
  --focus: #d4c8b7; --focus-ring: rgb(212 200 183 / .3);
  --art-bg: #1a1d36; --art-text: #f0ebe4; --art-muted: #d4c8b7; --art-accent: #d4c8b7;
}

/* ---------------------------------------------------------------------
   Novitah · nude #D6C0B8, terracota #A46F69, areia #D7B79B, cinza #C6C4C7 — vidro quente
   --------------------------------------------------------------------- */
[data-brand='novitah'][data-theme='light'] {
  --amb-base: #f2e8e2; --amb-1: rgb(214 192 184 / .9); --amb-2: rgb(164 111 105 / .32); --amb-3: rgb(215 183 155 / .7); --amb-4: rgb(255 250 246 / .9);
  --bg: #f2e8e2;
  --surface: rgb(255 253 251 / .9); --surface-solid: #ffffff; --surface-2: rgb(252 247 244 / .9); --surface-sunken: rgb(164 111 105 / .05);
  --border: rgb(164 111 105 / .1); --border-strong: rgb(164 111 105 / .2);
  --text: #2b1d1a; --text-muted: #6a5a56; --text-subtle: #83716c;
  --primary: #a46f69; --primary-hover: color-mix(in srgb, #a46f69 72%, #130b0c); --on-primary: #ffffff;
  --accent: #a46f69; --accent-soft: rgb(164 111 105 / .1); --on-accent-soft: #7a4842;
  --glass-bg: rgb(255 248 244 / .55); --glass-bg-strong: rgb(255 249 246 / .8); --glass-field: rgb(255 255 255 / .6);
  --glass-border: rgb(255 255 255 / .7); --glass-edge: rgb(255 255 255 / .95); --glass-edge-low: rgb(164 111 105 / .06);
  --glass-sheen: rgb(255 255 255 / .5);
  --glass-shadow: 0 1px 2px rgb(164 111 105 / .08), 0 14px 34px -12px rgb(164 111 105 / .26);
  --nav-text: #4e3e3a; --nav-muted: #8d7a75; --nav-hover: rgb(255 255 255 / .6);
  --nav-selected-bg: #a46f69; --nav-selected-text: #ffffff; --nav-selected-shadow: 0 8px 18px -8px rgb(164 111 105 / .7);
  --nav-guide: rgb(164 111 105 / .16); --nav-sub-active: #a46f69;
  --focus: #a46f69; --focus-ring: rgb(164 111 105 / .28);
  --art-bg: #a46f69; --art-text: #fbf3ef; --art-muted: #d6c0b8; --art-accent: #d6c0b8;
}
[data-brand='novitah'][data-theme='dark'] {
  /* Novitah Dark V2 — 26/11/2026; parâmetros propostos, validar contraste. */
  --amb-base: #A46F69;
  --amb-1: rgb(214 192 184 / .10);
  --amb-2: rgb(255 255 255 / .08);
  --amb-3: rgb(215 183 155 / .06);
  --amb-4: rgb(164 111 105 / .22);
  --bg: #A46F69;
  --surface: rgb(255 255 255 / .05);
  --surface-solid: #A46F69;
  --surface-2: rgb(255 255 255 / .08);
  --surface-sunken: rgb(255 255 255 / .05);
  --border: rgb(214 192 184 / .45);
  --border-strong: rgb(255 255 255 / .60);
  --text: #FFFFFF;
  --text-muted: rgb(255 255 255 / .85);
  --text-subtle: rgb(255 255 255 / .70);
  --primary: rgb(214 192 184 / .22);
  --primary-hover: rgb(214 192 184 / .30);
  --on-primary: #FFFFFF;
  --accent: #D6C0B8;
  --accent-soft: rgb(214 192 184 / .15);
  --on-accent-soft: #FFFFFF;
  --glass-bg: rgb(255 255 255 / .05);
  --glass-bg-strong: rgb(164 111 105 / .95);
  --glass-field: rgb(255 255 255 / .08);
  --glass-border: rgb(214 192 184 / .45);
  --glass-edge: rgb(255 255 255 / .60);
  --glass-edge-low: rgb(198 196 199 / .20);
  --glass-sheen: rgb(255 255 255 / .08);
  --glass-shadow: 0 8px 24px rgb(164 111 105 / .15);
  --nav-text: #FFFFFF;
  --nav-muted: #D6C0B8;
  --nav-hover: rgb(255 255 255 / .12);
  --nav-selected-bg: rgb(214 192 184 / .22);
  --nav-selected-text: #FFFFFF;
  --nav-selected-shadow: 0 8px 20px -8px rgb(164 111 105 / .15);
  --nav-guide: rgb(198 196 199 / .45);
  --nav-sub-active: #FFFFFF;
  --focus: #FFFFFF;
  --focus-ring: rgb(255 255 255 / .28);
  --art-bg: #A46F69;
  --art-text: #FFFFFF;
  --art-muted: rgb(255 255 255 / .85);
  --art-accent: #D7B79B;
  --glass-blur: 16px;
  --glass-sat: 100%;
  --surface-hover: rgb(255 255 255 / .12);
  --surface-icon: rgb(255 255 255 / .15);
  --accent-attention: #D7B79B;
  --attention-surface: rgb(215 183 155 / .22);
  --chart-line: #FFFFFF;
  --chart-fill: rgb(255 255 255 / .15);
  --chart-grid: rgb(214 192 184 / .40);
  --divider: rgb(198 196 199 / .45);
  --ok: #FFFFFF;
  --ok-soft: rgb(255 255 255 / .08);
  --warn: #D7B79B;
  --warn-soft: rgb(215 183 155 / .13);
  --danger: #FFFFFF;
  --danger-soft: rgb(214 192 184 / .18);
  --info: #D6C0B8;
  --info-soft: rgb(214 192 184 / .13);
  --neutral: #C6C4C7;
  --neutral-soft: rgb(198 196 199 / .12);
  --overlay: rgb(164 111 105 / .55);
}

/* ---------- Status operacionais (iguais em todas as marcas; sempre com texto ou ícone) ---------- */
[data-theme='light'] {
  --ok: #15703f; --ok-soft: rgb(22 121 74 / .1); --warn: #7d5100; --warn-soft: rgb(196 140 20 / .14);
  --danger: #b42318; --danger-soft: rgb(180 35 24 / .09); --info: #1f5aa0; --info-soft: rgb(31 95 168 / .09);
  --neutral: #55575e; --neutral-soft: rgb(85 87 94 / .1);
  --overlay: rgb(15 15 20 / .28);
}
[data-theme='dark'] {
  --ok: #6fdba5; --ok-soft: rgb(95 211 154 / .13); --warn: #f2c25c; --warn-soft: rgb(242 194 92 / .13);
  --danger: #ff8f83; --danger-soft: rgb(255 138 125 / .13); --info: #95c3f7; --info-soft: rgb(141 189 245 / .13);
  --neutral: #b4b6bd; --neutral-soft: rgb(180 182 189 / .12);
  --overlay: rgb(0 0 0 / .5);
}

/* ---------- Redução de transparência (preferência do sistema ou do usuário) ---------- */
[data-transparency='reduced'],
[data-brand='novitah'][data-theme='dark'][data-transparency='reduced'] {
  --glass-blur: 0px; --glass-sat: 100%;
  --glass-bg: var(--surface-solid); --glass-bg-strong: var(--surface-solid); --glass-field: var(--surface-solid);
  --glass-sheen: transparent;
  --surface: var(--surface-solid);
}
@media (prefers-reduced-transparency: reduce) {
  :root { --glass-blur: 0px; --glass-sat: 100%; }
  [data-theme], [data-brand='novitah'][data-theme='dark'] { --glass-blur: 0px; --glass-sat: 100%; --glass-bg: var(--surface-solid); --glass-bg-strong: var(--surface-solid); --glass-field: var(--surface-solid); --glass-sheen: transparent; --surface: var(--surface-solid); }
}

```

## Anexo D Arquivo integral de estilos

Este anexo preserva as regras e a ordem da cascata de origem, acrescidas ao final do override proposto para Novitah Dark V2. Inclui pseudo-elementos, estados, animações, media queries e ajustes finais. O override não constitui CSS validado em uma aplicação executada.

```css
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { min-height: 100%; }
body {
  margin: 0; font-family: var(--font); font-size: 15px; line-height: 1.5; color: var(--text); background: var(--amb-base);
  -webkit-font-smoothing: antialiased; transition: color var(--dur) var(--ease);
}
a { color: inherit; }
button, input, select, textarea { font: inherit; color: inherit; }
h1, h2, h3, h4 { margin: 0; letter-spacing: -0.012em; }
p { margin: 0; }
.tnum, .num, td.num { font-variant-numeric: tabular-nums; }
.muted { color: var(--text-muted); } .subtle { color: var(--text-subtle); }
.small { font-size: 13px; } .xs { font-size: 12px; } .strong { font-weight: 600; }
.mono { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: .92em; letter-spacing: .01em; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.row { display: flex; align-items: center; gap: var(--s2); }
.row-wrap { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); }
.stack { display: flex; flex-direction: column; gap: var(--s4); }
.stack-sm { display: flex; flex-direction: column; gap: var(--s2); }
.spacer { flex: 1; }
.grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s4); }
.grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s4); }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 8px; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: 1ms !important; animation-duration: 1ms !important; animation-iteration-count: 1 !important; } }
[data-motion='reduced'] *, [data-motion='reduced'] *::before, [data-motion='reduced'] *::after { transition-duration: 1ms !important; animation-duration: 1ms !important; }

/* =====================================================================
   CAMADA 1 · AMBIENTE
   ===================================================================== */
.ambient { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; background: var(--amb-base); transition: background-color var(--dur-slow) var(--ease); }
.ambient i { position: absolute; border-radius: 50%; filter: blur(90px); transition: background-color 700ms var(--ease); will-change: transform; }
.ambient .a1 { width: 62vw; height: 62vw; left: -14vw; top: -22vw; background: var(--amb-1); animation: drift1 38s ease-in-out infinite alternate; }
.ambient .a2 { width: 48vw; height: 48vw; right: -10vw; top: 6vh; background: var(--amb-2); animation: drift2 44s ease-in-out infinite alternate; }
.ambient .a3 { width: 56vw; height: 56vw; left: 22vw; bottom: -30vw; background: var(--amb-3); animation: drift3 50s ease-in-out infinite alternate; }
.ambient .a4 { width: 30vw; height: 30vw; right: 18vw; bottom: 8vh; background: var(--amb-4); animation: drift1 60s ease-in-out infinite alternate-reverse; }
.ambient::after { /* grão sutil para evitar faixas no degradê */
  content: ''; position: absolute; inset: 0; opacity: .035; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E");
}
@keyframes drift1 { to { transform: translate(6vw, 5vh) scale(1.08); } }
@keyframes drift2 { to { transform: translate(-7vw, 8vh) scale(.94); } }
@keyframes drift3 { to { transform: translate(5vw, -6vh) scale(1.05); } }
.ctx-flash { position: fixed; inset: 0; z-index: 1; pointer-events: none; background: radial-gradient(circle at 80% 0%, var(--amb-1), transparent 60%); animation: ctxflash 900ms var(--ease) forwards; }
@keyframes ctxflash { from { opacity: .9; } to { opacity: 0; } }

/* =====================================================================
   CAMADA 2 · MATERIAIS DE VIDRO
   glass        → navegação e barra (translúcido, ambiente perceptível)
   glass-strong → menus, notificações, diálogos (mais denso, leitura garantida)
   glass-field  → campo de busca sobre vidro
   ===================================================================== */
.glass, .glass-strong {
  position: relative;
  background: linear-gradient(180deg, var(--glass-sheen), transparent 42%), var(--glass-bg);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
  border: 1px solid var(--glass-border);
  box-shadow: inset 0 1px 0 var(--glass-edge), inset 0 -1px 0 var(--glass-edge-low), var(--glass-shadow);
}
.glass-strong { background: linear-gradient(180deg, var(--glass-sheen), transparent 42%), var(--glass-bg-strong); -webkit-backdrop-filter: blur(calc(var(--glass-blur) + 10px)) saturate(var(--glass-sat)); backdrop-filter: blur(calc(var(--glass-blur) + 10px)) saturate(var(--glass-sat)); }

/* =====================================================================
   ESTRUTURA
   ===================================================================== */
.shell { position: relative; z-index: 2; display: grid; grid-template-columns: calc(var(--sidebar-w) + var(--gap-frame)) minmax(0, 1fr); min-height: 100vh; transition: grid-template-columns var(--dur-slow) var(--ease); }
.shell.collapsed { grid-template-columns: calc(var(--sidebar-w-collapsed) + var(--gap-frame)) minmax(0, 1fr); }

/* ---------- Sidebar: peça flutuante ---------- */
.sidebar {
  position: sticky; top: var(--gap-frame); margin: var(--gap-frame) 0 var(--gap-frame) var(--gap-frame);
  height: calc(100vh - 2 * var(--gap-frame)); border-radius: var(--r-nav); color: var(--nav-text);
  display: flex; flex-direction: column; overflow: hidden; z-index: 30;
}
.sidebar-head { display: flex; flex-direction: column; gap: 10px; padding: 20px 20px 14px; flex-shrink: 0; }
.env-tag { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--nav-muted); }
.env-tag::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--nav-selected-bg); box-shadow: 0 0 0 3px var(--focus-ring); }
.sidebar-nav { flex: 1; overflow-y: auto; padding: 6px 12px 12px; display: flex; flex-direction: column; gap: 2px; scrollbar-width: thin; }
.nav-group-label { font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--nav-muted); padding: 16px 12px 6px; white-space: nowrap; }
.nav-item {
  position: relative; display: flex; align-items: center; gap: 12px; height: 42px; padding: 0 12px; border-radius: 14px;
  text-decoration: none; color: var(--nav-text); font-weight: 500; font-size: 14px; white-space: nowrap;
  border: 1px solid transparent; background: none; cursor: pointer; width: 100%; text-align: left;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease), box-shadow var(--dur) var(--ease), transform var(--dur-fast) var(--ease);
}
.nav-item:hover { background: var(--nav-hover); border-color: var(--glass-border); }
.nav-item:active { transform: scale(.985); }
.nav-item.active {
  background: var(--nav-selected-bg); color: var(--nav-selected-text); font-weight: 600; border-color: transparent;
  box-shadow: var(--nav-selected-shadow), inset 0 1px 0 rgb(255 255 255 / .14);
  animation: navsel var(--dur-slow) var(--ease-spring);
}
@keyframes navsel { from { transform: scale(.96); opacity: .6; } }
.nav-item.parent-open:not(.active) { color: var(--text); font-weight: 600; }
.nav-item svg { flex-shrink: 0; }
.nav-badge { margin-left: auto; font-size: 11px; font-weight: 700; min-width: 22px; height: 20px; padding: 0 7px; border-radius: 999px; display: grid; place-items: center; background: var(--accent-soft); color: var(--on-accent-soft); font-variant-numeric: tabular-nums; }
.nav-item.active .nav-badge { background: color-mix(in srgb, var(--nav-selected-text) 20%, transparent); color: var(--nav-selected-text); }
.dot-badge { display: none; }
/* submenu ligado ao módulo por uma guia vertical */
.nav-sub { position: relative; display: flex; flex-direction: column; gap: 1px; margin: 4px 0 8px 23px; padding-left: 16px; animation: subopen var(--dur-slow) var(--ease); }
.nav-sub::before { content: ''; position: absolute; left: 0; top: 2px; bottom: 10px; width: 1.5px; border-radius: 2px; background: var(--nav-guide); }
@keyframes subopen { from { opacity: 0; transform: translateY(-4px); } }
.nav-sub a { position: relative; font-size: 13.5px; padding: 7px 10px; border-radius: 10px; text-decoration: none; color: var(--nav-muted); transition: background var(--dur), color var(--dur); }
.nav-sub a::before { content: ''; position: absolute; left: -19.5px; top: 50%; width: 8px; height: 8px; margin-top: -4px; border-radius: 50%; background: var(--glass-bg-strong); border: 1.5px solid var(--nav-guide); transition: all var(--dur) var(--ease); }
.nav-sub a:hover { color: var(--nav-text); background: var(--nav-hover); }
.nav-sub a.active { color: var(--text); font-weight: 600; background: var(--nav-hover); }
.nav-sub a.active::before { background: var(--nav-sub-active); border-color: var(--nav-sub-active); box-shadow: 0 0 0 3px var(--focus-ring); }
.sidebar-foot { padding: 10px 12px 12px; border-top: 1px solid var(--border); }
.collapsed .sidebar .nav-label, .collapsed .sidebar .nav-badge, .collapsed .sidebar .nav-sub, .collapsed .sidebar .nav-group-label, .collapsed .sidebar .brand-word, .collapsed .sidebar .env-tag { display: none; }
.collapsed .sidebar .nav-item { justify-content: center; padding: 0; }
.collapsed .sidebar .sidebar-head { align-items: center; padding: 18px 0 10px; }
.collapsed .sidebar .dot-badge { display: block; position: absolute; top: 8px; right: 14px; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 2px var(--glass-bg-strong); }
.collapsed .sidebar .nav-group-sep { display: block; }
.nav-group-sep { display: none; height: 1px; background: var(--border); margin: 8px 10px; }

/* ---------- Área principal e cabeçalho ---------- */
.main { min-width: 0; display: flex; flex-direction: column; padding: 0 var(--gap-frame); }
.header {
  position: sticky; top: var(--gap-frame); z-index: 20; margin-top: var(--gap-frame);
  height: var(--header-h); display: flex; align-items: center; gap: 8px; padding: 0 10px 0 12px; border-radius: 22px;
}
.content { padding: 28px 12px 64px; width: 100%; max-width: 1400px; margin: 0 auto; flex: 1; }
.content.narrow { max-width: 980px; }
.ctx-enter { animation: ctxenter 520ms var(--ease); }
@keyframes ctxenter { from { opacity: 0; filter: blur(6px); transform: translateY(6px); } }
.page-enter { animation: pageenter 320ms var(--ease); }
@keyframes pageenter { from { opacity: 0; transform: translateY(4px); } }

/* ---------- Cabeçalho de página ---------- */
.crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 13px; color: var(--text-muted); margin-bottom: 8px; }
.crumbs a { text-decoration: none; } .crumbs a:hover { color: var(--text); text-decoration: underline; }
.page-head { display: flex; align-items: flex-end; gap: var(--s4); margin-bottom: 24px; flex-wrap: wrap; }
.page-title { font-size: 30px; line-height: 1.15; font-weight: 600; letter-spacing: -0.022em; }
.page-sub { color: var(--text-muted); margin-top: 6px; }
.page-actions { margin-left: auto; display: flex; gap: var(--s2); flex-wrap: wrap; align-items: center; }

/* =====================================================================
   CAMADA 3 · SUPERFÍCIES DE CONTEÚDO
   ===================================================================== */
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); box-shadow: 0 1px 2px rgb(0 0 0 / .03), 0 8px 24px -16px rgb(0 0 0 / .18); }
.card-pad { padding: var(--s6); }
.card-head { display: flex; align-items: center; gap: var(--s3); padding: 16px 22px; border-bottom: 1px solid var(--border); min-height: 58px; }
.card-head h2, .card-head h3 { font-size: 16px; font-weight: 600; }
.card-body { padding: 22px; }
.section-title { font-size: 17px; font-weight: 600; }
.section-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.section-head .link { margin-left: auto; font-size: 13px; font-weight: 600; text-decoration: none; color: var(--text-muted); }
.section-head .link:hover { color: var(--text); }
.interactive { transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease), border-color var(--dur); }
.interactive:hover { transform: translateY(-2px); border-color: var(--border-strong); box-shadow: 0 2px 4px rgb(0 0 0 / .04), 0 16px 32px -18px rgb(0 0 0 / .3); }
.interactive:active { transform: translateY(0) scale(.99); }

/* ---------- Botões ---------- */
.btn {
  height: var(--control-h); padding: 0 18px; border-radius: var(--r-field); border: 1px solid transparent; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: 600; font-size: 14px; white-space: nowrap; text-decoration: none;
  transition: background var(--dur) var(--ease), border-color var(--dur), box-shadow var(--dur), transform var(--dur-fast) var(--ease), opacity var(--dur);
}
.btn:active:not([disabled]) { transform: scale(.975); }
.btn-primary { background: var(--primary); color: var(--on-primary); box-shadow: 0 1px 0 rgb(255 255 255 / .12) inset, 0 6px 14px -8px var(--primary); }
.btn-primary:hover { background: var(--primary-hover); }
.btn-secondary { background: var(--surface-solid); border-color: var(--border-strong); color: var(--text); }
.btn-secondary:hover { border-color: var(--text-subtle); }
.btn-glass { background: var(--glass-field); border-color: var(--glass-border); color: var(--text); box-shadow: inset 0 1px 0 var(--glass-edge); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
.btn-glass:hover { background: var(--glass-bg-strong); }
.btn-ghost { background: transparent; color: var(--text); }
.btn-ghost:hover { background: var(--surface-sunken); }
.btn-danger { background: var(--danger); color: #fff; }
[data-theme='dark'] .btn-danger { color: #1a0a08; }
.btn-sm { height: 34px; padding: 0 12px; font-size: 13px; border-radius: 10px; }
.btn-xs { height: 30px; padding: 0 10px; font-size: 12.5px; border-radius: 9px; }
.btn[disabled] { opacity: .45; cursor: not-allowed; }
.btn-block { width: 100%; }
.icon-btn {
  width: 42px; height: 42px; border-radius: 14px; display: inline-grid; place-items: center; border: 1px solid transparent;
  background: transparent; cursor: pointer; color: var(--text-muted); position: relative; transition: background var(--dur), color var(--dur), transform var(--dur-fast);
}
.icon-btn:hover { background: var(--nav-hover); border-color: var(--glass-border); color: var(--text); }
.icon-btn:active { transform: scale(.94); }
.icon-btn[aria-expanded='true'] { background: var(--glass-bg-strong); border-color: var(--glass-border); color: var(--text); }
.icon-btn .count { position: absolute; top: 5px; right: 5px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 999px; background: var(--danger); color: #fff; font-size: 10px; font-weight: 700; display: grid; place-items: center; box-shadow: 0 0 0 2px var(--glass-bg-strong); }
[data-theme='dark'] .icon-btn .count { color: #1a0a08; }
.spin { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ---------- Badges e chips ---------- */
.badge { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.badge.plain::before { display: none; }
.badge-ok { background: var(--ok-soft); color: var(--ok); } .badge-warn { background: var(--warn-soft); color: var(--warn); }
.badge-danger { background: var(--danger-soft); color: var(--danger); } .badge-info { background: var(--info-soft); color: var(--info); }
.badge-neutral { background: var(--neutral-soft); color: var(--neutral); } .badge-accent { background: var(--accent-soft); color: var(--on-accent-soft); }
.chip { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 6px 0 12px; border-radius: 999px; background: var(--accent-soft); color: var(--on-accent-soft); font-size: 13px; font-weight: 500; animation: pageenter var(--dur) var(--ease); }
.chip button { border: 0; background: none; cursor: pointer; color: inherit; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; }
.chip button:hover { background: color-mix(in srgb, currentColor 14%, transparent); }

/* ---------- Campos ---------- */
.field { display: flex; flex-direction: column; gap: 6px; }
.field label, .label { font-size: 13px; font-weight: 600; color: var(--text); }
.req { color: var(--danger); margin-left: 2px; }
.input, .select, .textarea {
  height: var(--control-h); border: 1px solid var(--border-strong); border-radius: var(--r-field); background: var(--surface-solid);
  padding: 0 14px; width: 100%; transition: border-color var(--dur), box-shadow var(--dur), background var(--dur); outline: none;
}
.input:hover, .select:hover, .textarea:hover { border-color: var(--text-subtle); }
.textarea { height: auto; min-height: 96px; padding: 12px 14px; resize: vertical; }
.input:focus, .select:focus, .textarea:focus { border-color: var(--focus); box-shadow: 0 0 0 4px var(--focus-ring); }
.input[aria-invalid='true'], .select[aria-invalid='true'], .textarea[aria-invalid='true'] { border-color: var(--danger); box-shadow: 0 0 0 3px var(--danger-soft); }
.select { appearance: none; padding-right: 38px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23888' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; }
.help { font-size: 12.5px; color: var(--text-muted); }
.error-msg { font-size: 12.5px; color: var(--danger); display: flex; gap: 6px; align-items: center; font-weight: 500; animation: pageenter var(--dur) var(--ease); }
.input-icon { position: relative; }
.input-icon > svg { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-subtle); pointer-events: none; }
.input-icon > .input { padding-left: 42px; }
.input-icon > .trail { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); }
.form-section { padding: 22px 24px; border-bottom: 1px solid var(--border); }
.form-section:last-child { border-bottom: 0; }
.form-section h3 { font-size: 16px; font-weight: 600; margin-bottom: 2px; display: flex; align-items: center; gap: 10px; }
.form-section .section-desc { color: var(--text-muted); font-size: 13.5px; margin-bottom: 18px; }
.step-num { width: 24px; height: 24px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 12px; font-weight: 700; background: var(--accent-soft); color: var(--on-accent-soft); }
.step-num.done { background: var(--ok-soft); color: var(--ok); }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 16px; }
.form-grid .full { grid-column: 1 / -1; }
.check { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; font-size: 14px; }
.check input { width: 18px; height: 18px; margin: 2px 0 0; accent-color: var(--primary); }
.radio-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.radio-card { border: 1px solid var(--border-strong); border-radius: 12px; padding: 10px 12px; cursor: pointer; display: flex; gap: 8px; align-items: flex-start; font-size: 13.5px; background: var(--surface-solid); transition: all var(--dur); }
.radio-card:hover { border-color: var(--text-subtle); }
.radio-card:has(input:checked) { border-color: var(--primary); background: var(--accent-soft); box-shadow: 0 0 0 3px var(--focus-ring); }
.radio-card input { accent-color: var(--primary); margin-top: 3px; }
.form-actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; padding: 14px 22px; border-top: 1px solid var(--border); background: var(--surface-2); border-radius: 0 0 var(--r-card) var(--r-card); }

/* ---------- Barra de busca e filtros das listas ---------- */
.list-tools { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-bottom: 1px solid var(--border); }
.list-tools .tools-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.list-tools .input-icon { flex: 1 1 300px; max-width: 460px; }
.list-tools .select { width: auto; min-width: 170px; height: 40px; border-radius: 11px; }
.list-tools .input { height: 40px; border-radius: 11px; }
.toolbar { display: flex; gap: var(--s3); flex-wrap: wrap; align-items: center; padding: var(--s4); border-bottom: 1px solid var(--border); }
.toolbar .input-icon { flex: 1 1 280px; max-width: 420px; }
.toolbar .select { width: auto; min-width: 160px; height: 40px; }
.active-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.seg-filter { display: flex; gap: 4px; padding: 4px; border-radius: 14px; background: var(--surface-sunken); overflow-x: auto; scrollbar-width: none; }
.seg-filter button { display: inline-flex; align-items: center; gap: 8px; border: 0; background: transparent; padding: 7px 12px; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-muted); white-space: nowrap; transition: all var(--dur) var(--ease); }
.seg-filter button:hover { color: var(--text); }
.seg-filter button[aria-pressed='true'] { background: var(--surface-solid); color: var(--text); box-shadow: 0 1px 2px rgb(0 0 0 / .06), 0 4px 10px -6px rgb(0 0 0 / .2); }
.seg-filter .n { font-size: 11px; font-variant-numeric: tabular-nums; padding: 1px 7px; border-radius: 999px; background: var(--surface-sunken); }
.seg-filter button[aria-pressed='true'] .n { background: var(--accent-soft); color: var(--on-accent-soft); }

/* ---------- Tabela ---------- */
.table-wrap { overflow-x: auto; }
table.tbl { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 14px; }
.tbl th { text-align: left; font-size: 11.5px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; padding: 11px 16px; border-bottom: 1px solid var(--border); white-space: nowrap; background: var(--surface-2); }
.tbl th.r, .tbl td.r { text-align: right; }
.tbl th button { all: unset; cursor: pointer; display: inline-flex; gap: 4px; align-items: center; }
.tbl th button:hover { color: var(--text); }
.tbl th button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.tbl td { padding: 13px 16px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.tbl tbody tr { cursor: pointer; transition: background var(--dur); }
.tbl tbody tr:hover { background: var(--accent-soft); }
.tbl tbody tr:last-child td { border-bottom: 0; }
.tbl .id-cell { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; letter-spacing: .01em; }
.tbl .truncate { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tbl .row-action { width: 1%; white-space: nowrap; text-align: right; }
.tbl .row-action .btn { opacity: .0; transition: opacity var(--dur); }
.tbl tr:hover .row-action .btn, .tbl tr:focus-within .row-action .btn, .tbl .row-action .btn.always { opacity: 1; }
.tbl tr.flash td { animation: rowflash 2.4s var(--ease); }
@keyframes rowflash { 0%, 30% { background: var(--ok-soft); } 100% { background: transparent; } }
.asset { display: flex; align-items: center; gap: 12px; min-width: 0; }
.asset-ic { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; background: var(--accent-soft); color: var(--on-accent-soft); flex-shrink: 0; }
.person { display: flex; align-items: center; gap: 10px; min-width: 0; }
.pager { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border); font-size: 13px; color: var(--text-muted); }
.mobile-cards { display: none; }
.m-card { display: block; text-decoration: none; padding: 14px 16px; border-bottom: 1px solid var(--border); }
.m-card:last-child { border-bottom: 0; }

/* ---------- Detalhe ---------- */
.hero { padding: 24px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 20px; align-items: center; }
.hero-ic { width: 64px; height: 64px; border-radius: 18px; display: grid; place-items: center; background: var(--accent-soft); color: var(--on-accent-soft); }
.hero-id { font-size: 13px; font-weight: 700; letter-spacing: .08em; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.hero-title { font-size: 28px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.15; margin: 2px 0 8px; }
.facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 1px solid var(--border); }
.fact { padding: 14px 24px; border-right: 1px solid var(--border); min-width: 0; }
.fact:last-child { border-right: 0; }
.fact dt, .kv dt { font-size: 11.5px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
.fact dd { margin: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.detail-head { display: flex; gap: var(--s4); align-items: flex-start; flex-wrap: wrap; margin-bottom: var(--s6); }
.detail-id { font-size: 13px; font-weight: 700; letter-spacing: .06em; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.kv { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px 24px; margin: 0; }
.kv dd { margin: 0; font-weight: 500; overflow-wrap: anywhere; }
.kv-group + .kv-group { margin-top: 22px; padding-top: 22px; border-top: 1px dashed var(--border-strong); }
.kv-group h4 { font-size: 13px; font-weight: 600; color: var(--text-muted); margin-bottom: 14px; }
.layout-detail { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start; }
.layout-form { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start; }
.layout-form .summary { position: sticky; top: calc(var(--header-h) + var(--gap-frame) + 20px); }
.tabs { display: flex; gap: 4px; padding: 6px; margin: 0; overflow-x: auto; border-bottom: 1px solid var(--border); }
.tab { border: 0; background: none; padding: 8px 14px; border-radius: 11px; font-weight: 600; font-size: 14px; color: var(--text-muted); cursor: pointer; white-space: nowrap; display: inline-flex; gap: 8px; align-items: center; transition: all var(--dur) var(--ease); }
.tab:hover { color: var(--text); background: var(--surface-sunken); }
.tab[aria-selected='true'] { color: var(--text); background: var(--accent-soft); }
.tab .tab-count { font-size: 11px; background: var(--surface-sunken); color: var(--text-muted); border-radius: 999px; padding: 1px 7px; }
.tab[aria-selected='true'] .tab-count { background: var(--surface-solid); }

/* ---------- Histórico ---------- */
.timeline { list-style: none; margin: 0; padding: 0; }
.timeline li { display: grid; grid-template-columns: 32px 1fr; gap: 14px; padding-bottom: 18px; position: relative; }
.timeline li::before { content: ''; position: absolute; left: 15px; top: 34px; bottom: 4px; width: 2px; border-radius: 2px; background: var(--border); }
.timeline li:last-child::before { display: none; }
.timeline .dot { width: 32px; height: 32px; border-radius: 11px; background: var(--accent-soft); color: var(--on-accent-soft); display: grid; place-items: center; }
.timeline .when { font-size: 12.5px; color: var(--text-muted); }
.timeline .new { animation: flash 2.2s var(--ease); border-radius: 10px; }
.timeline li:has(.new) .dot { background: var(--ok-soft); color: var(--ok); animation: pop var(--dur-slow) var(--ease-spring); }
@keyframes flash { 0%, 35% { background: var(--ok-soft); } 100% { background: transparent; } }
@keyframes pop { from { transform: scale(.5); } }

/* ---------- Anexos ---------- */
.att { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface-solid); transition: border-color var(--dur), box-shadow var(--dur); }
.att:hover { border-color: var(--border-strong); }
.att + .att { margin-top: 8px; }
.att-icon { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; background: var(--danger-soft); color: var(--danger); flex-shrink: 0; font-size: 10px; font-weight: 700; letter-spacing: .04em; }
.att-icon.png { background: var(--info-soft); color: var(--info); }

/* ---------- Sobreposições (vidro denso) ---------- */
.overlay { position: fixed; inset: 0; background: var(--overlay); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); z-index: 60; display: grid; place-items: center; padding: 16px; animation: fade var(--dur) var(--ease); }
@keyframes fade { from { opacity: 0; } }
@keyframes rise { from { opacity: 0; transform: translateY(10px) scale(.97); } }
@keyframes popin { from { opacity: 0; transform: translateY(-6px) scale(.96); filter: blur(4px); } }
@keyframes slide { from { transform: translateX(28px); opacity: 0; } }
@keyframes slideL { from { transform: translateX(-28px); opacity: 0; } }
.dialog { border-radius: var(--r-dialog); width: min(540px, 100%); max-height: calc(100vh - 32px); overflow: auto; animation: rise var(--dur-slow) var(--ease-spring); }
.dialog.wide { width: min(780px, 100%); } .dialog.xwide { width: min(1000px, 100%); }
.dialog-head { padding: 24px 24px 8px; display: flex; gap: 12px; align-items: flex-start; }
.dialog-head h2 { font-size: 20px; font-weight: 600; }
.dialog-body { padding: 8px 24px 24px; }
.dialog-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 24px 20px; }
.drawer-overlay { position: fixed; inset: 0; background: var(--overlay); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); z-index: 60; animation: fade var(--dur); }
.drawer { position: fixed; right: var(--gap-frame); top: var(--gap-frame); bottom: var(--gap-frame); width: min(400px, calc(100vw - 24px)); z-index: 61; border-radius: var(--r-nav); display: flex; flex-direction: column; animation: slide var(--dur-slow) var(--ease); overflow: hidden; }
.drawer.left { left: var(--gap-frame); right: auto; animation-name: slideL; }
.drawer-head { display: flex; align-items: center; gap: 8px; padding: 14px 16px 14px 20px; border-bottom: 1px solid var(--border); min-height: 64px; }
.drawer-body { flex: 1; overflow-y: auto; padding: 20px; }
.popover { position: absolute; top: calc(100% + 10px); right: 0; z-index: 50; border-radius: 20px; min-width: 260px; animation: popin var(--dur) var(--ease); transform-origin: top right; overflow: hidden; }
.menu-head { padding: 12px 16px 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: var(--text-subtle); }
.menu-item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 14px; border: 0; background: none; cursor: pointer; text-align: left; font-size: 14px; text-decoration: none; color: var(--text); border-radius: 12px; transition: background var(--dur-fast); }
.popover .menu-item { width: calc(100% - 12px); margin: 0 6px; }
.menu-item:hover, .menu-item[data-active='true'] { background: var(--nav-hover); }
.menu-item[aria-checked='true'] { background: var(--accent-soft); }
.menu-sep { height: 1px; background: var(--border); margin: 6px 0; }

/* ---------- Avisos ---------- */
.toasts { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 100; display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none; }
.toast { pointer-events: auto; display: flex; gap: 12px; align-items: center; padding: 12px 14px 12px 14px; border-radius: 18px; font-size: 14px; font-weight: 500; animation: rise var(--dur-slow) var(--ease-spring); max-width: min(600px, calc(100vw - 32px)); color: var(--text); }
.toast .t-ic { width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; background: var(--ok-soft); color: var(--ok); flex-shrink: 0; }
.toast .t-ic.info { background: var(--info-soft); color: var(--info); }
.toast .t-ic svg { animation: pop var(--dur-slow) var(--ease-spring); }
.toast a, .toast button.link { color: inherit; font-weight: 700; background: none; border: 0; cursor: pointer; text-decoration: underline; padding: 0; white-space: nowrap; }

/* ---------- Estados ---------- */
.skel { background: linear-gradient(90deg, var(--surface-sunken) 25%, var(--surface-2) 50%, var(--surface-sunken) 75%); background-size: 200% 100%; animation: shimmer 1.2s infinite; border-radius: 6px; }
@keyframes shimmer { to { background-position: -200% 0; } }
.state { padding: 48px 24px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; }
.state-icon { width: 56px; height: 56px; border-radius: 18px; display: grid; place-items: center; background: var(--surface-sunken); color: var(--text-muted); }
.state h3 { font-size: 17px; font-weight: 600; } .state p { color: var(--text-muted); max-width: 440px; }
.banner { display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px; border-radius: 14px; font-size: 14px; }
.banner-info { background: var(--info-soft); color: var(--info); } .banner-warn { background: var(--warn-soft); color: var(--warn); }
.banner-ok { background: var(--ok-soft); color: var(--ok); } .banner-danger { background: var(--danger-soft); color: var(--danger); }
.banner .b-text { color: var(--text); }
.success-mark { width: 64px; height: 64px; border-radius: 22px; display: grid; place-items: center; background: var(--ok-soft); color: var(--ok); animation: pop var(--dur-slow) var(--ease-spring); }
.success-mark svg path { stroke-dasharray: 30; stroke-dashoffset: 30; animation: draw 500ms 150ms var(--ease) forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }

/* ---------- Início ---------- */
.hello { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
.hello h1 { font-size: 30px; font-weight: 600; letter-spacing: -0.022em; }
.env-chip { display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px 0 6px; border-radius: 999px; font-size: 13px; font-weight: 600; }
.focus-card { position: relative; overflow: hidden; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 18px; align-items: center; padding: 22px 24px; border-radius: 22px; background: var(--nav-selected-bg); color: var(--nav-selected-text); box-shadow: var(--nav-selected-shadow); margin-bottom: 28px; }
.focus-card::after { content: ''; position: absolute; right: -60px; top: -80px; width: 260px; height: 260px; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--nav-selected-text) 18%, transparent), transparent 70%); pointer-events: none; }
.focus-card .f-ic { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; background: color-mix(in srgb, var(--nav-selected-text) 14%, transparent); }
.focus-card .f-k { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; opacity: .75; }
.focus-card .f-t { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; margin: 2px 0; }
.focus-card .f-m { font-size: 13.5px; opacity: .8; }
.focus-card .btn { background: var(--nav-selected-text); color: var(--nav-selected-bg); position: relative; z-index: 1; }
.home-grid { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 20px; align-items: start; }
.work-tabs { display: flex; gap: 4px; padding: 6px; border-bottom: 1px solid var(--border); overflow-x: auto; }
.task { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto auto; gap: 14px; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--border); transition: background var(--dur); }
.task:last-child { border-bottom: 0; }
.task:hover { background: var(--accent-soft); }
.task .t-ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: var(--accent-soft); color: var(--on-accent-soft); }
.task .t-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task .t-meta { font-size: 12.5px; color: var(--text-muted); display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.task .t-due { font-size: 12.5px; font-weight: 600; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.task .t-due.late { color: var(--danger); } .task .t-due.soon { color: var(--warn); }
.work-foot { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 12px 20px; border-top: 1px solid var(--border); font-size: 13px; background: var(--surface-2); border-radius: 0 0 var(--r-card) var(--r-card); }
.work-foot a { text-decoration: none; color: var(--text-muted); font-weight: 600; } .work-foot a:hover { color: var(--text); }
.work-foot a b { color: var(--text); font-variant-numeric: tabular-nums; }
.quick { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.quick a { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 16px; background: var(--surface-solid); border: 1px solid var(--border); text-decoration: none; font-size: 13.5px; font-weight: 600; line-height: 1.3; }
.quick a svg { color: var(--on-accent-soft); }
.mod-mini { display: flex; flex-wrap: wrap; gap: 8px; }
.mod-mini a { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px 0 8px; border-radius: 14px; background: var(--surface-solid); border: 1px solid var(--border); text-decoration: none; font-size: 13.5px; font-weight: 600; }
.mod-mini a .mi { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; background: var(--accent-soft); color: var(--on-accent-soft); }
.mod-mini a .nb { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--warn-soft); color: var(--warn); }
.recent-row { display: grid; grid-template-columns: 34px 1fr auto; gap: 12px; align-items: center; padding: 11px 20px; text-decoration: none; border-bottom: 1px solid var(--border); transition: background var(--dur); }
.recent-row:hover { background: var(--accent-soft); }
.recent-row:last-child { border-bottom: 0; }
.mod-icon { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; background: var(--accent-soft); color: var(--on-accent-soft); flex-shrink: 0; }
.mod-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.mod-tile { position: relative; display: flex; flex-direction: column; gap: 12px; padding: 20px; border-radius: var(--r-card); background: var(--surface); border: 1px solid var(--border); text-decoration: none; min-height: 150px; }
.mod-tile h3 { font-size: 16px; font-weight: 600; } .mod-tile p { font-size: 13.5px; color: var(--text-muted); }
.avatar { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--on-accent-soft); font-size: 12px; font-weight: 700; flex-shrink: 0; }
.avatar.sm { width: 26px; height: 26px; font-size: 10.5px; }
.avatar.lg { width: 56px; height: 56px; font-size: 18px; }

/* ---------- Marca ---------- */
.wordmark { font-weight: 700; letter-spacing: .24em; font-size: 15px; text-transform: uppercase; white-space: nowrap; }
.wordmark.serif { font-family: var(--font-display); font-weight: 400; letter-spacing: .2em; font-size: 20px; }
.monogram { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; font-weight: 700; font-size: 14px; letter-spacing: .02em; flex-shrink: 0; box-shadow: inset 0 1px 0 rgb(255 255 255 / .18), 0 4px 10px -4px rgb(0 0 0 / .35); }
.demo-pill { display: inline-flex; gap: 6px; align-items: center; height: 30px; padding: 0 12px; border-radius: 999px; border: 1px dashed var(--border-strong); color: var(--text-muted); font-size: 12px; font-weight: 600; white-space: nowrap; background: none; cursor: pointer; }
.demo-pill:hover { color: var(--text); border-style: solid; }

/* ---------- Cabeçalho: busca e ambiente ---------- */
.search { position: relative; flex: 1; max-width: 520px; }
.search .input { height: 42px; background: var(--glass-field); border-color: var(--glass-border); border-radius: 14px; padding-right: 64px; text-overflow: ellipsis; box-shadow: inset 0 1px 2px rgb(0 0 0 / .04); }
.search .input:focus { background: var(--glass-bg-strong); }
.search .kbd { pointer-events: none; }
.search-results { position: absolute; top: calc(100% + 10px); left: 0; right: 0; border-radius: 20px; max-height: 70vh; overflow: auto; z-index: 50; animation: popin var(--dur) var(--ease); padding: 6px 0; }
.search-group { padding: 4px 0; }
.search-group + .search-group { border-top: 1px solid var(--border); }
.search-group-label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--text-subtle); font-weight: 700; padding: 8px 16px 4px; }
.kbd { font-size: 11px; border: 1px solid var(--border-strong); border-radius: 6px; padding: 1px 6px; color: var(--text-subtle); font-family: var(--font); }
.env-btn { display: inline-flex; align-items: center; gap: 10px; height: 44px; padding: 0 12px 0 5px; border-radius: 15px; border: 1px solid var(--glass-border); background: var(--glass-field); cursor: pointer; transition: all var(--dur) var(--ease); box-shadow: inset 0 1px 0 var(--glass-edge); }
.env-btn:hover, .env-btn[aria-expanded='true'] { background: var(--glass-bg-strong); }
.env-btn .e-k { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: var(--text-subtle); line-height: 1; }
.env-btn .e-n { font-size: 14px; font-weight: 600; line-height: 1.2; }
.user-btn { display: inline-flex; align-items: center; gap: 10px; height: 44px; padding: 0 10px 0 5px; border-radius: 15px; border: 1px solid transparent; background: none; cursor: pointer; transition: all var(--dur); }
.user-btn:hover, .user-btn[aria-expanded='true'] { background: var(--glass-field); border-color: var(--glass-border); }

/* ---------- Entrada ---------- */
.entry { position: relative; z-index: 2; min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) minmax(420px, 520px); gap: var(--gap-frame); padding: var(--gap-frame); }
.entry-brand { position: relative; overflow: hidden; border-radius: 30px; padding: 48px; display: flex; flex-direction: column; justify-content: space-between; color: var(--art-text); background: var(--art-bg); }
.entry-brand .art-shape { position: absolute; border-radius: 50%; }
.entry-panel { border-radius: 30px; padding: 40px clamp(24px, 4vw, 48px); display: flex; flex-direction: column; }
.entry-panel .inner { width: 100%; max-width: 400px; margin: auto; }
.ms-btn { display: flex; align-items: center; justify-content: center; gap: 12px; width: 100%; height: 50px; border-radius: 14px; border: 1px solid var(--border-strong); background: var(--surface-solid); font-weight: 600; font-size: 15px; cursor: pointer; transition: all var(--dur); }
.ms-btn:hover { border-color: var(--text-subtle); box-shadow: 0 6px 16px -10px rgb(0 0 0 / .4); }
.ms-btn:active { transform: scale(.985); }
.account { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface-solid); cursor: pointer; text-align: left; transition: all var(--dur); }
.account:hover { border-color: var(--border-strong); background: var(--surface-2); }
.account + .account { margin-top: 8px; }
.env-card { display: grid; grid-template-columns: auto 1fr auto; gap: 14px; align-items: center; width: 100%; padding: 16px; border-radius: 18px; border: 1px solid var(--border); background: var(--surface-solid); cursor: pointer; text-align: left; transition: all var(--dur) var(--ease); }
.env-card + .env-card { margin-top: 10px; }
.env-card:hover { border-color: var(--border-strong); transform: translateY(-1px); box-shadow: 0 10px 24px -16px rgb(0 0 0 / .4); }
.env-card[aria-pressed='true'] { border-color: var(--primary); box-shadow: 0 0 0 4px var(--focus-ring); }
.env-swatch { display: flex; gap: 3px; }
.env-swatch i { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgb(0 0 0 / .1); }

/* ---------- Apresentador ---------- */
.presenter-fab { display: none; position: fixed; right: 16px; bottom: 16px; z-index: 55; height: 44px; padding: 0 16px; border-radius: 999px; gap: 8px; align-items: center; font-weight: 600; font-size: 13px; cursor: pointer; color: var(--text); }
.seg { display: inline-flex; background: var(--surface-sunken); border-radius: 12px; padding: 3px; gap: 2px; width: 100%; }
.seg button { flex: 1; white-space: nowrap; border: 0; background: transparent; padding: 7px 8px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text-muted); transition: all var(--dur); }
.seg button[aria-pressed='true'] { background: var(--surface-solid); color: var(--text); box-shadow: 0 1px 3px rgb(0 0 0 / .12); }
.script-step { display: grid; grid-template-columns: 54px 1fr; gap: 8px; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.script-step:last-child { border-bottom: 0; }

/* ---------- Diversos ---------- */
.stat { padding: 18px 20px; } .stat .v { font-size: 28px; font-weight: 600; font-variant-numeric: tabular-nums; } .stat .k { font-size: 13px; color: var(--text-muted); font-weight: 500; }
.bar { height: 8px; border-radius: 999px; background: var(--surface-sunken); overflow: hidden; }
.bar > span { display: block; height: 100%; background: var(--accent); border-radius: inherit; }
.checklist { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
.checklist li { display: flex; gap: 8px; align-items: center; }
.ok-ic { color: var(--ok); } .warn-ic { color: var(--warn); } .danger-ic { color: var(--danger); }
.leg { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; padding: 16px 20px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface-solid); }
.leg + .leg { margin-top: 8px; }
.leg .city { font-size: 24px; font-weight: 600; letter-spacing: .02em; }
.slot-grid { display: grid; gap: 4px; }
.slot { height: 44px; border-radius: 10px; border: 1px dashed var(--border-strong); background: transparent; cursor: pointer; font-size: 12px; color: var(--text-subtle); padding: 0 8px; text-align: left; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; transition: all var(--dur); }
.slot:hover { border-style: solid; border-color: var(--accent); color: var(--text); background: var(--surface-solid); }
.slot.busy { background: var(--accent-soft); border: 1px solid transparent; color: var(--on-accent-soft); font-weight: 600; cursor: default; }
.slot.mine { background: var(--primary); color: var(--on-primary); cursor: pointer; }
.slot.cancel { text-decoration: line-through; opacity: .6; }
.steps { display: flex; gap: 8px; flex-direction: column; }
.step { display: flex; gap: 12px; align-items: center; font-size: 14px; }
.step .ic { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: var(--surface-sunken); color: var(--text-muted); transition: all var(--dur); }
.step.done .ic { background: var(--ok-soft); color: var(--ok); }
.step.run .ic { background: var(--accent-soft); color: var(--on-accent-soft); }
.doc-paper { background: #fff; color: #1b1b1f; border-radius: 6px; box-shadow: 0 1px 3px rgb(0 0 0 / .2); padding: 48px 56px; font-size: 13px; line-height: 1.6; max-width: 640px; margin: 0 auto; font-family: var(--font); }
.doc-paper h1 { font-size: 18px; margin-bottom: 4px; }
.doc-paper table { width: 100%; border-collapse: collapse; margin: 12px 0; }
.doc-paper td { border: 1px solid #ddd; padding: 6px 8px; }
.doc-wrap { background: var(--surface-sunken); padding: 24px; border-radius: 14px; max-height: 64vh; overflow: auto; }
.flow { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; gap: 10px; align-items: stretch; }
.flow .node { padding: 14px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface-solid); font-size: 13px; }
.flow .node b { display: block; margin-bottom: 6px; font-size: 13.5px; }
.flow .arrow { display: grid; place-items: center; color: var(--text-subtle); }
.flow .node.new { border-color: var(--primary); box-shadow: 0 0 0 3px var(--focus-ring); }

/* =====================================================================
   RESPONSIVO
   ===================================================================== */
.only-mobile { display: none !important; }
@media (max-width: 1180px) {
  .layout-detail, .layout-form, .home-grid { grid-template-columns: 1fr; }
  .layout-form .summary { position: static; }
  .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fact:nth-child(2) { border-right: 0; } .fact:nth-child(-n+2) { border-bottom: 1px solid var(--border); }
}
@media (max-width: 1024px) {
  .shell, .shell.collapsed { grid-template-columns: calc(var(--sidebar-w-collapsed) + var(--gap-frame)) minmax(0, 1fr); }
  .sidebar.desktop .nav-label, .sidebar.desktop .nav-badge, .sidebar.desktop .nav-sub, .sidebar.desktop .nav-group-label, .sidebar.desktop .brand-word, .sidebar.desktop .env-tag, .sidebar.desktop .collapse-btn { display: none; }
  .sidebar.desktop .nav-item { justify-content: center; padding: 0; }
  .sidebar.desktop .dot-badge { display: block; position: absolute; top: 8px; right: 14px; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
  .sidebar.desktop .sidebar-head { align-items: center; padding: 18px 0 10px; }
  .sidebar.desktop .nav-group-sep { display: block; }
  .user-btn .u-name { display: none; }
}
@media (max-width: 760px) {
  :root { --gap-frame: 8px; }
  .shell, .shell.collapsed { grid-template-columns: minmax(0, 1fr); }
  .sidebar.desktop { display: none; }
  .only-mobile { display: inline-grid !important; }
  .hide-mobile { display: none !important; }
  .header { gap: 4px; padding: 0 6px; border-radius: 18px; height: 58px; }
  .search .input { padding-right: 12px; }
  .env-btn { padding: 0 8px 0 4px; gap: 6px; } .env-btn .e-txt { display: none; }
  .content { padding: 20px 4px 100px; }
  .page-title, .hello h1 { font-size: 26px; }
  .page-actions { margin-left: 0; width: 100%; }
  .page-actions .btn { flex: 1; }
  .grid-2, .grid-3, .form-grid, .radio-cards, .quick { grid-template-columns: 1fr; }
  .quick { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .table-wrap.responsive { display: none; }
  .mobile-cards { display: block; }
  .card-body, .form-section, .card-pad { padding: 16px; }
  .card-head { padding: 12px 16px; }
  .list-tools .select { flex: 1 1 140px; min-width: 0; }
  .list-tools .input-icon { max-width: none; }
  .entry { grid-template-columns: 1fr; }
  .entry-brand { display: none; }
  .entry-panel { padding: 28px 20px; min-height: calc(100vh - 16px); }
  .form-actions.sticky { position: fixed; left: 8px; right: 8px; bottom: 8px; z-index: 25; border-radius: 20px; border: 1px solid var(--glass-border); background: var(--glass-bg-strong); -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px); box-shadow: var(--glass-shadow); }
  .form-actions.sticky .btn { flex: 1; }
  .presenter-fab { display: flex; bottom: 16px; right: 12px; height: 42px; padding: 0 12px; }
  .presenter-fab .lbl { display: none; }
  .has-sticky .presenter-fab { bottom: 92px; }
  .hero { grid-template-columns: auto minmax(0, 1fr); padding: 18px; }
  .hero > .hero-actions { grid-column: 1 / -1; display: flex; gap: 8px; }
  .hero > .hero-actions .btn { flex: 1; }
  .hero-ic { width: 52px; height: 52px; }
  .hero-title { font-size: 22px; }
  .fact { padding: 12px 16px; }
  .focus-card { grid-template-columns: auto minmax(0, 1fr); padding: 18px; }
  .focus-card .btn { grid-column: 1 / -1; }
  .task { grid-template-columns: 36px minmax(0, 1fr) auto; padding: 12px 14px; }
  .task .t-act { grid-column: 2 / -1; justify-self: start; }
  .leg .city { font-size: 20px; }
  .dialog-foot { flex-wrap: wrap; } .dialog-foot .btn { flex: 1; }
  .doc-paper { padding: 24px; }
  .flow { grid-template-columns: 1fr; } .flow .arrow { transform: rotate(90deg); }
  .toasts { bottom: 96px; }
}
.only-mobile-flex { display: none !important; }
.m-card.flash { animation: flash 2.2s var(--ease); }
@media (max-width: 760px) { .only-mobile-flex { display: flex !important; } }

/* monogramas legíveis sobre vidro escuro */
[data-theme='dark'] .monogram-azime { background: #fafafa !important; color: #0b0b0c !important; }
[data-theme='dark'] .monogram-alinare { background: #f0ebe4 !important; color: #242741 !important; }
.header .spacer { flex: .15; }

/* O cabeçalho hospeda menus de vidro: o material dele fica num pseudo-elemento para não criar
   um "backdrop root" — assim busca, ambientes e notificações desfocam a página por trás. */
.header.glass { background: none; -webkit-backdrop-filter: none; backdrop-filter: none; isolation: isolate; }
.header.glass::before {
  content: ''; position: absolute; inset: 0; border-radius: inherit; z-index: -1; pointer-events: none;
  background: linear-gradient(180deg, var(--glass-sheen), transparent 42%), var(--glass-bg);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat)); backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
}
.layout-detail > *, .layout-form > *, .home-grid > *, .main, .content > * { min-width: 0; }
@media (max-width: 760px) { .toast { width: calc(100vw - 24px); } .tabs { margin: 0; } }
@media (max-width: 760px) { .hero > .hero-actions { flex-wrap: wrap; } .hero > .hero-actions .btn { flex: 1 1 140px; } }

/* ---------- Novitah Dark V2 — somente esta combinação de marca e tema ---------- */
[data-brand='novitah'][data-theme='dark'] .card,
[data-brand='novitah'][data-theme='dark'] .focus-card,
[data-brand='novitah'][data-theme='dark'] .interactive:hover,
[data-brand='novitah'][data-theme='dark'] .ms-btn:hover,
[data-brand='novitah'][data-theme='dark'] .env-card:hover,
[data-brand='novitah'][data-theme='dark'] .seg-filter button[aria-pressed='true'],
[data-brand='novitah'][data-theme='dark'] .seg button[aria-pressed='true'] {
  box-shadow: var(--glass-shadow);
}
[data-brand='novitah'][data-theme='dark'] .focus-card {
  background: var(--attention-surface); color: var(--text);
  box-shadow: inset 0 0 0 1px var(--accent-attention), var(--glass-shadow);
}
[data-brand='novitah'][data-theme='dark'] .focus-card .btn {
  background: var(--primary); color: var(--on-primary);
  border-color: var(--border-strong);
}
[data-brand='novitah'][data-theme='dark'] .nav-item.active {
  border-color: var(--border-strong);
}
[data-brand='novitah'][data-theme='dark'] .nav-sub a { color: var(--nav-text); }
[data-brand='novitah'][data-theme='dark'] .icon-btn { color: var(--text); }
[data-brand='novitah'][data-theme='dark'] .btn-primary {
  border-color: var(--border-strong);
}
[data-brand='novitah'][data-theme='dark'] .btn-danger,
[data-brand='novitah'][data-theme='dark'] .icon-btn .count {
  background: var(--danger-soft); color: var(--text);
  border-color: var(--border-strong);
}
[data-brand='novitah'][data-theme='dark'] .icon-btn .count {
  box-shadow: 0 0 0 1px var(--border-strong);
}
[data-brand='novitah'][data-theme='dark'] .monogram {
  box-shadow: inset 0 1px 0 var(--glass-edge), var(--glass-shadow);
}
[data-brand='novitah'][data-theme='dark'] .search .input {
  box-shadow: inset 0 1px 2px rgb(164 111 105 / .08);
}
[data-brand='novitah'][data-theme='dark'] .env-swatch i {
  border-color: var(--divider);
}
/* O módulo aplica --attention-surface, --accent-attention, --surface-icon,
   --chart-line, --chart-fill e --chart-grid nos componentes reais existentes.
   Revisar cores locais, SVGs e configurações de gráficos; preservar os dados.
   Papel/documentos e logotipos oficiais não são recoloridos por este override. */

```

## Anexo E Catálogo de componentes por arquivo

| Arquivo e linha | Componente ou função |
| --- | --- |
| `src/layout/AppShell.tsx:15` | `AppShell` |
| `src/layout/AppShell.tsx:58` | `ModuleGate` |
| `src/layout/Header.tsx:14` | `useClickOutside` |
| `src/layout/Header.tsx:37` | `useSwitchCompany` |
| `src/layout/Header.tsx:78` | `EnvironmentSwitcher` |
| `src/layout/Header.tsx:111` | `Notifications` |
| `src/layout/Header.tsx:166` | `UserMenu` |
| `src/layout/Header.tsx:199` | `GlobalSearch` |
| `src/layout/Header.tsx:268` | `Header` |
| `src/layout/Presenter.tsx:25` | `PresenterPanel` |
| `src/layout/Sidebar.tsx:13` | `useMenuAllowed` |
| `src/layout/Sidebar.tsx:18` | `SidebarNav` |
| `src/layout/Sidebar.tsx:91` | `Sidebar` |
| `src/modules/admin/Acessos.tsx:17` | `AcessosList` |
| `src/modules/admin/Acessos.tsx:62` | `AcessoNovo` |
| `src/modules/admin/Acessos.tsx:159` | `AcessoDetail` |
| `src/modules/admin/Colaboradores.tsx:20` | `ColaboradoresList` |
| `src/modules/admin/Colaboradores.tsx:91` | `ColaboradorDetail` |
| `src/modules/admin/Exportacoes.tsx:20` | `Exportacoes` |
| `src/modules/admin/Perfis.tsx:16` | `Perfis` |
| `src/modules/admin/Plugins.tsx:18` | `PluginCatalog` |
| `src/modules/admin/Plugins.tsx:55` | `PluginDetail` |
| `src/modules/admin/Plugins.tsx:142` | `InstallFlow` |
| `src/modules/inventario/CadastroForm.tsx:15` | `CadastroForm` |
| `src/modules/inventario/EntregaForm.tsx:16` | `EntregaForm` |
| `src/modules/inventario/EquipamentoDetail.tsx:17` | `EquipamentoDetail` |
| `src/modules/inventario/EquipamentosList.tsx:14` | `EquipamentosList` |
| `src/modules/inventario/InventarioExtras.tsx:11` | `Movimentacoes` |
| `src/modules/inventario/InventarioExtras.tsx:48` | `Manutencoes` |
| `src/modules/inventario/InventarioExtras.tsx:80` | `Relatorios` |
| `src/modules/reservas/index.tsx:16` | `ReservasPage` |
| `src/modules/reverso/NovaSolicitacao.tsx:12` | `NovaSolicitacao` |
| `src/modules/reverso/SolicitacaoDetail.tsx:17` | `SolicitacaoDetail` |
| `src/modules/reverso/SolicitacaoDetail.tsx:189` | `Progress` |
| `src/modules/reverso/SolicitacoesList.tsx:15` | `SolicitacoesList` |
| `src/modules/viagens/CompraExterna.tsx:17` | `CompraExterna` |
| `src/modules/viagens/MinhasViagens.tsx:12` | `MinhasViagens` |
| `src/modules/viagens/ViagemDetail.tsx:14` | `ViagemDetail` |
| `src/pages/Entrada.tsx:13` | `MicrosoftMark` |
| `src/pages/Entrada.tsx:22` | `BrandPanel` |
| `src/pages/Entrada.tsx:43` | `Frame` |
| `src/pages/Entrada.tsx:68` | `Login` |
| `src/pages/Entrada.tsx:197` | `Recuperar` |
| `src/pages/Entrada.tsx:211` | `Convite` |
| `src/pages/Inicio.tsx:12` | `greeting` |
| `src/pages/Inicio.tsx:17` | `dueInfo` |
| `src/pages/Inicio.tsx:28` | `Inicio` |
| `src/pages/NotFound.tsx:6` | `Block` |
| `src/pages/NotFound.tsx:19` | `NotFoundInline` |
| `src/pages/NotFound.tsx:30` | `ForbiddenInline` |
| `src/pages/NotFound.tsx:39` | `ModuleUnavailable` |
| `src/pages/NotFound.tsx:53` | `NotFoundPage` |
| `src/pages/Pendencias.tsx:9` | `Pendencias` |
| `src/pages/Preferencias.tsx:9` | `Preferencias` |
| `src/platform/hooks.tsx:11` | `useUnsavedGuard` |
| `src/platform/hooks.tsx:37` | `useUrlState` |
| `src/platform/hooks.tsx:63` | `useSort` |
| `src/platform/hooks.tsx:76` | `useRecordVisit` |
| `src/platform/hooks.tsx:98` | `goBackOr` |
| `src/platform/hooks.tsx:105` | `useTrackNavDepth` |
| `src/platform/store.tsx:12` | `load` |
| `src/platform/store.tsx:20` | `save` |
| `src/platform/store.tsx:53` | `DemoProvider` |
| `src/platform/store.tsx:129` | `useDemo` |
| `src/ui/brand.tsx:14` | `Monogram` |
| `src/ui/brand.tsx:27` | `Wordmark` |
| `src/ui/brand.tsx:34` | `Logo` |
| `src/ui/brand.tsx:44` | `Ambient` |
| `src/ui/core.tsx:10` | `Badge` |
| `src/ui/core.tsx:14` | `PageHeader` |
| `src/ui/core.tsx:41` | `Avatar` |
| `src/ui/core.tsx:45` | `Field` |
| `src/ui/core.tsx:57` | `KV` |
| `src/ui/core.tsx:67` | `Tabs` |
| `src/ui/core.tsx:80` | `useEscape` |
| `src/ui/core.tsx:90` | `Dialog` |
| `src/ui/core.tsx:117` | `Drawer` |
| `src/ui/core.tsx:135` | `Confirm` |
| `src/ui/core.tsx:150` | `EmptyState` |
| `src/ui/core.tsx:160` | `NoResults` |
| `src/ui/core.tsx:167` | `ErrorState` |
| `src/ui/core.tsx:177` | `SkeletonRows` |
| `src/ui/core.tsx:190` | `useSimLoad` |
| `src/ui/core.tsx:205` | `Pager` |
| `src/ui/core.tsx:218` | `BackToList` |
| `src/ui/export.tsx:11` | `useCanExport` |
| `src/ui/export.tsx:17` | `ExportButton` |
| `src/ui/records.tsx:10` | `Timeline` |
| `src/ui/records.tsx:29` | `AttachmentList` |
| `src/ui/records.tsx:55` | `DocViewer` |
| `src/ui/toast.tsx:7` | `ToastProvider` |

## Anexo F Exceções locais de interface

Os valores locais abaixo completam o CSS compartilhado. Cada bloco transcreve as linhas que contêm `style=` no respectivo arquivo. Para o JSX completo e as expressões que se estendem por mais de uma linha, usar o projeto original preservado. Não tratar uma expressão condicional como valor permanente do componente.

### src/layout/AppShell.tsx

```tsx
48: <div style={{ margin: -12 }}><SidebarNav onNavigate={() => setMobileNav(false)} /></div>
```

### src/layout/Header.tsx

```tsx
86: <div ref={ref} style={{ position: 'relative' }}>
89: <span className="e-txt" style={{ textAlign: 'left' }}><span className="e-k" style={{ display: 'block' }}>Ambiente</span><span className="e-n">{COMPANIES[company].name}</span></span>
90: {many && <ChevronDown size={16} className="muted" style={{ transition: 'transform var(--dur)', transform: open ? 'rotate(180deg)' : undefined }} />}
93: <div className="popover glass-strong" role="menu" style={{ minWidth: 300, paddingBottom: 6 }}>
98: <span style={{ flex: 1 }}><span className="strong" style={{ display: 'block' }}>{COMPANIES[b].name}</span><span className="xs muted">{COMPANIES[b].tagline}</span></span>
99: <span className="env-swatch" aria-hidden>{COMPANIES[b].swatches.map((c) => <i key={c} style={{ background: c }} />)}</span>
103: <p className="xs muted" style={{ padding: '8px 16px 6px' }}>A tela atual é mantida quando existir no outro ambiente.</p>
133: <button key={n.id} className="menu-item" style={{ alignItems: 'flex-start' }} onClick={() => openN(n.id, n.link, n.companyId)}>
134: <span className="mod-icon" style={{ width: 34, height: 34, borderRadius: 11 }}><m.icon size={16} /></span>
135: <span style={{ flex: 1, minWidth: 0 }}>
136: <span style={{ display: 'block', fontWeight: n.read ? 500 : 700 }}>{n.title}</span>
137: <span className="xs muted" style={{ display: 'block' }}>{n.subject}</span>
140: {!n.read && <span aria-label="Não lida" style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--accent)', marginTop: 6, flexShrink: 0 }} />}
147: <div ref={ref} style={{ position: 'relative' }}>
152: <div className="popover glass-strong" style={{ width: 'min(400px, calc(100vw - 24px))', right: -50 }}>
153: <div className="row" style={{ padding: '14px 16px 8px' }}>
157: <div style={{ maxHeight: 440, overflowY: 'auto', paddingBottom: 6 }}>
158: {list.length === 0 ? <p className="muted small" style={{ padding: 20 }}>Nenhuma notificação.</p> : <><Group title="Recentes" items={recent} /><Group title="Anteriores" items={older} /></>}
174: <div ref={ref} style={{ position: 'relative' }}>
177: <span className="u-name hide-mobile" style={{ textAlign: 'left', lineHeight: 1.2 }}><span className="strong small" style={{ display: 'block' }}>{me.name.split(' ')[0]}</span><span className="xs muted">{role}</span></span>
180: <div className="popover glass-strong" role="menu" style={{ paddingBottom: 6 }}>
181: <div style={{ padding: '16px 16px 10px' }} className="row">
241: <span className="trail kbd hide-mobile" style={{ right: 12 }}>Ctrl K</span>
245: {groups.length === 0 ? <p className="small muted" style={{ padding: 16 }}>Nenhum resultado para “{q}” nos módulos que você acessa neste ambiente.</p> : groups.map((g) => {
253: <button key={it.to} role="option" aria-selected={idx === active} className="menu-item" data-active={idx === active} onMouseEnter={() => setActive(idx)} onClick={() => go(it.to)} style={{ width: 'calc(100% - 12px)', margin: '0 6px' }}>
254: <span className="mod-icon" style={{ width: 32, height: 32, borderRadius: 10 }}><m.icon size={15} /></span>
255: <span style={{ minWidth: 0 }}><span className="strong" style={{ display: 'block' }}>{it.title}</span><span className="xs muted">{it.sub}</span></span>
```

### src/layout/Presenter.tsx

```tsx
44: <div className="stack" style={{ gap: 22 }}>
46: <div className="label" style={{ marginBottom: 8 }}>Perfil</div>
52: <div className="label" style={{ marginBottom: 8 }}>Ambiente</div>
58: <div className="label" style={{ marginBottom: 8 }}>Aparência</div>
65: <div className="label" style={{ marginBottom: 8 }}>Estados e acessibilidade</div>
67: {(['normal', 'carregando', 'erro', 'vazio'] as SimMode[]).map((m) => <button key={m} aria-pressed={session.sim === m} onClick={() => setSession({ sim: m })} style={{ textTransform: 'capitalize' }}>{m}</button>)}
69: <label className="check small" style={{ marginTop: 12 }}>
73: <label className="check small" style={{ marginTop: 8 }}><input type="checkbox" checked={!!session.reduceTransparency} onChange={(e) => setSession({ reduceTransparency: e.target.checked })} />Reduzir transparência</label>
74: <label className="check small" style={{ marginTop: 8 }}><input type="checkbox" checked={!!session.reduceMotion} onChange={(e) => setSession({ reduceMotion: e.target.checked })} />Reduzir movimento</label>
75: <p className="xs muted" style={{ marginTop: 8 }}>Edição pendente: preencha um formulário e tente sair ou trocar de ambiente.</p>
78: <div className="label" style={{ marginBottom: 4 }}>Roteiro da reunião</div>
85: {(s.to || s.user) && <button className="btn btn-ghost btn-sm" style={{ marginTop: 4, marginLeft: -12 }} onClick={() => go(s)}>Preparar e abrir<ArrowRight size={14} /></button>}
86: {i === SCRIPT.length - 1 && <div className="row xs muted" style={{ marginTop: 4 }}><Smartphone size={13} />360 / 390 px · <Monitor size={13} />1280 / 1440 px</div>}
92: <div className="label" style={{ marginBottom: 8 }}>Telas de entrada</div>
```

### src/layout/Sidebar.tsx

```tsx
66: <div className="nav-group-label"><Star size={11} style={{ verticalAlign: '-1px' }} /> Favoritos</div><div className="nav-group-sep" />
71: {plugins.length === 0 && <p className="xs nav-label" style={{ color: 'var(--nav-muted)', padding: '0 12px' }}>Nenhum módulo liberado.</p>}
```

### src/modules/admin/Acessos.tsx

```tsx
125: <div className="seg" role="group" aria-label="Módulo" style={{ width: 'auto', alignSelf: 'flex-start', flexWrap: 'wrap' }}>
147: <div className="card-body stack" style={{ gap: 12 }}>
150: <div className="banner banner-info"><ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 2 }} /><span className="b-text small">Segue para a TI. Você acompanha em Meu trabalho.</span></div>
152: <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={() => nav(-1)}>Cancelar</button><button className="btn btn-primary" style={{ flex: 1 }}><Send size={16} />Enviar para a TI</button></div>
203: sub={<span className="row-wrap" style={{ gap: 10 }}><Badge tone={AR_STATUS[a.status].tone}>{AR_STATUS[a.status].label}</Badge><span className="small muted">Solicitado por {userName(a.requesterId)} em {fmtDateTime(a.criadoEm)} · {COMPANIES[a.companyId].name}</span></span>}
212: <div className="label" style={{ marginBottom: 14 }}>Alteração solicitada</div>
214: <div className="att" style={{ alignItems: 'flex-start' }}><div><div className="xs muted strong">HOJE</div><div className="small" style={{ marginTop: 6 }}>{before ? <>{before.actions.map((x) => actionLabel(a.module, x)).join(', ')}<div className="xs muted">{SCOPE_LABEL[before.scope]}</div></> : <span className="muted">Sem acesso a {moduleName(a.module)}</span>}</div></div></div>
215: <div className="att" style={{ alignItems: 'flex-start', borderColor: 'var(--primary)' }}><div><div className="xs muted strong">APÓS APLICAR</div><div className="small" style={{ marginTop: 6 }}>{Array.from(new Set([...(a.status === 'aplicada' ? [] : before?.actions ?? []), ...a.actions])).map((x) => actionLabel(a.module, x)).join(', ')}<div className="xs muted">{SCOPE_LABEL[a.scope]} · permissão individual</div></div></div></div>
217: <div style={{ marginTop: 18 }}><div className="label" style={{ marginBottom: 6 }}>Justificativa do líder</div><p>{a.justificativa}</p></div>
218: {a.obs && <div style={{ marginTop: 14 }}><div className="label" style={{ marginBottom: 6 }}>Observação da TI</div><p>{a.obs}</p></div>}
223: <div className="label" style={{ marginBottom: 12 }}>Colaborador</div>
224: <div className="row" style={{ gap: 12 }}><Avatar name={target.name} /><div><Link to={`/admin/colaboradores/${target.id}`} className="strong">{target.name}</Link><div className="xs muted">{target.sector}</div></div></div>
225: <p className="xs muted" style={{ marginTop: 16 }}>Regra: líderes solicitam, a TI aplica. A permissão individual soma-se às do perfil e pode ser revista na ficha do colaborador.</p>
```

### src/modules/admin/Colaboradores.tsx

```tsx
65: <td><div className="person"><Avatar name={u.name} /><div><Link to={`/admin/colaboradores/${u.id}`} className="strong" style={{ textDecoration: 'none' }} onClick={(e) => e.stopPropagation()}>{u.name}</Link><div className="xs muted">{u.email}</div></div></div></td>
68: <td className="small"><div className="truncate" style={{ maxWidth: 200 }}>{u.roles.map((r) => ROLE_LABEL[r]).join(', ')}{u.grants && Object.keys(u.grants).length ? <span className="xs muted"> · + individual</span> : ''}</div></td>
79: <div className="row"><Avatar name={u.name} /><div style={{ flex: 1 }}><div className="strong">{u.name}</div><div className="xs muted">{u.sector} · {u.companies.map((c) => COMPANIES[c].name).join(', ')}</div></div><Badge tone={USER_STATUS[u.status].tone}>{USER_STATUS[u.status].label}</Badge></div>
121: title={<span className="row" style={{ gap: 16 }}><Avatar name={u.name} lg />{u.name}</span>}
122: sub={<span className="row-wrap" style={{ gap: 10 }}><Badge tone={USER_STATUS[u.status].tone}>{USER_STATUS[u.status].label}</Badge><span className="small muted">{u.email} · conta Microsoft · {u.sector}</span></span>}
133: <div className="card-head"><h2>Permissões por ambiente</h2><span className="xs muted" style={{ marginLeft: 'auto' }}>Perfil + individual</span></div>
138: <div className="label" style={{ marginBottom: 8 }}>{COMPANIES[b].name}</div>
139: <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 12 }}>
140: <table className="tbl" style={{ fontSize: 13 }}>
146: <tr key={m.id + s.source} style={{ cursor: 'default' }}>
160: {changed && <p className="xs" style={{ color: 'var(--info)' }}>Prévia considerando as alterações não salvas.</p>}
168: <div className="row-wrap" style={{ gap: 18 }}>{(Object.keys(COMPANIES) as BrandId[]).map((b) => <label key={b} className="check"><input type="checkbox" checked={c.includes(b)} onChange={() => setCompanies(toggle(c, b))} />{COMPANIES[b].name}</label>)}</div>
184: {!isTI && <div className="banner banner-info"><ShieldCheck size={18} style={{ flexShrink: 0, marginTop: 2 }} /><span className="b-text small">Alterações de acesso são aplicadas pela TI a partir de solicitações dos líderes.</span></div>}
```

### src/modules/admin/Exportacoes.tsx

```tsx
46: <label className="check" style={{ fontWeight: 600 }}><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />Permitir exportação de {moduleName(mod)}</label>
48: <fieldset disabled={!draft.enabled} style={{ border: 0, margin: 0, padding: 0, opacity: draft.enabled ? 1 : .5, transition: 'opacity var(--dur)' }}>
50: <div className="row-wrap" style={{ gap: 18 }}>{FORMATS.map((f) => <label key={f} className="check"><input type="checkbox" checked={draft.formats.includes(f)} onChange={() => setDraft({ ...draft, formats: toggle(draft.formats, f) })} />{f}</label>)}</div>
57: <label className="check" style={{ marginTop: 16 }}><input type="checkbox" checked={draft.includeHistory} onChange={(e) => setDraft({ ...draft, includeHistory: e.target.checked })} />Incluir histórico de cada registro</label>
67: <div className="row strong" style={{ marginBottom: 12 }}><ShieldCheck size={18} />Preservação de registros</div>
```

### src/modules/admin/Perfis.tsx

```tsx
59: <div className="banner banner-info" style={{ marginBottom: 16 }}>
60: <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: 2 }} />
94: <div className="form-section" style={{ background: 'var(--surface-2)' }}>
96: <ul className="checklist" style={{ marginTop: 8 }}>{diff.map((d) => <li key={d} className="strong">{d}</li>)}</ul>
108: <table className="tbl" style={{ fontSize: 12.5 }}>
112: <tr key={r} style={{ cursor: 'pointer', background: r === role ? 'var(--accent-soft)' : undefined }} onClick={() => setRole(r)}>
120: <p className="xs muted" style={{ padding: '10px 16px' }}>Número de ações por módulo. Passe o cursor para ver detalhes.</p>
124: <div className="card-body" style={{ maxHeight: 360, overflowY: 'auto' }}><Timeline events={data.events.filter((e) => e.module === 'admin').slice(-8)} /></div>
```

### src/modules/admin/Plugins.tsx

```tsx
40: <div className="row xs muted" style={{ marginTop: 'auto' }}>
79: title={<span className="row" style={{ gap: 14 }}><span className="mod-icon"><m.icon size={22} /></span>{m.name}</span>}
80: sub={<span className="row-wrap" style={{ gap: 10 }}><Badge tone={PSTATUS[s.status].tone}>{PSTATUS[s.status].label}</Badge>{s.maintenance && <Badge tone="warn">Em manutenção</Badge>}<span className="small muted tnum">Versão {s.version}</span></span>}
90: <div className="card"><div className="card-head"><h2>Como passa a integrar a plataforma</h2><span className="xs muted" style={{ marginLeft: 'auto' }}>Manifesto v{s.version}</span></div>
92: <p style={{ marginBottom: 16 }}>{m.description}</p>
96: <div className={`node ${s.status === 'instalado' ? 'new' : ''}`}><b>Permissões</b>{m.actions.map((a) => <div key={a.id} className="xs">{a.label}</div>)}<div className="xs muted" style={{ marginTop: 6 }}>Aparecem em Perfis e permissões e em Solicitar acesso.</div></div>
100: <p className="xs muted" style={{ marginTop: 14 }}>A plataforma entrega identidade do ambiente, navegação, componentes e serviços comuns; o plugin declara o que oferece e o que exige.</p>
115: <div key={b} className="row" style={{ alignItems: 'flex-start' }}>
116: <div style={{ flex: 1 }}>
120: <label className="check" style={{ alignItems: 'center' }}>
179: <div className="steps" style={{ marginBottom: 20 }}>
192: <div className="label" style={{ marginBottom: 10 }}>Ambientes com acesso</div>
196: <div className="label" style={{ marginBottom: 10 }}>Perfis com acesso</div>
```

### src/modules/inventario/CadastroForm.tsx

```tsx
63: <div className="content narrow" style={{ padding: 0 }}>
```

### src/modules/inventario/EntregaForm.tsx

```tsx
101: <div className="att" style={{ background: 'var(--surface-2)' }}>
102: <span className="asset-ic" style={{ width: 44, height: 44 }}><Ic size={20} /></span>
103: <div style={{ flex: 1, minWidth: 0 }}>
114: <div className="form-grid" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
122: style={{ border: `1px solid ${errors.colab ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 14, maxHeight: 264, overflowY: 'auto', padding: 4, background: 'var(--surface-solid)' }}>
123: {candidates.length === 0 && <p className="muted small" style={{ padding: 16 }}>Nenhum colaborador encontrado com esses critérios.</p>}
125: <label key={u.id} className="menu-item" aria-checked={colab === u.id} style={{ cursor: 'pointer' }}>
128: <span style={{ flex: 1 }}><span className="strong">{u.name}</span><br /><span className="xs muted">{u.sector} · {u.companies.map((c) => COMPANIES[c].name).join(', ')}</span></span>
129: <span style={{ width: 22, height: 22, borderRadius: 11, display: 'grid', placeItems: 'center', border: `1.5px solid ${colab === u.id ? 'var(--primary)' : 'var(--border-strong)'}`, background: colab === u.id ? 'var(--primary)' : 'transparent', color: 'var(--on-primary)', transition: 'all var(--dur)' }}>{colab === u.id && <Check size={13} />}</span>
133: {errors.colab && <span className="error-msg" role="alert" style={{ marginTop: 6 }}>{errors.colab}</span>}
162: <div className="state" style={{ padding: '40px 24px' }}>
170: <div className="card-body stack" style={{ gap: 14 }}>
171: <div className="row" style={{ gap: 12 }}><span className="asset-ic"><Ic size={17} /></span><div style={{ minWidth: 0 }}><div className="strong tnum">{e.patrimonio}</div><div className="xs muted">{e.descricao}</div></div></div>
172: <div className="row" style={{ gap: 12 }}>
173: {sel ? <Avatar name={sel.name} /> : <span className="avatar" style={{ background: 'var(--surface-sunken)', color: 'var(--text-subtle)' }}>?</span>}
176: <dl className="kv" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
177: <div style={{ gridColumn: '1 / -1' }}><dt>Situação</dt><dd className="row" style={{ gap: 6 }}><Badge tone="ok">Disponível</Badge><span className="muted">→</span><Badge tone="info">Em uso</Badge></dd></div>
181: <div className="stack-sm" style={{ paddingTop: 12, borderTop: '1px dashed var(--border-strong)' }}>
182: <div className="xs muted strong" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>Ao confirmar</div>
190: <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={phase !== 'edit'} aria-busy={phase === 'saving'}>
```

### src/modules/inventario/EquipamentoDetail.tsx

```tsx
62: <section className="card" style={{ marginBottom: 20, overflow: 'hidden' }} aria-labelledby="eq-title">
65: <div style={{ minWidth: 0 }}>
68: <div className="row-wrap" style={{ gap: 10 }}>
79: <dl className="facts" style={{ margin: 0 }}>
88: <div className="banner banner-info" style={{ marginBottom: 20 }}>
89: <UserCheck size={18} style={{ flexShrink: 0, marginTop: 2 }} />
94: <div className="banner banner-warn" style={{ marginBottom: 20 }}>
95: <Wrench size={18} style={{ flexShrink: 0, marginTop: 2 }} />
127: <span className="att-icon" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}><Wrench size={18} /></span>
128: <div style={{ flex: 1 }}><div className="strong">{m.motivo}</div><div className="xs muted">{m.fornecedor} · desde {fmtDate(m.inicio)} · previsão {fmtDate(m.previsao)}</div></div>
138: <div className="label" style={{ marginBottom: 8 }}>Próximo passo</div>
140: {primary && <div style={{ marginTop: 14 }}>{primary}</div>}
143: <div className="card-head"><h3>Histórico recente</h3><button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto' }} onClick={() => setTab('mov')}>Ver tudo<ArrowRight size={13} /></button></div>
144: <div className="card-body" style={{ paddingTop: 16 }}>
150: <div className="card-head"><h3>Documentos</h3><button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto' }} onClick={() => setTab('docs')}><FileText size={13} />{e.docs.length}</button></div>
151: <div className="card-body" style={{ paddingTop: 14 }}><AttachmentList ids={e.docs.slice(0, 1)} /></div>
154: <p className="xs muted" style={{ padding: '0 6px' }}>Atualizado {fmtRelative(e.ultimaMov)} · registros preservados com histórico completo.</p>
```

### src/modules/inventario/EquipamentosList.tsx

```tsx
120: <td><div className="asset"><span className="asset-ic"><Ic size={17} /></span><span><Link to={`/inventario/equipamentos/${e.id}`} onClick={(ev) => ev.stopPropagation()} className="id-cell" style={{ textDecoration: 'none', display: 'block' }}>{e.patrimonio}</Link><span className="xs muted">{e.tipo}</span></span></div></td>
121: <td><div className="truncate" style={{ fontWeight: 500, maxWidth: 260 }} title={e.descricao}>{e.descricao}</div><div className="xs subtle mono">{e.serie}</div></td>
124: {e.responsavelId ? <Avatar name={userName(e.responsavelId)} sm /> : <span className="avatar sm" style={{ background: 'var(--surface-sunken)', color: 'var(--text-subtle)' }}>—</span>}
125: <span style={{ minWidth: 0 }}>
126: <span className="truncate" style={{ display: 'block', maxWidth: 200, fontWeight: e.responsavelId ? 500 : 400, color: e.responsavelId ? undefined : 'var(--text-subtle)' }}>{e.responsavelId ? userName(e.responsavelId) : 'Em estoque'}</span>
127: <span className="truncate xs muted" style={{ display: 'block', maxWidth: 200 }} title={e.localizacao}>{e.localizacao}</span>
131: <td><div className="stack-sm" style={{ gap: 4, alignItems: 'flex-start' }}><Badge tone={EQ_STATUS[e.status].tone}>{EQ_STATUS[e.status].label}</Badge>{e.aceitePendente && <span className="xs" style={{ color: 'var(--info)', fontWeight: 600 }}>Entrega a confirmar</span>}</div></td>
150: <div style={{ flex: 1, minWidth: 0 }}>
152: <div className="small" style={{ marginTop: 2 }}>{e.descricao}</div>
```

### src/modules/inventario/InventarioExtras.tsx

```tsx
34: <td><div className="truncate" style={{ maxWidth: 420 }}>{e.action}</div></td>
63: <Link key={e.id} to={`/inventario/equipamentos/${e.id}`} className="att" style={{ textDecoration: 'none' }}>
64: <span className="att-icon" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}><Wrench size={18} /></span>
65: <div style={{ flex: 1, minWidth: 0 }}>
89: <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 16 }}>
91: <Link key={s} to={`/inventario/equipamentos?situacao=${s}`} className="card stat" style={{ textDecoration: 'none' }}>
101: <Link key={t} to={`/inventario/equipamentos?tipo=${t}`} style={{ textDecoration: 'none', display: 'grid', gridTemplateColumns: '120px 1fr 40px', gap: 12, alignItems: 'center', padding: '6px 0' }}>
103: <span className="bar"><span style={{ width: `${(n / total) * 100}%` }} /></span>
104: <span className="tnum small" style={{ textAlign: 'right' }}>{n}</span>
```

### src/modules/reservas/index.tsx

```tsx
42: <div className="seg" style={{ width: 'auto', overflowX: 'auto' }} role="group" aria-label="Dia">
46: <div className="card-body" style={{ overflowX: 'auto' }}>
47: <div className="slot-grid" style={{ gridTemplateColumns: `56px repeat(${salas.length}, minmax(150px, 1fr))`, minWidth: 56 + salas.length * 150 }}>
50: <div key={s.id} style={{ paddingBottom: 8 }}>
52: <div className="xs muted row" style={{ gap: 4 }}><Users size={12} />{s.capacidade} · {s.recursos}</div>
56: <div key={h} style={{ display: 'contents' }}>
57: <div className="xs muted tnum" style={{ paddingTop: 12 }}>{String(h).padStart(2, '0')}:00</div>
63: <button key={s.id} className={`slot busy ${mine ? 'mine' : ''}`} style={{ cursor: mine ? 'pointer' : 'default' }}
```

### src/modules/reverso/NovaSolicitacao.tsx

```tsx
74: <div className="content narrow" style={{ padding: 0 }}>
102: <textarea id="endereco" className="textarea" style={{ minHeight: 72 }} value={v.endereco} onChange={set('endereco')} aria-invalid={!!errors.endereco} />
127: <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,3fr) minmax(0,1.4fr) 80px 40px', gap: 8, alignItems: 'end' }}>
```

### src/modules/reverso/SolicitacaoDetail.tsx

```tsx
81: <section className="card" style={{ marginBottom: 20, overflow: 'hidden' }} aria-labelledby="rv-title">
84: <div style={{ minWidth: 0 }}>
87: <div className="row-wrap" style={{ gap: 10 }}><Badge tone={st.tone}>{st.label}</Badge><span className="small muted">{r.itens.reduce((n, i) => n + i.qtd, 0)} {r.itens.reduce((n, i) => n + i.qtd, 0) === 1 ? 'item' : 'itens'} · {COMPANIES[r.companyId].name}</span></div>
98: <dl className="facts" style={{ margin: 0 }}>
106: <div className="banner banner-danger" style={{ marginBottom: 20 }}><CornerUpLeft size={18} style={{ flexShrink: 0, marginTop: 2 }} />
110: <div className="banner banner-warn" style={{ marginBottom: 20 }}><span className="b-text">Aguardando decisão de <b>{userName(r.aprovadorId)}</b>.</span></div>
122: <div><div className="label" style={{ marginBottom: 6 }}>Justificativa</div><p style={{ whiteSpace: 'pre-line' }}>{r.justificativa || <span className="subtle">Não se aplica a este motivo.</span>}</p></div>
124: <div className="label" style={{ marginBottom: 8 }}>Itens</div>
125: <table className="tbl" style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
126: <thead><tr><th>Descrição</th><th>Referência</th><th style={{ textAlign: 'right' }}>Qtd.</th></tr></thead>
127: <tbody>{r.itens.map((i, k) => <tr key={k} style={{ cursor: 'default' }}><td>{i.descricao}</td><td className="mono small">{i.ref || '—'}</td><td className="num" style={{ textAlign: 'right' }}>{i.qtd}</td></tr>)}</tbody>
134: <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
139: {r.decisao.obs && <p style={{ marginTop: 8 }}>{r.decisao.obs}</p>}
145: {r.rastreio && <div className="banner banner-info"><Truck size={18} style={{ flexShrink: 0 }} /><span className="b-text">Rastreio <b className="mono">{r.rastreio}</b> · postagem simulada</span></div>}
154: <div className="label" style={{ marginBottom: 14 }}>Andamento</div>
158: <div className="label" style={{ marginBottom: 12 }}>Solicitante</div>
159: <div className="row" style={{ gap: 12 }}><Avatar name={userName(r.solicitanteId)} /><div><div className="strong">{userName(r.solicitanteId)}</div><div className="xs muted">{r.setor}</div></div></div>
176: <div className="att"><span className="att-icon png">PNG</span><div style={{ flex: 1 }}><div className="strong">Etiqueta de postagem — {r.numero}.png</div><div className="xs muted">Arquivo de exemplo · 95 KB</div></div></div>
```

### src/modules/reverso/SolicitacoesList.tsx

```tsx
108: <td className="id-cell"><Link to={`/reverso/solicitacoes/${r.id}`} onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'none' }}>{r.numero}</Link></td>
111: <td><div className="truncate" style={{ maxWidth: 220 }} title={r.clienteNome}>{r.clienteNome}</div><div className="xs muted tnum">{r.clienteCodigo}</div></td>
125: <div style={{ marginTop: 4 }}>{r.motivo} · {r.clienteNome}</div>
```

### src/modules/viagens/CompraExterna.tsx

```tsx
67: const hint = (k: keyof Fields) => (filled.has(k) ? <span className="row xs" style={{ gap: 4, color: 'var(--info)' }}><Sparkles size={12} />Lido do documento · confira</span> : undefined);
124: <div className="content narrow" style={{ padding: 0 }}>
152: <div id="arquivo" tabIndex={-1} className="att" style={{ borderStyle: arquivo ? 'solid' : 'dashed', borderColor: errors.arquivo ? 'var(--danger)' : undefined, flexWrap: 'wrap' }}>
154: <div style={{ flex: '1 1 200px' }}>
161: {errors.arquivo && <span className="error-msg" role="alert" style={{ marginTop: 6 }}>{errors.arquivo}</span>}
164: <div className="form-grid" style={{ marginTop: 20 }}>
```

### src/modules/viagens/MinhasViagens.tsx

```tsx
43: <div className="grid-3" style={{ marginBottom: 16 }}>
45: <Link key={k.k} to={k.to} className="card stat" style={{ textDecoration: 'none' }}>
55: <div className="seg" style={{ width: 'auto' }} role="group" aria-label="Visão">
77: <div key={v.id} className="att" style={{ cursor: 'pointer', flexWrap: 'wrap' }} onClick={() => nav(`/viagens/${v.id}`)}>
78: <span className="att-icon" style={{ background: 'var(--accent-soft)', color: 'var(--on-accent-soft)' }}><Plane size={18} /></span>
79: <div style={{ flex: '1 1 220px', minWidth: 0 }}>
80: <Link to={`/viagens/${v.id}`} className="strong" style={{ textDecoration: 'none' }} onClick={(e) => e.stopPropagation()}>{v.destino}</Link>
86: <span className="row small" style={{ gap: 6, color: d.complete ? 'var(--ok)' : 'var(--warn)', fontWeight: 600 }}>
```

### src/modules/viagens/ViagemDetail.tsx

```tsx
29: <section className="card" style={{ marginBottom: 20, overflow: 'hidden' }} aria-labelledby="vg-title">
32: <div style={{ minWidth: 0 }}>
35: <div className="row-wrap" style={{ gap: 10 }}>
43: <dl className="facts" style={{ margin: 0 }}>
47: <div className="fact"><dt>Documentação</dt><dd style={{ color: d.complete ? 'var(--ok)' : 'var(--warn)' }}>{d.complete ? 'Completa' : 'Pendente'}</dd></div>
51: <div className="banner banner-info" style={{ marginBottom: 20 }}>
67: <div className="xs muted strong" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>{t.tipo === 'ida' ? <><PlaneTakeoff size={13} /> Ida</> : <><PlaneLanding size={13} /> Volta</>}</div>
71: <div style={{ textAlign: 'center' }} className="muted">
75: <div style={{ textAlign: 'right' }}>
85: <span className="att-icon" style={{ background: 'var(--accent-soft)', color: 'var(--on-accent-soft)' }}><BedDouble size={18} /></span>
86: <div style={{ flex: 1 }}>
101: <div className="row" style={{ marginBottom: 12, color: d.complete ? 'var(--ok)' : 'var(--warn)', fontWeight: 600 }}>
109: <p className="xs muted" style={{ marginTop: 12 }}>A documentação fica completa quando ida, volta e hospedagem (se houver) estão emitidas e confirmadas.</p>
112: <div className="label" style={{ marginBottom: 12 }}>Viajante</div>
113: <div className="row" style={{ gap: 12 }}><Avatar name={userName(v.viajanteId)} /><div><div className="strong">{userName(v.viajanteId)}</div><div className="xs muted">{data.users.find((u) => u.id === v.viajanteId)?.sector}</div></div></div>
114: {total > 0 && <p className="small" style={{ marginTop: 14 }}>Total das passagens: <b className="tnum">{fmtMoney(total)}</b></p>}
```

### src/pages/Entrada.tsx

```tsx
27: <div className="art-shape" style={{ width: 640, height: 640, right: -200, top: -180, border: '1px solid color-mix(in srgb, var(--art-text) 22%, transparent)' }} />
28: <div className="art-shape" style={{ width: 440, height: 440, right: -100, top: -80, border: '1px solid color-mix(in srgb, var(--art-text) 14%, transparent)' }} />
29: <div className="art-shape" style={{ width: 300, height: 300, right: 10, top: 20, background: 'radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--art-accent) 34%, transparent), transparent 70%)' }} />
30: <div className="art-shape" style={{ width: 900, height: 900, left: -440, bottom: -640, background: 'color-mix(in srgb, var(--art-accent) 8%, transparent)' }} />
31: <div style={{ position: 'relative', fontFamily: serif ? 'var(--font-display)' : 'var(--font)', letterSpacing: '.26em', fontSize: 18, fontWeight: serif ? 400 : 700 }}>{COMPANIES[company].name.toUpperCase()}</div>
32: <div style={{ position: 'relative', maxWidth: 480 }}>
33: <div style={{ fontFamily: serif ? 'var(--font-display)' : 'var(--font)', fontSize: serif ? 52 : 44, lineHeight: 1.06, fontWeight: serif ? 400 : 600, letterSpacing: '-0.025em' }}>
36: <p style={{ marginTop: 18, color: 'var(--art-muted)', maxWidth: 420 }}>Inventário, reversos, viagens e as próximas funcionalidades, com a identidade de cada ambiente e os acessos definidos pela TI.</p>
38: <div className="xs" style={{ position: 'relative', color: 'var(--art-muted)' }}>Plataforma corporativa AZIME · protótipo de apresentação</div>
59: <p className="xs muted" style={{ textAlign: 'center' }}>Ambiente de demonstração · autenticação simulada</p>
104: <h1 style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>Acesse a plataforma</h1>
105: <p className="muted" style={{ marginBottom: 28 }}>Entre com sua conta corporativa Microsoft. Seu acesso é liberado previamente pela TI.</p>
106: {params.get('motivo') === 'sessao' && <div className="banner banner-info" style={{ marginBottom: 20 }}><span className="b-text">Sua sessão foi encerrada. Entre novamente para continuar.</span></div>}
108: <div className="stack-sm" style={{ marginTop: 28 }}>
110: <div key={t} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
112: <span><span className="strong small" style={{ display: 'block' }}>{t}</span><span className="xs muted">{d}</span></span>
121: <div className="row" style={{ marginBottom: 18, gap: 10 }}><MicrosoftMark size={18} /><span className="strong">Microsoft</span><span className="xs muted">· simulação</span></div>
122: <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Escolha uma conta</h1>
123: <div style={{ maxHeight: 360, overflowY: 'auto', margin: '0 -4px', padding: '0 4px' }}>
127: <span style={{ flex: 1, minWidth: 0 }}>
128: <span className="strong" style={{ display: 'block' }}>{u.name}</span>
135: <form className="row" style={{ marginTop: 14 }} onSubmit={(e) => { e.preventDefault(); if (!/^\S+@\S+\.\S+$/.test(other)) { setOtherErr('Informe um e-mail corporativo válido.'); return; } choose(data.users.find((u) => u.email === other.trim().toLowerCase()), other.trim()); }}>
136: <div style={{ flex: 1 }}><Field label="" error={otherErr}><input className="input" type="email" inputMode="email" aria-label="Usar outra conta" placeholder="Usar outra conta (e-mail)" value={other} onChange={(e) => { setOther(e.target.value); setOtherErr(''); }} /></Field></div>
139: <button className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={() => setStep('start')}><ArrowLeft size={15} />Voltar</button>
144: <div className="state" style={{ padding: '48px 0' }}>
153: <div className="state-icon" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}><Lock size={24} /></div>
154: <h1 style={{ fontSize: 24, fontWeight: 600 }}>{user.status === 'bloqueado' ? 'Acesso suspenso' : 'Seu acesso ainda não foi liberado'}</h1>
160: <div className="banner banner-info"><ShieldCheck size={18} style={{ flexShrink: 0, marginTop: 2 }} /><span className="b-text">Contato: TI · Elisa Moura · ramal 2040 (exemplo)</span></div>
167: <div className="row" style={{ gap: 12, marginBottom: 18 }}>
171: <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 6 }}>Escolha o ambiente</h1>
172: <p className="muted small" style={{ marginBottom: 18 }}>{user.companies.length > 1 ? `Você tem acesso a ${user.companies.length} ambientes. É possível trocar a qualquer momento pelo cabeçalho.` : 'Você tem acesso a um ambiente.'}</p>
180: <span className="strong" style={{ display: 'block', fontSize: 16 }}>{COMPANIES[b].name}</span>
183: <span className="env-swatch" aria-hidden>{COMPANIES[b].swatches.map((c) => <i key={c} style={{ background: c }} />)}</span>
188: <label className="check small" style={{ margin: '16px 0' }}><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Abrir neste ambiente nas próximas vezes</label>
189: <button className="btn btn-primary btn-block" style={{ height: 50 }} onClick={enter} disabled={!pick}>Entrar em {pick ? COMPANIES[pick].name : '…'}<ArrowRight size={17} /></button>
190: <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setStep('accounts')}><UserRound size={15} />Trocar de conta</button>
202: <h1 style={{ fontSize: 26, fontWeight: 600 }}>Senha gerenciada pela Microsoft</h1>
219: <div className="state-icon" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}><Check size={24} /></div>
220: <h1 style={{ fontSize: 26, fontWeight: 600 }}>Acesso liberado</h1>
```

### src/pages/Inicio.tsx

```tsx
71: <p className="muted small" style={{ marginBottom: 4 }}>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' })}</p>
74: <span className="env-chip glass" style={{ marginLeft: 'auto' }}><Monogram brand={company} size={22} />Ambiente {COMPANIES[company].name}</span>
80: <div style={{ minWidth: 0, position: 'relative', zIndex: 1 }}>
99: <Link to="/pendencias" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>Ver tudo<ArrowRight size={15} /></Link>
114: <div style={{ minWidth: 0 }}>
116: <div className="t-meta"><span>{m.name}</span><span aria-hidden>·</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{t.subject}</span><Badge tone={t.tone}>{t.status}</Badge></div>
132: <aside className="stack" style={{ gap: 20 }}>
141: {recent.length === 0 ? <p className="small muted" style={{ padding: 20 }}>Os registros que você consultar ou alterar aparecem aqui.</p> : recent.map((r) => {
145: <span className="mod-icon" style={{ width: 34, height: 34, borderRadius: 10 }}><m.icon size={16} /></span>
146: <span style={{ minWidth: 0 }}>
147: <span className="strong small" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
163: <p className="xs muted" style={{ marginTop: 10 }}>Atualizado em {fmtDate(new Date().toISOString())} · ambiente {COMPANIES[company].name}</p>
```

### src/pages/NotFound.tsx

```tsx
8: <div className="card" style={{ maxWidth: 640, margin: '48px auto' }}>
11: <h3 style={{ fontSize: 20 }}>{title}</h3>
13: <div className="row-wrap" style={{ justifyContent: 'center', marginTop: 8 }}>{children}</div>
```

### src/pages/Pendencias.tsx

```tsx
17: <div className="stack" style={{ gap: 20 }}>
23: <span className="mod-icon" style={{ width: 34, height: 34, borderRadius: 10 }}><m.icon size={16} /></span>
25: <Link to={p.to} className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>Abrir lista<ArrowRight size={15} /></Link>
30: <div style={{ minWidth: 0 }}>
```

### src/pages/Preferencias.tsx

```tsx
14: <div className="content narrow" style={{ padding: 0 }}>
16: <div className="card" style={{ marginBottom: 16 }}>
18: <div className="row" style={{ gap: 16, marginBottom: 20 }}><Avatar name={me.name} lg /><div><div className="strong" style={{ fontSize: 18 }}>{me.name}</div><div className="muted small">{me.email}</div></div></div>
27: <select id="pref-emp" className="select" style={{ maxWidth: 320 }} value={session.defaultCompany ?? me.companies[0]}
36: <div className="radio-cards" style={{ maxWidth: 420, gridTemplateColumns: '1fr 1fr' }} role="radiogroup" aria-label="Aparência">
40: <div className="stack-sm" style={{ marginTop: 18 }}>
```

### src/ui/brand.tsx

```tsx
16: if (svg) return <span className="monogram" style={{ width: size, height: size, background: 'none', boxShadow: 'none' }} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />;
24: return <span className={`monogram monogram-${brand}`} style={{ width: size, height: size, borderRadius: size * 0.3, ...style }} aria-hidden>{label}</span>;
29: if (svg) return <span className="brand-word" style={{ display: 'inline-flex', height: 22 }} dangerouslySetInnerHTML={{ __html: svg }} />;
36: <span className="row" style={{ gap: 12 }} aria-label={COMPANIES[brand].name}>
```

### src/ui/core.tsx

```tsx
22: <span key={i} className="row" style={{ gap: 6 }}>
30: <div style={{ minWidth: 0 }}>
104: <div style={{ flex: 1 }}>
106: {desc && <p className="muted small" style={{ marginTop: 4 }}>{desc}</p>}
125: <div style={{ flex: 1, fontWeight: 600 }}>{title}</div>
129: {footer && <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>{footer}</div>}
170: <div className="state-icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><AlertCircle size={24} /></div>
179: <div style={{ padding: 16 }} aria-busy="true" aria-label="Carregando">
181: <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
182: {Array.from({ length: cols }).map((__, j) => <div key={j} className="skel" style={{ height: 14, width: `${60 + ((i + j) % 4) * 10}%` }} />)}
```

### src/ui/export.tsx

```tsx
41: <Dialog open={open} onClose={() => setOpen(false)} title="Exportar lista" size="wide" icon={<FileSpreadsheet size={22} style={{ marginTop: 4 }} />}
45: <div className="seg" role="group" aria-label="Formato" style={{ width: 'auto', alignSelf: 'flex-start' }}>
46: {cfg.formats.map((f) => <button key={f} aria-pressed={fmt === f} onClick={() => setFmt(f)} style={{ padding: '7px 18px' }}>{f}</button>)}
48: <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 12 }}>
49: <table className="tbl" style={{ fontSize: 12.5 }}>
51: <tbody>{rows.slice(0, 4).map((r, i) => <tr key={i} style={{ cursor: 'default' }}>{cols.map((c) => <td key={c.key} style={{ whiteSpace: 'nowrap' }}>{c.get(r)}</td>)}</tr>)}</tbody>
55: <div className="banner banner-info"><ShieldCheck size={18} style={{ flexShrink: 0, marginTop: 2 }} /><span className="b-text">Todos os registros são preservados. A exportação é uma cópia e fica registrada no histórico administrativo{cfg.includeHistory ? '; inclui o histórico de cada registro' : ''}.</span></div>
```

### src/ui/records.tsx

```tsx
19: <div className={e.id === highlightId ? 'new' : ''} style={{ padding: '2px 6px', margin: '-2px -6px' }}>
20: <div style={{ fontWeight: 500 }}>{e.action}</div>
41: <div style={{ flex: 1, minWidth: 0 }}>
42: <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</div>
66: <p style={{ color: '#666' }}>{COMPANIES[eq.companyId].legal} · documento de demonstração</p>
75: <p style={{ marginTop: 40 }}>______________________________<br />Assinatura do colaborador</p>
80: <div style={{ border: '2px solid #111', padding: 20, fontFamily: 'ui-monospace, monospace' }}>
81: <div style={{ fontWeight: 700, fontSize: 16 }}>LOGÍSTICA REVERSA · AUTORIZAÇÃO DE POSTAGEM</div>
82: <div style={{ margin: '12px 0', height: 56, background: 'repeating-linear-gradient(90deg,#111 0 2px,#fff 2px 4px,#111 4px 7px,#fff 7px 9px)' }} />
84: <div style={{ marginTop: 10 }}>REMETENTE: {rv.clienteNome}<br />{rv.endereco}</div>
85: <div style={{ marginTop: 10 }}>DESTINATÁRIO: {COMPANIES[rv.companyId].legal}<br />Centro de distribuição · São Paulo/SP</div>
92: <p style={{ color: '#666' }}>{vg.codigo} · {userName(vg.viajanteId)} · documento de demonstração</p>
110: <Dialog open onClose={onClose} title={att.nome} size="wide" icon={<FileText size={22} style={{ marginTop: 4 }} />}
```

### src/ui/toast.tsx

```tsx
24: <button className="link" aria-label="Fechar aviso" onClick={() => dismiss(t.id)} style={{ textDecoration: 'none', opacity: .7 }}><X size={16} /></button>
```

## Anexo G Índice integral dos arquivos de origem

| Arquivo | Bytes | SHA256 |
| --- | --- | --- |
| `.gitignore` | 45 | `2abdc31259022dd17a1c638462c7c676005e255760e642452a302e442dddfb5a` |
| `README.md` | 6373 | `af5c2967f98c46894bf3e7c59364517154db74fa86d901215a5427708853d194` |
| `index.html` | 651 | `b02e4c38b55c831e0d03ef51e080cd40ef75004a18ac29ec63c00b03e8a05f98` |
| `package-lock.json` | 65679 | `51cc139a3da515ebda187675ebfc25d85c7910e3684e078e554c05191ca4197c` |
| `package.json` | 694 | `a1318ad92ac77515284e67552bfdef1ebb9ac19b28c92a75482268f5a14d22a7` |
| `src/brands/README.md` | 664 | `1319cf70cfeb31a6243f5a4a80874d12d02ccc8ba14b8cb5647eabd40e967503` |
| `src/layout/AppShell.tsx` | 3433 | `56a1b5e93218a87ca7c208fdb2ec6ca29f9774385628c86df8fa046d502908e8` |
| `src/layout/Header.tsx` | 17288 | `f01f9e07552baa6b425885fab2a3fa46ec820fc8000d1e281185cd34c04a0371` |
| `src/layout/Presenter.tsx` | 8089 | `9feb5b47fa62c9e17a7551472260e49f502fbfe056d84d388c9dacef94594ea3` |
| `src/layout/Sidebar.tsx` | 6075 | `d3066bdfa722d447350a09165d2ac2c998d8973a5543e1ed0b16ebcb7abb90c1` |
| `src/layout/modules.ts` | 645 | `262f4b56caf9eeead2e979c8f5825cff76fca308672c089bb02eb91b144c1598` |
| `src/main.tsx` | 1972 | `bb1e61d2a88e53987df441953fd9ef7bbd7db0b38cd340467f7b154f5c77e981` |
| `src/modules/admin/Acessos.tsx` | 18446 | `1c16ededbfc95e52115b064bfacd461f7bed42fe30c1f88c5d84219e227bee9f` |
| `src/modules/admin/Colaboradores.tsx` | 16496 | `1771f688dbd2744bc59726c2560bb82772ef21ca2dd27fe2441e2de2a0658737` |
| `src/modules/admin/Exportacoes.tsx` | 6767 | `a66252fb5365ae0c787d425ec28759947e2499ac6cc5cb5a57ac44c3be3204e2` |
| `src/modules/admin/Perfis.tsx` | 8918 | `76c6925c3793cbd9d04b3342316eddf3e077ab689aed21a42cd4652ae5da563c` |
| `src/modules/admin/Plugins.tsx` | 15137 | `785794637f9bec8888b6d6686e7c6e9c60c644d2004ab0fa61926e5620acfb04` |
| `src/modules/admin/index.ts` | 1830 | `9f344dfa0bd86ccd76dca1358be77b5c3508eac24d7e174c7d6439fb4dd0f8b2` |
| `src/modules/admin/meta.ts` | 1264 | `9b0efb79ff106286cfb855c530a4ad11b9c0cbafa19de19c04357fddfe8d174c` |
| `src/modules/inventario/CadastroForm.tsx` | 6089 | `a787bef78685b41380ca200f19f212628725362e8f9852fd2a380d1fbb5dbdcc` |
| `src/modules/inventario/EntregaForm.tsx` | 13583 | `0c1d44f24b6ba0c831764de6c5090f6ef5564545aee0b043328f0bcbfb8fa4c8` |
| `src/modules/inventario/EquipamentoDetail.tsx` | 10778 | `61445edf4c5023b16a2e34d6bf624d2c82e1fba2d64b150f269916d0bd943392` |
| `src/modules/inventario/EquipamentosList.tsx` | 11762 | `3e078884d09b80c1426e777409afb08d9d81585cfe086ea0666fb2e7bc109b5c` |
| `src/modules/inventario/InventarioExtras.tsx` | 5787 | `85fbb67463f958649dda491a9fdfd54a66a88f3927589d3624308d56b5cf8b1a` |
| `src/modules/inventario/index.ts` | 1807 | `29b5f562081181cb91fd1beadd1799c60ef82b53249c6314eef66d58febe62a6` |
| `src/modules/inventario/meta.ts` | 1103 | `65616449d8006a0a47cec40b35446b6dd2d3392c301da7e3b5a74d02f6b6a3f6` |
| `src/modules/plugins.ts` | 563 | `703562cd6df2bb22a4820e2ed857d227e61b3410fcad9356ef1baee7af0d0a6b` |
| `src/modules/reservas/index.tsx` | 6053 | `c570434b5cebe1546c9a01a6268db6f1bd7c7f28cf8c0e01301a1ba747b9e8fa` |
| `src/modules/reverso/NovaSolicitacao.tsx` | 10217 | `857b66c972625e607eb1847cf5d3b943201040631c5a2cf93e113b8493411d3e` |
| `src/modules/reverso/SolicitacaoDetail.tsx` | 16430 | `25f0ab93edf69d5f32dfe20b2e86788223e32a46e1cb1032306e9a24627ea925` |
| `src/modules/reverso/SolicitacoesList.tsx` | 9131 | `c8f3e873311a60f73f6a1614d5a28cf16fc4e9b8a052b496fea444d1be63edc9` |
| `src/modules/reverso/index.ts` | 1267 | `33c981560a0fd886f529e59bfb00e47b837b05dd75dd06b7ec59baa7861b8170` |
| `src/modules/reverso/meta.ts` | 2137 | `6b7634ae09a611c930434f8f702780e99be28834b6792069655699e8eca60d3f` |
| `src/modules/viagens/CompraExterna.tsx` | 13871 | `e4d677f21b44d5d63d1fc035f1828684fcf2798d23c6401b88401db4b35b3e05` |
| `src/modules/viagens/MinhasViagens.tsx` | 6568 | `6c75068673b358d13771b32f7d690b18eb1b501a380196a75d8ed6ba84a81205` |
| `src/modules/viagens/ViagemDetail.tsx` | 7622 | `13e11a6989bc0614b93943286a71386398e604eef41c424f86db2b736bfcca49` |
| `src/modules/viagens/index.ts` | 1095 | `aa70a3823ad601ac2dd412f6b6322f6fad649976e8400e134903c169cc73021f` |
| `src/modules/viagens/meta.ts` | 948 | `a3e45760b90be86fe79d446595f17f5b164db9317dfacbce98bba8001eae4d03` |
| `src/pages/Entrada.tsx` | 13914 | `f526e5478ea6c984a37e5e8c73a77c6bf8a766e75cb8d53cf441df44059192f8` |
| `src/pages/Inicio.tsx` | 10716 | `6c17a083a66e421e88c2167d7f68612064531b774979531be7bab06893745098` |
| `src/pages/NotFound.tsx` | 2777 | `9395e785a73f7a0943ec17d87ba626edf035f8c495e8ca7ca46c06633dd71cf1` |
| `src/pages/Pendencias.tsx` | 2490 | `1f4cb6366a8115b906e8a0fdac32c8b8a0a8162efa6d11d4441320630320905a` |
| `src/pages/Preferencias.tsx` | 3358 | `fb668bf4d5f8cee8c2a331e31e46dac54551cefeab6acb1c1c108aaae21e2d93` |
| `src/platform/format.ts` | 1539 | `8fa64c5adac6a0db457299eb704d1a89c6967d3ba5b032dc1728695630e1757e` |
| `src/platform/hooks.tsx` | 5021 | `542e6870535c0f278c03ec167356b01f068570cee8786aed60d010322bb09e2a` |
| `src/platform/pendencias.ts` | 7192 | `de462f1b4a2716c6d289ee008e8cb77378a200d073693bef33ce9646d8f690ca` |
| `src/platform/permissions.ts` | 2818 | `dccdbfa8ac3e2a347b9b265b06ef2ec314258c87ab42d018b45e11f6c00e7dc7` |
| `src/platform/seed.ts` | 32473 | `88a9746679af25bb980a8c1a7f95bfe62476a2bef8d5b8c1b5fbd97c06508e7c` |
| `src/platform/store.tsx` | 6031 | `0924858cc193a3254b5c64a082a8b7b4c95fc28e203bb80c4c69f98d676f8601` |
| `src/platform/types.ts` | 6681 | `8a8b1131c25b4bfe8092ad1953d3f2f1a82e26f61b613a2bd453d76e12949034` |
| `src/styles/app.css` | 54073 | `0197f9c132ac133ea09b10ff5ad3b0120e0a88c1df087ea33ac5c7aee701d39d` |
| `src/styles/tokens.css` | 11923 | `a5298e1fbf07c75b04af90681352f35df987ed822be67e9bae1a816c795a6ae5` |
| `src/ui/brand.tsx` | 2872 | `fe87dc5e8ad2368251b75025a94297ff89395f00ef47563645c2532839a6089a` |
| `src/ui/core.tsx` | 9853 | `7c740d152320df2d345cb0832845f2e07ef4db94dec8557a78a258e04ab4cd88` |
| `src/ui/export.tsx` | 4010 | `457e2df6f8d5b6f38c4764025a262e5364448d4fe6971c31578626de640d05c6` |
| `src/ui/records.tsx` | 6135 | `37014006a84ba5149d25129c3b1c03cb97e36c82e8941bf847d04d7dabf5470a` |
| `src/ui/toast.tsx` | 1712 | `a1d7569f170712853bfbf3956d9cc7a4e9de44c498a50335efe6d468bfe3d74c` |
| `src/vite-env.d.ts` | 38 | `65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5` |
| `tsconfig.json` | 504 | `558b396bcbd0c9620b8966ba27f7a7b860126a3d3919162f6ed76d22d72ef0d9` |
| `vite.config.ts` | 505 | `1e539c623b553986438167f28bfec3af4e3f4e0e7c8f9ea71475836cb96587dd` |
