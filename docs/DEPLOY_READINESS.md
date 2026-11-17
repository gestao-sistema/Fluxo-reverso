# Prontidão para deploy — Logística Reversa

> **Atualização de 12/11/2026.** Erros de produção (autoaprovação, Lixeira, PDF/rastreio, domínios, links com localhost, e-mails no Outlook escuro) investigados e corrigidos localmente; ver [`correcoes-producao-20261112.md`](./correcoes-producao-20261112.md). Estado remoto conferido em leitura nessa data: ledger com 7 versões (`20261111193000` registrada), sino `20261109150000` aplicado fora do ledger, Lixeira `20261030120000` e cadeia NC ainda ausentes. Segredo `APP_BASE_URL` das Edge Functions = `http://localhost:5173` (comparação por digest). O restante deste documento é a checagem de 11/11/2026.

**Data da checagem:** 11/11/2026

**Classificação final:** **BLOQUEADO PARA DEPLOY**

As correções locais seguras foram aplicadas e verificadas. Não houve deploy, push, commit, merge, alteração de banco remoto nem rotação de credenciais. Permanecem bloqueios por credenciais historicamente expostas sem rotação manual, 8 migrations ausentes e 2 parciais no banco remoto (reconciliação concluída em leitura), container sem validação e homologação pendente. Nenhum valor de secret foi incluído no relatório ou nos logs.

## Escopo

- As alterações permanecem no checkout local; alterações anteriores e arquivos demo foram preservados.
- O build usou URL e chave pública fictícias, sem conexão a serviços externos.
- A análise do lockfile-base foi feita em pasta temporária, sem alterar o checkout.
- O ledger remoto foi consultado somente para leitura com Supabase CLI 3.1.0 via npx, contra o projeto vinculado Reverso; nenhuma alteração remota foi executada.
- Testes cancelados ou ignorados não foram contabilizados como aprovados.

## Resumo por bloqueio

| Área | Situação anterior | Correção local | Evidência | Situação atual |
|---|---|---|---|---|
| Chaves Supabase | Variáveis antigas e chave de serviço exposta no histórico. | Código prefere sb_publishable/sb_secret, com fallback legado temporário; validação rejeita chave secreta no frontend. | Testes de chaves, build, busca histórica redigida e scan dos 67 assets do bundle sem JWT, valor sb_secret ou claim service_role. | Rotação e atualização de consumidores dependem de ação manual. |
| Senha PostgreSQL | Senha de conexão apareceu em snapshots antigos. | Arquivos identificados sem ler nem registrar valor; procedimento documentado. | Varredura encontrou DEPLOY_RAILWAY.md e run-sql-rls.cjs em histórico. | Inventariar conexões e redefinir senha manualmente. |
| Migrations remotas | 37 versões locais fora do ledger remoto. | Reconciliação somente leitura do catálogo e de agregados contra a cadeia local reconstruída versão a versão. | Das 37: 27 presentes, 2 parciais (módulo NC antigo com mojibake; grant de nc_historico), 8 ausentes (20261030120000 e 20261109100000–170000). 20261109140000 ausente. | Bloqueado até aplicar a correção NC e as 8 ausentes em homologação; ajuste do ledger só depois (seção 2). |
| Testes PostgreSQL | A execução elevada cancelou 76 testes. | Suíte completa executada no PowerShell sem elevação com PostgreSQL temporário e stubs locais. | Resultado informado pelo usuário: 330 testes em 75 suítes; 330 aprovados, 0 falhas, 0 cancelados, 0 ignorados e 0 pendentes; 120930 ms. | Resolvido; nenhuma chamada ao banco de produção. |
| Dependências | Audit-base indicava 8 achados, 3 moderados e 5 altos. | Atualizações direcionadas, sem npm audit fix --force. | npm audit atual sem achados; build e suíte passaram. | Resolvido no audit; xlsx permanece fixado em CDN oficial. |
| Regressão | Teste de template falhava com LF/CRLF. | Regex do teste agora aceita ambos. | 925 testes passaram em 88 arquivos. | Resolvido localmente. |
| Railway/container | Documentação e evidências estavam desatualizadas. | Dockerfile/Nginx revisados, docs/RAILWAY.md atualizada e roteiro local criado. | Parser PowerShell aprovou scripts/validar-container-railway.ps1; Docker Engine ausente. | Roteiro pronto, mas build e runtime ainda não validados. |
| Homologação | Perfis e integrações não validados. | Plano seguro mantido e testes locais com mocks executados. | 132 testes em 12 arquivos passaram sem serviços externos; a suíte PostgreSQL completa, incluindo worker-integracao, também passou; SMTP de transporte real e Edge Functions no runtime Deno seguem pendentes. | Homologação ponta a ponta pendente. |

## 1. Segurança e migração das chaves

### Exposição histórica e dependências

| Evidência | Constatação | Uso atual |
|---|---|---|
| src/sql/setup_cron_rastreio.sql no commit c416bda | Continha um JWT com role service_role. A busca encontrou somente esse commit, não os quatro citados no relatório antigo. | Não aparece no frontend atual nem no bundle. Trate a chave como comprometida porque o snapshot permanece no histórico Git. |
| DEPLOY_RAILWAY.md e run-sql-rls.cjs em commits antigos | Uma senha de conexão PostgreSQL apareceu em URI nesses arquivos históricos. Os valores foram omitidos. | run-sql-rls.cjs atual lê DATABASE_URL do ambiente; nenhuma senha literal atual foi identificada. A senha atual não foi lida. |

Componentes que usam chaves Supabase:

- admin-usuarios usa chave pública para chamadas autenticadas pelo usuário e chave secreta para operações administrativas de Auth.
- correios-rastreio valida usuários via Auth com chave pública e usa chave secreta para operações administrativas após autorização.
- comunicacao-etiqueta é um worker server-side que valida explicitamente a chave secreta.
- Os crons dos Correios e de comunicação leem a chave do Supabase Vault e enviam o cabeçalho apikey. Os nomes dos segredos são históricos: correios_cron_service_key e comunicacao_cron_service_key.
- Railway hospeda somente frontend estático; recebe URL e chave pública no build. O segredo não deve ser cadastrado no Railway.
- Database Webhooks, automações ou conexões externas não puderam ser inventariados nesta sessão; devem ser verificados manualmente.

