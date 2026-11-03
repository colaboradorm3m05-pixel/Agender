import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db";
import { companies, companyHours, memberships, professionalServices, professionals, services } from "@/db/schema";
import { DEFAULT_TIMEZONE } from "@/config/app";
import { isValidSlug, slugify } from "@/domain/slug";
import type { WeeklyRange } from "@/domain/availability";
import { AppError, NotFoundError, ValidationError } from "../errors";
import { assertCan, type Actor } from "../permissions";
import { audit } from "../audit";
import { hexColorSchema, optionalText, parseInput, requiredText, segmentSchema, timeZoneSchema, weeklyRangesSchema } from "../validation";

export type Company = typeof companies.$inferSelect;

/** Horário padrão sugerido: segunda a sábado, 09:00–19:00. */
export const DEFAULT_COMPANY_HOURS: WeeklyRange[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 19 * 60,
}));

const createCompanySchema = z.object({
  name: requiredText(80, "O nome da empresa"),
  segment: segmentSchema,
});

async function uniqueSlug(db: DbOrTx, base: string): Promise<string> {
  let root = slugify(base);
  if (root.length < 3) root = `${root}-agenda`.replace(/^-/, "");
  if (!isValidSlug(root)) root = `${root}-1`;
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const [taken] = await db.select({ id: companies.id }).from(companies).where(eq(companies.slug, candidate));
    if (!taken) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** Etapa 1 do onboarding: cria a empresa e torna o usuário proprietário. */
export async function createCompanyForUser(
  db: DbOrTx,
  userId: string,
  input: unknown,
  opts: { isDemo?: boolean } = {},
): Promise<Company> {
  const data = parseInput(createCompanySchema, input);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userId));
    if (existing) throw new AppError("already_member", "Sua conta já está vinculada a uma empresa.");
    const slug = await uniqueSlug(tx, data.name);
    const [company] = await tx
      .insert(companies)
      .values({ name: data.name, segment: data.segment, slug, timezone: DEFAULT_TIMEZONE, isDemo: opts.isDemo ?? false })
      .returning();
    await tx.insert(memberships).values({ companyId: company.id, userId, role: "owner" });
    await tx.insert(companyHours).values(DEFAULT_COMPANY_HOURS.map((h) => ({ ...h, companyId: company.id })));
    await audit(tx, {
      companyId: company.id,
      actorUserId: userId,
      actorType: "user",
      action: "company.created",
      entityType: "company",
      entityId: company.id,
    });
    return company;
  });
}

export async function getCompany(db: DbOrTx, actor: Actor): Promise<Company> {
  const [company] = await db.select().from(companies).where(eq(companies.id, actor.companyId));
  if (!company) throw new NotFoundError("Empresa");
  return company;
}

const profileSchema = z.object({
  name: requiredText(80, "O nome da empresa"),
  segment: segmentSchema,
  slug: z.string().trim().toLowerCase(),
  phone: optionalText(30),
  addressLine: optionalText(160),
  city: optionalText(80),
  serviceInfo: optionalText(500),
  brandColor: hexColorSchema,
});

export async function updateCompanyProfile(db: DbOrTx, actor: Actor, input: unknown): Promise<Company> {
  assertCan(actor, "company.manage");
  const data = parseInput(profileSchema, input);
  if (!isValidSlug(data.slug)) {
    throw new ValidationError({ slug: "Use de 3 a 48 letras minúsculas, números e hífens (ex.: barbearia-do-joao)." });
  }
  const [taken] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.slug, data.slug), sql`${companies.id} <> ${actor.companyId}`));
  if (taken) throw new ValidationError({ slug: "Este endereço já está em uso por outra empresa." });
  const [company] = await db.update(companies).set(data).where(eq(companies.id, actor.companyId)).returning();
  return company;
}

const policySchema = z.object({
  timezone: timeZoneSchema,
  minAdvanceMinutes: z.number().int().min(0, "Valor inválido.").max(60 * 24 * 14, "Máximo de 14 dias."),
  maxDaysAhead: z.number().int().min(1, "Mínimo de 1 dia.").max(365, "Máximo de 365 dias."),
  slotStepMinutes: z.number().int().min(5).max(120),
  allowClientCancel: z.boolean(),
  allowClientReschedule: z.boolean(),
  clientChangeMinAdvanceMinutes: z.number().int().min(0).max(60 * 24 * 14),
});

