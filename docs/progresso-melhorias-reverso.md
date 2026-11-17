# Progresso das melhorias do Reverso

Checkpoints curtos, um por etapa. Registra só o que aconteceu.

## Etapa 1: diagnóstico das notificações (09/11/2026)

**Mudanças**

- Criados `docs/diagnostico-notificacoes-reverso.md` e este checkpoint.
- Nenhum código funcional, migration, configuração, segredo ou agendamento foi alterado. Nenhum commit, push ou deploy.

**Arquivos principais analisados**

- `src/components/admin/NotificacoesEmissaoBell.tsx`, `src/services/apiService.ts`, `src/components/forms/ReverseLogisticsForm.tsx`
- `supabase/functions/comunicacao-etiqueta/` (`index.ts`, `worker.ts`, `logic.ts`)
- Migrations `20261023100000`, `20261023190000`, `20261023200000`, `20261026200000` a `20261026220000`, `20261027100000`, `20261028100000`, `20261028130000`, `20261028140000`, `20261030120000`
- `supabase/agendamento/*.sql`, `docs/agendamento-worker-comunicacao.md`, `docs/power-automate/`

**Verificações executadas**

- `npx vitest run` nos 7 arquivos pertinentes: 7 arquivos, 74 testes, todos passaram.
- `node --test` nos 4 arquivos de banco pertinentes: não executou (62 cancelados, 0 passou, 0 falhou). O PostgreSQL embarcado recusa iniciar sob usuário com privilégio administrativo, e esta sessão roda com token elevado. Diagnóstico isolado feito com script fora do repositório.
- Consultas SQL de correlação preparadas em `docs/diagnostico-notificacoes-reverso.md` §14. **Não executadas**: sem acesso ao banco remoto.

**Limitações**

- Ambiente publicado (Supabase e Power Automate) não consultado. O estado de 28/10/2026 vem só da documentação.
- Linha de base de banco não reconfirmada nesta sessão.
- `.env` e segredos não foram lidos.
- Pastas `reversa-banco-*` em `%TEMP%` ficaram de tentativas de teste. Não foram removidas, porque não consegui separá-las com certeza das de outras execuções. A pasta `diag-embedded-*` criada pelo meu diagnóstico foi removida.

**Migrations necessárias**

- Nenhuma nesta etapa.

**Próximo passo**

- Etapa 2 proposta: contador "aguardando sua análise" no item Aprovações, lendo a fila de aprovação já existente (`fila_aprovacao_reversas`, filtro `pode_aprovar`). Sem migration, sem alteração no worker ou no Power Automate. Detalhes em §17 do diagnóstico.
- Antes da etapa 2: o administrador confirma as consultas 0a a 0c, 6, 7 e 8 (somente leitura) em homologação.

## Etapa 2A: contador de aprovações e documentação das notificações (09/11/2026)

**Implementado**

- Item Aprovações com "N aguardando sua análise": número no ícone, nome acessível com a contagem e dica ao passar o mouse. Conta só registros com `pode_aprovar = true` nas empresas que a pessoa aprova (mesma regra da página). Quem não tem `aprovar-reversa` ou empresa liberada não gera consulta.
- Atualização: ao entrar, a cada 60 s com a aba visível e ao voltar o foco. Com a página de Aprovações aberta, a fila dela é a fonte (sem consulta extra). Aprovar ou rejeitar atualiza a contagem pela mesma lista.
- Falha de consulta vira alerta ("não foi possível verificar as pendências"), nunca zero. Resposta de sessão anterior não é aplicada depois da troca de usuário.
- Com o item dentro do menu "Mais", o botão mostra um ponto e o nome anuncia a contagem.
- Documentação: `NOTIFICACAO_EMAIL_TRANSPORTE` deixou de aparecer como controle ativo em três documentos. `ETIQUETA_TRANSPORTE` controla as notificações dos pedidos; `CONVITE_TRANSPORTE` controla convites. A consulta 7 do diagnóstico foi reescrita: sem identificador de correlação, o resultado é inconclusivo, e presença não prova versão, configuração nem envio.

**Arquivos principais**

- Novos: `src/lib/aprovacoesPendentes.ts`, `src/context/ContadorAprovacoesContext.tsx`, `src/components/admin/contador-aprovacoes.css`, `src/test/aprovacoesPendentes.test.ts`, `src/test/contadorAprovacoes.test.tsx`.
- Alterados: `src/components/admin/FlowNav.tsx`, `src/components/admin/AdminLayout.tsx`, `src/pages/ApprovalQueuePage.tsx` (import, hook e dois efeitos), `docs/agendamento-worker-comunicacao.md`, `docs/conclusao-funcional-reverso.md`, `docs/convite-de-acesso.md`, `docs/diagnostico-notificacoes-reverso.md`.
- Não alterados: RPCs, permissões, worker, transporte, `apiService`, tipos e migrations. O trabalho do outro agente (NC: `src/types/index.ts`, `supabase/migrations/20261109100000_nc_classificacao_separada.sql`, `docs/progresso-nc-dados.md`) foi preservado e não faz parte deste checkpoint.

**Verificações executadas**

