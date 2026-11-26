// ── Painel de não conformidades (PAINEL_NC) ──────────────────────────────────
// Base: todas as NCs com data da ocorrência no período, classificadas ou não (as pendentes
// aparecem à parte). Situação e valor do custo seguem a regra única de src/lib/ncCustos.ts.
// Registros antigos mantêm as tabelas por origem e área, rotuladas como antigas. Acrescenta
// a quebra por status, a cobertura do custo e a proporção de NCs com reversa.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { useEmpresaDaTela } from '../context/TemaContext';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ChartPie, RotateCcw } from 'lucide-react';
import PageHeading from '../components/ui/PageHeading';
import { useNaoConformidades } from '../hooks/useNaoConformidades';
import { SEM_VALOR_REGISTRADO } from '../lib/ncCustos';
import type { CoberturaCusto } from '../lib/ncCustos';
import {
  anosComOcorrencia,
  calcularPainelNc,
  formatarMoeda,
  formatarNumero,
  formatarPct,
  valoresDaLista,
} from '../lib/ncCalculos';
import type { LinhaMesPainelNc, LinhaPainelNc } from '../lib/ncCalculos';
import '../styles/nc.css';

interface Filtro {
  dataInicio: string;
  dataFim: string;
  /** null = ano mais recente com ocorrência */
  ano: number | null;
  empresa: string;
}

const SEM_FILTRO: Filtro = { dataInicio: '', dataFim: '', ano: null, empresa: '' };

/** Total de uma tabela a partir das linhas: soma só os valores informados (sem zero por ausência). */
function totalDeCusto(linhas: Array<{ qtd: number; comValor: number; custoLiquido: number | null }>) {
  const comValor = linhas.reduce((soma, l) => soma + l.comValor, 0);
  const qtd = linhas.reduce((soma, l) => soma + l.qtd, 0);
  const liquido = linhas.reduce<number | null>((soma, l) => (l.custoLiquido === null ? soma : (soma ?? 0) + l.custoLiquido), null);
  return {
    rotulo: liquido === null ? SEM_VALOR_REGISTRADO : formatarMoeda(liquido),
    detalhe: comValor > 0 && comValor < qtd ? `${comValor} de ${qtd} com valor` : null,
  };
}

