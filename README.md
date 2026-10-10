# IRRIZOM Campo

App de registro diário das equipes de montagem + painel de gestão.
Funciona sem sinal no celular, envia sozinho quando a internet volta.

- **Encarregado** (no celular): preenche o dia da equipe em ~1–2 minutos.
- **Admin** (você): vê o painel com adesão, horas-homem, paradas, retrabalho, produtividade, custos e margem por obra.

```
irrizom-campo/
├── CLAUDE.md                 ← instruções do projeto para o Claude Code
├── supabase/
│   ├── migrations/           ← estrutura do banco, uma mudança por arquivo
│   │   └── 20261007000000_estrutura_inicial.sql
│   └── cadastro_inicial.sql  ← modelo de cadastro (equipes, pessoas, obras, logins)
├── src/app/page.tsx          ← formulário do dia
├── src/app/painel/page.tsx   ← painel de gestão
├── src/app/login/page.tsx    ← login
├── src/lib/fila.ts           ← fila offline e envio
└── public/sw.js              ← faz o app abrir sem internet
```

---

## Passo a passo

Você vai precisar de um computador para os passos 1 a 5 (≈ 1h30 na primeira vez).

### 1. Criar o banco no Supabase (15 min)

1. Crie uma conta em **supabase.com** → **New project**.
   - Nome: `irrizom-campo`
   - Região: **South America (São Paulo)** — mais rápido daqui.
   - Guarde a senha do banco num lugar seguro.
2. No menu lateral, abra **SQL Editor** → **New query**.
3. Cole o conteúdo inteiro de `supabase/migrations/20261007000000_estrutura_inicial.sql` e clique em **Run**.
   Deve aparecer "Success. No rows returned".
4. Confira em **Table Editor**: devem existir as tabelas `obras`, `registros`, `etapas` etc.,
   e em **Storage** um bucket chamado `fotos`.

### 2. Cadastrar equipes, pessoas e obras (20 min)

1. Abra `supabase/cadastro_inicial.sql`, troque os nomes de exemplo pelos reais.
2. Rode as partes 1 a 5 no SQL Editor.
3. Ajuste o custo do km em **Table Editor → parametros → custo_km**
   (combustível + desgaste do veículo, em R$/km).

> Dia a dia, para cadastrar obra nova ou pessoa nova, use o **Table Editor** (é como uma planilha).
> Obras com status `em_andamento` ou `planejada` aparecem no celular; mude para `concluida` ao entregar.

### 3. Criar os logins (10 min)

Um login **por equipe** (quem usa é o encarregado), mais o seu.

1. **Authentication → Users → Add user → Create new user**.
2. E-mail e senha; marque **Auto Confirm User**.
   - O e-mail não precisa existir: `equipe1@irrizom.app` funciona.
   - Use uma senha simples de digitar no celular (ela só é pedida uma vez).
3. Crie o seu com seu e-mail real.
4. Rode a parte 6 do `cadastro_inicial.sql` trocando os e-mails: isso torna você **admin**
   e liga cada encarregado à sua equipe.

### 4. Testar no seu computador (opcional, 15 min)

Precisa do **Node.js 20+** (nodejs.org).

```bash
cd irrizom-campo
npm install
cp .env.example .env.local     # no Windows: copy .env.example .env.local
```

Em `.env.local`, preencha com os dados de **Project Settings → API Keys** do Supabase:

- `NEXT_PUBLIC_SUPABASE_URL` → Project URL
- `NEXT_PUBLIC_SUPABASE_KEY` → **publishable key** (ou "anon key" em projetos antigos)

> ⚠️ Nunca use a chave **secret / service_role** no app. A publishable é pública por natureza;
> quem protege os dados são as regras de acesso definidas nas migrações.

```bash
npm run dev
```

Abra http://localhost:3000, entre com o login de uma equipe e faça um registro de teste.
Depois entre com o seu login e abra http://localhost:3000/painel.

### 5. Publicar na Vercel (15 min)

1. Crie um repositório **privado** no GitHub e suba a pasta
   (pelo GitHub Desktop é o mais simples, ou `git init`, `git add .`, `git commit`, `git push`).
   O `.gitignore` já impede que o `.env.local` vá junto.
2. Em **vercel.com** → **Add New → Project** → importe o repositório.
3. Em **Environment Variables**, cadastre as mesmas duas variáveis do passo 4.
4. **Deploy**. Você recebe um endereço como `irrizom-campo.vercel.app`.
5. No Supabase, em **Authentication → URL Configuration**, coloque esse endereço em **Site URL**.

