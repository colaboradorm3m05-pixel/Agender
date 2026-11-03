/**
 * Registro MANUAL de pagamentos recebidos pela empresa. Nada aqui processa
 * cobrança: é um controle do que o estabelecimento já recebeu do cliente.
 * (A assinatura que a empresa paga ao SaaS é outro assunto e outro módulo.)
 */
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db";
import { appointments, customers, payments, PAYMENT_METHODS } from "@/db/schema";
import { AppError, NotFoundError } from "../errors";
import { assertCan, type Actor } from "../permissions";
import { audit } from "../audit";
import { optionalText, parseInput, uuidSchema } from "../validation";

export const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  cash: "Dinheiro",
  pix: "Pix",
  debit_card: "Cartão de débito",
  credit_card: "Cartão de crédito",
  other: "Outro",
};

const paymentSchema = z.object({
  appointmentId: uuidSchema.optional().nullable(),
  amountCents: z.number({ message: "Informe o valor." }).int().min(1, "O valor deve ser maior que zero.").max(10_000_000),
  paidAt: z.coerce.date({ message: "Data inválida." }),
  method: z.enum(PAYMENT_METHODS, { message: "Escolha a forma de pagamento." }),
  notes: optionalText(300),
});

export async function recordPayment(db: DbOrTx, actor: Actor, input: unknown) {
  assertCan(actor, "payments.manage");
  const data = parseInput(paymentSchema, input);
  return db.transaction(async (tx) => {
    if (data.appointmentId) {
      const [appt] = await tx
        .select({ id: appointments.id, status: appointments.status })
        .from(appointments)
        .where(and(eq(appointments.id, data.appointmentId), eq(appointments.companyId, actor.companyId)));
      if (!appt) throw new NotFoundError("Agendamento");
      if (appt.status === "cancelled") throw new AppError("cancelled_appointment", "Não é possível registrar pagamento de um agendamento cancelado.");
    }
    const [payment] = await tx
      .insert(payments)
      .values({ ...data, appointmentId: data.appointmentId ?? null, companyId: actor.companyId, recordedByUserId: actor.userId })
      .returning();
    await audit(tx, {
      companyId: actor.companyId,
      actorUserId: actor.userId,
      actorType: "user",
      action: "payment.recorded",
      entityType: "payment",
      entityId: payment.id,
      details: `${payment.amountCents} centavos via ${payment.method}`,
    });
    return payment;
  });
}

export async function deletePayment(db: DbOrTx, actor: Actor, paymentId: string) {
  assertCan(actor, "payments.manage");
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.companyId, actor.companyId)))
      .returning();
    if (!deleted) throw new NotFoundError("Pagamento");
    await audit(tx, {
      companyId: actor.companyId,
      actorUserId: actor.userId,
      actorType: "user",
      action: "payment.deleted",
      entityType: "payment",
      entityId: deleted.id,
      details: `${deleted.amountCents} centavos via ${deleted.method}`,
    });
  });
}

export async function listPayments(db: DbOrTx, actor: Actor, from: Date, to: Date) {
  assertCan(actor, "payments.manage");
  const rows = await db
    .select({
      id: payments.id,
      amountCents: payments.amountCents,
      paidAt: payments.paidAt,
      method: payments.method,
      notes: payments.notes,
      appointmentId: payments.appointmentId,
      serviceName: appointments.serviceName,
      professionalName: appointments.professionalName,
      appointmentStartsAt: appointments.startsAt,
      customerName: customers.name,
    })
    .from(payments)
    .leftJoin(appointments, eq(appointments.id, payments.appointmentId))
    .leftJoin(customers, eq(customers.id, appointments.customerId))
    .where(and(eq(payments.companyId, actor.companyId), gte(payments.paidAt, from), lt(payments.paidAt, to)))
    .orderBy(desc(payments.paidAt));
  const [total] = await db
    .select({ sum: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(and(eq(payments.companyId, actor.companyId), gte(payments.paidAt, from), lt(payments.paidAt, to)));
  return { rows, totalCents: total.sum };
}
