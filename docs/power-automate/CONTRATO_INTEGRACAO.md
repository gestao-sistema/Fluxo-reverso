# Contrato de integração: logística reversa → Power Automate

Documento para quem vai configurar o Power Automate (Outlook e Teams). Descreve **exatamente** o que o worker `comunicacao-etiqueta` envia e o que ele espera de volta. Os nomes de campos são os do código (`supabase/functions/comunicacao-etiqueta/logic.ts`); o template do fluxo é [`fluxo-etiqueta-reversa-template.json`](./fluxo-etiqueta-reversa-template.json); o guia operacional é [`comunicacao-etiqueta-reversa.md`](./comunicacao-etiqueta-reversa.md).

> **Estado:** preparado e testado só com serviços simulados. **Nenhum envio real foi feito** e a integração **não** está validada contra Power Automate, Outlook, Teams ou Supabase reais. Não a considere funcionando antes do roteiro de homologação (seção 13).

## 1. Chamada

| Item | Valor |
| --- | --- |
| Método | `POST` |
| URL | valor de `POWER_AUTOMATE_FLOW_URL` (HTTPS obrigatório; qualquer outro esquema mantém o modo simulado) |
| Cabeçalhos | `Authorization: Bearer <token>` e `Content-Type: application/json`. Nenhum outro |
| Corpo | JSON da seção 2. **Uma chamada = um destinatário + um canal** |
| Limite de tempo | 25 s para a resposta do fluxo; 15 s para obter o token |
| Retry de transporte | nenhum dentro da chamada (o worker não repete a requisição) |

## 2. Autenticação

O worker obtém o token por **client credentials** no Microsoft Entra: `POST https://login.microsoftonline.com/{POWER_AUTOMATE_TENANT_ID}/oauth2/v2.0/token` com `grant_type=client_credentials`, `client_id`, `client_secret` e `scope = POWER_AUTOMATE_SCOPE`. O token é guardado em memória até 60 s antes de expirar e enviado como `Bearer`.

Lado do fluxo: o gatilho HTTP deve **exigir autenticação Microsoft Entra** e aceitar só o aplicativo do worker. **Não use "Qualquer pessoa" (Anyone)**, nem temporariamente.

- A URL do gatilho do Power Automate traz uma assinatura (`sig=`): **trate a URL inteira como segredo**, mesmo com OAuth.
- O valor de `POWER_AUTOMATE_SCOPE` (o *audience* aceito pelo gatilho) **depende da configuração do tenant** e precisa ser definido pelo administrador Microsoft. O valor usado nos testes locais (`https://service.flow.microsoft.com//.default`) é só um exemplo e **não foi validado**.
- Se o tenant não aceitar token de aplicativo (client credentials) no gatilho, **pare**: mantenha `ETIQUETA_TRANSPORTE=simulado` e decida com o administrador por um gateway autenticado. Não afrouxe a autenticação para "fazer funcionar".

Resposta do gatilho a token ausente/inválido: HTTP `401`/`403`. O worker trata como **falha segura** (a comunicação é retentada depois).

## 3. Payload (versão 1)

Todos os campos abaixo são **texto simples**, exceto `mensagem.corpo_html` (seção 9). `nullable` = o campo existe e pode ser `null`.

