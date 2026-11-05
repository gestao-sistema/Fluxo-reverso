# Cadastro por convite

O administrador informa **nome**, **e-mail corporativo** (`@azime.com.br`) e as **permissões**. O backend cria a conta e envia o convite ou a recuperação da definição de senha diretamente por SMTP, usando o link gerado pelo Supabase Auth. O colaborador define a **própria senha do Reverso** (independente da senha Microsoft) e depois entra pelo login atual com e-mail e essa senha. Não há login Microsoft, Microsoft Graph nem sincronização de diretório.

O envio atual e suas configurações estão em [`envio-email-smtp.md`](./envio-email-smtp.md). Os arquivos em `docs/power-automate/` descrevem o transporte anterior e são apenas referência histórica. Regras de permissão (telas, empresas e setores): [`cadastro-de-usuarios-por-tela.md`](./cadastro-de-usuarios-por-tela.md).

> **Estado desta alteração SMTP:** implementada e testada localmente. Nesta etapa não houve envio real, alteração remota de banco, mudança de secrets ou publicação de Edge Function.

## Como funciona

1. **Tela Usuários → Novo usuário.** Campos: nome, e-mail corporativo e permissões (as mesmas do cadastro por tela). Botão **Salvar e enviar convite**. Não existe campo de senha. A tela valida o domínio e o backend valida de novo.
2. **Edge Function `admin-usuarios`, ação `invite`** (somente administrador: tela `usuarios` ou perfil mestre, conferido no backend):
   1. valida nome, e-mail (domínio **exato** `azime.com.br`, espaços externos e caixa normalizados) e o acesso;
   2. localiza a conta pelo e-mail (`admin_convite_localizar_usuario`);
   3. cria a conta **sem senha e sem confirmação**, já com as permissões (`app_metadata`) e o escopo de aprovação, ou reaproveita a pendente;
   4. reserva a tentativa no banco (`admin_convite_iniciar_envio`), o que impede envios simultâneos;
   5. gera o convite com `auth.admin.generateLink({ type: 'invite' })`: **não envia e-mail** e, como a conta já existe pendente, **não cria outra**;
   6. envia o link pelo transporte SMTP do backend e grava só o **resultado** (`admin_convite_finalizar_envio_smtp`). `smtp_aceito` significa que o servidor aceitou a mensagem, não que ela chegou à caixa.
3. **Página `/definir-senha`** (pública): a pessoa digita e confirma a senha; só nesse envio o convite é verificado (`verifyOtp`, `type: 'invite'`) e a senha é definida (`updateUser`). Depois, segue para a aplicação.

Se qualquer etapa 2.1 a 2.3 falhar, **nada é gerado nem enviado**. Se a gravação do escopo de aprovação falhar, a conta criada nesta chamada é removida (a pendente reaproveitada volta ao acesso anterior).

## Comportamento verificado do Supabase Auth

Conferido no código-fonte do GoTrue (`internal/api/mail.go`, `adminGenerateLink`) e na documentação oficial, **não** num projeto real:

| Situação | `generateLink` (`invite`) |
| --- | --- |
| E-mail sem conta | **cria** a conta (não confirmada, `invited_at` preenchido) e gera o link. Por isso o backend cria a conta antes, com as permissões |
| Conta existente **não confirmada** (convite pendente) | reaproveita a conta e **gera token novo**, apagando o anterior: o link antigo **deixa de valer** |
| Conta **confirmada** (ativa) | erro `422 email_exists`. O backend recusa antes (`usuario_ativo`); nenhuma redefinição de senha é feita |
| Conta **confirmada sem senha** (convite aberto, senha não definida) | `generateLink` com `type: 'recovery'` **não exige** conta não confirmada, devolve `hashed_token` e **não envia e-mail**; o token anterior de recuperação é substituído. Conferido em `mail.go`/`admin.go` do GoTrue. `verifyOtp(token_hash, type: 'recovery')` abre uma sessão de recuperação; `updateUser({ password })` numa conta **sem** senha não exige a senha atual (e, em sessão de recuperação, também não) |
| E-mail | `generateLink` não envia e-mail; o backend envia a mensagem pelo SMTP configurado. O limite de frequência depende do SMTP e do tenant |

Consequências: repetir o cadastro ou reenviar **não** cria outro usuário e **não** perde permissões; um reenvio invalida o link anterior; `inviteUserByEmail` **não** é usado (enviaria um segundo e-mail pelo Supabase).

