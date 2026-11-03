/** Profissionais: cadastro, jornada, pausas, bloqueios e convites de acesso. */
import { and, asc, eq, gt, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db";
import {
  appointments,
  memberships,
  professionalInvites,
  professionalServices,
  professionals,
  recurringBreaks,
  timeBlocks,
  user,
  workingHours,
} from "@/db/schema";
import { generateSecretToken, hashToken, looksLikeToken } from "@/domain/tokens";
import type { WeeklyRange } from "@/domain/availability";
import { AppError, NotFoundError, ValidationError } from "../errors";
import { assertCan, can, type Actor } from "../permissions";
import { audit } from "../audit";
import { optionalText, parseInput, requiredText, uuidSchema, weeklyRangesSchema } from "../validation";

export type Professional = typeof professionals.$inferSelect;

const professionalSchema = z.object({
  name: requiredText(80, "O nome"),
  photoUrl: optionalText(500).refine((v) => !v || /^https:\/\//.test(v), "Use um endereço de imagem começando com https://"),
  active: z.boolean().default(true),
});

export async function listProfessionals(db: DbOrTx, actor: Actor, opts: { includeInactive?: boolean } = {}) {
  const ownOnly = !can(actor, "agenda.view_all");
  const rows = await db
    .select()
    .from(professionals)
    .where(
      and(
        eq(professionals.companyId, actor.companyId),
        opts.includeInactive ? undefined : eq(professionals.active, true),
        ownOnly ? eq(professionals.id, actor.professionalId ?? "00000000-0000-0000-0000-000000000000") : undefined,
      ),
    )
    .orderBy(asc(professionals.displayOrder), asc(professionals.name));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [links, members] = await Promise.all([
    db
      .select({ professionalId: professionalServices.professionalId, serviceId: professionalServices.serviceId })
      .from(professionalServices)
      .where(inArray(professionalServices.professionalId, ids)),
    db
      .select({ professionalId: memberships.professionalId, email: user.email })
      .from(memberships)
      .innerJoin(user, eq(user.id, memberships.userId))
      .where(inArray(memberships.professionalId, ids)),
  ]);
  return rows.map((p) => ({
    ...p,
    serviceIds: links.filter((l) => l.professionalId === p.id).map((l) => l.serviceId),
    accessEmail: members.find((m) => m.professionalId === p.id)?.email ?? null,
  }));
}

export async function getProfessional(db: DbOrTx, actor: Actor, professionalId: string) {
  const [pro] = await db
    .select()
    .from(professionals)
    .where(and(eq(professionals.id, professionalId), eq(professionals.companyId, actor.companyId)));
  if (!pro) throw new NotFoundError("Profissional");
  return pro;
}

export async function createProfessional(db: DbOrTx, actor: Actor, input: unknown): Promise<Professional> {
  assertCan(actor, "staff.manage");
  const data = parseInput(professionalSchema, input);
  const [pro] = await db.insert(professionals).values({ ...data, companyId: actor.companyId }).returning();
  return pro;
}

export async function updateProfessional(db: DbOrTx, actor: Actor, professionalId: string, input: unknown) {
  assertCan(actor, "staff.manage");
  const data = parseInput(professionalSchema, input);
  const [pro] = await db
    .update(professionals)
    .set(data)
    .where(and(eq(professionals.id, professionalId), eq(professionals.companyId, actor.companyId)))
    .returning();
  if (!pro) throw new NotFoundError("Profissional");
  await audit(db, {
    companyId: actor.companyId,
    actorUserId: actor.userId,
    actorType: "user",
    action: "professional.updated",
    entityType: "professional",
    entityId: pro.id,
    details: `${pro.name} (${pro.active ? "ativo" : "inativo"})`,
  });
  return pro;
}

export async function getSchedule(db: DbOrTx, actor: Actor, professionalId: string) {
  await getProfessional(db, actor, professionalId);
  const cols = { weekday: workingHours.weekday, startMinute: workingHours.startMinute, endMinute: workingHours.endMinute };
  const [hours, breaks] = await Promise.all([
    db.select(cols).from(workingHours).where(eq(workingHours.professionalId, professionalId)).orderBy(asc(workingHours.weekday), asc(workingHours.startMinute)),
    db
      .select({ weekday: recurringBreaks.weekday, startMinute: recurringBreaks.startMinute, endMinute: recurringBreaks.endMinute })
      .from(recurringBreaks)
      .where(eq(recurringBreaks.professionalId, professionalId))
      .orderBy(asc(recurringBreaks.weekday), asc(recurringBreaks.startMinute)),
  ]);
  return { hours: hours as WeeklyRange[], breaks: breaks as WeeklyRange[] };
}

/**
 * Substitui jornada e pausas. Atendimentos já marcados não são alterados;
 * a nova jornada vale para novos agendamentos.
 */
export async function setSchedule(db: DbOrTx, actor: Actor, professionalId: string, input: unknown) {
  assertCan(actor, "staff.manage");
  const data = parseInput(z.object({ hours: weeklyRangesSchema, breaks: weeklyRangesSchema }), input);
  await db.transaction(async (tx) => {
    const [pro] = await tx
      .select({ id: professionals.id })
      .from(professionals)
      .where(and(eq(professionals.id, professionalId), eq(professionals.companyId, actor.companyId)))
      .for("update");
    if (!pro) throw new NotFoundError("Profissional");
    await tx.delete(workingHours).where(eq(workingHours.professionalId, professionalId));
    await tx.delete(recurringBreaks).where(eq(recurringBreaks.professionalId, professionalId));
    const base = { companyId: actor.companyId, professionalId };
    if (data.hours.length) await tx.insert(workingHours).values(data.hours.map((h) => ({ ...h, ...base })));
    if (data.breaks.length) await tx.insert(recurringBreaks).values(data.breaks.map((b) => ({ ...b, ...base })));
  });
}

const blockSchema = z
  .object({
    professionalId: uuidSchema.nullable(),
    startsAt: z.coerce.date({ message: "Data inválida." }),
    endsAt: z.coerce.date({ message: "Data inválida." }),
    reason: optionalText(200),
  })
  .refine((b) => b.startsAt < b.endsAt, { message: "O fim deve ser depois do início.", path: ["endsAt"] });

/**
 * Bloqueio de horário. Recusa se houver atendimento ativo no período, para que
 * o proprietário decida (reagendar/cancelar) antes de bloquear.
 */
export async function createTimeBlock(db: DbOrTx, actor: Actor, input: unknown) {
  assertCan(actor, "blocks.manage_all");
  const data = parseInput(blockSchema, input);
  return db.transaction(async (tx) => {
    // Trava os profissionais afetados para não competir com reservas simultâneas.
    const affected = await tx
      .select({ id: professionals.id })
      .from(professionals)
      .where(
        and(eq(professionals.companyId, actor.companyId), data.professionalId ? eq(professionals.id, data.professionalId) : undefined),
      )
      .for("update");
    if (data.professionalId && !affected.length) throw new NotFoundError("Profissional");
    const conflicts = await tx
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.companyId, actor.companyId),
          data.professionalId ? eq(appointments.professionalId, data.professionalId) : undefined,
          eq(appointments.status, "confirmed"),
          lt(appointments.startsAt, data.endsAt),
          gt(appointments.endsAt, data.startsAt),
        ),
      );
    if (conflicts.length) {
      throw new AppError(
        "block_conflict",
        `Existem ${conflicts.length} atendimento(s) confirmado(s) neste período. Reagende ou cancele antes de bloquear.`,
        409,
      );
    }
    const [block] = await tx
      .insert(timeBlocks)
      .values({ ...data, companyId: actor.companyId, createdByUserId: actor.userId })
      .returning();
    return block;
  });
}