export async function updateBookingPolicy(db: DbOrTx, actor: Actor, input: unknown): Promise<Company> {
  assertCan(actor, "company.manage");
  const data = parseInput(policySchema, input);
  const [company] = await db.update(companies).set(data).where(eq(companies.id, actor.companyId)).returning();
  return company;
}

export async function getCompanyHours(db: DbOrTx, companyId: string): Promise<WeeklyRange[]> {
  return db
    .select({ weekday: companyHours.weekday, startMinute: companyHours.startMinute, endMinute: companyHours.endMinute })
    .from(companyHours)
    .where(eq(companyHours.companyId, companyId))
    .orderBy(asc(companyHours.weekday), asc(companyHours.startMinute));
}

export async function setCompanyHours(db: DbOrTx, actor: Actor, input: unknown): Promise<void> {
  assertCan(actor, "company.manage");
  const ranges = parseInput(weeklyRangesSchema, input);
  await db.transaction(async (tx) => {
    await tx.delete(companyHours).where(eq(companyHours.companyId, actor.companyId));
    if (ranges.length) await tx.insert(companyHours).values(ranges.map((r) => ({ ...r, companyId: actor.companyId })));
  });
}

export type OnboardingStatus = {
  company: boolean;
  location: boolean;
  hours: boolean;
  professional: boolean;
  service: boolean;
  link: boolean;
  completed: boolean;
};

export async function getOnboardingStatus(db: DbOrTx, actor: Actor): Promise<OnboardingStatus> {
  const company = await getCompany(db, actor);
  const [counts] = await db
    .select({
      hours: sql<number>`(select count(*) from ${companyHours} where ${companyHours.companyId} = ${company.id})::int`,
      pros: sql<number>`(select count(*) from ${professionals} where ${professionals.companyId} = ${company.id} and ${professionals.active})::int`,
      svcs: sql<number>`(select count(*) from ${services} where ${services.companyId} = ${company.id} and ${services.active})::int`,
      links: sql<number>`(select count(*) from ${professionalServices} where ${professionalServices.companyId} = ${company.id})::int`,
    })
    .from(sql`(select 1) as one`);
  const status = {
    company: true,
    location: Boolean(company.addressLine || company.serviceInfo),
    hours: counts.hours > 0,
    professional: counts.pros > 0,
    service: counts.svcs > 0,
    link: counts.links > 0,
  };
  return { ...status, completed: Boolean(company.onboardingCompletedAt) };
}

export async function completeOnboarding(db: DbOrTx, actor: Actor): Promise<void> {
  assertCan(actor, "company.manage");
  const status = await getOnboardingStatus(db, actor);
  if (!status.hours || !status.professional || !status.service || !status.link) {
    throw new AppError("onboarding_incomplete", "Conclua as etapas anteriores antes de finalizar.");
  }
  await db
    .update(companies)
    .set({ onboardingCompletedAt: new Date() })
    .where(and(eq(companies.id, actor.companyId), sql`${companies.onboardingCompletedAt} is null`));
}

/** Dados expostos na página pública: somente o necessário para agendar. */
export type PublicCompany = Pick<
  Company,
  | "id"
  | "name"
  | "slug"
  | "segment"
  | "timezone"
  | "phone"
  | "addressLine"
  | "city"
  | "serviceInfo"
  | "brandColor"
  | "minAdvanceMinutes"
  | "maxDaysAhead"
  | "slotStepMinutes"
  | "allowClientCancel"
  | "allowClientReschedule"
  | "clientChangeMinAdvanceMinutes"
  | "isDemo"
>;

export async function getPublicCompanyBySlug(db: DbOrTx, slug: string): Promise<PublicCompany | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const [company] = await db
    .select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
      segment: companies.segment,
      timezone: companies.timezone,
      phone: companies.phone,
      addressLine: companies.addressLine,
      city: companies.city,
      serviceInfo: companies.serviceInfo,
      brandColor: companies.brandColor,
      minAdvanceMinutes: companies.minAdvanceMinutes,
      maxDaysAhead: companies.maxDaysAhead,
      slotStepMinutes: companies.slotStepMinutes,
      allowClientCancel: companies.allowClientCancel,
      allowClientReschedule: companies.allowClientReschedule,
      clientChangeMinAdvanceMinutes: companies.clientChangeMinAdvanceMinutes,
      isDemo: companies.isDemo,
    })
    .from(companies)
    .where(eq(companies.slug, slug));
  return company ?? null;
}
