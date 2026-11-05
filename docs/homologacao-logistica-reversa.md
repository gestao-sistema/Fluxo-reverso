# Homologação — logística reversa

## Estado desta preparação

- **Conferência visual feita em modo demonstração** (rodada de estabilização): Edge instalado na máquina, conduzido por script, em desktop (1366×820) e celular (390×844), contra o `vite` local com o Supabase apontado para uma porta sem serviço (nenhuma requisição externa saiu) e dados fictícios. Resultados na seção "Conferência visual realizada". Ela **não** valida o backend real: a demonstração usa um adaptador local e não prova RLS, RPCs, Edge Functions nem envio. O fluxo contra o Supabase real **continua não homologado**.
- O modo Demonstração (somente `vite` em desenvolvimento) usa usuários e dados fictícios no `localStorage` e **não grava no Supabase nem envia mensagens**. **Reiniciar** restaura a massa inicial. Na demonstração, o relatório não registra decisão/postagem confirmada/recebimento manual (pede outra data ou mostra zero) e as comunicações são cinco registros fictícios.
- Nenhum SQL remoto foi executado e o estado do banco de destino não foi consultado. Nenhum deploy foi feito. Nenhuma chamada real a Correios, Power Automate, Outlook ou Teams.
- Resultados dos testes locais desta entrega: ver [`conclusao-funcional-reverso.md`](./conclusao-funcional-reverso.md), seção "Validação executada".

## Roteiro manual por perfil (demonstração)

Use somente dados e PDF fictícios. Não abra o check-in nem acione consulta/rastreamento real.

1. Abra `/login` e escolha **Iniciar demonstração**. Como **Camila Oliveira · Solicitante Alinare**, abra `/admin/alinare` e crie uma solicitação fictícia (NC é opcional; o setor "Expedição" agora existe na lista).
2. Como **Paula Mendes · Aprovação**, abra `/admin/aprovacoes`, expanda a solicitação e rejeite com justificativa. De volta como Camila, confira em `/admin/meus-pedidos` a situação rejeitada e a justificativa.
3. Como Camila, crie outra solicitação. Como Paula, aprove-a (a fila só a remove após sucesso). Como **Bianca Rocha · Emissão de etiqueta**, abra `/admin/etiquetas`, selecione o pedido aprovado e um PDF fictício, revise código de autorização, rastreamento (opcional), data de emissão e validade e confirme.
4. Como Camila, em `/admin/meus-pedidos`, confira códigos separados, datas e histórico; abra/baixe o PDF. A emissão **não** representa postagem ou recebimento.
5. Recuperação de emissão incompleta: use o registro aprovado **Mundo da Moda** e o preparo abaixo.
6. **Links dos avisos** (o que o e-mail/Teams abriria): estando **desconectado**, abra `/admin/meus-pedidos?solicitacaoId=<id de um pedido da Camila>` → é pedido o login e, depois de entrar como Camila, o pedido abre expandido. Repita com `/admin/aprovacoes?solicitacaoId=<id>` como Paula (abre o pedido; com um id que não está na fila aparece o aviso "não está mais aguardando a sua decisão") e `/admin/etiquetas?pedido=<id>` como Bianca. Um perfil sem a capacidade do link cai na própria tela inicial.
7. **Comunicações** (`/admin/comunicacoes`), como **Marina Costa · Administração**: veja cinco registros fictícios; abra o detalhe (correlação, tentativas, erro sanitizado); em um `resultado_indeterminado`, use "Confirmar conclusão" e "Autorizar nova tentativa": justificativa e referência são obrigatórias, a linha muda de situação e o histórico mostra a reconciliação. Com qualquer outro perfil o menu não mostra a página e a rota redireciona.
8. **Recebimento físico depois da entrega dos Correios** (Kanban): como **Diego Santos · Expedição/Kanban** (ou Marina), abra `/admin/kanban`. Os pedidos concluídos **Flor de Lis** e **Ponto Chic** (concluídos pelos Correios, com código de rastreio) mostram "Entrega informada pelos Correios. Recebimento físico ainda não confirmado." e o botão **Confirmar recebimento**. Confirme: o texto do diálogo diz que o pedido **continua Concluído**; depois o botão some e o card permanece em Concluído. Um pedido em trânsito segue pedindo a confirmação com o texto "será movido para Concluído". Quem só consulta (ex.: Camila) não vê o botão. (Na demonstração, "concluído pelos Correios" = concluído com código de rastreio; no banco real, a prova é o histórico "Sistema (Correios)" gravado pelo rastreio.)
9. **Relatórios** (`/admin/relatorios`), como Marina (ou Camila, restrita à Alinare): troque "Filtrar período por" (solicitação ou emissão), informe datas, gere e exporte o XLSX; abra o arquivo e confira que a aba "Recorte" descreve os filtros e que a aba "Pedidos" não contém dados pessoais da cliente.

