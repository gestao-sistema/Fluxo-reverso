import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, ClipboardCheck, Copy, Download, Eye, Loader2, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import PageHeading from '../components/ui/PageHeading';
import { useAuth } from '../context/AuthContext';
import apiService from '../services/apiService';
import { STATUS_LABEL, type RastreamentoCorreios, type ReversaEmissaoEvento, type ReversaEmissaoResumo, type Solicitacao, type SolicitacaoAprovacaoHistorico, type SolicitacaoHistorico, type StatusSolicitacao } from '../types';
import { PROXIMO_PASSO, statusEfetivo } from '../lib/situacaoPedido';
import EmissaoDatasResumo from '../components/admin/EmissaoDatasResumo';
import VisualizadorPdf from '../components/ui/VisualizadorPdf';
import { codigoPedido } from '../lib/pedido';

type FiltroPedidos = 'todos' | 'andamento' | 'rejeitados' | 'concluidos';

function categoriaPedido(pedido: Solicitacao): Exclude<FiltroPedidos, 'todos'> {
  const situacao = statusEfetivo(pedido);
  if (situacao === 'reprovado') return 'rejeitados';
  if (situacao === 'concluido') return 'concluidos';
  return 'andamento';
}

function dataBr(valor: string | null | undefined, hora = false): string {
  if (!valor) return '—';
  const data = new Date(valor.length === 10 ? `${valor}T12:00:00` : valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleString('pt-BR', hora
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { dateStyle: 'short' });
}

function classeSituacao(situacao: StatusSolicitacao): string {
  if (situacao === 'reprovado') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (situacao === 'aguardando_aprovacao') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (situacao === 'concluido') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-sky-50 text-sky-700 border-sky-200';
}

interface HistoricoItem {
  id: string;
  data: string;
  usuario: string;
  descricao: string;
}

function juntarHistorico(
  operacao: SolicitacaoHistorico[],
  aprovacao: SolicitacaoAprovacaoHistorico[],
  emissao: ReversaEmissaoEvento[],
): HistoricoItem[] {
  return [
    ...operacao.map((item) => ({ id: `op-${item.id}`, data: item.created_at, usuario: item.user_nome, descricao: item.acao })),
    ...aprovacao.map((item) => ({
      id: `ap-${item.id}`,
      data: item.created_at,
      usuario: item.user_nome,
      descricao: item.evento === 'rejeitada'
        ? `Solicitação rejeitada${item.justificativa ? `: ${item.justificativa}` : ''}`
        : item.evento === 'aprovada' ? 'Solicitação aprovada'
        : item.evento === 'invalidada' ? 'Aprovação invalidada'
        : `Solicitação alterada${item.situacao_anterior ? ` (${item.situacao_anterior})` : ''}`,
    })),
    ...emissao.map((item) => ({ id: `em-${item.id}`, data: item.created_at, usuario: item.user_nome, descricao: item.descricao })),
  ].sort((a, b) => b.data.localeCompare(a.data));
}

function copiarCodigo(rotulo: string, codigo: string) {
  if (!navigator.clipboard?.writeText) {
    toast.error('A cópia para a área de transferência não está disponível neste navegador.');
    return;
  }
  void navigator.clipboard.writeText(codigo)
    .then(() => toast.success(`${rotulo} copiado.`))
    .catch(() => toast.error(`Não foi possível copiar ${rotulo.toLocaleLowerCase('pt-BR')}.`));
}

function BotoesEtiqueta({ path, nome }: { path: string; nome: string }) {
  const [ocupado, setOcupado] = useState(false);
  // A etiqueta abre no visualizador em popup, sem nova aba
  const [visualizando, setVisualizando] = useState(false);

  const baixar = async () => {
    setOcupado(true);
    try {
      const url = await apiService.urlEtiqueta(path);
      const resposta = await fetch(url);
      if (!resposta.ok) throw new Error('Não foi possível baixar a etiqueta.');
      const blob = await resposta.blob();
      const temporaria = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = temporaria;
      link.download = nome || 'etiqueta.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(temporaria), 1000);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível baixar a etiqueta.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => setVisualizando(true)} disabled={ocupado} className="btn btn-secondary">
        <Eye size={15} /> Abrir etiqueta
      </button>
      <button type="button" onClick={() => void baixar()} disabled={ocupado} className="btn btn-secondary">
        <Download size={15} /> Baixar etiqueta
      </button>
      {visualizando && (
        <VisualizadorPdf
          titulo="Etiqueta"
          nomeArquivo={nome || 'etiqueta.pdf'}
          carregarUrl={() => apiService.urlEtiqueta(path)}
          onFechar={() => setVisualizando(false)}
        />
      )}
    </div>
  );
}

function DetalhesPedido({ pedido, abrirInicialmente = false }: { pedido: Solicitacao; abrirInicialmente?: boolean }) {
  const [aberto, setAberto] = useState(abrirInicialmente);
  const [carregando, setCarregando] = useState(false);
  const [consultado, setConsultado] = useState(false);
  const [erro, setErro] = useState(false);
  const [historicoOperacao, setHistoricoOperacao] = useState<SolicitacaoHistorico[]>([]);
  const [historicoAprovacao, setHistoricoAprovacao] = useState<SolicitacaoAprovacaoHistorico[]>([]);
  const [historicoEmissao, setHistoricoEmissao] = useState<ReversaEmissaoEvento[]>([]);
  const [emissao, setEmissao] = useState<ReversaEmissaoResumo | null>(null);
  const [rastreio, setRastreio] = useState<RastreamentoCorreios | null>(null);
  const consultaEmCurso = useRef(false);

  const carregarDetalhes = useCallback(async (forcar = false) => {
    if ((consultado && !forcar) || consultaEmCurso.current) return;
    consultaEmCurso.current = true;
    setCarregando(true);
    setErro(false);
    const resultados = await Promise.allSettled([
      apiService.getHistorico(pedido.id),
      apiService.getHistoricoAprovacao(pedido.id),
      apiService.getHistoricoEmissao(pedido.id),
      apiService.getEmissaoAtual(pedido.id),
    ]);
    setHistoricoOperacao(resultados[0].status === 'fulfilled' ? resultados[0].value : []);
    setHistoricoAprovacao(resultados[1].status === 'fulfilled' ? resultados[1].value : []);
    setHistoricoEmissao(resultados[2].status === 'fulfilled' ? resultados[2].value : []);
    const emissaoAtual = resultados[3].status === 'fulfilled' ? resultados[3].value : null;
    setEmissao(emissaoAtual);
    const codigo = emissaoAtual?.codigo_rastreio ?? pedido.codigo_rastreio;
    let erroRastreio = false;
    if (codigo) {
      try { setRastreio(await apiService.getRastreio(codigo)); } catch { setRastreio(null); erroRastreio = true; }
    } else {
      setRastreio(null);
    }
    setErro(erroRastreio || resultados.some((resultado) => resultado.status === 'rejected'));
    setConsultado(true);
    setCarregando(false);
    consultaEmCurso.current = false;
  }, [consultado, pedido.id, pedido.codigo_rastreio]);

  useEffect(() => {
    if (abrirInicialmente) void carregarDetalhes();
  }, [abrirInicialmente, carregarDetalhes]);

  const historico = juntarHistorico(historicoOperacao, historicoAprovacao, historicoEmissao);
  const codigoAutorizacao = emissao?.codigo_autorizacao;
  const codigoRastreio = emissao?.codigo_rastreio ?? pedido.codigo_rastreio;

  return (
    <details open={aberto} className="group border-t border-slate-100" onToggle={(event) => {
      const estaAberto = event.currentTarget.open;
      setAberto(estaAberto);
      if (estaAberto) void carregarDetalhes();
    }}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
        <span>Ver detalhes</span>
        <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5">
        <section aria-label="Dados da solicitação">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Dados</h3>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">Solicitante</dt><dd className="text-sm font-medium text-slate-800">{pedido.solicitado_por_nome ?? pedido.solicitante}</dd></div>
            <div><dt className="text-xs text-slate-500">Setor</dt><dd className="text-sm font-medium text-slate-800">{pedido.setor}</dd></div>
            <div><dt className="text-xs text-slate-500">Código do cliente</dt><dd className="text-sm font-medium text-slate-800">{pedido.codigo_cliente}</dd></div>
            <div><dt className="text-xs text-slate-500">Endereço de postagem</dt><dd className="text-sm font-medium text-slate-800">{pedido.endereco_postagem}</dd></div>
            {pedido.endereco_destino_troca && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Endereço para troca</dt><dd className="text-sm font-medium text-slate-800">{pedido.endereco_destino_troca}</dd></div>}
            {pedido.justificativa_outros && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Justificativa do motivo</dt><dd className="text-sm font-medium text-slate-800">{pedido.justificativa_outros}</dd></div>}
          </dl>
        </section>

        {statusEfetivo(pedido) === 'reprovado' && (
          <section className="rounded-lg border border-rose-200 bg-rose-50 p-3" aria-label="Justificativa da rejeição">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-rose-700">Motivo da rejeição</h3>
            <p className="mt-1 text-sm text-rose-900">{pedido.aprovacao_justificativa ?? pedido.anotacoes ?? 'Não foi informada uma justificativa.'}</p>
          </section>
        )}

        <section aria-label="Códigos de postagem" className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Postagem e Correios</h3>
          {codigoAutorizacao ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3">
              <div><p className="text-xs text-slate-500">Autorização de postagem</p><code className="text-sm font-semibold text-slate-800">{codigoAutorizacao}</code></div>
              <button type="button" onClick={() => copiarCodigo('Autorização de postagem', codigoAutorizacao)} className="btn btn-secondary" aria-label="Copiar autorização de postagem"><Copy size={14} /> Copiar</button>
            </div>
          ) : <p className="text-sm text-slate-500">Autorização de postagem não informada.</p>}
          {codigoRastreio ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3">
              <div><p className="text-xs text-slate-500">Código de rastreamento</p><code className="text-sm font-semibold text-slate-800">{codigoRastreio}</code></div>
              <button type="button" onClick={() => copiarCodigo('Código de rastreamento', codigoRastreio)} className="btn btn-secondary" aria-label="Copiar código de rastreamento"><Copy size={14} /> Copiar</button>
            </div>
          ) : <p className="text-sm text-slate-500">Sem código de rastreamento. O andamento dos Correios aparece quando ele for informado.</p>}
          {emissao && <EmissaoDatasResumo emissao={emissao} aguardandoPostagem={pedido.status === 'etiqueta_gerada'} />}
          {codigoRastreio ? (
            <p className="text-sm text-slate-700" aria-label="Andamento dos Correios">
              {rastreio?.ultimo_evento_descricao
                ? <>{rastreio.ultimo_evento_descricao}{rastreio.unidade_cidade && rastreio.unidade_uf ? ` · ${rastreio.unidade_cidade}/${rastreio.unidade_uf}` : ''}</>
                : 'Ainda sem atualização dos Correios.'}
            </p>
          ) : null}
        </section>

        <section aria-label="Histórico disponível">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Histórico</h3>
          {carregando ? <p className="text-sm text-slate-500">Carregando histórico…</p> : null}
          {erro && <p className="text-sm text-amber-700">Parte do histórico não pôde ser consultada.</p>}
          {!carregando && historico.length === 0 && <p className="text-sm text-slate-500">Nenhum evento disponível.</p>}
          {historico.length > 0 && (
            <ol className="space-y-3 border-l border-slate-200 pl-4">
              {historico.map((item) => (
                <li key={item.id} className="relative before:absolute before:-left-[21px] before:top-1.5 before:h-2 before:w-2 before:rounded-full before:bg-slate-400">
                  <p className="text-sm text-slate-800">{item.descricao}</p>
                  <p className="text-xs text-slate-500">{item.usuario || 'Sistema'} · {dataBr(item.data, true)}</p>
                </li>
              ))}
            </ol>
          )}
          {erro && <button type="button" onClick={() => void carregarDetalhes(true)} className="mt-2 text-sm font-medium text-blue-700 hover:underline">Tentar novamente</button>}
        </section>
      </div>
    </details>
  );
}

