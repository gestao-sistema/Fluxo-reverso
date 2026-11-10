# Conclusão funcional — logística reversa

> **Separação dos transportes de e-mail (28/10/2026):** convites e definição/recuperação de senha usam SMTP direto (`admin-usuarios`, [`envio-email-smtp.md`](./envio-email-smtp.md)); as **notificações dos pedidos** (Outlook e Teams) usam o Power Automate ([`power-automate/CONTRATO_INTEGRACAO.md`](./power-automate/CONTRATO_INTEGRACAO.md)). A tentativa de enviar notificações por SMTP foi desfeita no worker; os registros históricos `smtp_aceito` continuam preservados. Nenhuma mensagem de notificação real foi enviada.

> **Atualização posterior:** a navegação, o anexo da etiqueta, a situação do pedido e o acompanhamento dos Correios foram simplificados depois desta entrega (Kanban, Check-in e Relatórios deixaram de ser telas; a confirmação física passou para o detalhe do pedido). Estado atual e diagnóstico em [`correcao-de-rumo-fluxo-principal.md`](./correcao-de-rumo-fluxo-principal.md).

Fluxo coberto: **solicitação → aprovação → emissão manual da etiqueta → acompanhamento da postagem → recebimento**, mais a comunicação automática (solicitante acompanha o ticket; aprovadores sabem que há pedidos a aprovar; expedição sabe que há etiquetas a emitir).

> **Rodada de estabilização (posterior):** as 33 falhas de testes foram investigadas (seção 6), o recebimento físico depois da entrega dos Correios foi tratado (seção 4) e a conferência visual em modo demonstração foi feita (seção 11). Onde este documento citava "33 falhas preexistentes" ou "sem conferência visual", vale o que está nas seções 5.1, 6 e 11.

Esta é a auditoria feita **sobre o código real**, não sobre a presença de telas. Nada foi aplicado em Supabase, Power Automate, Outlook, Teams ou Correios reais; nenhum commit foi feito; o estado do banco de destino é desconhecido.

**Como ler os rótulos**

- **[A] Implementado e testado localmente** — existe no código e há teste automatizado local (PostgreSQL 17 real, Vitest, Deno) que o exercita.
- **[B] Preparado, depende de configuração externa** — o código/roteiro existe, mas só funciona depois de configurar tenant, segredos, agendador, deploy etc.
- **[C] Regra de negócio não confirmada** — nada foi inventado; está registrado como dúvida.

## 1. Auditoria objetiva (matriz)

