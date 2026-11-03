/**
 * Erros de domínio com mensagem segura para o usuário. Qualquer outro erro é
 * tratado como interno: registrado no servidor e exibido de forma genérica.
 */
export type FieldErrors = Record<string, string>;

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly userMessage: string,
    public readonly status = 400,
    public readonly fieldErrors?: FieldErrors,
  ) {
    super(userMessage);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Registro") {
    super("not_found", `${what} não encontrado.`, 404);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Você não tem permissão para esta ação.") {
    super("forbidden", message, 403);
  }
}

export class ValidationError extends AppError {
  constructor(fieldErrors: FieldErrors, message = "Revise os campos destacados.") {
    super("validation", message, 422, fieldErrors);
  }
}

export class SlotUnavailableError extends AppError {
  constructor(message = "Este horário não está mais disponível. Escolha outro horário.") {
    super("slot_unavailable", message, 409);
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super("rate_limited", "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.", 429);
  }
}

/** Código SQLSTATE de violação de constraint de exclusão (sobreposição). */
const EXCLUSION_VIOLATION = "23P01";

export function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let i = 0; i < 4 && current; i++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function isOverlapViolation(err: unknown): boolean {
  return pgErrorCode(err) === EXCLUSION_VIOLATION;
}

/** Converte zod issues em erros por campo. */
export function zodFieldErrors(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}
