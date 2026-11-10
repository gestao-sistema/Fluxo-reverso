# Ordem das migrations

Ordem de aplicação = ordem do nome do arquivo (`supabase/migrations/`). Cada função é redefinida na migration que a torna vigente, e a versão final é a da última migration que a define. **Nunca edite uma migration já publicada para corrigir a cadeia: crie uma migration incremental nova.** Foi o que se fez em `20261027100000`, que corrige defeitos de `20261026220000` sem reescrevê-la.

| Migration | Conteúdo |
|---|---|
| `20260828171717_remote_commit.sql` | Base (dump do schema de 28/08). Ponto de partida; **não** entra no pacote do SQL Editor |
| `20261020130000_permissoes_app_metadata.sql` | Permissões em `app_metadata` |
| `20261020130100_nao_conformidades.sql` | Módulo de NC |
| `20261020130200_etiqueta_reversa.sql` | Etiqueta e bucket `etiquetas` |
| `20261021120000_reversa_nc_opcional.sql` | NC opcional na reversa |
| `20261021130000_setores_fluxo_reverso.sql` | Telas por setor (modelo anterior; substituída por `20261023100000` e `20261023120000`) |
| `20261021140000_alinhar_listas_nc.sql` | Listas de NC |
| `20261022100000_autorizador_registrado_na_aprovacao.sql` | Autorizador por `user_metadata` (modelo anterior; substituída por `20261023100000`) |
| `20261023100000_aprovacao_reversas.sql` | Aprovação como dimensão própria, histórico imutável, `aprovar_reversa` / `rejeitar_reversa`, conversão dos pedidos antigos |
| `20261023110000_emissoes_reversa.sql` | Histórico de emissões (PDF, códigos, validade, reemissão), RPCs e espelho legado |
| `20261023120000_permissoes_capacidades.sql` | Permissões por capacidade, histórico imutável, exclusão protegida, RLS, storage sem sobrescrita |
| `20261023130000_motivos_reverso_endereco_troca.sql` | Motivos adicionais (mantém os valores antigos) e endereço da segunda cliente |
| `20261023140000_checkin_rastreio.sql` | Salvar o código de rastreio conferido na fila de check-in |
| `20261023150000_recebimento_mercadoria.sql` | Conclusão por entrega dos Correios ou por confirmação manual de recebimento |
| `20261023160000_meus_pedidos_autoria_rls.sql` | Autoria do solicitante, leitura de Meus Pedidos e dos documentos (`pode_ler_solicitacao`) |
| `20261023170000_politica_leitura_insert_reversa.sql` | SELECT necessário ao INSERT/RETURNING seguro |
| `20261023180000_revogar_execucao_usuario_nome.sql` | Revoga execução direta de funções internas |
| `20261023190000_aprovadores_empresa_setor.sql` | Aprovadores por empresa e setor (`reversa_aprovadores_setor`) e auditoria |
| `20261023200000_notificacoes_aprovacao_expedicao.sql` | Notificações internas (sino) de emissão |
| `20261026200000_comunicacao_etiqueta_solicitante.sql` | Fila privada de comunicação por canal (origem: aviso de etiqueta) |
| `20261026210000_comunicacao_resultado_indeterminado.sql` | `acao_conector_concluida` × `resultado_indeterminado`, sem retry cego |
| `20261026220000_comunicacao_eventos_logistica.sql` | Generaliza a fila para os eventos do ciclo da reversa (triggers) |
| `20261027100000_comunicacao_ciclo_pedido.sql` | **Nova.** Corrige a unique que descartava avisos em silêncio; uma ocorrência por pedido e versão; aprovador que não pode decidir não é avisado; postagem/recebimento só pelas confirmações registradas (`reversa_recebimentos_confirmados`); atualização histórica não vira "obsoleta"; leitura do destinatário por `pode_ler_solicitacao`; sem aviso retroativo |
| `20261027110000_comunicacao_reconciliacao_admin.sql` | **Nova.** Consulta e reconciliação administrativa de `resultado_indeterminado` (somente `is_admin()`), com auditoria imutável |
| `20261027120000_relatorios_reversa.sql` | **Nova.** `relatorio_reversa` e `relatorio_reversa_linhas` (SECURITY INVOKER: o escopo é o da RLS de quem consulta) |
| `20261027130000_recebimento_fisico_apos_entrega.sql` | **Nova.** Permite registrar a confirmação **física** de um pedido já `concluido` pela entrega dos Correios (só registro: não reabre, não altera etapa nem `concluido_em`, não gera emissão). Só substitui `confirmar_recebimento_mercadoria` e cria `listar_recebimentos_fisicos_pendentes` e a função interna `reversa_conclusao_por_correios`. Não altera dados existentes nem enfileira nada |
| `20261027140000_postagem_automatica_rastreio.sql` | **Nova.** `registrar_postagem_rastreio(solicitação, código, data)` (só `service_role`): a Edge Function `correios-rastreio` grava a postagem na emissão do código com fonte `rastreio` quando muda o pedido de etapa; o gatilho existente enfileira `postagem_confirmada` uma vez. Não gera recebimento físico, não é retroativa, não altera dados existentes. Publicar **antes** da Edge Function |
| `20261028100000_acesso_por_tela_cadastro.sql` | **Nova.** Cadastro oficial por tela: `is_mestre()`; o atalho de administrador (`usuarios`) sai das funções de escopo de consulta e operação (`empresas_permitidas`, `empresas_consulta_ampliada`, `empresas_formulario`, `empresas_operaveis`, `empresas_recebimento_manual`, `pode_ver_nc`, `pode_editar_nc`) e fica só com o perfil mestre; cria `admin_acesso_aprovacao_usuario` e `admin_salvar_escopo_aprovacao_usuario` (só `service_role`) para gravar o escopo de aprovação do usuário na tabela de aprovadores existente, com auditoria. Não altera dados. Publicar **antes** da Edge Function `admin-usuarios` nova. Ver [`cadastro-de-usuarios-por-tela.md`](./cadastro-de-usuarios-por-tela.md) |
| `20261028110000_convites_acesso.sql` | **Nova.** Cadastro por convite: tabela `convites_acesso` (estado da tentativa de envio; **sem link nem token**; RLS ligada, só `service_role`) e as funções `admin_convite_localizar_usuario`, `admin_convite_preparar`, `admin_convite_iniciar_envio` (reserva atômica contra cliques repetidos), `admin_convite_finalizar_envio` e `admin_convites_listar` (só `service_role`). Não altera dados nem envia nada. Publicar **antes** da Edge Function `admin-usuarios` nova. Ver [`convite-de-acesso.md`](./convite-de-acesso.md) |
| `20261028120000_convite_senha_pendente.sql` | **Nova.** Conclusão do convite aberto sem senha definida: `convite_senha_pendente()` (a própria sessão pergunta se a sua conta é de convidado ainda sem senha; só lê `auth.uid()`, sem parâmetro) e `admin_convite_iniciar_envio` refeita (mesma assinatura) para aceitar conta confirmada **sem senha** que veio de convite (link de definição de senha); conta com senha continua recusada. Não altera dados. Depende de `20261028110000`. Publicar **antes** da Edge Function e do front-end |
| `20261028130000_bloquear_operacao_sem_senha_convite.sql` | **Nova.** Faz `current_telas`, `current_perfil_legacy`, `is_admin` e `is_mestre` retornarem sem permissões para a própria sessão convidada enquanto `convite_senha_pendente()` for verdadeiro. RLS e RPCs que usam esses helpers negam leitura e operação; usuários sem linha de convite e contas com senha preservam as permissões. Não altera registros. Depende de `20261028120000`. Publicar antes da Edge Function `admin-usuarios` e do front-end |
| `20261028140000_smtp_direto_email.sql` | **Nova.** Adiciona status e histórico SMTP sem reinterpretar tentativas legadas; cria finalização de convites e claim/finalização da fila exclusivos para e-mail. As funções de e-mail por SMTP dessa migration (`reversa_claim_comunicacao_email`, `reversa_finalizar_comunicacao_email`) **não são usadas** pelo worker de notificações, que voltou ao Power Automate (reserva e conclusão originais, e-mail e Teams); permanecem para o histórico `smtp_aceito`. Não altera o agendamento. Depende de `20261028110000` e da cadeia da fila de comunicação. Aplicar só depois de conferir a presença das dependências; publicar antes das Edge Functions SMTP |
| `20261030100000_auditoria_aprovadores_usuario_opcional.sql` | Preserva as linhas de auditoria na exclusao da conta: torna `alterado_por` anulavel e usa `ON DELETE SET NULL`; o nome do autor permanece registrado. |
| `20261030110000_corrigir_fk_exclusao_historico_reversa.sql` | Remove a chave estrangeira antiga `RESTRICT` do histórico de aprovação; mantém a chave em cascata e o bloqueio de exclusão para pedidos aprovados/reprovados ou com etiqueta/emissão. |
| `20261030120000_lixeira_chamados.sql` | Substitui exclusão física por arquivamento e restauração auditados; preserva decisões, movimentações, emissões e PDFs, restringe a Lixeira a administradores e remove chamados arquivados das filas ativas. |
| `20261109100000_nc_classificacao_separada.sql` | **Nova, não aplicada no remoto.** Classificação separada da NC: tipo do problema, origem / causador, áreas e situação do custo. A origem antiga fica como está; a classificação nova só entra onde o mapeamento é inequívoco. |
| `20261109120000_nc_registro_classificacao.sql` | **Nova, não aplicada no remoto.** Registro novo com tipo e causador obrigatórios ("Outro" exige descrição); tipo e causador não voltam a ficar vazios; `ncs_para_reversa` devolve tipo e causador. Requer `20261109100000`. |
| `20261109130000_fila_aprovacao_classificacao_nc.sql` | **Nova, não aplicada no remoto.** `fila_aprovacao_reversas()` devolve `nc_tipo_problema` e `nc_causador` no fim do retorno (drop + create; privilégios refeitos, `anon` sem execução). Requer `20261109100000`. |
| `20261109140000_nc_edicao_versao_auditoria.sql` | **Nova, não aplicada no remoto.** Edição de NC: versão da linha (`updated_at` gravado com `clock_timestamp()`), gravação só do que mudou, sob trava da linha, com conferência de versão (NC001); trilha financeira append-only (`nc_auditoria_financeira`); justificativa obrigatória para corrigir valor já registrado (NC002). Requer `20261109130000`. |
| `20261109150000_avisos_ciclo_reverso.sql` | **Nova, não aplicada no remoto.** Avisos internos do ciclo da reversa (sino) para solicitante e aprovadores, em `reversa_avisos`, gerados na mesma transação da fila de comunicação (destinatário e ocorrência vêm da fila). Uma linha por (destinatário, pedido, evento, ocorrência), então os canais de e-mail e Teams geram um aviso só. Aprovação pendente superada por decisão ou nova versão. Listar, contar e marcar leitura conferem a autorização no banco. Requer `20261027100000`. |
| `20261109160000_nc_edicao_somente_pelo_servidor.sql` | **Nova, não aplicada no remoto.** Proteção da edição de NC no servidor: `authenticated` perde o UPDATE direto em `nao_conformidades` (a política `nc_update` deixava gravar qualquer coluna, sem versão e sem justificativa). `nc_salvar_edicao` passa a SECURITY DEFINER, com a permissão conferida dentro da função (`pode_editar_nc()`), sem flag enviada pelo cliente. Criação, importação (INSERT ... ON CONFLICT DO NOTHING), leitura e exclusão pelo admin não mudam. Requer `20261109140000`. Reproduzido antes da correção em `supabase/tests/nc-protecao-servidor.test.mjs`. |
| `20261109170000_privilegios_funcoes_de_gatilho.sql` | **Nova, não aplicada no remoto.** Retira o EXECUTE de PUBLIC, anon, authenticated e service_role nas funções de gatilho (`chamado_lixeira_proteger_atualizacao`, `nc_validar_custo_situacao`, `nc_classificar_origem_legada`, `nc_validar_classificacao_registro`), que disparam sem essa permissão. `nc_classificacao_legada` (função auxiliar, não gatilho) sai de PUBLIC e anon e fica para authenticated e service_role, porque o gatilho de origem a chama com o papel de quem grava a NC. Requer `20261109100000`. |
| `20261109180000_privilegios_tabelas_authenticated.sql` | **Nova, não aplicada no remoto.** Retira TRUNCATE, REFERENCES e TRIGGER de anon e authenticated nas tabelas e views de `public`. O dump remoto (`20260828171717`) concede ALL a esses papéis, e a RLS não controla TRUNCATE. Afeta só o que já existe; tabelas criadas depois herdam o padrão do projeto, e `seguranca.test.mjs` confere isso. |

