import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Eye, FileText, Paperclip, Upload } from 'lucide-react';
import apiService, { type MotivoReemissao } from '../../services/apiService';
import { arquivoPareceSerPdf } from '../../lib/arquivoPdf';
import type { ReversaEmissaoResumo, Solicitacao } from '../../types';
import EmissaoDatasResumo from './EmissaoDatasResumo';
import VisualizadorPdf from '../ui/VisualizadorPdf';
import { validarDatasEmissao } from '../../lib/emissaoDatas';

interface EtiquetaReversaProps {
  solicitacao: Solicitacao;
  podeEmitir: boolean;
  onAlterada: (atualizada: Solicitacao, emissaoRegistrada?: boolean) => void;
}

const MOTIVOS_REEMISSAO: Array<[MotivoReemissao, string]> = [
  ['vencida_sem_uso', 'Autorização vencida sem uso'],
  ['cliente_nao_recebeu', 'Cliente não recebeu ou perdeu a autorização'],
  ['dados_incorretos', 'Dados incorretos na emissão'],
  ['pdf_incorreto', 'PDF incorreto ou ilegível'],
  ['outro', 'Outro motivo'],
];

/** Confere o cabeçalho do arquivo. Se o navegador não deixar ler, a validação do tipo e do tamanho continua valendo. */
async function cabecalhoPdfInvalido(arquivo: File): Promise<boolean> {
  try {
    const inicio = await arquivo.slice(0, 1024).text();
    return !inicio.includes('%PDF-');
  } catch {
    return false;
  }
}

async function lerCodigos(arquivo: File): Promise<{ codigoAutorizacao?: string; codigoRastreio?: string }> {
  const { lerEtiquetaPdf } = await import('../../lib/etiquetaPdf');
  const leitura = await lerEtiquetaPdf(arquivo, undefined, {
    camposNecessarios: ['codigo_autorizacao', 'codigo_rastreio'],
  });
  return {
    ...(leitura.campos.codigo_autorizacao ? { codigoAutorizacao: leitura.campos.codigo_autorizacao } : {}),
    ...(leitura.campos.codigo_rastreio ? { codigoRastreio: leitura.campos.codigo_rastreio } : {}),
  };
}

