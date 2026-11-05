#!/usr/bin/env node
// Validação SOMENTE LEITURA do acesso da "Chave de acesso" do CWS à API de Pré-postagem.
//
// Mecanismo (fonte oficial: "Orientações para subdelegação de acesso", Correios, 03/04/2025,
// passo 6): a chave de acesso (40 dígitos) é enviada DIRETAMENTE em
// `Authorization: Bearer <chave>` nas APIs liberadas. Não há troca por token e não se usa Basic.
// (Não confundir com o antigo "código de acesso às APIs", que vai no Basic do serviço de token.)
//
// O que faz (só GET):
//   A. GET /prepostagem/v2/prepostagens?status=PREPOSTADO&page=0&size=1
//      (status sozinho é combinação válida pela especificação; PREPOSTADO dispensa datas)
//   B. GET /contrato/v1/cartoes/{cartão}/servicos e /contrato/v1/contratos/{contrato}/servicos
//
// O que NÃO faz: criar, alterar ou cancelar pré-postagem; pedir rótulo/PDF; chamar o serviço de token.
// Não imprime a chave nem o conteúdo das pré-postagens (só HTTP e contagem).
//
// Uso (a chave vem do ambiente, nunca de argumento):
//   node --env-file=supabase/.env.correios.local supabase/scripts/correios-prepostagem-validar.mjs
//
// Resultados separados: AUTENTICAÇÃO · PRÉ-POSTAGEM · CONTRATO/SERVIÇOS.
// Saída: 0 = Pré-postagem respondeu 200; 1 = Pré-postagem não confirmou acesso; 2 = configuração inválida.
// Recusa na API de Contrato NÃO altera a saída: é outra API, com autorização própria na chave.

const BASES = {
  producao: 'https://api.correios.com.br',
  homologacao: 'https://apihom.correios.com.br',
};

const NOMES = {
  chave: 'CORREIOS_PREPOSTAGEM_CHAVE_ACESSO',
  contrato: 'CORREIOS_PREPOSTAGEM_CONTRATO',
  cartao: 'CORREIOS_PREPOSTAGEM_CARTAO',
  ambiente: 'CORREIOS_PREPOSTAGEM_AMBIENTE',
};

