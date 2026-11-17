// Sobe um PostgreSQL local e temporário, aplica as migrations sobre os stubs do
// Supabase e executa SQL como um usuário (token JWT simulado).
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA_SUPABASE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PASTA_MIGRATIONS = join(PASTA_SUPABASE, 'migrations');
const MIGRATION_BASE = '20260828171717_remote_commit.sql';

// Extensões do Supabase que um PostgreSQL comum não tem
const EXTENSAO_SEM_SUPORTE = /^(create|drop) extension .*(pg_cron|pg_net|supabase_vault|pg_stat_statements)/i;
const LOG_POSTGRES_TESTE = process.env.PG_TEST_DEBUG === '1';

/** Migrations posteriores ao dump do banco remoto, em ordem. */
export function migrationsNovas() {
  return readdirSync(PASTA_MIGRATIONS)
    .filter((arquivo) => arquivo.endsWith('.sql') && arquivo !== MIGRATION_BASE)
    .sort();
}

function lerMigration(arquivo) {
  return readFileSync(join(PASTA_MIGRATIONS, arquivo), 'utf8');
}

function portaLivre() {
  return new Promise((resolve, reject) => {
    const servidor = createServer();
    servidor.unref();
    servidor.on('error', reject);
    servidor.listen(0, () => {
      const { port } = servidor.address();
      servidor.close(() => resolve(port));
    });
  });
}

function windowsEstaElevado() {
  if (process.platform !== 'win32') return false;

  const verificacao = "$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()); if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { 'elevated' } else { 'standard' }";
  const resultado = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', verificacao], {
    encoding: 'utf8',
    timeout: 5_000,
    windowsHide: true,
  });
  return resultado.trim() === 'elevated';
}

