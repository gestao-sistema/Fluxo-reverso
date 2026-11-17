# Correções dos erros de produção — 12/11/2026

**Projeto:** Reverso (Supabase `ymrrguubkqbxndhoxhor`, "Formulário Reverso - Assistência Técnica"; não é o Inventário de TI).

**Situação:** correções **locais**, prontas para revisão. Não houve push, merge, deploy, SQL de escrita no remoto nem alteração de configuração de produção. As consultas ao remoto foram somente leitura (`supabase db query --remote --read-only` e `supabase secrets list`, que devolve só nomes e digests). **Nada aqui prova que a produção está corrigida**: isso depende do procedimento da seção 6 e da homologação.

## 1. Estado conferido em 12/11/2026

| Item | Situação | Evidência |
|---|---|---|
| Vínculo da CLI | `ymrrguubkqbxndhoxhor` | `supabase/.temp/linked-project.json` e banner da CLI |
| Ledger remoto | 7 versões: base, `20261028100000`–`20261028140000`, `20261111193000` | `supabase_migrations.schema_migrations` |
| Sino (`20261109150000`) | **Aplicado fora do ledger** depois de 11/11: as 6 funções têm o corpo igual ao do repositório; grants, RLS e gatilhos presentes | hash dos corpos de todas as funções de `public` × versões locais |
| Lixeira (`20261030120000`) | **Ausente**: nenhuma das 5 funções; policy de exclusão física ainda ativa | idem |
| Cadeia NC (`20261109100000`–`140000`, `160000`, `170000`) | Ausente; módulo NC antigo com divergências (já documentado em `DEPLOY_READINESS.md`) | idem |
| Exclusão de usuário (`20261111193000`) | Aplicada e registrada | coluna `destinatario_desvinculado` presente |
| `APP_BASE_URL` (segredo das Edge Functions) | **`http://localhost:5173`** | digest SHA-256 do segredo = digest desse texto |
| Bucket `etiquetas` | Privado, 5 MB, só PDF; 11 objetos; todos os caminhos gravados existem e estão na pasta do próprio pedido; 5 das 11 emissões com PDF estão sem rastreio | consultas agregadas |
| Autoaprovação | `permitir_autoaprovacao = false`; **0 de 4** decisões tomadas pelo próprio autor; 2 pedidos não legados sem autor (ambos já rejeitados, não são legado convertido) | contagens |
| Versão publicada no Railway | **Não verificada**: não há URL pública nem CLI do Railway neste ambiente. O erro reportado da Lixeira mostra que o frontend publicado já chama `inutilizar_chamado`, ou seja, é posterior ao banco | pendência |
| Modo demonstração em produção | Impossível pelo build: `vite.config.ts` troca todo `src/demo/*` por `src/build/demo-disabled.ts` (`demoAtivo = () => false`) | código + build |

Conferência reutilizável (antes/depois): `supabase/VERIFICAR_CORRECOES_20261112.sql`. Resultado "antes" já registrado no cabeçalho do arquivo; o "depois" foi conferido aplicando a cadeia num PGlite.

## 2. Causas e correções

### 2.1 Autoaprovação ("Eu registrei e posso aceitar")

**O que o relato significava.** Não há decisão do autor gravada em produção (0/4). Na tela, o autor aprovador via o pedido na fila com **Aprovar** desabilitado, mas **Rejeitar** habilitado, com a mensagem "a rejeição continua disponível" — a regra antiga permitia ao autor rejeitar (desistência). A demonstração não pode ser a origem em produção (ver tabela acima).

**Brechas reais encontradas no backend** (`registrar_decisao_reversa`, versão vigente `20261023190000`, idêntica no remoto):

1. `aprovacao_config.permitir_autoaprovacao` com `GRANT UPDATE` para `authenticated` e policy de administrador: um admin podia ligar a autoaprovação.
2. O autor podia **rejeitar** o próprio pedido (a regra é "o aprovador decide pedidos de outra pessoa").
3. Pedido com `solicitado_por` nulo (inserido por SQL sem JWT): `solicitado_por = auth.uid()` dava `NULL`, o bloqueio não disparava e a fila mostrava `pode_aprovar = true`.
4. Na tela, `pode_aprovar` ausente era tratado como **permitido** (`?? true`).

**Correção**

