# Formulário de Logística Reversa — Documentação Técnica

Sistema para registrar as **não conformidades (NCs)** da Expedição e acompanhar as solicitações de devolução (logística reversa) das empresas **Alinare** e **Novitah**. Uma reversa pode ser vinculada a uma NC, mas o vínculo é opcional. Frontend React + TypeScript + Vite, backend **Supabase (PostgreSQL)**.

---

## Stack Tecnológica


| Camada         | Tecnologia                 | Versão |
| -------------- | -------------------------- | ------ |
| Runtime        | Node.js                    | 20+    |
| Build          | Vite                       | 8.x    |
| Framework      | React                      | 19.x   |
| Linguagem      | TypeScript                 | 6.x    |
| Estilização    | Tailwind CSS               | 4.x    |
| Roteamento     | React Router               | 7.x    |
| Formulários    | React Hook Form            | 7.x    |
| Validação      | Zod                        | 3.x    |
| Gráficos       | Recharts                   | 3.x    |
| Autenticação   | Supabase Auth (JWT nativo) | 2.x    |
| Banco de Dados | Supabase / PostgreSQL      | 2.x    |
| Planilhas      | SheetJS (xlsx)             | 0.18.x |
| Lint           | Oxlint                     | 1.x    |


**Dependências principais** (`package.json`):

```json
{
  "dependencies": {
    "@hookform/resolvers": "^5.7.1",
    "@supabase/supabase-js": "^2.112.3",
    "lucide-react": "^1.31.0",
    "react": "^19.2.8",
    "react-datepicker": "^9.1.0",
    "react-dom": "^19.2.8",
    "react-hook-form": "^7.85.0",
    "react-hot-toast": "^2.6.0",
    "react-router-dom": "^7.18.2",
    "recharts": "^3.10.1",
    "xlsx": "^0.18.5",
    "zod": "^3.25.76"
  }
}
```

---

## Arquitetura

```
src/
├── App.tsx                    # Roteamento + providers
├── main.tsx                   # Entry point
├── components/
│   ├── admin/                 # Dashboard, listas, gráficos, Kanban, detalhe + etiqueta da reversa
│   ├── auth/                  # ProtectedRoute
│   ├── forms/                 # ReverseLogisticsForm (vínculo opcional com NC)
│   └── nc/                    # NC: reversas da NC, linha do tempo, importação, resumo do dashboard
├── context/
│   └── AuthContext.tsx        # Estado global de autenticação
├── hooks/
│   ├── useSolicitacoes.ts     # Data fetching + cache + polling
│   └── useNaoConformidades.ts # NCs + listas
├── lib/
│   ├── supabase.ts            # Cliente Supabase (singleton)
│   ├── perfil.ts              # Navegação e permissões por telas
│   ├── ncCalculos.ts          # Fórmulas da planilha de NC (REGISTRO_NC / PAINEL_NC)
│   └── ncPlanilha.ts          # Importação/exportação da aba REGISTRO_NC
├── pages/                     # Páginas (Login, Dashboard, Formulários, NC, etc)
├── schemas/
│   ├── formSchema.ts          # Validação Zod do formulário de reversa
│   └── ncSchema.ts            # Validação Zod da NC
├── services/
│   ├── apiService.ts          # CRUD solicitacoes_reverso + etiqueta (storage)
│   ├── ncService.ts           # NCs, listas, linha do tempo, importação
│   └── authService.ts         # Supabase Auth (signIn, sessão, JWT)
└── types/
    └── index.ts               # Tipos compartilhados (Solicitacao, NC, Usuario, Tela)

supabase/
├── functions/
│   ├── admin-usuarios/        # Edge Function CRUD auth.users (service_role)
│   └── correios-rastreio/     # Edge Function de rastreio (API dos Correios)
└── migrations/                # Esquema do banco (aplicar em ordem)
```

**Padrão de camadas**:

```
Component → Service (apiService/authService) → Supabase Client → PostgreSQL
```

Componentes **nunca** acessam banco diretamente.

---

## Banco de Dados (PostgreSQL via Supabase)

### Tabela `solicitacoes_reverso`


| Coluna                         | Tipo          | Descrição                                                  |
| ------------------------------ | ------------- | ---------------------------------------------------------- |
| `id`                           | `uuid`        | PK, `gen_random_uuid()`                                    |
| `created_at`                   | `timestamptz` | Timestamp de inserção                                      |
| `empresa`                      | `text`        | `'Alinare'` | `'Novitah'`                                  |
| `data_solicitacao`             | `date`        | Data da solicitação (YYYY-MM-DD)                           |
| `solicitante`                  | `text`        | Nome do solicitante interno                                |
| `setor`                        | `text`        | Setor (ex: 'Comercial Alinare')                            |
| `codigo_cliente`               | `integer`     | Código numérico da cliente                                 |
| `nome_cliente`                 | `text`        | Nome completo da cliente                                   |
| `endereco_postagem`            | `text`        | Endereço para devolução                                    |
| `motivo`                       | `text`        | Motivo (enum: Peça com defeito, Mercadoria errada, ...)    |
| `justificativa_outros`         | `text`        | Obrigatório quando motivo = 'Outros'                       |
| `autorizacao`                  | `text`        | Nome do autorizador                                        |
| `status`                       | `text`        | `'pendente' | 'etiqueta_gerada' | 'postado' | 'concluido'` |
| `etiqueta_gerada_em`           | `timestamptz` | Quando a etiqueta foi gerada (Expedição)                   |
| `postado_em`                   | `timestamptz` | Quando a cliente postou a mercadoria (Comercial)           |
| `concluido_em`                 | `timestamptz` | Quando a solicitação foi finalizada (Expedição)            |
| `anotacoes`                    | `text`        | Campo livre para anotações internas                        |
| `tempo_preenchimento_segundos` | `integer`     | Tempo de preenchimento do formulário                       |


