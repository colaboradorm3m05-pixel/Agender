/** Serviços oferecidos e vínculo serviço ↔ profissional. */
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db";
import { professionalServices, professionals, services } from "@/db/schema";
import { NotFoundError, ValidationError } from "../errors";
import { assertCan, type Actor } from "../permissions";
import { audit } from "../audit";
import { optionalText, parseInput, requiredText, uuidSchema } from "../validation";

export type Service = typeof services.$inferSelect;

const serviceSchema = z.object({
  name: requiredText(80, "O nome do serviço"),
  description: optionalText(500),
  priceCents: z.number({ message: "Informe o preço." }).int().min(0, "O preço não pode ser negativo.").max(10_000_000),
  durationMinutes: z
    .number({ message: "Informe a duração." })
    .int()
    .min(5, "A duração mínima é 5 minutos.")
    .max(720, "A duração máxima é 12 horas."),
  bufferAfterMinutes: z.number().int().min(0).max(240, "O intervalo máximo é 240 minutos.").default(0),
  active: z.boolean().default(true),
  professionalIds: z.array(uuidSchema).max(200).optional(),
});

export async function listServices(db: DbOrTx, actor: Actor, opts: { includeInactive?: boolean } = {}) {
  const rows = await db
    .select()
    .from(services)
    .where(and(eq(services.companyId, actor.companyId), opts.includeInactive ? undefined : eq(services.active, true)))
    .orderBy(asc(services.displayOrder), asc(services.name));
  const links = await db
    .select({ serviceId: professionalServices.serviceId, professionalId: professionalServices.professionalId })
    .from(professionalServices)
    .where(eq(professionalServices.companyId, actor.companyId));
  return rows.map((s) => ({ ...s, professionalIds: links.filter((l) => l.serviceId === s.id).map((l) => l.professionalId) }));
}

async function assertProfessionalsInCompany(db: DbOrTx, companyId: string, ids: string[]) {
  if (!ids.length) return;
  const found = await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(and(eq(professionals.companyId, companyId), inArray(professionals.id, ids)));
  if (found.length !== new Set(ids).size) throw new ValidationError({ professionalIds: "Profissional inválido." });
}

export async function createService(db: DbOrTx, actor: Actor, input: unknown): Promise<Service> {
  assertCan(actor, "services.manage");
  const { professionalIds, ...data } = parseInput(serviceSchema, input);
  return db.transaction(async (tx) => {
    await assertProfessionalsInCompany(tx, actor.companyId, professionalIds ?? []);
    const [service] = await tx.insert(services).values({ ...data, companyId: actor.companyId }).returning();
    if (professionalIds?.length) {
      await tx
        .insert(professionalServices)
        .values([...new Set(professionalIds)].map((professionalId) => ({ companyId: actor.companyId, professionalId, serviceId: service.id })));
    }
    return service;
  });
}

/**
 * Alterar preço/duração afeta apenas agendamentos futuros: cada agendamento
 * guarda uma fotografia do serviço no momento em que foi criado.
 */
export async function updateService(db: DbOrTx, actor: Actor, serviceId: string, input: unknown): Promise<Service> {
  assertCan(actor, "services.manage");
  const { professionalIds, ...data } = parseInput(serviceSchema, input);
  return db.transaction(async (tx) => {
    const [service] = await tx
      .update(services)
      .set(data)
      .where(and(eq(services.id, serviceId), eq(services.companyId, actor.companyId)))
      .returning();
    if (!service) throw new NotFoundError("Serviço");
    if (professionalIds) {
      await assertProfessionalsInCompany(tx, actor.companyId, professionalIds);
      await tx.delete(professionalServices).where(eq(professionalServices.serviceId, service.id));
      if (professionalIds.length) {
        await tx
          .insert(professionalServices)
          .values([...new Set(professionalIds)].map((professionalId) => ({ companyId: actor.companyId, professionalId, serviceId: service.id })));
      }
    }
    await audit(tx, {
      companyId: actor.companyId,
      actorUserId: actor.userId,
      actorType: "user",
      action: "service.updated",
      entityType: "service",
      entityId: service.id,
      details: `${service.name}: ${service.durationMinutes} min, ${service.priceCents} centavos, ${service.active ? "ativo" : "inativo"}`,
    });
    return service;
  });
}

/** Desativar preserva histórico: o serviço some do agendamento, mas os registros continuam. */
export async function setServiceActive(db: DbOrTx, actor: Actor, serviceId: string, active: boolean) {
  assertCan(actor, "services.manage");
  const [service] = await db
    .update(services)
    .set({ active })
    .where(and(eq(services.id, serviceId), eq(services.companyId, actor.companyId)))
    .returning();
  if (!service) throw new NotFoundError("Serviço");
  return service;
}

/** Define quais serviços um profissional atende (substitui a lista atual). */
export async function setProfessionalServices(db: DbOrTx, actor: Actor, professionalId: string, serviceIds: unknown) {
  assertCan(actor, "staff.manage");
  const ids = parseInput(z.array(uuidSchema).max(200), serviceIds);
  await db.transaction(async (tx) => {
    const [pro] = await tx
      .select({ id: professionals.id })
      .from(professionals)
      .where(and(eq(professionals.id, professionalId), eq(professionals.companyId, actor.companyId)));
    if (!pro) throw new NotFoundError("Profissional");
    if (ids.length) {
      const found = await tx
        .select({ id: services.id })
        .from(services)
        .where(and(eq(services.companyId, actor.companyId), inArray(services.id, ids)));
      if (found.length !== new Set(ids).size) throw new ValidationError({ serviceIds: "Serviço inválido." });
    }
    await tx.delete(professionalServices).where(eq(professionalServices.professionalId, professionalId));
    if (ids.length) {
      await tx
        .insert(professionalServices)
        .values([...new Set(ids)].map((serviceId) => ({ companyId: actor.companyId, professionalId, serviceId })));
    }
  });
}