O código local prefere SUPABASE_PUBLISHABLE_KEYS e SUPABASE_SECRET_KEYS nas Edge Functions, aceita SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY como fallback temporário e usa VITE_SUPABASE_PUBLISHABLE_KEY no frontend com fallback temporário para VITE_SUPABASE_ANON_KEY. O cliente browser remove Authorization: Bearer quando contém uma nova API Key e mantém JWT de usuário e chaves JWT antigas; as chamadas enviam a nova chave em apikey. Mensagens e logs não exibem valores. Workers com verify_jwt=false verificam explicitamente a chave; chamadas de usuário continuam validadas pelo Supabase Auth. Isso prepara código local, sem alterar secrets remotos.

### Procedimento manual para rotação e revogação

Nenhuma rotação foi feita. O único vazamento confirmado no histórico foi a chave JWT service_role; também houve exposição histórica de uma senha PostgreSQL. Não há evidência nesta auditoria de que credenciais SMTP, Power Automate ou Correios tenham sido expostas, mas os consumidores abaixo precisam ser inventariados e atualizados quando essas credenciais forem rotacionadas. Mantenha todas as credenciais antigas ativas até que os consumidores novos estejam atualizados e verificados.

1. **Inventário sem copiar valores.** No Dashboard Supabase, Railway, Vault, configuração de Database Webhooks, Supabase Functions e Microsoft Entra/Power Automate, registre somente nomes dos consumidores, serviço, proprietário e status. Inclua admin-usuarios, comunicacao-etiqueta, correios-rastreio, os crons (correios_cron_service_key, comunicacao_cron_service_key), webhooks, jobs/workers, conexões PostgreSQL e scripts/CI. Nunca exporte ou registre valores.
2. **Criar as novas chaves Supabase.** Em Project Settings → API Keys, crie sb_publishable e sb_secret, guardando-as no cofre aprovado. Não revogue anon, service_role ou JWT Signing Key nesta fase.
3. **Atualizar Edge Functions.** Configure SUPABASE_PUBLISHABLE_KEYS em admin-usuarios e correios-rastreio; configure SUPABASE_SECRET_KEYS em admin-usuarios, comunicacao-etiqueta e correios-rastreio. Preserve SUPABASE_URL. A compatibilidade local mantém os nomes SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY como fallback durante a transição. Coloque credenciais de provedores somente nos secrets das funções, nunca em VITE_* ou no Railway.
4. **Atualizar crons e workers.** Depois de preparar as funções para sb_secret, atualize os dois valores no Supabase Vault, mantendo os nomes correios_cron_service_key e comunicacao_cron_service_key. Configure os jobs para enviar a chave nova em apikey; remova o Bearer legado somente depois de confirmar o novo caminho em homologação.
5. **Atualizar webhooks e automações.** Em cada Database Webhook ou automação que chame funções, substitua a chave antiga pelo segredo novo no cabeçalho apikey e valide endpoint, timeout e resposta em homologação. Atualize os dois fluxos Power Automate: POWER_AUTOMATE_FLOW_URL e CONVITE_POWER_AUTOMATE_FLOW_URL, se aplicável. Se for girar o segredo do aplicativo Entra, crie o novo segredo no Entra, atualize POWER_AUTOMATE_CLIENT_SECRET no Supabase e teste o fluxo de homologação; só depois remova o segredo antigo no Entra.
6. **Rotacionar credenciais SMTP e Correios quando aprovadas pelo proprietário.** Crie a credencial nova no provedor e atualize SMTP_PASS em admin-usuarios; mantenha SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER e SMTP_FROM coerentes. Atualize CORREIOS_USUARIO_<EMPRESA>, CORREIOS_SENHA_<EMPRESA> e CORREIOS_CARTAO_POSTAGEM_<EMPRESA> (ou o nome legado configurado) em correios-rastreio. Teste SMTP com Mailpit/sink e Correios por stub, sem destinatário, consulta ou postagem real.
7. **Revisar secrets no Railway.** O serviço Railway hospeda somente a SPA; mantenha ali VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY para o build. Se encontrar sb_secret, service role, senha PostgreSQL, SMTP, OAuth ou segredo de webhook no serviço, primeiro confirme e migre o consumidor ao cofre correto; só então remova a variável. Nunca coloque segredo em VITE_*.
8. **Testar com as credenciais novas antes de revogar.** Em projeto de homologação e com dados sintéticos, valide login, recuperação, chamadas das três funções, workers, crons, webhooks e notificações. Use SMTP sink, fluxo Power Automate de teste e stub Correios. Registre apenas status/horário/identificadores não sensíveis. A execução com serviços reais não está autorizada nesta etapa.
9. **Revogar as chaves legadas.** Após confirmar cada consumidor, desative anon e service_role antigas em Project Settings → API Keys. Depois siga JWT Signing Keys no Dashboard para revogar a chave de assinatura JWT legada exposta; confira o impacto e a validade dos tokens antigos mostrados pelo Dashboard antes de concluir. Não reescreva o histórico Git como substituto da revogação.
10. **Trocar a senha PostgreSQL por último.** Antes, atualize em cofres todos os clientes diretos que usam DATABASE_URL ou senha PostgreSQL (scripts, CI, administração e ferramentas autorizadas). Redefina em Database → Settings, atualize os clientes e teste conexões apenas no ambiente adequado. O Railway estático não deve receber DATABASE_URL.

A sequência mantém os consumidores antigos operacionais enquanto os novos são preparados. Não compartilhe valores de credenciais em chat, relatórios, logs, arquivos versionados ou argumentos/histórico de shell.

## 2. Migrations

### Ledger

A pasta local contém 43 migrations com 43 versões únicas. A Supabase CLI 3.1.0 foi executada via `npx --yes supabase@latest`. O banner confirmou o projeto vinculado **Formulário Reverso - Assistência Técnica** (`ymrrguubkqbxndhoxhor`), ambiente production; não é o projeto Inventário.

O ledger remoto (`supabase_migrations.schema_migrations`) tem 6 versões: `20260828171717`, `20261028100000`, `20261028110000`, `20261028120000`, `20261028130000` e `20261028140000`. Todas têm `statements` gravados, o que indica registro pela CLI. Não há versões remotas sem arquivo local, nem duplicidades. As outras 37 versões existem só localmente.

### Método da reconciliação (11/11/2026, somente leitura)