| Campo | Tipo | Obrigatório no gatilho | Conteúdo |
| --- | --- | --- | --- |
| `versao` | inteiro | sim | sempre `1` |
| `evento` | texto | sim | um dos oito eventos da seção 5 |
| `idempotency_key` | texto (UUID) | sim | identificador da comunicação; ver seção 8 |
| `canal` | texto | sim | `email` ou `teams` |
| `destinatario.id` | texto (UUID) | sim | usuário do sistema |
| `destinatario.email` | texto | sim | e-mail da conta no Supabase Auth (nunca digitado no formulário) |
| `pedido.id` | texto (UUID) | não | pedido |
| `pedido.identificacao` | texto | não | `RV-` + 8 primeiros caracteres do UUID, em maiúsculas |
| `pedido.empresa` | texto | não | `Alinare` ou `Novitah` |
| `pedido.setor` | texto, nullable | não | setor do pedido |
| `pedido.motivo` | texto, nullable | não | motivo da reversa |
| `pedido.data_solicitacao` | texto `AAAA-MM-DD`, nullable | não | data da solicitação |
| `cliente.codigo` | texto | não | código do cliente |
| `cliente.nome` | texto | não | nome do cliente |
| `codigo_rastreio` | texto, nullable | não | só em `etiqueta_disponivel`, **e só se existir** |
| `validade` | texto `DD/MM/AAAA`, nullable | não | só em `etiqueta_disponivel`, e só se existir |
| `emitida_em` | texto `DD/MM/AAAA`, nullable | não | só em `etiqueta_disponivel` |
| `postagem_em` | texto `DD/MM/AAAA`, nullable | não | só em `postagem_confirmada` |
| `evento_em` | texto (instante ISO 8601), nullable | não | quando o fato ocorreu |
| `justificativa` | texto, nullable | não | só em `pedido_rejeitado` |
| `mensagem.assunto` | texto | sim | assunto do e-mail (sem quebras de linha) |
| `mensagem.corpo_html` | texto **HTML** | sim | corpo pronto; no aviso de etiqueta disponível é diferente por canal (seção 16) |
| `acao.rotulo` | texto | sim | texto do link (`Abrir meu pedido` na etiqueta disponível; `Abrir pedido` nos demais eventos) |
| `acao.url` | texto (URL) | sim | link estável do sistema (exige login) |

Rastreamento, validade e código de autorização **não** são obrigatórios: a etiqueta é comunicada com o PDF vinculado, com ou sem rastreamento. Não existe URL assinada nem anexo; o PDF é baixado dentro do sistema.

### Exemplo — e-mail (`pedido_aprovado`, fictício)

```json
{
  "versao": 1,
  "evento": "pedido_aprovado",
  "idempotency_key": "00000000-0000-4000-8000-000000000123",
  "canal": "email",
  "destinatario": { "id": "00000000-0000-4000-8000-000000000456", "email": "solicitante@example.test" },
  "pedido": {
    "id": "00000000-0000-4000-8000-0000000000aa",
    "identificacao": "RV-00000000",
    "empresa": "Alinare",
    "setor": "Comercial Alinare",
    "motivo": "Peça com defeito",
    "data_solicitacao": "2026-10-20"
  },
  "cliente": { "codigo": "12345", "nome": "Cliente de demonstração" },
  "codigo_rastreio": null,
  "validade": null,
  "emitida_em": null,
  "postagem_em": null,
  "evento_em": "2026-10-26T15:00:00+00:00",
  "justificativa": null,
  "mensagem": {
    "assunto": "Pedido de logística reversa aprovado · RV-00000000",
    "corpo_html": "<h2>Pedido de logística reversa aprovado</h2><p>Sua solicitação foi <b>aprovada</b> em 26/10/2026 12:00 e encaminhada para a expedição.</p>…"
  },
  "acao": {
    "rotulo": "Abrir pedido",
    "url": "https://reverso.example.test/admin/meus-pedidos?solicitacaoId=00000000-0000-4000-8000-0000000000aa"
  }
}
```

### Exemplo — Teams (`aprovacao_pendente`, fictício)

Mesmo formato; mudam `evento`, `canal`, `destinatario` (um aprovador), o texto e o destino do link:

```json
{
  "versao": 1,
  "evento": "aprovacao_pendente",
  "idempotency_key": "00000000-0000-4000-8000-000000000124",
  "canal": "teams",
  "destinatario": { "id": "00000000-0000-4000-8000-000000000789", "email": "aprovador@example.test" },
  "pedido": { "id": "00000000-0000-4000-8000-0000000000aa", "identificacao": "RV-00000000", "empresa": "Alinare",
    "setor": "Comercial Alinare", "motivo": "Peça com defeito", "data_solicitacao": "2026-10-20" },
  "cliente": { "codigo": "12345", "nome": "Cliente de demonstração" },
  "codigo_rastreio": null, "validade": null, "emitida_em": null, "postagem_em": null,
  "evento_em": "2026-10-20T13:00:00+00:00", "justificativa": null,
  "mensagem": {
    "assunto": "Solicitação aguardando aprovação · RV-00000000",
    "corpo_html": "<h2>Solicitação aguardando aprovação</h2><p>Há uma solicitação da empresa Alinare aguardando sua análise no setor Comercial Alinare.</p>…"
  },
  "acao": { "rotulo": "Abrir pedido", "url": "https://reverso.example.test/admin/aprovacoes?solicitacaoId=00000000-0000-4000-8000-0000000000aa" }
}
```

