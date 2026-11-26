// ── Formulário Base de Logística Reversa ─────────────────────────────────────
//
// Componente reutilizável que adapta identidade visual e listas de opções
// conforme a prop `empresa`. O visual segue o padrão da página (marca e tema em <html>).
//
// Cronômetro silencioso: captura o timestamp de montagem e calcula
// `tempo_preenchimento_segundos` no momento do submit — sem exibir ao usuário.
//
// A NC é vinculada automaticamente quando o formulário é aberto a partir dela (?nc=<id>)
// e o usuário volta para a NC depois de enviar.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import DatePicker, { registerLocale } from 'react-datepicker';
import { ptBR } from 'date-fns/locale/pt-BR';
import toast from 'react-hot-toast';
import { Check, CircleAlert, Loader2, CalendarDays, Send } from 'lucide-react';

import 'react-datepicker/dist/react-datepicker.css';

import { formSchema, type FormData } from '../../schemas/formSchema';
import { MOTIVOS, MOTIVO_CLIENTES_TROCADOS, SETORES, STATUS_LABEL, type Empresa, type NcOpcaoReversa, type StatusSolicitacao } from '../../types';
import apiService from '../../services/apiService';
import ncService from '../../services/ncService';
import { useAuth } from '../../context/AuthContext';
import { formatarDataBr } from '../../lib/ncCalculos';
import { statusEfetivo } from '../../lib/situacaoPedido';

// Registra localização pt-BR para o DatePicker
registerLocale('pt-BR', ptBR);

