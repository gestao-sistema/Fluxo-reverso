// ── Visualizador de PDF em diálogo ──────────────────────────────────────────
// Mostra o PDF (etiqueta, nota de transporte) num popup, sem abrir outra aba.
// As páginas são desenhadas com pdf.js em canvas: funciona igual no desktop e
// no celular (o visualizador nativo em iframe não abre no Chrome Android).
// A URL assinada é usada só para baixar os bytes; o download sai desses bytes.
// Montar = abrir; desmontar = fechar.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Download, FileText, Loader2, Minus, Plus, X } from 'lucide-react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

interface VisualizadorPdfProps {
  titulo: string;
  nomeArquivo: string;
  /** Devolve uma URL (assinada, blob ou data) de onde os bytes do PDF são lidos. */
  carregarUrl: () => Promise<string>;
  onFechar: () => void;
}

const ZOOM_MINIMO = 1;
const ZOOM_MAXIMO = 3;
const PASSO_ZOOM = 0.25;
/** Etiquetas têm 1–2 páginas; o teto evita travar com arquivos inesperados. */
const MAXIMO_PAGINAS = 30;

async function abrirDocumento(bytes: Uint8Array) {
  const [{ GlobalWorkerOptions, getDocument }, { default: workerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = workerUrl;
  // Cópia: o pdf.js transfere o buffer para o worker, e os bytes ainda servem ao download
  return getDocument({ data: bytes.slice() });
}

export default function VisualizadorPdf({ titulo, nomeArquivo, carregarUrl, onFechar }: VisualizadorPdfProps) {
  const tituloId = useId();
  const dialogoRef = useRef<HTMLDivElement>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const fecharHandler = useRef(onFechar);
  fecharHandler.current = onFechar;
  // Lida só na abertura: o pai pode recriar a função a cada render
  const carregarUrlRef = useRef(carregarUrl);

  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [documento, setDocumento] = useState<PDFDocumentProxy | null>(null);
  const [erro, setErro] = useState('');
  const [zoom, setZoom] = useState(ZOOM_MINIMO);
  const [largura, setLargura] = useState(0);

  // Foco, Esc, Tab preso no diálogo e rolagem da página bloqueada (mesmo padrão do ConfirmDialog)
  useEffect(() => {
    const focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    fecharRef.current?.focus();

    const teclas = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        // Captura + stopPropagation: fecha só o visualizador, não o diálogo de detalhe por baixo
        evento.preventDefault();
        evento.stopPropagation();
        fecharHandler.current();
        return;
      }
      if (evento.key !== 'Tab') return;
      const focaveis = dialogoRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
      if (!focaveis?.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener('keydown', teclas, true);
    return () => {
      document.removeEventListener('keydown', teclas, true);
      document.body.style.overflow = overflowAnterior;
      focoAnterior?.focus();
    };
  }, []);

  // Baixa os bytes uma vez (a URL assinada expira rápido)
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const url = await carregarUrlRef.current();
      const resposta = await fetch(url);
      if (!resposta.ok) throw new Error('Não foi possível carregar o PDF.');
      const dados = new Uint8Array(await resposta.arrayBuffer());
      if (!cancelado) setBytes(dados);
    })().catch((falha) => {
      if (!cancelado) setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar o PDF.');
    });
    return () => { cancelado = true; };
  }, []);

  // Interpreta o PDF quando os bytes chegam
  useEffect(() => {
    if (!bytes) return;
    let cancelado = false;
    let tarefa: Awaited<ReturnType<typeof abrirDocumento>> | null = null;
    (async () => {
      tarefa = await abrirDocumento(bytes);
      const carregado = await tarefa.promise;
      if (!cancelado) setDocumento(carregado);
    })().catch(() => {
      if (!cancelado) setErro('Não foi possível exibir este PDF. Use "Baixar" para abri-lo no seu leitor.');
    });
    return () => {
      cancelado = true;
      // Destruir a tarefa encerra o documento e o worker
      void tarefa?.destroy();
    };
  }, [bytes]);

  // Largura útil para ajustar a página à tela
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const medir = () => {
      const estilo = getComputedStyle(area);
      setLargura(Math.max(0, area.clientWidth - Number.parseFloat(estilo.paddingLeft) - Number.parseFloat(estilo.paddingRight)));
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(area);
    return () => observador.disconnect();
  }, []);

  const totalPaginas = documento ? Math.min(documento.numPages, MAXIMO_PAGINAS) : 0;

  // Desenha as páginas ajustadas à largura × zoom
  useEffect(() => {
    if (!documento || !largura) return;
    let cancelado = false;
    const tarefas: RenderTask[] = [];
    (async () => {
      for (let numero = 1; numero <= totalPaginas && !cancelado; numero += 1) {
        const pagina = await documento.getPage(numero);
        const canvas = canvasRefs.current[numero - 1];
        const contexto = canvas?.getContext('2d');
        if (!canvas || !contexto || cancelado) continue;
        const base = pagina.getViewport({ scale: 1 });
        const larguraCss = Math.min(largura, 1100) * zoom;
        const densidade = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = pagina.getViewport({ scale: (larguraCss / base.width) * densidade });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${Math.round(larguraCss)}px`;
        canvas.style.height = `${Math.round(viewport.height / densidade)}px`;
        const tarefa = pagina.render({ canvas, canvasContext: contexto, viewport });
        tarefas.push(tarefa);
        await tarefa.promise.catch(() => undefined);
      }
    })().catch(() => {
      if (!cancelado) setErro('Não foi possível exibir este PDF. Use "Baixar" para abri-lo no seu leitor.');
    });
    return () => {
      cancelado = true;
      tarefas.forEach((tarefa) => tarefa.cancel());
    };
  }, [documento, largura, zoom, totalPaginas]);

  const baixar = () => {
    if (!bytes) return;
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo || 'documento.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const carregando = !erro && !documento;

  return createPortal(
    <div
      className="pdf-overlay"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) onFechar();
      }}
    >
      <div ref={dialogoRef} className="pdf-dialogo" role="dialog" aria-modal="true" aria-labelledby={tituloId}>
        <header className="pdf-cabecalho">
          <span className="pdf-icone" aria-hidden="true"><FileText size={18} /></span>
          <div className="pdf-titulos">
            <h2 id={tituloId}>{titulo}</h2>
            <p title={nomeArquivo}>{nomeArquivo}{totalPaginas > 1 ? ` · ${totalPaginas} páginas` : ''}</p>
          </div>
          <div className="pdf-acoes">
            <div className="pdf-zoom" role="group" aria-label="Zoom">
              <button type="button" onClick={() => setZoom((z) => Math.max(ZOOM_MINIMO, z - PASSO_ZOOM))} disabled={!documento || zoom <= ZOOM_MINIMO} aria-label="Diminuir zoom">
                <Minus size={15} aria-hidden="true" />
              </button>
              <span aria-live="polite">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((z) => Math.min(ZOOM_MAXIMO, z + PASSO_ZOOM))} disabled={!documento || zoom >= ZOOM_MAXIMO} aria-label="Aumentar zoom">
                <Plus size={15} aria-hidden="true" />
              </button>
            </div>
            <button type="button" className="btn-secondary pdf-baixar" onClick={baixar} disabled={!bytes}>
              <Download size={15} aria-hidden="true" /> <span>Baixar</span>
            </button>
            <button ref={fecharRef} type="button" className="pdf-fechar" onClick={onFechar} aria-label="Fechar visualização">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div ref={areaRef} className="pdf-area">
          {erro ? (
            <div className="pdf-estado is-erro" role="alert">
              <AlertTriangle size={22} aria-hidden="true" />
              <p>{erro}</p>
            </div>
          ) : carregando ? (
            <div className="pdf-estado" role="status">
              <Loader2 size={22} className="animate-spin" aria-hidden="true" />
              <p>Carregando PDF…</p>
            </div>
          ) : null}
          {!erro && totalPaginas > 0 && (
            <div className="pdf-paginas">
              {Array.from({ length: totalPaginas }, (_, indice) => (
                <canvas
                  key={indice}
                  ref={(elemento) => { canvasRefs.current[indice] = elemento; }}
                  className="pdf-pagina"
                  role="img"
                  aria-label={`Página ${indice + 1} de ${totalPaginas}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
