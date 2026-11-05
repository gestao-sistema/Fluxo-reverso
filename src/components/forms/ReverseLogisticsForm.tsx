// ── Formulário Base de Logística Reversa ─────────────────────────────────────
//
// Componente reutilizável que adapta identidade visual e listas de opções
// conforme a prop `empresa`. O visual segue o tema da página (Alinare ou Novitah).
//
// Cronômetro silencioso: captura o timestamp de montagem e calcula
// `tempo_preenchimento_segundos` no momento do submit — sem exibir ao usuário.
//
// A NC de origem é opcional. Quando aberto a partir da NC (?nc=<id>), o campo
// vem selecionado e volta para a NC depois de enviar.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import DatePicker, { registerLocale } from 'react-datepicker';
import { ptBR } from 'date-fns/locale/pt-BR';
import toast from 'react-hot-toast';
import { Loader2, CalendarDays, Send, ShieldAlert } from 'lucide-react';

import 'react-datepicker/dist/react-datepicker.css';

import { formSchema, type FormData } from '../../schemas/formSchema';
import { MOTIVOS, MOTIVO_CLIENTES_TROCADOS, SETORES, STATUS_LABEL, type Empresa, type NcOpcaoReversa, type StatusSolicitacao } from '../../types';
import apiService from '../../services/apiService';
import ncService from '../../services/ncService';
import { useAuth } from '../../context/AuthContext';
import { formatarDataBr } from '../../lib/ncCalculos';
import LeitorEtiqueta from './LeitorEtiqueta';
import type { CamposEtiqueta } from '../../lib/etiquetaPdf';
import { statusEfetivo } from '../../lib/situacaoPedido';

import alinareLogoSrc from '../../assets/alinare_logo.jpg';
import novitahLogoSrc from '../../assets/novitah_logo.jpg';

// Registra localização pt-BR para o DatePicker
registerLocale('pt-BR', ptBR);

// ── Identidade por empresa ────────────────────────────────────────────────────
// Cores e materiais vêm do tema da página (a rota da empresa define o tema);
// aqui fica só o logo oficial. O anel de foco usa a paleta remapeada (destaque).
const TEMA = {
  Alinare: { logo: alinareLogoSrc, logoAlt: 'Logotipo Alinare' },
  Novitah: { logo: novitahLogoSrc, logoAlt: 'Logotipo Novitah' },
} as const;
const FOCO = 'focus:ring-blue-500/30';

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

// ── Classes reutilizáveis ─────────────────────────────────────────────────────
const inputBase =
  'w-full h-11 px-4 rounded-lg border bg-white text-sm text-slate-900 ' +
  'placeholder:text-slate-400 transition-colors duration-150 ' +
  'focus:outline-none focus:ring-2 focus:ring-offset-0 focus:border-transparent ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const labelBase = 'block text-sm font-medium text-slate-700 mb-1.5';
const errorBase = 'mt-1.5 text-xs text-red-600';
const STATUS_EM_ABERTO: StatusSolicitacao[] = ['aguardando_aprovacao', 'pendente', 'etiqueta_gerada', 'postado', 'em_transito'];