- Migration `20261112100000_decisao_aprovacao_somente_terceiros.sql`: autoaprovação travada (`CHECK (not permitir_autoaprovacao)`, UPDATE revogado, policy removida); decisão recusa autor e quem produziu a versão (aprovar **e** rejeitar), pedido sem autoria conhecida, chamado na Lixeira; escopo conferido antes e depois do lock; identidade sempre de `auth.uid()`; decisão repetida continua recusada (`55000`) sem alterar nada. `reversa_autoria_conhecida(id, solicitado_por)` aceita o autor registrado ou o **legado convertido** por `exigir_aprovacao_legado_pendente` (sem autor por desenho, com o evento de conversão no histórico imutável). A tarefa de aprovação no Teams e o sino (`reversa_aprovador_pode_decidir`) deixam de chamar o autor.
- Migration `20261112110000_fila_aprovacao_decisao_de_terceiros.sql`: `pode_aprovar` da fila igual à regra do banco.
- Tela (`src/pages/ApprovalQueuePage.tsx`): aprovar e rejeitar seguem `pode_aprovar === true`; ausência = bloqueado; mensagem "Você registrou ou alterou este pedido. Outro aprovador precisa aprová-lo ou rejeitá-lo."
- Demonstração (`src/demo/demoApi.ts`, `demoAvisosReverso.ts`, `demoDatabase.ts`, `fixtures.ts`): mesma regra; a configuração de autoaprovação da demo foi removida; o pedido fictício `03` ganhou autor.

**Mudança de regra a confirmar com o negócio:** o autor não consegue mais rejeitar ("desistir de") o próprio pedido. Alternativa operacional: outro aprovador rejeita, ou o administrador move para a Lixeira.

### 2.2 Lixeira ("function public.inutilizar_chamado(p_solicitacao_id uuid) not found")

**Causa confirmada:** a migration `20261030120000_lixeira_chamados.sql` nunca foi aplicada no remoto. O frontend chama a RPC com o parâmetro correto (`p_solicitacao_id`, `src/services/apiService.ts`); não é cache do PostgREST nem assinatura errada.

**Correção:** aplicar a migration existente (seção 6). Não houve troca por exclusão física nem nova tentativa automática. Na tela, função ausente agora mostra "A Lixeira ainda não está disponível no banco de dados. Nada foi alterado." e registra o detalhe técnico no console (`checarErroLixeira`).

**Achado na própria Lixeira:** ela troca a regra de leitura do PDF por `empresas_permitidas()`, que inclui o formulário. Aplicada sozinha, quem só tem o formulário da empresa passaria a ler PDFs de pedidos de outras pessoas, e usuários comuns leriam PDFs de chamados na Lixeira. Corrigido por `20261112120000_etiqueta_leitura_pelo_pedido.sql` (lê o PDF quem lê o pedido; Lixeira e objeto órfão só para administrador) — mesma regra que está hoje em produção, mais o recorte da Lixeira.

### 2.3 Rastreio não preenchido e PDF que não abre

**Causa principal (confirmada por reprodução):** o worker do pdf.js é um módulo `.mjs` (`dist/assets/pdf.worker.min-*.mjs`). O `mime.types` padrão do Nginx só mapeia `.js`; a imagem `nginx:alpine` usa `default_type application/octet-stream`, e o `nginx.conf` envia `X-Content-Type-Options: nosniff`. O navegador recusa o module worker, o pdf.js não inicia, e caem juntos a leitura do rastreio e o "Abrir PDF" (o "Baixar" continua funcionando, pois usa os bytes). No `vite dev` o `.mjs` sai como JavaScript, por isso o problema só aparece em produção.

Reprodução local (Nginx 1.28 oficial para Windows + Edge 157, servindo o `dist` com o `nginx.conf` do repositório):

| `nginx.conf` | `Content-Type` do worker | Resultado no Edge |
|---|---|---|
| antes | `application/octet-stream` + `nosniff` | `Setting up fake worker failed … Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "application/octet-stream"` |
| depois | `text/javascript` | PDF aberto e texto extraído |

Upload, vínculo pedido↔arquivo, bucket, caminho e autorização foram conferidos separadamente e **não** são a causa: os 11 PDFs existem, estão na pasta do pedido certo, a regra de leitura atual autoriza expedição, aprovação, consulta da empresa e o autor, e a URL assinada (60 s) só é usada para baixar os bytes, sem pop-up.

