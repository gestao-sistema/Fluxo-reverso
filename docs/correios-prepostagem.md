# Correios — Pré-postagem (envio normal e logística reversa): preparação

Verificado em **2026-11-04** contra as especificações OpenAPI públicas. Em 2026-11-04 a chave passou a ser testada (seção 10); a API de Contrato é **interna** e inacessível. A seção 3 (autenticação) foi **corrigida** em 2026-11-04 com a documentação oficial de Chaves de acesso; a versão anterior assumia Basic + token e estava errada. Nada foi criado, alterado ou cancelado nos Correios, nenhum deploy foi feito e o rastreamento, as notificações, a aprovação e a emissão manual não foram tocados.

## 1. O que está provado e o que não está

| Item | Situação |
| --- | --- |
| Especificação de Pré-postagem (versão 2.0.32, 27 caminhos) obtida e lida inteira | **Provado** (`https://api.correios.com.br/prepostagem/v3/api-docs`, sem autenticação). A de homologação (`https://apihom.correios.com.br/prepostagem/v3/api-docs`) é idêntica nos caminhos e na versão |
| Especificação do serviço de token (1.21.14), de Contrato (3.6.0) e de Serviço/Produto (3.2.7) | **Provado** (`/token/v3/api-docs`, `/contrato/v3/api-docs`, `/servico/v3/api-docs`) |
| Mecanismo de autenticação da Chave de acesso | **Confirmado em fonte oficial** (seção 3): `Authorization: Bearer <chave>` direto nas APIs, sem token |
| A chave nova autentica e acessa a Pré-postagem | **Provado** (seção 10): chave reconhecida; `GET /prepostagem/v2/prepostagens` → HTTP 200 |
| Operações de escrita (criar pré-postagem) | **Não provado**: só leituras foram feitas; "Acesso total" é declaração sua |
| API de Contrato/Serviços | **Inacessível**: é interna dos Correios (seção 10); não há alternativa |
| Tipo de autorização da chave (cartão × contrato) | **Não informado**. Uma chave tem um único tipo (idCorreios, contrato ou cartão) e a Pré-postagem declara autorização por **cartão de postagem** |
| Serviços de envio normal e de reversa no cartão 0074755099 | **Observados em uso** em pré-postagens existentes (seção 10); "estar habilitado hoje" continua não provado |
| Qual contrato é o operacional (9912398217 × 9912666541) | **Não provado; não assumido** |

## 2. Integração existente (preservada)

- Edge Function [`correios-rastreio`](../supabase/functions/correios-rastreio/index.ts): autentica por conta com `POST /token/v1/autentica/cartaopostagem` (Basic `usuário:senha`, corpo `{numero: cartão}`) e consulta `srorastro/v1/objetos/{código}`. Variáveis `CORREIOS_USUARIO_<EMPRESA>`, `CORREIOS_SENHA_<EMPRESA>`, `CORREIOS_POSTAGEM_<EMPRESA>` para ALINARE, AZIME, ARTIKLER e NOVITAH.
- Não existe hoje nenhum código de pré-postagem. A emissão é manual: a emissão (`reversa_emissoes`) guarda código de autorização, rastreio opcional, datas e o PDF anexado à mão.
- O [README](../README.md) associa **9912398217 à conta ALINARE** e **9912666541 à AZIME**. Ou seja, o contrato da nova chave coincide com o da conta de rastreio ALINARE, mas isso não prova que seja o mesmo usuário/cartão nem que seja o contrato certo para a reversa. As credenciais de rastreio **não** foram reutilizadas.

## 3. Autenticação (Chave de acesso do CWS — confirmado)

