// Acompanhamento do convite de acesso (20261028110000): PostgreSQL real, papéis reais e RLS ligada.
// O que a Edge Function admin-usuarios faz com o banco é reproduzido com as mesmas funções.
// Não cobre o Supabase Auth real (generateLink, verifyOtp): isso só se prova no projeto Supabase.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANON, como, criarUsuario, iniciarBanco, migrationsNovas, SERVICE_ROLE } from './lib/banco.mjs';

let banco;
let db;
let c1;
let c2;
const u = {};
const falha = (promessa) => promessa.then(() => null, (erro) => erro);
const q = async (sql, params) => (await db.query(sql, params)).rows;
const servico = (conexao, sql, params) => como(conexao, SERVICE_ROLE, sql, params);

async function pendente(email) {
  const { rows } = await db.query(
    `insert into auth.users (email, raw_app_meta_data) values ($1, '{"telas":["lista-geral"]}'::jsonb) returning id`, [email]);
  return rows[0].id;
}
const iniciar = async (conexao, id, email = 'pessoa@azime.com.br', ack = false) =>
  (await servico(conexao, 'select * from public.admin_convite_iniciar_envio($1, $2, $3, $4)', [id, email, u.admin.id, ack])).rows[0];
const finalizar = async (tentativa, estado, http = 200, detalhe = 'ok') =>
  (await servico(c1, 'select public.admin_convite_finalizar_envio($1, $2, $3, $4) as ok', [tentativa, estado, http, detalhe])).rows[0].ok;
const linha = async (id) => (await q('select * from public.convites_acesso where usuario_id = $1', [id]))[0];

before(async () => {
  banco = await iniciarBanco();
  db = banco.dono;
  for (const migration of migrationsNovas()) await banco.aplicar(migration);
  c1 = await banco.conectar();
  c2 = await banco.conectar();
  u.admin = await criarUsuario(db, 'Admin do convite', []);
  u.comum = await criarUsuario(db, 'Usuário comum', []);
});

after(async () => {
  await banco?.encerrar();
});