**Defeitos adicionais comprovados no código** (`src/lib/etiquetaPdf.ts`, `src/components/admin/EtiquetaReversa.tsx`):

1. A tela pedia autorização **e** rastreio; etiqueta sem a linha "autorização" disparava o OCR (tesseract.js, arquivos do `cdn.jsdelivr.net`) e, se o OCR falhasse, **o rastreio já lido do texto era descartado**.
2. Ao recuperar uma emissão gravada sem PDF, os códigos dela eram **sobrescritos em silêncio** pelos lidos do PDF.
3. Qualquer `AA999999999BR` era aceito, sem dígito verificador (CEP, contrato ou leitura errada podiam virar rastreio).

**Correções**

- `nginx.conf`: `location ~* \.mjs$ { types { } default_type text/javascript; … }` dentro de `/assets/` e fora dele (o `types {}` vale só nessas locations).
- `src/lib/rastreioCorreios.ts` (novo, puro): dígito verificador S10 dos Correios (pesos 8 6 4 2 3 5 9 7), códigos distintos válidos e decisão de preenchimento (`preenchido`, `confirmado`, `mantido`, `escolher`, `nenhum`).
- `etiquetaPdf.ts`: só código com DV correto; com mais de um, nenhum é escolhido sozinho (`codigos_rastreio`); falha do OCR não descarta o texto (`ocrIndisponivel`).
- `EtiquetaReversa.tsx`: OCR só quando o texto não traz rastreio; nunca sobrescreve valor existente (mostra "Usar …"); vários códigos → a pessoa escolhe; nenhum → aviso e digitação; a causa técnica vai para o console. A leitura não aprova, não confirma postagem nem encerra nada: só preenche o campo, e a gravação continua pela RPC após "Confirmar".
- `VisualizadorPdf.tsx`: registra no console a causa da falha (antes era engolida).
- `salvarCodigoRastreio`/`removerCodigoRastreio` já gravam só pela RPC `atualizar_dados_emissao` (que registra "antes → depois" na trilha); nada mudou.

**Limitações:** PDF digitalizado (sem camada de texto) depende do OCR, que baixa arquivos do jsDelivr (dependência já existente; não acrescentei OCR nem serviço). Sem acesso a esse CDN, a entrada fica manual. O pdf.js 6.4 (build "moderno") usa APIs recentes (`Map.prototype.getOrInsertComputed`, `Math.sumPrecise`) sem polyfill; o Edge 157 funcionou, navegador muito antigo pode falhar — se aparecer, a saída é usar `pdfjs-dist/legacy/build`.

### 2.4 Domínios de e-mail

Única validação de destinatário: o bloco "e-mail corporativo", idêntico em `src/lib/emailCorporativo.ts` e `supabase/functions/admin-usuarios/convite.ts` (a Edge Function é a autoridade; o reenvio revalida o e-mail gravado). Agora `DOMINIOS_CONVITE = ['azime.com.br', 'alinare.com.br', 'novitah.com.br']`, com `trim` + minúsculas e comparação **exata** do domínio (recusa `sub.alinare.com.br`, `alinare.com.br.evil.com`, `evilnovitah.com.br`, `alinare.com`). Texto de ajuda da tela atualizado. O modelo legado do Power Automate (`docs/power-automate/fluxo-convite-acesso-template.json`, não usado pelo código desde o SMTP direto) recebeu o `or` dos três domínios. `SMTP_FROM`/remetente não mudou. O cadastro por senha (`create`/`update` em `admin-usuarios`) nunca teve regra de domínio e continua assim.

### 2.5 Links de definir/recuperar senha com localhost

**Causa confirmada:** o segredo `APP_BASE_URL` das Edge Functions em produção é `http://localhost:5173`. Ele monta os links de convite e de definição de senha (`admin-usuarios`) e os links das notificações (`comunicacao-etiqueta`). O app não usa `resetPasswordForEmail`/`redirectTo` do Supabase Auth para esses links (o `action_link` é descartado; o link leva à página `/definir-senha` com `token_hash`). `supabase/config.toml` (`site_url` localhost) só vale para a pilha local da CLI; o **Site URL** e as **Redirect URLs** do projeto hospedado não foram lidos (exigem o painel).