**Fonte oficial**: Correios, [Orientações para subdelegação de acesso](https://www.correios.com.br/atendimento/developers/arquivos/orientacoes-para-subdelegacao-de-acesso-1.pdf) (03/04/2025), passo 6: a chave "deverá ser utilizada para autenticar as requisições às APIs liberadas pelo cliente, sendo que essa chave deverá ser enviada no parâmetro "Authorization" do tipo "Bearer Token"". Corroboram o [Manual da API Preço](https://www.correios.com.br/atendimento/developers/manuais/manual-api-preco-1) (aceita "token de acesso ou chave de subdelegação válidos") e a página de [Desenvolvedores](https://www.correios.com.br/atendimento/developers) (validade de até 180 dias, sem renovação).

- **Mecanismo**: `Authorization: Bearer <chave de acesso>` **diretamente** na API de destino (ex.: `https://api.correios.com.br/prepostagem/v2/prepostagens?...`). **Sem usuário, sem Basic e sem troca por token**: não se chama `/token/v1/autentica/*`. A versão anterior deste documento e do validador assumia Basic `usuário:chave` + token; era um erro e foi removida.
- **Não confundir**: (a) **Chave de acesso** (40 dígitos, menu *Chaves de Acesso* do CWS, subdelegação, validade ≤180 dias, escopo por API/grupo/operação) é o que a nova chave é; (b) **código de acesso às APIs** (menu *Gestão de acesso a APIs*) é outro segredo, usado no Basic do serviço de token — o que a Edge Function de rastreio faz hoje; (c) **token** (JWT) só existe nesse segundo caminho. Os manuais da API Token e da API Preço não descrevem o endpoint ou o parâmetro de uma troca de chave por token, e nenhum documento oficial lido prevê essa troca.
- **"Validar chave" no CWS** (menu *Credenciais*) é, segundo o [manual oficial](https://www.correios.com.br/atendimento/developers/arquivos/orientacoes-credenciais-validar-chave-de-acesso.pdf) (24/06/2025), uma função do **portal** para liberar a *visualização da documentação* das APIs autorizadas a um desenvolvedor que recebeu a chave. Não é um teste de autenticação das APIs e não foi inspecionada no navegador (a documentação já explica o mecanismo; o CWS exige login).
- **Escopo da chave**: um único tipo de autorização por chave (idCorreios, contrato **ou** cartão de postagem), cada API ligada/desligada, com grupo e leitura ou acesso total. Quem cria a chave gere e revoga; chave expirada ou revogada não valida.
- **Ainda em aberto**: (1) se a chave foi criada por contrato ou por cartão e se isso casa com a autorização "Cartão de Postagem" da Pré-postagem; (2) se a Contrato/Serviços foi ligada na chave (a chave citada tem Pré-postagem; outras APIs não foram mencionadas).
- Produção e homologação têm CWS e hosts separados (`api.correios.com.br`/`cws` × `apihom.correios.com.br`/`cwshom`); a chave vale no ambiente em que foi criada. Não há prova de que exista chave em homologação.

## 4. Endpoints de Pré-postagem (base `https://api.correios.com.br/prepostagem`)

| Uso | Endpoint |
| --- | --- |
| Criar (síncrono) | `POST /v1/prepostagens` → 200 com a pré-postagem (`id`, `codigoObjeto`, `statusAtual`, …) |
| Criar (assíncrono) | `POST /v1/prepostagens/assincrona` → 200, corpo tipado só como `string` (presumivelmente o recibo) |
| Resultado do assíncrono | `GET /v1/prepostagens/assincrona/{recibo}` → `situacao` `PROCESSADO`/`FALHA`/`NAO_LOCALIZADO`, `mensagens`, `sequencias`, `prePostagens` |
| Recuperar operação incerta | `GET /v2/prepostagens` (ver 6) e `GET /v1/prepostagens/postada?codigoObjeto=` (só depois de postada) |
| Rótulo/PDF, objeto **registrado** | `POST /v1/prepostagens/rotulo/assincrono/pdf` (`tipoRotulo` `P`/`R` obrigatório; um entre `idsPrePostagem`, `codigosObjeto`, `idAtendimento`; opcionais `formatoRotulo` `ET`/`EV`, `layoutImpressao`, `imprimeRemetente`) |
| Rótulo/PDF, objeto **simples** | `POST /v1/prepostagens/rotulo/lote/assincrono/pdf` e `GET /v1/prepostagens/rotulo/lote/{idLote}/assincrono/pdf` |
| Recuperar o PDF pelo recibo | `GET /v1/prepostagens/rotulo/download/assincrono/{idRecibo}` |
| Alterar validade da reversa | `PATCH /v1/prepostagens/{id}/logisticareversa` (`dataValidadeLogReversa` `dd/MM/yyyy`) |
| Cancelar (não usar nesta etapa) | `DELETE /v1/prepostagens/{id}` · `/objeto/{codigoObjeto}` · `/assincrona` |

**Lacuna da especificação**: as respostas de solicitar rótulo e de baixar o PDF estão tipadas só como `object`. Como o PDF chega (base64, URL, campo) e o formato do recibo **só podem ser descobertos em chamada real**. Não presumir.

## 5. Serviços habilitados no cartão

A Pré-postagem não lista serviços. **Atualização (seção 10): a API de Contrato é interna dos Correios (HTTP 403 GTW-011, "credencial EXTERNA e disponibilização INTERNA", API 32) e não é acessível com esta chave nem por outra forma.** Os itens abaixo ficam só como referência da especificação; a fonte prática de códigos passa a ser o levantamento das pré-postagens existentes e a confirmação com os Correios. A de Serviço/Produto não foi testada.

- `GET /contrato/v1/cartoes/{nuCartao}/servicos` e `GET /contrato/v1/contratos/{nuContrato}/servicos` → `[{codigo, descricao, coSegmento}]`.
- `GET /contrato/v1/cartoes/{nuCartao}` (vigência, status) e `GET /contrato/v1/contratos/{nuContrato}`.
- Limites para validar o payload: `GET /servico/v1/servicos/{co}/limite-peso`, `/embalagens` (dimensões), `/abrangencia?cepOrigem=&cepDestino=`.

O `codigoServico` do payload "deve constar no cartão de postagem". **Nenhum código foi inventado**; o conjunto válido para envio normal e para reversa precisa vir dessa consulta e do contrato.

## 6. Payload: campos e diferença entre normal e reversa

Corpo único (`RequestPrePostagemExternaDTO`) para os dois casos. Strings em todos os campos numéricos.

**Obrigatórios nos dois**: `remetente` (`nome` com nome e sobrenome, 3–50; `endereco`: `cep` 8 dígitos, `logradouro` ≤50, `numero` ≤6, `bairro` ≤30, `cidade` ≤30, `uf` 2; `cpfCnpj` obrigatório se não houver `documentoEstrangeiro`) · `destinatario` (só `nome` é obrigatório no schema; o objeto `endereco` do destinatário **não** está marcado como obrigatório, mas, se enviado, exige os mesmos campos do remetente mais `regiao`, que o schema marca como obrigatória mesmo para o Brasil — **a confirmar**; na prática, o endereço de quem recebe é necessário para a entrega) · `codigoServico` (≤8) · `itensDeclaracaoConteudo[]` (`conteudo` 2–60, `quantidade` ≤11 dígitos, `valor` ≤19 dígitos e 2 decimais; separador decimal não especificado) · `pesoInformado` (**gramas**, ≤6 dígitos, >0) · `codigoFormatoObjetoInformado` (1 envelope, 2 caixa/pacote, 3 rolo/cilindro) · `cienteObjetoNaoProibido` (`"1"`).

**Condicionais**: altura, largura e comprimento (**cm**, ≤3 dígitos) para caixa/pacote; `diametroInformado` para rolo; `numeroNotaFiscal` (≤12) ou `chaveNFe` (44) na ausência da declaração de conteúdo; `dddCelular`/`celular`/`cpfCnpj` do destinatário em entrega em locker.

**Só da reversa (documentado)**: `logisticaReversa: "S"` (`"N"` no normal), `dataValidadeLogReversa` (`dd/MM/yyyy`), `codigoObjetoIda` (objeto de ida associado, opcional) e, no campo `remetente.email`, "obrigatório se for logística reversa" (≤255) — exigência sobre **a parte registrada como `remetente`**; quem ocupa esse papel na reversa não está documentado (abaixo). Opcionais úteis: `prazoPostagem` (padrão criação+14 dias, máximo 90), `pedidoExternoOrigem` (≤25) e `canalExternoOrigem` (≤14) para correlação, `observacao` (≤50).

**Não documentado (não presumir)**: quem é remetente e quem é destinatário na reversa (a especificação não diz; por isso **não** se pode afirmar que CPF/CNPJ ou e-mail da cliente sejam obrigatórios — dependem de a cliente ser o `remetente`); se `dataValidadeLogReversa` é obrigatória e seus limites; qual código de serviço é de reversa; se a reversa é objeto simples ou registrado (define qual endpoint de PDF usar); se há idempotência na criação (não há campo ou cabeçalho para isso); o que `emailLogisticaReversaEnviado` dispara.

**Recuperar operação incerta**: no assíncrono, gravar o recibo antes de qualquer outra coisa e consultar `GET /assincrona/{recibo}`. No síncrono, não há chave de idempotência; a consulta `GET /v2/prepostagens` aceita `id`, `codigoObjeto` ou `eTicket` (isolados), ou `status` + `logisticaReversa` + janela de datas (≤30 dias; retroativo máximo 120). Não filtra por `pedidoExternoOrigem`, então a recuperação por correlação seria filtrar o retorno no cliente (inferência a validar em homologação). `status`: `PREATENDIDO`, `PREPOSTADO`, `POSTADO`, `EXPIRADO`, `CANCELADO`, `ESTORNADO`, `PENDENTE`.

## 7. Dados disponíveis × faltantes

| Disponível hoje | Observação |
| --- | --- |
| Nome da cliente (`nome_cliente`) | Texto único, mínimo 2: pode não ter sobrenome (a API exige nome e sobrenome) |
| Endereço (`endereco_postagem`) | **Texto livre** `logradouro, bairro, cidade/UF, número, CEP xxxxx-xxx`, editável pelo usuário. CEP, cidade e UF não são colunas; seria preciso interpretar o texto ou persistir campos estruturados |
| Empresa, motivo, NC, código de cliente interno, código de autorização/rastreio da emissão manual | Servem de correlação (`pedidoExternoOrigem`), não de payload |
| CNPJ das contas de rastreio | Só no README, não em dado de aplicação |

**Não existem no sistema** (nenhum campo no formulário nem no schema): CPF/CNPJ, e-mail e telefone da cliente. Se serão exigidos depende do papel de remetente/destinatário na reversa, **ainda não confirmado** (seção 6). Também faltam: endereço estruturado da cliente e do destino da devolução (empresa); declaração de conteúdo (itens, quantidades, valores); peso; formato e dimensões; NF/chave; código do serviço; validade da reversa.

## 8. Pendências de contrato, cartão e serviços

1. Confirmar com os Correios/gestor do contrato qual contrato e cartão são os operacionais para esta emissão (9912398217 × 9912666541), e se a etiqueta anterior (9912666541) deve continuar nele.
2. Confirmar com os Correios que `03220` (normal) e `03247` (reversa), vistos em uso (seção 10), são os códigos a emitir, e o que está habilitado hoje no cartão 0074755099.
3. Confirmar o modelo da reversa: papéis de remetente/destinatário, objeto simples × registrado, validade, e-mail disparado pelos Correios.
4. Confirmar se existe chave equivalente em homologação. (A API de Contrato é interna: listar serviços por ela não é possível.)
5. Confirmar o tipo de autorização da chave (contrato ou cartão de postagem), na tela da chave no CWS, frente à autorização "Cartão de Postagem" da Pré-postagem.

## 9. Configuração (somente backend) e validação

- Modelo: [`supabase/correios-prepostagem.env.example`](../supabase/correios-prepostagem.env.example). Variáveis: `CORREIOS_PREPOSTAGEM_CHAVE_ACESSO` (**segredo**; o manual cita 40 dígitos, mas a chave real tem 96 caracteres e o tamanho não é validado; só a chave, sem "Bearer"; não há variável de usuário), `CORREIOS_PREPOSTAGEM_CONTRATO`, `CORREIOS_PREPOSTAGEM_CARTAO` (entre aspas, preserva `0074755099`) e `CORREIOS_PREPOSTAGEM_AMBIENTE` (`producao`/`homologacao`). Nenhuma começa com `VITE_`.
- **Onde preencher a chave**: copiar o modelo para `supabase/.env.correios.local` (ignorado pelo Git pela regra `.env.*`) e preencher lá. Em produção, seria Supabase Secrets, só quando houver função que as use. Não cole o segredo no chat.
- Validação somente leitura, quando a chave estiver preenchida:

  ```bash
  node --env-file=supabase/.env.correios.local supabase/scripts/correios-prepostagem-validar.mjs
  ```

  Faz só `GET`, com `Authorization: Bearer <chave>` e sem chamar o serviço de token: (A) `GET /prepostagem/v2/prepostagens?status=PREPOSTADO&page=0&size=1` e (B) `GET /contrato/v1/cartoes/{cartão}/servicos` e `/contratos/{contrato}/servicos`. A consulta A é válida pela especificação: sem `id`/`codigoObjeto`/`eTicket`, `status` é obrigatório e, para `PREPOSTADO`/`PREATENDIDO`, as datas são dispensadas; só a contagem de itens é impressa. Não cria, altera nem cancela, não pede PDF e não imprime a chave nem dados de pré-postagens.

  A saída traz três blocos **separados**: **[1] Autenticação** (inferida da resposta da Pré-postagem: 401, ou 403 com `GTW-006: Token inválido` — mensagem observada numa chamada sem credencial —, indica chave não reconhecida); **[2] Pré-postagem** (200 = acesso confirmado; **400 = consulta rejeitada na validação, não é falta de acesso**; 403 com chave reconhecida = a chave não cobre a API); **[3] Contrato/Serviços** (outra API, com autorização própria na chave: recusa aqui **não** significa falha da Pré-postagem nem que o cartão não tenha o serviço). Código de saída: 0 se a Pré-postagem respondeu 200; 1 caso contrário; 2 se a configuração é inválida (nada é enviado).

## 10. Resultado da validação e levantamento de serviços (2026-11-04)

Feito pelo operador com a chave real em `supabase/.env.correios.local` (valor nunca registrado), **somente leitura**, contra produção.

**Validação** ([`correios-prepostagem-validar.mjs`](../supabase/scripts/correios-prepostagem-validar.mjs)):

| Bloco | Resultado |
| --- | --- |
| [1] Autenticação | Chave reconhecida. Confirma o mecanismo Bearer direto (seção 3) |
| [2] Pré-postagem | `GET /prepostagem/v2/prepostagens?status=PREPOSTADO&page=0&size=1` → **HTTP 200**, 1 item |
| [3] Contrato/Serviços | Cartão e contrato → **HTTP 403 `GTW-011`**: "Sua credencial é EXTERNA e a disponibilização INTERNA" (API 32). **A API de Contrato é interna; não há como acessá-la e nenhuma outra forma foi tentada** |

A chave válida tem **96 caracteres** (o manual cita 40 dígitos): o validador não rejeita nem avisa por tamanho. Também mostra o `GTW-011` como "API interna", não como falha da chave.

**Levantamento** ([`correios-prepostagem-levantamento.mjs`](../supabase/scripts/correios-prepostagem-levantamento.mjs)): só `GET /v2/prepostagens` com combinações válidas pela especificação — `status` PREPOSTADO (sem datas), POSTADO e EXPIRADO (datas obrigatórias), cada um com `logisticaReversa` S e N; 4 janelas de 30 dias (limite documentado) cobrindo **2026-07-08 a 2026-11-04** (limite retroativo de 120 dias). Até 4 páginas × 50 por consulta, pausa entre chamadas, parada em 429 (não ocorreu). 30 chamadas por execução; 18 combinações, 5 sem resultado (`404 PPN-344`, que significa "não existem pré-postagens", não erro). Saída só agregada: nenhum nome, documento, endereço, e-mail, telefone ou código de objeto foi impresso ou gravado. Todos os 838 itens vieram com o cartão 0074755099.

| Status | Reversa | Código | Serviço | Qtd. |
| --- | --- | --- | --- | --- |
| POSTADO | N | **03220** | SEDEX CONTRATO AG | ≥ 741 |
| POSTADO | N | 03140 | SEDEX 12 CONTRATO AG | ≥ 52 |
| POSTADO | N | 03158 | SEDEX 10 CONTRATO AG | ≥ 7 |
| EXPIRADO | N | 03220 | SEDEX CONTRATO AG | 2 |
| PREPOSTADO | N | 03220 | SEDEX CONTRATO AG | 1 |
| POSTADO | S | **03247** | SEDEX REVERSO | 25 |
| EXPIRADO | S | 03247 | SEDEX REVERSO | 4 |
| PREPOSTADO | S | 03247 | SEDEX REVERSO | 6 |

- **Envio normal**: `03220` (dominante), `03140` e `03158`. **Reversa**: só `03247` (35 pré-postagens, todas com `logisticaReversa=S`). Códigos e nomes **vistos em uso** no cartão, não uma lista de serviços habilitados.
- Para POSTADO/N a consulta bateu o limite de páginas nas 4 janelas (800 itens): as quantidades são **mínimos**.
- **Documentos nas 35 reversas** (só o tipo): remetente CNPJ de outra empresa 23 e CPF 12 (todos com documento); destinatário **CNPJ da Alinare em 32**, CPF em 2 e sem documento em 1. Isto descreve o que já existe no cartão; **não é regra documentada** pelos Correios e não prova quem é remetente/destinatário no fluxo deste sistema (seção 6).

**Limitações**: janela de 120 dias e 4 páginas por consulta; pré-postagens canceladas, estornadas, pendentes ou pré-atendidas não foram consultadas; os itens podem ter sido criados por outros sistemas; "visto em uso" não equivale a "habilitado hoje"; **não achar reversa em um cartão não provaria que o serviço não está habilitado** (aqui há reversa). Nada foi criado, alterado ou cancelado, nenhum rótulo/PDF foi pedido.

## 11. Próxima entrega mínima (homologação)

1. ~~Validar a chave~~ — feito (seção 10). Pendente: confirmar que a chave **escreve** (criar pré-postagem exige "Acesso total"; só leituras foram provadas) e se há chave de homologação.
2. Fechar as pendências 1–3 da seção 8 com os Correios.
3. Função de backend isolada (não ligada a telas) que monta o payload a partir de um pedido de teste, cria **uma** pré-postagem no ambiente de homologação pelo caminho assíncrono, grava o recibo antes de qualquer outra coisa e consulta o resultado.
4. Solicitar e baixar o PDF dessa única pré-postagem, registrar o formato real da resposta e atualizar a seção 4.
5. Só depois: persistência do recibo/`id`/código do objeto, telas e integração com a emissão manual.
