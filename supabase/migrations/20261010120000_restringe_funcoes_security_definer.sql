-- Tira das funções SECURITY DEFINER o EXECUTE que o Postgres dá a todos por padrão.
-- Apontado pelo Security Advisor: sem isso, qualquer um sem login podia chamá-las via /rest/v1/rpc.
-- Todas as políticas são "to authenticated", então o anon não precisa de nenhuma delas.

-- Usadas nas políticas de RLS e em registrar_dia: só usuário logado.
revoke all on function public.eh_admin()     from public, anon;
revoke all on function public.minha_equipe() from public, anon;
grant execute on function public.eh_admin()     to authenticated;
grant execute on function public.minha_equipe() to authenticated;

-- Só o gatilho ao_criar_usuario usa; ninguém chama direto.
revoke all on function public.criar_perfil() from public, anon, authenticated;
