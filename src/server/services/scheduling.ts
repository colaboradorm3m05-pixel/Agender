/**
 * Agenda: disponibilidade e ciclo de vida dos atendimentos.
 *
 * Garantia contra sobreposição (duas camadas):
 * 1. Toda criação/alteração roda em transação que trava (SELECT ... FOR UPDATE)
 *    a linha do profissional e revalida a disponibilidade com os dados atuais.
 * 2. A constraint de exclusão `appointments_no_overlap` no PostgreSQL rejeita
 *    qualquer sobreposição que escape da camada 1.
 */
import { and, asc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx, Tx } from "@/db";
import {
  appointments,
  companies,
  companyHours,
  customers,
  payments,
  professionalServices,
  professionals,
  recurringBreaks,
  services,
  timeBlocks,
  workingHours,
  type AppointmentStatus,
} from "@/db/schema";
import {
  availableStarts,
  checkInterval,
  REASON_MESSAGES,
  type BookingWindow,
  type DayInputs,
  type ServiceShape,
} from "@/domain/availability";
import { addDays, instantToLocal, localToInstant, type LocalDate } from "@/domain/time";
import { generatePublicCode } from "@/domain/tokens";
import { AppError, ForbiddenError, isOverlapViolation, NotFoundError, SlotUnavailableError } from "../errors";
import { assertCan, assertCanViewProfessional, can, type Actor } from "../permissions";
import { audit } from "../audit";
import { findOrCreateCustomerForBooking, getCustomerInCompany } from "./customers";
import { clearCommission, snapshotCommission } from "./commissions";
import { emailSchema, optionalText, parseInput, requiredText, uuidSchema } from "../validation";

export type Appointment = typeof appointments.$inferSelect;

type CompanyRules = {
  id: string;
  timezone: string;
  slotStepMinutes: number;
  minAdvanceMinutes: number;
  maxDaysAhead: number;
};

export async function getCompanyRules(db: DbOrTx, companyId: string): Promise<CompanyRules> {
  const [c] = await db
    .select({
      id: companies.id,
      timezone: companies.timezone,
      slotStepMinutes: companies.slotStepMinutes,
      minAdvanceMinutes: companies.minAdvanceMinutes,
      maxDaysAhead: companies.maxDaysAhead,
    })
    .from(companies)
    .where(eq(companies.id, companyId));
  if (!c) throw new NotFoundError("Empresa");
  return c;
}

/** Carrega tudo que influencia a disponibilidade de um profissional em uma data local. */
export async function loadDayInputs(
  db: DbOrTx,
  company: Pick<CompanyRules, "id" | "timezone">,
  professionalId: string,
  date: LocalDate,
  excludeAppointmentId?: string,
): Promise<DayInputs> {
  // Margem de um dia para cada lado cobre atendimentos que cruzam a meia-noite.
  const from = localToInstant(addDays(date, -1), 0, company.timezone);
  const to = localToInstant(addDays(date, 2), 0, company.timezone);
  // Consultas em sequência: esta função roda dentro de transações (uma única conexão).
  const hours = await db
    .select({ weekday: companyHours.weekday, startMinute: companyHours.startMinute, endMinute: companyHours.endMinute })
    .from(companyHours)
    .where(eq(companyHours.companyId, company.id));
  const work = await db
    .select({ weekday: workingHours.weekday, startMinute: workingHours.startMinute, endMinute: workingHours.endMinute })
    .from(workingHours)
    .where(and(eq(workingHours.professionalId, professionalId), eq(workingHours.companyId, company.id)));
  const breaks = await db
    .select({ weekday: recurringBreaks.weekday, startMinute: recurringBreaks.startMinute, endMinute: recurringBreaks.endMinute })
    .from(recurringBreaks)
    .where(and(eq(recurringBreaks.professionalId, professionalId), eq(recurringBreaks.companyId, company.id)));
  const blocks = await db
    .select({ startsAt: timeBlocks.startsAt, endsAt: timeBlocks.endsAt })
    .from(timeBlocks)
    .where(
      and(
        eq(timeBlocks.companyId, company.id),
        or(isNull(timeBlocks.professionalId), eq(timeBlocks.professionalId, professionalId)),
        lt(timeBlocks.startsAt, to),
        gt(timeBlocks.endsAt, from),
      ),
    );
  const busy = await db
    .select({ startsAt: appointments.startsAt, occupiedUntil: appointments.occupiedUntil })
    .from(appointments)
    .where(
      and(
        eq(appointments.professionalId, professionalId),
        ne(appointments.status, "cancelled"),
        lt(appointments.startsAt, to),
        gt(appointments.occupiedUntil, from),
        excludeAppointmentId ? ne(appointments.id, excludeAppointmentId) : undefined,
      ),
    );
  return {
    date,
    timeZone: company.timezone,
    companyHours: hours,
    workingHours: work,
    breaks,
    blocks: blocks.map((b) => ({ start: b.startsAt.getTime(), end: b.endsAt.getTime() })),
    busy: busy.map((b) => ({ start: b.startsAt.getTime(), end: b.occupiedUntil.getTime() })),
  };
}

