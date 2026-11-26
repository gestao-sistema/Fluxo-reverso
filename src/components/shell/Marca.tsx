// ── Assinaturas das marcas (padrão visual, seção 22) ─────────────────────────
// Usa os arquivos oficiais de padrao_front/Logos (recortados em public/marcas) como máscara:
// o desenho vem do arquivo e a cor, do tema ativo (claro, escuro, marca). Assim um único
// arquivo serve a todas as combinações, sem filtros nem versões duplicadas.
// ─────────────────────────────────────────────────────────────────────────────
import type { CSSProperties } from 'react';
import type { Marca } from '../../lib/tema';
import { MARCAS } from '../../lib/marcas';

type Variaveis = CSSProperties & Record<`--${string}`, string | number>;

/** Quadro da marca (raio de 30% do tamanho) com o monograma oficial dentro. */
export function Monograma({ marca, tamanho = 36 }: { marca: Marca; tamanho?: number }) {
  const dados = MARCAS[marca];
  const estilo: Variaveis = {
    width: tamanho,
    height: tamanho,
    borderRadius: tamanho * 0.3,
    '--glifo': `url(${dados.monograma})`,
  };
  return (
    <span className={`monogram monogram-${marca}`} style={estilo} role="img" aria-label={dados.nome}>
      <span className="monogram-glifo" aria-hidden="true" />
    </span>
  );
}

/** Logotipo oficial da marca, em uma linha de 22 px de altura (ou a altura informada). */
export function Wordmark({ marca, altura = 22 }: { marca: Marca; altura?: number }) {
  const dados = MARCAS[marca];
  const estilo: Variaveis = {
    height: altura,
    width: altura * dados.proporcaoLogo,
    '--logo': `url(${dados.logo})`,
  };
  return <span className={`wordmark-img wordmark-img-${marca}`} style={estilo} role="img" aria-label={dados.nome} />;
}

/** Conjunto da marca: monograma de 36 px e, ao lado, o logotipo (some quando o menu recolhe). */
export default function MarcaLogo({ marca }: { marca: Marca }) {
  return (
    <span className="brand-row">
      <Monograma marca={marca} />
      <span className="brand-word"><Wordmark marca={marca} /></span>
    </span>
  );
}