const FILTROS: Array<[FiltroPedidos, string]> = [
  ['todos', 'Todos'],
  ['andamento', 'Em andamento'],
  ['rejeitados', 'Rejeitados'],
  ['concluidos', 'Concluídos'],
];

export default function MeusPedidosPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const solicitacaoId = searchParams.get('solicitacaoId');
  const [pedidos, setPedidos] = useState<Solicitacao[]>([]);
  const [filtro, setFiltro] = useState<FiltroPedidos>('todos');
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState(false);
  const requestId = useRef(0);
  const pedidoRolado = useRef<string | null>(null);

  const carregar = useCallback(async (inicial = false) => {
    if (!user) return;
    const id = ++requestId.current;
    if (inicial) setCarregando(true);
    else setAtualizando(true);
    setErro(false);
    try {
      const dados = await apiService.getMeusSolicitacoes();
      if (id === requestId.current) setPedidos(dados);
    } catch {
      if (id === requestId.current) setErro(true);
    } finally {
      if (id === requestId.current) {
        setCarregando(false);
        setAtualizando(false);
      }
    }
  }, [user]);

  useEffect(() => { void carregar(true); }, [carregar]);

  useEffect(() => {
    if (!solicitacaoId || carregando || pedidoRolado.current === solicitacaoId) return;
    const pedidoExiste = pedidos.some((pedido) => pedido.id === solicitacaoId);
    if (!pedidoExiste) return;
    pedidoRolado.current = solicitacaoId;
    document.getElementById(`meu-pedido-${solicitacaoId}`)?.scrollIntoView?.({ block: 'center' });
  }, [solicitacaoId, pedidos, carregando]);

  const filtrados = useMemo(() => filtro === 'todos'
    ? pedidos
    : pedidos.filter((pedido) => categoriaPedido(pedido) === filtro), [pedidos, filtro]);

  return (
    <div className="space-y-5">
      <PageHeading
        icon={ClipboardCheck}
        title="Meus pedidos"
        action={<button type="button" onClick={() => void carregar()} disabled={atualizando || carregando} className="btn btn-secondary"><RefreshCw size={15} className={atualizando ? 'animate-spin' : ''} /> Atualizar</button>}
      />

      <div className="list-toolbar">
        <span className="list-summary">{carregando ? 'Carregando' : `${filtrados.length} de ${pedidos.length} pedidos`}</span>
        <div className="segmented" role="group" aria-label="Filtrar meus pedidos">
          {FILTROS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setFiltro(key)} className={filtro === key ? 'active' : ''} aria-pressed={filtro === key}>{label}</button>
          ))}
        </div>
      </div>

      {erro && <div className="dashboard-query-alert" role="alert"><span>Não foi possível carregar seus pedidos.</span><button type="button" onClick={() => void carregar()} disabled={atualizando}>Tentar novamente</button></div>}
      {carregando ? (
        <div className="surface-panel flex items-center justify-center gap-2 p-10 text-sm text-slate-500" role="status"><Loader2 size={18} className="animate-spin" /> Carregando…</div>
      ) : filtrados.length === 0 ? (
        <div className="surface-panel p-10 text-center text-sm text-slate-500">{pedidos.length ? 'Nenhum pedido nesta situação.' : 'Você ainda não fez pedidos.'}</div>
      ) : (
        <div className="space-y-3">
          {filtrados.map((pedido) => (
            <article key={pedido.id} id={`meu-pedido-${pedido.id}`} className="surface-panel overflow-hidden">
              <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-500" title={pedido.id}>{codigoPedido(pedido.id)}</span>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${classeSituacao(statusEfetivo(pedido))}`}>{STATUS_LABEL[statusEfetivo(pedido)]}</span>
                  </div>
                  <h2 className="mt-2 truncate text-base font-semibold text-slate-900">{pedido.nome_cliente}</h2>
                  <p className="mt-1 text-sm text-slate-600">{pedido.empresa} · {dataBr(pedido.data_solicitacao)} · {pedido.motivo}</p>
                  {PROXIMO_PASSO[statusEfetivo(pedido)] && <p className="mt-1 text-sm font-medium text-slate-700">{PROXIMO_PASSO[statusEfetivo(pedido)]}</p>}
                  {pedido.etiqueta_path && <div className="mt-3"><BotoesEtiqueta path={pedido.etiqueta_path} nome={pedido.etiqueta_nome ?? 'etiqueta.pdf'} /></div>}
                </div>
                <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm sm:min-w-44 sm:grid-cols-1">
                  <div><dt className="text-xs text-slate-500">Cliente</dt><dd className="font-medium text-slate-800">{pedido.codigo_cliente}</dd></div>
                  <div><dt className="text-xs text-slate-500">Solicitante</dt><dd className="font-medium text-slate-800">{pedido.solicitado_por_nome ?? pedido.solicitante}</dd></div>
                </dl>
              </div>
              <DetalhesPedido key={`detalhes-${pedido.id}`} pedido={pedido} abrirInicialmente={pedido.id === solicitacaoId} />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
