/**
 * Agendamento público (sem login do cliente) e gestão da reserva por link
 * secreto. Expõe apenas o necessário: nunca listas de clientes nem dados de
 * outros agendamentos.
 */
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db";
import { appointments, companies, professionalServices, professionals, services } from "@/db/schema";
import { instantToLocal, isValidLocalDate, type LocalDate } from "@/domain/time";
import { generateSecretToken, hashToken, looksLikeToken } from "@/domain/tokens";
import { AppError, NotFoundError, SlotUnavailableError, ValidationError } from "../errors";
import { audit } from "../audit";
import { getPublicCompanyBySlug, type PublicCompany } from "./companies";
import { findOrCreateCustomerForBooking } from "./customers";
import {
  bookingWindow,
  cancelAppointmentLocked,
  eligibleProfessionals,
  getCompanyRules,
  insertAppointmentLocked,
  rescheduleLocked,
  slotsForProfessional,
  withOverlapGuard,
} from "./scheduling";
import { emailSchema, parseInput, requiredText, uuidSchema } from "../validation";

export const ANY_PROFESSIONAL = "any";

export async function getPublicCatalog(db: DbOrTx, slug: string) {
  const company = await getPublicCompanyBySlug(db, slug);
  if (!company) return null;
  const [svcs, pros, links] = await Promise.all([
    db
      .select({
        id: services.id,
        name: services.name,
        description: services.description,
        priceCents: services.priceCents,
        durationMinutes: services.durationMinutes,
      })
      .from(services)
      .where(and(eq(services.companyId, company.id), eq(services.active, true)))
      .orderBy(asc(services.displayOrder), asc(services.name)),
    db
      .select({ id: professionals.id, name: professionals.name, photoUrl: professionals.photoUrl })
      .from(professionals)
      .where(and(eq(professionals.companyId, company.id), eq(professionals.active, true)))
      .orderBy(asc(professionals.displayOrder), asc(professionals.name)),
    db
      .select({ professionalId: professionalServices.professionalId, serviceId: professionalServices.serviceId })
      .from(professionalServices)
      .where(eq(professionalServices.companyId, company.id)),
  ]);
  const professionalsWithServices = pros
    .map((p) => ({ ...p, serviceIds: links.filter((l) => l.professionalId === p.id).map((l) => l.serviceId) }))
    .filter((p) => p.serviceIds.length > 0);
  const offered = new Set(professionalsWithServices.flatMap((p) => p.serviceIds));
  return {
    company,
    services: svcs.filter((s) => offered.has(s.id)),
    professionals: professionalsWithServices,
  };
}

async function requireCompany(db: DbOrTx, slug: string): Promise<PublicCompany> {
  const company = await getPublicCompanyBySlug(db, slug);
  if (!company) throw new NotFoundError("Estabelecimento");
  return company;
}

async function requireActiveService(db: DbOrTx, companyId: string, serviceId: string) {
  if (!uuidSchema.safeParse(serviceId).success) throw new NotFoundError("Serviço");
  const [svc] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.companyId, companyId), eq(services.active, true)));
  if (!svc) throw new NotFoundError("Serviço");
  return svc;
}

/** Horários livres para o link público. "any" = qualquer profissional (união). */
export async function getPublicSlots(
  db: DbOrTx,
  slug: string,
  input: { serviceId: string; professionalId: string; date: string },
  now = new Date(),
): Promise<{ start: string; label: string }[]> {
  if (!isValidLocalDate(input.date)) throw new ValidationError({ date: "Data inválida." });
  const company = await requireCompany(db, slug);
  const rules = await getCompanyRules(db, company.id);
  const svc = await requireActiveService(db, company.id, input.serviceId);
  const candidates = await eligibleProfessionals(db, company.id, svc.id);
  const selected =
    input.professionalId === ANY_PROFESSIONAL ? candidates : candidates.filter((p) => p.id === input.professionalId);
  if (!selected.length) return [];
  const window = bookingWindow(rules, now);
  const all = new Map<number, Date>();
  for (const pro of selected) {
    for (const slot of await slotsForProfessional(db, rules, pro.id, svc, input.date as LocalDate, window)) {
      all.set(slot.getTime(), slot);
    }
  }
  return [...all.values()]
    .sort((a, b) => a.getTime() - b.getTime())
    .map((d) => ({ start: d.toISOString(), label: formatHHMM(d, company.timezone) }));
}