export default function EtiquetaReversa({ solicitacao, podeEmitir, onAlterada }: EtiquetaReversaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [emissao, setEmissao] = useState<ReversaEmissaoResumo | null>(null);
  const [carregandoEmissao, setCarregandoEmissao] = useState(true);
  // O PDF abre no visualizador em popup, sem nova aba
  const [visualizandoPdf, setVisualizandoPdf] = useState(false);
  const [erroConsultaEmissao, setErroConsultaEmissao] = useState('');
  const [tentativaConsultaEmissao, setTentativaConsultaEmissao] = useState(0);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [emissaoId, setEmissaoId] = useState<string | null>(null);
  const [codigoAutorizacao, setCodigoAutorizacao] = useState('');
  const [codigoRastreio, setCodigoRastreio] = useState('');
  const [emitidaEm, setEmitidaEm] = useState('');
  const [validaAte, setValidaAte] = useState('');
  const [motivo, setMotivo] = useState<MotivoReemissao | ''>('');
  const [motivoDetalhe, setMotivoDetalhe] = useState('');
  const [lendoPdf, setLendoPdf] = useState(false);
  const [erroLeitura, setErroLeitura] = useState('');
  const [salvando, setSalvando] = useState(false);
  const salvandoRef = useRef(false);
  const [erroAnexo, setErroAnexo] = useState('');
  const [editandoCodigos, setEditandoCodigos] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCarregandoEmissao(true);
    setEmissao(null);
    setErroConsultaEmissao('');
    void apiService.getEmissaoAtual(solicitacao.id)
      .then((atual) => { if (!cancelado) { setEmissao(atual); setErroConsultaEmissao(''); } })
      .catch((erro) => {
        if (!cancelado) setErroConsultaEmissao(erro instanceof Error ? erro.message : 'Não foi possível consultar a emissão vigente.');
      })
      .finally(() => { if (!cancelado) setCarregandoEmissao(false); });
    return () => { cancelado = true; };
  }, [solicitacao.id, tentativaConsultaEmissao]);

  const aprovado = solicitacao.aprovacao_status === 'aprovada' || solicitacao.aprovacao_legada === true;
  const temEmissaoAtual = !!emissao && !emissao.substituida_em;
  const precisaReemitir = !!emissao?.pdf_path;
  const podeRegistrar = podeEmitir && aprovado && !carregandoEmissao && !erroConsultaEmissao
    && (solicitacao.status === 'pendente' || temEmissaoAtual || !!solicitacao.etiqueta_path);
  const caminhoEtiqueta = emissao?.pdf_path ?? solicitacao.etiqueta_path;
  const nomeEtiqueta = emissao?.pdf_nome ?? solicitacao.etiqueta_nome ?? 'etiqueta.pdf';
  const autorizacaoAtual = emissao?.codigo_autorizacao ?? null;
  const rastreioAtual = emissao?.codigo_rastreio ?? solicitacao.codigo_rastreio ?? null;
  const erroDatas = validarDatasEmissao(emitidaEm || null, validaAte || null);


  const selecionarPdf = async (selecionado: File | undefined) => {
    if (!selecionado) return;
    if (inputRef.current) inputRef.current.value = '';
    setErroAnexo('');
    if (!podeRegistrar) {
      setErroAnexo(carregandoEmissao ? 'Aguarde um instante e escolha o PDF de novo.' : 'Não é possível anexar a etiqueta agora. Atualize a página e tente de novo.');
      return;
    }
    if (!arquivoPareceSerPdf(selecionado)) {
      setErroAnexo('Escolha um arquivo PDF.');
      return;
    }
    if (selecionado.size === 0) {
      setErroAnexo('O arquivo está vazio. Escolha outro PDF.');
      return;
    }
    if (selecionado.size > 5 * 1024 * 1024) {
      setErroAnexo('O PDF é maior que 5 MB. Escolha um arquivo menor.');
      return;
    }
    if (await cabecalhoPdfInvalido(selecionado)) {
      setErroAnexo('Este arquivo não parece ser um PDF válido. Escolha outro.');
      return;
    }

    setArquivo(selecionado);
    const recuperarEmissao = temEmissaoAtual && !emissao?.pdf_path;
    setEmissaoId(recuperarEmissao ? emissao.id : crypto.randomUUID());
    setCodigoAutorizacao(recuperarEmissao ? emissao.codigo_autorizacao ?? '' : '');
    setCodigoRastreio(recuperarEmissao ? emissao.codigo_rastreio ?? '' : '');
    setEmitidaEm(recuperarEmissao ? emissao.emitida_em ?? '' : '');
    setValidaAte(recuperarEmissao ? emissao.valida_ate ?? '' : '');
    setMotivo('');
    setMotivoDetalhe('');
    setErroLeitura('');
    setLendoPdf(true);
    try {
      const extraidos = await lerCodigos(selecionado);
      if (extraidos.codigoAutorizacao) setCodigoAutorizacao(extraidos.codigoAutorizacao);
      if (extraidos.codigoRastreio) setCodigoRastreio(extraidos.codigoRastreio);
    } catch {
      setErroLeitura('Não consegui ler os códigos do PDF. Preencha os campos.');
    } finally {
      setLendoPdf(false);
    }
  };

  const cancelarSelecao = () => {
    setArquivo(null);
    setEmissaoId(null);
    setCodigoAutorizacao('');
    setCodigoRastreio('');
    setEmitidaEm('');
    setValidaAte('');
    setMotivo('');
    setMotivoDetalhe('');
    setErroLeitura('');
    setErroAnexo('');
  };

  const confirmarEmissao = async () => {
    if (!arquivo || !emissaoId || salvandoRef.current) return;
    if (carregandoEmissao || erroConsultaEmissao) {
      setErroAnexo('Aguarde a conferência do pedido e confirme de novo.');
      return;
    }
    if (erroDatas) {
      setErroAnexo(erroDatas);
      return;
    }
    if (precisaReemitir && !motivo) {
      setErroAnexo('Selecione o motivo da reemissão.');
      return;
    }
    if (motivo === 'outro' && !motivoDetalhe.trim()) {
      setErroAnexo('Descreva o motivo da reemissão.');
      return;
    }

    salvandoRef.current = true;
    setErroAnexo('');
    setSalvando(true);
    try {
      const atualizada = await apiService.registrarEtiqueta(solicitacao, arquivo, {
        emissaoId,
        codigoAutorizacao: codigoAutorizacao.trim() || null,
        codigoRastreio: codigoRastreio.trim() || null,
        emitidaEm: emitidaEm || null,
        validaAte: validaAte || null,
        motivoReemissao: motivo || null,
        motivoDetalhe: motivoDetalhe.trim() || null,
      });
      onAlterada(atualizada, true);
      cancelarSelecao();
      setCarregandoEmissao(true);
      setErroConsultaEmissao('');
      try {
        setEmissao(await apiService.getEmissaoAtual(solicitacao.id));
      } catch (erroConsulta) {
        setErroConsultaEmissao(erroConsulta instanceof Error ? erroConsulta.message : 'Não foi possível consultar a emissão vigente.');
      } finally {
        setCarregandoEmissao(false);
      }
      toast.success('Etiqueta anexada.');
    } catch (erro) {
      // O erro fica ao lado do botão, com o PDF e os dados mantidos para uma nova tentativa.
      setErroAnexo(erro instanceof Error ? erro.message : 'Não foi possível anexar a etiqueta. Tente de novo.');
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
  };

  const salvarCodigos = async () => {
    if (!emissao) return;
    setSalvando(true);
    try {
      const atualizada = await apiService.atualizarDadosEmissao(emissao, {
        codigoAutorizacao: codigoAutorizacao.trim() || null,
        codigoRastreio: codigoRastreio.trim() || null,
        emitidaEm: emitidaEm || null,
        validaAte: validaAte || null,
      });
      setEmissao(atualizada);
      setEmitidaEm(atualizada.emitida_em ?? '');
      setValidaAte(atualizada.valida_ate ?? '');
      onAlterada({ ...solicitacao, codigo_rastreio: atualizada.codigo_rastreio }, false);
      setEditandoCodigos(false);
      toast.success('Dados da emissão atualizados.');
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível atualizar os dados da emissão.');
    } finally {
      setSalvando(false);
    }
  };

  const campoCodigo = (label: string, value: string, onChange: (value: string) => void, hint?: string) => (
    <label className="block text-xs font-medium text-slate-600">
      {label}{hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        disabled={lendoPdf || salvando}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60"
      />
    </label>
  );

  const campoData = (label: string, value: string, onChange: (value: string) => void) => (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={salvando}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60"
      />
    </label>
  );

  return (
    <section className="mb-6" aria-label="Etiqueta">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Paperclip className="h-4 w-4 text-slate-400" /> Etiqueta
      </h3>
      <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
        {caminhoEtiqueta ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <FileText className="h-5 w-5 shrink-0 text-red-500" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{nomeEtiqueta}</p>
                {emissao?.sequencia && <p className="text-xs text-slate-500">Emissão #{emissao.sequencia}</p>}
              </div>
            </div>
            <button type="button" onClick={() => setVisualizandoPdf(true)} className="btn-secondary">
              <Eye size={15} /> Abrir PDF
            </button>
            {visualizandoPdf && (
              <VisualizadorPdf
                titulo="Etiqueta"
                nomeArquivo={nomeEtiqueta}
                carregarUrl={() => apiService.urlEtiqueta(caminhoEtiqueta)}
                onFechar={() => setVisualizandoPdf(false)}
              />
            )}
          </div>
        ) : <p className="text-sm text-slate-500">Nenhuma etiqueta anexada.</p>}

        {emissao && <EmissaoDatasResumo emissao={emissao} aguardandoPostagem={solicitacao.status === 'etiqueta_gerada'} />}

        {erroConsultaEmissao && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3" role="alert">
            <p className="text-sm text-rose-800">Não foi possível conferir a etiqueta deste pedido: {erroConsultaEmissao}</p>
            <button type="button" onClick={() => setTentativaConsultaEmissao((valor) => valor + 1)} disabled={carregandoEmissao || salvando} className="mt-2 text-xs font-semibold text-rose-800 underline disabled:opacity-60">Tentar de novo</button>
          </div>
        )}

        {(emissao || solicitacao.codigo_rastreio) && !editandoCodigos && (
          <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2">
            <div><p className="text-xs text-slate-500">Autorização de postagem</p><p className="text-sm font-semibold text-slate-800">{autorizacaoAtual || 'Ainda não informada'}</p></div>
            <div><p className="text-xs text-slate-500">Código de rastreamento</p><p className="text-sm font-semibold text-slate-800">{rastreioAtual || 'Ainda não informado'}</p></div>
            {podeEmitir && aprovado && emissao && (
              <button type="button" onClick={() => {
                setCodigoAutorizacao(emissao.codigo_autorizacao ?? '');
                setCodigoRastreio(emissao.codigo_rastreio ?? '');
                setEmitidaEm(emissao.emitida_em ?? '');
                setValidaAte(emissao.valida_ate ?? '');
                setEditandoCodigos(true);
              }} className="text-left text-xs font-semibold text-blue-700 hover:underline sm:col-span-2">Editar códigos e datas</button>
            )}
          </div>
        )}

        {editandoCodigos && emissao && (
          <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3" aria-label="Editar códigos e datas">
            <div className="grid gap-3 sm:grid-cols-2">
              {campoCodigo('Código de autorização de postagem', codigoAutorizacao, setCodigoAutorizacao)}
              {campoCodigo('Código de rastreamento', codigoRastreio, setCodigoRastreio, '(opcional)')}
              {campoData('Data de emissão', emitidaEm, setEmitidaEm)}
              {campoData('Válida até', validaAte, setValidaAte)}
            </div>
            {erroDatas && <p className="text-sm text-rose-700" role="alert">{erroDatas}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void salvarCodigos()} disabled={salvando || !!erroDatas} className="btn-primary">{salvando ? 'Salvando…' : 'Salvar dados'}</button>
              <button type="button" onClick={() => setEditandoCodigos(false)} disabled={salvando} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        )}

        {podeEmitir && !aprovado && <p className="text-sm text-amber-700">Este pedido ainda não foi aprovado.</p>}
        {podeRegistrar && !arquivo && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {precisaReemitir && <p className="flex-1 text-sm text-slate-500">A etiqueta atual fica guardada no histórico.</p>}
            <button type="button" onClick={() => inputRef.current?.click()} disabled={carregandoEmissao || salvando} className="btn-secondary">
              <Upload size={15} /> {precisaReemitir ? 'Substituir etiqueta' : 'Anexar etiqueta'}
            </button>
          </div>
        )}

        {arquivo && (
          <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3" aria-label="Conferir dados da emissão">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-blue-950">{arquivo.name}</p></div>
              <button type="button" onClick={() => inputRef.current?.click()} disabled={salvando || lendoPdf} className="text-xs font-semibold text-blue-700 hover:underline">Trocar PDF</button>
            </div>
            {lendoPdf && <p className="text-xs text-blue-800" role="status">Lendo o PDF…</p>}
            {erroLeitura && <p className="text-xs text-amber-800" role="status">{erroLeitura}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {campoCodigo('Código de autorização de postagem', codigoAutorizacao, setCodigoAutorizacao)}
              {campoCodigo('Código de rastreamento', codigoRastreio, setCodigoRastreio, '(opcional)')}
              {campoData('Data de emissão', emitidaEm, setEmitidaEm)}
              {campoData('Válida até', validaAte, setValidaAte)}
            </div>
            {erroDatas && <p className="text-sm text-rose-700" role="alert">{erroDatas}</p>}
            {precisaReemitir && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600">
                  Motivo da reemissão
                  <select value={motivo} onChange={(event) => setMotivo(event.target.value as MotivoReemissao | '')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
                    <option value="">Selecione…</option>
                    {MOTIVOS_REEMISSAO.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                {motivo === 'outro' && <label className="block text-xs font-medium text-slate-600">Descreva o motivo<input value={motivoDetalhe} onChange={(event) => setMotivoDetalhe(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label>}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void confirmarEmissao()} disabled={lendoPdf || salvando || !!erroDatas} className="btn-primary">
                {salvando ? 'Salvando…' : 'Confirmar'}
              </button>
              <button type="button" onClick={cancelarSelecao} disabled={salvando} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        )}

        {erroAnexo && <p className="text-sm text-rose-700" role="alert">{erroAnexo}</p>}

        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" aria-label="Selecionar PDF da etiqueta" onChange={(event) => void selecionarPdf(event.target.files?.[0])} />
      </div>
    </section>
  );
}
