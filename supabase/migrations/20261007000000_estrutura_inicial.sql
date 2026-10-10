-- =====================================================================
-- IRRIZOM Campo — estrutura de dados (Supabase / PostgreSQL)
-- Rode este arquivo inteiro uma única vez no SQL Editor do Supabase.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. CADASTROS
-- ---------------------------------------------------------------------

create table public.equipes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  ativa      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- Um perfil para cada login (criado automaticamente pelo gatilho abaixo).
-- papel 'admin' = você/gestão (vê tudo e o painel); 'encarregado' = registra o dia da equipe.
create table public.perfis (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text not null,
  papel      text not null default 'encarregado' check (papel in ('admin', 'encarregado')),
  equipe_id  uuid references public.equipes (id),
  criado_em  timestamptz not null default now()
);

create table public.funcionarios (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  funcao         text not null default 'ajudante'
                 check (funcao in ('encarregado', 'montador', 'ajudante', 'motorista', 'outro')),
  equipe_id      uuid references public.equipes (id),
  ativo          boolean not null default true,
  data_admissao  date,
  criado_em      timestamptz not null default now()
);

-- Custos ficam numa tabela separada que só o admin enxerga.
create table public.funcionarios_custos (
  funcionario_id  uuid primary key references public.funcionarios (id) on delete cascade,
  custo_diaria    numeric(10,2) not null check (custo_diaria >= 0),  -- diária + encargos + alimentação
  atualizado_em   timestamptz not null default now()
);

create table public.obras (
  id            uuid primary key default gen_random_uuid(),
  codigo        text unique,                       -- ex.: 2026-031
  cliente       text not null,
  propriedade   text,
  municipio     text,
  tipo_sistema  text not null check (tipo_sistema in
                ('gotejamento', 'aspersao_convencional', 'microaspersao', 'carretel',
                 'pivo', 'jardim_talude', 'outro')),
  cultura       text,
  area_ha       numeric(10,2) check (area_ha > 0),
  status        text not null default 'em_andamento' check (status in
                ('planejada', 'em_andamento', 'pausada', 'concluida', 'cancelada')),
  data_inicio   date,
  data_entrega  date,
  criado_em     timestamptz not null default now()
);

-- Valores do contrato e do orçamento (só admin).
create table public.obras_financeiro (
  obra_id               uuid primary key references public.obras (id) on delete cascade,
  valor_contrato        numeric(12,2),
  orcado_mao_obra       numeric(12,2),
  orcado_material       numeric(12,2),
  orcado_transporte     numeric(12,2),
  horas_homem_orcadas   numeric(10,1)
);

-- ---------------------------------------------------------------------
-- 2. LISTAS FIXAS (o que aparece como botões no formulário)
-- ---------------------------------------------------------------------

create table public.etapas (
  id       serial primary key,
  nome     text not null unique,
  unidade  text not null,          -- m, un, %
  ordem    int not null default 0,
  ativa    boolean not null default true
);

create table public.motivos_parada (
  id     serial primary key,
  nome   text not null unique,
  ativo  boolean not null default true
);

create table public.causas_retrabalho (
  id     serial primary key,
  nome   text not null unique,
  ativo  boolean not null default true
);

create table public.parametros (
  chave      text primary key,
  valor      numeric not null,
  descricao  text
);

-- ---------------------------------------------------------------------
-- 3. REGISTRO DIÁRIO DE CAMPO
-- ---------------------------------------------------------------------

create table public.registros (
  id                   uuid primary key,          -- gerado no celular (evita duplicar no reenvio)
  obra_id              uuid not null references public.obras (id),
  equipe_id            uuid references public.equipes (id),
  data                 date not null,
  hora_chegada         time not null,
  hora_saida           time not null,
  etapa_id             int not null references public.etapas (id),
  avanco               numeric(12,2) not null default 0 check (avanco >= 0),
  horas_parada         numeric(4,1) not null default 0 check (horas_parada >= 0),
  motivo_parada_id     int references public.motivos_parada (id),
  horas_retrabalho     numeric(4,1) not null default 0 check (horas_retrabalho >= 0),
  causa_retrabalho_id  int references public.causas_retrabalho (id),
  km_rodados           numeric(8,1) check (km_rodados >= 0),
  observacao           text,
  latitude             double precision,
  longitude            double precision,
  criado_por           uuid not null references auth.users (id),
  preenchido_em        timestamptz not null,       -- hora do celular
  recebido_em          timestamptz not null default now(),
  constraint jornada_valida      check (hora_saida > hora_chegada),
  constraint parada_com_motivo   check (horas_parada = 0 or motivo_parada_id is not null),
  constraint retrabalho_com_causa check (horas_retrabalho = 0 or causa_retrabalho_id is not null)
);

