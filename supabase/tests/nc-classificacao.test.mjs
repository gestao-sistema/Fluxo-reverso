// Não conformidades: classificação separada (20261109100000) aplicada sobre uma base já em uso.
// NCs e reversas criadas com a classificação antiga (só a origem) são preservadas; a classificação
// nova entra só onde é inequívoca; a persistência recusa o que a regra proíbe. As gravações de classificação
// passam pela função de edição (nc_salvar_edicao), que é o único caminho de UPDATE do papel authenticated.
// PostgreSQL 17 local e temporário (embedded-postgres), como os outros testes do banco.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ANON, como, criarUsuario, iniciarBanco, migrationsNovas } from './lib/banco.mjs';

const MIGRATION = '20261109100000_nc_classificacao_separada.sql';

// Origem antiga → [tipo do problema, origem/causador] esperados. null = revisar (ambíguo).
const MAPA = [
  ['Erro expedição – endereço incorreto', 'Endereço incorreto', 'Expedição'],
  ['Erro expedição – mercadoria trocada ou embalada junto', 'Mercadoria trocada ou embalada junto', 'Expedição'],
  ['Erro expedição – etiqueta ou pré-postagem', 'Etiqueta ou pré-postagem', 'Expedição'],
  ['Embalagem inadequada / avaria por embalagem', 'Embalagem inadequada / avaria por embalagem', 'Expedição'],
  ['Atraso de postagem', 'Atraso de postagem', 'Expedição'],
  ['Postagem duplicada', 'Postagem duplicada', 'Expedição'],
  ['Postagem sem NF', 'Postagem sem NF', 'Expedição'],
  ['Erro de faturamento / NF (destinatário ou endereço)', null, 'Financeiro'],
  ['Erro da expedição e do financeiro', null, 'Expedição e Financeiro'],
  ['Erro vendedora – endereço incorreto', 'Endereço incorreto', 'Comercial'],
  ['Tipo de frete incorreto (CIF/FOB)', 'Tipo de frete incorreto (CIF/FOB)', 'Comercial'],
  ['Frete não cobrado na venda', 'Frete não cobrado na venda', 'Comercial'],
  ['Reverso sem autorização', 'Reverso sem autorização', 'Comercial'],
  ['Frete carona (pacote de terceiro com pedido da marca)', 'Frete carona', 'Comercial'],
  ['Mercadoria apreendida (fiscalização)', 'Mercadoria apreendida', 'Fiscalização'],
  ['Extravio Correios', 'Extravio', 'Correios'],
  ['Avaria no transporte', 'Avaria no transporte', 'Correios'],
  ['Entregue para a pessoa errada', 'Entregue para a pessoa errada', 'Correios'],
  ['Consta entregue / não entregue no local', 'Consta entregue / não entregue no local', 'Correios'],
  ['Endereço não localizado', 'Endereço não localizado', 'Correios'],
  ['Entregador não atendido', 'Entregador não atendido', 'Cliente / destinatário'],
  ['Cliente desconhecido', 'Cliente desconhecido', 'Cliente / destinatário'],
  ['Entregue, porém cliente afirma que não recebeu', 'Entregue, porém cliente afirma que não recebeu', 'Cliente / destinatário'],
  ['Mercadoria devolvida pelo destinatário', 'Mercadoria devolvida pelo destinatário', 'Cliente / destinatário'],
  ['Não retirada no prazo (aguardando retirada)', 'Não retirada no prazo', 'Cliente / destinatário'],
  ['Erro da/o cliente', 'Erro da/o cliente', 'Cliente / destinatário'],
  ['Peça de outra marca recebida', 'Peça de outra marca recebida', 'Cliente / destinatário'],
  ['Outro', 'Outro', 'A apurar'],
];

// Custos legados por posição: 0 = com valor (Sim); 1 = zero explícito; 2 = só reembolso; 3 = nada.
const custosDaPosicao = (i) => {
  switch (i % 4) {
    case 0: return [10.5, null, null, null];
    case 1: return [0, 0, 0, null];
    case 2: return [null, null, null, 5];
    default: return [null, null, null, null];
  }
};

