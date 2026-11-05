# Comunicação automática da logística reversa

Guia da fila de comunicação, do worker e do fluxo Power Automate. **O contrato exato para quem configura o Power Automate (payload, respostas, matriz, variáveis, publicação e pausa) está em [`CONTRATO_INTEGRACAO.md`](./CONTRATO_INTEGRACAO.md).** **Nada aqui foi validado contra o Power Automate, o Outlook, o Teams ou o Supabase reais.** O que foi testado localmente está em [`../conclusao-funcional-reverso.md`](../conclusao-funcional-reverso.md); o que falta está na seção "Antes de ativar".

## Eventos, destinatários e pertinência

A fila é a tabela privada `reversa_comunicacoes_etiqueta` (uma linha = uma ocorrência + um destinatário + um canal). As linhas nascem por trigger **na mesma transação** da mudança de negócio; se o registro do aviso falhar, a mudança inteira é desfeita. Destinatários e e-mails são sempre resolvidos no banco (`solicitado_por`, `auth.users.email`, capacidade da conta, empresa e configuração empresa/setor); nenhuma entrada do navegador participa.

Há dois tipos de aviso, e a diferença importa no envio:

- **Tarefa** (`aprovacao_pendente`, `emissao_pendente`): "há algo para você fazer". Perde pertinência quando a etapa deixa de depender da pessoa e **não é enviada** (`evento_obsoleto`, `aprovacao_indisponivel`, `acesso_revogado`).
- **Atualização histórica** (todos os demais, só para o solicitante): "isto aconteceu". Registra um fato; continua válida mesmo que o pedido já tenha avançado. A mensagem informa o evento e quando ocorreu, e não se apresenta como pendência.

| Evento | Canal / destinatário | Criado quando | Deixa de ser enviado quando |
| --- | --- | --- | --- |
| `pedido_criado` | E-mail ao autor | Inserção da solicitação | Autor sem acesso ou sem e-mail válido |
| `aprovacao_pendente` | Teams a cada aprovador que **pode decidir** aquele pedido (config. empresa/setor + capacidade `aprovar-reversa` + empresa; o autor e o produtor da versão ficam de fora, salvo autoaprovação ligada) | Criação do pedido; **nova rodada** (alteração relevante que devolve à análise = nova versão); novo aprovador configurado (só para pedidos já na fila de comunicação) | Decisão tomada, versão mudou, aprovador perdeu escopo/capacidade |
| `pedido_aprovado` | E-mail ao autor | Decisão "aprovada" registrada | Autor sem acesso; registro da decisão ausente |
| `emissao_pendente` | Teams a quem tem `emitir-etiqueta` na empresa | Decisão "aprovada" registrada | Emissão já concluída com PDF vinculado, pedido fora da etapa, acesso retirado |
| `pedido_rejeitado` | E-mail ao autor, **com a justificativa da decisão** | Decisão "rejeitada" registrada | Autor sem acesso; registro da decisão ausente |
| `etiqueta_disponivel` | E-mail **e** Teams ao autor | PDF vinculado à emissão (primeira vez); reemissão = nova ocorrência | Emissão substituída antes do envio. **Não depende de rastreamento.** Rastreamento e validade só aparecem quando existem |
| `postagem_confirmada` | E-mail ao autor | **Confirmação de postagem registrada na emissão** (origem manual ou rastreio gravado como tal) | Confirmação desfeita antes do envio. Confirmar de novo = nova ocorrência |
| `recebimento_confirmado` | E-mail ao autor | **Confirmação manual de recebimento** pela empresa (`confirmar_recebimento_mercadoria`) | — |

O que **não** gera aviso: emitir a etiqueta não é postagem; a validade não é postagem nem recebimento; a movimentação ou a entrega informada pelos Correios (que também mudam a etapa do pedido) não é postagem confirmada nem recebimento físico; editar metadados (códigos, datas, observação), consultar o pedido ou dar F5 não repete aviso; salvar de novo a mesma configuração de aprovadores não repete aviso.

Deduplicação: `(evento, ocorrencia_id, destinatario_id, canal)`. A ocorrência de aprovação é uma por **pedido e versão**; a de etiqueta, uma por emissão; a de postagem, uma por emissão e instante confirmado; a de recebimento, uma por pedido e instante confirmado.

