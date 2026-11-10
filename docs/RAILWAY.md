# Publicação no Railway

Guia de publicação do frontend (React + Vite) no Railway. Mantém o que já funciona no Supabase e documenta a ordem de publicação, as variáveis e as verificações.

> Estado deste documento: **preparação local**. Nada foi publicado, nenhum domínio foi gerado e nenhuma configuração remota foi aplicada. Os campos entre `<...>` são preenchidos depois, com os valores reais do Railway e do Supabase.

## 1. Arquitetura de hospedagem

| Componente | Onde fica | Observação |
|---|---|---|
| Frontend (SPA React + Vite) | **Railway**, serviço único | Build no `Dockerfile`; servido por Nginx na porta `PORT`. |
| Banco, autenticação, Storage (bucket privado de etiquetas) | **Supabase** (projeto deste sistema) | Continua fora do Railway. RLS e buckets privados não mudam. |
| Edge Functions `admin-usuarios`, `comunicacao-etiqueta`, `correios-rastreio` | **Supabase** | Publicadas com a CLI do Supabase, separadamente do frontend. |
| Envio de convites e senhas | SMTP (variáveis `SMTP_*` na função `admin-usuarios`) | Provedor SMTP fora do Railway. |
| Notificações de pedidos (Outlook e Teams) | **Power Automate** | Fluxo fora do Railway; URL fica como segredo da função `comunicacao-etiqueta`. |
| Rastreio dos Correios | API externa via função `correios-rastreio` | Fora do Railway. |

O Railway hospeda **apenas** o frontend. Não há banco, Redis, volume ou serviço adicional. O frontend não guarda arquivos de usuário: anexos e etiquetas ficam no Supabase Storage, então o disco do container é descartável.

## 2. Configuração adotada

