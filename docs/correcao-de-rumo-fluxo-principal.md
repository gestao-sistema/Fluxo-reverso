# Correção de rumo: fluxo principal simples

Escopo: etiqueta que não anexava, pedido Alinare que não aparecia na expedição, navegação duplicada, acompanhamento dos Correios e textos. Tudo local; nada foi aplicado em serviço remoto.

## 1. Anexar a etiqueta

**Causa confirmada no front-end** (reproduzida por teste, `src/test/FilaEmissaoAtualizacao.test.tsx`): a fila de expedição recarrega a cada 15 s e, a cada recarga, marcava todos os pedidos como "consultando a emissão". Enquanto isso, o formulário de anexo era trocado por um aviso e **desmontado**. Quem estava com a janela de escolha de arquivo aberta, ou com PDF e códigos já preenchidos, perdia tudo (e a escolha do arquivo simplesmente não fazia nada). Correção: a reconsulta mantém o último resultado e só marca "carregando" o que nunca foi consultado; uma falha passageira da atualização não derruba uma consulta que já deu certo.

Melhorias no mesmo caminho:

| Situação | Antes | Agora |
| --- | --- | --- |
| Arquivo sem tipo informado pelo navegador (Windows sem leitor de PDF) | recusado | aceito se termina em `.pdf` |
| Arquivo vazio, acima de 5 MB ou renomeado (sem `%PDF-`) | erro genérico ou aceito | aviso próprio junto ao botão |
| Pedido aguardando aprovação / rejeitado | "emissão não autorizada" (mistura aprovação e permissão) | "ainda aguarda aprovação" / "foi rejeitado" (lido do pedido atual) |
| Sem permissão da empresa | idem | "sem permissão para anexar etiquetas de <empresa>" |
| RPC/tabela de emissões ausente (migration não aplicada) | "A RPC … Aplique as migrations…" | "O sistema ainda não está pronto… avise o suporte" (detalhe técnico só no console) |
| Storage recusa o envio (política) / tamanho / tipo / rede | mensagem crua do Storage | permissão / 5 MB / "envie em PDF" / "verifique a conexão" |
| Envio ok, vínculo recusado | mensagem crua | "O PDF foi enviado, mas não foi ligado ao pedido: …"; o PDF fica para nova tentativa |

Erros aparecem ao lado do botão (`role=alert`); o PDF e os códigos são mantidos para nova tentativa com o mesmo identificador de emissão (sem duplicar). Preservados: PDF privado, rastreamento opcional, códigos separados, histórico de reemissão, recuperação de emissão parcial, proteção contra clique duplo e sucesso somente com PDF vinculado.

**Dependência do banco remoto (não verificada):** o front-end atual exige as migrations de emissões/permissões (`20261023110000` e seguintes). Se o banco configurado estiver atrasado, a tela agora mostra "o sistema ainda não está pronto". Verificação exata, **somente leitura**, para rodar no SQL Editor do projeto:

```sql
-- 1. migrations aplicadas (esperado: até 20261027140000)
select version from supabase_migrations.schema_migrations where version >= '20261023100000' order by 1;
-- 2. funções usadas pelo anexo
select proname from pg_proc where pronamespace = 'public'::regnamespace
 and proname in ('pode_operar_emissao','registrar_emissao_reversa','anexar_pdf_emissao','atualizar_dados_emissao');   -- 4 linhas
-- 3. bucket privado, 5 MB, só PDF
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'etiquetas';
-- 4. políticas do Storage
select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'etiquetas_%';
-- 5. conta do operador (substitua o e-mail)
select email, raw_app_meta_data -> 'telas' as telas, raw_app_meta_data -> 'empresas_acesso' as empresas
  from auth.users where email = 'operador@empresa.com.br';   -- precisa de "emitir-etiqueta" e da empresa
```

## 2. Pedido Alinare que não aparecia na expedição

