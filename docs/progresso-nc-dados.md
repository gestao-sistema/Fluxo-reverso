# Não conformidades: modelo de dados e persistência (checkpoint do segundo agente)

Checkpoint exclusivo deste trabalho. O agente que corrige a visibilidade das aprovações e a documentação das notificações usa outro arquivo; nada aqui é escrito nele.

**Escopo desta etapa:** modelo de dados e persistência das NC. Não há novo formulário nem quadro de acompanhamento. A interface atual continua igual.

**Estado:** entrega 1 (modelo e persistência) concluída; entrega 2 (abertura simplificada, compatibilidade com origem e consumidores) concluída localmente, ver seções 9 a 14. Nada foi aplicado em banco remoto, publicado, commitado nem enviado.

## 1. Diagnóstico (antes de editar)

- `origem` (lista `nc_origens`, 28 valores oficiais) mistura **problema e setor** no mesmo texto. `Erro expedição – endereço incorreto` é o problema *Endereço incorreto* causado pela *Expedição*; `Erro vendedora – endereço incorreto` é o mesmo problema causado pelo *Comercial*.
- `area_responsavel` e `evitavel` são derivados da origem (`vw_nao_conformidades`). Hoje a "área responsável" é, na prática, o **causador**. Não havia campo para a área que registrou nem para a área que trata.
- Não existia situação do custo. Custo nulo era só ausência de valor, sem decisão registrada.
- A aprovação do reverso decide por `solicitacoes_reverso.setor` (`usuario_pode_aprovar_reversa(empresa, setor)` em `fila_aprovacao_reversas`, última definição em `20261030120000_lixeira_chamados.sql`). O quadro de aprovação expõe `nc_origem`.
- **O painel e o dashboard contam só NC com `origem` preenchida** (`ncsDoPeriodo`, `doAno`, e a própria tela de painel). Isso restringe o formulário novo (ver seção 7).
- Definições efetivas usadas: tabelas, listas, triggers e view em `20261020130100_nao_conformidades.sql`; listas oficiais em `20261021140000_alinhar_listas_nc.sql`; `pode_ver_nc` / `pode_editar_nc` em `20261028100000_acesso_por_tela_cadastro.sql`; `is_admin`, `is_mestre`, `current_telas` em `20261028130000_bloquear_operacao_sem_senha_convite.sql`; fila de aprovação em `20261030120000_lixeira_chamados.sql`.
- Testes existentes gravam NC só com `origem` (`banco.test.mjs`). Por isso os campos novos são **opcionais** no banco e no tipo TypeScript nesta etapa.

## 2. Desenho (conceitos separados)

| Conceito | Coluna | Lista / regra | Legado |
|---|---|---|---|
| Tipo do problema | `tipo_problema` | `nc_listas.lista = 'tipo_problema'` | mapeado só se inequívoco |
| Origem / causador | `causador` | `nc_listas.lista = 'causador'` | mapeado só se inequívoco |
| Área que registrou | `area_registro` | `nc_listas.lista = 'area'` | nulo (não há como saber) |
| Área responsável pela tratativa | `area_tratativa` | `nc_listas.lista = 'area'`; sempre área, nunca pessoa | nulo (não atribuída) |
| Situação do custo | `custo_situacao` | `'Sim'`, `'Não'` ou `'Em apuração'`; nulo = não informada | `'Sim'` só com custo positivo |

Mantidos sem alteração: `origem` (legado composto, usado pelo painel, pela fila de aprovação, pela planilha e pelo formulário atual), `area_responsavel`, `evitavel`, `custo_total`, `custo_liquido`, `dias_em_aberto`, `qtd_reversas`, o layout de 36 colunas da planilha, `solicitacoes_reverso.setor` e o vínculo opcional NC ↔ reversa.

### Regras de persistência (banco é a autoridade)

1. **Listas:** `tipo_problema`, `causador`, `area_registro` e `area_tratativa` precisam existir na lista correspondente (validado por trigger, como os campos antigos). Valor desativado depois continua válido nos registros antigos.
2. **Mapeamento automático** (`nc_classificacao_legada(origem)`): só as origens inequívocas recebem tipo e causador. Duas recebem só o causador: `Erro de faturamento / NF (destinatário ou endereço)` → *Financeiro*; `Erro da expedição e do financeiro` → *Expedição e Financeiro*. O tipo fica nulo para revisão. Origem fora do mapa (ex.: criada depois pelo admin) fica sem classificação nova.
3. **Preenche só vazio:** o mapeamento (na migração e no gatilho de INSERT, e quando a origem muda) nunca sobrescreve valor já gravado.
4. **Ausência de custo não é zero nem "Não":** `custo_situacao` nulo não vira `'Não'` por inferência. Registro novo sem situação recebe `'Sim'` se há custo positivo e `'Em apuração'` caso contrário.
5. **`'Não'` exige custos sem valor:** com custo positivo ou reembolso positivo, `'Não'` é recusado. Zero explícito é aceito.
6. **Mudar a situação não apaga valores:** se a situação muda na mesma gravação, nenhum valor preenchido pode passar a vazio. Valores podem ser editados. Para zerar, grave em operação separada.
7. **Situação não volta a vazio** depois de informada.
8. **Permissões:** escrita segue `pode_editar_nc()` (RLS existente: tela `nc-edit` ou mestre); leitura segue `pode_ver_nc()`; listas seguem `is_admin()`. Nenhum responsável individual é atribuído.
9. **Vínculos:** NC pode existir sem reversa e reversa sem NC (`nc_id` continua opcional). Classificar a NC não altera a reversa nem `solicitacoes_reverso.setor`.
10. **Histórico:** a linha do tempo registra "Dados atualizados: …" também para os campos novos. Histórico antigo não é reescrito.

Visão: `vw_nao_conformidades.classificacao_pendente` = tipo **ou** causador vazio. É a lista de revisão.

## 3. Mapeamento das 28 origens oficiais

Automático (26):

| Origem | Tipo do problema | Origem / causador |
|---|---|---|
| Erro expedição – endereço incorreto | Endereço incorreto | Expedição |
| Erro expedição – mercadoria trocada ou embalada junto | Mercadoria trocada ou embalada junto | Expedição |
| Erro expedição – etiqueta ou pré-postagem | Etiqueta ou pré-postagem | Expedição |
| Embalagem inadequada / avaria por embalagem | Embalagem inadequada / avaria por embalagem | Expedição |
| Atraso de postagem | Atraso de postagem | Expedição |
| Postagem duplicada | Postagem duplicada | Expedição |
| Postagem sem NF | Postagem sem NF | Expedição |
| Erro vendedora – endereço incorreto | Endereço incorreto | Comercial |
| Tipo de frete incorreto (CIF/FOB) | Tipo de frete incorreto (CIF/FOB) | Comercial |
| Frete não cobrado na venda | Frete não cobrado na venda | Comercial |
| Reverso sem autorização | Reverso sem autorização | Comercial |
| Frete carona (pacote de terceiro com pedido da marca) | Frete carona | Comercial |
| Mercadoria apreendida (fiscalização) | Mercadoria apreendida | Fiscalização |
| Extravio Correios | Extravio | Correios |
| Avaria no transporte | Avaria no transporte | Correios |
| Entregue para a pessoa errada | Entregue para a pessoa errada | Correios |
| Consta entregue / não entregue no local | Consta entregue / não entregue no local | Correios |
| Endereço não localizado | Endereço não localizado | Correios |
| Entregador não atendido | Entregador não atendido | Cliente / destinatário |
| Cliente desconhecido | Cliente desconhecido | Cliente / destinatário |
| Entregue, porém cliente afirma que não recebeu | Entregue, porém cliente afirma que não recebeu | Cliente / destinatário |
| Mercadoria devolvida pelo destinatário | Mercadoria devolvida pelo destinatário | Cliente / destinatário |
| Não retirada no prazo (aguardando retirada) | Não retirada no prazo | Cliente / destinatário |
| Erro da/o cliente | Erro da/o cliente | Cliente / destinatário |
| Peça de outra marca recebida | Peça de outra marca recebida | Cliente / destinatário |
| Outro | Outro | A apurar (era "A definir") |

Revisão (2): `Erro de faturamento / NF (destinatário ou endereço)` (tipo ambíguo entre faturamento/NF e endereço; causador *Financeiro*) e `Erro da expedição e do financeiro` (o nome não diz o tipo; causador *Expedição e Financeiro*).