// ── Setores filtrados por empresa ─────────────────────────────────────────────
const SETORES_POR_EMPRESA: Record<Empresa, typeof SETORES[number][]> = {
  Alinare: ['Comercial Alinare', 'Financeiro', 'Assistência Técnica', 'Expedição'],
  Novitah: ['Comercial Novitah', 'Financeiro', 'Assistência Técnica', 'Expedição'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Formata Date para YYYY-MM-DD sem conversão de fuso */
const dateToString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Converte YYYY-MM-DD para objeto Date no fuso local */
const stringToDate = (str: string): Date | null => {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// ── Mensagem de erro de campo (padrão visual, seção 14.1) ─────────────────────
function MensagemErro({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="error-msg" role="alert">
      <CircleAlert size={14} aria-hidden="true" />
      {children}
    </p>
  );
}

const STATUS_EM_ABERTO: StatusSolicitacao[] = ['aguardando_aprovacao', 'pendente', 'etiqueta_gerada', 'postado', 'em_transito'];

// ── Props do componente ───────────────────────────────────────────────────────
interface ReverseLogisticsFormProps {
  empresa: Empresa;
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function ReverseLogisticsForm({ empresa }: ReverseLogisticsFormProps) {
  const setores = SETORES_POR_EMPRESA[empresa];
  const { user } = useAuth();

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Aberto a partir de uma NC (botão "Gerar reversa")
  const ncDaUrl = searchParams.get('nc') ?? '';
  const [opcoesNc, setOpcoesNc] = useState<NcOpcaoReversa[]>([]);
  const [historicoCliente, setHistoricoCliente] = useState<Awaited<ReturnType<typeof apiService.getHistoricoCliente>>>([]);
  const [carregandoHistoricoCliente, setCarregandoHistoricoCliente] = useState(false);
  const [erroHistoricoCliente, setErroHistoricoCliente] = useState(false);
  const [cep, setCep] = useState('');
  const [erroCep, setErroCep] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);
  const cepRequestRef = useRef(0);
  const [cepDestinoTroca, setCepDestinoTroca] = useState('');
  const [erroCepDestinoTroca, setErroCepDestinoTroca] = useState('');
  const [buscandoCepDestinoTroca, setBuscandoCepDestinoTroca] = useState(false);
  const cepDestinoRequestRef = useRef(0);

  // Cronômetro: registra o instante da primeira interação
  const startTimeRef = useRef<number | null>(null);

  // Escuta primeiro input ou focusin para iniciar o cronômetro
  useEffect(() => {
    const handleInteraction = () => {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
    };

    // Anexa window para pegar qualquer interação antes mesmo do render completo
    // ou do form-wrapper, caso prefira pegar no form mude o ref pro form
    window.addEventListener('input', handleInteraction, { once: true });
    window.addEventListener('focusin', handleInteraction, { once: true });

    return () => {
      window.removeEventListener('input', handleInteraction);
      window.removeEventListener('focusin', handleInteraction);
    };
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nc_id: ncDaUrl,
      data_solicitacao: dateToString(new Date()),
      solicitante: user?.nome ?? '',
      setor: undefined,
      codigo_cliente: undefined,
      nome_cliente: '',
      endereco_postagem: '',
      numero_endereco: '',
      cep_destino_troca: '',
      numero_destino_troca: '',
      endereco_destino_troca: '',
      motivo: undefined,
      justificativa_outros: '',
    },
  });
  useEffect(() => {
    if (user?.nome) setValue('solicitante', user.nome, { shouldValidate: true });
  }, [user?.nome, setValue]);

  // Observa o campo motivo para exibição condicional da justificativa
  const motivoAtual = watch('motivo');
  const codigoClienteAtual = watch('codigo_cliente');
  const exibirJustificativa = motivoAtual === 'Outros';
  const exibirEnderecoDestino = motivoAtual === MOTIVO_CLIENTES_TROCADOS;

  useEffect(() => {
    const codigoConsulta = typeof codigoClienteAtual === 'number' ? codigoClienteAtual : Number.NaN;
    if (!Number.isSafeInteger(codigoConsulta) || codigoConsulta <= 0) {
      setHistoricoCliente([]);
      setCarregandoHistoricoCliente(false);
      setErroHistoricoCliente(false);
      return;
    }

    let ativo = true;
    setHistoricoCliente([]);
    setCarregandoHistoricoCliente(true);
    setErroHistoricoCliente(false);
    const temporizador = window.setTimeout(() => {
      apiService.getHistoricoCliente(empresa, codigoConsulta)
        .then((historico) => { if (ativo) setHistoricoCliente(historico); })
        .catch(() => { if (ativo) { setHistoricoCliente([]); setErroHistoricoCliente(true); } })
        .finally(() => { if (ativo) setCarregandoHistoricoCliente(false); });
    }, 300);

    return () => { ativo = false; window.clearTimeout(temporizador); };
  }, [codigoClienteAtual, empresa]);

  const solicitacoesAbertasDaCliente = historicoCliente.filter((item) => STATUS_EM_ABERTO.includes(item.status)).length;

  // NCs abertas da empresa que podem originar a reversa
  useEffect(() => {
    let ativo = true;
    ncService
      .opcoesParaReversa(empresa)
      .then((opcoes) => {
        if (!ativo) return;
        setOpcoesNc(opcoes);
        // NC da URL encerrada, cancelada ou de outra empresa: não fica pré-selecionada
        if (ncDaUrl && !opcoes.some((o) => o.id === ncDaUrl)) setValue('nc_id', '');
      })
      .catch(() => { if (ativo) setOpcoesNc([]); });
    return () => { ativo = false; };
  }, [empresa, ncDaUrl, setValue]);

  const alterarCep = (valor: string, destinoTroca = false) => {
    const cepLimpo = valor.replace(/\D/g, '').slice(0, 8);
    const atualizarCep = destinoTroca ? setCepDestinoTroca : setCep;
    const atualizarErro = destinoTroca ? setErroCepDestinoTroca : setErroCep;
    const atualizarBusca = destinoTroca ? setBuscandoCepDestinoTroca : setBuscandoCep;
    const requestRef = destinoTroca ? cepDestinoRequestRef : cepRequestRef;
    atualizarCep(cepLimpo);
    atualizarErro('');
    if (destinoTroca) setValue('cep_destino_troca', cepLimpo, { shouldValidate: true });
    const requestId = ++requestRef.current;

    if (cepLimpo.length !== 8) {
      atualizarBusca(false);
      return;
    }

    atualizarBusca(true);
    fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Falha na consulta');
        return response.json();
      })
      .then((resultado) => {
        if (requestId !== requestRef.current) return;
        if (resultado.erro) {
          atualizarErro('CEP não encontrado. Confira os números ou edite o endereço manualmente.');
          return;
        }
        const cidadeUf = [resultado.localidade, resultado.uf].filter(Boolean).join('/');
        const partes = [resultado.logradouro, resultado.bairro, cidadeUf].filter(Boolean);
        if (partes.length) {
          if (destinoTroca) {
            setValue('endereco_destino_troca', partes.join(', '), { shouldValidate: true });
          } else {
            setValue('endereco_postagem', partes.join(', '), { shouldValidate: true });
          }
        }
      })
      .catch(() => {
        if (requestId === requestRef.current) {
          atualizarErro('Não foi possível consultar o CEP. Você pode preencher o endereço manualmente.');
        }
      })
      .finally(() => {
        if (requestId === requestRef.current) atualizarBusca(false);
      });
  };

  // Reaproveita a cliente da NC se o campo ainda estiver vazio
  const ncSelecionada = opcoesNc.find((o) => o.id === watch('nc_id')) ?? null;
  useEffect(() => {
    if (ncSelecionada?.cliente && !getValues('nome_cliente')) {
      setValue('nome_cliente', ncSelecionada.cliente);
    }
  }, [ncSelecionada, getValues, setValue]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const onSubmit = async (data: FormData) => {
    if (!user) {
      toast.error('Entre no sistema para enviar uma solicitação.');
      return;
    }
    if (cep && cep.length !== 8) {
      setErroCep('Digite os 8 números do CEP ou deixe o campo vazio.');
      return;
    }
    setIsSubmitting(true);

    // Calcula segundos desde a primeira interação, protegendo contra relógio alterado
    let tempoSegundos = startTimeRef.current
      ? Math.floor((Date.now() - startTimeRef.current) / 1000)
      : 0; // fallback se submeteu sem interagir

    // Impede tempo negativo e capa em 24h (86400s) para não distorcer KPIs se largar a aba aberta
    tempoSegundos = Math.max(0, Math.min(tempoSegundos, 86400));

    try {
      await apiService.createSolicitacao({
        nc_id: data.nc_id || null,
        empresa,
        data_solicitacao: data.data_solicitacao,
        solicitante: user.nome,
        setor: data.setor,
        codigo_cliente: data.codigo_cliente,
        nome_cliente: data.nome_cliente,
        endereco_postagem: `${data.endereco_postagem.trim()}, ${data.numero_endereco.trim()}${cep ? `, CEP ${cep.slice(0, 5)}-${cep.slice(5)}` : ''}`,
        endereco_destino_troca: exibirEnderecoDestino
          ? `${data.endereco_destino_troca?.trim()}, ${data.numero_destino_troca?.trim()}${cepDestinoTroca ? `, CEP ${cepDestinoTroca.slice(0, 5)}-${cepDestinoTroca.slice(5)}` : ''}`
          : null,
        motivo: data.motivo,
        justificativa_outros: exibirJustificativa
          ? (data.justificativa_outros ?? null)
          : null,
        autorizacao: null,
        status: 'aguardando_aprovacao',
        tempo_preenchimento_segundos: tempoSegundos,
      });

      toast.success('Solicitação enviada com sucesso!');
      cepRequestRef.current += 1;
      cepDestinoRequestRef.current += 1;
      setBuscandoCep(false);
      setBuscandoCepDestinoTroca(false);
      // Veio da NC: volta para ela, onde a reversa aparece vinculada
      if (ncDaUrl) {
        navigate(data.nc_id ? `/admin/nc/${data.nc_id}` : '/admin/nc');
        return;
      }
      reset();
      setValue('solicitante', user.nome);
      setCep('');
      setErroCep('');
      setCepDestinoTroca('');
      setErroCepDestinoTroca('');
      // Reinicia o cronômetro para o próximo preenchimento, aguardando nova interação
      startTimeRef.current = null;
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? `Erro ao enviar solicitação: ${err.message}`
          : 'Erro ao enviar solicitação. Tente novamente.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Seções concluídas: o marcador numérico vira check (padrão visual, seção 14.3) ──
  const [dataSolicitacaoAtual, setorAtual, nomeClienteAtual, numeroAtual, enderecoAtual] = watch([
    'data_solicitacao', 'setor', 'nome_cliente', 'numero_endereco', 'endereco_postagem',
  ]);
  const secaoSolicitacaoCompleta = !!dataSolicitacaoAtual && !!setorAtual;
  const secaoClienteCompleta = typeof codigoClienteAtual === 'number' && Number.isFinite(codigoClienteAtual) && codigoClienteAtual > 0
    && !!nomeClienteAtual?.trim() && !!numeroAtual?.trim() && !!enderecoAtual?.trim();
  const secaoMotivoCompleta = !!motivoAtual;
  const marcador = (numero: number, completa: boolean) => (
    <span className={`step-num${completa ? ' done' : ''}`} aria-hidden="true">
      {completa ? <Check size={13} /> : numero}
    </span>
  );
  const mostrarHistorico = carregandoHistoricoCliente || historicoCliente.length > 0 || erroHistoricoCliente
    || (typeof codigoClienteAtual === 'number' && Number.isSafeInteger(codigoClienteAtual) && codigoClienteAtual > 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="form-view narrow-box">
      <header className="page-head">
        <div>
          <h1 className="page-title">Novo pedido</h1>
          <p className="page-sub">Solicitação de logística reversa · {empresa}</p>
        </div>
      </header>

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        aria-label={`Formulário de logística reversa ${empresa}`}
        className="card form-card"
      >
        {/* 1 · Solicitação */}
        <div className="form-section">
          <h3>{marcador(1, secaoSolicitacaoCompleta)} Solicitação</h3>
          <p className="section-desc">Quando e por quem o pedido está sendo aberto.</p>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="data_solicitacao">
                Data da Solicitação <span className="req" aria-hidden="true">*</span>
              </label>
              <div className="input-icon">
                <CalendarDays size={17} aria-hidden="true" />
                <Controller
                  name="data_solicitacao"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      id="data_solicitacao"
                      locale="pt-BR"
                      dateFormat="dd/MM/yyyy"
                      placeholderText="dd/mm/aaaa"
                      selected={stringToDate(field.value)}
                      onChange={(date: Date | null) => field.onChange(date ? dateToString(date) : '')}
                      maxDate={new Date()}
                      className="input"
                      wrapperClassName="w-full"
                      aria-invalid={errors.data_solicitacao ? 'true' : 'false'}
                      aria-required="true"
                      aria-describedby={errors.data_solicitacao ? 'err-data' : undefined}
                      disabled={isSubmitting}
                    />
                  )}
                />
              </div>
              {errors.data_solicitacao && <MensagemErro id="err-data">{errors.data_solicitacao.message}</MensagemErro>}
            </div>

            <div className="field">
              <label htmlFor="solicitante">
                Solicitante <span className="req" aria-hidden="true">*</span>
              </label>
              <input
                id="solicitante"
                type="text"
                readOnly
                value={user?.nome ?? ''}
                aria-readonly="true"
                aria-required="true"
                disabled={isSubmitting}
                aria-invalid={!!errors.solicitante}
                aria-describedby={errors.solicitante ? 'err-solicitante' : undefined}
                title="Preenchido com o usuário autenticado"
                className="input input-readonly"
                {...register('solicitante')}
              />
              {errors.solicitante && <MensagemErro id="err-solicitante">{errors.solicitante.message}</MensagemErro>}
            </div>

            <div className="field">
              <label htmlFor="setor">
                Setor <span className="req" aria-hidden="true">*</span>
              </label>
              <select
                id="setor"
                disabled={isSubmitting}
                aria-required="true"
                aria-invalid={!!errors.setor}
                aria-describedby={errors.setor ? 'err-setor' : undefined}
                className="select"
                {...register('setor')}
              >
                <option value="" disabled>Selecione o setor</option>
                {setores.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {errors.setor && <MensagemErro id="err-setor">{errors.setor.message}</MensagemErro>}
            </div>
          </div>
        </div>

        {/* 2 · Cliente e endereço de postagem */}
        <div className="form-section">
          <h3>{marcador(2, secaoClienteCompleta)} Cliente</h3>
          <p className="section-desc">Quem enviará a mercadoria e de onde ela será postada.</p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="codigo_cliente">
                Código da Cliente <span className="req" aria-hidden="true">*</span>
              </label>
              <input
                id="codigo_cliente"
                type="number"
                inputMode="numeric"
                placeholder="Ex: 10234"
                disabled={isSubmitting}
                aria-required="true"
                aria-invalid={!!errors.codigo_cliente}
                aria-describedby={errors.codigo_cliente ? 'err-codigo' : undefined}
                className="input num"
                {...register('codigo_cliente', { valueAsNumber: true })}
              />
              {errors.codigo_cliente && <MensagemErro id="err-codigo">{errors.codigo_cliente.message}</MensagemErro>}
            </div>

            <div className="field">
              <label htmlFor="nome_cliente">
                Nome da Cliente <span className="req" aria-hidden="true">*</span>
              </label>
              <input
                id="nome_cliente"
                type="text"
                autoComplete="off"
                placeholder="Nome completo"
                disabled={isSubmitting}
                aria-required="true"
                aria-invalid={!!errors.nome_cliente}
                aria-describedby={errors.nome_cliente ? 'err-nome' : undefined}
                className="input"
                {...register('nome_cliente')}
              />
              {errors.nome_cliente && <MensagemErro id="err-nome">{errors.nome_cliente.message}</MensagemErro>}
            </div>

            {mostrarHistorico && (
              <section
                className={`banner full ${historicoCliente.length > 0 ? 'banner-warn' : 'banner-neutral'}`}
                aria-live="polite"
                aria-label="Histórico de solicitações da cliente"
                style={{ flexDirection: 'column', gap: 6 }}
              >
                {carregandoHistoricoCliente ? (
                  <p className="b-text">Consultando histórico para este código de cliente…</p>
                ) : erroHistoricoCliente ? (
                  <p className="b-text">Não foi possível consultar o histórico agora.</p>
                ) : (
                  <>
                    <p className="b-text strong">
                      {historicoCliente.length
                        ? `Há ${historicoCliente.length} solicitação${historicoCliente.length === 1 ? '' : 'es'} de reverso registradas para esta cliente nesta empresa; ${solicitacoesAbertasDaCliente} em aberto.`
                        : 'Nenhuma solicitação anterior encontrada para este código nesta empresa.'}
                    </p>
                    {historicoCliente.length > 0 && <p className="b-text small">Aviso para conferência: este histórico não impede um novo pedido.</p>}
                    {historicoCliente.length > 0 && (
                      <ul className="b-text xs" style={{ margin: 0, paddingLeft: 18 }}>
                        {historicoCliente.slice(0, 5).map((item) => (
                          <li key={item.id}>
                            {formatarDataBr(item.data_solicitacao)} · {STATUS_LABEL[statusEfetivo(item)]} · {item.motivo}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </section>
            )}

            <div className="field">
              <label htmlFor="cep-postagem">CEP</label>
              <div className="input-icon">
                <input
                  id="cep-postagem"
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="00000-000"
                  value={cep.length > 5 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep}
                  onChange={(event) => alterarCep(event.currentTarget.value)}
                  disabled={isSubmitting}
                  aria-invalid={!!erroCep}
                  aria-describedby={erroCep ? 'err-cep' : undefined}
                  className="input num"
                  style={{ paddingLeft: 14, paddingRight: 42 }}
                />
                {buscandoCep && (
                  <span className="trail" style={{ right: 14 }}>
                    <Loader2 size={16} className="spin" style={{ color: 'var(--text-subtle)' }} aria-label="Consultando CEP" />
                  </span>
                )}
              </div>
              {erroCep && <MensagemErro id="err-cep">{erroCep}</MensagemErro>}
            </div>

            <div className="field">
              <label htmlFor="numero_endereco">
                Número <span className="req" aria-hidden="true">*</span>
              </label>
              <input
                id="numero_endereco"
                type="text"
                autoComplete="address-line2"
                placeholder="Ex: 125 ou S/N"
                disabled={isSubmitting}
                aria-required="true"
                aria-invalid={!!errors.numero_endereco}
                aria-describedby={errors.numero_endereco ? 'err-numero' : undefined}
                className="input"
                {...register('numero_endereco')}
              />
              {errors.numero_endereco && <MensagemErro id="err-numero">{errors.numero_endereco.message}</MensagemErro>}
            </div>

            <div className="field full">
              <label htmlFor="endereco_postagem">
                Endereço <span className="req" aria-hidden="true">*</span>
              </label>
              <input
                id="endereco_postagem"
                type="text"
                autoComplete="street-address"
                placeholder="Rua, bairro, cidade/UF — você pode editar"
                disabled={isSubmitting}
                aria-required="true"
                aria-invalid={!!errors.endereco_postagem}
                aria-describedby={errors.endereco_postagem ? 'err-endereco' : undefined}
                className="input"
                {...register('endereco_postagem')}
              />
              <span className="help">Preenchido pelo CEP; confira e ajuste se precisar.</span>
              {errors.endereco_postagem && <MensagemErro id="err-endereco">{errors.endereco_postagem.message}</MensagemErro>}
            </div>
          </div>
        </div>

        {/* 3 · Motivo */}
        <div className="form-section">
          <h3>{marcador(3, secaoMotivoCompleta)} Pedido</h3>
          <p className="section-desc">O que motivou a reversa.</p>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="motivo">
                Motivo <span className="req" aria-hidden="true">*</span>
              </label>
              <select
                id="motivo"
                disabled={isSubmitting}
                aria-required="true"
                aria-invalid={!!errors.motivo}
                aria-describedby={errors.motivo ? 'err-motivo' : undefined}
                className="select"
                {...register('motivo')}
              >
                <option value="" disabled>Selecione o motivo</option>
                {MOTIVOS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              {errors.motivo && <MensagemErro id="err-motivo">{errors.motivo.message}</MensagemErro>}
            </div>

            {exibirEnderecoDestino && (
              <section className="subsecao full" aria-labelledby="endereco-destino-troca-titulo">
                <div style={{ marginBottom: 14 }}>
                  <h4 id="endereco-destino-troca-titulo" className="strong">Endereço da outra cliente</h4>
                  <p className="small muted" style={{ marginTop: 2 }}>Informe para quem a mercadoria deverá ser enviada.</p>
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="cep-destino-troca">CEP</label>
                    <div className="input-icon">
                      <input
                        id="cep-destino-troca"
                        type="text"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        placeholder="00000-000"
                        value={cepDestinoTroca.length > 5 ? `${cepDestinoTroca.slice(0, 5)}-${cepDestinoTroca.slice(5)}` : cepDestinoTroca}
                        onChange={(event) => alterarCep(event.currentTarget.value, true)}
                        disabled={isSubmitting}
                        aria-invalid={!!errors.cep_destino_troca || !!erroCepDestinoTroca}
                        aria-describedby={errors.cep_destino_troca || erroCepDestinoTroca ? 'err-cep-destino-troca' : undefined}
                        className="input num"
                        style={{ paddingLeft: 14, paddingRight: 42 }}
                      />
                      {buscandoCepDestinoTroca && (
                        <span className="trail" style={{ right: 14 }}>
                          <Loader2 size={16} className="spin" style={{ color: 'var(--text-subtle)' }} aria-label="Consultando CEP" />
                        </span>
                      )}
                    </div>
                    {(errors.cep_destino_troca || erroCepDestinoTroca) && (
                      <MensagemErro id="err-cep-destino-troca">{errors.cep_destino_troca?.message || erroCepDestinoTroca}</MensagemErro>
                    )}
                  </div>

                  <div className="field">
                    <label htmlFor="numero_destino_troca">
                      Número <span className="req" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="numero_destino_troca"
                      type="text"
                      autoComplete="address-line2"
                      placeholder="Ex: 125 ou S/N"
                      disabled={isSubmitting}
                      aria-required="true"
                      aria-invalid={!!errors.numero_destino_troca}
                      aria-describedby={errors.numero_destino_troca ? 'err-numero-destino-troca' : undefined}
                      className="input"
                      {...register('numero_destino_troca')}
                    />
                    {errors.numero_destino_troca && <MensagemErro id="err-numero-destino-troca">{errors.numero_destino_troca.message}</MensagemErro>}
                  </div>

                  <div className="field full">
                    <label htmlFor="endereco_destino_troca">
                      Endereço <span className="req" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="endereco_destino_troca"
                      type="text"
                      autoComplete="street-address"
                      placeholder="Rua, bairro, cidade/UF — você pode editar"
                      disabled={isSubmitting}
                      aria-required="true"
                      aria-invalid={!!errors.endereco_destino_troca}
                      aria-describedby={errors.endereco_destino_troca ? 'err-endereco-destino-troca' : undefined}
                      className="input"
                      {...register('endereco_destino_troca')}
                    />
                    {errors.endereco_destino_troca && <MensagemErro id="err-endereco-destino-troca">{errors.endereco_destino_troca.message}</MensagemErro>}
                  </div>
                </div>
              </section>
            )}

            {/* Justificativa "Outros" — visível condicionalmente */}
            {exibirJustificativa && (
              <div className="field full">
                <label htmlFor="justificativa_outros">
                  Justifique a opção "Outros"{' '}
                  <span className="req" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="justificativa_outros"
                  rows={3}
                  placeholder="Descreva o motivo detalhadamente..."
                  disabled={isSubmitting}
                  aria-required={true}
                  aria-invalid={!!errors.justificativa_outros}
                  aria-describedby={errors.justificativa_outros ? 'err-justificativa' : undefined}
                  className="textarea"
                  {...register('justificativa_outros')}
                />
                {errors.justificativa_outros && <MensagemErro id="err-justificativa">{errors.justificativa_outros.message}</MensagemErro>}
              </div>
            )}
          </div>
        </div>

        {/* Ações: no celular ficam fixas na base, dentro do vidro (padrão visual, seção 14.5) */}
        <div className="form-actions sticky">
          <button
            type="submit"
            disabled={isSubmitting || buscandoCep || buscandoCepDestinoTroca}
            className="btn btn-primary"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={17} className="spin" aria-hidden="true" />
                Enviando…
              </>
            ) : (
              <>
                <Send size={17} aria-hidden="true" />
                Enviar Solicitação
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
