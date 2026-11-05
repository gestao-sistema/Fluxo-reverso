// ── Cenário de joalheria compartilhado ──────────────────────────────────────
// Montado uma vez, fora de <Routes>: persiste entre as rotas. A imagem segue o
// tema (Alinare, Novitah ou conjunto) com uma troca suave; por cima, um véu de
// leitura, um brilho lento (só opacidade/transform) e poucas partículas
// douradas em canvas a 30 FPS. Decorativo: aria-hidden e sem captura de clique.
// Pausa com a preferência do usuário, prefers-reduced-motion e aba oculta.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useEfeitosFundoPausados } from '../../hooks/useEfeitosFundo';
import { useTema } from '../../context/TemaContext';
import { useModoCor } from '../../hooks/useModoCor';
import type { Tema } from '../../lib/tema';
import {
  PARTICULAS_CONFIG,
  avancarParticula,
  criarParticulas,
  opacidadeParticula,
  posicaoX,
  type Particula,
} from '../../lib/particulasDouradas';

interface Controle {
  atualizar: () => void;
  recolorir: () => void;
}

const movimentoReduzido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function FundoJoalheria() {
  const location = useLocation();
  const tema = useTema();
  const [modo] = useModoCor();
  const [pausado] = useEfeitosFundoPausados();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausadoRef = useRef(pausado);
  pausadoRef.current = pausado;
  const controleRef = useRef<Controle | null>(null);
  const estaNoLogin = location.pathname === '/login';

  // Mantém a imagem anterior por baixo enquanto a nova aparece
  const [camadas, setCamadas] = useState<Tema[]>([tema]);
  useEffect(() => {
    setCamadas((atual) => {
      if (atual[atual.length - 1] === tema) return atual;
      return pausadoRef.current || movimentoReduzido() ? [tema] : [atual[atual.length - 1], tema];
    });
  }, [tema]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const preferencia = window.matchMedia('(prefers-reduced-motion: reduce)');
    let largura = 0;
    let altura = 0;
    let particulas: Particula[] = [];
    let cor = '232, 196, 132';
    let tempo = 0;
    let ultimo = 0;
    let rafId = 0;
    let rodando = false;
    const intervaloQuadro = 1000 / PARTICULAS_CONFIG.fps;

    const deveAnimar = () => !pausadoRef.current && !preferencia.matches && !document.hidden;

    const desenhar = () => {
      ctx.clearRect(0, 0, largura, altura);
      for (const particula of particulas) {
        const x = posicaoX(particula, tempo);
        const alpha = opacidadeParticula(particula, tempo);
        // Núcleo claro com halo curto: gradiente radial pequeno, sem filtros
        const halo = ctx.createRadialGradient(x, particula.y, 0, x, particula.y, particula.raio * 3.2);
        halo.addColorStop(0, `rgba(${cor}, ${alpha})`);
        halo.addColorStop(0.35, `rgba(${cor}, ${alpha * 0.45})`);
        halo.addColorStop(1, `rgba(${cor}, 0)`);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(x, particula.y, particula.raio * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const redimensionar = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, PARTICULAS_CONFIG.pixelRatioMaximo);
      largura = window.innerWidth;
      altura = window.innerHeight;
      canvas.width = Math.round(largura * pixelRatio);
      canvas.height = Math.round(altura * pixelRatio);
      canvas.style.width = `${largura}px`;
      canvas.style.height = `${altura}px`;
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      particulas = criarParticulas(largura, altura, Math.random);
      desenhar();
    };

    const quadro = (agora: number) => {
      rafId = requestAnimationFrame(quadro);
      if (agora - ultimo < intervaloQuadro) return;
      // Tempo decorrido real: a velocidade não depende da taxa do monitor
      const dt = Math.min(0.1, (agora - ultimo) / 1000);
      ultimo = agora;
      tempo += dt;
      particulas = particulas.map((p) => avancarParticula(p, dt, largura, altura, Math.random));
      desenhar();
    };

    const iniciar = () => {
      if (rodando) return;
      rodando = true;
      ultimo = performance.now();
      rafId = requestAnimationFrame(quadro);
    };

    const parar = () => {
      rodando = false;
      cancelAnimationFrame(rafId);
    };

    // Parado: as partículas ficam como um quadro estático, sem movimento
    const atualizar = () => {
      if (deveAnimar()) iniciar();
      else {
        parar();
        desenhar();
      }
    };

    const recolorir = () => {
      const valor = getComputedStyle(document.documentElement).getPropertyValue('--flow-particula').trim();
      if (valor) cor = valor;
      desenhar();
    };

    redimensionar();
    recolorir();
    atualizar();
    controleRef.current = { atualizar, recolorir };

    window.addEventListener('resize', redimensionar);
    document.addEventListener('visibilitychange', atualizar);
    preferencia.addEventListener('change', atualizar);

    return () => {
      controleRef.current = null;
      parar();
      window.removeEventListener('resize', redimensionar);
      document.removeEventListener('visibilitychange', atualizar);
      preferencia.removeEventListener('change', atualizar);
    };
  }, []);

  // Pausar/retomar e trocar de tema só reaplicam o estado; o laço não é recriado
  useEffect(() => {
    controleRef.current?.atualizar();
  }, [pausado]);

  // A cor das partículas vem do token do tema e do modo (claro/escuro)
  useEffect(() => {
    controleRef.current?.recolorir();
  }, [tema, modo]);

  return (
    <div className={`fundo-cena ${pausado ? 'is-pausado' : ''} ${estaNoLogin ? 'is-login' : ''}`} aria-hidden="true">
      {camadas.map((camada, indice) => (
        <div
          key={camada}
          className={`fundo-imagem fundo-${camada} ${indice > 0 ? 'is-entrando' : ''}`}
          onAnimationEnd={indice > 0 ? () => setCamadas([camada]) : undefined}
        />
      ))}
      <div className="fundo-veu" />
      <div className="fundo-brilho" />
      <canvas ref={canvasRef} className="fundo-particulas" />
    </div>
  );
}