Valores iniciais das listas novas: `tipo_problema` (26), `causador` (9: Expedição, Financeiro, Comercial, Expedição e Financeiro, Correios, **Outro transportador**, Fiscalização, Cliente / destinatário, A apurar). "Outro transportador" é sugestão minha, para o caso de transportadora que não seja Correios; o admin pode desativar.

## 4. Arquivos

- [x] `supabase/migrations/20261109100000_nc_classificacao_separada.sql` (nova, local, **não aplicada** no remoto)
- [x] `src/types/index.ts` (somente declarações de NC: `ListaNc`, `LISTA_NC_LABEL`, `SITUACOES_CUSTO_NC`, `NcClassificacao`, `NcGravacao`, `NaoConformidade`)
- [x] `src/lib/ncClassificacao.ts` (novo: regras e mapeamento espelhados para o adaptador de demonstração e o schema)
- [x] `src/schemas/ncSchema.ts` (campos novos opcionais e regra de `'Não'`, com a mesma mensagem do banco)
- [x] `src/services/ncService.ts` (só a assinatura de `criar`/`atualizar`: `NcGravacao`; comportamento igual)
- [x] `src/demo/demoNcService.ts`, `src/demo/demoDatabase.ts` (somente NC: derivação e validação como no banco; listas salvas antes ganham os valores padrão)
- [x] Testes novos: `src/test/ncClassificacao.test.ts`, `src/test/demoNcClassificacao.test.ts`, `supabase/tests/nc-classificacao.test.mjs`
- [x] `supabase/SQL_EDITOR_SETUP_NC_REVERSA.sql` regenerado com `node supabase/scripts/gerar-sql-editor.mjs` (regra do projeto). Diff: **367 inserções, 0 remoções** (só a migration nova)

Não tocados: `apiService.ts`, `demoApi.ts`, navegação, layouts, notificações, autenticação, configuração, dependências, `ncPlanilha.ts` (layout preservado), `ncCalculos.ts`, páginas e componentes de NC, e todos os arquivos do outro agente.

## 5. Pendências e coordenação (entrega 1; estado atual na seção 13)

- **Migração pendente de aplicação remota:** `20261109100000_nc_classificacao_separada.sql`. Pré-requisito: `20261030120000_lixeira_chamados.sql` aplicada. Conferir o estado antes pelo roteiro de `docs/homologacao-logistica-reversa.md`. Não exige Edge Function nem publicação de frontend para funcionar, mas o formulário novo (próxima etapa) depende dela.
- **`docs/migrations.md`** precisa de uma linha para `20261109100000`. Não foi editado (documento compartilhado).
- **Pacote do SQL Editor:** regenerado. Para base existente, aplicar só a migration nova (ver `docs/migrations.md`); o pacote completo é para base anterior a todas.
- **Planilha:** exportação e importação continuam no layout de 36 colunas. Os campos novos ainda não entram na planilha; isso depende de aprovação do layout.
- **Tela de listas:** `NcListasPage` tem a lista fixa `LISTAS` com as listas antigas. Os valores novos existem no banco e na demonstração (a demonstração agora mostra também as áreas padrão, antes vazias), mas a tela só os exibirá quando `tipo_problema` e `causador` forem incluídas.
- **Painel e dashboard:** ainda contam por `origem` (ver seção 7).

## 6. Verificações (entrega 1)

**Ambiente:** Windows 11; as duas shells (Bash e PowerShell) estão **elevadas** (grupo Administradores ativo).

| Verificação | Resultado |
|---|---|
| `npx tsc -b` | **Passa** (exit 0) |
| Vitest direcionado (ncClassificacao, demoNcClassificacao, ncSchema, ncCalculos, ncPlanilha, demoNcUuid, integration) | **87 passam, 0 falham** |
| Vitest completo (708 testes, 70 arquivos) | 398 passam, 310 falham em 34 arquivos. **Nenhum arquivo de NC ou de demonstração de NC falha.** As falhas estão em autenticação, navegação, contador de aprovações e fila: área em andamento do outro agente. Ao rodar isolados, `apiService`, `authService`, `DefinirSenhaPage`, `UsuariosPageConvite` e `authServiceConvite` passam (99/99). `perfil.test.ts` (navegação, `AdminLayout`/`FlowNav`, não alterados por mim) falha também isolado; não toquei em `perfil.ts`. A/B: com a minha linha da demonstração revertida, os cinco arquivos de demonstração e navegação têm o mesmo resultado. Não investiguei a causa das falhas no conjunto completo. |
| **Suíte oficial de banco** (`supabase/tests`, `npm test`, PostgreSQL embarcado) | **BLOQUEADA pelo ambiente.** O PostgreSQL embarcado recusa iniciar porque o processo roda com privilégio administrativo ("Execution of PostgreSQL by a user with administrative permissions is not permitted"). Não contornei. Não há PostgreSQL local nem Docker. Nenhum banco remoto foi usado. |
| **Verificação complementar** com PGlite 0.5.15 (PostgreSQL **18.6** em WASM; o alvo é o 17 do Supabase) | Motor sem privilégio, só para validar SQL e regras. Não substitui a suíte oficial. |
| ↳ `nc-classificacao.test.mjs` (novo) | **18/18 passam**, cobrindo base legada preservada, mapeamento, custo, listas, permissões (RLS), vínculos, histórico e reexecução da migration. |
| ↳ Sensibilidade do teste | Duas expectativas alteradas de propósito em uma cópia: **as duas falhas são detectadas**. |
| ↳ `banco.test.mjs`, grupos de NC e SQL Editor | 6 de 9 passam, **com o mesmo resultado antes e depois da migration**. Os 3 que falham não dependem da migration: um contrato compara `bigint` como texto (`'0'`) e como número (`0`), e dois cenários dependem de uma reversa vinculada que não foi criada no adaptador. |
| ↳ `banco.test.mjs`, suíte completa (76 testes) | 35 passam antes e depois, com **o mesmo conjunto de 93 linhas de falha**. Causa: o adaptador usa uma conexão só, e os testes de concorrência usam duas, o que deixa a transação abortada e contamina os blocos seguintes. Não é a migration. |
| ↳ Pacote do SQL Editor | Executa com a migration nova. O contrato final confere, exceto a diferença de `bigint` acima. |
| `oxlint` | **BLOQUEADO pelo ambiente:** a Application Control do Windows impede o binding nativo `oxlint.win32-x64-msvc.node`. Não rodei lint. |
| `vite build` | Não executado (não exigido; `tsc -b` cobre os tipos). |

Scripts de apoio ficam fora do repositório, no scratchpad: `C:\Users\tiago\AppData\Local\Temp\claude\163ae6e5122c4148\c1300463-ab5e-46f7-9241-7da9b204d3ea\scratchpad\diag\banco-pglite.mjs` (adaptador PGlite) e `...\diag\construir-suite2.mjs` (monta as cópias antes/depois da suíte).

**Quando rodar a suíte oficial** (em máquina sem privilégio administrativo): `cd supabase/tests && npm test`. Esperado: `nc-classificacao.test.mjs` 18/18 e `banco.test.mjs` sem falhas novas em relação à linha de base de 186 testes da memória do projeto.

## 7. Contrato de dados para o formulário simplificado (entrega 1; atualizado na seção 12)

**Leitura:** `ncService.listar()` / `obter()`, de `vw_nao_conformidades` (tipo `NaoConformidade`).
**Gravação:** `ncService.criar(NcGravacao)` / `atualizar(id, Partial<NcGravacao>)`, em `nao_conformidades`. `NcGravacao` = `NcCampos` + `NcClassificacao`.
**Validação:** no banco (triggers, CHECK e RLS). O formulário e a demonstração usam as mesmas regras e mensagens (`validarClassificacaoNc`, `derivarClassificacao`, `ncSchema`).

### Campos da classificação

| Campo | Valores | Obrigatório no formulário novo (recomendação) | Padrão sugerido |
|---|---|---|---|
| `tipo_problema` | lista `tipo_problema` | sim | nenhum |
| `causador` | lista `causador` | sim (use "A apurar" quando não souber) | nenhum |
| `area_registro` | lista `area` | sim | nenhum |
| `area_tratativa` | lista `area` (inclui "A definir") | recomendado | "A definir" (nunca pessoa) |
| `custo_situacao` | `Sim` \| `Não` \| `Em apuração` | sim | `Em apuração` |

O banco aceita nulo nesses campos nesta etapa, para o formulário atual continuar gravando.

### Regras que o formulário novo deve refletir