No Teams, o fluxo posta `mensagem.corpo_html` como chat do *Flow bot* ao `destinatario.email`. O `assunto` não é usado no Teams.

## 4. Destinos dos links (`acao.url`)

A origem vem de `APP_BASE_URL` (HTTPS, **sem** barra final, caminho, credenciais, consulta ou fragmento). O caminho e o parâmetro são fixos; só um UUID de pedido entra na URL.

| Evento | URL |
| --- | --- |
| `aprovacao_pendente` | `{APP_BASE_URL}/admin/aprovacoes?solicitacaoId={pedido.id}` |
| `emissao_pendente` | `{APP_BASE_URL}/admin/etiquetas?pedido={pedido.id}` |
| demais eventos | `{APP_BASE_URL}/admin/meus-pedidos?solicitacaoId={pedido.id}` |

O fluxo recusa (`invalid_link`) qualquer `acao.url` que não comece por `AppBaseUrl + '/admin/'`. A variável `AppBaseUrl` do template deve ser **idêntica** a `APP_BASE_URL` (sem barra final).

## 5. Matriz efetiva: evento → destinatário → canal

Derivada dos gatilhos do banco (`20261026220000` e `20261027100000`), não de intenção. **Não há eventos além destes oito e nenhum canal é acrescentado a um evento sem decisão explícita.** O destinatário é sempre resolvido no banco, a partir do autor do pedido (`solicitado_por`) e da configuração atual de aprovadores/capacidades.

| Evento | Tipo | Destinatário | Canal | Quando nasce |
| --- | --- | --- | --- | --- |
| `pedido_criado` | atualização | autor do pedido | e-mail | inserção do pedido |
| `aprovacao_pendente` | **tarefa** | cada aprovador que **pode decidir** o pedido (empresa/setor configurados + capacidade `aprovar-reversa` + empresa; o autor fica de fora, salvo autoaprovação ligada) | Teams | criação do pedido ou nova rodada de aprovação (nova versão) |
| `pedido_aprovado` | atualização | autor do pedido | e-mail | decisão "aprovada" registrada |
| `pedido_rejeitado` | atualização | autor do pedido (com `justificativa`) | e-mail | decisão "rejeitada" registrada |
| `emissao_pendente` | **tarefa** | quem tem `emitir-etiqueta` na empresa do pedido | Teams | decisão "aprovada" registrada |
| `etiqueta_disponivel` | atualização | autor do pedido | **e-mail e Teams** | PDF vinculado à emissão (reemissão = nova ocorrência) |
| `postagem_confirmada` | atualização | autor do pedido | e-mail | confirmação de postagem registrada (não vem da movimentação dos Correios) |
| `recebimento_confirmado` | atualização | autor do pedido | e-mail | confirmação manual de recebimento |

- **Tarefa** perde pertinência e **não é enviada** se, no momento do envio, a etapa já foi decidida/concluída ou a pessoa perdeu acesso. **Atualização** registra um fato e continua válida.
- `etiqueta_disponivel` vai ao autor por **e-mail (Outlook) e por Teams**, cada canal em uma chamada própria, com resultado e tentativas próprios. Isto é requisito confirmado (28/10/2026), não mais uma decisão pendente.
- E-mail aos aprovadores e Teams nos demais eventos **não** existem.
- Uma emissão **sem PDF vinculado** não gera `etiqueta_disponivel`. A notificação **não altera o estado do pedido**: o worker só lê o pedido e registra o resultado da própria comunicação.
- Não geram aviso: emitir a etiqueta sem PDF, validade, entrega/movimentação dos Correios, edição de metadados, F5.

## 6. Respostas esperadas pelo worker

O worker só considera sucesso com **status HTTP 2xx + corpo JSON válido + `communication_id` igual ao `idempotency_key` + `canal` igual ao enviado**. HTTP aceito sozinho não é sucesso.