| Requisito | Implementação encontrada | Arquivos / RPCs | Evidência | Lacuna encontrada | Ação / situação final |
| --- | --- | --- | --- | --- | --- |
| Abertura de pedido (Alinare/Novitah; Comercial, Financeiro, Assistência Técnica, Expedição) | Formulário → INSERT; triggers fixam autoria, versão 1 e `aprovacao_status = aguardando_aprovacao`; NC opcional | `ReverseLogisticsForm`, `reversa_aprovacao_ao_criar`, `validar_etapa_por_setor` | `banco.test.mjs` (criação, NC opcional), `seguranca.test.mjs` | O setor **Expedição** não existia na lista do formulário (nem na configuração de aprovadores) | Adicionado à lista (`SETORES`, formulário). **[C]** quem aprova pedidos de Expedição é configuração (aprovadores "todos os setores" já cobrem; por setor precisa ser configurado) |
| Solicitante pelo usuário autenticado; sem associar pedido antigo por nome | `solicitado_por` gravado pelo servidor; pedidos antigos ficam sem autor | `reversa_solicitante_autenticado`, `20261023160000` | `seguranca.test.mjs` ("autoria em INSERT autenticado"), `banco.test.mjs` (legado sem autoria) | — | **[A]** |
| Meus Pedidos (inclui rejeitados e concluídos) | Consulta `solicitado_por = usuário` + RLS; aprovação e logística separadas | `MeusPedidosPage`, `getMeusSolicitacoes`, `pode_ler_solicitacao` | `MeusPedidosPage.test.tsx`; testes de RLS | Rótulo do pedido diferente nas telas (`Pedido #abcd1234`, `RV-ABCD1234`, `#abcd1234`) e no aviso | Padronizado em `RV-XXXXXXXX` (`src/lib/pedido.ts`) em telas, avisos, relatórios e comunicações **[A]** |
| Acesso ampliado de gestores | Telas `dashboard-*`, `lista-*`, `status-*`, `kanban*`, `nc*` ampliam só a consulta por empresa | `empresas_consulta_ampliada()`, `pode_ler_solicitacao()` | `seguranca.test.mjs` ("consulta não altera", "empresa A não acessa a B") | A composição da "equipe" do gestor **não existe** no modelo | Escopo atual preservado; sem hierarquia inventada. **[C]** (ver seção 8) |
| Aprovação por empresa/setor; uma decisão basta; usuário + data do servidor + justificativa; rejeição exige justificativa; autoaprovação configurável; checagem no backend | `reversa_aprovadores_setor` + capacidade + empresa; `aprovar_reversa`/`rejeitar_reversa`; histórico imutável; `aprovacao_config.permitir_autoaprovacao` (padrão `false`) | `20261023100000`, `20261023190000` | `banco.test.mjs` (aprovação, concorrência, escopo, legado; 76 testes no arquivo) | — | **[A]** |
| Aprovar por e-mail/Teams | Fora do escopo | — | — | — | Não implementado, como pedido. Os avisos só **abrem** a tela autenticada |
| Fila de aprovação / emissão expansíveis | Páginas com itens expansíveis, filtros e histórico | `ApprovalQueuePage`, `FilaOperacionalPage` | `ApprovalQueuePage.test.tsx`, `FilaEmissao.test.tsx` | O link do aviso (`?solicitacaoId=`) não abria o item na fila de aprovação | Link abre o pedido; se já decidido, informa "não está mais aguardando a sua decisão" **[A]** |
| Emissão manual: ERP conferido à mão; PDF anexado; código de autorização ≠ rastreamento; rastreamento opcional; extração do PDF só sugere | `registrar_emissao_reversa`, `anexar_pdf_emissao`, `atualizar_dados_emissao`; extração em `etiquetaPdf.ts` apenas pré-preenche | `20261023110000`, `EtiquetaReversa` | `banco.test.mjs`, `seguranca.test.mjs`, `EtiquetaReversa.test.tsx`, `etiquetaPdf.test.ts` | — | **[A]** |
| Reemissão preserva histórico e PDFs; emissão incompleta recuperada sem duplicar; sai da fila só com PDF vinculado | Reemissão = nova linha (a anterior fica "substituída no sistema"); recuperação reaproveita a emissão sem PDF | `reversa_emissoes`, eventos imutáveis | `banco.test.mjs`, `seguranca.test.mjs`, `demoEmissao.test.ts` | — | **[A]** |
| Validade | `emitida_em` / `valida_ate` opcionais, informados à mão; nenhum prazo presumido | `emissaoDatas.ts`, `EmissaoDatasResumo` | `emissaoDatas.test.ts`, `banco.test.mjs` | — | **[A]**. A validade só aparece no aviso quando existe |
| Postagem (check-in) | `confirmar_postagem_emissao` grava `postagem_confirmada_em/fonte/por` e leva a etapa a "postado" | `20261023110000`, `20261023140000` | `banco.test.mjs` | O check-in aparecia como "recebimento nos Correios" (botão, diálogo, descrição) e a etapa "postado" como "Recebido pelos Correios", palavra já usada para o recebimento da mercadoria | Renomeado para "postagem"/"Postado nos Correios" **[A]** |
| Recebimento físico | `confirmar_recebimento_mercadoria` (manual, só em trânsito) | `20261023150000` | `banco.test.mjs` | Não ficava registrado **quem** confirmou nem se foi a empresa ou a transportadora (os dois levam a `concluido`) | Tabela `reversa_recebimentos_confirmados` (+ histórico) **[A]** |
| Encerramento do ticket | `status = 'concluido'` por entrega informada pelos Correios (BDE) **ou** por recebimento manual | `correios-rastreio`, `reversa_conclusao_proteger` | `banco.test.mjs` | A reunião não fechou qual evento encerra | **Regra de encerramento não alterada** **[C]** (ver seções 4 e 8) |
| NC opcional | Reversa nasce sem NC; vínculo preservado quando usado | `20261021120000` | `banco.test.mjs` | — | **[A]** |
| Notificações internas (sino) para expedição | `listar_notificacoes_emissao`, leitura por usuário | `20261023200000` | `notificacoes.test.mjs`, `NotificacoesEmissaoBell.test.tsx` | — | **[A]**; preservado e não duplicado pela fila externa |
| Comunicação: eventos | Fila generalizada (`pedido_criado`, `aprovacao_pendente`, `pedido_aprovado`, `pedido_rejeitado`, `emissao_pendente`, `etiqueta_disponivel`, `postagem_confirmada`, `recebimento_confirmado`) | `20261026220000` | testes anteriores | **A ampliação já existia, mas com defeitos** — ver seção 2 | Corrigido em `20261027100000` **[A]** |
| Comunicação: worker e transporte | Edge Function `comunicacao-etiqueta`; Power Automate para e-mail (Outlook) e Teams, um canal por chamada; SMTP não é usado aqui | `supabase/functions/comunicacao-etiqueta/*`, `docs/envio-email-smtp.md` | testes direcionados e Deno check local | saída TCP do projeto hospedado, SMTP AUTH e Send As ainda precisam ser confirmados | Nodemailer com STARTTLS obrigatório, estados SMTP e sem retry cego em resultado indeterminado; agendamento permanece inalterado **[A]/[B]** |
| Reconciliação de indeterminados | Não existia | — | — | Sem consulta nem ação | `/admin/comunicacoes` + RPCs administrativas **[A]** |
| Relatórios por empresa/período | Dashboard por status/empresa/motivo; Lista com XLSX | `DashboardPage`, `ListPage`, `analytics.ts` | testes antigos (4 arquivos com 33 falhas, **resolvidas** na rodada de estabilização: seção 6) | Sem emissões/reemissões, aprovação, postagem, validade; sem indicar a data filtrada; exportação ignorava o período e **não neutralizava fórmulas** em texto digitado | `/admin/relatorios` + RPCs; planilha segura também na Lista **[A]**. Custo e taxa de utilização: não há dados — **não inventados** |
| Segurança de funções novas | — | — | — | — | Nenhuma função interna com EXECUTE para `anon`/`authenticated`; RPCs administrativas só `authenticated` com `is_admin()` dentro; relatórios SECURITY INVOKER **[A]** |
| Documentação de migrations | `docs/migrations.md` parava em `20261023150000` e dizia "não publicável"; guia de homologação listava 17 migrations | — | — | Desatualizados | Reescritos |