**Causa:** o pedido novo é gravado como `status = 'pendente'` com `aprovacao_status = 'aguardando_aprovacao'` (a aprovação é uma dimensão própria). A interface lia só `status` e rotulava esse pedido como **"Aguardando emissão da etiqueta"** em Pedidos, no detalhe, no dashboard e nos contadores, enquanto a expedição (corretamente) só lista pedidos aprovados. Parecia que o pedido "sumiu" da fila, quando na verdade esperava aprovação (e, sem aprovador configurado para a empresa/setor, nunca sairia disso: o aviso administrativo continua em Usuários).

Correção: `src/lib/situacaoPedido.ts` (`statusEfetivo`) combina aprovação e logística; Pedidos, Meus pedidos, detalhe, dashboard, contadores e filtros usam a mesma regra. Meus pedidos mostra **uma** situação e o próximo passo ("Aguarda a decisão do responsável." / "A expedição vai anexar a etiqueta."). A regra de elegibilidade não mudou nem foi relaxada. Rejeitado também é gravado como `pendente`: agora aparece como "Rejeitado" e nunca na fila. Links do dashboard por "aguardando aprovação" passaram a funcionar (a consulta inclui o status gravado e a seleção exata é feita depois).

Prova no banco real local: `supabase/tests/jornada-expedicao.test.mjs` (o operador da empresa vê o pedido novo mas ele não é elegível; depois da aprovação é; outra empresa não vê nem opera; rejeitado nunca; Novitah idem; emissão parcial recuperável; PDF sem vínculo não move o pedido).

## 3. Navegação

| Antes | Agora |
| --- | --- |
| Relatórios (página) | removida; `/admin/relatorios` leva ao Dashboard (mantendo `empresa`, `inicio`→`dataInicio`, `fim`→`dataFim`) ou, sem dashboard, a Pedidos |
| Kanban | sem item nem página de trabalho (decisão desta rodada); `/admin/kanban` leva a Pedidos (ou a Operações). `KanbanPage.tsx` continua no repositório sem rota. As capacidades `kanban`/`kanban-edit` seguem existindo para o banco |
| Check-in Correios | sem item nem página; `/admin/checkin` leva à Expedição (ou a Pedidos) |
| Emissão de etiqueta | **Operações**: abre direto a fila "Aguardando etiqueta" |
| Lista / Formulário X | Pedidos / Novo pedido X |

Funções do backend dos relatórios (`relatorio_reversa*`, `apiService.relatorioReversa*`) e suas migrations/testes foram **preservadas**; só a página saiu. O que a página tinha de exclusivo (contagens de emissões, reemissões e postagens, e filtro de período por decisão/emissão/postagem) deixou de ter tela; incluir isso no Dashboard é decisão de negócio. Exportação: continua em Pedidos. `KanbanPage.tsx` ficou no repositório sem rota (arquivo com alterações em andamento do front-end; apagar quando confirmado). As capacidades `kanban`, `kanban-edit` e `confirmar-checkin` continuam existindo (o banco as usa); sozinhas não dão página: o perfil cai em "sem acesso".

## 4. Acompanhamento dos Correios

- O andamento aparece **dentro do pedido** (Pedidos: "Acompanhamento dos Correios"; Meus pedidos: "Ver detalhes"). Sem código de rastreamento: "o andamento só aparece depois que o código for informado". Código sem retorno: "Ainda sem atualização dos Correios". A entrega informada pela transportadora é "Entrega informada pelos Correios", distinta do recebimento físico.
- Removidos o check-in manual ("Confirmar postagem") e a aprovação legada dentro do detalhe. A confirmação física virou ação contextual no detalhe do pedido, só para o perfil autorizado (em trânsito: conclui; já entregue pelos Correios: só registra, uma vez).

**O que o código realmente faz hoje (diferenças concretas):**

