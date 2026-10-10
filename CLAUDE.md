# IRRIZOM Campo

App de registro diário das equipes de montagem de irrigação da IRRIZOM e painel de gestão.
O encarregado de cada equipe preenche o dia no celular (1–2 min); o coordenador (admin) acompanha no painel.

## Stack
- Next.js (App Router) com `output: 'export'` → site estático hospedado na Vercel. Não há servidor próprio:
  o navegador fala direto com o Supabase.
- Supabase: Postgres + Auth (e-mail/senha) + Storage (bucket privado `fotos`).
- PWA offline: `public/sw.js` guarda o app; `src/lib/fila.ts` guarda registros e fotos no IndexedDB e envia quando há sinal.
- TypeScript estrito. Sem biblioteca de UI; estilos em `src/app/globals.css`.

## Comandos
- `npm run dev` — desenvolvimento em http://localhost:3000 (precisa de `.env.local`, ver `.env.example`)
- `npm run build` — gera `out/`; rodar antes de todo commit para checar tipos
- O service worker só registra em produção: para testar offline, `npm run build` e `npx serve out`

## Estrutura
- `src/app/page.tsx` — formulário do dia (encarregado)
- `src/app/painel/page.tsx` — painel (só admin)
- `src/app/login/page.tsx` — login
- `src/lib/dados.ts` — listas em cache, perfil, último preenchimento
- `src/lib/fila.ts` — fila offline e envio (`rpc('registrar_dia')`)
- `src/lib/foto.ts` — compressão de fotos no celular
- `supabase/migrations/` — estrutura do banco, regras de acesso (RLS) e views de indicadores
- `supabase/cadastro_inicial.sql` — modelo de cadastro; não é migração

## Regras do projeto
- **Banco:** nunca editar uma migração já aplicada. Toda mudança vira um arquivo novo em
  `supabase/migrations/` com nome `AAAAMMDDHHMMSS_descricao.sql`. Ao criar tabela nova, habilitar RLS
  e escrever as políticas na mesma migração.
- **Segurança:** o app usa só a chave publishable/anon. Nunca colocar chave secret/service_role no código
  nem em variável `NEXT_PUBLIC_*`. Custos, contratos e margem são só para `papel = 'admin'`.
- **Registro do dia:** a inserção acontece só pela função `registrar_dia(jsonb)`; o `id` é gerado no
  celular para que reenvios não dupliquem. Ao adicionar campo no formulário, atualizar juntos:
  tabela `registros`, função `registrar_dia`, view `v_registros`, tipo `RegistroPayload` em `fila.ts`.
- **Offline primeiro:** tudo que o formulário precisa tem que funcionar sem internet (listas vêm do cache).
  Nunca bloquear o envio esperando rede.
- **Usuários:** montadores em campo, no sol, com sinal ruim e pouca paciência para digitar. Preferir botões
  de toque a texto, botões grandes (≥ 46 px), alto contraste, poucos campos. Meta: preencher em < 2 min.
- **Idioma:** toda a interface, mensagens de erro e nomes de tabelas/colunas em português do Brasil.
- **Git:** um commit por mudança, mensagem em português dizendo o que mudou e por quê.
  Nunca commitar `.env.local`.

## Antes de dar uma tarefa como pronta
1. `npm run build` sem erros.
2. Se mexeu no banco: a migração nova roda do zero sem erro, depois da anterior.
3. Se mexeu no formulário: testar preencher com a rede desligada (DevTools → Network → Offline)
   e confirmar que o registro é enviado quando a rede volta.