**Correção no código:** com `SUPABASE_URL` hospedado (HTTPS, não local), um `APP_BASE_URL` local desabilita o envio do convite — ele fica "preparado" (estado que já existia) e o log registra o motivo, sem o valor. Em desenvolvimento (sem `SUPABASE_URL` ou `http://kong:8000`) localhost continua aceito. O worker de notificações **não** foi travado (pararia todos os avisos); ele volta a ter link certo quando o segredo for corrigido.

**Correção definitiva (pendente, ação sua):** `APP_BASE_URL=https://<domínio público do Railway>` nas Edge Functions; Site URL e Redirect URLs no painel do Auth (ver `docs/RAILWAY.md`, seção 6). A URL pública não está no repositório e não foi inventada.

### 2.6 E-mails no Outlook escuro

| Mensagem | Tipo | Gerada por | Enviada por |
|---|---|---|---|
| Convite de acesso / "Conclua seu acesso" | Autenticação | `admin-usuarios/convite-email.ts` | SMTP direto (`_shared/smtp.ts`, Office 365) |
| "Sua etiqueta está disponível" | Operacional | `comunicacao-etiqueta/email-visual.ts` | Power Automate (Outlook) |
| Demais eventos do pedido | Operacional | `comunicacao-etiqueta/logic.ts` (`montarCorpoHtml`, HTML simples, sem cores) | Power Automate |
| E-mails padrão do Supabase Auth | — | Supabase | não acionados pelo app |

**Causa provável do desfiguramento** (não reproduzível sem o cliente real): o template só tinha `@media (prefers-color-scheme: dark)`, que o Outlook (desktop, novo Outlook, Outlook.com e apps) **ignora**; ele recolore sozinho. Marca, submarca, filete dourado e botão nem tinham regra para o escuro.

**Ajuste** (idêntico nos dois e-mails, marcado como bloco `>>> modo escuro`): `color-scheme` no `:root`; regras `[data-ogsc]`/`[data-ogsb]` (atributos que Outlook.com, o novo Outlook e os apps marcam ao recolorir) devolvendo fundo escuro da marca, texto claro e botão dourado com texto escuro; classes nas peças da marca. Paleta clara, estrutura, textos e botão VML não mudaram. Contraste das cores escuras ≥ 4,5:1 conferido em teste. Prévias regeneradas em `docs/previa-email-convite/`.

**Limite:** o Outlook para Windows clássico (motor do Word) inverte cores sem respeitar CSS; o resultado nele só se conhece no cliente real. Nenhum cliente garante controle total.

**Matriz de validação (pendente — nenhum teste em cliente real foi feito):**

| Cliente | Modo | Convite | Etiqueta disponível | Conferir |
|---|---|---|---|---|
| Outlook Windows clássico (Microsoft 365) | claro / escuro | pendente | pendente | fundo do cartão, texto do título e corpo, cabeçalho "REVERSO", filete, botão (cor e texto), linha do rodapé |
| Novo Outlook para Windows | claro / escuro | pendente | pendente | idem |
| Outlook na Web (OWA/Outlook.com) | claro / escuro | pendente | pendente | idem |
| Outlook iOS / Android | claro / escuro | pendente | pendente | idem + largura (≤ 620 px) |
| Apple Mail / Gmail (referência) | claro / escuro | pendente | pendente | idem |

Como testar sem pessoa real: conta de teste corporativa; convite pelo `admin-usuarios` depois de corrigir `APP_BASE_URL`; "etiqueta disponível" pelo fluxo de homologação do Power Automate. Registrar captura por linha.

## 3. Migrations novas

| Versão | Finalidade | Depende de | Dado alterado |
|---|---|---|---|
| `20261112100000_decisao_aprovacao_somente_terceiros` | Decisão só por terceiros; autoaprovação travada; autoria conhecida | `20261030120000` (não depende da cadeia NC) | no máximo a linha única de `aprovacao_config` (`true → false`); em produção já é `false` |
| `20261112110000_fila_aprovacao_decisao_de_terceiros` | Fila com `pode_aprovar` igual ao banco | `20261109130000`, `20261112100000` | nenhum |
| `20261112120000_etiqueta_leitura_pelo_pedido` | Leitura do PDF pelo pedido; Lixeira só admin | `20261030120000` | nenhum |