| Situação no fluxo | HTTP | Corpo (JSON) | Resultado no worker |
| --- | --- | --- | --- |
| Ação do conector (Outlook/Teams) **terminou com sucesso** | `200` | `{"status":"connector_action_succeeded","communication_id":"<idempotency_key>","canal":"<canal>"}` | `acao_conector_concluida` |
| Falha **com certeza de que nada foi aceito pelo conector** (único caso de retry) | `4xx`/`5xx` | `{"status":"connector_action_failed","communication_id":"<idempotency_key>","canal":"<canal>","retryable":true}` | `falhou` (retentada, mesmo canal) |
| Falha ou incerteza do conector (**é o que o template devolve**) | `502` | `{"status":"connector_action_failed","communication_id":"<idempotency_key>","canal":"<canal>","retryable":false}` | `resultado_indeterminado` |
| Contrato recusado antes de qualquer conector | `400` | `{"status":"invalid_event\|invalid_channel\|invalid_link\|invalid_content","communication_id":"<idempotency_key>","canal":"<canal>","retryable":false,"error_code":"<mesmo valor de status>"}` | `erro_permanente` |
| Token ausente/inválido (rejeitado pelo gatilho) | `401`/`403` | qualquer | `falhou` (retentada) |
| Qualquer outra coisa (200/202 sem corpo esperado, corpo sem `communication_id`/`canal` correspondente, 400 de validação de esquema do próprio gatilho, 429, 5xx sem corpo, timeout, rede) | qualquer | qualquer | `resultado_indeterminado` |

Pontos que importam:

- Só responda `connector_action_succeeded` **depois** de `Succeeded` na ação do Outlook/Teams. Responder antes disso gera sucesso falso.
- `connector_action_succeeded` significa "o conector terminou a ação". **Não prova entrega à caixa nem ao chat, nem leitura.** O sistema não promete isso.
- Em dúvida, o fluxo **não** deve declarar `retryable: true`: o `retryable: true` autoriza reenvio automático (risco de mensagem duplicada).
- `invalid_*` com `communication_id` diferente do enviado, ou com status HTTP diferente de `400`, não é reconhecido como erro permanente (vira indeterminado).

### O que é cada estado

| Estado | Significado | Reenvio automático |
| --- | --- | --- |
| `acao_conector_concluida` | ação do conector concluída | não precisa |
| `falhou` | falha segura antes de qualquer efeito (inclui falha do OAuth) | sim, só esse canal, com espera de 1, 2, 4… até 60 min; máximo de 5 tentativas (`limite_tentativas` ao esgotar) |
| `erro_permanente` | contrato rejeitado; corrigir o fluxo | não |
| `resultado_indeterminado` | pode ter havido envio | **não**; somente um administrador reconcilia em `/admin/comunicacoes` (confirma conclusão ou autoriza nova tentativa, com justificativa e referência da execução) |

## 7. Processamento e concorrência

O worker reserva **uma** comunicação por vez (`for update skip locked`, reserva de 3 min), registra a tentativa **antes** de chamar o fluxo, revalida destinatário, e-mail, autoria, acesso ao pedido, pertinência do evento e limite de tentativas, e só então chama. Cada execução processa no máximo **4** comunicações (`LOTE_MAXIMO`), cada canal como linha independente: falha do Teams não afeta o e-mail do mesmo evento. Duas execuções simultâneas nunca pegam a mesma linha. Se a execução morrer **depois** de iniciar a chamada, a linha vira `resultado_indeterminado`; se morrer **antes**, volta à fila.

Desative o retry do conector no fluxo (`retryPolicy.type = none` dentro de `inputs`): a política de retry é do worker.

## 8. Chave de correlação e idempotência

`idempotency_key` = `communication_id` = UUID da linha da fila (uma linha = ocorrência + destinatário + canal). Duplicidade é impedida no banco por `(evento, ocorrencia_id, destinatario_id, canal)`: uma ocorrência por pedido e versão (aprovação), por emissão (etiqueta), por emissão e instante (postagem) e por pedido e instante (recebimento). Use `idempotency_key` para localizar a execução no histórico do Power Automate. **O fluxo não faz deduplicação própria**: se receber a mesma chave duas vezes (só após reconciliação administrativa), enviará duas vezes.

## 9. Texto simples × HTML

- **Texto simples (sem escape):** todos os campos da seção 3, exceto `mensagem.corpo_html`. Use-os em condições e expressões; não os injete em HTML sem escapar.
- **HTML:** somente `mensagem.corpo_html`, montado pelo worker com todo texto de origem externa (cliente, motivo, justificativa, setor…) já escapado. Tags usadas nos demais eventos: `h2`, `p`, `b`, `i`, `br`, `a`. No aviso de etiqueta disponível: no e-mail, um documento HTML completo no padrão visual dos e-mails do Reverso (tabelas de apresentação, estilos inline, botão com VML para o Outlook; sem imagens, fontes externas nem scripts) e, no Teams, a mensagem curta (`p`, `b`, `br`, `a`). Todo link do HTML é exatamente `acao.url`. O fluxo recusa (`invalid_content`) corpo com `<script`, `<iframe` ou `javascript:`.
- `mensagem.assunto` é texto simples, sem caracteres de controle.