create index registros_obra_data_idx   on public.registros (obra_id, data);
create index registros_data_idx        on public.registros (data);
create index registros_equipe_data_idx on public.registros (equipe_id, data);

create table public.registro_funcionarios (
  registro_id     uuid not null references public.registros (id) on delete cascade,
  funcionario_id  uuid not null references public.funcionarios (id),
  primary key (registro_id, funcionario_id)
);
create index registro_funcionarios_func_idx on public.registro_funcionarios (funcionario_id);

create table public.registro_fotos (
  id           uuid primary key default gen_random_uuid(),
  registro_id  uuid not null references public.registros (id) on delete cascade,
  caminho      text not null unique                -- caminho no bucket "fotos"
);

-- ---------------------------------------------------------------------
-- 4. FECHAMENTO DA OBRA E PÓS-OBRA (preenchidos por você, não pela equipe)
-- ---------------------------------------------------------------------

create table public.fechamentos (
  obra_id                 uuid primary key references public.obras (id) on delete cascade,
  data_fechamento         date not null default current_date,
  custo_material_real     numeric(12,2),
  material_devolvido      numeric(12,2),            -- valor de sobra que voltou ao estoque
  outros_custos           numeric(12,2),            -- hospedagem, máquina alugada etc.
  teste_pressao_ok        boolean,
  cuc_percentual          numeric(5,2) check (cuc_percentual between 0 and 100),
  prazo_cumprido          boolean,
  satisfacao_cliente      int check (satisfacao_cliente between 1 and 5),
  indicaria               boolean,
  observacao              text
);

create table public.chamados_pos_obra (
  id              uuid primary key default gen_random_uuid(),
  obra_id         uuid not null references public.obras (id) on delete cascade,
  data            date not null default current_date,
  descricao       text,
  causa_id        int references public.causas_retrabalho (id),
  horas_homem     numeric(6,1),
  custo_material  numeric(12,2),
  criado_em       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. FUNÇÕES AUXILIARES E GATILHO DE NOVO USUÁRIO
-- ---------------------------------------------------------------------

create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'admin');
$$;

create or replace function public.minha_equipe()
returns uuid language sql stable security definer set search_path = public as $$
  select equipe_id from public.perfis where id = auth.uid();
$$;

create or replace function public.criar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil();

