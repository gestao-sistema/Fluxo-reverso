// ── Partículas douradas: configuração e lógica pura do fundo ────────────────
// Poucas partículas pequenas sobem devagar, oscilam de leve e cintilam. Funções
// puras (sem DOM) para teste; o desenho em canvas fica em
// components/ui/FundoJoalheria.tsx.
// ─────────────────────────────────────────────────────────────────────────────

export type Aleatorio = () => number;

export const PARTICULAS_CONFIG = {
  /** Partículas por px² (≈ 34 em 1440×900). */
  densidade: 0.000026,
  /** Limites de quantidade em desktop e celular. */
  maximo: 44,
  maximoMobile: 16,
  /** Largura (px) abaixo da qual vale a versão mobile. */
  larguraMobile: 760,
  /** Teto do pixel ratio do canvas (economia de GPU). */
  pixelRatioMaximo: 1.5,
  /** Quadros por segundo: o movimento é lento, 30 FPS bastam. */
  fps: 30,
  /** Raio (px). */
  raio: [0.6, 1.8] as const,
  /** Subida (px/s). */
  subida: [4, 13] as const,
  /** Oscilação lateral: amplitude (px) e frequência (Hz). */
  amplitude: [5, 16] as const,
  frequencia: [0.04, 0.12] as const,
  /** Opacidade base e velocidade da cintilação (rad/s). */
  opacidade: [0.22, 0.7] as const,
  cintilacao: [0.25, 0.7] as const,
  /** Faixa vertical inicial (fração da altura): mais partículas perto do piso iluminado. */
  faixaInicial: [0.22, 1] as const,
} as const;

const entre = (aleatorio: Aleatorio, [minimo, maximo]: readonly [number, number]) =>
  minimo + (maximo - minimo) * aleatorio();

export interface Particula {
  /** Coluna base (px) em torno da qual a partícula oscila. */
  x: number;
  /** Altura atual (px). */
  y: number;
  raio: number;
  subida: number;
  amplitude: number;
  frequencia: number;
  opacidade: number;
  cintilacao: number;
  fase: number;
}

/** Quantidade de partículas para a área da tela, respeitando o limite do dispositivo. */
export function quantidadeParticulas(largura: number, altura: number): number {
  const mobile = largura < PARTICULAS_CONFIG.larguraMobile;
  const limite = mobile ? PARTICULAS_CONFIG.maximoMobile : PARTICULAS_CONFIG.maximo;
  return Math.min(limite, Math.round(largura * altura * PARTICULAS_CONFIG.densidade));
}

export function criarParticula(largura: number, altura: number, aleatorio: Aleatorio, y?: number): Particula {
  return {
    x: aleatorio() * largura,
    y: y ?? altura * entre(aleatorio, PARTICULAS_CONFIG.faixaInicial),
    raio: entre(aleatorio, PARTICULAS_CONFIG.raio),
    subida: entre(aleatorio, PARTICULAS_CONFIG.subida),
    amplitude: entre(aleatorio, PARTICULAS_CONFIG.amplitude),
    frequencia: entre(aleatorio, PARTICULAS_CONFIG.frequencia),
    opacidade: entre(aleatorio, PARTICULAS_CONFIG.opacidade),
    cintilacao: entre(aleatorio, PARTICULAS_CONFIG.cintilacao),
    fase: aleatorio() * Math.PI * 2,
  };
}

export function criarParticulas(largura: number, altura: number, aleatorio: Aleatorio): Particula[] {
  return Array.from({ length: quantidadeParticulas(largura, altura) }, () => criarParticula(largura, altura, aleatorio));
}

/** Sobe a partícula; ao sair pelo topo, renasce logo abaixo da borda inferior. */
export function avancarParticula(particula: Particula, dt: number, largura: number, altura: number, aleatorio: Aleatorio): Particula {
  const y = particula.y - particula.subida * dt;
  if (y < -particula.raio * 4) return criarParticula(largura, altura, aleatorio, altura + particula.raio * 4);
  return { ...particula, y };
}

/** Posição horizontal com a oscilação lateral no instante `t` (s). */
export function posicaoX(particula: Particula, t: number): number {
  return particula.x + Math.sin(t * particula.frequencia * Math.PI * 2 + particula.fase) * particula.amplitude;
}

/** Opacidade com cintilação suave, sempre entre 35% e 100% da base. */
export function opacidadeParticula(particula: Particula, t: number): number {
  const onda = (Math.sin(t * particula.cintilacao + particula.fase) + 1) / 2;
  return particula.opacidade * (0.35 + 0.65 * onda);
}