- Testes direcionados: 8 arquivos, 92 testes, todos passaram. Inclui aprovações, sino, página de Aprovações, contratos de documentação e rotas.
- Suíte completa, última execução, com as alterações de NC do outro agente presentes: 708 testes, 700 passaram. Oito falharam, todas já presentes no commit `HEAD` e fora desta etapa: `deleteSolicitacao` (5) e `perfil` (3). Nenhum teste de contador, de NC ou de documentação falhou. Uma execução anterior teve dois timeouts de carga que passaram isoladamente e não se repetiram.
- `tsc -b` sem erros. `npm run build` (tsc e Vite) concluído.
- Verificação visual no modo demonstração local, com requisições externas bloqueadas: o item Aprovações mostrou "3 aguardando sua análise" e o número 3, em 1280 px e em 390 px, sem erros de página.

**Limitações**

- Lint não executado. O oxlint 1.90 não carrega: o binário do pacote é bloqueado pelo Controle de Aplicativo do Windows, e o binding instalado é da versão 1.78. A política não foi contornada.
- Testes de banco não executados: a sessão tem token elevado e o PostgreSQL embarcado recusa iniciar. Nenhum teste foi alterado. Para retomar, use um terminal sem privilégio administrativo. Antes, confirme com `([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)`, que deve retornar `False`. Depois rode `cd supabase/tests && npm test`.
- O indicador dentro de "Mais" foi testado com largura simulada, não em tela real: a demonstração tem só dois destinos.
- Esta entrega melhora a visibilidade interna. Não corrige nem comprova a entrega por Teams ou e-mail.

**Migrations necessárias**

- Nenhuma nesta etapa.

**Pendente**

- Lint, em ambiente com oxlint funcional.
- Testes de banco, em terminal sem elevação.
- Frase de backoff "até 60 min" (§9 do diagnóstico), ainda presente no contrato e no guia de agendamento.
- Envio por Teams e e-mail: causa não comprovada em produção, sem alteração nesta etapa.
- Oito falhas pré-existentes no `HEAD`: `deleteSolicitacao` (mock sem `rpc`) e `perfil` (rótulo "Histórico de pedidos" em vez de "Pedidos"). Fora do escopo 2A.
- Consultas da §14 do diagnóstico: não executadas no ambiente remoto.

**Próximo passo**

- Aguardar sua decisão sobre a etapa de envio (Teams e e-mail). Antes de qualquer alteração nesse ponto, é preciso comprovar o estado do worker com correlação por execução, o que depende de acesso administrativo ao ambiente publicado.

## Revisão 2A: troca de sessão e escopo do contador (09/11/2026)

**Problema reproduzido: sim, em cinco testes antes da correção**

- Com a página aberta, trocar de aprovador da mesma empresa: o contador mostrava a contagem da pessoa anterior até a nova fila responder. Causa: o estado guardado só tinha o identificador da pessoa, e a página publicava com o identificador novo as linhas que ainda mantinha da sessão anterior.
- Com a página aberta, mudar as empresas liberadas mantendo a mesma pessoa: a contagem do escopo anterior ficava como atual durante a recarga. Causa: o escopo (empresas) não entrava na chave guardada.
- Com a página aberta, trocar de pessoa: as linhas da sessão anterior continuavam visíveis até a nova fila carregar. Causa: a lista da página não era limpa na troca de escopo.
- Com a página aberta, falha da nova consulta: enquanto ela estava pendente, a contagem anterior aparecia como atual. Causa: a mesma da primeira.

**Não reproduzido (já protegido, antes e depois da correção)**: resposta atrasada da consulta anterior, com a página aberta ou fechada; falha da consulta sem a página aberta; perda de empresa com a página aberta (a linha sai pelo filtro de empresa, mas o cenário é coberto pelo teste de linhas).

**Correção local (associação sessão/escopo, consulta e publicação)**

- Escopo = pessoa + empresas liberadas (`chaveEscopoAprovacao`, em `src/lib/aprovacoesPendentes.ts`).
- Contador: estado guardado com o escopo; uma leitura só vale enquanto o escopo atual for o mesmo; resposta de consulta só é aplicada se o escopo ainda for o dela; publicação da página só é aceita se o escopo dos registros for o atual.
- Página: cada fila carregada, e cada falha, é marcada com o escopo da consulta. Ao mudar o escopo, a lista, a linha expandida e o estado de erro da sessão anterior são limpos antes da próxima pintura.
- Não houve mudança em permissões, RPCs, worker, transporte, `apiService`, tipos ou NC. Não houve refatoração.

**Testes**

- `src/test/contadorAprovacoes.test.tsx`: nove cenários novos de troca de sessão, escopo e resposta antiga, com e sem a página aberta. Cinco falharam antes da correção (troca de pessoa e falha da nova consulta com a página aberta, mudança de empresas com e sem a página, e linhas da pessoa anterior); os demais passaram antes e depois.
- `src/test/aprovacoesPendentes.test.ts`: dois testes do escopo da sessão.
- Resultado final dos testes direcionados: 5 arquivos, 58 testes, todos passaram. `tsc -b` sem erros. Sem avisos de `act`.
- Não rodei a suíte completa nesta rodada, conforme pedido; ela fica para depois do agente 2.

