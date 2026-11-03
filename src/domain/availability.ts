/**
 * Cálculo de disponibilidade (funções puras, sem banco).
 *
 * Regras:
 * 1. Tempo livre = horário da empresa ∩ jornada do profissional − pausas − bloqueios.
 * 2. O atendimento inteiro [início, fim) precisa caber em um trecho de tempo livre.
 * 3. O período ocupado [início, fim + intervalo adicional) não pode sobrepor
 *    outro atendimento ativo (é a mesma regra garantida pela constraint do banco).
 *    O intervalo adicional pode avançar sobre uma pausa ou o fechamento.
 * 4. Para o link público: respeita antecedência mínima e limite de dias futuros.
 */
import { addDays, daysBetween, localToInstant, todayIn, weekdayOf, type LocalDate } from "./time";

export type MinuteRange = { startMinute: number; endMinute: number };
export type Interval = { start: number; end: number }; // epoch ms, fim exclusivo

export type WeeklyRange = MinuteRange & { weekday: number };

export type DayInputs = {
  date: LocalDate;
  timeZone: string;
  companyHours: WeeklyRange[];
  workingHours: WeeklyRange[];
  breaks: WeeklyRange[];
  /** Bloqueios (da empresa ou do profissional) como instantes. */
  blocks: Interval[];
  /** Períodos ocupados por atendimentos ativos (início até fim + intervalo). */
  busy: Interval[];
};

export type ServiceShape = { durationMinutes: number; bufferAfterMinutes: number };

export type BookingWindow = {
  now: Date;
  minAdvanceMinutes: number;
  maxDaysAhead: number;
};

export type IntervalCheck =
  | { ok: true }
  | { ok: false; reason: "outside_hours" | "conflict" | "too_soon" | "too_far" | "in_past" };

const MIN = 60_000;

/** Intersecção de duas listas de faixas de minutos. */
export function intersectRanges(a: MinuteRange[], b: MinuteRange[]): MinuteRange[] {
  const out: MinuteRange[] = [];
  for (const x of a) {
    for (const y of b) {
      const startMinute = Math.max(x.startMinute, y.startMinute);
      const endMinute = Math.min(x.endMinute, y.endMinute);
      if (startMinute < endMinute) out.push({ startMinute, endMinute });
    }
  }
  return mergeIntervals(out.map((r) => ({ start: r.startMinute, end: r.endMinute }))).map((i) => ({
    startMinute: i.start,
    endMinute: i.end,
  }));
}

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].filter((i) => i.start < i.end).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** Remove de `base` todos os trechos de `remove`. */
export function subtractIntervals(base: Interval[], remove: Interval[]): Interval[] {
  let result = mergeIntervals(base);
  for (const r of mergeIntervals(remove)) {
    const next: Interval[] = [];
    for (const b of result) {
      if (r.end <= b.start || r.start >= b.end) {
        next.push(b);
        continue;
      }
      if (r.start > b.start) next.push({ start: b.start, end: r.start });
      if (r.end < b.end) next.push({ start: r.end, end: b.end });
    }
    result = next;
  }
  return result;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Trechos livres do dia (instantes), antes de considerar atendimentos existentes. */
export function freeWindows(input: Omit<DayInputs, "busy">): Interval[] {
  const weekday = weekdayOf(input.date);
  const forDay = (list: WeeklyRange[]) => list.filter((r) => r.weekday === weekday);
  const open = intersectRanges(forDay(input.companyHours), forDay(input.workingHours));
  const toInstant = (r: MinuteRange): Interval => ({
    start: localToInstant(input.date, r.startMinute, input.timeZone).getTime(),
    end: localToInstant(input.date, r.endMinute, input.timeZone).getTime(),
  });
  return subtractIntervals(open.map(toInstant), [...forDay(input.breaks).map(toInstant), ...input.blocks]);
}

/** Verifica se um atendimento iniciando em `start` é válido no dia. */
export function checkInterval(
  day: DayInputs,
  service: ServiceShape,
  start: Date,
  window?: BookingWindow,
  windows: Interval[] = freeWindows(day),
): IntervalCheck {
  const s = start.getTime();
  const end = s + service.durationMinutes * MIN;
  const occupied = end + service.bufferAfterMinutes * MIN;

  if (window) {
    if (s < window.now.getTime()) return { ok: false, reason: "in_past" };
    if (s < window.now.getTime() + window.minAdvanceMinutes * MIN) return { ok: false, reason: "too_soon" };
    const today = todayIn(day.timeZone, window.now);
    if (daysBetween(today, day.date) > window.maxDaysAhead) return { ok: false, reason: "too_far" };
  }

  const fits = windows.some((w) => s >= w.start && end <= w.end);
  if (!fits) return { ok: false, reason: "outside_hours" };

  if (day.busy.some((b) => overlaps({ start: s, end: occupied }, b))) return { ok: false, reason: "conflict" };
  return { ok: true };
}

/**
 * Horários de início disponíveis no dia, alinhados a uma grade de `stepMinutes`
 * contada a partir da meia-noite local (ex.: 09:00, 09:15, 09:30...).
 */
export function availableStarts(day: DayInputs, service: ServiceShape, stepMinutes: number, window?: BookingWindow): Date[] {
  if (window) {
    const today = todayIn(day.timeZone, window.now);
    const diff = daysBetween(today, day.date);
    if (diff < 0 || diff > window.maxDaysAhead) return [];
  }
  const windows = freeWindows(day);
  const midnight = localToInstant(day.date, 0, day.timeZone).getTime();
  const step = stepMinutes * MIN;
  const result: Date[] = [];
  for (const w of windows) {
    let t = midnight + Math.ceil((w.start - midnight) / step) * step;
    for (; t + service.durationMinutes * MIN <= w.end; t += step) {
      const candidate = new Date(t);
      if (checkInterval(day, service, candidate, window, windows).ok) result.push(candidate);
    }
  }
  return result;
}

/** Datas (locais) dentro da janela de agendamento público. */
export function bookableDates(timeZone: string, window: BookingWindow): LocalDate[] {
  const today = todayIn(timeZone, window.now);
  return Array.from({ length: window.maxDaysAhead + 1 }, (_, i) => addDays(today, i));
}

export const REASON_MESSAGES: Record<Exclude<IntervalCheck, { ok: true }>["reason"], string> = {
  outside_hours: "Este horário está fora do expediente, em uma pausa ou bloqueado.",
  conflict: "Este horário acabou de ser ocupado por outro atendimento.",
  too_soon: "Este horário não respeita a antecedência mínima para agendamento.",
  too_far: "Esta data está além do limite de dias permitido para agendamento.",
  in_past: "Este horário já passou.",
};
