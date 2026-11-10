// Não conformidades: fechamento da edição (20261109140000). Só o que mudou é gravado; a versão é
// conferida na mesma operação, sem perder precisão; correção de valor registrado exige justificativa
// e fica na trilha financeira (valor anterior, posterior, autor e data). PostgreSQL 17 local e
// temporário (embedded-postgres), como os outros testes do banco.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { como, criarUsuario, iniciarBanco, migrationsNovas } from './lib/banco.mjs';

const MIGRATION = '20261109140000_nc_edicao_versao_auditoria.sql';
const SALVAR = 'select * from public.nc_salvar_edicao($1::uuid, $2::timestamptz, $3::jsonb, $4)';
const INSERIR_NC = `insert into public.nao_conformidades
  (empresa, cliente, tipo_saida, data_ocorrencia, status, tipo_problema, causador, custo_situacao,
   custo_produto, custo_frete_adicional, custo_multa_outros, valor_reembolsado, nf, descricao)
  values ('Alinare', $1, 'Venda', '2026-10-01', 'Aberta', 'Endereço incorreto', 'Expedição', $2, $3, $4, $5, $6, $7, $8)
  returning id, numero`;
// Versão como texto: preserva os microssegundos que o driver converteria em Date (e perderia)
const LER_NC = `select nc.*, nc.updated_at::text as versao from public.vw_nao_conformidades nc where nc.id = $1`;
const AUDITORIA = 'select * from public.nc_auditoria_financeira where nc_id = $1 order by campo, criado_em';
const SEM_NC = '00000000-0000-4000-8000-000000000999';

let banco;
let db;
let c1;
const u = {};
const nc = {};
const antes = {};

const q = async (sql, params) => (await db.query(sql, params)).rows;
const falha = (promessa) => promessa.then(() => null, (erro) => erro);
const salvar = (persona, id, versao, campos, motivo = null) =>
  como(c1, persona, SALVAR, [id, versao, JSON.stringify(campos), motivo]).then((r) => r.rows[0]);
const lerNc = async (id) => (await q(LER_NC, [id]))[0];
const auditoria = (id) => q(AUDITORIA, [id]);

const CAMPOS_QUE_NAO_MUDAM_COM_NF = [
  'descricao', 'cliente', 'tipo_problema', 'causador', 'custo_situacao', 'custo_produto',
  'custo_frete_adicional', 'custo_multa_outros', 'valor_reembolsado', 'status', 'empresa', 'tipo_saida',
];

before(async () => {
  banco = await iniciarBanco();
  db = banco.dono;
  c1 = await banco.conectar();
  const todas = migrationsNovas();

  // Base em uso: NCs criadas antes desta migration
  for (const arquivo of todas.filter((f) => f < MIGRATION)) await banco.aplicar(arquivo);
  u.editor = await criarUsuario(db, 'Editora NC', ['nc-edit']);
  u.consulta = await criarUsuario(db, 'Consulta NC', ['nc']);
  u.sem = await criarUsuario(db, 'Solicitante Alinare', ['formulario-alinare']);

  // Legado com texto que tem tags e um zero explícito em multa
  nc.legado = (await db.query(INSERIR_NC, ['Ateliê Aurora', 'Sim', 100, 40, 0, null, 'NF-1001', 'Cliente pediu <b>troca</b> urgente'])).rows[0];
  nc.vazia = (await db.query(INSERIR_NC, ['Casa Azul', 'Sim', null, null, null, null, null, 'Sem custo ainda'])).rows[0];
  nc.zero = (await db.query(INSERIR_NC, ['Loja Verde', 'Sim', 0, null, null, null, null, 'Zero registrado'])).rows[0];
  nc.apagar = (await db.query(INSERIR_NC, ['Moda Sul', 'Sim', 50, null, null, null, null, 'Para apagar'])).rows[0];
  nc.versao = (await db.query(INSERIR_NC, ['Boutique Lia', 'Sim', 10, null, null, null, null, 'Versão'])).rows[0];
  antes.legado = await lerNc(nc.legado.id);

  // Migration nova e as posteriores, sobre a base em uso
  for (const arquivo of todas.filter((f) => f >= MIGRATION)) await banco.aplicar(arquivo);
});

after(async () => {
  await banco?.encerrar();
});

describe('a migration não mexe nos dados existentes', () => {
  it('a NC legada tem a mesma versão e os mesmos valores depois da migration', async () => {
    const depois = await lerNc(nc.legado.id);
    assert.equal(depois.versao, antes.legado.versao);
    assert.equal(depois.descricao, 'Cliente pediu <b>troca</b> urgente');
    assert.equal(depois.custo_produto, antes.legado.custo_produto);
  });
});

