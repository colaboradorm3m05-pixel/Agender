import "server-only";
import { headers } from "next/headers";
import { getDb, type Database } from "@/db";
import { AppError, ValidationError } from "./errors";
import type { Actor } from "./permissions";
import { runAction, type ActionResult } from "./action-result";
import { actorForAction } from "./session";

/** Executa uma action autenticada; o Actor sempre vem da sessão no servidor. */
export function withActor<T>(fn: (actor: Actor, db: Database) => Promise<T>, successMessage?: string): Promise<ActionResult<T>> {
  return runAction(async () => {
    const actor = await actorForAction();
    if (!actor) throw new AppError("unauthenticated", "Sua sessão expirou. Entre novamente.", 401);
    return fn(actor, getDb());
  }, successMessage);
}

/** Agrupa erros de validação de estruturas aninhadas (ex.: horários) sob um único campo do formulário. */
export async function scopeErrors<T>(field: string, p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof ValidationError && err.fieldErrors && !(field in err.fieldErrors)) {
      const first = Object.values(err.fieldErrors)[0] ?? "Verifique os horários informados.";
      throw new ValidationError({ [field]: first });
    }
    throw err;
  }
}

/** IP do cliente para limitar abuso. Em produção, confie apenas no cabeçalho definido pelo seu proxy. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "desconhecido";
}