-- Recebe o registro do dia vindo do celular, tudo numa transação.
-- Se o mesmo registro chegar duas vezes (reenvio sem sinal), a segunda é ignorada.
create or replace function public.registrar_dia(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id      uuid := (p ->> 'id')::uuid;
  v_user    uuid := auth.uid();
  v_equipe  uuid;
begin
  if v_user is null then
    raise exception 'Usuário não autenticado';
  end if;
  if jsonb_array_length(coalesce(p -> 'funcionarios', '[]'::jsonb)) = 0 then
    raise exception 'Marque pelo menos uma pessoa que trabalhou';
  end if;

  select equipe_id into v_equipe from public.perfis where id = v_user;
  if public.eh_admin() and coalesce(p ->> 'equipe_id', '') <> '' then
    v_equipe := (p ->> 'equipe_id')::uuid;
  end if;

  insert into public.registros (
    id, obra_id, equipe_id, data, hora_chegada, hora_saida, etapa_id, avanco,
    horas_parada, motivo_parada_id, horas_retrabalho, causa_retrabalho_id,
    km_rodados, observacao, latitude, longitude, criado_por, preenchido_em)
  values (
    v_id,
    (p ->> 'obra_id')::uuid,
    v_equipe,
    (p ->> 'data')::date,
    (p ->> 'hora_chegada')::time,
    (p ->> 'hora_saida')::time,
    (p ->> 'etapa_id')::int,
    coalesce((p ->> 'avanco')::numeric, 0),
    coalesce((p ->> 'horas_parada')::numeric, 0),
    nullif(p ->> 'motivo_parada_id', '')::int,
    coalesce((p ->> 'horas_retrabalho')::numeric, 0),
    nullif(p ->> 'causa_retrabalho_id', '')::int,
    nullif(p ->> 'km_rodados', '')::numeric,
    nullif(trim(p ->> 'observacao'), ''),
    nullif(p ->> 'latitude', '')::double precision,
    nullif(p ->> 'longitude', '')::double precision,
    v_user,
    coalesce((p ->> 'preenchido_em')::timestamptz, now()))
  on conflict (id) do nothing;

  if not found then
    return v_id;  -- já tinha sido recebido antes
  end if;

  insert into public.registro_funcionarios (registro_id, funcionario_id)
  select distinct v_id, x::uuid
  from jsonb_array_elements_text(p -> 'funcionarios') as x;

  insert into public.registro_fotos (registro_id, caminho)
  select v_id, x
  from jsonb_array_elements_text(coalesce(p -> 'fotos', '[]'::jsonb)) as x
  where x like v_id::text || '/%'
  on conflict (caminho) do nothing;

  return v_id;
end $$;

revoke all on function public.registrar_dia(jsonb) from public, anon;
grant execute on function public.registrar_dia(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 6. REGRAS DE ACESSO (Row Level Security)
-- ---------------------------------------------------------------------

alter table public.equipes               enable row level security;
alter table public.perfis                enable row level security;
alter table public.funcionarios          enable row level security;
alter table public.funcionarios_custos   enable row level security;
alter table public.obras                 enable row level security;
alter table public.obras_financeiro      enable row level security;
alter table public.etapas                enable row level security;
alter table public.motivos_parada        enable row level security;
alter table public.causas_retrabalho     enable row level security;
alter table public.parametros            enable row level security;
alter table public.registros             enable row level security;
alter table public.registro_funcionarios enable row level security;
alter table public.registro_fotos        enable row level security;
alter table public.fechamentos           enable row level security;
alter table public.chamados_pos_obra     enable row level security;

-- Cadastros e listas: qualquer usuário logado lê; só admin altera.
do $$
declare t text;
begin
  foreach t in array array['equipes', 'funcionarios', 'obras', 'etapas', 'motivos_parada', 'causas_retrabalho']
  loop
    execute format('create policy "%1$s_leitura" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "%1$s_admin" on public.%1$I for all to authenticated using (public.eh_admin()) with check (public.eh_admin())', t);
  end loop;
end $$;

-- Dados financeiros e de gestão: só admin.
do $$
declare t text;
begin
  foreach t in array array['funcionarios_custos', 'obras_financeiro', 'parametros', 'fechamentos', 'chamados_pos_obra']
  loop
    execute format('create policy "%1$s_admin" on public.%1$I for all to authenticated using (public.eh_admin()) with check (public.eh_admin())', t);
  end loop;
end $$;

-- Perfis: cada um vê o seu; admin vê e altera todos.
create policy "perfis_proprio" on public.perfis for select to authenticated using (id = auth.uid());
create policy "perfis_admin"   on public.perfis for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- Registros: encarregado vê os da própria equipe; admin vê e corrige tudo.
-- (A inserção acontece pela função registrar_dia.)
create policy "registros_leitura" on public.registros for select to authenticated
  using (public.eh_admin() or criado_por = auth.uid() or equipe_id = public.minha_equipe());
create policy "registros_admin" on public.registros for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

create policy "registro_funcionarios_leitura" on public.registro_funcionarios for select to authenticated
  using (exists (select 1 from public.registros r where r.id = registro_id));
create policy "registro_funcionarios_admin" on public.registro_funcionarios for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

create policy "registro_fotos_leitura" on public.registro_fotos for select to authenticated
  using (exists (select 1 from public.registros r where r.id = registro_id));
create policy "registro_fotos_admin" on public.registro_fotos for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- ---------------------------------------------------------------------
-- 7. FOTOS (Supabase Storage, bucket privado)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "fotos_envio" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos');
create policy "fotos_leitura" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (owner_id = (select auth.uid()::text) or public.eh_admin()));
create policy "fotos_admin" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.eh_admin());

-- ---------------------------------------------------------------------
-- 8. INDICADORES (views — respeitam as regras de acesso de quem consulta)
-- ---------------------------------------------------------------------