Preparo **somente local/demo** para o passo 5 (seleciona um pedido aprovado ainda `pendente`; deve ser **Mundo da Moda** após o passo 3):

```js
const sk = 'flowdesk:demo:dados:solicitacoes';
const ek = 'flowdesk:demo:dados:emissoes';
const pedidos = JSON.parse(localStorage.getItem(sk) || '[]');
const pedido = pedidos.find(p => p.aprovacao_status === 'aprovada'
  && p.status === 'pendente' && p.etiqueta_path == null);
if (!pedido) throw new Error('Reinicie o demo e mantenha Mundo da Moda sem emissão antes do preparo.');
pedido.status = 'etiqueta_gerada';
pedido.etiqueta_path = null; pedido.etiqueta_nome = null; pedido.etiqueta_enviada_em = null;
localStorage.setItem(sk, JSON.stringify(pedidos));
const emissoes = JSON.parse(localStorage.getItem(ek) || '[]');
const id = `demo-incompleta-${crypto.randomUUID()}`;
emissoes.unshift({ id, solicitacao_id: pedido.id, sequencia: 1,
  codigo_autorizacao: 'AUT-DEMO-RECUPERAR', codigo_rastreio: null,
  pdf_path: null, pdf_nome: null, emitida_em: null, valida_ate: null,
  substituida_em: null, origem: 'sistema', registrado_por: 'demo-etiquetas',
  registrado_por_nome: 'Bianca Rocha', emissao_anterior_id: null,
  motivo_reemissao: null, motivo_reemissao_detalhe: null, pdf_anexado_em: null });
localStorage.setItem(ek, JSON.stringify(emissoes));
location.reload();
```

Após recarregar, o pedido deve continuar na fila; anexe o PDF fictício e confirme. No `localStorage`, o ID da emissão não muda e passa a haver PDF vinculado.

## Conferência visual realizada (demonstração, Edge, desktop e celular)

Ambiente: `vite` local (modo de desenvolvimento), Supabase apontado para `http://127.0.0.1:9` (sem serviço), requisições externas bloqueadas, dados fictícios, Edge headless conduzido por `playwright-core` instalado **fora** do repositório. É conferência da **tela com o adaptador de demonstração**, não do backend.