export async function listTimeBlocks(db: DbOrTx, actor: Actor, from: Date, to: Date, professionalId?: string | null) {
  const ownOnly = !can(actor, "agenda.view_all");
  const proFilter = ownOnly ? actor.professionalId : professionalId;
  return db
    .select()
    .from(timeBlocks)
    .where(
      and(
        eq(timeBlocks.companyId, actor.companyId),
        lt(timeBlocks.startsAt, to),
        gt(timeBlocks.endsAt, from),
        proFilter ? or(eq(timeBlocks.professionalId, proFilter), isNull(timeBlocks.professionalId)) : undefined,
      ),
    )
    .orderBy(asc(timeBlocks.startsAt));
}

export async function deleteTimeBlock(db: DbOrTx, actor: Actor, blockId: string) {
  assertCan(actor, "blocks.manage_all");
  const deleted = await db
    .delete(timeBlocks)
    .where(and(eq(timeBlocks.id, blockId), eq(timeBlocks.companyId, actor.companyId)))
    .returning({ id: timeBlocks.id });
  if (!deleted.length) throw new NotFoundError("Bloqueio");
}

const INVITE_TTL_DAYS = 7;

/** Gera link de convite para o profissional criar o próprio acesso. Retorna o token (exibido uma vez). */
export async function createInvite(db: DbOrTx, actor: Actor, professionalId: string): Promise<{ token: string; expiresAt: Date }> {
  assertCan(actor, "staff.manage");
  await getProfessional(db, actor, professionalId);
  const [linked] = await db.select({ id: memberships.id }).from(memberships).where(eq(memberships.professionalId, professionalId));
  if (linked) throw new AppError("already_linked", "Este profissional já tem acesso ao sistema.");
  const token = generateSecretToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000);
  await db.transaction(async (tx) => {
    // Só um convite válido por vez.
    await tx.delete(professionalInvites).where(and(eq(professionalInvites.professionalId, professionalId), isNull(professionalInvites.usedAt)));
    await tx.insert(professionalInvites).values({ companyId: actor.companyId, professionalId, tokenHash: hashToken(token), expiresAt });
  });
  return { token, expiresAt };
}