-- Um registro por linha, já com horas-homem calculadas.
create or replace view public.v_registros with (security_invoker = true) as
select
  r.id, r.data, r.obra_id, o.codigo as obra_codigo, o.cliente, o.propriedade,
  o.tipo_sistema, o.area_ha,
  r.equipe_id, e.nome as equipe,
  r.etapa_id, et.nome as etapa, et.unidade, r.avanco,
  r.hora_chegada, r.hora_saida,
  round(j.horas_jornada, 2)                                   as horas_jornada,
  n.pessoas,
  round(j.horas_jornada * n.pessoas, 2)                       as horas_homem,
  round(least(r.horas_parada, j.horas_jornada) * n.pessoas, 2) as hh_parada,
  round(least(r.horas_retrabalho, j.horas_jornada) * n.pessoas, 2) as hh_retrabalho,
  r.horas_parada, mp.nome as motivo_parada,
  r.horas_retrabalho, cr.nome as causa_retrabalho,
  r.km_rodados, r.observacao, r.latitude, r.longitude,
  p.nome as preenchido_por, r.preenchido_em, r.recebido_em,
  (select count(*) from public.registro_fotos f where f.registro_id = r.id) as fotos
from public.registros r
join public.obras o  on o.id = r.obra_id
join public.etapas et on et.id = r.etapa_id
left join public.equipes e on e.id = r.equipe_id
left join public.motivos_parada mp on mp.id = r.motivo_parada_id
left join public.causas_retrabalho cr on cr.id = r.causa_retrabalho_id
left join public.perfis p on p.id = r.criado_por
cross join lateral (
  select greatest(
    extract(epoch from (r.hora_saida - r.hora_chegada)) / 3600.0
      - coalesce((select valor from public.parametros where chave = 'horas_almoco'), 1),
    0) as horas_jornada
) j
cross join lateral (
  select count(*) as pessoas from public.registro_funcionarios rf where rf.registro_id = r.id
) n;

-- Diárias pagas por obra (cada pessoa conta uma diária por dia em cada obra).
create or replace view public.v_custo_mao_obra with (security_invoker = true) as
select d.obra_id,
       count(*)                          as diarias,
       sum(coalesce(fc.custo_diaria, 0)) as custo_mao_obra,
       count(*) filter (where fc.custo_diaria is null) as diarias_sem_custo
from (
  select distinct r.obra_id, r.data, rf.funcionario_id
  from public.registros r
  join public.registro_funcionarios rf on rf.registro_id = r.id
) d
left join public.funcionarios_custos fc on fc.funcionario_id = d.funcionario_id
group by d.obra_id;