Nada é enfileirado retroativamente ao aplicar as migrations, **mas a fila acumula enquanto o transporte está simulado**: o que ficar `pendente` e ainda pertinente será enviado quando o modo real for ligado. Confira a fila antes da ativação (recorte seguro em [`CONTRATO_INTEGRACAO.md`](./CONTRATO_INTEGRACAO.md), seção 12). Pedidos que já estavam pendentes antes da fila não recebem aviso em lote quando a configuração de aprovadores é regravada (continuam na fila de aprovação). Exceção deliberada: a RPC administrativa `exigir_aprovacao_legado_pendente()` devolve pedidos legados à análise e, por isso, avisa os aprovadores deles.

O sino interno de notificações de emissão (`listar_notificacoes_emissao`) continua separado e não é duplicado por esta fila.

Antes de cada canal o banco revalida: pedido existente, destinatário e e-mail atuais, autoria, leitura do pedido pela mesma regra de acesso da aplicação (`pode_ler_solicitacao`), pertinência do evento e limite de tentativas.

## Contrato (uma chamada = um destinatário e um canal)

Campos estruturados são dados puros (sem escape). **Somente `mensagem.corpo_html` carrega HTML**, montado pelo worker com todo texto de origem externa escapado. O link vem de `APP_BASE_URL` (HTTPS, sem credenciais/caminho) + rota fixa + UUID do pedido; nunca há URL assinada de curta duração.

```json
{
  "versao": 1,
  "evento": "etiqueta_disponivel",
  "idempotency_key": "00000000-0000-4000-8000-000000000123",
  "canal": "email",
  "destinatario": { "id": "00000000-0000-4000-8000-000000000456", "email": "solicitante@example.test" },
  "pedido": {
    "id": "00000000-0000-4000-8000-000000000123",
    "identificacao": "RV-00000000",
    "empresa": "Alinare",
    "setor": "Comercial Alinare",
    "motivo": "Peça com defeito",
    "data_solicitacao": "2026-10-20"
  },
  "cliente": { "codigo": "12345", "nome": "Cliente de demonstração" },
  "codigo_rastreio": null,
  "validade": null,
  "emitida_em": "26/10/2026",
  "postagem_em": null,
  "evento_em": null,
  "justificativa": null,
  "mensagem": {
    "assunto": "Etiqueta de logística reversa disponível · RV-00000000",
    "corpo_html": "<h2>Etiqueta de logística reversa disponível</h2><p>…</p>"
  },
  "acao": {
    "rotulo": "Abrir pedido e baixar etiqueta",
    "url": "https://reverso.example.test/admin/meus-pedidos?solicitacaoId=00000000-0000-4000-8000-000000000123"
  }
}
```

Destinos dos links (todos exigem login; depois de entrar, o usuário volta ao link): tarefas de aprovação → `/admin/aprovacoes?solicitacaoId=…` (abre o pedido expandido; se já foi decidido, a tela avisa); emissão → `/admin/etiquetas?pedido=…`; atualizações ao solicitante → `/admin/meus-pedidos?solicitacaoId=…` (a tela abre o pedido; o PDF é baixado dentro do sistema com a sessão do usuário, por link temporário gerado na hora).

Respostas do fluxo (o worker só aceita sucesso com corpo válido e correspondente):

```json
{"status":"connector_action_succeeded","communication_id":"<idempotency_key>","canal":"email"}
{"status":"connector_action_failed","communication_id":"<idempotency_key>","canal":"email","retryable":false}
{"status":"invalid_event","communication_id":"<idempotency_key>","canal":"email","retryable":false,"error_code":"invalid_event"}
```

`invalid_channel`, `invalid_event`, `invalid_link` e `invalid_content` (HTTP 400, antes de qualquer conector) viram `erro_permanente`.

## Resultado e retentativas