**Índices**:

```sql
CREATE INDEX idx_solicitacoes_empresa_data ON solicitacoes_reverso (empresa, data_solicitacao DESC);
CREATE INDEX idx_solicitacoes_status ON solicitacoes_reverso (status);
```

### Usuários (Supabase Auth + Edge Function)

Usuários existem em `auth.users` (Supabase Auth). Campos usados pelo app:


- `telas` (`app_metadata`): telas permitidas (ex.: `['lista-geral', 'nc-edit']`). Só o service_role grava.
- `nome` (`user_metadata`): nome completo.
- `usuario` (`user_metadata`): login único (username).

> **Segurança**: `user_metadata` pode ser alterado pelo próprio usuário (`supabase.auth.updateUser({ data })`). Por isso as permissões ficam em `app_metadata`: RLS, Edge Function e frontend leem as telas de lá. O banco lê as telas direto de `auth.users` a cada consulta (não do token): liberar ou revogar uma tela vale na hora. Usuário sem telas cai na página "Sem acesso".


**Senha**: NUNCA armazenada/acessada pelo app. Hash gerenciado 100% pelo Supabase Auth (bcrypt/argon2 interno). Login via `signInWithPassword(email, senha)` → JWT + refresh token.

CRUD admin via Edge Function `admin-usuarios` (service_role, só ADMIN chama — conferido por `app_metadata`):

- `create`: cria em `auth.users` com `app_metadata.telas` e `user_metadata` (nome, usuário)
- `update`: perfil, telas, empresas e escopo de aprovação (`app_metadata` e `reversa_aprovadores_setor`), nome/login (`user_metadata`), opcional senha/email; ninguém remove a própria gestão de usuários. Regra oficial em [`docs/cadastro-de-usuarios-por-tela.md`](docs/cadastro-de-usuarios-por-tela.md): marcar uma tela concede as operações dela, no escopo informado no mesmo cadastro
- `delete`: remove de `auth.users` (nem a própria conta nem o administrador padrão)
- `list`: lista até 1000 usuários via `auth.admin.listUsers()`

O **administrador padrão** é a conta `admin@cr.internal` (login `admin`): login e telas fixos, não pode ser removido. É identificado pelo e-mail, não pelo `user_metadata`.

---

## Telas de Acesso (Permissões Granulares)

Substituíram perfis legados. Cada usuário recebe um array `telas` em `app_metadata` (JWT):


| Tela                 | Descrição                         | Empresa (escopo) |
| -------------------- | --------------------------------- | ---------------- |
| `dashboard-geral`    | Dashboard (todas empresas)        | Ambas            |
| `dashboard-alinare`  | Dashboard (Alinare)               | Alinare          |
| `dashboard-novitah`  | Dashboard (Novitah)               | Novitah          |
| `formulario-alinare` | Formulário Alinare                | Alinare          |
| `formulario-novitah` | Formulário Novitah                | Novitah          |
| `lista-geral`        | Lista de solicitações (Expedição) | Ambas            |
| `lista-alinare`      | Lista (Alinare)                   | Alinare          |
| `lista-novitah`      | Lista (Novitah)                   | Novitah          |
| `status-geral`       | Status (Comercial vê tudo)        | Ambas            |
| `status-alinare`     | Status (Alinare)                  | Alinare          |
| `status-novitah`     | Status (Novitah)                  | Novitah          |
| `kanban`             | Kanban (visão geral do fluxo)     | Ambas            |
| `kanban-edit`        | Kanban: mover cards entre etapas  | Ambas            |
| `nc`                 | NC: consultar registros e painel  | Todas            |
| `nc-edit`            | NC: registrar e gerar reversa     | Todas            |
| `usuarios`           | Administração de usuários (Admin) | Ambas            |


Definidos em `src/types/index.ts` → `Tela`, `TELAS`, `TELA_LABEL`. As telas `status-*` são legado: continuam valendo no banco, mas não aparecem no cadastro de usuários. As regras do banco espelham `src/lib/perfil.ts` (`podeVerNc`, `podeEditarNc`, `podeOperarReversa`).

No banco, cada operação em reversas tem o seu escopo de empresas (funções da migration de permissões):