## Etapa 2B: onde o envio por Teams e e-mail para (diagnóstico de leitura)

**Acesso ao ambiente publicado: nenhum nesta sessão.** Não há CLI do Supabase, da Power Platform, da Azure ou do GitHub instalado. Os conectores do claude.ai não incluem Supabase nem Power Automate. O conector Microsoft 365 não está autorizado. Não usei nenhum acesso pessoal de navegador. Nada foi lido do ambiente remoto.

**Evidência do envio coletada: nenhuma do ambiente publicado.** Os registros de 28/10 não comprovam a situação atual. Presença de função, job ou segredo não prova configuração válida nem transporte ativo. Respostas gerais de `net._http_response` não são atribuídas ao Reverso sem correlação.

**Consultas mínimas para um ticket existente** (§14 do diagnóstico, já com a chave de correlação):

- Consulta 2, comunicações: `communication_id` (é o `idempotency_key` enviado ao fluxo), evento, canal, status, referência do destinatário e último erro.
- Consulta 3, tentativas: `transporte`, `resultado`, `http_status` e `detalhe`, por `communication_id`.
- Consulta 7, parte 3: registro do agendador desde a criação do pedido. É registro de execução do comando, não resposta do worker.
- Manual, administrador Microsoft: histórico de execuções do fluxo "Reverso — Notificações", filtrado pelo `communication_id`.
- Manual, administrador Supabase: data e versão publicadas de `comunicacao-etiqueta`, com nomes de segredos e sem valores.

**O que cada resultado permite concluir**

| Resultado | Permite concluir |
| --- | --- |
| Consulta 2 sem `aprovacao_pendente` para os aprovadores esperados | a tarefa não foi enfileirada (criação ou elegibilidade). Nada sobre transporte. |
| `pendente` antigo e sem tentativas na consulta 3 | o worker não reservou o item. Não distingue agendador, transporte simulado ou versão. |
| Tentativa com `transporte = 'smtp'` | executou o código SMTP, que não é o atual. A versão publicada não é a atual. |
| Tentativa com `transporte` nulo, criada depois de 28/10 | executou o caminho do Power Automate. O código atual não grava `transporte`. |
| `resultado = acao_conector_concluida` | o fluxo respondeu sucesso para aquele id. Não prova entrega. Confirmar no histórico do fluxo. |
| `resultado_indeterminado`, ou `http_status` ausente ou 502 | resposta ambígua. Só o histórico do fluxo esclarece. Não há reenvio automático. |
| `falhou` com `http_status` 401 ou 403 | autenticação do gatilho (OAuth ou permissão). |
| Registro do agendador sem execuções após a criação | o comando não rodou no período (job ausente ou inativo). Não prova a causa. |
| Histórico do fluxo sem execução para o `communication_id` | o worker nunca chamou o fluxo para esse item. |

**Próximo passo concreto**

- Quem tem acesso ao ambiente publicado roda as consultas 2, 3 e 7 (parte 3) para um pedido existente e confere o histórico do fluxo pelo `communication_id`. Devolve os resultados, sem dados pessoais, para interpretação com a tabela acima. Não executar funções `reversa_claim_*`, `reversa_iniciar_*`, `reversa_finalizar_*` nem o worker.
- Alternativa, se você quiser que eu consulte o histórico de mensagens: autorizar o conector claude.ai Microsoft 365 nas configurações de conectores. Isso não cobre o histórico de execuções do Power Automate.
- Até esse resultado, nenhuma alteração no envio é proposta. A correção depende da evidência.

## Integração NC ↔ Reverso: classificação no vínculo da reversa

**Escopo.** Seletor de NC do formulário, fila de aprovação, conversão do `apiService` e demonstração. Não houve mudança no formulário de NC, nos cálculos, nos relatórios, no setor solicitante, na elegibilidade dos aprovadores nem na aprovação do reverso. Os arquivos do agente 2 foram preservados; nas partes compartilhadas, só as linhas da integração foram editadas.

**Feito**

- Migration nova `supabase/migrations/20261109130000_fila_aprovacao_classificacao_nc.sql`: `fila_aprovacao_reversas()` passa a devolver `nc_tipo_problema` e `nc_causador` no fim do retorno. Como a assinatura muda, a função é recriada (drop + create). As 20 colunas anteriores mantêm nome, tipo e ordem. Quem vê a fila, o filtro, a ordem e o vínculo por `r.nc_id` não mudaram. Privilégios refeitos: `anon` e `public` sem execução; `authenticated` e `service_role` com execução.
- `supabase/SQL_EDITOR_SETUP_NC_REVERSA.sql` regenerado com `node supabase/scripts/gerar-sql-editor.mjs`. Antes de gravar no repo, a diferença foi conferida num diretório temporário: 0 linhas removidas; acrescentados o cabeçalho e o bloco da migration nova.
- `src/lib/ncVinculoReverso.ts` (novo): texto único para o seletor e para a aprovação. Registro novo: `Tipo do problema: X · Origem / causador: Y`, com os rótulos de `LISTA_NC_LABEL`. Origem antiga: `Origem antiga: Z`, exibida junto do que existir. Sem nada: `Classificação: não informada`. Só apresenta o que o banco devolveu.
- Seletor (`ReverseLogisticsForm.tsx`): a opção mostra esse texto. O valor continua sendo o ID; a RPC `ncs_para_reversa` e os filtros não mudaram.
- Aprovação (`ApprovalQueuePage.tsx`): o bloco "Referência vinculada" mostra o mesmo texto e a descrição da NC. Sem NC, o bloco não aparece.
- `apiService.getFilaAprovacao`: repassa os dois campos. Linha sem eles (banco sem a migration) fica como não informada, sem erro.
- Demonstração (`demoApi.ts`): origem, tipo, causador, código e descrição vêm da NC vinculada em `demoDados.ncs()`. Saíram os valores fixos (`Erro de separação` e `Divergência identificada…`). O código da NC também corrige um defeito: vinha de `nc_numero`, que a demonstração grava como nulo nas reversas novas.
- `supabase/tests/fila-classificacao-nc.test.mjs` (novo) e uma asserção a mais no teste do pacote único (`banco.test.mjs`): `nc_tipo_problema` e `nc_causador` na função.

