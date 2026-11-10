/**
 * Production build substitute for every `src/demo/*` module.
 * Vite aliases demo imports here only for `vite build`; development keeps the real demo implementation.
 */
export const demoAtivo = () => false;
export const demoDisponivel = () => false;

const indisponivel = () => {
  throw new Error('O modo de demonstração só está disponível em desenvolvimento.');
};

export const encerrarDemo = () => {};
export const iniciarDemo = indisponivel;
export const selecionarUsuarioDemo = indisponivel;
export const usuarioDemoAtual = indisponivel;

export const demoApi = Object.freeze({});
export const demoDados = Object.freeze({ resetar: indisponivel });
export const demoAvisosReverso = Object.freeze({
  listar: () => [],
  contarNaoLidos: () => 0,
  marcarLido: () => undefined,
});

export default function DemoDisabled() {
  return null;
}