| Operação | Libera as duas empresas | Libera só a empresa da tela | Função |
| --- | --- | --- | --- |
| Ver reversa e etiqueta | perfil mestre, telas `*-geral`, `kanban`, `kanban-edit`, `nc`, `nc-edit` | `dashboard-*`, `formulario-*`, `lista-*`, `status-*` | `empresas_permitidas()` |
| Cadastrar reversa | perfil mestre, `nc-edit` | `formulario-*` | `empresas_formulario()` |
| Movimentar (anotações, rastreio, etiqueta) | perfil mestre | `formulario-*` e, com a empresa em `empresas_acesso`, `aprovar-reversa`, `emitir-etiqueta`, `confirmar-checkin` | `empresas_operaveis()` |
| Apagar reversa | admin | — | `is_admin()` |

Consultar NC (`nc`) mostra reversas das duas empresas, mas não dá escrita: quem tem `lista-alinare` + `nc` só movimenta reversas da Alinare.

---

## Fluxo de Status

```
(NC opcional) ──► reversa: pendente → etiqueta_gerada → postado → em_transito → concluido
```


| Status            | Quem move                                | Onde            | Timestamp            |
| ----------------- | ---------------------------------------- | --------------- | -------------------- |
| `pendente`        | — (criação)                              | Formulário      | —                    |
| `etiqueta_gerada` | **Expedição** (`lista-*`)                | Lista / Kanban  | `etiqueta_gerada_em` |
| `postado`         | **Comercial** (`status-*` sem `lista-*`) | Status / Kanban | `postado_em`         |
| `em_transito`     | Rastreio dos Correios (automático)       | Kanban          | `em_transito_em`     |
| `concluido`       | **Expedição** (`lista-*`)                | Lista / Kanban  | `concluido_em`       |


- **Admin** (`usuarios`) pode mover em qualquer direção
- **Expedição** (tela `lista-*`) → `pendente→etiqueta_gerada`, `postado→concluido`
- **Comercial** (tela `status-*` **sem** `lista-*`) → `etiqueta_gerada→postado`
- **Etiqueta**: anexar o PDF da etiqueta numa reversa pendente a move para `etiqueta_gerada`
- **Origem**: a reversa pode ser criada sem NC; quando vinculada, a NC deve ser aberta e da mesma empresa

---

## Não conformidades (NC)

Registro das ocorrências da Expedição, com ou sem reversa, no lugar da planilha "Análise de não conformidades — Expedição". Telas: **Não conformidades** (`/admin/nc`), **Painel de NC** (`/admin/nc/painel`) e **Listas de NC** (`/admin/nc/listas`, só admin).

### Campos (aba REGISTRO_NC)

Os 36 campos da planilha, nos mesmos grupos: Identificação, Classificação, Ocorrência e resolução, Valor real, Custo da não conformidade, Esforço e status. Obrigatórios: data da ocorrência, empresa / contrato e origem — sem eles a NC não entra no painel, como na planilha.

Campos calculados (no banco: colunas geradas e `vw_nao_conformidades`; na tela: `src/lib/ncCalculos.ts`):

- **ID**: `NC-0001`, sequencial e fixo (na planilha era o número da linha e mudava ao ordenar). NC-0001 a NC-0025 ficam para o histórico importado; as novas começam em NC-0026. O banco atribui o número (só a importação do admin escolhe), e uma gravação recusada consome o número, então pode haver saltos.
- **Área responsável** e **Evitável internamente?**: vêm da origem (lista de origens); sem correspondência, "A definir" / "A avaliar".
- **Custo total**: produto + frete adicional + multa/outros (vazio se nenhum custo foi informado).
- **Custo líquido**: custo total − valor reembolsado pelos Correios.
- **Dias em aberto**: (encerramento ou hoje) − (identificação ou ocorrência).
- **Linha do tempo**: gravada pelo banco (registro, status, campos alterados, reversas geradas e as etapas delas) + anotações dos usuários.

### Listas (aba LISTAS_NC)

Origens (com área e "evitável"), áreas, tipos de saída, resoluções, empresas / contratos (Alinare, Artikler, Azime, Trice, Novitah, A identificar), como foi identificada e reembolso. O admin edita em **Listas de NC**; valores são desativados, não apagados, e renomear uma origem atualiza as NCs que a usam. Os status da NC são fixos: Aberta, Em tratativa, Encerrada, Cancelada.

### NC → reversa

- Uma NC pode gerar várias reversas. `nc_id` é opcional; quando informado, a reversa deve ser da mesma empresa e a NC precisa estar Aberta ou Em tratativa. Reversas antigas ficam com `legado = true`; novas reversas sem NC não são marcadas como legado. `legado` e `nc_numero` são preenchidos pelo banco.
- Depois que a NC gera reversa, a empresa dela não muda mais. Reversas de uma NC encerrada continuam andando normalmente.
- **Gerar reversa** (na tela da NC) abre o formulário da empresa com a NC já selecionada. Disponível para Alinare e Novitah, com a NC Aberta ou Em tratativa.
- O formulário oferece, opcionalmente, as NCs abertas da mesma empresa (função `ncs_para_reversa`, sem expor custos).

### Painel (aba PAINEL_NC)

