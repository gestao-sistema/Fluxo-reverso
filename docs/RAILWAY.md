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
| `VITE_SUPABASE_URL` | URL da API do projeto Supabase (https). | Sim | Bundle do navegador (público) | **Build** |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave `sb_publishable` pública criada no Dashboard. | Sim, preferida | Bundle do navegador (público) | **Build** |
| `VITE_SUPABASE_ANON_KEY` | Nome antigo, aceito temporariamente durante a migração. | Fallback temporário | Bundle do navegador (público) | **Build** |
| `PORT` | Porta do Nginx. Injetada pelo Railway; não definir manualmente. | Automática | Container | Execução |

Regras:

- O Dockerfile declara os nomes de build como `ARG`; o Railway precisa disponibilizar a chave pública durante o build. Qualquer alteração exige novo build porque o valor público fica no JavaScript.
- O build falha se a URL ou a chave pública estiver ausente, ou se a chave tiver formato de `service_role`/`sb_secret_`. Nenhum segredo pode ter prefixo `VITE_`.
- O frontend prefere `VITE_SUPABASE_PUBLISHABLE_KEY`; o nome `VITE_SUPABASE_ANON_KEY` permanece só como fallback de transição. Remova o fallback após confirmar que todos os ambientes usam a chave nova.
- O Vite substitui imports de `src/demo` por `src/build/demo-disabled.ts` e remove controles/dados demo do bundle de produção. O modo demo de desenvolvimento permanece disponível.

### 3.2 Supabase (Edge Functions: Secrets do projeto, não do Railway)

As chaves pertencem ao projeto Supabase e nunca devem ser cadastradas no Railway. As novas chaves aparecem para Edge Functions nos mapas JSON fornecidos pelo Supabase; o código seleciona a entrada `default` (ou a única chave disponível). A compatibilidade com variáveis antigas é temporária.

| Variável | Funções que leem | Natureza | Uso |
|---|---|---|---|
| `SUPABASE_URL` | todas | pública | URL do projeto |
| `SUPABASE_PUBLISHABLE_KEYS` | `admin-usuarios`, `correios-rastreio` | pública | Mapa JSON das chaves `sb_publishable`; validação de sessão usa Auth |
| `SUPABASE_SECRET_KEYS` | `admin-usuarios`, `comunicacao-etiqueta`, `correios-rastreio` | **segredo** | Mapa JSON das chaves `sb_secret`; acesso privilegiado somente no servidor |
| `SUPABASE_ANON_KEY` | `admin-usuarios`, `correios-rastreio` | pública, antiga | Fallback temporário |
| `SUPABASE_SERVICE_ROLE_KEY` | as três funções | **segredo legado** | Fallback temporário até concluir a migração |
| `APP_BASE_URL`, `ALLOWED_ORIGINS` | conforme a função | configuração | Origem pública do app e origens CORS |
| `CONVITE_TRANSPORTE`, `SMTP_*` | `admin-usuarios` | configuração/segredo | Convites e recuperação por SMTP; `SMTP_PASS` é secreto |
| `ETIQUETA_TRANSPORTE`, `POWER_AUTOMATE_*` | `comunicacao-etiqueta` | configuração/segredo | Notificações; URL do fluxo e `CLIENT_SECRET` são secretos |

Os crons de Correios e comunicação mantêm a chave em segredos do Vault (`correios_cron_service_key` e `comunicacao_cron_service_key`, nomes históricos) e enviam a nova chave em `apikey`. Atualize os dois valores do Vault antes de desativar a chave antiga. Ver [setup_cron_rastreio.sql](../src/sql/setup_cron_rastreio.sql) e [habilitar-worker-comunicacao.sql](../supabase/agendamento/habilitar-worker-comunicacao.sql).

Não cadastrar `SUPABASE_SECRET_KEYS`, `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_PASS` ou chaves OAuth no frontend/Railway.

### 3.3 Fora do Railway e do Supabase

