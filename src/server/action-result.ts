import { AppError, type FieldErrors } from "./errors";

export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code?: string; fieldErrors?: FieldErrors };

/**
 * Converte exceções em resultado seguro para o navegador. Erros inesperados
 * são registrados no servidor (sem dados de entrada) e exibidos de forma genérica.
 */
export async function runAction<T>(fn: () => Promise<T>, successMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message: successMessage };
  } catch (err) {
    return toErrorResult(err);
  }
}

export function toErrorResult(err: unknown): { ok: false; error: string; code?: string; fieldErrors?: FieldErrors } {
  // redirect()/notFound() do Next lançam erros especiais que precisam propagar.
  if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_")) {
    throw err;
  }
  if (err instanceof AppError) {
    return { ok: false, error: err.userMessage, code: err.code, fieldErrors: err.fieldErrors };
  }
  logError(err);
  return { ok: false, error: "Algo deu errado. Tente novamente em instantes.", code: "internal" };
}

export function logError(err: unknown) {
  const e = err instanceof Error ? err : new Error(String(err));
  // Só nome, mensagem e pilha: nunca o corpo da requisição (pode ter dados pessoais/tokens).
  console.error(`[erro] ${e.name}: ${e.message}\n${e.stack ?? ""}`);
}
