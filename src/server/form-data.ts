/** Leitura tipada de FormData. A validação de verdade acontece nos serviços (zod). */
import { parseMoneyToCents } from "@/domain/money";
import { localToInstant, hhmmToMinutes, isValidLocalDate } from "@/domain/time";
import { ValidationError } from "./errors";

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function optStr(fd: FormData, key: string): string | null {
  return str(fd, key) || null;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

/** Número inteiro; NaN vira undefined para o zod acusar "obrigatório". */
export function int(fd: FormData, key: string): number | undefined {
  const raw = str(fd, key);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) ? n : Number.NaN;
}

export function money(fd: FormData, key: string): number | undefined {
  const raw = str(fd, key);
  if (!raw) return undefined;
  const cents = parseMoneyToCents(raw);
  if (cents === null) throw new ValidationError({ [key]: "Valor inválido. Use o formato 35,00." });
  return cents;
}

export function json(fd: FormData, key: string): unknown {
  try {
    return JSON.parse(str(fd, key) || "null");
  } catch {
    throw new ValidationError({ [key]: "Dados inválidos." });
  }
}

export function ids(fd: FormData, key: string): string[] {
  return fd.getAll(key).filter((v): v is string => typeof v === "string" && v.length > 0);
}

/** Data (YYYY-MM-DD) + hora (HH:MM) no fuso da empresa → instante. */
export function localDateTime(fd: FormData, dateKey: string, timeKey: string, timeZone: string): Date {
  const date = str(fd, dateKey);
  const minutes = hhmmToMinutes(str(fd, timeKey));
  const errors: Record<string, string> = {};
  if (!isValidLocalDate(date)) errors[dateKey] = "Data inválida.";
  if (minutes === null) errors[timeKey] = "Horário inválido.";
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return localToInstant(date, minutes!, timeZone);
}