Não há chaves de provedor no frontend. Chaves de Power Automate, SMTP e Correios ficam somente nas funções.

## 4. Antes de publicar: exposição histórica e rotação

A varredura do histórico Git encontrou um JWT `service_role` em `src/sql/setup_cron_rastreio.sql` no commit `c416bda`. Não apareceu no bundle nem no código frontend atual. A busca anterior que atribuía o JWT a quatro commits estava incorreta: somente esse commit contém esse JWT. Uma credencial de conexão PostgreSQL também foi encontrada historicamente em `DEPLOY_RAILWAY.md` e `run-sql-rls.cjs`; os valores foram deliberadamente omitidos dos relatórios. Trate ambos como expostos. A senha atual não foi lida.

**Procedimento manual no Dashboard Supabase — faça a rotação somente depois de a versão local com compatibilidade nova estar publicada e os consumidores atualizados.** Mantenha as credenciais antigas ativas até terminar a sequência:

1. Em **Project Settings → API Keys**, crie uma chave `sb_publishable` e uma `sb_secret` novas. Guarde os valores somente no gerenciador seguro; não os envie por chat, arquivo do repositório ou histórico de shell.
2. Publique primeiro a versão do aplicativo e Edge Functions preparada para aceitar os mapas `SUPABASE_PUBLISHABLE_KEYS`/`SUPABASE_SECRET_KEYS` e as chaves novas. Confirme no Dashboard que as funções recebem esses mapas. O Railway só recebe a chave pública.
3. No Railway, configure `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_URL`; faça o build/deploy autorizado e valide login, chamadas do frontend e isolamento por empresa. Mantenha a variável antiga só enquanto houver rollback compatível.
4. Atualize o Vault dos dois crons para a nova `sb_secret`: `correios_cron_service_key` e `comunicacao_cron_service_key`. As chamadas devem usar o cabeçalho `apikey`. Atualize também Database Webhooks, automações, scripts e integrações externas que enviem a chave antiga; procure por `Authorization: Bearer` e substitua pelo formato `apikey` previsto para as novas chaves.
5. Confirme que `admin-usuarios`, `comunicacao-etiqueta`, `correios-rastreio`, SMTP e notificações funcionam em homologação; confira ausência de 401/403 e que nenhum consumidor depende das variáveis antigas. Não use destinatários nem operações reais para essa conferência.
6. Só então, em **Project Settings → API Keys**, desative as chaves antigas `anon` e `service_role`. Em seguida, use o fluxo de migração/rotação do **JWT Signing Keys** para revogar o segredo JWT legado comprometido, seguindo o período de validade de tokens indicado pelo Dashboard. A revogação pode invalidar tokens ainda assinados pela chave antiga; faça-a após a migração dos consumidores.
7. Como a senha de banco também apareceu no histórico, inventarie conexões PostgreSQL externas e atualize primeiro os respectivos cofres de segredos. Depois, em **Database → Settings**, redefina a senha, atualize conexões autorizadas (incluindo scripts que usam `DATABASE_URL`) e teste somente em homologação. Não coloque essa senha no Railway: o serviço é frontend estático.

