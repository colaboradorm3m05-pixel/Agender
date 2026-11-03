/**
 * Utilitários de data/hora. Regra: instantes são armazenados em UTC
 * (timestamptz) e convertidos para o fuso da empresa só na borda
 * (exibição e interpretação de datas/horários locais).
 */
import { TZDate } from "@date-fns/tz";

/** Data local no formato YYYY-MM-DD. */
export type LocalDate = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseLocalDate(date: LocalDate): { y: number; m: number; d: number } {
  const match = DATE_RE.exec(date);
  if (!match) throw new Error(`Data inválida: ${date}`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new Error(`Data inválida: ${date}`);
  }
  return { y, m, d };
}

export function isValidLocalDate(date: string): boolean {
  try {
    parseLocalDate(date);
    return true;
  } catch {
    return false;
  }
}

/** Instante correspondente a `date` + `minuteOfDay` no fuso `timeZone`. */
export function localToInstant(date: LocalDate, minuteOfDay: number, timeZone: string): Date {
  const { y, m, d } = parseLocalDate(date);
  const tzDate = new TZDate(y, m - 1, d, Math.floor(minuteOfDay / 60), minuteOfDay % 60, timeZone);
  return new Date(tzDate.getTime());
}

/** Data local, minuto do dia e dia da semana (0=domingo) de um instante no fuso. */
export function instantToLocal(instant: Date, timeZone: string): { date: LocalDate; minuteOfDay: number; weekday: number } {
  const z = new TZDate(instant.getTime(), timeZone);
  const date = `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
  return { date, minuteOfDay: z.getHours() * 60 + z.getMinutes(), weekday: z.getDay() };
}

/** Dia da semana de uma data de calendário (independe de fuso). */
export function weekdayOf(date: LocalDate): number {
  const { y, m, d } = parseLocalDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const { y, m, d } = parseLocalDate(date);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function todayIn(timeZone: string, now: Date = new Date()): LocalDate {
  return instantToLocal(now, timeZone).date;
}

/** Diferença em dias de calendário (b - a). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const pa = parseLocalDate(a);
  const pb = parseLocalDate(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

/** Segunda-feira da semana que contém `date`. */
export function startOfWeek(date: LocalDate): LocalDate {
  const wd = weekdayOf(date);
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

export function minutesToHHMM(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function hhmmToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (m > 59 || h > 24 || (h === 24 && m !== 0)) return null;
  return h * 60 + m;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
