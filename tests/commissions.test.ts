import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb } from "@/db";
import { appointments, commissionRules } from "@/db/schema";
import { computeCommission, parsePercentToBasisPoints, pickRule, type CommissionRuleLike } from "@/domain/commission";
import { AppError } from "@/server/errors";
import { updateService } from "@/server/services/catalog";
import { createCommissionRule, endCommissionRule, listCommissionRules } from "@/server/services/commissions";
import { recordPayment } from "@/server/services/payments";
import { performanceReport } from "@/server/services/reports";
import { createManualAppointment, updateAppointmentStatus } from "@/server/services/scheduling";
import { addProfessional, at, customer, DAY, db, professionalActor, resetDb, setupCompany } from "./helpers";

beforeEach(resetDb);
afterAll(closeDb);

const LATER = at("23:00");

async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

const rule = (over: Partial<CommissionRuleLike>): CommissionRuleLike => ({
  id: Math.random().toString(),
  professionalId: null,
  serviceId: null,
  type: "percent",
  percentBasisPoints: 4000,
  fixedCents: null,
  validFrom: "2030-01-01",
  validTo: null,
  ...over,
});

describe("regras de comissão (puras)", () => {
  it("a regra mais específica vence", () => {
    const geral = rule({ id: "geral" });
    const doServico = rule({ id: "servico", serviceId: "s1" });
    const doPro = rule({ id: "pro", professionalId: "p1" });
    const exata = rule({ id: "exata", professionalId: "p1", serviceId: "s1" });
    const all = [geral, doServico, doPro, exata];
    expect(pickRule(all, { professionalId: "p1", serviceId: "s1", date: "2030-03-05" })!.id).toBe("exata");
    expect(pickRule(all, { professionalId: "p1", serviceId: "s2", date: "2030-03-05" })!.id).toBe("pro");
    expect(pickRule(all, { professionalId: "p2", serviceId: "s1", date: "2030-03-05" })!.id).toBe("servico");
    expect(pickRule(all, { professionalId: "p2", serviceId: "s2", date: "2030-03-05" })!.id).toBe("geral");
  });

  it("respeita a vigência", () => {
    const antiga = rule({ id: "a", validFrom: "2030-01-01", validTo: "2030-02-28" });
    const nova = rule({ id: "b", validFrom: "2030-03-01" });
    expect(pickRule([antiga, nova], { professionalId: "p", serviceId: "s", date: "2030-02-28" })!.id).toBe("a");
    expect(pickRule([antiga, nova], { professionalId: "p", serviceId: "s", date: "2030-03-01" })!.id).toBe("b");
    expect(pickRule([antiga], { professionalId: "p", serviceId: "s", date: "2029-12-31" })).toBeNull();
  });

  it("calcula percentual em centavos inteiros e valor fixo", () => {
    expect(computeCommission(rule({ percentBasisPoints: 4000 }), 4500)).toMatchObject({ cents: 1800 });
    expect(computeCommission(rule({ percentBasisPoints: 3750 }), 4999).cents).toBe(1875); // 1874,625 → 1875
    expect(computeCommission(rule({ type: "fixed", percentBasisPoints: null, fixedCents: 1500 }), 9900).cents).toBe(1500);
    expect(parsePercentToBasisPoints("37,5")).toBe(3750);
    expect(parsePercentToBasisPoints("40%")).toBe(4000);
    expect(parsePercentToBasisPoints("101")).toBeNull();
  });
});