1. **Remoto.** As consultas usaram `supabase db query --remote --read-only`, com o usuário `supabase_read_only_user` e `transaction_read_only = on`. Foram executados apenas `SELECT`s de catálogo e contagens agregadas; nenhum dado pessoal foi lido ou registrado. O snapshot cobriu tabelas, colunas, defaults, constraints, índices, views, funções, triggers, RLS, policies e privilégios efetivos de `anon`, `authenticated` e `service_role` (`has_table_privilege` e `has_function_privilege`). Para as funções foram comparados hash do corpo sem espaços, assinatura, retorno, `SECURITY DEFINER`, `search_path` e EXECUTE. Também foram verificadas as policies `etiquetas_*` em `storage.objects`, o bucket `etiquetas`, triggers em `auth.users` e default privileges.
2. **Estado esperado.** Stubs, base e as 42 migrations foram aplicados em ordem em um PGlite (PostgreSQL 18 em WASM, no diretório temporário da sessão), com o mesmo snapshot após cada versão. Todas as versões foram aplicadas sem erro. Assim foi possível atribuir cada objeto à versão que o criou, alterou ou removeu, identificar a sucessora e encontrar a **última versão local cujo estado coincide com o remoto**. O PostgreSQL embarcado da suíte oficial não iniciou porque o shell estava elevado. O PGlite é uma verificação complementar.
3. **Ruído descartado.** O PG 18 registra `NOT NULL` como constraint (`contype = 'n'`), mas o PG 17 remoto não. Essa categoria foi removida da comparação; a nulidade continua comparada pela coluna.
4. **Pacotes do SQL Editor.** `supabase/SQL_EDITOR_SETUP_NC_REVERSA.sql` listava as 34 migrations de `20261020130000` a `20261030120000` no commit `6e49885` (05/11) e hoje lista as 42 posteriores à base. Os pacotes `SQL_EDITOR_NC_OPCIONAL`, `SQL_EDITOR_SETORES_FLUXO_REVERSO`, `SQL_EDITOR_ALINHAR_LISTAS_NC` e `SQL_EDITOR_HOTFIX_ENDERECO_TROCA` correspondem a `20261021120000`, `20261021130000` e `20261021140000`; os três estão marcados como OBSOLETO. `SQL_EDITOR_HOTFIX_ENDERECO_TROCA` é um hotfix ligado a `20261023130000`. A presença no pacote foi usada só como pista. A classificação abaixo vem do estado do banco.

### Resultado

| Situação | Versões | Quantidade |
|---|---|---|
| Presente | 20261020130000, 20261020130200, 20261021120000, 20261021130000, 20261021140000, 20261022100000, 20261023100000, 20261023110000, 20261023130000 a 20261023200000, 20261026200000 a 20261027140000, 20261030100000, 20261030110000, 20261109180000 | 27 |
| Parcial | 20261020130100, 20261023120000 | 2 |
| Ausente | 20261030120000, 20261109100000, 20261109120000, 20261109130000, 20261109140000, 20261109150000, 20261109160000, 20261109170000 | 8 |
| Inconclusivo | nenhuma no conjunto; alguns efeitos de dados estão marcados como inconclusivos dentro da linha | 0 |

O banco remoto reproduz o estado local logo após `20261030110000`. A exceção é o módulo NC, que veio de uma revisão anterior ao repositório. A partir de `20261030120000`, nenhuma migration foi aplicada. As 37 versões, exceto o módulo NC e um privilégio, foram aplicadas fora do ledger, compatível com o pacote do SQL Editor de 05/11 executado até `20261030110000`. As 6 versões registradas dependem dessas e funcionam por isso.

"Remoto = estado após X" significa que o objeto no banco é idêntico ao que existe localmente logo após a versão X. Uma divergência explicada por sucessora ausente não reduz a situação da versão anterior.

### Situação por versão