export function bookingWindow(company: CompanyRules, now: Date): BookingWindow {
  return { now, minAdvanceMinutes: company.minAdvanceMinutes, maxDaysAhead: company.maxDaysAhead };
}

/** Profissionais ativos que atendem o serviço. */
export async function eligibleProfessionals(db: DbOrTx, companyId: string, serviceId: string) {
  return db
    .select({ id: professionals.id, name: professionals.name })
    .from(professionals)
    .innerJoin(professionalServices, eq(professionalServices.professionalId, professionals.id))
    .where(
      and(eq(professionals.companyId, companyId), eq(professionals.active, true), eq(professionalServices.serviceId, serviceId)),
    )
    .orderBy(asc(professionals.displayOrder), asc(professionals.name));
}

export async function slotsForProfessional(
  db: DbOrTx,
  company: CompanyRules,
  professionalId: string,
  service: ServiceShape,
  date: LocalDate,
  window?: BookingWindow,
  excludeAppointmentId?: string,
): Promise<Date[]> {
  const day = await loadDayInputs(db, company, professionalId, date, excludeAppointmentId);
  return availableStarts(day, service, company.slotStepMinutes, window);
}

type CreateParams = {
  companyId: string;
  professionalId: string;
  serviceId: string;
  customerId: string;
  startsAt: Date;
  source: "public" | "manual";
  /** Regras do link público (antecedência, limite de dias, grade). Ausente para a equipe. */
  window?: BookingWindow;
  createdByUserId: string | null;
  notes?: string | null;
  manageTokenHash?: string | null;
};

function failCheck(reason: keyof typeof REASON_MESSAGES): never {
  if (reason === "conflict") throw new SlotUnavailableError();
  throw new AppError(`slot_${reason}`, REASON_MESSAGES[reason], 409);
}

async function lockProfessional(tx: Tx, companyId: string, professionalId: string) {
  const [pro] = await tx
    .select()
    .from(professionals)
    .where(and(eq(professionals.id, professionalId), eq(professionals.companyId, companyId)))
    .for("update");
  if (!pro) throw new NotFoundError("Profissional");
  return pro;
}

/** Executa a função convertendo violação da constraint anti-sobreposição em erro amigável. */
export async function withOverlapGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isOverlapViolation(err)) throw new SlotUnavailableError();
    throw err;
  }
}

/** Cria o atendimento dentro de uma transação já aberta. */
export async function insertAppointmentLocked(tx: Tx, p: CreateParams): Promise<Appointment> {
  const pro = await lockProfessional(tx, p.companyId, p.professionalId);
  if (!pro.active) throw new AppError("inactive_professional", "Este profissional não está disponível para novos agendamentos.");
  const [service] = await tx
    .select()
    .from(services)
    .where(and(eq(services.id, p.serviceId), eq(services.companyId, p.companyId)));
  if (!service) throw new NotFoundError("Serviço");
  if (!service.active) throw new AppError("inactive_service", "Este serviço não está disponível para novos agendamentos.");
  const [link] = await tx
    .select()
    .from(professionalServices)
    .where(and(eq(professionalServices.professionalId, pro.id), eq(professionalServices.serviceId, service.id)));
  if (!link) throw new AppError("service_not_offered", "Este profissional não realiza este serviço.");

  const company = await getCompanyRules(tx, p.companyId);
  const local = instantToLocal(p.startsAt, company.timezone);
  if (p.window && local.minuteOfDay % company.slotStepMinutes !== 0) failCheck("outside_hours");
  const day = await loadDayInputs(tx, company, pro.id, local.date);
  const check = checkInterval(day, service, p.startsAt, p.window);
  if (!check.ok) failCheck(check.reason);

  const endsAt = new Date(p.startsAt.getTime() + service.durationMinutes * 60000);
  const occupiedUntil = new Date(endsAt.getTime() + service.bufferAfterMinutes * 60000);
  const [created] = await tx
    .insert(appointments)
    .values({
      companyId: p.companyId,
      professionalId: pro.id,
      serviceId: service.id,
      customerId: p.customerId,
      startsAt: p.startsAt,
      endsAt,
      occupiedUntil,
      status: "confirmed",
      serviceName: service.name,
      priceCents: service.priceCents,
      durationMinutes: service.durationMinutes,
      bufferAfterMinutes: service.bufferAfterMinutes,
      professionalName: pro.name,
      source: p.source,
      publicCode: generatePublicCode(),
      manageTokenHash: p.manageTokenHash ?? null,
      notes: p.notes ?? null,
      createdByUserId: p.createdByUserId,
    })
    .returning();
  return created;
}