O histórico Git permanece com os snapshots antigos; esta preparação não reescreveu histórico nem alterou credenciais remotas. Consulte [migração para API keys novas](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys), [rotação de API keys expostas](https://supabase.com/docs/guides/security/rotate-leaked-api-keys), [JWT Signing Keys](https://supabase.com/docs/guides/auth/signing-keys) e [redefinição da senha do banco](https://supabase.com/kb/troubleshooting/how-do-i-reset-my-supabase-database-password-oTs5sB).

## 5. Passo a passo de publicação

### 5.1 Conectar o repositório ao Railway (painel)

1. No Railway, criar o projeto ou abrir o existente.
2. Adicionar um serviço a partir do repositório GitHub `gestao-sistema/Fluxo-reverso` (remote `fluxo-reverso`).
3. Nas configurações do serviço, confirmar a branch de publicação `main` e a raiz `/`.
4. Confirmar que o builder é Dockerfile (caminho `Dockerfile`, na raiz). Os nomes exatos dos campos podem variar na interface atual; a regra é a da seção 2.
5. Cadastrar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` em Variables do serviço (seção 3.1). O valor vem de **Project Settings → API Keys** e deve ser somente a chave pública.
6. Configurar o health check path do serviço como `/healthz`.
7. Gerar o domínio público nas configurações de rede do serviço. O nome é atribuído pelo Railway e não é definido neste repositório.

Atenção: o Railway publica automaticamente quando um commit chega à branch conectada. Por isso, o commit de preparação só deve ser enviado ao `main` depois da ordem da seção 5.2 (banco e funções prontos). Até lá, a publicação fica pausada, e o serviço pode ser criado sem gerar domínio.

### 5.2 Ordem de publicação

1. **Diagnóstico somente leitura do banco.** O histórico aplicado em produção não foi consultado nesta preparação: não havia CLI do Supabase nem credencial de banco/admin disponível nesta sessão. Os arquivos locais não permitem afirmar quais migrations estão pendentes no banco. Antes da publicação, liste as migrations aplicadas (somente leitura, no SQL Editor do Supabase de produção):
   ```sql
   select version, name from supabase_migrations.schema_migrations order by version;
   ```
   Comparar com `supabase/migrations/`. Se o projeto não usa o histórico da CLI, conferir o estado com `supabase/VERIFICAR_PUBLICACAO_CONVITES.sql` e com `docs/migrations.md`. Não reaplicar migrations existentes.
   A árvore local contém oito migrations de 09/11/2026, de `20261109100000` a `20261109180000`, versionadas neste repositório. O histórico remoto ainda não foi consultado; não presuma que estão pendentes nem aplicadas. `20261109140000_nc_edicao_versao_auditoria.sql` aparece uma vez localmente. Consulte a lista remota somente com `SELECT`, compare versão e nome, e confira a definição implantada antes de qualquer decisão. Não use `db push` nem `migration repair` nesta etapa.
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

Worker do pdf.js (leitura do rastreio e "Abrir PDF"); o nome com hash está em `dist/assets/pdf.worker.min-*.mjs`:

```bash
curl -sSI https://<dominio-railway>/assets/pdf.worker.min-<hash>.mjs | grep -i content-type   # text/javascript (nunca application/octet-stream)
```

Até 12/11/2026 o `nginx.conf` não mapeava `.mjs`: o `mime.types` padrão do Nginx só conhece `.js`, o arquivo saía como `application/octet-stream` com `nosniff` e o navegador recusava o module worker ("Expected a JavaScript-or-Wasm module script…"). Efeito: o código de rastreio deixava de ser lido do PDF e o visualizador não abria a etiqueta. Corrigido com `location ~* \.mjs$ { types { } default_type text/javascript; }` dentro de `/assets/` e fora dele (reproduzido e validado com o Nginx 1.28 oficial e o Edge; detalhes em [`correcoes-producao-20261112.md`](./correcoes-producao-20261112.md)).

**Manuais (em homologação, com contas de teste no navegador):**

- Abrir `/`, `/login` e uma rota interna (ex.: `/admin/alinare`) diretamente e pelo F5. Não aceitar a tela de login como prova de autenticação.
- Login com usuário real; conferir as telas do perfil.
- Convite: enviar convite a uma conta de teste, abrir o link recebido, definir senha e entrar. Não usar e-mail de pessoa real sem autorização.
- Recuperação: solicitar reenvio de senha pelo administrador e conferir `/definir-senha`.
- Console do navegador sem `service_role` e sem erro de configuração do Supabase.

**Limite do health check:** o Railway consulta `/healthz` durante a inicialização de um deployment; isso não é monitoramento contínuo nem prova que o Nginx consegue acessar login, banco, Storage, Edge Functions, SMTP, Power Automate ou Correios. Essas verificações exigem a homologação acima.

## 8. Logs

- O log de acesso do Nginx registra método, caminho sem query string, status, tamanho e User-Agent. **Não** registra o `Referer` e não registra a query string, porque links de convite e recuperação trazem `token_hash`.
- Limite conhecido: mensagens de erro do próprio Nginx (`error_log`, nível `warn`) podem incluir o caminho da requisição. Se o caminho contiver token, tratar como incidente de log e rotacionar o link.
- Nenhum log do frontend imprime variável de ambiente.

## 9. Recuperação em caso de falha

| Situação | Ação |
|---|---|
| Build falha com "configuração obrigatória ausente" | Cadastrar `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` no serviço e gerar novo build. |
| Build falha em `tsc` ou `vite` | Ver o log; corrigir no repositório. Nunca desativar TypeScript para passar. |
| Container não fica saudável (`PORT inválida`) | Conferir se o Railway injetou `PORT` numérica. Não definir porta fixa. |
| Deploy novo com erro na tela | No painel do Railway, reimplantar o **deployment anterior** que estava saudável. |
| Edge Function com erro após mudança | Republicar a versão anterior da função a partir do commit anterior e reverter o Secret alterado. |
| Migration com erro | Parar. Não reexecutar em loop. Corrigir com nova migration incremental (não editar migration já aplicada). |
| Links de convite ou recuperação com domínio errado | Corrigir `APP_BASE_URL` (Secret) e reenviar o convite pelo administrador. |

Rollback do frontend não desfaz banco nem funções. Por isso, a ordem da seção 5.2 importa.

## 10. Validação local realizada (preparação)

Validações feitas neste checkout em 11/11/2026, sem credenciais reais e sem acesso a serviços remotos:

- `npm run lint`: exit 0, com 7 avisos existentes (seis escapes desnecessários em `src/lib/etiquetaPdf.ts` e um aviso de Fast Refresh em `src/context/ContadorAprovacoesContext.tsx`).
- `npx tsc -b --pretty false`: exit 0.
- `npm test -- --reporter=dot`: 925 testes aprovados em 88 arquivos, sem falhas e sem cancelamentos.
- Testes focados de chaves Supabase, contrato de integração, CRLF, validador de ambiente e schema Zod: 86 aprovados em 5 arquivos.
- `npm run build`: exit 0 com URL e chave pública fictícias; Vite 8.3.8 transformou 2963 módulos. Isso valida compilação, não conectividade com Supabase.
- Scan dos 67 assets do bundle: sem valor sb_secret, JWT, claim service_role ou os marcadores demo pesquisados.
- `npm audit` e `npm audit --omit=dev`: zero vulnerabilidades reportadas após as atualizações. O pacote `xlsx` está fixado no tarball oficial SheetJS 0.20.3 fora do registry npm; confira também a observação de origem no relatório de prontidão, porque o npm audit não substitui a verificação do pacote CDN.
- O teste que falhava por diferenças LF/CRLF foi corrigido no teste de contrato de template; a suíte completa passou depois da correção.
- Os 76 testes da suíte PostgreSQL continuam **sem resultado**: execução cancelada anteriormente quando o servidor embutido detectou processo Administrador. Não foram contados como aprovados nem reexecutados neste ambiente. Docker e Podman não estão instalados, e o WSL não tem distribuição Linux.
- Imagem Docker e runtime Nginx não foram validados. O arquivo `Dockerfile` e `nginx.conf` foram inspecionados; a configuração declara `PORT`, `/healthz`, fallback SPA e 404 para assets/API ausentes, mas não houve build de container nem requisição HTTP real.
- O histórico de migrations aplicado no Supabase não foi consultado por falta da CLI e de credencial de leitura nesta sessão. Nenhuma operação remota de banco foi feita.

A classificação continua **BLOQUEADO PARA DEPLOY** até concluir a rotação manual das credenciais expostas, comparar migrations com o histórico remoto, executar os testes PostgreSQL em ambiente não privilegiado, validar o container e concluir a homologação em ambiente isolado.