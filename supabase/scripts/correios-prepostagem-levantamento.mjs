#!/usr/bin/env node
// Levantamento SOMENTE LEITURA, AGREGADO, dos serviços já usados nas pré-postagens do cartão.
//
// Só faz GET /prepostagem/v2/prepostagens com combinações válidas pela especificação:
//   • status=PREPOSTADO (datas dispensadas) + logisticaReversa=S|N
//   • status=POSTADO e EXPIRADO (datas obrigatórias) + logisticaReversa=S|N, em janelas de 30 dias
//     (limite documentado do filtro) dentro dos 120 dias retroativos documentados
// Não cria, altera nem cancela; não pede rótulo/PDF; não chama a API de Contrato (interna).
//
// Privacidade: nada de nome, documento, endereço, e-mail, telefone ou código de objeto é impresso
// ou gravado. Documentos são classificados em memória (CPF / CNPJ / CNPJ da Alinare / outro) e
// descartados. A chave nunca é impressa.
//
// Limites: no máximo MAX_PAGINAS páginas por consulta; pausa entre chamadas; para em HTTP 429
// sem insistir (e também em 401/403, por perda de acesso).
//
// Uso:  node --env-file=supabase/.env.correios.local supabase/scripts/correios-prepostagem-levantamento.mjs

import { lerConfig, resumoErro } from './correios-prepostagem-validar.mjs';

const CNPJ_ALINARE = '19679195000176'; // README, tabela de contas de rastreio (prefixo ALINARE)
const TAMANHO_PAGINA = 50;
const MAX_PAGINAS = 4; // 200 itens por combinação/janela, no máximo
const JANELA_DIAS = 30; // limite documentado do filtro de data
const JANELAS = 4; // 4 × 30 = 120 dias, limite retroativo documentado
const PAUSA_MS = 400;

const STATUS_SEM_DATA = ['PREPOSTADO'];
const STATUS_COM_DATA = ['POSTADO', 'EXPIRADO'];
const REVERSA = ['S', 'N'];

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (d) => d.toISOString().slice(0, 10);
const diasAtras = (n) => new Date(Date.now() - n * 86_400_000);

/** Classifica um documento sem guardá-lo. */
function tipoDocumento(parte) {
  const d = String(parte?.cpfCnpj ?? '').replace(/\D/g, '');
  if (d.length === 14) return d === CNPJ_ALINARE ? 'CNPJ Alinare' : 'CNPJ outro';
  if (d.length === 11) return 'CPF';
  if (parte?.documentoEstrangeiro) return 'doc. estrangeiro';
  return d ? 'documento não reconhecido' : 'sem documento';
}

function somar(mapa, chave, n = 1) {
  mapa.set(chave, (mapa.get(chave) ?? 0) + n);
}