const INSERIR_REVERSA = `insert into public.solicitacoes_reverso
  (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo, nc_id)
  values ($1, current_date, 'Fulana', 'Financeiro', 77, $3, 'Rua B, 2', 'Outros', $2)
  returning id, nc_id, nc_numero, setor, empresa, legado`;

const INSERIR_NC_NOVA = `insert into public.nao_conformidades
  (empresa, cliente, origem, tipo_saida, data_ocorrencia, status, custo_produto, custo_frete_adicional, custo_multa_outros, valor_reembolsado)
  values ('Alinare', $1, $2, 'Venda', '2026-10-01', 'Aberta', $3, $4, $5, $6)
  returning id, tipo_problema, causador, custo_situacao, custo_produto, numero`;

let banco;
let db; // dono do banco: prepara o legado e confere sem RLS
let c1; // conexão dos usuários
const u = {};
const nc = { porOrigem: {}, semMapa: null, semOrigem: null, vinculada: null };
const antes = {};
const depois = {};

const q = async (sql, params) => (await db.query(sql, params)).rows;
const porId = (linhas) => new Map(linhas.map((linha) => [linha.id, linha]));
const subconjunto = (linha, chaves) => Object.fromEntries(chaves.map((chave) => [chave, linha[chave]]));
const falha = (promessa) => promessa.then(() => null, (erro) => erro);
/** Negado: o banco recusa (42501) ou a política do papel não casa nenhuma linha (0 linhas). */
const negado = async (promessa) => {
  try {
    return (await promessa).rowCount === 0;
  } catch (erro) {
    return erro.code === '42501';
  }
};
const SALVAR = 'select * from public.nc_salvar_edicao($1::uuid, $2::timestamptz, $3::jsonb, $4)';
// Versão como texto: preserva os microssegundos que o driver converteria em Date
const versaoAtual = async (id) =>
  (await db.query('select updated_at::text as versao from public.nao_conformidades where id = $1', [id])).rows[0].versao;
// Gravação pelo caminho que o cliente pode usar: a função de edição (authenticated não tem UPDATE direto)
const salvarComo = async (persona, id, campos, motivo = null) =>
  (await como(c1, persona, SALVAR, [id, await versaoAtual(id), JSON.stringify(campos), motivo])).rows[0];
const CLASSIFICACAO =`select id, tipo_problema, causador, area_registro, area_tratativa, custo_situacao
  from public.nao_conformidades order by numero`;