**Decisões**

- O rótulo "Origem / causador" vem de `LISTA_NC_LABEL`, para bater com a lista de NC.
- Origem antiga aparece junto de tipo e causador quando os dois existem. Não escondo o histórico e não inferi classificação nova no front.
- O seletor continua em `ncs_para_reversa` e a fila em `fila_aprovacao_reversas`; nenhuma consulta foi trocada por acesso direto.

**Verificação**

- Vitest direcionado: 16 arquivos, 181 testes, todos passam. Inclui `ncVinculoReverso.test.ts` (13), `ncVinculoReversoFormulario.test.tsx` (4), `apiServiceFilaNc.test.ts` (2) e três casos novos em `ApprovalQueuePage.test.tsx`.
- `tsc -b` sem erros. `npm run build` concluído.
- Banco no PGlite 0.5.15 (PostgreSQL 18 em WASM; o alvo é o 17; isto não substitui a suíte oficial):
  - `fila-classificacao-nc.test.mjs`: 3 de 6 sem a migration, 6 de 6 com ela. Cobre NC nova, NC antiga, reversa sem NC, vínculo entre empresas recusado, aprovador de outra empresa, usuário sem acesso e privilégios.
  - `banco.test.mjs` sem a suíte de concorrência (o PGlite tem uma conexão só, e essa suíte deixa a transação abortada): o conjunto de falhas é o mesmo com e sem a migration. Os seis cenários acima também passam dentro da suíte, numa cópia de verificação fora do repo.
  - Pacote único do SQL Editor: executa do zero e confere o contrato da fila. Só falha a comparação de `count(*)`, porque o PGlite devolve número e o driver `pg` devolve texto.
  - Falhas que continuam no PGlite, iguais com e sem a migration: duas de concorrência (esperam trava entre duas conexões); três de `permission denied for table solicitacoes_reverso` ao apagar reversa como admin. A causa dessas três não foi investigada nesta rodada.
- Não executado: suíte oficial do banco (o PostgreSQL 17 embarcado recusa iniciar com o token elevado); lint (o binding nativo do oxlint não está no `node_modules`, erro `Cannot find module '@oxlint/binding-wasm32-wasi'`; dependências não foram reinstaladas); suíte completa (fica para depois da revisão do agente 2).

**Pendências e riscos**

- Aplicar `20261109130000` no Supabase antes de publicar o frontend. Sem ela, a aprovação mostra "não informada" para as NCs novas. Nada foi aplicado remotamente.
- `fila_aprovacao_reversas` já devolvia `nc_origem` e `nc_descricao` a qualquer aprovador da reversa, sem checar `pode_ver_nc()`. Os campos novos seguem o mesmo critério. Restringir a NC a quem vê NC é outra decisão.
- Resolvido na rodada seguinte (seção abaixo): a demonstração aceitava NC de outra empresa ou encerrada na criação do reverso. O banco já recusava esses casos, agora com teste no harness.
- `docs/migrations.md` foi atualizado na rodada seguinte, com as três migrations de NC como não aplicadas no remoto.

## Fechamento da integração NC ↔ Reverso: vínculo com a NC e testes antigos

Não toquei em formulário, cálculos, relatórios ou estilos de NC. Os arquivos do agente 2 foram preservados.

**Comportamento corrigido**

- **Demonstração** ([`demoApi.ts`](../src/demo/demoApi.ts)): `createSolicitacao` e `updateSolicitacao` aplicam as regras do gatilho `reversa_vincular_nc` antes de qualquer gravação. Recusam NC inexistente, NC de outra empresa e novo vínculo com NC Encerrada ou Cancelada, com as mesmas mensagens do banco. A recusa não grava pedido nem histórico. Reverso sem NC continua permitido, e NC Aberta ou Em tratativa da mesma empresa continua aceita.
- **Vínculo histórico:** a validação só roda quando o payload troca a NC ou a empresa. Uma NC encerrada depois de vinculada não impede atualizações logísticas nem apaga o vínculo.
- **Reprodução antes da correção:** 8 dos 12 casos de [`demoVinculoNcReversa.test.ts`](../src/test/demoVinculoNcReversa.test.ts) eram aceitos indevidamente. Depois da correção: 12 de 12.
- **Banco:** não havia defeito. O gatilho `reversa_vincular_nc` (migration `20261020130100`, não redefinido depois) recusa todos esses casos. Não criei migration.

