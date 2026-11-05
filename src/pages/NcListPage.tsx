// ── Lista de não conformidades ───────────────────────────────────────────────
// Registro da Expedição (REGISTRO_NC): filtros, exportação no layout da
// planilha e importação do histórico (admin).
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
import { SEM_STATUS, diasEmAberto, formatarDataBr, formatarMoeda, valoresDaLista } from '../lib/ncCalculos';
import { exportarPlanilhaNc } from '../lib/ncPlanilha';
import { exportarRelatorioMensalNc } from '../lib/ncRelatorioMensal';
import { STATUS_NC, isAdmin } from '../types';
import '../styles/nc.css';

interface Filtros {
  dataInicio: string;
  dataFim: string;
  empresa: string;
  status: string;
  origem: string;
  busca: string;
}

const SEM_FILTRO: Filtros = { dataInicio: '', dataFim: '', empresa: '', status: '', origem: '', busca: '' };

export default function NcListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { ncs, listas, loading, erro, recarregar } = useNaoConformidades();
  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTRO);
  // Só o tema visual acompanha a empresa exibida no filtro
  useEmpresaDaTela(filtros.empresa || null);
  const [mesRelatorio, setMesRelatorio] = useState(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  });
  const [importando, setImportando] = useState(false);
  const editar = user ? podeEditarNc(user) : false;
  const admin = user ? isAdmin(user) : false;

  const filtradas = useMemo(() => {
    const termo = filtros.busca.trim().toLowerCase();
    return ncs.filter(
      (nc) =>
        (!filtros.dataInicio || (nc.data_ocorrencia ?? '') >= filtros.dataInicio) &&
        (!filtros.dataFim || (nc.data_ocorrencia !== null && nc.data_ocorrencia <= filtros.dataFim)) &&
        (!filtros.empresa || nc.empresa === filtros.empresa) &&
        (!filtros.status || (filtros.status === SEM_STATUS ? nc.status === null : nc.status === filtros.status)) &&
        (!filtros.origem || nc.origem === filtros.origem) &&
        (!termo ||
          [nc.codigo, nc.cliente, nc.nf, nc.rastreio, nc.novo_rastreio, nc.romaneio, nc.vendedora].some((v) =>
            v?.toLowerCase().includes(termo)
          ))
    );
  }, [ncs, filtros]);

  const exportar = () => {
    if (!filtradas.length) {
      toast.error('Nenhuma NC para exportar.');
      return;
    }
    exportarPlanilhaNc(filtradas);
    toast.success('Planilha exportada no layout da REGISTRO_NC.');
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

  const temFiltro = Object.values(filtros).some(Boolean);
  const origens = [...listas.origens].sort((a, b) => a.ordem - b.ordem).map((o) => o.nome);

  return (
    <div className="nc-page">
      <PageHeading
        icon={ShieldAlert}
        eyebrow="QUALIDADE / NÃO CONFORMIDADES"
        title="Não conformidades"
        description="Registre e acompanhe toda não conformidade da Expedição, com ou sem reversa."
        action={editar && <Link to="/admin/nc/nova" className="btn-primary"><Plus size={15} /> Nova NC</Link>}
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
            <label className="field-label" htmlFor="nc-status">Status da NC</label>
            <select id="nc-status" className="field-control" value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}>
              <option value="">Todos</option>
              {STATUS_NC.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value={SEM_STATUS}>{SEM_STATUS}</option>
            </select>
          </div>
          <div className="filter-field">
            <label className="field-label" htmlFor="nc-origem">Origem</label>
            <select id="nc-origem" className="field-control" value={filtros.origem} onChange={(e) => setFiltros({ ...filtros, origem: e.target.value })}>
              <option value="">Todas</option>
              {origens.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="filter-field is-search">
            <label className="field-label" htmlFor="nc-busca">Buscar</label>
            <input id="nc-busca" type="search" className="field-control" placeholder="ID, cliente, vendedora, NF, romaneio ou rastreio" value={filtros.busca} onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })} />
          </div>
          <div className="filter-actions">
            {temFiltro && <button type="button" className="btn-secondary" onClick={() => setFiltros(SEM_FILTRO)}><RotateCcw size={13} /> Limpar</button>}
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
                  <th>Origem</th>
                  <th>Área</th>
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
                    <td><span className="record-truncate" title={nc.origem ?? undefined}>{nc.origem ?? '—'}</span></td>
                    <td>{nc.area_responsavel ?? '—'}</td>
                    <td><NcStatusBadge status={nc.status} /></td>
                    <td>{nc.resolucao ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatarMoeda(nc.custo_liquido)}</td>
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