| Versão | Finalidade | Evidência remota | Situação | Ação proposta |
|---|---|---|---|---|
| 20261020130000 | Telas e permissões em `app_metadata`; helpers de permissão | 13 de 15 objetos iguais ao final; `select_solicitacoes_por_escopo` e `delete_solicitacoes_admin` = estado após 20261030110000 (sucessoras 20261021130000, 20261023160000, 20261023170000 e 20261030120000, esta ausente). Dados: 14 de 14 usuários com `telas` em `app_metadata`; não há como provar a origem da cópia. | Presente | Marcar como aplicada no ledger (A). |
| 20261020130100 | Módulo NC: tabelas, listas, origens, histórico, view, vínculo com reversa | 165 de 192 objetos iguais; tabelas, colunas, índices, view e listas existem. Divergências: 8 policies sem o wrapper `(select ...)`; defaults `auth.uid()` em `created_by`/`nc_historico.user_id` e `nextval` em `numero`; `nc_historico_preencher` e seu trigger ausentes; `reversa_vincular_nc` e `nc_sincronizar_numeracao` com lógica anterior (sem `legado` nem exigência de NC aberta; trigger só `UPDATE OF nc_id, empresa`); `nc_usuario_nome` lendo `user_metadata` do JWT; `nc_registrar_historico`, `nc_validar_listas` e `reversa_registrar_na_nc` iguais ao repositório, exceto pelo **mojibake** (`nÃ£o`, `â€”`); `trg_nc_updated_at`/`nc_atualizar_updated_at` existem, embora a migration os remova; `pode_operar_reversa` existe só no remoto, sem uso; `authenticated` com UPDATE/DELETE em `nc_historico`. Dados: 1 de 2 linhas de `nc_historico` com mojibake; 10 reversas `legado`, 0 anteriores ao corte sem marca. | Parcial | Migration corretiva incremental (B1) antes de 20261109140000; depois marcar no ledger. |
| 20261020130200 | Etiqueta da reversa: colunas, bucket `etiquetas`, acesso ao PDF | 6 de 7 iguais; `pode_acessar_etiqueta` = estado após 20261030110000 (sucessoras até 20261030120000). Bucket privado, 5 MB, `application/pdf`. Policies de Storage iguais à definição final, sem `etiquetas_update` (removida por 20261023120000). | Presente | Marcar no ledger (A). |
| 20261021120000 | Reversa sem NC obrigatória; marca legado | Sem delta próprio (repetida em 20261020130100). `nc_id` anulável, `solicitacoes_reverso_origem_nc_check` inexistente; 0 reversas anteriores ao corte sem `legado`. | Presente | Marcar no ledger (A). |
| 20261021130000 | Setores do fluxo; validação de etapa; policies de Storage | 23 de 24 iguais; `select_solicitacoes_por_escopo` = estado após 20261030110000. | Presente | Marcar no ledger (A). |
| 20261021140000 | Alinha listas e origens da NC; corrige mojibake nos dados | Sem delta de catálogo. Hash do conteúdo de `nc_listas` e `nc_origens` idêntico ao esperado; 0 linhas com mojibake; `nc_origens_evitavel_check` existe; função temporária removida. | Presente | Marcar no ledger (A). |
| 20261022100000 | Autorizador registrado na aprovação | 2 de 2 iguais. | Presente | Marcar no ledger (A). |
| 20261023100000 | Aprovação de reversas: histórico, fila, configuração | 84 de 86 iguais; `fila_aprovacao_reversas` e `aprovacoes_select` = estado após 20261030110000 (sucessoras 20261023130000, 20261023160000, 20261023190000, 20261030120000 e 20261109130000). Dados: 0 pedidos com status antigo, 0 sem `aprovacao_status` e não legados, 17 legados, `aprovacao_config` com 1 linha. A cópia do nome para `app_metadata` é inconclusiva: 2 usuários têm nome só em `user_metadata` e podem ter sido criados depois. | Presente | Marcar no ledger (A). |
| 20261023110000 | Emissões da etiqueta e eventos | 200 de 202 iguais; `pode_acessar_etiqueta` e `pode_operar_emissao` = estado após 20261030110000. | Presente | Marcar no ledger (A). |
| 20261023120000 | Capacidades e privilégios: revoga `anon`, ajusta grants e Storage | 62 de 67 iguais; `anon` sem privilégio em tabelas e sem EXECUTE. Divergência: `authenticated` mantém UPDATE/DELETE em `nc_historico`, provavelmente concedidos de novo pelo script NC antigo; não há policy de UPDATE/DELETE, então a RLS ainda bloqueia. EXECUTE de `nc_historico_preencher` não se aplica porque a função não existe. | Parcial | Incluir `revoke update, delete on nc_historico from authenticated` em B1; depois marcar no ledger. |
| 20261023130000 | Motivos e endereço de troca | 4 de 5 iguais; `fila_aprovacao_reversas` = estado após 20261030110000. | Presente | Marcar no ledger (A). |
| 20261023140000 | Check-in e rastreio | Seu único objeto, `pode_operar_emissao`, = estado após 20261030110000 (inclui esta versão; sucessora 20261030120000). | Presente | Marcar no ledger (A). |
| 20261023150000 | Recebimento de mercadoria | 8 de 8 iguais. | Presente | Marcar no ledger (A). |
| 20261023160000 | Meus pedidos: autoria e RLS | 10 de 14 iguais; 4 = estado após 20261030110000 (sucessoras 20261023170000 e 20261030120000). | Presente | Marcar no ledger (A). |
| 20261023170000 | Leitura após INSERT da reversa | Policy = estado após 20261030110000. | Presente | Marcar no ledger (A). |
| 20261023180000 | Revoga EXECUTE de `usuario_nome` e similar | 2 de 2 iguais. | Presente | Marcar no ledger (A). |
| 20261023190000 | Aprovadores por empresa e setor | 39 de 40 iguais; `fila_aprovacao_reversas` = estado após 20261030110000. Dados: 8 linhas para 5 usuários elegíveis; o backfill é inconclusivo porque pode ter sido alterado depois. | Presente | Marcar no ledger (A). |
| 20261023200000 | Notificações de aprovação para a expedição | 26 de 27 iguais; `listar_notificacoes_emissao` = estado após 20261030110000. | Presente | Marcar no ledger (A). |
| 20261026200000 | Fila de comunicação da etiqueta | 70 de 70 iguais; trigger `reversa_comunicacao_etiqueta_email_auth` em `auth.users` presente. | Presente | Marcar no ledger (A). |
| 20261026210000 | Resultado indeterminado | 7 de 7 iguais. Dados: 0 linhas com `aceito_pelo_fluxo`. | Presente | Marcar no ledger (A). |
| 20261026220000 | Eventos de logística na fila | 39 de 39 iguais. Dados: 0 avisos de etiqueta em `aguardando_rastreio`. | Presente | Marcar no ledger (A). |
| 20261027100000 | Ciclo do pedido na comunicação | 35 de 35 iguais. Dados: 18 avisos `evento_obsoleto`, 0 avisos antigos pendentes. | Presente | Marcar no ledger (A). |
| 20261027110000 | Reconciliação administrativa | 35 de 35 iguais. | Presente | Marcar no ledger (A). |
| 20261027120000 | Relatórios da reversa | 8 de 8 iguais. | Presente | Marcar no ledger (A). |
| 20261027130000 | Recebimento físico após a entrega | 4 de 5 iguais; `listar_recebimentos_fisicos_pendentes` = estado após 20261030110000. | Presente | Marcar no ledger (A). |
| 20261027140000 | Postagem automática pelo rastreio | 2 de 2 iguais. | Presente | Marcar no ledger (A). |
| 20261030100000 | Auditoria de aprovadores sem usuário obrigatório | 2 de 2 iguais: coluna anulável e FK `ON DELETE SET NULL`. | Presente | Marcar no ledger (A). |
| 20261030110000 | Remove FK `RESTRICT` do histórico de aprovação | A FK `solicitacoes_aprovacoes_solicitacao_id_fkey`, criada por 20261023100000, não existe; a FK em cascata existe. A evidência é indireta, por ausência. | Presente | Marcar no ledger (A). |
| 20261030120000 | Lixeira: arquivamento auditado no lugar da exclusão física | 0 de 31: colunas `inutilizada_*`, funções, trigger, índice e 4 policies ausentes. Permanecem `delete_solicitacoes_admin` e o DELETE de `authenticated` em `solicitacoes_reverso`. | Ausente | Aplicar (B2). Antes, conferir em homologação o efeito da troca para quem exclui pedidos hoje. |
| 20261109100000 | Classificação separada da NC | 20 objetos ausentes, incluindo `tipo_problema`, `causador`, `area_*`, `custo_situacao` e triggers; `nc_listas_lista_check`, `nc_registrar_historico`, `nc_validar_listas` e a view são anteriores. O único item igual é o grant da view, já satisfeito. Dados: 1 NC; o backfill não pode ser verificado. | Ausente | Aplicar (B2). |
| 20261109120000 | Tipo e causador obrigatórios no registro | Função e trigger ausentes; `ncs_para_reversa` = estado após 20261109100000. Teste de dependência: sem 20261109100000, o INSERT de NC falha (`record "new" has no field "tipo_problema"`). | Ausente | Aplicar após 20261109100000 (B2). |
| 20261109130000 | Fila de aprovação com classificação da NC | `fila_aprovacao_reversas` = estado após 20261030110000. A chamada falha sem 20261109100000 (`nc.tipo_problema`); a função também lê `inutilizada_em`, de 20261030120000. | Ausente | Aplicar após 20261030120000 e 20261109100000 (B2). |
| 20261109140000 | Edição de NC com versão, auditoria financeira e `nc_salvar_edicao` | 30 de 31 objetos ausentes; `nc_proteger_campos` = estado anterior (`now()`). Detalhes abaixo. | Ausente | Aplicar após B1 e 20261109100000 (B2). |
| 20261109150000 | Avisos do ciclo da reversa (sino) | 0 de 40: `reversa_avisos`, 6 funções e 2 triggers ausentes. Aplica de forma independente sobre o estado atual. | Ausente | Aplicar (B2). |
| 20261109160000 | Edição de NC só pelo servidor | `nc_salvar_edicao` não existe; `authenticated` mantém UPDATE em `nao_conformidades` = estado após 20261109150000. Falha sem 20261109140000. | Ausente | Aplicar logo após 20261109140000 (B2). |
| 20261109170000 | Remove EXECUTE de funções de gatilho | As 5 funções-alvo não existem; falha sem 20261030120000, 20261109100000 e 20261109120000. | Ausente | Aplicar por último entre as NC (B2). |
| 20261109180000 | Remove TRUNCATE, REFERENCES e TRIGGER de `anon`/`authenticated` | Efeito já satisfeito: nenhuma tabela ou view de `public` dá esses privilégios a `anon` ou `authenticated`. O grant da view, único delta local, também é igual. | Presente | Marcar no ledger (A); reaplicar é inócuo. |

