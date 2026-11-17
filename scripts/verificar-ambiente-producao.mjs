// Valida as variáveis VITE_* antes do build de produção (primeiro passo de `npm run build`).
// Lê process.env e o .env local da mesma forma que o Vite. Nunca imprime valores: só nomes e motivos.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Qualquer VITE_* vai para o JavaScript entregue ao navegador. Nomes que sugerem segredo são recusados.
const NOME_PROIBIDO = /(SERVICE|SECRET|PASSWORD|SENHA|DATABASE|PRIVAT|TOKEN)/i;
const HOST_LOCAL = /^(localhost|127\.0\.0\.1)$/;

/** Papel (`role`) de um JWT, sem validar assinatura. Retorna null se não for um JWT legível. */
export function papelDoJwt(valor) {
  const partes = valor.split('.');
  if (partes.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

/** Lista de problemas encontrados. Lista vazia = ambiente válido para produção. */
export function validarAmbienteProducao(env) {
  const erros = [];

  for (const nome of Object.keys(env)) {
    if (NOME_PROIBIDO.test(nome)) {
      erros.push(`${nome}: VITE_* é publicado no navegador; segredos não podem usar esse prefixo. Remova a variável do build.`);
    }
  }

  const url = (env.VITE_SUPABASE_URL ?? '').trim();
  if (!url) {
    erros.push('VITE_SUPABASE_URL não está definida. Informe a URL da API do projeto Supabase deste sistema.');
  } else {
    let parsed = null;
    try {
      parsed = new URL(url);
    } catch {
      erros.push('VITE_SUPABASE_URL não é uma URL válida.');
    }
    if (parsed && parsed.protocol !== 'https:' && !HOST_LOCAL.test(parsed.hostname)) {
      erros.push('VITE_SUPABASE_URL deve usar https em produção.');
    }
  }

  const nomeChave = env.VITE_SUPABASE_PUBLISHABLE_KEY ? 'VITE_SUPABASE_PUBLISHABLE_KEY' : 'VITE_SUPABASE_ANON_KEY';
  const chave = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  if (!chave) {
    erros.push('VITE_SUPABASE_PUBLISHABLE_KEY não está definida (compatibilidade: VITE_SUPABASE_ANON_KEY). Informe a chave pública.');
  } else if (chave.startsWith('sb_secret_') || papelDoJwt(chave) === 'service_role') {
    erros.push(`${nomeChave} contém uma chave service_role/secreta. Use somente a chave pública.`);
  }

  return erros;
}

const executadoDiretamente = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (executadoDiretamente) {
  const erros = validarAmbienteProducao(loadEnv('production', RAIZ, 'VITE_'));
  if (erros.length > 0) {
    console.error('Build de produção bloqueado: configuração obrigatória ausente ou inválida.');
    for (const erro of erros) console.error(` - ${erro}`);
    console.error('No Railway, defina as variáveis no serviço (Variables) e faça um novo deploy. Veja docs/RAILWAY.md.');
    process.exit(1);
  }
  console.log('Ambiente de produção verificado: VITE_SUPABASE_URL e chave pública presentes (valores não exibidos).');
}