Nenhuma migration antiga foi editada. `supabase/SQL_EDITOR_SETUP_NC_REVERSA.sql` foi regenerado (pacote completo, **não** usar no banco de produção, que já tem parte da cadeia).

## 4. Testes

| Camada | Resultado | Observação |
|---|---|---|
| Vitest (mocks, jsdom) | **967/967**, 90 arquivos | Uma rodada paralela a outra carga teve *timeouts* de 5 s; repetida sem carga, tudo passou |
| `tsc -b` | ok | |
| `npm run lint` (oxlint) | 0 erros; 7 avisos preexistentes | 6 em `etiquetaPdf.ts` (regex de endereço, não tocadas), 1 em `ContadorAprovacoesContext.tsx` |
| `npm run build` | ok | chaves fictícias |
| Suíte oficial de banco (PostgreSQL 17 embarcado) | **não executada**: 7/7 **cancelados** | shell com token de administrador; o PostgreSQL recusa iniciar. Cancelados não contam como aprovados. Rodar `cd supabase/tests && npm test` num terminal **sem elevação** |
| Banco em PGlite (PostgreSQL 18 WASM, complementar) | 17 arquivos 100%; `banco` 73/74, `comunicacao-ciclo` 26/28, `recebimento-fisico` 12/13 | As falhas são do próprio shim: testes com duas conexões/travas (PGlite tem uma), `count` devolvido como número e SQL com vários comandos. Testes que exigem segunda conexão foram pulados no `banco` |
| Caminho "igual à produção" (PGlite sem a cadeia NC) | jornada 7/7 | prova que Lixeira + `20261112100000` + `20261112120000` aplicam sem NC |
| Navegador (Edge, modo demonstração, pdf.js real) | ok | um código → preenchido; dois → escolha; DV inválido → ignorado; PDF sem texto → manual; confirmar → recarregar → rastreio persistido e PDF abre |
| Nginx real + Edge (MIME) | antes falha / depois ok | seção 2.3 |
| Outlook real, Supabase real, Power Automate, Railway | **não testados** | pendências |

Testes novos/ajustados: `src/test/rastreioCorreios.test.ts`, `emailModoEscuro.test.ts`, `etiquetaPdf.test.ts`, `EtiquetaReversa.test.tsx`, `ApprovalQueuePage.test.tsx`, `demoAprovacao.test.ts`, `deleteSolicitacao.test.ts`, `conviteAcesso.test.ts`, `emailCorporativoParidade.test.ts`, `conviteFluxoTemplate.test.ts`, `UsuariosPageConvite.test.tsx`; banco: `banco.test.mjs` (decisão só por terceiros, sem escopo, sem autor, Lixeira, configuração travada, replay da fila), `jornada-expedicao.test.mjs` (jornada completa: A abre → A não decide → B decide → expedição anexa PDF e rastreio → reabre → Lixeira só admin → restaura), `seguranca.test.mjs`, `comunicacao-ciclo.test.mjs`. Retirando a migration correspondente, os testes de jornada falham (verificado).

## 5. Riscos e recuperação

| Mudança | Risco | Recuperação |
|---|---|---|
| Lixeira (`20261030120000`) | Admin deixa de excluir fisicamente (esperado); chamados arquivados somem das filas | `restaurar_chamado`; dados, decisões e PDFs ficam preservados. Desfazer o schema exige migration nova, não reversão manual |
| `20261112100000` | Autor não rejeita mais o próprio pedido; pedido sem autoria conhecida fica sem decisão (hoje nenhum aguardando) | Nova migration que restaure o trecho desejado; não editar a publicada |
| `20261112120000` | Nenhum em relação à produção atual (mesma regra), só recorta a Lixeira | Reaplicar a versão anterior da função por migration nova |
| `nginx.conf` | Baixo: só muda o tipo de `.mjs` | Republicar a imagem anterior no Railway |
| `admin-usuarios` | Com `APP_BASE_URL` ainda local, convites ficam "preparados" e não saem | Corrigir o segredo e usar "Reenviar" |
| `comunicacao-etiqueta` | **Publicar esta função também troca o transporte**: o remoto ainda roda a versão SMTP antiga (registro de 28/10); a local usa Power Automate | Decidir antes; o ajuste visual do e-mail operacional depende dessa publicação |
| Frontend | O working tree inclui as telas da cadeia NC (`nc_salvar_edicao`, classificação), ausentes no banco | Ver passo 4: publicar só depois da cadeia NC, ou fazer hotfix a partir do commit publicado |

