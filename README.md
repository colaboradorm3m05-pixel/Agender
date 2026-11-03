# Agender

SaaS de agendamento e gestão para barbearias, com modelagem preparada para salões, manicures, sobrancelhas e outros serviços de beleza.

> **Agender** é um nome provisório. Para renomear, altere `src/config/app.ts` (ou `NEXT_PUBLIC_APP_NAME`). Não presumimos disponibilidade de marca ou domínio.

## O que já funciona (MVP)

- Cadastro do proprietário e onboarding em 7 etapas (empresa → endereço → fuso/horários → profissionais → serviços → vínculos → link público).
- Multiempresa com isolamento por `company_id` derivado **sempre** do vínculo do usuário no servidor; papéis proprietário e profissional com permissões por operação (`src/server/permissions.ts`).
- Serviços (preço em centavos, duração, intervalo adicional, ativo/inativo) e profissionais (foto, jornada semanal, pausas, bloqueios por data, ativo/inativo).
- Agenda diária (grade por profissional) e semanal, filtro por profissional; criar, reagendar, cancelar, bloquear horário, concluir e registrar falta.
- Disponibilidade considerando funcionamento, jornada, pausas, bloqueios, duração, intervalo, agendamentos existentes, antecedência mínima e limite de dias.
- **Sem sobreposição garantida no banco**: trava da linha do profissional na transação + constraint de exclusão GiST (`appointments_no_overlap`).
- Página pública responsiva (`/b/<slug>`) com serviço → profissional (ou “sem preferência”) → dia/horário → dados → resumo → confirmação. Revalida no momento de confirmar e oferece novos horários se o escolhido acabou de ser ocupado.
- Link secreto da reserva (`/r/<token>`, 256 bits, só o hash é salvo) para consultar, cancelar e reagendar conforme a política da empresa; limite de tentativas por IP.
- Clientes: cadastro manual e automático, busca por nome/telefone, histórico, observações internas, deduplicação por telefone normalizado com tratamento de número compartilhado.
- Painel com números reais: agendamentos do dia, próximos, cancelamentos/faltas, **valor agendado × serviços concluídos × pagamentos registrados**, e relatório por profissional.
- Registro manual de pagamentos (deixa explícito que não é cobrança).
- Histórico de alterações importantes (auditoria) nos agendamentos.
- Comissões com regras explícitas e vigência (percentual ou fixo, por profissional/serviço), registradas no atendimento ao concluir.
- Relatórios por período e profissional com exportação CSV; o profissional vê só os próprios números.
- Convite por link para o profissional criar o próprio acesso.
- Dados demonstrativos separados (`is_demo = true`).

O que ainda **não** existe está em [docs/roadmap.md](docs/roadmap.md).

## Requisitos

- Node.js 20.9+ (testado com 24)
- PostgreSQL 14+ com a extensão `btree_gist` disponível (vem no contrib padrão e nos provedores gerenciados mais comuns)

Para desenvolvimento **não é preciso instalar PostgreSQL nem Docker**: `npm run db:dev` sobe um PostgreSQL 17 real a partir dos binários oficiais empacotados no npm (`@embedded-postgres/*`).

## Instalação e execução

```bash
npm install
cp .env.example .env       # e preencha BETTER_AUTH_SECRET
npm run db:dev             # terminal 1: deixa o banco rodando
npm run db:migrate         # terminal 2
npm run db:seed:demo       # opcional: empresa de demonstração
npm run dev                # http://localhost:3000
```

Gere o segredo com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Conta de demonstração: `demo@agender.local`, senha = `DEMO_PASSWORD` do `.env`. Página pública demo: `/b/barbearia-demonstracao`.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e execução de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript sem emitir |
| `npm test` | Testes (Vitest) com PostgreSQL real e descartável |
| `npm run db:dev` | PostgreSQL local de desenvolvimento |
| `npm run db:generate -- --name <nome>` | Gera migração a partir de `src/db/schema.ts` |
| `npm run db:migrate` | Aplica migrações pendentes |
| `npm run db:seed:demo` | Recria os dados demonstrativos |

## Estrutura

```
src/
  config/        nome do produto, segmentos (textos por segmento), fusos
  domain/        regras puras: disponibilidade, fuso, dinheiro, telefone, tokens
  db/            schema Drizzle (negócio + autenticação) e conexão
  server/        serviços de negócio, permissões, validação, erros, rate limit, auditoria
  lib/           autenticação (Better Auth), URLs, utilidades
  app/           rotas Next.js (painel, onboarding, página pública, gestão da reserva)
  components/    componentes de interface acessíveis
drizzle/         migrações SQL versionadas (+ rollback/)
scripts/         banco local, migração, dados demo
tests/           testes unitários e de integração
docs/            decisões, deploy, backup, integrações, roadmap
```

## Documentação

- [docs/decisoes.md](docs/decisoes.md) — decisões técnicas e de produto
- [docs/deploy.md](docs/deploy.md) — checklist de deploy, backup/restauração, migração e rollback
- [docs/integracoes.md](docs/integracoes.md) — dependências externas e o que está indisponível
- [docs/roadmap.md](docs/roadmap.md) — o que falta (Etapas A, B e C)