function TabelaCategoria({ titulo, coluna, linhas, ocultarSemRegistro = false }: {
  titulo: string;
  coluna: string;
  linhas: LinhaPainelNc[];
  /** Tabelas de classificação: valores sem registros não são listados (o total continua completo). */
  ocultarSemRegistro?: boolean;
}) {
  const total = linhas.reduce(
    (t, l) => ({ qtd: t.qtd + l.qtd, pct: t.pct + l.pct, horas: t.horas + l.horas, aberto: t.aberto + l.emAberto }),
    { qtd: 0, pct: 0, horas: 0, aberto: 0 }
  );
  const custoTotal = totalDeCusto(linhas);
  return (
    <section className="chart-panel" aria-label={titulo}>
      <div className="panel-heading"><div><h3 className="panel-title">{titulo}</h3></div></div>
      <div className="data-table-wrap">
        <table className="data-table nc-tabela" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th>{coluna}</th>
              <th className="nc-num">Qtd.</th>
              <th className="nc-num">%</th>
              <th className="nc-num">Custo líquido registrado (R$)</th>
              <th className="nc-num">Horas de tratativa</th>
              <th className="nc-num">Em aberto</th>
            </tr>
          </thead>
          <tbody>
            {(ocultarSemRegistro ? linhas.filter((l) => l.qtd > 0) : linhas).map((l) => (
              <tr key={l.valor} className={l.qtd === 0 ? 'nc-vazio' : undefined}>
                <td>{l.valor}</td>
                <td className="nc-num">{l.qtd}</td>
                <td className="nc-num">
                  <div className="nc-barra">
                    {formatarPct(l.pct)}
                    <span className="nc-barra-trilho"><span style={{ width: `${Math.round(l.pct * 100)}%` }} /></span>
                  </div>
                </td>
                <td className="nc-num">
                  {l.rotuloCusto}
                  {l.detalheCusto && <span className="nc-vazio" style={{ display: 'block', fontSize: 11 }}>{l.detalheCusto}</span>}
                </td>
                <td className="nc-num">{formatarNumero(l.horas)}</td>
                <td className="nc-num">{l.emAberto}</td>
              </tr>
            ))}
            <tr className="nc-total">
              <td>TOTAL</td>
              <td className="nc-num">{total.qtd}</td>
              <td className="nc-num">{formatarPct(total.pct)}</td>
              <td className="nc-num">
                {custoTotal.rotulo}
                {custoTotal.detalhe && <span className="nc-vazio" style={{ display: 'block', fontSize: 11 }}>{custoTotal.detalhe}</span>}
              </td>
              <td className="nc-num">{formatarNumero(total.horas)}</td>
              <td className="nc-num">{total.aberto}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TabelaMes({ ano, linhas }: { ano: number; linhas: LinhaMesPainelNc[] }) {
  const total = linhas.reduce((t, l) => ({ qtd: t.qtd + l.qtd, ev: t.ev + l.evitaveis }), { qtd: 0, ev: 0 });
  const custoTotal = totalDeCusto(linhas);
  return (
    <section className="chart-panel chart-wide" aria-label="Por mês da ocorrência">
      <div className="panel-heading">
        <div>
          <h3 className="panel-title">Por mês da ocorrência ({ano})</h3>
          <p className="panel-desc">Usa só o ano escolhido; o período acima não se aplica a esta tabela, como na planilha.</p>
        </div>
      </div>
      <div className="data-table-wrap">
        <table className="data-table nc-tabela" style={{ minWidth: 420 }}>
          <thead>
            <tr><th>Mês</th><th className="nc-num">Qtd.</th><th className="nc-num">Evitáveis</th><th className="nc-num">Custo líquido registrado (R$)</th></tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.mes} className={l.qtd === 0 ? 'nc-vazio' : undefined}>
                <td>{l.rotulo}</td>
                <td className="nc-num">{l.qtd}</td>
                <td className="nc-num">{l.evitaveis}</td>
                <td className="nc-num">
                  {l.rotuloCusto}
                  {l.detalheCusto && <span className="nc-vazio" style={{ display: 'block', fontSize: 11 }}>{l.detalheCusto}</span>}
                </td>
              </tr>
            ))}
            <tr className="nc-total">
              <td>TOTAL</td>
              <td className="nc-num">{total.qtd}</td>
              <td className="nc-num">{total.ev}</td>
              <td className="nc-num">
                {custoTotal.rotulo}
                {custoTotal.detalhe && <span className="nc-vazio" style={{ display: 'block', fontSize: 11 }}>{custoTotal.detalhe}</span>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Cobertura do custo: cinco categorias exclusivas que somam o total de registradas. */
function CoberturaCustoBloco({ cobertura: c, registradas }: { cobertura: CoberturaCusto; registradas: number }) {
  const linhas = [
    { rotulo: 'Sem custo (situação Não)', qtd: c.semCusto, nota: 'Os valores gravados ficam como estão e não entram como custo.' },
    { rotulo: 'Com valor registrado', qtd: c.comValor, nota: `Sim: ${c.comValorSim} · Em apuração: ${c.comValorEmApuracao} · Situação não informada: ${c.comValorSemSituacao}. Com campo de custo em branco (parcial): ${c.parciais}.` },
    { rotulo: 'Valor não informado (Sim, sem valor)', qtd: c.valorNaoInformado, nota: 'Situação Sim sem nenhum valor de custo.' },
    { rotulo: 'A apurar (Em apuração, sem valor)', qtd: c.aApurar, nota: 'Ainda sem valor. Não é zero.' },
    { rotulo: 'Sem situação e sem valor', qtd: c.semSituacaoSemValor, nota: 'Registro sem decisão sobre o custo.' },
  ];
  const soma = linhas.reduce((t, l) => t + l.qtd, 0);
  return (
    <section className="chart-panel chart-wide" aria-label="Cobertura do custo">
      <div className="panel-heading">
        <div>
          <h3 className="panel-title">Cobertura do custo</h3>
          <p className="panel-desc">As cinco linhas somam as {registradas} NCs do período. Ausência de valor não é contada como zero.</p>
          <p className="panel-desc">
            Em apuração (qualquer valor): {c.emApuracao} · Situação não informada (qualquer valor): {c.situacaoNaoInformada} · Reembolso informado em {c.reembolsoInformado} de {registradas} NCs.
          </p>
        </div>
      </div>
      <div className="data-table-wrap">
        <table className="data-table nc-tabela" style={{ minWidth: 560 }}>
          <thead>
            <tr><th>Situação e valor</th><th className="nc-num">NCs</th><th className="nc-num">%</th><th>Observação</th></tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.rotulo} className={l.qtd === 0 ? 'nc-vazio' : undefined}>
                <td>{l.rotulo}</td>
                <td className="nc-num">{l.qtd}</td>
                <td className="nc-num">{formatarPct(registradas ? l.qtd / registradas : 0)}</td>
                <td>{l.nota}</td>
              </tr>
            ))}
            <tr className="nc-total">
              <td>TOTAL</td>
              <td className="nc-num">{soma}</td>
              <td className="nc-num">{formatarPct(registradas ? soma / registradas : 0)}</td>
              <td>{soma === registradas ? 'Confere com as NCs registradas.' : 'Não confere com as NCs registradas: revisar.'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function NcPainelPage() {
  const { ncs, listas, loading, erro } = useNaoConformidades();
  const [filtro, setFiltro] = useState<Filtro>(SEM_FILTRO);
  // Só o tema visual acompanha a empresa exibida no filtro
  useEmpresaDaTela(filtro.empresa || null);

  const anoAtual = new Date().getFullYear();
  const anos = useMemo(() => {
    const comDados = anosComOcorrencia(ncs);
    return comDados.includes(anoAtual) ? comDados : [anoAtual, ...comDados];
  }, [ncs, anoAtual]);
  // Sem escolha do usuário, abre no ano mais recente com ocorrência
  const ano = filtro.ano ?? anosComOcorrencia(ncs)[0] ?? anoAtual;

  const painel = useMemo(
    () => calcularPainelNc(ncs, { dataInicio: filtro.dataInicio, dataFim: filtro.dataFim, ano, empresa: filtro.empresa || null }, listas),
    [ncs, listas, filtro, ano]
  );
  const i = painel.indicadores;

  const indicadores = [
    {
      rotulo: 'Não conformidades registradas',
      valor: String(i.registradas),
      dica: `${i.classificadas} classificadas e ${i.pendentes} pendentes de classificação (sem tipo ou sem origem / causador). Todas entram nos totais.`,
      cor: 'var(--flow-accent)',
    },
    { rotulo: 'Em aberto (aberta ou em tratativa)', valor: String(i.emAberto), dica: 'Ocorrências ainda sem encerramento.', cor: 'var(--flow-warning)' },
    {
      rotulo: '% evitáveis (origem antiga)',
      valor: i.evitaveisBase ? formatarPct(i.pctEvitaveis) : '—',
      dica: `${i.evitaveisSim} de ${i.evitaveisBase} com evitável definido (Sim ${i.evitaveisSim}; Não ${i.evitaveisNao}; A avaliar ${i.evitaveisAvaliar}). Sem informação: ${i.evitaveisSemInformacao} de ${i.registradas} (registros sem origem antiga).`,
      cor: 'var(--flow-danger)',
    },
    {
      rotulo: 'Custo total registrado (R$)',
      valor: i.custoTotal === null ? 'Não informado' : `${formatarMoeda(i.custoTotal)}${i.parciais ? ' (parcial)' : ''}`,
      dica: `Soma dos valores informados, em ${i.comValor} de ${i.registradas} NCs. ${i.parciais} com algum campo de custo em branco (parcial).`,
      cor: 'var(--flow-info)',
    },
    {
      rotulo: 'Valor reembolsado (R$)',
      valor: i.valorReembolsado === null ? 'Não informado' : formatarMoeda(i.valorReembolsado),
      dica: `Informado em ${i.reembolsoInformado} de ${i.registradas} NCs. Em branco não é zero: só conta o valor digitado.`,
      cor: 'var(--flow-success)',
    },
    {
      rotulo: 'Custo líquido registrado (R$)',
      valor: i.custoLiquido === null ? 'Não informado' : formatarMoeda(i.custoLiquido),
      dica: `Custo total − reembolso, em ${i.comValor} NCs com valor. Reembolso não informado em ${i.comValorSemReembolso} delas.`,
      cor: 'var(--flow-danger)',
    },
    {
      rotulo: 'Custo líquido ÷ total de NCs (R$)',
      valor: i.custoLiquidoPorNc === null ? 'Não informado' : formatarMoeda(i.custoLiquidoPorNc),
      dica: `Custo líquido registrado dividido pelas ${i.registradas} NCs do período, inclusive as sem custo. Cobertura: ${i.comValor} de ${i.registradas}.`,
      cor: 'var(--flow-violet)',
    },
    {
      rotulo: 'Média por NC com valor (R$)',
      valor: i.custoLiquidoMedioComValor === null ? 'Não informado' : formatarMoeda(i.custoLiquidoMedioComValor),
      dica: `Custo líquido registrado dividido pelas ${i.comValor} NCs com valor registrado.`,
      cor: 'var(--flow-violet)',
    },
    { rotulo: 'Horas de tratativa', valor: formatarNumero(i.horasTratativa), dica: 'Tempo dedicado pela equipe ao tratamento das NCs — base para dimensionar o esforço.', cor: 'var(--flow-info)' },
    { rotulo: 'Dias médios em aberto', valor: formatarNumero(i.diasMediosEmAberto), dica: 'Da identificação (ou ocorrência) ao encerramento, ou até hoje. Considera só ocorrências com status preenchido.', cor: 'var(--flow-orange)' },
    { rotulo: 'NCs que geraram reversa', valor: formatarPct(i.pctComReversa), dica: `${i.comReversa} de ${i.registradas} NCs do período têm reversa vinculada.`, cor: 'var(--flow-success)' },
  ];

  const temFiltro = filtro.dataInicio || filtro.dataFim || filtro.ano !== null || filtro.empresa;

  return (
    <div className="nc-page">
      <PageHeading
        icon={ChartPie}
        eyebrow="QUALIDADE / NÃO CONFORMIDADES"
        title="Painel de não conformidades"
        description="Volume, custo e tempo de tratativa por tipo do problema, origem / causador, área de tratativa, situação do custo, empresa, tipo de saída, resolução e mês."
        action={<Link to="/admin/nc" className="btn btn-secondary">Ver registros</Link>}
      />

      <section className="filter-panel" aria-label="Filtros do painel">
        <div className="filter-inner">
          <div className="filter-field">
            <label className="field-label" htmlFor="painel-inicio">Data inicial (vazio = sem limite)</label>
            <input id="painel-inicio" type="date" className="field-control" value={filtro.dataInicio} onChange={(e) => setFiltro({ ...filtro, dataInicio: e.target.value })} />
          </div>
          <div className="filter-field">
            <label className="field-label" htmlFor="painel-fim">Data final (vazio = sem limite)</label>
            <input id="painel-fim" type="date" className="field-control" value={filtro.dataFim} onChange={(e) => setFiltro({ ...filtro, dataFim: e.target.value })} />
          </div>
          <div className="filter-field">
            <label className="field-label" htmlFor="painel-ano">Ano para a visão mensal</label>
            <select id="painel-ano" className="field-control" value={ano} onChange={(e) => setFiltro({ ...filtro, ano: Number(e.target.value) })}>
              {anos.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="filter-field">
            <label className="field-label" htmlFor="painel-empresa">Empresa / contrato</label>
            <select id="painel-empresa" className="field-control" value={filtro.empresa} onChange={(e) => setFiltro({ ...filtro, empresa: e.target.value })}>
              <option value="">Todas</option>
              {valoresDaLista(listas, 'empresa').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="filter-actions">
            {temFiltro && <button type="button" className="btn btn-secondary" onClick={() => setFiltro(SEM_FILTRO)}><RotateCcw size={13} /> Limpar</button>}
          </div>
        </div>
      </section>

      {erro ? (
        <section className="surface-panel"><div className="chart-empty">{erro}</div></section>
      ) : loading ? (
        <div className="chart-skeleton" style={{ height: 260 }} />
      ) : (
        <>
          <div className="nc-kpis">
            {indicadores.map((k) => (
              <div key={k.rotulo} className="kpi-card" style={{ '--stat-color': k.cor } as CSSProperties}>
                <div className="kpi-top"><span className="kpi-label">{k.rotulo}</span></div>
                <div className="kpi-value">{k.valor}</div>
                <div className="kpi-hint">{k.dica}</div>
              </div>
            ))}
          </div>

          <p className="list-summary">
            O painel conta todas as NCs do período: {i.registradas} registradas, {i.classificadas} classificadas e {i.pendentes} pendentes de classificação.
            As pendentes aparecem nas linhas “Sem tipo (a revisar)”, “Sem causador (a revisar)” e “Sem origem antiga (registro novo)”.
            Nas tabelas de classificação, valores sem registros não aparecem; o total é sempre completo.
          </p>

          <div className="chart-grid">
            <div className="chart-wide"><CoberturaCustoBloco cobertura={i.cobertura} registradas={i.registradas} /></div>
            <div className="chart-wide"><TabelaCategoria titulo="Por tipo do problema" coluna="Tipo do problema" linhas={painel.porTipoProblema} ocultarSemRegistro /></div>
            <TabelaCategoria titulo="Por origem / causador" coluna="Origem / causador" linhas={painel.porCausador} ocultarSemRegistro />
            <TabelaCategoria titulo="Por área responsável pela tratativa" coluna="Área de tratativa" linhas={painel.porAreaTratativa} ocultarSemRegistro />
            <TabelaCategoria titulo="Por situação do custo" coluna="Houve custo?" linhas={painel.porSituacaoCusto} ocultarSemRegistro />
            <TabelaCategoria titulo="Por empresa / contrato" coluna="Empresa / contrato" linhas={painel.porEmpresa} />
            <TabelaCategoria titulo="Por tipo de saída" coluna="Tipo de saída" linhas={painel.porTipoSaida} />
            <TabelaCategoria titulo="Por resolução" coluna="Resolução" linhas={painel.porResolucao} />
            <TabelaCategoria titulo="Por status da NC" coluna="Status da NC" linhas={painel.porStatus} />
            <TabelaMes ano={ano} linhas={painel.porMes} />
            <div className="chart-wide"><TabelaCategoria titulo="Registros antigos: origem da não conformidade" coluna="Origem antiga" linhas={painel.porOrigem} /></div>
            <TabelaCategoria titulo="Registros antigos: área responsável" coluna="Área responsável (origem antiga)" linhas={painel.porArea} />
          </div>
        </>
      )}
    </div>
  );
}