### As seis versões registradas nos dois lados

Todas estão presentes: `20261028100000` (13/13), `20261028110000` (32/32), `20261028120000` (3/3), `20261028130000` (4/4) e `20261028140000` (25/25). A base `20260828171717` diverge só onde as sucessoras já explicam. Elas dependem de objetos de `20261023190000`, `20261020130000` e da cadeia da fila de comunicação (`20261026*`–`20261027*`). Isso confirma que essas versões não registradas já estavam no banco quando as versões de 28/10 foram aplicadas pela CLI, como `docs/migrations.md` também descreve.

### Exame de 20261109140000

| Item | Esperado (cadeia completa, após 160000–180000) | Remoto |
|---|---|---|
| `nc_auditoria_financeira` | Tabela com 13 colunas, 5 checks, PK, `idx_nc_auditoria_nc` e RLS ligada; policy `nc_auditoria_select` usando `(select pode_ver_nc())`; `authenticated` só com SELECT, `anon` sem privilégio, `service_role` com todos | Não existe |
| `nc_auditar_alteracao_financeira()` | `SECURITY DEFINER`, `search_path=''`; EXECUTE apenas para `service_role` (PUBLIC, `anon` e `authenticated` revogados) | Não existe |
| `trg_nc_auditoria_financeira` | `AFTER UPDATE` em `nao_conformidades` | Não existe |
| `nc_salvar_edicao(uuid, timestamptz, jsonb, text)` | Criada `SECURITY INVOKER`; **20261109160000 a torna `SECURITY DEFINER`**; `search_path=''`; EXECUTE para `authenticated` e `service_role`, sem PUBLIC ou `anon`; permissão conferida por `pode_editar_nc()` | Não existe |
| `nc_proteger_campos()` | Versão com `updated_at := clock_timestamp()` no UPDATE | Versão anterior com `now()`; EXECUTE `authenticated` e `service_role`, sem `anon` |
| UPDATE de `authenticated` em `nao_conformidades` | Revogado por 20261109160000 | **Concedido**; com a policy `nc_update`, a edição direta pela API continua possível |
| Grants indiretos (20261109180000) | Sem TRUNCATE, REFERENCES ou TRIGGER para `anon`/`authenticated` | Já satisfeito |

Dependências verificadas no PGlite, partindo do estado equivalente ao remoto:

- **20261109100000 é obrigatória.** Com 20261109140000 aplicada sozinha, a migration passa, mas qualquer UPDATE de NC falha com `record "old" has no field "custo_situacao"` porque o trigger de auditoria referencia colunas criadas por 20261109100000. O cabeçalho de `docs/migrations.md` cita 20261109130000 como requisito, mas a dependência real é 20261109100000.
- **20261109160000 depende de 20261109140000** (`ALTER FUNCTION` falha sem a função) e deve ser aplicada logo depois. Enquanto só 20261109140000 estiver aplicada, a função é `SECURITY INVOKER` e a edição direta por UPDATE continua liberada.
- **Conflito com o trigger remoto `trg_nc_updated_at`.** Os triggers `BEFORE UPDATE` executam em ordem alfabética: `trg_nc_proteger_campos` → `trg_nc_updated_at` → `trg_nc_validar_listas`. Por isso o trigger legado sobrescreve o `clock_timestamp()` de 20261109140000 com `now()` (início da transação), contrariando a regra de versão da edição. A remoção prevista em 20261020130100 precisa estar no banco antes de 20261109140000, como parte de B1.
- **`nc_usuario_nome` remoto lê o nome de `user_metadata` no JWT**, que o próprio usuário pode alterar. A trilha financeira usaria esse nome como `autor_nome`. A versão local lê `auth.users.raw_user_meta_data`, que também é editável pelo usuário. Vale revisar se a autoria deve vir de `app_metadata`.
- A trilha é append-only para `authenticated`; `service_role` e o dono ainda têm UPDATE/DELETE. Nenhum trigger impede essas alterações.

### O que afeta o funcionamento do Reverso hoje

- **Front-end atual × banco.** O código local usa objetos que não existem no remoto: `nc_salvar_edicao` (gravação de NC), colunas `tipo_problema`, `causador`, `area_*` e `custo_situacao` (formulário, listas, aprovação), `nc_tipo_problema` na fila de aprovação, as RPCs da Lixeira e as RPCs do sino. Publicar esse front-end antes de B2 quebraria a edição de NC, a Lixeira e os avisos, e afetaria a fila de aprovação.
- **Exclusão física ainda ativa.** Sem 20261030120000, o administrador ainda exclui pedidos fisicamente pela policy `delete_solicitacoes_admin`.
- **Edição de NC sem controle de versão.** Gravação direta, sem versão, justificativa ou trilha financeira.
- **Módulo NC antigo.** O histórico grava rótulos com mojibake (1 de 2 linhas); o vínculo reversa/NC não exige NC aberta; a autoria vem de metadado editável; e notas podem ser inseridas com `user_nome` informado pelo cliente, porque `nc_historico_preencher` não existe.

### Sequência proposta para homologação

**A. Ajuste do histórico (ledger).** Só registra versões, sem alterar schema, e deve ser feito depois de B em cada ambiente:

1. Em homologação, depois de B validado, e só então em produção: `supabase migration repair --status applied` para as 27 versões presentes e, após B1, para `20261020130100` e `20261023120000`.
2. Fazer o repair **antes** de qualquer `db push`; caso contrário, a CLI tentará aplicar de novo as versões antigas sem registro. Se as 8 ausentes forem aplicadas pelo SQL Editor e não pela CLI, registrá-las também com repair depois de conferir o catálogo.
3. Nunca marcar como aplicada uma versão ausente ou parcial sem a correção correspondente no banco.

**B. SQL que altera o banco.** Nada foi executado. Executar primeiro em homologação com schema igual ao de produção e dados sintéticos:

1. **B1. Migration corretiva incremental (nova versão), sem editar 20261020130100.** Remover `trg_nc_updated_at` e `nc_atualizar_updated_at`; recriar com o texto do repositório, em UTF-8, `nc_registrar_historico`, `nc_validar_listas`, `reversa_registrar_na_nc`, `reversa_vincular_nc` (com o trigger sem `OF nc_id, empresa`), `nc_sincronizar_numeracao`, `nc_usuario_nome`, `nc_historico_preencher` e seu trigger. Recriar as 8 policies NC com `(select ...)`, retirar os defaults `auth.uid()` e `nextval` que a versão local não tem e revogar UPDATE/DELETE de `authenticated` em `nc_historico`. Decidir se `pode_operar_reversa` deve ser removida: está órfã e EXECUTE para `authenticated`. Decidir também se a linha de `nc_historico` com mojibake deve ser corrigida, porque é alteração de dado. Validar contra o catálogo esperado da cadeia completa.
2. **B2. Migrations ausentes, nesta ordem:** `20261030120000` → `20261109100000` → `20261109120000` → `20261109130000` → `20261109140000` → `20261109160000` → `20261109150000` → `20261109170000`. Mover 160000 para antes de 150000 evita uma janela com a edição de NC sem proteção; 150000 não depende das versões NC. `20261109180000` já está satisfeita; reaplicar é inócuo.
3. Repetir o snapshot de catálogo e as contagens desta seção; o resultado esperado é zero divergências em relação à cadeia completa. Depois, executar a suíte PostgreSQL, os testes de banco das NC e o plano funcional da seção 7.
4. Publicar o front-end só depois de B2 no ambiente correspondente.

Consulta de conferência rápida, somente leitura, para o SQL Editor:

```sql
select
  to_regclass('public.nc_auditoria_financeira') is not null as auditoria_financeira,
  to_regclass('public.reversa_avisos') is not null as avisos,
  to_regprocedure('public.nc_salvar_edicao(uuid,timestamptz,jsonb,text)') is not null as nc_salvar_edicao,
  to_regprocedure('public.inutilizar_chamado(uuid)') is not null as lixeira,
  exists (select 1 from pg_attribute where attrelid = 'public.nao_conformidades'::regclass and attname = 'tipo_problema' and not attisdropped) as classificacao_nc,
  exists (select 1 from pg_trigger where tgrelid = 'public.nao_conformidades'::regclass and tgname = 'trg_nc_updated_at') as trigger_legado_updated_at,
  has_table_privilege('authenticated', 'public.nao_conformidades', 'UPDATE') as nc_update_direto,
  (select count(*) from supabase_migrations.schema_migrations) as versoes_no_ledger;
```

Resultado atual em produção: `false, false, false, false, false, true, true, 6`. Depois de B e A: `true, true, true, true, true, false, false, 44` (43 + B1).

## 3. Testes PostgreSQL

Os testes PostgreSQL anteriores foram cancelados porque embedded-postgres não inicia com o processo Windows elevado como Administrador. A causa foi contornada executando a suíte em um PowerShell sem elevação, com o PostgreSQL temporário do harness e stubs locais do Supabase; o banco de produção não foi utilizado.

**Resultado informado pelo usuário:** 330 testes em 75 suítes, 330 aprovados, 0 falhas, 0 cancelados, 0 ignorados e 0 pendentes. Duração: 120930 ms. A suíte PostgreSQL está aprovada; repetir somente se alterações futuras afetarem migrations, banco ou os testes.

## 4. Dependências e vulnerabilidades

O lockfile-base tinha oito pacotes vulneráveis: três achados moderados e cinco altos. Foram feitas atualizações direcionadas, sem npm audit fix --force.

| Pacote | Alcance anterior | Tratamento local | Situação |
|---|---|---|---|
| xlsx | Produção; audit do registry marcava todas as versões e não oferecia correção. | Fixado no tarball oficial SheetJS 0.20.3 via CDN sheetjs.com. | Versão atualizada; risco residual de distribuição fora do registry, artefato fixado no lockfile. |
| zod | Produção; achado alto abaixo de 4.6.6. | Atualizado para 4.6.7; mensagens e ordem de validação ajustadas em formSchema.ts. | Corrigido; suíte e build passaram. |
| vite | Build; achado alto nas versões 8.2.0–8.2.2. | Atualizado para 8.3.8 dentro da major 8. | Corrigido; build e suíte passaram. |
| vitest | Testes; achado moderado até 4.1.10. | Atualizado para 4.1.12 na mesma major. | Corrigido. |
| @vitest/ui | Ferramenta de desenvolvimento; achado moderado até 4.1.10. | Atualizado para 4.1.12. | Corrigido. |
| @vitest/mocker | Transitivo de testes; achado moderado até 4.1.11. | Lockfile atualizado para 4.1.12. | Corrigido. |
| undici | Transitivo; achado alto nas versões 8.0.0–8.12.1. | Lockfile atualizado para 8.12.4. | Corrigido. |
| source-map-js | Transitivo; achado alto nas versões 1.0.0–1.2.1. | Lockfile atualizado para 1.2.2. | Corrigido. |

