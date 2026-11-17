import { createWorker } from 'tesseract.js';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { codigosRastreioNoTexto } from './rastreioCorreios';

export interface CamposEtiqueta {
  nome_cliente?: string;
  endereco_postagem?: string;
  numero_endereco?: string;
  cep?: string;
  codigo_autorizacao?: string;
  /** Só quando o PDF traz exatamente um código válido (dígito verificador S10). */
  codigo_rastreio?: string;
  /** Todos os códigos de rastreio distintos e válidos encontrados (para conferência quando há mais de um). */
  codigos_rastreio?: string[];
}

export interface LeituraEtiqueta {
  campos: CamposEtiqueta;
  metodo: 'texto' | 'ocr';
  /** O OCR era necessário mas não pôde rodar (ex.: sem acesso aos arquivos do OCR): valem só os campos do texto. */
  ocrIndisponivel?: boolean;
}

type ProgressoLeitura = (etapa: 'texto' | 'ocr', progresso: number) => void;

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const LIMITE_PAGINAS = 5;

function linhasDoTexto(texto: string): string[] {
  return texto.split(/\r?\n/).map((linha) => linha.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export function extrairCamposEtiqueta(texto: string): CamposEtiqueta {
  const linhas = linhasDoTexto(texto);
  const normalizadas = linhas.map(normalizar);
  const indiceRemetente = normalizadas.findIndex((linha) => /\b(remetente|sender|origem)\b/.test(linha));
  let linhasCliente = linhas;

  if (indiceRemetente >= 0) {
    const inicio = indiceRemetente;
    let fim = normalizadas.findIndex((linha, i) => i > inicio && /\b(destinatario|recebedor|recipient|destino|dados do envio|servico)\b/.test(linha));
    if (fim < 0) fim = Math.min(linhas.length, inicio + 14);
    linhasCliente = linhas.slice(inicio, fim);
    if (linhasCliente.length <= 1) linhasCliente = linhas.slice(inicio, Math.min(linhas.length, inicio + 10));
  }

  const linhasNormalizadas = linhasCliente.map(normalizar);
  const linhaCep = linhasCliente.find((linha) => /\b\d{5}-?\d{3}\b/.test(linha));
  const cep = linhaCep?.match(/\b\d{5}-?\d{3}\b/)?.[0].replace(/\D/g, '');
  // Só códigos com dígito verificador correto; com mais de um, nenhum é escolhido sozinho
  const codigosRastreio = codigosRastreioNoTexto(texto);
  const codigoRastreio = codigosRastreio.length === 1 ? codigosRastreio[0] : undefined;
  const indiceAutorizacao = normalizadas.findIndex((linha) => /\bautorizacao\b/.test(linha));
  let valorAutorizacao = indiceAutorizacao < 0 ? '' : linhas[indiceAutorizacao]
    .replace(/^(?:(?:c[oó]d(?:igo)?\.?|codigo|numero|número)\s+(?:(?:da|de)\s+)?)?autoriza[cç](?:ao|ão)(?:\s+de\s+postagem)?\s*(?:n[ºo.]?\s*)?[:#-]?\s*/i, '')
    .trim();
  if (!valorAutorizacao && indiceAutorizacao >= 0) {
    valorAutorizacao = linhas[indiceAutorizacao + 1] ?? '';
  }
  const codigoAutorizacao = valorAutorizacao.match(/[A-Z0-9][A-Z0-9-]{3,59}/i)?.[0];
  const autorizacaoValida = codigoAutorizacao && !codigosRastreio.includes(codigoAutorizacao.toUpperCase())
    ? codigoAutorizacao.toUpperCase()
    : undefined;

  const nomeExplicito = linhasCliente
    .map((linha) => linha.match(/^(?:nome(?: do remetente)?|remetente|sender)\s*[:\-]\s*(.+)$/i)?.[1]?.trim())
    .find((valor) => !!valor && /[a-z\u00c0-\u024f]{2}/i.test(valor));

  const candidatosNome = (indiceRemetente >= 0 ? linhasCliente : []).filter((linha, i) => {
    const linhaNormalizada = linhasNormalizadas[i];
    return linha.length >= 4
      && /[a-z\u00c0-\u024f]{2}/i.test(linha)
      && !/\b(cep|cpf|cnpj|telefone|celular|rua|avenida|av\.?|travessa|alameda|estrada|rodovia|praca|bairro|cidade|uf|remetente|origem|destinatario|recebedor|servico|objeto|rastreamento)\b/.test(linhaNormalizada)
      && !/\d{5}-?\d{3}/.test(linha)
      && !/^\d/.test(linha);
  });
  const nome_cliente = (nomeExplicito ?? candidatosNome[0])?.replace(/^(?:remetente|sender)\s*[:\-]?\s*/i, '').trim();

  const linhaEnderecoExplicito = linhasCliente.find((linha) => /^(?:endereco(?: do remetente)?|logradouro|address)\s*[:\-]/i.test(normalizar(linha)));
  const indiceRua = linhasNormalizadas.findIndex((linha) => /\b(rua|avenida|av\.?|travessa|alameda|estrada|rodovia|praca|largo)\b/.test(linha));
  let textoEndereco = linhaEnderecoExplicito?.replace(/^[^:\-]+[:\-]\s*/i, '')
    ?? (indiceRua >= 0 ? linhasCliente[indiceRua] : undefined);

  let endereco_postagem: string | undefined;
  let numero_endereco: string | undefined;
  if (textoEndereco) {
    textoEndereco = textoEndereco.replace(/\b\d{5}-?\d{3}\b/g, '').trim();
    const partes = textoEndereco.split(',').map((parte) => parte.trim()).filter(Boolean);
    const indiceNumero = partes.findIndex((parte) => /^(?:n(?:[ºo.]|umero)?\s*)?(\d{1,6}|s\s*\/?\s*n)$/i.test(parte));
    if (indiceNumero >= 0) {
      numero_endereco = partes[indiceNumero].match(/(\d{1,6}|s\s*\/?\s*n)$/i)?.[1]?.replace(/\s+/g, '').toUpperCase();
      partes.splice(indiceNumero, 1);
    } else {
      const numeroNoTexto = textoEndereco.match(/\b(?:n[ºo.]?\s*)(\d{1,6}|s\s*\/?\s*n)\b/i)?.[1];
      if (numeroNoTexto) numero_endereco = numeroNoTexto.replace(/\s+/g, '').toUpperCase();
    }
    endereco_postagem = partes.join(', ').replace(/\s+/g, ' ').trim();
    if (!endereco_postagem && textoEndereco) endereco_postagem = textoEndereco;

    if (!numero_endereco) {
      const proximaLinha = indiceRua >= 0 ? linhasCliente[indiceRua + 1] : undefined;
      const numeroSeparado = proximaLinha?.match(/^(?:n(?:[ºo.]|umero)?\s*[:\-]?\s*)?(\d{1,6}|s\s*\/?\s*n)$/i)?.[1];
      if (numeroSeparado) numero_endereco = numeroSeparado.replace(/\s+/g, '').toUpperCase();
    }
  }

  return {
    ...(nome_cliente ? { nome_cliente } : {}),
    ...(endereco_postagem && endereco_postagem.length >= 5 ? { endereco_postagem } : {}),
    ...(numero_endereco ? { numero_endereco } : {}),
    ...(cep?.length === 8 ? { cep } : {}),
    ...(autorizacaoValida ? { codigo_autorizacao: autorizacaoValida } : {}),
    ...(codigoRastreio ? { codigo_rastreio: codigoRastreio } : {}),
    ...(codigosRastreio.length > 0 ? { codigos_rastreio: codigosRastreio } : {}),
  };
}

async function lerTextoPdf(file: File, progresso: ProgressoLeitura): Promise<{ documento: Awaited<ReturnType<typeof getDocument>['promise']>; destruir: () => Promise<void>; textos: string[] }> {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const tarefa = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const documento = await tarefa.promise;
  const textos: string[] = [];
  const paginas = Math.min(documento.numPages, LIMITE_PAGINAS);

  for (let numero = 1; numero <= paginas; numero += 1) {
    progresso('texto', numero / paginas);
    const pagina = await documento.getPage(numero);
    const conteudo = await pagina.getTextContent();
    const itens = conteudo.items.filter((item): item is typeof item & { str: string; transform: number[] } => 'str' in item);
    const agrupados: Array<{ y: number; x: number; partes: string[] }> = [];
    for (const item of itens) {
      const x = item.transform[4] ?? 0;
      const y = item.transform[5] ?? 0;
      let linha = agrupados.find((candidata) => Math.abs(candidata.y - y) < 3);
      if (!linha) {
        linha = { y, x, partes: [] };
        agrupados.push(linha);
      }
      linha.partes.push(item.str);
    }
    textos.push(agrupados
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((linha) => linha.partes.join(' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n'));
    pagina.cleanup();
  }
  return { documento, destruir: () => tarefa.destroy(), textos };
}

async function lerOcr(
  documento: Awaited<ReturnType<typeof getDocument>['promise']>,
  progresso: ProgressoLeitura,
  camposNecessarios: (keyof CamposEtiqueta)[],
): Promise<string[]> {
  const worker = await createWorker('por+eng', undefined, {
    logger: (evento) => progresso('ocr', evento.progress ?? 0),
  });
  const textos: string[] = [];
  try {
    const paginas = Math.min(documento.numPages, 2);
    for (let numero = 1; numero <= paginas; numero += 1) {
      const pagina = await documento.getPage(numero);
      const viewport = pagina.getViewport({ scale: 1 });
      const escala = Math.min(2.5, 1800 / viewport.width);
      const viewportAmpliado = pagina.getViewport({ scale: escala });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewportAmpliado.width);
      canvas.height = Math.ceil(viewportAmpliado.height);
      const contexto = canvas.getContext('2d');
      if (!contexto) continue;
      await pagina.render({ canvas, canvasContext: contexto, viewport: viewportAmpliado }).promise;
      const resultado = await worker.recognize(canvas, {}, { text: true });
      textos.push(resultado.data.text);
      canvas.width = 0;
      canvas.height = 0;
      pagina.cleanup();
      const camposEncontrados = extrairCamposEtiqueta(textos.join('\n'));
      if (camposNecessarios.every((campo) => !!camposEncontrados[campo])) break;
    }
  } finally {
    await worker.terminate();
  }
  return textos;
}

export async function lerEtiquetaPdf(
  file: File,
  progresso: ProgressoLeitura = () => {},
  opcoes: { camposNecessarios?: (keyof CamposEtiqueta)[]; ocrFallback?: boolean } = {},
): Promise<LeituraEtiqueta> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Selecione um arquivo PDF.');
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('O PDF deve ter no máximo 5 MB.');

  const { documento, destruir, textos } = await lerTextoPdf(file, progresso);
  try {
    const camposTexto = extrairCamposEtiqueta(textos.join('\n'));
    const camposNecessarios = opcoes.camposNecessarios ?? ['nome_cliente', 'endereco_postagem'];
    const precisaOcr = camposNecessarios.some((campo) => !camposTexto[campo]);
    if (!precisaOcr || opcoes.ocrFallback === false) return { campos: camposTexto, metodo: 'texto' };

    let textoOcr: string[];
    try {
      textoOcr = await lerOcr(documento, progresso, camposNecessarios);
    } catch (erroOcr) {
      // O OCR é complementar: sem ele, o que já foi lido do texto do PDF continua valendo
      console.warn('OCR da etiqueta indisponível; usando só o texto do PDF.', erroOcr);
      if (Object.keys(camposTexto).length > 0) return { campos: camposTexto, metodo: 'texto', ocrIndisponivel: true };
      throw new Error('Não foi possível iniciar o OCR. Verifique a conexão e tente novamente, ou preencha os campos manualmente.');
    }
    const camposOcr = extrairCamposEtiqueta(textoOcr.join('\n'));
    const campos = { ...camposOcr, ...camposTexto };
    // Códigos de rastreio: o texto do PDF prevalece; o OCR só entra quando o texto não trouxe nenhum
    if (camposTexto.codigos_rastreio?.length) {
      if (!camposTexto.codigo_rastreio) delete campos.codigo_rastreio;
    }
    if (Object.keys(campos).length === 0) {
      throw new Error('Não encontrei dados legíveis nesta etiqueta. Preencha os campos manualmente.');
    }
    const ocrContribuiu = Object.keys(camposOcr).some((campo) => !(campo in camposTexto));
    return { campos, metodo: ocrContribuiu ? 'ocr' : 'texto' };
  } finally {
    await destruir();
  }
}