## 2. Defeitos encontrados e corrigidos

Todos em migration **incremental nova** (`20261027100000`...), sem editar migrations já publicadas.

1. **Aviso descartado em silêncio.** `20261026220000` tentava remover a unique antiga `(emissao_id, destinatario_id, canal)` pelo nome no plural; ela continuou ativa e o `ON CONFLICT DO NOTHING` descartava qualquer evento novo da mesma emissão, destinatário e canal (por exemplo, a postagem depois da etiqueta). A constraint é removida e o teste passou a verificar que não sobra nenhuma unique.
2. **Lógica de três valores no SQL.** `NOT (a AND b AND c)` com `NULL` deixava o aviso de postagem **valer** depois que a confirmação era desfeita. Agora usa `coalesce(…, false)`; há teste do desfazer/reconfirmar.
3. **Rodadas de aprovação duplicadas.** A ocorrência da rodada 1 era `md5(pedido:versão)` e a das rodadas seguintes era o id do evento; regravar a configuração de aprovadores criava uma segunda ocorrência por aprovador a partir da rodada 2. Agora é uma ocorrência por **pedido e versão** em todos os caminhos.
4. **Postagem e recebimento inferidos.** O trigger avisava postagem/recebimento a cada mudança de etapa, inclusive pelo rastreio automático dos Correios (entrega ≠ recebimento físico; movimentação ≠ postagem confirmada). Agora só as confirmações registradas avisam; avisos antigos ainda não enviados viram `evento_obsoleto`.
5. **Aprovador que não pode decidir recebia a tarefa** (o autor ou quem produziu a versão, sem autoaprovação).
6. **Atualização histórica descartada como "obsoleta"** quando o pedido já tinha avançado (o e-mail de "aprovado" não saía se a etiqueta já estava emitida). Só as **tarefas** perdem pertinência.
7. **Regravar a configuração de aprovadores** avisaria em lote todos os pedidos pendentes anteriores à fila. Agora só os posteriores à fila de comunicação.
8. **Regra de leitura duplicada** (cópia da política de acesso) → agora executa a própria `pode_ler_solicitacao` como o destinatário.
9. **Nomenclatura**: pedido (`#…`, `RV-…`, `Pedido …`), "recebimento" usado para a postagem, etapa "Recebido pelos Correios".
10. **Planilha**: texto digitado por usuários (cliente, endereço, anotações) começando com `=`, `+`, `-` ou `@` virava fórmula no XLSX da Lista.
11. **Relatório por motivo**: o valor antigo `Mercadoria errada` e o atual `Mercadoria Errada` apareceriam em linhas separadas; são contados juntos.
12. Template do Power Automate: evento inválido gerava 400 genérico (que o worker trata como indeterminado); campos estruturados do contrato escapados em HTML sem necessidade.

## 3. Estado dos eventos de comunicação

Detalhes do transporte das notificações em [`power-automate/CONTRATO_INTEGRACAO.md`](./power-automate/CONTRATO_INTEGRACAO.md); o SMTP dos convites, em [`envio-email-smtp.md`](./envio-email-smtp.md).

| Evento | Situação |
| --- | --- |
| A. Pedido registrado (e-mail ao solicitante; Teams aos aprovadores habilitados) | **[A]** testado no banco e no worker. **[B]** envio real |
| B. Nova rodada de aprovação (nova ocorrência; sem repetição por consulta, F5 ou edição cosmética) | **[A]** |
| C. Pedido aprovado (e-mail ao solicitante; Teams aos operadores da empresa; sino preservado) | **[A]**; **[B]** envio real |
| D. Pedido rejeitado (e-mail com a justificativa) | **[A]**; **[B]** |
| E. Etiqueta disponível (e-mail após PDF vinculado, sem depender de rastreamento; link autenticado; reemissão = nova ocorrência; metadados não repetem aviso) | **[A]**; **[B]** |
| F. Postagem e recebimento (somente as confirmações registradas) | **[A]**; **[B]** |

Regras transversais testadas: evento na mesma transação (falha injetada desfaz a mudança); destinatário só do banco (o corpo da requisição ao worker é ignorado); revalidação imediatamente antes do envio; tarefa de aprovação/emissão descartada se perdeu pertinência; deduplicação por ocorrência/destinatário/canal; nada retroativo ao aplicar as migrations; falha de um canal não bloqueia outro; `resultado_indeterminado` sem retry automático; 200/202 sem contrato válido não é sucesso; limite e backoff; reserva concorrente e recuperação após interrupção; segredos e e-mails fora do log.

## 4. Postagem, recebimento e encerramento

Documentados separadamente porque o sistema os mistura em `status`:

| Conceito | Onde é registrado | Como acontece | Gera aviso ao solicitante | Validado externamente |
| --- | --- | --- | --- | --- |
| Etiqueta emitida | `reversa_emissoes` (PDF vinculado, códigos, datas) | **Manual** (expedição) | Sim: `etiqueta_disponivel` (e-mail e Teams) | Não |
| Postagem confirmada | `reversa_emissoes.postagem_confirmada_em/fonte/por`; etapa "Postado nos Correios" | **Manual** (check-in). O schema prevê a fonte `rastreio`, mas nada a grava hoje | Sim: `postagem_confirmada` | Não |
| Movimentação de transporte | `rastreamento_correios`; a Edge Function também move a etapa (Postado → Em trânsito → Concluído) conforme o evento dos Correios. Uma etapa "Postado" atribuída pelo rastreio **não** preenche `postagem_confirmada_em` | **Automática** (Edge Function `correios-rastreio`, em lote por agendador externo; ver `src/sql/setup_cron_rastreio.sql`) | Não | **Não** (sem chamadas reais aos Correios; só fixtures) |
| Entrega informada pela transportadora | Evento BDE → `status = concluido`, `concluido_em` | **Automática** | Não (não é recebimento físico) | Não |
| Recebimento físico confirmado pela empresa | `reversa_recebimentos_confirmados` (quem e quando) | **Manual** (Kanban/check-in): com o pedido em trânsito (conclui) **ou já concluído pela entrega dos Correios** (só registra; migration `20261027130000`) | Sim: `recebimento_confirmado`, uma vez e só depois da confirmação | Não |
| Encerramento do ticket | `status = concluido` | Pelos **dois** caminhos acima | — | — |

**Entrega dos Correios antes do recebimento físico — resolvido sem mudar a regra de encerramento.** Antes, se a entrega dos Correios concluía o pedido primeiro, a confirmação manual deixava de ser possível (a RPC exigia "em trânsito") e o fato físico ficava sem registro. Agora um operador já habilitado na empresa pode registrar a confirmação física de um pedido **já concluído** pelos Correios, **uma única vez**: o pedido permanece `concluido` (nada é reaberto, nem `status` nem `concluido_em` mudam), nenhuma emissão é criada, autor e horário são do servidor, o histórico dos Correios é preservado e o aviso `recebimento_confirmado` sai só depois, sem duplicidade. Nada é registrado sem ação do operador (`service_role` é recusado).

A estrutura **distingue** a origem da conclusão com segurança suficiente: só há dois caminhos que concluem um pedido, e cada um deixa rastro. A entrega dos Correios (`service_role`) deixa o histórico `Sistema (Correios)` / `Rastreio: …`, que usuário nenhum fabrica (o gatilho do histórico sobrescreve o autor); a confirmação manual deixa linha em `reversa_recebimentos_confirmados` ou, nos registros anteriores, a entrada "Recebimento da mercadoria confirmado manualmente". Por isso **não** se liberou "todo pedido concluído": pedido concluído sem o rastro dos Correios (por exemplo, dado convertido) continua recusado (`55000`). Limite conhecido: o rastro é textual (`user_nome`/`acao`); uma coluna explícita de origem da conclusão seria mais robusta, mas exigiria alterar o gatilho de proteção de etapa e não foi feita.

Sequência reproduzida em teste com fixtures (sem chamar os Correios): emitido → postado → entregue pelos Correios → recebido fisicamente, em `supabase/tests/recebimento-fisico.test.mjs` (13 testes: permissão por empresa, concorrência, uma confirmação por pedido, ausência de aviso duplicado ou antecipado, pedido intacto, falha do aviso desfazendo a confirmação, relatórios) e `src/test/KanbanRecebimentoFisico.test.tsx`. **Qual evento encerra o ticket no processo definitivo continua sendo decisão de negócio pendente [C]**: esta mudança só evita perder o registro do fato físico.

## 5. Reconciliação, relatórios e agendamento

- **Reconciliação** (`/admin/comunicacoes`, `reconciliar_comunicacao_reversa`): consulta pedido, evento, destinatário, canal, situação, tentativas, datas, correlação e erro sanitizado; só `resultado_indeterminado` pode ser reconciliado (confirmar conclusão do conector ou autorizar nova tentativa); exige justificativa e referência; registra administrador, data do servidor e valores antes/depois; histórico de tentativas preservado; concluída não reenvia; ações simultâneas serializadas; sem "reenviar tudo"; a nova tentativa é revalidada antes do envio. Autorização no banco (`is_admin()`); gestores/solicitantes recebem `42501`. **[A]**
- **Relatórios** (`/admin/relatorios`): empresa; período com a data filtrada **explícita** (solicitação, decisão, emissão ou postagem confirmada); solicitações; por motivo; situação de aprovação; situação logística (só pedidos liberados); emissões, primeiras emissões e reemissões; pedidos com postagem confirmada; **etiqueta vencida sem postagem confirmada** (nunca "não utilizada"); recebimento confirmado manualmente; exportação XLSX do recorte exibido, só com colunas de gestão, células neutralizadas, datas legíveis. Escopo = RLS de quem consulta. **Sem custo, tarifa, economia ou taxa de utilização:** o modelo da reversa não tem esses dados nem um denominador confiável; a tela explica isso. (O módulo de NC tem custos próprios, `custo_total` e `custo_liquido`; são custos da não conformidade, não da reversa, e **não** foram somados nem atribuídos a reversas.) **[A]**
- **Agendamento**: `pg_cron` + `pg_net` + Vault, a cada 5 minutos, scripts de habilitar/desabilitar. Controles separados: `ETIQUETA_TRANSPORTE` liga e desliga as notificações dos pedidos (e-mail e Teams, pelo Power Automate); `CONVITE_TRANSPORTE` liga e desliga somente os convites e a definição de senha. `NOTIFICACAO_EMAIL_TRANSPORTE` não é lida por nenhuma função. Esses controles não alteram o agendamento ([`agendamento-worker-comunicacao.md`](./agendamento-worker-comunicacao.md)). **[B]**