before(async () => {
  banco = await iniciarBanco();
  db = banco.dono;
  c1 = await banco.conectar();

  // 1. Base como estava antes desta migration (com as NCs e reversas antigas)
  const todas = migrationsNovas();
  for (const arquivo of todas.filter((f) => f < MIGRATION)) await banco.aplicar(arquivo);

  u.editor = await criarUsuario(db, 'Editora NC', ['nc-edit']);
  u.consulta = await criarUsuario(db, 'Consulta NC', ['nc']);
  u.solicitante = await criarUsuario(db, 'Solicitante Alinare', ['formulario-alinare']);
  // Quem registra e importa a planilha: edita NCs e também administra as listas
  u.importador = await criarUsuario(db, 'Importadora NC', ['nc-edit', 'usuarios']);

  // 2. Legado: uma NC por origem oficial, com custos de vários tipos
  for (const [indice, [origem]] of MAPA.entries()) {
    const [produto, frete, multa, reembolso] = custosDaPosicao(indice);
    const criada = (await db.query(INSERIR_NC_ANTIGA, [`Cliente ${indice}`, origem, produto, frete, multa, reembolso])).rows[0];
    nc.porOrigem[origem] = criada.id;
  }
  // Origem criada pelo administrador, fora do mapa; e NC sem origem
  await db.query("insert into public.nc_origens (nome, area, evitavel) values ('Origem antiga sem mapa', 'Logística', 'A avaliar')");
  nc.semMapa = (await db.query(INSERIR_NC_ANTIGA, ['Cliente sem mapa', 'Origem antiga sem mapa', 1, null, null, null])).rows[0].id;
  nc.semOrigem = (await db.query(INSERIR_NC_ANTIGA, ['Cliente sem origem', null, null, null, null, null])).rows[0].id;

  // 3. Reversas: uma vinculada a NC aberta (com o setor do pedido) e outra sem NC
  nc.vinculada = nc.porOrigem['Erro expedição – endereço incorreto'];
  u.reversaVinculada = (await como(c1, u.solicitante, INSERIR_REVERSA, ['Alinare', nc.vinculada, 'Cliente Vínculo'])).rows[0];
  u.reversaSemNc = (await como(c1, u.solicitante, INSERIR_REVERSA, ['Alinare', null, 'Cliente Sem NC'])).rows[0];

  // 4. Fotografia do legado antes da migration
  antes.ncs = porId(await q('select * from public.nao_conformidades'));
  antes.view = porId(await q('select id, codigo, area_responsavel, evitavel, dias_em_aberto, qtd_reversas from public.vw_nao_conformidades'));
  antes.historico = await q('select id, nc_id, acao, user_nome from public.nc_historico order by id');
  antes.reversas = porId(await q('select id, nc_id, nc_numero, empresa, setor, legado, status, aprovacao_status from public.solicitacoes_reverso'));

  // 5. Aplica a migration nova e as posteriores a ela (registro novo) sobre a base em uso
  for (const arquivo of todas.filter((f) => f >= MIGRATION)) await banco.aplicar(arquivo);
  depois.ncs = porId(await q('select * from public.nao_conformidades'));
  depois.view = porId(await q('select * from public.vw_nao_conformidades'));
  depois.historico = await q('select id, nc_id, acao, user_nome from public.nc_historico order by id');
  depois.reversas = porId(await q('select id, nc_id, nc_numero, empresa, setor, legado, status, aprovacao_status from public.solicitacoes_reverso'));
});

after(async () => {
  await banco?.encerrar();
});

const INSERIR_NC_ANTIGA = `insert into public.nao_conformidades
  (empresa, cliente, origem, tipo_saida, data_ocorrencia, status, custo_produto, custo_frete_adicional, custo_multa_outros, valor_reembolsado, descricao)
  values ('Alinare', $1, $2, 'Venda', '2026-10-01', 'Aberta', $3, $4, $5, $6, 'Registro antigo')
  returning id, numero`;

describe('legado: nada do que já existia é alterado', () => {
  it('valores, origem, status, empresa e número das NCs antigas são os mesmos', () => {
    assert.equal(antes.ncs.size, MAPA.length + 2);
    for (const [id, linha] of antes.ncs) {
      const chaves = Object.keys(linha).filter((chave) => chave !== 'updated_at');
      assert.deepEqual(subconjunto(depois.ncs.get(id), chaves), subconjunto(linha, chaves), `NC ${linha.numero}`);
    }
  });

  it('a visão mantém código, área responsável, evitável, dias em aberto e reversas', () => {
    for (const [id, linha] of antes.view) {
      assert.deepEqual(subconjunto(depois.view.get(id), Object.keys(linha)), linha, `NC ${linha.codigo}`);
    }
  });

  it('o histórico antigo fica igual; a mudança da classificação entra como entrada nova', () => {
    const porIdDepois = new Map(depois.historico.map((item) => [item.id, item]));
    for (const item of antes.historico) assert.deepEqual(porIdDepois.get(item.id), item);
    const novos = depois.historico.filter((item) => !antes.historico.some((antigo) => antigo.id === item.id));
    assert.ok(novos.some((item) => item.acao.includes('Tipo do problema')), 'classificação registrada na linha do tempo');
  });

  it('reversas, vínculos com a NC e o setor usado na aprovação não mudam', () => {
    for (const [id, linha] of antes.reversas) assert.deepEqual(depois.reversas.get(id), linha);
    assert.equal(depois.reversas.get(u.reversaVinculada.id).setor, 'Financeiro');
    assert.equal(depois.reversas.get(u.reversaVinculada.id).nc_id, nc.vinculada);
  });
});