## 6. Procedimento de aplicação e publicação

Ordem pensada para corrigir primeiro o que está quebrado sem depender da cadeia NC (bloqueada por B1, ainda não escrita — ver `DEPLOY_READINESS.md`, seção 2). Em cada passo: homologação antes de produção.

0. **Preparar.** Backup/PITR do projeto. Rodar `supabase/VERIFICAR_CORRECOES_20261112.sql` (somente leitura) e guardar o resultado. **Não** usar `supabase db push` nem `migration repair` em lote: o ledger tem 7 de 46 versões e o push tentaria reaplicar tudo.
1. **Banco — correção imediata** (SQL Editor, cada arquivo inteiro, nesta ordem; cada um tem `begin/commit`):
   1. `supabase/migrations/20261030120000_lixeira_chamados.sql`
   2. `supabase/migrations/20261112100000_decisao_aprovacao_somente_terceiros.sql`
   3. `supabase/migrations/20261112120000_etiqueta_leitura_pelo_pedido.sql`

   Rodar de novo o script de verificação: `lixeira`, `autoaprovacao_travada`, `autoria_conhecida`, `decisao_bloqueia_autor`, `etiqueta_por_pedido` = `true`; `admin_liga_autoaprovacao`, `delete_fisico_ativo`, `decisao_interna_exposta`, `bucket_etiquetas_publico` = `false`; `decisoes_pelo_autor` = 0. Registrar só essas três versões no ledger depois de conferidas (`supabase migration repair --status applied 20261030120000 20261112100000 20261112120000`).
2. **Segredos e Auth (painel).** `APP_BASE_URL=https://<domínio público>` (sem barra final); Site URL e Redirect URLs (`docs/RAILWAY.md`, seção 6). Conferir depois pelo digest (`supabase secrets list`).
3. **Edge Function `admin-usuarios`.** `supabase functions deploy admin-usuarios` (domínios e trava de localhost). Testar convite para conta de teste de cada domínio e o "Reenviar"; o link deve abrir `https://<domínio>/definir-senha?...`. `comunicacao-etiqueta` só depois da decisão sobre o transporte (seção 5).
4. **Frontend (Railway).** Identificar o commit publicado. Se a cadeia NC ainda não estiver no banco, publicar um hotfix a partir desse commit com `nginx.conf` + `ApprovalQueuePage.tsx`, `EtiquetaReversa.tsx`, `etiquetaPdf.ts`, `rastreioCorreios.ts`, `VisualizadorPdf.tsx`, `apiService.ts` (Lixeira), `emailCorporativo.ts`, `UsuariosPage.tsx`, conferindo conflitos. Depois do deploy: `curl -sSI https://<domínio>/assets/pdf.worker.min-<hash>.mjs` → `text/javascript` (`docs/RAILWAY.md`, seção 7).
5. **Cadeia NC** (quando B1 existir): B1 → `20261109100000` → `120000` → `130000` → `140000` → `160000` → `170000` → `20261112110000`; registrar no ledger; aí sim publicar o frontend completo.
6. **Homologação da jornada** (contas de teste): A abre → A vê o pedido sem Aprovar/Rejeitar e a API recusa → B aprova; segunda decisão recusada → expedição anexa a etiqueta, o rastreio é preenchido, confirma → F5 → "Abrir PDF" abre → admin move para a Lixeira (não admin não consegue; PDF só para admin) e restaura. Matriz do Outlook (seção 2.6).

## 7. Pendências reais

- Suíte oficial de banco num terminal **sem** elevação.
- Commit publicado no Railway e resposta real do `.mjs` em produção.
- `APP_BASE_URL`, Site URL e Redirect URLs com a URL pública (não informada).
- Decisão sobre publicar `comunicacao-etiqueta` (troca de transporte) e a homologação do Power Automate.
- Matriz do Outlook em clientes reais.
- Confirmação do negócio: autor não rejeita o próprio pedido.
- Cadeia NC (B1 a escrever), já registrada em `DEPLOY_READINESS.md`.
