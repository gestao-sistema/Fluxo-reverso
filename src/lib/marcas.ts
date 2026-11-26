// Dados das marcas do padrão visual: arquivos oficiais de padrao_front/Logos (recortados em public/marcas)
// e a proporção (largura / altura) de cada um, para reservar o espaço antes de a imagem carregar.
import type { Marca } from './tema';

export interface DadosDaMarca {
  nome: string;
  logo: string;
  proporcaoLogo: number;
  monograma: string;
  proporcaoMonograma: number;
}

export const MARCAS: Record<Marca, DadosDaMarca> = {
  azime: { nome: 'AZIME', logo: '/marcas/azime-logo.png', proporcaoLogo: 1200 / 396, monograma: '/marcas/azime-monograma.png', proporcaoMonograma: 1200 / 1395 },
  alinare: { nome: 'Alinare', logo: '/marcas/alinare-logo.png', proporcaoLogo: 1200 / 320, monograma: '/marcas/alinare-monograma.png', proporcaoMonograma: 1099 / 1560 },
  novitah: { nome: 'Novitah', logo: '/marcas/novitah-logo.png', proporcaoLogo: 1200 / 377, monograma: '/marcas/novitah-monograma.png', proporcaoMonograma: 654 / 809 },
};