Mesmos filtros (data inicial/final, ano da visão mensal), indicadores e tabelas da planilha — por origem, área, empresa, tipo de saída, resolução e mês —, mais a quebra por status da NC e a proporção de NCs que geraram reversa. O Dashboard mostra um resumo com o mesmo período.

### Importação e exportação

- **Importar planilha** (admin, em Não conformidades): lê a aba REGISTRO_NC no navegador, mantém o ID da planilha, ignora NCs já importadas e lista as linhas que não entram: data ou valor inválido, valor fora das listas, ID repetido no arquivo ou ID já usado por uma NC registrada no sistema (outra ocorrência — registre essa linha como NC nova). A "Linha do tempo" da planilha vira anotação. Os dados de clientes não passam pelo repositório.
- **Exportar XLSX**: as 36 colunas no layout da REGISTRO_NC + reversas geradas.

### Tabelas novas

- `nao_conformidades`, `nc_origens`, `nc_listas`, `nc_historico` e a view `vw_nao_conformidades`.
- `solicitacoes_reverso` ganhou `nc_id`, `nc_numero`, `legado`, `etiqueta_path`, `etiqueta_nome` e `etiqueta_enviada_em`.
- Storage: bucket privado `etiquetas` (só PDF, até 5 MB), caminho `<id da reversa>/<arquivo>.pdf`.

## Etiqueta de postagem

No detalhe da reversa, seção **Etiqueta de postagem**: anexar, substituir e remover o PDF (quem movimenta reversas daquela empresa — veja a tabela em "Telas de Acesso"). Quem vê a reversa abre o PDF por link temporário (60 s). Anexar numa reversa pendente a move para "Etiqueta Gerada". Ao apagar uma reversa (admin), os PDFs dela saem antes do registro.

---

## Configuração de Ambiente

Crie `.env` na raiz (baseado em `.env.example`):

```env
# Supabase (obrigatório)
VITE_SUPABASE_URL=https://[[ORCA_RICH_MD:de5f6ef2e3ca4a18792719dd005085be:inline-html:%3Cseu-projeto%3E]].supabase.co
VITE_SUPABASE_ANON_KEY=[[ORCA_RICH_MD:de5f6ef2e3ca4a18792719dd005085be:inline-html:%3Canon-key%3E]]

# Opcional: para importação de planilhas Excel
# VITE_IMPORT_API_URL=
```

**Obter credenciais**: Supabase Dashboard → Settings → API → Project URL / anon public key.

---

## Scripts Disponíveis

```bash
npm run dev      # Servidor de desenvolvimento (Vite + HMR)
npm run build    # Build produção (tsc + vite build)
npm run lint     # Oxlint (rápido, sem type-check)
npm run preview  # Preview do build local
npm run test     # Vitest (unit + integration)
```

---

## Estrutura de Dados (TypeScript)

Tipos principais em `src/types/index.ts`:

```typescript
type Empresa = 'Alinare' | 'Novitah';

export const STATUS_SOLICITACAO = [
  'pendente',
  'etiqueta_gerada',
  'postado',
  'concluido',
] as const;

export type StatusSolicitacao = typeof STATUS_SOLICITACAO[number];

interface Solicitacao {
  id: string;
  created_at: string;           // ISO 8601
  empresa: Empresa;
  data_solicitacao: string;     // YYYY-MM-DD
  solicitante: string;
  setor: string;
  codigo_cliente: number;
  nome_cliente: string;
  endereco_postagem: string;
  motivo: string;
  justificativa_outros?: string | null;
  autorizacao: string;
  status: StatusSolicitacao;
  etiqueta_gerada_em?: string | null;
  postado_em?: string | null;
  concluido_em?: string | null;
  anotacoes?: string | null;
  tempo_preenchimento_segundos: number;
}

type CreateSolicitacaoPayload = Omit<Solicitacao, 'id' | 'created_at'>;
type UpdateSolicitacaoPayload = Partial<Omit<Solicitacao, 'id' | 'created_at'>>;

interface FiltrosSolicitacoes {
  empresa?: Empresa | 'Ambas';
  dataInicio?: string;   // YYYY-MM-DD
  dataFim?: string;      // YYYY-MM-DD
  status?: StatusSolicitacao | StatusSolicitacao[];
  buscaCliente?: string;
}
```

---

## Validação do Formulário (`src/schemas/formSchema.ts`)

Zod com `superRefine` para regra condicional:

- `justificativa_outros` **obrigatório** apenas quando `motivo === 'Outros'`
- Sanitização anti-XSS em campos de texto (`replace(/<[^>]*>?/gm, '')`)
- Limites de tamanho: solicitante 100, nome_cliente 150, endereço 300, justificativa 500

---

## Autenticação

**Fluxo**:

1. `LoginPage` → `authService.login(usuario, senha)`
2. `authService` transforma login em `{usuario}@cr.internal`
3. Chama `supabase.auth.signInWithPassword` (banco de dados Supabase nativo)
4. Sucesso → JWT e refresh token salvos (SDK Supabase). As telas vêm de `app_metadata.telas`; `nome` e `usuario`, de `user_metadata`. Sem telas, o usuário vai para a página "Sem acesso".
5. `AuthProvider` escuta mudanças de sessão via `onAuthStateChange` e popula o contexto React. Ao abrir o app, `getSessao` busca o usuário no servidor (`getUser`): telas alteradas pelo admin aparecem ao recarregar a página, sem novo login.