function lerConfig(env) {
  const faltando = [NOMES.chave, NOMES.contrato, NOMES.cartao].filter((n) => !env[n]?.trim());
  if (faltando.length) return { erro: `Variáveis ausentes: ${faltando.join(', ')}. Veja supabase/correios-prepostagem.env.example.` };

  const ambiente = (env[NOMES.ambiente] ?? 'producao').trim().toLowerCase();
  const base = BASES[ambiente];
  if (!base) return { erro: `${NOMES.ambiente} deve ser "producao" ou "homologacao" (recebido: "${ambiente}").` };

  const chave = env[NOMES.chave].trim();
  // Só a chave pura: sem prefixo "Bearer", sem espaços/aspas internas (nada do valor é impresso).
  if (/\s/.test(chave) || /^bearer/i.test(chave) || /["']/.test(chave)) {
    return { erro: `${NOMES.chave} deve conter apenas a chave, sem "Bearer", espaços ou aspas.` };
  }

  const cartao = env[NOMES.cartao].trim();
  const contrato = env[NOMES.contrato].trim();
  // Zeros à esquerda precisam sobreviver: o cartão é sempre texto, só dígitos.
  if (!/^\d{10}$/.test(cartao)) {
    return { erro: `${NOMES.cartao} deve ter 10 dígitos como texto (com zeros à esquerda). Confira se está entre aspas no arquivo.` };
  }
  if (!/^\d{6,12}$/.test(contrato)) return { erro: `${NOMES.contrato} deve conter apenas dígitos.` };

  // O manual cita 40 dígitos, mas a chave real emitida pelo CWS tem 96 caracteres: o tamanho não é validado.
  const aviso = null;
  return { ambiente, base, cartao, contrato, chave, aviso };
}

/** Mensagens dos Correios (campo `msgs`), curtas e sem eco da chave. */
function resumoErro(corpo) {
  const msgs = Array.isArray(corpo?.msgs) ? corpo.msgs : [];
  return msgs.slice(0, 3).map((m) => String(m).slice(0, 160)).join(' | ') || '(sem mensagem)';
}

/**
 * Interpreta a resposta de UMA chamada autenticada. Não decide sozinho entre "chave inválida" e
 * "sem autorização" quando o gateway devolve 403: o texto dos Correios é mostrado ao lado.
 * `GTW-006: Token inválido` foi observado em chamada sem credencial (HTTP 403).
 */
function classificar(status, corpo) {
  const msg = resumoErro(corpo);
  const naoReconhecida = status === 401 || (status === 403 && /GTW-006|token inv[aá]lido/i.test(msg));
  if (status === 200) return { autenticacao: 'reconhecida', acesso: 'confirmado', msg };
  if (naoReconhecida) return { autenticacao: 'nao_reconhecida', acesso: 'indeterminado', msg };
  // GTW-011 (observado na API de Contrato, API 32): API interna dos Correios, inacessível a credencial externa.
  if (status === 403 && /GTW-011|INTERNA/i.test(msg)) return { autenticacao: 'reconhecida', acesso: 'api_interna', msg };
  if (status === 403) return { autenticacao: 'reconhecida', acesso: 'recusado', msg };
  if (status === 400) return { autenticacao: 'reconhecida', acesso: 'consulta_invalida', msg };
  return { autenticacao: 'indeterminada', acesso: 'indeterminado', msg };
}

const ROTULO_ACESSO = {
  confirmado: 'acesso confirmado',
  recusado: 'recusado (HTTP 403 com a chave reconhecida): a chave não cobre esta API',
  api_interna: 'API interna dos Correios: indisponível para credencial externa (não há como contornar)',
  consulta_invalida: 'a API respondeu 400: consulta rejeitada na validação — NÃO prova falta de acesso',
  indeterminado: 'não foi possível concluir',
};
const ROTULO_AUTENTICACAO = {
  reconhecida: 'chave reconhecida pelo gateway',
  nao_reconhecida: 'chave NÃO reconhecida (inválida, expirada ou revogada)',
  indeterminada: 'indeterminada (erro de rede, limite de requisições ou falha do servidor)',
};

async function lerComChave(cfg, caminho) {
  const res = await fetch(`${cfg.base}${caminho}`, {
    headers: { Authorization: `Bearer ${cfg.chave}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  const texto = await res.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* corpo não-JSON */ }
  return { status: res.status, json };
}

async function principal() {
  const cfg = lerConfig(process.env);
  if (cfg.erro) {
    console.error(cfg.erro);
    process.exit(2);
  }
  console.log(`Ambiente: ${cfg.ambiente} (${cfg.base}) · contrato ${cfg.contrato} · cartão ${cfg.cartao}`);
  if (cfg.aviso) console.log(`Aviso: ${cfg.aviso}`);

  // A. Pré-postagem: consulta mínima e válida (status sozinho; PREPOSTADO dispensa datas).
  const pre = await lerComChave(cfg, '/prepostagem/v2/prepostagens?status=PREPOSTADO&page=0&size=1');
  const c = classificar(pre.status, pre.json);

  console.log('\n[1] AUTENTICAÇÃO (inferida da resposta da Pré-postagem; não há chamada de token)');
  console.log(`    ${ROTULO_AUTENTICACAO[c.autenticacao]}`);

  console.log('\n[2] PRÉ-POSTAGEM  GET /prepostagem/v2/prepostagens?status=PREPOSTADO&page=0&size=1');
  console.log(`    HTTP ${pre.status} — ${ROTULO_ACESSO[c.acesso]}`);
  if (pre.status === 200) {
    console.log(`    itens na página: ${pre.json?.itens?.length ?? '?'} (conteúdo omitido)`);
  } else {
    console.log(`    Correios: ${c.msg}`);
  }

  // B. Contrato/Serviços: outra API. Só informa; não muda o veredito da Pré-postagem.
  console.log('\n[3] CONTRATO/SERVIÇOS (outra API; recusa aqui NÃO significa falha da Pré-postagem)');
  for (const [rotulo, caminho] of [
    ['cartão', `/contrato/v1/cartoes/${encodeURIComponent(cfg.cartao)}/servicos`],
    ['contrato', `/contrato/v1/contratos/${encodeURIComponent(cfg.contrato)}/servicos`],
  ]) {
    const r = await lerComChave(cfg, caminho);
    if (r.status === 200 && Array.isArray(r.json)) {
      console.log(`    serviços do ${rotulo}: HTTP 200 — ${r.json.length} serviço(s)`);
      for (const s of r.json) console.log(`      ${String(s.codigo ?? '?').padEnd(8)} ${String(s.descricao ?? '').slice(0, 80)}`);
    } else {
      const k = classificar(r.status, r.json);
      console.log(`    serviços do ${rotulo}: HTTP ${r.status} — ${ROTULO_ACESSO[k.acesso]}; Correios: ${k.msg}`);
    }
  }

  console.log('\nLembrete: acesso à API não prova habilitação dos serviços de envio normal/reverso.');
  process.exit(pre.status === 200 ? 0 : 1);
}

// Só executa como script; permite importar as funções em teste sem disparar rede.
if (process.argv[1]?.endsWith('correios-prepostagem-validar.mjs')) {
  principal().catch((err) => {
    console.error(`Falha inesperada: ${err?.name ?? 'Error'}${err?.cause?.code ? ` (${err.cause.code})` : ''}`);
    process.exit(1);
  });
}

export { lerConfig, classificar, resumoErro };
