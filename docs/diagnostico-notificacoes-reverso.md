# Diagnóstico das notificações do Reverso

Etapa 1 da sequência de melhorias. Análise somente de leitura do código e da documentação do repositório. Nenhum comportamento foi alterado nesta etapa.

- **Data:** 09/11/2026
- **Branch:** `fluxo-reverso-main`. Nenhum commit, push ou alteração de código funcional.
- **Evidências:** `arquivo:linha` do working tree atual. Nas migrations, cada função é citada pela **versão efetiva**, ou seja, a última migration que a define (ver Anexo A).

## 1. Resumo

1. **O sino cobre um único aviso.** Ele mostra pedidos aprovados aos usuários com `emitir-etiqueta` na empresa. Não avisa sobre criação, aprovação pendente, rejeição, etiqueta, postagem ou recebimento. *Confirmado no código.*
2. **Os avisos de criação não são internos.** O autor recebe e-mail (`pedido_criado`). Os aprovadores habilitados recebem tarefa no Teams (`aprovacao_pendente`). Ambos passam pela fila `reversa_comunicacoes_etiqueta` e saem pelo worker `comunicacao-etiqueta` com Power Automate. *Confirmado no código.*
3. **Sem o transporte configurado, nada sai.** Com `ETIQUETA_TRANSPORTE` diferente de `power_automate`, ou com qualquer variável do fluxo ausente, o worker só conta pendências e não altera a fila. Quem criou o pedido não recebe nenhum erro. *Confirmado no código.*
4. **Sem aprovador configurado, o pedido fica sem aviso.** Não há tarefa, alerta ou registro. Só a tela de configuração informa que "nenhum encaminhamento automático será feito". *Confirmado no código.*
5. **O ambiente publicado não foi verificado.** A documentação de 28/10/2026 registra função publicada antiga (e-mail por SMTP, sem Teams), transporte simulado, URL do fluxo não cadastrada e nenhum agendamento. Esta análise não acessou o ambiente. Essa é a principal hipótese a confirmar. *Declarado na documentação; não verificado.*
6. **Documentação com a chave errada.** Três documentos tratam `NOTIFICACAO_EMAIL_TRANSPORTE` como trava do envio, e dois deles indicam usá-la para pausar. O código não lê essa chave. Quem seguir esses textos pode não interromper o envio. *Confirmado.*
7. **Testes.** Os 7 arquivos Vitest pertinentes passaram (74 testes). Os testes de banco **não rodaram** nesta sessão: o processo está com token elevado e o PostgreSQL embarcado recusa iniciar. O comportamento de banco foi conferido pela leitura das migrations.

## 2. Escopo, método e limites

- **Lidos:** `NotificacoesEmissaoBell.tsx`; `apiService.ts` (criação, leitura de notificações e fila de aprovação); `ReverseLogisticsForm.tsx` (envio); `supabase/functions/comunicacao-etiqueta/` (`index.ts`, `worker.ts`, `logic.ts`); migrations de comunicação, aprovação, permissões e convites; `supabase/agendamento/`; `docs/agendamento-worker-comunicacao.md`; `docs/power-automate/` (contrato e template); testes pertinentes.
- **Não feito:** sem acesso ao Supabase nem ao Power Automate; `.env` e segredos não foram lidos; nenhuma consulta remota; nenhuma mensagem, ticket ou chamada externa; nenhum agendamento habilitado.
- **Repositório:** não existem `AGENTS.md` nem `CLAUDE.md` na raiz. Não há alterações em arquivos rastreados. Os não rastreados já existiam antes desta etapa (`.github/`, `.serena/`, `playwright.config.ts`, `teste.txt`, `tests/`) e não foram tocados.

## 3. Fluxo: criação até o resultado