// ── Props do componente ───────────────────────────────────────────────────────
interface ReverseLogisticsFormProps {
  empresa: Empresa;
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function ReverseLogisticsForm({ empresa }: ReverseLogisticsFormProps) {
  const tema = TEMA[empresa];
  const setores = SETORES_POR_EMPRESA[empresa];
  const { user } = useAuth();

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Aberto a partir de uma NC (botão "Gerar reversa")
  const ncDaUrl = searchParams.get('nc') ?? '';
  const [opcoesNc, setOpcoesNc] = useState<NcOpcaoReversa[]>([]);
  const [carregandoNcs, setCarregandoNcs] = useState(true);
  const [historicoCliente, setHistoricoCliente] = useState<Awaited<ReturnType<typeof apiService.getHistoricoCliente>>>([]);
  const [carregandoHistoricoCliente, setCarregandoHistoricoCliente] = useState(false);
  const [erroHistoricoCliente, setErroHistoricoCliente] = useState(false);
  const [etiquetaAguardandoConferencia, setEtiquetaAguardandoConferencia] = useState(false);
  const [etiquetaEmLeitura, setEtiquetaEmLeitura] = useState(false);
  const [chaveLeitorEtiqueta, setChaveLeitorEtiqueta] = useState(0);
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

  const aplicarCamposEtiqueta = (campos: CamposEtiqueta) => {
    if (campos.nome_cliente) setValue('nome_cliente', campos.nome_cliente, { shouldValidate: true });
    if (campos.endereco_postagem) setValue('endereco_postagem', campos.endereco_postagem, { shouldValidate: true });
    if (campos.numero_endereco) setValue('numero_endereco', campos.numero_endereco, { shouldValidate: true });
    if (campos.cep) {
      cepRequestRef.current += 1;
      setBuscandoCep(false);
      setErroCep('');
      setCep(campos.cep);
    }
    setEtiquetaAguardandoConferencia(true);
  };

  // NCs abertas da empresa que podem originar a reversa
  useEffect(() => {
    let ativo = true;
    setCarregandoNcs(true);
    ncService
      .opcoesParaReversa(empresa)
      .then((opcoes) => {
        if (!ativo) return;
        setOpcoesNc(opcoes);
        // NC da URL encerrada, cancelada ou de outra empresa: não fica pré-selecionada
        if (ncDaUrl && !opcoes.some((o) => o.id === ncDaUrl)) setValue('nc_id', '');
      })
      .catch(() => { if (ativo) setOpcoesNc([]); })
      .finally(() => { if (ativo) setCarregandoNcs(false); });
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
    if (etiquetaEmLeitura) {
      toast.error('Aguarde a leitura da etiqueta terminar.');
      return;
    }
    if (etiquetaAguardandoConferencia) {
      toast.error('Confira os dados preenchidos pela etiqueta antes de enviar.');
      return;
    }
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
      setEtiquetaAguardandoConferencia(false);
      setChaveLeitorEtiqueta((atual) => atual + 1);
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="form-view w-full h-full sm:py-2">
      <div className="max-w-[830px] mx-auto">

        {/* Card do formulário */}
        <div className={`form-card bg-white sm:rounded-2xl shadow-sm border-0 sm:border border-slate-200 overflow-hidden`}>

          {/* ── Header com identidade visual da empresa ── */}
          <div className={`form-header px-5 sm:px-8 py-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5`}>
            <img
              src={tema.logo}
              alt={tema.logoAlt}
              className="h-12 sm:h-14 w-auto"
            />
            <div>
              <h1>
                Novo pedido
              </h1>
            </div>
          </div>

          {/* ── Corpo do formulário ── */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            aria-label={`Formulário de logística reversa ${empresa}`}
            className="px-5 sm:px-8 py-6 sm:py-8 space-y-6"
          >

            {/* NC de origem — vínculo opcional; quando selecionada, deve ser da mesma empresa e estar aberta */}
            <div>
              <label htmlFor="nc_id" className={labelBase}>
                <ShieldAlert className="inline w-4 h-4 mr-1.5 -mt-0.5 opacity-60" />
                NC de origem <span className="text-slate-400 font-normal">(opcional)</span>
              </label>
              {carregandoNcs ? (
                <p className="text-sm text-slate-400">Carregando opções de vínculo (opcional)…</p>
              ) : (
                <select
                  id="nc_id"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.nc_id}
                  aria-describedby={errors.nc_id ? 'err-nc' : undefined}
                  className={`
                    ${inputBase} ${FOCO} cursor-pointer
                    ${errors.nc_id ? 'border-red-400' : 'border-slate-300'}
                  `}
                  {...register('nc_id')}
                >
                  <option value="">Sem NC vinculada</option>
                  {opcoesNc.map((o) => (
                    <option key={o.id} value={o.id}>
                      {`${o.codigo} · ${formatarDataBr(o.data_ocorrencia)} · ${o.cliente ?? 'cliente não informada'}${o.origem ? ` · ${o.origem}` : ''}`}
                    </option>
                  ))}
                </select>
              )}
              {errors.nc_id && (
                <p id="err-nc" className={errorBase} role="alert">
                  {errors.nc_id.message}
                </p>
              )}
            </div>

            {/* Data da solicitação */}
            <div>
              <label htmlFor="data_solicitacao" className={labelBase}>
                <CalendarDays className="inline w-4 h-4 mr-1.5 -mt-0.5 opacity-60" />
                Data da Solicitação <span className="text-red-500">*</span>
              </label>

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
                    onChange={(date: Date | null) =>
                      field.onChange(date ? dateToString(date) : '')
                    }
                    maxDate={new Date()}
                    className={`
                      ${inputBase}
                      ${FOCO}
                      ${errors.data_solicitacao ? 'border-red-400' : 'border-slate-300'}
                    `}
                    wrapperClassName="w-full"
                    aria-invalid={errors.data_solicitacao ? 'true' : 'false'}
                    aria-describedby={
                      errors.data_solicitacao ? 'err-data' : undefined
                    }
                    disabled={isSubmitting}
                  />
                )}
              />

              {errors.data_solicitacao && (
                <p id="err-data" className={errorBase} role="alert">
                  {errors.data_solicitacao.message}
                </p>
              )}
            </div>

            {/* Solicitante + Setor — 2 colunas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">

              {/* Solicitante */}
              <div className="relative">
                <label htmlFor="solicitante" className={labelBase}>
                  Solicitante <span className="text-red-500">*</span>
                </label>
                <input
                  id="solicitante"
                  type="text"
                  readOnly
                  value={user?.nome ?? ''}
                  aria-readonly="true"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.solicitante}
                  aria-describedby={errors.solicitante ? 'err-solicitante' : undefined}
                  title="Preenchido com o usuário autenticado"
                  className={`
                    ${inputBase} bg-slate-50 text-slate-600 cursor-not-allowed
                    ${errors.solicitante ? 'border-red-400' : 'border-slate-300'}
                  `}
                  {...register('solicitante')}
                />
                {errors.solicitante && (
                  <p id="err-solicitante" className={errorBase} role="alert">
                    {errors.solicitante.message}
                  </p>
                )}
              </div>