-- Painel por obra: tempo, produtividade, custos, margem e qualidade.
create or replace view public.v_obras_indicadores with (security_invoker = true) as
with agg as (
  select obra_id,
         min(data) as primeiro_dia, max(data) as ultimo_dia,
         count(distinct data) as dias_trabalhados,
         sum(horas_homem) as hh, sum(hh_parada) as hh_parada, sum(hh_retrabalho) as hh_retrabalho,
         sum(coalesce(km_rodados, 0)) as km
  from public.v_registros
  group by obra_id
),
ch as (
  select c.obra_id, count(*) as chamados,
         sum(coalesce(c.custo_material, 0)) as custo_material_chamados,
         sum(coalesce(c.horas_homem, 0)) as hh_chamados
  from public.chamados_pos_obra c
  group by c.obra_id
),
base as (
  select o.id as obra_id, o.codigo, o.cliente, o.propriedade, o.tipo_sistema, o.cultura,
         o.area_ha, o.status, o.data_inicio, o.data_entrega,
         a.primeiro_dia, a.ultimo_dia, coalesce(a.dias_trabalhados, 0) as dias_trabalhados,
         coalesce(a.hh, 0) as hh, coalesce(a.hh_parada, 0) as hh_parada,
         coalesce(a.hh_retrabalho, 0) as hh_retrabalho, coalesce(a.km, 0) as km,
         coalesce(a.km, 0) * coalesce((select valor from public.parametros where chave = 'custo_km'), 0) as custo_transporte,
         coalesce(cm.custo_mao_obra, 0) as custo_mao_obra, coalesce(cm.diarias_sem_custo, 0) as diarias_sem_custo,
         f.valor_contrato, f.orcado_mao_obra, f.orcado_material, f.orcado_transporte, f.horas_homem_orcadas,
         fe.custo_material_real, fe.material_devolvido, fe.outros_custos,
         fe.teste_pressao_ok, fe.cuc_percentual, fe.prazo_cumprido, fe.satisfacao_cliente, fe.indicaria,
         coalesce(ch.chamados, 0) as chamados_pos_obra,
         coalesce(ch.custo_material_chamados, 0) as custo_material_chamados
  from public.obras o
  left join agg a on a.obra_id = o.id
  left join public.v_custo_mao_obra cm on cm.obra_id = o.id
  left join public.obras_financeiro f on f.obra_id = o.id
  left join public.fechamentos fe on fe.obra_id = o.id
  left join ch on ch.obra_id = o.id
)
select b.*,
  round(b.hh / nullif(b.area_ha, 0), 1)                         as hh_por_ha,
  round(100 * b.hh_parada / nullif(b.hh, 0), 1)                 as pct_parado,
  round(100 * b.hh_retrabalho / nullif(b.hh, 0), 1)             as pct_retrabalho,
  round(b.custo_mao_obra * b.hh_retrabalho / nullif(b.hh, 0), 2) as custo_retrabalho_estimado,
  round(100 * (b.hh - b.horas_homem_orcadas) / nullif(b.horas_homem_orcadas, 0), 1) as desvio_hh_pct,
  t.custo_total,
  round(t.custo_total / nullif(b.area_ha, 0), 2)                as custo_por_ha,
  round(b.valor_contrato - t.custo_total, 2)                    as margem,
  round(100 * (b.valor_contrato - t.custo_total) / nullif(b.valor_contrato, 0), 1) as margem_pct
from base b
cross join lateral (
  select round(b.custo_mao_obra + b.custo_transporte
               + coalesce(b.custo_material_real, b.orcado_material, 0)
               - coalesce(b.material_devolvido, 0)
               + coalesce(b.outros_custos, 0)
               + b.custo_material_chamados, 2) as custo_total
) t;

-- Produtividade: quanto cada etapa avança por homem-hora produtiva.
create or replace view public.v_produtividade_etapa with (security_invoker = true) as
select date_trunc('month', data)::date as mes, tipo_sistema, equipe, etapa, unidade,
       sum(avanco) as avanco,
       round(sum(horas_homem - hh_parada - hh_retrabalho), 1) as hh_produtiva,
       round(sum(avanco) / nullif(sum(horas_homem - hh_parada - hh_retrabalho), 0), 2) as avanco_por_hh
from public.v_registros
group by 1, 2, 3, 4, 5;

-- ---------------------------------------------------------------------
-- 9. LISTAS INICIAIS (edite à vontade no Table Editor)
-- ---------------------------------------------------------------------

insert into public.etapas (nome, unidade, ordem) values
  ('Abertura de valas',                 'm',  10),
  ('Linha principal / adutora',         'm',  20),
  ('Linhas laterais',                   'm',  30),
  ('Emissores / aspersores',            'un', 40),
  ('Cabeçal / filtragem',               '%',  50),
  ('Bombeamento / casa de bomba',       '%',  60),
  ('Elétrica / automação',              '%',  70),
  ('Fechamento de valas',               'm',  80),
  ('Teste e ajustes',                   '%',  90),
  ('Acabamento / limpeza',              '%', 100),
  ('Outro',                             '%', 999);

insert into public.motivos_parada (nome) values
  ('Falta de material'), ('Chuva'), ('Cliente / energia / acesso'),
  ('Ferramenta ou equipamento'), ('Espera por máquina'), ('Deslocamento longo'), ('Outro');

insert into public.causas_retrabalho (nome) values
  ('Erro de projeto'), ('Erro de montagem'), ('Material defeituoso'),
  ('Mudança pedida pelo cliente'), ('Levantamento de campo incompleto'),
  ('Dano por terceiros / máquina'), ('Outro');

insert into public.parametros (chave, valor, descricao) values
  ('custo_km',     1.50, 'R$ por km rodado (combustível + desgaste do veículo) — AJUSTE'),
  ('horas_almoco', 1.0,  'Horas de almoço descontadas da jornada');
