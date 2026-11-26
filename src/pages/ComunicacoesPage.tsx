import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronRight, Loader2, MessageSquareWarning, RefreshCw, X } from 'lucide-react';
import PageHeading from '../components/ui/PageHeading';
import apiService from '../services/apiService';
import {
  CANAL_COMUNICACAO_LABEL,
  EVENTO_COMUNICACAO_LABEL,
  STATUS_COMUNICACAO_LABEL,
  type AcaoReconciliacao,
  type ComunicacaoReversa,
  type HistoricoComunicacao,
} from '../types';

const PAGINA = 50;
const STATUS_INDETERMINADO = 'resultado_indeterminado';

const inputCls = 'h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30';
const labelCls = 'text-xs font-medium text-slate-500 mb-1';

const ACOES: Record<AcaoReconciliacao, { titulo: string; explicacao: string; confirmar: string }> = {
  confirmar_conclusao_conector: {
    titulo: 'Confirmar aceitação externa',
    explicacao: 'Use somente depois de conferir evidência externa de aceitação. Para SMTP, consulte os registros do servidor; a aceitação SMTP não comprova entrega nem leitura.',
    confirmar: 'Registrar conclusão',
  },
  autorizar_nova_tentativa: {
    titulo: 'Autorizar nova tentativa',
    explicacao: 'Use somente com evidência de que nada foi enviado. A comunicação volta à fila; antes de qualquer envio o sistema revalida destinatário, acesso e pertinência, e pode descartá-la.',
    confirmar: 'Autorizar nova tentativa',
  },
};

