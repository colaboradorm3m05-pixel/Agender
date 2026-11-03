"use server";

/**
 * Server actions do painel. Cada uma obtém o Actor da sessão (withActor) e
 * delega a autorização e a validação aos serviços em src/server/services.
 */
import { revalidatePath } from "next/cache";
import { type ActionResult } from "@/server/action-result";
import { scopeErrors, withActor } from "@/server/action-helpers";
import { AppError, ValidationError } from "@/server/errors";
import { bool, ids, int, json, localDateTime, money, optStr, str } from "@/server/form-data";
import { getCompany } from "@/server/services/companies";
import { createService, setProfessionalServices, setServiceActive, updateService } from "@/server/services/catalog";
import { createCustomer, searchCustomers, updateCustomer } from "@/server/services/customers";
import { deletePayment, recordPayment } from "@/server/services/payments";
import {
  cancelAppointment,
  createManualAppointment,
  rescheduleAppointment,
  staffSlots,
  updateAppointmentStatus,
} from "@/server/services/scheduling";
import {
  createInvite,
  createProfessional,
  createTimeBlock,
  deleteTimeBlock,
  revokeAccess,
  setSchedule,
  updateProfessional,
} from "@/server/services/staff";
import { formatTime } from "@/domain/format";
import { parsePercentToBasisPoints } from "@/domain/commission";
import { createCommissionRule, endCommissionRule } from "@/server/services/commissions";
import { addDays, isValidLocalDate, localToInstant } from "@/domain/time";
import { appUrl, invitePath } from "@/lib/urls";

type R<T = void> = ActionResult<T>;

const refreshAgenda = () => {
  revalidatePath("/painel", "layout");
};

// ---------- Serviços ----------

function serviceInput(fd: FormData) {
  return {
    name: str(fd, "name"),
    description: optStr(fd, "description"),
    priceCents: money(fd, "priceCents"),
    durationMinutes: int(fd, "durationMinutes"),
    bufferAfterMinutes: int(fd, "bufferAfterMinutes") ?? 0,
    active: fd.has("active") ? bool(fd, "active") : true,
    professionalIds: ids(fd, "professionalIds"),
  };
}

export async function createServiceAction(_: R | null, fd: FormData): Promise<R> {
  return withActor(async (actor, db) => {
    await createService(db, actor, serviceInput(fd));
    revalidatePath("/painel/servicos");
  }, "Serviço criado.");
}

export async function updateServiceAction(_: R | null, fd: FormData): Promise<R> {
  return withActor(async (actor, db) => {
    await updateService(db, actor, str(fd, "id"), serviceInput(fd));
    revalidatePath("/painel/servicos");
  }, "Serviço atualizado. Agendamentos já feitos mantêm preço e duração originais.");
}

export async function toggleServiceAction(serviceId: string, active: boolean): Promise<R> {
  return withActor(async (actor, db) => {
    await setServiceActive(db, actor, serviceId, active);
    revalidatePath("/painel/servicos");
  });
}

// ---------- Profissionais ----------

export async function createProfessionalAction(_: R<{ id: string }> | null, fd: FormData): Promise<R<{ id: string }>> {
  return withActor(async (actor, db) => {
    const pro = await createProfessional(db, actor, { name: str(fd, "name"), photoUrl: optStr(fd, "photoUrl"), active: true });
    revalidatePath("/painel/profissionais");
    return { id: pro.id };
  }, "Profissional cadastrado. Agora defina a jornada e os serviços.");
}

export async function updateProfessionalAction(_: R | null, fd: FormData): Promise<R> {
  return withActor(async (actor, db) => {
    await updateProfessional(db, actor, str(fd, "id"), { name: str(fd, "name"), photoUrl: optStr(fd, "photoUrl"), active: bool(fd, "active") });
    revalidatePath("/painel/profissionais");
  }, "Dados salvos.");
}

export async function saveScheduleAction(_: R | null, fd: FormData): Promise<R> {
  return withActor(async (actor, db) => {
    const id = str(fd, "id");
    await scopeErrors("hours", setSchedule(db, actor, id, { hours: json(fd, "hours"), breaks: json(fd, "breaks") }));
    revalidatePath(`/painel/profissionais/${id}`);
  }, "Jornada e pausas salvas. Valem para novos agendamentos.");
}

