/**
 * Clientes da empresa. Cadastros nunca são compartilhados entre empresas.
 *
 * Duplicidade: o telefone normalizado é a chave de busca, mas NÃO é único,
 * porque um mesmo número pode ser compartilhado (ex.: mãe e filho).
 * - Agendamento público: reaproveita o cadastro com mesmo telefone E mesmo
 *   nome (normalizado); se o nome for diferente, cria outro cadastro.
 * - Cadastro manual: se o telefone já existe, exige confirmação explícita
 *   ("é outra pessoa com o mesmo telefone").
 */
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db";
import { appointments, customers, payments } from "@/db/schema";
import { normalizeName, normalizePhone } from "@/domain/phone";
import { AppError, NotFoundError, ValidationError } from "../errors";
import { assertCan, type Actor } from "../permissions";
import { emailSchema, optionalText, parseInput, requiredText } from "../validation";

export type Customer = typeof customers.$inferSelect;

export const customerInputSchema = z.object({
  name: requiredText(100, "O nome"),
  phone: requiredText(30, "O telefone"),
  email: emailSchema,
  notes: optionalText(1000),
});

function requirePhone(phone: string): string {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new ValidationError({ phone: "Informe um telefone com DDD (ex.: 11 98765-4321)." });
  return normalized;
}

/** Usado pelo agendamento (público ou manual com cliente novo). */
export async function findOrCreateCustomerForBooking(
  db: DbOrTx,
  companyId: string,
  input: { name: string; phone: string; email?: string | null },
): Promise<Customer> {
  const phoneNormalized = requirePhone(input.phone);
  const samePhone = await db
    .select()
    .from(customers)
    .where(and(eq(customers.companyId, companyId), eq(customers.phoneNormalized, phoneNormalized)))
    .orderBy(asc(customers.createdAt));
  const match = samePhone.find((c) => normalizeName(c.name) === normalizeName(input.name));
  if (match) {
    if (input.email && !match.email) {
      const [updated] = await db.update(customers).set({ email: input.email }).where(eq(customers.id, match.id)).returning();
      return updated;
    }
    return match;
  }
  const [created] = await db
    .insert(customers)
    .values({ companyId, name: input.name.trim(), phone: input.phone.trim(), phoneNormalized, email: input.email ?? null })
    .returning();
  return created;
}

export type CreateCustomerResult =
  | { status: "created"; customer: Customer }
  | { status: "phone_in_use"; existing: Pick<Customer, "id" | "name">[] };

export async function createCustomer(
  db: DbOrTx,
  actor: Actor,
  input: unknown,
  opts: { confirmSharedPhone?: boolean } = {},
): Promise<CreateCustomerResult> {
  assertCan(actor, "customers.manage");
  const data = parseInput(customerInputSchema, input);
  const phoneNormalized = requirePhone(data.phone);
  const existing = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(and(eq(customers.companyId, actor.companyId), eq(customers.phoneNormalized, phoneNormalized)));
  if (existing.length && !opts.confirmSharedPhone) return { status: "phone_in_use", existing };
  const [customer] = await db
    .insert(customers)
    .values({ ...data, phoneNormalized, companyId: actor.companyId })
    .returning();
  return { status: "created", customer };
}

export async function updateCustomer(db: DbOrTx, actor: Actor, customerId: string, input: unknown): Promise<Customer> {
  assertCan(actor, "customers.manage");
  const data = parseInput(customerInputSchema, input);
  const phoneNormalized = requirePhone(data.phone);
  const [customer] = await db
    .update(customers)
    .set({ ...data, phoneNormalized })
    .where(and(eq(customers.id, customerId), eq(customers.companyId, actor.companyId)))
    .returning();
  if (!customer) throw new NotFoundError("Cliente");
  return customer;
}

export async function searchCustomers(db: DbOrTx, actor: Actor, query: string, limit = 50) {
  assertCan(actor, "customers.view");
  const q = query.trim().slice(0, 60);
  const digits = q.replace(/\D/g, "");
  const escaped = q.replace(/[\\%_]/g, (m) => "\\" + m);
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      phoneNormalized: customers.phoneNormalized,
      email: customers.email,
      createdAt: customers.createdAt,
      appointmentsCount: sql<number>`(select count(*) from ${appointments} a where a.customer_id = "customers"."id")::int`,
      lastVisit: sql<Date | null>`(select max(a.starts_at) from ${appointments} a where a.customer_id = "customers"."id" and a.status = 'completed')`,
      sharedPhoneCount: sql<number>`(select count(*) from ${customers} c2 where c2.company_id = "customers"."company_id" and c2.phone_normalized = "customers"."phone_normalized" and c2.id <> "customers"."id")::int`,
    })
    .from(customers)
    .where(
      and(
        eq(customers.companyId, actor.companyId),
        q
          ? or(
              ilike(customers.name, `%${escaped}%`),
              digits.length >= 3 ? sql`${customers.phoneNormalized} like ${"%" + digits + "%"}` : undefined,
            )
          : undefined,
      ),
    )
    .orderBy(asc(customers.name))
    .limit(limit);
  return rows.map((r) => ({ ...r, lastVisit: r.lastVisit ? new Date(r.lastVisit) : null }));
}

export async function getCustomerWithHistory(db: DbOrTx, actor: Actor, customerId: string) {
  assertCan(actor, "customers.view");
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.companyId, actor.companyId)));
  if (!customer) throw new NotFoundError("Cliente");
  const history = await db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      status: appointments.status,
      serviceName: appointments.serviceName,
      professionalName: appointments.professionalName,
      priceCents: appointments.priceCents,
      paidCents: sql<number>`coalesce((select sum(p.amount_cents) from ${payments} p where p.appointment_id = "appointments"."id"), 0)::int`,
    })
    .from(appointments)
    .where(and(eq(appointments.customerId, customer.id), eq(appointments.companyId, actor.companyId)))
    .orderBy(desc(appointments.startsAt));
  const sharedWith = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(
      and(
        eq(customers.companyId, actor.companyId),
        eq(customers.phoneNormalized, customer.phoneNormalized),
        sql`${customers.id} <> ${customer.id}`,
      ),
    );
  return { customer, history, sharedWith };
}

export async function getCustomerInCompany(db: DbOrTx, companyId: string, customerId: string): Promise<Customer> {
  const [customer] = await db.select().from(customers).where(and(eq(customers.id, customerId), eq(customers.companyId, companyId)));
  if (!customer) throw new AppError("invalid_customer", "Cliente não encontrado.", 404);
  return customer;
}
