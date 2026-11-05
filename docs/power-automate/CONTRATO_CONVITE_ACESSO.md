# Contrato: fluxo "Reverso — Convite de acesso" (Power Automate)

Documento para quem vai criar e configurar o fluxo no Power Automate. Descreve **exatamente** o que o backend envia e o que espera de volta. Nomes de campos e variáveis são os do código (`supabase/functions/admin-usuarios/convite.ts` e `index.ts`). O template importável é [`fluxo-convite-acesso-template.json`](./fluxo-convite-acesso-template.json). O guia operacional (Supabase, publicação, limitações) é [`../convite-de-acesso.md`](../convite-de-acesso.md).

> **Estado:** implementado e testado só com serviços simulados. **Nenhum convite real foi enviado.** Não está validado contra Power Automate, Outlook, Entra nem Supabase Auth reais.

**Este fluxo é separado** do fluxo das notificações de pedidos (`fluxo-etiqueta-reversa-template.json`). Crie um fluxo novo, com **gatilho e URL próprios**. Não reutilize nem altere o fluxo das notificações.

## 1. O que o fluxo faz

1. O administrador cadastra nome, e-mail corporativo e permissões no Reverso.
2. O backend grava a conta (sem senha) e as permissões, gera o convite no Supabase Auth e chama **este fluxo** com o destinatário e o link.
3. O fluxo valida o contrato e envia **uma mensagem fixa** pelo Outlook ao destinatário.
4. A pessoa abre o link, define a **própria senha do Reverso** (independente da senha Microsoft) e depois entra com e-mail e senha.

O fluxo **não** conhece senhas, **não** gera links, **não** consulta o Supabase e **não** decide nada além de validar e enviar.

## 2. Chamada

| Item | Valor |
| --- | --- |
| Método | `POST` |
| URL | valor do segredo `CONVITE_POWER_AUTOMATE_FLOW_URL` (HTTPS obrigatório) |
| Cabeçalhos | `Authorization: Bearer <token>` e `Content-Type: application/json`. Nenhum outro |
| Corpo | JSON da seção 4. **Uma chamada = um convite = um destinatário** |
| Limite de tempo | 25 s para a resposta do fluxo (15 s para obter o token) |
| Retry de transporte | **nenhum**. O backend não repete a chamada (seção 9) |

## 3. Autenticação (OAuth)

O backend obtém o token por **client credentials** no Microsoft Entra: `POST https://login.microsoftonline.com/{POWER_AUTOMATE_TENANT_ID}/oauth2/v2.0/token` com `grant_type=client_credentials`, `client_id`, `client_secret` e `scope = POWER_AUTOMATE_SCOPE`. Usa o **mesmo aplicativo do Entra** já registrado para o fluxo das notificações (mesmas variáveis `POWER_AUTOMATE_*`). O que muda é a URL do gatilho.

Lado do fluxo:

- O gatilho HTTP deve **exigir autenticação Microsoft Entra** e aceitar **somente o principal de serviço do backend** (aplicativo registrado, identificado pela claim `oid`). **Não use "Qualquer pessoa" (Anyone)**, nem temporariamente.
- O *audience* aceito e o escopo dependem do tenant (confirmação final no primeiro token real; `MisMatchingOAuthClaims` indica audience ou `oid` diferentes). Referência usada nos testes: `https://service.flow.microsoft.com//.default`, **não validada**.
- A URL do gatilho contém assinatura (`sig=`): **trate a URL inteira como segredo**, mesmo com OAuth.
- Se o tenant não aceitar token de aplicativo no gatilho, **pare**: mantenha os convites desabilitados (seção 12) e decida com o administrador por um canal autenticado. Não afrouxe a autenticação para "fazer funcionar".

Token ausente ou inválido: o gatilho responde `401`/`403`. O backend trata como **falha segura** ("falhou": nada foi enviado; o administrador pode tentar de novo).

## 4. Payload (versão 1)

Todos os campos são **texto simples**. **Todos os campos abaixo são obrigatórios** e não há campos extras. O backend nunca envia nome, permissões, senha, ID do usuário ou dados de pedidos.