export async function saveProfessionalServicesAction(_: R | null, fd: FormData): Promise<R> {
  return withActor(async (actor, db) => {
    const id = str(fd, "id");
    await setProfessionalServices(db, actor, id, ids(fd, "serviceIds"));
    revalidatePath(`/painel/profissionais/${id}`);
  }, "Serviços atualizados.");
}

export async function createInviteAction(professionalId: string): Promise<R<{ url: string; expiresAt: string }>> {
  return withActor(async (actor, db) => {
    const { token, expiresAt } = await createInvite(db, actor, professionalId);
    return { url: appUrl(invitePath(token)), expiresAt: expiresAt.toISOString() };
  });
}

export async function revokeAccessAction(professionalId: string): Promise<R> {
  return withActor(async (actor, db) => {
    await revokeAccess(db, actor, professionalId);
    revalidatePath(`/painel/profissionais/${professionalId}`);
  });
}

// ---------- Agenda ----------

export async function createAppointmentAction(_: R<{ id: string }> | null, fd: FormData): Promise<R<{ id: string }>> {
  return withActor(async (actor, db) => {
    const company = await getCompany(db, actor);
    const customerId = optStr(fd, "customerId");
    const appt = await createManualAppointment(db, actor, {
      professionalId: str(fd, "professionalId"),
      serviceId: str(fd, "serviceId"),
      startsAt: localDateTime(fd, "date", "time", company.timezone),
      customerId,
      newCustomer: customerId ? null : { name: str(fd, "customerName"), phone: str(fd, "customerPhone"), email: optStr(fd, "customerEmail") },
      notes: optStr(fd, "notes"),
    }).catch((err) => {
      // Erros do cliente novo chegam como "newCustomer.name" etc.; mapeia para os campos do formulário.
      if (err instanceof AppError && err.fieldErrors) {
        const map: Record<string, string> = { "newCustomer.name": "customerName", "newCustomer.phone": "customerPhone", phone: "customerPhone", "newCustomer.email": "customerEmail", startsAt: "time" };
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.fieldErrors)) fe[map[k] ?? k] = v;
        throw new AppError(err.code, err.userMessage, err.status, fe);
      }
      throw err;
    });
    refreshAgenda();
    return { id: appt.id };
  }, "Agendamento criado.");
}

export async function rescheduleAction(_: R | null, fd: FormData): Promise<R> {
  return withActor(async (actor, db) => {
    const company = await getCompany(db, actor);
    await rescheduleAppointment(db, actor, str(fd, "id"), {
      startsAt: localDateTime(fd, "date", "time", company.timezone),
      professionalId: str(fd, "professionalId") || undefined,
    });
    refreshAgenda();
  }, "Atendimento reagendado.");
}

export async function setStatusAction(appointmentId: string, status: "confirmed" | "completed" | "no_show"): Promise<R> {
  return withActor(async (actor, db) => {
    await updateAppointmentStatus(db, actor, appointmentId, status);
    refreshAgenda();
  });
}

export async function cancelAppointmentAction(_: R | null, fd: FormData): Promise<R> {
  return withActor(async (actor, db) => {
    await cancelAppointment(db, actor, str(fd, "id"), optStr(fd, "reason"));
    refreshAgenda();
  }, "Atendimento cancelado. O horário foi liberado.");
}

/** Horários livres para o formulário interno (sem antecedência mínima). */
export async function staffSlotsAction(input: {
  professionalId: string;
  serviceId: string;
  date: string;
  excludeAppointmentId?: string;
}): Promise<R<{ value: string; label: string }[]>> {
  return withActor(async (actor, db) => {
    const company = await getCompany(db, actor);
    const slots = await staffSlots(db, actor, input);
    return slots.map((d) => ({ value: formatTime(d, company.timezone), label: formatTime(d, company.timezone) }));
  });
}

export async function createBlockAction(_: R | null, fd: FormData): Promise<R> {
  return withActor(async (actor, db) => {
    const company = await getCompany(db, actor);
    let startsAt: Date;
    let endsAt: Date;
    if (bool(fd, "allDay")) {
      const date = str(fd, "date");
      if (!isValidLocalDate(date)) throw new ValidationError({ date: "Data inválida." });
      startsAt = localToInstant(date, 0, company.timezone);
      endsAt = localToInstant(addDays(date, 1), 0, company.timezone);
    } else {
      startsAt = localDateTime(fd, "date", "start", company.timezone);
      endsAt = localDateTime(fd, "date", "end", company.timezone);
    }
    await createTimeBlock(db, actor, { professionalId: optStr(fd, "professionalId"), startsAt, endsAt, reason: optStr(fd, "reason") });
    refreshAgenda();
  }, "Horário bloqueado.");
}