## 5.1. Validação executada

| Camada | Comando | Resultado |
| --- | --- | --- |
| Banco (PostgreSQL 17 embarcado, RLS por papel) | `cd supabase/tests && npm test` | **172 aprovados, 0 reprovados** (suíte completa, depois da migration `20261027130000`; eram 159 + 13 de `recebimento-fisico.test.mjs`). Os 2 testes do runtime Deno não foram repetidos: o worker não foi alterado nesta rodada (na entrega anterior: 161/0 com Deno) |
| Runtime Deno 2.9.6 (Edge Function real, PostgREST/fluxo simulados) | `DENO_BIN=… node --test runtime-deno.test.mjs` e `deno check index.ts` | **2 aprovados**; `deno check` sem erros |
| Worker em Node contra o banco real | `worker-integracao.test.mjs` (incluído nos 159) | 10 aprovados, incluindo dois workers simultâneos e recuperação após interrupção |
| Front-end | `npx vitest run` | **394 aprovados, 0 reprovados**, 45 arquivos (antes: 302/33). As 33 falhas foram resolvidas (seção 6) e acrescentaram-se testes de formulário, analytics, autenticação, login (destino interno), Kanban/recebimento físico, demo e contrato do fluxo |
| Tipos | `npx tsc -b` | sem erros |
| Build | `npm run build` | passou |
| Lint | `npm run lint` | 6 avisos `no-useless-escape` **preexistentes** em `src/lib/etiquetaPdf.ts` (arquivo não tocado); nenhum aviso novo |
| Navegador | Edge headless (script fora do repositório) contra o `vite` local em modo demonstração | Ver seção 11. **Valida a tela com o adaptador demo, não o backend real** |

Limites do que foi validado: o Supabase local (CLI/Docker) não existe nesta máquina; o Deno foi instalado apenas num diretório temporário (fora do repositório) para rodar a função real contra servidores simulados. **Não** foram validados: PostgREST/Auth/Storage do projeto real, o Supabase Edge Runtime, `pg_cron`/`pg_net`/Vault, OAuth do Entra, Power Automate, Outlook, Teams, Correios e leitor de tela (o navegador foi usado só com o adaptador de demonstração).

## 6. As 33 falhas de testes do front-end: causas e resolução

A entrega anterior atribuiu as 33 falhas ao "front-end em andamento". Isso foi tratado como **hipótese** e verificado teste a teste. Resultado: **nenhuma** era regressão da entrega de comunicação. Das 33: **28** eram testes desatualizados (formSchema 26 + authService 2); **1** era um teste que dependia do dia em que rodava (Dashboard); **1** era um defeito real da aplicação (mensagem do motivo no formulário); e **3** (analytics) eram expectativas antigas cuja investigação revelou um **segundo defeito real** (motivos antigos sumindo do gráfico). Ou seja, 2 defeitos reais de aplicação, corrigidos. Hoje a suíte está em **394 aprovados, 0 reprovados**.

