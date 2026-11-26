// ── Ambiente de fundo (padrão visual, seção 5) ───────────────────────────────
// Quatro manchas de luz e cor desfocadas sobre a base do tema. Decorativo: sem foto, sem
// partículas, sem captura de clique. Fica fora de <Routes>, montado uma vez, e acompanha
// a marca e o tema pelos tokens de <html>. O movimento respeita a preferência de reduzir
// movimento do sistema e a do usuário (data-motion="reduced").
// ─────────────────────────────────────────────────────────────────────────────
export default function Ambiente() {
  return (
    <div className="ambient" aria-hidden="true">
      <i className="a1" />
      <i className="a2" />
      <i className="a3" />
      <i className="a4" />
    </div>
  );
}