export async function deleteBlockAction(blockId: string): Promise<R> {
  return withActor(async (actor, db) => {
    await deleteTimeBlock(db, actor, blockId);
    refreshAgenda();
  });
}

export async function searchCustomersAction(query: string): Promise<R<{ id: string; name: string; phone: string }[]>> {
  return withActor(async (actor, db) => {
    const rows = await searchCustomers(db, actor, query, 8);
    return rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone }));
  });
}

// ---------- Clientes ----------

export async function createCustomerAction(
  _: R<{ id?: string; sharedWith?: string[] }> | null,
  fd: FormData,
): Promise<R<{ id?: string; sharedWith?: string[] }>> {
  return withActor(async (actor, db) => {
    const res = await createCustomer(
      db,
      actor,
      { name: str(fd, "name"), phone: str(fd, "phone"), email: optStr(fd, "email"), notes: optStr(fd, "notes") },
      { confirmSharedPhone: bool(fd, "confirmSharedPhone") },
    );
    if (res.status === "phone_in_use") {
      throw new AppError(
        "phone_in_use",
        `Este telefone já está cadastrado para: ${res.existing.map((e) => e.name).join(", ")}. Se for outra pessoa com o mesmo número, marque a opção abaixo e salve novamente.`,
        409,
        { phone: "Telefone já cadastrado." },
      );
    }
    revalidatePath("/painel/clientes");
    return { id: res.customer.id };
  }, "Cliente cadastrado.");
}

export async function updateCustomerAction(_: R | null, fd: FormData): Promise<R> {
  return withActor(async (actor, db) => {
    const id = str(fd, "id");
    await updateCustomer(db, actor, id, { name: str(fd, "name"), phone: str(fd, "phone"), email: optStr(fd, "email"), notes: optStr(fd, "notes") });
    revalidatePath(`/painel/clientes/${id}`);
  }, "Cliente atualizado.");
}

// ---------- Pagamentos ----------

export async function recordPaymentAction(_: R | null, fd: FormData): Promise<R> {
  return withActor(async (actor, db) => {
    const company = await getCompany(db, actor);
    await recordPayment(db, actor, {
      appointmentId: optStr(fd, "appointmentId"),
      amountCents: money(fd, "amountCents"),
      paidAt: localDateTime(fd, "date", "time", company.timezone),
      method: str(fd, "method"),
      notes: optStr(fd, "notes"),
    });
    revalidatePath("/painel", "layout");
  }, "Pagamento registrado.");
}

export async function deletePaymentAction(paymentId: string): Promise<R> {
  return withActor(async (actor, db) => {
    await deletePayment(db, actor, paymentId);
    revalidatePath("/painel", "layout");
  });
}

// ---------- Comissões ----------

export async function createCommissionRuleAction(_: R | null, fd: FormData): Promise<R> {
  return withActor(async (actor, db) => {
    const type = str(fd, "type");
    const percentRaw = str(fd, "percent");
    const percent = type === "percent" ? (percentRaw ? parsePercentToBasisPoints(percentRaw) : null) : null;
    if (type === "percent" && percentRaw && percent === null) throw new ValidationError({ percent: "Percentual inválido (0 a 100)." });
    await createCommissionRule(db, actor, {
      professionalId: optStr(fd, "professionalId"),
      serviceId: optStr(fd, "serviceId"),
      type,
      percentBasisPoints: percent,
      fixedCents: type === "fixed" ? (money(fd, "fixedCents") ?? null) : null,
      validFrom: str(fd, "validFrom"),
    });
    revalidatePath("/painel/relatorios/comissoes");
  }, "Regra criada. Atendimentos já concluídos não são alterados.");
}

export async function endCommissionRuleAction(ruleId: string, endDate: string): Promise<R> {
  return withActor(async (actor, db) => {
    await endCommissionRule(db, actor, ruleId, endDate);
    revalidatePath("/painel/relatorios/comissoes");
  });
}