- Valor só de lista. Desativado continua aceito em registro antigo, mas o formulário deve oferecer só os ativos.
- Custo vazio é **não informado**: nunca zero, nunca "Não".
- `Não` só com custos e reembolso vazios ou zero. Com valor, o banco recusa e o formulário deve avisar antes.
- Mudar a situação **não apaga valores**: se a situação muda, nenhum valor preenchido pode ficar vazio na mesma gravação. Para zerar um valor, grave em operação separada.
- A situação não volta a vazio depois de informada.
- Nenhum responsável individual: a tratativa é sempre área.

### Restrição importante: `origem` ainda é necessária

O **painel** (`ncsDoPeriodo`, `calcularPainelNc`, dashboard) conta só NC com `origem` preenchida, e a própria tela avisa isso. A **fila de aprovação** mostra `nc_origem`. Até o painel e a fila migrarem para `tipo_problema` e `causador`, **o formulário novo precisa continuar gravando `origem`** (senão a NC sai do painel).

### Derivação ao gravar

- INSERT com `origem` e sem tipo/causador: o banco preenche com o mapeamento inequívoco (seção 3). Valor informado nunca é sobrescrito.
- Mudança de `origem` depois da gravação: só preenche campos vazios. **Um tipo já gravado não acompanha a nova origem.** Por isso o formulário novo deve gravar tipo e causador explicitamente.

### Leitura (`vw_nao_conformidades`)

- Campos novos: `tipo_problema`, `causador`, `area_registro`, `area_tratativa`, `custo_situacao`, `classificacao_pendente`.
- `classificacao_pendente` = tipo ou causador vazio. Use para a fila de revisão.
- Legado, sem alteração: `origem`, `area_responsavel`, `evitavel`, `custo_total`, `custo_liquido`, `dias_em_aberto`, `qtd_reversas`, `codigo`.
- **Não use `area_responsavel` como área de tratativa.** Ela é derivada da origem e equivale ao causador legado.

### Vínculos e permissões

- NC sem reversa e reversa sem NC são válidas. Classificar a NC não altera a reversa.
- `solicitacoes_reverso.setor` é o setor usado na aprovação do reverso. Não derive esse campo da NC.
- Escrita: tela `nc-edit` ou mestre (RLS). Leitura: `nc` ou `nc-edit` ou mestre. Listas: administrador.
- `ncs_para_reversa` continua devolvendo só identificação, sem custos nem campos novos.

### Fora desta etapa (próxima)

- Formulário simplificado (usar o contrato acima).
- `NcListasPage`: incluir `tipo_problema` e `causador` em `LISTAS`.
- Painel e dashboard por tipo e causador (e então dispensar `origem` nos novos registros).
- Quadro de acompanhamento (usar `classificacao_pendente` e `custo_situacao`).
- Planilha: decidir se os campos novos entram no layout de 36 colunas.

## 8. Mapeamento de dados existentes (o que a migração faz)

- Tipo e causador: preenche só vazios, só pelo mapeamento inequívoco. Nas bases já em uso, registros antigos ganham essas duas colunas e uma linha na linha do tempo ("Dados atualizados: Tipo do problema, Origem / causador").
- `custo_situacao`: `Sim` onde há custo positivo; o resto fica nulo.
- Nenhum valor, origem, status, empresa, número, importação, histórico antigo, vínculo ou `setor` é alterado. A migration é idempotente (reexecução testada).

---

## 9. Entrega 2: pedido e decisões de desenho

**Pedido:** abertura simplificada de NC na aplicação principal; origem resolvida para registros novos (sem origem composta inventada); custos e edição sem apagar dados; tipo e causador na administração de listas; verificação em desktop e celular. Sem o quadro de acompanhamento.

Decisões (a confirmar onde indicado na seção 13):

- **Registro novo** (não importado) exige tipo do problema e origem / causador. O banco recusa a gravação sem eles. Importação da planilha (`importada = true`, admin) segue como antes.
- **"Outro" exige descrição** no banco e no formulário. Registro antigo sem descrição continua editável enquanto tipo e descrição não mudam.
- **Tipo e causador não voltam a vazio** depois de informados (banco e formulário).
- **Painel e totais** contam NC com classificação: origem antiga, ou tipo e causador. Cada tabela reconcilia com o total; registros novos aparecem como "Sem origem antiga (registro novo)" nas tabelas que dependem da origem antiga.
- **% evitáveis** usa só registros com evitável (origem antiga). Registro novo não entra no numerador nem no denominador.
- **Área que registrou e área de tratativa não são perguntadas na abertura.** O sistema não conhece a área de quem registra (o usuário não tem área cadastrada), então não há contexto confiável para preencher. Ficam em "Detalhes opcionais": em branco = não informada / não atribuída. Nenhuma área ou pessoa é atribuída sozinha.
- **"Houve custo?" começa sem resposta** (obrigatório), para não presumir "Em apuração" nem "Não".
- **Ocultar o bloco de custo com "Não"** só acontece sem valor positivo. Com valor positivo, o bloco fica visível e o conflito é explicado; nada é apagado.
- **Mudança de situação que apagaria valor** é recusada na gravação. Para fazer isso, duas gravações manuais: primeiro apague os valores mantendo a situação atual e salve; depois marque "Não" e salve.

## 10. Implementado (entrega 2)

- **Banco:** migration `20261109120000_nc_registro_classificacao.sql`: regra de registro novo (tipo e causador), "Outro" com descrição, tipo e causador que não voltam a vazio, e `ncs_para_reversa` devolvendo tipo e causador (sem custos). `supabase/tests/banco.test.mjs`: 3 inserts de NC com origem "Outro" receberam descrição (ajuste à regra nova; os asserts são os mesmos).
- **Pacote do SQL Editor:** regenerado com o script do projeto (36 migrations; 465 linhas acrescidas, 0 removidas).
- **Tipos** (`src/types/index.ts`, só NC): `ListaNc` com `tipo_problema` e `causador`; `NcOpcaoReversa` com tipo e causador opcionais.
- **Regras:** `src/lib/ncClassificacao.ts` (mensagens e ordem do banco, `temClassificacao`), `src/lib/ncFormulario.ts` (conversão registro ↔ formulário, regras de exibição dos custos, texto do conflito), `src/schemas/ncSchema.ts` (origem opcional; `ncAberturaSchema`).
- **Telas:** `src/pages/NcFormPage.tsx` roteia `nova` (abertura) e `:id` (registro completo). Novo `src/components/nc/NcAbertura.tsx` (abertura). `src/components/nc/NcCampo.tsx` (blocos de layout compartilhados, extraídos sem mudança visual). `NcListPage` (colunas tipo / causador / tratativa, filtros novos, origem antiga como informação secundária). `NcPainelPage` (tabelas de classificação, rótulos, nota de contagem). `NcListasPage` (tipo do problema e origem / causador; origens antigas rotuladas como histórico).
- **Cálculos e exportação:** `src/lib/ncCalculos.ts` (critério de contagem, tabelas novas, % evitáveis), `src/lib/ncFiltros.ts` (novo, filtros testáveis), `src/lib/ncRelatorioMensal.ts` (3 colunas novas no detalhe). Planilha: layout de 36 colunas inalterado.
- **Demonstração:** `src/demo/demoNcService.ts` (mesmas regras do banco; total de custo vazio quando não há valor, como no banco; opções de reversa com tipo e causador), `src/demo/fixtures.ts` (NCs 2404 e 2405 no formato novo, sem origem antiga). Listas padrão já tinham sido completadas na entrega 1.
- **Estilos:** `src/styles/nc.css` (abertura, escolha de custo, detalhes, origem antiga; painel no celular). A correção do painel é só para `.nc-page`; o layout global (`design.css`) não foi alterado.
- **Testes:** `src/test/NcFormPage.test.tsx` (novo), `src/test/ncFormulario.test.ts` (novo), `src/test/ncRegistroNovo.test.ts` (novo), `src/test/ncClassificacao.test.ts` (ajustado e com bloco de registro novo), `src/test/demoNcClassificacao.test.ts` (reescrito para a regra nova), `src/test/ncSchema.test.ts` (origem não é mais obrigatória), `src/test/demoNcUuid.test.ts` (opções de reversa da Alinare: são 3 agora, pelas NCs novas da demonstração), `supabase/tests/nc-classificacao.test.mjs` (regras novas e `ncs_para_reversa`).
- **Não alterados:** `apiService.ts`, `demoApi.ts`, navegação (`App.tsx`, `FlowNav.tsx`, `AdminLayout.tsx`), layouts, notificações, autenticação, contador, documentos do agente 1 e `ncPlanilha.ts`.

