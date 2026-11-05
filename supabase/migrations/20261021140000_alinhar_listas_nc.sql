-- Alinha as opções de NC à aba LISTAS_NC da planilha aprovada.
-- Também normaliza textos inseridos com mojibake e mantém os vínculos dos registros.
-- Para banco já configurado, este conteúdo pode ser colado no SQL Editor do Supabase.
begin;

-- Algumas instalações anteriores criaram este CHECK com "Nao" sem acento.
-- Removemos temporariamente para gravar e normalizar o valor oficial "Não".
alter table public.nc_origens
  drop constraint if exists nc_origens_evitavel_check;

-- Decodifica até duas camadas comuns de UTF-8 lido como Windows-1252.
create or replace function public.nc_corrigir_mojibake_migracao(p_texto text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_atual text := p_texto;
  v_proximo text;
  v_tentativa integer;
begin
  if v_atual is null then return null; end if;

  for v_tentativa in 1..2 loop
    if position('Ã' in v_atual) = 0
      and position('Â' in v_atual) = 0
      and position('â' in v_atual) = 0 then
      exit;
    end if;

    begin
      v_proximo := convert_from(convert_to(v_atual, 'WIN1252'), 'UTF8');
    exception when others then
      exit;
    end;

    exit when v_proximo = v_atual;
    v_atual := v_proximo;
  end loop;

  return v_atual;
end;
$$;

-- Garante as 28 origens e os valores das outras listas. Itens desativados
-- continuam desativados; novos valores começam ativos pelo padrão da tabela.
with nc_origens_oficiais(nome, area, evitavel, ordem) as (
  values
('Erro expedição – endereço incorreto', 'Expedição', 'Sim', 1),
  ('Erro expedição – mercadoria trocada ou embalada junto', 'Expedição', 'Sim', 2),
  ('Erro expedição – etiqueta ou pré-postagem', 'Expedição', 'Sim', 3),
  ('Embalagem inadequada / avaria por embalagem', 'Expedição', 'Sim', 4),
  ('Atraso de postagem', 'Expedição', 'Sim', 5),
  ('Postagem duplicada', 'Expedição', 'Sim', 6),
  ('Postagem sem NF', 'Expedição', 'Sim', 7),
  ('Erro de faturamento / NF (destinatário ou endereço)', 'Financeiro', 'Sim', 8),
  ('Erro da expedição e do financeiro', 'Expedição e Financeiro', 'Sim', 9),
  ('Erro vendedora – endereço incorreto', 'Comercial', 'Sim', 10),
  ('Tipo de frete incorreto (CIF/FOB)', 'Comercial', 'Sim', 11),
  ('Frete não cobrado na venda', 'Comercial', 'Sim', 12),
  ('Reverso sem autorização', 'Comercial', 'Sim', 13),
  ('Frete carona (pacote de terceiro com pedido da marca)', 'Comercial', 'Sim', 14),
  ('Mercadoria apreendida (fiscalização)', 'Fiscalização', 'A avaliar', 15),
  ('Extravio Correios', 'Correios', 'Não', 16),
  ('Avaria no transporte', 'Correios', 'Não', 17),
  ('Entregue para a pessoa errada', 'Correios', 'Não', 18),
  ('Consta entregue / não entregue no local', 'Correios', 'Não', 19),
  ('Endereço não localizado', 'Correios', 'Não', 20),
  ('Entregador não atendido', 'Cliente / destinatário', 'Não', 21),
  ('Cliente desconhecido', 'Cliente / destinatário', 'Não', 22),
  ('Entregue, porém cliente afirma que não recebeu', 'Cliente / destinatário', 'Não', 23),
  ('Mercadoria devolvida pelo destinatário', 'Cliente / destinatário', 'Não', 24),
  ('Não retirada no prazo (aguardando retirada)', 'Cliente / destinatário', 'Não', 25),
  ('Erro da/o cliente', 'Cliente / destinatário', 'Não', 26),
  ('Peça de outra marca recebida', 'Cliente / destinatário', 'Não', 27),
  ('Outro', 'A definir', 'A avaliar', 28)
)
insert into public.nc_origens (nome, area, evitavel, ordem)
select nome, area, evitavel, ordem from nc_origens_oficiais where true
on conflict (nome) do update
set area = excluded.area,
    evitavel = excluded.evitavel,
    ordem = excluded.ordem;

with nc_listas_oficiais(lista, valor, ordem) as (
  values
('area', 'Expedição', 1),
  ('area', 'Financeiro', 2),
  ('area', 'Expedição e Financeiro', 3),
  ('area', 'Comercial', 4),
  ('area', 'Fiscalização', 5),
  ('area', 'Correios', 6),
  ('area', 'Cliente / destinatário', 7),
  ('area', 'A definir', 8),
  ('tipo_saida', 'Venda', 1),
  ('tipo_saida', 'Conserto', 2),
  ('tipo_saida', 'Reenvio', 3),
  ('tipo_saida', 'Reverso', 4),
  ('tipo_saida', 'Brinde / envio especial', 5),
  ('tipo_saida', 'Recebimento (entrada)', 6),
  ('resolucao', 'Envio de nova mercadoria', 1),
  ('resolucao', 'Reenvio da mesma mercadoria', 2),
  ('resolucao', 'Crédito para a cliente', 3),
  ('resolucao', 'Devolução', 4),
  ('resolucao', 'Reverso', 5),
  ('resolucao', 'Resolvido com a vendedora', 6),
  ('resolucao', 'Multa paga', 7),
  ('resolucao', 'Mercadoria retirada no correio', 8),
  ('resolucao', 'Pedido de indenização aberto', 9),
  ('resolucao', 'Em análise', 10),
  ('resolucao', 'Sem ação necessária', 11),
  ('empresa', 'Alinare', 1),
  ('empresa', 'Artikler', 2),
  ('empresa', 'Azime', 3),
  ('empresa', 'Trice', 4),
  ('empresa', 'Novitah', 5),
  ('empresa', 'A identificar', 6),
  ('como_identificada', 'Conferência da embalagem', 1),
  ('como_identificada', 'Rastreio / Correios', 2),
  ('como_identificada', 'Reclamação da cliente', 3),
  ('como_identificada', 'Vendedora', 4),
  ('como_identificada', 'Recebimento / correspondências', 5),
  ('como_identificada', 'Conciliação de fatura', 6),
  ('como_identificada', 'Relatório VIPP', 7),
  ('como_identificada', 'Auditoria de processos', 8),
  ('como_identificada', 'Outro', 9),
  ('reembolso', 'Sim', 1),
  ('reembolso', 'Não', 2),
  ('reembolso', 'Em análise', 3),
  ('reembolso', 'Não se aplica', 4)
)
insert into public.nc_listas (lista, valor, ordem)
select lista, valor, ordem from nc_listas_oficiais where true
on conflict (lista, valor) do update
set ordem = excluded.ordem;

-- Corrige metadados de área/classificação que também possam estar corrompidos.
do $$
declare
  r record;
  v_area text;
  v_evitavel text;
begin
  for r in select nome, area, evitavel from public.nc_origens loop
    v_area := public.nc_corrigir_mojibake_migracao(r.area);
    v_evitavel := public.nc_corrigir_mojibake_migracao(r.evitavel);
    v_evitavel := case lower(btrim(v_evitavel))
      when 'sim' then 'Sim'
      when 'nao' then 'Não'
      when 'não' then 'Não'
      when 'a avaliar' then 'A avaliar'
      else v_evitavel
    end;
    if v_evitavel not in ('Sim', 'Não', 'A avaliar') then
      raise exception 'Classificação de evitável não reconhecida na origem "%": "%".', r.nome, r.evitavel;
    end if;
    if v_area is distinct from r.area or v_evitavel is distinct from r.evitavel then
      update public.nc_origens
      set area = v_area, evitavel = v_evitavel
      where nome = r.nome;
    end if;
  end loop;
end;
$$;

-- Corrige nomes corrompidos, variações antigas das quatro primeiras linhas e
-- atualiza os vínculos das NCs existentes (a FK também usa ON UPDATE CASCADE).
do $$
declare
  r record;
  v_nome text;
begin
  for r in select nome from public.nc_origens loop
    v_nome := public.nc_corrigir_mojibake_migracao(r.nome);
    v_nome := case v_nome
      when 'Erro de expedição –endereço incorreto' then 'Erro expedição – endereço incorreto'
      when 'Erro de expedição – endereço incorreto' then 'Erro expedição – endereço incorreto'
      when 'Erro expedição –endereço incorreto' then 'Erro expedição – endereço incorreto'
      when 'Erro de expedição -endereço incorreto' then 'Erro expedição – endereço incorreto'
      when 'Erro expedição - endereço incorreto' then 'Erro expedição – endereço incorreto'
      when 'Erro de expedição –mercadoria trocada ou embalada junto' then 'Erro expedição – mercadoria trocada ou embalada junto'
      when 'Erro de expedição – mercadoria trocada ou embalada junto' then 'Erro expedição – mercadoria trocada ou embalada junto'
      when 'Erro expedição –mercadoria trocada ou embalada junto' then 'Erro expedição – mercadoria trocada ou embalada junto'
      when 'Erro de expedição - mercadoria trocada ou embalada junto' then 'Erro expedição – mercadoria trocada ou embalada junto'
      when 'Erro de expedição –etiqueta ou pré-postagem' then 'Erro expedição – etiqueta ou pré-postagem'
      when 'Erro de expedição – etiqueta ou pré-postagem' then 'Erro expedição – etiqueta ou pré-postagem'
      when 'Erro expedição –etiqueta ou pré-postagem' then 'Erro expedição – etiqueta ou pré-postagem'
      when 'Erro da vendedora –endereço incorreto' then 'Erro vendedora – endereço incorreto'
      when 'Erro da vendedora – endereço incorreto' then 'Erro vendedora – endereço incorreto'
      when 'Erro vendedora –endereço incorreto' then 'Erro vendedora – endereço incorreto'
      else v_nome
    end;

    if v_nome is distinct from r.nome then
      if exists (select 1 from public.nc_origens where nome = v_nome) then
        update public.nao_conformidades set origem = v_nome where origem = r.nome;
        delete from public.nc_origens where nome = r.nome;
      else
        update public.nc_origens set nome = v_nome where nome = r.nome;
      end if;
    end if;
  end loop;
end;
$$;

-- Corrige os valores das listas e os registros que já os utilizam.
do $$
declare
  r record;
  v_valor text;
begin
  for r in select lista, valor from public.nc_listas loop
    v_valor := public.nc_corrigir_mojibake_migracao(r.valor);
    if v_valor is distinct from r.valor then
      if exists (select 1 from public.nc_listas where lista = r.lista and valor = v_valor) then
        case r.lista
          when 'tipo_saida' then update public.nao_conformidades set tipo_saida = v_valor where tipo_saida = r.valor;
          when 'resolucao' then update public.nao_conformidades set resolucao = v_valor where resolucao = r.valor;
          when 'empresa' then update public.nao_conformidades set empresa = v_valor where empresa = r.valor;
          when 'como_identificada' then update public.nao_conformidades set como_identificada = v_valor where como_identificada = r.valor;
          when 'reembolso' then update public.nao_conformidades set reembolso_correios = v_valor where reembolso_correios = r.valor;
          else null;
        end case;
        delete from public.nc_listas where lista = r.lista and valor = r.valor;
      else
        update public.nc_listas set valor = v_valor where lista = r.lista and valor = r.valor;
      end if;
    end if;
  end loop;
end;
$$;

alter table public.nc_origens
  add constraint nc_origens_evitavel_check check (evitavel in ('Sim', 'Não', 'A avaliar'));

drop function public.nc_corrigir_mojibake_migracao(text);
commit;