| Grupo | Cenário | Erro | Esperado (e evidência da regra) | Causa | Correção |
| --- | --- | --- | --- | --- | --- |
| `formSchema.test.ts` (26 de 27) | Qualquer envio válido do formulário | `success=false` | O número do endereço é campo próprio e obrigatório (`numero_endereco`, `ReverseLogisticsForm.tsx`); o autorizador manual não existe mais: a decisão é de um aprovador cadastrado e a autoria vem do usuário autenticado no servidor (`new.solicitado_por := auth.uid()`, migration `20261023100000`) | **Teste desatualizado**: a base de dados do teste não tinha `numero_endereco` e ainda usava `autorizacao` | Base do teste atualizada; os testes de "autorizador válido/inválido" viraram "o schema não exige nem repassa `autorizacao`"; incluídos testes de `numero_endereco`, motivos antigo/atual, Clientes trocados (endereço, número e CEP da outra cliente), setor Expedição, NC opcional (já existia). Nenhuma validação removida |
| `formSchema.test.ts` (1 de 27) | Motivo inválido ou não escolhido | Mensagem "Invalid input" em vez de "Selecione um motivo válido." | A mensagem em português que o formulário mostra no campo | **Defeito real**: o `z.union` de dois `z.enum` (motivos atuais e antigos) perde a mensagem personalizada | **Aplicação corrigida** (`formSchema.ts`): um único enum com os motivos atuais + os dois antigos que o banco ainda aceita; o teste existente passou a provar a correção |
| `analytics.test.ts` (3) | Gráfico de motivos e motivo mais frequente | Esperava 5 motivos e `Mercadoria errada` | O banco aceita `Mercadoria errada` (antigo) e `Mercadoria Errada` (atual) como o mesmo motivo — os relatórios novos já os somam (`reversa_motivo_normalizado`) | **Defeito real** + teste desatualizado: a lista passou a 13 motivos, mas pedidos antigos com `Mercadoria errada` ou `Endereço incorreto` **sumiam** do gráfico (comparação exata) e dividiam a contagem do "motivo mais frequente" | **Aplicação corrigida** (`analytics.ts`): equivalência só de `Mercadoria errada`; qualquer outro valor presente nos dados (ex.: `Endereço incorreto` antigo) aparece como linha própria, sem ser descartado nem fundido por suposição. Testes atualizados para o comportamento real e novos testes de motivos antigos |
| `authService.test.ts` (2) | Login e sessão | A sessão traz `perfilAcesso` e `empresasAcesso` | Perfil e empresas vêm do `app_metadata` (só o `service_role` grava), nunca do `user_metadata` editável | **Teste desatualizado** | Expectativas atualizadas; novos testes provam que perfil/empresas em `user_metadata` e perfil desconhecido **não** concedem nada |
| `DashboardPage.test.tsx` (1) | "Aguardando há 1 dia" | Texto não encontrado | O pedido do teste é de 20/10/2026; "1 dia" só era verdade em 21/10 | **Teste dependente da data**: a tela está correta (hoje seriam 6 dias) | Relógio fixado no teste (só `Date`, um dia depois do pedido); nenhum indicador removido |

Observações que **não** foram alteradas (sem decisão de negócio):

- O tempo médio de preenchimento do dashboard inclui registros com `tempo_preenchimento_segundos = 0`, que é o valor padrão da coluna (`NOT NULL DEFAULT 0`) e não distingue "não medido" de "medido em 0 s". O teste existente de KPIs fixa esse comportamento; mudar exige decidir se 0 é ausência.
- O schema do formulário continua aceitando os motivos antigos `Mercadoria errada` e `Endereço incorreto` em **novos** envios porque o banco os permite; restringir só a pedidos já registrados é decisão de negócio.

## 7. Configurações externas necessárias (nada foi feito)

1. Aplicar as migrations em **homologação** pelo procedimento de [`homologacao-logistica-reversa.md`](./homologacao-logistica-reversa.md) (conferir o estado antes; não reaplicar o pacote sobre banco já atualizado) e publicar a Edge Function `comunicacao-etiqueta`.
2. Entra ID: registro do aplicativo do worker, principal permitido (tenant, client ID, object ID), OAuth no gatilho do fluxo, **sem** "Anyone".
3. Power Automate: cópia do fluxo (preservar o original de feedback), `AppBaseUrl` ajustado, conexões Outlook e Teams (bot do Flow), proteção de entradas/saídas do histórico.
4. Segredos da Edge Function (`SUPABASE_*`, `POWER_AUTOMATE_*`, `APP_BASE_URL`, `ETIQUETA_TRANSPORTE`) e do Vault (`comunicacao_cron_url`, `comunicacao_cron_service_key`).
5. `pg_cron`/`pg_net` habilitados; executar o script de habilitar só depois da homologação.
6. Cadastro: e-mail corporativo válido nas contas; aprovadores por empresa/setor (inclusive Expedição, se houver aprovador específico); operadores com `emitir-etiqueta`.
7. Agendamento do rastreio dos Correios (`correios-rastreio-30min`), se ainda não existir no projeto.

## 8. Regras de negócio que ainda precisam de definição

1. **Qual evento encerra o ticket**: entrega informada pelos Correios, recebimento confirmado pela empresa, ou outro? A regra atual (qualquer um dos dois leva a `concluido`) foi preservada. Com a mudança desta rodada, a confirmação física **não se perde** quando os Correios entregam primeiro, mas continua em aberto qual evento fecha o ticket e se um pedido concluído pelos Correios sem confirmação física deve ser tratado como pendência, alerta ou nada.
2. **Composição da "equipe" do gestor** (para "gestor vê os pedidos da equipe"): lista por gestor, setor de origem ou outra. Hoje só há escopo por empresa.
3. **Teams ao solicitante** na etiqueta disponível (herdado da primeira entrega; o requisito pede só e-mail): manter ou remover?
4. **Autoaprovação** (`permitir_autoaprovacao`, padrão desligado, marcado "a validar" no banco).
5. **Aprovadores de pedidos de Expedição** (e dos demais setores): quem, por empresa.
6. **Postagem confirmada pelo rastreio** (`postagem_fonte = 'rastreio'` existe no schema; nada a grava): deve haver confirmação automática?
7. **Solicitante sem e-mail válido**: hoje a comunicação espera (`aguardando_email`) e não há alternativa; definir se há fallback.
8. **Custo e taxa de utilização**: só serão possíveis com dados de frete/tarifa e um denominador confiável (ex.: etiquetas emitidas × postagens confirmadas com lançamento garantido).
9. **Retenção** da fila e do histórico de comunicação (hoje preservados indefinidamente).
10. **Tempo de preenchimento igual a 0** no dashboard: o valor padrão da coluna não distingue "não medido" de "0 s"; definir se 0 deve ficar fora da média.
11. **Motivos antigos** (`Mercadoria errada`, `Endereço incorreto`) em **novos** envios: o banco ainda os permite e o formulário os aceita; definir se devem valer só para pedidos já registrados.
12. **Concluído pelos Correios sem confirmação física**: deve virar pendência/alerta, aparecer em relatório ou nada? Hoje o relatório já conta a confirmação física feita; o botão aparece no Kanban para quem pode confirmar.
10. **E-mail aos aprovadores**: hoje recebem Teams; e-mail fica fora desta entrega.