## 11. Testado (resultados reais, 9 de novembro de 2026)

| Verificação | Resultado |
|---|---|
| `npx tsc -b` | Passa (exit 0) |
| Vitest, 9 arquivos de NC e demonstração (`ncSchema`, `ncCalculos`, `ncPlanilha`, `ncClassificacao`, `demoNcClassificacao`, `demoNcUuid`, `ncFormulario`, `ncRegistroNovo`, `NcFormPage`) | **123 de 123 passam** |
| Banco, `nc-classificacao.test.mjs` (novo e ajustado), no PGlite 0.5.15 (PostgreSQL **18.6** em WASM; o alvo é 17) | **25 de 25 passam**: regras de registro novo, "Outro", tipo e causador que não voltam a vazio, importação preservada, `ncs_para_reversa` sem custos, `anon` negado, reexecução da cadeia |
| Banco, `banco.test.mjs`, grupos de NC e SQL Editor, mesmo adaptador | 6 de 9 passam, **igual ao resultado anterior à entrega 2**. As 3 falhas são de adaptador (conexão única) e diferença de `bigint` no contrato, não da regra nova |
| Suíte oficial de banco (embedded PostgreSQL) | **Bloqueada pelo ambiente**: as shells estão elevadas e o PostgreSQL recusa iniciar. Não contornei. Rodar em máquina não elevada antes de aplicar |
| `oxlint` | **Bloqueado**: a Application Control do Windows impede o binding nativo |
| Suíte completa do Vitest | **Não repetida** nesta entrega (instrução: o agente 1 está editando). A rodada completa da entrega 1 teve 310 falhas fora de NC (autenticação, navegação, contador, convites); não reproduzem isoladas, e não atribuí causa |

**Visual (demonstração no Edge, Vite local em modo demonstração, Supabase substituído por valores inertes; sem chamadas remotas):**

- **Desktop, abertura vazia:** perguntas essenciais, data de hoje sugerida, detalhes fechados, botão "Registrar ocorrência". Visto na captura.
- **Desktop, "Sim" com um custo:** campo de produto aparece, total mostra R$ 95,00, campos vazios ficam vazios. A explicação "em branco não é zero" aparecia três vezes; corrigido para uma vez (conferido no DOM: 1 ocorrência).
- **Desktop, registro criado (NC-2406):** navegou para o registro, aviso "NC-2406 registrada.", tipo e causador corretos, tratativa "Não atribuída", custo R$ 95,00. Visto na captura.
- **Desktop, lista:** registros novos com tipo, causador e tratativa; registros antigos da demonstração com "Não informado" e "Origem antiga: Erro de separação" (correto: pedem classificação). A tabela de 12 colunas rola na horizontal dentro da própria tabela, como antes. Visto na captura.
- **Desktop, painel:** as tabelas de classificação listavam 26 tipos, quase todos zero. Corrigido: só valores com registro, total completo (conferido no DOM: total 5; "Sem tipo (a revisar)" = 3). Visto na captura antes da correção.
- **Celular, abertura:** coluna única, sem rolagem horizontal (medido: largura 390, rolagem 390), botão visível. Visto na captura.
- **Celular, painel:** tinha rolagem horizontal de 814 px. Corrigido só para `.nc-page` (medido depois: rolagem 390). Visto após a correção: cabe na tela.
- **Celular, lista:** sem rolagem horizontal da página (medido).
- **Administração de listas (mestre):** no DOM, tipo do problema 26 valores, origem / causador 9, áreas 8, com campo para novo valor. **Não revisei a captura desta tela.**

**Observado, fora do escopo de NC:**

- A barra de navegação global fixa cobre conteúdo nas capturas de página inteira (agente 1 / layout). Não investiguei.
- O 404 no console é `http://localhost:5199/favicon.ico`: `public/` não tem favicon e o `index.html` não declara ícone. Pré-existente.

## 12. Contrato de dados (entrega 2; substitui a seção 7 onde diferir)

- **Abertura grava:** `empresa`, `data_ocorrencia`, `cliente` (opcional), `tipo_problema` (obrigatório), `causador` (obrigatório; inclui "A apurar"), `descricao` (obrigatória se tipo "Outro"), `custo_situacao` (obrigatório, sem padrão), campos em reais só com "Sim" ou "Em apuração" (vazio = não apurado, não zero), `status` = Aberta, `origem` = nulo. `area_registro` e `area_tratativa` só se informadas.
- **Registro completo:** mostra e grava todos os campos. Origem antiga é somente leitura. Tipo e causador de registro antigo podem ficar vazios até serem informados, mas, depois de informados, não voltam a vazio.
- **Campos que o formulário não mostra** (NF, romaneio, rastreio, etc.) continuam no estado e são gravados como estavam: testado por ida e volta do registro.
- **Listas:** `tipo_problema`, `causador`, `area` (inclui "A definir"). Valores desativados seguem válidos nos registros antigos e aparecem como inativos na administração.
- **Lista, painel e totais:** uma NC conta se tiver origem antiga ou tipo e causador. Tabelas de classificação não listam valores sem registro; o total é sempre completo.
- **Planilha:** layout de 36 colunas inalterado. Registro novo sai com origem, área e evitável vazios (sem invenção). Campos novos ainda não entram na planilha.
- **Relatório mensal:** inclui tipo do problema, origem / causador e situação do custo no detalhe.

## 13. Pendente e pontos para coordenação

**Consumidores fora do escopo de NC (não editados):**

1. `src/components/forms/ReverseLogisticsForm.tsx:421`: o rótulo da NC na reversa mostra só `o.origem`. Registros novos aparecem sem tipo. Ajuste sugerido: mostrar `o.tipo_problema` quando não houver `o.origem`. O campo já chega de `ncs_para_reversa` e está em `NcOpcaoReversa`.
2. **Fila de aprovação (agente 1):** `supabase/migrations/20261030120000_lixeira_chamados.sql`, função `fila_aprovacao_reversas` (linhas 293–340), devolve `nc.origem` como `nc_origem`. Registro novo chega sem origem. `src/pages/ApprovalQueuePage.tsx:683–686` mostra `record.nc_origem`; `src/services/apiService.ts:602–636` mapeia o campo. Ponto de coordenação: a função poderia devolver também tipo e causador. Não alterado.
3. **`src/demo/demoApi.ts:323–325` (proibido para mim):** `nc_origem` fixo em "Erro de separação" e descrição fixa. A fila de aprovação da demonstração não reflete NC novas. Coordenar com o agente 1.
4. `docs/migrations.md`: faltam as linhas de `20261109100000_nc_classificacao_separada.sql` e `20261109120000_nc_registro_classificacao.sql`. Não editado (documento compartilhado).

**Migrações pendentes de aplicação remota** (nesta ordem; ainda não aplicadas): `20261109100000_nc_classificacao_separada.sql` e `20261109120000_nc_registro_classificacao.sql`. Pré-requisito: `20261030120000_lixeira_chamados.sql` aplicada. Nenhuma Edge Function nova. Antes de aplicar: suíte oficial de banco em máquina não elevada. A migration nova altera a assinatura de `ncs_para_reversa` (drop e create); o formulário de reversa atual lê os campos novos de forma opcional.

**Decisões de negócio a confirmar:**

- (a) "Outro transportador" entrou em causador. Não estava nos seus exemplos.
- (b) "Evitável" de registro novo: hoje não se calcula; o percentual usa só registros antigos.
- (c) Área de registro e área de tratativa: hoje são opcionais e vazias por padrão. Se virarem obrigatórias, falta uma fonte confiável de contexto (por exemplo, a área do usuário no cadastro).
- (d) Campos novos na planilha: exigem novo layout.
- (e) Painel não tem quebra por área de registro.
- (f) Demonstração: a tela de listas mostra as áreas padrão (antes estavam vazias), e o custo total vazio aparece como traço ou "A apurar", não R$ 0,00.

**Riscos e limites:**

- Verificação de banco feita em PostgreSQL 18 (PGlite); o alvo é 17. A suíte oficial não rodou aqui.
- Lint (`oxlint`) não rodou aqui.
- Conferência visual da administração de listas feita só no DOM.
- Pontos de estilo global (`.chart-grid` em `design.css`) não alterados; a correção de celular está só em `.nc-page`.

## 14. Notas de teste

- `vi.restoreAllMocks()` no `afterEach` dos testes de componente desfazia os mocks de módulo de sessão e de contexto quando os arquivos rodavam juntos (falha "useAuth deve ser usado dentro de AuthProvider"). Agora só são restaurados os espiões criados no próprio arquivo.
- Os testes de componente usam a demonstração real (sem serviços remotos): `NcReversas` e `NcLinhaDoTempo` ficam mockados, porque chamam `apiService` e `ncService`, que não são o assunto desses testes.