function formatHHMM(d: Date, tz: string) {
  const { minuteOfDay } = instantToLocal(d, tz);
  return `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`;
}

export const publicBookingSchema = z.object({
  serviceId: uuidSchema,
  professionalId: z.union([uuidSchema, z.literal(ANY_PROFESSIONAL)]),
  startsAt: z.coerce.date({ message: "Horário inválido." }),
  name: requiredText(100, "O nome"),
  phone: requiredText(30, "O telefone"),
  email: emailSchema,
});

export type PublicBookingResult = {
  manageToken: string;
  publicCode: string;
  startsAt: Date;
  endsAt: Date;
  serviceName: string;
  professionalName: string;
  priceCents: number;
};

/**
 * Cria a reserva pública. A disponibilidade é revalidada dentro da transação
 * (com trava do profissional) no momento da confirmação.
 */
export async function createPublicBooking(db: DbOrTx, slug: string, input: unknown, now = new Date()): Promise<PublicBookingResult> {
  const data = parseInput(publicBookingSchema, input);
  const company = await requireCompany(db, slug);
  const rules = await getCompanyRules(db, company.id);
  const svc = await requireActiveService(db, company.id, data.serviceId);
  const candidates = await eligibleProfessionals(db, company.id, svc.id);
  const ordered =
    data.professionalId === ANY_PROFESSIONAL ? candidates : candidates.filter((p) => p.id === data.professionalId);
  if (!ordered.length) throw new AppError("service_not_offered", "Este profissional não realiza este serviço.");

  const window = bookingWindow(rules, now);
  let lastError: unknown = new SlotUnavailableError();
  for (const pro of ordered) {
    const token = generateSecretToken();
    try {
      const appt = await withOverlapGuard(() =>
        db.transaction(async (tx) => {
          const customer = await findOrCreateCustomerForBooking(tx, company.id, data);
          const created = await insertAppointmentLocked(tx, {
            companyId: company.id,
            professionalId: pro.id,
            serviceId: svc.id,
            customerId: customer.id,
            startsAt: data.startsAt,
            source: "public",
            window,
            createdByUserId: null,
            manageTokenHash: hashToken(token),
          });
          await audit(tx, {
            companyId: company.id,
            actorUserId: null,
            actorType: "customer",
            action: "appointment.created",
            entityType: "appointment",
            entityId: created.id,
            details: `Agendamento público: ${created.serviceName} com ${created.professionalName}`,
          });
          return created;
        }),
      );
      return {
        manageToken: token,
        publicCode: appt.publicCode,
        startsAt: appt.startsAt,
        endsAt: appt.endsAt,
        serviceName: appt.serviceName,
        professionalName: appt.professionalName,
        priceCents: appt.priceCents,
      };
    } catch (err) {
      lastError = err;
      // Com "qualquer profissional", tenta o próximo apenas se o horário não serve para este.
      const retryable = err instanceof AppError && (err.code === "slot_unavailable" || err.code === "slot_outside_hours");
      if (!retryable || data.professionalId !== ANY_PROFESSIONAL) throw err;
    }
  }
  throw lastError;
}

async function findByToken(db: DbOrTx, token: string, forUpdate = false) {
  if (!looksLikeToken(token)) return null;
  const q = db
    .select({ appt: appointments, company: companies })
    .from(appointments)
    .innerJoin(companies, eq(companies.id, appointments.companyId))
    .where(eq(appointments.manageTokenHash, hashToken(token)));
  const [row] = forUpdate ? await q.for("update", { of: appointments }) : await q;
  return row ?? null;
}

export type ManagedBooking = {
  publicCode: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  serviceName: string;
  professionalName: string;
  professionalId: string;
  serviceId: string;
  priceCents: number;
  company: {
    name: string;
    slug: string;
    timezone: string;
    phone: string | null;
    addressLine: string | null;
    city: string | null;
    brandColor: string;
  };
  canCancel: boolean;
  canReschedule: boolean;
  policyMessage: string | null;
};

