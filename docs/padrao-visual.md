# Padrão visual (AZIME, Alinare e Novitah)

Estado em 24/11/2026. O front-end segue o **Manual definitivo do frontend Alinare Novitah e AZIME** (revisão cromática de 24/11/2026). A cópia integral do material recebido está em [`padrao_front/`](../padrao_front/): manual em `.md` e `.html`, logos e paletas (PDF/JPG). Essa pasta é a fonte de verdade; os arquivos de `src/` a implementam.

Este documento registra **como o padrão foi aplicado**, o que é extensão do manual, o que foi verificado e o que ainda falta. Regra do manual (seção 28.3): extensão herda os tokens e os componentes existentes e fica identificada; ela não redesenha o que já é referência.

## 1. Arquivos

| Arquivo | Papel |
| --- | --- |
| `src/styles/padrao/tokens.css` | Anexo C do manual, **transcrito por script, sem edição manual**: tokens das seis combinações (marca × tema), estados e redução de transparência. |
| `src/styles/padrao/app.css` | Anexo D do manual, **idem**: ambiente, vidro, shell, sidebar, cabeçalho, botões, campos, tabelas, detalhe, diálogos, avisos, entrada e responsivo. A ordem da cascata importa (regras finais do cabeçalho, monogramas e celular). |
| `src/styles/ponte.css` | Alias dos nomes de token antigos (`--flow-*`) para os tokens do padrão, mais as cores de série de gráfico das duas empresas. Existe para as telas ainda não migradas; não nasce cor nova aqui. |
| `src/styles/telas.css` | Classes de página que o sistema ainda compartilha (painéis, filtros, tabelas de registros, visualizador de PDF, calendário), escritas sobre os tokens. Painel = `.card`; diálogo = `.glass-strong`. |
| `src/styles/extensoes.css` | Extensões do sistema (seção 5). Vem depois de `app.css`. |
| `src/styles/login-marca.css` | Login por marca (extensão): painel de marca com o logotipo animado, coreografias, estado estático e painel de entrada. Vem depois de `extensoes.css`. |
| `src/styles/{dashboard,approval,nc,checkin-alerts}.css` | Folhas por tela, ajustadas ao padrão (raios, tipografia, sem blur em conteúdo). |
| `public/marcas/*.png` | Logos e monogramas **oficiais** (de `padrao_front/Logos`), recortados das margens transparentes. |

Ordem de importação (`src/index.css`): Tailwind → `padrao/tokens.css` → `ponte.css` → `telas.css` → `padrao/app.css` → `extensoes.css`.

Para atualizar o padrão: substitua o manual em `padrao_front/` e regenere os dois CSS de `src/styles/padrao/` com o mesmo método (extrair os blocos `css` dos anexos C e D). Não edite esses dois arquivos à mão.

## 2. Marca, tema e preferências

- `<html data-brand="azime|alinare|novitah" data-theme="light|dark">`. A marca vem de `lib/tema.ts` (`marcaDoTema`): a visão conjunta das duas empresas é a **AZIME**; Alinare e Novitah seguem a empresa da rota, do filtro da tela ou do perfil de empresa única (regra que já existia).
- `context/TemaContext.tsx` aplica `data-brand`, `data-theme`, `style.colorScheme` (controles nativos) e atualiza `meta[name=theme-color]` com `--amb-base` (manual, seção 26). O `index.html` aplica o tema antes do primeiro quadro, para não piscar.
- Preferências do usuário (menu da conta): **reduzir movimento** (`data-motion="reduced"`) e **reduzir transparência** (`data-transparency="reduced"`), em `hooks/usePreferenciasVisuais.ts`. O sistema operacional também é respeitado por media query.
- Fontes: Instrument Sans (interface) e Instrument Serif (só assinaturas de marca), pelo Google Fonts no `index.html`, como no manual. Hospedar localmente é decisão futura de distribuição.

## 3. Estrutura da aplicação

- **Ambiente** (`components/shell/Ambiente.tsx`): quatro manchas desfocadas sobre a base do tema. Substitui o cenário de joalheria com partículas.
- **Barra lateral** (`BarraLateral`, `MenuNavegacao`): vidro de 264 px (80 px recolhida; compacta sozinha até 1024 px). Itens são botões com `aria-current` e nome acessível que inclui a contagem de aprovações pendentes; o submenu do módulo ativo (NC) liga-se por uma guia.
- **Cabeçalho** (`CabecalhoApp`): menu (celular), busca, demonstração, notificações, modo de cor (some no celular, onde fica no menu da conta) e conta.
- **Gaveta** (`GavetaMenu`): até 760 px a barra lateral dá lugar a uma gaveta à esquerda, com Esc, toque no fundo e retorno do foco.
- **Entrada** (`EntradaLayout`): definição de senha e sem acesso. Painel de marca à esquerda; só o formulário no celular. O **login** tem layout próprio por marca (`LoginMarca`, seção 4.1).
- **Casca** (`components/admin/AdminLayout.tsx`): grid de 276/92 px + conteúdo de até 1400 px; volta ao topo e fecha a gaveta a cada rota.
- Agrupamento do menu em `lib/menu.ts`: Visão geral, Solicitar, Acompanhar, Qualidade, Administração. Destino sem grupo conhecido vai para "Outros": nenhuma tela autorizada fica sem acesso.