## 15. Revisão de leitura (entrega 2): somente leitura

Revisão de 9/11/2026 sobre o código e os resultados da entrega 2. Nenhum código, migração ou teste foi alterado; a suíte completa e a verificação visual não foram rodadas. Os dados são fictícios. O roteiro está fora do repositório (`C:\Users\tiago\AppData\Local\Temp\claude\163ae6e5122c4148\c1300463-ab5e-46f7-9241-7da9b204d3ea\scratchpad\revisao\exemplos4.ts`, empacotado com o esbuild do projeto e executado com Node). Resultado: 39 verificações; 9 conferem, 23 defeitos, 6 propostas e 1 hipótese.

Classificação: **defeito confirmado** é requisito descumprido, reproduzido no roteiro ou pela leitura do código; **proposta** é decisão ou melhoria; **hipótese** é mecanismo confirmado com efeito não reproduzido. O comportamento do banco foi lido no SQL de `supabase/migrations/20261109100000_nc_classificacao_separada.sql`, não executado nesta revisão.

### Dados fictícios (Alinare e Novitah, outubro/2026)

| NC | Empresa, data | Classificação | Situação | Custos |
|---|---|---|---|---|
| 0901 | Alinare, 03/10 | origem antiga "Erro expedição – endereço incorreto"; tipo Endereço incorreto; causador Expedição | Sim | produto 100 |
| 0902 | Alinare, 05/10 | Extravio; Correios | Não | vazios |
| 0903 | Alinare, 07/10 | Mercadoria devolvida pelo destinatário; Cliente / destinatário | Em apuração | vazios |
| 0904 | Novitah, 09/10 | origem antiga "Outro" (evitável "A avaliar"); tipo Outro; causador A apurar | vazia | vazios |
| 0905 | Novitah, 12/10 | Atraso de postagem; Expedição | Sim | produto 0, frete 40, multa vazia |
| 0906 | Alinare, 15/10 | sem tipo; causador Comercial (fora dos painéis) | Em apuração | vazios |
| 0907 | Alinare, 20/10 | sem classificação (fora dos painéis) | vazia | vazios |
| 0908 | Alinare, 22/10 | Extravio; Correios | Sim | vazios (Sim sem valor) |
| 0909 | Alinare, 23/10 | Extravio; Correios | Não | produto 0, frete 0 (zeros digitados) |
| 0910 | Alinare, 25/10 | legado e novo, todos os campos preenchidos; descrição com `<b>`; cliente com espaço no fim | Sim | produto 0, frete 40, reembolso 20 |

O código sai como `NC-0901` (`codigoNc`). Os números abaixo são os da tabela.

### 1. "Não", "Sim sem valor" e "Em apuração" distinguíveis

- **Defeito confirmado, lista.** NC-0902, 0903, 0904 e 0908 mostram "—" na coluna de custo, e a lista não tem coluna nem filtro de situação (`src/pages/NcListPage.tsx:213`). Esperado: "Sem custo", "A apurar", "Não informada" e "Valor não informado", com a situação em coluna própria.
- **Defeito confirmado, detalhe (parcial).** A situação aparece no campo "Houve custo?", mas o total mostra "A apurar" tanto para 0908 (Sim sem valor) quanto para 0903 (Em apuração) (`src/lib/ncFormulario.ts:86–93`). Esperado: "Valor não informado" para 0908. Proposta: "Sem custo" para 0902 (Não).
- **Defeito confirmado, painel (tabela por situação).** "Em apuração" e "Não informada" mostram "R$ 0,00", porque a soma de um grupo sem valor vira zero (`src/lib/ncCalculos.ts:153–154` e `:246`). Esperado: "—". "Não" também mostra "R$ 0,00" (proposta: "Sem custo"). "Sim" mostra "R$ 140,00" sem dizer que só 2 de 3 têm valor (proposta).
- **Defeito confirmado, painel (indicadores).** Valor reembolsado mostra "R$ 0,00" sem nenhum reembolso informado (`ncCalculos.ts:229`); esperado "—". Custo líquido médio mostra "R$ 23,33", ou seja, 140 divididos pelas 6 registradas (`ncCalculos.ts:231`). Isso trata as NCs sem custo como zero; esperado "R$ 70,00" (140 divididos pelas 2 com custo informado). Custo total "R$ 140,00" sem cobertura: proposta, "informado em 2 de 6".
- **Defeito confirmado, planilha REGISTRO_NC.** "Custo total" fica vazio para 0902, 0903, 0904 e 0908: são indistinguíveis. O layout de 36 colunas não tem situação, e `src/lib/ncPlanilha.ts` está igual ao HEAD. Decisão de layout pendente (item d).
- **Defeito confirmado, mesma resposta com duas representações.** Um "Não" com zeros digitados (0909) mostra "R$ 0,00" na lista e entra em "NCs com custo informado" do relatório (1; esperado 0). Um "Não" com campos vazios (0902) mostra "—". Zero é valor, vazio é ausência. Proposta: para "Não", gravar os custos vazios; a situação é que informa "não houve custo".
- **Conferido.** No relatório, detalhe, a coluna "Situação do custo" distingue os quatro casos. No resumo, Alinare em outubro tem custo total 100 e 1 NC com custo informado.

### 2. Percentual de evitáveis

- **Defeito confirmado.** O KPI mostra só "50%". Não mostra a base (1 de 2 com origem antiga) nem as contagens de classificação desconhecida (a avaliar: 1; sem origem antiga: 4). O rótulo "(origem antiga)" cumpre em parte o pedido, mas a escala não aparece (`src/pages/NcPainelPage.tsx:155`; `ncCalculos.ts:202` e `:227`).
- **Decisão (proposta).** O denominador conta "A avaliar" (`ncCalculos.ts:202`). Excluindo, o resultado seria 1 de 1 = 100%, com "a avaliar: 1" ao lado. A fórmula de PAINEL_NC da planilha original não está no repositório (citada em `ncCalculos.ts:2`). Conferir antes de decidir a paridade.

### 3. Relatório mensal

- **Defeito confirmado, posições.** No layout anterior (commit HEAD), Status estava em F e Custo total em J. Agora F é Tipo do problema, I é Status, J é Custo do produto e M é Custo total: oito colunas de A a M mudaram de letra (`src/lib/ncRelatorioMensal.ts:46–63`). A soma da coluna J no mês dá 100; quem lê J como custo total esperaria 140. Efeito em consumidores externos: hipótese. O arquivo é gerado só com valores, sem fórmulas, e não há consumidor identificado no repositório.
- **Defeito confirmado, contagem.** Alinare em outubro: "NCs registradas" é 6 no relatório e 4 no painel; com todas as empresas, 8 e 6. O relatório conta tudo (`ncRelatorioMensal.ts:33`); o painel só conta classificadas (`ncCalculos.ts:157–166`). O relatório não diz isso (só a dica do painel). Já existia para registros sem origem; agora atinge os registros novos.
- **Conferido.** A aba "Resumo por empresa" mantém os mesmos cabeçalhos. A planilha tem 36 colunas do layout mais "Reversas geradas" (37 na exportação, `ncPlanilha.ts:287`). O teste do relatório lê por nome de coluna (`src/test/ncRegistroNovo.test.ts:161–167`), não por posição.
- **Diferenciação.** Os nomes de arquivo (`relatorio_mensal_nc_…` e `nao_conformidades_…`) e de abas já são distintos. Ainda assim, "Origem", "Status" e "Custo total" têm nomes parecidos e posições diferentes nas duas. Proposta: notas numa aba extra no fim, sem linha acima do cabeçalho.

### 4. Correção de custo (duas gravações)

- **Defeito confirmado, texto.** `MENSAGEM_CONFLITO_NAO` (`src/lib/ncFormulario.ts:17–18`) manda "apagar os valores mantendo a situação atual". Com "Não" já escolhido, a frase é ambígua e não diz para voltar o campo a "Sim" ou "Em apuração". O aviso aparece assim que "Não" é escolhido com valor (`src/pages/NcFormPage.tsx:485`). O efeito no usuário é hipótese, não observado.
- **Defeito confirmado, perda de valor pelo caminho do zero.** Digitar 0 em vez de apagar, com "Não", passa em uma gravação: 0901 de 100 para 0 com "Não" é aceito. A regra só barra valor que vira nulo (`src/lib/ncClassificacao.ts:222`; trigger `nc_validar_custo_situacao`, migração, linhas 181–193). O histórico grava só o rótulo "Dados atualizados: Custo — produto" (linhas 303–313). O valor 100 se perde, e não encontrei outro lugar que o guarde. O caminho do zero é mais perigoso que o de apagar, e a mensagem manda apagar.
- **Conferido.** Apagar e trocar para "Não" na mesma gravação é recusado com a mensagem certa. "Não" com frete de 40 é recusado no campo "Houve custo?", antes de gravar, com `MENSAGEM_CUSTO_NAO_COM_VALOR` (`src/schemas/ncSchema.ts:108–110`). Era a pendência do passo anterior: comportamento correto.

