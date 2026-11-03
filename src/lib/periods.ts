import { addDays, isValidLocalDate, localToInstant, todayIn, type LocalDate } from "@/domain/time";

export const PERIODS = { hoje: "Hoje", "7d": "Últimos 7 dias", mes: "Este mês", "30d": "Últimos 30 dias" } as const;
export type PeriodKey = keyof typeof PERIODS;

/** Intervalo [from, to) no fuso da empresa. */
export function periodRange(key: string | undefined, timeZone: string, now = new Date()) {
  const today = todayIn(timeZone, now);
  const k: PeriodKey = key && key in PERIODS ? (key as PeriodKey) : "mes";
  let start: LocalDate;
  let endExclusive: LocalDate = addDays(today, 1);
  switch (k) {
    case "hoje":
      start = today;
      break;
    case "7d":
      start = addDays(today, -6);
      break;
    case "30d":
      start = addDays(today, -29);
      break;
    case "mes":
    default: {
      start = `${today.slice(0, 8)}01`;
      const [y, m] = today.split("-").map(Number);
      endExclusive = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    }
  }
  return {
    key: k,
    label: PERIODS[k],
    from: localToInstant(start, 0, timeZone),
    to: localToInstant(endExclusive, 0, timeZone),
    startDate: start,
    endDateExclusive: endExclusive,
  };
}

/** Intervalo de datas arbitrário (relatórios). */
export function customRange(from: string | undefined, to: string | undefined, timeZone: string) {
  if (!from || !to || !isValidLocalDate(from) || !isValidLocalDate(to) || from > to) return null;
  return { from: localToInstant(from, 0, timeZone), to: localToInstant(addDays(to, 1), 0, timeZone), startDate: from, endDate: to };
}