**Validade do link:** é a configuração **Email OTP Expiration** do projeto (Authentication → Providers → Email; padrão 3600 s, máximo 86400 s). **Confira o valor no projeto.** O e-mail diz apenas "validade limitada", sem número. Link vencido, usado ou substituído por reenvio aparece, para o usuário, como "inválido, expirou ou já foi usado" (o Supabase não distingue os três).

## Scanners de e-mail (pré-visualização de links)

Segundo a documentação do Supabase, provedores que fazem `GET` automático em links consomem o link de uso único. Por isso o e-mail **não** leva o link direto do Supabase (`/auth/v1/verify`): leva um link para a página do aplicativo com o `token_hash`, que **só carrega a tela**. O convite só é consumido quando a pessoa envia o formulário. A página retira o token da URL e do histórico do navegador ao abrir; o token não vai para analytics nem para logs.

## Segurança do link

- O link é gerado **só no backend** (`service_role` nunca no navegador) e **não** é devolvido ao administrador, **nem gravado** (`convites_acesso` não tem coluna para link ou token), nem registrado em log ou auditoria; os testes verificam isso.
- A origem do link vem **só** de `APP_BASE_URL` (HTTPS; `http://localhost` em desenvolvimento). O navegador não influencia o destino.
- Nenhuma senha passa pelo transporte SMTP. Nenhum token de autenticação próprio é criado.
- O transporte recebe o link inevitavelmente para compor o e-mail, mas não o registra. O SMTP não é logado em modo debug; resultados e logs não incluem token, corpo nem credenciais.
- A senha só é aplicada à **sessão aberta por aquele convite** (conferida no servidor com `getUser`). O convite válido **substitui** a sessão deste navegador pela da pessoa convidada (o SDK troca a sessão local só quando o token é válido; um link inválido não derruba a sessão existente), e a senha só é aplicada a essa sessão. Um e-mail na URL não autoriza nada.

## Interrupção na definição da senha (retomada e recuperação)

O convite é de uso único e é consumido (`verifyOtp`) quando a pessoa envia a senha. Se a verificação concluir e o salvamento da senha (`updateUser`) falhar (rede, senha fraca) ou a página for fechada, a conta fica **confirmada e sem senha** e o link original não vale mais. Cada caso:

| Situação | O que acontece |
| --- | --- |
| Falha ao salvar com a página **ainda aberta** | O formulário continua; "Salvar senha" tenta de novo **sem** usar o token (já consumido) e só na sessão do convite (conferida no servidor com `getUser`) |
| **F5 antes** de enviar a senha | O token já foi retirado da URL, mas **nada foi consumido**. A página explica: reabra o link do e-mail (continua válido) ou peça novo envio |
| **F5 ou página fechada depois** de o convite ser consumido, no mesmo navegador | A sessão do convidado continua guardada. Sem token na URL, a página pergunta ao banco (`convite_senha_pendente()`, sobre `auth.uid()` da **própria** sessão, validada no servidor) se a conta é de convidado ainda sem senha. Se sim, mostra o formulário ("seu convite já foi aberto, falta criar a senha") e define a senha dessa sessão. **Não depende do link** |
| Reabrir o **link original já consumido**, no mesmo navegador, com a sessão pendente | O Supabase recusa o token; a página confere a sessão pendente e continua com o formulário em vez de travar |
| Sessão perdida (outro navegador, dados limpos, sessão expirada) | O administrador usa **Reenviar** ("Enviar link de definição de senha") na linha "Convite aceito · senha não definida". O backend gera um link de **recuperação** do Supabase (`generateLink`, `recovery`) e o envia pelo mesmo transporte SMTP; o link é `/definir-senha?token_hash=…&type=recovery` |

Garantias:

- O link de recuperação só é gerado para conta **confirmada, sem senha e vinda de convite** (`convites_acesso`). Conta com senha (ativa) é recusada em três pontos: no backend antes de reservar, no banco ao reservar (`admin_convite_iniciar_envio`) e numa última conferência antes de gerar a credencial.
- Nada recria o usuário, apaga a conta ou muda permissões, autoria (`convidado_por`) ou ID. O reenvio só grava o resultado da tentativa e atualiza o contador.
- A senha só é aplicada à sessão aberta pelo token (ou à **própria** sessão pendente). Sessão de outra pessoa, com senha, nunca vê o formulário. O e-mail na URL não autoriza nada. Um link inválido **não** derruba a sessão atual (a página não encerra a sessão antes de verificar; o SDK só troca a sessão se o token for válido).
- Recuperação de senha em geral (esqueci minha senha, para quem **já tem** senha) continua **fora** do escopo.
- Mesmo regime de credencial do convite: link fora de logs, respostas e banco; reenvio explícito; resultado incerto exige confirmação; clique repetido bloqueado.
- Enquanto `convite_senha_pendente()` for verdadeiro, o front-end direciona a sessão para esta página e oferece **Sair**. No backend, `current_telas()`, `current_perfil_legacy()`, `is_admin()` e `is_mestre()` retiram as permissões; as policies RLS e RPCs que usam esses helpers negam leitura e operação. A Edge Function `admin-usuarios` também consulta a própria sessão antes de qualquer ação. Depois que a pessoa define a senha, o banco volta a usar as permissões já gravadas. Contas antigas sem linha em `convites_acesso` não são afetadas.

Se a sessão pendente for perdida, o administrador pode reenviar o link `recovery` pela lista de usuários; isso não altera as permissões ou a regra de acesso e permite concluir o mesmo convite.

## Estados do convite

Tabela `public.convites_acesso` (uma linha por conta convidada; só `service_role`, RLS ligada e sem policy):

| Estado | Significado | Novo envio |
| --- | --- | --- |
| `preparado` | conta e permissões gravadas; envio ainda não tentado (convites desabilitados) | livre |
| `envio_em_andamento` | tentativa reservada | **bloqueado** por 3 min; depois vira "incerto" |
| `smtp_aceito` | o servidor SMTP respondeu que aceitou a mensagem (não prova entrega nem leitura) | reenvio explícito |
| `falhou` | falha antes da aceitação ou rejeição temporária conhecida | nova tentativa conforme estado e confirmação da tela |
| `rejeitado` | autenticação ou mensagem recusada pelo servidor | corrigir configuração antes de reenviar |
| `resultado_indeterminado` | timeout ou conexão interrompida após começar `DATA`: **pode** ter sido aceito | **só com confirmação explícita** do administrador |

A situação na lista de usuários: **Convite pendente · estado**, **Convite aceito · senha não definida**, ou ativo (sem selo).

## Casos tratados

- **Usuário novo:** conta criada sem senha, convite enviado.
- **Convite pendente (retomada):** reaproveita a conta; atualiza nome e permissões com o que foi enviado; gera link novo.
- **Usuário ativo (com senha):** recusado (`409`). Não recebe convite nem link de definição de senha. Recuperação de senha de quem **já tem** senha **não faz parte desta entrega**.
- **Convite aceito, senha não definida:** repetir o cadastro do mesmo e-mail é recusado com a orientação de usar "Reenviar"; o reenvio envia o link de definição de senha (seção acima).
- **Falha depois de criar a conta, antes de enviar:** a conta e as permissões ficam; repetir reaproveita a conta pendente.
- **Cliques repetidos:** a tela bloqueia o botão e o banco reserva a tentativa de forma atômica (testado com duas conexões).
- **Usuários antigos de outros domínios:** não são bloqueados nem convertidos; o domínio só vale para **novos** convites.
- **Cadastro público:** não é ativado. Quem se autentica sem permissões cadastradas não acessa dados.

## Configuração no Supabase

Authentication → URL Configuration:

- **Site URL:** a origem do aplicativo (hoje `http://localhost:5173`).
- **Redirect URLs:** adicionar `http://localhost:5173/definir-senha` e, na publicação, `https://<origem-publicada>/definir-senha`. O backend passa esse `redirectTo` (fixo, montado a partir de `APP_BASE_URL`) ao `generateLink`; o fluxo atual **não usa** o link direto do Supabase, então a lista serve de reserva e de coerência.
- **Email OTP Expiration:** conferir (seção acima).
- **Signups públicos:** manter **desabilitados** (Authentication → Sign In / Providers → "Allow new users to sign up" **desligado**). Os convites não dependem deles: a conta é criada pela API administrativa. Em 28/10/2026 o projeto `ymrrguubkqbxndhoxhor` foi atualizado via Management API de configuração do Supabase para `disable_signup: true`; `GET /auth/v1/settings` confirmou o valor. `mailer_autoconfirm: false`. O login de contas existentes permanece disponível.
- **Validade do link de definição de senha** (`recovery`): é a mesma configuração **Email OTP Expiration** do convite.
- **Secure password change** (exigir reautenticação para trocar a senha): se ligado, a definição da senha por sessão com mais de 24 h falha; o administrador reenvia um link novo. Conferir o valor.
- **Política de senha** do projeto (tamanho mínimo, caracteres exigidos, senhas vazadas): vale por cima do mínimo de 8 da tela; a tela traduz "senha fraca".