describe('convites_acesso: acesso restrito', () => {
  it('anon e authenticated não leem nem escrevem na tabela', async () => {
    const id = await pendente('restrito@azime.com.br');
    await servico(c1, 'select public.admin_convite_preparar($1, $2, $3)', [id, 'restrito@azime.com.br', u.admin.id]);
    for (const persona of [u.comum, u.admin]) {
      const erro = await falha(como(c1, persona, 'select * from public.convites_acesso'));
      assert.equal(erro?.code, '42501', 'permissão negada na tabela');
      assert.ok(await falha(como(c1, persona, `insert into public.convites_acesso (usuario_id, email, estado) values ($1, 'x@azime.com.br', 'enviado')`, [id])));
    }
    const anon = await falha(como(c1, ANON, 'select * from public.convites_acesso'));
    assert.ok(anon);
  });

  it('as funções só executam para service_role (nem admin autenticado as chama)', async () => {
    const id = await pendente('funcoes@azime.com.br');
    const chamadas = [
      ['select * from public.admin_convite_localizar_usuario($1)', ['funcoes@azime.com.br']],
      ['select public.admin_convite_preparar($1, $2, $3)', [id, 'funcoes@azime.com.br', u.admin.id]],
      ['select * from public.admin_convite_iniciar_envio($1, $2, $3, false)', [id, 'funcoes@azime.com.br', u.admin.id]],
      ['select public.admin_convite_finalizar_envio($1, $2, 200, $3)', [id, 'enviado', 'x']],
      ['select * from public.admin_convites_listar()', []],
    ];
    for (const persona of [u.comum, u.admin]) {
      for (const [sql, params] of chamadas) {
        const erro = await falha(como(c1, persona, sql, params));
        assert.equal(erro?.code, '42501', `${sql} deveria ser negada`);
      }
    }
  });

  it('não existe coluna que guarde link, token ou senha', async () => {
    const colunas = (await q(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'convites_acesso'`)).map((r) => r.column_name);
    for (const proibida of colunas) assert.doesNotMatch(proibida, /link|token_hash|url|senha|password|secret/i);
  });
});

describe('localizar conta pelo e-mail', () => {
  it('acha pendente e ativo sem diferenciar caixa, e informa se há senha', async () => {
    const id = await pendente('Caixa.Mista@azime.com.br');
    let r = (await servico(c1, 'select * from public.admin_convite_localizar_usuario($1)', ['  caixa.mista@AZIME.com.br '])).rows[0];
    assert.deepEqual({ id: r.id, confirmado: r.confirmado, tem_senha: r.tem_senha }, { id, confirmado: false, tem_senha: false });
    await db.query(`update auth.users set email_confirmed_at = now(), encrypted_password = 'hash' where id = $1`, [id]);
    r = (await servico(c1, 'select * from public.admin_convite_localizar_usuario($1)', ['caixa.mista@azime.com.br'])).rows[0];
    assert.deepEqual({ confirmado: r.confirmado, tem_senha: r.tem_senha }, { confirmado: true, tem_senha: true });
    assert.equal((await servico(c1, 'select * from public.admin_convite_localizar_usuario($1)', ['ninguem@azime.com.br'])).rows.length, 0);
  });
});

describe('reserva atômica do envio', () => {
  it('duas reservas simultâneas: só uma recebe a tentativa, a outra vê "em_andamento"', async () => {
    const id = await pendente('corrida@azime.com.br');
    const [a, b] = await Promise.all([iniciar(c1, id), iniciar(c2, id)]);
    const resultados = [a.resultado, b.resultado].sort();
    assert.deepEqual(resultados, ['em_andamento', 'ok']);
    const vencedora = a.resultado === 'ok' ? a : b;
    assert.ok(vencedora.tentativa_id);
    const dados = await linha(id);
    assert.equal(dados.estado, 'envio_em_andamento');
    assert.equal(dados.tentativas, 1);
  });

  it('finalizar vale uma vez, só para a tentativa reservada', async () => {
    const id = await pendente('final@azime.com.br');
    const { tentativa_id: tentativa } = await iniciar(c1, id);
    assert.equal(await finalizar('00000000-0000-4000-8000-000000000000', 'enviado'), false);
    assert.equal(await finalizar(tentativa, 'enviado'), true);
    assert.equal(await finalizar(tentativa, 'falhou'), false, 'já fechada');
    const dados = await linha(id);
    assert.equal(dados.estado, 'enviado');
    assert.equal(dados.ultimo_http, 200);
    assert.ok(dados.concluido_em);
  });

  it('estado inválido é recusado e detalhe longo é truncado', async () => {
    const id = await pendente('estado@azime.com.br');
    const { tentativa_id: tentativa } = await iniciar(c1, id);
    assert.ok(await falha(finalizar(tentativa, 'sucesso-inventado')));
    assert.equal(await finalizar(tentativa, 'falhou', 502, 'x'.repeat(500)), true);
    assert.equal((await linha(id)).detalhe.length, 200);
  });

  it('falha segura permite nova tentativa na hora; o contador cresce e a conta é a mesma', async () => {
    const id = await pendente('retomada@azime.com.br');
    const primeira = await iniciar(c1, id);
    await finalizar(primeira.tentativa_id, 'falhou', null, 'falha antes do fluxo');
    const segunda = await iniciar(c1, id);
    assert.equal(segunda.resultado, 'ok');
    assert.notEqual(segunda.tentativa_id, primeira.tentativa_id);
    assert.equal((await linha(id)).tentativas, 2);
    assert.equal((await q(`select count(*)::int as n from auth.users where email = 'retomada@azime.com.br'`))[0].n, 1);
  });

  it('resultado incerto só permite novo envio com confirmação explícita', async () => {
    const id = await pendente('incerto@azime.com.br');
    const { tentativa_id: tentativa } = await iniciar(c1, id);
    await finalizar(tentativa, 'resultado_indeterminado', null, 'timeout');
    assert.equal((await iniciar(c1, id)).resultado, 'confirmacao_necessaria');
    assert.equal((await linha(id)).estado, 'resultado_indeterminado', 'nada mudou sem a confirmação');
    const confirmada = await iniciar(c1, id, 'incerto@azime.com.br', true);
    assert.equal(confirmada.resultado, 'ok');
  });

  it('tentativa que nunca terminou (função interrompida) expira e também exige confirmação', async () => {
    const id = await pendente('expirada@azime.com.br');
    await iniciar(c1, id);
    assert.equal((await iniciar(c2, id)).resultado, 'em_andamento');
    await db.query(`update public.convites_acesso set iniciado_em = now() - interval '4 minutes' where usuario_id = $1`, [id]);
    assert.equal((await iniciar(c2, id)).resultado, 'confirmacao_necessaria');
    assert.equal((await iniciar(c2, id, 'expirada@azime.com.br', true)).resultado, 'ok');
  });

  it('conta ativa nunca recebe tentativa de convite', async () => {
    const id = await pendente('ativa@azime.com.br');
    await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [id]);
    const r = await iniciar(c1, id);
    assert.equal(r.resultado, 'usuario_ativo');
    assert.equal(r.tentativa_id, null);
    assert.equal(await linha(id), undefined, 'nenhuma linha criada');
  });

  it('preparar não rebaixa um estado mais avançado', async () => {
    const id = await pendente('preparar@azime.com.br');
    assert.equal((await servico(c1, 'select public.admin_convite_preparar($1, $2, $3) as e', [id, 'preparar@azime.com.br', u.admin.id])).rows[0].e, 'preparado');
    const { tentativa_id: tentativa } = await iniciar(c1, id);
    await finalizar(tentativa, 'enviado');
    assert.equal((await servico(c1, 'select public.admin_convite_preparar($1, $2, $3) as e', [id, 'preparar@azime.com.br', u.admin.id])).rows[0].e, 'enviado');
  });

  it('usuário inexistente é recusado', async () => {
    const erro = await falha(iniciar(c1, '00000000-0000-4000-8000-0000000000ff'));
    assert.equal(erro?.code, '22023');
  });
});

describe('resultado de convites SMTP (20261028140000)', () => {
  it('registra aceitação SMTP separada do histórico antigo de HTTP', async () => {
    const id = await pendente('smtp@azime.com.br');
    const { tentativa_id: tentativa } = await iniciar(c1, id);
    const resultado = (await servico(c1,
      'select public.admin_convite_finalizar_envio_smtp($1, $2, $3, $4) as ok',
      [tentativa, 'smtp_aceito', 250, 'smtp_aceitou_mensagem_nao_confirma_entrega'])).rows[0].ok;
    assert.equal(resultado, true);
    assert.equal((await linha(id)).estado, 'smtp_aceito');
    assert.equal((await linha(id)).ultimo_smtp, 250);
    assert.equal((await linha(id)).ultimo_http, null);
    assert.equal(await servico(c1,
      'select public.admin_convite_finalizar_envio_smtp($1, $2, $3, $4) as ok',
      [tentativa, 'smtp_aceito', 250, 'duplicada']).then((r) => r.rows[0].ok), false, 'a tentativa só fecha uma vez');
  });

  it('não permite que authenticated finalize envios SMTP', async () => {
    const id = await pendente('smtp-permissao@azime.com.br');
    const { tentativa_id: tentativa } = await iniciar(c1, id);
    const erro = await falha(como(c1, u.admin,
      'select public.admin_convite_finalizar_envio_smtp($1, $2, $3, $4)',
      [tentativa, 'smtp_aceito', 250, 'detalhe']));
    assert.equal(erro?.code, '42501');
  });
});

describe('convite aberto e senha não definida (20261028120000)', () => {
  const sessaoDe = (id) => ({ nome: `sessao-${id}`, papel: 'authenticated', claims: { sub: id, role: 'authenticated' } });
  const pergunta = async (persona) => (await como(c1, persona, 'select public.convite_senha_pendente() as pendente')).rows[0].pendente;
  /** Convidada que abriu o convite (conta confirmada) e ainda não definiu a senha. */
  async function aceitaSemSenha(email) {
    const id = await pendente(email);
    const { tentativa_id: tentativa } = await iniciar(c1, id, email);
    await finalizar(tentativa, 'enviado');
    await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [id]);
    return id;
  }

  it('a própria sessão descobre que falta definir a senha; com senha, ou sem convite, a resposta é falsa', async () => {
    const id = await aceitaSemSenha('retoma@azime.com.br');
    assert.equal(await pergunta(sessaoDe(id)), true);
    await db.query(`update auth.users set encrypted_password = 'hash' where id = $1`, [id]);
    assert.equal(await pergunta(sessaoDe(id)), false, 'depois de definir a senha');
    // Conta confirmada, sem senha, mas que não veio de convite: nunca é tratada como convite pendente.
    const legada = await pendente('legada@azime.com.br');
    await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [legada]);
    assert.equal(await pergunta(sessaoDe(legada)), false);
    // Convite ainda não aceito (não confirmado): a pessoa nem tem sessão, e a resposta é falsa.
    const naoAceito = await pendente('naoaceito@azime.com.br');
    await servico(c1, 'select public.admin_convite_preparar($1, $2, $3)', [naoAceito, 'naoaceito@azime.com.br', u.admin.id]);
    assert.equal(await pergunta(sessaoDe(naoAceito)), false);
  });

  it('só responde sobre auth.uid(): outra sessão não descobre nada sobre a convidada, e anon recebe falso/negado', async () => {
    const id = await aceitaSemSenha('privada@azime.com.br');
    assert.equal(await pergunta(u.comum), false, 'a resposta é sobre quem pergunta, não sobre a convidada');
    assert.equal(await pergunta(u.admin), false, 'nem o administrador consulta a situação de outra pessoa');
    const argumentos = await q(`select pronargs from pg_proc where proname = 'convite_senha_pendente'`);
    assert.equal(argumentos[0].pronargs, 0, 'sem parâmetro de e-mail ou id');
    const anon = await falha(como(c1, ANON, 'select public.convite_senha_pendente()'));
    assert.equal(anon?.code, '42501');
    assert.ok(id);
  });

  it('bloqueia backend, RPCs e RLS até a pessoa definir a senha; restaura as permissões depois', async () => {
    const id = await pendente('bloqueada@azime.com.br');
    const metadados = {
      provider: 'email', perfil_acesso: 'mestre', perfil: 'ADMIN',
      telas: ['usuarios', 'formulario-alinare', 'aprovar-reversa', 'nc-edit'],
      empresas_acesso: ['Alinare'],
    };
    await db.query(`update auth.users set email_confirmed_at = now(), encrypted_password = '', raw_app_meta_data = $2 where id = $1`, [id, metadados]);
    await db.query(`insert into public.convites_acesso (usuario_id, email, estado) values ($1, $2, 'enviado')`, [id, 'bloqueada@azime.com.br']);
    const sessao = sessaoDe(id);
    assert.equal(await pergunta(sessao), true);

    const acesso = (await como(c1, sessao, `select public.current_telas() as telas,
      public.current_perfil_legacy() as perfil, public.is_admin() as admin,
      public.is_mestre() as mestre, public.empresas_operaveis() as empresas,
      public.pode_ver_nc() as pode_ver_nc`)).rows[0];
    assert.deepEqual(acesso, { telas: [], perfil: '', admin: false, mestre: false, empresas: [], pode_ver_nc: false });

    const pedido = (await db.query(`insert into public.solicitacoes_reverso
      (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo, solicitado_por)
      values ('Alinare', current_date, 'Teste', 'Comercial', 7001, 'Cliente de teste', 'Rua de teste, 1', 'Outros', $1)
      returning id, aprovacao_versao`, [id])).rows[0];
    const linhasVisiveis = await como(c1, sessao, 'select id from public.solicitacoes_reverso where id = $1', [pedido.id]);
    assert.deepEqual(linhasVisiveis.rows, [], 'a policy não deixa a conta pendente ler nem o próprio pedido');
    assert.equal((await como(c1, sessao, 'select public.pode_ler_solicitacao($1) as pode', [pedido.id])).rows[0].pode, false);
    const inserir = await falha(como(c1, sessao, `insert into public.solicitacoes_reverso
      (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo)
      values ('Alinare', current_date, 'Teste', 'Comercial', 7002, 'Outro cliente', 'Rua de teste, 2', 'Outros')`));
    assert.equal(inserir?.code, '42501', 'RLS também recusa uma operação direta');
    const aprovar = await falha(como(c1, sessao, 'select * from public.aprovar_reversa($1, $2, null)', [pedido.id, pedido.aprovacao_versao]));
    assert.equal(aprovar?.code, '42501', 'RPC de operação também é recusada');

    // A guarda é vinculada à linha de convite e à ausência de senha; usuários antigos não mudam.
    const antiga = await pendente('antiga@azime.com.br');
    await db.query(`update auth.users set raw_app_meta_data = $2 where id = $1`, [antiga, metadados]);
    assert.equal((await como(c1, sessaoDe(antiga), 'select public.is_admin() as admin, public.is_mestre() as mestre')).rows[0].admin, true);

    await db.query(`update auth.users set encrypted_password = 'hash' where id = $1`, [id]);
    assert.equal(await pergunta(sessao), false);
    const restaurado = (await como(c1, sessao, `select public.current_telas() as telas,
      public.is_admin() as admin, public.is_mestre() as mestre`)).rows[0];
    assert.deepEqual(restaurado, { telas: metadados.telas, admin: true, mestre: true });
    assert.deepEqual((await q(`select raw_app_meta_data from auth.users where id = $1`, [id]))[0].raw_app_meta_data, metadados);
  });

  it('o administrador (service_role) reserva envio para conta aceita sem senha: a tentativa vale e as permissões ficam', async () => {
    const id = await aceitaSemSenha('reenvio@azime.com.br');
    const antes = await q(`select raw_app_meta_data, raw_user_meta_data, email from auth.users where id = $1`, [id]);
    const r = await iniciar(c1, id, 'reenvio@azime.com.br');
    assert.equal(r.resultado, 'ok');
    assert.ok(r.tentativa_id);
    assert.equal((await linha(id)).tentativas, 2);
    assert.equal(await finalizar(r.tentativa_id, 'enviado'), true);
    assert.deepEqual(await q(`select raw_app_meta_data, raw_user_meta_data, email from auth.users where id = $1`, [id]), antes);
    assert.equal((await q(`select count(*)::int as n from auth.users where email = 'reenvio@azime.com.br'`))[0].n, 1);
  });

  it('conta com senha (ativa) continua recusada, mesmo tendo linha de convite; nenhuma tentativa é criada', async () => {
    const id = await aceitaSemSenha('comsenha@azime.com.br');
    const antes = await linha(id);
    await db.query(`update auth.users set encrypted_password = 'hash' where id = $1`, [id]);
    const r = await iniciar(c1, id, 'comsenha@azime.com.br');
    assert.equal(r.resultado, 'usuario_ativo');
    assert.equal(r.tentativa_id, null);
    assert.deepEqual(await linha(id), antes, 'a linha não foi tocada');
  });

  it('a reserva para conta aceita sem senha continua atômica e exige confirmação depois de resultado incerto', async () => {
    const id = await aceitaSemSenha('atomica@azime.com.br');
    const [a, b] = await Promise.all([iniciar(c1, id, 'atomica@azime.com.br'), iniciar(c2, id, 'atomica@azime.com.br')]);
    assert.deepEqual([a.resultado, b.resultado].sort(), ['em_andamento', 'ok']);
    const vencedora = a.resultado === 'ok' ? a : b;
    await finalizar(vencedora.tentativa_id, 'resultado_indeterminado', null, 'timeout');
    assert.equal((await iniciar(c1, id, 'atomica@azime.com.br')).resultado, 'confirmacao_necessaria');
  });

  it('as funções novas e a refeita não são executáveis por authenticated (iniciar_envio) e a pergunta não é por anon', async () => {
    const id = await aceitaSemSenha('permissao@azime.com.br');
    for (const persona of [u.comum, u.admin, sessaoDe(id)]) {
      const erro = await falha(como(c1, persona, 'select * from public.admin_convite_iniciar_envio($1, $2, $3, false)', [id, 'permissao@azime.com.br', u.admin.id]));
      assert.equal(erro?.code, '42501');
    }
  });
});

describe('VERIFICAR_PUBLICACAO_CONVITES.sql (diagnóstico somente de leitura)', () => {
  const script = readFileSync(new URL('../VERIFICAR_PUBLICACAO_CONVITES.sql', import.meta.url), 'utf8');
  const sqlExecutavel = script.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

  it('num banco com a cadeia inteira aplicada, nenhuma linha é FALTA', async () => {
    const linhas = (await db.query(sqlExecutavel)).rows;
    assert.ok(linhas.length >= 18);
    assert.deepEqual(linhas.filter((l) => l.status !== 'OK').map((l) => l.item), []);
  });

  it('aponta FALTA quando um objeto some ou quando as permissões estão erradas (e nada fica alterado)', async () => {
    await db.query('begin');
    try {
      await db.query('drop function public.convite_senha_pendente()');
      await db.query('grant execute on function public.admin_convites_listar() to authenticated');
      const linhas = (await db.query(sqlExecutavel)).rows;
      const faltas = linhas.filter((l) => l.status === 'FALTA').map((l) => l.item);
      assert.ok(faltas.includes('Funcao public.convite_senha_pendente()'));
      assert.ok(faltas.includes('Funcao public.admin_convites_listar()'), 'authenticated não pode executar');
    } finally {
      await db.query('rollback');
    }
    assert.ok((await db.query(`select to_regprocedure('public.convite_senha_pendente()') as f`)).rows[0].f);
  });

  it('o script não escreve nada (só consulta)', () => {
    assert.doesNotMatch(sqlExecutavel.replaceAll("'SELECT, INSERT, UPDATE, DELETE'", ''), /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i);
  });
});

describe('VERIFICAR_PUBLICACAO_SMTP.sql (diagnóstico somente de leitura)', () => {
  const script = readFileSync(new URL('../VERIFICAR_PUBLICACAO_SMTP.sql', import.meta.url), 'utf8');
  const sqlExecutavel = script.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

  it('confere dependências e objetos SMTP sem apontar lacunas na cadeia local completa', async () => {
    const linhas = (await db.query(sqlExecutavel)).rows;
    assert.ok(linhas.length >= 28);
    assert.deepEqual(linhas.filter((l) => l.status !== 'OK').map((l) => l.item), []);
  });

  it('é somente leitura', () => {
    assert.doesNotMatch(sqlExecutavel.replaceAll("'SELECT, INSERT, UPDATE, DELETE'", ''), /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i);
  });
});

describe('Edge Function admin-usuarios', () => {
  it('consulta o estado da senha pendente antes de expor qualquer ação autenticada', () => {
    const fonte = readFileSync(new URL('../functions/admin-usuarios/index.ts', import.meta.url), 'utf8');
    const guarda = fonte.indexOf("rpc('convite_senha_pendente')");
    assert.ok(guarda >= 0, 'a Edge Function consulta a própria sessão no banco');
    assert.ok(guarda < fonte.indexOf("if (action === 'list-names')"), 'a guarda vem antes da ação que lista nomes');
    assert.ok(guarda < fonte.indexOf("if (!ehAdmin(caller.app_metadata ?? {}))"), 'a guarda vem antes de confiar nas telas do JWT');
  });
});

describe('listagem e ciclo de vida', () => {
  it('lista o estado sem expor link ou token, com confirmado e tem_senha', async () => {
    const id = await pendente('lista@azime.com.br');
    const { tentativa_id: tentativa } = await iniciar(c1, id, 'lista@azime.com.br');
    await finalizar(tentativa, 'enviado');
    const linhas = (await servico(c1, 'select * from public.admin_convites_listar()')).rows;
    const minha = linhas.find((l) => l.usuario_id === id);
    assert.deepEqual(Object.keys(minha).sort(), ['concluido_em', 'confirmado', 'estado', 'iniciado_em', 'tem_senha', 'tentativas', 'usuario_id']);
    assert.equal(minha.confirmado, false);
    await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [id]);
    const depois = (await servico(c1, 'select * from public.admin_convites_listar()')).rows.find((l) => l.usuario_id === id);
    assert.deepEqual({ confirmado: depois.confirmado, tem_senha: depois.tem_senha }, { confirmado: true, tem_senha: false }, 'aceito sem senha é visível');
  });

  it('remover o usuário remove o acompanhamento (cascade) e não toca nas demais contas', async () => {
    const id = await pendente('cascata@azime.com.br');
    await iniciar(c1, id);
    const antes = (await q('select count(*)::int as n from auth.users'))[0].n;
    await db.query('delete from auth.users where id = $1', [id]);
    assert.equal(await linha(id), undefined);
    assert.equal((await q('select count(*)::int as n from auth.users'))[0].n, antes - 1);
  });
});