describe('classificação dos registros existentes', () => {
  it('origem inequívoca recebe tipo e causador; origem ambígua recebe só o causador', async () => {
    for (const [origem, tipo, causador] of MAPA) {
      const linha = (await q(CLASSIFICACAO)).find((item) => item.id === nc.porOrigem[origem]);
      assert.equal(linha.tipo_problema, tipo, `tipo de "${origem}"`);
      assert.equal(linha.causador, causador, `causador de "${origem}"`);
    }
  });

  it('origem fora do mapa e NC sem origem ficam sem classificação inventada', async () => {
    const linhas = await q(CLASSIFICACAO);
    for (const id of [nc.semMapa, nc.semOrigem]) {
      const linha = linhas.find((item) => item.id === id);
      assert.equal(linha.tipo_problema, null);
      assert.equal(linha.causador, null);
    }
  });

  it('custo positivo vira "Sim"; sem valor ou com zero fica nulo: nunca "Não"', async () => {
    const linhas = await q(CLASSIFICACAO);
    MAPA.forEach(([origem], indice) => {
      const linha = linhas.find((item) => item.id === nc.porOrigem[origem]);
      assert.equal(linha.custo_situacao, indice % 4 === 0 ? 'Sim' : null, origem);
    });
    assert.equal(linhas.filter((item) => item.custo_situacao === 'Não').length, 0);
  });

  it('a revisão lista as ambíguas e as sem origem mapeada, e não lista as classificadas', async () => {
    const pendentes = new Set((await q('select id from public.vw_nao_conformidades where classificacao_pendente')).map((item) => item.id));
    assert.ok(pendentes.has(nc.porOrigem['Erro de faturamento / NF (destinatário ou endereço)']));
    assert.ok(pendentes.has(nc.porOrigem['Erro da expedição e do financeiro']));
    assert.ok(pendentes.has(nc.semMapa));
    assert.ok(pendentes.has(nc.semOrigem));
    assert.ok(!pendentes.has(nc.porOrigem['Extravio Correios']));
  });

  it('a classificação antiga da origem continua na visão (area_responsavel e evitavel)', async () => {
    const linha = (await q('select area_responsavel, evitavel from public.vw_nao_conformidades where id = $1', [nc.porOrigem['Extravio Correios']]))[0];
    assert.deepEqual(linha, { area_responsavel: 'Correios', evitavel: 'Não' });
  });
});

