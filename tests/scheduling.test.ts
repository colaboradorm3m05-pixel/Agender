/** Testes de integração com PostgreSQL real (regras de agenda, concorrência e permissões). */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb } from "@/db";
import { appointments } from "@/db/schema";
import { AppError } from "@/server/errors";
import type { Actor } from "@/server/permissions";
import { updateService } from "@/server/services/catalog";
import { createCustomer, getCustomerWithHistory, searchCustomers } from "@/server/services/customers";
import { getCompany, getPublicCompanyBySlug } from "@/server/services/companies";
import { createTimeBlock, listProfessionals, setSchedule } from "@/server/services/staff";
import {
  cancelAppointment,
  createManualAppointment,
  getAppointment,
  listAgenda,
  rescheduleAppointment,
  updateAppointmentStatus,
} from "@/server/services/scheduling";
import {
  cancelByToken,
  createPublicBooking,
  getBookingByToken,
  getPublicCatalog,
  getPublicSlots,
  rescheduleByToken,
} from "@/server/services/booking";
import { recordPayment } from "@/server/services/payments";
import { periodSummary } from "@/server/services/reports";
import { hitRateLimit, RATE_LIMITS } from "@/server/rate-limit";
import { addProfessional, at, customer, DAY, db, NOW, professionalActor, resetDb, setupCompany, TZ } from "./helpers";

beforeEach(resetDb);
afterAll(closeDb);

async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

function book(slug: string, serviceId: string, professionalId: string, startsAt: Date, who = customer()) {
  return createPublicBooking(db(), slug, { serviceId, professionalId, startsAt: startsAt.toISOString(), ...who }, NOW);
}

