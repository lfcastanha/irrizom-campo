-- =====================================================================
-- IRRIZOM Campo — cadastro inicial (MODELO: troque pelos dados reais)
-- Rode no SQL Editor DEPOIS de supabase/migrations/20261007000000_estrutura_inicial.sql. Pode rodar por partes.
-- =====================================================================

-- 1. Equipes ----------------------------------------------------------
insert into public.equipes (nome) values
  ('Equipe 1'),
  ('Equipe 2');

-- 2. Funcionários (nome, função, equipe) -------------------------------
insert into public.funcionarios (nome, funcao, equipe_id) values
  ('João Silva',   'encarregado', (select id from public.equipes where nome = 'Equipe 1')),
  ('Pedro Souza',  'montador',    (select id from public.equipes where nome = 'Equipe 1')),
  ('Marcos Lima',  'ajudante',    (select id from public.equipes where nome = 'Equipe 1')),
  ('Carlos Rocha', 'encarregado', (select id from public.equipes where nome = 'Equipe 2')),
  ('Rafael Dias',  'ajudante',    (select id from public.equipes where nome = 'Equipe 2'));

-- 3. Custo da diária de cada um (diária + encargos + alimentação) ------
--    Só você (admin) enxerga esta tabela.
insert into public.funcionarios_custos (funcionario_id, custo_diaria)
select id, case funcao when 'encarregado' then 280 when 'montador' then 230 else 160 end
from public.funcionarios;
--    Depois ajuste um por um no Table Editor, se precisar.

-- 4. Obras ------------------------------------------------------------
--    tipo_sistema: gotejamento | aspersao_convencional | microaspersao | carretel | pivo | jardim_talude | outro
--    status: planejada | em_andamento | pausada | concluida | cancelada
insert into public.obras (codigo, cliente, propriedade, municipio, tipo_sistema, cultura, area_ha, status, data_inicio)
values ('2026-031', 'Fazenda Boa Vista', 'Talhão do café', 'Viçosa', 'gotejamento', 'café', 5.0, 'em_andamento', current_date);

-- 5. Valores do contrato e orçamento da obra ----------------------------
insert into public.obras_financeiro (obra_id, valor_contrato, orcado_mao_obra, orcado_material, orcado_transporte, horas_homem_orcadas)
values ((select id from public.obras where codigo = '2026-031'), 60000, 6000, 30000, 800, 200);

-- 6. Perfis dos logins --------------------------------------------------
--    Os encarregados podem se cadastrar pelo app (aba "Cadastrar") e você libera no painel.
--    Para criar à mão: Authentication → Users → "Add user" (marque "Auto Confirm User").
--    Use o e-mail USUARIO@irrizom.app: no app, a pessoa entra só com USUARIO.
--    O perfil é criado sozinho, mas bloqueado (ativo = false). Depois rode, trocando os e-mails:

-- Você como administrador:
update public.perfis set papel = 'admin', ativo = true, nome = 'Lucas'
where id = (select id from auth.users where email = 'SEU-EMAIL@exemplo.com');

-- Cada encarregado ligado à sua equipe:
update public.perfis
set ativo = true, nome = 'João (Equipe 1)', equipe_id = (select id from public.equipes where nome = 'Equipe 1')
where id = (select id from auth.users where email = 'equipe1@irrizom.app');

update public.perfis
set ativo = true, nome = 'Carlos (Equipe 2)', equipe_id = (select id from public.equipes where nome = 'Equipe 2')
where id = (select id from auth.users where email = 'equipe2@irrizom.app');

-- 7. Fechamento de uma obra (quando entregar) ----------------------------
-- insert into public.fechamentos (obra_id, custo_material_real, material_devolvido, outros_custos,
--   teste_pressao_ok, cuc_percentual, prazo_cumprido, satisfacao_cliente, indicaria, observacao)
-- values ((select id from public.obras where codigo = '2026-031'), 31200, 900, 450,
--   true, 91.5, true, 5, true, 'Entregue sem pendências');
-- update public.obras set status = 'concluida', data_entrega = current_date where codigo = '2026-031';

-- 8. Chamado depois da entrega (para medir retrabalho tardio) ------------
-- insert into public.chamados_pos_obra (obra_id, descricao, causa_id, horas_homem, custo_material)
-- values ((select id from public.obras where codigo = '2026-031'), 'Vazamento em conexão do cabeçal',
--   (select id from public.causas_retrabalho where nome = 'Erro de montagem'), 4, 35);