1. **Criação.** O formulário chama `createSolicitacao` ([ReverseLogisticsForm.tsx:316-337](../src/components/forms/ReverseLogisticsForm.tsx#L316-L337); [apiService.ts:394-403](../src/services/apiService.ts#L394-L403)). O formulário envia `status: 'aguardando_aprovacao'`, mas o banco o sobrescreve (passo 2).
2. **Autoria e estado inicial.** Antes do insert, `reversa_aprovacao_ao_criar` grava `solicitado_por = auth.uid()`, `aprovacao_status = 'aguardando_aprovacao'`, `aprovacao_versao = 1` e `status = 'pendente'` ([20261023100000_aprovacao_reversas.sql:277-290](../supabase/migrations/20261023100000_aprovacao_reversas.sql#L277-L290)). Sem sessão, o autor fica vazio e o aviso vira `aguardando_identidade`.
3. **Gatilho de criação (AFTER INSERT).** `reversa_comunicacao_apos_criar_pedido` enfileira `pedido_criado` ao autor, por e-mail, e chama `reversa_enfileirar_aprovadores` ([20261027100000_comunicacao_ciclo_pedido.sql:153-170](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L153-L170)).
4. **Elegibilidade dos aprovadores.** Entram as linhas de `reversa_aprovadores_setor` da empresa com `todos_setores` ou com o setor do pedido ([20261027100000:86-115](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L86-L115)). Para cada uma, `reversa_aprovador_pode_decidir` confere a capacidade `aprovar-reversa`, a empresa em `empresas_acesso` e que a pessoa não é o autor nem quem produziu a versão, salvo autoaprovação ([20261027100000:59-84](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L59-L84)).
5. **Fila.** `reversa_enfileirar_comunicacao` grava uma linha por evento, ocorrência, destinatário e canal, com `ON CONFLICT DO NOTHING` ([20261026220000_comunicacao_eventos_logistica.sql:71-107](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L71-L107)). A linha nasce `pendente`, ou `aguardando_email` (e-mail inválido), ou `aguardando_identidade` (sem destinatário).
6. **Disparo.** O job `comunicacao-reversa-5min` chamaria a função a cada 5 minutos ([habilitar-worker-comunicacao.sql:43-57](../supabase/agendamento/habilitar-worker-comunicacao.sql#L43-L57)). O agendamento não é migration e, pela documentação de 28/10, não estava instalado (§7).
7. **Processamento.** `index.ts` lê as variáveis de ambiente ([index.ts:8-11](../supabase/functions/comunicacao-etiqueta/index.ts#L8-L11)) e cria o worker ([index.ts:16-25](../supabase/functions/comunicacao-etiqueta/index.ts#L16-L25)). Cada execução processa até `LOTE_MAXIMO = 4` itens ([worker.ts:16](../supabase/functions/comunicacao-etiqueta/worker.ts#L16), [worker.ts:115](../supabase/functions/comunicacao-etiqueta/worker.ts#L115)). Cada item é reservado por `reversa_claim_comunicacao_etiqueta` ([20261026210000_comunicacao_resultado_indeterminado.sql:35-101](../supabase/migrations/20261026210000_comunicacao_resultado_indeterminado.sql#L35-L101)) e revalidado por `reversa_iniciar_comunicacao_etiqueta` antes de qualquer chamada externa ([20261027100000:354-492](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L354-L492)).
8. **Canal.** `montarContratoComunicacao` monta o contrato e o HTML ([logic.ts:249-290](../supabase/functions/comunicacao-etiqueta/logic.ts#L249-L290)). O worker obtém token OAuth e chama o fluxo com timeout de 25 s ([worker.ts:150-182](../supabase/functions/comunicacao-etiqueta/worker.ts#L150-L182)). No fluxo, um `Switch` em `canal` escolhe `SendEmailV2` ou `PostMessageToConversation` ([fluxo-etiqueta-reversa-template.json:264-266](../docs/power-automate/fluxo-etiqueta-reversa-template.json#L264-L266); [:340](../docs/power-automate/fluxo-etiqueta-reversa-template.json#L340)).
9. **Link.** `montarDestino` usa `/admin/aprovacoes?solicitacaoId=` para `aprovacao_pendente`, `/admin/etiquetas?pedido=` para `emissao_pendente` e `/admin/meus-pedidos?solicitacaoId=` para os demais ([logic.ts:164-179](../supabase/functions/comunicacao-etiqueta/logic.ts#L164-L179)). Cada tela lê o parâmetro correspondente ([ApprovalQueuePage.tsx:208](../src/pages/ApprovalQueuePage.tsx#L208), [FilaOperacionalPage.tsx:109](../src/pages/FilaOperacionalPage.tsx#L109), [MeusPedidosPage.tsx:259](../src/pages/MeusPedidosPage.tsx#L259)). Não encontrei divergência entre links e telas.
10. **Resultado.** `classificarRespostaFluxo` ([logic.ts:298-326](../supabase/functions/comunicacao-etiqueta/logic.ts#L298-L326)) grava o resultado por `reversa_finalizar_comunicacao_etiqueta_v2` ([20261026220000:534-583](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L534-L583)). Só `connector_action_succeeded` com `communication_id` e `canal` correspondentes vira sucesso. Mesmo assim, não prova entrega nem leitura (contrato §6).

## 4. Matriz: evento, destinatário e canal

| Evento | Quando nasce (gatilho efetivo) | Destinatário | Elegibilidade no envio | Canal | Tipo | Depende de worker e Power Automate |
| --- | --- | --- | --- | --- | --- | --- |
| `pedido_criado` | INSERT em `solicitacoes_reverso` ([20261027100000:153-170](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L153-L170)) | autor (`solicitado_por`) | autor identificado e e-mail válido | e-mail | atualização | sim |
| `aprovacao_pendente` | mesmo INSERT, se `aguardando_aprovacao` ([:163-166](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L163-L166)); evento `alterada` ou `invalidada` ([:186-190](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L186-L190)); regravação de configuração de aprovador ([:121-148](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L121-L148)) | aprovadores que podem decidir a versão | empresa e setor cobertos; `aprovar-reversa`; empresa; pode ler o pedido; pode decidir no momento do envio | Teams | tarefa | sim |
| `pedido_aprovado` | `solicitacoes_aprovacoes` com `aprovada` ([:191-196](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L191-L196)) | autor | autor e e-mail válido | e-mail | atualização | sim |
| `emissao_pendente` | `aprovada` → `reversa_enfileirar_operadores` ([20261026220000:178-207](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L178-L207); chamada em [20261027100000:196](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L196)) | todos com `emitir-etiqueta` na empresa, sem filtro de setor | telas e empresa no momento do envio | Teams | tarefa | sim |
| aviso do sino | `aprovada` → `reversa_notificacoes_emissao` ([20261023200000:26-54](../supabase/migrations/20261023200000_notificacoes_aprovacao_expedicao.sql#L26-L54)) | os mesmos emissores, no momento da aprovação | permissão conferida de novo na leitura ([20261030120000:358-389](../supabase/migrations/20261030120000_lixeira_chamados.sql#L358-L389)) | in-app | aviso | não |
| `pedido_rejeitado` | `rejeitada` ([20261027100000:197-202](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L197-L202)) | autor, com justificativa | autor e e-mail válido | e-mail | atualização | sim |
| `etiqueta_disponivel` | `pdf_path` preenchido em `reversa_emissoes` ([20261026220000:272-300](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L272-L300)) | autor, **em duas linhas** | PDF ainda vinculado e emissão não substituída | e-mail **e** Teams | atualização | sim |
| `postagem_confirmada` | `postagem_confirmada_em` com fonte `manual` ou `rastreio` ([20261027100000:215-244](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L215-L244)) | autor | autor e e-mail válido | e-mail | atualização | sim |
| `recebimento_confirmado` | INSERT em `reversa_recebimentos_confirmados` ([20261027100000:247-271](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L247-L271)) | autor | autor e e-mail válido | e-mail | atualização | sim |

Não geram aviso (contrato §5): criação sem aprovador; qualquer aviso in-app ao autor; qualquer aviso in-app a aprovadores; rejeição no sino; alteração de dados; emissão sem PDF; movimentação dos Correios; rastreamento automático sem confirmação; recarregar a página.

## 5. Elegibilidade: quem é avisado e quem pode agir

| Papel | Quem entra | Fonte | Observação |
| --- | --- | --- | --- |
| Autor | `solicitado_por`, gravado no BEFORE INSERT com `auth.uid()` ([20261023100000:277](../supabase/migrations/20261023100000_aprovacao_reversas.sql#L277)) | `solicitacoes_reverso` | Criação sem sessão (importação, serviço) não tem destinatário e não envia. |
| Aprovador, tarefa | `reversa_aprovadores_setor` (empresa e todos/setor) ∩ `auth.users.raw_app_meta_data` (`aprovar-reversa` e empresa), menos autor e produtor da versão | banco | A configuração é gravada por `salvar_config_aprovadores_reversa` ([20261023190000:116-217](../supabase/migrations/20261023190000_aprovadores_empresa_setor.sql#L116-L217)), que não exige aprovador em cada setor. |
| Aprovador, decisão no app | `usuario_pode_aprovar_reversa` ([20261023190000:55-69](../supabase/migrations/20261023190000_aprovadores_empresa_setor.sql#L55-L69)), com `empresas_aprovaveis()` ([20261023120000:42-48](../supabase/migrations/20261023120000_permissoes_capacidades.sql#L42-L48)) | `current_telas()` e `current_empresas_acesso()` | Mesmas capacidades. `current_telas()` devolve vazio para convite sem senha ([20261028130000:8-30](../supabase/migrations/20261028130000_bloquear_operacao_sem_senha_convite.sql#L8-L30)). |
| Emissor, tarefa e sino | `auth.users` com `emitir-etiqueta` e empresa | banco | Sem filtro de setor. |
| Leitura na revalidação | `reversa_usuario_pode_ler_para_comunicacao` → `pode_ler_solicitacao` ([20261027100000:327-351](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L327-L351); [20261030120000:14-34](../supabase/migrations/20261030120000_lixeira_chamados.sql#L14-L34)) | `current_telas()` e `empresas_consulta_ampliada()` ([20261028100000:62-88](../supabase/migrations/20261028100000_acesso_por_tela_cadastro.sql#L62-L88)) | Aprovador ativo lê os pedidos da própria empresa. Convite sem senha não lê e cai no estado terminal (§9). |

Ponto de atenção: a tarefa é gravada a partir de `auth.users`, enquanto decisão e leitura usam `current_telas()`. Para contas com senha definida, as duas fontes coincidem. Para convite sem senha, a tarefa é gravada, mas termina em `aprovacao_indisponivel` ou `acesso_revogado` no envio.

## 6. O sino (`NotificacoesEmissaoBell`): o que cobre

| Situação | Sino avisa? | Evidência |
| --- | --- | --- |
| Pedido criado | Não | não há gatilho de criação para o sino |
| Aguardando aprovação | Não, nem para aprovadores (eles não têm sino) | só `aprovacao_pendente` via Teams |
| Aprovado | Sim, para emissores da empresa, no momento da aprovação | [20261023200000:26-54](../supabase/migrations/20261023200000_notificacoes_aprovacao_expedicao.sql#L26-L54) |
| Rejeitado, alterado ou invalidado | Não | só o gatilho de `aprovada` cria o aviso |
| Etiqueta disponível, postagem, recebimento | Não | — |
| Depende de Power Automate | Não. O sino lê o banco e a própria tela | [NotificacoesEmissaoBell.tsx:38](../src/components/admin/NotificacoesEmissaoBell.tsx#L38), [apiService.ts:640-647](../src/services/apiService.ts#L640-L647) |
| Atualização | A cada 60 s e ao voltar o foco | [NotificacoesEmissaoBell.tsx:66-72](../src/components/admin/NotificacoesEmissaoBell.tsx#L66-L72) |
| Limite | 50 itens; o contador de não lidas considera todos | [20261023200000:70-87](../supabase/migrations/20261023200000_notificacoes_aprovacao_expedicao.sql#L70-L87) |
| Quem perdeu a permissão | Deixa de ver o aviso, mesmo sem tê-lo lido | [20261023200000:73-81](../supabase/migrations/20261023200000_notificacoes_aprovacao_expedicao.sql#L73-L81) |
| Pedido enviado para a lixeira | Some da lista | [20261030120000:383](../supabase/migrations/20261030120000_lixeira_chamados.sql#L383) |
| Clique em "Abrir na fila" | Marca como lida e abre `/admin/etiquetas?pedido=` | [NotificacoesEmissaoBell.tsx:108-112](../src/components/admin/NotificacoesEmissaoBell.tsx#L108-L112) |

O componente só é montado no layout administrativo ([AdminLayout.tsx:42](../src/components/admin/AdminLayout.tsx#L42)) e se oculta para quem não tem `emitir-etiqueta` ou empresa ([NotificacoesEmissaoBell.tsx:55](../src/components/admin/NotificacoesEmissaoBell.tsx#L55), [:88](../src/components/admin/NotificacoesEmissaoBell.tsx#L88)).

## 7. Dependências do ambiente publicado

Nada abaixo foi verificado nesta etapa. A coluna "Documentado" resume o que os textos do repositório dizem. A coluna "Como confirmar" indica uma forma de checar sem alterar nada.

| Peça | Código atual | Documentado (28/10/2026) | Como confirmar |
| --- | --- | --- | --- |
| Função `comunicacao-etiqueta` | `index.ts` e `worker.ts` com Power Automate | versão publicada antiga, com SMTP e sem Teams ([CONTRATO_INTEGRACAO.md:319](../docs/power-automate/CONTRATO_INTEGRACAO.md#L319)) | versão publicada no painel do Supabase, comparada ao repositório |
| `ETIQUETA_TRANSPORTE` | padrão simulado ([logic.ts:339](../supabase/functions/comunicacao-etiqueta/logic.ts#L339)) | cadastrada em `simulado` ([CONTRATO_INTEGRACAO.md:320](../docs/power-automate/CONTRATO_INTEGRACAO.md#L320)) | nome do segredo no painel, sem valor |
| `POWER_AUTOMATE_FLOW_URL` | obrigatória para o modo real ([logic.ts:335](../supabase/functions/comunicacao-etiqueta/logic.ts#L335)) | não cadastrada ([CONTRATO_INTEGRACAO.md:321](../docs/power-automate/CONTRATO_INTEGRACAO.md#L321)) | nome no painel |
| `POWER_AUTOMATE_TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `SCOPE`, `APP_BASE_URL` | obrigatórias ([logic.ts:340-345](../supabase/functions/comunicacao-etiqueta/logic.ts#L340-L345)) | cadastradas ([CONTRATO_INTEGRACAO.md:320](../docs/power-automate/CONTRATO_INTEGRACAO.md#L320)) | nomes no painel |
| Job `comunicacao-reversa-5min` | não é migration; depende do script manual | sem agendamento do worker ([CONTRATO_INTEGRACAO.md:322](../docs/power-automate/CONTRATO_INTEGRACAO.md#L322)) | consulta 7 |
| Vault `comunicacao_cron_url` e `comunicacao_cron_service_key` | lidos pelo job ([habilitar-worker-comunicacao.sql:33-38](../supabase/agendamento/habilitar-worker-comunicacao.sql#L33-L38)) | ausentes ([CONTRATO_INTEGRACAO.md:322](../docs/power-automate/CONTRATO_INTEGRACAO.md#L322)) | consulta 8 |
| Fluxo "Reverso — Notificações" | template em `docs/power-automate/fluxo-etiqueta-reversa-template.json` | não exportado nem comparado ([CONTRATO_INTEGRACAO.md §11 e §13](../docs/power-automate/CONTRATO_INTEGRACAO.md#L227)) | exportar a definição, sem conexões, e comparar com o template |
| Fila | — | 14 pendências de teste com destinatários reais, mais 2 `etiqueta_disponivel` em `aguardando_identidade` ([CONTRATO_INTEGRACAO.md:327](../docs/power-automate/CONTRATO_INTEGRACAO.md#L327)) | consulta 6 |

**Presença não é validação.** Ver um job, um segredo ou uma função no ambiente não comprova a versão publicada correta, uma configuração válida nem um envio funcionando. Cada linha acima precisa de evidência própria: o resultado do próprio worker ou do fluxo, correlacionado à execução.

Template do repositório: cobre os oito eventos (linha 203), valida versão, evento, link e conteúdo, e responde conforme o contrato §6. Todas as falhas do conector saem com `retryable: false` ([linha 324](../docs/power-automate/fluxo-etiqueta-reversa-template.json#L324) e [linha 386](../docs/power-automate/fluxo-etiqueta-reversa-template.json#L386)). Pelo repositório não há como saber se o fluxo publicado é igual a ele.

## 8. Modo simulado

- Com a configuração incompleta, o worker responde `{ modo: 'simulado', envio_real: false, pendentes, alteracoes_na_fila: false }` ([worker.ts:98-106](../supabase/functions/comunicacao-etiqueta/worker.ts#L98-L106)). Não reserva itens, não abre tentativa e não chama a rede.
- Quem criou o pedido não vê essa resposta. Ela fica em `net._http_response`, sem identificador que a ligue a uma execução (ver consulta 7), e no log da função.
- Ao ligar o modo real, o worker processa **toda** a fila `pendente` e `falhou`, por ordem de criação, inclusive pendências antigas de teste ([CONTRATO_INTEGRACAO.md:247-248](../docs/power-automate/CONTRATO_INTEGRACAO.md#L247-L248)).
- Fila acumulando no modo simulado é o comportamento esperado, mas não gera alerta.

## 9. Recuperação de erros

| Estado | Como chega | Reenvio automático? | Quem age | Evidência |
| --- | --- | --- | --- | --- |
| `pendente` | enfileirado | sim, ao vencer `proxima_tentativa_em` | worker | [20261026210000:84-87](../supabase/migrations/20261026210000_comunicacao_resultado_indeterminado.sql#L84-L87) |
| `processando` | reservado, com trava de 3 min | não; se a trava expira, vira `resultado_indeterminado` quando já houve chamada | — | [20261026210000:57-80](../supabase/migrations/20261026210000_comunicacao_resultado_indeterminado.sql#L57-L80) |
| `acao_conector_concluida` | 2xx com corpo correlacionado | não | — | [logic.ts:315-318](../supabase/functions/comunicacao-etiqueta/logic.ts#L315-L318) |
| `falhou` | 401/403 do gatilho, ou `connector_action_failed` com `retryable: true` | sim: esperas de 1, 2, 4 e 8 min; máximo de 5 tentativas | worker | [20261026220000:576-577](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L576-L577); [20261026200000:18](../supabase/migrations/20261026200000_comunicacao_etiqueta_solicitante.sql#L18) |
| `limite_tentativas` | esgotou as tentativas | não | ninguém pela tela; a reconciliação só atua sobre `resultado_indeterminado` | [20261026220000:571](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L571) |
| `resultado_indeterminado` | 5xx sem corpo, 429, 502 do template, timeout de 25 s, resposta ambígua, worker interrompido depois de chamar o fluxo | não | administrador, em `/admin/comunicacoes`: confirma a conclusão ou autoriza nova tentativa | [logic.ts:322-325](../supabase/functions/comunicacao-etiqueta/logic.ts#L322-L325); [worker.ts:175-180](../supabase/functions/comunicacao-etiqueta/worker.ts#L175-L180); [20261028140000:364-448](../supabase/migrations/20261028140000_smtp_direto_email.sql#L364-L448) |
| `erro_permanente` | 400 `invalid_*` correlacionado | não | corrigir fluxo ou configuração | [logic.ts:309-312](../supabase/functions/comunicacao-etiqueta/logic.ts#L309-L312) |
| `aguardando_email` | e-mail ausente ou inválido | sim, quando o e-mail é corrigido | automático | [20261026220000:365-381](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L365-L381) |
| `aguardando_identidade` | sem autor | não | — | [20261026220000:94-98](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L94-L98) |
| `aprovacao_indisponivel` | aprovador sem leitura ou sem decisão no envio | **não** | — | [20261027100000:425-429](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L425-L429) |
| `acesso_revogado` | destinatário sem acesso no envio | **não** | — | [20261027100000:391](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L391), [:400](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L400), [:439](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L439) |
| `evento_obsoleto` | tarefa superada (decidida ou nova versão); atualização sem fato correspondente | não | — | [20261027100000:401-406](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L401-L406), [:430-433](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L430-L433) |
| `emissao_substituida` | PDF substituído antes do envio | não | — | [20261026220000:302-328](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L302-L328) |

Observações:

- **Recuperação majoritariamente manual.** O template devolve `retryable: false` em toda falha de conector. Na prática, só falhas de autenticação (401/403) do gatilho são reenviadas sozinhas. Falhas transitórias do Outlook ou do Teams viram `resultado_indeterminado`, que exige ação humana. Isso segue o contrato (§6), mas significa que quase toda falha vira trabalho manual.
- **Reconciliação pode duplicar.** "Autorizar nova tentativa" pode reenviar a mensagem (contrato §8). O teto absoluto é de 20 tentativas ([20261028140000:427-428](../supabase/migrations/20261028140000_smtp_direto_email.sql#L427-L428)).
- **Sem volta automática.** `aprovacao_indisponivel`, `acesso_revogado` e `evento_obsoleto` nunca voltam a `pendente`. Verificado nas migrations: esses estados só são gravados. Para um aprovador convidado que define a senha depois, o aviso não é reenviado. Essa regra precisa de decisão de produto.
- **Interrupção do worker.** Antes de chamar o fluxo, a linha volta à fila. Depois, vira `resultado_indeterminado` ([20261026210000:32-34](../supabase/migrations/20261026210000_comunicacao_resultado_indeterminado.sql#L32-L34); [contrato §7](../docs/power-automate/CONTRATO_INTEGRACAO.md#L186-L190)).
- **Imprecisão documental.** O contrato diz "espera de 1, 2, 4… até 60 min" ([CONTRATO_INTEGRACAO.md:182](../docs/power-automate/CONTRATO_INTEGRACAO.md#L182)). Com o máximo padrão de 5 tentativas, a espera máxima é de 8 min, porque a quinta falha vira `limite_tentativas`. O teto de 60 min só ocorre se a reconciliação elevar `max_tentativas`.

## 10. Ausência de aprovador

- Sem linha em `reversa_aprovadores_setor` que cubra empresa e setor, não nasce nenhuma tarefa de `aprovacao_pendente`. Não há alerta para ninguém. O pedido fica em `aguardando_aprovacao` e só aparece na fila de quem pode decidir ([20261023190000:224-280](../supabase/migrations/20261023190000_aprovadores_empresa_setor.sql#L224-L280)). Se não há ninguém, o pedido fica sem responsável.
- O único aviso é a frase da tela de configuração: "Sem aprovador, pedidos desta combinação continuam aguardando configuração. Nenhum encaminhamento automático será feito" ([AprovadoresSetorConfig.tsx:202](../src/components/admin/AprovadoresSetorConfig.tsx#L202)). Ela aparece ao editar a configuração, não na criação do pedido.
- A tela de envio mostra só "Solicitação enviada com sucesso!" ([ReverseLogisticsForm.tsx:337](../src/components/forms/ReverseLogisticsForm.tsx#L337)).
- A configuração pode ser salva sem nenhum aprovador por setor. Não há validação de cobertura ([20261023190000:116-217](../supabase/migrations/20261023190000_aprovadores_empresa_setor.sql#L116-L217)).
- Se o único aprovador for o próprio autor, ele é excluído da tarefa, porque a autoaprovação está desligada. A fila mostra o pedido com `pode_aprovar = false` ([20261023190000:271](../supabase/migrations/20261023190000_aprovadores_empresa_setor.sql#L271)). A regra é coerente com a tela, mas é silenciosa.
- Pedidos que já estavam pendentes antes da fila não recebem aviso retroativo, nem quando a configuração é regravada ([20261027100000:117-120](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L117-L120); [contrato §12](../docs/power-automate/CONTRATO_INTEGRACAO.md#L245-L250)).

## 11. Limites do lote e da capacidade

- **Lote:** no máximo 4 itens por execução ([worker.ts:16](../supabase/functions/comunicacao-etiqueta/worker.ts#L16)).
- **Cadência:** documentada em 5 min ([habilitar-worker-comunicacao.sql:45](../supabase/agendamento/habilitar-worker-comunicacao.sql#L45)). Capacidade teórica: 48 itens por hora ([agendamento-worker-comunicacao.md:20](../docs/agendamento-worker-comunicacao.md#L20)).
- **Ordem:** FIFO por `criado_em`, sem prioridade e sem separação por canal ([20261026210000:84-87](../supabase/migrations/20261026210000_comunicacao_resultado_indeterminado.sql#L84-L87)). Um lote grande de um evento atrasa os demais.
- **Fan-out por pedido:** criação gera 1 + N aprovadores; aprovação gera 1 + N emissores; etiqueta gera 2 (e-mail e Teams do autor); rejeição e postagem geram 1. Exemplo ilustrativo, não medido: 6 aprovadores e 4 emissores somam 7 + 5 + 2 = 14 itens por pedido completo. Isso dá cerca de 3 pedidos completos por hora na capacidade máxima.
- **Tempo por execução:** até 4 respostas de 25 s do fluxo e 15 s de token, ou seja, até 115 s. O `pg_net` do job tem `timeout_milliseconds := 120000` ([habilitar-worker-comunicacao.sql:54](../supabase/agendamento/habilitar-worker-comunicacao.sql#L54)). A margem é pequena, e o comportamento ao estourar o timeout do cron não está documentado ([agendamento-worker-comunicacao.md:51](../docs/agendamento-worker-comunicacao.md#L51), "não validado").
- **Duplicidade:** `idempotency_key` é o id da linha, mas o fluxo não deduplica. Reenvio após reconciliação pode duplicar ([contrato §8](../docs/power-automate/CONTRATO_INTEGRACAO.md#L192-L194)).

## 12. Divergência documental: `ETIQUETA_TRANSPORTE` × `NOTIFICACAO_EMAIL_TRANSPORTE`

| Onde | O que diz | Situação real | Efeito de seguir o texto |
| --- | --- | --- | --- |
| [agendamento-worker-comunicacao.md:41](../docs/agendamento-worker-comunicacao.md#L41) | para desabilitar, "voltar `NOTIFICACAO_EMAIL_TRANSPORTE` para `simulado`" | a chave não é lida; só `ETIQUETA_TRANSPORTE` ([logic.ts:339](../supabase/functions/comunicacao-etiqueta/logic.ts#L339)) | o envio continua |
| [conclusao-funcional-reverso.md:100](../docs/conclusao-funcional-reverso.md#L100) | "o canal e-mail tem a trava `NOTIFICACAO_EMAIL_TRANSPORTE`" | idem | idem |
| [convite-de-acesso.md:156](../docs/convite-de-acesso.md#L156) | voltar `NOTIFICACAO_EMAIL_TRANSPORTE` "desabilita somente o e-mail da fila" | idem | idem |
| [convite-de-acesso.md:148](../docs/convite-de-acesso.md#L148) | "As notificações usam `NOTIFICACAO_EMAIL_TRANSPORTE`, também independente" | idem | confunde a separação entre convites e pedidos |
| [CONTRATO_INTEGRACAO.md:301](../docs/power-automate/CONTRATO_INTEGRACAO.md#L301) | "`NOTIFICACAO_EMAIL_TRANSPORTE` deixou de ser lida" | **correto** | — |
| [agendamento-worker-comunicacao.md:5 e :15](../docs/agendamento-worker-comunicacao.md#L5); [comunicacao-etiqueta-reversa.md:139](../docs/power-automate/comunicacao-etiqueta-reversa.md#L139) | a trava é `ETIQUETA_TRANSPORTE` | **correto** | — |
| [worker-integracao.test.mjs:182](../supabase/tests/worker-integracao.test.mjs#L182); [comunicacaoEtiquetaLogic.test.ts:120](../src/test/comunicacaoEtiquetaLogic.test.ts#L120) | testam que `NOTIFICACAO_EMAIL_TRANSPORTE` não ativa o envio | **correto** | — |

**Status (etapa 2A):** corrigido nos três documentos de origem (`agendamento-worker-comunicacao.md`, `conclusao-funcional-reverso.md` e `convite-de-acesso.md`). As ocorrências restantes descrevem a divergência, ou são testes de controle que garantem que a chave não ativa o envio.

Causa provável da confusão: o nome `ETIQUETA_TRANSPORTE` controla todas as notificações dos pedidos (e-mail e Teams), não só o aviso de etiqueta. Renomear a variável é arriscado. O caminho seguro é corrigir os textos.

## 13. Testes pertinentes

| Suíte | Arquivos | Resultado nesta etapa |
| --- | --- | --- |
| Vitest | `NotificacoesEmissaoBell.test.tsx`, `apiServiceNotifications.test.ts`, `comunicacaoEtiquetaLogic.test.ts`, `contratoIntegracaoDoc.test.ts`, `contratoFluxoPowerAutomate.test.ts`, `ComunicacoesPage.test.tsx`, `conviteFluxoTemplate.test.ts` | **7 arquivos, 74 testes, todos passaram** (`npx vitest run` com esses arquivos; 18 s) |
| Banco (PostgreSQL embarcado) | `notificacoes.test.mjs`, `comunicacao-ciclo.test.mjs`, `comunicacao-etiqueta.test.mjs`, `worker-integracao.test.mjs` | **não executaram.** `node --test` terminou com 62 testes cancelados (0 passaram, 0 falharam), porque o gancho `before` falhou. Isolado, o erro é: o PostgreSQL recusa iniciar sob usuário com privilégios administrativos. Esta sessão roda com token elevado. |
| Runtime Deno | `runtime-deno.test.mjs` | não executado: exige `DENO_BIN`, não disponível |

A falha de banco vem do ambiente desta sessão, não do código. Por isso a linha de base anterior de banco não pôde ser reconfirmada aqui. Para rodar, use um terminal sem privilégio administrativo e execute `npm test` em `supabase/tests`, ou os arquivos isolados.

## 14. Consultas somente leitura

Uso: no SQL Editor do projeto, **primeiro em homologação**. Troque `<UUID-DO-PEDIDO>` pelo id do pedido. Execute **um bloco por vez**. Cada bloco abre transação `read only` e termina em `rollback`.

Regras das consultas:

- Não chamam funções com efeito. Evitar `listar_*` e `marcar_*`: dependem de `auth.uid()`, que é nulo no editor. Nunca chamar `reversa_claim_*`, `reversa_iniciar_*`, `reversa_finalizar_*`, `reversa_contar_*` ou `reconciliar_*`.
- Sem nome, e-mail, endereço ou nome de cliente. Autor e destinatário aparecem como `*_ref`, o início do md5 do id, só para correlacionar linhas dentro da mesma consulta.
- Não selecionam valores de segredos. A consulta 8 lê só os nomes.
- Presença não é validação: as consultas 0a a 0c e 8 mostram só a presença de gatilhos, funções e nomes de segredos. Elas não provam versão publicada correta, configuração válida nem envio funcionando.
- Respostas de `net._http_response` não são evidência por si. Sem identificador comum ao disparo e à resposta, o resultado é **inconclusivo** (consulta 7).

### Consulta 0a. Gatilhos presentes (esperado: 10 linhas)

```sql
begin read only;
select c.relname as tabela, t.tgname as gatilho, t.tgenabled as ativo
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
 where not t.tgisinternal
   and t.tgname in ('trg_zz_reversa_aprovacao_ao_criar', 'reversa_comunicacao_apos_criar_pedido',
     'reversa_comunicacao_apos_evento_aprovacao', 'reversa_comunicacao_apos_config_aprovador',
     'reversa_comunicacao_apos_pdf', 'reversa_comunicacao_apos_postagem',
     'reversa_comunicacao_apos_recebimento', 'reversa_comunicacao_apos_substituicao',
     'reversa_comunicacao_etiqueta_email_auth', 'reversa_notificacoes_emissao_apos_aprovacao')
 order by 2;
rollback;
```

### Consulta 0b. Funções presentes (esperado: 8 linhas)

```sql
begin read only;
select p.proname as funcao
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('reversa_enfileirar_comunicacao', 'reversa_enfileirar_aprovadores',
     'reversa_enfileirar_operadores', 'reversa_aprovador_pode_decidir',
     'reversa_claim_comunicacao_etiqueta', 'reversa_iniciar_comunicacao_etiqueta',
     'reversa_finalizar_comunicacao_etiqueta_v2', 'listar_notificacoes_emissao')
 order by 1;
rollback;
```

### Consulta 0c. Gatilho de transição logística removido (esperado: 0)

```sql
begin read only;
select count(*) as gatilho_de_transicao_logistica_restante
  from pg_trigger
 where not tgisinternal
   and tgname = 'reversa_comunicacao_apos_transicao_logistica';
rollback;
```

### Consulta 1. O pedido

```sql
begin read only;
with p as (select '<UUID-DO-PEDIDO>'::uuid as id)
select r.id, r.empresa, r.setor, r.status, r.aprovacao_status, r.aprovacao_versao,
       r.aprovacao_legada, r.created_at, r.aprovacao_decidida_em,
       (r.inutilizada_em is not null) as na_lixeira,
       left(md5(r.solicitado_por::text), 8) as autor_ref,
       left(md5(r.aprovacao_versao_por::text), 8) as produtor_versao_ref
  from public.solicitacoes_reverso r
  join p on p.id = r.id;
rollback;
```

### Consulta 2. Avisos do pedido

```sql
begin read only;
with p as (select '<UUID-DO-PEDIDO>'::uuid as id)
select c.id as communication_id, c.evento, c.canal, c.status, c.tentativas, c.max_tentativas,
       left(c.ocorrencia_id::text, 8) as ocorrencia,
       left(md5(coalesce(c.destinatario_id::text, '')), 8) as destinatario_ref,
       c.criado_em, c.proxima_tentativa_em, c.atualizado_em, c.aceito_pelo_fluxo_em,
       left(c.ultimo_erro, 200) as ultimo_erro
  from public.reversa_comunicacoes_etiqueta c
  join p on p.id = c.solicitacao_id
 order by c.criado_em, c.evento, c.canal;
rollback;
```

### Consulta 3. Tentativas e respostas

```sql
begin read only;
with p as (select '<UUID-DO-PEDIDO>'::uuid as id)
select c.id as communication_id, c.evento, c.canal, t.transporte, t.iniciada_em, t.finalizada_em,
       t.resultado, t.http_status, left(t.detalhe, 200) as detalhe
  from public.reversa_comunicacoes_etiqueta_tentativas t
  join public.reversa_comunicacoes_etiqueta c on c.id = t.comunicacao_id
  join p on p.id = c.solicitacao_id
 order by t.iniciada_em;
rollback;
```

### Consulta 4. Aprovadores que o cadastro cobre

Sem linhas significa que nenhum aprovador cobre a empresa e o setor (H2). `veio_de_convite` indica conta criada por convite. Se for verdadeiro, confirmar com o administrador se a senha já foi definida, porque a regra de senha pendente depende da sessão do próprio usuário e não pode ser consultada aqui.

```sql
begin read only;
with p as (select '<UUID-DO-PEDIDO>'::uuid as id)
select left(md5(a.usuario_id::text), 8) as aprovador_ref,
       a.todos_setores,
       (coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'aprovar-reversa') as tem_aprovar_reversa,
       (coalesce(u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? r.empresa) as tem_empresa,
       (r.solicitado_por = a.usuario_id) as eh_autor,
       (r.aprovacao_versao_por = a.usuario_id) as produziu_versao,
       exists (select 1 from public.convites_acesso ca where ca.usuario_id = a.usuario_id) as veio_de_convite
  from p
  join public.solicitacoes_reverso r on r.id = p.id
  join public.reversa_aprovadores_setor a on a.empresa = r.empresa
  join auth.users u on u.id = a.usuario_id
 where a.todos_setores or r.setor = any (a.setores)
 order by 1;
rollback;
```

### Consulta 5. Avisos do sino para o pedido

```sql
begin read only;
with p as (select '<UUID-DO-PEDIDO>'::uuid as id)
select n.aprovacao_versao, left(md5(n.destinatario_id::text), 8) as destinatario_ref,
       n.created_at, n.lida_em
  from public.reversa_notificacoes_emissao n
  join p on p.id = n.solicitacao_id
 order by n.created_at;
rollback;
```

### Consulta 6. Resumo da fila, sem pedido

Mostra acúmulo e itens antigos. Útil para H1 e H4.

```sql
begin read only;
select c.evento, c.canal, c.status, count(*) as total, min(c.criado_em) as mais_antigo
  from public.reversa_comunicacoes_etiqueta c
 group by c.evento, c.canal, c.status
 order by c.evento, c.canal, c.status;
rollback;
```

### Consulta 7. Presença do job e correlação das chamadas (só se pg_cron existir)

Esta consulta não diz se o worker respondeu bem. Ela separa três coisas:

1. **Presença do job**: o agendamento existe. Não prova que a configuração está válida.
2. **Evidência de correlação**: o comando do job traz um identificador de execução (`execucao_id`)? Hoje o script de habilitação dispara com corpo `'{}'`, e a resposta do worker não devolve identificador. Sem ele, nenhuma resposta de `net._http_response` pode ser atribuída a uma execução do worker. Por isso as respostas HTTP ficam fora desta consulta.
3. **Registro do agendador**: mostra que o comando de disparo rodou. Não mostra a resposta do worker.

Classificação do resultado:

| Passo 2 | Resposta correlacionada ao identificador | Resultado |
| --- | --- | --- |
| `false` (situação atual) | não há | **inconclusivo** para falha do worker, para 403 ou para timeout |
| `true` | não há | **inconclusivo** |
| `true` | `status_code` 403 ou `timed_out` verdadeiro | falha de autorização ou de tempo naquela execução |
| `true` | `status_code` 200 com resposta de `modo` | comportamento daquela execução (simulado ou real) |

A correlação exige mudanças fora desta etapa: um identificador por execução no corpo do disparo, devolvido pelo worker. Sem elas, H6 e H7 não podem ser confirmadas nem refutadas por este caminho.

```sql
begin read only;
-- 1) presença do job (não prova configuração válida nem envio)
select j.jobid, j.jobname, j.schedule, j.active
  from cron.job j
 where j.jobname = 'comunicacao-reversa-5min';

-- 2) evidência de correlação: o comando do job traz o identificador de execução?
select j.jobname, (position('execucao_id' in j.command) > 0) as comando_tem_identificador
  from cron.job j
 where j.jobname = 'comunicacao-reversa-5min';

-- 3) registro do agendador: mostra que o comando de disparo rodou (não é a resposta do worker)
select d.status, d.return_message, d.start_time
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
 where j.jobname = 'comunicacao-reversa-5min'
 order by d.start_time desc
 limit 10;
rollback;
```

### Consulta 8. Segredos do worker: somente nomes

Os valores não são lidos. Variáveis da função (`ETIQUETA_TRANSPORTE` etc.) não aparecem no SQL: conferir só os nomes no painel de Edge Functions, sem copiar valores.

```sql
begin read only;
select name, updated_at
  from vault.secrets
 where name like 'comunicacao_%'
 order by name;
rollback;
```

## Anexo A. Definições efetivas

| Função ou gatilho | Definição efetiva | Observação |
| --- | --- | --- |
| `reversa_enfileirar_comunicacao` | [20261026220000:71-107](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L71-L107) | sem redefinição |
| `reversa_enfileirar_aprovadores` | [20261027100000:86-115](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L86-L115) | substitui [20261026220000:111-143](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L111-L143) |
| `reversa_enfileirar_operadores` | [20261026220000:178-207](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L178-L207) | — |
| `reversa_aprovador_pode_decidir` | [20261027100000:59-84](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L59-L84) | nova |
| `reversa_comunicacao_apos_config_aprovador` | [20261027100000:121-148](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L121-L148) | gatilho de [20261026220000:173-176](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L173-L176) |
| `reversa_comunicacao_apos_criar_pedido` | [20261027100000:153-170](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L153-L170) | gatilho de [20261026220000:228-231](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L228-L231) |
| `reversa_comunicacao_apos_evento_aprovacao` | [20261027100000:175-206](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L175-L206) | gatilho de [20261026220000:265-268](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L265-L268) |
| `reversa_comunicacao_apos_transicao_logistica` | removida por [20261027100000:212-213](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L212-L213) | não deve existir |
| `reversa_comunicacao_apos_postagem` | [20261027100000:215-244](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L215-L244) | — |
| `reversa_comunicacao_apos_recebimento` | [20261027100000:247-271](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L247-L271) | — |
| `reversa_comunicacao_apos_pdf` | [20261026220000:272-300](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L272-L300) | e-mail e Teams do autor |
| `reversa_comunicacao_apos_substituicao` | [20261028140000:261-280](../supabase/migrations/20261028140000_smtp_direto_email.sql#L261-L280) | — |
| `reversa_atualizar_comunicacao_apos_email` | [20261026220000:365-381](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L365-L381) | gatilho em `auth.users` ([20261026200000:231-234](../supabase/migrations/20261026200000_comunicacao_etiqueta_solicitante.sql#L231-L234)) |
| `reversa_usuario_pode_ler_para_comunicacao` | [20261027100000:327-351](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L327-L351) | — |
| `reversa_iniciar_comunicacao_etiqueta` | [20261027100000:354-492](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L354-L492) | revalidação antes de cada chamada |
| `reversa_claim_comunicacao_etiqueta` | [20261026210000:35-101](../supabase/migrations/20261026210000_comunicacao_resultado_indeterminado.sql#L35-L101) | FIFO, sem filtro de canal |
| `reversa_finalizar_comunicacao_etiqueta_v2` | [20261026220000:534-583](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L534-L583) | aceita `erro_permanente` |
| `reversa_criar_ou_aguardar_comunicacao_etiqueta` | [20261026210000:163-239](../supabase/migrations/20261026210000_comunicacao_resultado_indeterminado.sql#L163-L239) | sem gatilho ativo; o gatilho foi removido em [20261026220000:296-297](../supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql#L296-L297) |
| `reversa_contar_comunicacoes_pendentes` | [20261026200000:420-432](../supabase/migrations/20261026200000_comunicacao_etiqueta_solicitante.sql#L420-L432) | usada pela simulação ([worker.ts:100](../supabase/functions/comunicacao-etiqueta/worker.ts#L100)) |
| `criar_notificacoes_emissao_apos_aprovacao` e gatilho | [20261023200000:26-54](../supabase/migrations/20261023200000_notificacoes_aprovacao_expedicao.sql#L26-L54) | — |
| `listar_notificacoes_emissao` | [20261030120000:358-389](../supabase/migrations/20261030120000_lixeira_chamados.sql#L358-L389) | exclui pedido na lixeira |
| `marcar_notificacao_emissao_lida` | [20261023200000:93-127](../supabase/migrations/20261023200000_notificacoes_aprovacao_expedicao.sql#L93-L127) | — |
| `reversa_claim_comunicacao_email`, `reversa_marcar_tentativa_comunicacao_smtp`, `reversa_finalizar_comunicacao_email` | [20261028140000:114-258](../supabase/migrations/20261028140000_smtp_direto_email.sql#L114-L258) | não usadas pelo worker |
| `listar_comunicacoes_reversa` e `listar_historico_comunicacao_reversa` | [20261028140000:284-361](../supabase/migrations/20261028140000_smtp_direto_email.sql#L284-L361) | administração |
| `reconciliar_comunicacao_reversa` | [20261028140000:364-448](../supabase/migrations/20261028140000_smtp_direto_email.sql#L364-L448) | só `resultado_indeterminado` |
| `salvar_config_aprovadores_reversa` | [20261023190000:116-217](../supabase/migrations/20261023190000_aprovadores_empresa_setor.sql#L116-L217) | não exige cobertura |
| `fila_aprovacao_reversas` | [20261023190000:224-280](../supabase/migrations/20261023190000_aprovadores_empresa_setor.sql#L224-L280) | base da etapa 2 |
| `usuario_pode_aprovar_reversa` | [20261023190000:55-69](../supabase/migrations/20261023190000_aprovadores_empresa_setor.sql#L55-L69) | — |
| `current_telas` | [20261028130000:8-30](../supabase/migrations/20261028130000_bloquear_operacao_sem_senha_convite.sql#L8-L30) | vazio para convite sem senha |
| `current_empresas_acesso` | [20261021130000:16-33](../supabase/migrations/20261021130000_setores_fluxo_reverso.sql#L16-L33) | — |
| `empresas_aprovaveis` | [20261023120000:42-48](../supabase/migrations/20261023120000_permissoes_capacidades.sql#L42-L48) | — |
| `pode_ler_solicitacao` | [20261030120000:14-34](../supabase/migrations/20261030120000_lixeira_chamados.sql#L14-L34) | — |
| `empresas_consulta_ampliada` | [20261028100000:62-88](../supabase/migrations/20261028100000_acesso_por_tela_cadastro.sql#L62-L88) | inclui empresas de `aprovar-reversa` |

O pacote `supabase/SQL_EDITOR_SETUP_NC_REVERSA.sql` contém marcadores das versões mais recentes. Não foi comparado linha a linha com as migrations.

## Anexo B. Observações menores

- O formulário envia `status: 'aguardando_aprovacao'` ([ReverseLogisticsForm.tsx:333](../src/components/forms/ReverseLogisticsForm.tsx#L333)); o banco grava `pendente` ([20261023100000:290](../supabase/migrations/20261023100000_aprovacao_reversas.sql#L290)). Não causa o sintoma, mas confunde a leitura do código.
- [agendamento-worker-comunicacao.md:21](../docs/agendamento-worker-comunicacao.md#L21) repete a frase de backoff discutida na §9.

## 15. Causas: confirmadas e hipóteses

### 15.1 Confirmadas no código

| Id | Causa | Evidência | Efeito |
| --- | --- | --- | --- |
| C1 | O sino só cobre emissão após aprovação | [20261023200000:26-54](../supabase/migrations/20261023200000_notificacoes_aprovacao_expedicao.sql#L26-L54); [NotificacoesEmissaoBell.tsx:130-139](../src/components/admin/NotificacoesEmissaoBell.tsx#L130-L139) | nenhum aviso in-app na criação nem para aprovadores |
| C2 | Os avisos de criação dependem do worker e do Power Automate | [20261027100000:153-170](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L153-L170); [logic.ts:332-346](../supabase/functions/comunicacao-etiqueta/logic.ts#L332-L346) | sem transporte, a tarefa de aprovação não sai |
| C3 | Sem transporte completo, o worker só conta | [worker.ts:98-106](../supabase/functions/comunicacao-etiqueta/worker.ts#L98-L106) | silencioso para o usuário |
| C4 | Sem aprovador configurado, nada é avisado nem alertado | [20261023190000:224-280](../supabase/migrations/20261023190000_aprovadores_empresa_setor.sql#L224-L280); [AprovadoresSetorConfig.tsx:202](../src/components/admin/AprovadoresSetorConfig.tsx#L202) | pedido parado sem sinal |
| C5 | Convite sem senha gera tarefa que termina em estado terminal | [20261027100000:425-429](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L425-L429); [20261028130000:8-30](../supabase/migrations/20261028130000_bloquear_operacao_sem_senha_convite.sql#L8-L30) | aviso perdido, sem reenvio depois |
| C6 | Falhas transitórias do conector viram resultado indeterminado | [logic.ts:322-325](../supabase/functions/comunicacao-etiqueta/logic.ts#L322-L325); [template linhas 324 e 386](../docs/power-automate/fluxo-etiqueta-reversa-template.json#L324) | exige ação manual; quase nunca há reenvio |
| C7 | A documentação cita uma chave que o código não lê | §12 | pausar pelo texto não funciona |
| C8 | Pedidos anteriores à fila não recebem aviso retroativo | [20261027100000:117-120](../supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql#L117-L120) | pendências antigas só aparecem na fila de aprovação |
| C9 | Três funções SMTP de comunicação existem no banco e não são usadas pelo worker | [20261028140000:114-258](../supabase/migrations/20261028140000_smtp_direto_email.sql#L114-L258); [contratoIntegracaoDoc.test.ts:115-118](../src/test/contratoIntegracaoDoc.test.ts#L115-L118) | ruído de manutenção; não explica o sintoma |

### 15.2 Hipóteses a confirmar no ambiente publicado

| Id | Hipótese | Como confirmar | O que refuta |
| --- | --- | --- | --- |
| H1 | Transporte real não ativo: `ETIQUETA_TRANSPORTE`, URL do fluxo ou versão da função não conferem, e não há agendamento. É a hipótese mais forte, pela documentação de 28/10. | versão publicada e nomes de segredos no painel (presença, não validação); consulta 6 (fila); a consulta 7 não confirma execução sem correlação | resposta do worker correlacionada com `modo: power_automate`, e tentativas com `acao_conector_concluida` |
| H2 | Sem aprovador cobrindo empresa e setor, ou aprovador sem capacidade | consulta 4 vazia, ou sem `tem_aprovar_reversa` e `tem_empresa` verdadeiros | consulta 2 mostrando `aprovacao_pendente` criada |
| H3 | Gatilhos ou funções ausentes na publicação | consultas 0a, 0b e 0c fora do esperado | presença completa |
| H4 | Fila represada: lote, FIFO e itens antigos de teste | consulta 6 com `pendente` antigo; consulta 2 com `criado_em` antigo | `criado_em` e `atualizado_em` recentes |
| H5 | O fluxo rejeita ou falha no conector (destinatário no Teams não encontrado, conexão expirada) | consulta 3 com `resultado_indeterminado` e `http_status` ausente ou 502; histórico de execuções do fluxo | `acao_conector_concluida` nas tentativas |
| H6 | O cron é recusado com 403. O worker exige um token JWT com `role=service_role` ([worker.ts:44-48](../supabase/functions/comunicacao-etiqueta/worker.ts#L44-L48)); se a chave do Vault não estiver nesse formato, a chamada é recusada ([worker.ts:92](../supabase/functions/comunicacao-etiqueta/worker.ts#L92)) | inconclusivo pela consulta 7 hoje (sem identificador de correlação); confirma-se só com resposta correlacionada e `status_code = 403` | resposta correlacionada com `status_code = 200` e `modo` |
| H7 | O cron estoura o timeout de 120 s | inconclusivo pela consulta 7 hoje; confirma-se só com resposta correlacionada e `timed_out = true` | resposta correlacionada com `timed_out = false` |
| H8 | Aprovador convidado sem senha definida | consulta 2 com `aprovacao_indisponivel`; consulta 4 com `veio_de_convite` | aprovador com senha definida e tarefa entregue |

## 16. Ordem sugerida das correções

1. **Confirmar o ambiente publicado sem alterar nada.** Consultas 0a a 0c, 6 e 8 (presença e fila), versão publicada da função e configuração no painel. A consulta 7 só classifica com identificador de correlação; sem ele, o resultado é inconclusivo. Responsável: administrador do Supabase e do Power Automate. Confirma ou refuta H1, H3 e H4; H6 e H7 só com resposta correlacionada.
2. **Corrigir a documentação.** Feito na etapa 2A nos trechos de `NOTIFICACAO_EMAIL_TRANSPORTE` (§12) e na consulta 7. Pendente: a frase de backoff (§9), que ainda diz "até 60 min" no contrato e no guia de agendamento.
3. **Dar visibilidade ao aprovador.** Feito na etapa 2A (§17): contador no item Aprovações, sem alterar envio, worker ou transporte.
4. **Alertar sobre pedido sem cobertura.** Diagnóstico para o administrador e aviso ao criar pedido sem aprovador. Envolve regra de negócio; decidir antes.
5. **Definir a recuperação de convites e acessos** (`aprovacao_indisponivel`, `acesso_revogado`): reativar quando o acesso voltar, ou aceitar o encerramento. Decisão de produto.
6. **Classificar falhas do conector.** Fazer o fluxo devolver `retryable: true` só quando houver certeza de que nada foi enviado. Muda o template e exige o administrador do Microsoft.
7. **Medir antes de ajustar a capacidade.** Latência real em homologação; só então mudar `LOTE_MAXIMO`, cadência ou timeout.
8. **Higiene.** Decidir sobre as funções SMTP de comunicação não usadas, por migration incremental. Nunca editar migrations publicadas.

## 17. Menor escopo implementável para a etapa 2

**Status:** implementado na etapa 2A (ver `docs/progresso-melhorias-reverso.md`). A entrega melhora a visibilidade interna das pendências de aprovação. Não corrige nem comprova o envio por Teams ou e-mail.

**Contador "aguardando sua análise" no item Aprovações do menu, para quem tem `aprovar-reversa`, calculado com a fila de aprovação que já existe.**

- **Dados:** `getFilaAprovacao()` ([apiService.ts:576-579](../src/services/apiService.ts#L576-L579)) chama `fila_aprovacao_reversas()` ([20261023190000:224-280](../supabase/migrations/20261023190000_aprovadores_empresa_setor.sql#L224-L280)). Contar as linhas com `pode_aprovar = true` ([:271](../supabase/migrations/20261023190000_aprovadores_empresa_setor.sql#L271)).
- **Onde:** item "Aprovações" do menu ([perfil.ts:122](../src/lib/perfil.ts#L122), [App.tsx:85](../src/App.tsx#L85)). Atualização a cada 60 s, como o sino ([NotificacoesEmissaoBell.tsx:66-68](../src/components/admin/NotificacoesEmissaoBell.tsx#L66-L68)).
- **Não muda:** worker, fila, Power Automate, gatilhos, sino de emissão, permissões e dados.
- **Sem migration:** a RPC já existe. A mudança é só de front-end, com testes Vitest e ajuste do adaptador demo (`src/demo/demoApi.ts`).
- **Resolve:** o aprovador passa a ver pendências dentro do sistema, mesmo com o transporte simulado ou fora do ar. Ataca o sintoma relatado sem depender do serviço externo.
- **Não resolve:** e-mail e Teams (H1), pedidos sem aprovador (H2), histórico de avisos, nem convites pendentes (H8).
- **Limite:** usa a lista completa da fila. Se o volume crescer, a etapa seguinte é uma RPC de contagem, por migration incremental.

Alternativa maior, que não recomendo agora: um sino próprio de aprovação com leitura marcada, com tabela, gatilho e RPCs, como o sino de emissão.
