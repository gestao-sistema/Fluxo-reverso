// ── Lista de não conformidades ───────────────────────────────────────────────
// Registro da Expedição (REGISTRO_NC): filtros, exportação no layout da
// planilha e importação do histórico (admin). Registros novos aparecem pelo tipo do
// problema e pela origem / causador, com ou sem origem antiga.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Download, FileSpreadsheet, Plus, RotateCcw, ShieldAlert, Upload } from 'lucide-react';
import PageHeading from '../components/ui/PageHeading';
import NcStatusBadge from '../components/nc/NcStatusBadge';
import NcImportarModal from '../components/nc/NcImportarModal';
import { useAuth } from '../context/AuthContext';
import { useEmpresaDaTela } from '../context/TemaContext';
import { useNaoConformidades } from '../hooks/useNaoConformidades';
import { podeEditarNc } from '../lib/perfil';
import { SEM_STATUS, diasEmAberto, formatarDataBr, valoresDaLista } from '../lib/ncCalculos';
import { exportarPlanilhaNc } from '../lib/ncPlanilha';
import { exportarRelatorioMensalNc } from '../lib/ncRelatorioMensal';
import { SEM_FILTROS_NC, filtrarNcs, temFiltroNc } from '../lib/ncFiltros';
import type { FiltrosNc } from '../lib/ncFiltros';
import { ROTULOS_FILTRO_CUSTO, descreverCusto } from '../lib/ncCustos';
import type { FiltroCusto } from '../lib/ncCustos';
import { STATUS_NC, isAdmin } from '../types';
import type { NaoConformidade } from '../types';
import '../styles/nc.css';

/**
 * Custo líquido da linha, com a mesma regra do detalhe (ausência não vira zero). A situação
 * aparece em linha pequena abaixo do valor: a tabela não ganha coluna nova.
 */
function CustoLinha({ nc }: { nc: NaoConformidade }) {
  const custo = descreverCusto(nc.custo_situacao, nc);
  const detalhe = [nc.custo_situacao ?? 'Não informado', custo.notaReembolso].filter(Boolean).join(' · ');
  return (
    <>
      {custo.rotuloLiquido}
      <span className="nc-vazio" style={{ display: 'block', fontSize: 11 }}>{detalhe}</span>
    </>
  );
}