**Testes antigos encerrados**

- [`deleteSolicitacao.test.ts`](../src/test/deleteSolicitacao.test.ts) (5 falhas, mock sem `rpc`): a expectativa era exclusão física com remoção de PDFs. A regra vigente é mover para a Lixeira (RPC `inutilizar_chamado`). O teste agora confere a RPC, a ausência de exclusão física e de remoção de PDFs, a mensagem de permissão do banco e o fallback. Nenhuma asserção foi removida; a falha de permissão, que antes vinha do storage, agora vem da RPC.
- [`perfil.test.ts`](../src/test/perfil.test.ts) (3 falhas): a Lixeira entra na navegação de quem tem `usuarios`, e quem emite etiqueta e acessa pedidos vê "Histórico de pedidos" (`?visao=historico`). Atualizei só as expectativas que divergiam dessa regra. O produto não mudou.
- Os dois arquivos passam: 31 de 31.

**Resultados reais**

- Vitest direcionado: 23 arquivos, 300 testes, todos passam.
- `tsc -b` sem erros. `npm run build` concluído.
- Banco: [`vinculo-reversa-nc.test.mjs`](../supabase/tests/vinculo-reversa-nc.test.mjs), novo no repo, com 11 testes. Passa 11 de 11 no PGlite 0.5.15 (PostgreSQL 18 em WASM). É verificação complementar: a suíte oficial em PostgreSQL 17 não rodou.
- [`migrations.md`](migrations.md): as três migrations de NC, na ordem, marcadas como não aplicadas no remoto.

**Pendências**

- Rodar `vinculo-reversa-nc.test.mjs` no harness oficial (PostgreSQL 17), em sessão sem elevação.
- Suíte completa conjunta: depois da revisão do agente 2.
- Lint: o binding nativo do oxlint não está no `node_modules`. Não reinstalei dependências.
- Aplicar as migrations de NC no Supabase antes de publicar o frontend. Nada foi aplicado remotamente.
- Troca só da empresa da reversa, mantendo uma NC encerrada, não passa pela checagem de status do gatilho. Com as regras atuais, isso só passaria se a reversa já estivesse com empresa diferente da NC, o que os próprios gatilhos impedem. Não testei; vale confirmar se a aplicação altera a empresa.
- No PGlite, três testes de apagar reversa como admin falham com `permission denied`, com e sem as migrations de NC. A causa não foi investigada.
- Teams e e-mail continuam sem verificação no ambiente publicado. Nada aqui os declara funcionando.

## Avisos internos do ciclo da reversa (sino)

Escopo: avisos internos para solicitante e aprovadores, e as emissões que o sino já mostrava. Não houve alteração em NC (edição, serviços, formulários, cálculos, relatórios ou histórico financeiro), em `src/types/index.ts`, no worker, no Power Automate, em convites, SMTP, secrets ou agendamentos. Nada foi enviado, sem banco remoto, sem deploy e sem commit.

**Implementação local**

- Migration nova e incremental: `supabase/migrations/20261109150000_avisos_ciclo_reverso.sql` (renomeada de `20261109140000` na consolidação, por colisão de versão com a migration de edição de NC do agente 2). Nenhuma migration anterior foi alterada.
  - Tabela `reversa_avisos`, uma linha por (destinatário, pedido, evento, ocorrência). Sem acesso direto do cliente: só pelas RPCs.
  - Gatilho `AFTER INSERT` em `reversa_comunicacoes_etiqueta`: cria o aviso a partir da própria fila, na mesma transação do acontecimento, com o mesmo destinatário e a mesma ocorrência. Os canais de e-mail e Teams de um mesmo acontecimento geram um aviso só. A Expedição (`emissao_pendente`) fica de fora, porque o aviso de emissão já é gerado pela mesma aprovação.
  - Gatilho `AFTER INSERT` em `solicitacoes_aprovacoes`: decisão supera as pendências da versão; nova versão supera as anteriores (`superado_em`). Um aviso superado não conta como não lido.
  - RPCs `listar_avisos_reverso`, `contar_avisos_reverso_nao_lidos` e `marcar_aviso_reverso_lido`: conferem a cada chamada se o destinatário é o usuário atual e se ele ainda pode ler o pedido (aprovação: ainda pode decidir). Marcar leitura altera só o próprio aviso.
