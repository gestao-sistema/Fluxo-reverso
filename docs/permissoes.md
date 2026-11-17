# Permissões por capacidade

Fonte da verdade: banco (RLS, triggers e funções). O frontend espelha as regras só para a interface.

**Cadastro oficial por tela** (marcar uma tela concede as operações dela, no escopo de empresa e setor do mesmo cadastro): [`cadastro-de-usuarios-por-tela.md`](./cadastro-de-usuarios-por-tela.md).

## Capacidades

Cada capacidade vem de uma tela em `auth.users.raw_app_meta_data.telas` e vale só para as empresas em `empresas_acesso` (quando a tela é por empresa, ou quando a capacidade depende dela).

| Capacidade | Telas | Pode | Não pode |
|---|---|---|---|
| Consultar | `dashboard-*`, `lista-*`, `status-*`, `kanban`, `nc` | Ver as reversas e os dados das empresas da tela | Alterar, anotar, aprovar, emitir, confirmar postagem |
| Solicitar | `formulario-<empresa>`, `nc-edit` | Registrar reversa; alterar dados do pedido (fora da expedição) | Decidir, emitir, confirmar postagem |
| Aprovar | `aprovar-reversa` + `empresas_acesso` + escopo por empresa e setor (`reversa_aprovadores_setor`, gravado no cadastro) | Aprovar ou rejeitar (com justificativa), na versão analisada | Aprovar o próprio pedido ou a versão que produziu (sem a configuração provisória) |
| Emitir | `emitir-etiqueta` + `empresas_acesso` | Registrar emissão, anexar PDF, editar dados da etiqueta, informar envio, reemitir | Confirmar postagem; decidir aprovação |
| Confirmar postagem | `confirmar-checkin` + `empresas_acesso` | Registrar postagem, trânsito e entrega | Emitir etiqueta |

A aprovação e a expedição só avançam em reversa **aprovada** ou **legado** (ver `docs/aprovacao-reversas.md`).

## Exceções administrativas

- **Admin** (perfil `mestre`, tela `usuarios` ou perfil legado `ADMIN`: `is_admin()`) administra: usuários, aprovadores, comunicações, listas de NC, correções de dados e exclusão de reversa sem decisão e sem PDF.
- **A tela `usuarios` não consulta nem opera pedidos e NC** (migration `20261028100000`): o escopo total de consulta e operação (`empresas_permitidas`, `empresas_consulta_ampliada`, `empresas_formulario`, `empresas_operaveis`, `empresas_recebimento_manual`, `pode_ver_nc`, `pode_editar_nc`) é do **perfil mestre** explícito (`is_mestre()`); as demais contas dependem das telas e das empresas cadastradas.
- **Admin não decide, não emite e não confirma postagem** no lugar de quem opera. Isso é a regra de segregação: `empresas_aprovaveis()`, `empresas_etiquetaveis()` e `empresas_checkin()` não incluem admin.
- **Serviço** (`auth.uid()` nulo: Edge Function com service role, cron e manutenção) não passa pelas regras de capacidade, mas a expedição continua exigindo aprovação (`exigir_operacao_logistica`).

## Perfil legado de operação

- `empresas_legacy_operaveis()` não concede mais operação a ninguém, exceto admin.
- As telas `lista-*`, `kanban` e `kanban-edit` **deixaram de operar**. Antes, quem só tinha essas telas (e o perfil legado `Expedicao`) alterava etapa, etiqueta e dados.
- Para manter a operação, conceda `emitir-etiqueta` e/ou `confirmar-checkin` (e `aprovar-reversa`, se for o caso) pela tela Usuários, por empresa.

## Como a alteração é checada (trigger `validar_etapa_por_setor`)

Cada alteração em `solicitacoes_reverso` é classificada:

1. **Decisão de aprovação** (`aprovacao_*`): só pela RPC `aprovar_reversa` / `rejeitar_reversa`, que liga `app.aprovacao_decisao`. O trigger ainda confere a capacidade `aprovar` e recusa outras alterações na mesma operação.
2. **Espelho de emissão** (etiqueta, rastreio e etapa): só pelas RPCs de emissão (`emissoes.sincronizando`). O trigger confere a capacidade de cada campo: postagem exige `confirmar-checkin`; etiqueta e rastreio exigem `emitir-etiqueta`.
3. **Dados do pedido**: quem solicita a empresa, e a expedição ainda não começou (regra da expedição em `reversa_aprovacao_ao_alterar`).
4. **Anotações**: quem opera a empresa (solicitar, emitir ou confirmar postagem).

