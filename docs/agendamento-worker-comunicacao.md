# Agendamento do worker de comunicação

**Estado: preparado, não instalado.** Nenhuma migration, nenhum pacote do SQL Editor e nenhum deploy desta entrega agenda o worker. Nada foi executado em Supabase real.

O worker de notificações envia pelo **Power Automate**: `canal=email` executa só o Outlook e `canal=teams` só o Teams, uma chamada por destinatário e canal ([`power-automate/CONTRATO_INTEGRACAO.md`](./power-automate/CONTRATO_INTEGRACAO.md)). O transporte é habilitado por `ETIQUETA_TRANSPORTE`, independente de `CONVITE_TRANSPORTE`: convites e definição de senha usam SMTP direto em outra Edge Function e nunca passam por este worker.

## Mecanismo escolhido e por quê

`pg_cron` + `pg_net` + Supabase Vault, chamando a Edge Function `comunicacao-etiqueta`. É o mesmo mecanismo já usado no projeto para o rastreio dos Correios ([`src/sql/setup_cron_rastreio.sql`](../src/sql/setup_cron_rastreio.sql): job `correios-rastreio-30min`), as extensões já constam na base (`20260828171717_remote_commit.sql`) e a chave service_role fica no Vault, fora de arquivos. O front-end roda como site estático (Nginx no Railway) e não tem como executar tarefas; o repositório não tem CI. Por isso não foi introduzido outro agendador.

- Execução **autenticada**: a chamada leva `Authorization: Bearer <service_role>` lida do Vault a cada execução; a função tem `verify_jwt = true` e recusa qualquer outro papel.
- **Não depende de navegador aberto.**
- **Segredos protegidos**: `comunicacao_cron_url` e `comunicacao_cron_service_key` no Vault. Os scripts em [`supabase/agendamento/`](../supabase/agendamento) não contêm chave, URL de projeto nem destinatário (verificado em teste).
- **Habilitar/desabilitar explícito**: [`habilitar-worker-comunicacao.sql`](../supabase/agendamento/habilitar-worker-comunicacao.sql) e [`desabilitar-worker-comunicacao.sql`](../supabase/agendamento/desabilitar-worker-comunicacao.sql), executados à mão no SQL Editor (primeiro em homologação). O primeiro recusa o ambiente sem extensões/segredos, com mensagem clara. O segundo remove só o job `comunicacao-reversa-5min`; fila e histórico ficam intactos.
- **Trava do envio**: `ETIQUETA_TRANSPORTE`. Até `power_automate` e a configuração completa (URL do fluxo em HTTPS, OAuth e `APP_BASE_URL`), a função apenas **conta** pendências; não reserva itens, não altera tentativas e não marca envio. O agendamento existente não foi alterado.

## Cadência: a cada 5 minutos (`*/5 * * * *`)

- O volume é baixo (pedidos de reversa e seus eventos, na ordem de dezenas por dia): 5 minutos dá latência aceitável para aviso de tarefa/atualização com 288 chamadas/dia, quase todas vazias.
- Cada execução processa no máximo **4** comunicações (`LOTE_MAXIMO`), portanto a capacidade é de até 48 por hora; um pico é absorvido nas execuções seguintes.
- O backoff por canal (1, 2, 4… até 60 minutos; limite de 5 tentativas) é independente da cadência; execuções frequentes não aceleram retentativas.
- Execuções sobrepostas são seguras: a reserva usa `for update skip locked` e uma trava de 3 minutos com `lock_token`. O worker espera até 15 s pelo token OAuth e 25 s pela resposta do fluxo. Se a função for interrompida depois de iniciar a chamada ao fluxo, o resultado vira `resultado_indeterminado` (sem reenvio cego); confira a duração observada no runtime hospedado antes de habilitar o agendamento.
- Se a função for interrompida antes de iniciar a chamada, a linha volta à fila na execução seguinte e é enviada uma vez.

## Habilitar (homologação primeiro)

1. Habilitar `pg_cron` e `pg_net` (Database > Extensions) se ainda não estiverem.
2. Publicar `comunicacao-etiqueta` com `verify_jwt = true` e configurar os secrets do Power Automate em ambiente seguro: `POWER_AUTOMATE_FLOW_URL`, `POWER_AUTOMATE_TENANT_ID`, `POWER_AUTOMATE_CLIENT_ID`, `POWER_AUTOMATE_CLIENT_SECRET`, `POWER_AUTOMATE_SCOPE`, `APP_BASE_URL` e `ETIQUETA_TRANSPORTE`. Manter o transporte simulado até validar o fluxo, o OAuth e as conexões do Outlook e do Teams. Nunca coloque segredo nem a URL do gatilho em arquivo versionado.
3. No SQL Editor, digitando os valores (nunca em arquivo/chat):
   ```sql
   select vault.create_secret('<URL-DO-PROJETO>/functions/v1/comunicacao-etiqueta', 'comunicacao_cron_url', 'URL da Edge Function comunicacao-etiqueta');
   select vault.create_secret('<CHAVE-SERVICE-ROLE>', 'comunicacao_cron_service_key', 'Chave service_role do worker de comunicação');
   ```
4. Executar `habilitar-worker-comunicacao.sql`. Conferir o job e as respostas (consultas comentadas no próprio arquivo). Em modo simulado a resposta é `{"modo":"simulado","envio_real":false,"alteracoes_na_fila":false,"pendentes":{…}}`.
5. Só depois de conferir a fila (ver a seção 16 do contrato) e de uma homologação com um pedido real, habilitar `ETIQUETA_TRANSPORTE=power_automate`. Isso processa e-mail e Teams; não altera os convites.

Rotacionou a chave service_role? Atualize o segredo com `vault.update_secret` e reexecute o script de habilitar.

## Desabilitar

Executar `desabilitar-worker-comunicacao.sql` (remove o job) e/ou voltar `NOTIFICACAO_EMAIL_TRANSPORTE` para `simulado`. Mensagens pendentes continuam na fila; reabilitar retoma o processamento (a revalidação descarta o que perdeu pertinência).

## Monitorar

- `select jobid, jobname, schedule, active from cron.job where jobname = 'comunicacao-reversa-5min';`
- `select status, return_message, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'comunicacao-reversa-5min') order by start_time desc limit 10;` (mostra o disparo do `pg_net`; a resposta da função fica em `net._http_response`)
- Tela `/admin/comunicacoes`: situação de cada comunicação, tentativas e `resultado_indeterminado` a reconciliar.

## Não validado

`pg_cron`/`pg_net`/Vault não existem no PostgreSQL local usado nos testes. Foi testado somente que nenhuma migration agenda o worker, que o script de habilitar recusa um ambiente sem pré-requisitos e não contém segredos, e que o de desabilitar é inofensivo. O agendamento em si (disparo real, limite de tempo da função no plano contratado, `net._http_response`) precisa ser conferido em homologação.