- Eventos avisados: pedido registrado (solicitante); aprovação pendente (aprovadores elegíveis, pela mesma regra da fila: quem registrou o pedido não recebe); pedido aprovado ou rejeitado (solicitante, com observação ou motivo); etiqueta disponível, postagem confirmada e recebimento confirmado (solicitante). Não há geração retroativa.
- Sino ([`NotificacoesEmissaoBell.tsx`](../src/components/admin/NotificacoesEmissaoBell.tsx), o mesmo componente): mostra os avisos autorizados e, para quem emite, as emissões de sempre. A contagem é de emissões não lidas mais avisos não lidos ativos. Falha de consulta aparece como erro com "Tentar novamente", nunca como lista vazia. Troca de usuário descarta a resposta anterior. A atualização em segundo plano não remonta a página vizinha nem apaga a digitação.
- Abertura: aprovação abre `/admin/aprovacoes?solicitacaoId=`; os demais avisos abrem `/admin/meus-pedidos?solicitacaoId=`. São rotas internas com query, que o retorno depois do login já aceita (`ProtectedRoute` guarda `state.from`, e a tela de login volta para ele). Se a leitura falhar, o pedido abre mesmo assim e a falha é avisada.
- Módulos novos, fora de `src/types/index.ts`: [`avisosReverso.ts`](../src/lib/avisosReverso.ts) (tipos, textos e rotas), [`avisosReversoService.ts`](../src/services/avisosReversoService.ts) (RPCs, sem leitura direta da tabela; na demonstração, troca por proxy) e [`demoAvisosReverso.ts`](../src/demo/demoAvisosReverso.ts).
- Ajuste fora do escopo de avisos: `demoApi.decidirAprovacao` passa a guardar a observação de aprovação, como o banco faz, para o aviso do solicitante mostrar a observação também na demonstração. Nenhum teste existente dependia do comportamento anterior.
- Três classes novas em [`notificacoes-emissao.css`](../src/components/admin/notificacoes-emissao.css).
- [`migrations.md`](migrations.md) registra a nova migration como não aplicada no remoto.

**Validação complementar de banco** (PGlite 0.5.15, PostgreSQL 18 em WASM; não substitui o PostgreSQL 17 do projeto)

- [`avisos-reverso.test.mjs`](../supabase/tests/avisos-reverso.test.mjs), novo no repositório, com 12 testes: 12 de 12. Cobre destinatários e permissões, acesso anônimo recusado, duplicação (configuração repetida e dois canais), decisão e nova versão superando pendências, Expedição sem segundo aviso, leitura individual sem efeito no pedido, perda de autoridade, etiqueta, postagem e recebimento, e outra empresa sem acesso.
- Regressão nas suítes existentes de fila e notificações (`comunicacao-ciclo`, `comunicacao-etiqueta`, `notificacoes`, `jornada-expedicao`, `recebimento-fisico`, `postagem-rastreio`, `seguranca`, `acesso-por-tela`): as mesmas falhas com e sem a migration nova.
- Falhas que já existiam sem esta etapa, no PGlite: `comunicacao-ciclo` (2), `recebimento-fisico` (1) e `seguranca` (8). Entre elas estão concorrência e a checagem de `EXECUTE` para `PUBLIC`. Essa checagem aponta cinco funções de gatilho de migrações anteriores (lixeira e NC do agente 2). Nenhuma função desta etapa aparece nela.

**Verificação de interface e testes**

- Vitest direcionado: 19 arquivos, 183 testes, todos passando. Inclui os 5 testes antigos do sino, 10 testes novos de comportamento do sino, e os testes do módulo, do serviço e da demonstração de avisos.
- `tsc -b` sem erros. `npm run build` concluído.
- Demonstração isolada (vite local, sem serviço remoto), com Edge: solicitante, aprovador (desktop e celular) e emissor. A leitura marca o aviso e atualiza a contagem; a emissão continua aparecendo para quem emite, sem aviso duplicado.

**Pendências**

- Pacote do SQL Editor: regenerado na consolidação (ver a seção de consolidação, ao final).
- Suítes de banco no harness oficial (PostgreSQL 17), incluindo `avisos-reverso.test.mjs`: bloqueadas nesta sessão pelo token elevado.
- Login real: o retorno após login usa o mecanismo existente, mas não foi exercitado com login verdadeiro, porque a demonstração não passa pela tela de login.
- Teams e e-mail: não verificados no ambiente publicado. Esta entrega não comprova envio por Teams nem por e-mail. O aviso interno não depende deles.
- Aprovações pendentes anteriores à fila de comunicação não geram aviso: continuam na fila e no contador.
- `EXECUTE` para `PUBLIC` em funções de gatilho (lixeira e NC): resolvido na consolidação pela migration `20261109170000`, que retira o EXECUTE dos gatilhos; o auxiliar `nc_classificacao_legada` fica só para `authenticated` e `service_role`.
- Suíte completa conjunta: feita na consolidação (ver a seção abaixo).
- Lint: o binding nativo do oxlint não está no `node_modules` (como antes).

## Consolidação técnica (10/11/2026)

Escopo: conferir o estado consolidado do trabalho em andamento (edição de NC com auditoria financeira, avisos do ciclo da reversa, pacote do SQL Editor e migrations). Esta etapa não alterou código, banco, API nem dependências. Só esta documentação foi escrita.

Resultados, no repositório atual:

- `npx tsc -b`: sem erros.
- `npx vitest run`: 87 arquivos e 931 testes, todos passando. Fecha a "suíte completa conjunta" pendente acima.
- `npm run build`: concluído. `dist/` foi regenerado (pasta ignorada pelo git).
- `npm run lint`: roda agora, sem erros. São 73 avisos das regras do plugin React (`set-state-in-effect`, acesso a `ref` durante a renderização e função impura na renderização). Não foram tratados nesta etapa.
- Pacote do SQL Editor: gerado de novo, em cópia isolada, com as 42 migrations. O resultado é idêntico a `supabase/SQL_EDITOR_SETUP_NC_REVERSA.sql` (10.559 linhas).
- Registro de migrations: os 43 arquivos de `supabase/migrations/` aparecem em `docs/migrations.md`.
- Suíte oficial de banco (`supabase/tests`, `npm test`, PostgreSQL 17 embarcado): bloqueada nesta sessão, sem nenhum teste executado até o fim. A shell está elevada (grupo Administradores). O hook `before` de preparação do banco falha logo no início: o arquivo isolado `acesso-por-tela.test.mjs` termina em 14 s, com 17 testes cancelados pelo runner. A suíte completa dá 330 cancelados, 0 aprovados e 0 reprovados. Não é falha de regra de negócio. A causa exata não aparece no relatório do runner; a condição elevada é a que o projeto já registrou como bloqueio do PostgreSQL embarcado. Para rodar, use terminal sem privilégio elevado: `cd supabase/tests && npm test`. Não contornado.
- Worker Deno (`worker-integracao.test.mjs`): não executado nesta etapa. Exige `DENO_BIN`.

Pendências que continuam abertas, fora desta consolidação:

- Aplicar as migrations no banco remoto. Não há acesso ao remoto nesta sessão.
- Teste de concorrência real com duas conexões, na suíte oficial.
- Botão para anular custos e reembolsos, e as decisões de negócio: ver `docs/progresso-nc-dados.md`.
- Teams e e-mail: não verificados no ambiente publicado.

## Consolidação das entregas dos agentes (integração e correção)

Escopo: integração e correção, sem funcionalidades novas, com um único agente escrevendo nesta etapa. Sem commit, push, deploy, migração remota, mensagem real, ativação de API, integração ou cron. Não há Kanban nem módulo novo.

**Implementação local (repositório)**

- Migrations, em ordem: `20261109140000_nc_edicao_versao_auditoria.sql` (edição de NC, do agente 2, não alterada); `20261109150000_avisos_ciclo_reverso.sql` (avisos, renomeada de `20261109140000` para resolver a colisão de versão); `20261109160000_nc_edicao_somente_pelo_servidor.sql` (proteção da edição de NC no servidor); `20261109170000_privilegios_funcoes_de_gatilho.sql` (EXECUTE das funções de gatilho); `20261109180000_privilegios_tabelas_authenticated.sql` (TRUNCATE, REFERENCES e TRIGGER de anon e authenticated). Nenhuma migration publicada foi alterada.
- Pacote do SQL Editor (`supabase/SQL_EDITOR_SETUP_NC_REVERSA.sql`) regenerado uma vez, com `node supabase/scripts/gerar-sql-editor.mjs`: 42 migrations, em ordem, sem versões repetidas.
- Testes novos: `nc-protecao-servidor.test.mjs` (12) e `funcoes-gatilho.test.mjs` (7).
- Testes ajustados à proteção, sem enfraquecer asserções: `nc-classificacao` (cinco subtestes gravavam por UPDATE direto como authenticated; passam a gravar por `nc_salvar_edicao`, com as mesmas asserções de regra; o leitor aceita 42501 e confere que nada mudou); `banco` (consulta de NC aceita 42501; troca de empresa passa pela função e continua recusada pelo gatilho, com a mesma mensagem); `seguranca` (usuário comum que tenta apagar reversa recebe 42501 e a linha continua no banco, porque a Lixeira retirou o DELETE de authenticated).
- Documentação atualizada: `migrations.md` (linhas e estado de aplicação), `permissoes.md` (NC e privilégios), `progresso-nc-dados.md` (pendências resolvidas marcadas, com registro datado) e este checkpoint.

**Decisões**

1. Versões: a edição de NC permanece `20261109140000`; a de avisos ficou `20261109150000`. Renomear a NC para `150000`, como pedido, recriaria a colisão.
2. Proteção da edição (opção A do agente 2, com um ajuste): o UPDATE foi revogado da tabela inteira, não só das colunas financeiras, porque a conferência de versão (NC001) vale para todas as colunas; revogação parcial deixaria `descricao` e `status` sobrescrevíveis sem versão. `nc_salvar_edicao` passou a `security definer`, mantendo `pode_editar_nc()` e `search_path` vazio. Nenhuma flag do cliente é usada. A opção B (gatilho que confere uma variável de sessão) não foi adotada, porque variável de sessão é convenção, não controle de acesso.
3. Quem grava `nao_conformidades`: o front-end só usa INSERT (criar), a RPC (atualizar), DELETE (remover, admin) e upsert com `ignoreDuplicates` (importar). Os UPDATEs das migrations rodam como dono. Não há Edge Function nem worker gravando a tabela.
4. Funções: os quatro gatilhos perdem EXECUTE de PUBLIC, anon, authenticated e service_role; o disparo do gatilho não depende dessa permissão. `nc_classificacao_legada` é auxiliar, não gatilho: fica só para authenticated e service_role, porque o gatilho de origem a chama com o papel de quem grava a NC.
5. Achado fora da lista do pedido: o dump remoto concede ALL a anon e authenticated nas tabelas de `public`, o que inclui TRUNCATE, REFERENCES e TRIGGER. A RLS não controla TRUNCATE. Não é alcançável pela API REST, mas é privilégio excessivo; corrigido pela migration `20261109180000`.
6. Hipóteses do agente 2: o NC002 falso ao regravar 95 sobre 95.00 não se confirmou (teste dedicado passa, sem erro e sem nova versão). A importação por não admin só afeta a API e não foi alterada.