npm audit e npm audit --omit=dev retornam zero vulnerabilidades. A ressalva do xlsx é a origem: npm audit não substitui inspeção do tarball servido fora do registry. O pacote está fixado no package-lock.json; mantenha origem e integridade revisadas em futuras atualizações. [Documentação do SheetJS](https://docs.sheetjs.com/).

## 5. Regressão e verificações locais

A falha anterior do teste do template era causada pelo padrão aceitar somente LF. Em checkout CRLF, o bloco JSON não era encontrado e a validação falhava antes de conferir o conteúdo. O teste agora aceita LF e CRLF e verifica que o bloco existe antes de analisá-lo.

Durante os ajustes de dependências apareceram três falhas temporárias: documentação do décimo nome de variável, mensagem de limite numérico após Zod 4 e expectativa antiga do nome da variável pública. Todas foram corrigidas antes da execução final.

| Verificação | Resultado desta etapa |
|---|---|
| npm run lint | Exit 0; 7 avisos preexistentes: seis escapes desnecessários em etiquetaPdf.ts e um aviso Fast Refresh em ContadorAprovacoesContext.tsx. |
| npx tsc -b --pretty false | Exit 0. |
| Testes focados de chave, contrato, CRLF, ambiente e Zod | 86 aprovados em 5 arquivos. |
| Reexecução focada de mocks de autenticação, SMTP/template, Power Automate, Correios e notificações | 132 aprovados em 12 arquivos nesta continuação; sem chamadas externas. Este resultado é separado e não deve ser somado aos 925 da suíte completa. |
| npm test -- --reporter=dot | 925 aprovados em 88 arquivos; zero falhas e cancelamentos. |
| npm run build | Aprovado com valores fictícios; Vite 8.3.8 transformou 2963 módulos. |
| Scan do bundle | 67 assets; sem valor sb_secret, JWT, claim service_role ou os marcadores demo pesquisados. |
| npm audit | Zero vulnerabilidades reportadas. |
| npm audit --omit=dev | Zero vulnerabilidades nas dependências de produção. |
| Testes PostgreSQL | Resultado informado pelo usuário: 330 aprovados em 75 suítes, zero falhas, cancelamentos, ignorados ou pendentes; 120930 ms. |
| Playwright ponta a ponta | Não executado; homologação pendente. |

A reexecução focada cobriu src/test/conviteEmail.test.ts, src/test/authService.test.ts, src/test/authServiceConvite.test.ts, src/test/contratoFluxoPowerAutomate.test.ts, src/test/powerAutomateTemplate.test.ts, src/test/comunicacaoEtiquetaLogic.test.ts, src/test/correios.test.ts, src/test/correios-acesso.test.ts, src/test/correios-flow.test.ts, src/test/apiServiceNotifications.test.ts, src/test/avisosReversoService.test.ts e src/test/supabaseKeys.test.ts. Essas verificações não comprovam acesso real ao Supabase, entrega de e-mail, Power Automate ou Correios.

## 6. Railway, Docker e Nginx

O Dockerfile usa Node 22 Alpine para instalar pelo lockfile e gerar o build; Nginx Alpine serve o dist. Os ARG/ENV incluem VITE_SUPABASE_PUBLISHABLE_KEY e a compatibilidade temporária VITE_SUPABASE_ANON_KEY. O runtime usa PORT do Railway.

O nginx.conf foi revisado para responder 200 em /healthz, usar fallback SPA, devolver 404 para assets e /api/ ausentes, bloquear arquivos ocultos e evitar query strings nos logs de acesso que poderiam conter token_hash.

O Railway consulta /healthz durante a inicialização do deployment. Isso não é monitoramento contínuo e não verifica banco, autenticação ou integrações. [Dockerfiles Railway](https://docs.railway.com/builds/dockerfiles) e [Healthchecks Railway](https://docs.railway.com/deployments/healthchecks).

Docker e Podman não estão instalados; a imagem não foi construída, nginx -t não foi executado e rotas HTTP do container não foram testadas. Build Vite não substitui essa validação. Foi criado [scripts/validar-container-railway.ps1](../scripts/validar-container-railway.ps1); o parser do PowerShell aceitou a sintaxe. O roteiro usa dados fictícios, publica a porta somente em loopback e valida build, startup, nginx -t, /healthz, SPA, 404 para assets/API ausentes, PORT, mapeamento da porta, presença das variáveis VITE fictícias no bundle, padrões de segredo/JWT, query string ausente nos logs e restart. Ele não foi executado porque não há Docker Engine; portanto não conta como teste aprovado. Nenhum ID de projeto ou serviço Railway foi consultado; não foi criado IaC que pudesse apontar para infraestrutura presumida.

A documentação [RAILWAY.md](RAILWAY.md) foi atualizada. Domínio, APP_BASE_URL, ALLOWED_ORIGINS, Site URL e Redirect URLs ainda precisam ser configurados e verificados no ambiente correto.

## 7. Plano executável de homologação segura

### Preparação

1. Use projeto Supabase e serviço Railway de homologação separados, sem cópia de dados de produção.
2. Crie contas e dados sintéticos, com destinatários no domínio reservado example.test.
3. Use SMTP local ou sink como Mailpit, sem credenciais ou destinatários reais.
4. Configure Power Automate em fluxo de teste com envios desativados ou redirecionados para coletor.
5. Aponte Correios para stub local com respostas gravadas e bloqueie egress ao endpoint real.
6. Use anexos PDF/PNG fictícios e valide isolamento do Storage por empresa.
7. Separe estados Playwright para visitante, solicitante A, aprovador A, expedição A, solicitante B e administrador; use somente contas de homologação.

### Casos e critérios de aprovação

| Fluxo | Execução | Critério verificável |
|---|---|---|
| Login e recuperação | Entrar com usuário sintético, sair, pedir recuperação, abrir link do sink e definir nova senha. Testar link expirado e redirect fora da allowlist. | Sessão e redirect corretos; link inválido recusado; nenhum e-mail real. |
| Abertura de chamados | Solicitante A cria chamado sintético com anexo; repetir com campos inválidos. | Registro visível para A; validações corretas; anexo privado. |
| Aprovações | Aprovador designado aprova e rejeita; usuário sem permissão tenta a ação; duas sessões editam a mesma versão. | Transições e histórico corretos; negação sem vazamento; conflito impede sobrescrita. |
| Separação por empresa | A e B tentam abrir listas, IDs, histórico e URLs de anexos da outra empresa. | B não lê nem altera dados de A, inclusive por URL e API. |
| Não conformidades | Criar NC, editar campos, simular concorrência, corrigir custos com/sem justificativa e tentar alterar trilha. | Campos não enviados preservados; correção sem justificativa negada; trilha append-only. |
| Notificações | Manter ETIQUETA_TRANSPORTE em simulado; gerar eventos de criação, aprovação, rejeição e postagem; testar repetição e falha. | Nenhum envio externo; fila, tentativas e idempotência corretas. |
| Edge Functions | Em homologação, testar admin-usuarios, comunicacao-etiqueta e correios-rastreio com payloads válidos/inválidos, Auth, apikey, CORS e erros; substituir OAuth, SMTP, Power Automate e Correios por mocks/sinks/stubs. | Autorização e status corretos; sem secrets em resposta/log; nenhum serviço de produção acionado. |
| SMTP | Enviar convite e recuperação para usuário example.test pelo Mailpit; abrir links. | Mensagens chegam somente ao sink; remetente, URL e redefinição corretos. |
| Power Automate | Chamar fluxo de homologação com credencial de teste e coletor sem ações Outlook/Teams. Testar token inválido, payload, erro e repetição. | Autenticação validada; nenhum canal de produção acionado. |
| Fluxos da Expedição | Rodar emissão simulada, confirmação de postagem, rastreio pelo stub e recebimento; testar cancelamento/reabertura permitidos. | Estados, permissões, histórico e avisos corretos; sem etiqueta ou postagem real. |
| Documentos e anexos | Enviar PDFs/PNG sintéticos, baixar/substituir, tentar acesso por outra empresa e testar tipo/tamanho inválido. | Tipo/tamanho validados; Storage privado; acesso cruzado recusado. |
| Correios | Stub retorna eventos fictícios e erros HTTP; testar cron e ação manual. Bloquear rede para Correios real. | Status atualizado pelo stub; nenhuma postagem ou consulta real. |
| Tema claro/escuro | Abrir login, listas, formulários, aprovação, NC, modais e filas nos dois temas e em viewport móvel. | Contraste, foco, erros, tabelas e modais legíveis; preferência persiste. |
| Playwright por perfil | Rodar cenários com storageState isolado, limpar sessão entre perfis e gravar screenshot sem dados reais em falhas. | Acessos positivos e negativos validados; estados de autenticação não compartilhados. |

Registre build, ambiente, perfis sintéticos e resultados por caso. Não registre tokens, senhas, e-mails reais ou corpos sensíveis. Não ligue ações reais de Power Automate, SMTP ou Correios sem autorização específica.

## 8. Pendências por responsável

### 1. Resolvidas automaticamente

- Compatibilidade local com sb_publishable e sb_secret, mantendo fallback legado temporário; wrapper de fetch do cliente browser e Edge Functions impede enviar a nova chave também como Bearer.
- Rejeição de chave secreta no frontend e mensagens/logs que não mostram valores.
- Atualização dos oito pacotes vulneráveis identificados; audit atual sem achados.
- Correção do teste sensível a CRLF.
- Lint, typecheck, build e 925 testes Vitest aprovados.
- Suíte PostgreSQL completa: 330 aprovados em 75 suítes; zero falhas, cancelados, ignorados ou pendentes (resultado executado pelo usuário em PowerShell sem elevação).
- Reexecução focada: 132 testes com mocks aprovados em 12 arquivos; não somar ao total da suíte completa.
- Atualização de docs/RAILWAY.md e deste relatório.

### 2. Dependentes de ação minha

- Criar chaves no Dashboard e planejar publicação da versão compatível.
- Atualizar variáveis Railway, secrets das Edge Functions, os dois segredos de cron no Vault e webhooks/automações externas.
- Após validar consumidores, desativar anon/service_role antigas e revogar a chave JWT legada.
- Inventariar conexões PostgreSQL, redefinir a senha exposta e atualizar cofres dependentes.
- Aprovar a sequência da seção 2: migration corretiva do módulo NC (B1), as 8 migrations ausentes em homologação (B2) e só então o repair do ledger (A). Decidir sobre pode_operar_reversa e a linha de nc_historico com mojibake.
- Instalar/iniciar Docker Desktop ou fornecer WSL com distribuição e runtime, depois executar `scripts/validar-container-railway.ps1`.
- Concluir homologação isolada; SMTP de transporte real e Edge Functions no runtime Deno ainda não foram executados. O worker de integração com PostgreSQL local e Power Automate simulado passou na suíte informada.

### 3. Dependentes de homologação

- Login, convite, recuperação e redirects: há testes unitários com mocks; falta fluxo ponta a ponta.
- Chamados, aprovações, separação por empresa, NC, notificações, SMTP, Power Automate, Expedição, documentos/anexos e interface light/dark.
- Playwright com seis perfis sintéticos e tentativas negativas.
- Correios somente contra stub, sem consulta ou postagem real.

### 4. Bloqueadores ainda existentes

1. As chaves service_role e a senha PostgreSQL foram expostas historicamente e ainda não foram rotacionadas.
2. O banco remoto não tem 8 migrations (Lixeira, classificação e edição de NC, avisos e privilégios) das quais o front-end atual depende, e o módulo NC remoto é uma versão antiga e parcial. O ledger registra 6 de 43 versões.
3. Docker/Nginx não foram validados dentro de container; o roteiro foi criado e teve somente a sintaxe verificada.
4. Integrações e fluxos de usuário não passaram por homologação isolada; os testes com mocks não substituem a homologação ponta a ponta.

A classificação permanece **BLOQUEADO PARA DEPLOY**. As pendências e a ordem de preparação estão abaixo.

## 9. Ordem exata para preparar a publicação

1. Reconciliação concluída em leitura (seção 2). Próximo passo: preparar a migration corretiva do módulo NC (B1) e aplicar B1 + as 8 ausentes, na ordem da seção 2, em homologação; conferir o catálogo e então registrar o ledger (A). Em produção, nada de `db push`, `migration repair` ou escrita sem aprovação explícita.
2. Disponibilizar Docker Engine/WSL com distribuição e executar `scripts/validar-container-railway.ps1`. Exigir build, inicialização, health check, rotas SPA/404, porta, logs, restart e scan do bundle aprovados antes de considerar Docker validado.
3. Criar/confirmar ambiente de homologação separado, com contas e dados sintéticos, Mailpit/sink, Power Automate de teste e Correios stub bloqueando egress externo. Executar o plano da seção 7 e registrar resultados por fluxo e perfil.
4. Revisar no Dashboard e cofres a lista de consumidores de credenciais. Preparar novas chaves/segredos conforme a sequência da seção 1, mantendo os legados ativos até todos os consumidores novos passarem em homologação. Rotação/revogação de produção permanece uma ação manual futura.
5. Revisar o diff local, confirmar migrations compatíveis com o ledger remoto e repetir as verificações já cobertas quando o código mudar. Ainda não criar commit, push, merge ou deploy nesta etapa.
6. Somente depois de todos os itens anteriores aprovados, combinar a janela de publicação e executar a sequência autorizada em docs/RAILWAY.md: atualizar primeiro Edge Functions e consumidores, crons/webhooks, em seguida build do frontend com a chave pública; verificar os serviços; revogar as chaves JWT legadas e trocar a senha PostgreSQL conforme o plano. Nenhuma dessas ações remotas foi feita aqui.