| # | Cenário | Resultado observado |
| --- | --- | --- |
| 1 | Criar pedido sem NC | Envio vazio mostra os quatro erros de campo em texto útil e **preserva** o que foi digitado; sem NC selecionada o envio conclui ("Solicitação enviada com sucesso!") |
| 2 | Aprovar por perfil autorizado | Linha expande com dados, anexos, etiqueta e histórico; Aprovar remove o pedido da fila. A conta de administração **não** vê a fila (não é aprovadora cadastrada), como no modelo real |
| 3 | Rejeitar e consultar a justificativa | "Confirmar rejeição" fica desabilitado sem texto; depois, em Meus Pedidos, a justificativa aparece em "Justificativa da rejeição" |
| 4 | Registrar PDF sem rastreamento | Selecionar o PDF abre a conferência (autorização, rastreamento "opcional", datas); salvar só com o PDF registra a emissão |
| 5 | Recuperar emissão parcial | Com o preparo local do roteiro, o pedido **continua na fila**, o código de autorização é preservado e, ao anexar o PDF, a **mesma** emissão recebe o PDF (sem emissão duplicada) |
| 6 | Etiqueta em Meus Pedidos | "Abrir/Baixar etiqueta" e histórico, em desktop e celular, sem corte horizontal |
| 7 | Abrir pedido por link após login | Sem sessão vai a `/login`; depois de entrar, mantém `?solicitacaoId=`; como aprovador, o pedido do link abre expandido (desktop e celular). Outro perfil recebe o aviso "não está mais aguardando a sua decisão" |
| 8 | Registrar postagem | Diálogo "Confirmar postagem?"; depois, Meus Pedidos mostra "Postado nos Correios" |
| 9 | Confirmar recebimento após entrega dos Correios | Botão e aviso no card concluído; diálogo diz que o pedido continua Concluído; foco vai para o diálogo, Escape fecha, depois da confirmação o botão some e o card segue em Concluído. No celular o botão e o diálogo cabem na tela |
| 10 | Reconciliar comunicação indeterminada (simulação) | "Registrar conclusão" fica desabilitado sem justificativa; depois a linha vira "Ação do conector concluída" |
| 11 | Filtrar relatório e exportar o mesmo recorte | 7 solicitações no recorte da Alinare em outubro; o XLSX tem a aba "Recorte" com os mesmos filtros e a aba "Pedidos" com 7 linhas |

Em todas as telas e nos dois tamanhos: sem rolagem horizontal da página e sem requisição externa. Os dois erros de console por página vêm do ambiente isolado (fonte do Google bloqueada de propósito e `favicon.ico` inexistente no servidor de desenvolvimento).

Observações **só do modo demonstração** (não são defeitos do sistema real, mas confundem quem testa): os pedidos de exemplo compartilham o mesmo código `RV-DEMO0000` (os ids fictícios começam todos igual); a aprovação demo grava o histórico duas vezes; o relatório de demonstração não conta a postagem confirmada pelo check-in.

**Não conferido**: leitor de tela (só foco por teclado no diálogo do Kanban), contraste medido, Safari/Firefox, dispositivos reais, e **qualquer comportamento do backend real**.

## Ordem de homologação respeitando as dependências

O que depende do quê (encontrado no código, não herdado de uma lista anterior):

- O **worker** (`comunicacao-etiqueta`) chama `reversa_claim_*`, `reversa_iniciar_*`, `reversa_finalizar_*_v2` e `reversa_contar_*` e lê `motivo`, `data_solicitacao`, `postagem_em` e `transicao_em`, que só existem a partir de `20261027100000`. Publicar o worker **antes** dessa migration envia contratos incompletos.
- O **front-end** novo chama RPCs de `20261027110000` (comunicações), `20261027120000` (relatórios) e `20261027130000` (recebimento físico pendente). Publicá-lo antes das migrations deixa essas telas com erro; o detalhe do pedido tolera a ausência só da última (continua funcionando, sem oferecer a confirmação nos concluídos). **Navegação e jornada atuais** (Expedição direta, sem Kanban/Check-in/Relatórios): [`correcao-de-rumo-fluxo-principal.md`](./correcao-de-rumo-fluxo-principal.md).
- O **agendamento** depende do worker publicado, das extensões `pg_cron`/`pg_net`, dos segredos no Vault e, para envio real, do fluxo do Power Automate configurado. O modo simulado não depende do fluxo.
- A ordem segura é **banco primeiro, front-end depois**. A compatibilidade do banco novo com um front-end anterior às migrations `20261023*` (aprovação, emissões) **não foi testada**; não a presuma.

Sequência (tudo em **homologação**, por quem tem acesso; nenhum passo foi executado aqui):