**Segurança**: Senhas são processadas e hasheadas nativamente pelo Supabase (não transitam no seu backend, e o DB não as guarda em texto plano). Sessão flui via JWT HttpOnly/Secure ou localStorage (gerenciado pelo JS client do Supabase).

---

## Importação de Dados (Excel)

Funcionalidade em `src/services/analytics.ts` / `apiService.ts`:

- Lê `.xlsx` via `SheetJS (xlsx)`
- Mapeia colunas → `CreateSolicitacaoPayload`
- Insere em lote via `supabase.from('solicitacoes_reverso').insert()`

**Colunas esperadas na planilha**:

```
Empresa | Data Solicitação | Solicitante | Setor | Código Cliente | Nome Cliente | Endereço Postagem | Motivo | Justificativa Outros | Autorização | Status | Etiqueta Gerada Em | Postado Em | Concluido Em | Anotações | Tempo Preenchimento (s)
```

---

## Dashboard, Kanban &amp; Gráficos (`src/components/admin/`)


| Componente           | Biblioteca             | Dados                                                            |
| -------------------- | ---------------------- | ---------------------------------------------------------------- |
| `ChartEmpresa`       | Recharts (PieChart)    | Distribuição por empresa                                         |
| `ChartMotivo`        | Recharts (BarChart)    | Top motivos                                                      |
| `ChartTimeline`      | Recharts (LineChart)   | Solicitações por dia                                             |
| `ChartAutorizador`   | Recharts (BarChart)    | Por autorizador                                                  |
| `ChartMotivoEmpresa` | Recharts (Grouped Bar) | Motivo × Empresa                                                 |
| `SummaryCards`       | —                      | 5 KPIs (Total, Pendentes, Etiqueta Gerada, Postados, Concluídos) |
| `KanbanPage`         | — (botões, sem DnD)    | 4 colunas por status                                             |


Dados via `useSolicitacoes.ts` (hook com cache, polling 15s e invalidação).

---

## Deploy

### Railway (produção)

O frontend é publicado pelo `Dockerfile`: `node:22-alpine` faz o build e `nginx:alpine` serve o `dist` na porta informada pela variável `PORT` do Railway, com fallback de SPA (`nginx.conf`) e health check em `/healthz`. Variáveis obrigatórias (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), procedimento de publicação e verificações estão em [docs/RAILWAY.md](docs/RAILWAY.md).

### Ordem de deploy da versão com NC e fluxo de aprovação por setor

O banco é o de produção. Rode cada arquivo inteiro no **SQL Editor** do Supabase, nesta ordem (todos podem ser executados de novo sem efeito colateral):

1. **Rotacione as chaves expostas no histórico público do git**: em Project Settings, gere uma nova `service_role` (ou desative a legada) e troque a senha do banco (Database → Reset database password).
2. Publique a Edge Function `admin-usuarios` (`npx supabase functions deploy admin-usuarios --project-ref ymrrguubkqbxndhoxhor`, ou cole o código no painel em Edge Functions). A versão nova só confia em `app_metadata`; até o passo 3 ninguém consegue gerenciar usuários, então siga direto.
3. `supabase/migrations/20261020130000_permissoes_app_metadata.sql` — copia as telas para `app_metadata` e troca o RLS. O último resultado é a **auditoria das telas**: confira quem ficou com `usuarios` (admin) e se há contas desconhecidas, porque `user_metadata` era editável pelo próprio usuário. O frontend antigo continua funcionando.
4. `supabase/migrations/20261020130100_nao_conformidades.sql`, `supabase/migrations/20261020130200_etiqueta_reversa.sql`, `supabase/migrations/20261021120000_reversa_nc_opcional.sql` e `supabase/migrations/20261021130000_setores_fluxo_reverso.sql`.
   A última migration libera as filas de aprovação, emissão de etiqueta e check-in conforme o setor e as empresas selecionadas. Sem ela, um aprovador pode entrar na tela, mas o RLS não retorna chamados nem da Alinare nem da Novitah.
   Em vez dos passos 3 e 4, dá para rodar `supabase/SQL_EDITOR_SETUP_NC_REVERSA.sql`, que junta as migrations.
   Se o banco já está atualizado e falta apenas liberar reversas sem NC, rode `supabase/SQL_EDITOR_NC_OPCIONAL.sql`.
5. Publique o frontend no Railway para disponibilizar as telas de NC e o fluxo de aprovação por setor.
6. Grave a nova `service_role` no Vault e reagende o cron com `src/sql/setup_cron_rastreio.sql` (instruções no próprio arquivo).
7. Peça a todos para recarregar o sistema: o app novo relê as telas no servidor ao abrir.
8. Em Usuários, libere as telas de NC: Expedição → `nc-edit`; gestão → `nc` (ou `nc-edit`).
9. Em Não conformidades → **Importar planilha** (admin), importe a planilha de NC para trazer o histórico.
10. Opcional, depois de validar: limpe as telas antigas de `user_metadata`:
    `update auth.users set raw_user_meta_data = raw_user_meta_data - 'telas' - 'perfil';`