| Campo | Tipo | Conteúdo |
| --- | --- | --- |
| `versao` | inteiro | sempre `1` |
| `evento` | texto | sempre `convite_acesso` |
| `idempotency_key` | texto não vazio (UUID) | identificador desta tentativa de envio (seção 8) |
| `canal` | texto | sempre `email` |
| `destinatario.email` | texto | e-mail corporativo, minúsculo, **sempre do domínio exato `azime.com.br`** |
| `acao.url` | texto (URL) | link da página do Reverso para definir a senha (seção 6) |

### Exemplo (fictício, **sem token real**)

```json
{
  "versao": 1,
  "evento": "convite_acesso",
  "idempotency_key": "00000000-0000-4000-8000-000000000123",
  "canal": "email",
  "destinatario": { "email": "maria.silva@azime.com.br" },
  "acao": {
    "url": "https://reverso.example.test/definir-senha?token_hash=EXEMPLO-FICTICIO-NAO-E-UM-TOKEN&type=invite"
  }
}
```

## 5. Destinatário, assunto e conteúdo (fixos)

- **Destinatário:** `destinatario.email`, em `Para`. Nenhum CC/CCO.
- **Assunto (fixo):** `Convite de acesso ao Reverso`
- **Corpo (HTML, fixo):** o texto do template. Só o `href` do botão vem do payload (`acao.url`, com `&` convertido em `&amp;`). **Nenhum dado do payload além do link entra no corpo.** Resumo do conteúdo: convite para acessar o Reverso; defina a sua senha do Reverso (só deste sistema, não substitui a senha Microsoft); link **pessoal, de uso único e de validade limitada**, não encaminhar; ignore se não esperava; depois, entre com o e-mail corporativo e a senha criada.
- Importância normal. Remetente: a conta da conexão do Outlook.
- **Não** acrescente anexos, imagens remotas, rastreadores, prévias nem texto com o link em cópia.

## 6. Link (`acao.url`)

Formato exato (os parâmetros saem sempre **nesta ordem**, `token_hash` primeiro e `type` por último):

```text
{APP_BASE_URL}/definir-senha?token_hash={TOKEN}&type=invite
{APP_BASE_URL}/definir-senha?token_hash={TOKEN}&type=recovery
```

- `type=invite`: convite novo (ou reenvio de convite ainda não aberto).
- `type=recovery`: a pessoa **já abriu o convite e não definiu a senha** (a conta ficou confirmada sem senha e o link original não vale mais). O administrador reenvia pela tela de usuários e o backend gera um link de recuperação do Supabase (`generateLink`, `recovery`) **só para conta sem senha**; conta com senha nunca recebe. O **mesmo fluxo, o mesmo evento (`convite_acesso`), o mesmo e-mail fixo** e as mesmas respostas servem aos dois tipos: o fluxo não distingue o tipo além de aceitar os dois.
- `{APP_BASE_URL}`: origem do aplicativo (HTTPS; `http://localhost:5173` só em desenvolvimento), **sem barra final, caminho, credenciais, consulta ou fragmento**. Vem do segredo `APP_BASE_URL` do backend; **nunca** do navegador.
- Rota permitida: **somente** `/definir-senha`. Parâmetros: **somente** `token_hash` (caracteres `A-Z a-z 0-9 _ -`, 16 a 200) e `type` (`invite` ou `recovery`). Não há outro parâmetro, nem `?` ou `&` adicionais.
- **É uma página intermediária do aplicativo, não o link direto do Supabase** (`https://<projeto>.supabase.co/auth/v1/verify?...`). O link direto é consumido por qualquer requisição `GET`, inclusive a de scanners de e-mail (Safe Links, antivírus), o que invalidaria o convite antes de a pessoa abri-lo. A página do aplicativo **não consome** o convite ao ser aberta: ele só é verificado quando a pessoa envia a nova senha. **O fluxo nunca deve converter, reescrever, encurtar, abrir nem "pré-verificar" o link**, e nunca deve usar o link direto do Supabase.
- O fluxo **recusa** (`invalid_link`) qualquer `acao.url` que não comece por `AppBaseUrl + '/definir-senha?token_hash='`, que **não termine** em `&type=invite` ou `&type=recovery`, que tenha mais de um `?` ou mais de um `&` (parâmetro extra), ou que contenha `javascript:`, aspas ou `<`. A variável `AppBaseUrl` do template deve ser **idêntica** a `APP_BASE_URL` (sem barra final). O fluxo **não** tenta validar o conjunto de caracteres do token (o Power Automate não tem expressão regular): essa barreira é do backend, que só monta o link com `token_hash` de `A-Z a-z 0-9 _ -`.
- **Literal que começa com `@`:** na definição do fluxo, texto que começa com `@` é interpretado como expressão. O literal `@azime.com.br` (comparação de domínio) precisa estar escrito como `@@azime.com.br` na definição (o template já está assim). Pelo designer, digite o texto normalmente e confira, ao exportar, que ficou `@@azime.com.br`.
- O link é uma **credencial**: não grave, não registre, não copie para planilhas, listas, e-mails de log, Teams, nem para outro sistema. Veja a seção 11.