1. **Identificar** o que já está aplicado (seção "Banco de destino"). Parar se houver drift.
2. **Aplicar somente as migrations pendentes**, em ordem, até `20261027140000` (a última é pré-requisito da Edge Function `correios-rastreio` nova). Não reaplicar o pacote inteiro sobre banco parcialmente atualizado.
3. **Cadastros de teste**: uma conta por perfil (solicitante, aprovador, emissor, check-in/Kanban, gestor, administração) com e-mail corporativo de teste; aprovadores por empresa/setor.
4. **Publicar o front-end** (já compatível com o banco do passo 2) e repetir o roteiro manual da demonstração contra o banco de homologação, uma conta por perfil, incluindo o recebimento físico depois de uma entrega simulada (os Correios reais **não** são chamados: registre a entrega como o rastreio registra, num pedido de teste).
5. **Publicar a Edge Function** `comunicacao-etiqueta` com `ETIQUETA_TRANSPORTE=simulado` e rodar o worker manualmente: a resposta deve ser `modo: simulado` e a fila não deve mudar.
6. **Configurar o Power Automate e a autenticação** (cópia do fluxo, `AppBaseUrl`, OAuth restrito ao principal do worker, conexões Outlook/Teams) e testar o fluxo isolado com os JSONs do guia. Confirmar que **não** é o pacote ZIP antigo de "etiqueta disponível" (incompatível; ver o guia).
7. **Habilitar o transporte real só no ambiente de teste** (`ETIQUETA_TRANSPORTE=power_automate`) e percorrer os eventos, inclusive um `resultado_indeterminado` provocado.
8. **Habilitar o agendamento** só depois de validar envio e recuperação, com o script de habilitar e o de desabilitar à mão.

## Banco de destino — identificar antes de atualizar

O repositório não confirma o estado remoto. A migration base `20260828171717_remote_commit.sql` é um dump de referência e **não entra** no pacote do SQL Editor. **Não reaplique** a base nem o pacote completo sobre um banco que já recebeu qualquer parte da cadeia: a repetição de definições antigas já causou incompatibilidade de assinatura (`42P13`).

Primeiro, no SQL Editor de homologação, confirme se existe o histórico padrão do Supabase:

```sql
select to_regclass('supabase_migrations.schema_migrations') as historico_migrations;
```

Se existir, compare (somente leitura) o histórico com todas as versões locais:

```sql
with local(version) as (values
  ('20260828171717'), ('20261020130000'), ('20261020130100'), ('20261020130200'),
  ('20261021120000'), ('20261021130000'), ('20261021140000'), ('20261022100000'),
  ('20261023100000'), ('20261023110000'), ('20261023120000'), ('20261023130000'),
  ('20261023140000'), ('20261023150000'), ('20261023160000'), ('20261023170000'),
  ('20261023180000'), ('20261023190000'), ('20261023200000'), ('20261026200000'),
  ('20261026210000'), ('20261026220000'), ('20261027100000'), ('20261027110000'),
  ('20261027120000'), ('20261027130000'), ('20261027140000'),
  ('20261028100000'), ('20261028110000'), ('20261028120000'), ('20261028130000')
), remoto as (
  select version from supabase_migrations.schema_migrations
)
select l.version,
       case when r.version is null then 'NAO REGISTRADA' else 'REGISTRADA' end as estado
from local l left join remoto r using (version)
union all
select r.version, 'REGISTRADA SEM ARQUIVO LOCAL'
from remoto r left join local l using (version)
where l.version is null
order by version;
```

Se a tabela não existir, ou se SQL tiver sido aplicado manualmente pelo Editor, ausência no histórico **não prova** ausência no schema. Use `supabase/VERIFICAR_BANCO.sql` e confira também:

- Colunas `solicitado_por`, `aprovacao_status`, `endereco_destino_troca`, `emitida_em`, `valida_ate`; tabelas `reversa_emissoes`, `reversa_emissao_eventos`, `reversa_aprovadores_setor`, `reversa_comunicacoes_etiqueta` (e, após `20261027*`, `reversa_recebimentos_confirmados` e `reversa_comunicacoes_reconciliacoes`).
- RPCs de aprovação/emissão/recebimento, `pode_ler_solicitacao(uuid)`, `empresas_consulta_ampliada()`; e, após `20261027*`, `reconciliar_comunicacao_reversa`, `relatorio_reversa`, `relatorio_reversa_linhas`.
- Políticas vigentes de `solicitacoes_reverso` (SELECT por empresa/autor, INSERT por capacidade), histórico e `storage.objects`; RLS ativo; bucket `etiquetas` privado.
- Que `PUBLIC`, `anon` e `authenticated` **não** executam diretamente `usuario_nome(uuid)` nem `reversa_campos_do_pedido_alterados(...)`:

