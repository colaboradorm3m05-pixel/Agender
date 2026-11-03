# CLAUDE.md

Leia também `AGENTS.md` (regras do Next.js 16: consulte `node_modules/next/dist/docs/` antes de usar APIs do Next).

## Comandos

- `npm run db:dev` — PostgreSQL local (deixe rodando). `npm run db:migrate` — aplica migrações.
- `npm run dev` — app em http://localhost:3000. `npm run db:seed:demo` — dados demonstrativos.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` — rodar todos antes de concluir uma mudança.
- `npx next typegen` — regenera os tipos `PageProps<"/rota">` ao criar rotas novas.
- Testes sobem um PostgreSQL próprio na porta 54329 (não precisam do `db:dev`).

## Convenções

- Interface em português do Brasil. Código e identificadores em inglês.
- Termo interno é **professional**; rótulos por segmento vêm de `src/config/segments.ts`. Nome do produto só em `src/config/app.ts`.
- Regras de negócio ficam em `src/server/services/*` (recebem `db` e `Actor`, sem imports do Next) e `src/domain/*` (puras). Server actions em `src/app/actions/*` são finas.
- Toda operação chama `assertCan(actor, permissão)` (`src/server/permissions.ts`) e filtra por `actor.companyId`. Nunca aceitar `company_id` do navegador.
- Validação com zod via `parseInput` nos serviços; erros para o usuário com `AppError` e mensagem em português.
- Dinheiro em centavos (`integer`). Instantes em `timestamptz`; horários recorrentes em minutos do dia no fuso da empresa.
- Agendamentos guardam fotografia do serviço/profissional; nunca recalcular preço/duração de agendamento existente.
- Mudou o schema? `npm run db:generate -- --name x`, revise o SQL e escreva `drizzle/rollback/NNNN_x.down.sql`.
- Funções chamadas dentro de transação não usam `Promise.all` com o mesmo `tx` (uma conexão só).
- Subconsultas correlacionadas em `sql\`\``: qualifique colunas da consulta externa com o nome da tabela (`"appointments"."id"`).
- Logs sem tokens nem dados pessoais (`logError` em `src/server/action-result.ts`).
