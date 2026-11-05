# Envio de e-mail por SMTP

Este guia cobre somente o SMTP direto dos **convites e da definição/recuperação de senha**, enviados pela Edge Function `admin-usuarios`. As **notificações dos pedidos** (Outlook e Teams) **não** usam SMTP: seguem pelo Power Automate, com worker e controle próprios ([`power-automate/CONTRATO_INTEGRACAO.md`](./power-automate/CONTRATO_INTEGRACAO.md)). O navegador nunca recebe credenciais nem abre conexão SMTP.

O runtime Edge do Supabase usa Deno 2, com suporte a TCP. O Nodemailer 10 é importado como pacote npm e documenta SMTP/STARTTLS em Deno 2. O transporte exige STARTTLS, valida a cadeia do certificado e não permite continuação sem criptografia. A conectividade de saída do projeto Supabase para `smtp.office365.com:587` ainda precisa ser verificada no ambiente hospedado; a compatibilidade do runtime, sozinha, não prova essa rota de rede.

## Configuração do backend

Defina os valores abaixo como secrets/variáveis de ambiente das Edge Functions. `SMTP_PASS` deve vir exclusivamente do armazenamento seguro.

```ini
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=nao-responda@azime.com.br
SMTP_FROM=Chamados Azime <nao-responda@azime.com.br>
SMTP_PASS=<secret armazenado com segurança>
APP_BASE_URL=http://localhost:5173
CONVITE_TRANSPORTE=simulado
```

`CONVITE_TRANSPORTE` (convites, SMTP) e `ETIQUETA_TRANSPORTE` (notificações dos pedidos, Power Automate) são controles independentes: as notificações não dependem dele nem das variáveis `SMTP_*`. Só troque `CONVITE_TRANSPORTE` para `smtp` depois de conferir egress, autenticação e remetente no tenant. `APP_BASE_URL` em produção precisa usar HTTPS e estar entre os redirects permitidos pelo Auth. Não coloque nenhum desses valores em `VITE_*`. O agendamento do worker de notificações também não faz parte desta configuração.

## Verificações do Microsoft 365

Antes de habilitar o transporte, confirme no tenant que SMTP AUTH está permitido globalmente e para `nao-responda@azime.com.br`, e que a política de autenticação aceita o método configurado. Este código usa autenticação SMTP com usuário e senha; se o tenant exigir OAuth, não habilite Basic Auth nem altere Security Defaults como contorno: a integração precisa ser configurada para OAuth SMTP antes do teste.

Como o usuário autenticado (`nao-responda@azime.com.br`) difere do remetente (`chamados@azime.com.br`), a caixa autenticada precisa de permissão **Send As** para o endereço de remetente. O código não substitui o remetente se o servidor recusar essa autorização.

## Resultados e operação

- `smtp_aceito`: o servidor respondeu com aceitação final do destinatário. Não confirma entrega na caixa nem leitura.
- `falhou`: falha de conexão/protocolo ou rejeição temporária antes de o servidor aceitar a mensagem; a política de tentativa existente pode tentar novamente.
- `rejeitado` / `erro_permanente`: autenticação ou destinatário/remetente/mensagem foram recusados; corrigir configuração antes de novo envio.
- `resultado_indeterminado`: a conexão caiu ou expirou depois do início de `DATA`, ou o aceite não pôde ser confirmado. O sistema não faz reenvio automático cego. Confira os registros SMTP e reconcilie explicitamente.

Os registros históricos de notificações enviadas por SMTP (`smtp_aceito`) e os do conector permanecem como estão; o worker de notificações (Power Automate) não os reprocessa.

Não valide a configuração enviando ao ativar secrets. O primeiro envio real deve ser manual, único e dirigido a uma caixa corporativa controlada, depois das verificações acima.