describe("agendamento público", () => {
  it("cria a reserva, o cliente e aparece na agenda interna", async () => {
    const { company, owner, pro, corte } = await setupCompany();
    const res = await book(company.slug, corte.id, pro.id, at("10:00"));
    expect(res.publicCode).toMatch(/^AG-/);
    expect(res.manageToken).toHaveLength(43);

    const agenda = await listAgenda(db(), owner, at("00:00"), at("23:59"));
    expect(agenda).toHaveLength(1);
    expect(agenda[0]).toMatchObject({ serviceName: "Corte", customerName: "João Cliente", status: "confirmed", priceCents: 4000 });
    // Instante armazenado em UTC: 10:00 em São Paulo = 13:00Z
    expect(agenda[0].startsAt.toISOString()).toBe("2030-03-05T13:00:00.000Z");
  });

  it("a página pública não expõe dados de clientes nem de outros agendamentos", async () => {
    const { company, pro, corte } = await setupCompany();
    await book(company.slug, corte.id, pro.id, at("10:00"));
    const catalog = await getPublicCatalog(db(), company.slug);
    const json = JSON.stringify(catalog);
    expect(json).not.toContain("João");
    expect(json).not.toContain("98765");
    expect(Object.keys(catalog!.company)).not.toContain("onboardingCompletedAt");
    const slots = await getPublicSlots(db(), company.slug, { serviceId: corte.id, professionalId: pro.id, date: DAY }, NOW);
    expect(Object.keys(slots[0])).toEqual(["start", "label"]);
    expect(slots.map((s) => s.label)).not.toContain("10:00");
  });

  it("duas reservas simultâneas no mesmo horário: só uma é confirmada", async () => {
    const { company, pro, corte } = await setupCompany();
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => book(company.slug, corte.id, pro.id, at("14:00"), customer(`Cliente ${i}`, `1199999000${i}`))),
    );
    const ok = attempts.filter((a) => a.status === "fulfilled");
    const failed = attempts.filter((a) => a.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(5);
    for (const f of failed) expect((f.reason as AppError).code).toBe("slot_unavailable");
    const rows = await db().select().from(appointments);
    expect(rows).toHaveLength(1);
  });

  it("serviços sobrepostos com durações diferentes também são barrados em paralelo", async () => {
    const { company, pro, corte, combo } = await setupCompany();
    const results = await Promise.allSettled([
      book(company.slug, combo.id, pro.id, at("14:00"), customer("A", "11911110000")),
      book(company.slug, corte.id, pro.id, at("14:30"), customer("B", "11911110001")),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("o banco rejeita sobreposição mesmo sem passar pelas regras da aplicação", async () => {
    const { company, pro, corte } = await setupCompany();
    await book(company.slug, corte.id, pro.id, at("10:00"));
    const [existing] = await db().select().from(appointments);
    const { id: _id, publicCode: _c, manageTokenHash: _h, ...rest } = existing;
    void _id;
    void _c;
    void _h;
    await expect(
      db()
        .insert(appointments)
        .values({ ...rest, publicCode: "AG-TESTE1", startsAt: at("10:15"), endsAt: at("10:45"), occupiedUntil: at("10:45") }),
    ).rejects.toSatisfy((e: unknown) => JSON.stringify(e).includes("23P01") || String((e as Error).cause).includes("appointments_no_overlap"));
  });

  it("revalida no momento da confirmação e oferece outro horário", async () => {
    const { company, pro, corte } = await setupCompany();
    const before = await getPublicSlots(db(), company.slug, { serviceId: corte.id, professionalId: pro.id, date: DAY }, NOW);
    expect(before.map((s) => s.label)).toContain("15:00");
    await book(company.slug, corte.id, pro.id, at("15:00"), customer("Primeiro", "11900000001"));
    await expectAppError(book(company.slug, corte.id, pro.id, at("15:00"), customer("Segundo", "11900000002")), "slot_unavailable");
    const after = await getPublicSlots(db(), company.slug, { serviceId: corte.id, professionalId: pro.id, date: DAY }, NOW);
    expect(after.map((s) => s.label)).not.toContain("15:00");
    expect(after.length).toBe(before.length - 1);
  });

  it("recusa horários fora do expediente, na pausa, fora da grade ou sem antecedência", async () => {
    const { company, pro, corte } = await setupCompany();
    await expectAppError(book(company.slug, corte.id, pro.id, at("08:30")), "slot_outside_hours");
    await expectAppError(book(company.slug, corte.id, pro.id, at("12:00")), "slot_outside_hours");
    await expectAppError(book(company.slug, corte.id, pro.id, at("17:45")), "slot_outside_hours");
    await expectAppError(book(company.slug, corte.id, pro.id, at("10:10")), "slot_outside_hours");
    await expectAppError(book(company.slug, corte.id, pro.id, at("07:30", "2030-03-04")), "slot_in_past");
    // 09:00 com "agora" às 08:30 e antecedência mínima de 60 min
    await expectAppError(
      createPublicBooking(db(), company.slug, { serviceId: corte.id, professionalId: pro.id, startsAt: at("09:00", "2030-03-04"), ...customer() }, at("08:30", "2030-03-04")),
      "slot_too_soon",
    );
    await expectAppError(book(company.slug, corte.id, pro.id, at("10:00", "2030-05-01")), "slot_too_far");
  });

  it("bloqueio por data impede reservas e não aparece como horário", async () => {
    const { company, owner, pro, corte } = await setupCompany();
    await createTimeBlock(db(), owner, { professionalId: pro.id, startsAt: at("15:00"), endsAt: at("16:00"), reason: "Consulta" });
    const slots = await getPublicSlots(db(), company.slug, { serviceId: corte.id, professionalId: pro.id, date: DAY }, NOW);
    expect(slots.map((s) => s.label)).not.toContain("15:00");
    expect(slots.map((s) => s.label)).not.toContain("15:30");
    await expectAppError(book(company.slug, corte.id, pro.id, at("15:30")), "slot_outside_hours");
  });

  it("não permite bloquear período com atendimento confirmado", async () => {
    const { company, owner, pro, corte } = await setupCompany();
    await book(company.slug, corte.id, pro.id, at("15:00"));
    await expectAppError(createTimeBlock(db(), owner, { professionalId: null, startsAt: at("14:00"), endsAt: at("18:00") }), "block_conflict");
  });

  it("'qualquer profissional' escolhe quem está livre", async () => {
    const { company, owner, pro, corte } = await setupCompany();
    const pro2 = await addProfessional(owner, "Bruno");
    await updateService(db(), owner, corte.id, {
      name: "Corte",
      priceCents: 4000,
      durationMinutes: 30,
      bufferAfterMinutes: 0,
      professionalIds: [pro.id, pro2.id],
    });
    const a = await book(company.slug, corte.id, "any", at("10:00"), customer("A", "11911110000"));
    const b = await book(company.slug, corte.id, "any", at("10:00"), customer("B", "11911110001"));
    expect(new Set([a.professionalName, b.professionalName])).toEqual(new Set(["Carlos", "Bruno"]));
    await expectAppError(book(company.slug, corte.id, "any", at("10:00"), customer("C", "11911110002")), "slot_unavailable");
  });
});

describe("link de gestão do cliente", () => {
  it("consulta, reagenda e cancela pelo token; cancelamento libera o horário", async () => {
    const { company, pro, corte } = await setupCompany();
    const res = await book(company.slug, corte.id, pro.id, at("10:00"));
    const view = await getBookingByToken(db(), res.manageToken, NOW);
    expect(view).toMatchObject({ status: "confirmed", serviceName: "Corte", canCancel: true, canReschedule: true });
    expect(JSON.stringify(view)).not.toContain("98765");

    await rescheduleByToken(db(), res.manageToken, at("11:00").toISOString(), NOW);
    expect((await getBookingByToken(db(), res.manageToken, NOW))!.startsAt.toISOString()).toBe(at("11:00").toISOString());

    // outro cliente não consegue 11:00, mas 10:00 ficou livre
    await expectAppError(book(company.slug, corte.id, pro.id, at("11:00"), customer("Outro", "11900000009")), "slot_unavailable");
    await book(company.slug, corte.id, pro.id, at("10:00"), customer("Outro", "11900000009"));

    await cancelByToken(db(), res.manageToken, NOW);
    expect((await getBookingByToken(db(), res.manageToken, NOW))!.status).toBe("cancelled");
    const slots = await getPublicSlots(db(), company.slug, { serviceId: corte.id, professionalId: pro.id, date: DAY }, NOW);
    expect(slots.map((s) => s.label)).toContain("11:00");
  });

  it("token inválido ou adivinhado não dá acesso", async () => {
    const { company, pro, corte } = await setupCompany();
    const res = await book(company.slug, corte.id, pro.id, at("10:00"));
    expect(await getBookingByToken(db(), res.publicCode, NOW)).toBeNull();
    expect(await getBookingByToken(db(), "x".repeat(43), NOW)).toBeNull();
    expect(await getBookingByToken(db(), "5511987654321", NOW)).toBeNull();
  });

  it("respeita a política de antecedência para alterações", async () => {
    const { company, pro, corte } = await setupCompany();
    const res = await book(company.slug, corte.id, pro.id, at("10:00"));
    const late = at("09:00"); // 1h antes; política exige 2h
    const view = await getBookingByToken(db(), res.manageToken, late);
    expect(view!.canCancel).toBe(false);
    expect(view!.policyMessage).toBeTruthy();
    await expectAppError(cancelByToken(db(), res.manageToken, late), "cancel_not_allowed");
  });

  it("limita tentativas abusivas", async () => {
    const rule = { ...RATE_LIMITS.manageLookup, limit: 3 };
    const results = [];
    for (let i = 0; i < 5; i++) results.push((await hitRateLimit(db(), rule, "203.0.113.9")).allowed);
    expect(results).toEqual([true, true, true, false, false]);
    expect((await hitRateLimit(db(), rule, "198.51.100.1")).allowed).toBe(true);
  });
});

describe("agenda interna", () => {
  it("reagendar para horário ocupado é recusado; para livre funciona", async () => {
    const { company, owner, pro, corte } = await setupCompany();
    await book(company.slug, corte.id, pro.id, at("10:00"), customer("A", "11911110000"));
    const b = await createManualAppointment(db(), owner, {
      professionalId: pro.id,
      serviceId: corte.id,
      startsAt: at("11:00"),
      newCustomer: customer("B", "11911110001"),
    });
    await expectAppError(rescheduleAppointment(db(), owner, b.id, { startsAt: at("10:15") }), "slot_unavailable");
    const moved = await rescheduleAppointment(db(), owner, b.id, { startsAt: at("15:00") });
    expect(moved.startsAt.toISOString()).toBe(at("15:00").toISOString());
  });

  it("cancelamento libera o horário para nova reserva", async () => {
    const { company, owner, pro, corte } = await setupCompany();
    const a = await createManualAppointment(db(), owner, {
      professionalId: pro.id,
      serviceId: corte.id,
      startsAt: at("16:00"),
      newCustomer: customer(),
    });
    await expectAppError(book(company.slug, corte.id, pro.id, at("16:00"), customer("X", "11900000005")), "slot_unavailable");
    await cancelAppointment(db(), owner, a.id, "Cliente desistiu");
    await book(company.slug, corte.id, pro.id, at("16:00"), customer("X", "11900000005"));
  });

  it("alterar o serviço não muda agendamentos existentes", async () => {
    const { company, owner, pro, corte } = await setupCompany();
    const res = await book(company.slug, corte.id, pro.id, at("10:00"));
    await updateService(db(), owner, corte.id, { name: "Corte premium", priceCents: 6500, durationMinutes: 45, bufferAfterMinutes: 10 });
    const [appt] = await db().select().from(appointments);
    expect(appt).toMatchObject({ serviceName: "Corte", priceCents: 4000, durationMinutes: 30, bufferAfterMinutes: 0 });
    expect(res.priceCents).toBe(4000);
    // reagendar mantém a fotografia (30 min, preço antigo)
    const moved = await rescheduleAppointment(db(), owner, appt.id, { startsAt: at("14:00") });
    expect(moved.endsAt.getTime() - moved.startsAt.getTime()).toBe(30 * 60000);
    expect(moved.priceCents).toBe(4000);
    // nova reserva usa o preço novo
    const novo = await book(company.slug, corte.id, pro.id, at("15:00"), customer("Novo", "11900000007"));
    expect(novo.priceCents).toBe(6500);
  });

  it("desativar profissional preserva o histórico e o remove do link público", async () => {
    const { company, owner, pro, corte } = await setupCompany();
    await createManualAppointment(db(), owner, { professionalId: pro.id, serviceId: corte.id, startsAt: at("10:00"), newCustomer: customer() });
    const { updateProfessional } = await import("@/server/services/staff");
    await updateProfessional(db(), owner, pro.id, { name: "Carlos", active: false });
    expect((await listAgenda(db(), owner, at("00:00"), at("23:59")))[0].professionalName).toBe("Carlos");
    const catalog = await getPublicCatalog(db(), company.slug);
    expect(catalog!.professionals).toHaveLength(0);
  });

  it("concluir, registrar falta e pagamento manual alimentam o painel separadamente", async () => {
    const { owner, pro, corte, combo } = await setupCompany();
    const a = await createManualAppointment(db(), owner, { professionalId: pro.id, serviceId: corte.id, startsAt: at("09:00"), newCustomer: customer("A", "11911110000") });
    const b = await createManualAppointment(db(), owner, { professionalId: pro.id, serviceId: combo.id, startsAt: at("10:00"), newCustomer: customer("B", "11911110001") });
    const c = await createManualAppointment(db(), owner, { professionalId: pro.id, serviceId: corte.id, startsAt: at("14:00"), newCustomer: customer("C", "11911110002") });
    await createManualAppointment(db(), owner, { professionalId: pro.id, serviceId: corte.id, startsAt: at("15:00"), newCustomer: customer("D", "11911110003") });
    const later = at("17:00");
    await expectAppError(updateAppointmentStatus(db(), owner, a.id, "completed", at("08:00")), "future_appointment");
    await updateAppointmentStatus(db(), owner, a.id, "completed", later);
    await updateAppointmentStatus(db(), owner, b.id, "no_show", later);
    await cancelAppointment(db(), owner, c.id);
    await recordPayment(db(), owner, { appointmentId: a.id, amountCents: 3500, paidAt: at("09:40"), method: "pix" });
    await expectAppError(recordPayment(db(), owner, { appointmentId: c.id, amountCents: 100, paidAt: at("09:40"), method: "cash" }), "cancelled_appointment");

    const s = await periodSummary(db(), owner, at("00:00"), at("23:59"));
    expect(s).toMatchObject({
      appointmentsCount: 4,
      confirmedCount: 1,
      completedCount: 1,
      cancelledCount: 1,
      noShowCount: 1,
      scheduledCents: 4000,
      completedCents: 4000,
      receivedCents: 3500,
    });
  });
});

describe("clientes", () => {
  it("evita duplicar pelo telefone normalizado e trata número compartilhado", async () => {
    const { company, owner, pro, corte } = await setupCompany();
    await book(company.slug, corte.id, pro.id, at("10:00"), customer("Maria Souza", "(11) 97777-0000"));
    await book(company.slug, corte.id, pro.id, at("11:00"), customer("maria souza", "11977770000"));
    await book(company.slug, corte.id, pro.id, at("14:00"), customer("Pedro Souza", "+55 11 97777-0000"));
    const list = await searchCustomers(db(), owner, "souza");
    expect(list.map((c) => c.name).sort()).toEqual(["Maria Souza", "Pedro Souza"]);
    expect(list.find((c) => c.name === "Maria Souza")!.appointmentsCount).toBe(2);
    expect(list.every((c) => c.sharedPhoneCount === 1)).toBe(true);

    const attempt = await createCustomer(db(), owner, { name: "Ana", phone: "11 97777-0000" });
    expect(attempt.status).toBe("phone_in_use");
    const confirmed = await createCustomer(db(), owner, { name: "Ana", phone: "11 97777-0000" }, { confirmSharedPhone: true });
    expect(confirmed.status).toBe("created");

    const byPhone = await searchCustomers(db(), owner, "97777");
    expect(byPhone).toHaveLength(3);
  });

  it("histórico do cliente mostra os atendimentos", async () => {
    const { company, owner, pro, corte } = await setupCompany();
    await book(company.slug, corte.id, pro.id, at("10:00"));
    const [c] = await searchCustomers(db(), owner, "");
    const detail = await getCustomerWithHistory(db(), owner, c.id);
    expect(detail.history).toHaveLength(1);
    expect(detail.history[0].serviceName).toBe("Corte");
  });
});

describe("isolamento entre empresas e permissões", () => {
  it("usuário de uma empresa não acessa dados de outra", async () => {
    const a = await setupCompany("Barbearia A");
    const b = await setupCompany("Barbearia B");
    const apptB = await createManualAppointment(db(), b.owner, {
      professionalId: b.pro.id,
      serviceId: b.corte.id,
      startsAt: at("10:00"),
      newCustomer: customer("Cliente de B", "11955550000"),
    });
    // Mesmo enviando IDs da empresa B, o actor de A é sempre limitado à própria empresa.
    await expectAppError(getAppointment(db(), a.owner, apptB.id), "not_found");
    await expectAppError(cancelAppointment(db(), a.owner, apptB.id), "not_found");
    await expectAppError(rescheduleAppointment(db(), a.owner, apptB.id, { startsAt: at("11:00") }), "not_found");
    await expectAppError(updateService(db(), a.owner, b.corte.id, { name: "x", priceCents: 1, durationMinutes: 30 }), "not_found");
    await expectAppError(
      createManualAppointment(db(), a.owner, { professionalId: b.pro.id, serviceId: b.corte.id, startsAt: at("11:00"), newCustomer: customer() }),
      "not_found",
    );
    await expectAppError(recordPayment(db(), a.owner, { appointmentId: apptB.id, amountCents: 100, paidAt: at("10:00"), method: "pix" }), "not_found");
    const [custB] = await searchCustomers(db(), b.owner, "");
    await expectAppError(getCustomerWithHistory(db(), a.owner, custB.id), "not_found");
    expect(await searchCustomers(db(), a.owner, "Cliente de B")).toHaveLength(0);
    expect(await listAgenda(db(), a.owner, at("00:00"), at("23:59"))).toHaveLength(0);
    // Forjar companyId no Actor não é possível pela aplicação: ele vem do vínculo no banco (ver server/session.ts).
    expect((await getCompany(db(), a.owner)).id).toBe(a.company.id);
  });

  it("profissional só vê e atualiza a própria agenda", async () => {
    const { company, owner, pro, corte } = await setupCompany();
    const pro2 = await addProfessional(owner, "Bruno");
    await updateService(db(), owner, corte.id, { name: "Corte", priceCents: 4000, durationMinutes: 30, professionalIds: [pro.id, pro2.id] });
    const mine = await createManualAppointment(db(), owner, { professionalId: pro.id, serviceId: corte.id, startsAt: at("10:00"), newCustomer: customer("A", "11911110000") });
    const other = await createManualAppointment(db(), owner, { professionalId: pro2.id, serviceId: corte.id, startsAt: at("10:00"), newCustomer: customer("B", "11911110001") });

    const carlos: Actor = await professionalActor(company.id, pro.id);
    const agenda = await listAgenda(db(), carlos, at("00:00"), at("23:59"));
    expect(agenda.map((x) => x.id)).toEqual([mine.id]);
    // Pedir explicitamente a agenda de outro profissional é proibido
    await expectAppError(listAgenda(db(), carlos, at("00:00"), at("23:59"), pro2.id), "forbidden");
    await expectAppError(getAppointment(db(), carlos, other.id), "forbidden");
    await expectAppError(updateAppointmentStatus(db(), carlos, other.id, "completed", at("17:00")), "forbidden");
    await updateAppointmentStatus(db(), carlos, mine.id, "completed", at("17:00"));
    // Sem acesso administrativo nem financeiro
    await expectAppError(cancelAppointment(db(), carlos, mine.id), "forbidden");
    await expectAppError(updateService(db(), carlos, corte.id, { name: "x", priceCents: 1, durationMinutes: 30 }), "forbidden");
    await expectAppError(setSchedule(db(), carlos, pro.id, { hours: [], breaks: [] }), "forbidden");
    await expectAppError(recordPayment(db(), carlos, { appointmentId: mine.id, amountCents: 100, paidAt: at("10:00"), method: "pix" }), "forbidden");
    await expectAppError(searchCustomers(db(), carlos, ""), "forbidden");
    const summary = await periodSummary(db(), carlos, at("00:00"), at("23:59"));
    expect(summary.appointmentsCount).toBe(1);
    expect(summary.receivedCents).toBeNull();
    expect((await listProfessionals(db(), carlos)).map((p) => p.id)).toEqual([pro.id]);
  });

  it("slug público resolve somente a empresa certa", async () => {
    const a = await setupCompany("Barbearia A");
    expect((await getPublicCompanyBySlug(db(), a.company.slug))!.id).toBe(a.company.id);
    expect(await getPublicCompanyBySlug(db(), "nao-existe")).toBeNull();
    expect(await getPublicCompanyBySlug(db(), "'; drop table companies; --")).toBeNull();
    expect(TZ).toBe("America/Sao_Paulo");
    expect(eq).toBeDefined();
  });
});