Trocar para a URL publicada = alterar o segredo `APP_BASE_URL`. Não há origem fixa no código.

**Teste local:** o link só abre no computador em que o aplicativo está rodando (`http://localhost:5173`). Para outras pessoas abrirem, publique o aplicativo e troque a origem.

## Estado remoto e publicação

Projeto de destino: `ymrrguubkqbxndhoxhor` (produção, dados reais). Em uma rodada anterior, as quatro migrations `20261028100000`–`20261028130000` foram aplicadas individualmente e o diagnóstico final retornou `OK` em todos os 19 itens; a função `admin-usuarios` foi publicada na versão 21 com `verify_jwt=true`. **A migração SMTP `20261028140000_smtp_direto_email.sql` e as versões SMTP das Edge Functions ainda são alterações locais e não foram publicadas.**

O histórico remoto antes continha só `20260828171717`; as quatro versões de convites agora estão registradas, mas as versões intermediárias anteriores continuam sem registro. Não use `supabase migration up` geral antes de reconciliar esse histórico; ele pode reaplicar migrations antigas. Nenhum pacote SQL completo foi executado.

Naquela rodada, `disable_signup=true`, `Site URL=http://localhost:5173`, Redirect URL `http://localhost:5173/definir-senha`, `APP_BASE_URL=http://localhost:5173` e `CONVITE_TRANSPORTE=simulado` foram conferidos. Os secrets SMTP e a saída TCP do runtime hospedado não foram validados nesta mudança. O front-end foi validado localmente, mas não publicado nesta mudança.

Projeto vinculado ao repositório: `supabase/.temp/project-ref` — o `.env` do front-end avisa que é o mesmo projeto de produção. Trate qualquer mudança adicional como alteração em produção, com janela e responsável.

**0. Conferir (somente leitura) em cada destino antes de qualquer mudança futura.**

1. No SQL Editor do banco de destino, rode `supabase/VERIFICAR_PUBLICACAO_CONVITES.sql`. Cada linha `FALTA` aponta a migration que cobre o objeto.
2. Compare o histórico de migrations com a lista de `docs/homologacao-logistica-reversa.md` (seção "Banco de destino"). Ausência no histórico **não prova** ausência no schema se algo foi aplicado pelo Editor; vale o resultado do passo 1 e o de `VERIFICAR_BANCO.sql`.
3. Confira `GET https://<ref>.supabase.co/auth/v1/settings` (`disable_signup`).

**1. Migrations ausentes, uma a uma, na ordem do nome do arquivo, e só as ausentes.** Não reaplique o pacote `SQL_EDITOR_SETUP_NC_REVERSA.sql` nem a base. Dependências entre elas:

| Migration | Para quê | Depende de |
| --- | --- | --- |
| cadeia anterior, se faltar (inclui `20261023190000_aprovadores_empresa_setor.sql`: `reversa_aprovadores_setor`) | base do escopo de aprovação que o cadastro por tela grava | — (reconciliar conforme `homologacao-logistica-reversa.md`) |
| `20261028100000_acesso_por_tela_cadastro.sql` | **entrega de permissões por tela**: `is_mestre()`, escopo de consulta sem o atalho `usuarios`, RPCs `admin_acesso_aprovacao_usuario` e `admin_salvar_escopo_aprovacao_usuario`. A Edge Function nova **chama** essas RPCs (criar/atualizar usuário com escopo) | cadeia acima |
| `20261028110000_convites_acesso.sql` | tabela `convites_acesso` e as 5 funções de convite | `20261028100000` (não por objeto, mas pela ordem de publicação do cadastro) |
| `20261028120000_convite_senha_pendente.sql` | `convite_senha_pendente()` e a regra de reenvio para quem abriu o convite sem definir a senha | `20261028110000` |
| `20261028130000_bloquear_operacao_sem_senha_convite.sql` | bloqueia permissões de banco/RPC para a sessão de convite até definir senha | `20261028120000` |

Aplicar **só** `20261028110000` não basta: sem `20261028100000` a função nova falha ao gravar o escopo de aprovação; sem `20261028120000` a página não retoma a senha e o reenvio para "senha não definida" é recusado; sem `20261028130000` o banco ainda não bloqueia operações para a sessão pendente. Repita o passo 0.1 e confirme **nenhuma linha `FALTA`** antes de seguir.

