import { useRef, useState } from 'react';
import { FileText, Loader2, Upload } from 'lucide-react';
import type { CamposEtiqueta } from '../../lib/etiquetaPdf';

interface Props {
  disabled?: boolean;
  onAplicar: (campos: CamposEtiqueta) => void;
  onConferencia: (confirmado: boolean) => void;
  onProcessamento: (lendo: boolean) => void;
}

export default function LeitorEtiqueta({ disabled = false, onAplicar, onConferencia, onProcessamento }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [etapa, setEtapa] = useState<'texto' | 'ocr'>('texto');
  const [erro, setErro] = useState('');
  const [arquivo, setArquivo] = useState('');
  const [campos, setCampos] = useState<CamposEtiqueta | null>(null);
  const [conferido, setConferido] = useState(false);

  const ler = async (file?: File) => {
    if (!file) return;
    setErro('');
    setArquivo(file.name);
    setLendo(true);
    onProcessamento(true);
    setProgresso(0);
    try {
      const { lerEtiquetaPdf } = await import('../../lib/etiquetaPdf');
      const leitura = await lerEtiquetaPdf(file, (proximaEtapa, valor) => {
        setEtapa(proximaEtapa);
        setProgresso(Math.round(valor * 100));
      });
      setCampos(leitura.campos);
      setConferido(false);
      onAplicar(leitura.campos);
      setEtapa(leitura.metodo === 'ocr' ? 'ocr' : 'texto');
    } catch (errorLeitura) {
      setErro(errorLeitura instanceof Error ? errorLeitura.message : 'Não foi possível ler o PDF.');
      setArquivo('');
    } finally {
      setLendo(false);
      onProcessamento(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const alterarConferencia = (confirmado: boolean) => {
    setConferido(confirmado);
    onConferencia(confirmado);
  };

  const nomesCampos = campos ? [
    campos.nome_cliente && 'nome da cliente',
    campos.endereco_postagem && 'endereço',
    campos.numero_endereco && 'número',
    campos.cep && 'CEP',
  ].filter(Boolean) : [];

  return (
    <section className="space-y-3" aria-label="Leitura automática da etiqueta">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Preencher pela etiqueta (opcional)</h2>
        <p className="mt-1 text-xs text-slate-500">Arraste o PDF aqui. O sistema tenta ler o texto e usa OCR se faltar informação. Os campos continuam editáveis.</p>
      </div>
      <button
        type="button"
        disabled={disabled || lendo}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); setArrastando(true); }}
        onDragOver={(event) => { event.preventDefault(); setArrastando(true); }}
        onDragLeave={(event) => { event.preventDefault(); setArrastando(false); }}
        onDrop={(event) => { event.preventDefault(); setArrastando(false); void ler(event.dataTransfer.files[0]); }}
        className={`flex min-h-20 w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${arrastando ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100'}`}
      >
        {lendo ? <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-hidden="true" /> : arquivo ? <FileText className="h-5 w-5 text-blue-600" aria-hidden="true" /> : <Upload className="h-5 w-5 text-slate-500" aria-hidden="true" />}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-700">{lendo ? (etapa === 'ocr' ? 'OCR em andamento…' : 'Lendo o texto do PDF…') : arquivo || 'Arraste o PDF ou clique para selecionar'}</span>
          <span className="mt-0.5 block text-xs font-normal text-slate-500">PDF de até 5 MB</span>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        disabled={disabled || lendo}
        aria-label="Selecionar PDF da etiqueta para preencher os dados"
        onChange={(event) => void ler(event.target.files?.[0])}
      />

      {lendo && (
        <div className="space-y-1" role="status" aria-live="polite">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${progresso}%` }} />
          </div>
          <p className="text-xs text-slate-500">{etapa === 'ocr' ? 'OCR roda no navegador. No primeiro uso, os dados de idioma podem levar alguns instantes para carregar.' : 'Tentando primeiro a extração de texto do PDF.'}</p>
        </div>
      )}

      {erro && <p className="text-xs text-red-600" role="alert">{erro}</p>}

      {campos && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Confira os dados preenchidos antes de enviar.</p>
          <p className="mt-1 text-xs">Encontrados: {nomesCampos.join(', ') || 'nenhum campo'} · leitura por {etapa === 'ocr' ? 'OCR' : 'texto do PDF'}. Campos não encontrados ficam vazios.</p>
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs font-medium">
            <input type="checkbox" className="mt-0.5 accent-amber-700" checked={conferido} onChange={(event) => alterarConferencia(event.target.checked)} />
            <span>Conferi os dados da etiqueta nos campos acima.</span>
          </label>
        </div>
      )}
    </section>
  );
}
