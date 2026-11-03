/**
 * Comissões: regras com vigência e fotografia no atendimento concluído.
 * Regras não são editadas; uma nova regra para o mesmo escopo encerra a
 * anterior na véspera do início da nova. Fotografias já gravadas nunca mudam.
 */
import { and, asc, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx, Tx } from "@/db";
import { appointments, commissionRules, professionals, services } from "@/db/schema";
import { computeCommission, pickRule } from "@/domain/commission";
import { addDays, instantToLocal, isValidLocalDate } from "@/domain/time";
import { AppError, NotFoundError, ValidationError } from "../errors";
import { assertCan, type Actor } from "../permissions";
import { audit } from "../audit";
import { parseInput, uuidSchema } from "../validation";

export type CommissionRule = typeof commissionRules.$inferSelect;

const ruleSchema = z
  .object({
    professionalId: uuidSchema.nullable(),
    serviceId: uuidSchema.nullable(),
    type: z.enum(["percent", "fixed"], { message: "Escolha o tipo de comissão." }),
    percentBasisPoints: z.number().int().min(0).max(10000, "Máximo de 100%.").nullable(),
    fixedCents: z.number().int().min(0).max(10_000_000).nullable(),
    validFrom: z.string().refine(isValidLocalDate, "Data inválida."),
  })
  .superRefine((v, ctx) => {
    if (v.type === "percent" && v.percentBasisPoints === null) ctx.addIssue({ code: "custom", path: ["percent"], message: "Informe o percentual." });
    if (v.type === "fixed" && v.fixedCents === null) ctx.addIssue({ code: "custom", path: ["fixedCents"], message: "Informe o valor." });
  });

export async function listCommissionRules(db: DbOrTx, actor: Actor) {
  assertCan(actor, "commissions.manage");
  return db
    .select({
      rule: commissionRules,
      professionalName: professionals.name,
      serviceName: services.name,
    })
    .from(commissionRules)
    .leftJoin(professionals, eq(professionals.id, commissionRules.professionalId))
    .leftJoin(services, eq(services.id, commissionRules.serviceId))
    .where(eq(commissionRules.companyId, actor.companyId))
    .orderBy(asc(professionals.name), asc(services.name), desc(commissionRules.validFrom));
}

export async function createCommissionRule(db: DbOrTx, actor: Actor, input: unknown): Promise<CommissionRule> {
  assertCan(actor, "commissions.manage");
  const data = parseInput(ruleSchema, input);
  return db.transaction(async (tx) => {
    if (data.professionalId) {
      const [p] = await tx
        .select({ id: professionals.id })
        .from(professionals)
        .where(and(eq(professionals.id, data.professionalId), eq(professionals.companyId, actor.companyId)));
      if (!p) throw new NotFoundError("Profissional");
    }
    if (data.serviceId) {
      const [s] = await tx
        .select({ id: services.id })
        .from(services)
        .where(and(eq(services.id, data.serviceId), eq(services.companyId, actor.companyId)));
      if (!s) throw new NotFoundError("Serviço");
    }
    const sameScope = and(
      eq(commissionRules.companyId, actor.companyId),
      data.professionalId ? eq(commissionRules.professionalId, data.professionalId) : isNull(commissionRules.professionalId),
      data.serviceId ? eq(commissionRules.serviceId, data.serviceId) : isNull(commissionRules.serviceId),
    );
    // Regras do mesmo escopo ainda vigentes na data de início (ou depois dela).
    const overlapping = await tx
      .select()
      .from(commissionRules)
      .where(and(sameScope, or(isNull(commissionRules.validTo), gte(commissionRules.validTo, data.validFrom))))
      .for("update");
    for (const r of overlapping) {
      if (r.validFrom >= data.validFrom) {
        throw new ValidationError(
          { validFrom: `Já existe regra para este escopo começando em ${fmtDate(r.validFrom)}. Escolha uma data posterior.` },
          "Conflito de vigência.",
        );
      }
    }
    for (const r of overlapping) {
      await tx.update(commissionRules).set({ validTo: addDays(data.validFrom, -1) }).where(eq(commissionRules.id, r.id));
    }
    const [rule] = await tx
      .insert(commissionRules)
      .values({
        companyId: actor.companyId,
        professionalId: data.professionalId,
        serviceId: data.serviceId,
        type: data.type,
        percentBasisPoints: data.type === "percent" ? data.percentBasisPoints : null,
        fixedCents: data.type === "fixed" ? data.fixedCents : null,
        validFrom: data.validFrom,
        validTo: null,
        createdByUserId: actor.userId,
      })
      .returning();
    await audit(tx, {
      companyId: actor.companyId,
      actorUserId: actor.userId,
      actorType: "user",
      action: "commission_rule.created",
      entityType: "commission_rule",
      entityId: rule.id,
      details: `${rule.type === "percent" ? `${(rule.percentBasisPoints ?? 0) / 100}%` : `${rule.fixedCents} centavos`} a partir de ${rule.validFrom}`,
    });
    return rule;
  });
}

/** Encerra a vigência de uma regra (sem apagar: o histórico continua consultável). */
export async function endCommissionRule(db: DbOrTx, actor: Actor, ruleId: string, endDate: unknown) {
  assertCan(actor, "commissions.manage");
  const date = parseInput(z.string().refine(isValidLocalDate, "Data inválida."), endDate);
  const [rule] = await db
    .select()
    .from(commissionRules)
    .where(and(eq(commissionRules.id, ruleId), eq(commissionRules.companyId, actor.companyId)));
  if (!rule) throw new NotFoundError("Regra");
  if (date < rule.validFrom) throw new ValidationError({ validTo: "O fim não pode ser antes do início da regra." });
  if (rule.validTo !== null && rule.validTo <= date) throw new AppError("already_ended", "Esta regra já termina antes dessa data.");
  await db.update(commissionRules).set({ validTo: date }).where(eq(commissionRules.id, rule.id));
}

/**
 * Grava a comissão no atendimento concluído (chamado dentro da transação de
 * mudança de status). Sem regra aplicável, registra zero e o motivo.
 */
export async function snapshotCommission(tx: Tx, appt: typeof appointments.$inferSelect, timeZone: string) {
  const date = instantToLocal(appt.startsAt, timeZone).date;
  const rules = await tx
    .select()
    .from(commissionRules)
    .where(
      and(
        eq(commissionRules.companyId, appt.companyId),
        or(isNull(commissionRules.professionalId), eq(commissionRules.professionalId, appt.professionalId)),
        or(isNull(commissionRules.serviceId), eq(commissionRules.serviceId, appt.serviceId)),
        sql`${commissionRules.validFrom} <= ${date}`,
        or(isNull(commissionRules.validTo), sql`${commissionRules.validTo} >= ${date}`),
      ),
    );
  const rule = pickRule(rules, { professionalId: appt.professionalId, serviceId: appt.serviceId, date });
  const result = rule ? computeCommission(rule, appt.priceCents) : { cents: 0, description: "Sem regra de comissão vigente" };
  await tx
    .update(appointments)
    .set({ commissionRuleId: rule?.id ?? null, commissionCents: result.cents, commissionDescription: result.description })
    .where(eq(appointments.id, appt.id));
}

export async function clearCommission(tx: Tx, appointmentId: string) {
  await tx
    .update(appointments)
    .set({ commissionRuleId: null, commissionCents: null, commissionDescription: null })
    .where(eq(appointments.id, appointmentId));
}

function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