describe("comissões no banco", () => {
  it("grava a fotografia ao concluir e não muda quando a regra ou o serviço mudam", async () => {
    const { owner, pro, corte } = await setupCompany();
    await createCommissionRule(db(), owner, { professionalId: null, serviceId: null, type: "percent", percentBasisPoints: 4000, fixedCents: null, validFrom: "2030-01-01" });
    const a = await createManualAppointment(db(), owner, { professionalId: pro.id, serviceId: corte.id, startsAt: at("10:00"), newCustomer: customer() });
    await updateAppointmentStatus(db(), owner, a.id, "completed", LATER);
    let [row] = await db().select().from(appointments).where(eq(appointments.id, a.id));
    expect(row).toMatchObject({ commissionCents: 1600, commissionDescription: expect.stringContaining("40%") });

    // Nova regra a partir de amanhã e serviço mais caro: o concluído não muda.
    await createCommissionRule(db(), owner, { professionalId: null, serviceId: null, type: "percent", percentBasisPoints: 5000, fixedCents: null, validFrom: "2030-03-06" });
    await updateService(db(), owner, corte.id, { name: "Corte", priceCents: 9000, durationMinutes: 30 });
    [row] = await db().select().from(appointments).where(eq(appointments.id, a.id));
    expect(row.commissionCents).toBe(1600);

    // A regra antiga foi encerrada na véspera, sem ser apagada.
    const rules = await listCommissionRules(db(), owner);
    expect(rules.map((r) => [r.rule.validFrom, r.rule.validTo])).toEqual(
      expect.arrayContaining([
        ["2030-01-01", "2030-03-05"],
        ["2030-03-06", null],
      ]),
    );
  });

  it("desfazer a conclusão remove a comissão; sem regra registra zero", async () => {
    const { owner, pro, corte } = await setupCompany();
    const a = await createManualAppointment(db(), owner, { professionalId: pro.id, serviceId: corte.id, startsAt: at("10:00"), newCustomer: customer() });
    await updateAppointmentStatus(db(), owner, a.id, "completed", LATER);
    let [row] = await db().select().from(appointments).where(eq(appointments.id, a.id));
    expect(row).toMatchObject({ commissionCents: 0, commissionDescription: "Sem regra de comissão vigente" });
    await updateAppointmentStatus(db(), owner, a.id, "confirmed", LATER);
    [row] = await db().select().from(appointments).where(eq(appointments.id, a.id));
    expect(row.commissionCents).toBeNull();
  });

  it("não permite vigências sobrepostas no mesmo escopo", async () => {
    const { owner, pro } = await setupCompany();
    const base = { professionalId: pro.id, serviceId: null, type: "fixed", percentBasisPoints: null, fixedCents: 1000 };
    await createCommissionRule(db(), owner, { ...base, validFrom: "2030-03-01" });
    await expectAppError(createCommissionRule(db(), owner, { ...base, validFrom: "2030-03-01" }), "validation");
    await expectAppError(createCommissionRule(db(), owner, { ...base, validFrom: "2030-02-01" }), "validation");
    // Escopos diferentes convivem
    await createCommissionRule(db(), owner, { ...base, professionalId: null, validFrom: "2030-03-01" });
    // A constraint do banco também barra sobreposição direta
    await expect(
      db().insert(commissionRules).values({ companyId: owner.companyId, professionalId: pro.id, type: "fixed", fixedCents: 1, validFrom: "2030-04-01" }),
    ).rejects.toBeTruthy();
    const [r] = (await listCommissionRules(db(), owner)).filter((x) => x.rule.professionalId === pro.id);
    await endCommissionRule(db(), owner, r.rule.id, "2030-03-31");
    await expectAppError(endCommissionRule(db(), owner, r.rule.id, "2030-02-01"), "validation");
  });

  it("relatório por período e profissional, com visão restrita do profissional", async () => {
    const { company, owner, pro, corte, combo } = await setupCompany();
    const pro2 = await addProfessional(owner, "Bruno");
    await updateService(db(), owner, corte.id, { name: "Corte", priceCents: 4000, durationMinutes: 30, professionalIds: [pro.id, pro2.id] });
    await createCommissionRule(db(), owner, { professionalId: null, serviceId: null, type: "percent", percentBasisPoints: 4000, fixedCents: null, validFrom: "2030-01-01" });
    await createCommissionRule(db(), owner, { professionalId: pro2.id, serviceId: null, type: "fixed", percentBasisPoints: null, fixedCents: 1000, validFrom: "2030-01-01" });

    const mk = (proId: string, svc: string, hhmm: string, name: string, phone: string) =>
      createManualAppointment(db(), owner, { professionalId: proId, serviceId: svc, startsAt: at(hhmm), newCustomer: customer(name, phone) });
    const a = await mk(pro.id, combo.id, "09:00", "A", "11911110000");
    const b = await mk(pro.id, corte.id, "14:00", "B", "11911110001");
    const c = await mk(pro2.id, corte.id, "09:00", "C", "11911110002");
    await mk(pro2.id, corte.id, "10:00", "D", "11911110003"); // fica confirmado
    for (const x of [a, c]) await updateAppointmentStatus(db(), owner, x.id, "completed", LATER);
    await updateAppointmentStatus(db(), owner, b.id, "no_show", LATER);
    await recordPayment(db(), owner, { appointmentId: a.id, amountCents: 7000, paidAt: at("10:00"), method: "pix" });

    const full = await performanceReport(db(), owner, at("00:00"), at("00:00", "2030-03-06"));
    const carlos = full.rows.find((r) => r.professionalName === "Carlos")!;
    const bruno = full.rows.find((r) => r.professionalName === "Bruno")!;
    expect(carlos).toMatchObject({ completedCount: 1, noShowCount: 1, completedCents: 7000, commissionCents: 2800, receivedCents: 7000 });
    expect(bruno).toMatchObject({ completedCount: 1, completedCents: 4000, commissionCents: 1000, receivedCents: 0 });
    expect(full.totals).toMatchObject({ completedCents: 11000, commissionCents: 3800, receivedCents: 7000 });
    expect(full.completed).toHaveLength(2);

    const filtered = await performanceReport(db(), owner, at("00:00"), at("00:00", "2030-03-06"), pro2.id);
    expect(filtered.rows.map((r) => r.professionalName)).toEqual(["Bruno"]);

    // Fora do período não entra
    const otherDay = await performanceReport(db(), owner, at("00:00", "2030-03-06"), at("00:00", "2030-03-07"));
    expect(otherDay.rows).toHaveLength(0);

    // Profissional: só os próprios números, sem valores recebidos, mesmo pedindo outro profissional
    const brunoActor = await professionalActor(company.id, pro2.id);
    const own = await performanceReport(db(), brunoActor, at("00:00"), at("00:00", "2030-03-06"), pro.id);
    expect(own.rows.map((r) => r.professionalName)).toEqual(["Bruno"]);
    expect(own.rows[0].receivedCents).toBeNull();
    expect(own.completed.every((l) => l.professionalName === "Bruno" && l.paidCents === null)).toBe(true);
    await expectAppError(listCommissionRules(db(), brunoActor), "forbidden");
    await expectAppError(
      createCommissionRule(db(), brunoActor, { professionalId: pro2.id, serviceId: null, type: "fixed", percentBasisPoints: null, fixedCents: 99999, validFrom: "2030-06-01" }),
      "forbidden",
    );
    expect(DAY).toBe("2030-03-05");
  });

  it("isolamento: regras e relatórios de outra empresa não vazam", async () => {
    const a = await setupCompany("A");
    const b = await setupCompany("B");
    await createCommissionRule(db(), b.owner, { professionalId: null, serviceId: null, type: "percent", percentBasisPoints: 1000, fixedCents: null, validFrom: "2030-01-01" });
    expect(await listCommissionRules(db(), a.owner)).toHaveLength(0);
    await expectAppError(
      createCommissionRule(db(), a.owner, { professionalId: b.pro.id, serviceId: null, type: "percent", percentBasisPoints: 1000, fixedCents: null, validFrom: "2030-01-01" }),
      "not_found",
    );
    const [ruleB] = await listCommissionRules(db(), b.owner);
    await expectAppError(endCommissionRule(db(), a.owner, ruleB.rule.id, "2030-12-31"), "not_found");
    const appt = await createManualAppointment(db(), b.owner, { professionalId: b.pro.id, serviceId: b.corte.id, startsAt: at("10:00"), newCustomer: customer() });
    await updateAppointmentStatus(db(), b.owner, appt.id, "completed", LATER);
    expect((await performanceReport(db(), a.owner, at("00:00"), at("23:59"))).rows).toHaveLength(0);
  });
});