## 9. Matriz final

| Requisito | Implementado | Validado localmente | Pendência externa |
| --- | --- | --- | --- |
| Abertura de pedido com autoria pelo usuário autenticado | Sim | Sim (banco) | Conferir contas/e-mails reais |
| Meus Pedidos (rejeitados e concluídos) | Sim | Sim (Vitest + RLS) | — |
| Acesso ampliado de gestores (por empresa) | Sim (preservado) | Sim (RLS) | **Equipe do gestor: definição** |
| Aprovação por empresa/setor, uma decisão, justificativa, autoaprovação | Sim | Sim (banco, concorrência) | Cadastro de aprovadores por setor; decisão sobre autoaprovação |
| Emissão manual, reemissão, recuperação, validade, PDF vinculado | Sim | Sim | — |
| Postagem (check-in) e recebimento manual com registro de quem confirmou, inclusive depois da entrega dos Correios | Sim | Sim (banco + Vitest + demo no navegador) | Validar com Correios reais; **definir qual evento encerra o ticket** |
| Aviso: pedido registrado / nova rodada / aprovado / rejeitado / etiqueta / postagem / recebimento | Sim (fila + contrato + worker) | Sim (banco, worker Node, Deno) | Power Automate, Outlook, Teams, OAuth, deploy |
| Worker, modo simulado, resultado indeterminado, concorrência, recuperação | Sim | Sim (banco + Node + Deno) | Edge Runtime real |
| Template Power Automate e guia | Sim | Estático (testes do JSON) | Importar e testar no tenant |
| Agendamento do worker (cadência 5 min, habilitar/desabilitar) | Preparado (não instalado) | Parcial (guardas e ausência de segredos) | `pg_cron`/`pg_net`/Vault; homologação |
| Reconciliação administrativa de indeterminados | Sim | Sim (banco + Vitest) | — |
| Relatórios por empresa/período e exportação segura | Sim (contagens) | Sim (banco + Vitest) | Custo/taxa: sem dados; conferência visual |
| Permissões no backend e privilégios das funções novas | Sim | Sim | — |
| Migrations incrementais e pacote SQL Editor | Sim | Cadeia limpa, atualização de base com fila anterior e pacote executado | Aplicar em homologação com conferência do estado |
| Conferência visual no navegador | Feita em modo demonstração (Edge, desktop e celular, 11 cenários) | Parcial: só a tela com adaptador local | Repetir contra o backend de homologação; leitor de tela |
| 33 falhas de testes do front-end | Resolvidas (2 defeitos reais corrigidos) | Sim (394/0) | — |
| Contrato banco → worker → fluxo (8 eventos × 2 canais; PDF sem rastreamento) | Sim | Sim (`contratoFluxoPowerAutomate.test.ts`) | Importar e testar no tenant; **não** usar o ZIP antigo de etiqueta |

Não há "100% pronto": falta configuração externa, homologação com serviços reais e decisões de negócio listadas acima.

## 10. Alterações desta entrega (para separar do trabalho em andamento)

Nenhum commit foi feito. Arquivos **criados** nesta entrega: migrations `20261027100000`, `20261027110000`, `20261027120000`; `supabase/functions/comunicacao-etiqueta/worker.ts`; `supabase/agendamento/*`; `supabase/tests/{comunicacao-ciclo,worker-integracao,agendamento,runtime-deno}.test.mjs` e `lib/deno-preload.ts`; `src/lib/{pedido,planilhaSegura}.ts`; `src/pages/{ComunicacoesPage,RelatoriosPage}.tsx`; `src/demo/demoComunicacoesRelatorio.ts`; `src/test/{ComunicacoesPage,RelatoriosPage,ListPageExportacao,planilhaSegura,powerAutomateTemplate,rotasAcesso}.test.*`; `docs/{conclusao-funcional-reverso,agendamento-worker-comunicacao}.md`. Arquivos **alterados** (já tinham mudanças ou eram novos do front-end em desenvolvimento; as edições foram pontuais): `src/types/index.ts`, `src/services/apiService.ts`, `src/lib/perfil.ts`, `src/App.tsx`, `src/components/admin/{FlowNav,RecordDetailModal,NotificacoesEmissaoBell}.tsx`, `src/components/forms/ReverseLogisticsForm.tsx`, `src/pages/{ApprovalQueuePage,FilaOperacionalPage,DashboardPage,ListPage,MeusPedidosPage}.tsx`, `src/demo/{demoApi,demoDatabase}.ts`, `supabase/functions/comunicacao-etiqueta/{index,logic}.ts`, `supabase/SQL_EDITOR_SETUP_NC_REVERSA.sql` (gerado), testes (`perfil`, `ApprovalQueuePage`, `comunicacaoEtiquetaLogic`, `banco`, `comunicacao-etiqueta`), `docs/{migrations,permissoes,homologacao-logistica-reversa}.md`, `docs/power-automate/*`, `supabase/tests/README.md`. Arquivos novos usam fim de linha LF; os já versionados mantiveram o fim de linha original (CRLF).