const manualSchema = z
  .object({
    professionalId: uuidSchema,
    serviceId: uuidSchema,
    startsAt: z.coerce.date({ message: "Data/hora inválida." }),
    customerId: uuidSchema.optional().nullable(),
    newCustomer: z
      .object({ name: requiredText(100, "O nome"), phone: requiredText(30, "O telefone"), email: emailSchema })
      .optional()
      .nullable(),
    notes: optionalText(500),
  })
  .refine((v) => v.customerId || v.newCustomer, { message: "Escolha ou cadastre o cliente.", path: ["customerId"] });

/** Agendamento manual pela equipe (sem as restrições de antecedência do link público). */
export async function createManualAppointment(db: DbOrTx, actor: Actor, input: unknown): Promise<Appointment> {
  assertCan(actor, "appointment.manage_all");
  const data = parseInput(manualSchema, input);
  const created = await withOverlapGuard(() =>
    db.transaction(async (tx) => {
      const customer = data.customerId
        ? await getCustomerInCompany(tx, actor.companyId, data.customerId)
        : await findOrCreateCustomerForBooking(tx, actor.companyId, data.newCustomer!);
      const appt = await insertAppointmentLocked(tx, {
        companyId: actor.companyId,
        professionalId: data.professionalId,
        serviceId: data.serviceId,
        customerId: customer.id,
        startsAt: data.startsAt,
        source: "manual",
        createdByUserId: actor.userId,
        notes: data.notes,
      });
      await audit(tx, {
        companyId: actor.companyId,
        actorUserId: actor.userId,
        actorType: "user",
        action: "appointment.created",
        entityType: "appointment",
        entityId: appt.id,
        details: `${appt.serviceName} com ${appt.professionalName} em ${appt.startsAt.toISOString()}`,
      });
      return appt;
    }),
  );
  return created;
}

async function getAppointmentForUpdate(tx: Tx, companyId: string, appointmentId: string) {
  const [appt] = await tx
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.companyId, companyId)))
    .for("update");
  if (!appt) throw new NotFoundError("Agendamento");
  return appt;
}

/**
 * Reagenda mantendo a fotografia do serviço (preço/duração do momento da reserva).
 * Pode trocar de profissional, desde que ele atenda o serviço.
 */
export async function rescheduleLocked(
  tx: Tx,
  appt: Appointment,
  newStart: Date,
  newProfessionalId: string,
  window?: BookingWindow,
): Promise<Appointment> {
  if (appt.status !== "confirmed") throw new AppError("not_reschedulable", "Só é possível reagendar atendimentos confirmados.");
  // Trava os profissionais envolvidos em ordem fixa para evitar deadlock.
  const ids = [...new Set([appt.professionalId, newProfessionalId])].sort();
  const locked = [];
  for (const id of ids) locked.push(await lockProfessional(tx, appt.companyId, id));
  const pro = locked.find((p) => p.id === newProfessionalId)!;
  if (newProfessionalId !== appt.professionalId) {
    if (!pro.active) throw new AppError("inactive_professional", "Este profissional não está disponível.");
    const [link] = await tx
      .select()
      .from(professionalServices)
      .where(and(eq(professionalServices.professionalId, pro.id), eq(professionalServices.serviceId, appt.serviceId)));
    if (!link) throw new AppError("service_not_offered", "Este profissional não realiza este serviço.");
  }
  const company = await getCompanyRules(tx, appt.companyId);
  const local = instantToLocal(newStart, company.timezone);
  if (window && local.minuteOfDay % company.slotStepMinutes !== 0) failCheck("outside_hours");
  const shape = { durationMinutes: appt.durationMinutes, bufferAfterMinutes: appt.bufferAfterMinutes };
  const day = await loadDayInputs(tx, company, pro.id, local.date, appt.id);
  const check = checkInterval(day, shape, newStart, window);
  if (!check.ok) failCheck(check.reason);
  const endsAt = new Date(newStart.getTime() + appt.durationMinutes * 60000);
  const [updated] = await tx
    .update(appointments)
    .set({
      startsAt: newStart,
      endsAt,
      occupiedUntil: new Date(endsAt.getTime() + appt.bufferAfterMinutes * 60000),
      professionalId: pro.id,
      professionalName: pro.name,
    })
    .where(eq(appointments.id, appt.id))
    .returning();
  return updated;
}