export async function getInvite(db: DbOrTx, token: string) {
  if (!looksLikeToken(token)) return null;
  const [row] = await db
    .select({ invite: professionalInvites, professionalName: professionals.name })
    .from(professionalInvites)
    .innerJoin(professionals, eq(professionals.id, professionalInvites.professionalId))
    .where(eq(professionalInvites.tokenHash, hashToken(token)));
  if (!row || row.invite.usedAt || row.invite.expiresAt < new Date()) return null;
  return row;
}

export async function acceptInvite(db: DbOrTx, userId: string, token: string) {
  return db.transaction(async (tx) => {
    const row = await getInvite(tx, token);
    if (!row) throw new AppError("invalid_invite", "Convite inválido ou expirado. Peça um novo link ao proprietário.");
    const [existing] = await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userId));
    if (existing) throw new AppError("already_member", "Sua conta já está vinculada a uma empresa.");
    const used = await tx
      .update(professionalInvites)
      .set({ usedAt: new Date() })
      .where(and(eq(professionalInvites.id, row.invite.id), isNull(professionalInvites.usedAt)))
      .returning({ id: professionalInvites.id });
    if (!used.length) throw new AppError("invalid_invite", "Convite já utilizado.");
    await tx.insert(memberships).values({
      companyId: row.invite.companyId,
      userId,
      role: "professional",
      professionalId: row.invite.professionalId,
    });
    await audit(tx, {
      companyId: row.invite.companyId,
      actorUserId: userId,
      actorType: "user",
      action: "professional.access_granted",
      entityType: "professional",
      entityId: row.invite.professionalId,
    });
  });
}

/** Remove o acesso de login do profissional (o cadastro e o histórico permanecem). */
export async function revokeAccess(db: DbOrTx, actor: Actor, professionalId: string) {
  assertCan(actor, "staff.manage");
  await getProfessional(db, actor, professionalId);
  await db
    .delete(memberships)
    .where(and(eq(memberships.professionalId, professionalId), eq(memberships.companyId, actor.companyId), ne(memberships.role, "owner")));
}

export function assertValidProfessionalIds(ids: string[]) {
  if (ids.some((id) => !uuidSchema.safeParse(id).success)) throw new ValidationError({ professionalId: "Profissional inválido." });
}

/** Jornadas e pausas de vários profissionais (leitura interna; chamador já filtrou por permissão). */
export async function loadSchedules(db: DbOrTx, companyId: string, professionalIds: string[]) {
  if (!professionalIds.length) return [];
  const cols = (t: typeof workingHours | typeof recurringBreaks) => ({
    professionalId: t.professionalId,
    weekday: t.weekday,
    startMinute: t.startMinute,
    endMinute: t.endMinute,
  });
  const [hours, breaks] = await Promise.all([
    db.select(cols(workingHours)).from(workingHours).where(and(eq(workingHours.companyId, companyId), inArray(workingHours.professionalId, professionalIds))),
    db.select(cols(recurringBreaks)).from(recurringBreaks).where(and(eq(recurringBreaks.companyId, companyId), inArray(recurringBreaks.professionalId, professionalIds))),
  ]);
  return professionalIds.map((id) => ({
    id,
    hours: hours.filter((h) => h.professionalId === id) as (WeeklyRange & { professionalId: string })[],
    breaks: breaks.filter((b) => b.professionalId === id) as (WeeklyRange & { professionalId: string })[],
  }));
}