Uma flag interna **não basta sozinha**: a RPC liga a flag, e o trigger ainda confere a capacidade de quem executa. Testado em `supabase/tests/seguranca.test.mjs`.

## Histórico, decisões e exclusão

- `solicitacoes_historico` e `solicitacoes_aprovacoes` são imutáveis: nenhum `update`, e `delete` só em cascata de uma exclusão autorizada (mesmo para admin).
- Exclusão de reversa: só admin; recusada se houver decisão de aprovação, etiqueta ou emissão (os PDFs ficam preservados).

## Storage (bucket `etiquetas`, privado)

- Leitura: quem vê a reversa (escopo de consulta) ou admin.
- Upload: só o PDF de uma reversa **liberada** para a qual quem envia tem a capacidade de emitir, e só se o caminho ainda não estiver vinculado a uma emissão.
- **Sem sobrescrita**: não há policy de `update`. Reemissão cria um arquivo novo; o anterior fica.
- Exclusão: só admin, e só de arquivo órfão (sem reversa vinculada, sem emissão). Arquivo de emissão anterior nunca é removido.
- Os caminhos antigos (`pode_anexar_etiqueta`, `pode_operar_etiqueta`) ficaram inertes (`select false`), sem policy que os use.

## Privilégios

- `anon`: nenhuma tabela e nenhuma função do schema `public`.
- `PUBLIC`: nenhuma função do schema `public` (EXECUTE revogado).
- `authenticated`: sem `TRUNCATE`, `REFERENCES` e `TRIGGER` nas tabelas; sem `UPDATE`/`DELETE` nas tabelas de histórico, decisão, rastreio e emissão; funções internas (gatilhos e as que só rodam dentro de outra função) não são executáveis por usuário.
- Funções chamadas pelas policies continuam executáveis por `authenticated`, porque a RLS roda com o papel do usuário.

## Limitações conhecidas

- NC: o escopo é por tela (`nc`, `nc-edit`), não por empresa. Mantido como está nesta etapa.
- NC, proteção no servidor (migration `20261109160000`, ainda não aplicada no remoto): `authenticated` não tem UPDATE direto em `nao_conformidades`. Toda alteração passa por `nc_salvar_edicao`, que confere a permissão (`pode_editar_nc()`), a versão (NC001) e a justificativa das correções (NC002), e grava a trilha financeira. Criação e importação usam INSERT; a exclusão é só do administrador (política `nc_delete`).
- Funções de gatilho não são executáveis pela API (migration `20261109170000`). `authenticated` não tem TRUNCATE, REFERENCES nem TRIGGER nas tabelas de `public` (migration `20261109180000`).
- Edge Functions: a autorização do endpoint dos Correios e de `admin-usuarios` é tratada à parte (`supabase/functions/`).
- Frontend: as telas chamam as RPCs de aprovação, emissão e recebimento; qualquer outra gravação continua sujeita ao trigger `validar_etapa_por_setor`.
- Testes de RLS rodam em Postgres 17 real (`embedded-postgres`), com os papéis `anon` e `authenticated`, mas **não** contra o projeto Supabase de produção nem pela API PostgREST.

## Solicitante, gestores e equipe

- **Solicitante**: identificado pelo usuário autenticado (`solicitado_por`, gravado pelo servidor). Vê no Meus Pedidos somente o que registrou, inclusive rejeitados e concluídos, e só enquanto mantiver a tela `formulario-<empresa>` (ou `nc-edit`). Pedidos antigos sem autoria **não** são associados a ninguém pelo nome.
- **Gestor** (`dashboard-*`, `lista-*`, `status-*`, `kanban`, `kanban-edit`, `nc`, `nc-edit`): amplia somente a **consulta** (`empresas_consulta_ampliada()`: geral = as duas empresas; por empresa = a empresa da tela). Não concede aprovar, emitir, confirmar postagem nem administração. Menu, dashboard e login não concedem capacidade: cada rota tem a guarda da própria tela e o banco decide.
- **Aprovador**: capacidade `aprovar-reversa` + `empresas_acesso` **e** configuração por empresa e setor (`reversa_aprovadores_setor`). Uma decisão válida basta; quem registrou o pedido ou produziu a versão atual não aprova nem rejeita (não há autoaprovação nem exceção administrativa, desde `20261112100000`).
- **Operador**: `emitir-etiqueta` / `confirmar-checkin` por empresa em `empresas_acesso`.
- **"Gestor vê os pedidos da equipe": decisão pendente.** O modelo não tem estrutura explícita de equipe (nenhuma tabela, coluna ou relação gestor-subordinado) e nenhuma hierarquia é inferida por nome, cargo, setor ou domínio de e-mail. Foi preservado o escopo atual (por empresa). Para implementar é preciso definir como a equipe é composta (lista de usuários por gestor, setor de origem, outra regra).