---

## Rastreamento Correios (API Oficial)

### Visão Geral

O sistema consulta a API oficial dos Correios (SRO — Rastreamento de Objetos) para atualizar automaticamente o status das solicitações que possuem código de rastreio.

### Arquitetura do Rastreamento

```
Frontend (KanbanPage / RecordDetailModal)
       │
       ▼
apiService.atualizarRastreioLote() / atualizarRastreio(codigo)
       │
       ▼
Supabase Edge Function: `correios-rastreio` (Deno)
       │
       ├─► Busca token OAuth 2.0 (Basic Auth: usuario:senha)
       │    Endpoint: POST https://api.correios.com.br/token/v1/autentica/cartaopostagem
       │
       └─► Consulta rastreio por código
            Endpoint: GET https://api.correios.com.br/srorastro/v1/objetos/{codigo}?resultado=T
```

### Empresas / Contratos Configurados (4 contas)

O sistema suporta **múltiplos contratos/CNPJs** simultâneos. Cada "empresa" no `.env` / Supabase Secrets tem suas próprias credenciais (usuario, senha, cartão de postagem). Ao consultar um código, a Edge Function itera nas 4 contas até achar a dona do pacote.


| Prefixo ENV | Empresa (CNPJ) | Uso                               |
| ----------- | -------------- | --------------------------------- |
| `ALINARE`   | 19679195000176 | Contrato principal (9912398217)   |
| `AZIME`     | 30013070000145 | Contrato secundário (9912666541)  |
| `ARTIKLER`  | 15277597000193 | Contrato terciário (9912529770)   |
| `NOVITAH`   | 29971267000108 | Contrato quaternário (9912459852) |


**Lógica de busca**:

1. Itera `['ALINARE','AZIME','ARTIKLER','NOVITAH']` em ordem
2. Para cada conta: obtém token (cache 24h com margem 60s)
3. Consulta `srorastro/v1/objetos/{codigo}`
4. Se resposta traz `objetos[0].mensagem` contendo **SRO-009** → "não pertence a este contrato" → tenta próxima conta
5. Se achou eventos → **break** (achou o contrato dono)
6. Atualiza tabela `solicitacoes_reverso` (status, timestamps, cidade) + tabela `rastreamento_correios` (eventos completos)
7. Retorna JSON bruto da API pro frontend exibir

**Resultado**: o mesmo código de rastreio funciona independentemente de qual CNPJ postou, sem configuração manual.

### Refresh de Tokens (Simplificado)

- **Cache em memória** na Edge Function (`tokensCache[prefixo]`) com TTL de 24h - 60s
- Na primeira chamada ou se expirado: faz `POST /token/v1/autentica/cartaopostagem` com Basic Auth (`usuario:senha` em Base64)
- Retorno contém `token` (JWT RS512) + `expiraEm` (ISO 8601)
- Cache evita re-autenticar a cada request; validação de expiração é feita no lado do cliente (edge)
- Se 401/403: token pode ter expirado antes do cache → invalida cache e tenta novamente (lógica futura)

### Configuração de Segredos (Supabase Secrets)

```bash
# 4 contas — cada uma com 3 segredos
CORREIOS_USUARIO_ALINARE    CORREIOS_SENHA_ALINARE    CORREIOS_POSTAGEM_ALINARE
CORREIOS_USUARIO_AZIME      CORREIOS_SENHA_AZIME      CORREIOS_POSTAGEM_AZIME
CORREIOS_USUARIO_ARTIKLER   CORREIOS_SENHA_ARTIKLER   CORREIOS_POSTAGEM_ARTIKLER
CORREIOS_USUARIO_NOVITAH    CORREIOS_SENHA_NOVITAH    CORREIOS_POSTAGEM_NOVITAH
```

Comando para atualizar:

```bash
npx supabase secrets set \
  CORREIOS_USUARIO_ALINARE=... \
  CORREIOS_SENHA_ALINARE=... \
  CORREIOS_POSTAGEM_ALINARE=... \
  # ... demais
```

O cron de rastreio (`src/sql/setup_cron_rastreio.sql`) lê a chave do **Supabase Vault** (segredo `correios_cron_service_key`) a cada execução — nunca guarde a chave em arquivo do repositório.

### Fluxo de Uso (Frontend → Backend)


| Ação do Usuário                          | Chamada API                              | O que acontece no Backend                                                            |
| ---------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Salva código no card                     | `apiService.salvarCodigoRastreio()`      | UPDATE card + histórico + dispara `atualizarRastreio(codigo)`                        |
| Clica "Atualizar" / abre "Mais detalhes" | `apiService.atualizarRastreio(codigo)`   | Edge Function itera 4 contas → retorna JSON bruto                                    |
| Abre página Kanban                       | `carregar()` + `atualizarRastreioLote()` | Lote: pega todos `postado/em_transito/etiqueta_gerada` com código → processa em lote |
| Polling 15s (Kanban)                     | `carregar(true)`                         | Só re-lê do banco (não bate em Correios)                                             |


