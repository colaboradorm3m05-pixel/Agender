"use server";

/**
 * Actions públicas (sem login). Todas aplicam limite de requisições por IP
 * (hash) e devolvem apenas dados necessários ao agendamento.
 */
import { getDb } from "@/db";
import { runAction, type ActionResult } from "@/server/action-result";
import { clientIp } from "@/server/action-helpers";
import { AppError } from "@/server/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/server/rate-limit";
import {
  cancelByToken,
  createPublicBooking,
  getPublicSlots,
  getRescheduleSlots,
  rescheduleByToken,
} from "@/server/services/booking";
import { managePath } from "@/lib/urls";

type Slot = { start: string; label: string };

export async function publicSlotsAction(slug: string, input: { serviceId: string; professionalId: string; date: string }): Promise<ActionResult<Slot[]>> {
  return runAction(async () => {
    const db = getDb();
    await enforceRateLimit(db, RATE_LIMITS.publicSlots, await clientIp());
    return getPublicSlots(db, slug, input);
  });
}

export type BookingConfirmation = {
  publicCode: string;
  managePath: string;
  startsAt: string;
  serviceName: string;
  professionalName: string;
  priceCents: number;
};

export async function publicBookingAction(
  slug: string,
  input: { serviceId: string; professionalId: string; startsAt: string; name: string; phone: string; email: string; website?: string },
): Promise<ActionResult<BookingConfirmation>> {
  return runAction(async () => {
    // Campo invisível (honeypot): pessoas não preenchem, robôs sim.
    if (input.website) throw new AppError("invalid", "Não foi possível concluir o agendamento.");
    const db = getDb();
    await enforceRateLimit(db, RATE_LIMITS.publicBooking, await clientIp());
    const res = await createPublicBooking(db, slug, input);
    return {
      publicCode: res.publicCode,
      managePath: managePath(res.manageToken),
      startsAt: res.startsAt.toISOString(),
      serviceName: res.serviceName,
      professionalName: res.professionalName,
      priceCents: res.priceCents,
    };
  });
}

export async function manageSlotsAction(token: string, date: string): Promise<ActionResult<Slot[]>> {
  return runAction(async () => {
    const db = getDb();
    await enforceRateLimit(db, RATE_LIMITS.manageLookup, await clientIp());
    return getRescheduleSlots(db, token, date);
  });
}

export async function manageCancelAction(token: string): Promise<ActionResult> {
  return runAction(async () => {
    const db = getDb();
    await enforceRateLimit(db, RATE_LIMITS.manageChange, await clientIp());
    await cancelByToken(db, token);
  }, "Reserva cancelada.");
}

export async function manageRescheduleAction(token: string, startsAt: string): Promise<ActionResult> {
  return runAction(async () => {
    const db = getDb();
    await enforceRateLimit(db, RATE_LIMITS.manageChange, await clientIp());
    await rescheduleByToken(db, token, startsAt);
  }, "Reserva reagendada.");
}