```sql
select p.oid::regprocedure as funcao,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
       exists (
         select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
         where a.grantee = 0 and a.privilege_type = 'EXECUTE'
       ) as public
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('usuario_nome', 'reversa_campos_do_pedido_alterados');
```

## Procedimento condicionado ao estado encontrado

- **Instalação nova:** provisionar o schema-base Supabase e aplicar a cadeia completa, uma vez e em ordem, pela ferramenta de migrations. O pacote do SQL Editor não é bootstrap de banco vazio.
- **Banco existente com histórico correto:** aplicar somente as migrations realmente ausentes, na ordem. As cadeias recentes incluem `20261027100000`–`20261027140000` e, para convites, `20261028100000`–`20261028130000`; confira os objetos, não apenas o histórico.
- **Execução manual sem registro, cadeia parcial ou drift:** interromper e reconciliar cada migration com os objetos e ACLs acima antes de marcar/aplicar qualquer versão. Não repetir definições antigas. O pacote do SQL Editor só serve numa base confirmada e anterior a todas as migrations dele.
- **Efeito sobre dados existentes das migrations `20261027*`:** nada é enfileirado retroativamente; os avisos de postagem/recebimento ainda não enviados que vinham de mudança de etapa (inclusive do rastreio automático) passam a `evento_obsoleto`; as linhas já concluídas ou indeterminadas são preservadas.

## Homologação da comunicação (ambiente de teste isolado, quando o tenant estiver configurado)

Mantenha `ETIQUETA_TRANSPORTE=simulado` até concluir os passos 1 a 3. Use somente contas e e-mails de teste.

1. Fluxo copiado no Power Automate, OAuth no gatilho restrito ao principal do worker, `AppBaseUrl` ajustado, conexões Outlook/Teams. Teste o fluxo isolado com os JSONs do [guia](./power-automate/comunicacao-etiqueta-reversa.md): sucesso por canal, `invalid_channel`, `invalid_event` (evento inexistente), `invalid_link` (URL fora da origem do app) e `invalid_content` (`<script>` no corpo).
2. Configurar um solicitante de teste (com e-mail), aprovadores e operadores de teste nas capacidades e empresas/setores corretos. Conferir no banco (ou em `/admin/comunicacoes`) as ocorrências geradas **sem** enviar nada.
3. Executar o worker manualmente em modo simulado (`POST` com a chave de serviço): a resposta deve ser `modo: simulado` e a fila não deve mudar.
4. Ligar `ETIQUETA_TRANSPORTE=power_automate`. Percorrer: pedido registrado → (aprovadores recebem Teams) → alteração relevante (nova rodada) → aprovação (autor recebe e-mail; operadores, Teams) / rejeição (e-mail com justificativa) → emissão com PDF **sem** rastreamento e depois com → reemissão (nova ocorrência) → confirmação de postagem → confirmação manual de recebimento. Conferir no histórico do fluxo o resultado de cada canal e que a entrega ou a mudança de etapa feitas pelo rastreio dos Correios **não** geram aviso de postagem/recebimento.
5. Provocar um `resultado_indeterminado` (timeout simulado no fluxo de teste), conferir que não há reenvio automático e reconciliar pela tela, nos dois sentidos.
6. Só então habilitar o agendamento ([guia](./agendamento-worker-comunicacao.md)) e conferir o job, as execuções e a resposta da função.

## Cadeia local em ordem

Ver [`migrations.md`](./migrations.md) (27 arquivos, incluindo o dump-base). O pacote [`SQL_EDITOR_SETUP_NC_REVERSA.sql`](../supabase/SQL_EDITOR_SETUP_NC_REVERSA.sql) é gerado pelas 26 migrations posteriores ao dump e **não foi executado** em nenhum ambiente real nesta entrega (só no PostgreSQL local de teste).