Detalhes de permissão: [`permissoes.md`](./permissoes.md). Fila de comunicação e transporte das notificações (Power Automate): [`power-automate/CONTRATO_INTEGRACAO.md`](./power-automate/CONTRATO_INTEGRACAO.md); SMTP dos convites: [`envio-email-smtp.md`](./envio-email-smtp.md).

## Estado de aplicação

O repositório **não registra por si só** todo o estado remoto. Em 28/10/2026, no projeto `ymrrguubkqbxndhoxhor`, o diagnóstico de objetos confirmou ausentes as migrations `20261028100000`–`20261028130000`; elas foram aplicadas individualmente, em ordem, e os 19 itens do diagnóstico ficaram `OK`. A CLI registrou essas quatro versões. O histórico anterior continha apenas a base `20260828171717`; as versões intermediárias anteriores continuam sem registro e não foram reaplicadas nem marcadas sem reconciliação completa. **Não execute `supabase migration up` geral** até reconciliar esse histórico, pois ele ainda pode tentar aplicar arquivos antigos. O roteiro de reconciliação, com consultas somente de leitura, está em [`homologacao-logistica-reversa.md`](./homologacao-logistica-reversa.md).

A migration `20261028140000_smtp_direto_email.sql` foi criada depois desse diagnóstico histórico; na conferência de 28/10/2026 (somente leitura) as funções dela **já existem no banco remoto**. A ausência de registro local/remoto não substitui a conferência dos objetos e dependências.