describe('persistência: integridade e permissões', () => {
  it('valor fora da lista é recusado em tipo, causador e áreas', async () => {
    const base = ['Cliente lista', 'Extravio Correios', 'Venda'];
    const tipo = await falha(como(c1, u.editor, `insert into public.nao_conformidades (empresa, cliente, origem, tipo_saida, tipo_problema) values ('Alinare', $1, $2, $3, 'Inventado')`, base));
    assert.match(tipo?.message ?? '', /Tipo do problema fora da lista: Inventado/);
    const causador = await falha(como(c1, u.editor, `insert into public.nao_conformidades (empresa, cliente, origem, tipo_saida, causador) values ('Alinare', $1, $2, $3, 'Ninguém')`, base));
    assert.match(causador?.message ?? '', /Origem \/ causador fora da lista: Ninguém/);
    const registro = await falha(como(c1, u.editor, `insert into public.nao_conformidades (empresa, cliente, origem, tipo_saida, area_registro) values ('Alinare', $1, $2, $3, 'Pessoa Fulana')`, base));
    assert.match(registro?.message ?? '', /Área que registrou fora da lista/);
    const tratativa = await falha(como(c1, u.editor, `insert into public.nao_conformidades (empresa, cliente, origem, tipo_saida, area_tratativa) values ('Alinare', $1, $2, $3, 'Pessoa Fulana')`, base));
    assert.match(tratativa?.message ?? '', /Área responsável pela tratativa fora da lista/);
  });

  it('a situação do custo aceita só Sim, Não e Em apuração', async () => {
    const erro = await falha(como(c1, u.editor, `insert into public.nao_conformidades (empresa, cliente, origem, tipo_saida, custo_situacao) values ('Alinare', 'Cliente X', 'Extravio Correios', 'Venda', 'Talvez')`));
    assert.equal(erro?.code, '23514');
  });

  it('"Não" com custo ou reembolso registrado é recusado; com zero é aceito', async () => {
    const comValor = await falha(como(c1, u.editor, `insert into public.nao_conformidades (empresa, cliente, origem, tipo_saida, custo_situacao, custo_produto) values ('Alinare', 'Cliente Não', 'Extravio Correios', 'Venda', 'Não', 10)`));
    assert.match(comValor?.message ?? '', /Situação do custo "Não" exige custos sem valor/);
    const reembolso = await falha(como(c1, u.editor, `insert into public.nao_conformidades (empresa, cliente, origem, tipo_saida, custo_situacao, valor_reembolsado) values ('Alinare', 'Cliente Não', 'Extravio Correios', 'Venda', 'Não', 3)`));
    assert.match(reembolso?.message ?? '', /Situação do custo "Não" exige custos sem valor/);
    const comZero = (await como(c1, u.editor, `insert into public.nao_conformidades (empresa, cliente, origem, tipo_saida, custo_situacao, custo_produto) values ('Alinare', 'Cliente Zero', 'Extravio Correios', 'Venda', 'Não', 0) returning custo_situacao`)).rows[0];
    assert.equal(comZero.custo_situacao, 'Não');
  });

  it('registro novo recebe "Sim" com custo e "Em apuração" sem custo, nunca "Não" por omissão', async () => {
    const comCusto = (await como(c1, u.editor, INSERIR_NC_NOVA, ['Cliente com custo', 'Extravio Correios', 10, null, null, null])).rows[0];
    assert.equal(comCusto.custo_situacao, 'Sim');
    const semCusto = (await como(c1, u.editor, INSERIR_NC_NOVA, ['Cliente sem custo', 'Extravio Correios', null, null, null, null])).rows[0];
    assert.equal(semCusto.custo_situacao, 'Em apuração');
    assert.equal(semCusto.tipo_problema, 'Extravio', 'origem inequívoca ganha a classificação nova');
  });

  it('mudar a situação não apaga valores e a situação não volta a ficar sem informação', async () => {
    const criada = (await como(c1, u.editor, INSERIR_NC_NOVA, ['Cliente valores', 'Extravio Correios', 10, null, null, null])).rows[0];
    const apagar = await falha(salvarComo(u.editor, criada.id, { custo_situacao: 'Em apuração', custo_produto: null }, 'Teste de regra'));
    assert.match(apagar?.message ?? '', /não apaga valores já registrados/);
    assert.equal(Number((await q('select custo_produto from public.nao_conformidades where id = $1', [criada.id]))[0].custo_produto), 10);

    const trocar = await salvarComo(u.editor, criada.id, { custo_situacao: 'Em apuração' }, 'Situação revista');
    assert.equal(trocar.custo_situacao, 'Em apuração');
    assert.equal(Number(trocar.custo_produto), 10);

    const voltar = await falha(salvarComo(u.editor, criada.id, { custo_situacao: null }, 'Teste de regra'));
    assert.match(voltar?.message ?? '', /não pode voltar a ficar sem informação/);
  });

  it('a origem gravada sem a classificação nova não sobrescreve o que já foi informado', async () => {
    const informada = (await como(c1, u.editor, INSERIR_NC_NOVA, ['Cliente informado', 'Extravio Correios', null, null, null, null])).rows[0];
    const mantida = await salvarComo(u.editor, informada.id, { tipo_problema: 'Endereço não localizado', causador: null, origem: 'Outro' });
    assert.equal(mantida.tipo_problema, 'Endereço não localizado', 'o tipo informado é mantido');
    assert.equal(mantida.causador, 'A apurar', 'o causador vazio recebe o da nova origem');
  });

  it('quem só consulta não altera a classificação; só administrador altera as listas', async () => {
    // Quem só consulta não grava: a função recusa (42501) e o UPDATE direto não alcança a linha
    const alvoConsulta = nc.porOrigem['Atraso de postagem'];
    const tipoAntes = (await q('select tipo_problema from public.nao_conformidades where id = $1', [alvoConsulta]))[0].tipo_problema;
    assert.equal((await falha(salvarComo(u.consulta, alvoConsulta, { tipo_problema: 'Extravio' })))?.code, '42501');
    assert.ok(await negado(como(c1, u.consulta, "update public.nao_conformidades set tipo_problema = 'Extravio' where id = $1 returning id", [alvoConsulta])));
    assert.equal((await q('select tipo_problema from public.nao_conformidades where id = $1', [alvoConsulta]))[0].tipo_problema, tipoAntes);
    const lista = await falha(como(c1, u.editor, "insert into public.nc_listas (lista, valor, ordem) values ('causador', 'Teste', 99)"));
    assert.equal(lista?.code, '42501');
  });

  it('NC pode existir sem reversa e reversa sem NC; classificar a NC não muda a reversa', async () => {
    const reversaSemNc = (await q('select nc_id, setor from public.solicitacoes_reverso where id = $1', [u.reversaSemNc.id]))[0];
    assert.equal(reversaSemNc.nc_id, null);
    const semReversa = (await q('select qtd_reversas from public.vw_nao_conformidades where id = $1', [nc.porOrigem['Atraso de postagem']]))[0];
    assert.equal(semReversa.qtd_reversas, 0);

    await salvarComo(u.editor, nc.vinculada, { tipo_problema: 'Endereço incorreto', causador: 'Expedição', area_tratativa: 'Expedição' });
    const reversa = (await q('select nc_id, nc_numero, setor from public.solicitacoes_reverso where id = $1', [u.reversaVinculada.id]))[0];
    assert.equal(reversa.nc_id, nc.vinculada);
    assert.equal(reversa.setor, 'Financeiro');
  });
});

