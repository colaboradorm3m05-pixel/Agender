/**
 * Indicadores calculados a partir dos dados reais. Três valores distintos:
 * - agendado: soma dos preços (fotografados) de atendimentos confirmados no período;
 * - serviços concluídos: soma dos preços de atendimentos concluídos;
 * - recebido: soma dos pagamentos registrados manualmente no período.
 */
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { appointments, customers, payments } from "@/db/schema";
import { ForbiddenError } from "../errors";
import { assertCan, can, type Actor } from "../permissions";

/** Sem visão geral da empresa, o usuário só vê os próprios números (precisa ser profissional). */
function assertOwnScope(actor: Actor, ownOnly: boolean) {
  if (ownOnly && !actor.professionalId) throw new ForbiddenError();
}

export type PeriodSummary = {
  appointmentsCount: number;
  confirmedCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  scheduledCents: number;
  completedCents: number;
  receivedCents: number | null;
};

export async function periodSummary(db: DbOrTx, actor: Actor, from: Date, to: Date): Promise<PeriodSummary> {
  const ownOnly = !can(actor, "reports.view");
  assertOwnScope(actor, ownOnly);
  const [row] = await db
    .select({
      appointmentsCount: sql<number>`count(*)::int`,
      confirmedCount: sql<number>`count(*) filter (where ${appointments.status} = 'confirmed')::int`,
      completedCount: sql<number>`count(*) filter (where ${appointments.status} = 'completed')::int`,
      cancelledCount: sql<number>`count(*) filter (where ${appointments.status} = 'cancelled')::int`,
      noShowCount: sql<number>`count(*) filter (where ${appointments.status} = 'no_show')::int`,
      scheduledCents: sql<number>`coalesce(sum(${appointments.priceCents}) filter (where ${appointments.status} = 'confirmed'), 0)::int`,
      completedCents: sql<number>`coalesce(sum(${appointments.priceCents}) filter (where ${appointments.status} = 'completed'), 0)::int`,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.companyId, actor.companyId),
        gte(appointments.startsAt, from),
        lt(appointments.startsAt, to),
        ownOnly ? eq(appointments.professionalId, actor.professionalId!) : undefined,
      ),
    );
  let receivedCents: number | null = null;
  if (can(actor, "payments.manage")) {
    const [p] = await db
      .select({ sum: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
      .from(payments)
      .where(and(eq(payments.companyId, actor.companyId), gte(payments.paidAt, from), lt(payments.paidAt, to)));
    receivedCents = p.sum;
  }
  return { ...row, receivedCents };
}

/** Relatório por profissional no período (somente proprietário). */
export async function reportByProfessional(db: DbOrTx, actor: Actor, from: Date, to: Date) {
  assertCan(actor, "reports.view");
  return db
    .select({
      professionalId: appointments.professionalId,
      professionalName: sql<string>`max(${appointments.professionalName})`,
      completedCount: sql<number>`count(*) filter (where ${appointments.status} = 'completed')::int`,
      noShowCount: sql<number>`count(*) filter (where ${appointments.status} = 'no_show')::int`,
      cancelledCount: sql<number>`count(*) filter (where ${appointments.status} = 'cancelled')::int`,
      completedCents: sql<number>`coalesce(sum(${appointments.priceCents}) filter (where ${appointments.status} = 'completed'), 0)::int`,
      receivedCents: sql<number>`coalesce((select sum(p.amount_cents) from ${payments} p join ${appointments} a2 on a2.id = p.appointment_id where a2.professional_id = "appointments"."professional_id" and p.company_id = ${actor.companyId} and p.paid_at >= ${from} and p.paid_at < ${to}), 0)::int`,
    })
    .from(appointments)
    .where(and(eq(appointments.companyId, actor.companyId), gte(appointments.startsAt, from), lt(appointments.startsAt, to)))
    .groupBy(appointments.professionalId)
    .orderBy(asc(sql`max(${appointments.professionalName})`));
}

export async function upcomingAppointments(db: DbOrTx, actor: Actor, now: Date, limit = 8) {
  const ownOnly = !can(actor, "agenda.view_all");
  assertOwnScope(actor, ownOnly);
  return db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      serviceName: appointments.serviceName,
      professionalName: appointments.professionalName,
      customerName: customers.name,
    })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .where(
      and(
        eq(appointments.companyId, actor.companyId),
        eq(appointments.status, "confirmed"),
        gte(appointments.startsAt, now),
        ownOnly ? eq(appointments.professionalId, actor.professionalId!) : undefined,
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(limit);
}

export type PerformanceRow = {
  professionalId: string;
  professionalName: string;
  completedCount: number;
  noShowCount: number;
  cancelledCount: number;
  completedCents: number;
  commissionCents: number;
  receivedCents: number | null;
};

export type CompletedLine = {
  id: string;
  startsAt: Date;
  customerName: string;
  serviceName: string;
  professionalName: string;
  priceCents: number;
  commissionCents: number;
  commissionDescription: string | null;
  paidCents: number | null;
};

/**
 * Relatório de desempenho e comissões num intervalo [from, to), pela data de
 * início do atendimento. Proprietário vê todos (ou filtra); profissional vê
 * apenas os próprios números e nunca valores recebidos pela empresa.
 */
export async function performanceReport(db: DbOrTx, actor: Actor, from: Date, to: Date, professionalId?: string | null) {
  let proFilter: string | null = null;
  if (can(actor, "reports.view")) proFilter = professionalId || null;
  else if (can(actor, "reports.view_own") && actor.professionalId) proFilter = actor.professionalId;
  else throw new ForbiddenError();
  const showMoneyIn = can(actor, "payments.manage");

  const scope = and(
    eq(appointments.companyId, actor.companyId),
    gte(appointments.startsAt, from),
    lt(appointments.startsAt, to),
    proFilter ? eq(appointments.professionalId, proFilter) : undefined,
  );
  const paidSub = sql<number>`coalesce((select sum(p.amount_cents) from ${payments} p where p.appointment_id = "appointments"."id"), 0)::int`;

  const grouped = await db
    .select({
      professionalId: appointments.professionalId,
      professionalName: sql<string>`max(${appointments.professionalName})`,
      completedCount: sql<number>`count(*) filter (where ${appointments.status} = 'completed')::int`,
      noShowCount: sql<number>`count(*) filter (where ${appointments.status} = 'no_show')::int`,
      cancelledCount: sql<number>`count(*) filter (where ${appointments.status} = 'cancelled')::int`,
      completedCents: sql<number>`coalesce(sum(${appointments.priceCents}) filter (where ${appointments.status} = 'completed'), 0)::int`,
      commissionCents: sql<number>`coalesce(sum(${appointments.commissionCents}) filter (where ${appointments.status} = 'completed'), 0)::int`,
      receivedCents: sql<number>`coalesce(sum(${paidSub}), 0)::int`,
    })
    .from(appointments)
    .where(scope)
    .groupBy(appointments.professionalId)
    .orderBy(asc(sql`max(${appointments.professionalName})`));

  const lines = await db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      customerName: customers.name,
      serviceName: appointments.serviceName,
      professionalName: appointments.professionalName,
      priceCents: appointments.priceCents,
      commissionCents: sql<number>`coalesce(${appointments.commissionCents}, 0)::int`,
      commissionDescription: appointments.commissionDescription,
      paidCents: paidSub,
    })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .where(and(scope, eq(appointments.status, "completed")))
    .orderBy(asc(appointments.startsAt));

  const rows: PerformanceRow[] = grouped.map((r) => ({ ...r, receivedCents: showMoneyIn ? r.receivedCents : null }));
  const completed: CompletedLine[] = lines.map((l) => ({ ...l, paidCents: showMoneyIn ? l.paidCents : null }));
  const totals = rows.reduce(
    (t, r) => ({
      completedCount: t.completedCount + r.completedCount,
      noShowCount: t.noShowCount + r.noShowCount,
      cancelledCount: t.cancelledCount + r.cancelledCount,
      completedCents: t.completedCents + r.completedCents,
      commissionCents: t.commissionCents + r.commissionCents,
      receivedCents: showMoneyIn ? (t.receivedCents ?? 0) + (r.receivedCents ?? 0) : null,
    }),
    { completedCount: 0, noShowCount: 0, cancelledCount: 0, completedCents: 0, commissionCents: 0, receivedCents: showMoneyIn ? 0 : (null as number | null) },
  );
  return { rows, completed, totals, scopedToProfessional: proFilter };
}
