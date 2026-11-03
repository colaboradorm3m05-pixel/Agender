# Decisões principais

## Stack

| Área | Escolha | Motivo |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) + React 19 + TypeScript | Monólito único para painel, página pública e server actions |
| Estilo | Tailwind CSS 4, componentes próprios sobre elementos HTML nativos | Acessibilidade nativa (label, fieldset, radiogroup), sem dependência pesada |
| Banco | PostgreSQL | Transações, constraint de exclusão para impedir sobreposição |
| ORM | Drizzle ORM + drizzle-kit | SQL explícito, migrações versionadas em SQL, suporte a `FOR UPDATE` |
| Autenticação | Better Auth (e-mail/senha, sessões no banco) | Biblioteca consolidada, adaptador Drizzle, rate limit embutido |
| Validação | Zod 4 no servidor | Toda entrada é validada nos serviços, não na interface |
| Testes | Vitest com PostgreSQL real descartável | Concorrência e constraints só se testam de verdade em Postgres |

`cacheComponents` do Next 16 está **desligado** de propósito: quase todas as telas dependem da sessão e de agenda em tempo real. Revisitar quando o recurso virar padrão.

## Monólito modular

- `src/domain`: funções puras (disponibilidade, fuso, dinheiro, telefone). Sem banco, fáceis de testar.
- `src/server/services`: regras de negócio. Recebem `db` e um `Actor`; não importam nada do Next. São o que os testes exercitam.
- `src/server/permissions.ts`: matriz papel → permissões. Toda operação chama `assertCan`.
- `src/app/actions`: server actions finas (lê FormData → chama serviço → `revalidatePath`).
- `src/server/session.ts`: monta o `Actor` a partir da sessão e do vínculo no banco.

## Multiempresa

- Todas as tabelas de negócio têm `company_id`; toda consulta filtra por ele.
- O `company_id` **nunca** vem do navegador: vem do vínculo (`memberships`) do usuário autenticado.
- IDs de outra empresa resultam em “não encontrado” (não revela existência).
- Profissional só enxerga a própria agenda (`agenda.view_own`) e só pode concluir/registrar falta nos próprios atendimentos. Não vê clientes, serviços, configurações nem pagamentos.

## Termos e segmentos

Internamente o termo é sempre **profissional** (`professionals`). O rótulo exibido (“Barbeiro”, “Manicure”…) vem de `src/config/segments.ts`. Novos segmentos = nova entrada nessa configuração.

## Tempo e fuso

- Instantes em `timestamptz` (UTC). Horários recorrentes (funcionamento, jornada, pausas) em **minutos desde 00:00 no fuso da empresa**.
- Conversão com `@date-fns/tz` (`TZDate`), testada inclusive com horário de verão (America/New_York).
- Padrão `America/Sao_Paulo`, configurável por empresa.

## Disponibilidade

Tempo livre = funcionamento ∩ jornada − pausas − bloqueios. O **atendimento inteiro** precisa caber num trecho livre; o **período ocupado** (atendimento + intervalo adicional) não pode sobrepor outro atendimento ativo. O intervalo adicional pode avançar sobre uma pausa ou o fechamento (é tempo de limpeza). Horários são oferecidos numa grade (`slot_step_minutes`) contada a partir da meia-noite local.

A equipe pode agendar fora da grade e sem antecedência mínima (encaixes, registros retroativos), mas nunca fora do expediente nem em conflito.

## Sem sobreposição, de verdade

1. Toda criação/reagendamento/bloqueio abre transação e faz `SELECT … FOR UPDATE` na linha do profissional (vários profissionais: travados em ordem de id, evitando deadlock). A disponibilidade é recalculada dentro da transação.
2. Constraint `EXCLUDE USING gist (professional_id WITH =, tstzrange(starts_at, occupied_until) WITH &&) WHERE status <> 'cancelled'`. Qualquer escape da camada 1 vira erro `23P01`, convertido em “horário indisponível”.

Testado com 6 reservas simultâneas no mesmo horário (só 1 confirma) e com inserção direta no banco.

## Histórico preservado

Cada agendamento guarda uma **fotografia** do serviço e do profissional (`service_name`, `price_cents`, `duration_minutes`, `buffer_after_minutes`, `professional_name`). Alterar o serviço não muda agendamentos existentes; reagendar mantém a fotografia. Serviços e profissionais são **desativados**, não apagados (`ON DELETE RESTRICT` nos agendamentos).

## Dinheiro

Sempre inteiro em centavos (`integer`). Conversão do texto digitado (“1.234,56”) com aritmética inteira (`src/domain/money.ts`). Três números distintos no painel: agendado, concluído e recebido.

## Clientes e duplicidade

Telefone normalizado (só dígitos, com 55) é chave de busca, **não** chave única, porque números são compartilhados. Agendamento público reutiliza o cadastro com mesmo telefone **e** mesmo nome; nome diferente cria outro cadastro, marcado como “compartilhado” na interface. Cadastro manual com telefone existente exige confirmação explícita. Sem campos de saúde ou dados sensíveis.

## Link público e segurança

- Token de gestão: 32 bytes aleatórios (base64url), armazenado como SHA-256. O código `AG-XXXXXX` é só referência e não dá acesso. Não há consulta por telefone nem por ID sequencial (IDs são UUID).
- Limite de tentativas no PostgreSQL (funciona com várias instâncias); a chave guarda hash do IP, não o IP.
- Honeypot no formulário público. Cabeçalhos `no-referrer`, `no-store` e `noindex` nas páginas de reserva.
- Logs só com nome/mensagem/pilha do erro, nunca o corpo da requisição. Erros inesperados aparecem ao usuário de forma genérica.

## Desenvolvimento sem Docker

`scripts/lib/local-pg.ts` roda PostgreSQL 17 a partir dos binários do pacote `@embedded-postgres/<plataforma>`. No Windows, quando o caminho do projeto é longo (> ~120 caracteres, limite de 260 do PostgreSQL), binários e dados vão para `~/.agender`.

## Comissões

- Regra explícita: escopo (profissional e/ou serviço, nulo = todos), tipo (percentual em pontos-base ou valor fixo em centavos) e vigência por data local (inclusiva).
- Precedência: profissional+serviço > profissional > serviço > geral. Vale a regra vigente **na data do atendimento**.
- Base: preço fotografado do atendimento (não o valor pago). Percentual arredondado ao centavo (meio centavo para cima).
- Regras não são editadas nem apagadas: uma nova regra do mesmo escopo encerra a anterior na véspera; também é possível encerrar manualmente. A constraint `commission_rules_no_overlap` impede vigências sobrepostas.
- Ao concluir, o atendimento recebe `commission_rule_id`, `commission_cents` e `commission_description`. Mudanças posteriores em regras ou serviços não alteram esses valores. Desfazer a conclusão apaga a fotografia; concluir de novo recalcula com as regras vigentes naquela data.
- Atendimentos concluídos antes de existir regra ficam com comissão zero (“Sem regra de comissão vigente”).

## Relatórios

- Período por data de início do atendimento; “recebido” no relatório = pagamentos vinculados aos atendimentos do período (o painel e a tela de Pagamentos usam a data do pagamento).
- Profissional (permissão `reports.view_own`) vê só os próprios números e nunca valores recebidos pela empresa.