describe('registro novo: classificação explícita (20261109120000)', () => {
  it('sem tipo do problema o registro novo é recusado, mesmo sem origem', async () => {
    const erro = await falha(como(c1, u.editor, "insert into public.nao_conformidades (empresa, cliente, tipo_saida) values ('Alinare', 'Sem tipo', 'Venda')"));
    assert.equal(erro?.code, '23514');
    assert.match(erro?.message ?? '', /Informe o tipo do problema\./);
  });

  it('sem causador o registro novo é recusado, mesmo com tipo', async () => {
    const erro = await falha(como(c1, u.editor, "insert into public.nao_conformidades (empresa, cliente, tipo_saida, tipo_problema) values ('Alinare', 'Sem causador', 'Venda', 'Extravio')"));
    assert.match(erro?.message ?? '', /Informe a origem \/ causador/);
  });

  it('"Outro" exige descrição no registro novo, e aceita quando há descrição', async () => {
    const semDescricao = await falha(como(c1, u.editor, "insert into public.nao_conformidades (empresa, cliente, tipo_saida, tipo_problema, causador, descricao) values ('Alinare', 'Outro sem texto', 'Venda', 'Outro', 'A apurar', '   ')"));
    assert.match(semDescricao?.message ?? '', /Descreva o problema quando o tipo for Outro\./);
    const comDescricao = (await como(c1, u.editor, "insert into public.nao_conformidades (empresa, cliente, tipo_saida, tipo_problema, causador, descricao) values ('Alinare', 'Outro com texto', 'Venda', 'Outro', 'A apurar', 'Peça trocada') returning tipo_problema, causador")).rows[0];
    assert.deepEqual(comDescricao, { tipo_problema: 'Outro', causador: 'A apurar' });
  });

  it('registro novo sem origem antiga é gravado com a classificação nova e aparece na visão e no painel', async () => {
    const criada = (await como(c1, u.editor, "insert into public.nao_conformidades (empresa, cliente, tipo_saida, tipo_problema, causador, custo_produto) values ('Alinare', 'Sem origem', 'Venda', 'Extravio', 'Correios', 40) returning id, origem, custo_situacao")).rows[0];
    assert.equal(criada.origem, null, 'não inventa origem antiga');
    assert.equal(criada.custo_situacao, 'Sim');
    const visao = (await como(c1, u.consulta, 'select classificacao_pendente, area_responsavel from public.vw_nao_conformidades where id = $1', [criada.id])).rows[0];
    assert.deepEqual(visao, { classificacao_pendente: false, area_responsavel: null });
  });

  it('a importação da planilha (importada = true) continua sem exigir a classificação nova', async () => {
    const importada = await falha(como(c1, u.importador, "insert into public.nao_conformidades (numero, importada, empresa, tipo_saida, origem) values (9001, true, 'Alinare', 'Venda', 'Outro')"));
    assert.equal(importada, null);
    const gravada = (await q('select importada, tipo_problema, causador from public.nao_conformidades where numero = 9001'))[0];
    assert.equal(gravada.importada, true);
    assert.equal(gravada.tipo_problema, 'Outro', 'a origem antiga ainda classifica pelo mapeamento');
  });

  it('tipo e causador não voltam a ficar vazios depois de informados', async () => {
    const criada = (await como(c1, u.editor, "insert into public.nao_conformidades (empresa, cliente, tipo_saida, tipo_problema, causador) values ('Alinare', 'Não volta', 'Venda', 'Extravio', 'Correios') returning id")).rows[0];
    const tipoVazio = await falha(salvarComo(u.editor, criada.id, { tipo_problema: null }));
    assert.match(tipoVazio?.message ?? '', /O tipo do problema não pode voltar a ficar sem informação\./);
    const causadorVazio = await falha(salvarComo(u.editor, criada.id, { causador: null }));
    assert.match(causadorVazio?.message ?? '', /A origem \/ causador não pode voltar a ficar sem informação\./);
  });

  it('ncs_para_reversa devolve tipo e causador (sem custos) e segue fechada para anon', async () => {
    const criada = (await como(c1, u.editor, "insert into public.nao_conformidades (empresa, cliente, tipo_saida, tipo_problema, causador, custo_produto) values ('Alinare', 'Para reversa', 'Venda', 'Extravio', 'Correios', 99) returning id")).rows[0];
    const linha = (await como(c1, u.solicitante, "select * from public.ncs_para_reversa('Alinare')")).rows.find((l) => l.id === criada.id);
    assert.ok(linha, 'NC aberta da empresa aparece para o formulário');
    assert.equal(linha.tipo_problema, 'Extravio');
    assert.equal(linha.causador, 'Correios');
    assert.equal('custo_produto' in linha, false, 'custos não saem na função da reversa');
    assert.equal((await falha(como(c1, ANON, "select * from public.ncs_para_reversa('Alinare')")))?.code, '42501');
  });
});

describe('reexecução', () => {
  it('reaplicar a migration não altera a classificação já gravada nem acrescenta histórico', async () => {
    const classificacaoAntes = await q(CLASSIFICACAO);
    const historicoAntes = (await q('select count(*)::int as n from public.nc_historico'))[0].n;
    for (const arquivo of migrationsNovas().filter((f) => f >= MIGRATION)) await banco.aplicar(arquivo);
    assert.deepEqual(await q(CLASSIFICACAO), classificacaoAntes);
    assert.equal((await q('select count(*)::int as n from public.nc_historico'))[0].n, historicoAntes);
  });
});