#### Proposta: uma ação, sem apagamento automático

1. Ao escolher "Não" com valores, o bloco de custo lista os valores atuais e oferece "Confirmar: não houve custo". Nada é gravado sem o clique.
2. A ação chama uma função do banco (ex.: `nc_corrigir_custo_para_nao`), com a checagem de permissão de edição (`pode_editar_nc`). Numa transação: registra no histórico o valor anterior e o novo de cada campo de custo e do reembolso; marca "Não"; anula os campos de custo e o reembolso.
3. O trigger recusa a troca para "Não" com valores anteriores, salvo quando ela vem dessa função. Isso fecha o caminho do zero (4.2).
4. Decisões do usuário: (a) motivo obrigatório na correção? (b) "Não" grava vazio (recomendado, para não contar como custo informado) ou zero?

Preserva valores (no histórico), integridade (o banco decide), histórico (com o valor antigo) e não apaga nada sem confirmação. Exige migração nova (trigger e histórico), não só tela. Descartado: "Limpar valores" como gravação separada, por ser duas gravações automáticas, vedado no pedido.

### 5. Edição preserva os campos persistidos

- **Defeito confirmado (pré-existente).** Texto que o usuário não alterou é regravado sem tags e sem espaços nas pontas: "Cliente pediu `<b>troca</b>` urgente" vira "Cliente pediu troca urgente" (0910), e "Ateliê Aurora " vira "Ateliê Aurora". `semTags` (`src/schemas/ncSchema.ts:14`) já existia no HEAD e roda em todo texto a cada gravação (`texto()`, linhas 17–22). A seção 12 (linha 256) diz que campos não exibidos são gravados como estavam: vale para texto comum, não para estes casos.
- **Conferido.** Custos ocultos com "Não" e zeros são regravados como estavam ([0, 0, null]). Origem legada, tipo, causador, áreas e situação entram na gravação.
- **Hipótese (mecanismo confirmado).** A gravação envia os 34 campos com os valores carregados. Se duas sessões editam a mesma NC, a segunda sobrescreve o que a primeira gravou nos campos que não mudaram: simulado, o NF-7788 gravado pela sessão A volta a vazio na gravação da sessão B. Confirmar com teste de concorrência.
- **Defeito leve.** Os selects de tipo, causador, áreas e situação têm sempre a opção vazia. Escolhê-la num registro que já tem valor é recusado depois de salvar, com "O tipo do problema não pode voltar a ficar sem informação." (`src/lib/ncClassificacao.ts:157`, verificado no tipo; causador e situação seguem a mesma regra, lida no código e não testada).

#### Propostas

- Enviar só o que mudou, e limpar tags só no que foi digitado.
- Condição de versão (`updated_at`) na gravação, com aviso "esta NC foi alterada; recarregue".
- Ocultar a opção vazia dos selects quando já há valor.

### 6. Propostas de rótulos, painel e relatório

- Lista e detalhe: "Sem custo" (Não), "A apurar" (Em apuração), "Valor não informado" (Sim sem valor), "Não informada" (vazia) e o valor formatado. "Parcial" só se for decidido que o total deve sinalizar componente vazio (muitos registros ficariam parciais).
- Painel: "—" para grupo sem valor; média sobre as NCs com custo informado, com o número na legenda; "informado em X de Y" no custo total; base e contagens no evitável.
- Relatório: manter A–M; acrescentar "Tipo do problema", "Origem / causador" e "Situação do custo" depois de "Reversas vinculadas" (colunas N, O e P); no resumo, acrescentar "NCs classificadas" e "NCs sem classificação" no fim, sem renomear colunas.
- Planilha: decidir se "Situação do custo" entra no fim. A leitura da planilha casa por nome de cabeçalho (`ncPlanilha.ts:138`); conferir como trata coluna desconhecida antes de decidir.

### 7. Correções antes da verificação conjunta

1. Lista: situação do custo visível e rótulos distintos (item 1).
2. Painel: "—" no lugar de R$ 0,00 em grupos e reembolso sem valor; média sobre NCs com custo; cobertura do custo total.
3. Painel: base e contagens do evitável; denominador decidido com a fórmula da planilha original.
4. Relatório: restaurar A–M; acrescentar as três colunas no fim; acrescentar contagens de classificadas e sem classificação; mesma definição de "NCs registradas" no relatório e no painel.
5. Correção de custo: trocar o texto do aviso; fechar o caminho do zero (exige migração; decisões (a) e (b) acima).
6. Edição: não regravar texto não alterado; enviar só o que mudou.
7. Selects: sem opção vazia quando já há valor.
8. Documentação: o cabeçalho de `src/schemas/ncSchema.ts` (linhas 4–5) ainda diz que origem é obrigatória; a seção 12 (linha 256) e a seção 13, item (f), precisam de ressalva (o total de uma NC mostra "—" ou "A apurar", mas os agregados mostram R$ 0,00).
9. Não verificado nesta revisão: execução no banco, suíte completa, verificação visual e lint.

## 16. Correções da rodada 3 (itens 1 a 4 da seção 15)

Implementadas nesta rodada. Este bloco substitui a seção 12 onde diferir (base do painel e rótulos de custo) e o item (f) da seção 13 (agora o total vazio pode ser "Valor não informado" ou "A apurar", conforme a situação; nos agregados nunca é R$ 0,00). Nenhuma migração, tipo compartilhado, API do Reverso, navegação, notificação ou arquivo do agente 1 foi alterado.

### Implementado

- **Regra única de situação e valor** em `src/lib/ncCustos.ts` (novo). É usada no detalhe (`NcFormPage`), na abertura (`NcAbertura`, por `rotuloCustoTotal`), na lista (`NcListPage`), no painel (`ncCalculos` e `NcPainelPage`) e no relatório (`ncRelatorioMensal`).
  - Rótulos: "Não" → "Sem custo" (valores gravados ficam como estão); "Sim" sem valor → "Valor não informado"; "Em apuração" sem valor → "A apurar"; situação ausente → "Não informado".
  - Com valor: o total aparece com "(parcial)" quando há campo em branco, "(em apuração)" e "(situação não informada)" quando couber. Zero digitado continua zero.
  - Reembolso: em branco é "Não informado" (no campo, com a dica "vazio não é zero"); zero informado é "R$ 0,00". Com total e reembolso em branco, aparece "reembolso não informado" ao lado do líquido.
- **Lista:** a situação entra em linha pequena dentro de "Custo líquido", sem coluna nova (a tabela não ficou mais larga). Novo filtro "Custo" com seis opções: todos, sem custo, valor não informado, a apurar, com valor registrado, situação não informada. "Todos os custos" não conta como filtro ativo.
- **Painel:**
  - A base é todas as NCs com data no período. "Não conformidades registradas" traz as classificadas e as pendentes à parte; nenhuma NC sai da base para os números coincidirem.
  - Bloco "Cobertura do custo" com cinco categorias exclusivas, que somam o total de registradas.
  - "Custo líquido ÷ total de NCs (R$)" mantém o cálculo atual, agora com o nome e a cobertura explícitos. "Média por NC com valor (R$)" é a média entre registros com valor, com o denominador na dica.
  - Sem valor, os KPIs mostram "Não informado" (não R$ 0,00). Zero explícito continua zero.
  - Evitabilidade: numerador, denominador e contagens de Sim, Não, A avaliar e sem informação. A regra de cálculo não mudou, "A avaliar" continua no denominador.
  - Tabelas por situação, tipo, causador e demais: "Sem custo", "Valor não informado", "A apurar", "Não informado" ou "Sem valor registrado" no lugar de R$ 0,00. Com cobertura: "2 de 3 com valor · 1 parcial · 1 em apuração".
