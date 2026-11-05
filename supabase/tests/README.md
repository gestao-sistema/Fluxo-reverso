# Testes do banco

Sobem um PostgreSQL 17 local e temporário (`embedded-postgres`), aplicam os stubs do Supabase
(`supabase-stubs.sql`: papéis `anon`, `authenticated`, `service_role`, `auth`, `storage`) e a cadeia
de `supabase/migrations/`, e executam o SQL como cada usuário (`set local role` + claims do JWT).

```
cd supabase/tests
npm ci
npm test
```

- `banco.test.mjs`: aprovação, emissões, bloqueio da expedição, concorrência, NC, etiqueta e
  script único do SQL Editor.
- `comunicacao-etiqueta.test.mjs`: roteamento de eventos por empresa/setor, deduplicação, obsolescência, etiqueta sem rastreamento, canais/retries, resultado ambíguo e reemissão.
- `comunicacao-ciclo.test.mjs`: atualização de uma base com a fila anterior (sem aviso retroativo), nova rodada de aprovação, atualização histórica × tarefa pendente, postagem/recebimento só pelas confirmações registradas, reconciliação administrativa (permissões, auditoria, concorrência entre administradores, ausência de ação em lote), consistência transacional (falha do aviso desfaz a mudança), privilégios das funções novas e relatórios por empresa/período com escopo de RLS.
- `recebimento-fisico.test.mjs`: confirmação física do recebimento depois da entrega informada pelos Correios (emitido → postado → entregue → recebido): permissão por empresa, concorrência, uma confirmação por pedido, nenhum aviso duplicado nem antes da confirmação, pedido e emissão intactos, falha do aviso desfazendo a confirmação e recusa de pedido concluído sem o rastro dos Correios.
- `postagem-rastreio.test.mjs`: postagem informada pelo rastreio dos Correios (`registrar_postagem_rastreio`): fonte `rastreio`, aviso uma única vez sem ação manual, idempotência, não sobrescreve confirmação manual, sem emissão com o código nada é inventado, só `service_role`, sem aviso de recebimento físico e sem retroativo.
- `jornada-expedicao.test.mjs`: pedido novo visível mas não elegível, elegível depois da aprovação, outra empresa e rejeitado nunca, emissão parcial recuperável (rastreamento opcional) e PDF sem vínculo.
- `acesso-por-tela.test.mjs`: cadastro oficial por tela (`20261028100000`) em PostgreSQL real com papéis reais: escopo de aprovação por empresa e setor gravado como a Edge Function grava, aprovador de uma empresa e um setor × todos os setores, empresa vazia sem acesso, retirada de acesso (decisão direta recusada, aviso não enviado), autoaprovação, mestre explícito, perfil pronto × personalizado, Storage do PDF, telas de consulta que não operam, `usuarios` sem consulta de pedidos, escrita de escopo só pelo serviço e ausência de efeito retroativo.
- `worker-integracao.test.mjs`: o worker real (`supabase/functions/comunicacao-etiqueta/worker.ts`) contra o PostgreSQL local e um Power Automate simulado: modo simulado que não consome a fila, contrato por evento/canal, resultado indeterminado sem retry, erro permanente, OAuth, segredos fora do log, dois workers simultâneos e recuperação após interrupção. Roda em **Node**, não no runtime Deno do Supabase.
- `runtime-deno.test.mjs`: a Edge Function `comunicacao-etiqueta` (`index.ts`, sem alterações) executada no **runtime Deno real**, contra um PostgREST e um Power Automate simulados (modo simulado sem consumir a fila; transporte configurado com OAuth e resultado registrado). É ignorado se não houver Deno: defina `DENO_BIN` com o executável (`deno` no PATH também serve). Precisa de acesso a `esm.sh` na primeira execução. Não substitui o Supabase Edge Runtime nem o Power Automate reais.
- `agendamento.test.mjs`: nenhuma migration agenda o worker; o script de habilitar recusa o ambiente sem pré-requisitos e não contém segredos; o de desabilitar é inofensivo. `pg_cron`/`pg_net`/Vault não existem no PostgreSQL local.
- `notificacoes.test.mjs`: notificações internas (sino) de emissão.
- `seguranca.test.mjs`: `anon` e `authenticated` com RLS real; usuários de empresas diferentes;
  capacidades; flags internas; atomicidade com falha injetada; histórico imutável; PDFs e reemissão.

`worker-integracao.test.mjs` importa arquivos `.ts` diretamente e exige Node com remoção de tipos habilitada por padrão (22.18+ ou 24; testado com 24.20).

Não usa produção nem credenciais reais. Não valida a API PostgREST nem o projeto Supabase
publicado: essas verificações continuam pendentes e devem ser feitas no ambiente de homologação.
