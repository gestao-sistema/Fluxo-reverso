import { describe, expect, it } from 'vitest';
import {
  PARTICULAS_CONFIG,
  avancarParticula,
  criarParticula,
  criarParticulas,
  opacidadeParticula,
  posicaoX,
  quantidadeParticulas,
} from '../lib/particulasDouradas';

/** Gerador determinístico (LCG) para que os testes não dependam de Math.random. */
function gerador(semente: number) {
  let estado = semente;
  return () => {
    estado = (estado * 1664525 + 1013904223) % 4294967296;
    return estado / 4294967296;
  };
}

describe('quantidadeParticulas', () => {
  it('fica discreta e menor no celular', () => {
    const desktop = quantidadeParticulas(1440, 900);
    const celular = quantidadeParticulas(390, 844);
    expect(desktop).toBeGreaterThan(10);
    expect(desktop).toBeLessThanOrEqual(PARTICULAS_CONFIG.maximo);
    expect(celular).toBeLessThanOrEqual(PARTICULAS_CONFIG.maximoMobile);
    expect(celular).toBeLessThan(desktop);
  });

  it('respeita o teto em telas muito grandes', () => {
    expect(quantidadeParticulas(3840, 2160)).toBe(PARTICULAS_CONFIG.maximo);
  });
});

describe('criarParticulas', () => {
  it('nasce dentro da tela, abaixo da faixa superior', () => {
    for (const particula of criarParticulas(1200, 800, gerador(3))) {
      expect(particula.x).toBeGreaterThanOrEqual(0);
      expect(particula.x).toBeLessThan(1200);
      expect(particula.y).toBeGreaterThanOrEqual(800 * PARTICULAS_CONFIG.faixaInicial[0]);
      expect(particula.y).toBeLessThanOrEqual(800);
    }
  });
});

describe('avancarParticula', () => {
  it('sobe devagar conforme o tempo decorrido', () => {
    const particula = criarParticula(1000, 800, gerador(5), 400);
    const depois = avancarParticula(particula, 1, 1000, 800, gerador(6));
    expect(depois.y).toBeCloseTo(400 - particula.subida);
    expect(particula.subida).toBeLessThanOrEqual(PARTICULAS_CONFIG.subida[1]);
  });

  it('renasce abaixo da borda inferior ao sair pelo topo', () => {
    const particula = criarParticula(1000, 800, gerador(9), -50);
    const depois = avancarParticula(particula, 0.1, 1000, 800, gerador(10));
    expect(depois.y).toBeGreaterThan(800);
  });
});

describe('oscilação e cintilação', () => {
  it('oscila só dentro da amplitude e nunca apaga totalmente', () => {
    const particula = criarParticula(1000, 800, gerador(11), 300);
    for (let t = 0; t < 60; t += 0.5) {
      expect(Math.abs(posicaoX(particula, t) - particula.x)).toBeLessThanOrEqual(particula.amplitude + 1e-9);
      const alpha = opacidadeParticula(particula, t);
      expect(alpha).toBeGreaterThanOrEqual(particula.opacidade * 0.35 - 1e-9);
      expect(alpha).toBeLessThanOrEqual(particula.opacidade + 1e-9);
    }
  });
});