**Pendências de decisão (não resolvidas por esta etapa)**

- Trilha financeira na criação: o valor informado ao criar a NC não gera linha em `nc_auditoria_financeira`; a trilha começa na primeira alteração. Recomendação: `AFTER INSERT` com `tipo_alteracao = 'preenchimento'` quando houver valor. Depende de decisão de produto.
- "Em apuração" para "Sim" ou "Não" conta como correção e pede justificativa. Mantido como está.
- Três testes de `banco` esperam exclusão física de reversa ("PDF de reversa já apagada: só o admin vê e remove", "reversa com decisão não pode ser apagada; sem decisão, o admin apaga", "só admin apaga reversas"). São anteriores à Lixeira (`20261030120000`), falham igualmente na base sem as migrations novas, e precisam de regra de arquivamento decidida antes de atualizar.

**Verificação**

- Reprodução antes da correção, no PGlite com o papel `authenticated`: `nc-protecao-servidor` teve 6 falhas (correção de custo sem justificativa, situação do custo, reembolso sem justificativa, sobrescrita com versão antiga, origem e justificativa forjadas por `set_config`, e privilégio de UPDATE). Depois da correção: 12 de 12. Os fluxos legítimos (criar, editar pela função com justificativa, regravar valor igual, importar, excluir como admin) passaram nos dois estados.
- Suíte de banco completa (20 arquivos, PGlite): 316 testes passando e 5 falhando, todos em `banco.test.mjs`. Os cinco são: `exigir_operacao_logistica` (exige duas conexões reais; o PGlite tem uma); os três testes de exclusão física acima (já falhavam na base); e `script único do SQL Editor`, em que o pacote está correto e a diferença é só de tipo (`count(*)` é texto no `node-pg` e número no PGlite; os demais campos batem). `runtime-deno` não executa: é ignorado sem o binário Deno, que não existe nesta máquina.
- Testes com "concorrência" ou "simultâneas" no nome foram excluídos da rodada de PGlite (o runner não informou a contagem exata). Não há validação de concorrência nesta etapa.
- Catálogo comparado (funções e permissões de execução, privilégios de tabela, políticas, gatilhos, colunas, restrições, índices e views): instalação limpa, pacote do SQL Editor e atualização incremental (`20261109160000` a `20261109180000` sobre a base anterior) produzem o mesmo catálogo (8.554 linhas, mesmo hash). Conferido que o catálogo contém as proteções: `authenticated` sem UPDATE em `nao_conformidades`, sem TRUNCATE, REFERENCES nem TRIGGER em `public`, `nc_salvar_edicao` `security definer`, e gatilhos sem EXECUTE para os papéis da API.
- Front-end: `vitest run`, 87 arquivos e 931 testes, todos passando. `npm run build` (inclui `tsc -b`): sem erros. Lint: não rodado, porque o binding nativo do oxlint não está no `node_modules`.
- `Padrao_Documentacao_Reverso.md`: não existe no projeto (busca pelo nome, sem resultado). Por isso a documentação foi atualizada no formato já usado nos documentos do repositório.
- Word: `docs/Manual_Completo_Sistema_Reverso.docx` não foi gerado nem conferido nesta etapa. **Não está sincronizado** e não deve ser declarado como tal.

**Limites**

- Suíte oficial de banco (PostgreSQL 17, `embedded-postgres`): bloqueada nesta sessão pelo token elevado. Não foi contornada.
- Concorrência real (duas conexões): não validada.
- Remoto: nada aplicado, nenhuma API ou cron ativado. Sem acesso ao Supabase remoto, o estado de aplicação não foi conferido.
- Teams e e-mail, login real: não exercitados nesta etapa.
- `service_role` mantém UPDATE em `nao_conformidades`: é a chave de servidor, não um papel de usuário. Resíduo registrado.

**Sequência de homologação**

1. Em máquina não elevada, rodar a suíte oficial de banco (PostgreSQL 17) e os testes de concorrência com duas conexões. Esperar `banco.test` inteiro, com o pacote do SQL Editor.
2. Conferir o schema remoto (somente leitura) e aplicar, em ordem, só as migrations que faltam: `20261109100000`, `20261109120000`, `20261109130000`, `20261109140000`, `20261109150000`, `20261109160000`, `20261109170000`, `20261109180000`. Não usar o pacote numa base parcial.
3. Após aplicar: confirmar que `authenticated` não grava `nao_conformidades` por UPDATE direto; que a edição pela função grava, com trilha e autoria; que a importação e a exclusão pelo admin continuam funcionando; e que a lixeira arquiva e restaura.
4. Não há Edge Function nova nesta etapa. O front-end não mudou nesta consolidação.
5. Decidir as três pendências de decisão acima e atualizar os testes de exclusão física.