- **Relatório mensal:**
  - "Registros do mês": colunas A–M com o layout anterior, nas mesmas letras (Status em F, Custo total em J). Três colunas novas só ao final: N "Tipo do problema", O "Origem / causador", P "Situação do custo" (com o estado: "Sim (parcial)", "Em apuração (a apurar)", "Sim (valor não informado)", "Não informado").
  - "Resumo por empresa": A–H preservadas. Acrescentadas em I–P: classificadas, pendentes, sem custo, valor não informado, a apurar, sem situação e sem valor, total parcial e reembolso informado.
  - Mudança de significado documentada: "NCs com custo informado" não conta mais "Não" com zero digitado. Os totais de custo não mudaram.
  - Aba "Definições", por último, com os termos e a mudança desta versão.
- **Exportação REGISTRO_NC:** layout inalterado, 36 colunas mais "Reversas geradas". A mensagem da exportação diz isso.

### Decisões tomadas nesta rodada (revisar)

1. Pendentes de classificação entram na base do painel e do relatório. Pendente é o mesmo critério do filtro da lista (tipo ou causador em branco).
2. "A avaliar" continua no denominador do evitável, por ser a regra atual. Excluir ou não depende da fórmula de PAINEL_NC na planilha original, que não está no repositório.
3. Em "Não", os valores gravados não são alterados. Para o relatório, "Não" nunca é custo informado.
4. A situação aparece no relatório com o estado ("Sim (parcial)"). Por isso o filtro da planilha por "Sim" exato não pega esses casos.

### Achados da seção 15 e situação

| Achado | Situação |
| --- | --- |
| 1.1 lista sem situação, "—" para estados diferentes | Corrigido (linha de situação, rótulos e filtro) |
| 1.2 detalhe: "A apurar" para Sim sem valor | Corrigido ("Valor não informado") |
| 1.3 tabela por situação com R$ 0,00 sem valor | Corrigido |
| 1.4 cobertura do custo total | Corrigido (bloco de cobertura e subtítulo) |
| 1.5 reembolso sem valor como R$ 0,00 | Corrigido ("Não informado") |
| 1.6 média dividida por todas as NCs | Corrigido (nome e cobertura; média entre valores como indicador separado) |
| 1.9 planilha REGISTRO_NC sem situação | Não corrigido: exige layout novo, decisão pendente |
| 2.1 e 2.2 base e contagens do evitável | Corrigido (numerador, denominador e contagens) |
| 2.3 denominador com "A avaliar" | Decisão pendente, regra mantida |
| 3.1 e 3.2 colunas A–M deslocadas | Corrigido (restauradas; novas só ao final) |
| 3.3 soma da coluna J | Corrigido (J volta a ser custo total) |
| 3.5 "NCs registradas" diferente entre relatório e painel | Corrigido (mesma base; classificadas e pendentes separadas) |
| 4.2 zero que apaga o valor sem registro no histórico | Não corrigido: depende da ação única com histórico (pendência 1) |
| 4.3 texto ambíguo do aviso de "Não" | Não corrigido (fora do escopo desta rodada; pendência 4) |
| 4.1 e 4.0 recusas corretas | Mantidas |
| 5.1 texto não alterado regravado sem tags | Não corrigido (pré-existente; pendência 3) |
| 5.2 e 5.3 envio completo e sobrescrita concorrente | Não corrigido (pendência 2) |
| 5.5 opção vazia nos selects | Não corrigido (pendência 5) |
| 6.1 "Não" com zero digitado mostra R$ 0,00 na lista | Corrigido (mostra "Sem custo") |
| 6.2 relatório conta "Não" com zero como custo informado | Corrigido (não conta; documentado) |

### Pendências antes da liberação (não implementadas; a frente financeira não está concluída)

1. **Botão que anula custos e reembolsos.** Ação única, com confirmação, que registra no histórico o valor anterior de cada campo e marca "Não". Exige migração (trigger de custo e histórico de valores). Sem isso, digitar zero ainda apaga o valor sem registro.
2. **Edição concorrente.** Enviar só o que mudou e usar condição de versão (`updated_at`), com o aviso "esta NC foi alterada; recarregue".
3. **Texto não alterado.** `semTags` (pré-existente) remove tags e espaços das pontas em todo texto a cada gravação. Corrigir só o que foi digitado.
4. **Aviso de conflito de "Não".** A frase "mantendo a situação atual" é ambígua. Precisa dizer qual situação manter. Mudança de texto, sem alterar o comportamento.
5. **Opção vazia nos selects** de tipo, causador, áreas e situação, quando já há valor. Hoje a regra recusa depois de salvar.
6. **Quadro de acompanhamento.** Não implementado (fora do escopo).
7. **Migrações** desta frente ainda não aplicadas em ambiente remoto (ver seção 13).
8. **Decisões de negócio:** (a) motivo obrigatório ao corrigir custo para "Não"? (b) "Não" grava custos vazios (recomendado) ou zero? (c) "A avaliar" no denominador do evitável (após conferir PAINEL_NC); (d) situação na planilha REGISTRO_NC, como coluna nova no fim (exige layout); (e) em "Sim", campo em branco é "não apurado" (hoje, por isso o total fica parcial). Se for zero, a regra muda e muitos totais deixam de ser parciais.
9. **Código morto:** `src/components/nc/NcResumoDashboard.tsx` não é importado por nenhuma tela e usa a dica antiga ("Com origem informada"). Não alterado; decidir se remove.

### Verificação desta rodada

- Testes direcionados: 12 arquivos de NC, 174 testes, todos passando. Três arquivos são novos: `ncCustos.test.ts` (situação e valor, vazio e zero, parciais, reembolso, filtro, cobertura e somas), `ncRelatorioMensal.test.ts` (cabeçalhos e letras A–M, valores por linha com fixtures conhecidas, resumo, reconciliação com o painel e exportação REGISTRO_NC) e `ncFiltrosCusto.test.ts`.
- Tipos: `npx tsc -b` sem erros. Os arquivos de teste de NC foram checados com uma configuração temporária fora do repositório, sem erros nos próprios arquivos.
- Visual na demonstração (desktop 1366 e celular 390), com quatro NCs criadas pela abertura (Não, Sim sem valor, Em apuração, Sim com R$ 95,00): lista com situação e filtro, painel com cobertura e KPIs, detalhe de 2404 e 2405. Sem rolagem horizontal da página. O único erro de console é o 404 de `favicon.ico` (pré-existente).
- Números conferidos na demonstração: 9 registradas (6 classificadas e 3 pendentes); cobertura 1 sem custo, 5 com valor, 1 valor não informado, 2 a apurar, 0 sem situação; total do custo R$ 1.504,00 (parcial); reembolso R$ 0,00 com 3 NCs informadas (valor zero gravado na demonstração).
- Não executado: suíte completa (o agente 1 está editando), suíte de banco, lint e Supabase remoto.

## 17. Fechamento da edição de NC e do histórico financeiro

Esta rodada cobre a edição (gravação, versão, auditoria e ajustes de tela). O quadro de acompanhamento não foi implementado. As regras de rótulo e painel da seção 16 continuam valendo. Nenhum relatório, indicador, navegação, notificação ou API do Reverso foi alterado.

### Implementado

- **Gravar só alterações efetivas.** `src/lib/ncEdicao.ts` (novo) compara o formulário com a base carregada ou gravada, normalizando a comparação: texto sem espaços nas pontas, número em centavos, vazio como vazio. Valida só os campos alterados, com o mesmo esquema do cadastro (`ncSchemaCampos`), e as regras cruzadas que envolvem um campo alterado (`mensagensCruzadas`, extraída de `ncSchema.ts`). O envio contém só os campos alterados. Sem alteração, nada é enviado e o formulário diz "Nenhuma alteração para salvar." No banco, a função também não regrava quando nada muda.
- **Campos ocultos e texto legado** não entram no envio e não passam pela limpeza de tags. A limpeza (`semTags`) agora só age sobre o que foi digitado.
- **Edição concorrente.** Migração incremental `supabase/migrations/20261109140000_nc_edicao_versao_auditoria.sql` (nenhuma migration anterior alterada):
  - `nc_proteger_campos` redefinida só para gravar `updated_at` com `clock_timestamp()` (instante da escrita). O `now()` anterior era o início da transação, e a versão podia voltar a um valor antigo.
  - `nc_salvar_edicao(p_id, p_versao, p_campos, p_motivo)`: `security invoker` (até a migration `20261109160000`, que a passou a `security definer`, com a permissão conferida dentro da própria função; ver a atualização da consolidação ao final). Confere `pode_editar_nc()` (42501), campos fora da lista (NC003), versão ausente (NC004), NC inexistente (NC005). Trava a linha (`for update`), compara a versão (NC001 se mudou, sem gravar nada), recusa correção sem justificativa (NC002), grava só os campos enviados e devolve a linha da tabela.
  - A versão é comparada como texto com microssegundos. O driver converte `timestamptz` em `Date` e perderia precisão, então o cliente guarda o `updated_at` exatamente como veio.
  - `ncService.atualizar(id, campos, { versao, motivo })`: sem versão, recusa antes de chamar o banco. NC001 vira `ConflitoEdicaoNc`. Permissão (42501) vira mensagem em português. Sem linha atualizada, nunca é sucesso (NC005). Devolve `{ nc, gravado }`.
