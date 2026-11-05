# Modo de demonstração

Disponível apenas com Vite em desenvolvimento (`import.meta.env.DEV`). Os perfis e os registros são fictícios. As leituras e alterações passam pelos adaptadores desta pasta e ficam no `localStorage` deste navegador; não são enviadas ao Supabase. **Reiniciar** apaga as alterações locais e restaura a massa inicial.

## Remover depois da apresentação

1. Apague esta pasta `src/demo`.
2. Em `src/services/apiService.ts`, `src/services/authService.ts` e `src/services/ncService.ts`, remova os imports do modo demo e os respectivos `Proxy`, mantendo os objetos Supabase como exports padrão.
3. Em `src/context/AuthContext.tsx`, remova o estado e as ações de demonstração e restaure o efeito normal de sessão.
4. Em `src/pages/LoginPage.tsx`, remova o botão de demonstração. Em `src/components/admin/AdminLayout.tsx`, remova `DemoSwitcher`; em `src/components/auth/PerfilButton.tsx`, remova o tratamento `isDemo` (inclui o item "Reiniciar demonstração" e o import de `demoDatabase`).
5. Apague as regras `.demo-*` e `.login-demo` de `src/styles/design.css`.