A cada `git push`, a Vercel publica a versão nova sozinha.

### 6. Instalar nos celulares (5 min por celular)

Com o celular **com internet**:

1. Abra o endereço da Vercel.
   - **Android (Chrome):** menu ⋮ → **Adicionar à tela inicial** / **Instalar app**.
   - **iPhone (Safari):** botão Compartilhar → **Adicionar à Tela de Início**.
2. Abra pelo ícone, entre com o login da equipe.
3. Permita a **localização** quando pedir (serve para confirmar o local da obra).
4. **Teste sem sinal ali mesmo:** ative o modo avião, feche e abra o app, preencha um registro
   de teste → deve aparecer "Guardado no celular". Desative o modo avião → em segundos vira
   "enviado". Apague o teste depois no Table Editor (`registros`).

### 7. Piloto (2 semanas)

1. Comece com **uma equipe**. Treine o encarregado na obra, no fim do dia, uma vez.
2. Cronometre: se passar de 2 minutos, corte ou simplifique campos.
3. Olhe o painel todo dia de manhã: a tabela "Quem já registrou" mostra quem faltou ontem.
4. Na primeira semana, mostre para a equipe os números dela. É o que faz o registro pegar.
5. Ajuste as listas (etapas, motivos, causas) no Table Editor; o celular atualiza sozinho
   na próxima vez que abrir com sinal.
6. Depois expanda para as outras equipes.

### 8. Rotina de gestão

| Quando | O quê |
|---|---|
| Todo dia | Painel → "Quem já registrou". Cobrar no mesmo dia quem faltou. |
| Toda semana | Paradas por motivo (ex.: falta de material recorrente → mudar a separação de material). |
| Ao abrir obra | Cadastrar em `obras` e o orçamento em `obras_financeiro` (inclua horas-homem orçadas). |
| Ao entregar obra | Preencher `fechamentos` (material real, teste de pressão, CUC, satisfação) e mudar status para `concluida`. |
| Chamado pós-obra | Registrar em `chamados_pos_obra`. |
| Todo mês | Baixar CSV do painel; revisar custo/ha e margem por tipo de sistema; ajustar os próximos orçamentos. |

---

## Como os números são calculados

- **Horas-homem do dia** = (saída − chegada − almoço) × pessoas marcadas. O almoço vem de `parametros.horas_almoco` (padrão 1 h).
- **HH parada / retrabalho** = horas informadas × pessoas.
- **Produtividade** = avanço ÷ horas-homem produtivas (total − parada − retrabalho).
- **Custo de mão de obra** = soma das diárias (`funcionarios_custos`) de quem trabalhou, uma diária por pessoa por dia por obra.
- **Transporte** = km × `parametros.custo_km`.
- **Custo total** = mão de obra + transporte + material (real do fechamento; antes dele, o orçado) − material devolvido + outros custos + material de chamados pós-obra.
- **Margem** = valor do contrato − custo total.

Todas essas contas estão em views no banco (`v_registros`, `v_obras_indicadores`,
`v_produtividade_etapa`, `v_custo_mao_obra`). Dá para consultar direto pelo SQL Editor
ou conectar R/Python/Power BI/Looker Studio ao banco.

## Segurança

- Encarregado só vê obras, listas e os registros **da própria equipe**. Não vê custos, contratos nem margem.
- Só o admin vê o painel, custos, fotos de todas as equipes e pode corrigir registros.
- Fotos ficam num bucket privado; o painel gera links temporários (1 h).
- Um registro reenviado várias vezes (sinal ruim) entra **uma vez só**.

## Limites desta versão e próximos passos

- Cadastro de obras/pessoas e fechamento são feitos pelo Table Editor do Supabase. Próximo passo natural: telas para isso no painel.
- Encarregado não edita um registro já enviado; correções são feitas por você no Table Editor.
- Uma etapa principal por registro. Se a equipe fez duas coisas grandes no dia, envia dois registros
  ("Registrar outra obra ou etapa"), dividindo o horário.
- Ideias para depois: lembrete automático por WhatsApp para equipes sem registro às 18h,
  login por código no WhatsApp, foto do hodômetro, relatório semanal automático por e-mail.

## Custos

Os planos gratuitos do Supabase e da Vercel atendem bem 8–10 pessoas.
As fotos são reduzidas no celular (~200 KB cada); 1 GB de armazenamento gratuito ≈ 5.000 fotos.
Atenção: projetos gratuitos do Supabase **pausam após 7 dias sem uso** — com registros diários isso não acontece,
mas se parar de usar por um tempo, entre no painel do Supabase e clique em "Restore".