function changePolicy(
  company: typeof companies.$inferSelect,
  appt: typeof appointments.$inferSelect,
  now: Date,
): { canCancel: boolean; canReschedule: boolean; message: string | null } {
  if (appt.status !== "confirmed") return { canCancel: false, canReschedule: false, message: null };
  const deadline = appt.startsAt.getTime() - company.clientChangeMinAdvanceMinutes * 60000;
  const inTime = now.getTime() <= deadline;
  const canCancel = company.allowClientCancel && inTime;
  const canReschedule = company.allowClientReschedule && inTime;
  let message: string | null = null;
  if (!inTime && (company.allowClientCancel || company.allowClientReschedule)) {
    const h = Math.round(company.clientChangeMinAdvanceMinutes / 60);
    message = `Alterações pelo link só são possíveis até ${h > 0 ? `${h} hora(s)` : `${company.clientChangeMinAdvanceMinutes} minutos`} antes do horário. Entre em contato com o estabelecimento.`;
  } else if (!company.allowClientCancel && !company.allowClientReschedule) {
    message = "Para alterar ou cancelar, entre em contato com o estabelecimento.";
  }
  return { canCancel, canReschedule, message };
}

export async function getBookingByToken(db: DbOrTx, token: string, now = new Date()): Promise<ManagedBooking | null> {
  const row = await findByToken(db, token);
  if (!row) return null;
  const { appt, company } = row;
  const policy = changePolicy(company, appt, now);
  return {
    publicCode: appt.publicCode,
    status: appt.status,
    startsAt: appt.startsAt,
    endsAt: appt.endsAt,
    serviceName: appt.serviceName,
    professionalName: appt.professionalName,
    professionalId: appt.professionalId,
    serviceId: appt.serviceId,
    priceCents: appt.priceCents,
    company: {
      name: company.name,
      slug: company.slug,
      timezone: company.timezone,
      phone: company.phone,
      addressLine: company.addressLine,
      city: company.city,
      brandColor: company.brandColor,
    },
    canCancel: policy.canCancel,
    canReschedule: policy.canReschedule,
    policyMessage: policy.message,
  };
}

export async function cancelByToken(db: DbOrTx, token: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const row = await findByToken(tx, token, true);
    if (!row) throw new NotFoundError("Reserva");
    const policy = changePolicy(row.company, row.appt, now);
    if (!policy.canCancel) throw new AppError("cancel_not_allowed", policy.message ?? "Esta reserva não pode mais ser cancelada pelo link.");
    await cancelAppointmentLocked(tx, row.appt, "client", null);
    await audit(tx, {
      companyId: row.company.id,
      actorUserId: null,
      actorType: "customer",
      action: "appointment.cancelled",
      entityType: "appointment",
      entityId: row.appt.id,
      details: "Cancelado pelo cliente via link",
    });
  });
}

/** Horários para reagendar pelo link (mesmo profissional e mesma duração). */
export async function getRescheduleSlots(db: DbOrTx, token: string, date: string, now = new Date()) {
  if (!isValidLocalDate(date)) throw new ValidationError({ date: "Data inválida." });
  const row = await findByToken(db, token);
  if (!row) throw new NotFoundError("Reserva");
  const rules = await getCompanyRules(db, row.company.id);
  const slots = await slotsForProfessional(
    db,
    rules,
    row.appt.professionalId,
    row.appt,
    date as LocalDate,
    bookingWindow(rules, now),
    row.appt.id,
  );
  return slots.map((d) => ({ start: d.toISOString(), label: formatHHMM(d, row.company.timezone) }));
}

export async function rescheduleByToken(db: DbOrTx, token: string, startsAtInput: unknown, now = new Date()) {
  const startsAt = parseInput(z.coerce.date({ message: "Horário inválido." }), startsAtInput);
  return withOverlapGuard(() =>
    db.transaction(async (tx) => {
      const row = await findByToken(tx, token, true);
      if (!row) throw new NotFoundError("Reserva");
      const policy = changePolicy(row.company, row.appt, now);
      if (!policy.canReschedule) {
        throw new AppError("reschedule_not_allowed", policy.message ?? "Esta reserva não pode mais ser reagendada pelo link.");
      }
      const rules = await getCompanyRules(tx, row.company.id);
      const updated = await rescheduleLocked(tx, row.appt, startsAt, row.appt.professionalId, bookingWindow(rules, now));
      await audit(tx, {
        companyId: row.company.id,
        actorUserId: null,
        actorType: "customer",
        action: "appointment.rescheduled",
        entityType: "appointment",
        entityId: row.appt.id,
        details: `Reagendado pelo cliente: ${row.appt.startsAt.toISOString()} → ${updated.startsAt.toISOString()}`,
      });
      return updated;
    }),
  );
}