## 10. Configuração de cada lado

### Backend (Edge Function `comunicacao-etiqueta`) — variáveis lidas pelo código

| Variável | Natureza | Observação |
| --- | --- | --- |
| `SUPABASE_URL` | pública | normalmente fornecida pelo Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | **segredo** | normalmente fornecida pelo Supabase; só no backend |
| `ETIQUETA_TRANSPORTE` | configuração | `power_automate` liga o envio real. **Qualquer outro valor, ausente ou vazio = simulado (padrão)** |
| `POWER_AUTOMATE_FLOW_URL` | **segredo** (contém assinatura) | HTTPS |
| `POWER_AUTOMATE_TENANT_ID` | configuração (não secreta) | |
| `POWER_AUTOMATE_CLIENT_ID` | configuração (não secreta) | |
| `POWER_AUTOMATE_CLIENT_SECRET` | **segredo** | |
| `POWER_AUTOMATE_SCOPE` | configuração (não secreta) | audience do gatilho; definido pelo administrador Microsoft |
| `APP_BASE_URL` | pública | origem HTTPS do aplicativo, sem barra final/caminho |

Nada disso vai para `VITE_*`, para o navegador, para o repositório, para exemplos ou para o chat. Se **qualquer** uma das sete últimas faltar (ou `APP_BASE_URL`/`POWER_AUTOMATE_FLOW_URL` for inválida), o worker fica em modo simulado: apenas **conta** pendências, sem reservar, sem tentativa, sem rede.

### Power Automate

1. Registro do aplicativo no Entra (um por ambiente) e consentimento; principal do worker autorizado no gatilho.
2. Cópia do fluxo a partir do template: gatilho HTTP com Entra OAuth; variável `AppBaseUrl` = `APP_BASE_URL`; ação Outlook `SendEmailV2` (`To`, `Subject`, `Body`, importância alta nas tarefas) e ação Teams `PostMessageToConversation` (Flow bot → chat com o destinatário); respostas da seção 6.
3. Conexões Outlook e Teams com a conta de serviço e licença adequadas; proteção de entradas/saídas e do histórico de execução (contêm e-mail e dados do pedido).
4. O fluxo precisa **responder em menos de 25 s**; acima disso o worker desiste e registra `resultado_indeterminado`.

## 11. Execução periódica, publicação e pausa

Mecanismo existente: `pg_cron` + `pg_net` + Vault chamando a função a cada 5 min, descrito em [`../agendamento-worker-comunicacao.md`](../agendamento-worker-comunicacao.md). **Não crie outro agendador.** Nada depende de navegador aberto.

Publicação (por quem tem acesso, **primeiro em homologação**; nada disto foi executado):

1. Aplicar no banco as migrations ausentes, em ordem (conferir antes com `supabase migration list` ou `supabase/VERIFICAR_BANCO.sql`; o banco recebeu queries manuais, então não presuma que falta algo só pelo histórico).
2. Cadastrar os segredos da seção 10 sem registrá-los em arquivo versionado nem no histórico do shell (`supabase secrets set --env-file <arquivo fora do repositório>` ou painel). Manter `ETIQUETA_TRANSPORTE=simulado`.
3. `supabase functions deploy comunicacao-etiqueta --project-ref <ref>` (o `verify_jwt = true` está em `supabase/config.toml`).
4. Habilitar o agendamento com `supabase/agendamento/habilitar-worker-comunicacao.sql` (segredos do Vault digitados no SQL Editor) e conferir a resposta simulada `{"modo":"simulado","envio_real":false,"alteracoes_na_fila":false,…}`.
5. Só depois da homologação, `ETIQUETA_TRANSPORTE=power_automate`.

**Como pausar** (do mais indicado ao menos):