### Mapeamento de Eventos → Status Kanban


| Código Correios | Descrição                    | Status Kanban | Coluna      |
| --------------- | ---------------------------- | ------------- | ----------- |
| `PO`            | Objeto postado               | `postado`     | Postado     |
| `RO` / `OEC`    | Em trânsito / Saiu p/entrega | `em_transito` | Em Trânsito |
| `BDE`           | Entregue ao destinatário     | `concluido`   | Concluído   |
| `FC` / outros   | Etiqueta emitida / outros    | — (ignora)    | —           |


O campo `ultima_cidade_rastreio` é preenchido com `cidade/UF` da unidade do último evento.

### Remoção de Código (Libera para Reuso)

Botão **🗑️** no modal ao lado de "Salvar Código":

- Pede confirmação (`window.confirm`)
- Chama `apiService.removerCodigoRastreio(id, user)`
- Backend: deleta `rastreamento_correios` + seta `codigo_rastreio=null` + `ultima_cidade_rastreio=null` + histórico `"Código de rastreio removido: XXX"`
- Frontend limpa campo, timeline, retorno API, recarrega histórico
- Código fica livre para ser colado em outro card

### Boas Práticas para Novos Devs

1. **Nunca** coloque credenciais no código/front — use Supabase Secrets (`Deno.env.get()` na Edge Function)
2. **Nunca** logue tokens — logs da Edge Function mostram só `pertence=true/false` e contagem de eventos
3. **Sempre** use `apiService` — componentes **nunca** acessam Supabase direto
4. **Token expirou?** A Edge Function trata automaticamente (cache + retry na próxima chamada)
5. **Código dá SRO-009?** Significa que pertence a outro contrato — a Edge Function já tenta as outras 3 contas automaticamente
6. **409 Conflict ao salvar?** Código já existe em outro card → use botão 🗑️ no card antigo ou peça ao time pra apagar

### Performance e Proteção de Cota (Rate Limits)

De acordo com o manual da API dos Correios, não há menções claras sobre limites de requisição. Entretanto, as seguintes estratégias estão implementadas para proteger a saúde da integração:

1. **Memoização do Token**: O endpoint `/token/v1/autentica/cartaopostagem` não é chamado a cada requisição. O JWT gerado dura 24h. A Edge Function mantém um cache em memória (`tokensCache`) e reutiliza o mesmo token para o prefixo da conta durante todo o período, acionando o *refresh* automático apenas quando `agora < expiraEmMs - 60s`.
2. **Short-Circuit em Status Concluído**: Para evitar consumo de cota (e lentidão na UI) processando pacotes finalizados, a Edge Function e o Frontend bloqueiam imediatamente a requisição se `solicitacao.status === 'concluido'`. Uma vez entregue (evento BDE), a API dos Correios não é mais sobrecarregada com este pacote.
3. **Lote Sincronizado Controlado**: O job de atualização em lote (via cronjob ou refresh da tela Kanban) não roda sobre toda a base. Apenas registros com os status intermediários `['etiqueta_gerada', 'postado', 'em_transito']` são selecionados na query, contendo estritamente os pacotes pendentes de resposta logística.

### Testes Automatizados

```bash
npm run test              # Roda tudo (175 testes)
npx vitest run src/test/correios.test.ts src/test/correios-flow.test.ts
```

Cobertura: lógica de eventos (`mapEventoParaStatus`), extração de eventos, fluxo do service (`getRastreio`, `atualizarRastreio`, `salvarCodigoRastreio`, `removerCodigoRastreio`), fluxo de navegação e permissões (`perfil.test.ts`), fórmulas e painel de NC (`ncCalculos.test.ts`), importação/exportação da REGISTRO_NC (`ncPlanilha.test.ts`), validação da NC (`ncSchema.test.ts`), integração completa (inclui formulário exigindo NC).

---

## Manutenção Comum

### Adicionar novo motivo

1. `src/types/index.ts` → array `MOTIVOS`
2. `src/schemas/formSchema.ts` → enum `MOTIVOS` (automático via import)

### Adicionar novo autorizador

1. `src/types/index.ts` → `AUTORIZACOES` record
2. `src/schemas/formSchema.ts` → `todasAutorizacoes` (automático)

### Adicionar novo setor

1. `src/types/index.ts` → array `SETORES`

### Nova tela de acesso

1. `src/types/index.ts` → `Tela` type + `TELAS` + `TELA_LABEL`
2. `src/lib/perfil.ts` → `NAV_MAP` + `ORDEM_NAV` + `ORDEM_NAV_ADMIN` + `telaDaRota`
3. `src/App.tsx` → `ProtectedRoute telas={['nova-tela']}` na rota nova
4. `src/pages/UsuariosPage.tsx` → adicionar grupo checkbox na UI

### Migração de banco (Supabase)