1. A atualização automática depende de agendamento externo (`src/sql/setup_cron_rastreio.sql`, job de 30 min), que não é migration e **não foi verificado** no banco.
2. A consulta em lote só considera pedidos **com código de rastreamento**. Como o rastreamento é opcional, pedido sem código **não se move sozinho** (permanece "Aguardando postagem" até alguém informar o código).
3. Só os eventos `PO`, `RO`, `OEC` e `BDE` mudam a etapa; outros eventos atualizam o último evento exibido, sem mudar a etapa.
4. O horário de `postado_em`/`concluido_em` é o da consulta, não o do evento.
5. **Aviso de postagem dependia de ação manual:** o aviso "postagem confirmada" nasce da confirmação de postagem na emissão (`postagem_fonte` manual ou rastreio), mas nada gravava a fonte `rastreio`: a integração só mudava o status. Corrigido com `20261027140000_postagem_automatica_rastreio.sql` (`registrar_postagem_rastreio`, só `service_role`) chamada pela Edge Function `correios-rastreio` na transição de etapa, antes de mudar o pedido (se falhar, tenta de novo na próxima consulta; banco sem a função: comportamento anterior, com aviso no log). Dado estruturado (código do rastreio, fonte, emissão), uma vez só, sem retroativo, sem comparar textos. **Não** gera "recebimento físico confirmado" (testado).
6. **Não existe** aviso "entrega informada pelos Correios": os eventos são oito, fixos no banco e no template do Power Automate. Criar um nono evento exige decisão e mudança do contrato; não foi feito.

Ordem de publicação: migration `20261027140000` **antes** da Edge Function `correios-rastreio`.

## 5. Textos

Cabeçalhos sem "eyebrow" e sem subtítulo padrão (o `PageHeading` só os mostra quando há informação nova), um título por página (Pedidos, Meus pedidos, Aprovações, Aguardando etiqueta, Dashboard, Usuários, Comunicações, Novo pedido), cartões decorativos e blocos repetidos removidos da expedição (documentos de apoio vazio, "dados da aprovação" duplicado), rótulos simples ("Anexar etiqueta", "Confirmar", "Tentar de novo"). Dados necessários mantidos: cliente e código, endereço, motivo, justificativa, aprovação, validade, códigos, documentos.

## 6. Evidência

- Navegador (Edge, 1366×820 e 390×844) com o adaptador **demo**: 37 verificações por viewport, 0 falhas, para Alinare e Novitah (criação, Meus pedidos aguardando aprovação, ausência na Expedição, aprovação, aparição na Expedição, PDF sem rastreamento, sucesso só com PDF vinculado, saída da fila, F5, abrir etiqueta, andamento honesto, rejeitado e pedido sem aprovação fora da fila, rotas antigas, menu sem Relatórios/Kanban/Check-in). O demo valida **a tela**, não o Storage nem o backend.
- Banco real local (Postgres 17 embarcado): `jornada-expedicao`, `postagem-rastreio` e a suíte completa.
- Não comprovado: Storage real, Edge Function real, cron, Correios, e a configuração do operador no ambiente do usuário (ver verificação da seção 1).

## 7. Perfis de teste (modo demonstração)

Só no servidor de desenvolvimento (`npm run dev`), pelo seletor de perfil. Um por grupo de acesso e variantes de uma só empresa para conferir isolamento. Menu = telas do perfil, mesma regra do sistema real:

| Perfil | Menu |
| --- | --- |
| Comercial · Alinare / Novitah | Novo pedido | Meus pedidos |
| Aprovação · as duas empresas / só Alinare / só Novitah | Aprovações | Pedidos |
| Expedição · as duas empresas | Operações | Pedidos (confirma recebimento físico no pedido) |
| Expedição · só Alinare / só Novitah | Pedidos | Operações |
| Gerência | Dashboard | Pedidos | Novo pedido |
| Gerência · também aprova | o anterior + Aprovações |
| TI · Administração | tudo (inclui Usuários e Comunicações) |
| Qualidade · NCs | Não conformidades |

O perfil de teste antigo "Check-in Correios" saiu (a etapa não existe). Conferido no navegador (menu e rotas alheias redirecionando para a página inicial do próprio perfil). Evidência do demo, não do backend. Não existem ainda, e não foram criadas: Auditoria e Configurações (telas de TI sugeridas na reunião).