## 7. Respostas exatas

O backend só considera sucesso com **HTTP 2xx + corpo JSON válido + `communication_id` igual ao `idempotency_key` + `canal` igual a `email`**. HTTP aceito sozinho não é sucesso. O corpo vai sempre em JSON.

| Situação no fluxo | HTTP | Corpo (JSON) | Resultado no backend |
| --- | --- | --- | --- |
| Ação do Outlook **terminou com sucesso** (`Succeeded`) | `200` | `{"status":"connector_action_succeeded","communication_id":"<idempotency_key>","canal":"email"}` | `enviado` |
| Falha ou incerteza do Outlook (**é o que o template devolve**) | `502` | `{"status":"connector_action_failed","communication_id":"<idempotency_key>","canal":"email","retryable":false}` | `resultado_indeterminado` |
| Falha com **certeza** de que nada foi aceito pelo conector | `4xx`/`5xx` | `{"status":"connector_action_failed","communication_id":"<idempotency_key>","canal":"email","retryable":true}` | `falhou` |
| Contrato recusado antes de qualquer conector | `400` | `{"status":"<código>","communication_id":"<idempotency_key>","canal":"email","retryable":false,"error_code":"<código>"}` com `<código>` ∈ `invalid_event`, `invalid_channel`, `invalid_recipient`, `invalid_link` | `rejeitado` |
| Token ausente/inválido (rejeitado pelo gatilho) | `401`/`403` | qualquer | `falhou` |
| Qualquer outra coisa (200/202 sem corpo esperado, corpo sem chave correspondente, 400 de validação de esquema do próprio gatilho, 429, 5xx sem corpo, timeout, rede) | qualquer | qualquer | `resultado_indeterminado` |

Pontos que importam:

- Responda `connector_action_succeeded` **somente depois** de `Succeeded` na ação do Outlook. Responder antes gera sucesso falso.
- `connector_action_succeeded` significa "o Outlook aceitou a ação". **Não prova entrega nem leitura.** O sistema não promete isso ao administrador.
- Em dúvida, **não** declare `retryable: true`. O template nunca o faz.
- Nas recusas `invalid_event` e `invalid_channel`, `canal` no corpo ecoa o valor recebido (o backend só confere `communication_id`).
- `invalid_*` com `communication_id` diferente do enviado, ou com status diferente de `400`, não é reconhecido como rejeição (vira `resultado_indeterminado`).

### Ordem das validações no fluxo

`versao == 1` e `evento == 'convite_acesso'` → `canal == 'email'` → e-mail com uma única `@` e terminando em `@azime.com.br` (comparado em minúsculas; segunda barreira, além da do backend) → link (seção 6) → envio. Cada recusa devolve `400` com o código da seção 7, **antes** de qualquer conector.