- `acao_conector_concluida`: resposta enviada **somente depois** que a ação Outlook ou Teams terminou com sucesso. Não comprova entrega à caixa/chat nem leitura.
- `falhou`: rejeição explícita e segura antes de qualquer efeito (ou falha de OAuth antes da chamada). Retry do mesmo canal com espera progressiva, limite de 5 tentativas. O outro canal não é afetado.
- `erro_permanente`: contrato rejeitado antes do conector; não é retentado até a configuração ser corrigida.
- `resultado_indeterminado`: timeout, conexão interrompida, HTTP 200/202 sem o corpo esperado, falha após o início da ação, ou worker interrompido depois de iniciar a chamada. **Sem reenvio automático.** Só um administrador reconcilia (abaixo).
- `evento_obsoleto`, `acesso_revogado`, `aprovacao_indisponivel`, `emissao_substituida`, `aguardando_email`, `aguardando_identidade`: não houve chamada ao fluxo.

O worker reserva uma linha por vez com trava transacional (`for update skip locked`, reserva de 3 minutos), registra a tentativa **antes** da chamada e só então chama o fluxo. Se a reserva expira antes da tentativa, a linha volta à fila; se expira depois, vira `resultado_indeterminado`. Duas execuções simultâneas nunca pegam a mesma linha. O fluxo desativa o retry dos conectores para não competir com os retries seguros do worker.

## Reconciliação administrativa

Tela `/admin/comunicacoes` (capacidade administrativa existente: tela `usuarios`; a autorização é conferida no banco). Lista pedido, evento, destinatário, canal, situação, tentativas, datas, identificador de correlação (é o `idempotency_key` que o fluxo recebeu, para localizar a execução no histórico do Power Automate) e erro sanitizado. Para `resultado_indeterminado`, após conferência externa:

- **Confirmar conclusão do conector**: a execução comprova que a ação terminou; a linha vira `acao_conector_concluida`.
- **Autorizar nova tentativa**: há evidência de que nada foi enviado; a linha volta à fila e o worker revalida tudo antes de enviar (pode descartá-la).

Exige justificativa (10 a 1000 caracteres) e referência da execução/evidência. Registra administrador, data do servidor e valores anteriores/novos (`reversa_comunicacoes_reconciliacoes`, sem update). O histórico de tentativas é preservado. Uma comunicação já concluída não pode ser reenviada; duas ações simultâneas são serializadas (a segunda recebe erro). Não existe "reenviar tudo".

## Autenticação do fluxo

- Credenciais ficam **somente no servidor** (segredos da Edge Function). Nada no navegador, no repositório ou no chat.
- Configure o gatilho "Quando uma solicitação HTTP for recebida" para exigir **Microsoft Entra OAuth** e restrinja ao principal (aplicativo) do worker (tenant ID, client ID e object ID do principal a alinhar com o administrador). O escopo de token usado pelo worker é o configurado em `POWER_AUTOMATE_SCOPE`.
- **Não habilite "Qualquer pessoa" (Anyone)**, nem como fallback temporário. Se o tenant não permitir OAuth no gatilho, mantenha `ETIQUETA_TRANSPORTE=simulado` até haver um gateway autenticado aprovado.
- Não presuma que o tenant está configurado: o registro do aplicativo, o consentimento, a conta/conexão de Outlook e do bot de Teams e a licença do conector precisam existir antes de qualquer teste real.

## Preparar uma cópia do fluxo

O ZIP `Mensagempararesponsável_20261026153209.zip` é só referência: preserve o fluxo original de feedback e trabalhe numa **cópia**.

### Não use o pacote ZIP antigo de "etiqueta disponível"

O pacote `Reverso-Etiqueta-PowerAutomate.zip` (preparado quando só existia o aviso de etiqueta) foi **comparado** com o contrato atual e **não é compatível**:

| Ponto | Pacote antigo | Contrato atual (worker + template) |
| --- | --- | --- |
| Evento aceito | só `etiqueta_reversa_disponivel` (`enum` no gatilho) | oito eventos, entre eles `etiqueta_disponivel` (**nome diferente**): o gatilho antigo recusaria **todos** |
| `codigo_rastreio` | obrigatório, tipo texto | pode ser `null` (PDF sem rastreamento) |
| Mensagem | montada no fluxo a partir dos campos, só para a etiqueta | vem pronta em `mensagem.assunto` / `mensagem.corpo_html` |
| Rótulo do link | só "Abrir pedido e baixar etiqueta" | um rótulo por evento |
| Rejeições | sem `invalid_event`/`invalid_link`/`invalid_content` | respostas 400 explícitas, tratadas como erro permanente pelo worker |
| Estado | desabilitado (`Liberar_somente_apos_configurar_OAuth`, condição sempre falsa) | sem trava embutida: a trava é a configuração do transporte |