1. `ETIQUETA_TRANSPORTE=simulado` (ou remover qualquer variável obrigatória): a próxima execução volta a só contar; a fila fica intacta.
2. `supabase/agendamento/desabilitar-worker-comunicacao.sql`: remove só o job `comunicacao-reversa-5min`; fila e histórico ficam intactos.
3. **Não** pause desativando o fluxo no Power Automate: um fluxo desligado não devolve o corpo que o worker exige, e qualquer resposta fora do contrato vira `resultado_indeterminado`, que exige reconciliação manual.

## 12. Fila e "sem retroativo"

- Aplicar as migrations **não** enfileira nada retroativamente: pedidos e eventos anteriores à fila não geram aviso. Nem o recálculo/salvamento da configuração de aprovadores reenvia avisos de pedidos que já estavam pendentes (exceção deliberada: a RPC administrativa `exigir_aprovacao_legado_pendente()` avisa os aprovadores dos pedidos que devolve à análise).
- **Atenção:** a fila **acumula** enquanto o transporte está simulado. Tudo o que nascer depois da migration e ficar `pendente` será enviado quando o modo real for ligado, desde que ainda pertinente (tarefas são revalidadas; atualizações históricas continuam válidas). Isso inclui pedidos criados por pessoas reais num ambiente de teste.
- **Recorte seguro para homologação:** (a) usar banco/projeto de homologação com contas fictícias cujas caixas e chats são de teste; (b) antes de ligar o modo real, ler a contagem `pendentes` da resposta simulada e a tela `/admin/comunicacoes` e confirmar que só existem comunicações de contas de teste; (c) criar os pedidos do roteiro **depois** de conferir a fila vazia ou conhecida; (d) ligar o modo real e acompanhar as primeiras execuções.
- **Pendência de decisão (administrador do banco):** se houver pendências acumuladas de usuários reais e elas não devam ser enviadas, descartá-las é uma decisão manual e auditável (por exemplo, revisar as linhas `pendente`/`falhou` por `criado_em` antes da ativação). Nenhum descarte é feito por código nesta entrega.

## 13. Checklist de configuração e pendências

### Administrador Microsoft

- [ ] Registrar o aplicativo no Entra (homologação) e criar o segredo do cliente; definir o *audience*/escopo aceito pelo gatilho.
- [ ] Confirmar se o gatilho HTTP aceita token de aplicativo (client credentials); se não, definir alternativa autenticada (decisão fora desta entrega).
- [ ] Criar a cópia do fluxo a partir do template, ajustar `AppBaseUrl` e as conexões Outlook e Teams; licenças.
- [ ] Testar com contas fictícias e conferir cada canal no histórico de execuções.

### Administrador Supabase

- [ ] Verificar o schema do banco de destino (somente leitura) e aplicar apenas as migrations realmente ausentes.
- [ ] Cadastrar segredos, publicar a função, habilitar o agendamento (segredos do Vault).
- [ ] Conferir `pg_cron`/`pg_net`/Vault, o limite de tempo da função no plano e a resposta simulada.

### Produto

- [x] `etiqueta_disponivel` chega ao autor por e-mail e por Teams (confirmado em 28/10/2026).
- [ ] Decidir o tratamento de pendências acumuladas antes da ativação (seção 12).

## 14. O que foi validado localmente e o que não foi

Validado com PostgreSQL local e Power Automate **simulado** (testes em `supabase/tests/worker-integracao.test.mjs`, `comunicacao-etiqueta.test.mjs`, `comunicacao-ciclo.test.mjs` e `src/test/contratoFluxoPowerAutomate.test.ts`): payload de todos os eventos × canais aceito pelo esquema do gatilho; respostas válidas e inválidas; modo simulado quando falta qualquer variável; 401/403; falha e exceção do OAuth; estouro de tempo; sucesso em um canal e falha no outro (retry só do canal que falhou); duas execuções concorrentes; destinatário sem acesso; etiqueta com PDF e sem rastreamento; emissão sem PDF sem aviso; logs sem segredos, e-mails ou URL do fluxo.

**Não validado:** Power Automate, Outlook, Teams, Entra, Supabase remoto, `pg_cron`/`pg_net`/Vault, e o runtime Deno da função (só roda com `DENO_BIN`). Os limites de tempo reais (25 s, plano da função) só se confirmam em homologação.

## 15. Estado da preparação do teste controlado (27/10/2026)

Conferido em leitura no projeto Supabase vinculado (único projeto; o `.env` do front-end aponta para ele; **é um banco em uso**: 14 usuários, 22 pedidos, aprovadores reais configurados nas duas empresas).