              {/* Setor */}
              <div>
                <label htmlFor="setor" className={labelBase}>
                  Setor <span className="text-red-500">*</span>
                </label>
                <select
                  id="setor"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.setor}
                  aria-describedby={errors.setor ? 'err-setor' : undefined}
                  className={`
                    ${inputBase} ${FOCO} cursor-pointer
                    ${errors.setor ? 'border-red-400' : 'border-slate-300'}
                  `}
                  {...register('setor')}
                >
                  <option value="" disabled>Selecione o setor</option>
                  {setores.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {errors.setor && (
                  <p id="err-setor" className={errorBase} role="alert">
                    {errors.setor.message}
                  </p>
                )}
              </div>
            </div>

            <LeitorEtiqueta
              key={chaveLeitorEtiqueta}
              disabled={isSubmitting}
              onAplicar={aplicarCamposEtiqueta}
              onConferencia={(confirmado) => setEtiquetaAguardandoConferencia(!confirmado)}
              onProcessamento={setEtiquetaEmLeitura}
            />

            {/* Código + Nome da cliente — 2 colunas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">

              {/* Código da cliente */}
              <div>
                <label htmlFor="codigo_cliente" className={labelBase}>
                  Código da Cliente <span className="text-red-500">*</span>
                </label>
                <input
                  id="codigo_cliente"
                  type="number"
                  inputMode="numeric"
                  placeholder="Ex: 10234"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.codigo_cliente}
                  aria-describedby={errors.codigo_cliente ? 'err-codigo' : undefined}
                  className={`
                    ${inputBase} ${FOCO}
                    ${errors.codigo_cliente ? 'border-red-400' : 'border-slate-300'}
                  `}
                  {...register('codigo_cliente', { valueAsNumber: true })}
                />
                {errors.codigo_cliente && (
                  <p id="err-codigo" className={errorBase} role="alert">
                    {errors.codigo_cliente.message}
                  </p>
                )}
              </div>

              {/* Nome da cliente */}
              <div>
                <label htmlFor="nome_cliente" className={labelBase}>
                  Nome da Cliente <span className="text-red-500">*</span>
                </label>
                <input
                  id="nome_cliente"
                  type="text"
                  autoComplete="off"
                  placeholder="Nome completo"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.nome_cliente}
                  aria-describedby={errors.nome_cliente ? 'err-nome' : undefined}
                  className={`
                    ${inputBase} ${FOCO}
                    ${errors.nome_cliente ? 'border-red-400' : 'border-slate-300'}
                  `}
                  {...register('nome_cliente')}
                />
                {errors.nome_cliente && (
                  <p id="err-nome" className={errorBase} role="alert">
                    {errors.nome_cliente.message}
                  </p>
                )}
              </div>
            </div>

            {(carregandoHistoricoCliente || historicoCliente.length > 0 || erroHistoricoCliente || (typeof codigoClienteAtual === 'number' && Number.isSafeInteger(codigoClienteAtual) && codigoClienteAtual > 0)) && (
              <section
                className={`rounded-xl border p-4 ${historicoCliente.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}
                aria-live="polite"
                aria-label="Histórico de solicitações da cliente"
              >
                {carregandoHistoricoCliente ? (
                  <p className="text-sm text-slate-600">Consultando histórico para este código de cliente…</p>
                ) : erroHistoricoCliente ? (
                  <p className="text-sm text-slate-600">Não foi possível consultar o histórico agora.</p>
                ) : (
                  <>
                    <p className={`text-sm font-semibold ${historicoCliente.length > 0 ? 'text-amber-950' : 'text-slate-800'}`}>
                      {historicoCliente.length
                        ? `Há ${historicoCliente.length} solicitação${historicoCliente.length === 1 ? '' : 'es'} de reverso registradas para esta cliente nesta empresa; ${solicitacoesAbertasDaCliente} em aberto.`
                        : 'Nenhuma solicitação anterior encontrada para este código nesta empresa.'}
                    </p>
                    {historicoCliente.length > 0 && <p className="mt-1 text-xs text-amber-900">Aviso para conferência: este histórico não impede um novo pedido.</p>}
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {historicoCliente.slice(0, 5).map((item) => (
                        <li key={item.id}>
                          {formatarDataBr(item.data_solicitacao)} · {STATUS_LABEL[statusEfetivo(item)]} · {item.motivo}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}

            {/* CEP, número e endereço preenchido automaticamente (editável) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              <div>
                <label htmlFor="cep-postagem" className={labelBase}>CEP</label>
                <div className="relative">
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
                    className={`${inputBase} ${FOCO} ${erroCep ? 'border-red-400' : 'border-slate-300'} pr-10`}
                  />
                  {buscandoCep && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" aria-label="Consultando CEP" />}
                </div>
                {erroCep && <p id="err-cep" className={errorBase} role="alert">{erroCep}</p>}
              </div>

              <div>
                <label htmlFor="numero_endereco" className={labelBase}>
                  Número <span className="text-red-500">*</span>
                </label>
                <input
                  id="numero_endereco"
                  type="text"
                  autoComplete="address-line2"
                  placeholder="Ex: 125 ou S/N"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.numero_endereco}
                  aria-describedby={errors.numero_endereco ? 'err-numero' : undefined}
                  className={`${inputBase} ${FOCO} ${errors.numero_endereco ? 'border-red-400' : 'border-slate-300'}`}
                  {...register('numero_endereco')}
                />
                {errors.numero_endereco && (
                  <p id="err-numero" className={errorBase} role="alert">{errors.numero_endereco.message}</p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="endereco_postagem" className={labelBase}>
                  Endereço <span className="text-red-500">*</span>
                </label>
                <input
                  id="endereco_postagem"
                  type="text"
                  autoComplete="street-address"
                  placeholder="Rua, bairro, cidade/UF — você pode editar"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.endereco_postagem}
                  aria-describedby={errors.endereco_postagem ? 'err-endereco' : undefined}
                  className={`${inputBase} ${FOCO} ${errors.endereco_postagem ? 'border-red-400' : 'border-slate-300'}`}
                  {...register('endereco_postagem')}
                />
                {errors.endereco_postagem && (
                  <p id="err-endereco" className={errorBase} role="alert">{errors.endereco_postagem.message}</p>
                )}
              </div>
            </div>

            {/* Motivo */}
            <div>
              <label htmlFor="motivo" className={labelBase}>
                Motivo <span className="text-red-500">*</span>
              </label>
              <select
                id="motivo"
                disabled={isSubmitting}
                aria-invalid={!!errors.motivo}
                aria-describedby={errors.motivo ? 'err-motivo' : undefined}
                className={`
                  ${inputBase} ${FOCO} cursor-pointer
                  ${errors.motivo ? 'border-red-400' : 'border-slate-300'}
                `}
                {...register('motivo')}
              >
                <option value="" disabled>Selecione o motivo</option>
                {MOTIVOS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              {errors.motivo && (
                <p id="err-motivo" className={errorBase} role="alert">
                  {errors.motivo.message}
                </p>
              )}
            </div>

            {exibirEnderecoDestino && (
              <section
                className={`space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5`}
                aria-labelledby="endereco-destino-troca-titulo"
              >
                <div>
                  <h2 id="endereco-destino-troca-titulo" className="text-sm font-semibold text-slate-800">
                    Endereço da outra cliente
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Informe para quem a mercadoria deverá ser enviada.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                  <div>
                    <label htmlFor="cep-destino-troca" className={labelBase}>CEP</label>
                    <div className="relative">
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
                        className={`${inputBase} ${FOCO} ${errors.cep_destino_troca || erroCepDestinoTroca ? 'border-red-400' : 'border-slate-300'} pr-10`}
                      />
                      {buscandoCepDestinoTroca && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" aria-label="Consultando CEP" />}
                    </div>
                    {(errors.cep_destino_troca || erroCepDestinoTroca) && (
                      <p id="err-cep-destino-troca" className={errorBase} role="alert">
                        {errors.cep_destino_troca?.message || erroCepDestinoTroca}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="numero_destino_troca" className={labelBase}>
                      Número <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="numero_destino_troca"
                      type="text"
                      autoComplete="address-line2"
                      placeholder="Ex: 125 ou S/N"
                      disabled={isSubmitting}
                      aria-invalid={!!errors.numero_destino_troca}
                      aria-describedby={errors.numero_destino_troca ? 'err-numero-destino-troca' : undefined}
                      className={`${inputBase} ${FOCO} ${errors.numero_destino_troca ? 'border-red-400' : 'border-slate-300'}`}
                      {...register('numero_destino_troca')}
                    />
                    {errors.numero_destino_troca && (
                      <p id="err-numero-destino-troca" className={errorBase} role="alert">
                        {errors.numero_destino_troca.message}
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="endereco_destino_troca" className={labelBase}>
                      Endereço <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="endereco_destino_troca"
                      type="text"
                      autoComplete="street-address"
                      placeholder="Rua, bairro, cidade/UF — você pode editar"
                      disabled={isSubmitting}
                      aria-invalid={!!errors.endereco_destino_troca}
                      aria-describedby={errors.endereco_destino_troca ? 'err-endereco-destino-troca' : undefined}
                      className={`${inputBase} ${FOCO} ${errors.endereco_destino_troca ? 'border-red-400' : 'border-slate-300'}`}
                      {...register('endereco_destino_troca')}
                    />
                    {errors.endereco_destino_troca && (
                      <p id="err-endereco-destino-troca" className={errorBase} role="alert">
                        {errors.endereco_destino_troca.message}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Justificativa "Outros" — visível condicionalmente */}
            {exibirJustificativa && (
              <div className="pt-1">
                <label htmlFor="justificativa_outros" className={labelBase}>
                  Justifique a opção "Outros"{' '}
                  <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="justificativa_outros"
                  rows={3}
                  placeholder="Descreva o motivo detalhadamente..."
                  disabled={isSubmitting}
                  aria-required={true}
                  aria-invalid={!!errors.justificativa_outros}
                  aria-describedby={
                    errors.justificativa_outros ? 'err-justificativa' : undefined
                  }
                  className={`
                    w-full px-4 py-3 rounded-lg border bg-white text-sm text-slate-900
                    placeholder:text-slate-400 resize-none transition-colors duration-150
                    focus:outline-none focus:ring-2 focus:ring-offset-0 focus:border-transparent
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${FOCO}
                    ${errors.justificativa_outros ? 'border-red-400' : 'border-slate-300'}
                  `}
                  {...register('justificativa_outros')}
                />
                {errors.justificativa_outros && (
                  <p id="err-justificativa" className={errorBase} role="alert">
                    {errors.justificativa_outros.message}
                  </p>
                )}
              </div>
            )}

            {/* Divider */}
            <hr className="border-slate-100" />

            {/* Botão de submit */}
            <button
              type="submit"
              disabled={isSubmitting || buscandoCep || buscandoCepDestinoTroca}
              className={`
                w-full h-12 rounded-lg font-semibold text-sm
                flex items-center justify-center gap-2
                transition-colors duration-150 cursor-pointer
                focus:outline-none focus:ring-2 focus:ring-offset-2
                disabled:opacity-60 disabled:cursor-not-allowed
                form-submit ${FOCO}
              `}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Enviando…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" aria-hidden="true" />
                  Enviar Solicitação
                </>
              )}
            </button>

          </form>
        </div>

      </div>
    </div>
  );
}