Use **Supabase Migrations** (`supabase migration new`) ou SQL direto no Dashboard → SQL Editor. As migrations ficam em `supabase/migrations/` e são aplicadas em ordem de nome.

Para um ambiente novo, aplique todas em ordem (`20260828171717_remote_commit.sql` é o esquema base). Para atualizar um ambiente com o esquema base já instalado, sem argumentos o script aplica a sequência atual de migrations de permissões, NC, etiqueta e filas operacionais. Com a connection string do banco, rode:

```bash
DATABASE_URL="postgresql://postgres:SENHA@db.<projeto>.supabase.co:5432/postgres" node run-sql-rls.cjs \
  supabase/migrations/20261020130000_permissoes_app_metadata.sql \
  supabase/migrations/20261020130100_nao_conformidades.sql \
  supabase/migrations/20261020130200_etiqueta_reversa.sql \
  supabase/migrations/20261021120000_reversa_nc_opcional.sql \
  supabase/migrations/20261021130000_setores_fluxo_reverso.sql
```

`supabase/SQL_EDITOR_SETUP_NC_REVERSA.sql` é a junção das migrations para colar no SQL Editor. Não edite à mão: ao mudar uma migration, gere a junção de novo.

> **Cadeia completa e atualização:** a lista acima é parcial. A ordem atual das migrations, o que cada uma faz e como atualizar um banco já em uso (sem reaplicar o pacote inteiro) estão em [`docs/migrations.md`](docs/migrations.md) e [`docs/homologacao-logistica-reversa.md`](docs/homologacao-logistica-reversa.md). Comunicação automática, reconciliação e relatórios: [`docs/conclusao-funcional-reverso.md`](docs/conclusao-funcional-reverso.md), configuração SMTP atual em [`docs/envio-email-smtp.md`](docs/envio-email-smtp.md) e [`docs/agendamento-worker-comunicacao.md`](docs/agendamento-worker-comunicacao.md). Os artefatos em `docs/power-automate/` são históricos e não são chamados pelo runtime.

Os scripts antigos `src/sql/create_table.sql` e `src/sql/rls_solicitacoes*.sql` estão obsoletos e abortam se executados: o primeiro apaga a tabela, e os de RLS liam permissões de `user_metadata`.

---

## Troubleshooting


| Problema                                 | Causa                             | Solução                                                                          |
| ---------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------- |
| `Supabase não configurado`               | `.env` ausente ou vars erradas    | Verifique `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`                         |
| Login falha "Usuário ou senha inválidos" | Usuário não existe / senha errada | Admin gerencia senhas na aba de Usuários                                         |
| Gráficos vazios                          | RLS bloqueando SELECT             | Policy `SELECT` para `anon` / `authenticated` na tabela                          |
| Build falha no `tsc`                     | Tipos desatualizados              | `npm install` + verifique `src/types/index.ts` sincronizado com DB               |
| Kanban não carrega / tela cortada        | Height mal calculada              | Ajuste `h-[calc(100dvh-...)]` em `KanbanPage.tsx` por breakpoint                 |
| Botão "Marcar postado" não aparece       | Permissão de tela                 | Usuário precisa de `status-*` **sem** `lista-*` (ou `usuarios`)                  |
| Erro ao salvar anotações                 | Coluna `anotacoes` não existe     | Rode `ALTER TABLE solicitacoes_reverso ADD COLUMN IF NOT EXISTS anotacoes TEXT;` |

Mais casos:

- **"violates row-level security policy" ao enviar ou salvar**: o usuário não tem a tela certa em `app_metadata` para aquela empresa (veja a tabela em "Telas de Acesso"). Libere a tela em Usuários: vale na hora no banco; recarregue a página para o menu atualizar.
- **Usuário cai em "Sem acesso"**: a conta não tem nenhuma tela em `app_metadata` (contas criadas direto no painel do Supabase vêm assim). Libere as telas em Usuários.
- **Detalhe da reversa sem os botões de rastreio, anotações e etiqueta**: o usuário vê a reversa, mas não movimenta reversas daquela empresa (ex.: `lista-alinare` + `nc` abrindo uma reversa da Novitah).
- **Formulário de reversa mostra "Nenhuma NC aberta"**: esse aviso informa que não há NC disponível para vincular. O envio continua permitido sem NC; se quiser registrar o vínculo, crie uma NC Aberta ou Em tratativa da mesma empresa.
- **Botão "Gerar reversa" não aparece**: a NC é de empresa sem formulário (Artikler, Azime, Trice, A identificar), está encerrada/cancelada, ou o usuário não tem o formulário da empresa nem `nc-edit`.
- **"Esta NC já tem reversa vinculada: a empresa / contrato não pode mudar"**: a reversa precisa ser da mesma empresa da NC. Se a empresa estava errada, registre uma NC nova.
- **Importação da planilha pula linhas**: a tela lista linha, campo e motivo (data ou valor inválido, valor fora das listas, ID repetido ou já usado por NC registrada no sistema). Corrija na planilha ou em Listas de NC e importe de novo; as já importadas são ignoradas.


---

## Licença

Uso interno — Alinare / Novitah e Expedição.
