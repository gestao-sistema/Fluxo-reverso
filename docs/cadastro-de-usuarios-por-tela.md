# Cadastro de usuários por tela

Regra oficial: **marcar uma tela no cadastro concede o acesso e as operações próprias dela, no escopo de empresa e setor informado no mesmo cadastro, e nada além disso.** Não há segunda configuração oculta: quem tem a tela consegue usá-la, e quem não tem não consegue, na navegação, na API, no Storage e nos avisos.

Fonte da verdade: o banco (RLS, RPCs e Storage). O front-end e a Edge Function aplicam a mesma validação (`src/lib/acesso.ts` e `supabase/functions/admin-usuarios/acesso.ts`; o teste `src/test/acessoParidade.test.ts` exige que o bloco de regras seja idêntico). Detalhes de capacidade por operação: [`permissoes.md`](./permissoes.md).

## Perfis de acesso

O campo da tela de Usuários chama-se **Perfil de acesso** (não confundir com o setor do colaborador nem com os setores que a pessoa pode aprovar).

| Perfil | O que grava | Observação |
| --- | --- | --- |
| Personalizado | as telas marcadas, as empresas (quando uma tela depende delas) e, em Aprovações, o escopo por empresa e setor | Forma oficial de cadastro. Cada tela concede só o que está no mapa abaixo |
| Abre chamados / Aprova chamados / Emite etiqueta / Acompanha e confirma check-in | uma tela fixa e as empresas marcadas | Perfis prontos. "Aprova chamados" aprova **todos os setores** das empresas marcadas (é a definição do perfil); para limitar por setor, use Personalizado |
| Mestre | todas as telas, as duas empresas e aprovação em todos os setores | Acesso total **deliberado e explícito** (`perfil_acesso = mestre`). É o único atalho de escopo total no banco (`is_mestre()`) |

Os perfis prontos e o personalizado seguem exatamente as mesmas regras efetivas: o banco olha as telas, as empresas e o escopo gravados, nunca o nome do perfil (teste "perfil pronto e personalizado seguem a mesma regra efetiva").

## Mapa final: tela → operações → escopo

| Tela no cadastro | Identificador | Operações concedidas | Escopo | Não concede |
| --- | --- | --- | --- | --- |
| Dashboard Geral / Alinare / Novitah | `dashboard-geral`, `dashboard-alinare`, `dashboard-novitah` | consultar os indicadores | a empresa da tela (geral = as duas) | aprovar, emitir |
| Formulário Alinare / Novitah | `formulario-alinare`, `formulario-novitah` | solicitar reversa; acompanhar os próprios pedidos (Meus Pedidos) | a empresa da tela | aprovar, emitir |
| Pedidos (das duas empresas / Alinare / Novitah) | `lista-geral`, `lista-alinare`, `lista-novitah` | consultar pedidos | a empresa da tela | aprovar, emitir, confirmar recebimento |
| Aprovações | `aprovar-reversa` | consultar a fila; aprovar ou rejeitar (rejeição com justificativa) | **empresas marcadas + setores por empresa** (todos ou específicos) | aprovar o próprio pedido (autoaprovação desligada), emitir |
| Emissão de etiquetas | `emitir-etiqueta` | consultar pedidos aprovados; registrar PDF, códigos e datas; reemitir | **empresas marcadas** | aprovar |
| Não conformidades | `nc-edit` | consultar lista e painel; registrar e editar NC; abrir reversa a partir da NC | por tela (NC não tem escopo por empresa) | aprovar, emitir |
| Gestão de usuários | `usuarios` | cadastrar e editar usuários e permissões; configurar aprovadores; consultar e reconciliar comunicações; listas de NC | — | **consultar pedidos e NC, aprovar, emitir, confirmar recebimento** |

- "Somente consulta" de NC (`nc`) e as telas removidas do produto (`kanban`, `kanban-edit`, `confirmar-checkin`, `status-*`) **não são oferecidas** a novos acessos. Ver "Acessos antigos".
- Uma ação especializada só vem da tela dela: Pedidos e Dashboard consultam, nunca aprovam, emitem nem recebem (testado no banco).
- As empresas marcadas valem juntas para Aprovações e Emissão. Se a pessoa aprova só a Alinare mas emite as duas, o cadastro não consegue separar (limitação do modelo `empresas_acesso`); use dois usuários ou aceite as duas empresas nas duas telas.

## Empresas e setores no mesmo cadastro