async function principal() {
  const cfg = lerConfig(process.env);
  if (cfg.erro) {
    console.error(cfg.erro);
    process.exit(2);
  }

  const servicos = new Map(); // "status|reversa|codigo|nome" -> n
  const papeis = new Map(); // "codigo|remetente|destinatario" -> n (só reversas)
  const cartoes = new Map(); // mesmo cartão / outro / ausente -> n
  const consultas = []; // resumo de cada consulta (sem dados de pré-postagem)
  let primeiraData = null;
  let ultimaData = null;
  let parou = null;
  let chamadas = 0;

  const combinacoes = [];
  for (const status of STATUS_SEM_DATA) for (const rev of REVERSA) combinacoes.push({ status, rev });
  for (const status of STATUS_COM_DATA) {
    for (const rev of REVERSA) {
      for (let j = 0; j < JANELAS; j++) {
        const fim = diasAtras(j * JANELA_DIAS);
        const inicio = diasAtras(j * JANELA_DIAS + JANELA_DIAS - 1);
        combinacoes.push({ status, rev, inicio: iso(inicio), fim: iso(fim) });
      }
    }
  }

  externo: for (const c of combinacoes) {
    let itensTotal = 0;
    let paginas = 0;
    let truncada = false;
    let falha = null;
    let semResultado = false;

    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const q = new URLSearchParams({ status: c.status, logisticaReversa: c.rev, page: String(pagina), size: String(TAMANHO_PAGINA) });
      if (c.inicio) {
        q.set('dataInicialCriacaoPrePostagem', c.inicio);
        q.set('dataFinalCriacaoPrePostagem', c.fim);
      }
      chamadas++;
      let res;
      try {
        res = await fetch(`${cfg.base}/prepostagem/v2/prepostagens?${q}`, {
          headers: { Authorization: `Bearer ${cfg.chave}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(30_000),
        });
      } catch (err) {
        parou = `erro de rede (${err?.cause?.code ?? err?.name ?? 'desconhecido'})`;
        break externo;
      }
      const texto = await res.text();
      let json = null;
      try { json = texto ? JSON.parse(texto) : null; } catch { /* não-JSON */ }

      if (res.status === 429) { parou = 'HTTP 429 (limite de requisições) — interrompido sem insistir'; break externo; }
      if (res.status === 401 || res.status === 403) { parou = `HTTP ${res.status} — acesso perdido: ${resumoErro(json)}`; break externo; }
      // 404 PPN-344 = "Não existem pré-postagens para os parâmetros informados": consulta válida, zero itens.
      if (res.status === 404 && /PPN-344/.test(resumoErro(json))) { semResultado = true; break; }
      if (res.status !== 200) { falha = `HTTP ${res.status}: ${resumoErro(json)}`; break; }

      paginas++;
      const itens = Array.isArray(json?.itens) ? json.itens : [];
      itensTotal += itens.length;
      for (const it of itens) {
        const reversaItem = it.logisticaReversa === 'S' || it.logisticaReversa === 'N' ? it.logisticaReversa : c.rev;
        somar(servicos, `${c.status}|${reversaItem}|${it.codigoServico ?? '(sem código)'}|${it.servico ?? '(sem nome)'}`);
        if (reversaItem === 'S') {
          somar(papeis, `${it.codigoServico ?? '(sem código)'}|${tipoDocumento(it.remetente)}|${tipoDocumento(it.destinatario)}`);
        }
        const nc = String(it.numeroCartaoPostagem ?? '').replace(/\D/g, '');
        somar(cartoes, !nc ? 'ausente' : nc.padStart(10, '0') === cfg.cartao ? 'cartão consultado' : 'outro cartão');
        const dia = String(it.dataHora ?? '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
          if (!primeiraData || dia < primeiraData) primeiraData = dia;
          if (!ultimaData || dia > ultimaData) ultimaData = dia;
        }
      }
      if (!json?.page?.next) break;
      if (pagina === MAX_PAGINAS - 1) truncada = true;
      await dormir(PAUSA_MS);
    }
    consultas.push({ ...c, itens: itensTotal, paginas, truncada, falha, semResultado });
    await dormir(PAUSA_MS);
  }

  // ── Saída: apenas agregados ──
  console.log(`Ambiente: ${cfg.ambiente} · cartão ${cfg.cartao} · chamadas feitas: ${chamadas}`);
  if (parou) console.log(`INTERROMPIDO: ${parou}`);
  console.log(`Janelas de datas consultadas (criação): ${iso(diasAtras(JANELAS * JANELA_DIAS - 1))} a ${iso(diasAtras(0))}, em ${JANELAS} janelas de ${JANELA_DIAS} dias (POSTADO e EXPIRADO). PREPOSTADO: sem filtro de data (todos os atuais).`);
  console.log(`Datas de criação efetivamente vistas nos itens: ${primeiraData ?? '—'} a ${ultimaData ?? '—'}`);

  console.log('\nSERVIÇOS (status | logisticaReversa | codigoServico | serviço | quantidade)');
  const minimo = new Set(consultas.filter((c) => c.truncada).map((c) => `${c.status}|${c.rev}`));
  const linhas = [...servicos.entries()].sort();
  if (!linhas.length) console.log('  (nenhuma pré-postagem encontrada nas combinações consultadas)');
  for (const [k, n] of linhas) {
    const [st, rv, cod, nome] = k.split('|');
    console.log(`  ${st.padEnd(10)} rev=${rv}  ${cod.padEnd(8)} ${nome.slice(0, 60).padEnd(60)} ${minimo.has(`${st}|${rv}`) ? '≥' : ' '}${n}`);
  }

  console.log('\nREVERSAS — tipo de documento (codigoServico | remetente | destinatário | quantidade)');
  if (!papeis.size) console.log('  (nenhuma reversa encontrada)');
  for (const [k, n] of [...papeis.entries()].sort()) {
    const [cod, rem, dest] = k.split('|');
    console.log(`  ${cod.padEnd(8)} remetente=${rem.padEnd(24)} destinatário=${dest.padEnd(24)} ${n}`);
  }

  console.log('\nCARTÃO nos itens: ' + ([...cartoes.entries()].map(([k, n]) => `${k}=${n}`).join(' · ') || '—'));

  const truncadas = consultas.filter((c) => c.truncada).length;
  const falhas = consultas.filter((c) => c.falha);
  const vazias = consultas.filter((c) => c.semResultado).length;
  console.log(`\nConsultas: ${consultas.length} de ${combinacoes.length} planejadas; sem resultado (404 PPN-344): ${vazias}; truncadas pelo limite de páginas (${MAX_PAGINAS}×${TAMANHO_PAGINA}): ${truncadas}${minimo.size ? ` [status|reversa: ${[...minimo].join(', ')} — quantidades com ≥ são mínimos]` : ''}; com falha: ${falhas.length}`);
  for (const f of falhas) console.log(`  falha ${f.status} rev=${f.rev}${f.inicio ? ` ${f.inicio}..${f.fim}` : ''}: ${f.falha}`);
  console.log('\nLimitação: não achar reversa neste cartão não prova que o serviço não está habilitado.');
  process.exit(parou ? 1 : 0);
}

principal().catch((err) => {
  console.error(`Falha inesperada: ${err?.name ?? 'Error'}`);
  process.exit(1);
});
