import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PageHeading from '../components/ui/PageHeading';

describe('PageHeading (padrão visual, seção 11)', () => {
  it('mostra o título como h1 e a descrição abaixo dele', () => {
    render(<PageHeading title="Pedidos" description="Todos os pedidos da empresa." />);
    expect(screen.getByRole('heading', { level: 1, name: 'Pedidos' })).toBeInTheDocument();
    expect(screen.getByText('Todos os pedidos da empresa.')).toBeInTheDocument();
  });

  it('transforma a trilha em breadcrumbs em frase, marcando a última parte como página atual', () => {
    render(<PageHeading eyebrow="QUALIDADE / NÃO CONFORMIDADES" title="Registrar ocorrência" />);
    const trilha = screen.getByRole('navigation', { name: 'Trilha de navegação' });
    expect(trilha).toHaveTextContent('Qualidade');
    expect(trilha).toHaveTextContent('Não conformidades');
    expect(screen.getByText('Não conformidades')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Qualidade')).not.toHaveAttribute('aria-current');
  });

  it('sem trilha nem ação, não desenha esses blocos', () => {
    render(<PageHeading title="Lixeira" />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(document.querySelector('.page-actions')).toBeNull();
  });

  it('coloca a ação à direita do título', () => {
    render(<PageHeading title="Usuários" action={<button type="button">Novo usuário</button>} />);
    expect(screen.getByRole('button', { name: 'Novo usuário' }).closest('.page-actions')).not.toBeNull();
  });
});