Use o template deste repositório. A compatibilidade do template com o que o worker envia é verificada por `src/test/contratoFluxoPowerAutomate.test.ts` (todos os eventos × canais, inclusive sem rastreamento e sem validade). Nada disso foi importado no Power Automate real.

1. Na cópia, remova o gatilho SharePoint, as ações de permissões do SharePoint e os campos/ações de feedback.
2. Importe/recrie a definição de [`fluxo-etiqueta-reversa-template.json`](./fluxo-etiqueta-reversa-template.json): gatilho HTTP com esquema tolerante, variável `AppBaseUrl`, verificação de versão/evento, verificação de link e de conteúdo, `Switch` por canal. **Antes de usar, troque o valor de `AppBaseUrl`** (placeholder `https://SUBSTITUA-PELA-ORIGEM-DO-APLICATIVO.invalid`) pela mesma origem de `APP_BASE_URL`; com o placeholder, todo link é recusado (`invalid_link`).
3. `email` → Outlook (`SendEmailV2`; `To`, assunto e corpo vêm do contrato; importância alta nas tarefas). `teams` → chat do Teams ao e-mail do destinatário. Canal desconhecido → HTTP 400 `invalid_channel`, sem conector.
4. Em cada ação de conector, `retryPolicy` fica **dentro de `inputs`** com `type: none`. Resposta de sucesso só depois de `Succeeded`; em `Failed`/`TimedOut`, HTTP 502 `connector_action_failed` com `retryable: false` (o worker trata como indeterminado).
5. Não anexe o PDF e não substitua a rota estável por URL assinada. Proteja entradas/saídas e o histórico de execução do fluxo (contêm e-mail e dados do pedido).

## Worker, variáveis e agendamento

Edge Function `comunicacao-etiqueta` (`verify_jwt = true`; somente JWT `service_role`; corpo ignorado). Variáveis, só no servidor/cofre: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ETIQUETA_TRANSPORTE`, `POWER_AUTOMATE_FLOW_URL` (HTTPS), `POWER_AUTOMATE_TENANT_ID`, `POWER_AUTOMATE_CLIENT_ID`, `POWER_AUTOMATE_CLIENT_SECRET`, `POWER_AUTOMATE_SCOPE`, `APP_BASE_URL` (HTTPS, sem caminho/credenciais).

**Transporte simulado** (qualquer variável ausente, URL não-HTTPS, origem inválida ou `ETIQUETA_TRANSPORTE` diferente de `power_automate`): a função só **conta** pendências. Não reserva, não abre tentativa, não chama a rede e não marca nada como enviado.

Agendamento: ver [`../agendamento-worker-comunicacao.md`](../agendamento-worker-comunicacao.md). Não há agendamento instalado por migration nem pelo pacote do SQL Editor.

## Antes de ativar (nada disto foi feito)

1. Registro do aplicativo e principal permitido no Entra; OAuth no gatilho; conexões Outlook e Teams; cópia do fluxo com `AppBaseUrl` ajustado.
2. Segredos e variáveis da Edge Function; publicação da função e das migrations em **homologação**.
3. Homologação com usuários fictícios (roteiro em [`../homologacao-logistica-reversa.md`](../homologacao-logistica-reversa.md)), conferindo cada canal no histórico de execuções e o estado separado de cada linha.
4. Só então habilitar o agendamento e `ETIQUETA_TRANSPORTE=power_automate`.

Decisão pendente: o aviso `etiqueta_disponivel` também sai por Teams ao solicitante (comportamento herdado da primeira entrega); o requisito atual só pede e-mail. Confirmar se o Teams ao solicitante é desejado. E-mail aos aprovadores continua fora desta entrega: eles recebem Teams.