- **Conflito na tela.** A base de edição é separada do registro exibido. No conflito, a digitação fica, o aviso explica que outra pessoa alterou a NC, e "Consultar versão atual" mostra Campo, Você abriu, Versão atual e Sua digitação. "Reaplicar" reconcilia: o que o usuário alterou continua, e o restante recebe a versão atual. O recarregamento depois de uma reversa também reconcilia, em vez de sobrescrever.
- **Demonstração.** `demoNcService.atualizar` segue a mesma regra: permissão com `podeEditarNc(usuarioDemoAtual())`, versão conferida antes de qualquer escrita, NC002 e NC003, e trilha. A versão nova é sempre maior que a anterior (a demonstração grava em milissegundos).
- **Auditoria financeira.** `nc_auditoria_financeira` é append-only: nc_id, campo, tipo (preenchimento ou correcao), valor ou texto anterior e posterior, motivo, origem (edicao ou direta), autor_id, autor_nome e criado_em. Não tem chave estrangeira, para a trilha sobreviver à exclusão da NC. Leitura pela `pode_ver_nc()`. Usuários não inserem, alteram nem apagam. A gravação é feita pelo trigger `trg_nc_auditoria_financeira` (security definer) em todo UPDATE. A linha do tempo antiga (`nc_historico`) continua sendo gravada.
- **Correção.** Mudar um valor ou a situação que já estavam registrados é correção, inclusive para zero ou vazio. Zero é valor registrado: sair de zero pede justificativa. Preencher um vazio não pede. A justificativa é obrigatória (até 300 caracteres), validada na função (NC002) e no cliente, que mostra as alterações propostas antes de gravar.
- **Ajustes de tela.** As opções vazias de tipo, causador e situação só aparecem quando o registro salvo ainda não tem valor. Legados sem classificação continuam editáveis. As duas orientações de gravação saíram dos textos. "Não" com valor registrado agora explica que os valores precisam estar zerados e que a correção pede justificativa (`MENSAGEM_CONFLITO_NAO`). "Não" com campo em branco orienta a informar zero, sem sugerir contornar a validação (`MENSAGEM_NAO_COM_CAMPO_EM_BRANCO`).
- **Sem mudança de comportamento** para "Não" com valores zero (continua aceito e vira "Sem custo"), para apagar valor junto com a mudança para "Não" (continua recusado pelo banco) e para o `importar` (usa `ignoreDuplicates` e não altera NC existente).

### Testes e verificação

- **Vitest, direcionado:** 15 arquivos de NC, 218 testes, todos passando. Novos: `ncEdicao.test.ts` (comparação normalizada, validação só dos campos alterados, texto legado, correção, reconciliação, erros), `ncServiceEdicao.test.ts` (chamada e tradução de erros, com o cliente substituído) e `demoNcEdicao.test.ts` (regra da demonstração). Atualizados: `NcFormPage.test.tsx` (salvar sem alteração não regrava; conflito; correção com confirmação; opções vazias) e `demoNcClassificacao.test.ts` (sessão com permissão e versão).
- **Banco, PGlite (complementar):** `supabase/tests/nc-edicao.test.mjs` (novo), 14 testes passando. Cobre: a migration não altera dados existentes; salvar sem mudanças; editar só a NF com descrição com tags, custos e classificação intactos; duas sessões (NC001 e reaplicação); NC003, NC004, NC005 e 42501; correção sem justificativa (NC002); preenchimento; correção para zero com trilha (valor anterior e posterior, autor, data e motivo); zero como valor; regras do banco preservadas (23514); trilha só de leitura e visível conforme `pode_ver_nc()`; linha do tempo.
- **Banco, regressão dirigida:** `supabase/tests/nc-classificacao.test.mjs`, 25 de 25 no PGlite. Este teste expôs um acoplamento: a função devolvia o tipo da view, e a migração 20261109100000 não podia ser reaplicada. A função passou a devolver a linha da tabela.
- **Tipos:** `npx tsc -b` sem erros na última execução. Uma execução anterior acusou um erro em `src/demo/demoAvisosReverso.ts`, arquivo do agente 1 que não editei. O erro não se repetiu.
- **Visual na demonstração**, desktop 1366 e celular 390: conflito com a digitação mantida, tabela de diferenças e reaplicação; correção com "Confirmar correção" desabilitado sem justificativa e habilitado com ela. Sem rolagem horizontal da página. O único erro de console é o 404 de `favicon.ico`.
- **Arquivos do agente 1 não alterados:** `AdminLayout`, `FlowNav`, `ApprovalQueuePage`, `ReverseLogisticsForm`, `ncVinculoReverso`, `apiService`, `demoApi`, `demoAvisosReverso`, os testes e documentos de notificação e integração, e `src/types/index.ts`.

### Não verificado nesta rodada

- **Suíte oficial de banco** (`supabase/tests`, PostgreSQL embarcado): bloqueada. A sessão está elevada e o PostgreSQL embarcado recusa iniciar. Não contornado. Os testes de banco rodaram no PGlite.
- **Concorrência real** (duas transações simultâneas): não reproduzida, porque o PGlite tem uma conexão. A garantia vem de `for update` e da condição de versão no mesmo comando. Falta um teste com duas conexões na suíte oficial.
- **Suíte completa do repositório:** não rodada (o agente 1 está editando). **Lint:** não rodado (oxlint bloqueado no ambiente). **Supabase remoto:** nada aplicado, nenhuma API externa.

### Pendências antes da liberação

1. Resolvido na consolidação: `supabase/SQL_EDITOR_SETUP_NC_REVERSA.sql` regenerado uma vez, com as 42 migrations do repositório (inclui `20261109140000` a `20261109180000`).
2. Resolvido na consolidação: linha de `20261109140000_nc_edicao_versao_auditoria.sql` acrescentada em `docs/migrations.md` (e as das migrations novas).
3. Pendente, sem acesso ao remoto nesta sessão: aplicar em ambiente remoto, na ordem: `20261109100000`, `20261109120000`, `20261109130000`, `20261109140000`, `20261109150000`, `20261109160000`, `20261109170000` e `20261109180000`. Antes, rodar a suíte oficial de banco em máquina não elevada.
4. Resolvido na consolidação pela migration `20261109160000`: `authenticated` não tem UPDATE direto em `nao_conformidades`, e a edição passa só por `nc_salvar_edicao`. Reproduzido antes da correção e verificado no PGlite com o papel `authenticated`; a conferência na suíte oficial continua pendente.
5. Botão para anular custos e reembolsos com confirmação: não implementado. Nesta rodada, nada é zerado automaticamente.
6. Quadro de acompanhamento: fora do escopo.
7. Decisões de negócio: (a) mudar a situação de um custo já registrado também pede justificativa, como correção (aplicado; confirmar); (b) campo em branco em "Sim" continua virando total parcial (seção 16, item 8e), o que afeta muitos registros; (c) a justificativa é exigida também quando só a situação muda, sem alteração de valores (aplicado).
8. Teste de concorrência real na suíte oficial, com duas conexões.

## Atualização da consolidação (10/11/2026)

A consolidação completa está em [progresso-melhorias-reverso.md](progresso-melhorias-reverso.md), seção "Consolidação técnica". Para o módulo de NC:

- Item 1 (pacote do SQL Editor) e item 2 (registro em `docs/migrations.md`): confirmados. O pacote é idêntico ao gerado pelas 42 migrations.
- Item 4 (migration `20261109160000`): presente no pacote. A conferência na suíte oficial depende do resultado abaixo.
- Itens 3, 5, 6, 7 e 8: seguem pendentes, como estavam.
- Suíte oficial de banco: bloqueada nesta sessão (shell elevada; o hook de preparação do banco falha e o runner cancela os testes). Nenhum teste de banco executou até o fim, nesta etapa. Rodar a partir de terminal sem privilégio elevado: `cd supabase/tests && npm test`.