describe('gravação só do alterado e versão conferida', () => {
  it('salvar sem mudanças não regrava: a versão e a trilha ficam como estavam', async () => {
    const versao = (await lerNc(nc.legado.id)).versao;
    const trilhaAntes = (await auditoria(nc.legado.id)).length;
    await salvar(u.editor, nc.legado.id, versao, {});
    await salvar(u.editor, nc.legado.id, versao, { nf: 'NF-1001' });
    assert.equal((await lerNc(nc.legado.id)).versao, versao);
    assert.equal((await auditoria(nc.legado.id)).length, trilhaAntes);
  });

  it('editar só a NF não altera descrição, cliente, classificação nem custos; o texto legado mantém as tags', async () => {
    const antesDaEdicao = await lerNc(nc.legado.id);
    const nova = await salvar(u.editor, nc.legado.id, antesDaEdicao.versao, { nf: 'NF-2002' });
    assert.equal(nova.nf, 'NF-2002');
    const depois = await lerNc(nc.legado.id);
    for (const campo of CAMPOS_QUE_NAO_MUDAM_COM_NF) {
      assert.deepEqual(depois[campo], antesDaEdicao[campo], `${campo} não deveria mudar`);
    }
    const [maior] = await q('select $1::timestamptz > $2::timestamptz as maior', [depois.versao, antesDaEdicao.versao]);
    assert.equal(maior.maior, true, 'a versão muda a cada gravação efetiva');
  });

  it('duas sessões alterando a mesma NC: a segunda é recusada, nada é sobrescrito, e reaplica sobre a versão atual', async () => {
    const versaoInicial = (await lerNc(nc.versao.id)).versao;
    // Sessão A grava o status
    await salvar(u.editor, nc.versao.id, versaoInicial, { status: 'Em tratativa' });
    // Sessão B ainda tem a versão inicial e tenta gravar a resolução
    const erro = await falha(salvar(u.editor, nc.versao.id, versaoInicial, { resolucao: 'Reverso' }));
    assert.equal(erro?.code, 'NC001');
    const apos = await lerNc(nc.versao.id);
    assert.equal(apos.status, 'Em tratativa', 'a gravação de A foi preservada');
    assert.equal(apos.resolucao, null, 'a gravação recusada não foi aplicada');
    // B reaplica sobre a versão atual e grava: o que A gravou continua
    const reaplicada = await salvar(u.editor, nc.versao.id, apos.versao, { resolucao: 'Reverso' });
    assert.equal(reaplicada.resolucao, 'Reverso');
    assert.equal((await lerNc(nc.versao.id)).status, 'Em tratativa');
  });

  it('versão ausente é recusada (NC004) e campo fora da lista de edição também (NC003)', async () => {
    const atual = await lerNc(nc.legado.id);
    assert.equal((await falha(salvar(u.editor, nc.legado.id, null, { nf: 'x' })))?.code, 'NC004');
    assert.equal((await falha(salvar(u.editor, nc.legado.id, atual.versao, { numero: 999 })))?.code, 'NC003');
    assert.equal((await falha(salvar(u.editor, nc.legado.id, atual.versao, { importada: true })))?.code, 'NC003');
  });

  it('NC inexistente é recusada (NC005)', async () => {
    assert.equal((await falha(salvar(u.editor, SEM_NC, '2026-10-01 00:00:00+00', { nf: 'x' })))?.code, 'NC005');
  });

  it('sem permissão de edição, nada é gravado (42501)', async () => {
    const atual = await lerNc(nc.legado.id);
    assert.equal((await falha(salvar(u.consulta, nc.legado.id, atual.versao, { nf: 'NF-3003' })))?.code, '42501');
    assert.equal((await falha(salvar(u.sem, nc.legado.id, atual.versao, { nf: 'NF-3003' })))?.code, '42501');
    assert.equal((await lerNc(nc.legado.id)).nf, 'NF-2002');
  });
});