const rescheduleSchema = z.object({
  startsAt: z.coerce.date({ message: "Data/hora inválida." }),
  professionalId: uuidSchema.optional(),
});

export async function rescheduleAppointment(db: DbOrTx, actor: Actor, appointmentId: string, input: unknown) {
  assertCan(actor, "appointment.manage_all");
  const data = parseInput(rescheduleSchema, input);
  return withOverlapGuard(() =>
    db.transaction(async (tx) => {
      const appt = await getAppointmentForUpdate(tx, actor.companyId, appointmentId);
      const before = appt.startsAt.toISOString();
      const updated = await rescheduleLocked(tx, appt, data.startsAt, data.professionalId ?? appt.professionalId);
      await audit(tx, {
        companyId: actor.companyId,
        actorUserId: actor.userId,
        actorType: "user",
        action: "appointment.rescheduled",
        entityType: "appointment",
        entityId: appt.id,
        details: `${before} → ${updated.startsAt.toISOString()} (${updated.professionalName})`,
      });
      return updated;
    }),
  );
}

const STATUS_PT: Record<AppointmentStatus, string> = {
  confirmed: "confirmado",
  completed: "concluído",
  cancelled: "cancelado",
  no_show: "não compareceu",
};

const STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  confirmed: ["completed", "no_show"],
  completed: ["confirmed"],
  no_show: ["confirmed"],
  cancelled: [],
};

/** Concluir, registrar falta ou desfazer (voltar para confirmado). */
export async function updateAppointmentStatus(db: DbOrTx, actor: Actor, appointmentId: string, status: unknown, now = new Date()) {
  const next = parseInput(z.enum(["confirmed", "completed", "no_show"]), status);
  return db.transaction(async (tx) => {
    const appt = await getAppointmentForUpdate(tx, actor.companyId, appointmentId);
    const ownAppointment = actor.professionalId === appt.professionalId;
    if (!can(actor, "appointment.manage_all") && !(can(actor, "appointment.status_own") && ownAppointment)) {
      throw new ForbiddenError("Você só pode atualizar os seus próprios atendimentos.");
    }
    if (!STATUS_TRANSITIONS[appt.status].includes(next)) {
      throw new AppError("invalid_transition", "Esta mudança de status não é permitida.");
    }
    if (next !== "confirmed" && appt.startsAt.getTime() > now.getTime()) {
      throw new AppError("future_appointment", "Só é possível concluir ou registrar falta depois do horário de início.");
    }
    const [updated] = await tx.update(appointments).set({ status: next }).where(eq(appointments.id, appt.id)).returning();
    // Comissão: fotografada ao concluir; removida se a conclusão for desfeita.
    if (next === "completed") {
      const company = await getCompanyRules(tx, appt.companyId);
      await snapshotCommission(tx, updated, company.timezone);
    } else if (appt.status === "completed") {
      await clearCommission(tx, appt.id);
    }
    await audit(tx, {
      companyId: actor.companyId,
      actorUserId: actor.userId,
      actorType: "user",
      action: "appointment.status_changed",
      entityType: "appointment",
      entityId: appt.id,
      details: `${STATUS_PT[appt.status]} → ${STATUS_PT[next]}`,
    });
    return updated;
  });
}

export async function cancelAppointmentLocked(
  tx: Tx,
  appt: Appointment,
  by: "staff" | "client",
  reason: string | null,
): Promise<Appointment> {
  if (appt.status !== "confirmed") throw new AppError("not_cancellable", "Só é possível cancelar atendimentos confirmados.");
  const [updated] = await tx
    .update(appointments)
    .set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: by, cancelReason: reason })
    .where(eq(appointments.id, appt.id))
    .returning();
  return updated;
}

