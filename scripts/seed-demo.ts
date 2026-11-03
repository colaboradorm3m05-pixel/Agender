/**
 * Dados DEMONSTRATIVOS para desenvolvimento. Cria (ou recria) a empresa
 * "Barbearia Demonstração", marcada com is_demo = true, e o usuário
 * demo@agender.local com a senha de DEMO_PASSWORD.
 *
 * Nunca rode em produção. Uso: npm run db:seed:demo
 */
import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "../src/db";
import { appointments, companies, memberships, user } from "../src/db/schema";
import { auth } from "../src/lib/auth";
import type { Actor } from "../src/server/permissions";
import { completeOnboarding, createCompanyForUser, setCompanyHours, updateCompanyProfile } from "../src/server/services/companies";
import { createService } from "../src/server/services/catalog";
import { createProfessional, setSchedule } from "../src/server/services/staff";
import { createManualAppointment, updateAppointmentStatus } from "../src/server/services/scheduling";
import { recordPayment } from "../src/server/services/payments";
import { createCommissionRule } from "../src/server/services/commissions";
import { addDays, localToInstant, todayIn, weekdayOf } from "../src/domain/time";

const EMAIL = "demo@agender.local";
const SLUG = "barbearia-demonstracao";
const TZ = "America/Sao_Paulo";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Seed de demonstração não pode rodar em produção.");
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 8) throw new Error("Defina DEMO_PASSWORD (mín. 8 caracteres) no .env.");
  const db = getDb();

  // Remove a demo anterior (somente empresas marcadas como demonstração).
  const old = await db.select({ id: companies.id }).from(companies).where(eq(companies.isDemo, true));
  if (old.length) {
    const ids = old.map((c) => c.id);
    await db.delete(appointments).where(inArray(appointments.companyId, ids));
    await db.delete(companies).where(inArray(companies.id, ids));
  }
  await db.delete(user).where(eq(user.email, EMAIL));

  const res = await auth.api.signUpEmail({ body: { email: EMAIL, password, name: "Dono Demonstração" } });
  const userId = res.user.id;

  const company = await createCompanyForUser(db, userId, { name: "Barbearia Demonstração", segment: "barbershop" }, { isDemo: true });
  const owner: Actor = { userId, companyId: company.id, role: "owner", professionalId: null };
  await updateCompanyProfile(db, owner, {
    name: "Barbearia Demonstração",
    segment: "barbershop",
    slug: SLUG,
    phone: "(11) 4000-0000",
    addressLine: "Rua Exemplo, 123 — Centro (endereço fictício)",
    city: "São Paulo",
    serviceInfo: "Dados demonstrativos. Nenhum atendimento real acontece aqui.",
    brandColor: "#1f2937",
  });
  const week = [1, 2, 3, 4, 5, 6];
  await setCompanyHours(db, owner, week.map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 20 * 60 })));

  const carlos = await createProfessional(db, owner, { name: "Carlos (demo)" });
  const bruno = await createProfessional(db, owner, { name: "Bruno (demo)" });
  await setSchedule(db, owner, carlos.id, {
    hours: week.map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 18 * 60 })),
    breaks: week.map((weekday) => ({ weekday, startMinute: 12 * 60, endMinute: 13 * 60 })),
  });
  await setSchedule(db, owner, bruno.id, {
    hours: [2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 11 * 60, endMinute: 20 * 60 })),
    breaks: [2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 15 * 60, endMinute: 15 * 60 + 30 })),
  });

  const corte = await createService(db, owner, {
    name: "Corte",
    priceCents: 4500,
    durationMinutes: 30,
    bufferAfterMinutes: 0,
    professionalIds: [carlos.id, bruno.id],
  });
  const barba = await createService(db, owner, {
    name: "Barba",
    priceCents: 3500,
    durationMinutes: 30,
    bufferAfterMinutes: 0,
    professionalIds: [carlos.id, bruno.id],
  });
  const combo = await createService(db, owner, {
    name: "Corte + barba",
    description: "Pacote completo com toalha quente.",
    priceCents: 7000,
    durationMinutes: 60,
    bufferAfterMinutes: 10,
    professionalIds: [carlos.id],
  });
  await completeOnboarding(db, owner);
  // Comissões demonstrativas: 40% geral; Bruno recebe R$ 15,00 fixos por atendimento.
  const startOfYear = `${todayIn(TZ).slice(0, 4)}-01-01`;
  await createCommissionRule(db, owner, { professionalId: null, serviceId: null, type: "percent", percentBasisPoints: 4000, fixedCents: null, validFrom: startOfYear });
  await createCommissionRule(db, owner, { professionalId: bruno.id, serviceId: null, type: "fixed", percentBasisPoints: null, fixedCents: 1500, validFrom: startOfYear });

  // Alguns atendimentos fictícios: passados (concluídos/falta/pagos) e futuros.
  const today = todayIn(TZ);
  const names = ["Cliente Demo A", "Cliente Demo B", "Cliente Demo C", "Cliente Demo D", "Cliente Demo E"];
  let n = 0;
  // Próxima data (para frente ou para trás) em que o profissional atende.
  const workday = (offset: number, weekdays = week) => {
    let d = addDays(today, offset);
    while (!weekdays.includes(weekdayOf(d))) d = addDays(d, offset < 0 ? -1 : 1);
    return d;
  };
  const brunoDays = [2, 3, 4, 5, 6];
  const make = async (dateOffset: number, minute: number, pro: string, svc: string) => {
    const i = n++ % names.length;
    const days = pro === bruno.id ? brunoDays : week;
    return createManualAppointment(db, owner, {
      professionalId: pro,
      serviceId: svc,
      startsAt: localToInstant(workday(dateOffset, days), minute, TZ),
      newCustomer: { name: names[i], phone: `(11) 90000-000${i}`, email: null },
    });
  };
  const past1 = await make(-2, 10 * 60, carlos.id, corte.id);
  const past2 = await make(-2, 14 * 60, carlos.id, combo.id);
  const past3 = await make(-1, 16 * 60, bruno.id, barba.id);
  const after = new Date();
  await updateAppointmentStatus(db, owner, past1.id, "completed", after);
  await updateAppointmentStatus(db, owner, past2.id, "completed", after);
  await updateAppointmentStatus(db, owner, past3.id, "no_show", after);
  await recordPayment(db, owner, { appointmentId: past1.id, amountCents: 4500, paidAt: past1.endsAt, method: "pix" });
  await recordPayment(db, owner, { appointmentId: past2.id, amountCents: 7000, paidAt: past2.endsAt, method: "credit_card" });
  await make(1, 9 * 60 + 30, carlos.id, corte.id);
  await make(1, 11 * 60, bruno.id, corte.id);
  await make(2, 14 * 60, carlos.id, combo.id);

  const [m] = await db.select().from(memberships).where(eq(memberships.userId, userId));
  console.log("Dados demonstrativos criados.");
  console.log(`  Login: ${EMAIL} (senha definida em DEMO_PASSWORD)`);
  console.log(`  Página pública: /b/${SLUG}`);
  console.log(`  Empresa: ${company.id} (is_demo = true, papel ${m.role})`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closeDb);