export default function NcListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { ncs, listas, loading, erro, recarregar } = useNaoConformidades();
  const [filtros, setFiltros] = useState<FiltrosNc>(SEM_FILTROS_NC);
  // Só o tema visual acompanha a empresa exibida no filtro
  useEmpresaDaTela(filtros.empresa || null);
  const [mesRelatorio, setMesRelatorio] = useState(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  });
  const [importando, setImportando] = useState(false);
  const editar = user ? podeEditarNc(user) : false;
  const admin = user ? isAdmin(user) : false;

  const filtradas = useMemo(() => filtrarNcs(ncs, filtros), [ncs, filtros]);

  const exportar = () => {
    if (!filtradas.length) {
      toast.error('Nenhuma NC para exportar.');
      return;
    }
    exportarPlanilhaNc(filtradas);
    toast.success('Planilha exportada: 36 colunas do layout da REGISTRO_NC e a coluna adicional "Reversas geradas".');
  };

  const exportarMensal = () => {
    const registrosDoMes = ncs.filter((nc) =>
      (nc.data_ocorrencia ?? '').startsWith(mesRelatorio)
      && (!filtros.empresa || nc.empresa === filtros.empresa)
    );
    if (!registrosDoMes.length) {
      toast.error('Não há NCs registradas para este mês e empresa.');
      return;
    }
    exportarRelatorioMensalNc(ncs, mesRelatorio, filtros.empresa || undefined);
    toast.success('Relatório mensal exportado com os valores registrados.');
  };

  const temFiltro = temFiltroNc(filtros);
  const origens = [...listas.origens].sort((a, b) => a.ordem - b.ordem).map((o) => o.nome);

  return (
    <div className="nc-page">
      <PageHeading
        icon={ShieldAlert}
        eyebrow="QUALIDADE / NÃO CONFORMIDADES"
        title="Não conformidades"
        description="Registre e acompanhe toda não conformidade da Expedição, com ou sem reversa."
        action={editar && <Link to="/admin/nc/nova" className="btn-primary"><Plus size={15} /> Registrar ocorrência</Link>}
      />

      <section className="filter-panel" aria-label="Filtros de não conformidades">
        <div className="filter-inner">
          <div className="filter-field">
            <label className="field-label" htmlFor="nc-inicio">Ocorrência a partir de</label>
            <input id="nc-inicio" type="date" className="field-control" value={filtros.dataInicio} onChange={(e) => setFiltros({ ...filtros, dataInicio: e.target.value })} />
          </div>
          <div className="filter-field">
            <label className="field-label" htmlFor="nc-fim">Ocorrência até</label>
            <input id="nc-fim" type="date" className="field-control" value={filtros.dataFim} onChange={(e) => setFiltros({ ...filtros, dataFim: e.target.value })} />
          </div>
          <div className="filter-field">
            <label className="field-label" htmlFor="nc-empresa">Empresa / contrato</label>
            <select id="nc-empresa" className="field-control" value={filtros.empresa} onChange={(e) => setFiltros({ ...filtros, empresa: e.target.value })}>
              <option value="">Todas</option>
              {valoresDaLista(listas, 'empresa').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="filter-field">
            <label className="field-label" htmlFor="nc-tipo">Tipo do problema</label>
            <select id="nc-tipo" className="field-control" value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}>
              <option value="">Todos</option>
              {valoresDaLista(listas, 'tipo_problema').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="filter-field">
            <label className="field-label" htmlFor="nc-causador">Origem / causador</label>
            <select id="nc-causador" className="field-control" value={filtros.causador} onChange={(e) => setFiltros({ ...filtros, causador: e.target.value })}>
              <option value="">Todos</option>
              {valoresDaLista(listas, 'causador').map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="filter-field">
            <label className="field-label" htmlFor="nc-status">Status da NC</label>
            <select id="nc-status" className="field-control" value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}>
              <option value="">Todos</option>
              {STATUS_NC.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value={SEM_STATUS}>{SEM_STATUS}</option>
            </select>
          </div>
          <div className="filter-field">
            <label className="field-label" htmlFor="nc-custo">Custo</label>
            <select id="nc-custo" className="field-control" value={filtros.custo} onChange={(e) => setFiltros({ ...filtros, custo: e.target.value as FiltroCusto })}>
              {(Object.keys(ROTULOS_FILTRO_CUSTO) as FiltroCusto[]).map((f) => <option key={f} value={f}>{ROTULOS_FILTRO_CUSTO[f]}</option>)}
            </select>
          </div>
          <div className="filter-field">
            <label className="field-label" htmlFor="nc-origem">Origem antiga</label>
            <select id="nc-origem" className="field-control" value={filtros.origem} onChange={(e) => setFiltros({ ...filtros, origem: e.target.value })}>
              <option value="">Todas</option>
              {origens.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="filter-field">
            <span className="field-label">Classificação</span>
            <label className="flex items-center gap-2 text-sm" htmlFor="nc-pendente">
              <input id="nc-pendente" type="checkbox" checked={filtros.pendente} onChange={(e) => setFiltros({ ...filtros, pendente: e.target.checked })} />
              Só sem tipo ou causador
            </label>
          </div>
          <div className="filter-field is-search">
            <label className="field-label" htmlFor="nc-busca">Buscar</label>
            <input id="nc-busca" type="search" className="field-control" placeholder="ID, cliente, vendedora, NF, romaneio ou rastreio" value={filtros.busca} onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })} />
          </div>
          <div className="filter-actions">
            {temFiltro && <button type="button" className="btn-secondary" onClick={() => setFiltros(SEM_FILTROS_NC)}><RotateCcw size={13} /> Limpar</button>}
          </div>
        </div>
      </section>

      <div className="list-toolbar">
        <div className="list-summary">REGISTRO DE NC · {loading ? 'Carregando' : `${filtradas.length} de ${ncs.length} registro(s)`}</div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600" htmlFor="nc-relatorio-mes">
            Mês do relatório
            <input id="nc-relatorio-mes" type="month" className="field-control" value={mesRelatorio} onChange={(e) => setMesRelatorio(e.target.value)} disabled={loading} />
          </label>
          <button type="button" className="btn-secondary" onClick={exportarMensal} disabled={loading || !mesRelatorio}>
            <FileSpreadsheet size={15} /> Relatório mensal por empresa <Download size={13} />
          </button>
          {admin && (
            <button type="button" className="btn-secondary" onClick={() => setImportando(true)}>
              <Upload size={15} /> Importar planilha
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={exportar}>
            <FileSpreadsheet size={15} /> Exportar XLSX <Download size={13} />
          </button>
        </div>
      </div>
      <p className="-mt-4 text-xs text-slate-500">O relatório mensal por empresa que vocês montavam manualmente agora pode ser gerado aqui. Custos e reembolsos aparecem somente quando registrados.</p>

      <section className="surface-panel" style={{ overflow: 'hidden' }} aria-label="Não conformidades">
        {erro ? (
          <div className="chart-empty">{erro}</div>
        ) : loading ? (
          <div className="chart-skeleton" style={{ margin: 20 }} />
        ) : filtradas.length === 0 ? (
          <div className="chart-empty">{ncs.length ? 'Nenhuma NC com esses filtros.' : 'Nenhuma NC registrada ainda.'}</div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table" style={{ minWidth: 1180 }}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Ocorrência</th>
                  <th>Empresa</th>
                  <th>Cliente</th>
                  <th>Tipo do problema</th>
                  <th>Origem / causador</th>
                  <th>Tratativa</th>
                  <th>Status</th>
                  <th>Resolução</th>
                  <th>Custo líquido</th>
                  <th>Dias</th>
                  <th>Reversas</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((nc) => (
                  <tr key={nc.id} className="nc-row-link" onClick={() => navigate(`/admin/nc/${nc.id}`)}>
                    <td className="table-strong" style={{ whiteSpace: 'nowrap' }}>
                      <Link to={`/admin/nc/${nc.id}`} onClick={(e) => e.stopPropagation()}>{nc.codigo}</Link>
                      {nc.importada && <span className="nc-tag" title="Veio da planilha">planilha</span>}
                    </td>
                    <td>{formatarDataBr(nc.data_ocorrencia)}</td>
                    <td>{nc.empresa ?? '—'}</td>
                    <td><span className="record-truncate">{nc.cliente ?? '—'}</span></td>
                    <td>
                      {nc.tipo_problema ? (
                        <span className="record-truncate">{nc.tipo_problema}</span>
                      ) : (
                        <span className="nc-vazio">Não informado</span>
                      )}
                      {nc.origem && (
                        <span className="nc-origem-antiga record-truncate" title={nc.origem}>Origem antiga: {nc.origem}</span>
                      )}
                    </td>
                    <td>{nc.causador ?? <span className="nc-vazio">Não informada</span>}</td>
                    <td>{nc.area_tratativa ?? <span className="nc-vazio">Não atribuída</span>}</td>
                    <td><NcStatusBadge status={nc.status} /></td>
                    <td>{nc.resolucao ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><CustoLinha nc={nc} /></td>
                    <td>{diasEmAberto(nc) ?? '—'}</td>
                    <td>{nc.qtd_reversas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {importando && (
        <NcImportarModal
          listas={listas}
          onFechar={() => setImportando(false)}
          onImportado={() => {
            setImportando(false);
            recarregar();
          }}
        />
      )}
    </div>
  );
}
