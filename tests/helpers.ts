import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { memberships, user } from "@/db/schema";
import type { Actor } from "@/server/permissions";
import { createCompanyForUser, setCompanyHours, updateBookingPolicy } from "@/server/services/companies";
import { createService } from "@/server/services/catalog";
import { createProfessional, setSchedule } from "@/server/services/staff";
import { localToInstant } from "@/domain/time";

export const db = () => getDb();
export const TZ = "America/Sao_Paulo";

/** "Agora" fixo nos testes: segunda-feira, 04/03/2030 08:00 em São Paulo. */
export const NOW = localToInstant("2030-03-04", 8 * 60, TZ);
export const DAY = "2030-03-05"; // terça-feira
export const at = (hhmm: string, date = DAY) => {
  const [h, m] = hhmm.split(":").map(Number);
  return localToInstant(date, h * 60 + m, TZ);
};

export async function resetDb() {
  const tables = await db().execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const names = tables.rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await db().execute(sql.raw(`truncate ${names} restart identity cascade`));
}

export async function createUser(name = "Usuário") {
  const id = randomUUID();
  await db().insert(user).values({ id, name, email: `${id}@teste.local` });
  return id;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** Empresa com 1 profissional e 2 serviços, aberta 09–18 todos os dias, almoço 12–13. */
export async function setupCompany(name = "Barbearia Teste") {
  const userId = await createUser("Dono");
  const company = await createCompanyForUser(db(), userId, { name, segment: "barbershop" });
  const owner: Actor = { userId, companyId: company.id, role: "owner", professionalId: null };
  await setCompanyHours(
    db(),
    owner,
    ALL_DAYS.map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 18 * 60 })),
  );
  await updateBookingPolicy(db(), owner, {
    timezone: TZ,
    minAdvanceMinutes: 60,
    maxDaysAhead: 30,
    slotStepMinutes: 30,
    allowClientCancel: true,
    allowClientReschedule: true,
    clientChangeMinAdvanceMinutes: 120,
  });
  const pro = await addProfessional(owner, "Carlos");
  const corte = await createService(db(), owner, {
    name: "Corte",
    priceCents: 4000,
    durationMinutes: 30,
    bufferAfterMinutes: 0,
    professionalIds: [pro.id],
  });
  const combo = await createService(db(), owner, {
    name: "Corte + barba",
    priceCents: 7000,
    durationMinutes: 60,
    bufferAfterMinutes: 0,
    professionalIds: [pro.id],
  });
  return { company, owner, pro, corte, combo };
}

export async function addProfessional(owner: Actor, name: string) {
  const pro = await createProfessional(db(), owner, { name });
  await setSchedule(db(), owner, pro.id, {
    hours: ALL_DAYS.map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 18 * 60 })),
    breaks: ALL_DAYS.map((weekday) => ({ weekday, startMinute: 12 * 60, endMinute: 13 * 60 })),
  });
  return pro;
}

/** Cria um usuário com papel de profissional vinculado ao cadastro informado. */
export async function professionalActor(companyId: string, professionalId: string): Promise<Actor> {
  const userId = await createUser("Profissional");
  await db().insert(memberships).values({ companyId, userId, role: "professional", professionalId });
  return { userId, companyId, role: "professional", professionalId };
}

export const customer = (name = "João Cliente", phone = "(11) 98765-4321") => ({ name, phone, email: null });