## 4. Telas

Reescritas na marcação do padrão: entrada (login, definir senha, sem acesso), **Novo pedido** (formulário de reversa: seções numeradas, `.field`/`.input`, banner de histórico, ações fixas no celular), **Pedidos** (`RecordsList`: tabela `.tbl` e cards no celular), **Lixeira**, **Usuários** (tabela e cards), **Registro de NC** (tabela e cards), cabeçalho de todas as páginas (`PageHeading`: título de 30 px, trilha, ações) e menu da conta.

Herdam o padrão pelos tokens e pelas folhas ajustadas (já responsivas): Dashboard, Aprovações, Operações (fila de emissão), Meus pedidos, Painel e Listas de NC, ficha e registro de NC, Comunicações e os diálogos (ficha do pedido, confirmação, importação, visualizador de PDF).

### 4.1 Login por marca

Há uma tela de login para cada marca, na mesma rota-base: **`/login/azime`**, **`/login/alinare`** e **`/login/novitah`**. `/login` continua existindo como atalho da AZIME, porque é para onde o sistema já redirecionava (rota protegida, definir senha, sem acesso).

- **Só o front muda.** O formulário, a autenticação e o destino depois do login são os mesmos nas três (`LoginPage`, `authService`, banco). A tela não restringe quem entra: uma pessoa da Novitah que abrir `/login/alinare` entra normalmente e cai na própria home, já com o tema do próprio perfil.
- **Tema pela rota.** `resolverTema` dá prioridade à rota de login (`marcaDoLogin` em `lib/tema.ts`): a página já abre com os tokens da marca (`data-brand`), nos dois modos de cor. A aba do navegador também leva a marca (`Reverso - Alinare`; a AZIME mantém o título do `index.html`).
- **Logotipo animado, um movimento por marca.** Vem do estudo de movimento `Reverso_Identidade_Movimento_v2` (`LoginMarca`, `HeroMarca`, `styles/login-marca.css`): o painel de marca mostra só o logotipo oficial da marca em movimento, sobre os tokens `--art-bg`, `--art-text` e `--art-muted` (nenhuma cor nova). **AZIME** — o logotipo se monta em cinco faixas, entre uma moldura e uma linha em Z, com uma varredura de luz; **Alinare** — a palavra é revelada por uma régua, sobre o contorno de um A e um traço fino; **Novitah** — sete faixas verticais sobem e descem até formar o nome, entre dois trilhos e colunas.
- **Desenho com o PNG oficial.** O estudo traz os logotipos traçados em vetor, e o traçado fica serrilhado no tamanho real. Aqui as mesmas faixas e posições usam os PNGs de `public/marcas` como máscara de uma cor só (arquivos oficiais de `padrao_front/Logos`), com borda limpa.
- **Pausar e movimento reduzido.** O botão no canto do painel pausa o movimento. Pausar (ou "reduzir movimento", do sistema ou do menu da conta) mostra o logotipo inteiro e estático, sem congelar a meio do ciclo, que deixaria o logotipo parcial ou invisível.
- **Sem seletor de marca.** O estudo tem abas para trocar de marca; no sistema não há botão que leve de um login a outro. A rota decide qual tela abre, e cada marca é acessada pelo próprio endereço.
- **Voltar ao login certo.** `lib/loginDaMarca.ts`: ao sair ou quando a sessão cai numa rota protegida, a pessoa volta ao login da marca que estava vendo (empresa indicada pela rota, senão a última marca vista com a sessão aberta, guardada em `localStorage` `flowdesk.login-marca`, senão AZIME). O botão "Sair" e o `ProtectedRoute` usam a mesma função, para não disputarem o destino quando a sessão zera.
- Definir senha e Sem acesso continuam no `EntradaLayout` do manual (arte da AZIME).

### Celular (até 760 px)

- No login, o painel de marca, que o manual esconde, vira uma **faixa curta** no topo com o logotipo em movimento (recorte central do desenho, para o logotipo não ficar minúsculo), para a marca aparecer também no celular. Definir senha e Sem acesso seguem o manual: só o formulário.
- Listas de dados viram cards (`.mobile-cards` / `.m-card`): Pedidos, Lixeira, Usuários, Registro de NC. A tabela some e o card mostra a mesma informação e as mesmas ações.
- Formulários: campos em uma coluna e ações em barra de vidro fixa na base (`.form-actions.sticky`); o conteúdo reserva 100 px de respiro para o último campo não ficar coberto. O formulário de NC usa a mesma barra.
- Tabelas **sem versão em card** conservam rolagem horizontal dentro do painel, como o manual prevê para tabelas fora de `.table-wrap.responsive`: tabelas agregadas do Painel de NC, Listas de NC, Comunicações e as dos diálogos de NC.
- Avisos (toasts) sobem acima da barra de ações.

