# Deploy, backup e migrações

Nada foi publicado nem contratado. Este documento descreve o que fazer quando houver um ambiente real.

## Checklist de deploy

- [ ] PostgreSQL gerenciado (14+) com `btree_gist` permitido (`CREATE EXTENSION` na primeira migração — em alguns provedores precisa ser habilitada no painel).
- [ ] Backups automáticos e PITR ligados no provedor; restauração testada (ver abaixo).
- [ ] Variáveis de ambiente: `DATABASE_URL` (com `sslmode=require` se o provedor exigir), `BETTER_AUTH_SECRET` (novo, ≥32 bytes aleatórios, só no cofre do provedor), `BETTER_AUTH_URL` e `NEXT_PUBLIC_APP_URL` com o domínio HTTPS final, `DATABASE_POOL_MAX` adequado ao plano.
- [ ] **Não** definir `DEMO_PASSWORD` e **não** rodar `db:seed:demo` em produção (o script recusa `NODE_ENV=production`).
- [ ] HTTPS obrigatório (cookies de sessão seguros dependem disso).
- [ ] Proxy/CDN definindo `X-Forwarded-For` de forma confiável: o limite de tentativas usa o primeiro IP desse cabeçalho. Se a aplicação ficar exposta sem proxy, ajuste `clientIp()` em `src/server/action-helpers.ts`.
- [ ] `npm ci && npm run typecheck && npm run lint && npm test && npm run build` no CI.
- [ ] Rodar `npm run db:migrate` **antes** de subir a nova versão (ver “Migração”).
- [ ] Monitorar logs de erro (`[erro]` no stdout) e configurar alerta.
- [ ] Rotina para limpar contadores antigos de rate limit (`purgeExpiredRateLimits`) — opcional, a tabela é pequena.
- [ ] Revisar a política de privacidade/LGPD: dados coletados são nome, telefone e e-mail opcional do cliente final.

## Migração

1. Desenvolvedor altera `src/db/schema.ts` e roda `npm run db:generate -- --name descricao_curta`. Para SQL especial (constraints, extensões) use `npx drizzle-kit generate --custom --name ...`.
2. Revisar o SQL gerado em `drizzle/NNNN_*.sql` e escrever o rollback correspondente em `drizzle/rollback/NNNN_*.down.sql`. Inclua-o em `scripts/verify-rollback.ts` e rode `npm run db:verify-rollback` (migra → reverte → migra num banco descartável).
3. Preferir migrações **compatíveis com a versão anterior** (expand/contract): adicionar coluna nula → publicar código que escreve nas duas → backfill → tornar obrigatória numa migração seguinte. Assim o rollback de código não exige rollback de banco.
4. Em produção: backup/snapshot imediatamente antes → `npm run db:migrate` (aplica só as pendentes, registradas em `drizzle.__drizzle_migrations`) → deploy do código.

## Rollback

- **Código**: volte para a versão anterior. Se as migrações foram compatíveis (item 3), não é preciso mexer no banco.
- **Banco**, quando necessário:
  1. Pare as escritas (modo manutenção ou escale a aplicação para zero).
  2. Execute o arquivo `drizzle/rollback/NNNN_*.down.sql` correspondente, da migração mais nova para a mais antiga, com `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f arquivo.down.sql`.
  3. Remova o registro da migração revertida: `DELETE FROM drizzle.__drizzle_migrations WHERE created_at = <timestamp do journal>;` (o valor está em `drizzle/meta/_journal.json`, campo `when`).
  4. Suba a versão anterior do código.
- Se o rollback por SQL for arriscado (perda de dados), restaure o snapshot tirado antes da migração.

## Backup e restauração

**Automático (recomendado):** backups diários + PITR (point-in-time recovery) do provedor gerenciado, retenção mínima de 7 dias (ideal 30).

**Lógico (complementar, ex.: semanal, guardado em outro provedor/conta):**

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --file=agender-$(date +%F).dump
```

**Restauração em um banco novo:**

```bash
createdb agender_restore
pg_restore --no-owner --dbname=agender_restore agender-AAAA-MM-DD.dump
```

Depois de restaurar: aponte `DATABASE_URL` para o banco restaurado, rode `npm run db:migrate` (deve dizer que nada está pendente) e faça um teste de fumaça (login, agenda, página pública).

**Teste de restauração:** pelo menos a cada trimestre, restaure o último backup num ambiente separado e confira contagens (`companies`, `appointments`, `payments`). Backup que nunca foi restaurado não é backup.

Os backups contêm dados pessoais de clientes: criptografados em repouso e com acesso restrito.
