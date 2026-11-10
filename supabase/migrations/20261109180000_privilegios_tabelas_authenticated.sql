-- Privilégios de tabela: authenticated não tem TRUNCATE, REFERENCES nem TRIGGER nas tabelas de public.
--
-- O dump remoto (20260828171717_remote_commit.sql) concede ALL a anon e authenticated nas tabelas do
-- schema public. A RLS e os privilégios explícitos (SELECT, INSERT, UPDATE, DELETE) controlam o acesso
-- dos usuários, mas TRUNCATE não passa pela RLS, e REFERENCES e TRIGGER não são usados pela aplicação.
-- Nenhum fluxo do sistema depende desses três privilégios para usuários: as migrations rodam como dono.
--
-- Correção incremental: afeta só as tabelas e views que já existem. Verificado por
-- supabase/tests/seguranca.test.mjs ("authenticated não tem TRUNCATE, REFERENCES nem TRIGGER...").
-- ─────────────────────────────────────────────────────────────────────────────

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