- **Origem do código:** GitHub `gestao-sistema/Fluxo-reverso` (remote `fluxo-reverso`, upstream da branch local de preparação). O remote `origin` aponta para `gestao-sistema/forms_codigo_reverso`; esta branch não acompanha esse remote.
- **Branch de publicação:** `main` em `gestao-sistema/Fluxo-reverso`. A branch local `fluxo-reverso-main` acompanha `fluxo-reverso/main`.
- **Diretório raiz:** `/` (raiz do repositório; não é monorepo).
- **Builder:** `Dockerfile` na raiz. O Railway detecta o Dockerfile e o usa para buildar o serviço.
- **Runtime de build:** `node:22-alpine` (o `engines` do `package.json` exige Node 20.19+ ou 22.12+).
- **Runtime de execução:** `nginx:alpine`, sem Node em produção.
- **Instalação:** `npm ci` (dentro do Dockerfile, usa `package-lock.json`).
- **Build:** `npm run build`, que executa `node scripts/verificar-ambiente-producao.mjs && tsc -b && vite build`.
- **Start:** comando padrão do container: Nginx em primeiro plano, com `__PORT__` trocado pelo valor de `PORT` (`/opt/nginx-template/default.conf.template`, gerado em `nginx.conf`). Não há `npm start` nem `vite preview`.
- **Health check:** `GET /healthz`, configurado no painel do serviço (ver seção 5).
- **Infraestrutura como código:** a documentação atual do Railway depreca Config as Code (`railway.json`/`railway.toml`) para serviços novos e prevê deixar de ler esses arquivos existentes em 2026-12-01. O mecanismo atual é Infrastructure as Code em `.railway/railway.ts`, aplicado por `railway config plan`. Foi avaliado e não incluído porque nenhum projeto, ambiente ou serviço Railway foi identificado nesta preparação; criar nomes de recursos por suposição poderia apontar para a infraestrutura errada. Nesta etapa, conecte o repositório e configure Dockerfile e health check no painel. Se a equipe escolher IaC, defina os recursos com as identidades reais e revise o plano antes de aplicar. Nenhuma configuração remota foi aplicada. [Documentação oficial de IaC do Railway](https://github.com/railwayapp/docs/blob/main/content/docs/infrastructure-as-code.md).

## 3. Variáveis

Nomes lidos pelo código. Valores reais ficam no painel e nunca no Git. O modelo está em `.env.example`.

### 3.1 Frontend (Railway, serviço do frontend)

| Variável | Finalidade | Obrigatória | Destino | Momento |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | URL da API do projeto Supabase deste sistema (https). | Sim | Bundle do navegador (público) | **Build** |
| `VITE_SUPABASE_ANON_KEY` | Chave pública (anon ou publishable). | Sim | Bundle do navegador (público) | **Build** |
| `PORT` | Porta do Nginx. Injetada pelo Railway; não definir manualmente. | Automática | Container | Execução |

Regras:

- No Dockerfile, as duas variáveis são declaradas como `ARG` no estágio de build. Sem isso o Railway não as entrega ao build. Qualquer alteração exige **novo deploy**, porque o valor é gravado no JavaScript.
- O build **falha** com mensagem clara se faltar uma delas ou se a chave for `service_role`/`sb_secret_`. Não há fallback para dados simulados em produção: o Vite substitui as importações de `src/demo` por `src/build/demo-disabled.ts` e remove os controles e dados de demonstração do bundle. O modo demo continua disponível no servidor de desenvolvimento (`import.meta.env.DEV`).
- Nenhuma variável com nome contendo `SERVICE`, `SECRET`, `PASSWORD`, `SENHA`, `DATABASE`, `PRIVAT` ou `TOKEN` pode ter prefixo `VITE_`. O validador recusa.

### 3.2 Supabase (Edge Functions: Secrets do projeto, não do Railway)

Nomes encontrados no código das funções. Nenhum deles vai ao Railway.

| Variável | Função que lê | Finalidade | Obrigatória | Momento |
|---|---|---|---|---|
| `SUPABASE_URL` | todas | URL do projeto (injetada pelo Supabase). | Sim | Execução |
| `SUPABASE_ANON_KEY` | `admin-usuarios`, `correios-rastreio` | Chave pública usada pela função. | Sim | Execução |
| `SUPABASE_SERVICE_ROLE_KEY` | `admin-usuarios`, `comunicacao-etiqueta`, `correios-rastreio` | **Segredo.** Só no servidor. | Sim | Execução |
| `APP_BASE_URL` | `admin-usuarios`, `comunicacao-etiqueta` | Origem do aplicativo para os links de convite e recuperação (`https://<dominio-railway>`). | Sim | Execução |
| `ALLOWED_ORIGINS` | `correios-rastreio` | Origens autorizadas a chamar a função (`https://<dominio-railway>`, separadas por vírgula). | Sim | Execução |
| `CONVITE_TRANSPORTE` | `admin-usuarios` | Transporte do e-mail de convite (`smtp`). | Sim | Execução |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | `admin-usuarios` | Envio SMTP de convites e senhas. `SMTP_PASS` é segredo. | Sim, se `CONVITE_TRANSPORTE=smtp` | Execução |
| `ETIQUETA_TRANSPORTE` | `comunicacao-etiqueta` | Transporte das notificações de pedidos (`power_automate`). | Sim | Execução |
| `POWER_AUTOMATE_FLOW_URL` | `comunicacao-etiqueta` | URL do fluxo do Power Automate. **Segredo.** | Sim | Execução |
| `POWER_AUTOMATE_TENANT_ID`, `POWER_AUTOMATE_CLIENT_ID`, `POWER_AUTOMATE_CLIENT_SECRET`, `POWER_AUTOMATE_SCOPE` | `comunicacao-etiqueta` | Credenciais OAuth do fluxo. `CLIENT_SECRET` é segredo. | Conforme o fluxo | Execução |

Não cadastrar `SUPABASE_SERVICE_ROLE_KEY` nem `SMTP_PASS` no frontend.

### 3.3 Fora do Railway e do Supabase

Não há chaves de provedor no frontend. Chaves de Power Automate, SMTP e Correios ficam somente nas funções.

## 4. Antes de publicar: pendências de segurança

1. **Rotacionar a chave `service_role` e a senha do banco.** Quatro commits no histórico do Git (`7ba5400`, `940055e`, `fa77d56`, `c416bda`) contêm um JWT com `role=service_role`. Os arquivos atuais estão limpos. A rotação é ação do responsável pelo projeto Supabase, e a chave antiga deve ser considerada comprometida. Reescrever o histórico não foi feito: é destrutivo e exige decisão do responsável pelo repositório.
2. Confirmar que o `.env` local continua fora do Git (`.gitignore` ignora `.env` e `.env.*`; `.env.example` é a exceção versionada).
3. Não colar `service_role` nem senha de banco em variáveis do Railway ou em arquivos do repositório.

## 5. Passo a passo de publicação

### 5.1 Conectar o repositório ao Railway (painel)

1. No Railway, criar o projeto ou abrir o existente.
2. Adicionar um serviço a partir do repositório GitHub `gestao-sistema/Fluxo-reverso` (remote `fluxo-reverso`).
3. Nas configurações do serviço, confirmar a branch de publicação `main` e a raiz `/`.
4. Confirmar que o builder é Dockerfile (caminho `Dockerfile`, na raiz). Os nomes exatos dos campos podem variar na interface atual; a regra é a da seção 2.
5. Cadastrar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em Variables do serviço (seção 3.1). Os valores vêm do painel do Supabase (*Project Settings → API*), usando **somente** a chave pública.
6. Configurar o health check path do serviço como `/healthz`.
7. Gerar o domínio público nas configurações de rede do serviço. O nome é atribuído pelo Railway e não é definido neste repositório.

Atenção: o Railway publica automaticamente quando um commit chega à branch conectada. Por isso, o commit de preparação só deve ser enviado ao `main` depois da ordem da seção 5.2 (banco e funções prontos). Até lá, a publicação fica pausada, e o serviço pode ser criado sem gerar domínio.

### 5.2 Ordem de publicação

1. **Diagnóstico somente leitura do banco.** O histórico aplicado em produção não foi consultado nesta preparação: não havia CLI do Supabase nem credencial de banco/admin disponível nesta sessão. Os arquivos locais não permitem afirmar quais migrations estão pendentes no banco. Antes da publicação, liste as migrations aplicadas (somente leitura, no SQL Editor do Supabase de produção):
   ```sql
   select version, name from supabase_migrations.schema_migrations order by version;
   ```
   Comparar com `supabase/migrations/`. Se o projeto não usa o histórico da CLI, conferir o estado com `supabase/VERIFICAR_PUBLICACAO_CONVITES.sql` e com `docs/migrations.md`. Não reaplicar migrations existentes.
   Migrations **ainda não versionadas** (criadas em 09/11/2026 e presentes só na árvore de trabalho): `20261109100000` a `20261109180000` (8 arquivos). Elas precisam estar no commit de publicação antes de qualquer aplicação.
2. **Edge Functions**, com a CLI do Supabase, no projeto deste sistema (`supabase link` antes):
   `supabase functions deploy admin-usuarios`, `comunicacao-etiqueta` e `correios-rastreio`.
   A pasta `supabase/functions/smtp-homologacao` está vazia e não é versionada; não há o que publicar nela.
3. **Secrets** das funções (seção 3.2). `APP_BASE_URL` e `ALLOWED_ORIGINS` podem ser preenchidos com o domínio após a etapa 5.
4. **Migrations pendentes** no SQL Editor, uma por vez, na ordem de versão, cada uma conferida após a execução.
5. **Frontend no Railway:** o deploy automático ocorre quando o commit chega à branch `main` (ou pelo botão de deploy do painel). No log do build deve aparecer a linha `Ambiente de produção verificado`, seguida do `vite build` concluído.
6. **Após obter o domínio:** atualizar `APP_BASE_URL` e `ALLOWED_ORIGINS` (seção 6) e fazer o cadastro das URLs no Supabase.
7. **Verificações** (seção 7).

Motivo da ordem: as funções passam a aceitar o novo modelo antes do banco e do frontend, e o frontend só é publicado quando o banco já responde ao que ele pede.

### 5.3 Dados que o Railway não cria

Nenhum banco, Redis, volume ou bucket é criado pelo Railway. Storage e banco continuam no Supabase.

## 6. Ajustes após obter o domínio real

Substituir `<dominio-railway>` pelo domínio real (`https://...`), sem barra final.

| Onde | Ajuste | Motivo |
|---|---|---|
| Supabase Edge Function `admin-usuarios` e `comunicacao-etiqueta` (Secrets) | `APP_BASE_URL=https://<dominio-railway>` | Os links de convite e de recuperação apontam para `/definir-senha` no domínio do app. |
| Supabase Edge Function `correios-rastreio` (Secrets) | `ALLOWED_ORIGINS=https://<dominio-railway>` | Autoriza a origem do frontend. Não usar `*`. |
| Supabase → Authentication → URL Configuration: **Site URL** | `https://<dominio-railway>` | Base dos e-mails padrão do Supabase. Confirmar que nenhum outro ambiente depende do valor atual antes de trocar. |
| Supabase → Authentication → URL Configuration: **Redirect URLs** | Adicionar `https://<dominio-railway>/**` (ou `.../definir-senha`). **Manter** as URLs de outros ambientes que ainda as usam. | O convite e a recuperação precisam estar na lista de redirecionamentos permitidos. |
| Supabase → Authentication → Providers / SMTP | Nenhuma alteração de provedor sem decisão | O envio de convite é feito pela função `admin-usuarios` (SMTP direto), não pelo e-mail nativo do Supabase. |
| Power Automate (fluxo de convite e de etiqueta) | Conferir que o link gerado aponta para o domínio novo | O fluxo recebe o link pronto da função. Não foi exportado nem comparado neste trabalho. |

Depois de alterar Secrets, confirmar a mudança com uma chamada de teste à função (sem enviar e-mail real). Não há redeploy de frontend para essas variáveis, porque elas não são embutidas no bundle.

## 7. Verificações após o deploy

Substituir `<dominio-railway>`.

**Automáticas (sem dados sensíveis):**

```bash
curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" https://<dominio-railway>/healthz     # 200 text/plain
curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" https://<dominio-railway>/             # 200 text/html
curl -sS -o /dev/null -w "%{http_code}\n" https://<dominio-railway>/admin/alinare               # 200 (fallback SPA)
curl -sS -o /dev/null -w "%{http_code}\n" https://<dominio-railway>/assets/inexistente.js       # 404 (não index.html)
curl -sS -o /dev/null -w "%{http_code}\n" https://<dominio-railway>/api/qualquer                # 404
curl -sSI https://<dominio-railway>/                                                              # Cache-Control: no-cache
```

Para um JS real com hash (ver `dist/assets/` do build): `Content-Type: application/javascript` e `Cache-Control: public, max-age=31536000, immutable`.

**Manuais (com contas reais, no navegador):**

- Abrir `/`, `/login` e uma rota interna (ex.: `/admin/alinare`) diretamente e pelo F5. Não aceitar a tela de login como prova de autenticação.
- Login com usuário real; conferir as telas do perfil.
- Convite: enviar convite a uma conta de teste, abrir o link recebido, definir senha e entrar. Não usar e-mail de pessoa real sem autorização.
- Recuperação: solicitar reenvio de senha pelo administrador e conferir `/definir-senha`.
- Console do navegador sem `service_role` e sem erro de configuração do Supabase.

**Limite do health check:** `/healthz` responde 200 quando o Nginx está no ar. **Não** comprova login, banco, Storage, Edge Functions, SMTP, Power Automate ou Correios. Essas verificações são as manuais acima.

## 8. Logs

- O log de acesso do Nginx registra método, caminho sem query string, status, tamanho e User-Agent. **Não** registra o `Referer` e não registra a query string, porque links de convite e recuperação trazem `token_hash`.
- Limite conhecido: mensagens de erro do próprio Nginx (`error_log`, nível `warn`) podem incluir o caminho da requisição. Se o caminho contiver token, tratar como incidente de log e rotacionar o link.
- Nenhum log do frontend imprime variável de ambiente.

## 9. Recuperação em caso de falha

| Situação | Ação |
|---|---|
| Build falha com "configuração obrigatória ausente" | Cadastrar `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` no serviço e fazer novo deploy. |
| Build falha em `tsc` ou `vite` | Ver o log; corrigir no repositório. Nunca desativar TypeScript para passar. |
| Container não fica saudável (`PORT inválida`) | Conferir se o Railway injetou `PORT` numérica. Não definir porta fixa. |
| Deploy novo com erro na tela | No painel do Railway, reimplantar o **deployment anterior** que estava saudável. |
| Edge Function com erro após mudança | Republicar a versão anterior da função a partir do commit anterior e reverter o Secret alterado. |
| Migration com erro | Parar. Não reexecutar em loop. Corrigir com nova migration incremental (não editar migration já aplicada). |
| Links de convite ou recuperação com domínio errado | Corrigir `APP_BASE_URL` (Secret) e reenviar o convite pelo administrador. |

Rollback do frontend não desfaz banco nem funções. Por isso, a ordem da seção 5.2 importa.

## 10. Validação local realizada (preparação)

As validações de build e teste abaixo foram feitas em um export limpo do commit `ec2d552`, com somente os arquivos versionados daquela preparação.

- `npm ci`: aprovado; instalação limpa pelo `package-lock.json` (259 pacotes).
- `npm run build`: aprovado com placeholders de teste para `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Inclui o validador de ambiente, `tsc -b` e `vite build`.
- `npm run lint`: exit 0, com seis avisos existentes em `src/lib/etiquetaPdf.ts`.
- `npm test`: **não passou integralmente**. Na execução completa mais recente, 13 testes falharam e 649 passaram (662 no total; 6 arquivos falharam). Comparação isolada: nove falhas determinísticas em `conviteFluxoTemplate.test.ts` (1), `deleteSolicitacao.test.ts` (5) e `perfil.test.ts` (3) também ocorriam no commit-base `6e49885`. Outras falhas em `ApprovalQueuePage`, `UsuariosPage`, `rotaDefinirSenha` e `UsuariosPageConvite` variaram entre rodadas completas (timeouts e expectativas de interação) e passaram quando isoladas. `verificacaoAmbienteProducao.test.ts` passou isolado. Portanto, a suíte continua bloqueada por falhas já presentes na base e por timeouts instáveis.
- `src/test/verificacaoAmbienteProducao.test.ts`: validou ausência de configuração, valores de teste válidos e recusa de chave secreta/service_role.
- Estado das migrations em produção: **não consultado**. A consulta somente leitura e a comparação com os arquivos locais continuam pendentes (seção 5.2).
- Imagem Docker, sintaxe do Nginx e execução do servidor de produção: **não validadas localmente**. Docker e Nginx não estão instalados, e o WSL presente não tem uma distribuição/subsistema Linux instalado. Não foi usado `vite preview` como substituto do servidor de produção.

Antes de publicar, valide a imagem Docker e o Nginx no Railway ou em um ambiente Docker disponível, depois rode os pedidos HTTP da seção 7. A resposta de health check local/de plataforma confirma apenas que o Nginx responde, não que login, banco ou integrações funcionem.
