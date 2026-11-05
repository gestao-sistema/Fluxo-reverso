// ── Painel de não conformidades (PAINEL_NC) ──────────────────────────────────
// Mesmos indicadores e tabelas da planilha: conta só NCs com origem preenchida
// e data da ocorrência dentro do período (vazio = todo o histórico). Acrescenta
// a quebra por status da NC e a proporção de NCs que geraram reversa.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { useEmpresaDaTela } from '../context/TemaContext';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ChartPie, RotateCcw } from 'lucide-react';
import PageHeading from '../components/ui/PageHeading';
import { useNaoConformidades } from '../hooks/useNaoConformidades';
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

function TabelaCategoria({ titulo, coluna, linhas }: { titulo: string; coluna: string; linhas: LinhaPainelNc[] }) {
  const total = linhas.reduce(
    (t, l) => ({ qtd: t.qtd + l.qtd, pct: t.pct + l.pct, custo: t.custo + l.custoLiquido, horas: t.horas + l.horas, aberto: t.aberto + l.emAberto }),
    { qtd: 0, pct: 0, custo: 0, horas: 0, aberto: 0 }
  );
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
              <th className="nc-num">Custo líquido (R$)</th>
              <th className="nc-num">Horas de tratativa</th>
              <th className="nc-num">Em aberto</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.valor} className={l.qtd === 0 ? 'nc-vazio' : undefined}>
                <td>{l.valor}</td>
                <td className="nc-num">{l.qtd}</td>
                <td className="nc-num">
                  <div className="nc-barra">
                    {formatarPct(l.pct)}
                    <span className="nc-barra-trilho"><span style={{ width: `${Math.round(l.pct * 100)}%` }} /></span>
                  </div>
                </td>
                <td className="nc-num">{formatarMoeda(l.custoLiquido)}</td>
                <td className="nc-num">{formatarNumero(l.horas)}</td>
                <td className="nc-num">{l.emAberto}</td>
              </tr>
            ))}
            <tr className="nc-total">
              <td>TOTAL</td>
              <td className="nc-num">{total.qtd}</td>
              <td className="nc-num">{formatarPct(total.pct)}</td>
              <td className="nc-num">{formatarMoeda(total.custo)}</td>
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
  const total = linhas.reduce((t, l) => ({ qtd: t.qtd + l.qtd, ev: t.ev + l.evitaveis, custo: t.custo + l.custoLiquido }), { qtd: 0, ev: 0, custo: 0 });
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
            <tr><th>Mês</th><th className="nc-num">Qtd.</th><th className="nc-num">Evitáveis</th><th className="nc-num">Custo líquido (R$)</th></tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.mes} className={l.qtd === 0 ? 'nc-vazio' : undefined}>
                <td>{l.rotulo}</td>
                <td className="nc-num">{l.qtd}</td>
                <td className="nc-num">{l.evitaveis}</td>
                <td className="nc-num">{formatarMoeda(l.custoLiquido)}</td>
              </tr>
            ))}
            <tr className="nc-total">
              <td>TOTAL</td>
              <td className="nc-num">{total.qtd}</td>
              <td className="nc-num">{total.ev}</td>
              <td className="nc-num">{formatarMoeda(total.custo)}</td>
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
    { rotulo: 'Não conformidades registradas', valor: String(i.registradas), dica: 'Total de ocorrências com origem informada no período.', cor: 'var(--flow-accent)' },
    { rotulo: 'Em aberto (aberta ou em tratativa)', valor: String(i.emAberto), dica: 'Ocorrências ainda sem encerramento.', cor: 'var(--flow-warning)' },
    { rotulo: '% evitáveis internamente', valor: formatarPct(i.pctEvitaveis), dica: 'Origens atribuídas a Expedição, Financeiro ou Comercial.', cor: 'var(--flow-danger)' },
    { rotulo: 'Custo total (R$)', valor: formatarMoeda(i.custoTotal), dica: 'Produto + frete adicional + multa/outros.', cor: 'var(--flow-info)' },
    { rotulo: 'Valor reembolsado (R$)', valor: formatarMoeda(i.valorReembolsado), dica: 'Indenizações recebidas dos Correios.', cor: 'var(--flow-success)' },
    { rotulo: 'Custo líquido (R$)', valor: formatarMoeda(i.custoLiquido), dica: 'Custo total − reembolso.', cor: 'var(--flow-danger)' },
    { rotulo: 'Custo líquido médio por NC (R$)', valor: formatarMoeda(i.custoLiquidoMedio), dica: 'Custo líquido ÷ ocorrências.', cor: 'var(--flow-violet)' },
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
        description="Volume, custo e tempo de tratativa por origem, área, empresa, tipo de saída, resolução e mês."
        action={<Link to="/admin/nc" className="btn-secondary">Ver registros</Link>}
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
            {temFiltro && <button type="button" className="btn-secondary" onClick={() => setFiltro(SEM_FILTRO)}><RotateCcw size={13} /> Limpar</button>}
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
            O painel conta somente NCs com origem preenchida. {ncs.filter((nc) => !nc.origem).length > 0 && `${ncs.filter((nc) => !nc.origem).length} registro(s) sem origem ficam de fora.`}
          </p>

          <div className="chart-grid">
            <div className="chart-wide"><TabelaCategoria titulo="Por origem da não conformidade" coluna="Origem da não conformidade" linhas={painel.porOrigem} /></div>
            <TabelaCategoria titulo="Por área responsável" coluna="Área responsável" linhas={painel.porArea} />
            <TabelaCategoria titulo="Por empresa / contrato" coluna="Empresa / contrato" linhas={painel.porEmpresa} />
            <TabelaCategoria titulo="Por tipo de saída" coluna="Tipo de saída" linhas={painel.porTipoSaida} />
            <TabelaCategoria titulo="Por resolução" coluna="Resolução" linhas={painel.porResolucao} />
            <TabelaCategoria titulo="Por status da NC" coluna="Status da NC" linhas={painel.porStatus} />
            <TabelaMes ano={ano} linhas={painel.porMes} />
          </div>
        </>
      )}
    </div>
  );
}