## Recebimento físico (`confirmar_recebimento_mercadoria`, `listar_recebimentos_fisicos_pendentes`)

- **Quem pode**: o perfil mestre e quem tem `kanban-edit` ou `confirmar-checkin` **na empresa do pedido** (`empresas_recebimento_manual()`, com `empresas_acesso` explícito). A tela `usuarios` sozinha não confirma (migration `20261028100000`). Identificadores antigos: ver o cadastro por tela; a tela própria dessa ação para novos usuários é decisão pendente. A checagem está dentro da função do banco; `anon` não executa.
- **Em trânsito**: conclui o pedido e registra a confirmação (comportamento anterior, inalterado).
- **Já concluído pela entrega dos Correios** (`20261027130000`): registra **somente** a confirmação física, uma única vez. Não reabre o ticket, não altera `status`, `concluido_em` nem qualquer outro campo, não cria emissão, e a informação dos Correios continua no histórico. Autor e horário vêm do servidor; `service_role`/chamada sem usuário é recusada (`42501`): é sempre uma ação de um operador identificado.
- **Origem da conclusão**: só é elegível o pedido cujo histórico traz o rastro gravado pelo rastreio (`Sistema (Correios)` / `Rastreio: …`), sem confirmação manual anterior nem registro de confirmação. O gatilho do histórico sobrescreve o autor com o nome do usuário autenticado, então um usuário não consegue fabricar esse rastro. Pedido concluído **sem** esse rastro (por exemplo, dado convertido) **não** é liberado: a RPC responde `55000`.
- **Concorrência e duplicidade**: a linha do pedido é travada e a tabela tem uma confirmação por pedido; a segunda tentativa recebe `55000` ("já foi confirmado") e não gera aviso. O aviso `recebimento_confirmado` é enfileirado na mesma transação e só **depois** da confirmação física.
- `listar_recebimentos_fisicos_pendentes()` devolve apenas os pedidos que o chamador pode confirmar (mesmo escopo); é o que o detalhe do pedido (Pedidos) usa para oferecer o botão. O Kanban deixou de ser tela de trabalho. A autoridade continua sendo a RPC de confirmação.
- Testes: `supabase/tests/recebimento-fisico.test.mjs` (13) e `src/test/KanbanRecebimentoFisico.test.tsx`.
- **Decisão de negócio pendente (não decidida aqui)**: qual evento deve encerrar o ticket no processo definitivo. Esta mudança só impede perder o registro do fato físico; a regra de encerramento permanece como estava.

## Relatórios e comunicações administrativas

- **Relatórios** (a página `/admin/relatorios` foi removida e redireciona ao Dashboard/Pedidos; as funções abaixo continuam disponíveis para reutilização): os dados vêm de `relatorio_reversa` e `relatorio_reversa_linhas`, funções **SECURITY INVOKER**: o escopo é o da RLS de quem consulta (um perfil só da Alinare recebe zero da Novitah mesmo pedindo; o solicitante com formulário vê só os próprios). A exportação repete o recorte exibido e leva somente colunas de gestão (sem nome/endereço da cliente, solicitante, rastreio ou anotações).
- **Comunicações** (`/admin/comunicacoes`): consulta e reconciliação exigem `is_admin()` dentro das funções do banco (`listar_comunicacoes_reversa`, `listar_historico_comunicacao_reversa`, `resumo_comunicacoes_reversa`, `reconciliar_comunicacao_reversa`). Gestores, solicitantes, aprovadores e operadores recebem `42501`. `anon` não tem EXECUTE. As tabelas da fila, das tentativas e da auditoria não têm acesso direto para `authenticated`.
- Funções internas da fila (`reversa_enfileirar_*`, `reversa_aprovador_pode_decidir`, `reversa_usuario_pode_ler_para_comunicacao`, funções de trigger) não têm EXECUTE para `anon`, `authenticated` nem `service_role`; `reversa_claim_*`, `reversa_iniciar_*` e `reversa_finalizar_*_v2` são só do `service_role` (worker). Testado em `supabase/tests/comunicacao-ciclo.test.mjs`.