**As validações do fluxo nunca podem ser mais estritas do que o backend a ponto de recusar payload válido.** O backend só envia: e-mail em minúsculas, parte local `a-z 0-9 . _ + -` (1 a 64 caracteres, sem `..`, começando e terminando em letra ou número), domínio `azime.com.br`; link nos dois formatos da seção 6, com `token_hash` de 16 a 200 caracteres `A-Z a-z 0-9 _ -`; `idempotency_key` UUID não vazio; `versao` 1; `evento` `convite_acesso`; `canal` `email`. O schema do gatilho exige `idempotency_key` e `minLength: 1`; não valide o formato UUID nem o comprimento do token, pois isso não traz ganho e pode recusar convite válido.

## 8. Correlação

`idempotency_key` = `communication_id` = identificador da **tentativa** de envio (UUID gerado pelo banco a cada tentativa). Use-o para localizar a execução no histórico do fluxo. **O fluxo não faz deduplicação própria**: se receber a mesma chave duas vezes, envia duas vezes. Na prática o backend usa uma chave nova a cada tentativa.

## 9. Retry

- O backend **não tem retry automático** nos convites. Cada envio é uma ação explícita do administrador (salvar e enviar, ou "Reenviar convite").
- **Timeout ou resultado incerto nunca gera reenvio automático.** O estado fica `resultado_indeterminado` e um novo envio exige confirmação explícita do administrador (que deve antes conferir o histórico do fluxo).
- No fluxo, **desative o retry do conector** (`retryPolicy.type = none` dentro de `inputs`, como no template).
- Cada reenvio gera um **link novo**; o Supabase invalida o anterior.

## 10. Segredos e variáveis lidos pelo código

Edge Function `admin-usuarios`. Nomes **exatos**:

| Variável | Natureza | Observação |
| --- | --- | --- |
| `CONVITE_TRANSPORTE` | configuração | `power_automate` liga o envio real **dos convites**. Qualquer outro valor, ausente ou vazio = desabilitado (padrão) |
| `CONVITE_POWER_AUTOMATE_FLOW_URL` | **segredo** (contém assinatura) | URL HTTPS do gatilho **deste** fluxo |
| `POWER_AUTOMATE_TENANT_ID` | configuração | compartilhada com o fluxo das notificações |
| `POWER_AUTOMATE_CLIENT_ID` | configuração | compartilhada |
| `POWER_AUTOMATE_CLIENT_SECRET` | **segredo** | compartilhada |
| `POWER_AUTOMATE_SCOPE` | configuração | audience do gatilho; definido pelo administrador Microsoft |
| `APP_BASE_URL` | pública | origem do aplicativo (seção 6); compartilhada |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | fornecidas pelo Supabase | `SERVICE_ROLE` só no backend |

`ETIQUETA_TRANSPORTE` e `POWER_AUTOMATE_FLOW_URL` são **do fluxo das notificações** e **não** são lidos pelos convites. Nada disto vai para `VITE_*`, para o navegador, para o repositório, para exemplos nem para o chat. Se **qualquer** variável da tabela (exceto as fornecidas pelo Supabase) faltar, ou `APP_BASE_URL`/`CONVITE_POWER_AUTOMATE_FLOW_URL` for inválida, os convites ficam desabilitados: o cadastro é salvo (estado `preparado`) e **nada é gerado nem enviado**.

## 11. Proteger o histórico de execuções

O link do convite é uma credencial. No fluxo:

1. **Gatilho:** habilite *Secure outputs* (o template já traz `runtimeConfiguration.secureData.properties = ["outputs"]`).
2. **Ação "Enviar e-mail (V2)":** habilite *Secure inputs* e *Secure outputs* (o template traz `["inputs","outputs"]`). Confira na interface, em *Configurações* de cada ação, que ambos aparecem ligados após a importação.
3. **Não** adicione ações de *Compose*, *Initialize/Set variable*, *Append to string* ou *Aprovação* que carreguem `acao.url`, e **não** copie o corpo do gatilho para nenhum lugar. (A variável `AppBaseUrl` guarda apenas a origem.) As **condições de validação do template** (`Verificar_link` etc.) leem `acao.url`; a proteção delas depende de o *Secure outputs* do gatilho esconder, automaticamente, as entradas das ações que usam esses valores. **Isso precisa ser conferido** (item 7), não presumido.
4. Restrinja quem pode ver o histórico do fluxo e as conexões; remova o compartilhamento amplo.
5. **Não** ative registro/telemetria que grave o corpo das requisições (Application Insights, Log Analytics) neste fluxo.
6. Não reenvie nem "resubmeta" execuções antigas pelo histórico: isso reenvia o mesmo link.
7. **Conferência obrigatória no histórico:** depois do primeiro teste com conta fictícia, abra a execução e confira **ação por ação** (gatilho, `Verificar_evento`, `Verificar_canal`, `Verificar_destinatario`, `Verificar_link`, `Enviar e-mail (V2)`, as respostas) que nenhuma entrada ou saída mostra o link, o `token_hash` nem o e-mail. Se alguma condição mostrar o link, **não** habilite os convites reais: troque a condição de link por uma ação *Compose* com *Secure inputs* e *Secure outputs* ligados que calcule o booleano e faça a condição ler só esse booleano, e repita o teste.

## 12. Habilitar e desabilitar somente os convites

Independente das notificações de pedidos, do agendamento do worker e do cadastro de usuários.

- **Habilitar** (só depois de homologar com conta fictícia): cadastrar `CONVITE_POWER_AUTOMATE_FLOW_URL` e `CONVITE_TRANSPORTE=power_automate` (por exemplo, `supabase secrets set --env-file <arquivo fora do repositório>`; **não** deixe o valor no histórico do shell). Vale na próxima chamada, sem nova publicação da função.
- **Desabilitar:** trocar `CONVITE_TRANSPORTE` para `simulado` (ou removê-lo). A partir daí o botão "Salvar e enviar convite" salva o cadastro, **não** gera link e **não** chama o fluxo; a tela avisa que nada foi enviado. As notificações de pedidos **não** são afetadas.
- **Não** pause desativando o fluxo no Power Automate: um fluxo desligado não devolve o corpo que o backend exige e o resultado vira `resultado_indeterminado`.

## 13. O que o agente do Power Automate deve entregar

1. O fluxo "Reverso — Convite de acesso" criado a partir do template, com gatilho autenticado por Entra aceitando só o principal do backend, `AppBaseUrl` igual a `APP_BASE_URL`, conexão do Outlook de uma conta de serviço adequada, *secure inputs/outputs* ligados e retry do conector desligado.
2. A URL do gatilho entregue **somente** ao administrador do Supabase (como segredo), nunca em chat, arquivo ou histórico.
3. Um teste com **conta fictícia** (destinatário `@azime.com.br` de teste), sem convite real, seguindo o roteiro do guia operacional.

**Não** invente campos, respostas, textos de e-mail, outros eventos ou outros destinatários, e **não** altere o fluxo das notificações.

## 14. O que foi validado e o que não foi

Validado localmente (`src/test/conviteAcesso.test.ts`, `src/test/conviteFluxoTemplate.test.ts`, `supabase/tests/convite-acesso.test.mjs`): payload mínimo e exato; link da página do aplicativo com origem da configuração; classificação de todas as respostas da seção 7; ausência de retry automático; resultado incerto exigindo confirmação; link fora de logs e respostas; template com validações antes de qualquer conector, retry desligado e histórico protegido; as condições do template, avaliadas contra os payloads reais do backend (convite e definição de senha, e-mails e tokens válidos) e contra payloads que ele nunca produz.

O pacote `Reverso-Convite-de-acesso-2026-10-28_20261028174026.zip` foi comparado com o contrato e o template. A definição tem `AppBaseUrl = http://localhost:5173`, e o schema do gatilho aceita `idempotency_key` vazia. A autenticação está restrita a um object ID, cuja correspondência com o service principal do backend ainda precisa ser confirmada. A validação de destinatário exportada aceita todos os endereços produzidos pelo backend. Não houve execução real do fluxo.