- **Nenhuma empresa é presumida.** Empresa vazia = nenhum acesso às telas que dependem de empresa. O formulário exige marcar.
- Ao marcar **Aprovações**, o mesmo formulário mostra cada empresa marcada com "Todos os setores" ou "Setores específicos" (e a lista de setores). Sem escolha válida o botão Salvar fica desabilitado e a Edge Function recusa.
- **Uma só fonte**: o escopo de aprovação é gravado em `reversa_aprovadores_setor`, a mesma tabela do quadro "Aprovadores por empresa e setor" da página de Usuários. Salvar num lugar aparece no outro, sem duplicidade (a página recarrega o quadro depois de salvar o cadastro).
- Ao salvar, a Edge Function grava, nesta ordem: validação completa → `app_metadata` (perfil, empresas, telas) → escopo de aprovação (RPC `admin_salvar_escopo_aprovacao_usuario`, só `service_role`). A ordem importa: o gatilho de avisos confere a capacidade ao gravar o escopo. Se a segunda gravação falhar, a primeira é desfeita (na criação, o usuário recém-criado é removido).
- Desmarcar Aprovações (ou retirar a empresa) remove o escopo na mesma operação.

## Onde cada regra é aplicada

| Camada | O que garante |
| --- | --- |
| Edge Function `admin-usuarios` | só quem tem `usuarios` (ou perfil mestre) em `app_metadata` do token validado altera permissões; nunca `user_metadata`; valida o cadastro inteiro antes de gravar; ninguém remove a própria gestão de usuários; o administrador padrão segue fixo |
| Banco (RLS e RPCs) | consulta e operação por tela + empresas: `empresas_permitidas`, `empresas_consulta_ampliada`, `empresas_formulario`, `empresas_operaveis`, `empresas_aprovaveis`, `empresas_etiquetaveis`, `empresas_checkin`, `pode_ver_nc`, `pode_editar_nc`; aprovação exige ainda o escopo por setor (`usuario_pode_aprovar_reversa`) |
| Storage (bucket `etiquetas`) | o PDF só entra por quem emite na empresa do pedido (aprovado); lê quem lê o pedido; gestão de usuários não lê PDFs de pedidos |
| Avisos (fila de comunicação) | destinatários derivados do autor e de quem **pode** decidir/emitir (telas + empresas + escopo); revalidados no envio: acesso retirado = não envia (`aprovacao_indisponivel`/`acesso_revogado`) |
| Navegação e rotas | o menu mostra exatamente as telas marcadas; cada rota exige a tela; "Gestão de usuários" sozinha abre Usuários e Comunicações, nada mais |
| Modo demo | `demoAuthService` aplica a mesma validação e grava o escopo na mesma configuração |

## Gestão de usuários, administrador e mestre

- **`usuarios`** = administração: cadastro de usuários e permissões, aprovadores, comunicações, listas de NC e as exceções administrativas já existentes no banco (correções de dados e exclusão de reversa sem decisão e sem PDF, apenas sobre o que a pessoa enxerga).
- Deixou de conceder **consulta e operação** de pedidos e NC: isso vem das telas marcadas. Foi removido o atalho `is_admin()` de `empresas_permitidas`, `empresas_consulta_ampliada`, `empresas_formulario`, `empresas_operaveis`, `empresas_recebimento_manual`, `pode_ver_nc` e `pode_editar_nc` (migration `20261028100000`), e o equivalente no front-end (`ProtectedRoute`, `perfil.ts`).
- Aprovar, emitir e confirmar postagem **nunca** tiveram atalho de administrador no banco; o front-end mostrava o contrário e foi alinhado.
- **Mestre** (`perfil_acesso = mestre`) mantém acesso total, de forma explícita no front-end (`isMestre`) e no banco (`is_mestre()`), e ganha o escopo de aprovação de todos os setores ao ser salvo.
- Selecionar Aprovações **não** liga a autoaprovação: o pedido próprio aparece na fila, sem poder decidir (`pode_aprovar = false`). A configuração `permitir_autoaprovacao` continua valendo como estava.

## Usuários existentes

- Nada é apagado nem recriado; IDs, autoria, pedidos e histórico ficam como estão. A migration não altera dados.
- **Sem conversão em massa.** Não foi feito preenchimento automático de empresa ou escopo: `usuarios`, `kanban` e `lista-geral` **não** viram aprovação nem emissão sem seleção explícita.
- O formulário de edição **sinaliza** (selo "Revisar acesso" na lista e aviso no formulário) e **exige preenchimento ao salvar** quando: há tela que depende de empresa e nenhuma empresa está marcada; ou há Aprovações e falta o escopo de alguma empresa marcada.
- "Legado" aqui é só o nome antigo do cadastro personalizado. `aprovacao_legada` e os históricos de aprovação antigos não são tocados.
- Quem tinha `usuarios` sem `perfil_acesso` deixou de ser listado como "Mestre"; aparece como Personalizado, com as telas que realmente tem.