As migrations `20261109100000`, `20261109120000` e `20261109130000` (NC), `20261109140000` (edição de NC) e `20261109150000` (avisos da reversa), `20261109160000` (proteção da edição de NC), `20261109170000` e `20261109180000` (privilégios) estão **só no repositório**: não foram aplicadas no Supabase remoto. Aplicar nessa ordem, antes de publicar o frontend que as usa. Sem as de NC, o formulário de reversa e a aprovação mostram a classificação da NC como não informada; sem a de avisos, o sino não recebe os avisos novos. O pacote do SQL Editor (`supabase/SQL_EDITOR_SETUP_NC_REVERSA.sql`) foi regenerado na consolidação com as 42 migrations do repositório, em ordem e com versões únicas. Não foi aplicado em nenhum banco.

## Validação local da cadeia

- **Cadeia limpa:** as suítes de `supabase/tests/` aplicam o dump-base e todas as migrations, em ordem, num PostgreSQL 17 temporário.
- **Atualização de base já em uso:** `comunicacao-ciclo.test.mjs` aplica a cadeia até antes da fila de comunicação, cria um pedido pendente, aplica a fila original, cria pedidos em várias situações (inclusive um aviso de postagem gerado pela semântica antiga) e só então aplica `20261027*`. Verifica que nada é enfileirado retroativamente (`20261027130000` só define funções), que os avisos antigos derivados de rastreio ficam `evento_obsoleto` e que as linhas existentes são preservadas. `banco.test.mjs` faz a atualização de base legada até `20261023*`.
- **Recebimento físico após a entrega:** `recebimento-fisico.test.mjs` (13 testes) reproduz emitido → postado → entregue pelos Correios (gravado como a Edge Function grava) → recebido fisicamente, com permissão por empresa, concorrência, ausência de aviso duplicado, falha do aviso desfazendo a confirmação e relatórios.
- **Pacote do SQL Editor:** `banco.test.mjs` executa `SQL_EDITOR_SETUP_NC_REVERSA.sql` inteiro e confere o contrato final (inclusive `20261027*`).
- **Consolidação (PGlite, complementar):** `nc-protecao-servidor.test.mjs` e `funcoes-gatilho.test.mjs` cobrem as proteções novas com o papel `authenticated`. Uma comparação de catálogo mostra que a instalação limpa, o pacote do SQL Editor e a atualização incremental (`20261109160000` a `20261109180000` sobre a base já com as anteriores) geram o mesmo catálogo: funções e permissões de execução, privilégios de tabela, políticas, gatilhos, colunas, restrições, índices e views.