describe('trilha financeira e justificativa de correção', () => {
  it('correção de valor registrado sem justificativa é recusada (NC002), também com espaços', async () => {
    const atual = await lerNc(nc.legado.id);
    const trilha = (await auditoria(nc.legado.id)).length;
    assert.equal((await falha(salvar(u.editor, nc.legado.id, atual.versao, { custo_produto: 90 })))?.code, 'NC002');
    assert.equal((await falha(salvar(u.editor, nc.legado.id, atual.versao, { custo_produto: 90 }, '   ')))?.code, 'NC002');
    assert.equal(Number((await lerNc(nc.legado.id)).custo_produto), 100);
    assert.equal((await auditoria(nc.legado.id)).length, trilha);
  });

  it('preencher um valor vazio não é correção: registra "preenchimento", sem justificativa', async () => {
    const atual = await lerNc(nc.vazia.id);
    await salvar(u.editor, nc.vazia.id, atual.versao, { custo_produto: 30 });
    const [linha] = (await auditoria(nc.vazia.id)).filter((r) => r.campo === 'custo_produto');
    assert.equal(linha.tipo_alteracao, 'preenchimento');
    assert.equal(linha.valor_anterior, null);
    assert.equal(Number(linha.valor_posterior), 30);
    assert.equal(linha.motivo, null);
  });

  it('correção para zero com justificativa: zero é valor, e o anterior fica na trilha com autor e data', async () => {
    const atual = await lerNc(nc.legado.id);
    const motivo = 'Cliente cancelou; sem custo';
    await salvar(u.editor, nc.legado.id, atual.versao, { custo_produto: 0, custo_frete_adicional: 0, custo_situacao: 'Não' }, motivo);
    const depois = await lerNc(nc.legado.id);
    assert.equal(Number(depois.custo_produto), 0);
    assert.equal(depois.custo_situacao, 'Não');
    const trilha = await auditoria(nc.legado.id);
    const produto = trilha.find((r) => r.campo === 'custo_produto');
    assert.deepEqual([Number(produto.valor_anterior), Number(produto.valor_posterior), produto.tipo_alteracao], [100, 0, 'correcao']);
    assert.equal(produto.motivo, motivo);
    assert.equal(produto.origem, 'edicao');
    assert.equal(produto.autor_id, u.editor.id);
    assert.equal(produto.autor_nome, 'Editora NC');
    assert.ok(produto.criado_em, 'data registrada');
    const frete = trilha.find((r) => r.campo === 'custo_frete_adicional');
    assert.deepEqual([Number(frete.valor_anterior), Number(frete.valor_posterior)], [40, 0]);
    const situacao = trilha.find((r) => r.campo === 'custo_situacao');
    assert.deepEqual([situacao.texto_anterior, situacao.texto_posterior, situacao.tipo_alteracao], ['Sim', 'Não', 'correcao']);
    assert.equal(trilha.some((r) => r.campo === 'custo_multa_outros'), false, 'valor que não mudou não entra na trilha');
  });

  it('zero registrado conta como valor: sair de zero exige justificativa e fica na trilha', async () => {
    const atual = await lerNc(nc.zero.id);
    assert.equal((await falha(salvar(u.editor, nc.zero.id, atual.versao, { custo_produto: 15 })))?.code, 'NC002');
    await salvar(u.editor, nc.zero.id, atual.versao, { custo_produto: 15 }, 'Valor informado depois');
    const [linha] = (await auditoria(nc.zero.id)).filter((r) => r.campo === 'custo_produto');
    assert.deepEqual([Number(linha.valor_anterior), Number(linha.valor_posterior), linha.tipo_alteracao], [0, 15, 'correcao']);
  });

  it('as regras do banco continuam valendo: "Não" com valor positivo e apagar valor junto com a situação', async () => {
    const zero = await lerNc(nc.zero.id);
    const erroNao = await falha(salvar(u.editor, nc.zero.id, zero.versao, { custo_situacao: 'Não', custo_produto: 20 }, 'Teste'));
    assert.equal(erroNao?.code, '23514');
    assert.match(erroNao.message, /exige custos sem valor/);
    const apagar = await lerNc(nc.apagar.id);
    const erroApagar = await falha(salvar(u.editor, nc.apagar.id, apagar.versao, { custo_situacao: 'Não', custo_produto: null }, 'Teste'));
    assert.equal(erroApagar?.code, '23514');
    assert.match(erroApagar.message, /não apaga valores/);
    assert.equal(Number((await lerNc(nc.apagar.id)).custo_produto), 50);
  });

  it('a trilha só é lida pelos usuários que veem a NC, e ninguém a altera pela API', async () => {
    const [{ total }] = await como(c1, u.consulta, 'select count(*)::int as total from public.nc_auditoria_financeira').then((r) => r.rows);
    assert.ok(total > 0, 'quem pode ver a NC lê a trilha');
    const [{ total: semAcesso }] = await como(c1, u.sem, 'select count(*)::int as total from public.nc_auditoria_financeira').then((r) => r.rows);
    assert.equal(semAcesso, 0);
    assert.ok(await falha(como(c1, u.editor, 'delete from public.nc_auditoria_financeira')), 'apagar a trilha é recusado');
    assert.ok(await falha(como(c1, u.editor, 'update public.nc_auditoria_financeira set motivo = $1', ['x'])), 'alterar a trilha é recusado');
  });

  it('a linha do tempo antiga continua sendo gravada pelo trigger de histórico', async () => {
    const [{ total }] = await q(
      "select count(*)::int as total from public.nc_historico where nc_id = $1 and acao like 'Dados atualizados:%'",
      [nc.legado.id]
    );
    assert.ok(total >= 2, 'as edições aparecem na linha do tempo');
  });
});
