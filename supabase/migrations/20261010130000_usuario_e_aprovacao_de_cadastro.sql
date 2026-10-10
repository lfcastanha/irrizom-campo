-- Cadastro pelo próprio app, com login por nome de usuário e liberação pelo admin.
--
-- O Supabase Auth exige e-mail: o usuário "joao" entra como joao@irrizom.app (o app monta o e-mail).
-- Quem se cadastra fica com ativo = false e não enxerga nada até o admin liberar no painel.
-- Requer no Supabase: Authentication → Sign In / Providers → "Allow new users to sign up" ligado
-- e "Confirm email" desligado (o e-mail é só um identificador, ninguém recebe mensagem).

alter table public.perfis
  add column usuario text unique check (usuario ~ '^[a-z0-9._-]{3,30}$'),
  add column ativo   boolean not null default false;

-- Quem já existia antes desta migração continua com acesso.
update public.perfis set ativo = true;
update public.perfis p set usuario = split_part(u.email, '@', 1)
from auth.users u
where u.id = p.id and lower(u.email) like '%@irrizom.app'
  and split_part(lower(u.email), '@', 1) ~ '^[a-z0-9._-]{3,30}$';

-- Conta liberada (ou admin). Usada nas regras de acesso abaixo.
create or replace function public.eh_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and (ativo or papel = 'admin'));
$$;
revoke all on function public.eh_ativo() from public, anon;
grant execute on function public.eh_ativo() to authenticated;

-- Novo login: o usuário vem do e-mail (nunca dos metadados, que quem se cadastra controla).
-- Papel e liberação ficam sempre nos valores padrão; só o admin muda.
create or replace function public.criar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_usuario text := split_part(lower(new.email), '@', 1);
begin
  if lower(new.email) not like '%@irrizom.app' or v_usuario !~ '^[a-z0-9._-]{3,30}$' then
    v_usuario := null;
  end if;
  insert into public.perfis (id, nome, usuario)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    v_usuario)
  on conflict (id) do nothing;
  return new;
end $$;

-- Listas e cadastros: só conta liberada lê.
alter policy "equipes_leitura"           on public.equipes           using (public.eh_ativo());
alter policy "funcionarios_leitura"      on public.funcionarios      using (public.eh_ativo());
alter policy "obras_leitura"             on public.obras             using (public.eh_ativo());
alter policy "etapas_leitura"            on public.etapas            using (public.eh_ativo());
alter policy "motivos_parada_leitura"    on public.motivos_parada    using (public.eh_ativo());
alter policy "causas_retrabalho_leitura" on public.causas_retrabalho using (public.eh_ativo());

alter policy "registros_leitura" on public.registros
  using (public.eh_admin() or (public.eh_ativo() and (criado_por = auth.uid() or equipe_id = public.minha_equipe())));

alter policy "fotos_envio" on storage.objects
  with check (bucket_id = 'fotos' and public.eh_ativo());

-- Mesmo corpo da migração inicial, com a checagem de conta liberada.
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
  if not public.eh_ativo() then
    raise exception 'Seu cadastro ainda não foi liberado pelo coordenador';
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