**2. Configuração do Supabase Auth** (painel; nada no código): desligar o cadastro público; Site URL e Redirect URLs (`http://localhost:5173/definir-senha` e, na publicação, `https://<origem-publicada>/definir-senha`); conferir **Email OTP Expiration**, **Secure password change** e a política de senha (seção "Configuração no Supabase").

**3. Publicar `admin-usuarios`**: `supabase functions deploy admin-usuarios --project-ref <ref>`. Só **depois** do passo 1 completo: a versão nova chama RPCs que só existem após as migrations. A ação legada `create` continua funcionando. Sem nenhum segredo de convite, a função **salva o cadastro e não envia nada** (estado "preparado").

**4. Secrets dos convites** (`supabase secrets set --env-file <arquivo fora do repositório>`; não deixar valores no histórico do shell): `APP_BASE_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_FROM` e `SMTP_PASS` (somente pelo armazenamento seguro). `CONVITE_TRANSPORTE` é independente e deve continuar `simulado` até validar SMTP e habilitar um único teste. As notificações usam `NOTIFICACAO_EMAIL_TRANSPORTE`, também independente. Não altere `ETIQUETA_TRANSPORTE` nem o agendamento.

**5. Front-end local**: `npm run dev` (origem `http://localhost:5173`). O `.env` aponta para o projeto de produção: use **somente conta fictícia** e não envie convite a pessoa real. A rota `/definir-senha` e a tela de usuários já estão no código; sem a migration `20261028120000` a retomada pela sessão simplesmente não encontra convite pendente (sem erro na tela).

**6. SMTP**: antes de habilitar qualquer envio, confirmar saída TCP/STARTTLS do runtime hospedado para `smtp.office365.com:587`, SMTP AUTH e o método permitido pelo tenant, e autorização Send As de `nao-responda@azime.com.br` para `chamados@azime.com.br`. A implementação atual usa usuário e senha; se o tenant exigir OAuth, não afrouxe as políticas: OAuth SMTP precisa ser preparado antes do teste. Consulte [`envio-email-smtp.md`](./envio-email-smtp.md).

**7. Teste futuro único**: após validação do runtime, SMTP AUTH, Send As, redirects e secrets, habilitar somente `CONVITE_TRANSPORTE=smtp` e enviar um único convite à caixa corporativa controlada previamente escolhida. Confirmar a definição de senha, o login e o bloqueio de acesso antes da senha. Não reenviar resultado SMTP indeterminado sem reconciliação explícita.

**Desfazer**: voltar `CONVITE_TRANSPORTE` para `simulado` desabilita somente convites; voltar `NOTIFICACAO_EMAIL_TRANSPORTE` para `simulado` desabilita somente o e-mail da fila. Não altere `ETIQUETA_TRANSPORTE` nem o agendamento. As migrations são aditivas; reverta o código por publicação coordenada, sem descartar o histórico SMTP.

## O que ainda depende de serviços reais

Não provado localmente: o comportamento do `generateLink`/`verifyOtp`/`updateUser` no projeto (códigos de erro reais, validade, política mínima de senha), a conectividade SMTP do runtime publicado, a aceitação de autenticação e remetente no Microsoft 365, a entrega na caixa, e o efeito de scanners reais de e-mail.

## Limitações conhecidas

- **Convite aberto, senha não definida:** tratado (retomada pela sessão e link de definição de senha, seção "Interrupção na definição da senha"). Não provado contra o Supabase Auth real: o `recovery` por `generateLink` para conta confirmada sem senha, o `verifyOtp` com `type=recovery` e o `updateUser` sem senha anterior estão conferidos no código-fonte do GoTrue, não num projeto. Se a opção "Secure password change" do projeto exigir reautenticação (sessão com mais de 24 h), o `updateUser` falha: a mensagem genérica aparece e o administrador reenvia um link novo.
- Expirado, usado e substituído são indistinguíveis para o usuário (o Supabase devolve o mesmo erro).
- A senha tem mínimo de **8** caracteres na tela; o Supabase aplica a política do projeto por cima.
- A ação `create` (administrador define a senha) continua existindo no backend por compatibilidade, mas a tela de usuários **não a usa mais** para novos usuários.
- A implementação SMTP desta etapa não foi publicada nem usada para envio real; o canal Teams das notificações permanece pendente de integração substituta.