## 5. Extensões (fora do manual, identificadas)

1. **Busca global** pelas telas que o perfil já pode abrir (Ctrl K); não consulta dados.
2. **Grupos do menu** (seção 3) e **submenu de NC**.
3. **Logos oficiais como máscara CSS** (`Marca.tsx`): o manual descreve assinaturas provisórias; a pasta recebida traz os arquivos oficiais, que foram usados. A cor do desenho vem do tema (um arquivo serve a todas as combinações).
4. **Preferências visuais** no menu da conta; **atalho "Ir para o conteúdo"**.
5. **Login por marca**: o manual descreve um único painel de marca (quatro círculos); aqui há uma tela por marca, com o logotipo animado e a faixa de marca no celular (seção 4.1).
6. **Cards de lista no celular** para Lixeira, Usuários e NC (o manual só mostra o padrão `.m-card`).
7. Classes auxiliares em `extensoes.css`: `.narrow-box`, `.banner-neutral`, `.subsecao`, `.input-readonly`, `.icon-btn.is-danger`.

## 6. Decisões e substituições

- **Removidos** o cenário de joalheria, as partículas douradas e o controle "pausar efeitos de fundo": o manual (seções 5 e 25) afirma que o ambiente não tem fotografia nem partículas. Saíram `FundoJoalheria`, `BotaoEfeitosFundo`, `useEfeitosFundo`, `lib/particulasDouradas` (e o teste dele), `styles/background.css`, `public/fundos/` e os logos JPG antigos de uso exclusivo. As preferências de movimento e transparência do padrão ocupam esse lugar.
- **Removidos** o dock inferior (`FlowNav`) e a cápsula do cabeçalho; o contador de aprovações passou para o menu lateral com o mesmo contrato (botão, `aria-current`, nome com contagem, alerta em falha).
- Rótulos da tela de login passaram de `USUÁRIO`/`SENHA` (caixa alta literal) para `Usuário`/`Senha` (label de 13 px do padrão); os testes acompanharam.
- `docs/aparencia-tema.md` descreve o sistema anterior (`tokens.css` por empresa). Fica como histórico da procedência das cores oficiais; vale o que está aqui.

## 7. Validação

Feita (navegador Edge, modo demonstração, sem backend real, animações do ambiente congeladas na captura, conforme o manual 29.1):

- `data-brand`/`data-theme` e aparência nas **seis combinações** (AZIME, Alinare e Novitah × claro e escuro) em 1440 × 900, no dashboard.
- **Todas as rotas** em 390 × 844: sem estouro horizontal da página e sem erro de console.
- **Larguras de comparação** 1920, 1180, 1024, 760 e 360, em Pedidos, Novo pedido e Dashboard: sem estouro horizontal. Em 1024 a barra lateral compacta e a tabela de pedidos esconde a coluna Motivo para as ações ficarem visíveis.
- Menu recolhido, gaveta do celular, busca com resultados, menu da conta, notificações e ficha do pedido (desktop e celular).
- `npx tsc -b`, `vite build` e o Vitest (os números estão no resumo da entrega).

**Não feita ainda** (matriz do manual, seção 29): 1181/761 exatos; estados vazio, erro, carregando e paginação em todas as listas; formulários preenchidos, inválidos e salvando em todas as telas; as seis combinações em todas as telas (fora o dashboard, só as telas de Pedidos, Novo pedido, Usuários e NC foram vistas em mais de uma combinação); e a **comparação sobreposta com a referência executando**, que o manual exige para considerar a reprodução concluída (a descrição não garante identidade de pixels).

## 8. Pontos de atenção

- Login: o título e os rótulos passaram a "Entrar" (como no estudo de movimento); o botão principal também. Os testes acompanharam (`/^Entrar$/`).
- Login da Novitah no claro: o logotipo (`--art-text`, quase branco) sobre o terracota oficial `--art-bg` (`#a46f69`) dá cerca de 3,5:1. Por ser o logotipo, e não texto corrido, o contraste de elemento gráfico grande basta; o painel não tem parágrafo.

- Novitah claro: o botão primário usa texto branco sobre `#a46f69` (≈ 4,15:1, abaixo de 4,5:1 para texto normal). O manual registra o ponto e pede validação antes de produção; não foi alterado.
- O padrão não traz regra de foco preso em diálogos, `safe-area-inset` de iOS nem teclado virtual (seções 18.2 e 24.2). O diálogo de senha e a gaveta restauram o foco, mas não prendem o foco; a barra fixa não usa `env(safe-area-inset-bottom)`.
- Sete testes seguem falhando por causa do campo "NC de origem", removido do formulário de reversa antes desta entrega (`integration.test.tsx` e `ncVinculoReversoFormulario.test.tsx` procuram o select). Não foram alterados.