## Conversão dos pedidos antigos (`20261023100000`)

Feita antes da marcação de legado, para que pedidos aguardando aprovação não sejam liberados sem decisão:

- `status = 'aguardando_aprovacao'` → `aprovacao_status = 'aguardando_aprovacao'`, `status = 'pendente'`.
- `status = 'reprovado'` → `aprovacao_status = 'rejeitada'`, `status = 'pendente'`, sem responsável.
- `status = 'pendente'` (aprovado no modelo antigo) e etapas posteriores → legado (`aprovacao_legada = true`), com o nome do autorizador preservado em `autorizacao`. Nenhuma decisão é inventada.

## Script único para o SQL Editor

`supabase/SQL_EDITOR_SETUP_NC_REVERSA.sql` é gerado por `node supabase/scripts/gerar-sql-editor.mjs` a partir da cadeia acima. Gere de novo sempre que uma migration mudar. Não use o pacote completo numa base existente; aplique somente migrations realmente ausentes.

**Quando usar:** somente numa base confirmada e **anterior a todas** as migrations do pacote, executado uma única vez. **Não** reaplique o pacote sobre um banco que já recebeu parte da cadeia: a repetição de definições antigas já causou incompatibilidade de assinatura (`42P13`). Para banco parcial ou com drift, aplique apenas as migrations realmente ausentes, na ordem, depois de conferir o schema.

Os demais `supabase/SQL_EDITOR_*.sql` (`ALINHAR_LISTAS_NC`, `NC_OPCIONAL`, `SETORES_FLUXO_REVERSO`, `HOTFIX_ENDERECO_TROCA`) são de versões anteriores e **não devem ser usados**.

## Agendamento do worker

Não faz parte das migrations. Scripts operacionais em `supabase/agendamento/` (habilitar/desabilitar), descritos em [`agendamento-worker-comunicacao.md`](./agendamento-worker-comunicacao.md).