| Item | Estado |
| --- | --- |
| Schema e RPCs do worker | presentes, com `execute` só para `service_role` (conferido por catálogo; o histórico de migrations do banco está vazio por causa de SQL manual, o que não indica falta de migration) |
| Gatilhos da fila | instalados |
| Fila de comunicação | **vazia (0 linhas)** |
| Agendamento | só o job dos Correios (`correios-rastreio-30min`); **nenhum job do worker**; nenhum segredo `comunicacao_*` no Vault |
| Edge Function `comunicacao-etiqueta` | **publicada** (v1, `verify_jwt = true`): 401 sem credencial, 403 com chave anônima, 200 com `service_role` em modo simulado (`envio_real: false`, fila 0) |
| Variáveis cadastradas | `ETIQUETA_TRANSPORTE=simulado`, `POWER_AUTOMATE_TENANT_ID`, `POWER_AUTOMATE_CLIENT_ID`, `POWER_AUTOMATE_SCOPE`, `APP_BASE_URL` |
| Variáveis que **faltam** | `POWER_AUTOMATE_CLIENT_SECRET` (segredo novo) e `POWER_AUTOMATE_FLOW_URL` (URL protegida do gatilho), inseridas pelo administrador, nunca pelo chat |
| Modo | simulado (também por faltarem as duas variáveis acima) |

**Audience (documentação oficial da Microsoft):** o gatilho exige `aud = https://service.flow.microsoft.com/`, com a barra final, e a restrição por principal de serviço usa a claim `oid`. O scope de client credentials usado é `https://service.flow.microsoft.com//.default` (convenção do Entra); a confirmação final é o primeiro token real (erro `MisMatchingOAuthClaims` indica *audience* ou `oid` diferentes).

**Por que não testar no banco vivo:** o worker reserva sempre a comunicação mais antiga, sem seleção por linha, e um pedido novo gera `pedido_criado` (e-mail ao autor) **e** `aprovacao_pendente` (Teams aos aprovadores reais). Um teste ali avisaria pessoas reais. Alternativas: (a) Postgres local dos testes + worker real + fluxo real, com a conta de teste como único destinatário; (b) projeto Supabase de homologação.

**Conferência do teste (nenhuma executada ainda):** 1) token obtido sem ser exibido; 2) gatilho aceita o principal; 3) execução do canal correto no histórico do fluxo (pelo `idempotency_key`); 4) resposta `connector_action_succeeded` correspondente; 5) linha na fila em `acao_conector_concluida`; 6) mensagem recebida na conta de teste; 7) link abre em `http://localhost:5173`; 8) segunda execução do worker com `processadas: 0` (sem duplicidade); 9) pausa imediata com `ETIQUETA_TRANSPORTE=simulado`. Sucesso do conector não prova leitura; timeout ou resultado incerto não autoriza reenvio.

## 16. Aviso "Sua etiqueta está disponível" e estado para ativação (28/10/2026)

**Separação definitiva:** convites e definição/recuperação de senha usam SMTP direto (`admin-usuarios`, controle `CONVITE_TRANSPORTE`); as notificações dos pedidos usam **este** contrato (Power Automate → Outlook e Teams, controle `ETIQUETA_TRANSPORTE`). O worker de notificações não importa nem lê nada de SMTP (teste `contratoIntegracaoDoc`); `NOTIFICACAO_EMAIL_TRANSPORTE` deixou de ser lida.

**Quando nasce.** Só depois de a emissão estar registrada **com o PDF efetivamente vinculado** (`pdf_path` preenchido na emissão). Falha de upload ou de vínculo não gera o aviso; rastreamento é opcional; reemissão gera uma ocorrência nova e preserva as anteriores; repetir a operação não duplica (chave de deduplicação por emissão, destinatário e canal). O destinatário é o autor autenticado do pedido (`solicitado_por` → e-mail da conta): pedido sem autoria verificável fica `aguardando_identidade` e conta sem e-mail fica `aguardando_email`, sem associação inventada.

**Conteúdo.**