function formatarDataHora(valor: string | null): string {
  if (!valor) return '—';
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function classeSituacao(status: string): string {
  if (status === 'acao_conector_concluida' || status === 'smtp_aceito') return 'bg-green-100 text-green-700';
  if (status === STATUS_INDETERMINADO || status === 'erro_permanente' || status === 'limite_tentativas') return 'bg-amber-100 text-amber-800';
  if (status === 'pendente' || status === 'processando' || status === 'falhou') return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-700';
}

interface DialogoProps {
  comunicacao: ComunicacaoReversa;
  acao: AcaoReconciliacao;
  onCancelar: () => void;
  onConcluir: () => void;
}

function DialogoReconciliacao({ comunicacao, acao, onCancelar, onConcluir }: DialogoProps) {
  const [justificativa, setJustificativa] = useState('');
  const [referencia, setReferencia] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const tituloId = useId();
  const primeiroCampo = useRef<HTMLTextAreaElement>(null);
  const textos = ACOES[acao];
  const valido = justificativa.trim().length >= 10 && referencia.trim().length >= 3;

  const cancelarRef = useRef(onCancelar);
  const enviandoRef = useRef(enviando);
  cancelarRef.current = onCancelar;
  enviandoRef.current = enviando;

  useEffect(() => {
    primeiroCampo.current?.focus();
    const aoTeclar = (evento: KeyboardEvent) => { if (evento.key === 'Escape' && !enviandoRef.current) cancelarRef.current(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, []);

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    if (!valido || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await apiService.reconciliarComunicacaoReversa(comunicacao.id, acao, justificativa.trim(), referencia.trim());
      toast.success(acao === 'confirmar_conclusao_conector' ? 'Conclusão registrada.' : 'Nova tentativa autorizada.');
      onConcluir();
    } catch (err) {
      // Outra pessoa pode ter reconciliado antes: a mensagem do banco explica a situação atual.
      setErro(err instanceof Error ? err.message : 'Não foi possível registrar a reconciliação.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[8vh]">
      <div role="dialog" aria-modal="true" aria-labelledby={tituloId} className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 id={tituloId} className="text-lg font-semibold text-slate-900">{textos.titulo}</h2>
          <button type="button" onClick={onCancelar} disabled={enviando} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={enviar} className="px-6 py-5 space-y-4" noValidate>
          <p className="text-sm text-slate-700">
            {comunicacao.pedido} · {EVENTO_COMUNICACAO_LABEL[comunicacao.evento] ?? comunicacao.evento} · {CANAL_COMUNICACAO_LABEL[comunicacao.canal]} para {comunicacao.destinatario_nome}
          </p>
          <p className="text-sm text-slate-600">{textos.explicacao}</p>
          <div className="flex flex-col">
            <label htmlFor="rec-justificativa" className={labelCls}>Justificativa (mínimo de 10 caracteres)</label>
            <textarea ref={primeiroCampo} id="rec-justificativa" rows={3} maxLength={1000} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          </div>
          <div className="flex flex-col">
            <label htmlFor="rec-referencia" className={labelCls}>Referência da execução ou evidência</label>
            <input id="rec-referencia" type="text" maxLength={200} value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Ex.: identificador nos registros SMTP" className={inputCls} />
          </div>
          <p className="text-xs text-slate-500">Seu nome, a data do servidor e os valores anteriores e novos ficam registrados. Esta ação vale somente para esta comunicação.</p>
          {erro && <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onCancelar} disabled={enviando}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={!valido || enviando}>
              {enviando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {textos.confirmar}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Historico({ historico }: { historico: HistoricoComunicacao }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Tentativas</h3>
        {historico.tentativas.length === 0 ? <p className="text-sm text-slate-500">Nenhuma tentativa registrada.</p> : (
          <ul className="space-y-1 text-sm text-slate-700">
            {historico.tentativas.map((tentativa, indice) => (
              <li key={`${tentativa.iniciada_em}-${indice}`}>
                {formatarDataHora(tentativa.iniciada_em)} — {STATUS_COMUNICACAO_LABEL[tentativa.resultado] ?? tentativa.resultado}
                {tentativa.transporte === 'smtp' && tentativa.codigo_smtp ? ` (SMTP ${tentativa.codigo_smtp})` : tentativa.http_status ? ` (HTTP ${tentativa.http_status})` : ''}
                {tentativa.detalhe ? <span className="block text-xs text-slate-500">{tentativa.detalhe}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Reconciliações</h3>
        {historico.reconciliacoes.length === 0 ? <p className="text-sm text-slate-500">Nenhuma reconciliação.</p> : (
          <ul className="space-y-2 text-sm text-slate-700">
            {historico.reconciliacoes.map((item, indice) => (
              <li key={`${item.realizado_em}-${indice}`}>
                <strong>{ACOES[item.acao]?.titulo ?? item.acao}</strong> · {item.administrador_nome} · {formatarDataHora(item.realizado_em)}
                <span className="block text-xs text-slate-500">
                  {STATUS_COMUNICACAO_LABEL[item.status_anterior] ?? item.status_anterior} → {STATUS_COMUNICACAO_LABEL[item.status_novo] ?? item.status_novo}
                </span>
                <span className="block text-xs text-slate-600">Justificativa: {item.justificativa}</span>
                <span className="block text-xs text-slate-600">Referência: {item.referencia}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function ComunicacoesPage() {
  const [itens, setItens] = useState<ComunicacaoReversa[]>([]);
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState<Record<string, number>>({});
  const [status, setStatus] = useState('');
  const [evento, setEvento] = useState('');
  const [canal, setCanal] = useState('');
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [historicos, setHistoricos] = useState<Record<string, HistoricoComunicacao | 'erro' | 'carregando'>>({});
  const [dialogo, setDialogo] = useState<{ comunicacao: ComunicacaoReversa; acao: AcaoReconciliacao } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [lista, contagem] = await Promise.all([
        apiService.listarComunicacoesReversa({ status, evento, canal, limite: PAGINA }),
        apiService.resumoComunicacoesReversa(),
      ]);
      setItens(lista);
      setTotal(lista[0]?.total ?? 0);
      setResumo(contagem);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível carregar as comunicações.');
    } finally {
      setCarregando(false);
    }
  }, [status, evento, canal]);

  useEffect(() => { void carregar(); }, [carregar]);

  const carregarMais = async () => {
    setCarregandoMais(true);
    try {
      const proxima = await apiService.listarComunicacoesReversa({ status, evento, canal, limite: PAGINA, deslocamento: itens.length });
      setItens((atuais) => [...atuais, ...proxima]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível carregar mais comunicações.');
    } finally {
      setCarregandoMais(false);
    }
  };

  const alternar = async (item: ComunicacaoReversa) => {
    if (expandida === item.id) { setExpandida(null); return; }
    setExpandida(item.id);
    setHistoricos((atuais) => ({ ...atuais, [item.id]: 'carregando' }));
    try {
      const historico = await apiService.historicoComunicacaoReversa(item.id);
      setHistoricos((atuais) => ({ ...atuais, [item.id]: historico }));
    } catch {
      setHistoricos((atuais) => ({ ...atuais, [item.id]: 'erro' }));
    }
  };

  const aposReconciliar = () => {
    const id = dialogo?.comunicacao.id;
    setDialogo(null);
    if (id) setHistoricos((atuais) => { const { [id]: _removido, ...resto } = atuais; return resto; });
    void carregar();
  };

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return termo ? itens.filter((item) => item.pedido.toLowerCase().includes(termo) || item.destinatario_nome.toLowerCase().includes(termo)) : itens;
  }, [itens, busca]);

  const statusExistentes = Object.keys(resumo).sort();

  return (
    <div className="space-y-6">
      <PageHeading
        icon={MessageSquareWarning}
        title="Comunicações"
        description="A aceitação pelo SMTP ou a ação de um conector não comprovam entrega nem leitura."
        action={<button type="button" className="btn btn-secondary" onClick={() => void carregar()} disabled={carregando}><RefreshCw className="w-4 h-4" aria-hidden="true" />Atualizar</button>}
      />

      {statusExistentes.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Resumo por situação">
          {statusExistentes.map((situacao) => (
            <li key={situacao}>
              <button type="button" onClick={() => setStatus(status === situacao ? '' : situacao)} aria-pressed={status === situacao}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${status === situacao ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700'}`}>
                {STATUS_COMUNICACAO_LABEL[situacao] ?? situacao}
                <strong>{resumo[situacao]}</strong>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-end gap-4" role="search" aria-label="Filtros de comunicações">
        <div className="flex flex-col">
          <label htmlFor="com-status" className={labelCls}>Situação</label>
          <select id="com-status" className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(STATUS_COMUNICACAO_LABEL).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label htmlFor="com-evento" className={labelCls}>Evento</label>
          <select id="com-evento" className={inputCls} value={evento} onChange={(e) => setEvento(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(EVENTO_COMUNICACAO_LABEL).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label htmlFor="com-canal" className={labelCls}>Canal</label>
          <select id="com-canal" className={inputCls} value={canal} onChange={(e) => setCanal(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(CANAL_COMUNICACAO_LABEL).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label htmlFor="com-busca" className={labelCls}>Pedido ou destinatário (na lista carregada)</label>
          <input id="com-busca" type="search" className={inputCls} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="RV-… ou nome" />
        </div>
      </div>

      {erro && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{erro}</span>
          <button type="button" className="btn btn-secondary" onClick={() => void carregar()}>Tentar novamente</button>
        </div>
      )}

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        O canal Teams aguarda definição da integração substituta. Essas pendências não são enviadas nem convertidas em e-mail.
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {carregando ? (
          <div className="flex items-center justify-center py-16" role="status" aria-label="Carregando comunicações"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : visiveis.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">Nenhuma comunicação encontrada para este filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[880px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['', 'Pedido', 'Evento', 'Destinatário', 'Canal', 'Situação', 'Tentativas', 'Atualizada', 'Ação'].map((titulo) => (
                    <th key={titulo || 'expandir'} scope="col" className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{titulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visiveis.map((item) => {
                  const aberta = expandida === item.id;
                  const historico = historicos[item.id];
                  return (
                    <Fragment key={item.id}>
                      <tr className="hover:bg-slate-50/80">
                        <td className="px-3 py-3">
                          <button type="button" onClick={() => void alternar(item)} aria-expanded={aberta} aria-label={`Detalhes de ${item.pedido}, ${EVENTO_COMUNICACAO_LABEL[item.evento] ?? item.evento}`} className="p-1 text-slate-500">
                            {aberta ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-sm font-medium text-slate-900 whitespace-nowrap">{item.pedido}<span className="block text-xs font-normal text-slate-500">{item.empresa}</span></td>
                        <td className="px-3 py-3 text-sm text-slate-700">{EVENTO_COMUNICACAO_LABEL[item.evento] ?? item.evento}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">{item.destinatario_nome}<span className="block text-xs text-slate-500">{item.destinatario_email ?? 'sem e-mail'}</span></td>
                        <td className="px-3 py-3 text-sm text-slate-700">{CANAL_COMUNICACAO_LABEL[item.canal] ?? item.canal}</td>
                        <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${classeSituacao(item.status)}`}>{STATUS_COMUNICACAO_LABEL[item.status] ?? item.status}</span></td>
                        <td className="px-3 py-3 text-sm text-slate-700">{item.tentativas}/{item.max_tentativas}</td>
                        <td className="px-3 py-3 text-sm text-slate-700 whitespace-nowrap">{formatarDataHora(item.atualizado_em)}</td>
                        <td className="px-3 py-3">
                          {item.status === STATUS_INDETERMINADO ? (
                            <div className="flex flex-wrap gap-2">
                              <button type="button" className="btn btn-secondary btn-xs" onClick={() => setDialogo({ comunicacao: item, acao: 'confirmar_conclusao_conector' })}>Confirmar conclusão</button>
                              <button type="button" className="btn btn-secondary btn-xs" onClick={() => setDialogo({ comunicacao: item, acao: 'autorizar_nova_tentativa' })}>Autorizar nova tentativa</button>
                            </div>
                          ) : <span className="text-xs text-slate-400">—</span>}
                        </td>
                      </tr>
                      {aberta && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={9} className="px-6 py-4 space-y-4">
                            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                              <div><dt className="text-xs text-slate-500">Identificador de correlação</dt><dd className="font-mono text-xs text-slate-800 break-all">{item.id}</dd></div>
                              <div><dt className="text-xs text-slate-500">Registrada em</dt><dd>{formatarDataHora(item.criado_em)}</dd></div>
                              <div><dt className="text-xs text-slate-500">Próxima tentativa</dt><dd>{formatarDataHora(item.proxima_tentativa_em)}</dd></div>
                              <div><dt className="text-xs text-slate-500">Resultado externo confirmado em</dt><dd>{formatarDataHora(item.acao_conector_em)}</dd></div>
                              <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Último erro (sanitizado)</dt><dd>{item.ultimo_erro || '—'}</dd></div>
                            </dl>
                            {historico === 'carregando' || historico === undefined ? (
                              <p className="text-sm text-slate-500" role="status">Carregando histórico…</p>
                            ) : historico === 'erro' ? (
                              <p role="alert" className="text-sm text-red-700">Não foi possível carregar o histórico desta comunicação.</p>
                            ) : <Historico historico={historico} />}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!carregando && itens.length < total && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <span>{itens.length} de {total} comunicações</span>
            <button type="button" className="btn btn-secondary" onClick={() => void carregarMais()} disabled={carregandoMais}>
              {carregandoMais && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}Carregar mais
            </button>
          </div>
        )}
      </div>

      {dialogo && <DialogoReconciliacao comunicacao={dialogo.comunicacao} acao={dialogo.acao} onCancelar={() => setDialogo(null)} onConcluir={aposReconciliar} />}
    </div>
  );
}