**Rodada de estabilização** — criados: migration `20261027130000_recebimento_fisico_apos_entrega.sql`; `supabase/tests/recebimento-fisico.test.mjs`; `src/test/{LoginPageRetorno,KanbanRecebimentoFisico,demoRecebimentoFisico,contratoFluxoPowerAutomate}.test.*`. Alterados (edições pontuais): `src/schemas/formSchema.ts` (enum único de motivos), `src/services/analytics.ts` (motivos antigos), `src/services/apiService.ts` (`listarRecebimentosFisicosPendentes`), `src/pages/KanbanPage.tsx` (confirmação física nos concluídos pelos Correios), `src/demo/{demoApi,demoDatabase}.ts`, testes (`formSchema`, `analytics`, `authService`, `DashboardPage`, `banco.test.mjs`), `supabase/SQL_EDITOR_SETUP_NC_REVERSA.sql` (regenerado: 25 migrations após o dump), `docs/{migrations,permissoes,homologacao-logistica-reversa,conclusao-funcional-reverso}.md`, `docs/power-automate/comunicacao-etiqueta-reversa.md`, `supabase/tests/README.md`, `README.md` (contagem). A Edge Function e o template do fluxo **não** foram alterados nesta rodada.

Referência morta preexistente: `docs/permissoes.md` cita `docs/aprovacao-reversas.md`, que não existe no repositório.

## 11. Rodada de estabilização — resumo

**Pronto localmente** (implementado e testado na máquina, sem serviços reais):

- As 33 falhas de testes resolvidas; 2 defeitos reais de aplicação corrigidos (mensagem do motivo no formulário; motivos antigos sumindo do gráfico) — seção 6.
- Autenticação e navegação: nenhuma permissão ampliada; permissões e perfil vêm só do `app_metadata`; o retorno do login aceita apenas rota interna `/admin/...` e preserva `?solicitacaoId=`; testado o acesso direto às rotas (não só o menu) e o modo demo separado do real. Nenhum SSO Microsoft foi introduzido: o e-mail corporativo **não** significa que SSO exista.
- Recebimento físico depois da entrega dos Correios (seção 4), com testes de banco, tela e demo.
- Contrato banco → worker → fluxo conferido por teste (8 eventos × 2 canais, PDF sem rastreamento, rótulos e links, `invalid_*`, sucesso do conector ≠ entrega, indeterminado sem reenvio). Teams ao solicitante na etiqueta **preservado**, decisão ainda pendente.
- Conferência visual em modo demonstração (abaixo).

**Preparado para configurar** (código e roteiro existem; falta o ambiente): aplicar as migrations pendentes até `20261027130000`; publicar a Edge Function e o front-end na ordem de [`homologacao-logistica-reversa.md`](./homologacao-logistica-reversa.md) ("Ordem de homologação respeitando as dependências"); importar o template do fluxo (nunca o ZIP antigo); agendamento do worker (não instalado).

**Não validado externamente**: Supabase remoto (RLS/RPCs/Edge Runtime reais), `pg_cron`/`pg_net`/Vault, OAuth do Entra, Power Automate, Outlook, Teams, Correios reais (só fixtures), leitor de tela, contraste medido, outros navegadores e dispositivos. A conferência visual usou o adaptador de demonstração e **não prova** comportamento do backend.

**Aguardando decisão do negócio**: qual evento encerra o ticket (e o que fazer com concluído pelos Correios sem confirmação física); equipe do gestor; Teams ao solicitante na etiqueta; autoaprovação; aprovadores de Expedição; postagem confirmada pelo rastreio; solicitante sem e-mail; custo e taxa de utilização; retenção; tratamento de `tempo_preenchimento_segundos = 0`; se os motivos antigos devem continuar aceitos em novos envios.

### Conferência visual (resumo; detalhes em [`homologacao-logistica-reversa.md`](./homologacao-logistica-reversa.md))

Ambiente: Edge headless, desktop 1366×820 e celular 390×844, `vite` local em modo demonstração com o Supabase apontado para uma porta sem serviço (nenhuma requisição externa), dados fictícios. Os 11 cenários pedidos foram percorridos (criar sem NC, aprovar, rejeitar e ver a justificativa, PDF sem rastreamento, recuperar emissão parcial, etiqueta em Meus Pedidos, abrir pedido por link depois do login, registrar postagem, confirmar recebimento depois da entrega dos Correios, reconciliar indeterminado, filtrar relatório e exportar o mesmo recorte). Sem rolagem horizontal, sem conteúdo cortado nos testados, ações acessíveis, foco e Escape no diálogo, botões bloqueados quando exigem dado, mensagens de erro úteis e dados preservados após falha de validação. Limites: adaptador local, não o backend; leitor de tela e contraste não verificados; observações exclusivas do demo estão no roteiro.