**Não validado:** Power Automate, Outlook, Entra (audience/`oid`), Supabase Auth real, o limite de tempo de 25 s no plano da função, e a proteção efetiva de entradas/saídas no histórico (confira na interface).

## 15. Conferência do fluxo salvo contra este contrato

O fluxo "Reverso — Convite de acesso" foi montado por uma transcrição deste contrato. Antes de ligá-lo, **exporte a definição atual** (fluxo → *Exportar* → *Pacote (.zip)*, ou *Soluções* → exportar; o arquivo útil é `definition.json` dentro de `Microsoft.Flow/flows/<id>/`) e compare, ponto a ponto, com o template e com as seções acima. **Não** ajuste este contrato para aceitar o que foi montado: o que divergir é corrigido no fluxo, salvo decisão registrada.

| # | O que conferir na definição exportada | Esperado |
| --- | --- | --- |
| 1 | Gatilho | `Request`/`Http`; esquema com os **seis** campos obrigatórios (`versao`, `evento`, `idempotency_key`, `canal`, `destinatario.email`, `acao.url`) e nenhum outro obrigatório; `idempotency_key` é string com `minLength: 1`; autenticação Entra restrita ao principal de serviço do backend (object ID do service principal em `triggerAllowedUsers`; não "Anyone"); `secureData` com `outputs` |
| 2 | Versão e evento | `versao` **igual a 1 como número** (não o texto `"1"`); `evento` igual a `convite_acesso` |
| 3 | Canal | `canal` igual a `email` |
| 4 | Destinatário | uma única `@` e `endsWith` de `@azime.com.br` **em minúsculas** (literal `@@azime.com.br` na definição). **Sem** filtro de caracteres que recuse `.` `_` `+` `-` ou dígitos na parte local, e sem exigir letra maiúscula/minúscula |
| 5 | Link | começa por `AppBaseUrl` + `/definir-senha?token_hash=`; termina em `&type=invite` **ou** `&type=recovery` (os dois); um `?` e um `&`; sem `javascript:`, aspas, `<`. `AppBaseUrl` idêntica a `APP_BASE_URL`, sem barra final. **Sem** regra de tamanho do token e **sem** exigir só `type=invite` |
| 6 | `idempotency_key` | string obrigatória e não vazia (`minLength: 1`); usada sem alteração como `communication_id` de todas as respostas; não validar formato UUID nem alterar caixa |
| 7 | Respostas | `200` `connector_action_succeeded` **somente** com `runAfter` = `Succeeded` do Outlook; `502` `connector_action_failed` com `retryable:false` para `Failed`/`TimedOut`; `400` com `invalid_event`, `invalid_channel`, `invalid_recipient`, `invalid_link`; todas com `communication_id`; respostas de sucesso/falha do conector e recusas de destinatário/link usam `canal=email`, enquanto recusas de evento/canal ecoam o `canal` recebido; nenhuma resposta `retryable:true` |
| 8 | Envio | um único conector, Outlook `SendEmailV2`; `To` = só `destinatario.email`; sem CC/CCO/anexo; assunto fixo `Convite de acesso ao Reverso`; corpo fixo com o link só no `href` (`&` → `&amp;`); `retryPolicy` `none` dentro de `inputs` |
| 9 | Proteção do histórico | `secureData` (`inputs` e `outputs`) no Outlook; sem Compose/variáveis/anexos que carreguem o link; e a **conferência da seção 11, item 7, na primeira execução de teste** |
| 10 | Estado | fluxo **desligado** até a homologação com conta fictícia; URL do gatilho só no segredo `CONVITE_POWER_AUTOMATE_FLOW_URL` |

Registre cada diferença encontrada (item, valor exportado, valor esperado) e a decisão. Diferenças que **recusam payload válido do backend** (itens 2, 4, 5, 6) e diferenças que **declaram sucesso antes do Outlook** (item 7) são defeitos do fluxo.
