"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { runAction, type ActionResult } from "@/server/action-result";
import { scopeErrors, withActor } from "@/server/action-helpers";
import { AppError, ValidationError } from "@/server/errors";
import { bool, ids, int, json, money, optStr, str } from "@/server/form-data";
import { getSession } from "@/server/session";
import {
  completeOnboarding,
  createCompanyForUser,
  getCompany,
  getCompanyHours,
  setCompanyHours,
  updateBookingPolicy,
  updateCompanyProfile,
} from "@/server/services/companies";
import { createService, setProfessionalServices } from "@/server/services/catalog";
import { acceptInvite, createProfessional, listProfessionals, setSchedule } from "@/server/services/staff";

type R = ActionResult<void>;

export async function createCompanyAction(_: R | null, fd: FormData): Promise<R> {
  return runAction(async () => {
    const session = await getSession();
    if (!session) throw new AppError("unauthenticated", "Sua sessão expirou. Entre novamente.", 401);
    await createCompanyForUser(getDb(), session.user.id, { name: str(fd, "name"), segment: str(fd, "segment") });
    return undefined;
  });
}

function profileFrom(fd: FormData, current: Awaited<ReturnType<typeof getCompany>>) {
  const has = (k: string) => fd.has(k);
  return {
    name: has("name") ? str(fd, "name") : current.name,
    segment: has("segment") ? str(fd, "segment") : current.segment,
    slug: has("slug") ? str(fd, "slug") : current.slug,
    phone: has("phone") ? optStr(fd, "phone") : current.phone,
    addressLine: has("addressLine") ? optStr(fd, "addressLine") : current.addressLine,
    city: has("city") ? optStr(fd, "city") : current.city,
    serviceInfo: has("serviceInfo") ? optStr(fd, "serviceInfo") : current.serviceInfo,
    brandColor: has("brandColor") ? str(fd, "brandColor") : current.brandColor,
  };
}

export async function updateProfileAction(_: R | null, fd: FormData): Promise<R> {
  return withActor(async (actor, db) => {
    const current = await getCompany(db, actor);
    const profile = profileFrom(fd, current);
    if (bool(fd, "requireLocation") && !profile.addressLine && !profile.serviceInfo) {
      throw new ValidationError({ addressLine: "Informe o endereço ou as informações de atendimento." });
    }
    await updateCompanyProfile(db, actor, profile);
    revalidatePath("/painel", "layout");
  }, "Dados da empresa salvos.");
}

/** Fuso + horário de funcionamento (onboarding e configurações). */
export async function saveHoursAction(_: R | null, fd: FormData): Promise<R> {
  return withActor(async (actor, db) => {
    const current = await getCompany(db, actor);
    await updateBookingPolicy(db, actor, {
      timezone: str(fd, "timezone") || current.timezone,
      minAdvanceMinutes: current.minAdvanceMinutes,
      maxDaysAhead: current.maxDaysAhead,
      slotStepMinutes: current.slotStepMinutes,
      allowClientCancel: current.allowClientCancel,
      allowClientReschedule: current.allowClientReschedule,
      clientChangeMinAdvanceMinutes: current.clientChangeMinAdvanceMinutes,
    });
    await scopeErrors("hours", setCompanyHours(db, actor, json(fd, "hours")));
    revalidatePath("/painel", "layout");
  }, "Horário de funcionamento salvo.");
}

export async function updatePolicyAction(_: R | null, fd: FormData): Promise<R> {
  return withActor(async (actor, db) => {
    const current = await getCompany(db, actor);
    const hoursToMinutes = (key: string) => {
      const v = int(fd, key);
      return v === undefined || Number.isNaN(v) ? v : v * 60;
    };
    await updateBookingPolicy(db, actor, {
      timezone: str(fd, "timezone") || current.timezone,
      minAdvanceMinutes: int(fd, "minAdvanceMinutes"),
      maxDaysAhead: int(fd, "maxDaysAhead"),
      slotStepMinutes: int(fd, "slotStepMinutes"),
      allowClientCancel: bool(fd, "allowClientCancel"),
      allowClientReschedule: bool(fd, "allowClientReschedule"),
      clientChangeMinAdvanceMinutes: hoursToMinutes("clientChangeMinAdvanceHours"),
    });
    revalidatePath("/painel", "layout");
  }, "Regras de agendamento salvas.");
}

/** Onboarding etapa 4: profissional com jornada igual ao horário da empresa. */
export async function onboardingProfessionalAction(_: R | null, fd: FormData): Promise<R> {
  return withActor(async (actor, db) => {
    const pro = await createProfessional(db, actor, { name: str(fd, "name"), active: true });
    const hours = await getCompanyHours(db, actor.companyId);
    await setSchedule(db, actor, pro.id, { hours, breaks: [] });
  }, "Profissional cadastrado.");
}

export async function onboardingServiceAction(_: R | null, fd: FormData): Promise<R> {
  return withActor(async (actor, db) => {
    const pros = await listProfessionals(db, actor);
    await createService(db, actor, {
      name: str(fd, "name"),
      priceCents: money(fd, "priceCents"),
      durationMinutes: int(fd, "durationMinutes"),
      bufferAfterMinutes: int(fd, "bufferAfterMinutes") ?? 0,
      // Com um único profissional, já deixamos vinculado (pode ser alterado na próxima etapa).
      professionalIds: pros.length === 1 ? [pros[0].id] : [],
    });
  }, "Serviço cadastrado.");
}

/** Onboarding etapa 6: matriz profissional × serviço (checkbox "link:<professionalId>"). */
export async function saveLinksAction(_: R | null, fd: FormData): Promise<R> {
  return withActor(async (actor, db) => {
    const pros = await listProfessionals(db, actor);
    for (const pro of pros) await setProfessionalServices(db, actor, pro.id, ids(fd, `link:${pro.id}`));
    const anyLink = pros.some((p) => ids(fd, `link:${p.id}`).length > 0);
    if (!anyLink) throw new AppError("no_links", "Vincule pelo menos um serviço a um profissional.");
  }, "Vínculos salvos.");
}

export async function finishOnboardingAction(): Promise<R> {
  return withActor(async (actor, db) => {
    await completeOnboarding(db, actor);
    revalidatePath("/painel", "layout");
  });
}

export async function acceptInviteAction(token: string): Promise<R> {
  return runAction(async () => {
    const session = await getSession();
    if (!session) throw new AppError("unauthenticated", "Entre ou crie sua conta para aceitar o convite.", 401);
    await acceptInvite(getDb(), session.user.id, token);
  });
}