| Canal | O que o fluxo executa | Mensagem |
| --- | --- | --- |
| `email` | só o Outlook (`SendEmailV2`) | assunto `Sua etiqueta está disponível · RV-XXXXXXXX`; título "Sua etiqueta está disponível"; pedido, empresa, cliente, data de registro da etiqueta e, quando existem, código de rastreamento e validade; botão **Abrir meu pedido** |
| `teams` | só o Teams (Flow bot, chat individual) | "**Sua etiqueta está disponível**", pedido, empresa, cliente e, quando existem, rastreamento e validade; link **Abrir meu pedido** |

O link é a rota estável `/admin/meus-pedidos?solicitacaoId=<pedido>`: exige login e respeita as permissões do pedido. O PDF nunca é anexado nem público; o acesso é pelo sistema.

**Estado do ambiente remoto na conferência (somente leitura).**

| Item | Estado |
| --- | --- |
| Migration de SMTP (`20261028140000`) | aplicada; **não** foi alterada. Aceita `smtp_aceito` e `transporte` nas tentativas; as RPCs de reserva e conclusão do Power Automate (`reversa_claim_comunicacao_etiqueta`, `reversa_finalizar_comunicacao_etiqueta_v2`) continuam existindo e são as usadas pelo worker |
| Edge Function publicada | versão **antiga** (e-mail por SMTP, sem Teams). Precisa ser publicada de novo com esta versão antes de qualquer ativação |
| `ETIQUETA_TRANSPORTE`, `POWER_AUTOMATE_TENANT_ID`, `POWER_AUTOMATE_CLIENT_ID`, `POWER_AUTOMATE_SCOPE`, `POWER_AUTOMATE_CLIENT_SECRET`, `APP_BASE_URL` | cadastrados (`ETIQUETA_TRANSPORTE` em `simulado`) |
| `POWER_AUTOMATE_FLOW_URL` | **não cadastrada** (URL protegida do gatilho; só o administrador, direto no cofre) |
| Agendamento do worker | nenhum (só o job dos Correios); segredos `comunicacao_*` do Vault ausentes |
| Fila | pendências de testes de 28/10/2026 para pessoas reais (ver abaixo); nada foi processado |

**Causa de a notificação não funcionar hoje.** (1) O worker publicado envia só e-mail por SMTP e deixa o Teams parado; (2) o transporte está simulado e a URL do fluxo não existe no backend; (3) não há agendamento; (4) o aviso de etiqueta que foi gerado nos testes (pedido legado sem autor) ficou `aguardando_identidade`, por desenho: sem autoria verificável não há destinatário.

**Antes de ativar.** Ao ligar `ETIQUETA_TRANSPORTE=power_automate`, o worker processa **toda** a fila `pendente`/`falhou`, não só a etiqueta. Hoje são 14 itens, todos de testes de 28/10/2026, com destinatários reais: `aprovacao_pendente` (Teams, 6), `emissao_pendente` (Teams, 4), `pedido_criado` (e-mail, 2), `pedido_aprovado` (e-mail, 1) e `pedido_rejeitado` (e-mail, 1); mais 2 de `etiqueta_disponivel` em `aguardando_identidade` (não são processadas). Decida antes da ativação o que fazer com essas pendências (enviar, ou tratá-las à parte por decisão do administrador do banco); nada foi descartado nem alterado.

**Configuração exata para ativar (somente na Edge Function `comunicacao-etiqueta`).**

1. Cadastrar `POWER_AUTOMATE_FLOW_URL` (URL do gatilho do fluxo "Reverso — Notificações", HTTPS), sem passar pelo chat.
2. Publicar a função desta versão (`verify_jwt = true`, em modo simulado).
3. Conferir a resposta simulada `{"modo":"simulado","envio_real":false,...}`.
4. Só então `ETIQUETA_TRANSPORTE=power_automate` e o agendamento existente (`supabase/agendamento/habilitar-worker-comunicacao.sql`, job `comunicacao-reversa-5min`); para pausar, `ETIQUETA_TRANSPORTE=simulado` ou `desabilitar-worker-comunicacao.sql`.
5. Ligar o fluxo no Power Automate e confirmar a conexão do Teams.

**Homologar com um pedido real.** Use um pedido criado pela interface por uma conta real (com autoria), aprovado e sem fila pendente de outras pessoas; anexe o PDF; confira em `/admin/comunicacoes` as duas linhas `etiqueta_disponivel` (e-mail e Teams) e o resultado de cada canal; o recebimento é confirmado pela própria pessoa. `acao_conector_concluida` prova só que o conector terminou a ação.