## Acessos antigos

Identificadores que saíram do produto continuam valendo para quem já os tem e são **preservados** ao editar (seção "Acessos antigos (preservados)", com opção de retirar), mas não são oferecidos a novos acessos e a Edge Function recusa concedê-los:

| Identificador | Situação |
| --- | --- |
| `nc` | só consulta; a tela atual de NC inclui consulta, registro e edição (`nc-edit`) |
| `kanban`, `status-*` | telas removidas; seguem dando consulta |
| `kanban-edit`, `confirmar-checkin` | telas removidas; ainda permitem **confirmar o recebimento físico** nas empresas marcadas (exigem empresa explícita) |

**Decisão de produto pendente:** hoje a confirmação do recebimento físico só vem do perfil mestre ou desses dois identificadores antigos. Se novos usuários precisarem dessa ação, é preciso definir uma tela própria; não foi criada aqui porque esta entrega não amplia o sistema.

## O que publicar (ordem)

Nada foi publicado nesta entrega.

1. Migration `20261028100000_acesso_por_tela_cadastro.sql` (cria `is_mestre`, remove o atalho de administrador das funções de escopo, cria as RPCs de serviço). **Não** reaplicar o pacote inteiro: aplicar só esta migration, depois de conferir o schema de destino. O pacote `SQL_EDITOR_SETUP_NC_REVERSA.sql` foi regenerado (27 migrations) apenas para bases novas.
2. Edge Function `admin-usuarios` (`index.ts` + `acesso.ts`). Publicar **depois** da migration: a função chama as RPCs novas ao salvar acesso.
3. Front-end.

Efeito imediato da migration em contas existentes: contas que só têm `usuarios` (como o administrador padrão) deixam de ler pedidos e NC pela API (a administração segue igual). Quem tem telas de consulta (`dashboard-geral`, `lista-geral`, …) mantém a consulta. Quem tem `kanban-edit` sem empresa marcada já não confirmava recebimento e continua sem; marque a empresa no cadastro.

## Validação

- Banco (PostgreSQL real, papéis reais): `supabase/tests/acesso-por-tela.test.mjs` (17 testes) mais as suítes existentes ajustadas. Cobre solicitante de uma empresa, aprovador de uma empresa e um setor, de todos os setores, emissor de uma empresa, acesso às duas empresas explícito, retirada de acesso (decisão direta na API recusada e aviso não enviado), autoaprovação, mestre, perfil pronto × personalizado, Storage, gestão de usuários sem consulta, escrita de escopo só pelo serviço, nenhum efeito retroativo.
- Front-end: `acessoCadastro`, `acessoParidade`, `UsuariosPage`, `perfil`, `rotasAcesso`, `authService`, `demoUsuariosCompat`.
- **Não validado:** a Edge Function `admin-usuarios` no runtime Deno e contra o Supabase real (só a lógica pura e a paridade foram testadas); o comportamento do GoTrue ao gravar `app_metadata`; nenhuma escrita remota foi feita.

## Roteiro: editar a sua conta pelo cadastro oficial e conferir a fila

1. Entre com a conta administrativa e abra **Usuários**. Procure a sua conta; se houver o selo "Revisar acesso", ele indica o que falta.
2. Clique em **Editar** na sua conta. Mantenha **Perfil de acesso = Personalizado** (a Gestão de usuários fica marcada e travada: ninguém retira a própria).
3. Marque **Aprovações** (e, se também precisar, **Emissão de etiquetas**). Marque as **empresas** (por exemplo, Alinare). Em "Aprova pedidos da Alinare", escolha **Todos os setores** ou os setores específicos.
4. Os acessos antigos que você já tem (por exemplo, Kanban) aparecem em "Acessos antigos (preservados)"; mantenha ou desmarque.
5. **Salvar.** Saia e entre de novo (ou recarregue): **Aprovações** passa a aparecer no menu.
6. Conferir a fila: **Aprovações** lista os pedidos da empresa e do setor que você escolheu. Pedidos que **você mesmo** registrou aparecem, mas sem poder decidir (autoaprovação desligada); eles são decididos pelos outros aprovadores configurados. Para testar uma decisão sua, um pedido de outra pessoa deve estar aguardando.
7. Se a lista vier vazia, confirme em Usuários o seu escopo (empresa e setores) e se o pedido é da empresa e do setor marcados.