/** Cancelar libera o horário (a constraint ignora atendimentos cancelados). */
export async function cancelAppointment(db: DbOrTx, actor: Actor, appointmentId: string, reason?: unknown) {
  assertCan(actor, "appointment.manage_all");
  const why = parseInput(optionalText(300), reason ?? null);
  return db.transaction(async (tx) => {
    const appt = await getAppointmentForUpdate(tx, actor.companyId, appointmentId);
    const updated = await cancelAppointmentLocked(tx, appt, "staff", why);
    await audit(tx, {
      companyId: actor.companyId,
      actorUserId: actor.userId,
      actorType: "user",
      action: "appointment.cancelled",
      entityType: "appointment",
      entityId: appt.id,
      details: why ?? undefined,
    });
    return updated;
  });
}

export type AgendaItem = {
  id: string;
  professionalId: string;
  professionalName: string;
  serviceName: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  startsAt: Date;
  endsAt: Date;
  occupiedUntil: Date;
  status: AppointmentStatus;
  priceCents: number;
  paidCents: number;
  publicCode: string;
  source: string;
  notes: string | null;
};

/** Lista atendimentos de um período respeitando o que o usuário pode ver. */
export async function listAgenda(
  db: DbOrTx,
  actor: Actor,
  from: Date,
  to: Date,
  professionalId?: string | null,
): Promise<AgendaItem[]> {
  let proFilter: string | null = professionalId ?? null;
  if (!can(actor, "agenda.view_all")) {
    if (!actor.professionalId) throw new ForbiddenError();
    if (proFilter && proFilter !== actor.professionalId) assertCanViewProfessional(actor, proFilter);
    proFilter = actor.professionalId;
  }
  const showPaid = can(actor, "payments.manage");
  const rows = await db
    .select({
      id: appointments.id,
      professionalId: appointments.professionalId,
      professionalName: appointments.professionalName,
      serviceName: appointments.serviceName,
      customerId: appointments.customerId,
      customerName: customers.name,
      customerPhone: customers.phone,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      occupiedUntil: appointments.occupiedUntil,
      status: appointments.status,
      priceCents: appointments.priceCents,
      paidCents: sql<number>`coalesce((select sum(p.amount_cents) from ${payments} p where p.appointment_id = "appointments"."id"), 0)::int`,
      publicCode: appointments.publicCode,
      source: appointments.source,
      notes: appointments.notes,
    })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .where(
      and(
        eq(appointments.companyId, actor.companyId),
        lt(appointments.startsAt, to),
        gt(appointments.endsAt, from),
        proFilter ? eq(appointments.professionalId, proFilter) : undefined,
      ),
    )
    .orderBy(asc(appointments.startsAt));
  return rows.map((r) => ({ ...r, paidCents: showPaid ? r.paidCents : 0 }));
}

export async function getAppointment(db: DbOrTx, actor: Actor, appointmentId: string) {
  const [appt] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.companyId, actor.companyId)));
  if (!appt) throw new NotFoundError("Agendamento");
  assertCanViewProfessional(actor, appt.professionalId);
  return appt;
}

/** Horários livres para a equipe (sem antecedência mínima nem limite de dias). */
export async function staffSlots(
  db: DbOrTx,
  actor: Actor,
  input: { professionalId: string; serviceId: string; date: LocalDate; excludeAppointmentId?: string },
) {
  assertCan(actor, "appointment.manage_all");
  const company = await getCompanyRules(db, actor.companyId);
  let shape: ServiceShape;
  if (input.excludeAppointmentId) {
    const appt = await getAppointment(db, actor, input.excludeAppointmentId);
    shape = appt;
  } else {
    const [svc] = await db
      .select()
      .from(services)
      .where(and(eq(services.id, input.serviceId), eq(services.companyId, actor.companyId)));
    if (!svc) throw new NotFoundError("Serviço");
    shape = svc;
  }
  await lockFreeCheckProfessional(db, actor.companyId, input.professionalId);
  return slotsForProfessional(db, company, input.professionalId, shape, input.date, undefined, input.excludeAppointmentId);
}

async function lockFreeCheckProfessional(db: DbOrTx, companyId: string, professionalId: string) {
  const [pro] = await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(and(eq(professionals.id, professionalId), eq(professionals.companyId, companyId)));
  if (!pro) throw new NotFoundError("Profissional");
}

export async function appointmentsByIds(db: DbOrTx, companyId: string, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select()
    .from(appointments)
    .where(and(eq(appointments.companyId, companyId), inArray(appointments.id, ids)));
}