export async function iniciarBanco() {
  let pasta;
  let port;
  let servidor;
  let bancoIniciado = false;
  let etapa = 'criar diretório temporário';
  let erroLimpeza;
  let saidaPostgres = '';
  const conexoes = [];
  const registrarSaidaPostgres = (prefixo, mensagem) => {
    const texto = prefixo + String(mensagem);
    saidaPostgres = (saidaPostgres + texto).slice(-16_000);
    if (LOG_POSTGRES_TESTE) process.stderr.write(texto);
  };

  try {
    etapa = 'verificar privilégios Windows';
    if (windowsEstaElevado()) {
      throw new Error('PostgreSQL no Windows recusa tokens administrativos. Abra um terminal sem elevação e execute a suíte novamente.');
    }

    pasta = mkdtempSync(join(tmpdir(), 'reversa-banco-'));
    etapa = 'reservar porta local';
    port = await portaLivre();

    servidor = new EmbeddedPostgres({
      databaseDir: pasta,
      user: 'postgres',
      password: 'postgres',
      port,
      persistent: false,
      // Como no Supabase: UTF-8 (no Windows o padrão seria a codificação do sistema)
      initdbFlags: ['--encoding=UTF8', '--no-locale'],
      onLog: (message) => registrarSaidaPostgres('[embedded-postgres] ', message),
      onError: (message) => registrarSaidaPostgres('[embedded-postgres:error] ', message instanceof Error ? message.stack : message),
    });

    etapa = 'initialise() / initdb';
    await servidor.initialise();

    etapa = 'start() / postgres';
    await servidor.start();
    bancoIniciado = true;

    etapa = 'conectar ao cluster temporário';
    const config = { host: 'localhost', port, user: 'postgres', password: 'postgres', database: 'postgres' };
    const conectar = async () => {
      const cliente = new pg.Client(config);
      await cliente.connect();
      conexoes.push(cliente);
      return cliente;
    };

    const dono = await conectar();
    etapa = 'aplicar stubs e migration base';
    await dono.query(readFileSync(join(PASTA_SUPABASE, 'tests', 'supabase-stubs.sql'), 'utf8'));
    const base = lerMigration(MIGRATION_BASE)
      .split('\n')
      .filter((linha) => !EXTENSAO_SEM_SUPORTE.test(linha.trim()) && !/^ALTER PUBLICATION/i.test(linha))
      .join('\n');
    await dono.query(base);
    await dono.query('set search_path = public; set row_security = on; set check_function_bodies = true;');

    return {
      dono,
      conectar,
      async aplicar(arquivo) {
        await dono.query(lerMigration(arquivo));
        await dono.query('set search_path = public; set row_security = on;');
      },
      /** Aplica um arquivo de supabase/ (ex.: o script único do SQL Editor). */
      async aplicarArquivo(caminhoRelativo) {
        await dono.query(readFileSync(join(PASTA_SUPABASE, caminhoRelativo), 'utf8'));
        await dono.query('set search_path = public; set row_security = on;');
      },
      async encerrar() {
        for (const cliente of conexoes) await cliente.end().catch(() => {});
        try {
          await servidor.stop();
        } finally {
          rmSync(pasta, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
        }
      },
    };
  } catch (erro) {
    for (const cliente of conexoes) await cliente.end().catch(() => {});
    if (bancoIniciado) await servidor?.stop().catch(() => {});
    if (pasta) {
      try {
        rmSync(pasta, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      } catch (erroRemocao) {
        erroLimpeza = erroRemocao;
      }
    }

    const causa = erro instanceof Error ? erro.message : String(erro ?? 'sem detalhe fornecido pelo processo filho');
    const porta = port ?? 'não reservada';
    const diretorio = pasta ?? 'não criado';
    const mensagem = 'Falha em ' + etapa + ' do PostgreSQL temporário (porta ' + porta + ', diretório ' + diretorio + '): ' + causa;
    const detalheProcesso = saidaPostgres.trim()
      ? '\nSaída recente do processo PostgreSQL:\n' + saidaPostgres.trim()
      : '';
    const mensagemCompleta = mensagem + detalheProcesso + (erroLimpeza ? '\nFalha ao limpar diretório: ' + String(erroLimpeza) : '');
    const erroContextual = new Error(mensagemCompleta, { cause: erro });
    if (LOG_POSTGRES_TESTE) process.stderr.write('[postgres-test:error] ' + erroContextual.stack + '\n');
    throw erroContextual;
  }
}

/**
 * Telas no formato do modelo atual: a aprovação é a tela 'aprovar-reversa' para as
 * empresas de empresas_acesso. Aceita 'aprovar-alinare' / 'aprovar-novitah' como atalho.
 */
export function telasDoModelo(telas) {
  const empresas = new Set();
  const saida = [];
  // Atalhos de teste: <capacidade>-<empresa> vira a tela do modelo + a empresa em empresas_acesso
  const atalhos = { aprovar: 'aprovar-reversa', emitir: 'emitir-etiqueta', confirmar: 'confirmar-checkin' };
  for (const tela of telas) {
    const atalho = /^(aprovar|emitir|confirmar)-(alinare|novitah)$/.exec(tela);
    if (atalho) {
      empresas.add(atalho[2] === 'alinare' ? 'Alinare' : 'Novitah');
      if (!saida.includes(atalhos[atalho[1]])) saida.push(atalhos[atalho[1]]);
    } else {
      saida.push(tela);
    }
  }
  return { telas: saida, empresas_acesso: [...empresas] };
}

/** Cria um usuário em auth.users com telas e nome em app_metadata (como a Edge Function admin-usuarios). */
export async function criarUsuario(dono, nome, telas) {
  const login = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.');
  const email = `${login}@cr.internal`;
  const { telas: telasNovas, empresas_acesso } = telasDoModelo(telas);
  const { rows } = await dono.query(
    'insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values ($1, $2, $3) returning id',
    [email, { nome, usuario: login }, { provider: 'email', telas: telasNovas, empresas_acesso, nome }]
  );
  // O token propositalmente diz "admin": as permissões vêm de auth.users
  return {
    id: rows[0].id,
    nome,
    email,
    papel: 'authenticated',
    claims: { sub: rows[0].id, role: 'authenticated', app_metadata: { telas: ['usuarios'] } },
  };
}

export const SERVICE_ROLE = { nome: 'service_role', papel: 'service_role', claims: { role: 'service_role' } };
export const ANON = { nome: 'anon', papel: 'anon', claims: { role: 'anon' } };

/** Assume o usuário na transação aberta (como o PostgREST faz a cada requisição). */
export async function iniciarSessao(cliente, persona) {
  await cliente.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(persona.claims)]);
  await cliente.query(`set local role ${persona.papel}`);
}

/**
 * Executa um comando como o usuário, numa transação própria.
 * Sem parâmetros, usa o protocolo simples: aceita mais de um comando no mesmo texto.
 */
export async function como(cliente, persona, sql, params = []) {
  await cliente.query('begin');
  try {
    await iniciarSessao(cliente, persona);
    const resultado = params.length > 0 ? await cliente.query(sql, params) : await cliente.query(sql);
    await cliente.query('commit');
    return resultado;
  } catch (erro) {
    await cliente.query('rollback').catch(() => {});
    throw erro;
  }
}

/** Espera a conexão (pid) ficar parada aguardando uma trava. */
export async function esperarBloqueio(dono, pid, limiteMs = 10_000) {
  const inicio = Date.now();
  while (Date.now() - inicio < limiteMs) {
    const { rows } = await dono.query('select wait_event_type from pg_stat_activity where pid = $1', [pid]);
    if (rows[0]?.wait_event_type === 'Lock') return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}
